import { config } from './config.js';
import { initPool, closePool } from './db.js';
import { createApp } from './app.js';
import { initDefaultHashes } from './credentials.js';
import { loadLogins, writeLoginsFile } from './logins.js';
import { withConn } from './db.js';

await initPool();
await initDefaultHashes();
// the login sheet is rewritten at every start so it always matches the database
withConn(null, (conn) => loadLogins(conn)).then(writeLoginsFile).catch((e) => console.error('LOGINS.md not written:', e.message));
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
