# Report drafts: review first, then they go into Word

Written for the faculty examiner, in plain academic English, first person plural. Every fact comes from the repository, the real test runs or this machine.
The Word file is built from these files (see "Building the Word file" at the end). Edit the .md files, then rebuild. The template is `BCSE302P_Mini_Project_Report_Template.docx` (repo root).

## Files (same order as the template)
00 Abstract (195 words) · 01 Introduction · 02 System Requirements · 03 Database Design · 04 Implementation · 05 Front-End · 06 Verification & Testing · 07 Results & Discussion · 08 Conclusion · 09 References · 10 Appendices

The template already enforces: Times New Roman 12, 1.5 spacing, bold 14 pt headings, 1-inch margins and page numbers. Its cover page, certificate, abstract and TOC need the team details below.

## What I need from you before the Word file can be built
1. Team name, member names and registration numbers (cover page, certificate, e-mail). The template allows at most 4 members and says individual reports carry higher weightage.
2. Submission date for the cover page.
3. Whether the team also used Oracle SQL Developer for VS Code (Section 2.2 has a marked comment).
4. Your OK on the project-defined limits (`max_age_days`) that Section 1.4 states as our own choice, and on the vaccine routes and diseases, which are standard programme facts that the NIS document does not print.

## Things I could not verify (please do)
- **References (09):** I wrote them from the sources the project used but did not open the web pages. Open each link, check titles, versions and dates, and fill the **TODO date** access dates. Reference [6] needs the NIS web address and publication date printed on your PDF.
- **Hardware table (02):** read from this machine on 10 Oct 2026. If the report is written from another machine, change it.
- **Test table (06):** copied from `report/test_cases_table.md`. The "Actual" column dates and the TC-R1 counts belong to a particular run; after your own clean run (journey step 0) compare them with your `test_log` and update.
- **Lighthouse (07):** the "100 on every page" statement comes from my runs in headless Edge on the production build (the last one on 10 Oct 2026). Run Lighthouse yourself for Figures 7.1 and 7.2.
- **Screenshots:** none exist yet. All 56 must come from your own runs, using the table below and `report/demo_journey.md`. Optional figures can be dropped if the report gets long; delete the placeholder and its sentence together.
- **Mutating-table challenge (07, 7.2):** I describe it as avoided by design, because I have no record that the project ever raised ORA-04091. If you hit it yourselves, say so.
- **Claims I wrote from memory of the build:** 48 concurrent dashboard requests all succeeded (Stage 6 notes), the 25-step browser journey passes in both themes, and no horizontal overflow at 360, 390, 768 and 1280 px. They are in `report/stage6_notes.md`; re-run before you rely on them.

## Rules the drafts follow
- Figure numbers are per section as the template shows (Figure 3.1, 4.3 ...), in the order they appear, and every figure is referenced in the text. The table below maps each report figure to the file name from `report_notes.md`.
- Each `**[ INSERT IMAGE: ... ]**` line is a placeholder for the picture; the caption under it is final.
- Tables are numbered as the template does (Table 3.1 to 3.10 in Section 3.2).

## Figure map (report number -> file to save in `report/figures/`)
| Figure in report | File to save in report/figures/ | How to capture | Priority |
|---|---|---|---|
| Figure 3.1 | fig_01_er_diagram.png | Diagram: `report/er_diagram/er.mmd` | Core |
| Figure 3.2 | fig_02_tables_list.png | DB: FIG-DB-01 | Core |
| Figure 3.3 | fig_03_constraints.png | DB: FIG-DB-02 | Core |
| Figure 3.4 | fig_04_vaccine_schedule.png | DB: FIG-DB-03 | Core |
| Figure 4.1 | fig_05_run_all_clean_run.png | Terminal while running `run_all.sql` (demo_journey step 0) | Core |
| Figure 4.2 | fig_06_plsql_objects_valid.png | DB: FIG-DB-04 (include the "no rows selected" line) | Core |
| Figure 4.3 | fig_07_functions_output.png | DB: FIG-DB-05 | Core |
| Figure 4.4 | fig_14_alerts_by_type.png | DB: FIG-DB-11 | Core |
| Figure 4.5 | fig_08_register_newborn_rollback.png | DB: FIG-DB-06, top part | Core |
| Figure 4.6 | fig_09_mark_dose_administered.png | DB: FIG-DB-06, lower part | Core |
| Figure 4.7 | fig_10_triggers_guard_audit.png | DB: FIG-DB-07 | Core |
| Figure 4.8 | fig_15_audit_log_db.png | DB: FIG-DB-12 | Core |
| Figure 4.9 | fig_11_overdue_sweep.png | DB: FIG-DB-08 | Core |
| Figure 4.10 | fig_12_refcursor_summary_coverage.png | DB: FIG-DB-09, first two cursors | Core |
| Figure 4.11 | fig_13_refcursor_timeline.png | DB: FIG-DB-10 | Core |
| Figure 4.12 | fig_16_scheduler_job.png | DB: FIG-DB-13 | Core |
| Figure 4.13 | fig_17_source_mark_dose.png | VS Code: `db/04_pkg_newborn.sql`, the procedure body | Optional |
| Figure 5.1 | fig_19_login.png | UI: journey step 1 (before signing in) | Core |
| Figure 5.2 | fig_52_signin_directory.png | UI: sign-in page, click an account (fills and reveals the password) | Core |
| Figure 5.3 | fig_20_dashboard.png | UI: journey step 3b | Core |
| Figure 5.4 | fig_21_dashboard_dark.png | UI: journey step 3b, theme switch in the sidebar | Optional |
| Figure 5.5 | fig_34_phone_dashboard.png | Browser device mode 390 px, or a real phone | Core |
| Figure 5.6 | fig_35_phone_menu_dark.png | As 34: open the menu and switch to dark | Optional |
| Figure 5.7 | fig_22_register_validation.png | UI: journey step 3 (empty submit) | Core |
| Figure 5.8 | fig_56_phone_known_guardian.png | UI: journey step 3, type 9876500001 into Phone | Optional |
| Figure 5.9 | fig_23_schedule_generated.png | UI: journey step 3 | Core |
| Figure 5.10 | fig_53_parent_login_created.png | UI: journey step 3, below the schedule banner | Core |
| Figure 5.11 | fig_24_baby_profile.png | UI: journey step 4 (after confirming) | Core |
| Figure 5.12 | fig_25_administer_dialog.png | UI: journey step 4 (before confirming) | Core |
| Figure 5.13 | fig_50_ui_out_of_stock.png | UI: journey step 7 | Optional |
| Figure 5.14 | fig_26_reschedule_dialog.png | UI: journey step 6 | Core |
| Figure 5.15 | fig_27_inventory_low_stock.png | UI: journey step 5 | Core |
| Figure 5.16 | fig_28_restock_dialog.png | UI: journey step 2 | Core |
| Figure 5.17 | fig_29_alerts_center.png | UI: journey step 5 | Core |
| Figure 5.18 | fig_30_reports.png | UI: journey step 10 (as admin) | Core |
| Figure 5.19 | fig_31_vaccination_card.png | UI: journey step 8 | Core |
| Figure 5.20 | fig_32_parent_view.png | UI: journey step 8 | Core |
| Figure 5.21 | fig_33_audit_log_ui.png | UI: journey step 9 | Core |
| Figure 5.22 | fig_51_users_page.png | UI: sign in as admin, sidebar Users | Optional |
| Figure 5.23 | fig_54_edit_newborn.png | UI: journey step 8c | Optional |
| Figure 5.24 | fig_55_delete_newborn.png | UI: journey step 8c | Optional |
| Figure 5.25 | fig_18_architecture.png | Diagram: `report/figures/architecture.mmd` | Core |
| Figure 6.1 | fig_36_test_log.png | Terminal: end of `11_tests.sql` (also at the end of run_all) | Core |
| Figure 6.2 | fig_37_tc_p4.png | Crop of fig_36 | Core |
| Figure 6.3 | fig_38_tc_p6.png | Crop of fig_36 | Core |
| Figure 6.4 | fig_39_tc_p8.png | Crop of fig_36 | Core |
| Figure 6.5 | fig_40_tc_t3.png | Crop of fig_36 | Core |
| Figure 6.6 | fig_41_api_login.png | VS Code REST Client, `api/requests.http`, "Login as nurse1" | Core |
| Figure 6.7 | fig_42_api_register.png | REST Client, "Register a baby" | Core |
| Figure 6.8 | fig_43_api_administer.png | REST Client, "Mark the birth dose administered" | Core |
| Figure 6.9 | fig_44_api_out_of_stock.png | REST Client, the Vitamin A request as nurse2 | Core |
| Figure 6.10 | fig_45_api_forbidden.png | REST Client, "FAIL: parent" under Dashboard | Core |
| Figure 6.11 | fig_46_npm_smoke.png | Terminal: `cd api; npm run smoke` (demo seed loaded) | Core |
| Figure 6.12 | fig_47_authz_matrix.png | Terminal: `cd api; npm run authz` | Optional |
| Figure 7.1 | fig_48_lighthouse_dashboard.png | Edge DevTools, Lighthouse, Accessibility only, on `npm run preview` | Core |
| Figure 7.2 | fig_49_lighthouse_dark.png | Same, with the dark theme selected | Optional |

## Building the Word file
`report/VaxTrack_Report.docx` is generated from the template and these drafts by `report/tools/build_report.py`:

1. Fill `report/team.json` (names, registration numbers, submission date as `dd / mm / 2026`). Empty fields stay as yellow placeholders on the cover and the certificate.
2. Save each screenshot in `report/figures/` under the file name from the table above. A figure whose file is missing stays a dashed "[ Insert screenshot ]" box.
3. `pip install python-docx`, then from the repository root: `python report/tools/build_report.py`.
4. Open the .docx in Word, right-click the table of contents, Update Field, Update entire table, check it, then Save As PDF named `BCSE302P_Project_<TeamName>.pdf`.

The file in the repository was built on 10 Oct 2026 with no team details and no screenshots yet (56 pages), and its table of contents was updated by Word. Rebuilding replaces it, so the table of contents must be updated again.
