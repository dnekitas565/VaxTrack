import { Router } from 'express';
import { withConn, callCursor, call, num } from '../db.js';
import { parse, schemas } from '../validate.js';
import { requireAuth, requireRole, resolveClinic } from '../auth.js';

const router = Router();
router.use(requireAuth, requireRole('ADMIN', 'NURSE'));

// every dashboard read first runs the overdue sweep, so demos need no waiting for the daily job
const refreshOverdue = (conn) => call(conn, 'BEGIN newborn_vaccination_pkg.refresh_overdue_status; END;');

// GET /dashboard/summary
router.get('/summary', async (req, res) => {
  const q = parse(schemas.dashboardQuery, req.query);
  const clinic = resolveClinic(req, q.clinicId);
  const rows = await withConn(req.user.id, async (conn) => {
    await refreshOverdue(conn);
    return callCursor(conn, 'BEGIN vax_reporting_pkg.dashboard_summary(:clinic, :cur); END;', {
      clinic: num(clinic),
    });
  });
  res.json(rows[0]);
});

// GET /dashboard/overdue
router.get('/overdue', async (req, res) => {
  const q = parse(schemas.dashboardQuery, req.query);
  const clinic = resolveClinic(req, q.clinicId);
  const rows = await withConn(req.user.id, async (conn) => {
    await refreshOverdue(conn);
    return callCursor(conn, 'BEGIN vax_reporting_pkg.overdue_list(:clinic, :cur); END;', {
      clinic: num(clinic),
    });
  });
  res.json(rows);
});

// GET /dashboard/upcoming?days=7
router.get('/upcoming', async (req, res) => {
  const q = parse(schemas.dashboardQuery, req.query);
  const clinic = resolveClinic(req, q.clinicId);
  const rows = await withConn(req.user.id, async (conn) => {
    await refreshOverdue(conn);
    return callCursor(conn, 'BEGIN vax_reporting_pkg.upcoming_list(:clinic, :days, :cur); END;', {
      clinic: num(clinic),
      days: num(q.days),
    });
  });
  res.json(rows);
});

export default router;
