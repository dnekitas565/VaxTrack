# VaxTrack — Project Explained Simply

## 1. The idea in one minute

When a baby is born, they must get a series of vaccines at exact ages: at birth, then at 6, 10 and 14 weeks, then at 9 months, and so on. Missing or delaying a dose is a real health risk.

Today, clinics and parents often track this on paper or in memory. Things get missed, stock runs out without warning, and nobody knows who gave what.

**VaxTrack is a web app backed by an Oracle database that does this tracking automatically.**

- Register a baby once, and the system builds the whole vaccine schedule from the date of birth.
- It shows which doses are done, coming up, or overdue.
- It keeps track of the clinic's vaccine stock and expiry dates.
- It raises alerts and keeps a record of every change.

---

## 2. Who uses it

| User | What they can do |
|---|---|
| **Nurse** (at a clinic) | Register babies, give doses, reschedule doses, restock vaccines |
| **Parent** | View their own child's schedule and print the vaccination card (read-only) |
| **Admin** | See everything: all clinics, reports, alerts, and the audit log |

---

## 3. A day in the life of the app (example)

1. **Nurse registers a baby**, "Aarav", born 10 weeks ago, with the guardian's details.
2. **The system instantly creates all his doses** (24 rows, based on the official National Immunization Schedule), each with a due date worked out from his birth date.
3. **The dashboard shows colours:** green = done, amber = coming soon, red = overdue. Aarav's 6-week doses are marked as overdue, in red.
4. **The nurse gives a dose** and clicks "Mark administered". The system:
   - picks a vaccine batch that has stock and the earliest expiry date,
   - reduces the stock by one,
   - marks the dose as done,
   - and records who did it and when.
5. **If stock is empty**, the whole action is cancelled safely. The dose stays pending and the stock stays unchanged.
6. **If stock gets low**, an alert is created automatically for the clinic.
7. **The parent logs in** and sees Aarav's timeline and can print his vaccination card.
8. **The admin opens the audit log** and sees exactly who changed what.

---

## 4. How it is built: three layers

```
 Web app (React)  ──►  API (Node.js + Express)  ──►  Oracle Database (PL/SQL)
   what you see          a thin messenger             where all the rules live
```

- **Web app:** the screens the user sees and clicks.
- **API:** receives the click, checks the user is logged in and allowed, and passes the request on. It contains **no business rules**.
- **Oracle database:** does the real work. All the logic is written as PL/SQL inside the database.

**Why this design?** The course is about databases. Keeping the logic in the database shows off functions, procedures, packages, triggers and cursors, which is exactly what the faculty grades. It also keeps data safe, because the rules are enforced no matter which app talks to the database.

---

## 5. The database (the data we store)

Think of these as the project's spreadsheets:

| Table | What it holds |
|---|---|
| `clinics` | Clinic names and cities |
| `app_users` | Logins (nurse / parent / admin) |
| `guardians` | Parent or guardian details |
| `newborns` | Each baby: name, date of birth, weight, guardian, clinic |
| `vaccine_master` | The official schedule: each vaccine, dose number, and the age (in days) it is due. The schedule is **data**, so it can be changed without touching code |
| `vaccine_inventory` | Stock per clinic, per vaccine, per batch, with quantity and expiry date |
| `dose_records` | One row per baby per dose: due date, given date, status (PENDING / DONE / OVERDUE), which batch was used |
| `alerts` | Messages like "Overdue", "Low stock", "Batch expiring" |
| `audit_log` | A history of changes: who, what, when |
| `test_log` | Results of our automated tests |

The tables are organised (normalized) so that nothing is stored twice. For example, guardian details live in one place and are linked to the baby by an ID.

---

## 6. The PL/SQL part (the heart of the project)

PL/SQL is Oracle's programming language that runs inside the database. We use five kinds of objects:

### Functions: small calculators that return an answer
- `calculate_due_date`: birth date + the vaccine's due age = due date
- `get_age_text`: turns a birth date into "3 months 12 days"
- `get_coverage_pct`: what percentage of a baby's doses are done
- `get_next_due_dose`: which dose is due next

### Procedures: jobs that do something
- Register a baby and build the schedule
- Mark a dose as given (and reduce stock)
- Reschedule a dose
- Restock vaccines
- Send "due soon" alerts

### Packages: bundles of related functions and procedures
- `newborn_vaccination_pkg`: everything about babies and doses
- `vaccine_inventory_pkg`: everything about stock and batches
- `vax_reporting_pkg`: numbers and lists for the dashboard and reports

### Triggers: automatic reactions to changes
A trigger runs by itself when data changes. We use them to:
- stop a bad birth date (in the future),
- turn a late dose into OVERDUE and raise an alert,
- block illegal changes (for example, un-doing a given dose),
- write every change into the audit log,
- raise a low-stock alert when stock drops below a limit.

### Cursors: looping through rows
A cursor lets PL/SQL go through query results one row at a time. We use them when:
- building a baby's schedule (loop through every vaccine in the master list),
- finding overdue doses,
- checking batches that are about to expire,
- sending lists of results to the web app.

### A scheduled job
Every day, the database itself runs a job that checks for overdue doses, creates "due soon" alerts and checks expiring batches, without anyone clicking anything.

---

## 7. The most important rule: transactions

When a nurse gives a dose, **two things must happen together**: the dose is marked done **and** the stock goes down by one.

If only one happened, the data would be wrong. So the procedure does both inside one **transaction**:

- Everything succeeds, so the changes are saved (**COMMIT**).
- Anything fails (for example, no stock), so everything is undone (**ROLLBACK**), and the user sees a clear error message.

This all-or-nothing behaviour is a core database idea and a big part of what the project demonstrates.

---

## 8. The web app screens

1. **Login**
2. **Dashboard:** counts, a coverage chart, overdue list, doses due in 7 days, unread alerts
3. **Register Newborn:** a form; the schedule appears right after saving
4. **Newborn list:** search by baby or phone number
5. **Baby profile:** a coloured timeline of all doses, with "Mark administered" and "Reschedule" buttons
6. **Inventory:** stock by batch, low-stock and expiry warnings, restock form
7. **Alerts:** all notifications, filter and mark as read
8. **Reports:** coverage per clinic, overdue table, CSV export
9. **Vaccination card:** a printable page for a baby
10. **Audit log** (admin only)

The app works on desktop and still looks fine on a tablet or phone width.

---

## 9. How we prove it works

- We write an **automated test script** (about 20 test cases) that runs the functions, procedures and triggers, and records PASS or FAIL in a table.
- We run the whole app from a clean database and take **screenshots from our own run**, each with a figure number and caption.
- Together these give the "verified with test cases and screenshots" level in the faculty's rubric.

---

## 10. How the marks work

| Marks | What is needed | Our plan |
|---|---|---|
| 6 | Submit on time | Submit by Fri 23 Oct (deadline Sat 24 Oct, 11:59 PM) |
| 7 | Working functions, procedures, packages, triggers, cursors | The PL/SQL part above |
| 8 | Test cases and output screenshots | The test script and screenshots |
| 9 | Front-end connected to the database | The React web app and the API |
| 10 | Complex or mobile-based app | We aim for "complex" (multiple roles, stock transactions, scheduled job, audit log). This level is the faculty's call, so 9 is the secure target |

Each level needs the previous one, so testing comes before frontend polish.

---

## 11. The plan, step by step

| Stage | Dates | What happens |
|---|---|---|
| 0. Setup | 5–6 Oct | Install Oracle (Docker), VS Code tools, create the API and web app folders |
| 1. Database design | 6–8 Oct | ER diagram, tables, seed data (vaccine schedule, clinics, users) |
| 2. PL/SQL | 8–12 Oct | Write functions, packages, procedures, triggers, scheduler job |
| 3. Testing | 11–12 Oct | Automated test script, all tests passing |
| 4. API | 11–14 Oct | Endpoints that call the PL/SQL packages |
| 5. Frontend | 13–18 Oct | Build all the screens |
| 6. Polish | 18–19 Oct | Consistency, accessibility check, security check |
| 7. Evidence | 19–20 Oct | Clean run of everything and capture screenshots |
| 8. Report | 20–22 Oct | Write the report in the faculty's Word template and export to PDF |
| 9. Submit | 22–23 Oct | Email one PDF to the faculty |

---

## 12. The final report

A single PDF (`BCSE302P_Project_<TeamName>.pdf`) using the faculty's template: cover page, certificate, abstract, table of contents, introduction, system requirements, database design (ER diagram and normalization), implementation (each object with code), front-end screenshots, testing, results, conclusion, references and appendices.

Rules to remember: Times New Roman 12, 1.5 line spacing, 1-inch margins, numbered figures with captions, and **all code and screenshots must come from your own runs**. Write everything in your own words.

---

## 13. Tools used

- **Database:** Oracle XE (in Docker) with PL/SQL
- **Backend:** Node.js, Express, `node-oracledb`
- **Frontend:** React, Vite, Tailwind CSS
- **Editor:** VS Code (with the Oracle SQL Developer extension)
- **Report:** Microsoft Word, exported to PDF
