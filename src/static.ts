// Serves the built dashboard (web/dist) with a single-page-app fallback to index.html.
import { createReadStream, existsSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { pipeline } from 'node:stream';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

export function createStaticHandler(dir: string) {
  const root = resolve(dir);
  const index = join(root, 'index.html');

  return (req: IncomingMessage, res: ServerResponse, pathname: string) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    if (!existsSync(index)) {
      res.writeHead(503, { 'content-type': 'text/plain' }).end('Dashboard not built. Run `npm run build`.');
      return;
    }

    let requested: string;
    try {
      requested = normalize(join(root, decodeURIComponent(pathname)));
    } catch {
      res.writeHead(400).end();
      return;
    }
    const isFile = requested.startsWith(root + '/') && existsSync(requested) && statSync(requested).isFile();
    // Only app routes (no file extension) fall back to the shell; a missing script or image is a real 404.
    if (!isFile && extname(pathname)) {
      res.writeHead(404).end();
      return;
    }
    const file = isFile ? requested : index;
    // Vite fingerprints everything under /assets, so those can be cached forever; the shell must revalidate.
    const cache = isFile && pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';

    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': cache });
    if (req.method === 'HEAD') res.end();
    // pipeline destroys both streams on error; a bare pipe() would leave a read error unhandled and crash.
    else pipeline(createReadStream(file), res, () => {});
  };
}
