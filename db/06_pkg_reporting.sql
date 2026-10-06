-- ============================================================================
-- 06_pkg_reporting.sql  --  vax_reporting_pkg (spec + body)
-- Owner  : vaxapp
-- Purpose: read-only REF CURSORs for the API / dashboard. The caller fetches and
--          closes the cursor. p_clinic_id NULL means "all clinics".
-- Error codes: -20001 baby not found (baby_timeline)
-- Colour buckets (baby_timeline): GREEN = DONE, RED = OVERDUE (or PENDING past due),
--   AMBER = PENDING due within the next 14 days, GREY = PENDING further ahead.
-- ============================================================================
SET DEFINE OFF
SET ECHO ON

CREATE OR REPLACE PACKAGE vax_reporting_pkg AS
  c_amber_window_days CONSTANT PLS_INTEGER := 14;

  -- one row: totals for the clinic (or all clinics)
  PROCEDURE dashboard_summary (p_clinic_id IN NUMBER, p_cur OUT SYS_REFCURSOR);

  -- doses with status OVERDUE, most overdue first
  PROCEDURE overdue_list (p_clinic_id IN NUMBER, p_cur OUT SYS_REFCURSOR);

  -- PENDING doses due from today through today + p_days
  PROCEDURE upcoming_list (p_clinic_id IN NUMBER, p_days IN NUMBER, p_cur OUT SYS_REFCURSOR);

  -- coverage per clinic, ranked
  PROCEDURE clinic_coverage (p_cur OUT SYS_REFCURSOR);

  -- every dose of one baby with status, colour bucket and batch
  PROCEDURE baby_timeline (p_baby_id IN NUMBER, p_cur OUT SYS_REFCURSOR);
END vax_reporting_pkg;
/
SHOW ERRORS PACKAGE vax_reporting_pkg

CREATE OR REPLACE PACKAGE BODY vax_reporting_pkg AS

  -- ---------------------------------------------------------- dashboard_summary
  PROCEDURE dashboard_summary (p_clinic_id IN NUMBER, p_cur OUT SYS_REFCURSOR) IS
  BEGIN
    OPEN p_cur FOR
      -- dose totals and the two single-value counts are separate inline views, joined into one row
      SELECT b.total_babies,
             t.total_doses, t.doses_done, t.doses_pending, t.doses_overdue,
             NVL(ROUND(100 * t.doses_done / NULLIF(t.total_doses, 0), 1), 0) AS coverage_pct,
             a.unread_alerts
        FROM (SELECT COUNT(*) AS total_babies
                FROM newborns n
               WHERE p_clinic_id IS NULL OR n.clinic_id = p_clinic_id) b
       CROSS JOIN
             (SELECT COUNT(d.record_id)                             AS total_doses,
                     COUNT(CASE WHEN d.status = 'DONE'    THEN 1 END) AS doses_done,
                     COUNT(CASE WHEN d.status = 'PENDING' THEN 1 END) AS doses_pending,
                     COUNT(CASE WHEN d.status = 'OVERDUE' THEN 1 END) AS doses_overdue
                FROM dose_records d
                JOIN newborns n ON n.baby_id = d.baby_id
               WHERE p_clinic_id IS NULL OR n.clinic_id = p_clinic_id) t
       CROSS JOIN
             (SELECT COUNT(*) AS unread_alerts
                FROM alerts al
               WHERE al.is_read = 'N'
                 AND (p_clinic_id IS NULL OR al.clinic_id = p_clinic_id)) a;
  END dashboard_summary;

  -- ------------------------------------------------------------- overdue_list
  PROCEDURE overdue_list (p_clinic_id IN NUMBER, p_cur OUT SYS_REFCURSOR) IS
  BEGIN
    OPEN p_cur FOR
      SELECT d.record_id, n.baby_id, n.full_name AS baby_name,
             g.full_name AS guardian_name, g.phone AS guardian_phone,
             c.clinic_name,
             dose_label(v.vaccine_name, v.dose_number) AS dose_name,
             d.scheduled_date,
             TRUNC(SYSDATE) - d.scheduled_date AS days_overdue
        FROM dose_records d
        JOIN newborns n       ON n.baby_id = d.baby_id
        JOIN guardians g      ON g.guardian_id = n.guardian_id
        JOIN clinics c        ON c.clinic_id = n.clinic_id
        JOIN vaccine_master v ON v.vaccine_id = d.vaccine_id
       WHERE d.status = 'OVERDUE'
         AND (p_clinic_id IS NULL OR n.clinic_id = p_clinic_id)
       ORDER BY days_overdue DESC, n.full_name, d.record_id;
  END overdue_list;

  -- ------------------------------------------------------------ upcoming_list
  PROCEDURE upcoming_list (p_clinic_id IN NUMBER, p_days IN NUMBER, p_cur OUT SYS_REFCURSOR) IS
  BEGIN
    OPEN p_cur FOR
      SELECT d.record_id, n.baby_id, n.full_name AS baby_name,
             g.full_name AS guardian_name, g.phone AS guardian_phone,
             c.clinic_name,
             dose_label(v.vaccine_name, v.dose_number) AS dose_name,
             d.scheduled_date,
             d.scheduled_date - TRUNC(SYSDATE) AS days_until_due
        FROM dose_records d
        JOIN newborns n       ON n.baby_id = d.baby_id
        JOIN guardians g      ON g.guardian_id = n.guardian_id
        JOIN clinics c        ON c.clinic_id = n.clinic_id
        JOIN vaccine_master v ON v.vaccine_id = d.vaccine_id
       WHERE d.status = 'PENDING'
         AND d.scheduled_date BETWEEN TRUNC(SYSDATE) AND TRUNC(SYSDATE) + NVL(p_days, 7)
         AND (p_clinic_id IS NULL OR n.clinic_id = p_clinic_id)
       ORDER BY d.scheduled_date, n.full_name, d.record_id;
  END upcoming_list;

  -- ---------------------------------------------------------- clinic_coverage
  PROCEDURE clinic_coverage (p_cur OUT SYS_REFCURSOR) IS
  BEGIN
    -- aggregate per clinic, then an analytic RANK over the result
    OPEN p_cur FOR
      SELECT t.clinic_id, t.clinic_name, t.city, t.total_babies, t.total_doses,
             t.doses_done, t.doses_overdue, t.coverage_pct,
             RANK() OVER (ORDER BY t.coverage_pct DESC) AS coverage_rank
        FROM (SELECT c.clinic_id, c.clinic_name, c.city,
                     COUNT(DISTINCT n.baby_id)                            AS total_babies,
                     COUNT(d.record_id)                                   AS total_doses,
                     COUNT(CASE WHEN d.status = 'DONE'    THEN 1 END)     AS doses_done,
                     COUNT(CASE WHEN d.status = 'OVERDUE' THEN 1 END)     AS doses_overdue,
                     NVL(ROUND(100 * COUNT(CASE WHEN d.status = 'DONE' THEN 1 END)
                               / NULLIF(COUNT(d.record_id), 0), 1), 0)    AS coverage_pct
                FROM clinics c
                LEFT JOIN newborns n      ON n.clinic_id = c.clinic_id
                LEFT JOIN dose_records d  ON d.baby_id = n.baby_id
               GROUP BY c.clinic_id, c.clinic_name, c.city) t
       ORDER BY coverage_rank, t.clinic_name;
  END clinic_coverage;

  -- ------------------------------------------------------------ baby_timeline
  PROCEDURE baby_timeline (p_baby_id IN NUMBER, p_cur OUT SYS_REFCURSOR) IS
    v_count PLS_INTEGER;
  BEGIN
    SELECT COUNT(*) INTO v_count FROM newborns WHERE baby_id = p_baby_id;
    IF v_count = 0 THEN
      RAISE_APPLICATION_ERROR(-20001, 'Baby not found: ' || NVL(TO_CHAR(p_baby_id), 'NULL'));
    END IF;

    OPEN p_cur FOR
      SELECT d.record_id,
             dose_label(v.vaccine_name, v.dose_number) AS dose_name,
             v.vaccine_name, v.dose_number, v.age_label, v.disease_covered, v.route, v.is_regional,
             d.scheduled_date, d.administered_date, d.status, d.is_late, d.remarks,
             CASE
               WHEN d.status = 'DONE'                                      THEN 'GREEN'
               WHEN d.status = 'OVERDUE'
                 OR (d.status = 'PENDING' AND d.scheduled_date < TRUNC(SYSDATE)) THEN 'RED'
               WHEN d.scheduled_date <= TRUNC(SYSDATE) + c_amber_window_days THEN 'AMBER'
               ELSE 'GREY'
             END AS color_bucket,
             i.batch_no, i.expiry_date AS batch_expiry,
             u.full_name AS administered_by_name
        FROM dose_records d
        JOIN vaccine_master v       ON v.vaccine_id = d.vaccine_id
        LEFT JOIN vaccine_inventory i ON i.inventory_id = d.inventory_id
        LEFT JOIN app_users u         ON u.user_id = d.administered_by
       WHERE d.baby_id = p_baby_id
       ORDER BY d.scheduled_date, v.due_age_days, d.record_id;
  END baby_timeline;

END vax_reporting_pkg;
/
SHOW ERRORS PACKAGE BODY vax_reporting_pkg

PROMPT 06_pkg_reporting.sql complete.
