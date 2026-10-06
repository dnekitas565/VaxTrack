import { config } from './config.js';
import { initPool, closePool } from './db.js';
import { createApp } from './app.js';

await initPool();
const server = createApp().listen(config.port, () => {
  console.log(`VaxTrack API listening on http://localhost:${config.port}`);
});

async function shutdown() {
  server.close();
  await closePool();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
