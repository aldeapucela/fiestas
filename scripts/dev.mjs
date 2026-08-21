import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 8002);

function buildSite() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'scripts', 'build.mjs')], { stdio: 'inherit' });
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error('build failed')));
  });
}

await buildSite();

let buildInProgress = false;
let buildQueued = false;
let rebuildTimer = null;

async function rebuildSite() {
  if (buildInProgress) {
    buildQueued = true;
    return;
  }

  buildInProgress = true;
  try {
    await buildSite();
    console.log('Rebuilt after source change');
  } catch (error) {
    console.error(error.message);
  } finally {
    buildInProgress = false;
    if (buildQueued) {
      buildQueued = false;
      void rebuildSite();
    }
  }
}

const sourceWatcher = watch(path.join(root, 'src'), { recursive: true }, () => {
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => void rebuildSite(), 180);
});

sourceWatcher.on('error', (error) => console.error(`Source watcher error: ${error.message}`));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  let filePath = path.join(root, 'dist', decodeURIComponent(url.pathname));
  if (url.pathname.endsWith('/')) filePath = path.join(filePath, 'index.html');
  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
    res.writeHead(200, {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Content-Type': types[ext] || 'application/octet-stream',
      Expires: '0',
      Pragma: 'no-cache'
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});
server.listen(port, '127.0.0.1', () => console.log('http://127.0.0.1:' + port + '/'));
