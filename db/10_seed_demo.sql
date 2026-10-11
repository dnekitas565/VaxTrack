-- ============================================================================
-- 10_seed_demo.sql  --  demo babies, doses and stock (all dates relative to SYSDATE)
-- Owner  : vaxapp.  Needs 01..09 to have run.
-- WARNING: re-runnable, but it first DELETES all babies, doses, alerts, stock and
--          audit rows, plus parent logins other than parent1/parent2 and nurses other
--          than nurse1..nurse4 (they are recreated below). Do not run it on a database
--          with data you want to keep.
-- Every clinic has a nurse (nurse1..nurse4) and every guardian gets a parent login,
-- created by register_newborn itself (username from the guardian's name, e.g. suresh.nair).
-- One family has two children (Aarav and Myra Sharma, same phone number, one login).
-- Everything goes through the packages: babies via register_newborn, doses via
-- mark_dose_administered, stock via restock. Overdue / due-soon / expiry alerts
-- come from the sweeps at the end, so no state is hand-edited.
-- ============================================================================
SET DEFINE OFF
SET SERVEROUTPUT ON SIZE UNLIMITED
SET ECHO ON
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK

-- ---------------------------------------------------------------- cleanup
BEGIN
  DELETE FROM alerts;
  DELETE FROM dose_records;
  DELETE FROM newborns;
  DELETE FROM vaccine_inventory;
  DELETE FROM audit_log;   -- after dose_records so the delete-trigger rows go too
  DELETE FROM app_users WHERE role = 'PARENT' AND username NOT IN ('parent1', 'parent2');
  DELETE FROM app_users WHERE role = 'NURSE'  AND username NOT IN ('nurse1', 'nurse2', 'nurse3', 'nurse4');
  DELETE FROM guardians g
   WHERE NOT EXISTS (SELECT 1 FROM app_users u WHERE u.guardian_id = g.guardian_id);
  COMMIT;
END;
/

-- ------------------------------------------------------------------ seed
DECLARE
  v_sunrise clinics.clinic_id%TYPE;
  v_citycare clinics.clinic_id%TYPE;
  v_lotus   clinics.clinic_id%TYPE;
  v_green   clinics.clinic_id%TYPE;
  v_nurse1  app_users.user_id%TYPE;
  v_nurse2  app_users.user_id%TYPE;
  v_nurse3  app_users.user_id%TYPE;
  v_nurse4  app_users.user_id%TYPE;
  v_parent_hash app_users.password_hash%TYPE;   -- same hash as parent1 (default parent password)
  v_parent_user VARCHAR2(60);
  v_logins  PLS_INTEGER := 0;
  v_baby_id newborns.baby_id%TYPE;
  v_vita    vaccine_master.vaccine_id%TYPE;
  v_failed  PLS_INTEGER := 0;

  -- stock for every vaccine at one clinic; skip_name leaves that vaccine out of stock
  PROCEDURE stock_clinic (p_clinic NUMBER, p_user NUMBER, p_skip_name VARCHAR2 DEFAULT NULL) IS
  BEGIN
    FOR v IN (SELECT vaccine_id, vaccine_name FROM vaccine_master ORDER BY vaccine_id) LOOP
      IF p_skip_name IS NULL OR v.vaccine_name <> p_skip_name THEN
        vaccine_inventory_pkg.restock(p_clinic, v.vaccine_id, 'LOT-' || v.vaccine_id || 'A',
                                      TRUNC(SYSDATE) + 365, 60, p_user);
      END IF;
    END LOOP;
  END stock_clinic;

  PROCEDURE baby (p_name VARCHAR2, p_gender VARCHAR2, p_days_old NUMBER, p_weight NUMBER,
                  p_clinic NUMBER, p_gname VARCHAR2, p_gphone VARCHAR2, p_gemail VARCHAR2,
                  p_addr VARCHAR2, p_je VARCHAR2 DEFAULT 'N') IS
  BEGIN
    newborn_vaccination_pkg.register_newborn(p_gname, p_gphone, p_gemail, p_addr, p_name, p_gender,
                                             TRUNC(SYSDATE) - p_days_old, p_weight, p_clinic, p_je, v_baby_id,
                                             v_parent_hash, v_parent_user);
    IF v_parent_user IS NOT NULL THEN
      v_logins := v_logins + 1;
    END IF;
  END baby;

  -- administer one dose on (date of birth + p_age_days) using the baby's own clinic stock
  PROCEDURE given (p_baby VARCHAR2, p_vname VARCHAR2, p_dose NUMBER, p_age_days NUMBER) IS
    v_rec    dose_records.record_id%TYPE;
    v_dob    newborns.date_of_birth%TYPE;
    v_clinic newborns.clinic_id%TYPE;
  BEGIN
    SELECT d.record_id, n.date_of_birth, n.clinic_id
      INTO v_rec, v_dob, v_clinic
      FROM dose_records d
      JOIN newborns n       ON n.baby_id = d.baby_id
      JOIN vaccine_master v ON v.vaccine_id = d.vaccine_id
     WHERE n.full_name = p_baby AND v.vaccine_name = p_vname AND v.dose_number = p_dose;
    newborn_vaccination_pkg.mark_dose_administered(v_rec, v_dob + p_age_days, v_clinic,
        CASE v_clinic WHEN v_sunrise THEN v_nurse1 WHEN v_citycare THEN v_nurse2
                      WHEN v_lotus THEN v_nurse3 ELSE v_nurse4 END);
  EXCEPTION
    WHEN OTHERS THEN
      v_failed := v_failed + 1;
      DBMS_OUTPUT.PUT_LINE('  not given: ' || p_baby || ' / ' || p_vname || '-' || p_dose || ' -> ' || SQLERRM);
  END given;

  -- administer every non-regional dose of an age band, optionally leaving one vaccine name out
  PROCEDURE band (p_baby VARCHAR2, p_age_label VARCHAR2, p_age_days NUMBER, p_except VARCHAR2 DEFAULT NULL) IS
  BEGIN
    FOR v IN (SELECT vaccine_name, dose_number FROM vaccine_master
               WHERE age_label = p_age_label AND is_regional = 'N'
                 AND (p_except IS NULL OR vaccine_name <> p_except)
               ORDER BY vaccine_id) LOOP
      given(p_baby, v.vaccine_name, v.dose_number, p_age_days);
    END LOOP;
  END band;
BEGIN
  SELECT clinic_id INTO v_sunrise  FROM clinics WHERE clinic_name = 'Sunrise Child Health Clinic';
  SELECT clinic_id INTO v_citycare FROM clinics WHERE clinic_name = 'CityCare Pediatric Centre';
  SELECT user_id INTO v_nurse1 FROM app_users WHERE username = 'nurse1';
  SELECT user_id INTO v_nurse2 FROM app_users WHERE username = 'nurse2';
  SELECT clinic_id INTO v_lotus FROM clinics WHERE clinic_name = 'Lotus Mother and Baby Clinic';
  SELECT clinic_id INTO v_green FROM clinics WHERE clinic_name = 'Green Valley Immunization Centre';
  SELECT user_id INTO v_nurse3 FROM app_users WHERE username = 'nurse3';
  SELECT user_id INTO v_nurse4 FROM app_users WHERE username = 'nurse4';
  SELECT password_hash INTO v_parent_hash FROM app_users WHERE username = 'parent1';

  -- ---- stock: all vaccines at two clinics, with deliberate exceptions
  stock_clinic(v_sunrise,  v_nurse1);
  stock_clinic(v_citycare, v_nurse2, 'Vitamin A');   -- Vitamin A is out of stock at CityCare (demo)
  stock_clinic(v_lotus,    v_nurse3);
  stock_clinic(v_green,    v_nurse4);
  -- low stock: Sunrise bOPV-0 starts at 12 (threshold 10); the doses below push it under
  UPDATE vaccine_inventory SET quantity = 12
   WHERE clinic_id = v_sunrise
     AND vaccine_id = (SELECT vaccine_id FROM vaccine_master WHERE vaccine_name = 'bOPV' AND dose_number = 0);
  -- near expiry: a second Vitamin A batch at Sunrise that expires in 20 days (FEFO picks it first)
  SELECT vaccine_id INTO v_vita FROM vaccine_master WHERE vaccine_name = 'Vitamin A' AND dose_number = 1;
  vaccine_inventory_pkg.restock(v_sunrise, v_vita, 'LOT-VA-NEAR', TRUNC(SYSDATE) + 20, 5, v_nurse1);
  COMMIT;

  -- ---- babies (guardians 9876500001/2 are the PARENT demo logins)
  baby('Aarav Sharma', 'M',   3, 3.20, v_sunrise,  'Priya Sharma',  '9876500001', 'priya.sharma@example.com', '12 Lake View Road, Vellore');
  baby('Diya Menon',   'F',  50, 2.90, v_citycare, 'Rahul Menon',   '9876500002', 'rahul.menon@example.com',  '45 Gandhi Street, Chennai');
  baby('Kabir Nair',   'M', 120, 3.40, v_sunrise,  'Suresh Nair',   '9876500003', 'suresh.nair@example.com',  '7 Temple Road, Vellore');
  baby('Meera Iyer',   'F', 300, 3.00, v_citycare, 'Lakshmi Iyer',  '9876500004', 'lakshmi.iyer@example.com', '88 Anna Nagar, Chennai');
  baby('Rohan Das',    'M',  10, 3.10, v_sunrise,  'Anil Das',      '9876500005', 'anil.das@example.com',     '3 Market Street, Vellore');
  baby('Sara Khan',    'F',  38, 2.80, v_sunrise,  'Farah Khan',    '9876500006', 'farah.khan@example.com',   '21 Fort Road, Vellore');
  baby('Ishaan Reddy', 'M', 200, 3.30, v_sunrise,  'Venkat Reddy',  '9876500007', 'venkat.reddy@example.com', '54 Hill View, Vellore', 'Y');
  baby('Tara Joseph',  'F', 450, 3.00, v_citycare, 'Mary Joseph',   '9876500008', 'mary.joseph@example.com',  '9 Beach Road, Chennai');
  baby('Anaya Patel',  'F',  45, 3.10, v_lotus,    'Rohit Patel',   '9876500009', 'rohit.patel@example.com',  '15 Park Avenue, Bengaluru');
  baby('Vihaan Rao',   'M', 100, 3.20, v_green,    'Sunita Rao',    '9876500010', 'sunita.rao@example.com',   '6 Race Course Road, Coimbatore');
  -- a sibling: same phone number, so the existing guardian and the existing login (parent1) are reused
  baby('Myra Sharma',  'F',  75, 3.05, v_sunrise,  'Priya Sharma',  '9876500001', NULL, NULL);

  -- ---- doses given on or just after the due age
  band('Aarav Sharma', 'At birth', 1);

  band('Diya Menon', 'At birth', 1);
  given('Diya Menon', 'bOPV', 1, 43);
  given('Diya Menon', 'Pentavalent', 1, 43);          -- fIPV-1, RVV-1, PCV-1 stay overdue

  band('Kabir Nair', 'At birth', 1);
  band('Kabir Nair', '6 weeks', 44, 'RVV');
  given('Kabir Nair', 'RVV', 1, 80);                   -- late: past day 70, raises a LATE_DOSE alert
  band('Kabir Nair', '10 weeks', 72);                  -- 14-week doses stay overdue

  band('Meera Iyer', 'At birth', 1);
  band('Meera Iyer', '6 weeks', 43);
  band('Meera Iyer', '10 weeks', 71);
  band('Meera Iyer', '14 weeks', 99);                  -- 9-month doses stay overdue (Vitamin A: no stock)

  given('Rohan Das', 'BCG', 1, 1);                     -- bOPV-0 and Hep B birth dose stay overdue

  band('Sara Khan', 'At birth', 1);                    -- 6-week doses fall due in 4 days

  band('Ishaan Reddy', 'At birth', 1);
  band('Ishaan Reddy', '6 weeks', 43);
  band('Ishaan Reddy', '10 weeks', 71);
  band('Ishaan Reddy', '14 weeks', 99);                -- 9-month doses (incl. JE-1) not yet due

  band('Tara Joseph', 'At birth', 1);
  band('Tara Joseph', '6 weeks', 43);
  band('Tara Joseph', '10 weeks', 71);
  band('Tara Joseph', '14 weeks', 99);
  band('Tara Joseph', '9-11 months', 271);             -- Vitamin A fails: no stock at CityCare

  band('Anaya Patel', 'At birth', 1);                  -- Lotus clinic, nurse3: 6-week doses overdue

  band('Vihaan Rao', 'At birth', 1);                   -- Green Valley clinic, nurse4
  band('Vihaan Rao', '6 weeks', 43);                   -- 10-week doses overdue

  band('Myra Sharma', 'At birth', 1);                  -- sibling of Aarav: fully up to date,
  band('Myra Sharma', '6 weeks', 43);                  -- the 14-week doses fall due in 23 days
  band('Myra Sharma', '10 weeks', 71);

  COMMIT;

  -- ---- sweeps create the overdue, due-soon and expiry alerts
  newborn_vaccination_pkg.refresh_overdue_status;
  send_due_soon_alerts(7);
  vaccine_inventory_pkg.expiry_sweep(30);
  newborn_vaccination_pkg.set_actor(NULL);

  DBMS_OUTPUT.PUT_LINE('Parent logins created by register_newborn: ' || v_logins || ' (username from the guardian name)');
  DBMS_OUTPUT.PUT_LINE('Demo seed finished. Doses that could not be given (expected: Tara Vitamin A): ' || v_failed);
END;
/

-- ------------------------------------------------------------- summary
SET PAGESIZE 100 LINESIZE 140 ECHO OFF
COLUMN full_name FORMAT A16
COLUMN age FORMAT A16
COLUMN clinic_name FORMAT A32
COLUMN alert_type FORMAT A10
SELECT n.full_name, get_age_text(n.baby_id) AS age, c.clinic_name,
       COUNT(d.record_id) AS doses,
       COUNT(CASE WHEN d.status = 'DONE'    THEN 1 END) AS done,
       COUNT(CASE WHEN d.status = 'PENDING' THEN 1 END) AS pending,
       COUNT(CASE WHEN d.status = 'OVERDUE' THEN 1 END) AS overdue,
       get_coverage_pct(n.baby_id) AS coverage_pct
  FROM newborns n
  JOIN clinics c ON c.clinic_id = n.clinic_id
  JOIN dose_records d ON d.baby_id = n.baby_id
 GROUP BY n.baby_id, n.full_name, c.clinic_name
 ORDER BY n.baby_id;

SELECT alert_type, COUNT(*) AS alerts FROM alerts GROUP BY alert_type ORDER BY alert_type;

PROMPT 10_seed_demo.sql complete.
