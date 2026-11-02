import { createServer as createHttpServer } from 'node:http';
import { hostHeaderValidation, localhostHostValidation, toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { handleApi } from './api.ts';
import { authRequired, keyMatches, requestKey } from './auth.ts';
import { config, isLoopback } from './config.ts';
import { FitnessDb } from './db.ts';
import { createServer } from './mcp.ts';
import { createStaticHandler } from './static.ts';

if (!isLoopback(config.host) && !config.apiKey) {
  console.error(`Refusing to listen on ${config.host} without MCP_API_KEY: anyone who finds the URL could read and write your log.`);
  process.exit(1);
}
if (!isLoopback(config.host) && !config.allowedHosts.length) {
  console.warn('ALLOWED_HOSTS is not set, so the Host header is not checked. Set it to your public hostname.');
}

const db = new FitnessDb(config.dbPath, config.defaultTimezone);
const handler = createMcpHandler(() => createServer(db), {
  onerror: (error) => console.error('[mcp]', error.message),
});
const mcp = toNodeHandler(handler, { onerror: (error) => console.error('[mcp]', error) });
const serveStatic = createStaticHandler(config.webDir);

const validateHost = config.allowedHosts.length
  ? hostHeaderValidation(config.allowedHosts)
  : isLoopback(config.host)
    ? localhostHostValidation()
    : () => true;

const server = createHttpServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
    return;
  }
  if (!validateHost(req, res)) return;

  if (url.pathname === '/mcp') {
    if (authRequired() && !keyMatches(requestKey(req))) {
      // A bare 401 with no WWW-Authenticate challenge, so clients don't start OAuth discovery.
      res.writeHead(401, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }
    void mcp(req, res);
    return;
  }
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    void handleApi(db, req, res, url);
    return;
  }
  serveStatic(req, res, url.pathname);
});

server.listen(config.port, config.host, () => {
  console.log(`fitness-coach MCP server on http://${config.host}:${config.port}/mcp (db: ${config.dbPath}, auth: ${config.apiKey ? 'on' : 'off'})`);
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
