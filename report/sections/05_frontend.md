# 5. FRONT-END

The front end is a responsive web application written with React and Vite. It serves three roles: the **administrator** sees every clinic and the audit log and manages logins, a **nurse** works on the babies and the stock of one clinic, and a **parent** sees only their own children and their vaccination cards. Status colours are the same on every screen: green for a dose given, amber for a dose due soon, red for an overdue dose, grey for a dose in the future. Light and dark themes are both available.

## 5.1 User Interface

**Sign-in.** The sign-in page (Figure 5.1) lists the demo accounts with their passwords and a button that shows or hides what is typed in the password box; the list is only available while the API runs with the development switch `DEMO_LOGINS=true` (Figure 5.2).

**[ INSERT IMAGE: report/figures/fig_19_login.png ]**

*Figure 5.1: Sign-in page*

**[ INSERT IMAGE: report/figures/fig_52_signin_directory.png ]**

*Figure 5.2: Sign-in page with the live login directory and the show-password toggle*

**Dashboard.** The dashboard (Figure 5.3) shows the number of babies and of doses given, pending and overdue, a coverage chart, the overdue doses, the doses due within seven days, and the number of unread alerts. Figure 5.4 shows the same page in the dark theme, and Figure 5.5 and Figure 5.6 show the phone layout.

**[ INSERT IMAGE: report/figures/fig_20_dashboard.png ]**

*Figure 5.3: Dashboard with coverage chart, overdue list and unread alerts*

**[ INSERT IMAGE: report/figures/fig_21_dashboard_dark.png ]**

*Figure 5.4: The same dashboard in dark mode*

**[ INSERT IMAGE: report/figures/fig_34_phone_dashboard.png ]**

*Figure 5.5: Dashboard at phone width*

**[ INSERT IMAGE: report/figures/fig_35_phone_menu_dark.png ]**

*Figure 5.6: Phone menu in dark mode*

**Registering a newborn.** The form (Figure 5.7) validates the input before it is sent and has an "Endemic district (JE)" box that adds the two Japanese encephalitis doses. The phone field tells the nurse whether the number already belongs to a registered guardian, answering only yes or no and showing no detail about the guardian (Figure 5.8). A new guardian needs a name and an address; for a known number the stored details are kept. When the baby is saved, the generated schedule appears at once (Figure 5.9), and a card shows the parent login that was created, with a button to copy it (Figure 5.10).

**[ INSERT IMAGE: report/figures/fig_22_register_validation.png ]**

*Figure 5.7: Register newborn form showing validation messages*

**[ INSERT IMAGE: report/figures/fig_56_phone_known_guardian.png ]**

*Figure 5.8: Register form: the phone number belongs to a registered guardian (yes/no only, guardian fields disabled)*

**[ INSERT IMAGE: report/figures/fig_23_schedule_generated.png ]**

*Figure 5.9: Generated 24-dose schedule shown right after registration*

**[ INSERT IMAGE: report/figures/fig_53_parent_login_created.png ]**

*Figure 5.10: Parent login created automatically when a baby is registered*

**Baby profile.** The profile (Figure 5.11) shows the age, the coverage, a bar of doses given, pending and overdue, and a vertical timeline grouped by age band, with a status filter. Each dose has actions for a nurse or an administrator. *Mark administered* opens a dialog (Figure 5.12) that shows which batch the database will use; if the clinic has no usable stock the dialog says so and the confirm button is disabled (Figure 5.13). *Reschedule* (Figure 5.14) asks for a new date and a reason.

**[ INSERT IMAGE: report/figures/fig_24_baby_profile.png ]**

*Figure 5.11: Baby profile: coverage, status bar and colour-coded timeline*

**[ INSERT IMAGE: report/figures/fig_25_administer_dialog.png ]**

*Figure 5.12: Mark administered dialog with the automatically chosen batch*

**[ INSERT IMAGE: report/figures/fig_50_ui_out_of_stock.png ]**

*Figure 5.13: Mark administered dialog when the clinic has no stock (Confirm disabled)*

**[ INSERT IMAGE: report/figures/fig_26_reschedule_dialog.png ]**

*Figure 5.14: Reschedule dialog*

**Inventory and alerts.** The inventory page (Figure 5.15) lists the batches with expiry and low-stock badges, and *Restock* (Figure 5.16) adds a batch. The alerts page (Figure 5.17) filters by type and marks alerts as read.

**[ INSERT IMAGE: report/figures/fig_27_inventory_low_stock.png ]**

*Figure 5.15: Inventory with a low-stock batch and expiry badges*

**[ INSERT IMAGE: report/figures/fig_28_restock_dialog.png ]**

*Figure 5.16: Restock dialog*

**[ INSERT IMAGE: report/figures/fig_29_alerts_center.png ]**

*Figure 5.17: Alerts center filtered to low-stock alerts*

**Reports, vaccination card and parent view.** Reports (Figure 5.18) compares the clinics' coverage and lists the overdue doses, with a CSV export. The vaccination card (Figure 5.19) is a printable page that a parent can open. A parent sees only their own children (Figure 5.20).

**[ INSERT IMAGE: report/figures/fig_30_reports.png ]**

*Figure 5.18: Reports: coverage by clinic chart, table and overdue list*

**[ INSERT IMAGE: report/figures/fig_31_vaccination_card.png ]**

*Figure 5.19: Printable vaccination card (parent view)*

**[ INSERT IMAGE: report/figures/fig_32_parent_view.png ]**

*Figure 5.20: Parent sees only their own child*

**Administrator pages.** The audit log (Figure 5.21) shows who changed which dose and when. The Users page (Figure 5.22) lists every login and adds nurses or parent logins. An administrator can also correct a newborn's date of birth (Figure 5.23), which moves the unfinished doses, or delete a newborn record after typing the baby's name (Figure 5.24).

**[ INSERT IMAGE: report/figures/fig_33_audit_log_ui.png ]**

*Figure 5.21: Admin audit log showing who changed the dose and when*

**[ INSERT IMAGE: report/figures/fig_51_users_page.png ]**

*Figure 5.22: Admin Users page: every login, with the add-nurse and add-parent-login actions*

**[ INSERT IMAGE: report/figures/fig_54_edit_newborn.png ]**

*Figure 5.23: Administrator edit dialog: correcting a date of birth*

**[ INSERT IMAGE: report/figures/fig_55_delete_newborn.png ]**

*Figure 5.24: Administrator delete confirmation (type the name, optional stock return)*

## 5.2 Integration with the DBMS

The application has three tiers (Figure 5.25). The React application [9] sends JSON over HTTP with a JSON Web Token [12]. The Express API validates the input, checks the role and the clinic, sets the acting user, calls one PL/SQL package procedure with bind variables, and turns the result into JSON. The Oracle database applies every rule. The API contains no business logic: the schedule, the stock deduction, the late-dose flag and the alerts are all decided by the packages and triggers of Section 4.

**[ INSERT IMAGE: report/figures/fig_18_architecture.png ]**

*Figure 5.25: Architecture: React, Express, PL/SQL packages, Oracle*

**Connection.** The API uses a `node-oracledb` connection pool in thin mode [7]. For each request it takes a connection, calls `newborn_vaccination_pkg.set_actor` so that the audit trigger records the right user, runs the work, commits or rolls back, and releases the connection.

```javascript
export async function withConn(userId, fn) {
  const conn = await pool.getConnection();
  try {
    await conn.execute('BEGIN newborn_vaccination_pkg.set_actor(:id); END;', { id: num(userId) });
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try { await conn.rollback(); } catch { /* connection may already be gone */ }
    throw err;
  } finally {
    await conn.close();
  }
}
```

**Calling a package.** Registering a newborn is one call to the package; every value is a bind variable, and no SQL string is built from user input.

```javascript
await call(conn,
  `BEGIN
     newborn_vaccination_pkg.register_newborn(
       p_guardian_name => :gname, p_guardian_phone => :gphone,
       p_guardian_email => :gemail, p_guardian_address => :gaddress,
       p_baby_name => :bname, p_gender => :gender,
       p_dob => TO_DATE(:dob, 'YYYY-MM-DD'), p_birth_weight_kg => :weight,
       p_clinic_id => :clinic, p_include_regional => :regional,
       p_baby_id => :baby_id, p_parent_hash => :phash, p_parent_username => :puser);
   END;`, { /* bind values */ });
```

**Errors.** A coded Oracle error such as `ORA-20009: No usable stock …` is mapped to an HTTP status (409 for no stock, 422 for a date that is not allowed, 403 for an action that only an administrator may take, and so on) and the readable message is shown to the user.

**Security.** Passwords are stored as bcrypt hashes [13]. Sign-in returns a signed token, and every route checks the role; a nurse can reach only the babies and the stock of their own clinic, and a parent only their own children. Input is validated with zod before it reaches the database, and the API sets the standard security headers with helmet. The known limitations are listed in Section 7.3.

**Which package each screen calls.**

| Page (route) | Roles | API endpoints | PL/SQL objects reached |
|---|---|---|---|
| Login (`/login`) | all | `POST /auth/login`, `GET /me` | none (bcrypt + JWT in the API; reads `app_users`) |
| Dashboard (`/`) | A, N | `GET /dashboard/summary`, `/overdue`, `/upcoming?days=7`, `GET /clinics` | `newborn_vaccination_pkg.refresh_overdue_status`, `vax_reporting_pkg.dashboard_summary`, `overdue_list`, `upcoming_list` |
| Register newborn (`/register`) | A, N | `POST /newborns`, `GET /newborns/guardian-lookup?phone=` (yes/no only, 30 a minute), `GET /clinics` | `newborn_vaccination_pkg.guardian_exists`, `register_newborn` (calls `generate_schedule`, `calculate_due_date`, `account_pkg.suggest_username` and `add_user` for the guardian's parent login, all in one transaction; the guardian name is optional for a known phone), `vax_reporting_pkg.baby_timeline`, trigger `trg_newborn_dob_check` |
| Newborns (`/newborns`) | A, N, P | `GET /newborns?search=` | functions `get_age_text`, `get_coverage_pct` |
| Baby profile (`/newborns/:id`) | A, N, P | `GET /newborns/:id` | `vax_reporting_pkg.baby_timeline`, `get_age_text`, `get_coverage_pct` |
| Edit / Delete newborn (dialogs, admin only) | A | `PATCH /newborns/:id`, `DELETE /newborns/:id?restoreStock=1` | `newborn_vaccination_pkg.update_newborn` (recalculates unfinished due dates, late flags and stale alerts; refuses a birthday that invalidates a given dose), `delete_newborn` (optional stock return; guardian and login kept); both audited, both admin-checked in the database; triggers `trg_dose_status_guard`, `trg_dose_alerts`, `trg_dose_audit` |
| Mark administered (dialog) | A, N | `GET /doses/:id/batch-preview`, `POST /doses/:id/administer` | `newborn_vaccination_pkg.is_dose_allowed`, `vaccine_inventory_pkg.pick_batch`, `newborn_vaccination_pkg.mark_dose_administered`; triggers `trg_dose_status_guard`, `trg_dose_audit`, `trg_inventory_low_stock` |
| Reschedule (dialog) | A, N | `POST /doses/:id/reschedule` | `newborn_vaccination_pkg.reschedule_dose` |
| Inventory (`/inventory`) | A, N | `GET /inventory`, `GET /vaccines`, `POST /inventory/restock` | `dose_label`, `vaccine_inventory_pkg.restock` |
| Alerts (`/alerts`) | A, N | `GET /alerts`, `PATCH /alerts/:id/read` | alerts are written by `trg_dose_alerts`, `trg_inventory_low_stock`, `send_due_soon_alerts`, `expiry_sweep`, `mark_dose_administered` |
| Reports (`/reports`) | A, N | `GET /reports/clinic-coverage`, `GET /dashboard/overdue` | `vax_reporting_pkg.clinic_coverage` (RANK analytic), `overdue_list` |
| Vaccination card (`/newborns/:id/card`) | A, N, P | `GET /newborns/:id` | `vax_reporting_pkg.baby_timeline` |
| Users (`/users`) | A | `GET /users`, `GET /users/options`, `POST /users` | `account_pkg.create_user` (nurse needs a clinic, one login per guardian, unique username, audit row); list is a SELECT |
| Sign-in login directory (`/login`) | public, development only | `GET /auth/demo-logins` (needs `DEMO_LOGINS=true`) | reads `app_users`; the API also rewrites `LOGINS.md` |
| Audit log (`/audit`) | A | `GET /audit?recordId=` | table `audit_log`, filled by `trg_dose_audit` and `restock` |

The daily job `JOB_DAILY_VAX_SWEEP` runs the same sweeps without any page being open.
