import { Router } from 'express';
import { withConn, query, call, callCursor, num, str, outNum, outStr } from '../db.js';
import { HttpError } from '../errors.js';
import { parse, schemas } from '../validate.js';
import { requireAuth, requireRole, resolveClinic, assertBabyAccess } from '../auth.js';
import { DEFAULT_PASSWORDS, defaultHash } from '../credentials.js';
import { loadLogins, writeLoginsFile } from '../logins.js';

const router = Router();
router.use(requireAuth);

// one literal query serves both the list and the profile (coverage and age come from PL/SQL functions)
const findBabies = (conn, { clinic, guardian, baby, search }) =>
  query(
    conn,
    `SELECT n.baby_id, n.full_name, n.gender, n.date_of_birth, n.birth_weight_kg,
            n.clinic_id, c.clinic_name,
            n.guardian_id, g.full_name AS guardian_name, g.phone AS guardian_phone,
            g.email AS guardian_email, g.address AS guardian_address,
            get_age_text(n.baby_id)     AS age_text,
            get_coverage_pct(n.baby_id) AS coverage_pct,
            (SELECT COUNT(*) FROM dose_records d WHERE d.baby_id = n.baby_id)                          AS doses_total,
            (SELECT COUNT(*) FROM dose_records d WHERE d.baby_id = n.baby_id AND d.status = 'DONE')    AS doses_done,
            (SELECT COUNT(*) FROM dose_records d WHERE d.baby_id = n.baby_id AND d.status = 'PENDING') AS doses_pending,
            (SELECT COUNT(*) FROM dose_records d WHERE d.baby_id = n.baby_id AND d.status = 'OVERDUE') AS doses_overdue
       FROM newborns n
       JOIN clinics c   ON c.clinic_id = n.clinic_id
       JOIN guardians g ON g.guardian_id = n.guardian_id
      WHERE (:clinic IS NULL OR n.clinic_id = :clinic)
        AND (:guardian IS NULL OR n.guardian_id = :guardian)
        AND (:baby IS NULL OR n.baby_id = :baby)
        AND (:search IS NULL
             OR UPPER(n.full_name) LIKE '%' || UPPER(:search) || '%'
             OR UPPER(g.full_name) LIKE '%' || UPPER(:search) || '%'
             OR g.phone LIKE '%' || :search || '%')
      ORDER BY n.created_at DESC, n.baby_id DESC
      FETCH FIRST 200 ROWS ONLY`,
    { clinic: num(clinic), guardian: num(guardian), baby: num(baby), search: str(search || null) },
  );

const timeline = (conn, babyId) =>
  callCursor(conn, 'BEGIN vax_reporting_pkg.baby_timeline(:baby, :cur); END;', { baby: num(babyId) });

// tiny in-memory limit for the phone lookup (it answers yes/no for a number): 30 requests a minute per user
const lookups = new Map();
function lookupLimit(userId) {
  const now = Date.now();
  const recent = (lookups.get(userId) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 30) throw new HttpError(429, 'Too many lookups; wait a minute and try again');
  lookups.set(userId, [...recent, now]);
}

// GET /newborns/guardian-lookup?phone=  -> { exists } only: no guardian details leave the database.
// Declared before '/:id' so it is not read as a baby id.
router.get('/guardian-lookup', requireRole('ADMIN', 'NURSE'), async (req, res) => {
  const { phone } = parse(schemas.guardianLookup, req.query);
  lookupLimit(req.user.id);
  const out = await withConn(req.user.id, (conn) =>
    call(conn, 'BEGIN :r := newborn_vaccination_pkg.guardian_exists(:phone); END;', { r: outStr(1), phone: str(phone) }),
  );
  res.json({ exists: out.outBinds.r === 'Y' });
});

// POST /newborns  -> register_newborn
router.post('/', requireRole('ADMIN', 'NURSE'), async (req, res) => {
  const body = parse(schemas.registerNewborn, req.body);
  const clinic = resolveClinic(req, body.clinicId, { required: true });
  const { guardian, baby } = body;

  const result = await withConn(req.user.id, async (conn) => {
    const out = await call(
      conn,
      `BEGIN
         newborn_vaccination_pkg.register_newborn(
           p_guardian_name    => :gname,
           p_guardian_phone   => :gphone,
           p_guardian_email   => :gemail,
           p_guardian_address => :gaddress,
           p_baby_name        => :bname,
           p_gender           => :gender,
           p_dob              => TO_DATE(:dob, 'YYYY-MM-DD'),
           p_birth_weight_kg  => :weight,
           p_clinic_id        => :clinic,
           p_include_regional => :regional,
           p_baby_id          => :baby_id,
           p_parent_hash      => :phash,
           p_parent_username  => :puser);
       END;`,
      {
        gname: str(guardian.name || null),
        gphone: str(guardian.phone),
        gemail: str(guardian.email || null),
        gaddress: str(guardian.address || null),
        bname: str(baby.name),
        gender: str(baby.gender),
        dob: str(baby.dob),
        weight: num(baby.birthWeightKg),
        clinic: num(clinic),
        regional: str(body.includeRegional ? 'Y' : 'N'),
        baby_id: outNum(),
        phash: str(defaultHash('PARENT')),
        puser: outStr(60),
      },
    );
    const babyId = out.outBinds.baby_id;
    // the guardian's login: the new one (with its starting password) or, for a family that already
    // has one, only the fact that nothing was created. An existing login is never read back here.
    const parentLogin = out.outBinds.puser
      ? { username: out.outBinds.puser, password: DEFAULT_PASSWORDS.PARENT, created: true }
      : { created: false };
    return { baby_id: babyId, timeline: await timeline(conn, babyId), parent_login: parentLogin };
  });
  if (result.parent_login.created) {
    withConn(null, (conn) => loadLogins(conn)).then(writeLoginsFile).catch(() => {});
  }
  res.status(201).json(result);
});

// GET /newborns?search=
router.get('/', async (req, res) => {
  const { search } = parse(schemas.newbornSearch, req.query);
  const { role, clinicId, guardianId } = req.user;
  const clinicScope = role === 'NURSE' ? clinicId : null;
  const guardianScope = role === 'PARENT' ? guardianId : null;

  const rows = await withConn(req.user.id, (conn) =>
    findBabies(conn, { clinic: clinicScope, guardian: guardianScope, search }),
  );
  res.json(rows);
});

// GET /newborns/:id  -> profile + timeline
router.get('/:id', async (req, res) => {
  const babyId = parse(schemas.id, req.params.id);
  const result = await withConn(req.user.id, async (conn) => {
    await assertBabyAccess(conn, req, babyId);
    const [baby] = await findBabies(conn, { baby: babyId });
    if (!baby) throw new HttpError(404, 'Baby not found');
    return { baby, timeline: await timeline(conn, babyId) };
  });
  res.json(result);
});

// PATCH /newborns/:id  (ADMIN) -> update_newborn: correct name, gender, date of birth, birth weight
router.patch('/:id', requireRole('ADMIN'), async (req, res) => {
  const babyId = parse(schemas.id, req.params.id);
  const body = parse(schemas.updateNewborn, req.body);
  await withConn(req.user.id, (conn) =>
    call(
      conn,
      `BEGIN
         newborn_vaccination_pkg.update_newborn(
           p_baby_id         => :id,
           p_baby_name       => :name,
           p_gender          => :gender,
           p_dob             => TO_DATE(:dob, 'YYYY-MM-DD'),
           p_birth_weight_kg => :weight,
           p_user_id         => :usr);
       END;`,
      { id: num(babyId), name: str(body.name), gender: str(body.gender), dob: str(body.dob), weight: num(body.birthWeightKg), usr: num(req.user.id) },
    ),
  );
  res.json({ ok: true, baby_id: babyId });
});

// DELETE /newborns/:id?restoreStock=1  (ADMIN) -> delete_newborn
router.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  const babyId = parse(schemas.id, req.params.id);
  const q = parse(schemas.deleteNewborn, req.query);
  await withConn(req.user.id, (conn) =>
    call(
      conn,
      `BEGIN
         newborn_vaccination_pkg.delete_newborn(
           p_baby_id       => :id,
           p_user_id       => :usr,
           p_restore_stock => :restore);
       END;`,
      { id: num(babyId), usr: num(req.user.id), restore: str(q.restoreStock === '1' ? 'Y' : 'N') },
    ),
  );
  res.json({ ok: true, baby_id: babyId });
});

export default router;
