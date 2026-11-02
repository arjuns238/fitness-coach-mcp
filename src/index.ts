import { createServer as createHttpServer } from 'node:http';
import { hostHeaderValidation, localhostHostValidation, toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { handleApi } from './api.ts';
import { authRequired, hasValidKey, setSessionEpoch } from './auth.ts';
import { config, isLoopback } from './config.ts';
import { FitnessDb } from './db.ts';
import { createServer } from './mcp.ts';
import { createStaticHandler } from './static.ts';

if (!isLoopback(config.host) && config.apiKey.trim().length < 32) {
  console.error(
    `Refusing to listen on ${config.host} without a strong MCP_API_KEY (32+ characters, e.g. \`openssl rand -hex 32\`): ` +
      'anyone who finds the URL could read and write your log.',
  );
  process.exit(1);
}
if (!isLoopback(config.host) && !config.allowedHosts.length) {
  console.warn('ALLOWED_HOSTS is not set, so the Host header is not checked. Set it to your public hostname.');
}

/** Generous for any real tool call; small enough that a flood of requests can't exhaust memory. */
const MAX_MCP_BODY_BYTES = 256 * 1024;

const SECURITY_HEADERS: Record<string, string> = {
  'content-security-policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; " +
    "object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'cross-origin-opener-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
};

const db = new FitnessDb(config.dbPath, config.defaultTimezone);
setSessionEpoch(db.sessionEpoch());
const handler = createMcpHandler(() => createServer(db), {
  onerror: (error) => console.error('[mcp]', error.message),
  maxRequestBodySize: MAX_MCP_BODY_BYTES,
});
const mcp = toNodeHandler(handler, { onerror: (error) => console.error('[mcp]', error), maxRequestBodySize: MAX_MCP_BODY_BYTES });
const serveStatic = createStaticHandler(config.webDir);

const validateHost = config.allowedHosts.length
  ? hostHeaderValidation(config.allowedHosts)
  : isLoopback(config.host)
    ? localhostHostValidation()
    : () => true;

const logFailure = (error: unknown) => console.error('[http]', error);

const server = createHttpServer((req, res) => {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
  if (req.headers['x-forwarded-proto'] === 'https') res.setHeader('strict-transport-security', 'max-age=31536000');

  // Only plain origin-form paths. "//host:port/..." would otherwise be parsed as an authority, and an invalid one
  // throws, which uncaught would take the whole process down.
  const target = req.url ?? '/';
  let url: URL;
  try {
    if (!target.startsWith('/') || target.startsWith('//')) throw new Error('not an origin-form path');
    url = new URL(target, 'http://localhost');
  } catch {
    res.writeHead(400).end();
    return;
  }

  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
    return;
  }
  if (!validateHost(req, res)) return;

  if (url.pathname === '/mcp') {
    if (authRequired() && !hasValidKey(req)) {
      // Never log the presented key, only that a request failed and where it came from.
      console.warn('[auth] rejected /mcp request from', req.headers['x-forwarded-for'] ?? req.socket.remoteAddress);
      // A bare 401 with no WWW-Authenticate challenge, so clients don't start OAuth discovery.
      res.writeHead(401, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }
    mcp(req, res).catch(logFailure);
    return;
  }
  // No OAuth here: answer sign-in discovery with a plain 404 rather than the dashboard's HTML shell, so a client
  // probing for it gets a clear "not supported".
  if (url.pathname.startsWith('/.well-known/') || url.pathname === '/register' || url.pathname === '/authorize' || url.pathname === '/token') {
    res.writeHead(404, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'not_found' }));
    return;
  }
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    handleApi(db, req, res, url).catch(logFailure);
    return;
  }
  serveStatic(req, res, url.pathname);
});

server.listen(config.port, config.host, () => {
  console.log(`Hulk MCP server on http://${config.host}:${config.port}/mcp (db: ${config.dbPath}, auth: ${config.apiKey ? 'on' : 'off'})`);
  console.log(`dashboard on http://${config.host}:${config.port}/`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    server.close();
    await handler.close();
    db.close();
    process.exit(0);
  });
}
