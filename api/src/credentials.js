import bcrypt from 'bcrypt';

/**
 * Demo/default passwords, one per role. New accounts (parent login at registration, nurses added by an
 * admin) start with the default of their role, so nobody has to guess what a password is.
 * The database only ever stores bcrypt hashes; the plain text lives here and in the generated LOGINS.md.
 */
export const DEFAULT_PASSWORDS = { ADMIN: 'Admin@123', NURSE: 'Nurse@123', PARENT: 'Parent@123' };

const hashes = {};

export async function initDefaultHashes() {
  for (const [role, password] of Object.entries(DEFAULT_PASSWORDS)) {
    hashes[role] = await bcrypt.hash(password, 10);
  }
}

export const defaultHash = (role) => hashes[role];

const matchCache = new Map();

/**
 * The role's default password if this account still uses it, otherwise null.
 * It compares against the stored hash, so the login list is truthful even if a password was changed later.
 */
export async function shownPassword(user) {
  const key = `${user.user_id}|${user.password_hash}`;
  if (!matchCache.has(key)) {
    matchCache.set(key, await bcrypt.compare(DEFAULT_PASSWORDS[user.role] ?? '', user.password_hash));
  }
  return matchCache.get(key) ? DEFAULT_PASSWORDS[user.role] : null;
}
