-- ============================================================================
-- 03_functions.sql  --  standalone functions
-- Owner  : vaxapp
-- Error codes used here (full table: header of newborn_vaccination_pkg):
--   -20001 baby not found, -20002 vaccine not found
-- ============================================================================
SET DEFINE OFF
SET ECHO ON

-- ----------------------------------------------------------------------------
-- calculate_due_date
-- Purpose : due date of one vaccine for one baby = date_of_birth + due_age_days
-- Params  : p_baby_id, p_vaccine_id
-- Returns : DATE.  Raises -20001 / -20002 if the baby / vaccine does not exist.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION calculate_due_date (
  p_baby_id    IN NUMBER,
  p_vaccine_id IN NUMBER
) RETURN DATE
IS
  v_dob  newborns.date_of_birth%TYPE;
  v_days vaccine_master.due_age_days%TYPE;
BEGIN
  BEGIN
    SELECT date_of_birth INTO v_dob FROM newborns WHERE baby_id = p_baby_id;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RAISE_APPLICATION_ERROR(-20001, 'Baby not found: ' || NVL(TO_CHAR(p_baby_id), 'NULL'));
  END;
  BEGIN
    SELECT due_age_days INTO v_days FROM vaccine_master WHERE vaccine_id = p_vaccine_id;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RAISE_APPLICATION_ERROR(-20002, 'Vaccine not found: ' || NVL(TO_CHAR(p_vaccine_id), 'NULL'));
  END;
  RETURN TRUNC(v_dob) + v_days;
END calculate_due_date;
/
SHOW ERRORS FUNCTION calculate_due_date

-- ----------------------------------------------------------------------------
-- get_age_text
-- Purpose : human readable age, e.g. "3 months 12 days", "12 days", "Born today"
-- Params  : p_baby_id
-- Returns : VARCHAR2.  Raises -20001 if the baby does not exist.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_age_text (
  p_baby_id IN NUMBER
) RETURN VARCHAR2
IS
  v_dob    newborns.date_of_birth%TYPE;
  v_months PLS_INTEGER;
  v_days   PLS_INTEGER;

  FUNCTION plural(p_n IN PLS_INTEGER, p_unit IN VARCHAR2) RETURN VARCHAR2 IS
  BEGIN
    RETURN p_n || ' ' || p_unit || CASE WHEN p_n = 1 THEN '' ELSE 's' END;
  END plural;
BEGIN
  BEGIN
    SELECT TRUNC(date_of_birth) INTO v_dob FROM newborns WHERE baby_id = p_baby_id;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RAISE_APPLICATION_ERROR(-20001, 'Baby not found: ' || NVL(TO_CHAR(p_baby_id), 'NULL'));
  END;

  v_months := TRUNC(MONTHS_BETWEEN(TRUNC(SYSDATE), v_dob));
  v_days   := TRUNC(SYSDATE) - ADD_MONTHS(v_dob, v_months);

  IF v_months = 0 AND v_days = 0 THEN
    RETURN 'Born today';
  ELSIF v_months = 0 THEN
    RETURN plural(v_days, 'day');
  ELSIF v_days = 0 THEN
    RETURN plural(v_months, 'month');
  END IF;
  RETURN plural(v_months, 'month') || ' ' || plural(v_days, 'day');
END get_age_text;
/
SHOW ERRORS FUNCTION get_age_text

-- ----------------------------------------------------------------------------
-- get_coverage_pct
-- Purpose : DONE doses / total scheduled doses * 100, one decimal. 0 if no doses.
-- Params  : p_baby_id
-- Returns : NUMBER.  Raises -20001 if the baby does not exist.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_coverage_pct (
  p_baby_id IN NUMBER
) RETURN NUMBER
IS
  v_exists PLS_INTEGER;
  v_total  PLS_INTEGER;
  v_done   PLS_INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_exists FROM newborns WHERE baby_id = p_baby_id;
  IF v_exists = 0 THEN
    RAISE_APPLICATION_ERROR(-20001, 'Baby not found: ' || NVL(TO_CHAR(p_baby_id), 'NULL'));
  END IF;

  SELECT COUNT(*), COUNT(CASE WHEN status = 'DONE' THEN 1 END)
    INTO v_total, v_done
    FROM dose_records
   WHERE baby_id = p_baby_id;

  IF v_total = 0 THEN
    RETURN 0;
  END IF;
  RETURN ROUND(v_done / v_total * 100, 1);
END get_coverage_pct;
/
SHOW ERRORS FUNCTION get_coverage_pct

-- ----------------------------------------------------------------------------
-- get_next_due_dose
-- Purpose : record_id of the earliest dose that is not DONE yet (ties: lowest record_id)
-- Params  : p_baby_id
-- Returns : NUMBER (record_id) or NULL when every dose is DONE / none scheduled.
--           Raises -20001 if the baby does not exist.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_next_due_dose (
  p_baby_id IN NUMBER
) RETURN NUMBER
IS
  v_exists    PLS_INTEGER;
  v_record_id dose_records.record_id%TYPE;
BEGIN
  SELECT COUNT(*) INTO v_exists FROM newborns WHERE baby_id = p_baby_id;
  IF v_exists = 0 THEN
    RAISE_APPLICATION_ERROR(-20001, 'Baby not found: ' || NVL(TO_CHAR(p_baby_id), 'NULL'));
  END IF;

  SELECT record_id
    INTO v_record_id
    FROM (SELECT record_id
            FROM dose_records
           WHERE baby_id = p_baby_id
             AND status <> 'DONE'
           ORDER BY scheduled_date, record_id)
   WHERE ROWNUM = 1;
  RETURN v_record_id;
EXCEPTION
  WHEN NO_DATA_FOUND THEN
    RETURN NULL;
END get_next_due_dose;
/
SHOW ERRORS FUNCTION get_next_due_dose

-- ----------------------------------------------------------------------------
-- dose_label
-- Purpose : display name of a dose, following the NIS wording, e.g.
--           bOPV-1, Pentavalent-2, BCG, PCV Booster, DPT Booster-1, Vitamin A (1st dose)
-- Params  : p_vaccine_name, p_dose_number (both from vaccine_master)
-- Returns : VARCHAR2.  Deterministic, so it is usable inside SQL.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION dose_label (
  p_vaccine_name IN VARCHAR2,
  p_dose_number  IN NUMBER
) RETURN VARCHAR2 DETERMINISTIC
IS
BEGIN
  IF p_vaccine_name IN ('BCG', 'Hepatitis B Birth dose', 'PCV Booster', 'bOPV Booster') THEN
    RETURN p_vaccine_name;
  ELSIF p_vaccine_name = 'Vitamin A' THEN
    RETURN p_vaccine_name || ' (' || p_dose_number
           || CASE p_dose_number WHEN 1 THEN 'st' WHEN 2 THEN 'nd' WHEN 3 THEN 'rd' ELSE 'th' END
           || ' dose)';
  END IF;
  RETURN p_vaccine_name || '-' || p_dose_number;
END dose_label;
/
SHOW ERRORS FUNCTION dose_label

PROMPT 03_functions.sql complete.
