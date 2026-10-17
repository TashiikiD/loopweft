// A small web server for the review tools: it serves one folder on this machine only, on a free port, for as
// long as a tool runs. It refuses paths outside its folder, and writes nothing unless the tool asks to
// receive files (see `receive`), which then arrive as POST /receive/<name> and are handed to the tool.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize, resolve, sep } from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

export interface Served {
  /** e.g. http://127.0.0.1:53124 */
  url: string;
  close(): Promise<void>;
}

export interface ServeOptions {
  /** Called with each file a page posts to /receive/<name> (names: letters, digits, ".", "_" and "-"). */
  receive?: (name: string, data: Buffer) => void;
}

/** Serves `folder` at http://127.0.0.1:<free port>/ until `close()`. */
export async function serve(folder: string, options: ServeOptions = {}): Promise<Served> {
  const root = resolve(folder);
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    if (req.method === 'POST') {
      const name = /^\/receive\/([\w.-]+)$/.exec(path)?.[1];
      if (!options.receive || !name || name.startsWith('.')) {
        res.writeHead(403).end();
        return;
      }
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        options.receive?.(name, Buffer.concat(chunks));
        res.writeHead(204).end();
      });
      return;
    }
    let file = normalize(join(root, path));
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res
      .writeHead(200, { 'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream' })
      .end(readFileSync(file));
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((done) => server.close(() => done())),
  };
}
