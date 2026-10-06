import { Router } from 'express';
import { withConn, query, call, num, str } from '../db.js';
import { parse, schemas } from '../validate.js';
import { requireAuth, requireRole, resolveClinic } from '../auth.js';

const router = Router();
router.use(requireAuth, requireRole('ADMIN', 'NURSE'));

// GET /inventory?clinicId=
router.get('/', async (req, res) => {
  const q = parse(schemas.inventoryQuery, req.query);
  const clinic = resolveClinic(req, q.clinicId);
  const rows = await withConn(req.user.id, (conn) =>
    query(
      conn,
      `SELECT i.inventory_id, i.clinic_id, c.clinic_name, i.vaccine_id,
              dose_label(v.vaccine_name, v.dose_number) AS vaccine_label, v.age_label,
              i.batch_no, i.expiry_date, i.expiry_date - TRUNC(SYSDATE) AS days_to_expiry,
              i.quantity, i.low_stock_threshold,
              CASE WHEN i.quantity < i.low_stock_threshold THEN 'Y' ELSE 'N' END AS is_low
         FROM vaccine_inventory i
         JOIN clinics c        ON c.clinic_id = i.clinic_id
         JOIN vaccine_master v ON v.vaccine_id = i.vaccine_id
        WHERE (:clinic IS NULL OR i.clinic_id = :clinic)
        ORDER BY c.clinic_name, v.due_age_days, v.vaccine_id, i.expiry_date`,
      { clinic: num(clinic) },
    ),
  );
  res.json(rows);
});

// POST /inventory/restock  -> restock
router.post('/restock', async (req, res) => {
  const body = parse(schemas.restock, req.body);
  const clinic = resolveClinic(req, body.clinicId, { required: true });
  await withConn(req.user.id, (conn) =>
    call(
      conn,
      `BEGIN
         vaccine_inventory_pkg.restock(
           p_clinic_id   => :clinic,
           p_vaccine_id  => :vaccine,
           p_batch_no    => :batch,
           p_expiry_date => TO_DATE(:expiry, 'YYYY-MM-DD'),
           p_qty         => :qty,
           p_user_id     => :usr);
       END;`,
      {
        clinic: num(clinic),
        vaccine: num(body.vaccineId),
        batch: str(body.batchNo),
        expiry: str(body.expiryDate),
        qty: num(body.quantity),
        usr: num(req.user.id),
      },
    ),
  );
  res.status(201).json({ ok: true });
});

export default router;
