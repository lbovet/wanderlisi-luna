// Minimal hello-world application scaffolded by dev-center.
const APP_NAME = 'wanderlisi-luna';
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/health') {
      return new Response('ok', { headers: { 'Content-Type': 'text/plain' } });
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${APP_NAME}</title>
  <style>
    :root { color-scheme: dark; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: #0a0a0f;
      color: #c8c8d4;
      font-family: 'Segoe UI', system-ui, sans-serif;
    }
    h1 {
      font-size: 2.6rem;
      letter-spacing: 0.06rem;
      color: #fff;
      text-shadow: 0 0 24px rgba(0, 229, 255, 0.35);
    }
    /* Science-fiction flicker: every letter warps and glows out of phase. */
    .hello {
      margin-top: 1.4rem;
      font-family: 'Courier New', 'Consolas', monospace;
      font-size: 1.5rem;
      letter-spacing: 0.45rem;
      text-transform: uppercase;
      color: #00e5ff;
      user-select: none;
    }
    .hello span {
      display: inline-block;
      animation: warp-flicker 3.4s steps(1, end) infinite;
      animation-delay: calc(var(--i) * 0.12s);
      will-change: transform, opacity, color;
    }
    .hello .gap {
      width: 0.7rem;
      animation: none;
    }
    @keyframes warp-flicker {
      0%, 10%, 100% {
        opacity: 1;
        color: #00e5ff;
        transform: translateY(0) scale(1);
        text-shadow: 0 0 10px #00e5ff, 0 0 26px rgba(0, 229, 255, 0.45);
      }
      12% { opacity: 0.15; color: #fff; transform: translateY(-3px) scale(1.18); text-shadow: 0 0 20px #fff; }
      16% { opacity: 1; }
      38% { opacity: 1; }
      40% { opacity: 0.25; color: #7df9ff; transform: translateY(2px) scale(0.92); text-shadow: 0 0 14px #7df9ff; }
      44% { opacity: 1; }
      66% { opacity: 1; }
      68% { opacity: 0.1; color: #fff; transform: translateY(-2px) scale(1.12); text-shadow: 0 0 22px #fff; }
      72% { opacity: 1; }
    }
    @media (prefers-reduced-motion: reduce) {
      .hello span { animation: none; text-shadow: 0 0 10px #00e5ff; }
    }
  </style>
</head>
<body>
  <h1>${APP_NAME}</h1>
  <p class="hello" aria-label="hello world">
    <span style="--i:0">h</span><span style="--i:1">e</span><span style="--i:2">l</span><span style="--i:3">l</span><span style="--i:4">o</span><span class="gap" aria-hidden="true"></span><span style="--i:5">w</span><span style="--i:6">o</span><span style="--i:7">r</span><span style="--i:8">l</span><span style="--i:9">d</span>
  </p>
</body>
</html>`;

    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  },
});

console.log(`${APP_NAME} serving on port ${PORT}`);
