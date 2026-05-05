const app = require('./app');
const config = require('./config');
const usageStore = require('./utils/usageStore');
const { connectDatabase } = require('./utils/database');
const { ensureDir } = require('./utils/fileUtils');

// Keep-alive ping for Render free tier (prevents sleep after 15 min)
function startKeepAlive(serverUrl) {
  if (!serverUrl || config.env !== 'production') return;

  const interval = 10 * 60 * 1000; // 10 minutes

  setInterval(async () => {
    try {
      const https = require('https');
      const http = require('http');
      const client = serverUrl.startsWith('https') ? https : http;

      client.get(`${serverUrl}/health`, (res) => {
        console.log(`Keep-alive ping: ${res.statusCode}`);
      }).on('error', (err) => {
        console.log(`Keep-alive ping failed: ${err.message}`);
      });
    } catch (err) {
      console.log(`Keep-alive error: ${err.message}`);
    }
  }, interval);

  console.log(`Keep-alive started (ping every 10 min)`);
}

async function startServer() {
  await connectDatabase();

  await Promise.all([
    ensureDir(config.upload.dir),
    ensureDir(config.upload.optimizedDir),
    usageStore.resetReservationsOnStartup()
  ]);

  app.listen(config.port, () => {
    console.log(`Business Card Scanner backend listening on port ${config.port}`);

    // Start keep-alive ping (only in production)
    const serverUrl = process.env.RENDER_EXTERNAL_URL || process.env.SERVER_URL;
    startKeepAlive(serverUrl);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
