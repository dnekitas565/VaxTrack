# Front-end map: page -> API endpoint -> PL/SQL object

Use this table in the Front-End section of the report. Roles: A = ADMIN, N = NURSE, P = PARENT.

| Page (route) | Roles | API endpoints | PL/SQL objects reached |
|---|---|---|---|
| Login (`/login`) | all | `POST /auth/login`, `GET /me` | none (bcrypt + JWT in the API; reads `app_users`) |
| Dashboard (`/`) | A, N | `GET /dashboard/summary`, `/overdue`, `/upcoming?days=7`, `GET /clinics` | `newborn_vaccination_pkg.refresh_overdue_status`, `vax_reporting_pkg.dashboard_summary`, `overdue_list`, `upcoming_list` |
| Register newborn (`/register`) | A, N | `POST /newborns`, `GET /clinics` | `newborn_vaccination_pkg.register_newborn` (calls `generate_schedule`, `calculate_due_date`), `vax_reporting_pkg.baby_timeline`, trigger `trg_newborn_dob_check` |
| Newborns (`/newborns`) | A, N, P | `GET /newborns?search=` | functions `get_age_text`, `get_coverage_pct` |
| Baby profile (`/newborns/:id`) | A, N, P | `GET /newborns/:id` | `vax_reporting_pkg.baby_timeline`, `get_age_text`, `get_coverage_pct` |
| Mark administered (dialog) | A, N | `GET /doses/:id/batch-preview`, `POST /doses/:id/administer` | `newborn_vaccination_pkg.is_dose_allowed`, `vaccine_inventory_pkg.pick_batch`, `newborn_vaccination_pkg.mark_dose_administered`; triggers `trg_dose_status_guard`, `trg_dose_audit`, `trg_inventory_low_stock` |
| Reschedule (dialog) | A, N | `POST /doses/:id/reschedule` | `newborn_vaccination_pkg.reschedule_dose` |
| Inventory (`/inventory`) | A, N | `GET /inventory`, `GET /vaccines`, `POST /inventory/restock` | `dose_label`, `vaccine_inventory_pkg.restock` |
| Alerts (`/alerts`) | A, N | `GET /alerts`, `PATCH /alerts/:id/read` | alerts are written by `trg_dose_alerts`, `trg_inventory_low_stock`, `send_due_soon_alerts`, `expiry_sweep`, `mark_dose_administered` |
| Reports (`/reports`) | A, N | `GET /reports/clinic-coverage`, `GET /dashboard/overdue` | `vax_reporting_pkg.clinic_coverage` (RANK analytic), `overdue_list` |
| Vaccination card (`/newborns/:id/card`) | A, N, P | `GET /newborns/:id` | `vax_reporting_pkg.baby_timeline` |
| Audit log (`/audit`) | A | `GET /audit?recordId=` | table `audit_log`, filled by `trg_dose_audit` and `restock` |

Daily job `JOB_DAILY_VAX_SWEEP` runs the same sweeps without any page being open.
