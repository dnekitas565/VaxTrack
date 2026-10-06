import { Router } from 'express';
import { withConn, query, call, num, str, outNum } from '../db.js';
import { HttpError } from '../errors.js';
import { parse, schemas } from '../validate.js';
import { requireAuth, requireRole, resolveClinic, assertBabyAccess } from '../auth.js';

const router = Router();
router.use(requireAuth, requireRole('ADMIN', 'NURSE'));

/** Loads the dose and checks the user may act on its baby (nurse: own clinic) */
async function loadDose(conn, req, recordId) {
  const [dose] = await query(
    conn,
    `SELECT d.record_id, d.vaccine_id, d.baby_id, n.clinic_id AS baby_clinic_id
       FROM dose_records d
       JOIN newborns n ON n.baby_id = d.baby_id
      WHERE d.record_id = :id`,
    { id: num(recordId) },
  );
  if (!dose) throw new HttpError(404, 'Dose record not found');
  await assertBabyAccess(conn, req, dose.baby_id);
  return dose;
}

// POST /doses/:recordId/administer  -> mark_dose_administered
router.post('/:recordId/administer', async (req, res) => {
  const recordId = parse(schemas.id, req.params.recordId);
  const body = parse(schemas.administer, req.body ?? {});

  await withConn(req.user.id, async (conn) => {
    const dose = await loadDose(conn, req, recordId);
    // nurse: own clinic's stock; admin: the clinic they name, else the baby's clinic
    const clinic = resolveClinic(req, body.clinicId) ?? dose.baby_clinic_id;
    await call(
      conn,
      `BEGIN
         newborn_vaccination_pkg.mark_dose_administered(
           p_record_id         => :record,
           p_administered_date => TO_DATE(:adate, 'YYYY-MM-DD'),
           p_clinic_id         => :clinic,
           p_user_id           => :usr);
       END;`,
      { record: num(recordId), adate: str(body.administeredDate), clinic: num(clinic), usr: num(req.user.id) },
    );
  });
  res.json({ ok: true, record_id: recordId, status: 'DONE' });
});

// POST /doses/:recordId/reschedule  -> reschedule_dose
router.post('/:recordId/reschedule', async (req, res) => {
  const recordId = parse(schemas.id, req.params.recordId);
  const body = parse(schemas.reschedule, req.body);

  await withConn(req.user.id, async (conn) => {
    await loadDose(conn, req, recordId);
    await call(
      conn,
      `BEGIN
         newborn_vaccination_pkg.reschedule_dose(
           p_record_id => :record,
           p_new_date  => TO_DATE(:ndate, 'YYYY-MM-DD'),
           p_reason    => :reason,
           p_user_id   => :usr);
       END;`,
      { record: num(recordId), ndate: str(body.newDate), reason: str(body.reason), usr: num(req.user.id) },
    );
  });
  res.json({ ok: true, record_id: recordId });
});

// GET /doses/:recordId/batch-preview?clinicId=   (feeds the "Mark administered" dialog)
router.get('/:recordId/batch-preview', async (req, res) => {
  const recordId = parse(schemas.id, req.params.recordId);
  const q = parse(schemas.previewQuery, req.query);

  const result = await withConn(req.user.id, async (conn) => {
    const dose = await loadDose(conn, req, recordId);
    const clinic = resolveClinic(req, q.clinicId) ?? dose.baby_clinic_id;

    const [{ allowed }] = await query(
      conn,
      'SELECT newborn_vaccination_pkg.is_dose_allowed(:id) AS allowed FROM dual',
      { id: num(recordId) },
    );

    let batch = null;
    let batchError = null;
    try {
      const out = await call(
        conn,
        'BEGIN :inv := vaccine_inventory_pkg.pick_batch(:clinic, :vaccine); END;',
        { inv: outNum(), clinic: num(clinic), vaccine: num(dose.vaccine_id) },
      );
      [batch] = await query(
        conn,
        `SELECT inventory_id, batch_no, expiry_date, quantity
           FROM vaccine_inventory WHERE inventory_id = :inv`,
        { inv: num(out.outBinds.inv) },
      );
    } catch (err) {
      if (err.errorNum !== 20009) throw err;
      batchError = String(err.message).split('\n')[0].replace(/^ORA-\d{5}:\s*/, '');
    }
    return { allowed: allowed === 'Y', clinic_id: clinic, batch, batch_error: batchError };
  });
  res.json(result);
});

export default router;
