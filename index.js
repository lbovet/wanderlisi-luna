// Wanderlisi V2 – static Bun server for the browser-first MVP.
const APP_NAME = 'wanderlisi';
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const PUBLIC = new URL('./public/', import.meta.url);

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.gpx': 'application/gpx+xml',
};

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/health') {
      return new Response('ok', { headers: { 'Content-Type': 'text/plain' } });
    }

    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/index.html';
    // Keep requests inside public/ and avoid accidental directory traversal.
    const relative = pathname.replace(/^\/+/, '');
    if (relative.includes('..')) return new Response('Not found', { status: 404 });
    const file = Bun.file(new URL(relative, PUBLIC));
    if (!(await file.exists())) {
      return new Response('Not found', { status: 404 });
    }
    const extension = relative.includes('.') ? `.${relative.split('.').pop()}` : '';
    return new Response(file, {
      headers: {
        'Content-Type': mimeTypes[extension] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      },
    });
  },
});

console.log(`${APP_NAME} serving on port ${PORT}`);
