// Regenerates ../LOGINS.md from the database:  npm run logins
// (the API does this by itself at start-up and whenever accounts change; use this after
//  re-running the SQL seed while the API is stopped)
import { initPool, closePool, withConn } from '../src/db.js';
import { initDefaultHashes } from '../src/credentials.js';
import { loadLogins, writeLoginsFile } from '../src/logins.js';

await initPool();
await initDefaultHashes();
const list = await withConn(null, (conn) => loadLogins(conn));
await writeLoginsFile(list);
console.log(`LOGINS.md written: ${list.length} accounts (${list.filter((u) => u.role === 'NURSE').length} nurses, ${list.filter((u) => u.role === 'PARENT').length} parents)`);
await closePool();
