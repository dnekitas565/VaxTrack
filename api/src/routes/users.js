import { Router } from 'express';
import { withConn, query, call, num, str, outNum } from '../db.js';
import { HttpError } from '../errors.js';
import { parse, schemas } from '../validate.js';
import { requireAuth, requireRole } from '../auth.js';
import { DEFAULT_PASSWORDS, defaultHash } from '../credentials.js';
import { loadLogins, writeLoginsFile } from '../logins.js';

const router = Router();
router.use(requireAuth, requireRole('ADMIN'));

// GET /users  -> every account (the same list that feeds LOGINS.md)
router.get('/', async (req, res) => {
  const list = await withConn(req.user.id, (conn) => loadLogins(conn));
  res.json(list);
});

// GET /users/options  -> what the "add account" forms need
router.get('/options', async (req, res) => {
  const result = await withConn(req.user.id, async (conn) => ({
    clinics: await query(conn, 'SELECT clinic_id, clinic_name FROM clinics ORDER BY clinic_name'),
    guardians_without_login: await query(
      conn,
      `SELECT g.guardian_id, g.full_name, g.phone,
              (SELECT LISTAGG(n.full_name, ', ') WITHIN GROUP (ORDER BY n.baby_id)
                 FROM newborns n WHERE n.guardian_id = g.guardian_id) AS children
         FROM guardians g
        WHERE NOT EXISTS (SELECT 1 FROM app_users u WHERE u.guardian_id = g.guardian_id)
        ORDER BY g.full_name`,
    ),
  }));
  res.json(result);
});

// POST /users  -> account_pkg.create_user  (NURSE for a clinic, or PARENT login for a guardian)
router.post('/', async (req, res) => {
  const body = parse(schemas.createUser, req.body);
  const created = await withConn(req.user.id, async (conn) => {
    let fullName = body.fullName;
    if (body.role === 'PARENT' && !fullName) {
      const [g] = await query(conn, 'SELECT full_name FROM guardians WHERE guardian_id = :id', { id: num(body.guardianId) });
      if (!g) throw new HttpError(404, 'Guardian not found');
      fullName = g.full_name;
    }
    const out = await call(
      conn,
      `BEGIN
         account_pkg.create_user(
           p_actor_id      => :actor,
           p_username      => :username,
           p_password_hash => :hash,
           p_role          => :role,
           p_full_name     => :fullname,
           p_clinic_id     => :clinic,
           p_guardian_id   => :guardian,
           p_user_id       => :uid);
       END;`,
      {
        actor: num(req.user.id),
        username: str(body.username || null),
        hash: str(defaultHash(body.role)),
        role: str(body.role),
        fullname: str(fullName || null),
        clinic: num(body.clinicId),
        guardian: num(body.guardianId),
        uid: outNum(),
      },
    );
    const [row] = await query(conn, 'SELECT username FROM app_users WHERE user_id = :id', { id: num(out.outBinds.uid) });
    return { user_id: out.outBinds.uid, username: row.username };
  });

  // keep LOGINS.md current; a failure here must not fail the request
  withConn(null, (conn) => loadLogins(conn)).then(writeLoginsFile).catch(() => {});
  res.status(201).json({ ...created, password: DEFAULT_PASSWORDS[body.role] });
});

export default router;
