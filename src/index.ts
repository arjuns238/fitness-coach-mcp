import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer as createHttpServer, type IncomingMessage } from 'node:http';
import { hostHeaderValidation, localhostHostValidation, toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { config, isLoopback } from './config.ts';
import { FitnessDb } from './db.ts';
import { createServer } from './mcp.ts';

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

const validateHost = config.allowedHosts.length
  ? hostHeaderValidation(config.allowedHosts)
  : isLoopback(config.host)
    ? localhostHostValidation()
    : () => true;

const digest = (value: string) => createHash('sha256').update(value).digest();
const expectedKey = digest(config.apiKey);

function authorized(req: IncomingMessage): boolean {
  if (!config.apiKey) return true;
  const authorization = req.headers.authorization;
  const bearer = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : undefined;
  const apiKey = req.headers['x-api-key'];
  const presented = bearer ?? (typeof apiKey === 'string' ? apiKey : undefined);
  return presented !== undefined && timingSafeEqual(digest(presented), expectedKey);
}

const server = createHttpServer((req, res) => {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname;

  if (path === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
    return;
  }
  if (path !== '/mcp') {
    res.writeHead(404).end();
    return;
  }
  if (!validateHost(req, res)) return;
  if (!authorized(req)) {
    // A bare 401 with no WWW-Authenticate challenge, so clients don't start OAuth discovery.
    res.writeHead(401, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'unauthorized' }));
    return;
  }
  void mcp(req, res);
});

server.listen(config.port, config.host, () => {
  console.log(`fitness-coach MCP server on http://${config.host}:${config.port}/mcp (db: ${config.dbPath}, auth: ${config.apiKey ? 'on' : 'off'})`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    server.close();
    await handler.close();
    db.close();
    process.exit(0);
  });
}
