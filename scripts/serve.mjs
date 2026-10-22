import { createServer } from 'node:http';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/src/csv.mjs', ['src/csv.mjs', 'text/javascript; charset=utf-8']],
  ['/src/workspace.mjs', ['src/workspace.mjs', 'text/javascript; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
  ['/examples/contacts.csv', ['examples/contacts.csv', 'text/csv; charset=utf-8']],
]);

export function createAppServer() {
  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end('Method not allowed'); return; }
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); }
    catch { res.writeHead(400); res.end('Bad request'); return; }
    const entry = files.get(pathname);
    if (!entry) { res.writeHead(404); res.end('Not found'); return; }
    try {
      const data = await readFile(new URL(entry[0], root));
      res.writeHead(200, { 'Content-Type': entry[1], 'Content-Length': data.length });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch { res.writeHead(500); res.end('File unavailable'); }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(pathToFileURL(process.argv[1]))) {
  const server = createAppServer();
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? 'Порт 4173 занят. Закройте предыдущий CSV Cleaner и запустите снова.' : error.message); process.exitCode = 1; });
  server.listen(4173, '127.0.0.1', () => console.log('CSV Cleaner: http://127.0.0.1:4173\nОстановка: Ctrl+C'));
}
