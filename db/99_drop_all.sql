-- ============================================================================
-- 99_drop_all.sql  --  Full reset of the vaxapp schema
-- Owner  : vaxapp. Safe on an empty schema (every drop is looked up first).
-- WARNING: removes EVERY table, sequence, view, package, procedure, function,
--          trigger and scheduler job in the connected schema. vaxapp is a
--          dedicated project schema, so this is the intended behavior.
-- ============================================================================
SET DEFINE OFF
SET SERVEROUTPUT ON
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK

BEGIN
  -- scheduler job first (it calls packages)
  FOR r IN (SELECT job_name FROM user_scheduler_jobs) LOOP
    DBMS_SCHEDULER.DROP_JOB(job_name => r.job_name, force => TRUE);
    DBMS_OUTPUT.PUT_LINE('dropped job ' || r.job_name);
  END LOOP;

  -- code objects
  FOR r IN (SELECT object_type, object_name FROM user_objects
             WHERE object_type IN ('TRIGGER','PACKAGE','PROCEDURE','FUNCTION','VIEW')
             ORDER BY CASE object_type WHEN 'TRIGGER' THEN 1 WHEN 'VIEW' THEN 2 ELSE 3 END) LOOP
    EXECUTE IMMEDIATE 'DROP ' || r.object_type || ' "' || r.object_name || '"';
    DBMS_OUTPUT.PUT_LINE('dropped ' || LOWER(r.object_type) || ' ' || r.object_name);
  END LOOP;

  -- tables (identity sequences go with them)
  FOR r IN (SELECT table_name FROM user_tables WHERE dropped = 'NO') LOOP
    EXECUTE IMMEDIATE 'DROP TABLE "' || r.table_name || '" CASCADE CONSTRAINTS PURGE';
    DBMS_OUTPUT.PUT_LINE('dropped table ' || r.table_name);
  END LOOP;

  -- any remaining plain sequences (identity ones are already gone)
  FOR r IN (SELECT sequence_name FROM user_sequences) LOOP
    BEGIN
      EXECUTE IMMEDIATE 'DROP SEQUENCE "' || r.sequence_name || '"';
      DBMS_OUTPUT.PUT_LINE('dropped sequence ' || r.sequence_name);
    EXCEPTION WHEN OTHERS THEN NULL; -- system-generated identity sequence, ignore
    END;
  END LOOP;
END;
/

PROMPT 99_drop_all.sql complete.
