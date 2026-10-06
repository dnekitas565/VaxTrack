import { Router } from 'express';
import { withConn, query, callCursor, num } from '../db.js';
import { parse, schemas } from '../validate.js';
import { requireAuth, requireRole } from '../auth.js';

const router = Router();
router.use(requireAuth);

// GET /reports/clinic-coverage   (nurses only see their own clinic's row)
router.get('/reports/clinic-coverage', requireRole('ADMIN', 'NURSE'), async (req, res) => {
  const rows = await withConn(req.user.id, (conn) =>
    callCursor(conn, 'BEGIN vax_reporting_pkg.clinic_coverage(:cur); END;'),
  );
  res.json(req.user.role === 'NURSE' ? rows.filter((r) => r.clinic_id === req.user.clinicId) : rows);
});

// GET /audit?recordId=   (ADMIN)
router.get('/audit', requireRole('ADMIN'), async (req, res) => {
  const q = parse(schemas.auditQuery, req.query);
  const rows = await withConn(req.user.id, (conn) =>
    query(
      conn,
      `SELECT a.audit_id, a.table_name, a.record_id, a.action, a.old_value, a.new_value, a.changed_by,
              TO_CHAR(a.changed_at, 'YYYY-MM-DD HH24:MI:SS') AS changed_at,
              n.full_name AS baby_name,
              dose_label(v.vaccine_name, v.dose_number) AS dose_name
         FROM audit_log a
         LEFT JOIN dose_records d  ON a.table_name = 'DOSE_RECORDS' AND d.record_id = a.record_id
         LEFT JOIN newborns n      ON n.baby_id = d.baby_id
         LEFT JOIN vaccine_master v ON v.vaccine_id = d.vaccine_id
        WHERE (:rid IS NULL OR a.record_id = :rid)
        ORDER BY a.audit_id DESC
        FETCH FIRST 200 ROWS ONLY`,
      { rid: num(q.recordId) },
    ),
  );
  res.json(rows);
});

// GET /clinics, GET /vaccines   (lookups for the UI forms)
router.get('/clinics', requireRole('ADMIN', 'NURSE'), async (req, res) => {
  const scope = req.user.role === 'NURSE' ? req.user.clinicId : null;
  const rows = await withConn(req.user.id, (conn) =>
    query(
      conn,
      `SELECT clinic_id, clinic_name, city, phone FROM clinics
        WHERE (:clinic IS NULL OR clinic_id = :clinic) ORDER BY clinic_name`,
      { clinic: num(scope) },
    ),
  );
  res.json(rows);
});

router.get('/vaccines', requireRole('ADMIN', 'NURSE'), async (req, res) => {
  const rows = await withConn(req.user.id, (conn) =>
    query(
      conn,
      `SELECT vaccine_id, vaccine_name, dose_number, dose_label(vaccine_name, dose_number) AS vaccine_label,
              age_label, disease_covered, route, is_regional
         FROM vaccine_master ORDER BY due_age_days, vaccine_id`,
    ),
  );
  res.json(rows);
});

export default router;
