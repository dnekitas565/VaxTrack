-- ============================================================================
-- run_all.sql  --  clean-state rebuild + verification, in one go
-- Run FROM THE db FOLDER, as vaxapp:
--     cd db
--     sqlplus vaxapp@localhost:1521/XEPDB1 @run_all.sql
-- Order: 99 (reset) -> 01 ... 10 -> final checks -> 11 (tests).
-- Writes everything it prints to ../report/run_all.log (appendix evidence).
-- WARNING: 99_drop_all.sql removes every object in the vaxapp schema.
-- ============================================================================
SET ECHO ON
SET DEFINE OFF
SET SERVEROUTPUT ON SIZE UNLIMITED
SET LINESIZE 160 PAGESIZE 100 TRIMSPOOL ON
SPOOL ../report/run_all.log

PROMPT ======================================================================
PROMPT  VaxTrack clean-state run
PROMPT ======================================================================
SELECT 'Run started ' || TO_CHAR(SYSDATE, 'YYYY-MM-DD HH24:MI:SS') || ' as ' || USER AS info FROM dual;

PROMPT >>> 99_drop_all.sql
@@99_drop_all.sql
PROMPT >>> 01_schema.sql
@@01_schema.sql
PROMPT >>> 02_seed_reference.sql
@@02_seed_reference.sql
PROMPT >>> 03_functions.sql
@@03_functions.sql
PROMPT >>> 03b_pkg_accounts.sql
@@03b_pkg_accounts.sql
PROMPT >>> 04_pkg_newborn.sql
@@04_pkg_newborn.sql
PROMPT >>> 05_pkg_inventory.sql
@@05_pkg_inventory.sql
PROMPT >>> 06_pkg_reporting.sql
@@06_pkg_reporting.sql
PROMPT >>> 07_procedures.sql
@@07_procedures.sql
PROMPT >>> 08_triggers.sql
@@08_triggers.sql
PROMPT >>> 09_scheduler.sql
@@09_scheduler.sql
PROMPT >>> 10_seed_demo.sql
@@10_seed_demo.sql

-- ------------------------------------------------------------ final checks
SET ECHO OFF FEEDBACK ON
PROMPT
PROMPT ======================================================================
PROMPT  Final checks before the tests
PROMPT ======================================================================
COLUMN object_type FORMAT A16
COLUMN object_name FORMAT A32
COLUMN status FORMAT A8
PROMPT -- invalid objects (must say: no rows selected)
SELECT object_name, object_type FROM user_objects WHERE status = 'INVALID';
PROMPT -- compile errors (must say: no rows selected)
SELECT name, type, line, text FROM user_errors;
PROMPT -- code objects
SELECT object_type, COUNT(*) AS objects, COUNT(CASE WHEN status = 'VALID' THEN 1 END) AS valid
  FROM user_objects
 WHERE object_type IN ('PACKAGE', 'PACKAGE BODY', 'FUNCTION', 'PROCEDURE', 'TRIGGER')
 GROUP BY object_type ORDER BY object_type;
PROMPT -- rows per table
SELECT 'clinics' AS table_name, COUNT(*) AS row_count FROM clinics UNION ALL
SELECT 'guardians', COUNT(*) FROM guardians UNION ALL
SELECT 'app_users', COUNT(*) FROM app_users UNION ALL
SELECT 'newborns', COUNT(*) FROM newborns UNION ALL
SELECT 'vaccine_master', COUNT(*) FROM vaccine_master UNION ALL
SELECT 'vaccine_inventory', COUNT(*) FROM vaccine_inventory UNION ALL
SELECT 'dose_records', COUNT(*) FROM dose_records UNION ALL
SELECT 'alerts', COUNT(*) FROM alerts UNION ALL
SELECT 'audit_log', COUNT(*) FROM audit_log UNION ALL
SELECT 'test_log', COUNT(*) FROM test_log;
PROMPT -- alerts produced by the seed (no hand-edits)
SELECT alert_type, COUNT(*) AS alerts FROM alerts GROUP BY alert_type ORDER BY alert_type;

-- ------------------------------------------------------------------ tests
PROMPT
PROMPT >>> 11_tests.sql
SET ECHO ON
@@11_tests.sql

SET ECHO OFF
PROMPT
PROMPT ======================================================================
PROMPT  Summary
PROMPT ======================================================================
SELECT result, COUNT(*) AS cases FROM test_log GROUP BY result ORDER BY result;
SELECT (SELECT COUNT(*) FROM user_objects WHERE status = 'INVALID') AS invalid_objects,
       (SELECT COUNT(*) FROM test_log WHERE result = 'FAIL') AS failed_tests
  FROM dual;
SELECT 'Run finished ' || TO_CHAR(SYSDATE, 'YYYY-MM-DD HH24:MI:SS') AS info FROM dual;
SPOOL OFF
