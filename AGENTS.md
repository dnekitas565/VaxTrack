# AGENTS.md — VaxTrack: Newborn Vaccination Schedule Tracker

Guidance for coding agents (Claude Code, etc.) working in this repo. Read this whole file before touching anything.

Course: BCSE302P – Database Systems Laboratory (Mini Project). Faculty: Karthik G.M.
**Hard deadline: Saturday 24 Oct 2026, 11:59 PM. Internal target: submit by Fri 23 Oct.**

---

## 1. Project summary

- **Domain:** Newborn immunization management.
- **Need:** Newborns must receive vaccines in a strict sequence at fixed age milestones (birth, 6/10/14 weeks, 9 months, boosters). Clinics must also manage vaccine stock and batch expiry.
- **Problem:** Parents and clinics have no automated way to see which dose is due next, flag overdue doses, avoid administering from empty or expired stock, or get alerted before a dose is missed.
- **Solution:** An Oracle-backed system where PL/SQL owns all business rules (scheduling, dose administration with stock deduction, overdue detection, alerts, audit), exposed through a Node.js API to a responsive web app.

## 2. Rubric ladder (what each mark needs)

| Mark | Requirement | How this project earns it |
|---|---|---|
| 5 | Late | Avoid. |
| 6 | On time | Submit by 24 Oct, 11:59 PM. |
| 7 | Working functions, procedures, packages, triggers, cursors | Section 6 (all five object types, plus explicit, parameterized, FOR-loop and REF cursors). |
| 8 | Verified with test cases and output screenshots | Stage 3 and Stage 8: automated test script plus numbered, captioned screenshots. |
| 9 | Front-end integrated with the database | Stage 5–7: React app calling the API, which calls only PL/SQL packages. |
| 10 | Complex or mobile-based application | Decision: web app only (no PWA). Aim for the "complex" side: 3 user roles, transactional stock logic, scheduler job, audit log, reports. Level 10 is the faculty's call, so treat 9 as the secure target. |

Each level builds on the previous one. Never sacrifice verification (8) for frontend polish (9/10).

## 3. Tech stack (decided)

- **Database:** Oracle Database XE/Free (PDB `XEPDB1` or `FREEPDB1`), PL/SQL.
  - Preferred: Docker image `gvenzl/oracle-xe` (or `gvenzl/oracle-free`). Alternative: native Oracle XE installer.
  - SQL tooling in VS Code: **Oracle SQL Developer for VS Code** extension (or SQL*Plus / SQLcl in the VS Code terminal).
- **Backend API:** Node.js 20+, Express, `node-oracledb` (thin mode, no Instant Client needed), `jsonwebtoken`, `bcrypt`, `dotenv`, `cors`, `helmet`, `zod` for input validation.
- **Frontend:** React 18 + Vite, Tailwind CSS, React Router, TanStack Query, Recharts, lucide-react. Built and run in **VS Code**.
- **Report:** Word template `BCSE302P_Mini_Project_Report_Template.docx` → export to a single PDF.
- **Diagrams:** ER diagram via draw.io / dbdiagram.io / Mermaid, exported as PNG.

No other databases, ORMs or heavy frameworks. The API must contain **no business logic**: it validates input, sets the audit actor, calls a PL/SQL package, and returns results.

## 4. Repository layout

```
/db
  01_schema.sql            tables, constraints, sequences, indexes
  02_seed_reference.sql    clinics, vaccine_master, users
  03_functions.sql         standalone functions
  04_pkg_newborn.sql       newborn_vaccination_pkg (spec + body)
  05_pkg_inventory.sql     vaccine_inventory_pkg (spec + body)
  06_pkg_reporting.sql     vax_reporting_pkg (spec + body)
  07_procedures.sql        standalone procedure(s)
  08_triggers.sql          all triggers
  09_scheduler.sql         DBMS_SCHEDULER job(s)
  10_seed_demo.sql         demo babies/doses (dates relative to SYSDATE)
  11_tests.sql             automated test harness (writes to test_log)
  99_drop_all.sql          full reset
/api                       Node/Express service
/web                       React web app
/report
  figures/                 fig_XX_description.png
  er_diagram/
  report_notes.md
AGENTS.md
README.md                  setup + run instructions
```

Rules: scripts run in numeric order on an empty schema; `99_drop_all.sql` fully resets; every script is re-runnable.

## 5. Database design

### 5.1 Tables

| Table | Key columns | Notes |
|---|---|---|
| `clinics` | clinic_id PK, clinic_name, city, phone | |
| `app_users` | user_id PK, username UNIQUE, password_hash, role CHECK IN ('ADMIN','NURSE','PARENT'), full_name, clinic_id FK NULL, guardian_id FK NULL | NURSE has clinic_id, PARENT has guardian_id |
| `guardians` | guardian_id PK, full_name, phone, email, address | |
| `newborns` | baby_id PK, guardian_id FK, clinic_id FK, full_name, gender CHECK IN ('M','F','O'), date_of_birth, birth_weight_kg, created_at | DOB cannot be in the future |
| `vaccine_master` | vaccine_id PK, vaccine_name, disease_covered, dose_number, age_label, min_age_days, due_age_days, max_age_days, route, is_regional CHAR(1) DEFAULT 'N', UNIQUE(vaccine_name, dose_number) | Schedule is **data**, never hard-coded. `min_age_days <= due_age_days <= max_age_days`. `is_regional = 'Y'` for JE (endemic districts only) |
| `vaccine_inventory` | inventory_id PK, clinic_id FK, vaccine_id FK, batch_no, expiry_date, quantity CHECK (quantity >= 0), low_stock_threshold, UNIQUE(clinic_id, vaccine_id, batch_no) | One row per batch |
| `dose_records` | record_id PK, baby_id FK, vaccine_id FK, scheduled_date, administered_date, status CHECK IN ('PENDING','DONE','OVERDUE'), inventory_id FK NULL, administered_by FK NULL, is_late CHAR(1) DEFAULT 'N', remarks, UNIQUE(baby_id, vaccine_id) | |
| `alerts` | alert_id PK, baby_id FK NULL, record_id FK NULL, clinic_id FK NULL, alert_type CHECK IN ('DUE_SOON','OVERDUE','LATE_DOSE','LOW_STOCK','EXPIRY'), message, alert_date, is_read CHAR(1) DEFAULT 'N' | |
| `audit_log` | audit_id PK, table_name, record_id, action, old_value, new_value, changed_by, changed_at | Filled by trigger |
| `test_log` | test_id PK, tc_code, description, expected, actual, result CHECK IN ('PASS','FAIL'), run_at | Filled by `11_tests.sql` |

Use sequences or identity columns for IDs. Add NOT NULL, FK, CHECK and useful indexes (e.g. `dose_records(baby_id)`, `dose_records(status, scheduled_date)`, `vaccine_inventory(clinic_id, vaccine_id, expiry_date)`).

### 5.2 Vaccine schedule seed (`vaccine_master`) — from the official NIS

**Source:** National Immunization Schedule (NIS), India (Ministry of Health and Family Welfare). The user's copy is the uploaded `National_Immunization_Schedule__NIS_.pdf`; cite it in the report references. Use these exact vaccine names.

**Scope decision:** infants (0–1 yr) plus the 16–23 month boosters. Out of scope: pregnant-women Td, 5–6 yr DPT Booster-2, 10/16 yr Td, and Vitamin A doses 3–9 (every 6 months up to 5 years). They are beyond "newborn" tracking; mention them as future scope in the report.

| Age (NIS) | Vaccines (dose rows) | Rows |
|---|---|---|
| At birth | BCG, bOPV-0, Hepatitis B Birth dose | 3 |
| 6 weeks | bOPV-1, Pentavalent-1, fIPV-1, RVV-1, PCV-1 | 5 |
| 10 weeks | bOPV-2, Pentavalent-2, RVV-2 | 3 |
| 14 weeks | bOPV-3, Pentavalent-3, fIPV-2, RVV-3, PCV-2 | 5 |
| 9–11 months | MR-1, PCV-Booster, fIPV-3, Vitamin A (1st dose), **JE-1 (regional)** | 4 + 1 |
| 16–23 months | MR-2, DPT Booster-1, bOPV-Booster, Vitamin A (2nd dose), **JE-2 (regional)** | 4 + 1 |

Total: **24 core doses per baby**, **26** if the baby is in a JE-endemic district.

Abbreviations: bOPV = bivalent oral polio vaccine, fIPV = fractional inactivated polio vaccine, RVV = rotavirus vaccine, PCV = pneumococcal conjugate vaccine, MR = measles-rubella, DPT = diphtheria-pertussis-tetanus, JE = Japanese encephalitis.

**Age offsets in days** (use 1 month = 30 days consistently; state this assumption in the report):

| Age band | `min_age_days` | `due_age_days` | `max_age_days` (late after) |
|---|---|---|---|
| Birth | 0 | 0 | 14 |
| 6 weeks | 42 | 42 | 70 |
| 10 weeks | 70 | 70 | 98 |
| 14 weeks | 98 | 98 | 126 |
| 9–11 months | 270 | 270 | 359 |
| 16–23 months | 480 | 480 | 719 |

The NIS gives age bands only, so `max_age_days` is a **project-defined grace limit** (4-week grace for the week-based doses, the end of the stated band for the month-based doses). Say so explicitly in the report. The 9–11 and 16–23 month doses are due at the start of their band and are "late" only after the band ends.

**JE handling:** JE rows have `is_regional = 'Y'`. `generate_schedule` includes them only when called with `p_include_regional => 'Y'`; the Register Newborn form has an "Endemic district (JE)" checkbox. This keeps the app faithful to the NIS footnote.

### 5.3 Normalization (needed for the report)

Document the path in `report/report_notes.md`:
1. **UNF:** a single "vaccination card" sheet (baby, guardian, clinic, repeating vaccine rows with batch and expiry).
2. **1NF:** atomic values, remove repeating groups (one row per baby per dose).
3. **2NF:** remove partial dependencies (vaccine details depend on vaccine, not on baby+vaccine → `vaccine_master`; baby details → `newborns`).
4. **3NF/BCNF:** remove transitive dependencies (guardian details → `guardians`; clinic details → `clinics`; batch/expiry → `vaccine_inventory`). Check every determinant is a candidate key.

## 6. PL/SQL specification

All objects need a header comment (purpose, params, owner), proper `EXCEPTION` handling, and `RAISE_APPLICATION_ERROR` with codes in the -20001..-20099 range. Keep a table of error codes in a comment at the top of the main package.

### 6.1 Standalone functions (`03_functions.sql`)

| Function | Returns | Logic |
|---|---|---|
| `calculate_due_date(p_baby_id, p_vaccine_id)` | DATE | `date_of_birth + due_age_days`; raises if baby/vaccine missing |
| `get_age_text(p_baby_id)` | VARCHAR2 | Human age, e.g. "3 months 12 days" |
| `get_coverage_pct(p_baby_id)` | NUMBER | DONE doses ÷ total doses × 100 |
| `get_next_due_dose(p_baby_id)` | NUMBER (record_id) | Earliest non-DONE dose, or NULL |

### 6.2 `newborn_vaccination_pkg` (`04_pkg_newborn.sql`)

- `register_newborn(guardian fields, newborn fields, clinic_id, p_include_regional, OUT baby_id)` — inserts guardian (or reuses by phone), inserts newborn, calls `generate_schedule`, all in **one transaction** (rollback on any failure).
- `generate_schedule(p_baby_id, p_include_regional DEFAULT 'N')` — **explicit cursor** over `vaccine_master` (skips `is_regional = 'Y'` rows unless requested), uses `calculate_due_date`, inserts PENDING rows (24 core, 26 with JE). Idempotent (no duplicates if re-run).
- `is_dose_allowed(p_record_id)` — function: checks baby age ≥ `min_age_days`.
- `mark_dose_administered(p_record_id, p_administered_date, p_clinic_id, p_user_id)` — the core transaction:
  1. Lock the dose row (`SELECT … FOR UPDATE`), validate not already DONE, date not before DOB or in the future, age ≥ `min_age_days`.
  2. Pick a batch via `vaccine_inventory_pkg.pick_batch` (FEFO: earliest non-expired expiry with quantity > 0).
  3. `SAVEPOINT`; decrement stock; set DONE, `inventory_id`, `administered_by`; set `is_late = 'Y'` and insert a `LATE_DOSE` alert if past `max_age_days`.
  4. On out-of-stock or any error: `ROLLBACK TO` the savepoint and raise a clear error. Dose and stock must never get out of sync.
- `reschedule_dose(p_record_id, p_new_date, p_reason, p_user_id)` — only for non-DONE doses; new date must be ≥ today and within the allowed window; writes remarks and audit.
- `refresh_overdue_status` — **cursor FOR loop** over PENDING doses with `scheduled_date < TRUNC(SYSDATE)`; updates them so the guard trigger flips status and raises alerts. Needed because a row-level trigger only fires when a row is touched.
- `set_actor(p_user_id)` — sets `DBMS_APPLICATION_INFO.SET_CLIENT_INFO` so the audit trigger records who acted.

### 6.3 `vaccine_inventory_pkg` (`05_pkg_inventory.sql`)

- `restock(p_clinic_id, p_vaccine_id, p_batch_no, p_expiry_date, p_qty, p_user_id)` — insert or merge into the batch.
- `pick_batch(p_clinic_id, p_vaccine_id)` — function returning `inventory_id` (FEFO, non-expired, qty > 0), raises if none.
- `expiry_sweep` — **parameterized cursor** (`CURSOR c(p_days NUMBER)`) over batches expiring within N days; inserts `EXPIRY` alerts (no duplicates).

### 6.4 `vax_reporting_pkg` (`06_pkg_reporting.sql`)

Procedures returning **`SYS_REFCURSOR`** for the API:
- `dashboard_summary(p_clinic_id, OUT cur)` — totals: babies, doses done/pending/overdue, coverage %.
- `overdue_list(p_clinic_id, OUT cur)`
- `upcoming_list(p_clinic_id, p_days, OUT cur)`
- `clinic_coverage(OUT cur)` — coverage per clinic (uses analytic/aggregate SQL).
- `baby_timeline(p_baby_id, OUT cur)` — all doses with status, color bucket, batch.

### 6.5 Standalone procedure (`07_procedures.sql`)

- `send_due_soon_alerts(p_days_ahead)` — cursor loop; inserts `DUE_SOON` alerts for doses due within N days (skip if one already exists).

### 6.6 Triggers (`08_triggers.sql`)

| Trigger | Event | Behavior |
|---|---|---|
| `trg_newborn_dob_check` | BEFORE INSERT/UPDATE ON newborns | DOB must not be in the future |
| `trg_dose_status_guard` | BEFORE UPDATE ON dose_records | PENDING + past-due → set `:NEW.status := 'OVERDUE'`; block DONE → PENDING; reject administered_date before DOB or in the future |
| `trg_dose_alerts` | AFTER UPDATE OF status ON dose_records | Insert `OVERDUE` alert when status becomes OVERDUE (once per record) |
| `trg_dose_audit` | AFTER INSERT/UPDATE/DELETE ON dose_records | Write `audit_log` (old/new status, actor via `SYS_CONTEXT('USERENV','CLIENT_INFO')`) |
| `trg_inventory_low_stock` | AFTER UPDATE OF quantity ON vaccine_inventory | If quantity < `low_stock_threshold`, insert `LOW_STOCK` alert (once while below) |

Avoid mutating-table errors: never query the firing table inside a row-level trigger.

### 6.7 Scheduler (`09_scheduler.sql`)

`DBMS_SCHEDULER` job `JOB_DAILY_VAX_SWEEP`, daily: runs `refresh_overdue_status`, `send_due_soon_alerts(7)`, `expiry_sweep(30)`. The API also calls `refresh_overdue_status` when the dashboard loads, so demos work without waiting for the job. If the scheduler fails to run in the local setup, document it and keep the manual call.

## 7. Backend API (`/api`)

- Config via `.env` (`DB_USER`, `DB_PASSWORD`, `DB_CONNECT_STRING`, `JWT_SECRET`, `PORT`). Never commit `.env`; provide `.env.example`.
- Use a `node-oracledb` connection pool; per request: get connection → `set_actor` → call package → commit/rollback → release.
- **Bind variables only.** No string-built SQL.
- Roles: `ADMIN` (everything), `NURSE` (own clinic: register, administer, reschedule, inventory), `PARENT` (read-only own children + vaccination card).
- Map Oracle errors (`ORA-20xxx`) to clean HTTP 4xx messages for the UI.

Endpoints (JSON):
```
POST /auth/login
GET  /me
GET  /dashboard/summary
GET  /dashboard/overdue
GET  /dashboard/upcoming?days=7
POST /newborns                       -> register_newborn
GET  /newborns?search=
GET  /newborns/:id                   -> profile + timeline
POST /doses/:recordId/administer     -> mark_dose_administered
POST /doses/:recordId/reschedule     -> reschedule_dose
GET  /inventory?clinicId=
POST /inventory/restock
GET  /alerts?unread=1
PATCH /alerts/:id/read
GET  /reports/clinic-coverage
GET  /audit?recordId=                (ADMIN)
```

## 8. Frontend (`/web`) — requirements for a "perfect" UI

**Principles:** desktop-first web app that stays responsive (usable down to tablet/phone width), fast, accessible (labels, focus states, contrast AA, keyboard usable), no dead buttons, every action gives feedback.

**Design system:** Tailwind with design tokens; one primary color (teal/blue), neutral grays; status colors fixed everywhere: **green = DONE, amber = upcoming PENDING, red = OVERDUE, grey = future**. Card-based layout, 8px spacing grid, rounded corners, consistent iconography (lucide-react), skeleton loaders, toast notifications, empty states, confirm dialogs for destructive/critical actions. Desktop: sidebar; narrow screens: collapsible menu. Dark mode optional (only if time allows).

**Pages:**
1. **Login** — role-based, demo-credential hint in dev only.
2. **Dashboard** — stat cards (babies, done, pending, overdue), coverage donut chart, "Overdue now" list, "Due in 7 days" list, unread alerts badge.
3. **Register Newborn** — validated form (guardian + baby, plus an "Endemic district (JE)" checkbox); on success shows the generated schedule immediately (the demo "wow" moment).
4. **Newborn Search/List** — search by name/phone, status chips, coverage progress bar.
5. **Baby Profile** — header (age text, coverage ring), **vertical timeline** of all doses color-coded, per-dose actions: *Mark administered* (modal: date, auto-selected batch preview, clinic), *Reschedule* (modal with reason).
6. **Inventory** — table/cards by vaccine and batch, expiry badges, low-stock warnings, *Restock* form (NURSE/ADMIN).
7. **Alerts Center** — filter by type, mark as read.
8. **Reports** — clinic coverage bar chart, overdue table, CSV export.
9. **Vaccination Card** — printable/PDF-friendly view per baby (parent can open it).
10. **Audit Log** (ADMIN) — who changed which dose and when.


**Quality bar:** works in current Chrome/Edge, no console errors, Lighthouse Accessibility ≥ 90 on the production build, and a quick check at tablet/phone width.

## 9. Conventions

- SQL/PLSQL: lowercase `snake_case`; params `p_`, locals `v_`, cursors `c_`, constants `c_` uppercase for values; consistent 2-space indent.
- Every transactional unit has deliberate `COMMIT`/`ROLLBACK`/`SAVEPOINT`.
- No hard-coded IDs; use sequences. No hard-coded schedule in PL/SQL.
- Demo data dates are relative to `SYSDATE` so overdue/upcoming states always exist.
- Small commits; commit after each stage with message `stage-N: <summary>`.
- Do not add dependencies beyond Section 3 without asking.

## 10. Stages

Dates assume start Mon 5 Oct 2026 and a deadline of Sat 24 Oct. Stages can overlap where noted. If the team has 3–4 members, owners are suggested in brackets; adjust freely.

### Stage 0 — Environment and repo (5–6 Oct) [everyone]
**Goal:** Everyone can run Oracle, the API and the web app locally.
**Tasks and how:**
1. Start Oracle in Docker (`gvenzl/oracle-xe`), set a password, wait for "DATABASE IS READY".
2. In SQL Developer for VS Code, create a connection as `SYSTEM` to the PDB, then create the app user: `CREATE USER vaxapp IDENTIFIED BY …; GRANT CREATE SESSION, CREATE TABLE, CREATE SEQUENCE, CREATE PROCEDURE, CREATE TRIGGER, CREATE VIEW, CREATE JOB TO vaxapp; ALTER USER vaxapp QUOTA UNLIMITED ON USERS;` Run all project scripts as `vaxapp`.
3. Scaffold `/api` (`npm init`, install deps) and `/web` (`npm create vite@latest` → React), add `.env.example`, `.gitignore`, `README.md`.
4. Create the GitHub repo (private) and agree on branch rules.
**Done when:** `SELECT 1 FROM dual` works from VS Code and from a tiny API route; Vite dev server loads.
**Report hook:** System Requirements section (hardware/software list, versions).

### Stage 1 — Database design and schema (6–8 Oct) [Schema owner]
**Goal:** Locked, reviewed schema everyone builds against.
**Tasks and how:**
1. Draw the ER diagram first (entities, PK/FK, cardinalities: guardian 1—N newborn, newborn 1—N dose_records, vaccine_master 1—N dose_records, clinic 1—N inventory, inventory 1—N dose_records).
2. Write `01_schema.sql` from Section 5.1 with all constraints and indexes; write `02_seed_reference.sql` (3–4 clinics, full vaccine schedule, seeded users: 1 admin, 1–2 nurses, 1–2 parents; bcrypt hashes generated by a small Node script, not hand-typed).
3. Write the normalization notes (Section 5.3).
4. Run `99_drop_all.sql` → `01` → `02` twice to prove re-runnability.
**Done when:** Scripts run clean on an empty schema; ER diagram exported to `/report/er_diagram`; the team has agreed in writing that the schema is frozen (changes need everyone's OK after this).
**Report hook:** Database Design section (ER diagram, schema + constraints, normalization). Screenshot: tables list in VS Code.

### Stage 2 — PL/SQL core (8–12 Oct) [Split by object: functions+triggers / newborn pkg / inventory+reporting pkg+scheduler]
**Goal:** All business logic implemented in the database.
**Tasks and how:**
1. Implement in this order: `03_functions.sql` → `04_pkg_newborn.sql` → `05_pkg_inventory.sql` → `06_pkg_reporting.sql` → `07_procedures.sql` → `08_triggers.sql` → `09_scheduler.sql`.
2. After each object, test in isolation with an anonymous block and `DBMS_OUTPUT`. Compile errors: `SHOW ERRORS` / `SELECT * FROM user_errors`.
3. Follow Section 6 exactly: explicit, parameterized, FOR-loop and REF cursors must each appear at least once.
4. Write `10_seed_demo.sql`: ~8 babies with DOBs like `SYSDATE-3`, `SYSDATE-50`, `SYSDATE-120`, `SYSDATE-300`, created via `register_newborn`; mark some doses DONE; leave some overdue; seed inventory including one low-stock and one near-expiry batch.
**Done when:** Full demo seed runs; overdue and alert rows appear without manual edits; no invalid objects (`SELECT object_name FROM user_objects WHERE status='INVALID'` returns nothing).
**Report hook:** Implementation section (each object: explanation + code snippet + a figure showing output).

### Stage 3 — Automated test harness (11–12 Oct, overlaps Stage 2) [Test owner]
**Goal:** Evidence for rubric level 8.
**Tasks and how:** Write `11_tests.sql` as anonymous blocks that call objects, compare actual vs expected, and insert PASS/FAIL into `test_log` (use a helper procedure inside the script). Cover at least these cases:

| ID | Case |
|---|---|
| TC-F1 | `calculate_due_date` for DOB + 42-day vaccine returns the correct date |
| TC-F2 | `calculate_due_date` with an invalid baby raises the expected error |
| TC-F3 | `get_coverage_pct` is 0 for a new baby and rises after doses are marked |
| TC-F4 | `get_next_due_dose` returns the earliest non-DONE dose |
| TC-P1 | `register_newborn` creates the baby and the full schedule (24 doses, 26 with JE) |
| TC-P2 | `generate_schedule` run twice creates no duplicates |
| TC-P3 | `register_newborn` with a future DOB rolls back everything |
| TC-P4 | `mark_dose_administered` sets DONE and decrements stock by exactly 1 |
| TC-P5 | Marking an already-DONE dose is rejected |
| TC-P6 | Out-of-stock administration rolls back; dose stays PENDING and stock unchanged |
| TC-P7 | Administering before `min_age_days` is rejected |
| TC-P8 | Administering after `max_age_days` sets `is_late = 'Y'` and raises a `LATE_DOSE` alert |
| TC-P9 | FEFO: earliest-expiry batch is used; expired batches are skipped |
| TC-P10 | `reschedule_dose` rejects DONE doses and past dates |
| TC-C1 | `refresh_overdue_status` flips past-due PENDING doses to OVERDUE |
| TC-T1 | Guard trigger blocks DONE → PENDING |
| TC-T2 | Audit trigger writes a row with old/new status and actor |
| TC-T3 | Low-stock trigger fires once when quantity drops below threshold |
| TC-T4 | Overdue alert is created once, not repeatedly |
| TC-R1 | Reporting REF cursors return expected row counts on seed data |

**Done when:** `SELECT tc_code, result FROM test_log` shows all PASS, and the script is re-runnable (cleans its own test data).
**Report hook:** Verification & Testing section: a test-case table (ID, description, input, expected, actual, result) plus screenshot of the full `test_log` output and key individual outputs.

### Stage 4 — Backend API (11–14 Oct) [Backend owner]
**Goal:** Every UI feature has a tested endpoint that calls only PL/SQL packages.
**Tasks and how:**
1. Build pool, auth (bcrypt compare + JWT), role middleware, zod validation, centralized error handler mapping `ORA-20xxx`.
2. Implement endpoints from Section 7; per request call `set_actor` first.
3. Test every endpoint with a REST client (VS Code REST Client `.http` file committed in `/api/requests.http`) for success and failure paths (wrong role, bad input, out-of-stock).
**Done when:** All endpoints work from `.http` files; unauthorized access returns 401/403; no SQL string concatenation anywhere (grep to confirm).
**Report hook:** Front-End/Integration section (architecture diagram: React → Express → PL/SQL → Oracle). Screenshot a few API responses.

### Stage 5 — Frontend build (13–18 Oct) [Frontend owner(s)]
**Goal:** All pages from Section 8 working against the real API.
**Tasks and how:**
1. Set up Tailwind tokens, layout shell (bottom nav / sidebar), auth context, route guards by role, TanStack Query client, toast and modal components.
2. Build pages in this order: Login → Dashboard → Register Newborn → Baby Profile (timeline + administer/reschedule) → Inventory → Alerts → Reports → Vaccination Card → Audit.
3. Handle loading, empty and error states on every page; surface Oracle error messages in friendly form.
4. Design for desktop first, then check tablet/phone widths so nothing breaks.
**Done when:** Every feature in Section 8 is usable end to end by the right role; no console errors.
**Report hook:** Front-End section: screenshots of each page with figure numbers and captions, plus explanation of which package each screen calls.

### Stage 6 — Polish and hardening (18–19 Oct) [Frontend + Backend]
**Goal:** A stable, professional-looking app and extra margin for the "complex" tier.
**Tasks and how:**
1. Review every page for consistency (spacing, colors, empty/error states, validation messages).
2. Run Lighthouse on the production build (`npm run build && npm run preview`); fix accessibility issues.
3. Test on a real phone over the LAN; fix layout and tap-target problems.
4. Security pass: helmet, CORS limited, input validation, no secrets in git, role checks on every route.
**Done when:** Full demo journey runs without errors on the production build; Lighthouse accessibility target met.
**Report hook:** Results & Discussion (Lighthouse scores, challenges, improvements).

### Stage 7 — Full verification run and screenshot capture (19–20 Oct) [Everyone, from clean state]
**Goal:** Evidence produced from your own execution, as faculty requires.
**Tasks and how:**
1. Reset everything: `99_drop_all.sql` → `01`…`10` → `11_tests.sql`. Capture screenshots as you go.
2. Run the scripted demo journey in the UI: login as nurse → register baby → schedule appears → administer a dose (stock drops) → trigger overdue → see alert → low-stock alert → parent view → admin audit log.
3. Name every screenshot `fig_XX_description.png` (XX = final figure number), keep a figure list in `report_notes.md` with captions. Screenshots must be clear and readable (zoom in, crop, no tiny text).
**Done when:** Every report section has its screenshots; figure numbering is final.
**Note:** All code and screenshots must come from your own runs. Faculty states plagiarised or copied reports get zero.

### Stage 8 — Report (20–22 Oct) [Report owner + all review]
**Goal:** A template-compliant PDF.
**Tasks and how:**
1. Use `BCSE302P_Mini_Project_Report_Template.docx`; replace all grey italic guidance text and delete unused rows/placeholders.
2. Fill sections in this order (mapped to the faculty structure):

| Report section | Source |
|---|---|
| Cover page | Title "VaxTrack – Newborn Vaccination Schedule Tracker", BCSE302P, names + reg. numbers, faculty, submission date |
| Certificate | Declaration of originality (every member reads and agrees) |
| Abstract (150–200 words) | Mention Oracle PL/SQL, packages, triggers, cursors, web frontend, scope |
| Table of Contents | Auto-generated in Word |
| Introduction | Section 1 of this file; importance of DBMS (integrity, transactions, concurrency, auditability) |
| System Requirements | Stage 0 versions (hardware + software) |
| Database Design | Stage 1: ER diagram, schema with constraints, normalization 1NF → 3NF/BCNF |
| Implementation | Stage 2: each function, procedure, package, trigger, cursor with explanation + snippet |
| Front-End | Stage 4–6 screenshots and integration explanation |
| Verification & Testing | Stage 3 test table + Stage 7 screenshots |
| Results & Discussion | Achievements, challenges (mutating-table error, stock/dose consistency, overdue sweep), improvements (SMS/WhatsApp reminders, multi-language, digital certificates) |
| Conclusion | Learning outcomes, future scope |
| References | IEEE style: Oracle docs, national immunization schedule source, node-oracledb docs, etc. |
| Appendices | Extra code (full scripts) and extra screenshots |

3. Formatting (template already set): Times New Roman 12, 1.5 spacing, headings bold 14, 1-inch margins, page numbers bottom centre. Every figure has a number and caption.
4. Write in your own words. Update the TOC (right-click → Update Field → Update entire table) **before** exporting to PDF.
**Done when:** PDF reads cleanly end to end, TOC page numbers correct, all figures legible.

### Stage 9 — Submission (22–23 Oct) [Team leader]
1. Final proofread by at least two members.
2. Export one PDF named `BCSE302P_Project_<TeamName>.pdf`.
3. One member emails it to **karthik.gm@vit.ac.in**. Subject: `BCSE302P Mini Project – <TeamName> – VaxTrack: Newborn Vaccination Schedule Tracker`. Body lists every member's name and registration number.
4. Send **one** email only. Keep the sent mail and a backup of the repo.
**Target:** sent by Fri 23 Oct; absolute cutoff Sat 24 Oct, 11:59 PM.

## 11. Cut line (if time runs short)

Drop in this order, never earlier: dark mode → audit page → Lighthouse tuning → `vax_reporting_pkg` charts (keep tables) → scheduler job (keep manual refresh).
**Never drop:** Stage 3 tests and screenshots, API + frontend integration, report, on-time submission.

## 12. Agent working rules

- Read this file and existing code before editing; follow the stage order.
- Small, focused changes; keep every script and the app runnable at each step.
- After changing any PL/SQL object, re-run the relevant tests (`11_tests.sql`) and report the real output, including failures.
- Never claim something works without running it. If you cannot run Oracle in your environment, say so and give the exact commands for the user to run.
- Do not rename required objects or change the frozen schema without asking.
- Ask instead of guessing on: schedule values, team ownership, stack changes.
- Never commit secrets, and never put business logic in the API or frontend that belongs in PL/SQL.
- The user must execute code and capture screenshots themselves for the report; produce checklists of what to capture rather than fabricating outputs.

## 13. Open items

- Confirm team size, team name and component owners.
- Vaccine schedule is now based on the official NIS (uploaded PDF). Confirm the project-defined grace limits (`max_age_days`) with the team.
- Confirm scope: infants + 16–23 month boosters, JE as an optional regional checkbox.
- Confirm Oracle runs locally (Docker vs native XE) on every member's machine.
- Download the faculty report template and keep it in `/report`.