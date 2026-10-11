# VaxTrack — report notes

Working notes that feed the report. Rewrite in your own words for the final report.

## 1. Vaccine schedule: source and assumptions

- Source: National Immunization Schedule (NIS), India, MoHFW (file `National Immunization Schedule (NIS).pdf`). Cite in References.
- Scope: infants (0–1 yr) plus the 16–23 month boosters. **24 core doses per baby, 26 in JE-endemic districts.**
- Out of scope (future scope in the report): pregnant-women Td, DPT Booster-2 (5–6 yr), Td at 10 and 16 yr, Vitamin A doses 3–9.
- Assumptions to state explicitly:
  1. 1 month = 30 days (6 weeks = day 42, 9 months = day 270, 16 months = day 480).
  2. The NIS gives age bands only. `max_age_days` is a project-defined grace limit (+28 days for week-based doses; end of band for month-based doses). The team must confirm these.
  3. `min_age_days = due_age_days`: a dose is allowed from its due age.
  4. `route` and `disease_covered` are standard Universal Immunization Programme facts, not printed in the NIS PDF. Verify against a second source before the report.
  5. JE is stored with `is_regional = 'Y'` and added to a baby's schedule only when the clinic ticks "Endemic district (JE)".
- Naming in `vaccine_master`: `vaccine_name` + `dose_number` is unique. Birth bOPV is `bOPV` dose 0; boosters are separate names (`PCV Booster`, `DPT Booster`, `bOPV Booster`) with dose 1.

| Age band | Rows | Dose rows |
|---|---|---|
| At birth | 3 | BCG, bOPV-0, Hepatitis B Birth dose |
| 6 weeks | 5 | bOPV-1, Pentavalent-1, fIPV-1, RVV-1, PCV-1 |
| 10 weeks | 3 | bOPV-2, Pentavalent-2, RVV-2 |
| 14 weeks | 5 | bOPV-3, Pentavalent-3, fIPV-2, RVV-3, PCV-2 |
| 9–11 months | 4 (+JE-1) | MR-1, PCV-Booster, fIPV-3, Vitamin A (1st) |
| 16–23 months | 4 (+JE-2) | MR-2, DPT Booster-1, bOPV-Booster, Vitamin A (2nd) |

## 2. Schema design decisions (differences from the bare table list)

- `guardians.phone` is UNIQUE: `register_newborn` reuses a guardian found by phone.
- `app_users` has a CHECK so a NURSE always has a clinic and a PARENT always has a guardian.
- `dose_records` has a CHECK tying `status = 'DONE'` to a non-null `administered_date`.
- DOB-not-in-future cannot be a CHECK constraint (SYSDATE is not allowed there), so `trg_newborn_dob_check` enforces it.
- `audit_log` has no foreign keys on purpose: audit rows must survive deletion of the rows they describe.
- `dose_records(baby_id)` needs no extra index: it is the leading column of `uq_dose_baby_vaccine`.

## 3. Normalization

### UNF — one "vaccination card" sheet
`CARD(baby_name, gender, dob, birth_weight, guardian_name, guardian_phone, guardian_email, address, clinic_name, clinic_city, clinic_phone, { vaccine_name, disease, dose_no, route, due_date, given_date, status, batch_no, expiry_date, given_by }*)`
The braces are a repeating group: many vaccine rows on one card.

### 1NF — atomic values, no repeating groups
One row per baby per dose: key `(baby, vaccine)`. Every column holds a single value (guardian address is one text field; no lists in a cell).

### 2NF — remove partial dependencies
Key is `(baby_id, vaccine_id)`. Partial dependencies found:
- `baby_id → baby_name, gender, dob, weight, guardian_*, clinic_*` → moved to `newborns`.
- `vaccine_id → vaccine_name, disease, dose_no, route, age windows` → moved to `vaccine_master`.
What remains in `dose_records` depends on the full key: `scheduled_date, administered_date, status, is_late, remarks, administered_by`.

### 3NF — remove transitive dependencies
- `baby_id → guardian_id → guardian_name, phone, email, address` → `guardians`.
- `baby_id → clinic_id → clinic_name, city, phone` → `clinics`.
- `dose → inventory_id → batch_no, expiry_date, quantity` → `vaccine_inventory` (one row per clinic + vaccine + batch).
- `app_users` keeps login data, with role-scoped FKs to `clinics` / `guardians`.

### BCNF check
Every non-trivial determinant is a candidate key in its table:

| Table | Determinants (all candidate keys) |
|---|---|
| clinics | `clinic_id`, `clinic_name` |
| guardians | `guardian_id`, `phone` |
| app_users | `user_id`, `username` |
| newborns | `baby_id` |
| vaccine_master | `vaccine_id`, `(vaccine_name, dose_number)` |
| vaccine_inventory | `inventory_id`, `(clinic_id, vaccine_id, batch_no)` |
| dose_records | `record_id`, `(baby_id, vaccine_id)` |
| alerts, audit_log, test_log | surrogate key only |

Deliberate design note: `is_regional` and `age_label` live in `vaccine_master` and depend only on `vaccine_id`, so they do not break 3NF. `age_label` is a descriptive label of the age band; the numeric days remain the source of truth.

## 4. Figure list (final numbering, in report order)

Rules: file name `fig_NN_description.png` in `report/figures/`; zoom to 100 to 125%, crop tightly, text must stay readable at about 15 cm wide;
demo data only. **Core** figures are the ones the marking rubric asks for (verification and front-end); **Optional** ones can be dropped if the report runs long.
"DB" figures come from `sqlplus vaxapp@localhost:1521/XEPDB1 @../report/figures_db.sql` run from `/db` (one screenshot per `FIG-DB-nn` banner).
"UI" figures follow [demo_journey.md](demo_journey.md). "Diagram" figures: paste the `.mmd` file into https://mermaid.live and export PNG.

| Fig | File name | Caption | Report section | How to capture | Priority | Captured by | Status |
|---|---|---|---|---|---|---|---|
| 01 | fig_01_er_diagram.png | Entity-relationship diagram of the VaxTrack schema | Database Design | Diagram: `report/er_diagram/er.mmd` | Core | | todo |
| 02 | fig_02_tables_list.png | Tables of the schema with column counts | Database Design | DB: FIG-DB-01 | Core | | todo |
| 03 | fig_03_constraints.png | Primary, foreign, unique and check constraints per table | Database Design | DB: FIG-DB-02 | Core | | todo |
| 04 | fig_04_vaccine_schedule.png | The immunization schedule stored as data in vaccine_master | Database Design | DB: FIG-DB-03 | Core | | todo |
| 05 | fig_05_run_all_clean_run.png | Scripts 99 to 11 running in order on an empty schema | Implementation | Terminal while running `run_all.sql` (demo_journey step 0) | Core | | todo |
| 06 | fig_06_plsql_objects_valid.png | PL/SQL functions, procedures, packages and triggers, all VALID | Implementation | DB: FIG-DB-04 (include the "no rows selected" line) | Core | | todo |
| 07 | fig_07_functions_output.png | Output of the four standalone functions, including the error case | Implementation | DB: FIG-DB-05 | Core | | todo |
| 08 | fig_08_register_newborn_rollback.png | register_newborn creates 24 doses; a future date of birth rolls everything back | Implementation | DB: FIG-DB-06, top part | Core | | todo |
| 09 | fig_09_mark_dose_administered.png | mark_dose_administered: FEFO batch, stock minus one, late flag, and the error paths | Implementation | DB: FIG-DB-06, lower part | Core | | todo |
| 10 | fig_10_triggers_guard_audit.png | Status-guard trigger blocking DONE to PENDING, and the audit row with the actor | Implementation | DB: FIG-DB-07 | Core | | todo |
| 11 | fig_11_overdue_sweep.png | Overdue sweep flipping past-due doses; one alert per dose | Implementation | DB: FIG-DB-08 | Core | | todo |
| 12 | fig_12_refcursor_summary_coverage.png | REF CURSOR output: dashboard summary and clinic coverage | Implementation | DB: FIG-DB-09, first two cursors | Core | | todo |
| 13 | fig_13_refcursor_timeline.png | REF CURSOR output: a baby's timeline with colour bucket and batch | Implementation | DB: FIG-DB-10 | Core | | todo |
| 14 | fig_14_alerts_by_type.png | Alerts raised by triggers and sweeps | Implementation | DB: FIG-DB-11 | Core | | todo |
| 15 | fig_15_audit_log_db.png | audit_log rows written by the trigger | Implementation | DB: FIG-DB-12 | Core | | todo |
| 16 | fig_16_scheduler_job.png | DBMS_SCHEDULER job definition and a successful run | Implementation | DB: FIG-DB-13 | Core | | todo |
| 17 | fig_17_source_mark_dose.png | Source of mark_dose_administered (savepoint, FEFO, rollback) | Implementation | VS Code: `db/04_pkg_newborn.sql`, the procedure body | Optional | | todo |
| 18 | fig_18_architecture.png | Architecture: React, Express, PL/SQL packages, Oracle | Front-End | Diagram: `report/figures/architecture.mmd` | Core | | todo |
| 19 | fig_19_login.png | Sign-in page | Front-End | UI: journey step 1 (before signing in) | Core | | todo |
| 20 | fig_20_dashboard.png | Dashboard with coverage chart, overdue list and unread alerts | Front-End | UI: journey step 3b | Core | | todo |
| 21 | fig_21_dashboard_dark.png | The same dashboard in dark mode | Front-End | UI: journey step 3b, theme switch in the sidebar | Optional | | todo |
| 22 | fig_22_register_validation.png | Register newborn form showing validation messages | Front-End | UI: journey step 3 (empty submit) | Core | | todo |
| 23 | fig_23_schedule_generated.png | Generated 24-dose schedule shown right after registration | Front-End | UI: journey step 3 | Core | | todo |
| 24 | fig_24_baby_profile.png | Baby profile: coverage, status bar and colour-coded timeline | Front-End | UI: journey step 4 (after confirming) | Core | | todo |
| 25 | fig_25_administer_dialog.png | Mark administered dialog with the automatically chosen batch | Front-End | UI: journey step 4 (before confirming) | Core | | todo |
| 26 | fig_26_reschedule_dialog.png | Reschedule dialog | Front-End | UI: journey step 6 | Core | | todo |
| 27 | fig_27_inventory_low_stock.png | Inventory with a low-stock batch and expiry badges | Front-End | UI: journey step 5 | Core | | todo |
| 28 | fig_28_restock_dialog.png | Restock dialog | Front-End | UI: journey step 2 | Core | | todo |
| 29 | fig_29_alerts_center.png | Alerts center filtered to low-stock alerts | Front-End | UI: journey step 5 | Core | | todo |
| 30 | fig_30_reports.png | Reports: coverage by clinic chart, table and overdue list | Front-End | UI: journey step 10 (as admin) | Core | | todo |
| 31 | fig_31_vaccination_card.png | Printable vaccination card (parent view) | Front-End | UI: journey step 8 | Core | | todo |
| 32 | fig_32_parent_view.png | Parent sees only their own child | Front-End | UI: journey step 8 | Core | | todo |
| 33 | fig_33_audit_log_ui.png | Admin audit log showing who changed the dose and when | Front-End | UI: journey step 9 | Core | | todo |
| 34 | fig_34_phone_dashboard.png | Dashboard at phone width | Front-End | Browser device mode 390 px, or a real phone | Core | | todo |
| 35 | fig_35_phone_menu_dark.png | Phone menu in dark mode | Front-End | As 34: open the menu and switch to dark | Optional | | todo |
| 36 | fig_36_test_log.png | test_log: all 31 test cases PASS | Verification and Testing | Terminal: end of `11_tests.sql` (also at the end of run_all) | Core | | todo |
| 37 | fig_37_tc_p4.png | TC-P4 close-up: DONE and stock decremented by exactly one | Verification and Testing | Crop of fig_36 | Core | | todo |
| 38 | fig_38_tc_p6.png | TC-P6 close-up: out-of-stock rolls back | Verification and Testing | Crop of fig_36 | Core | | todo |
| 39 | fig_39_tc_p8.png | TC-P8 close-up: late dose flag and alert | Verification and Testing | Crop of fig_36 | Core | | todo |
| 40 | fig_40_tc_t3.png | TC-T3 close-up: low-stock trigger fires once | Verification and Testing | Crop of fig_36 | Core | | todo |
| 41 | fig_41_api_login.png | API: login returns a token and the user | Verification and Testing | VS Code REST Client, `api/requests.http`, "Login as nurse1" | Core | | todo |
| 42 | fig_42_api_register.png | API: register a newborn returns 24 timeline rows | Verification and Testing | REST Client, "Register a baby" | Core | | todo |
| 43 | fig_43_api_administer.png | API: administer a dose | Verification and Testing | REST Client, "Mark the birth dose administered" | Core | | todo |
| 44 | fig_44_api_out_of_stock.png | API: out of stock returns 409 with a clear message | Verification and Testing | REST Client, the Vitamin A request as nurse2 | Core | | todo |
| 45 | fig_45_api_forbidden.png | API: a parent calling a staff route gets 403 | Verification and Testing | REST Client, "FAIL: parent" under Dashboard | Core | | todo |
| 46 | fig_46_npm_smoke.png | npm run smoke: 152 of 152 checks | Verification and Testing | Terminal: `cd api; npm run smoke` (demo seed loaded) | Core | | todo |
| 47 | fig_47_authz_matrix.png | npm run authz: role by route matrix and token checks | Verification and Testing | Terminal: `cd api; npm run authz` | Optional | | todo |
| 48 | fig_48_lighthouse_dashboard.png | Lighthouse accessibility score for the dashboard (production build) | Results and Discussion | Edge DevTools, Lighthouse, Accessibility only, on `npm run preview` | Core | | todo |
| 49 | fig_49_lighthouse_dark.png | Lighthouse accessibility score in dark mode | Results and Discussion | Same, with the dark theme selected | Optional | | todo |
| 51 | fig_51_users_page.png | Admin Users page: every login, with the add-nurse and add-parent-login actions | Front-End | UI: sign in as admin, sidebar Users | Optional | | todo |
| 52 | fig_52_signin_directory.png | Sign-in page with the live login directory and the show-password toggle | Front-End | UI: sign-in page, click an account (fills and reveals the password) | Core | | todo |
| 53 | fig_53_parent_login_created.png | Parent login created automatically when a baby is registered | Front-End | UI: journey step 3, below the schedule banner | Core | | todo |
| 54 | fig_54_edit_newborn.png | Administrator edit dialog: correcting a date of birth | Front-End | UI: journey step 8c | Optional | | todo |
| 55 | fig_55_delete_newborn.png | Administrator delete confirmation (type the name, optional stock return) | Front-End | UI: journey step 8c | Optional | | todo |
| 56 | fig_56_phone_known_guardian.png | Register form: the phone number belongs to a registered guardian (yes/no only, guardian fields disabled) | Front-End | UI: journey step 3, type 9876500001 into Phone | Optional | | todo |
| 50 | fig_50_ui_out_of_stock.png | Mark administered dialog when the clinic has no stock (Confirm disabled) | Front-End | UI: journey step 7 | Optional | | todo |

Appendix material (no figure number): `report/run_all.log` (full clean-state log), `report/test_cases_table.md` (test table), `report/frontend_map.md` (page, endpoint and package table),
`report/stage6_notes.md` (accessibility and security results), and the full SQL scripts in `/db`.

Figure numbers are final: if a figure is dropped, leave its number out of the report rather than renumbering the others.
