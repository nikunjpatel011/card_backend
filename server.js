const app = require('./app');
const config = require('./config');
const usageStore = require('./utils/usageStore');
const { connectDatabase } = require('./utils/database');
const { ensureDir } = require('./utils/fileUtils');

async function startServer() {
  await connectDatabase();

  await Promise.all([
    ensureDir(config.upload.dir),
    ensureDir(config.upload.optimizedDir),
    usageStore.resetReservationsOnStartup()
  ]);

  app.listen(config.port, () => {
    console.log(`Business Card Scanner backend listening on port ${config.port}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
