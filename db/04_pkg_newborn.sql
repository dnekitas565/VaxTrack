-- ============================================================================
-- 04_pkg_newborn.sql  --  newborn_vaccination_pkg (spec + body)
-- Owner  : vaxapp
-- Purpose: registration, schedule generation, dose administration with stock
--          deduction, rescheduling, overdue sweep, audit actor.
--
-- ERROR CODES (whole project, RAISE_APPLICATION_ERROR range -20001..-20099)
--   -20001 baby not found
--   -20002 vaccine not found
--   -20003 date of birth in the future (trigger trg_newborn_dob_check)
--   -20004 dose record not found
--   -20005 dose already administered
--   -20006 administered date before date of birth
--   -20007 administered date in the future
--   -20008 baby too young for this dose (age < min_age_days)
--   -20009 no usable stock: empty or expired (vaccine_inventory_pkg.pick_batch)
--   -20010 cannot reschedule a dose that is already DONE
--   -20011 reschedule date is in the past
--   -20012 reschedule date outside the allowed age window
--   -20013 a DONE dose cannot go back to PENDING (trigger trg_dose_status_guard)
--   -20014 invalid input
--   -20015 clinic not found
--   -20016 user not found
--   -20017 guardian already has a login (account_pkg)
--   -20018 username already taken (account_pkg)
--   -20019 invalid account data (account_pkg)
--   -20020 date of birth cannot change: a dose already given would fall before its minimum age
--   -20021 only an administrator may change or delete a newborn record
--   -20099 unexpected error (original Oracle message is appended)
--
-- TRANSACTIONS
--   register_newborn, mark_dose_administered, reschedule_dose and
--   refresh_overdue_status are complete units of work: each sets a SAVEPOINT,
--   COMMITs on success and ROLLBACKs TO the savepoint on any failure.
--   generate_schedule does NOT commit (it is a building block of register_newborn).
--
-- register_newborn creates the guardian's parent login through account_pkg (file 03b), which
--   therefore has to exist first.
--
-- NOTE: the first statement below creates the vaccine_inventory_pkg SPEC so this
--   file compiles before 05_pkg_inventory.sql runs. It is a copy of the spec in
--   05 and must stay identical to it.
-- ============================================================================
SET DEFINE OFF
SET ECHO ON

CREATE OR REPLACE PACKAGE vaccine_inventory_pkg AS
  -- Insert a new batch or add p_qty to an existing batch (clinic + vaccine + batch_no).
  PROCEDURE restock (
    p_clinic_id   IN NUMBER,
    p_vaccine_id  IN NUMBER,
    p_batch_no    IN VARCHAR2,
    p_expiry_date IN DATE,
    p_qty         IN NUMBER,
    p_user_id     IN NUMBER DEFAULT NULL
  );

  -- FEFO: inventory_id of the non-expired batch with stock that expires first.
  -- Raises -20009 when there is none.
  FUNCTION pick_batch (
    p_clinic_id  IN NUMBER,
    p_vaccine_id IN NUMBER
  ) RETURN NUMBER;

  -- Insert EXPIRY alerts for batches (with stock) that expire within p_days, or already expired.
  PROCEDURE expiry_sweep (
    p_days IN NUMBER DEFAULT 30
  );
END vaccine_inventory_pkg;
/
SHOW ERRORS PACKAGE vaccine_inventory_pkg

CREATE OR REPLACE PACKAGE newborn_vaccination_pkg AS
  -- error codes (public so tests and docs can refer to them by name)
  c_err_baby_missing    CONSTANT PLS_INTEGER := -20001;
  c_err_vaccine_missing CONSTANT PLS_INTEGER := -20002;
  c_err_dob_future      CONSTANT PLS_INTEGER := -20003;
  c_err_dose_missing    CONSTANT PLS_INTEGER := -20004;
  c_err_already_done    CONSTANT PLS_INTEGER := -20005;
  c_err_date_before_dob CONSTANT PLS_INTEGER := -20006;
  c_err_date_future     CONSTANT PLS_INTEGER := -20007;
  c_err_too_early       CONSTANT PLS_INTEGER := -20008;
  c_err_no_stock        CONSTANT PLS_INTEGER := -20009;
  c_err_resched_done    CONSTANT PLS_INTEGER := -20010;
  c_err_resched_past    CONSTANT PLS_INTEGER := -20011;
  c_err_resched_window  CONSTANT PLS_INTEGER := -20012;
  c_err_done_to_pending CONSTANT PLS_INTEGER := -20013;
  c_err_invalid_input   CONSTANT PLS_INTEGER := -20014;
  c_err_clinic_missing  CONSTANT PLS_INTEGER := -20015;
  c_err_user_missing    CONSTANT PLS_INTEGER := -20016;
  c_err_dob_conflict    CONSTANT PLS_INTEGER := -20020;
  c_err_not_admin       CONSTANT PLS_INTEGER := -20021;
  c_err_unexpected      CONSTANT PLS_INTEGER := -20099;

  -- Record who is acting; the audit trigger reads it from CLIENT_INFO.
  -- NULL clears it. Call once per API request / session.
  PROCEDURE set_actor (p_user_id IN NUMBER);

  -- Create PENDING dose rows for a baby from vaccine_master. Idempotent.
  -- JE (is_regional = 'Y') rows are added only when p_include_regional = 'Y'.
  PROCEDURE generate_schedule (
    p_baby_id          IN NUMBER,
    p_include_regional IN VARCHAR2 DEFAULT 'N'
  );

  -- One transaction: guardian (reused by phone) + newborn + full schedule.
  PROCEDURE register_newborn (
    p_guardian_name    IN  VARCHAR2,
    p_guardian_phone   IN  VARCHAR2,
    p_guardian_email   IN  VARCHAR2,
    p_guardian_address IN  VARCHAR2,
    p_baby_name        IN  VARCHAR2,
    p_gender           IN  VARCHAR2,
    p_dob              IN  DATE,
    p_birth_weight_kg  IN  NUMBER,
    p_clinic_id        IN  NUMBER,
    p_include_regional IN  VARCHAR2,
    p_baby_id          OUT NUMBER
  );

  -- Same, and also creates the guardian's PARENT login when the guardian has none yet:
  -- username from the guardian's name (account_pkg.suggest_username), password hash supplied by
  -- the API. p_parent_username is NULL when no new login was needed (guardian already had one,
  -- or p_parent_hash is NULL). p_guardian_name and p_guardian_address may be NULL when the phone number belongs to a
  -- known guardian: the stored guardian details are kept and the given ones are ignored.
  PROCEDURE register_newborn (
    p_guardian_name    IN  VARCHAR2,
    p_guardian_phone   IN  VARCHAR2,
    p_guardian_email   IN  VARCHAR2,
    p_guardian_address IN  VARCHAR2,
    p_baby_name        IN  VARCHAR2,
    p_gender           IN  VARCHAR2,
    p_dob              IN  DATE,
    p_birth_weight_kg  IN  NUMBER,
    p_clinic_id        IN  NUMBER,
    p_include_regional IN  VARCHAR2,
    p_baby_id          OUT NUMBER,
    p_parent_hash      IN  VARCHAR2,
    p_parent_username  OUT VARCHAR2
  );

  -- 'Y' when a guardian is registered with this phone number, else 'N'. Same matching rule as
  -- register_newborn, so a form can tell the nurse beforehand what the save will do.
  FUNCTION guardian_exists (p_phone IN VARCHAR2) RETURN VARCHAR2;

  -- 'Y' when the baby is old enough (age >= min_age_days) for the dose, else 'N'.
  FUNCTION is_dose_allowed (p_record_id IN NUMBER) RETURN VARCHAR2;

  -- Core transaction: validate, pick FEFO batch, deduct stock, set DONE, flag late doses.
  -- p_administered_date NULL means today. p_clinic_id is the clinic whose stock is used.
  PROCEDURE mark_dose_administered (
    p_record_id         IN NUMBER,
    p_administered_date IN DATE,
    p_clinic_id         IN NUMBER,
    p_user_id           IN NUMBER
  );

  -- Move a non-DONE dose to a new date (today or later, inside its age window).
  PROCEDURE reschedule_dose (
    p_record_id IN NUMBER,
    p_new_date  IN DATE,
    p_reason    IN VARCHAR2,
    p_user_id   IN NUMBER
  );

  -- Touch every PENDING dose whose date has passed so the guard trigger flips it to OVERDUE.
  PROCEDURE refresh_overdue_status;

  -- ADMIN ONLY. Correct a newborn's details. A changed date of birth moves the due date of every
  -- dose that is not DONE; doses already given keep their date, and the change is refused (-20020)
  -- if one of them would fall before its minimum age. Late flags and stale alerts are recalculated.
  PROCEDURE update_newborn (
    p_baby_id         IN NUMBER,
    p_baby_name       IN VARCHAR2,
    p_gender          IN VARCHAR2,
    p_dob             IN DATE,
    p_birth_weight_kg IN NUMBER,
    p_user_id         IN NUMBER
  );

  -- ADMIN ONLY. Delete a newborn with its doses and alerts. p_restore_stock = 'Y' puts the vaccine
  -- doses that were recorded as given back into stock (use it when the record was a mistake).
  -- The guardian and the guardian's login are kept.
  PROCEDURE delete_newborn (
    p_baby_id       IN NUMBER,
    p_user_id       IN NUMBER,
    p_restore_stock IN VARCHAR2 DEFAULT 'N'
  );
END newborn_vaccination_pkg;
/
SHOW ERRORS PACKAGE newborn_vaccination_pkg

CREATE OR REPLACE PACKAGE BODY newborn_vaccination_pkg AS

  -- ---------------------------------------------------------------- set_actor
  PROCEDURE set_actor (p_user_id IN NUMBER) IS
    v_username app_users.username%TYPE;
  BEGIN
    IF p_user_id IS NULL THEN
      DBMS_APPLICATION_INFO.SET_CLIENT_INFO(NULL);
      RETURN;
    END IF;
    BEGIN
      SELECT username INTO v_username FROM app_users WHERE user_id = p_user_id;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        v_username := 'unknown';
    END;
    DBMS_APPLICATION_INFO.SET_CLIENT_INFO(SUBSTR(v_username || ' (id ' || p_user_id || ')', 1, 64));
  END set_actor;

  -- --------------------------------------------------------- generate_schedule
  PROCEDURE generate_schedule (
    p_baby_id          IN NUMBER,
    p_include_regional IN VARCHAR2 DEFAULT 'N'
  ) IS
    -- explicit cursor over the schedule table
    CURSOR c_vaccines (p_regional VARCHAR2) IS
      SELECT vaccine_id
        FROM vaccine_master
       WHERE is_regional = 'N' OR p_regional = 'Y'
       ORDER BY due_age_days, vaccine_id;
    v_vaccine_id vaccine_master.vaccine_id%TYPE;
    v_count      PLS_INTEGER;
  BEGIN
    SELECT COUNT(*) INTO v_count FROM newborns WHERE baby_id = p_baby_id;
    IF v_count = 0 THEN
      RAISE_APPLICATION_ERROR(c_err_baby_missing, 'Baby not found: ' || NVL(TO_CHAR(p_baby_id), 'NULL'));
    END IF;

    OPEN c_vaccines(CASE WHEN UPPER(p_include_regional) = 'Y' THEN 'Y' ELSE 'N' END);
    LOOP
      FETCH c_vaccines INTO v_vaccine_id;
      EXIT WHEN c_vaccines%NOTFOUND;

      INSERT INTO dose_records (baby_id, vaccine_id, scheduled_date, status)
      SELECT p_baby_id, v_vaccine_id, calculate_due_date(p_baby_id, v_vaccine_id), 'PENDING'
        FROM dual
       WHERE NOT EXISTS (SELECT 1 FROM dose_records d
                          WHERE d.baby_id = p_baby_id AND d.vaccine_id = v_vaccine_id);
    END LOOP;
    CLOSE c_vaccines;
  EXCEPTION
    WHEN OTHERS THEN
      IF c_vaccines%ISOPEN THEN
        CLOSE c_vaccines;
      END IF;
      RAISE;
  END generate_schedule;

  -- ---------------------------------------------------------- register_newborn
  PROCEDURE register_newborn (
    p_guardian_name    IN  VARCHAR2,
    p_guardian_phone   IN  VARCHAR2,
    p_guardian_email   IN  VARCHAR2,
    p_guardian_address IN  VARCHAR2,
    p_baby_name        IN  VARCHAR2,
    p_gender           IN  VARCHAR2,
    p_dob              IN  DATE,
    p_birth_weight_kg  IN  NUMBER,
    p_clinic_id        IN  NUMBER,
    p_include_regional IN  VARCHAR2,
    p_baby_id          OUT NUMBER,
    p_parent_hash      IN  VARCHAR2,
    p_parent_username  OUT VARCHAR2
  ) IS
    v_guardian_id guardians.guardian_id%TYPE;
    v_login_count PLS_INTEGER;
    v_uid         NUMBER;
    v_gname       guardians.full_name%TYPE;
    v_username    app_users.username%TYPE;
    v_baby_id     newborns.baby_id%TYPE;
    v_phone       guardians.phone%TYPE := TRIM(p_guardian_phone);
    v_count       PLS_INTEGER;
    v_code        PLS_INTEGER;
    v_msg         VARCHAR2(4000);
  BEGIN
    SAVEPOINT sp_register;
    p_baby_id := NULL;
    p_parent_username := NULL;

    -- input validation
    IF TRIM(p_baby_name) IS NULL THEN
      RAISE_APPLICATION_ERROR(c_err_invalid_input, 'Baby name is required');
    END IF;
    IF v_phone IS NULL OR NOT REGEXP_LIKE(v_phone, '^[0-9+ -]{7,15}$') THEN
      RAISE_APPLICATION_ERROR(c_err_invalid_input, 'Guardian phone must be 7-15 digits');
    END IF;
    IF p_gender IS NULL OR UPPER(p_gender) NOT IN ('M', 'F', 'O') THEN
      RAISE_APPLICATION_ERROR(c_err_invalid_input, 'Gender must be M, F or O');
    END IF;
    IF p_dob IS NULL THEN
      RAISE_APPLICATION_ERROR(c_err_invalid_input, 'Date of birth is required');
    END IF;
    SELECT COUNT(*) INTO v_count FROM clinics WHERE clinic_id = p_clinic_id;
    IF v_count = 0 THEN
      RAISE_APPLICATION_ERROR(c_err_clinic_missing, 'Clinic not found: ' || NVL(TO_CHAR(p_clinic_id), 'NULL'));
    END IF;

    -- guardian: reuse by phone, else insert (a new guardian needs a name)
    BEGIN
      SELECT guardian_id INTO v_guardian_id FROM guardians WHERE phone = v_phone;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        IF TRIM(p_guardian_name) IS NULL THEN
          RAISE_APPLICATION_ERROR(c_err_invalid_input, 'Guardian name is required for a new guardian');
        END IF;
        IF TRIM(p_guardian_address) IS NULL THEN
          RAISE_APPLICATION_ERROR(c_err_invalid_input, 'Guardian address is required for a new guardian');
        END IF;
        INSERT INTO guardians (full_name, phone, email, address)
        VALUES (TRIM(p_guardian_name), v_phone, TRIM(p_guardian_email), TRIM(p_guardian_address))
        RETURNING guardian_id INTO v_guardian_id;
    END;

    -- newborn (trg_newborn_dob_check rejects a future DOB with -20003, which rolls the guardian back too)
    INSERT INTO newborns (guardian_id, clinic_id, full_name, gender, date_of_birth, birth_weight_kg)
    VALUES (v_guardian_id, p_clinic_id, TRIM(p_baby_name), UPPER(p_gender), TRUNC(p_dob), p_birth_weight_kg)
    RETURNING baby_id INTO v_baby_id;

    generate_schedule(v_baby_id, p_include_regional);

    -- every guardian gets a login (once): username from the name, same transaction as the baby
    IF p_parent_hash IS NOT NULL THEN
      SELECT COUNT(*) INTO v_login_count FROM app_users WHERE guardian_id = v_guardian_id;
      IF v_login_count = 0 THEN
        SELECT full_name INTO v_gname FROM guardians WHERE guardian_id = v_guardian_id;
        v_username := account_pkg.suggest_username(v_gname);
        account_pkg.add_user(v_username, p_parent_hash, 'PARENT', v_gname, NULL, v_guardian_id, v_uid);
        p_parent_username := v_username;
      END IF;
    END IF;

    COMMIT;
    p_baby_id := v_baby_id;
  EXCEPTION
    WHEN OTHERS THEN
      v_code := SQLCODE;
      v_msg  := SQLERRM;
      ROLLBACK TO sp_register;
      p_baby_id := NULL;
      p_parent_username := NULL;
      IF v_code BETWEEN -20999 AND -20000 THEN
        RAISE;
      END IF;
      RAISE_APPLICATION_ERROR(c_err_unexpected, 'Registration failed: ' || v_msg);
  END register_newborn;

  -- original signature: registers without creating a login
  PROCEDURE register_newborn (
    p_guardian_name    IN  VARCHAR2,
    p_guardian_phone   IN  VARCHAR2,
    p_guardian_email   IN  VARCHAR2,
    p_guardian_address IN  VARCHAR2,
    p_baby_name        IN  VARCHAR2,
    p_gender           IN  VARCHAR2,
    p_dob              IN  DATE,
    p_birth_weight_kg  IN  NUMBER,
    p_clinic_id        IN  NUMBER,
    p_include_regional IN  VARCHAR2,
    p_baby_id          OUT NUMBER
  ) IS
    v_no_login VARCHAR2(60);
  BEGIN
    register_newborn(p_guardian_name, p_guardian_phone, p_guardian_email, p_guardian_address,
                     p_baby_name, p_gender, p_dob, p_birth_weight_kg, p_clinic_id, p_include_regional,
                     p_baby_id, NULL, v_no_login);
  END register_newborn;

  -- --------------------------------------------------------- guardian_exists
  FUNCTION guardian_exists (p_phone IN VARCHAR2) RETURN VARCHAR2 IS
    v_count PLS_INTEGER;
  BEGIN
    SELECT COUNT(*) INTO v_count FROM guardians WHERE phone = TRIM(p_phone);
    RETURN CASE WHEN v_count > 0 THEN 'Y' ELSE 'N' END;
  END guardian_exists;

  -- ----------------------------------------------------------- is_dose_allowed
  FUNCTION is_dose_allowed (p_record_id IN NUMBER) RETURN VARCHAR2 IS
    v_dob DATE;
    v_min vaccine_master.min_age_days%TYPE;
  BEGIN
    SELECT n.date_of_birth, v.min_age_days
      INTO v_dob, v_min
      FROM dose_records d
      JOIN newborns n       ON n.baby_id = d.baby_id
      JOIN vaccine_master v ON v.vaccine_id = d.vaccine_id
     WHERE d.record_id = p_record_id;
    RETURN CASE WHEN TRUNC(SYSDATE) - TRUNC(v_dob) >= v_min THEN 'Y' ELSE 'N' END;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RAISE_APPLICATION_ERROR(c_err_dose_missing, 'Dose record not found: ' || NVL(TO_CHAR(p_record_id), 'NULL'));
  END is_dose_allowed;

  -- ----------------------------------------------------- mark_dose_administered
  PROCEDURE mark_dose_administered (
    p_record_id         IN NUMBER,
    p_administered_date IN DATE,
    p_clinic_id         IN NUMBER,
    p_user_id           IN NUMBER
  ) IS
    v_status      dose_records.status%TYPE;
    v_baby_id     dose_records.baby_id%TYPE;
    v_vaccine_id  dose_records.vaccine_id%TYPE;
    v_dob         newborns.date_of_birth%TYPE;
    v_baby_name   newborns.full_name%TYPE;
    v_baby_clinic newborns.clinic_id%TYPE;
    v_min_age     vaccine_master.min_age_days%TYPE;
    v_max_age     vaccine_master.max_age_days%TYPE;
    v_label       VARCHAR2(100);
    v_date        DATE;
    v_age_days    PLS_INTEGER;
    v_inventory   vaccine_inventory.inventory_id%TYPE;
    v_late        CHAR(1) := 'N';
    v_count       PLS_INTEGER;
    v_code        PLS_INTEGER;
    v_msg         VARCHAR2(4000);
  BEGIN
    -- the savepoint comes first so a failure at any step also releases the row lock
    SAVEPOINT sp_administer;

    IF p_user_id IS NOT NULL THEN
      SELECT COUNT(*) INTO v_count FROM app_users WHERE user_id = p_user_id;
      IF v_count = 0 THEN
        RAISE_APPLICATION_ERROR(c_err_user_missing, 'User not found: ' || p_user_id);
      END IF;
    END IF;
    SELECT COUNT(*) INTO v_count FROM clinics WHERE clinic_id = p_clinic_id;
    IF v_count = 0 THEN
      RAISE_APPLICATION_ERROR(c_err_clinic_missing, 'Clinic not found: ' || NVL(TO_CHAR(p_clinic_id), 'NULL'));
    END IF;
    set_actor(p_user_id);

    -- 1. lock the dose row and read everything the checks need
    BEGIN
      SELECT d.status, d.baby_id, d.vaccine_id, n.date_of_birth, n.full_name, n.clinic_id,
             v.min_age_days, v.max_age_days, dose_label(v.vaccine_name, v.dose_number)
        INTO v_status, v_baby_id, v_vaccine_id, v_dob, v_baby_name, v_baby_clinic,
             v_min_age, v_max_age, v_label
        FROM dose_records d
        JOIN newborns n       ON n.baby_id = d.baby_id
        JOIN vaccine_master v ON v.vaccine_id = d.vaccine_id
       WHERE d.record_id = p_record_id
         FOR UPDATE OF d.status;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        RAISE_APPLICATION_ERROR(c_err_dose_missing, 'Dose record not found: ' || NVL(TO_CHAR(p_record_id), 'NULL'));
    END;

    v_date     := TRUNC(NVL(p_administered_date, SYSDATE));
    v_age_days := v_date - TRUNC(v_dob);

    IF v_status = 'DONE' THEN
      RAISE_APPLICATION_ERROR(c_err_already_done, v_label || ' was already administered to ' || v_baby_name);
    ELSIF v_date < TRUNC(v_dob) THEN
      RAISE_APPLICATION_ERROR(c_err_date_before_dob, 'Administered date is before the date of birth');
    ELSIF v_date > TRUNC(SYSDATE) THEN
      RAISE_APPLICATION_ERROR(c_err_date_future, 'Administered date cannot be in the future');
    ELSIF v_age_days < v_min_age THEN
      RAISE_APPLICATION_ERROR(c_err_too_early,
        v_label || ' cannot be given before day ' || v_min_age || ' (baby is ' || v_age_days || ' days old)');
    END IF;

    -- 2. FEFO batch (raises -20009 when empty or expired)
    v_inventory := vaccine_inventory_pkg.pick_batch(p_clinic_id, v_vaccine_id);

    -- 3. deduct stock; the quantity > 0 guard catches a concurrent session taking the last dose
    UPDATE vaccine_inventory
       SET quantity = quantity - 1
     WHERE inventory_id = v_inventory
       AND quantity > 0;
    IF SQL%ROWCOUNT = 0 THEN
      RAISE_APPLICATION_ERROR(c_err_no_stock, 'The last dose of the selected batch was just used; please retry');
    END IF;

    IF v_age_days > v_max_age THEN
      v_late := 'Y';
    END IF;

    UPDATE dose_records
       SET status            = 'DONE',
           administered_date = v_date,
           inventory_id      = v_inventory,
           administered_by   = p_user_id,
           is_late           = v_late
     WHERE record_id = p_record_id;

    IF v_late = 'Y' THEN
      INSERT INTO alerts (baby_id, record_id, clinic_id, alert_type, message)
      VALUES (v_baby_id, p_record_id, v_baby_clinic, 'LATE_DOSE',
              v_label || ' for ' || v_baby_name || ' was given late (day ' || v_age_days
              || ', recommended by day ' || v_max_age || ')');
    END IF;

    COMMIT;
  EXCEPTION
    WHEN OTHERS THEN
      -- 4. any failure: undo stock and dose together, then report clearly
      v_code := SQLCODE;
      v_msg  := SQLERRM;
      ROLLBACK TO sp_administer;
      IF v_code BETWEEN -20999 AND -20000 THEN
        RAISE;
      END IF;
      RAISE_APPLICATION_ERROR(c_err_unexpected, 'Could not record the dose: ' || v_msg);
  END mark_dose_administered;

  -- ------------------------------------------------------------ reschedule_dose
  PROCEDURE reschedule_dose (
    p_record_id IN NUMBER,
    p_new_date  IN DATE,
    p_reason    IN VARCHAR2,
    p_user_id   IN NUMBER
  ) IS
    v_status    dose_records.status%TYPE;
    v_old_date  dose_records.scheduled_date%TYPE;
    v_dob       newborns.date_of_birth%TYPE;
    v_min_age   vaccine_master.min_age_days%TYPE;
    v_max_age   vaccine_master.max_age_days%TYPE;
    v_new_date  DATE;
    v_count     PLS_INTEGER;
    v_code      PLS_INTEGER;
    v_msg       VARCHAR2(4000);
  BEGIN
    SAVEPOINT sp_reschedule;

    IF p_new_date IS NULL OR TRIM(p_reason) IS NULL THEN
      RAISE_APPLICATION_ERROR(c_err_invalid_input, 'A new date and a reason are required');
    END IF;
    IF p_user_id IS NOT NULL THEN
      SELECT COUNT(*) INTO v_count FROM app_users WHERE user_id = p_user_id;
      IF v_count = 0 THEN
        RAISE_APPLICATION_ERROR(c_err_user_missing, 'User not found: ' || p_user_id);
      END IF;
    END IF;
    set_actor(p_user_id);

    BEGIN
      SELECT d.status, d.scheduled_date, n.date_of_birth, v.min_age_days, v.max_age_days
        INTO v_status, v_old_date, v_dob, v_min_age, v_max_age
        FROM dose_records d
        JOIN newborns n       ON n.baby_id = d.baby_id
        JOIN vaccine_master v ON v.vaccine_id = d.vaccine_id
       WHERE d.record_id = p_record_id
         FOR UPDATE OF d.status;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        RAISE_APPLICATION_ERROR(c_err_dose_missing, 'Dose record not found: ' || NVL(TO_CHAR(p_record_id), 'NULL'));
    END;

    v_new_date := TRUNC(p_new_date);
    IF v_status = 'DONE' THEN
      RAISE_APPLICATION_ERROR(c_err_resched_done, 'A dose that is already administered cannot be rescheduled');
    ELSIF v_new_date < TRUNC(SYSDATE) THEN
      RAISE_APPLICATION_ERROR(c_err_resched_past, 'The new date cannot be in the past');
    ELSIF v_new_date < TRUNC(v_dob) + v_min_age OR v_new_date > TRUNC(v_dob) + v_max_age THEN
      RAISE_APPLICATION_ERROR(c_err_resched_window,
        'The new date must be between ' || TO_CHAR(TRUNC(v_dob) + v_min_age, 'YYYY-MM-DD')
        || ' and ' || TO_CHAR(TRUNC(v_dob) + v_max_age, 'YYYY-MM-DD'));
    END IF;

    -- status goes back to PENDING (an OVERDUE dose with a valid new date is pending again);
    -- the guard trigger would flip it back to OVERDUE if the date were still in the past.
    UPDATE dose_records
       SET scheduled_date = v_new_date,
           status         = 'PENDING',
           remarks        = SUBSTR('Rescheduled from ' || TO_CHAR(v_old_date, 'YYYY-MM-DD')
                                   || ': ' || TRIM(p_reason), 1, 500)
     WHERE record_id = p_record_id;

    COMMIT;
  EXCEPTION
    WHEN OTHERS THEN
      v_code := SQLCODE;
      v_msg  := SQLERRM;
      ROLLBACK TO sp_reschedule;
      IF v_code BETWEEN -20999 AND -20000 THEN
        RAISE;
      END IF;
      RAISE_APPLICATION_ERROR(c_err_unexpected, 'Could not reschedule the dose: ' || v_msg);
  END reschedule_dose;

  -- ------------------------------------------------------ refresh_overdue_status
  PROCEDURE refresh_overdue_status IS
    v_flipped PLS_INTEGER := 0;
    v_code    PLS_INTEGER;
    v_msg     VARCHAR2(4000);
  BEGIN
    SAVEPOINT sp_overdue;

    -- cursor FOR loop; "status = status" is deliberate: the update itself does nothing,
    -- but it makes trg_dose_status_guard flip PENDING + past due to OVERDUE and
    -- trg_dose_alerts raise the alert (a row trigger only fires when its row is touched).
    FOR r IN (SELECT record_id
                FROM dose_records
               WHERE status = 'PENDING'
                 AND scheduled_date < TRUNC(SYSDATE)) LOOP
      -- the status guard matters: a dose marked DONE (or already flipped by a parallel sweep)
      -- after the cursor read it is skipped instead of tripping trg_dose_status_guard
      UPDATE dose_records SET status = 'PENDING'
       WHERE record_id = r.record_id AND status = 'PENDING';
      v_flipped := v_flipped + SQL%ROWCOUNT;
    END LOOP;

    COMMIT;
    DBMS_OUTPUT.PUT_LINE('refresh_overdue_status: ' || v_flipped || ' dose(s) checked');
  EXCEPTION
    WHEN OTHERS THEN
      v_code := SQLCODE;
      v_msg  := SQLERRM;
      ROLLBACK TO sp_overdue;
      IF v_code BETWEEN -20999 AND -20000 THEN
        RAISE;
      END IF;
      RAISE_APPLICATION_ERROR(c_err_unexpected, 'Overdue refresh failed: ' || v_msg);
  END refresh_overdue_status;


  -- ================================================================== admin tools
  -- private: only an ADMIN account may use update_newborn / delete_newborn
  PROCEDURE require_admin (p_user_id IN NUMBER) IS
    v_role app_users.role%TYPE;
  BEGIN
    SELECT role INTO v_role FROM app_users WHERE user_id = p_user_id;
    IF v_role <> 'ADMIN' THEN
      RAISE_APPLICATION_ERROR(c_err_not_admin, 'Only an administrator can change or delete a newborn record');
    END IF;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RAISE_APPLICATION_ERROR(c_err_not_admin, 'Only an administrator can change or delete a newborn record');
  END require_admin;

  -- one-line description of a newborn row, used in the audit log
  FUNCTION newborn_text (p_name VARCHAR2, p_gender VARCHAR2, p_dob DATE, p_weight NUMBER) RETURN VARCHAR2 IS
  BEGIN
    RETURN 'name=' || p_name || '; gender=' || p_gender || '; dob=' || TO_CHAR(p_dob, 'YYYY-MM-DD')
           || '; weight=' || NVL(TO_CHAR(p_weight), '-');
  END newborn_text;

  -- --------------------------------------------------------------- update_newborn
  PROCEDURE update_newborn (
    p_baby_id         IN NUMBER,
    p_baby_name       IN VARCHAR2,
    p_gender          IN VARCHAR2,
    p_dob             IN DATE,
    p_birth_weight_kg IN NUMBER,
    p_user_id         IN NUMBER
  ) IS
    v_old     newborns%ROWTYPE;
    v_new_dob DATE;
    v_old_text VARCHAR2(500);
    v_new_text VARCHAR2(500);
    v_actor   audit_log.changed_by%TYPE;
    v_code    PLS_INTEGER;
    v_msg     VARCHAR2(4000);
  BEGIN
    SAVEPOINT sp_update_newborn;
    require_admin(p_user_id);
    set_actor(p_user_id);

    IF TRIM(p_baby_name) IS NULL OR p_gender IS NULL OR UPPER(p_gender) NOT IN ('M', 'F', 'O') OR p_dob IS NULL
       OR (p_birth_weight_kg IS NOT NULL AND p_birth_weight_kg NOT BETWEEN 0.5 AND 9.99) THEN
      RAISE_APPLICATION_ERROR(c_err_invalid_input, 'Name, gender (M, F or O) and date of birth are required; weight must be 0.5 to 9.99 kg');
    END IF;

    BEGIN
      SELECT * INTO v_old FROM newborns WHERE baby_id = p_baby_id FOR UPDATE;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        RAISE_APPLICATION_ERROR(c_err_baby_missing, 'Baby not found: ' || NVL(TO_CHAR(p_baby_id), 'NULL'));
    END;
    v_new_dob := TRUNC(p_dob);

    IF v_new_dob <> TRUNC(v_old.date_of_birth) THEN
      -- doses already given must stay valid under the new date of birth
      FOR r IN (SELECT dose_label(v.vaccine_name, v.dose_number) AS label, d.administered_date, v.min_age_days
                  FROM dose_records d JOIN vaccine_master v ON v.vaccine_id = d.vaccine_id
                 WHERE d.baby_id = p_baby_id AND d.status = 'DONE'
                   AND d.administered_date - v_new_dob < v.min_age_days
                 ORDER BY d.administered_date) LOOP
        RAISE_APPLICATION_ERROR(c_err_dob_conflict,
          r.label || ' was given on ' || TO_CHAR(r.administered_date, 'YYYY-MM-DD')
          || ', which is before its minimum age (day ' || r.min_age_days || ') under the new date of birth');
      END LOOP;
    END IF;

    -- trg_newborn_dob_check rejects a future date (-20003)
    UPDATE newborns
       SET full_name = TRIM(p_baby_name), gender = UPPER(p_gender),
           date_of_birth = v_new_dob, birth_weight_kg = p_birth_weight_kg
     WHERE baby_id = p_baby_id;

    IF v_new_dob <> TRUNC(v_old.date_of_birth) THEN
      -- overdue / due-soon alerts of unfinished doses describe the old dates: drop them,
      -- the status guard and alert trigger raise fresh ones for doses that are overdue now
      DELETE FROM alerts
       WHERE baby_id = p_baby_id AND alert_type IN ('OVERDUE', 'DUE_SOON')
         AND record_id IN (SELECT record_id FROM dose_records WHERE baby_id = p_baby_id AND status <> 'DONE');

      UPDATE dose_records d
         SET scheduled_date = v_new_dob + (SELECT v.due_age_days FROM vaccine_master v WHERE v.vaccine_id = d.vaccine_id),
             status = 'PENDING'
       WHERE d.baby_id = p_baby_id AND d.status <> 'DONE';

      -- late flags of given doses depend on the age at the time they were given
      UPDATE dose_records d
         SET is_late = CASE WHEN d.administered_date - v_new_dob >
                                 (SELECT v.max_age_days FROM vaccine_master v WHERE v.vaccine_id = d.vaccine_id)
                            THEN 'Y' ELSE 'N' END
       WHERE d.baby_id = p_baby_id AND d.status = 'DONE';

      DELETE FROM alerts WHERE baby_id = p_baby_id AND alert_type = 'LATE_DOSE';
      INSERT INTO alerts (baby_id, record_id, clinic_id, alert_type, message)
      SELECT d.baby_id, d.record_id, n.clinic_id, 'LATE_DOSE',
             dose_label(v.vaccine_name, v.dose_number) || ' for ' || n.full_name || ' was given late (day '
             || (d.administered_date - v_new_dob) || ', recommended by day ' || v.max_age_days || ')'
        FROM dose_records d
        JOIN newborns n       ON n.baby_id = d.baby_id
        JOIN vaccine_master v ON v.vaccine_id = d.vaccine_id
       WHERE d.baby_id = p_baby_id AND d.status = 'DONE' AND d.is_late = 'Y';
    END IF;

    v_actor := NVL(SYS_CONTEXT('USERENV', 'CLIENT_INFO'), SYS_CONTEXT('USERENV', 'SESSION_USER'));
    v_old_text := newborn_text(v_old.full_name, v_old.gender, v_old.date_of_birth, v_old.birth_weight_kg);
    v_new_text := newborn_text(TRIM(p_baby_name), UPPER(p_gender), v_new_dob, p_birth_weight_kg);
    INSERT INTO audit_log (table_name, record_id, action, old_value, new_value, changed_by)
    VALUES ('NEWBORNS', p_baby_id, 'UPDATE', v_old_text, v_new_text, v_actor);
    COMMIT;
  EXCEPTION
    WHEN OTHERS THEN
      v_code := SQLCODE;
      v_msg  := SQLERRM;
      ROLLBACK TO sp_update_newborn;
      IF v_code BETWEEN -20999 AND -20000 THEN
        RAISE;
      END IF;
      RAISE_APPLICATION_ERROR(c_err_unexpected, 'Could not update the newborn: ' || v_msg);
  END update_newborn;

  -- --------------------------------------------------------------- delete_newborn
  PROCEDURE delete_newborn (
    p_baby_id       IN NUMBER,
    p_user_id       IN NUMBER,
    p_restore_stock IN VARCHAR2 DEFAULT 'N'
  ) IS
    v_old    newborns%ROWTYPE;
    v_text   VARCHAR2(500);
    v_given  PLS_INTEGER;
    v_actor  audit_log.changed_by%TYPE;
    v_code   PLS_INTEGER;
    v_msg    VARCHAR2(4000);
  BEGIN
    SAVEPOINT sp_delete_newborn;
    require_admin(p_user_id);
    set_actor(p_user_id);

    BEGIN
      SELECT * INTO v_old FROM newborns WHERE baby_id = p_baby_id FOR UPDATE;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        RAISE_APPLICATION_ERROR(c_err_baby_missing, 'Baby not found: ' || NVL(TO_CHAR(p_baby_id), 'NULL'));
    END;

    SELECT COUNT(*) INTO v_given FROM dose_records WHERE baby_id = p_baby_id AND status = 'DONE';

    IF UPPER(p_restore_stock) = 'Y' THEN
      UPDATE vaccine_inventory i
         SET quantity = quantity + (SELECT COUNT(*) FROM dose_records d
                                     WHERE d.baby_id = p_baby_id AND d.status = 'DONE' AND d.inventory_id = i.inventory_id)
       WHERE i.inventory_id IN (SELECT d.inventory_id FROM dose_records d
                                 WHERE d.baby_id = p_baby_id AND d.status = 'DONE' AND d.inventory_id IS NOT NULL);
    END IF;

    DELETE FROM alerts WHERE baby_id = p_baby_id;
    DELETE FROM dose_records WHERE baby_id = p_baby_id;   -- trg_dose_audit logs each deleted dose
    DELETE FROM newborns WHERE baby_id = p_baby_id;

    v_actor := NVL(SYS_CONTEXT('USERENV', 'CLIENT_INFO'), SYS_CONTEXT('USERENV', 'SESSION_USER'));
    v_text := newborn_text(v_old.full_name, v_old.gender, v_old.date_of_birth, v_old.birth_weight_kg)
              || '; doses given=' || v_given;
    INSERT INTO audit_log (table_name, record_id, action, old_value, new_value, changed_by)
    VALUES ('NEWBORNS', p_baby_id, 'DELETE', v_text,
            CASE WHEN UPPER(p_restore_stock) = 'Y' THEN 'stock restored' ELSE 'stock not restored' END,
            v_actor);
    COMMIT;
  EXCEPTION
    WHEN OTHERS THEN
      v_code := SQLCODE;
      v_msg  := SQLERRM;
      ROLLBACK TO sp_delete_newborn;
      IF v_code BETWEEN -20999 AND -20000 THEN
        RAISE;
      END IF;
      RAISE_APPLICATION_ERROR(c_err_unexpected, 'Could not delete the newborn: ' || v_msg);
  END delete_newborn;

END newborn_vaccination_pkg;
/
SHOW ERRORS PACKAGE BODY newborn_vaccination_pkg

PROMPT 04_pkg_newborn.sql complete.
