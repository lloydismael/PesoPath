const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT) || 5173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const filePath = path.join(root, urlPath === '/' ? 'index.html' : urlPath);

  if (!filePath.startsWith(root + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    // Another PesoPath server already owns the port (e.g. a previous F5 run).
    // Stay alive so VS Code keeps the background task running and the launch proceeds.
    console.log(`PesoPath server already listening on port ${port}`);
    console.log(`PesoPath server ready at http://localhost:${port}`);
    const keepAlive = setInterval(() => {
      http
        .get(`http://localhost:${port}/`, (res) => res.resume())
        .on('error', () => {
          clearInterval(keepAlive);
          process.exit(0);
        });
    }, 5000);
    return;
  }
  console.log(`PesoPath-ERROR: ${err.message}`);
  process.exit(1);
});

server.listen(port, () => {
  console.log(`PesoPath server starting on port ${port}`);
  console.log(`PesoPath server ready at http://localhost:${port}`);
});
