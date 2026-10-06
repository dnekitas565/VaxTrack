// Usage: node scripts/hash.js <password> [<password> ...]
// Prints a bcrypt (cost 10) hash per password, for pasting into db/02_seed_reference.sql.
import bcrypt from 'bcrypt';

const passwords = process.argv.slice(2);
if (passwords.length === 0) {
  console.error('Usage: node scripts/hash.js <password> [<password> ...]');
  process.exit(1);
}
for (const pw of passwords) {
  console.log(`${pw}\t${await bcrypt.hash(pw, 10)}`);
}
