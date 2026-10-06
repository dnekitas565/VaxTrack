import { Router } from 'express';
import { withConn, query, num, str } from '../db.js';
import { HttpError } from '../errors.js';
import { parse, schemas } from '../validate.js';
import { requireAuth, requireRole, resolveClinic } from '../auth.js';

const router = Router();
router.use(requireAuth, requireRole('ADMIN', 'NURSE'));

// GET /alerts?unread=1&type=OVERDUE&clinicId=
router.get('/', async (req, res) => {
  const q = parse(schemas.alertsQuery, req.query);
  const clinic = resolveClinic(req, q.clinicId);
  const rows = await withConn(req.user.id, (conn) =>
    query(
      conn,
      `SELECT a.alert_id, a.alert_type, a.message, a.alert_date, a.is_read,
              a.baby_id, n.full_name AS baby_name, a.record_id, a.clinic_id, c.clinic_name
         FROM alerts a
         LEFT JOIN newborns n ON n.baby_id = a.baby_id
         LEFT JOIN clinics c  ON c.clinic_id = a.clinic_id
        WHERE (:clinic IS NULL OR a.clinic_id = :clinic)
          AND (:unread IS NULL OR a.is_read = 'N')
          AND (:atype IS NULL OR a.alert_type = :atype)
        ORDER BY a.alert_date DESC, a.alert_id DESC
        FETCH FIRST 200 ROWS ONLY`,
      { clinic: num(clinic), unread: str(q.unread === '1' ? 'Y' : null), atype: str(q.type) },
    ),
  );
  res.json(rows);
});

// PATCH /alerts/:id/read
// A plain flag update: no business rule involved, so there is no PL/SQL procedure for it.
router.patch('/:id/read', async (req, res) => {
  const alertId = parse(schemas.id, req.params.id);
  const clinic = resolveClinic(req, undefined);
  const affected = await withConn(req.user.id, async (conn) => {
    const result = await conn.execute(
      `UPDATE alerts SET is_read = 'Y'
        WHERE alert_id = :id AND (:clinic IS NULL OR clinic_id = :clinic)`,
      { id: num(alertId), clinic: num(clinic) },
    );
    return result.rowsAffected;
  });
  if (!affected) throw new HttpError(404, 'Alert not found');
  res.json({ ok: true, alert_id: alertId });
});

export default router;
