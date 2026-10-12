/**
 * A tiny static file server for browser tests that serve a build of their own (P4.10: the interruption
 * harness build, tests/e2e/android-storage.spec.ts). Correct MIME types for html/js/css/json/png/webmanifest
 * (module workers refuse a script served with the wrong type); no directory listing; nothing outside `root`.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

export function mimeType(path: string): string {
  return TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

export interface StaticServer {
  readonly url: string;
  close(): Promise<void>;
}

/**
 * Serve `root` at `mount` (e.g. '/') on 127.0.0.1:`port`. P4.11: `pages` (optional) adds fixed HTML pages at
 * exact paths outside the build (e.g. an arcade host page that frames the game); without it nothing changes.
 */
export function serveStatic(opts: { readonly root: string; readonly mount?: string; readonly port: number; readonly pages?: Readonly<Record<string, string>> }): Promise<StaticServer> {
  const root = resolve(opts.root);
  const mount = (opts.mount ?? '/').replace(/\/?$/u, '/');
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let path = decodeURIComponent(url.pathname);
    const page = opts.pages?.[path];
    if (page !== undefined) {
      res.writeHead(200, { 'Content-Type': TYPES['.html']!, 'Cache-Control': 'no-store' });
      res.end(page);
      return;
    }
    if (!path.startsWith(mount)) {
      res.writeHead(404).end('not found');
      return;
    }
    path = path.slice(mount.length);
    if (path === '' || path.endsWith('/')) path += 'index.html';
    const file = normalize(join(root, path));
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    if (!existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mimeType(file), 'Cache-Control': 'no-store' });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolveP, reject) => {
    server.once('error', reject);
    server.listen(opts.port, '127.0.0.1', () => {
      resolveP({
        url: `http://127.0.0.1:${opts.port}${mount}`,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}
