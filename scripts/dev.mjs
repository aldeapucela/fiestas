import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 8002);

await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [path.join(root, 'scripts', 'build.mjs')], { stdio: 'inherit' });
  child.on('exit', (code) => code === 0 ? resolve() : reject(new Error('build failed')));
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  let filePath = path.join(root, 'dist', decodeURIComponent(url.pathname));
  if (url.pathname.endsWith('/')) filePath = path.join(filePath, 'index.html');
  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});
server.listen(port, '127.0.0.1', () => console.log('http://127.0.0.1:' + port + '/fiestas-2026/'));
