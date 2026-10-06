-- ============================================================================
-- 07_procedures.sql  --  standalone procedures
-- Owner  : vaxapp
-- ============================================================================
SET DEFINE OFF
SET ECHO ON

-- ----------------------------------------------------------------------------
-- send_due_soon_alerts
-- Purpose : insert one DUE_SOON alert for every PENDING dose due from today up
--           to p_days_ahead days from now. A dose that already has a DUE_SOON
--           alert is skipped, so the daily job never duplicates alerts.
-- Params  : p_days_ahead (default 7, must be >= 0)
-- Errors  : -20014 invalid input, -20099 unexpected
-- Commits on success, rolls back to its savepoint on failure.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE send_due_soon_alerts (
  p_days_ahead IN NUMBER DEFAULT 7
)
IS
  CURSOR c_due (p_window NUMBER) IS
    SELECT d.record_id, d.baby_id, d.scheduled_date, n.clinic_id, n.full_name AS baby_name,
           dose_label(v.vaccine_name, v.dose_number) AS dose_name
      FROM dose_records d
      JOIN newborns n       ON n.baby_id = d.baby_id
      JOIN vaccine_master v ON v.vaccine_id = d.vaccine_id
     WHERE d.status = 'PENDING'
       AND d.scheduled_date BETWEEN TRUNC(SYSDATE) AND TRUNC(SYSDATE) + p_window
     ORDER BY d.scheduled_date, d.record_id;
  v_created PLS_INTEGER := 0;
  v_code    PLS_INTEGER;
  v_msg     VARCHAR2(4000);
BEGIN
  SAVEPOINT sp_due_soon;
  IF p_days_ahead IS NULL OR p_days_ahead < 0 THEN
    RAISE_APPLICATION_ERROR(-20014, 'Days ahead must be zero or more');
  END IF;

  FOR r IN c_due(p_days_ahead) LOOP
    INSERT INTO alerts (baby_id, record_id, clinic_id, alert_type, message)
    SELECT r.baby_id, r.record_id, r.clinic_id, 'DUE_SOON',
           r.dose_name || ' for ' || r.baby_name || ' is due on ' || TO_CHAR(r.scheduled_date, 'YYYY-MM-DD')
      FROM dual
     WHERE NOT EXISTS (SELECT 1 FROM alerts a
                        WHERE a.record_id = r.record_id AND a.alert_type = 'DUE_SOON');
    v_created := v_created + SQL%ROWCOUNT;
  END LOOP;

  COMMIT;
  DBMS_OUTPUT.PUT_LINE('send_due_soon_alerts: ' || v_created || ' new alert(s)');
EXCEPTION
  WHEN OTHERS THEN
    v_code := SQLCODE;
    v_msg  := SQLERRM;
    ROLLBACK TO sp_due_soon;
    IF v_code BETWEEN -20999 AND -20000 THEN
      RAISE;
    END IF;
    RAISE_APPLICATION_ERROR(-20099, 'Due-soon alerts failed: ' || v_msg);
END send_due_soon_alerts;
/
SHOW ERRORS PROCEDURE send_due_soon_alerts

PROMPT 07_procedures.sql complete.
