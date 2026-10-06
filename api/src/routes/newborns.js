import { Router } from 'express';
import { withConn, query, call, callCursor, num, str, outNum } from '../db.js';
import { HttpError } from '../errors.js';
import { parse, schemas } from '../validate.js';
import { requireAuth, requireRole, resolveClinic, assertBabyAccess } from '../auth.js';

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
           p_baby_id          => :baby_id);
       END;`,
      {
        gname: str(guardian.name),
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
      },
    );
    const babyId = out.outBinds.baby_id;
    return { baby_id: babyId, timeline: await timeline(conn, babyId) };
  });
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

export default router;
