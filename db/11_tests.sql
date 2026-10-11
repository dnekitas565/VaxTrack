-- ============================================================================
-- 11_tests.sql  --  automated test harness (31 cases) -> table test_log
-- Owner  : vaxapp.  Run after 01..10 (TC-R1 reads the demo seed).
-- Re-runnable: clears test_log, removes its own TEST_ data before every case
--   and again at the end. Helper procedures tc_* are created here and dropped
--   at the end. tc_log is AUTONOMOUS_TRANSACTION so a result survives the
--   rollbacks that some cases deliberately trigger.
-- Test data: clinic TEST_CLINIC (isolated stock), babies TEST_*, guardians named TEST_*, logins testu_*.
-- ============================================================================
SET DEFINE OFF
SET SERVEROUTPUT ON SIZE UNLIMITED
SET ECHO OFF
SET FEEDBACK ON

DELETE FROM test_log;
COMMIT;

-- ---------------------------------------------------------------- helpers
CREATE OR REPLACE PROCEDURE tc_log (
  p_code IN VARCHAR2, p_desc IN VARCHAR2, p_expected IN VARCHAR2, p_actual IN VARCHAR2
) IS
  PRAGMA AUTONOMOUS_TRANSACTION;
BEGIN
  INSERT INTO test_log (tc_code, description, expected, actual, result)
  VALUES (p_code, p_desc, p_expected, p_actual,
          CASE WHEN p_expected = p_actual THEN 'PASS' ELSE 'FAIL' END);
  COMMIT;
END tc_log;
/

CREATE OR REPLACE PROCEDURE tc_cleanup IS
  TYPE t_ids IS TABLE OF NUMBER INDEX BY PLS_INTEGER;
  v_dose t_ids;
  v_inv  t_ids;
BEGIN
  SELECT d.record_id BULK COLLECT INTO v_dose
    FROM dose_records d JOIN newborns n ON n.baby_id = d.baby_id
   WHERE n.full_name LIKE 'TEST\_%' ESCAPE '\';
  SELECT i.inventory_id BULK COLLECT INTO v_inv
    FROM vaccine_inventory i JOIN clinics c ON c.clinic_id = i.clinic_id
   WHERE c.clinic_name = 'TEST_CLINIC';

  DELETE FROM alerts
   WHERE baby_id IN (SELECT baby_id FROM newborns WHERE full_name LIKE 'TEST\_%' ESCAPE '\')
      OR clinic_id IN (SELECT clinic_id FROM clinics WHERE clinic_name = 'TEST_CLINIC');
  DELETE FROM dose_records
   WHERE baby_id IN (SELECT baby_id FROM newborns WHERE full_name LIKE 'TEST\_%' ESCAPE '\');
  FORALL i IN 1 .. v_dose.COUNT
    DELETE FROM audit_log WHERE table_name = 'DOSE_RECORDS' AND record_id = v_dose(i);
  FORALL i IN 1 .. v_inv.COUNT
    DELETE FROM audit_log WHERE table_name = 'VACCINE_INVENTORY' AND record_id = v_inv(i);
  DELETE FROM vaccine_inventory
   WHERE clinic_id IN (SELECT clinic_id FROM clinics WHERE clinic_name = 'TEST_CLINIC');
  DELETE FROM newborns WHERE full_name LIKE 'TEST\_%' ESCAPE '\';
  -- accounts created by the account tests (parent logins are named after the guardian: test.guardian)
  DELETE FROM app_users
   WHERE username LIKE 'testu\_%' ESCAPE '\' OR username LIKE 'testu.%' OR username LIKE 'test.guardian%'
      OR guardian_id IN (SELECT guardian_id FROM guardians WHERE full_name LIKE 'TEST\_%' ESCAPE '\');
  DELETE FROM audit_log
   WHERE table_name = 'APP_USERS'
     AND (new_value LIKE 'username=testu\_%' ESCAPE '\' OR new_value LIKE 'username=testu.%'
          OR new_value LIKE 'username=test.guardian%');
  DELETE FROM audit_log
   WHERE table_name = 'NEWBORNS'
     AND (old_value LIKE 'name=TEST\_%' ESCAPE '\' OR new_value LIKE 'name=TEST\_%' ESCAPE '\');
  DELETE FROM guardians WHERE full_name LIKE 'TEST\_%' ESCAPE '\';
  DELETE FROM clinics WHERE clinic_name = 'TEST_CLINIC';
  COMMIT;
END tc_cleanup;
/

CREATE OR REPLACE FUNCTION tc_clinic RETURN NUMBER IS
  v_id clinics.clinic_id%TYPE;
BEGIN
  SELECT clinic_id INTO v_id FROM clinics WHERE clinic_name = 'TEST_CLINIC';
  RETURN v_id;
EXCEPTION
  WHEN NO_DATA_FOUND THEN
    INSERT INTO clinics (clinic_name, city, phone) VALUES ('TEST_CLINIC', 'Testville', '0000000000')
    RETURNING clinic_id INTO v_id;
    COMMIT;
    RETURN v_id;
END tc_clinic;
/

CREATE OR REPLACE FUNCTION tc_user RETURN NUMBER IS
  v_id app_users.user_id%TYPE;
BEGIN
  SELECT user_id INTO v_id FROM app_users WHERE username = 'nurse1';
  RETURN v_id;
END tc_user;
/

CREATE OR REPLACE FUNCTION tc_admin RETURN NUMBER IS
  v_id app_users.user_id%TYPE;
BEGIN
  SELECT user_id INTO v_id FROM app_users WHERE username = 'admin';
  RETURN v_id;
END tc_admin;
/

CREATE OR REPLACE FUNCTION tc_vid (p_name VARCHAR2, p_dose NUMBER) RETURN NUMBER IS
  v_id vaccine_master.vaccine_id%TYPE;
BEGIN
  SELECT vaccine_id INTO v_id FROM vaccine_master WHERE vaccine_name = p_name AND dose_number = p_dose;
  RETURN v_id;
END tc_vid;
/

-- registers a baby (and guardian) of the given age in days at TEST_CLINIC; returns baby_id
CREATE OR REPLACE FUNCTION tc_baby (
  p_name VARCHAR2, p_days_old NUMBER, p_phone VARCHAR2, p_je VARCHAR2 DEFAULT 'N'
) RETURN NUMBER IS
  v_baby NUMBER;
BEGIN
  newborn_vaccination_pkg.register_newborn('TEST_Guardian', p_phone, NULL, 'TEST Street 1', p_name, 'F',
                                           TRUNC(SYSDATE) - p_days_old, 3.0, tc_clinic, p_je, v_baby);
  RETURN v_baby;
END tc_baby;
/

CREATE OR REPLACE PROCEDURE tc_stock (
  p_vname VARCHAR2, p_dose NUMBER, p_batch VARCHAR2, p_expiry_days NUMBER, p_qty NUMBER
) IS
BEGIN
  vaccine_inventory_pkg.restock(tc_clinic, tc_vid(p_vname, p_dose), p_batch,
                                TRUNC(SYSDATE) + p_expiry_days, p_qty, tc_user);
END tc_stock;
/

CREATE OR REPLACE FUNCTION tc_rec (p_baby NUMBER, p_vname VARCHAR2, p_dose NUMBER) RETURN NUMBER IS
  v_id dose_records.record_id%TYPE;
BEGIN
  SELECT record_id INTO v_id FROM dose_records WHERE baby_id = p_baby AND vaccine_id = tc_vid(p_vname, p_dose);
  RETURN v_id;
END tc_rec;
/

CREATE OR REPLACE FUNCTION tc_stock_qty (p_batch VARCHAR2) RETURN NUMBER IS
  v_qty NUMBER;
BEGIN
  SELECT quantity INTO v_qty FROM vaccine_inventory WHERE clinic_id = tc_clinic AND batch_no = p_batch;
  RETURN v_qty;
END tc_stock_qty;
/
SHOW ERRORS

PROMPT ===== running test cases =====

-- ============================ FUNCTIONS ============================
-- TC-F1 ------------------------------------------------------------
DECLARE
  v_baby NUMBER; v_exp VARCHAR2(200); v_act VARCHAR2(200);
BEGIN
  tc_cleanup;
  v_baby := tc_baby('TEST_F1', 100, '9000000001');
  v_exp  := TO_CHAR(TRUNC(SYSDATE) - 100 + 42, 'YYYY-MM-DD');
  v_act  := TO_CHAR(calculate_due_date(v_baby, tc_vid('bOPV', 1)), 'YYYY-MM-DD');
  tc_log('TC-F1', 'calculate_due_date: DOB + 42-day vaccine (bOPV-1) gives DOB + 42', v_exp, v_act);
EXCEPTION WHEN OTHERS THEN
  tc_log('TC-F1', 'calculate_due_date: DOB + 42-day vaccine (bOPV-1) gives DOB + 42', v_exp, 'ERROR ' || SQLERRM);
END;
/

-- TC-F2 ------------------------------------------------------------
DECLARE
  v_act VARCHAR2(200); v_date DATE;
BEGIN
  tc_cleanup;
  BEGIN
    v_date := calculate_due_date(-999, tc_vid('bOPV', 1));
    v_act := 'no error';
  EXCEPTION WHEN OTHERS THEN
    v_act := TO_CHAR(SQLCODE);
  END;
  tc_log('TC-F2', 'calculate_due_date with an unknown baby raises -20001', '-20001', v_act);
END;
/

-- TC-F3 ------------------------------------------------------------
DECLARE
  v_baby NUMBER; v_before NUMBER; v_after NUMBER; v_exp VARCHAR2(200); v_act VARCHAR2(200);
BEGIN
  tc_cleanup;
  v_exp  := '0 -> 12.5';
  v_baby := tc_baby('TEST_F3', 60, '9000000003');
  tc_stock('BCG', 1, 'TEST-F3A', 100, 10);
  tc_stock('bOPV', 0, 'TEST-F3B', 100, 10);
  tc_stock('Hepatitis B Birth dose', 1, 'TEST-F3C', 100, 10);
  v_before := get_coverage_pct(v_baby);
  newborn_vaccination_pkg.mark_dose_administered(tc_rec(v_baby, 'BCG', 1), NULL, tc_clinic, tc_user);
  newborn_vaccination_pkg.mark_dose_administered(tc_rec(v_baby, 'bOPV', 0), NULL, tc_clinic, tc_user);
  newborn_vaccination_pkg.mark_dose_administered(tc_rec(v_baby, 'Hepatitis B Birth dose', 1), NULL, tc_clinic, tc_user);
  v_after := get_coverage_pct(v_baby);
  v_act := v_before || ' -> ' || v_after;
  tc_log('TC-F3', 'get_coverage_pct: 0 for a new baby, 3 of 24 doses done = 12.5', v_exp, v_act);
EXCEPTION WHEN OTHERS THEN
  tc_log('TC-F3', 'get_coverage_pct: 0 for a new baby, 3 of 24 doses done = 12.5', v_exp, 'ERROR ' || SQLERRM);
END;
/

-- TC-F4 ------------------------------------------------------------
DECLARE
  v_baby NUMBER; v_next NUMBER; v_exp VARCHAR2(200); v_act VARCHAR2(200);
  v_sched DATE; v_status VARCHAR2(10); v_min DATE;
BEGIN
  tc_cleanup;
  v_baby := tc_baby('TEST_F4', 60, '9000000004');
  tc_stock('BCG', 1, 'TEST-F4A', 100, 10);
  newborn_vaccination_pkg.mark_dose_administered(tc_rec(v_baby, 'BCG', 1), NULL, tc_clinic, tc_user);
  SELECT MIN(scheduled_date) INTO v_min FROM dose_records WHERE baby_id = v_baby AND status <> 'DONE';
  v_exp := TO_CHAR(v_min, 'YYYY-MM-DD') || '|not DONE';
  v_next := get_next_due_dose(v_baby);
  SELECT scheduled_date, status INTO v_sched, v_status FROM dose_records WHERE record_id = v_next;
  v_act := TO_CHAR(v_sched, 'YYYY-MM-DD') || '|' || CASE WHEN v_status = 'DONE' THEN 'DONE' ELSE 'not DONE' END;
  tc_log('TC-F4', 'get_next_due_dose returns the earliest dose that is not DONE', v_exp, v_act);
EXCEPTION WHEN OTHERS THEN
  tc_log('TC-F4', 'get_next_due_dose returns the earliest dose that is not DONE', v_exp, 'ERROR ' || SQLERRM);
END;
/

-- ============================ PACKAGE: newborn ============================
-- TC-P1 ------------------------------------------------------------
DECLARE
  v_b1 NUMBER; v_b2 NUMBER; v_n1 NUMBER; v_n2 NUMBER; v_babies NUMBER; v_exp VARCHAR2(200); v_act VARCHAR2(200);
BEGIN
  tc_cleanup;
  v_exp := '24/26/baby=1';
  v_b1 := tc_baby('TEST_P1', 5, '9000000011');
  v_b2 := tc_baby('TEST_P1J', 5, '9000000012', 'Y');
  SELECT COUNT(*) INTO v_n1 FROM dose_records WHERE baby_id = v_b1;
  SELECT COUNT(*) INTO v_n2 FROM dose_records WHERE baby_id = v_b2;
  SELECT COUNT(*) INTO v_babies FROM newborns WHERE baby_id = v_b1;
  v_act := v_n1 || '/' || v_n2 || '/baby=' || v_babies;
  tc_log('TC-P1', 'register_newborn creates the baby and a full schedule (24; 26 with JE)', v_exp, v_act);
EXCEPTION WHEN OTHERS THEN
  tc_log('TC-P1', 'register_newborn creates the baby and a full schedule (24; 26 with JE)', v_exp, 'ERROR ' || SQLERRM);
END;
/

-- TC-P2 ------------------------------------------------------------
DECLARE
  v_baby NUMBER; v_n1 NUMBER; v_n2 NUMBER; v_exp VARCHAR2(200); v_act VARCHAR2(200);
BEGIN
  tc_cleanup;
  v_exp := '24 -> 24';
  v_baby := tc_baby('TEST_P2', 5, '9000000021');
  SELECT COUNT(*) INTO v_n1 FROM dose_records WHERE baby_id = v_baby;
  newborn_vaccination_pkg.generate_schedule(v_baby);
  newborn_vaccination_pkg.generate_schedule(v_baby);
  COMMIT;
  SELECT COUNT(*) INTO v_n2 FROM dose_records WHERE baby_id = v_baby;
  v_act := v_n1 || ' -> ' || v_n2;
  tc_log('TC-P2', 'generate_schedule run twice more creates no duplicate doses', v_exp, v_act);
EXCEPTION WHEN OTHERS THEN
  tc_log('TC-P2', 'generate_schedule run twice more creates no duplicate doses', v_exp, 'ERROR ' || SQLERRM);
END;
/

-- TC-P3 ------------------------------------------------------------
DECLARE
  v_baby NUMBER; v_code VARCHAR2(20); v_guardians NUMBER; v_babies NUMBER;
  v_exp VARCHAR2(200); v_act VARCHAR2(200);
BEGIN
  tc_cleanup;
  v_exp := '-20003|guardians=0|babies=0';
  BEGIN
    newborn_vaccination_pkg.register_newborn('TEST_Guardian', '9000000031', NULL, 'TEST Street 1', 'TEST_P3', 'F',
                                             TRUNC(SYSDATE) + 5, 3.0, tc_clinic, 'N', v_baby);
    v_code := 'no error';
  EXCEPTION WHEN OTHERS THEN
    v_code := TO_CHAR(SQLCODE);
  END;
  SELECT COUNT(*) INTO v_guardians FROM guardians WHERE phone = '9000000031';
  SELECT COUNT(*) INTO v_babies FROM newborns WHERE full_name = 'TEST_P3';
  v_act := v_code || '|guardians=' || v_guardians || '|babies=' || v_babies;
  tc_log('TC-P3', 'register_newborn with a future DOB fails and rolls back guardian + baby', v_exp, v_act);
EXCEPTION WHEN OTHERS THEN
  tc_log('TC-P3', 'register_newborn with a future DOB fails and rolls back guardian + baby', v_exp, 'ERROR ' || SQLERRM);
END;
/

-- TC-P4 ------------------------------------------------------------
DECLARE
  v_baby NUMBER; v_rec NUMBER; v_before NUMBER; v_after NUMBER; v_status VARCHAR2(10);
  v_exp VARCHAR2(200); v_act VARCHAR2(200);
BEGIN
  tc_cleanup;
  v_exp := 'DONE|stock 5 -> 4';
  v_baby := tc_baby('TEST_P4', 60, '9000000041');
  tc_stock('BCG', 1, 'TEST-P4', 100, 5);
  v_rec := tc_rec(v_baby, 'BCG', 1);
  v_before := tc_stock_qty('TEST-P4');
  newborn_vaccination_pkg.mark_dose_administered(v_rec, NULL, tc_clinic, tc_user);
  v_after := tc_stock_qty('TEST-P4');
  SELECT status INTO v_status FROM dose_records WHERE record_id = v_rec;
  v_act := v_status || '|stock ' || v_before || ' -> ' || v_after;
  tc_log('TC-P4', 'mark_dose_administered sets DONE and takes exactly 1 from stock', v_exp, v_act);
EXCEPTION WHEN OTHERS THEN
  tc_log('TC-P4', 'mark_dose_administered sets DONE and takes exactly 1 from stock', v_exp, 'ERROR ' || SQLERRM);
END;
/

-- TC-P5 ------------------------------------------------------------
DECLARE
  v_baby NUMBER; v_rec NUMBER; v_act VARCHAR2(200);
BEGIN
  tc_cleanup;
  v_baby := tc_baby('TEST_P5', 60, '9000000051');
  tc_stock('BCG', 1, 'TEST-P5', 100, 5);
  v_rec := tc_rec(v_baby, 'BCG', 1);
  newborn_vaccination_pkg.mark_dose_administered(v_rec, NULL, tc_clinic, tc_user);
  BEGIN
    newborn_vaccination_pkg.mark_dose_administered(v_rec, NULL, tc_clinic, tc_user);
    v_act := 'no error';
  EXCEPTION WHEN OTHERS THEN
    v_act := TO_CHAR(SQLCODE) || '|stock=' || tc_stock_qty('TEST-P5');
  END;
  tc_log('TC-P5', 'marking an already DONE dose is rejected (-20005), stock unchanged', '-20005|stock=4', v_act);
EXCEPTION WHEN OTHERS THEN
  tc_log('TC-P5', 'marking an already DONE dose is rejected (-20005), stock unchanged', '-20005|stock=4', 'ERROR ' || SQLERRM);
END;
/

-- TC-P6 ------------------------------------------------------------
DECLARE
  v_baby NUMBER; v_rec NUMBER; v_code VARCHAR2(20); v_status VARCHAR2(10); v_given DATE;
  v_exp VARCHAR2(200); v_act VARCHAR2(200);
BEGIN
  tc_cleanup;
  v_exp := '-20009|PENDING|given=none|stock=0';
  v_baby := tc_baby('TEST_P6', 60, '9000000061');
  tc_stock('fIPV', 1, 'TEST-P6', 100, 5);
  UPDATE vaccine_inventory SET quantity = 0 WHERE clinic_id = tc_clinic AND batch_no = 'TEST-P6';
  COMMIT;
  v_rec := tc_rec(v_baby, 'fIPV', 1);
  BEGIN
    newborn_vaccination_pkg.mark_dose_administered(v_rec, NULL, tc_clinic, tc_user);
    v_code := 'no error';
  EXCEPTION WHEN OTHERS THEN
    v_code := TO_CHAR(SQLCODE);
  END;
  SELECT status, administered_date INTO v_status, v_given FROM dose_records WHERE record_id = v_rec;
  v_act := v_code || '|' || v_status || '|given=' || NVL(TO_CHAR(v_given, 'YYYY-MM-DD'), 'none')
           || '|stock=' || tc_stock_qty('TEST-P6');
  tc_log('TC-P6', 'out-of-stock: error, dose stays PENDING, stock unchanged', v_exp, v_act);
EXCEPTION WHEN OTHERS THEN
  tc_log('TC-P6', 'out-of-stock: error, dose stays PENDING, stock unchanged', v_exp, 'ERROR ' || SQLERRM);
END;
/

-- TC-P7 ------------------------------------------------------------
DECLARE
  v_baby NUMBER; v_rec NUMBER; v_code VARCHAR2(20); v_status VARCHAR2(10);
  v_exp VARCHAR2(200); v_act VARCHAR2(200);
BEGIN
  tc_cleanup;
  v_exp := '-20008|PENDING|stock=5';
  v_baby := tc_baby('TEST_P7', 10, '9000000071');
  tc_stock('bOPV', 1, 'TEST-P7', 100, 5);
  v_rec := tc_rec(v_baby, 'bOPV', 1);
  BEGIN
    newborn_vaccination_pkg.mark_dose_administered(v_rec, NULL, tc_clinic, tc_user);
    v_code := 'no error';
  EXCEPTION WHEN OTHERS THEN
    v_code := TO_CHAR(SQLCODE);
  END;
  SELECT status INTO v_status FROM dose_records WHERE record_id = v_rec;
  v_act := v_code || '|' || v_status || '|stock=' || tc_stock_qty('TEST-P7');
  tc_log('TC-P7', 'administering before min_age_days (10-day-old, 6-week dose) is rejected', v_exp, v_act);
EXCEPTION WHEN OTHERS THEN
  tc_log('TC-P7', 'administering before min_age_days (10-day-old, 6-week dose) is rejected', v_exp, 'ERROR ' || SQLERRM);
END;
/

-- TC-P8 ------------------------------------------------------------
DECLARE
  v_baby NUMBER; v_rec NUMBER; v_late CHAR(1); v_status VARCHAR2(10); v_alerts NUMBER;
  v_exp VARCHAR2(200); v_act VARCHAR2(200);
BEGIN
  tc_cleanup;
  v_exp := 'DONE|late=Y|LATE_DOSE alerts=1';
  v_baby := tc_baby('TEST_P8', 100, '9000000081');
  tc_stock('bOPV', 1, 'TEST-P8', 100, 5);
  v_rec := tc_rec(v_baby, 'bOPV', 1);
  newborn_vaccination_pkg.mark_dose_administered(v_rec, NULL, tc_clinic, tc_user);
  SELECT status, is_late INTO v_status, v_late FROM dose_records WHERE record_id = v_rec;
  SELECT COUNT(*) INTO v_alerts FROM alerts WHERE record_id = v_rec AND alert_type = 'LATE_DOSE';
  v_act := v_status || '|late=' || v_late || '|LATE_DOSE alerts=' || v_alerts;
  tc_log('TC-P8', 'dose given past max_age_days sets is_late = Y and raises a LATE_DOSE alert', v_exp, v_act);
EXCEPTION WHEN OTHERS THEN
  tc_log('TC-P8', 'dose given past max_age_days sets is_late = Y and raises a LATE_DOSE alert', v_exp, 'ERROR ' || SQLERRM);
END;
/

-- TC-P9 ------------------------------------------------------------
DECLARE
  v_baby NUMBER; v_baby2 NUMBER; v_rec NUMBER; v_used VARCHAR2(40); v_old NUMBER; v_code VARCHAR2(20);
  v_exp VARCHAR2(200); v_act VARCHAR2(200);
BEGIN
  tc_cleanup;
  v_exp := 'TEST-NEAR|expired batch untouched=10|expired only=-20009';
  v_baby := tc_baby('TEST_P9', 60, '9000000091');
  tc_stock('BCG', 1, 'TEST-FAR', 200, 10);
  tc_stock('BCG', 1, 'TEST-NEAR', 50, 10);
  -- an expired batch cannot be created through restock, so insert it directly
  INSERT INTO vaccine_inventory (clinic_id, vaccine_id, batch_no, expiry_date, quantity)
  VALUES (tc_clinic, tc_vid('BCG', 1), 'TEST-OLD', TRUNC(SYSDATE) - 5, 10);
  COMMIT;
  v_rec := tc_rec(v_baby, 'BCG', 1);
  newborn_vaccination_pkg.mark_dose_administered(v_rec, NULL, tc_clinic, tc_user);
  SELECT i.batch_no INTO v_used FROM dose_records d JOIN vaccine_inventory i ON i.inventory_id = d.inventory_id
   WHERE d.record_id = v_rec;
  v_old := tc_stock_qty('TEST-OLD');

  -- second vaccine that only has an expired batch: nothing may be given
  v_baby2 := tc_baby('TEST_P9B', 60, '9000000092');
  INSERT INTO vaccine_inventory (clinic_id, vaccine_id, batch_no, expiry_date, quantity)
  VALUES (tc_clinic, tc_vid('bOPV', 0), 'TEST-OLD2', TRUNC(SYSDATE) - 1, 10);
  COMMIT;
  BEGIN
    newborn_vaccination_pkg.mark_dose_administered(tc_rec(v_baby2, 'bOPV', 0), NULL, tc_clinic, tc_user);
    v_code := 'no error';
  EXCEPTION WHEN OTHERS THEN
    v_code := TO_CHAR(SQLCODE);
  END;
  v_act := v_used || '|expired batch untouched=' || v_old || '|expired only=' || v_code;
  tc_log('TC-P9', 'FEFO: earliest non-expired batch is used, expired batches are skipped', v_exp, v_act);
EXCEPTION WHEN OTHERS THEN
  tc_log('TC-P9', 'FEFO: earliest non-expired batch is used, expired batches are skipped', v_exp, 'ERROR ' || SQLERRM);
END;
/

-- TC-P10 -----------------------------------------------------------
DECLARE
  v_baby NUMBER; v_done NUMBER; v_pend NUMBER; v_dob DATE; v_sched DATE;
  r_done VARCHAR2(20); r_past VARCHAR2(20); r_window VARCHAR2(20); r_ok VARCHAR2(20);
  v_exp VARCHAR2(200); v_act VARCHAR2(200);
BEGIN
  tc_cleanup;
  v_exp := 'DONE=-20010|PAST=-20011|WINDOW=-20012|OK=1';
  v_baby := tc_baby('TEST_P10', 3, '9000000101');
  tc_stock('BCG', 1, 'TEST-P10', 100, 5);
  v_done := tc_rec(v_baby, 'BCG', 1);
  v_pend := tc_rec(v_baby, 'bOPV', 1);
  newborn_vaccination_pkg.mark_dose_administered(v_done, NULL, tc_clinic, tc_user);
  SELECT date_of_birth INTO v_dob FROM newborns WHERE baby_id = v_baby;

  BEGIN
    newborn_vaccination_pkg.reschedule_dose(v_done, TRUNC(SYSDATE) + 20, 'test', tc_user);
    r_done := 'no error';
  EXCEPTION WHEN OTHERS THEN r_done := TO_CHAR(SQLCODE); END;
  BEGIN
    newborn_vaccination_pkg.reschedule_dose(v_pend, TRUNC(SYSDATE) - 1, 'test', tc_user);
    r_past := 'no error';
  EXCEPTION WHEN OTHERS THEN r_past := TO_CHAR(SQLCODE); END;
  BEGIN
    newborn_vaccination_pkg.reschedule_dose(v_pend, TRUNC(SYSDATE) + 1, 'test', tc_user);
    r_window := 'no error';
  EXCEPTION WHEN OTHERS THEN r_window := TO_CHAR(SQLCODE); END;

  newborn_vaccination_pkg.reschedule_dose(v_pend, TRUNC(v_dob) + 50, 'parent asked for a later date', tc_user);
  SELECT scheduled_date INTO v_sched FROM dose_records WHERE record_id = v_pend;
  r_ok := CASE WHEN v_sched = TRUNC(v_dob) + 50 THEN '1' ELSE '0' END;

  v_act := 'DONE=' || r_done || '|PAST=' || r_past || '|WINDOW=' || r_window || '|OK=' || r_ok;
  tc_log('TC-P10', 'reschedule_dose rejects DONE doses, past dates, out-of-window dates; accepts a valid one', v_exp, v_act);
EXCEPTION WHEN OTHERS THEN
  tc_log('TC-P10', 'reschedule_dose rejects DONE doses, past dates, out-of-window dates; accepts a valid one', v_exp, 'ERROR ' || SQLERRM);
END;
/

-- ============================ CURSOR / SWEEP ============================
-- TC-C1 ------------------------------------------------------------
DECLARE
  v_baby NUMBER; v_pre NUMBER; v_post NUMBER; v_over NUMBER; v_exp VARCHAR2(200); v_act VARCHAR2(200);
BEGIN
  tc_cleanup;
  v_exp := '8 -> 0; overdue=8';
  v_baby := tc_baby('TEST_C1', 60, '9000000111');   -- 3 birth + 5 six-week doses are past due
  SELECT COUNT(*) INTO v_pre FROM dose_records
   WHERE baby_id = v_baby AND status = 'PENDING' AND scheduled_date < TRUNC(SYSDATE);
  newborn_vaccination_pkg.refresh_overdue_status;
  SELECT COUNT(*) INTO v_post FROM dose_records
   WHERE baby_id = v_baby AND status = 'PENDING' AND scheduled_date < TRUNC(SYSDATE);
  SELECT COUNT(*) INTO v_over FROM dose_records WHERE baby_id = v_baby AND status = 'OVERDUE';
  v_act := v_pre || ' -> ' || v_post || '; overdue=' || v_over;
  tc_log('TC-C1', 'refresh_overdue_status flips past-due PENDING doses to OVERDUE', v_exp, v_act);
EXCEPTION WHEN OTHERS THEN
  tc_log('TC-C1', 'refresh_overdue_status flips past-due PENDING doses to OVERDUE', v_exp, 'ERROR ' || SQLERRM);
END;
/

-- ============================ TRIGGERS ============================
-- TC-T1 ------------------------------------------------------------
DECLARE
  v_baby NUMBER; v_rec NUMBER; v_code VARCHAR2(20); v_status VARCHAR2(10);
  v_exp VARCHAR2(200); v_act VARCHAR2(200);
BEGIN
  tc_cleanup;
  v_exp := '-20013|DONE';
  v_baby := tc_baby('TEST_T1', 60, '9000000121');
  tc_stock('BCG', 1, 'TEST-T1', 100, 5);
  v_rec := tc_rec(v_baby, 'BCG', 1);
  newborn_vaccination_pkg.mark_dose_administered(v_rec, NULL, tc_clinic, tc_user);
  BEGIN
    UPDATE dose_records SET status = 'PENDING', administered_date = NULL WHERE record_id = v_rec;
    v_code := 'no error';
  EXCEPTION WHEN OTHERS THEN
    v_code := TO_CHAR(SQLCODE);
  END;
  ROLLBACK;
  SELECT status INTO v_status FROM dose_records WHERE record_id = v_rec;
  v_act := v_code || '|' || v_status;
  tc_log('TC-T1', 'guard trigger blocks changing a DONE dose back to PENDING', v_exp, v_act);
EXCEPTION WHEN OTHERS THEN
  tc_log('TC-T1', 'guard trigger blocks changing a DONE dose back to PENDING', v_exp, 'ERROR ' || SQLERRM);
END;
/

-- TC-T2 ------------------------------------------------------------
DECLARE
  v_baby NUMBER; v_rec NUMBER; v_old VARCHAR2(4000); v_new VARCHAR2(4000); v_by VARCHAR2(100);
  v_exp VARCHAR2(200); v_act VARCHAR2(200);
BEGIN
  tc_cleanup;
  v_exp := 'status=PENDING|status=DONE|nurse1';
  v_baby := tc_baby('TEST_T2', 60, '9000000131');
  tc_stock('BCG', 1, 'TEST-T2', 100, 5);
  v_rec := tc_rec(v_baby, 'BCG', 1);
  newborn_vaccination_pkg.mark_dose_administered(v_rec, NULL, tc_clinic, tc_user);
  SELECT old_value, new_value, changed_by INTO v_old, v_new, v_by
    FROM (SELECT old_value, new_value, changed_by FROM audit_log
           WHERE table_name = 'DOSE_RECORDS' AND record_id = v_rec AND action = 'UPDATE'
           ORDER BY audit_id DESC)
   WHERE ROWNUM = 1;
  v_act := SUBSTR(v_old, 1, 14) || '|' || SUBSTR(v_new, 1, 11) || '|' || SUBSTR(v_by, 1, 6);
  tc_log('TC-T2', 'audit trigger records old status, new status and the acting user', v_exp, v_act);
EXCEPTION WHEN OTHERS THEN
  tc_log('TC-T2', 'audit trigger records old status, new status and the acting user', v_exp, 'ERROR ' || SQLERRM);
END;
/

-- TC-T3 ------------------------------------------------------------
DECLARE
  v_a NUMBER; v_b NUMBER; v_c NUMBER; n1 NUMBER; n2 NUMBER; n3 NUMBER;
  v_exp VARCHAR2(200); v_act VARCHAR2(200);

  FUNCTION low_alerts RETURN NUMBER IS
    v NUMBER;
  BEGIN
    SELECT COUNT(*) INTO v FROM alerts WHERE clinic_id = tc_clinic AND alert_type = 'LOW_STOCK';
    RETURN v;
  END low_alerts;
BEGIN
  tc_cleanup;
  v_exp := '0,1,1';
  v_a := tc_baby('TEST_T3A', 60, '9000000141');
  v_b := tc_baby('TEST_T3B', 60, '9000000142');
  v_c := tc_baby('TEST_T3C', 60, '9000000143');
  tc_stock('BCG', 1, 'TEST-T3', 100, 11);            -- threshold is 10
  newborn_vaccination_pkg.mark_dose_administered(tc_rec(v_a, 'BCG', 1), NULL, tc_clinic, tc_user);  -- 11 -> 10
  n1 := low_alerts;
  newborn_vaccination_pkg.mark_dose_administered(tc_rec(v_b, 'BCG', 1), NULL, tc_clinic, tc_user);  -- 10 -> 9  (crosses)
  n2 := low_alerts;
  newborn_vaccination_pkg.mark_dose_administered(tc_rec(v_c, 'BCG', 1), NULL, tc_clinic, tc_user);  -- 9 -> 8
  n3 := low_alerts;
  v_act := n1 || ',' || n2 || ',' || n3;
  tc_log('TC-T3', 'low-stock trigger fires once, when quantity first drops below the threshold', v_exp, v_act);
EXCEPTION WHEN OTHERS THEN
  tc_log('TC-T3', 'low-stock trigger fires once, when quantity first drops below the threshold', v_exp, 'ERROR ' || SQLERRM);
END;
/

-- TC-T4 ------------------------------------------------------------
DECLARE
  v_baby NUMBER; n1 NUMBER; n2 NUMBER; v_max NUMBER; v_exp VARCHAR2(200); v_act VARCHAR2(200);
BEGIN
  tc_cleanup;
  v_exp := '8,8,1';
  v_baby := tc_baby('TEST_T4', 60, '9000000151');
  newborn_vaccination_pkg.refresh_overdue_status;
  SELECT COUNT(*) INTO n1 FROM alerts WHERE baby_id = v_baby AND alert_type = 'OVERDUE';
  newborn_vaccination_pkg.refresh_overdue_status;
  SELECT COUNT(*) INTO n2 FROM alerts WHERE baby_id = v_baby AND alert_type = 'OVERDUE';
  SELECT NVL(MAX(c), 0) INTO v_max
    FROM (SELECT COUNT(*) c FROM alerts WHERE baby_id = v_baby AND alert_type = 'OVERDUE' GROUP BY record_id);
  v_act := n1 || ',' || n2 || ',' || v_max;
  tc_log('TC-T4', 'OVERDUE alerts: one per dose, none added by a second sweep', v_exp, v_act);
EXCEPTION WHEN OTHERS THEN
  tc_log('TC-T4', 'OVERDUE alerts: one per dose, none added by a second sweep', v_exp, 'ERROR ' || SQLERRM);
END;
/

-- ============================ ACCOUNTS ============================
-- TC-U1 ------------------------------------------------------------
DECLARE
  v_baby NUMBER; v_user VARCHAR2(60); v_hash VARCHAR2(100); v_cnt NUMBER; v_role VARCHAR2(10);
  v_exp VARCHAR2(200); v_act VARCHAR2(200);
BEGIN
  tc_cleanup;
  v_exp := 'test.guardian|1|PARENT';
  SELECT password_hash INTO v_hash FROM app_users WHERE username = 'parent1';
  newborn_vaccination_pkg.register_newborn('TEST_Guardian', '9000000071', NULL, 'TEST Street 1', 'TEST_U1', 'F',
                                           TRUNC(SYSDATE) - 5, 3.0, tc_clinic, 'N', v_baby, v_hash, v_user);
  SELECT COUNT(*), MAX(role) INTO v_cnt, v_role
    FROM app_users WHERE guardian_id = (SELECT guardian_id FROM newborns WHERE baby_id = v_baby);
  v_act := v_user || '|' || v_cnt || '|' || v_role;
  tc_log('TC-U1', 'register_newborn creates the guardian''s parent login (username from the guardian name)', v_exp, v_act);
EXCEPTION WHEN OTHERS THEN
  tc_log('TC-U1', 'register_newborn creates the guardian''s parent login (username from the guardian name)', v_exp, 'ERROR ' || SQLERRM);
END;
/

-- TC-U2 ------------------------------------------------------------
DECLARE
  v_baby NUMBER; v_u1 VARCHAR2(60); v_u2 VARCHAR2(60); v_hash VARCHAR2(100); v_cnt NUMBER;
  v_exp VARCHAR2(200); v_act VARCHAR2(200);
BEGIN
  tc_cleanup;
  v_exp := 'test.guardian|none|logins=1';
  SELECT password_hash INTO v_hash FROM app_users WHERE username = 'parent1';
  newborn_vaccination_pkg.register_newborn('TEST_Guardian', '9000000072', NULL, 'TEST Street 1', 'TEST_U2A', 'F',
                                           TRUNC(SYSDATE) - 5, 3.0, tc_clinic, 'N', v_baby, v_hash, v_u1);
  newborn_vaccination_pkg.register_newborn('TEST_Guardian', '9000000072', NULL, 'TEST Street 1', 'TEST_U2B', 'M',
                                           TRUNC(SYSDATE) - 3, 3.0, tc_clinic, 'N', v_baby, v_hash, v_u2);
  SELECT COUNT(*) INTO v_cnt FROM app_users WHERE username LIKE 'test.guardian%';
  v_act := v_u1 || '|' || NVL(v_u2, 'none') || '|logins=' || v_cnt;
  tc_log('TC-U2', 'a second child of the same guardian does not create a second login', v_exp, v_act);
EXCEPTION WHEN OTHERS THEN
  tc_log('TC-U2', 'a second child of the same guardian does not create a second login', v_exp, 'ERROR ' || SQLERRM);
END;
/

-- TC-U3 ------------------------------------------------------------
DECLARE
  v_hash VARCHAR2(100); v_uid NUMBER; v_clinic NUMBER; v_role VARCHAR2(10); v_dup VARCHAR2(20); v_free NUMBER;
  v_exp VARCHAR2(200); v_act VARCHAR2(200);
BEGIN
  tc_cleanup;
  v_exp := 'created NURSE at TEST_CLINIC|dup=-20018|next nurse name free=1';
  SELECT password_hash INTO v_hash FROM app_users WHERE username = 'nurse1';
  account_pkg.create_user(tc_user, 'testu_nurse', v_hash, 'NURSE', 'TEST Nurse', tc_clinic, NULL, v_uid);
  SELECT role, clinic_id INTO v_role, v_clinic FROM app_users WHERE user_id = v_uid;
  BEGIN
    account_pkg.create_user(tc_user, 'TESTU_NURSE', v_hash, 'NURSE', 'TEST Nurse 2', tc_clinic, NULL, v_uid);
    v_dup := 'no error';
  EXCEPTION WHEN OTHERS THEN v_dup := TO_CHAR(SQLCODE); END;
  SELECT CASE WHEN COUNT(*) = 0 THEN 1 ELSE 0 END INTO v_free FROM app_users WHERE username = account_pkg.next_nurse_username;
  v_act := 'created ' || v_role || ' at ' || CASE WHEN v_clinic = tc_clinic THEN 'TEST_CLINIC' ELSE 'other clinic' END
           || '|dup=' || v_dup || '|next nurse name free=' || v_free;
  tc_log('TC-U3', 'create_user adds a nurse for a clinic; usernames are unique ignoring case', v_exp, v_act);
EXCEPTION WHEN OTHERS THEN
  tc_log('TC-U3', 'create_user adds a nurse for a clinic; usernames are unique ignoring case', v_exp, 'ERROR ' || SQLERRM);
END;
/

-- TC-U4 ------------------------------------------------------------
DECLARE
  v_hash VARCHAR2(100); v_uid NUMBER; v_guardian NUMBER;
  r1 VARCHAR2(20); r2 VARCHAR2(20); r3 VARCHAR2(20); r4 VARCHAR2(20);
  v_exp VARCHAR2(200); v_act VARCHAR2(200);
BEGIN
  tc_cleanup;
  v_exp := 'nurse-no-clinic=-20019|guardian-has-login=-20017|admin-role=-20019|bad-hash=-20019';
  SELECT password_hash, guardian_id INTO v_hash, v_guardian FROM app_users WHERE username = 'parent1';
  BEGIN account_pkg.create_user(tc_user, 'testu_x1', v_hash, 'NURSE', 'TEST X', NULL, NULL, v_uid); r1 := 'no error';
  EXCEPTION WHEN OTHERS THEN r1 := TO_CHAR(SQLCODE); END;
  BEGIN account_pkg.create_user(tc_user, 'testu_x2', v_hash, 'PARENT', 'TEST X', NULL, v_guardian, v_uid); r2 := 'no error';
  EXCEPTION WHEN OTHERS THEN r2 := TO_CHAR(SQLCODE); END;
  BEGIN account_pkg.create_user(tc_user, 'testu_x3', v_hash, 'ADMIN', 'TEST X', NULL, NULL, v_uid); r3 := 'no error';
  EXCEPTION WHEN OTHERS THEN r3 := TO_CHAR(SQLCODE); END;
  BEGIN account_pkg.create_user(tc_user, 'testu_x4', 'short', 'NURSE', 'TEST X', tc_clinic, NULL, v_uid); r4 := 'no error';
  EXCEPTION WHEN OTHERS THEN r4 := TO_CHAR(SQLCODE); END;
  v_act := 'nurse-no-clinic=' || r1 || '|guardian-has-login=' || r2 || '|admin-role=' || r3 || '|bad-hash=' || r4;
  tc_log('TC-U4', 'account rules: nurse needs a clinic, one login per guardian, no admin via the app, valid hash', v_exp, v_act);
EXCEPTION WHEN OTHERS THEN
  tc_log('TC-U4', 'account rules: nurse needs a clinic, one login per guardian, no admin via the app, valid hash', v_exp, 'ERROR ' || SQLERRM);
END;
/

-- TC-U5 ------------------------------------------------------------
DECLARE
  v_hash VARCHAR2(100); v_uid NUMBER; v_a VARCHAR2(60); v_b VARCHAR2(60); v_c VARCHAR2(60);
  v_accent VARCHAR2(60); v_short VARCHAR2(60); v_len NUMBER;
  v_exp VARCHAR2(200); v_act VARCHAR2(200);
BEGIN
  tc_cleanup;
  v_exp := 'testu.zed|testu.zed2|testu.zed3|zoe.muller|parent|len=34';
  SELECT password_hash INTO v_hash FROM app_users WHERE username = 'nurse1';
  v_a := account_pkg.suggest_username('Testu Zed');
  account_pkg.create_user(tc_user, v_a, v_hash, 'NURSE', 'TEST Nurse A', tc_clinic, NULL, v_uid);
  v_b := account_pkg.suggest_username('TESTU  ZED');          -- same name, other case and spacing
  account_pkg.create_user(tc_user, v_b, v_hash, 'NURSE', 'TEST Nurse B', tc_clinic, NULL, v_uid);
  v_c := account_pkg.suggest_username('testu zed');
  v_accent := account_pkg.suggest_username(UNISTR('Zo\00EB M\00FCller'));   -- Zoe Muller with accents
  v_short := account_pkg.suggest_username('Li');                           -- too short to be a name
  v_len := LENGTH(account_pkg.suggest_username(RPAD('abc ', 120, 'x')));
  v_act := v_a || '|' || v_b || '|' || v_c || '|' || v_accent || '|' || v_short || '|len=' || v_len;
  tc_log('TC-U5', 'suggest_username: name-based, numbered when taken, accents folded, short names and length handled', v_exp, v_act);
EXCEPTION WHEN OTHERS THEN
  tc_log('TC-U5', 'suggest_username: name-based, numbered when taken, accents folded, short names and length handled', v_exp, 'ERROR ' || SQLERRM);
END;
/

-- TC-U6 ------------------------------------------------------------
DECLARE
  v_baby NUMBER; v_user VARCHAR2(60); v_hash VARCHAR2(100);
  v_known VARCHAR2(1); v_padded VARCHAR2(1); v_unknown VARCHAR2(1); v_before VARCHAR2(1);
  v_exp VARCHAR2(200); v_act VARCHAR2(200);
BEGIN
  tc_cleanup;
  v_exp := 'before=N|known=Y|padded=Y|other=N';
  SELECT password_hash INTO v_hash FROM app_users WHERE username = 'parent1';
  v_before := newborn_vaccination_pkg.guardian_exists('9000000091');
  newborn_vaccination_pkg.register_newborn('TEST_Guardian', '9000000091', NULL, 'TEST Street 1', 'TEST_U6', 'F',
                                           TRUNC(SYSDATE) - 5, 3.0, tc_clinic, 'N', v_baby, v_hash, v_user);
  v_known   := newborn_vaccination_pkg.guardian_exists('9000000091');
  v_padded  := newborn_vaccination_pkg.guardian_exists('  9000000091 ');
  v_unknown := newborn_vaccination_pkg.guardian_exists('9000000092');
  v_act := 'before=' || v_before || '|known=' || v_known || '|padded=' || v_padded || '|other=' || v_unknown;
  tc_log('TC-U6', 'guardian_exists answers Y/N for a phone number (same matching as register_newborn)', v_exp, v_act);
EXCEPTION WHEN OTHERS THEN
  tc_log('TC-U6', 'guardian_exists answers Y/N for a phone number (same matching as register_newborn)', v_exp, 'ERROR ' || SQLERRM);
END;
/

-- TC-U7 ------------------------------------------------------------
DECLARE
  v_baby NUMBER; v_u1 VARCHAR2(60); v_u2 VARCHAR2(60); v_hash VARCHAR2(100); v_babies NUMBER; v_logins NUMBER;
  v_gname VARCHAR2(100); v_new VARCHAR2(20); v_sib VARCHAR2(80); v_noaddr VARCHAR2(20);
  v_exp VARCHAR2(200); v_act VARCHAR2(200);
BEGIN
  tc_cleanup;
  v_exp := 'sibling: no login, babies=2, logins=1, name kept=TEST_Guardian|new guardian without name=-20014|without address=-20014';
  SELECT password_hash INTO v_hash FROM app_users WHERE username = 'parent1';
  newborn_vaccination_pkg.register_newborn('TEST_Guardian', '9000000093', NULL, 'TEST Street 1', 'TEST_U7A', 'F',
                                           TRUNC(SYSDATE) - 5, 3.0, tc_clinic, 'N', v_baby, v_hash, v_u1);
  -- the sibling is registered with no guardian name at all: the known guardian is reused
  newborn_vaccination_pkg.register_newborn(NULL, '9000000093', NULL, NULL, 'TEST_U7B', 'M',
                                           TRUNC(SYSDATE) - 3, 3.0, tc_clinic, 'N', v_baby, v_hash, v_u2);
  v_sib := CASE WHEN v_u2 IS NULL THEN 'no login' ELSE 'login ' || v_u2 END;
  SELECT COUNT(*) INTO v_babies FROM newborns n JOIN guardians g ON g.guardian_id = n.guardian_id WHERE g.phone = '9000000093';
  SELECT COUNT(*) INTO v_logins FROM app_users u JOIN guardians g ON g.guardian_id = u.guardian_id WHERE g.phone = '9000000093';
  SELECT full_name INTO v_gname FROM guardians WHERE phone = '9000000093';
  BEGIN
    newborn_vaccination_pkg.register_newborn(NULL, '9000000094', NULL, NULL, 'TEST_U7C', 'F',
                                             TRUNC(SYSDATE) - 3, 3.0, tc_clinic, 'N', v_baby, v_hash, v_u2);
    v_new := 'no error';
  EXCEPTION WHEN OTHERS THEN v_new := TO_CHAR(SQLCODE); END;
  BEGIN
    newborn_vaccination_pkg.register_newborn('TEST_Guardian', '9000000095', NULL, NULL, 'TEST_U7D', 'F',
                                             TRUNC(SYSDATE) - 3, 3.0, tc_clinic, 'N', v_baby, v_hash, v_u2);
    v_noaddr := 'no error';
  EXCEPTION WHEN OTHERS THEN v_noaddr := TO_CHAR(SQLCODE); END;
  v_act := 'sibling: ' || v_sib
           || ', babies=' || v_babies || ', logins=' || v_logins || ', name kept=' || v_gname
           || '|new guardian without name=' || v_new || '|without address=' || v_noaddr;
  tc_log('TC-U7', 'a sibling joins the existing guardian and login; a new guardian still needs a name and an address', v_exp, v_act);
EXCEPTION WHEN OTHERS THEN
  tc_log('TC-U7', 'a sibling joins the existing guardian and login; a new guardian still needs a name and an address', v_exp, 'ERROR ' || SQLERRM);
END;
/

-- ============================ ADMIN: EDIT / DELETE NEWBORN ============================
-- TC-N1 ------------------------------------------------------------
DECLARE
  v_baby NUMBER; v_bcg NUMBER; v_opv NUMBER; v_late CHAR(1); v_sched DATE; v_status VARCHAR2(10);
  v_dob DATE; v_name VARCHAR2(100); v_exp VARCHAR2(300); v_act VARCHAR2(300);
BEGIN
  tc_cleanup;
  v_exp := 'late=N|bOPV-1 due +32|PENDING|dob moved|name=TEST_N1_new';
  v_baby := tc_baby('TEST_N1', 60, '9000000181');
  tc_stock('BCG', 1, 'TEST-N1', 100, 5);
  v_bcg := tc_rec(v_baby, 'BCG', 1);
  newborn_vaccination_pkg.mark_dose_administered(v_bcg, NULL, tc_clinic, tc_user);          -- age 60: late
  newborn_vaccination_pkg.update_newborn(v_baby, 'TEST_N1_new', 'M', TRUNC(SYSDATE) - 10, 3.4, tc_admin);
  SELECT is_late INTO v_late FROM dose_records WHERE record_id = v_bcg;                     -- age 10 now: not late
  v_opv := tc_rec(v_baby, 'bOPV', 1);
  SELECT scheduled_date, status INTO v_sched, v_status FROM dose_records WHERE record_id = v_opv;
  SELECT date_of_birth, full_name INTO v_dob, v_name FROM newborns WHERE baby_id = v_baby;
  v_act := 'late=' || v_late || '|bOPV-1 due +' || (v_sched - TRUNC(SYSDATE)) || '|' || v_status || '|'
           || CASE WHEN v_dob = TRUNC(SYSDATE) - 10 THEN 'dob moved' ELSE 'dob NOT moved' END || '|name=' || v_name;
  tc_log('TC-N1', 'update_newborn moves unfinished dose dates with the date of birth and recalculates late flags', v_exp, v_act);
EXCEPTION WHEN OTHERS THEN
  tc_log('TC-N1', 'update_newborn moves unfinished dose dates with the date of birth and recalculates late flags', v_exp, 'ERROR ' || SQLERRM);
END;
/

-- TC-N2 ------------------------------------------------------------
DECLARE
  v_baby NUMBER; v_baby2 NUMBER; v_dob DATE; r1 VARCHAR2(20); r2 VARCHAR2(20); v_exp VARCHAR2(300); v_act VARCHAR2(300);
BEGIN
  tc_cleanup;
  v_exp := '-20020|dob unchanged|-20003';
  v_baby := tc_baby('TEST_N2', 60, '9000000182');
  tc_stock('bOPV', 1, 'TEST-N2', 100, 5);
  newborn_vaccination_pkg.mark_dose_administered(tc_rec(v_baby, 'bOPV', 1), NULL, tc_clinic, tc_user);   -- given at age 60
  BEGIN
    newborn_vaccination_pkg.update_newborn(v_baby, 'TEST_N2', 'F', TRUNC(SYSDATE) - 30, 3.0, tc_admin);   -- would be age 30 < 42
    r1 := 'no error';
  EXCEPTION WHEN OTHERS THEN r1 := TO_CHAR(SQLCODE); END;
  SELECT date_of_birth INTO v_dob FROM newborns WHERE baby_id = v_baby;
  v_baby2 := tc_baby('TEST_N2B', 5, '9000000186');
  BEGIN
    newborn_vaccination_pkg.update_newborn(v_baby2, 'TEST_N2B', 'F', TRUNC(SYSDATE) + 3, 3.0, tc_admin);
    r2 := 'no error';
  EXCEPTION WHEN OTHERS THEN r2 := TO_CHAR(SQLCODE); END;
  v_act := r1 || '|' || CASE WHEN v_dob = TRUNC(SYSDATE) - 60 THEN 'dob unchanged' ELSE 'dob CHANGED' END || '|' || r2;
  tc_log('TC-N2', 'a date of birth that invalidates a given dose, or lies in the future, is refused', v_exp, v_act);
EXCEPTION WHEN OTHERS THEN
  tc_log('TC-N2', 'a date of birth that invalidates a given dose, or lies in the future, is refused', v_exp, 'ERROR ' || SQLERRM);
END;
/

-- TC-N3 ------------------------------------------------------------
DECLARE
  TYPE t_ids IS TABLE OF NUMBER INDEX BY PLS_INTEGER;
  v_ids t_ids; v_a NUMBER; v_b NUMBER; q1 NUMBER; q2 NUMBER; v_left NUMBER; v_audit NUMBER;
  v_exp VARCHAR2(300); v_act VARCHAR2(300);
BEGIN
  tc_cleanup;
  v_exp := 'restored=5|kept=4|left=0|audit=2';
  v_a := tc_baby('TEST_N3A', 20, '9000000183');
  v_b := tc_baby('TEST_N3B', 20, '9000000184');
  tc_stock('BCG', 1, 'TEST-N3', 100, 5);
  SELECT record_id BULK COLLECT INTO v_ids FROM dose_records WHERE baby_id IN (v_a, v_b);
  newborn_vaccination_pkg.mark_dose_administered(tc_rec(v_a, 'BCG', 1), NULL, tc_clinic, tc_user);       -- 5 -> 4
  newborn_vaccination_pkg.delete_newborn(v_a, tc_admin, 'Y');                                            -- back to 5
  q1 := tc_stock_qty('TEST-N3');
  newborn_vaccination_pkg.mark_dose_administered(tc_rec(v_b, 'BCG', 1), NULL, tc_clinic, tc_user);       -- 5 -> 4
  newborn_vaccination_pkg.delete_newborn(v_b, tc_admin, 'N');                                            -- stays 4
  q2 := tc_stock_qty('TEST-N3');
  SELECT (SELECT COUNT(*) FROM newborns WHERE baby_id IN (v_a, v_b))
       + (SELECT COUNT(*) FROM dose_records WHERE baby_id IN (v_a, v_b))
       + (SELECT COUNT(*) FROM alerts WHERE baby_id IN (v_a, v_b)) INTO v_left FROM dual;
  SELECT COUNT(*) INTO v_audit FROM audit_log WHERE table_name = 'NEWBORNS' AND action = 'DELETE' AND record_id IN (v_a, v_b);
  FORALL i IN 1 .. v_ids.COUNT DELETE FROM audit_log WHERE table_name = 'DOSE_RECORDS' AND record_id = v_ids(i);
  COMMIT;
  v_act := 'restored=' || q1 || '|kept=' || q2 || '|left=' || v_left || '|audit=' || v_audit;
  tc_log('TC-N3', 'delete_newborn removes the baby, doses and alerts; stock comes back only when asked', v_exp, v_act);
EXCEPTION WHEN OTHERS THEN
  tc_log('TC-N3', 'delete_newborn removes the baby, doses and alerts; stock comes back only when asked', v_exp, 'ERROR ' || SQLERRM);
END;
/

-- TC-N4 ------------------------------------------------------------
DECLARE
  v_baby NUMBER; r1 VARCHAR2(20); r2 VARCHAR2(20); v_intact NUMBER; v_audit NUMBER; v_exp VARCHAR2(300); v_act VARCHAR2(300);
BEGIN
  tc_cleanup;
  v_exp := 'update=-20021|delete=-20021|intact=1|audit by admin=1';
  v_baby := tc_baby('TEST_N4', 5, '9000000185');
  BEGIN newborn_vaccination_pkg.update_newborn(v_baby, 'TEST_N4', 'F', TRUNC(SYSDATE) - 5, 3.0, tc_user); r1 := 'no error';
  EXCEPTION WHEN OTHERS THEN r1 := TO_CHAR(SQLCODE); END;
  BEGIN newborn_vaccination_pkg.delete_newborn(v_baby, tc_user, 'N'); r2 := 'no error';
  EXCEPTION WHEN OTHERS THEN r2 := TO_CHAR(SQLCODE); END;
  SELECT COUNT(*) INTO v_intact FROM newborns WHERE baby_id = v_baby;
  newborn_vaccination_pkg.update_newborn(v_baby, 'TEST_N4_ok', 'F', TRUNC(SYSDATE) - 5, 3.0, tc_admin);
  SELECT COUNT(*) INTO v_audit FROM audit_log
   WHERE table_name = 'NEWBORNS' AND record_id = v_baby AND action = 'UPDATE'
     AND new_value LIKE 'name=TEST_N4_ok%' AND changed_by LIKE 'admin%';
  v_act := 'update=' || r1 || '|delete=' || r2 || '|intact=' || v_intact || '|audit by admin=' || v_audit;
  tc_log('TC-N4', 'only an administrator can edit or delete a newborn; the change is audited with the actor', v_exp, v_act);
EXCEPTION WHEN OTHERS THEN
  tc_log('TC-N4', 'only an administrator can edit or delete a newborn; the change is audited with the actor', v_exp, 'ERROR ' || SQLERRM);
END;
/

-- ============================ REPORTING ============================
-- TC-R1 ------------------------------------------------------------
DECLARE
  v_baby NUMBER; v_cur SYS_REFCURSOR;
  e_over NUMBER; e_up NUMBER; e_clin NUMBER; v_exp VARCHAR2(300); v_act VARCHAR2(300);
  a_over NUMBER; a_up NUMBER; a_clin NUMBER; a_sum NUMBER; a_time NUMBER;

  -- counts rows of any REF CURSOR without knowing its columns
  FUNCTION count_rows (p_cur IN OUT SYS_REFCURSOR) RETURN NUMBER IS
    v_c    NUMBER;
    v_cols NUMBER;
    v_desc DBMS_SQL.DESC_TAB;
    v_str  VARCHAR2(4000);
    v_n    NUMBER := 0;
  BEGIN
    v_c := DBMS_SQL.TO_CURSOR_NUMBER(p_cur);
    DBMS_SQL.DESCRIBE_COLUMNS(v_c, v_cols, v_desc);
    FOR i IN 1 .. v_cols LOOP
      DBMS_SQL.DEFINE_COLUMN(v_c, i, v_str, 4000);
    END LOOP;
    WHILE DBMS_SQL.FETCH_ROWS(v_c) > 0 LOOP
      v_n := v_n + 1;
    END LOOP;
    DBMS_SQL.CLOSE_CURSOR(v_c);
    RETURN v_n;
  END count_rows;
BEGIN
  tc_cleanup;
  v_baby := tc_baby('TEST_R1', 30, '9000000161');
  newborn_vaccination_pkg.refresh_overdue_status;

  -- expected values come from plain queries on the tables (the demo seed supplies the volume)
  SELECT COUNT(*) INTO e_over FROM dose_records WHERE status = 'OVERDUE';
  SELECT COUNT(*) INTO e_up FROM dose_records
   WHERE status = 'PENDING' AND scheduled_date BETWEEN TRUNC(SYSDATE) AND TRUNC(SYSDATE) + 7;
  SELECT COUNT(*) INTO e_clin FROM clinics;
  v_exp := 'overdue=' || e_over || ';upcoming=' || e_up || ';clinics=' || e_clin || ';summary=1;timeline=24';

  vax_reporting_pkg.overdue_list(NULL, v_cur);        a_over := count_rows(v_cur);
  vax_reporting_pkg.upcoming_list(NULL, 7, v_cur);    a_up   := count_rows(v_cur);
  vax_reporting_pkg.clinic_coverage(v_cur);           a_clin := count_rows(v_cur);
  vax_reporting_pkg.dashboard_summary(NULL, v_cur);   a_sum  := count_rows(v_cur);
  vax_reporting_pkg.baby_timeline(v_baby, v_cur);     a_time := count_rows(v_cur);

  v_act := 'overdue=' || a_over || ';upcoming=' || a_up || ';clinics=' || a_clin
           || ';summary=' || a_sum || ';timeline=' || a_time;
  tc_log('TC-R1', 'reporting REF cursors return the row counts the tables imply', v_exp, v_act);
EXCEPTION WHEN OTHERS THEN
  tc_log('TC-R1', 'reporting REF cursors return the row counts the tables imply', v_exp, 'ERROR ' || SQLERRM);
END;
/

-- ---------------------------------------------------------------- finish
BEGIN
  tc_cleanup;
  newborn_vaccination_pkg.set_actor(NULL);
END;
/

DROP PROCEDURE tc_log;
DROP PROCEDURE tc_cleanup;
DROP FUNCTION tc_clinic;
DROP FUNCTION tc_user;
DROP FUNCTION tc_admin;
DROP FUNCTION tc_vid;
DROP FUNCTION tc_baby;
DROP PROCEDURE tc_stock;
DROP FUNCTION tc_rec;
DROP FUNCTION tc_stock_qty;

-- ---------------------------------------------------------------- results
SET PAGESIZE 100 LINESIZE 220 FEEDBACK OFF
COLUMN tc_code     FORMAT A7
COLUMN description FORMAT A64 WORD_WRAPPED
COLUMN expected    FORMAT A38 WORD_WRAPPED
COLUMN actual      FORMAT A38 WORD_WRAPPED
COLUMN result      FORMAT A6
PROMPT
PROMPT ===== test_log =====
SELECT tc_code, description, expected, actual, result FROM test_log ORDER BY test_id;
PROMPT
SELECT result, COUNT(*) AS cases FROM test_log GROUP BY result ORDER BY result;
SELECT 'leftover TEST_ rows (must be 0): '
       || ((SELECT COUNT(*) FROM newborns WHERE full_name LIKE 'TEST\_%' ESCAPE '\')
         + (SELECT COUNT(*) FROM clinics WHERE clinic_name = 'TEST_CLINIC')
         + (SELECT COUNT(*) FROM guardians WHERE full_name LIKE 'TEST\_%' ESCAPE '\')
         + (SELECT COUNT(*) FROM app_users WHERE username LIKE 'testu\_%' ESCAPE '\' OR username LIKE 'testu.%'
                                        OR username LIKE 'test.guardian%')) AS info
  FROM dual;
PROMPT 11_tests.sql complete.
