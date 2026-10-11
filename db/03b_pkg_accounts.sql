-- ============================================================================
-- 03b_pkg_accounts.sql  --  account_pkg (spec + body): creating nurse and parent logins
-- Owner  : vaxapp
-- Purpose: the rules for new accounts live here, in the database:
--            * NURSE needs an existing clinic, PARENT needs an existing guardian
--            * one login per guardian (every child's guardian can sign in, once)
--            * usernames are unique ignoring case
--            * a parent's default username is built from the guardian's name (suggest_username)
--          The password HASH is produced by the API (bcrypt); PL/SQL only stores it.
-- Error codes (shared table is in newborn_vaccination_pkg):
--   -20015 clinic not found      -20017 guardian already has a login
--   -20018 username already taken  -20019 invalid account data  -20099 unexpected
-- Transactions: add_user is a building block (no COMMIT) so register_newborn can create
--   the parent login inside its own transaction. create_user is the complete unit
--   used by the API: SAVEPOINT, COMMIT on success, ROLLBACK TO on failure.
-- File order: runs before 04 because newborn_vaccination_pkg calls add_user.
-- ============================================================================
SET DEFINE OFF
SET ECHO ON

CREATE OR REPLACE PACKAGE account_pkg AS
  c_err_clinic_missing     CONSTANT PLS_INTEGER := -20015;
  c_err_guardian_has_login CONSTANT PLS_INTEGER := -20017;
  c_err_username_taken     CONSTANT PLS_INTEGER := -20018;
  c_err_invalid_account    CONSTANT PLS_INTEGER := -20019;
  c_err_unexpected         CONSTANT PLS_INTEGER := -20099;

  -- next free "nurseN" username (nurse1, nurse2 ... highest number + 1)
  FUNCTION next_nurse_username RETURN VARCHAR2;

  -- Readable, free username for a person's name: "Priya Sharma" -> priya.sharma, and if that is
  -- taken priya.sharma2, priya.sharma3 ... Accents are folded (Zoë -> zoe). A name with fewer than
  -- 3 usable characters (an initial, a non-Latin name) falls back to parent, parent2 ...
  FUNCTION suggest_username (p_name IN VARCHAR2) RETURN VARCHAR2;

  -- Insert a NURSE or PARENT account and write an audit row. Does NOT commit.
  PROCEDURE add_user (
    p_username      IN  VARCHAR2,
    p_password_hash IN  VARCHAR2,
    p_role          IN  VARCHAR2,
    p_full_name     IN  VARCHAR2,
    p_clinic_id     IN  NUMBER DEFAULT NULL,
    p_guardian_id   IN  NUMBER DEFAULT NULL,
    p_user_id       OUT NUMBER
  );

  -- Complete unit of work for the API (admin creates an account).
  -- p_username NULL: a nurse gets next_nurse_username; a parent gets suggest_username(guardian name).
  PROCEDURE create_user (
    p_actor_id      IN  NUMBER,
    p_username      IN  VARCHAR2,
    p_password_hash IN  VARCHAR2,
    p_role          IN  VARCHAR2,
    p_full_name     IN  VARCHAR2,
    p_clinic_id     IN  NUMBER DEFAULT NULL,
    p_guardian_id   IN  NUMBER DEFAULT NULL,
    p_user_id       OUT NUMBER
  );
END account_pkg;
/
SHOW ERRORS PACKAGE account_pkg

CREATE OR REPLACE PACKAGE BODY account_pkg AS

  FUNCTION next_nurse_username RETURN VARCHAR2 IS
    v_next PLS_INTEGER;
  BEGIN
    SELECT NVL(MAX(TO_NUMBER(SUBSTR(username, 6))), 0) + 1
      INTO v_next
      FROM app_users
     WHERE REGEXP_LIKE(username, '^nurse[0-9]+$');
    RETURN 'nurse' || v_next;
  END next_nurse_username;

  -- ----------------------------------------------------------- suggest_username
  FUNCTION suggest_username (p_name IN VARCHAR2) RETURN VARCHAR2 IS
    c_base_max CONSTANT PLS_INTEGER := 34;   -- leaves room for a numeric suffix inside 40 characters
    v_base     VARCHAR2(200);
    v_try      VARCHAR2(60);
    v_n        PLS_INTEGER := 1;
    v_count    PLS_INTEGER;
  BEGIN
    -- fold accents to plain letters, lower-case, every run of other characters becomes one dot
    v_base := LOWER(CONVERT(TRIM(p_name), 'US7ASCII'));
    v_base := TRIM('.' FROM REGEXP_REPLACE(v_base, '[^a-z0-9]+', '.'));
    v_base := TRIM('.' FROM SUBSTR(v_base, 1, c_base_max));
    IF v_base IS NULL OR LENGTH(v_base) < 3 THEN
      v_base := 'parent';
    END IF;

    LOOP
      v_try := CASE WHEN v_n = 1 THEN v_base ELSE v_base || v_n END;
      SELECT COUNT(*) INTO v_count FROM app_users WHERE LOWER(username) = v_try;
      EXIT WHEN v_count = 0;
      v_n := v_n + 1;
    END LOOP;
    RETURN v_try;
  END suggest_username;

  -- ------------------------------------------------------------------ add_user
  PROCEDURE add_user (
    p_username      IN  VARCHAR2,
    p_password_hash IN  VARCHAR2,
    p_role          IN  VARCHAR2,
    p_full_name     IN  VARCHAR2,
    p_clinic_id     IN  NUMBER DEFAULT NULL,
    p_guardian_id   IN  NUMBER DEFAULT NULL,
    p_user_id       OUT NUMBER
  ) IS
    v_username app_users.username%TYPE := TRIM(p_username);
    v_count    PLS_INTEGER;
    v_actor    audit_log.changed_by%TYPE;
  BEGIN
    p_user_id := NULL;

    IF v_username IS NULL OR NOT REGEXP_LIKE(v_username, '^[A-Za-z0-9_.-]{3,40}$') THEN
      RAISE_APPLICATION_ERROR(c_err_invalid_account,
        'Username must be 3-40 characters: letters, digits, dot, dash or underscore');
    END IF;
    IF p_role IS NULL OR p_role NOT IN ('NURSE', 'PARENT') THEN
      RAISE_APPLICATION_ERROR(c_err_invalid_account, 'Only NURSE and PARENT accounts can be created here');
    END IF;
    IF p_password_hash IS NULL OR LENGTH(p_password_hash) NOT BETWEEN 50 AND 100 THEN
      RAISE_APPLICATION_ERROR(c_err_invalid_account, 'A valid password hash is required');
    END IF;
    IF TRIM(p_full_name) IS NULL THEN
      RAISE_APPLICATION_ERROR(c_err_invalid_account, 'Full name is required');
    END IF;

    IF p_role = 'NURSE' THEN
      IF p_clinic_id IS NULL OR p_guardian_id IS NOT NULL THEN
        RAISE_APPLICATION_ERROR(c_err_invalid_account, 'A nurse account needs a clinic and no guardian');
      END IF;
      SELECT COUNT(*) INTO v_count FROM clinics WHERE clinic_id = p_clinic_id;
      IF v_count = 0 THEN
        RAISE_APPLICATION_ERROR(c_err_clinic_missing, 'Clinic not found: ' || p_clinic_id);
      END IF;
    ELSE
      IF p_guardian_id IS NULL OR p_clinic_id IS NOT NULL THEN
        RAISE_APPLICATION_ERROR(c_err_invalid_account, 'A parent account needs a guardian and no clinic');
      END IF;
      SELECT COUNT(*) INTO v_count FROM guardians WHERE guardian_id = p_guardian_id;
      IF v_count = 0 THEN
        RAISE_APPLICATION_ERROR(c_err_invalid_account, 'Guardian not found: ' || p_guardian_id);
      END IF;
      SELECT COUNT(*) INTO v_count FROM app_users WHERE guardian_id = p_guardian_id;
      IF v_count > 0 THEN
        RAISE_APPLICATION_ERROR(c_err_guardian_has_login, 'This guardian already has a login');
      END IF;
    END IF;

    SELECT COUNT(*) INTO v_count FROM app_users WHERE LOWER(username) = LOWER(v_username);
    IF v_count > 0 THEN
      RAISE_APPLICATION_ERROR(c_err_username_taken, 'Username "' || v_username || '" is already taken');
    END IF;

    INSERT INTO app_users (username, password_hash, role, full_name, clinic_id, guardian_id)
    VALUES (v_username, p_password_hash, p_role, TRIM(p_full_name), p_clinic_id, p_guardian_id)
    RETURNING user_id INTO p_user_id;

    v_actor := NVL(SYS_CONTEXT('USERENV', 'CLIENT_INFO'), SYS_CONTEXT('USERENV', 'SESSION_USER'));
    INSERT INTO audit_log (table_name, record_id, action, new_value, changed_by)
    VALUES ('APP_USERS', p_user_id, 'INSERT',
            'username=' || v_username || '; role=' || p_role
            || CASE WHEN p_clinic_id IS NOT NULL THEN '; clinic=' || p_clinic_id END
            || CASE WHEN p_guardian_id IS NOT NULL THEN '; guardian=' || p_guardian_id END,
            v_actor);
  END add_user;

  -- -------------------------------------------------------------- create_user
  PROCEDURE create_user (
    p_actor_id      IN  NUMBER,
    p_username      IN  VARCHAR2,
    p_password_hash IN  VARCHAR2,
    p_role          IN  VARCHAR2,
    p_full_name     IN  VARCHAR2,
    p_clinic_id     IN  NUMBER DEFAULT NULL,
    p_guardian_id   IN  NUMBER DEFAULT NULL,
    p_user_id       OUT NUMBER
  ) IS
    v_username app_users.username%TYPE := TRIM(p_username);
    v_actor    app_users.username%TYPE;
    v_gname    guardians.full_name%TYPE;
    v_code     PLS_INTEGER;
    v_msg      VARCHAR2(4000);
  BEGIN
    SAVEPOINT sp_create_user;

    IF p_actor_id IS NOT NULL THEN
      BEGIN
        SELECT username INTO v_actor FROM app_users WHERE user_id = p_actor_id;
        DBMS_APPLICATION_INFO.SET_CLIENT_INFO(SUBSTR(v_actor || ' (id ' || p_actor_id || ')', 1, 64));
      EXCEPTION
        WHEN NO_DATA_FOUND THEN NULL;
      END;
    END IF;

    IF v_username IS NULL THEN
      IF p_role = 'NURSE' THEN
        v_username := next_nurse_username;
      ELSIF p_role = 'PARENT' THEN
        BEGIN
          SELECT full_name INTO v_gname FROM guardians WHERE guardian_id = p_guardian_id;
          v_username := suggest_username(v_gname);
        EXCEPTION
          WHEN NO_DATA_FOUND THEN
            RAISE_APPLICATION_ERROR(c_err_invalid_account, 'Guardian not found: ' || NVL(TO_CHAR(p_guardian_id), 'NULL'));
        END;
      END IF;
    END IF;

    add_user(v_username, p_password_hash, p_role, p_full_name, p_clinic_id, p_guardian_id, p_user_id);
    COMMIT;
  EXCEPTION
    WHEN OTHERS THEN
      v_code := SQLCODE;
      v_msg  := SQLERRM;
      ROLLBACK TO sp_create_user;
      p_user_id := NULL;
      IF v_code BETWEEN -20999 AND -20000 THEN
        RAISE;
      END IF;
      RAISE_APPLICATION_ERROR(c_err_unexpected, 'Could not create the account: ' || v_msg);
  END create_user;

END account_pkg;
/
SHOW ERRORS PACKAGE BODY account_pkg

PROMPT 03b_pkg_accounts.sql complete.
