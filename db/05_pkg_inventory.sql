-- ============================================================================
-- 05_pkg_inventory.sql  --  vaccine_inventory_pkg (spec + body)
-- Owner  : vaxapp
-- Purpose: stock handling: restock, FEFO batch choice, expiry alerts.
-- Error codes (shared table is in newborn_vaccination_pkg):
--   -20002 vaccine not found      -20009 no usable stock (empty or expired)
--   -20014 invalid input          -20015 clinic not found
--   -20016 user not found         -20099 unexpected error
-- Transactions: restock and expiry_sweep COMMIT on success and ROLLBACK TO their
--   savepoint on failure. pick_batch only reads (no locks), so the API can use it
--   for a "batch preview"; the guarded UPDATE in mark_dose_administered is what
--   protects against two nurses taking the last dose.
-- NOTE: the spec below is also created at the top of 04_pkg_newborn.sql so that
--   04 compiles before this file runs. Keep both specs identical.
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

CREATE OR REPLACE PACKAGE BODY vaccine_inventory_pkg AS

  c_err_vaccine_missing CONSTANT PLS_INTEGER := -20002;
  c_err_no_stock        CONSTANT PLS_INTEGER := -20009;
  c_err_invalid_input   CONSTANT PLS_INTEGER := -20014;
  c_err_clinic_missing  CONSTANT PLS_INTEGER := -20015;
  c_err_user_missing    CONSTANT PLS_INTEGER := -20016;
  c_err_unexpected      CONSTANT PLS_INTEGER := -20099;

  -- ------------------------------------------------------------------ restock
  PROCEDURE restock (
    p_clinic_id   IN NUMBER,
    p_vaccine_id  IN NUMBER,
    p_batch_no    IN VARCHAR2,
    p_expiry_date IN DATE,
    p_qty         IN NUMBER,
    p_user_id     IN NUMBER DEFAULT NULL
  ) IS
    v_count     PLS_INTEGER;
    v_inv       vaccine_inventory.inventory_id%TYPE;
    v_new_qty   vaccine_inventory.quantity%TYPE;
    v_actor     VARCHAR2(100);
    v_action    audit_log.action%TYPE;
    v_old_value audit_log.old_value%TYPE;
    v_code      PLS_INTEGER;
    v_msg       VARCHAR2(4000);
  BEGIN
    SAVEPOINT sp_restock;

    IF p_batch_no IS NULL OR TRIM(p_batch_no) IS NULL THEN
      RAISE_APPLICATION_ERROR(c_err_invalid_input, 'Batch number is required');
    END IF;
    IF p_qty IS NULL OR p_qty <= 0 OR p_qty <> TRUNC(p_qty) THEN
      RAISE_APPLICATION_ERROR(c_err_invalid_input, 'Quantity must be a positive whole number');
    END IF;
    IF p_expiry_date IS NULL OR TRUNC(p_expiry_date) < TRUNC(SYSDATE) THEN
      RAISE_APPLICATION_ERROR(c_err_invalid_input, 'Expiry date must be today or later');
    END IF;

    SELECT COUNT(*) INTO v_count FROM clinics WHERE clinic_id = p_clinic_id;
    IF v_count = 0 THEN
      RAISE_APPLICATION_ERROR(c_err_clinic_missing, 'Clinic not found: ' || NVL(TO_CHAR(p_clinic_id), 'NULL'));
    END IF;
    SELECT COUNT(*) INTO v_count FROM vaccine_master WHERE vaccine_id = p_vaccine_id;
    IF v_count = 0 THEN
      RAISE_APPLICATION_ERROR(c_err_vaccine_missing, 'Vaccine not found: ' || NVL(TO_CHAR(p_vaccine_id), 'NULL'));
    END IF;
    IF p_user_id IS NOT NULL THEN
      BEGIN
        SELECT username INTO v_actor FROM app_users WHERE user_id = p_user_id;
      EXCEPTION
        WHEN NO_DATA_FOUND THEN
          RAISE_APPLICATION_ERROR(c_err_user_missing, 'User not found: ' || p_user_id);
      END;
    ELSE
      v_actor := NVL(SYS_CONTEXT('USERENV', 'CLIENT_INFO'), SYS_CONTEXT('USERENV', 'SESSION_USER'));
    END IF;

    -- merge: add to the existing batch, otherwise create it
    UPDATE vaccine_inventory
       SET quantity    = quantity + p_qty,
           expiry_date = TRUNC(p_expiry_date)
     WHERE clinic_id = p_clinic_id
       AND vaccine_id = p_vaccine_id
       AND batch_no = TRIM(p_batch_no)
    RETURNING inventory_id, quantity INTO v_inv, v_new_qty;

    IF SQL%ROWCOUNT > 0 THEN
      v_action    := 'UPDATE';
      v_old_value := 'quantity=' || (v_new_qty - p_qty);
    ELSE
      INSERT INTO vaccine_inventory (clinic_id, vaccine_id, batch_no, expiry_date, quantity)
      VALUES (p_clinic_id, p_vaccine_id, TRIM(p_batch_no), TRUNC(p_expiry_date), p_qty)
      RETURNING inventory_id, quantity INTO v_inv, v_new_qty;
      v_action    := 'INSERT';
      v_old_value := NULL;
    END IF;

    INSERT INTO audit_log (table_name, record_id, action, old_value, new_value, changed_by)
    VALUES ('VACCINE_INVENTORY', v_inv, v_action, v_old_value,
            'quantity=' || v_new_qty || '; expiry=' || TO_CHAR(TRUNC(p_expiry_date), 'YYYY-MM-DD'),
            v_actor);

    COMMIT;
  EXCEPTION
    WHEN OTHERS THEN
      v_code := SQLCODE;
      v_msg  := SQLERRM;
      ROLLBACK TO sp_restock;
      IF v_code BETWEEN -20999 AND -20000 THEN
        RAISE;
      END IF;
      RAISE_APPLICATION_ERROR(c_err_unexpected, 'Restock failed: ' || v_msg);
  END restock;

  -- --------------------------------------------------------------- pick_batch
  FUNCTION pick_batch (
    p_clinic_id  IN NUMBER,
    p_vaccine_id IN NUMBER
  ) RETURN NUMBER IS
    v_inv vaccine_inventory.inventory_id%TYPE;
  BEGIN
    SELECT inventory_id
      INTO v_inv
      FROM (SELECT inventory_id
              FROM vaccine_inventory
             WHERE clinic_id = p_clinic_id
               AND vaccine_id = p_vaccine_id
               AND quantity > 0
               AND expiry_date >= TRUNC(SYSDATE)
             ORDER BY expiry_date, inventory_id)
     WHERE ROWNUM = 1;
    RETURN v_inv;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RAISE_APPLICATION_ERROR(c_err_no_stock,
        'No usable stock (empty or expired) for vaccine ' || NVL(TO_CHAR(p_vaccine_id), 'NULL')
        || ' at clinic ' || NVL(TO_CHAR(p_clinic_id), 'NULL'));
  END pick_batch;

  -- ------------------------------------------------------------- expiry_sweep
  PROCEDURE expiry_sweep (
    p_days IN NUMBER DEFAULT 30
  ) IS
    -- parameterized cursor: batches with stock expiring within p_window days (or already expired)
    CURSOR c_expiring (p_window NUMBER) IS
      SELECT i.clinic_id, i.batch_no, i.expiry_date,
             dose_label(v.vaccine_name, v.dose_number) AS vaccine_label
        FROM vaccine_inventory i
        JOIN vaccine_master v ON v.vaccine_id = i.vaccine_id
       WHERE i.quantity > 0
         AND i.expiry_date <= TRUNC(SYSDATE) + p_window
       ORDER BY i.expiry_date, i.inventory_id;
    v_message alerts.message%TYPE;
    v_code    PLS_INTEGER;
    v_msg     VARCHAR2(4000);
  BEGIN
    SAVEPOINT sp_expiry;
    IF p_days IS NULL OR p_days < 0 THEN
      RAISE_APPLICATION_ERROR(c_err_invalid_input, 'Days window must be zero or more');
    END IF;

    FOR r IN c_expiring(p_days) LOOP
      -- message is stable per batch (no changing counters) so the sweep never duplicates an alert
      v_message := 'Batch ' || r.batch_no || ' of ' || r.vaccine_label
                   || CASE WHEN r.expiry_date < TRUNC(SYSDATE) THEN ' expired on ' ELSE ' expires on ' END
                   || TO_CHAR(r.expiry_date, 'YYYY-MM-DD');
      INSERT INTO alerts (clinic_id, alert_type, message)
      SELECT r.clinic_id, 'EXPIRY', v_message
        FROM dual
       WHERE NOT EXISTS (SELECT 1 FROM alerts a
                          WHERE a.alert_type = 'EXPIRY'
                            AND a.clinic_id = r.clinic_id
                            AND a.message = v_message);
    END LOOP;
    COMMIT;
  EXCEPTION
    WHEN OTHERS THEN
      v_code := SQLCODE;
      v_msg  := SQLERRM;
      ROLLBACK TO sp_expiry;
      IF v_code BETWEEN -20999 AND -20000 THEN
        RAISE;
      END IF;
      RAISE_APPLICATION_ERROR(c_err_unexpected, 'Expiry sweep failed: ' || v_msg);
  END expiry_sweep;

END vaccine_inventory_pkg;
/
SHOW ERRORS PACKAGE BODY vaccine_inventory_pkg

PROMPT 05_pkg_inventory.sql complete.
