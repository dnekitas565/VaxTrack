# 10. APPENDICES

## Appendix A – Additional Code

The complete source is in the project folder and is to be pasted into this appendix in the order below (monospaced, 9–10 pt). Run in this order on an empty schema, each script can be run again.

| Order | File | Contents |
|---|---|---|
| 1 | `db/00_create_user.sql` | creates the application user `vaxapp` and its privileges |
| 2 | `db/01_schema.sql` | all tables, constraints, identity keys and indexes |
| 3 | `db/02_seed_reference.sql` | clinics, the vaccine schedule, the administrator and nurse logins |
| 4 | `db/03_functions.sql` | the five standalone functions |
| 5 | `db/03b_pkg_accounts.sql` | `account_pkg` |
| 6 | `db/04_pkg_newborn.sql` | `newborn_vaccination_pkg` with the table of error codes |
| 7 | `db/05_pkg_inventory.sql` | `vaccine_inventory_pkg` |
| 8 | `db/06_pkg_reporting.sql` | `vax_reporting_pkg` |
| 9 | `db/07_procedures.sql` | `send_due_soon_alerts` |
| 10 | `db/08_triggers.sql` | the five triggers |
| 11 | `db/09_scheduler.sql` | the daily scheduler job |
| 12 | `db/10_seed_demo.sql` | demonstration babies, doses and stock |
| 13 | `db/11_tests.sql` | the 31 automated test cases |
| – | `db/run_all.sql`, `report/run_all.log` | the whole chain and a log of one clean run |
| – | `api/src/` | the API: `db.js`, `app.js`, `errors.js`, `validate.js` and the routes |
| – | `web/src/` | the React application |

The API and web sources are long; if the page limit is a problem, include `db.js`, `errors.js`, `routes/newborns.js` and `pages/RegisterNewborn.jsx` and refer to the repository for the rest.

## Appendix B – Additional Screenshots

Screenshots that are not placed in the main body, each with a figure caption in the same numbering style, go here (for example further API responses, or additional pages in the dark theme).
