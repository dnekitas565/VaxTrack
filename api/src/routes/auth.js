import { Router } from 'express';
import { withConn, query, num } from '../db.js';
import { parse, schemas } from '../validate.js';
import { verifyLogin, signToken, requireAuth, loginThrottle } from '../auth.js';
import { config } from '../config.js';
import { HttpError } from '../errors.js';
import { loadLogins, writeLoginsFile } from '../logins.js';

const router = Router();

// POST /auth/login
router.post('/auth/login', async (req, res) => {
  const { username, password } = parse(schemas.login, req.body);
  const key = `${req.ip}|${username.toLowerCase()}`;
  loginThrottle.check(key);

  let user;
  try {
    user = await withConn(null, (conn) => verifyLogin(conn, username, password));
  } catch (err) {
    if (err.status === 401) loginThrottle.fail(key);
    throw err;
  }
  loginThrottle.reset(key);

  res.json({
    token: signToken(user),
    user: {
      id: user.user_id,
      username: user.username,
      role: user.role,
      fullName: user.full_name,
      clinicId: user.clinic_id,
      guardianId: user.guardian_id,
    },
  });
});

// GET /auth/demo-logins  (development only: DEMO_LOGINS=true) -> every account with its password,
// read live from the database. Also refreshes LOGINS.md, so the sheet never goes stale.
router.get('/auth/demo-logins', async (_req, res) => {
  if (!config.demoLogins) throw new HttpError(404, 'Not found');
  const list = await withConn(null, (conn) => loadLogins(conn));
  writeLoginsFile(list);
  res.json(list.map(({ username, role, full_name, clinic_name, children, password }) => ({ username, role, full_name, clinic_name, children, password })));
});

// GET /me
router.get('/me', requireAuth, async (req, res) => {
  const [me] = await withConn(req.user.id, (conn) =>
    query(
      conn,
      `SELECT u.user_id AS id, u.username, u.role, u.full_name, u.clinic_id, c.clinic_name,
              u.guardian_id
         FROM app_users u
         LEFT JOIN clinics c ON c.clinic_id = u.clinic_id
        WHERE u.user_id = :id`,
      { id: num(req.user.id) },
    ),
  );
  res.json(me);
});

export default router;
