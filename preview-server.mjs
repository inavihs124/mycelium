// preview-server.mjs - Local dev server for Mycelium
// Serves the project with a proper HTML wrapper.
// Run: node preview-server.mjs
// Then open: http://localhost:3000

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const PORT = 3000;

const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.mjs':  'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

// Full HTML wrapper that embeds the body fragment inline
function buildShell(fragmentHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🍄 Mycelium — Quantum Puzzle Game</title>
  <meta name="description" content="Mycelium: Design Trotterized spin evolution schedules as an Opus Magnum–style puzzle game. Built for the Qollab Quantum Hackathon.">
  <link rel="stylesheet" href="/main.css">
  <script>
    // Stub out Qollab-specific globals for local preview
    window.backend = null;
    window.callPromising = (fn, arg) => {
      console.warn('[Preview] callPromising called for:', fn, '— Python backend not available locally.');
      return Promise.reject('No Python backend in local preview. Connect a Qollab backend to use Quantum Check.');
    };
  </script>
</head>
<body>
${fragmentHtml}
<script type="module" src="/main.js"></script>
</body>
</html>`;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let filePath = url.pathname;

  // Serve root → full wrapped shell
  if (filePath === '/' || filePath === '/index.html' || filePath === '/preview.html') {
    try {
      const fragment = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
      const html = buildShell(fragment);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    } catch (e) {
      res.writeHead(500);
      res.end('Error reading index.html: ' + e.message);
    }
    return;
  }

  // Serve static files from the project root
  const full = path.join(ROOT, filePath.replace(/^\//, ''));
  const ext = path.extname(full);

  if (fs.existsSync(full) && fs.statSync(full).isFile()) {
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
    });
    fs.createReadStream(full).pipe(res);
  } else {
    res.writeHead(404);
    res.end(`Not found: ${filePath}`);
  }
});

server.listen(PORT, () => {
  console.log(`\n🍄 Mycelium preview server running`);
  console.log(`   Open: \x1b[36mhttp://localhost:${PORT}\x1b[0m\n`);
});
