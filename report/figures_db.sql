-- ============================================================================
-- figures_db.sql  --  prints every DATABASE figure for the report, with banners
-- Run from the db folder, as vaxapp, AFTER run_all.sql (it needs the demo seed):
--     cd db
--     sqlplus vaxapp@localhost:1521/XEPDB1 @../report/figures_db.sql
-- Take one screenshot per "FIG-DB-nn" banner (scroll the terminal, zoom in, crop).
-- It creates two throw-away babies named FIGDEMO_*, uses them for the demos, then deletes
-- them again and puts back any stock they used, so the demo data ends as it started.
-- ============================================================================
SET DEFINE OFF VERIFY OFF FEEDBACK ON ECHO OFF
SET SERVEROUTPUT ON SIZE UNLIMITED FORMAT WRAPPED
SET LINESIZE 230 PAGESIZE 60 TRIMSPOOL ON LONG 2000

-- ------------------------------------------------------------ cleanup helper
CREATE OR REPLACE PROCEDURE fig_cleanup IS
  TYPE t_ids IS TABLE OF NUMBER INDEX BY PLS_INTEGER;
  v_dose t_ids;
BEGIN
  SELECT d.record_id BULK COLLECT INTO v_dose
    FROM dose_records d JOIN newborns n ON n.baby_id = d.baby_id
   WHERE n.full_name LIKE 'FIGDEMO\_%' ESCAPE '\';
  -- give back the doses the demo took from stock
  UPDATE vaccine_inventory i
     SET quantity = quantity + (SELECT COUNT(*) FROM dose_records d JOIN newborns n ON n.baby_id = d.baby_id
                                 WHERE d.inventory_id = i.inventory_id AND n.full_name LIKE 'FIGDEMO\_%' ESCAPE '\')
   WHERE i.inventory_id IN (SELECT d.inventory_id FROM dose_records d JOIN newborns n ON n.baby_id = d.baby_id
                             WHERE d.inventory_id IS NOT NULL AND n.full_name LIKE 'FIGDEMO\_%' ESCAPE '\');
  DELETE FROM alerts WHERE baby_id IN (SELECT baby_id FROM newborns WHERE full_name LIKE 'FIGDEMO\_%' ESCAPE '\');
  DELETE FROM dose_records WHERE baby_id IN (SELECT baby_id FROM newborns WHERE full_name LIKE 'FIGDEMO\_%' ESCAPE '\');
  FORALL i IN 1 .. v_dose.COUNT
    DELETE FROM audit_log WHERE table_name = 'DOSE_RECORDS' AND record_id = v_dose(i);
  DELETE FROM newborns WHERE full_name LIKE 'FIGDEMO\_%' ESCAPE '\';
  DELETE FROM guardians WHERE phone IN ('9111111111', '9111111112');
  COMMIT;
END fig_cleanup;
/
EXEC fig_cleanup

-- =========================================================================== tables
PROMPT
PROMPT ############################################################################
PROMPT # FIG-DB-01  Tables of the schema (with column counts)
PROMPT ############################################################################
COLUMN table_name FORMAT A22
SELECT t.table_name,
       (SELECT COUNT(*) FROM user_tab_columns c WHERE c.table_name = t.table_name) AS columns_count
  FROM user_tables t ORDER BY t.table_name;

PROMPT
PROMPT ############################################################################
PROMPT # FIG-DB-02  Constraints per table (user-named: PK, FK, UNIQUE, CHECK)
PROMPT ############################################################################
SELECT table_name,
       COUNT(CASE WHEN constraint_type = 'P' THEN 1 END) AS pk,
       COUNT(CASE WHEN constraint_type = 'R' THEN 1 END) AS fk,
       COUNT(CASE WHEN constraint_type = 'U' THEN 1 END) AS uq,
       COUNT(CASE WHEN constraint_type = 'C' THEN 1 END) AS chk
  FROM user_constraints
 WHERE constraint_name NOT LIKE 'SYS\_%' ESCAPE '\'
 GROUP BY table_name ORDER BY table_name;
COLUMN constraint_name FORMAT A28
COLUMN search_condition_vc FORMAT A90
SELECT constraint_name, search_condition_vc AS check_condition
  FROM user_constraints
 WHERE constraint_type = 'C' AND constraint_name LIKE 'CK\_%' ESCAPE '\'
   AND table_name IN ('DOSE_RECORDS', 'VACCINE_MASTER', 'APP_USERS', 'VACCINE_INVENTORY')
 ORDER BY table_name, constraint_name;

PROMPT
PROMPT ############################################################################
PROMPT # FIG-DB-03  vaccine_master: the schedule is data (NIS, 24 core + 2 JE rows)
PROMPT ############################################################################
COLUMN dose FORMAT A24
COLUMN age_label FORMAT A14
COLUMN route FORMAT A14
SELECT dose_label(vaccine_name, dose_number) AS dose, age_label, min_age_days AS min_d, due_age_days AS due_d,
       max_age_days AS max_d, route, is_regional AS je_only
  FROM vaccine_master ORDER BY due_age_days, vaccine_id;

-- ===================================================================== code objects
PROMPT
PROMPT ############################################################################
PROMPT # FIG-DB-04  PL/SQL objects and their status (all VALID)
PROMPT ############################################################################
COLUMN object_type FORMAT A14
COLUMN object_name FORMAT A30
COLUMN status FORMAT A8
SELECT object_type, object_name, status
  FROM user_objects
 WHERE object_type IN ('FUNCTION', 'PROCEDURE', 'PACKAGE', 'PACKAGE BODY', 'TRIGGER')
   AND object_name NOT LIKE 'FIG\_%' ESCAPE '\'
 ORDER BY CASE object_type WHEN 'FUNCTION' THEN 1 WHEN 'PROCEDURE' THEN 2 WHEN 'PACKAGE' THEN 3 WHEN 'PACKAGE BODY' THEN 4 ELSE 5 END,
          object_name;
PROMPT -- invalid objects (must say: no rows selected)
SELECT object_name, object_type FROM user_objects WHERE status = 'INVALID';

-- ============================================================== functions on seed data
PROMPT
PROMPT ############################################################################
PROMPT # FIG-DB-05  The four standalone functions on a seeded baby (Kabir Nair)
PROMPT ############################################################################
DECLARE
  v_baby  newborns.baby_id%TYPE;
  v_vid   vaccine_master.vaccine_id%TYPE;
  v_next  NUMBER;
  v_label VARCHAR2(120);
  v_date  DATE;
BEGIN
  SELECT baby_id INTO v_baby FROM newborns WHERE full_name = 'Kabir Nair';
  SELECT vaccine_id INTO v_vid FROM vaccine_master WHERE vaccine_name = 'bOPV' AND dose_number = 1;
  DBMS_OUTPUT.PUT_LINE('get_age_text(baby)                 = ' || get_age_text(v_baby));
  DBMS_OUTPUT.PUT_LINE('calculate_due_date(baby, bOPV-1)   = ' || TO_CHAR(calculate_due_date(v_baby, v_vid), 'YYYY-MM-DD'));
  DBMS_OUTPUT.PUT_LINE('get_coverage_pct(baby)             = ' || get_coverage_pct(v_baby) || ' %');
  v_next := get_next_due_dose(v_baby);
  SELECT dose_label(v.vaccine_name, v.dose_number) || ', scheduled ' || TO_CHAR(d.scheduled_date, 'YYYY-MM-DD') || ', status ' || d.status
    INTO v_label
    FROM dose_records d JOIN vaccine_master v ON v.vaccine_id = d.vaccine_id WHERE d.record_id = v_next;
  DBMS_OUTPUT.PUT_LINE('get_next_due_dose(baby)            = record ' || v_next || '  (' || v_label || ')');
  BEGIN
    v_date := calculate_due_date(-1, v_vid);
  EXCEPTION WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('calculate_due_date(-1, ...)        -> ' || SQLERRM);
  END;
END;
/

-- ====================================================== package: newborn_vaccination_pkg
PROMPT
PROMPT ############################################################################
PROMPT # FIG-DB-06  register_newborn (one transaction), mark_dose_administered (FEFO + stock),
PROMPT #            and the error paths: each one raises a clear ORA-200xx and changes nothing
PROMPT ############################################################################
DECLARE
  v_sunrise clinics.clinic_id%TYPE;
  v_city    clinics.clinic_id%TYPE;
  v_nurse   app_users.user_id%TYPE;
  v_baby    NUMBER;
  v_infant  NUMBER;
  v_rec     NUMBER;
  v_rec2    NUMBER;
  v_vita    NUMBER;
  v_bcg     NUMBER;
  v_inv     NUMBER;
  v_before  NUMBER;
  v_after   NUMBER;
  v_n       NUMBER;
  v_status  VARCHAR2(10);
  v_late    CHAR(1);
  v_batch   VARCHAR2(40);

  PROCEDURE p(s VARCHAR2) IS BEGIN DBMS_OUTPUT.PUT_LINE(s); END;
  FUNCTION qty(p_inv NUMBER) RETURN NUMBER IS q NUMBER;
  BEGIN SELECT quantity INTO q FROM vaccine_inventory WHERE inventory_id = p_inv; RETURN q; END;
  FUNCTION rec(p_baby NUMBER, p_name VARCHAR2, p_dose NUMBER) RETURN NUMBER IS r NUMBER;
  BEGIN
    SELECT d.record_id INTO r FROM dose_records d JOIN vaccine_master v ON v.vaccine_id = d.vaccine_id
     WHERE d.baby_id = p_baby AND v.vaccine_name = p_name AND v.dose_number = p_dose;
    RETURN r;
  END;
  FUNCTION vid(p_name VARCHAR2, p_dose NUMBER) RETURN NUMBER IS r NUMBER;
  BEGIN SELECT vaccine_id INTO r FROM vaccine_master WHERE vaccine_name = p_name AND dose_number = p_dose; RETURN r; END;
BEGIN
  SELECT clinic_id INTO v_sunrise FROM clinics WHERE clinic_name = 'Sunrise Child Health Clinic';
  SELECT clinic_id INTO v_city FROM clinics WHERE clinic_name = 'CityCare Pediatric Centre';
  SELECT user_id INTO v_nurse FROM app_users WHERE username = 'nurse1';

  p('--- register_newborn: guardian + baby + schedule in one transaction');
  newborn_vaccination_pkg.register_newborn('Fig Guardian', '9111111111', NULL, 'Fig Street 1', 'FIGDEMO_Baby', 'F',
                                           TRUNC(SYSDATE) - 70, 3.1, v_sunrise, 'N', v_baby);
  SELECT COUNT(*) INTO v_n FROM dose_records WHERE baby_id = v_baby;
  p('baby_id = ' || v_baby || ', born ' || TO_CHAR(TRUNC(SYSDATE) - 70, 'YYYY-MM-DD') || ' (70 days ago), doses scheduled = ' || v_n);
  BEGIN
    newborn_vaccination_pkg.register_newborn('Fig Guardian 2', '9111111112', NULL, 'Fig Street 1', 'FIGDEMO_Future', 'M',
                                             TRUNC(SYSDATE) + 5, 3.0, v_sunrise, 'N', v_n);
  EXCEPTION WHEN OTHERS THEN
    SELECT COUNT(*) INTO v_n FROM guardians WHERE phone = '9111111112';
    p('future date of birth  -> ' || SQLERRM);
    p('                         guardian rows left behind: ' || v_n || '  (whole transaction rolled back)');
  END;

  p(CHR(10) || '--- mark_dose_administered: BCG at Sunrise (FEFO batch, stock -1, late flag)');
  v_rec := rec(v_baby, 'BCG', 1);
  v_bcg := vid('BCG', 1);
  v_inv := vaccine_inventory_pkg.pick_batch(v_sunrise, v_bcg);
  SELECT batch_no INTO v_batch FROM vaccine_inventory WHERE inventory_id = v_inv;
  v_before := qty(v_inv);
  p('pick_batch (earliest valid expiry) = inventory ' || v_inv || ', batch ' || v_batch || ', stock before = ' || v_before);
  newborn_vaccination_pkg.mark_dose_administered(v_rec, NULL, v_sunrise, v_nurse);
  v_after := qty(v_inv);
  SELECT status, is_late INTO v_status, v_late FROM dose_records WHERE record_id = v_rec;
  SELECT COUNT(*) INTO v_n FROM alerts WHERE record_id = v_rec AND alert_type = 'LATE_DOSE';
  p('after: status = ' || v_status || ', stock = ' || v_after || ' (change ' || (v_after - v_before) || '), is_late = ' || v_late
    || ' (BCG max age is day 14, baby is 70 days old), LATE_DOSE alerts = ' || v_n);

  p(CHR(10) || '--- error paths (every one leaves dose and stock untouched)');
  BEGIN
    newborn_vaccination_pkg.mark_dose_administered(v_rec, NULL, v_sunrise, v_nurse);
  EXCEPTION WHEN OTHERS THEN p('already DONE            -> ' || SQLERRM); END;
  BEGIN
    newborn_vaccination_pkg.mark_dose_administered(rec(v_baby, 'MR', 1), NULL, v_sunrise, v_nurse);
  EXCEPTION WHEN OTHERS THEN p('too young (MR-1)        -> ' || SQLERRM); END;
  BEGIN
    newborn_vaccination_pkg.reschedule_dose(rec(v_baby, 'bOPV', 1), TRUNC(SYSDATE) - 1, 'test', v_nurse);
  EXCEPTION WHEN OTHERS THEN p('reschedule to the past  -> ' || SQLERRM); END;
  BEGIN
    newborn_vaccination_pkg.reschedule_dose(v_rec, TRUNC(SYSDATE) + 3, 'test', v_nurse);
  EXCEPTION WHEN OTHERS THEN p('reschedule a DONE dose  -> ' || SQLERRM); END;

  newborn_vaccination_pkg.register_newborn('Fig Guardian', '9111111111', NULL, 'Fig Street 1', 'FIGDEMO_Infant', 'M',
                                           TRUNC(SYSDATE) - 300, 3.0, v_city, 'N', v_infant);
  v_vita := vid('Vitamin A', 1);
  v_rec2 := rec(v_infant, 'Vitamin A', 1);
  SELECT COUNT(*) INTO v_n FROM vaccine_inventory WHERE clinic_id = v_city AND vaccine_id = v_vita;
  BEGIN
    newborn_vaccination_pkg.mark_dose_administered(v_rec2, NULL, v_city, v_nurse);
  EXCEPTION WHEN OTHERS THEN
    SELECT status INTO v_status FROM dose_records WHERE record_id = v_rec2;
    p('out of stock (CityCare has ' || v_n || ' Vitamin A batches) -> ' || SQLERRM);
    p('                         the dose is still ' || v_status || ', nothing was deducted');
  END;
  newborn_vaccination_pkg.set_actor(NULL);
END;
/

-- ====================================================================== triggers
PROMPT
PROMPT ############################################################################
PROMPT # FIG-DB-07  Triggers: status guard (DONE -> PENDING blocked) and the audit row
PROMPT #            written for the BCG dose above (old status, new status, who)
PROMPT ############################################################################
DECLARE
  v_rec NUMBER;
BEGIN
  SELECT d.record_id INTO v_rec FROM dose_records d JOIN newborns n ON n.baby_id = d.baby_id
   JOIN vaccine_master v ON v.vaccine_id = d.vaccine_id
   WHERE n.full_name = 'FIGDEMO_Baby' AND v.vaccine_name = 'BCG';
  BEGIN
    UPDATE dose_records SET status = 'PENDING', administered_date = NULL WHERE record_id = v_rec;
  EXCEPTION WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('trg_dose_status_guard: ' || SUBSTR(SQLERRM, 1, INSTR(SQLERRM || CHR(10), CHR(10)) - 1));
  END;
  ROLLBACK;
END;
/
COLUMN action FORMAT A8
COLUMN old_value FORMAT A72
COLUMN new_value FORMAT A80
COLUMN changed_by FORMAT A16
SELECT a.audit_id, a.action, a.old_value, a.new_value, a.changed_by
  FROM audit_log a
 WHERE a.table_name = 'DOSE_RECORDS'
   AND a.record_id = (SELECT d.record_id FROM dose_records d JOIN newborns n ON n.baby_id = d.baby_id
                        JOIN vaccine_master v ON v.vaccine_id = d.vaccine_id
                       WHERE n.full_name = 'FIGDEMO_Baby' AND v.vaccine_name = 'BCG')
 ORDER BY a.audit_id;

-- ====================================================== overdue sweep + alert triggers
PROMPT
PROMPT ############################################################################
PROMPT # FIG-DB-08  refresh_overdue_status (cursor FOR loop) flips past-due doses; the alert
PROMPT #            trigger raises ONE OVERDUE alert per dose, even if the sweep runs twice
PROMPT ############################################################################
DECLARE
  v_before NUMBER; v_after NUMBER; v_over NUMBER; v_alerts1 NUMBER; v_alerts2 NUMBER;
  v_baby NUMBER;
BEGIN
  SELECT baby_id INTO v_baby FROM newborns WHERE full_name = 'FIGDEMO_Baby';
  SELECT COUNT(*) INTO v_before FROM dose_records WHERE baby_id = v_baby AND status = 'PENDING' AND scheduled_date < TRUNC(SYSDATE);
  newborn_vaccination_pkg.refresh_overdue_status;
  SELECT COUNT(*) INTO v_after FROM dose_records WHERE baby_id = v_baby AND status = 'PENDING' AND scheduled_date < TRUNC(SYSDATE);
  SELECT COUNT(*) INTO v_over FROM dose_records WHERE baby_id = v_baby AND status = 'OVERDUE';
  SELECT COUNT(*) INTO v_alerts1 FROM alerts WHERE baby_id = v_baby AND alert_type = 'OVERDUE';
  newborn_vaccination_pkg.refresh_overdue_status;
  SELECT COUNT(*) INTO v_alerts2 FROM alerts WHERE baby_id = v_baby AND alert_type = 'OVERDUE';
  DBMS_OUTPUT.PUT_LINE('past-due PENDING doses before the sweep = ' || v_before || ', after = ' || v_after || ', now OVERDUE = ' || v_over);
  DBMS_OUTPUT.PUT_LINE('OVERDUE alerts after sweep 1 = ' || v_alerts1 || ', after sweep 2 = ' || v_alerts2 || '  (no duplicates)');
END;
/

-- ====================================================================== REF cursors
PROMPT
PROMPT ############################################################################
PROMPT # FIG-DB-09  vax_reporting_pkg: REF CURSOR outputs used by the API
PROMPT ############################################################################
COLUMN dose_name FORMAT A22
COLUMN vaccine_name FORMAT A12
COLUMN disease_covered FORMAT A26
COLUMN route FORMAT A13
COLUMN remarks FORMAT A12
COLUMN batch_no FORMAT A9
COLUMN administered_by_name FORMAT A12
COLUMN baby_name FORMAT A15
COLUMN guardian_name FORMAT A14
COLUMN guardian_phone FORMAT A11
COLUMN clinic_name FORMAT A27
COLUMN city FORMAT A11
COLUMN color_bucket FORMAT A6
VARIABLE cur REFCURSOR
PROMPT -- dashboard_summary(NULL = all clinics)
EXEC vax_reporting_pkg.dashboard_summary(NULL, :cur)
PRINT cur
PROMPT -- clinic_coverage (aggregate + RANK analytic)
EXEC vax_reporting_pkg.clinic_coverage(:cur)
PRINT cur
PROMPT -- upcoming_list(NULL, 7)
EXEC vax_reporting_pkg.upcoming_list(NULL, 7, :cur)
PRINT cur
PROMPT -- overdue_list(Sunrise clinic)
VARIABLE clinic NUMBER
BEGIN SELECT clinic_id INTO :clinic FROM clinics WHERE clinic_name = 'Sunrise Child Health Clinic'; END;
/
EXEC vax_reporting_pkg.overdue_list(:clinic, :cur)
PRINT cur

PROMPT
PROMPT ############################################################################
PROMPT # FIG-DB-10  baby_timeline REF CURSOR: every dose with status, colour bucket and batch
PROMPT ############################################################################
VARIABLE bid NUMBER
BEGIN SELECT baby_id INTO :bid FROM newborns WHERE full_name = 'Kabir Nair'; END;
/
SET LINESIZE 260
COLUMN disease_covered NOPRINT
COLUMN route NOPRINT
COLUMN age_label FORMAT A12
COLUMN vaccine_name NOPRINT
COLUMN dose_number NOPRINT
COLUMN is_regional NOPRINT
COLUMN remarks NOPRINT
COLUMN batch_expiry NOPRINT
EXEC vax_reporting_pkg.baby_timeline(:bid, :cur)
PRINT cur
COLUMN disease_covered CLEAR
COLUMN route CLEAR
COLUMN vaccine_name CLEAR
COLUMN dose_number CLEAR
COLUMN is_regional CLEAR
COLUMN remarks CLEAR
COLUMN batch_expiry CLEAR
SET LINESIZE 230

-- ======================================================================== alerts, audit
PROMPT
PROMPT ############################################################################
PROMPT # FIG-DB-11  Alerts produced by triggers and sweeps (count by type, then the latest two of each)
PROMPT ############################################################################
SELECT alert_type, COUNT(*) AS alerts, SUM(CASE WHEN is_read = 'N' THEN 1 END) AS unread
  FROM alerts GROUP BY alert_type ORDER BY alert_type;
COLUMN message FORMAT A95
SELECT alert_id, alert_type, message
  FROM (SELECT alert_id, alert_type, message,
               ROW_NUMBER() OVER (PARTITION BY alert_type ORDER BY alert_id DESC) AS rn
          FROM alerts)
 WHERE rn <= 2
 ORDER BY alert_type, alert_id DESC;

PROMPT
PROMPT ############################################################################
PROMPT # FIG-DB-12  audit_log: latest updates made by people (actor comes from set_actor / CLIENT_INFO;
PROMPT #            scheduler and plain SQL sessions are recorded as VAXAPP and left out here)
PROMPT ############################################################################
COLUMN table_name FORMAT A18
SELECT audit_id, table_name, record_id, action, changed_by,
       TO_CHAR(changed_at, 'YYYY-MM-DD HH24:MI:SS') AS changed_at
  FROM audit_log WHERE changed_by <> 'VAXAPP' AND action = 'UPDATE' ORDER BY audit_id DESC FETCH FIRST 10 ROWS ONLY;

-- ======================================================================= scheduler
PROMPT
PROMPT ############################################################################
PROMPT # FIG-DB-13  DBMS_SCHEDULER job JOB_DAILY_VAX_SWEEP: definition and a run
PROMPT ############################################################################
COLUMN job_name FORMAT A22
COLUMN repeat_interval FORMAT A44
SELECT job_name, enabled, repeat_interval, TO_CHAR(next_run_date, 'YYYY-MM-DD HH24:MI') AS next_run FROM user_scheduler_jobs;
EXEC DBMS_SCHEDULER.RUN_JOB('JOB_DAILY_VAX_SWEEP', use_current_session => TRUE)
COLUMN status FORMAT A10
SELECT job_name, status, error# AS error_no, TO_CHAR(log_date, 'YYYY-MM-DD HH24:MI:SS') AS ran_at
  FROM user_scheduler_job_run_details ORDER BY log_date DESC FETCH FIRST 3 ROWS ONLY;

-- ======================================================================= tests
PROMPT
PROMPT ############################################################################
PROMPT # FIG-DB-14  Automated tests: see the test_log output of 11_tests.sql (run it separately)
PROMPT ############################################################################
SELECT result, COUNT(*) AS cases FROM test_log GROUP BY result ORDER BY result;

-- ====================================================================== tidy up
EXEC fig_cleanup
DROP PROCEDURE fig_cleanup;
PROMPT
PROMPT figures_db.sql finished: the FIGDEMO_* data was removed and the stock it used was put back.
