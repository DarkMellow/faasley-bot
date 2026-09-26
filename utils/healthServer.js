const http = require('http');

// ── Health Check Server ────────────────────────────────────────────────────
// Hosting platforms that run "web services" (e.g. Render's free tier) require
// the process to listen on $PORT, and put the service to sleep after ~15
// minutes without HTTP traffic. This tiny server satisfies both:
//
//   GET /        → 200 "ok"            (point an uptime monitor here every 5 min)
//   GET /health  → 200 when the bot is connected to Discord, 503 otherwise
//                  (used as Render's health check, so a bot that can't log in
//                  fails the deploy instead of silently staying offline)
//
// It only starts when PORT is set, so local development is unaffected.

/**
 * @param {import('discord.js').Client} client
 */
function startHealthServer(client) {
  const port = process.env.PORT;
  if (!port) return;

  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      const ready = client.isReady();
      res.writeHead(ready ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: ready ? 'ok' : 'connecting',
        guilds: ready ? client.guilds.cache.size : 0,
        uptimeSeconds: Math.floor(process.uptime()),
      }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
  });

  server.listen(port, () => {
    console.log(`[Health] 🌐  Listening on port ${port} (/ and /health).`);
  });
}

module.exports = { startHealthServer };
