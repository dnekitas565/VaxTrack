-- ============================================================================
-- 08_triggers.sql  --  all triggers
-- Owner  : vaxapp
-- Rule   : no row-level trigger reads the table that fired it (avoids ORA-04091,
--          the mutating-table error). They only read OTHER tables.
-- Error codes: -20003 DOB in the future, -20006/-20007 administered date, -20013 DONE -> PENDING
-- ============================================================================
SET DEFINE OFF
SET ECHO ON

-- ----------------------------------------------------------------------------
-- trg_newborn_dob_check : a DOB cannot be in the future (CHECK cannot use SYSDATE)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE TRIGGER trg_newborn_dob_check
BEFORE INSERT OR UPDATE OF date_of_birth ON newborns
FOR EACH ROW
BEGIN
  IF TRUNC(:NEW.date_of_birth) > TRUNC(SYSDATE) THEN
    RAISE_APPLICATION_ERROR(-20003, 'Date of birth cannot be in the future');
  END IF;
END trg_newborn_dob_check;
/
SHOW ERRORS TRIGGER trg_newborn_dob_check

-- ----------------------------------------------------------------------------
-- trg_dose_status_guard
--   * DONE can never go back to PENDING / OVERDUE
--   * a new administered_date must be on/after the DOB and not in the future
--   * PENDING with a date in the past becomes OVERDUE
-- ----------------------------------------------------------------------------
CREATE OR REPLACE TRIGGER trg_dose_status_guard
BEFORE UPDATE ON dose_records
FOR EACH ROW
DECLARE
  v_dob newborns.date_of_birth%TYPE;
BEGIN
  IF :OLD.status = 'DONE' AND :NEW.status <> 'DONE' THEN
    RAISE_APPLICATION_ERROR(-20013, 'A dose that is DONE cannot be changed back to ' || :NEW.status);
  END IF;

  IF :NEW.administered_date IS NOT NULL
     AND (:OLD.administered_date IS NULL OR :NEW.administered_date <> :OLD.administered_date) THEN
    SELECT date_of_birth INTO v_dob FROM newborns WHERE baby_id = :NEW.baby_id;
    IF TRUNC(:NEW.administered_date) < TRUNC(v_dob) THEN
      RAISE_APPLICATION_ERROR(-20006, 'Administered date is before the date of birth');
    ELSIF TRUNC(:NEW.administered_date) > TRUNC(SYSDATE) THEN
      RAISE_APPLICATION_ERROR(-20007, 'Administered date cannot be in the future');
    END IF;
  END IF;

  IF :NEW.status = 'PENDING' AND :NEW.scheduled_date < TRUNC(SYSDATE) THEN
    :NEW.status := 'OVERDUE';
  END IF;
END trg_dose_status_guard;
/
SHOW ERRORS TRIGGER trg_dose_status_guard

-- ----------------------------------------------------------------------------
-- trg_dose_alerts : OVERDUE alert when a dose becomes OVERDUE, once per dose record
-- ----------------------------------------------------------------------------
CREATE OR REPLACE TRIGGER trg_dose_alerts
AFTER UPDATE OF status ON dose_records
FOR EACH ROW
WHEN (NEW.status = 'OVERDUE' AND OLD.status <> 'OVERDUE')
BEGIN
  INSERT INTO alerts (baby_id, record_id, clinic_id, alert_type, message)
  SELECT n.baby_id, :NEW.record_id, n.clinic_id, 'OVERDUE',
         dose_label(v.vaccine_name, v.dose_number) || ' for ' || n.full_name
         || ' is overdue (was due ' || TO_CHAR(:NEW.scheduled_date, 'YYYY-MM-DD') || ')'
    FROM newborns n, vaccine_master v
   WHERE n.baby_id = :NEW.baby_id
     AND v.vaccine_id = :NEW.vaccine_id
     AND NOT EXISTS (SELECT 1 FROM alerts a
                      WHERE a.record_id = :NEW.record_id AND a.alert_type = 'OVERDUE');
END trg_dose_alerts;
/
SHOW ERRORS TRIGGER trg_dose_alerts

-- ----------------------------------------------------------------------------
-- trg_dose_audit : every insert / update / delete on dose_records goes to audit_log.
-- The actor comes from CLIENT_INFO (newborn_vaccination_pkg.set_actor); jobs and
-- plain SQL sessions fall back to the database user.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE TRIGGER trg_dose_audit
AFTER INSERT OR UPDATE OR DELETE ON dose_records
FOR EACH ROW
DECLARE
  v_action audit_log.action%TYPE;
  v_actor  audit_log.changed_by%TYPE;
  v_old    audit_log.old_value%TYPE;
  v_new    audit_log.new_value%TYPE;

  FUNCTION fmt (p_status VARCHAR2, p_sched DATE, p_given DATE, p_late VARCHAR2, p_inv NUMBER)
    RETURN VARCHAR2 IS
  BEGIN
    RETURN 'status=' || p_status
           || '; scheduled=' || TO_CHAR(p_sched, 'YYYY-MM-DD')
           || '; given='     || NVL(TO_CHAR(p_given, 'YYYY-MM-DD'), '-')
           || '; late='      || p_late
           || '; batch='     || NVL(TO_CHAR(p_inv), '-');
  END fmt;
BEGIN
  v_actor := NVL(SYS_CONTEXT('USERENV', 'CLIENT_INFO'), SYS_CONTEXT('USERENV', 'SESSION_USER'));

  IF INSERTING THEN
    v_action := 'INSERT';
    v_new := fmt(:NEW.status, :NEW.scheduled_date, :NEW.administered_date, :NEW.is_late, :NEW.inventory_id);
  ELSIF UPDATING THEN
    v_action := 'UPDATE';
    v_old := fmt(:OLD.status, :OLD.scheduled_date, :OLD.administered_date, :OLD.is_late, :OLD.inventory_id);
    v_new := fmt(:NEW.status, :NEW.scheduled_date, :NEW.administered_date, :NEW.is_late, :NEW.inventory_id);
  ELSE
    v_action := 'DELETE';
    v_old := fmt(:OLD.status, :OLD.scheduled_date, :OLD.administered_date, :OLD.is_late, :OLD.inventory_id);
  END IF;

  INSERT INTO audit_log (table_name, record_id, action, old_value, new_value, changed_by)
  VALUES ('DOSE_RECORDS', COALESCE(:NEW.record_id, :OLD.record_id), v_action, v_old, v_new, v_actor);
END trg_dose_audit;
/
SHOW ERRORS TRIGGER trg_dose_audit

-- ----------------------------------------------------------------------------
-- trg_inventory_low_stock : LOW_STOCK alert when a batch drops BELOW its threshold.
-- It fires on the crossing (old >= threshold, new < threshold), so it raises one
-- alert while the batch stays low, and again only after a restock lifts it above.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE TRIGGER trg_inventory_low_stock
AFTER UPDATE OF quantity ON vaccine_inventory
FOR EACH ROW
WHEN (NEW.quantity < NEW.low_stock_threshold AND OLD.quantity >= OLD.low_stock_threshold)
DECLARE
  v_label VARCHAR2(100);
BEGIN
  SELECT dose_label(vaccine_name, dose_number) INTO v_label
    FROM vaccine_master WHERE vaccine_id = :NEW.vaccine_id;

  INSERT INTO alerts (clinic_id, alert_type, message)
  VALUES (:NEW.clinic_id, 'LOW_STOCK',
          'Low stock: batch ' || :NEW.batch_no || ' of ' || v_label || ' has ' || :NEW.quantity
          || ' dose(s) left (threshold ' || :NEW.low_stock_threshold || ')');
END trg_inventory_low_stock;
/
SHOW ERRORS TRIGGER trg_inventory_low_stock

PROMPT 08_triggers.sql complete.
