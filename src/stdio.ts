// Local stdio entry for Claude Desktop's claude_desktop_config.json. Same tools as the HTTP server.
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { config } from './config.ts';
import { FitnessDb } from './db.ts';
import { createServer } from './mcp.ts';

const db = new FitnessDb(config.dbPath, config.defaultTimezone);
serveStdio(() => createServer(db), { onerror: (error) => console.error('[mcp]', error.message) });
