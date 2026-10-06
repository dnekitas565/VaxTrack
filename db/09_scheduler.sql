-- ============================================================================
-- 09_scheduler.sql  --  DBMS_SCHEDULER job JOB_DAILY_VAX_SWEEP
-- Owner  : vaxapp (needs the CREATE JOB privilege)
-- Runs daily at 01:00: refresh_overdue_status, send_due_soon_alerts(7), expiry_sweep(30).
-- The API also calls refresh_overdue_status when the dashboard loads, so demos
-- work without waiting for the job. To run the job now:
--   EXEC DBMS_SCHEDULER.RUN_JOB('JOB_DAILY_VAX_SWEEP', use_current_session => FALSE);
--   SELECT status, error# FROM user_scheduler_job_run_details ORDER BY log_date DESC;
-- ============================================================================
SET DEFINE OFF
SET ECHO ON

BEGIN
  -- re-runnable: drop an older copy first
  FOR r IN (SELECT job_name FROM user_scheduler_jobs WHERE job_name = 'JOB_DAILY_VAX_SWEEP') LOOP
    DBMS_SCHEDULER.DROP_JOB(job_name => r.job_name, force => TRUE);
  END LOOP;

  DBMS_SCHEDULER.CREATE_JOB(
    job_name        => 'JOB_DAILY_VAX_SWEEP',
    job_type        => 'PLSQL_BLOCK',
    job_action      => 'BEGIN
                          newborn_vaccination_pkg.refresh_overdue_status;
                          send_due_soon_alerts(7);
                          vaccine_inventory_pkg.expiry_sweep(30);
                        END;',
    start_date      => SYSTIMESTAMP,
    repeat_interval => 'FREQ=DAILY;BYHOUR=1;BYMINUTE=0;BYSECOND=0',
    enabled         => TRUE,
    comments        => 'VaxTrack daily sweep: overdue status, due-soon alerts, expiry alerts');
END;
/

SELECT job_name, enabled, repeat_interval, TO_CHAR(next_run_date, 'YYYY-MM-DD HH24:MI') AS next_run
  FROM user_scheduler_jobs;

PROMPT 09_scheduler.sql complete.
