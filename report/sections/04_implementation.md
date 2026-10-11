# 4. IMPLEMENTATION

All business rules live in the database: the scripts in `db/` are run in numeric order on an empty schema (`99_drop_all.sql` resets it, and every script can be run again) and the whole chain is run by `run_all.sql` (Figure 4.1). After compilation no object is invalid (Figure 4.2). The project contains five standalone functions, one standalone procedure, four packages, five triggers, one scheduler job and all four kinds of cursor. Errors are raised with `RAISE_APPLICATION_ERROR` in the range −20001 to −20099; the table of codes is at the top of `db/04_pkg_newborn.sql`. The language features are those of the Oracle PL/SQL Language Reference [3].

**[ INSERT IMAGE: report/figures/fig_05_run_all_clean_run.png ]**

*Figure 4.1: Scripts 99 to 11 running in order on an empty schema*

**[ INSERT IMAGE: report/figures/fig_06_plsql_objects_valid.png ]**

*Figure 4.2: PL/SQL functions, procedures, packages and triggers, all VALID*

## 4.1 Functions

Five standalone functions (`db/03_functions.sql`) compute the values the rest of the system relies on.

| Function | Returns | Purpose |
|---|---|---|
| `calculate_due_date(p_baby_id, p_vaccine_id)` | DATE | date of birth plus the vaccine's `due_age_days`; raises −20001 or −20002 if the baby or vaccine does not exist |
| `get_age_text(p_baby_id)` | VARCHAR2 | readable age such as "3 months 12 days" |
| `get_coverage_pct(p_baby_id)` | NUMBER | doses given divided by doses scheduled, times 100 |
| `get_next_due_dose(p_baby_id)` | NUMBER | `record_id` of the earliest dose that is not DONE, or NULL |
| `dose_label(p_vaccine_name, p_dose_number)` | VARCHAR2 | display name such as "bOPV-1" or "Vitamin A (1st dose)"; deterministic, so it can be used inside SQL |

`calculate_due_date` is called by `generate_schedule` for every dose of a new baby, and the other functions are called from the API queries that build the baby list, the profile and the dashboard.

```sql
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
```

Output of the four functions, including the error case, is in Figure 4.3.

**[ INSERT IMAGE: report/figures/fig_07_functions_output.png ]**

*Figure 4.3: Output of the four standalone functions, including the error case*

## 4.2 Procedures

**`send_due_soon_alerts(p_days_ahead)`** (`db/07_procedures.sql`) is the standalone procedure. It loops over the pending doses due from today up to `p_days_ahead` days ahead and inserts one `DUE_SOON` alert for each, skipping a dose that already has one, so the daily job never duplicates an alert. It sets a savepoint, commits on success and rolls back to the savepoint on failure; a negative number of days raises −20014.

```sql
CREATE OR REPLACE PROCEDURE send_due_soon_alerts (
  p_days_ahead IN NUMBER DEFAULT 7
)
IS
  CURSOR c_due (p_window NUMBER) IS
    SELECT d.record_id, d.baby_id, d.scheduled_date, n.clinic_id, n.full_name AS baby_name,
           dose_label(v.vaccine_name, v.dose_number) AS dose_name
      FROM dose_records d
      JOIN newborns n       ON n.baby_id = d.baby_id
      JOIN vaccine_master v ON v.vaccine_id = d.vaccine_id
     WHERE d.status = 'PENDING'
       AND d.scheduled_date BETWEEN TRUNC(SYSDATE) AND TRUNC(SYSDATE) + p_window
     ORDER BY d.scheduled_date, d.record_id;
  v_created PLS_INTEGER := 0;
BEGIN
  SAVEPOINT sp_due_soon;
  IF p_days_ahead IS NULL OR p_days_ahead < 0 THEN
    RAISE_APPLICATION_ERROR(-20014, 'Days ahead must be zero or more');
  END IF;

  FOR r IN c_due(p_days_ahead) LOOP
    INSERT INTO alerts (baby_id, record_id, clinic_id, alert_type, message)
    SELECT r.baby_id, r.record_id, r.clinic_id, 'DUE_SOON',
           r.dose_name || ' for ' || r.baby_name || ' is due on ' || TO_CHAR(r.scheduled_date, 'YYYY-MM-DD')
      FROM dual
     WHERE NOT EXISTS (SELECT 1 FROM alerts a
                        WHERE a.record_id = r.record_id AND a.alert_type = 'DUE_SOON');
    v_created := v_created + SQL%ROWCOUNT;
  END LOOP;
  COMMIT;
  -- (exception handler: ROLLBACK TO sp_due_soon, re-raise -20xxx, wrap the rest as -20099)
END send_due_soon_alerts;
```

The alerts raised by this procedure and by the triggers and sweeps are shown in Figure 4.4.

**[ INSERT IMAGE: report/figures/fig_14_alerts_by_type.png ]**

*Figure 4.4: Alerts raised by triggers and sweeps*

## 4.3 Packages

The application logic is grouped into four packages. The API calls only these packages.

| Package (file) | Main members |
|---|---|
| `newborn_vaccination_pkg` (`04`) | `register_newborn`, `generate_schedule`, `guardian_exists`, `is_dose_allowed`, `mark_dose_administered`, `reschedule_dose`, `refresh_overdue_status`, `update_newborn`, `delete_newborn`, `set_actor` |
| `vaccine_inventory_pkg` (`05`) | `restock`, `pick_batch`, `expiry_sweep` |
| `vax_reporting_pkg` (`06`) | `dashboard_summary`, `overdue_list`, `upcoming_list`, `clinic_coverage`, `baby_timeline` (all return a `SYS_REFCURSOR`) |
| `account_pkg` (`03b`) | `next_nurse_username`, `suggest_username`, `add_user`, `create_user` |

**Registering a baby.** `register_newborn` reuses a guardian found by phone number or inserts a new one (a new guardian needs a name and an address), inserts the baby, calls `generate_schedule`, and creates the guardian's parent login the first time, all in one transaction. If any step fails, including a date of birth in the future that the trigger rejects, the savepoint rolls everything back, so no half-registered family remains (Figure 4.5). The parent's username is built from the guardian's name by `account_pkg.suggest_username` (for example `priya.sharma`, with a number added if the name is taken). A second child of the same guardian creates no second login.

**[ INSERT IMAGE: report/figures/fig_08_register_newborn_rollback.png ]**

*Figure 4.5: register_newborn creates 24 doses; a future date of birth rolls everything back*

**Recording a dose.** `mark_dose_administered` is the core transaction of the system. It sets a savepoint first, so a failure at any step also releases the row lock, then proceeds as follows. It locks the dose row (`FOR UPDATE`) and reads the baby and the vaccine. It rejects a dose that is already DONE, a date before the date of birth or in the future, and a baby younger than the dose's `min_age_days`. It asks `vaccine_inventory_pkg.pick_batch` for the batch that expires first among those that are not expired and have stock (first-expiry-first-out), and raises −20009 if there is none. It reduces that batch by one, guarded by `quantity > 0` so that a concurrent session taking the last dose makes this one fail cleanly. It marks the dose DONE with the batch and the nurse, sets `is_late = 'Y'` and inserts a `LATE_DOSE` alert when the baby is past `max_age_days`, and commits. Any error rolls back to the savepoint, so the dose and the stock can never disagree (Figure 4.6).

```sql
    -- 1. lock the dose row and read everything the checks need
    SELECT d.status, d.baby_id, d.vaccine_id, n.date_of_birth, n.full_name, n.clinic_id,
           v.min_age_days, v.max_age_days, dose_label(v.vaccine_name, v.dose_number)
      INTO v_status, v_baby_id, v_vaccine_id, v_dob, v_baby_name, v_baby_clinic,
           v_min_age, v_max_age, v_label
      FROM dose_records d
      JOIN newborns n       ON n.baby_id = d.baby_id
      JOIN vaccine_master v ON v.vaccine_id = d.vaccine_id
     WHERE d.record_id = p_record_id
       FOR UPDATE OF d.status;
    -- (checks: already DONE, before birth, in the future, younger than min_age_days)

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

    UPDATE dose_records
       SET status = 'DONE', administered_date = v_date, inventory_id = v_inventory,
           administered_by = p_user_id, is_late = v_late
     WHERE record_id = p_record_id;
    -- (LATE_DOSE alert when v_age_days > v_max_age), then COMMIT;
  EXCEPTION
    WHEN OTHERS THEN
      v_code := SQLCODE;  v_msg := SQLERRM;
      ROLLBACK TO sp_administer;      -- 4. undo stock and dose together
      IF v_code BETWEEN -20999 AND -20000 THEN RAISE; END IF;
      RAISE_APPLICATION_ERROR(c_err_unexpected, 'Could not record the dose: ' || v_msg);
```

**[ INSERT IMAGE: report/figures/fig_09_mark_dose_administered.png ]**

*Figure 4.6: mark_dose_administered: FEFO batch, stock minus one, late flag, and the error paths*

**First-expiry-first-out.** `pick_batch` returns the inventory row that expires first among the clinic's non-expired batches of that vaccine that still have stock; an expired batch is skipped even if it holds stock.

```sql
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
```

**Other members.** `reschedule_dose` moves a dose that is not DONE to a date that is today or later and inside its age window, and records the reason. `update_newborn` and `delete_newborn` are available to administrators only (error −20021 otherwise): a corrected date of birth moves the due dates of the unfinished doses and rebuilds the stale alerts, and it is refused (−20020) if a dose that was already given would fall before its minimum age; deleting a baby can return the given doses to stock. `restock` inserts a batch or adds to an existing one. `set_actor` stores the acting user in the session's client information so that the audit trigger knows who acted.

**Usage example**

```sql
EXEC newborn_vaccination_pkg.mark_dose_administered(:record_id, NULL, :clinic_id, :user_id);
```

## 4.4 Triggers

Five triggers (`db/08_triggers.sql`) enforce the rules that must hold whichever program changes the data. None of them reads the table that fired it, which is how the mutating-table error (ORA-04091) is avoided; they read only other tables.

| Trigger | Event, level | Rule |
|---|---|---|
| `trg_newborn_dob_check` | BEFORE INSERT OR UPDATE OF date_of_birth ON newborns, row | the date of birth must not be in the future (−20003) |
| `trg_dose_status_guard` | BEFORE UPDATE ON dose_records, row | a DONE dose can never go back to PENDING or OVERDUE (−20013); the administered date may not be before the date of birth or in the future (−20006, −20007); a PENDING dose whose date has passed becomes OVERDUE |
| `trg_dose_alerts` | AFTER UPDATE OF status ON dose_records, row, with a WHEN clause | inserts one OVERDUE alert when a dose becomes overdue, once per dose |
| `trg_dose_audit` | AFTER INSERT OR UPDATE OR DELETE ON dose_records, row | writes old and new values and the acting user to `audit_log` |
| `trg_inventory_low_stock` | AFTER UPDATE OF quantity ON vaccine_inventory, row, with a WHEN clause | inserts a LOW_STOCK alert when a batch crosses below its threshold, once while it stays low |

```sql
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
```

```sql
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
```

The guard trigger blocking a change from DONE to PENDING, and the audit row it leaves with the old status, the new status and the acting user, are shown in Figure 4.7; the audit rows are listed in Figure 4.8.

**[ INSERT IMAGE: report/figures/fig_10_triggers_guard_audit.png ]**

*Figure 4.7: Status-guard trigger blocking DONE to PENDING, and the audit row with the actor*

**[ INSERT IMAGE: report/figures/fig_15_audit_log_db.png ]**

*Figure 4.8: audit_log rows written by the trigger*

## 4.5 Cursors

The project uses every kind of PL/SQL cursor.

| Kind | Where | Why a cursor is needed |
|---|---|---|
| Explicit cursor with a parameter | `generate_schedule`: `CURSOR c_vaccines (p_regional VARCHAR2)`, opened, fetched in a loop and closed | the schedule is built dose by dose from `vaccine_master`; Japanese encephalitis rows are included only when requested; the cursor is closed in the exception handler as well |
| Parameterized cursor in a FOR loop | `expiry_sweep`: `CURSOR c_expiring (p_window NUMBER)`; `send_due_soon_alerts`: `c_due (p_window)` | each batch or dose needs its own alert, and the window (days) is passed in |
| Cursor FOR loop over an inline query | `refresh_overdue_status` | each past-due pending dose is touched individually so that the row triggers fire |
| REF cursor (`SYS_REFCURSOR`) | the five procedures of `vax_reporting_pkg` | the API receives the result set from the package and sends it as JSON |
| Implicit cursor | `SQL%ROWCOUNT` after the stock update and the alert inserts | detects that no row was changed |

```sql
-- refresh_overdue_status: cursor FOR loop
FOR r IN (SELECT record_id
            FROM dose_records
           WHERE status = 'PENDING'
             AND scheduled_date < TRUNC(SYSDATE)) LOOP
  UPDATE dose_records SET status = 'PENDING'
   WHERE record_id = r.record_id AND status = 'PENDING';
  v_flipped := v_flipped + SQL%ROWCOUNT;
END LOOP;
```

A row-level trigger fires only when its row is touched, and nothing touches a dose merely because a date has passed. The loop therefore updates each past-due pending dose to its own value: the update itself changes nothing, but `trg_dose_status_guard` turns the status into OVERDUE and `trg_dose_alerts` raises the alert. The `AND status = 'PENDING'` condition makes the loop skip a dose that a nurse marked DONE after the cursor read it (Figure 4.9).

```sql
-- expiry_sweep: parameterized cursor
CURSOR c_expiring (p_window NUMBER) IS
  SELECT i.clinic_id, i.batch_no, i.expiry_date,
         dose_label(v.vaccine_name, v.dose_number) AS vaccine_label
    FROM vaccine_inventory i
    JOIN vaccine_master v ON v.vaccine_id = i.vaccine_id
   WHERE i.quantity > 0
     AND i.expiry_date <= TRUNC(SYSDATE) + p_window
   ORDER BY i.expiry_date, i.inventory_id;
```

**[ INSERT IMAGE: report/figures/fig_11_overdue_sweep.png ]**

*Figure 4.9: Overdue sweep flipping past-due doses; one alert per dose*

The REF cursors of the reporting package return the dashboard summary and the clinic coverage (Figure 4.10) and a baby's timeline with its colour bucket and batch (Figure 4.11). `clinic_coverage` aggregates per clinic and then ranks the clinics with the analytic function `RANK() OVER (ORDER BY coverage_pct DESC)`.

**[ INSERT IMAGE: report/figures/fig_12_refcursor_summary_coverage.png ]**

*Figure 4.10: REF CURSOR output: dashboard summary and clinic coverage*

**[ INSERT IMAGE: report/figures/fig_13_refcursor_timeline.png ]**

*Figure 4.11: REF CURSOR output: a baby's timeline with colour bucket and batch*

## 4.6 Scheduled Job

`db/09_scheduler.sql` creates the DBMS_SCHEDULER job `JOB_DAILY_VAX_SWEEP`, which runs every day at 01:00 (Oracle Scheduler [5]). It calls `refresh_overdue_status`, `send_due_soon_alerts(7)` and `expiry_sweep(30)`. The API also runs `refresh_overdue_status` when the dashboard loads, so overdue doses are current even between two runs of the job (Figure 4.12).

```sql
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
  enabled         => TRUE);
```

**[ INSERT IMAGE: report/figures/fig_16_scheduler_job.png ]**

*Figure 4.12: DBMS_SCHEDULER job definition and a successful run*

## 4.7 Transactions and Error Handling

Every unit of work that changes data (`register_newborn`, `mark_dose_administered`, `reschedule_dose`, `refresh_overdue_status`, the two administrator procedures, the sweeps) has the same shape: set a savepoint, do the work, commit, and on any exception roll back to the savepoint, then re-raise a coded error (−20001 to −20021) or wrap an unexpected Oracle error as −20099 with the original message appended. `generate_schedule` does not commit, because it is a building block of `register_newborn`. The API turns each −20xxx code into a clean HTTP status and message for the user interface. Figure 4.13 shows the source of `mark_dose_administered` with its savepoint, batch selection and rollback.

**[ INSERT IMAGE: report/figures/fig_17_source_mark_dose.png ]**

*Figure 4.13: Source of mark_dose_administered (savepoint, FEFO, rollback)*
