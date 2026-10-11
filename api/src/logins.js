import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { query } from './db.js';
import { DEFAULT_PASSWORDS, shownPassword } from './credentials.js';

const LOGINS_FILE = fileURLToPath(new URL('../../LOGINS.md', import.meta.url));

/** Every account with its password (when it is still the role default), read live from the database */
export async function loadLogins(conn) {
  const rows = await query(
    conn,
    `SELECT u.user_id, u.username, u.password_hash, u.role, u.full_name, c.clinic_name,
            (SELECT LISTAGG(n.full_name, ', ') WITHIN GROUP (ORDER BY n.baby_id)
               FROM newborns n WHERE n.guardian_id = u.guardian_id) AS children
       FROM app_users u
       LEFT JOIN clinics c ON c.clinic_id = u.clinic_id
      ORDER BY u.user_id`,
  );
  const list = await Promise.all(
    rows.map(async (r) => ({
      user_id: r.user_id,
      username: r.username,
      role: r.role,
      full_name: r.full_name,
      clinic_name: r.clinic_name,
      children: r.children,
      password: await shownPassword(r),
    })),
  );
  // admin, nurses, parents; inside a group: nurse1, nurse2 ... parent1, parent2, then phone-number logins
  const rank = { ADMIN: 1, NURSE: 2, PARENT: 3 };
  const named = (u) => (/^[A-Za-z]+\d+$/.test(u.username) ? 0 : 1);
  return list.sort(
    (a, b) =>
      rank[a.role] - rank[b.role] ||
      named(a) - named(b) ||
      a.username.localeCompare(b.username, undefined, { numeric: true }),
  );
}

const cell = (v) => String(v ?? '').replace(/\|/g, '/');
const pw = (p) => (p ? `\`${p}\`` : '(changed, ask an admin)');

export function renderLoginsMarkdown(list) {
  const by = (role) => list.filter((u) => u.role === role);
  const table = (head, rows) =>
    [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n');

  return `# VaxTrack logins

> Generated automatically from the database by the API (\`npm run logins\` does the same on demand).
> Do not edit by hand: it is rewritten whenever accounts change and whenever the sign-in page loads.

Passwords: every account starts with the default for its role (**Admin@123**, **Nurse@123**, **Parent@123**).
This sheet is for development and demos only; a production system would force a password change at first login.

## Administrator

${table(['Username', 'Password', 'Name'], by('ADMIN').map((u) => [`\`${u.username}\``, pw(u.password), u.full_name]))}

## Nurses (one per clinic: they register babies and give the doses at their clinic)

${table(
  ['Username', 'Password', 'Name', 'Clinic'],
  by('NURSE').map((u) => [`\`${u.username}\``, pw(u.password), u.full_name, u.clinic_name]),
)}

## Parents and guardians (read-only view of their own child and the vaccination card)

${table(
  ['Username', 'Password', 'Guardian', 'Child(ren)'],
  by('PARENT').map((u) => [`\`${u.username}\``, pw(u.password), u.full_name, u.children || '(none yet)']),
)}

Parent logins are created automatically when a baby is registered: the username is made from the guardian's name
(for example \`priya.sharma\`; a number is added if it is taken; the demo accounts \`parent1\` and \`parent2\` keep their short names). A guardian who already has a login keeps it.
New nurses are added by an admin on the **Users** page.

Defaults at a glance: ${Object.entries(DEFAULT_PASSWORDS).map(([r, p]) => `${r.toLowerCase()} \`${p}\``).join(', ')}.
`;
}

/** Rewrites LOGINS.md only when its content changed. Never throws: the sheet is a convenience. */
export async function writeLoginsFile(list) {
  try {
    const text = renderLoginsMarkdown(list);
    let current = '';
    try {
      current = await fs.readFile(LOGINS_FILE, 'utf8');
    } catch {
      /* first run */
    }
    if (current !== text) await fs.writeFile(LOGINS_FILE, text, 'utf8');
  } catch (err) {
    console.error('Could not write LOGINS.md:', err.message);
  }
}
