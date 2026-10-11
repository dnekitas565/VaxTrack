# 1. INTRODUCTION

## 1.1 Problem Statement

A newborn has to receive a long series of vaccines at fixed ages. In India the National Immunization Schedule (NIS) of the Ministry of Health and Family Welfare lists them: BCG, oral polio and hepatitis B at birth, a first round of five vaccines at 6 weeks, further rounds at 10 and 14 weeks, the measles-rubella, pneumococcal booster, polio and vitamin A doses at 9–11 months, and boosters at 16–23 months [6]. Each dose has an age at which it becomes due and an age after which it counts as late, so a single child has 24 doses to track, and 26 in districts where Japanese encephalitis is endemic.

The people involved are the clinic nurses who give the vaccines, the parents or guardians who must bring the child on time, and an administrator who supervises several clinics. In many clinics the record is a paper card or a spreadsheet. With that approach nobody is told which dose is due next or which one has been missed, a nurse can record a dose from a batch that is empty or past its expiry date, a stock count can drift away from the number of doses actually given, and there is no trustworthy answer to the question of who changed a record, and when. VaxTrack addresses these four problems with a database that enforces the rules itself.

## 1.2 Objectives

1. Design a normalized relational schema (up to 3NF/BCNF) for guardians, newborns, the vaccine schedule, clinic stock, dose records, alerts and an audit trail, with constraints that reject invalid data.
2. Implement all business rules in Oracle PL/SQL, using standalone functions and a procedure, packages, triggers and the four kinds of cursor, so that scheduling, stock deduction, overdue detection and alerts are decided in the database and not in application code.
3. Provide a web application for three roles (administrator, nurse, parent) that reaches the database only through the PL/SQL packages.
4. Verify the system with an automated test script and with end-to-end runs, and keep the evidence.

## 1.3 Importance of DBMS

A database management system is the natural home for this application [1], [2], for the following reasons, each of which we use directly.

- **Integrity.** Primary, foreign, unique and check constraints keep the data valid: a dose marked DONE must have an administered date, stock can never go below zero, and a nurse account must belong to a clinic. Triggers cover the rules a constraint cannot express, such as a date of birth that is not in the future.
- **Reduced redundancy.** The schema is normalized, so guardian details, clinic details and vaccine details are stored once and referred to by key. The vaccination schedule itself is data in a table, so changing a due age needs an UPDATE, not a code change.
- **Concurrency control.** Two nurses may give the last dose of a batch at the same moment. The administration procedure locks the dose row with SELECT … FOR UPDATE and guards the stock update, so only one of them succeeds.
- **Atomicity and recovery.** Recording a dose changes the dose row and the stock row. Both changes happen inside one transaction with a savepoint, so a failure leaves neither of them changed.
- **Security.** Passwords are stored as hashes, access depends on the role, and the application reaches the data only through named packages.
- **Auditability.** A trigger writes every insert, update and delete on the dose records, together with the user who caused it, to a log that is not removed when the audited row is deleted.
- **Efficiency.** Indexes support the frequent queries, for example the first-expiry-first-out choice of a batch.

## 1.4 Scope of the Project

**Included.** Infants (0–1 year) and the 16–23 month boosters of the NIS: 24 core doses per baby, plus the two Japanese encephalitis doses for babies registered in an endemic district. Registration of babies and guardians, automatic schedule generation, administration of doses with stock deduction, rescheduling, overdue and due-soon detection, low-stock and expiry alerts, clinic stock management, reports, a printable vaccination card, an audit log, and administrator tools to correct or delete a newborn record. Three user roles with their own views.

**Out of scope.** Td for pregnant women, the DPT booster at 5–6 years, Td at 10 and 16 years, and vitamin A doses 3 to 9, because they are beyond newborn tracking. SMS or WhatsApp reminders, a native mobile application and a progressive web app are also left out; the application is a responsive web application only. These items are listed again as future scope in Section 8.2.

**Assumptions we made.** We count one month as 30 days throughout. The NIS gives age bands and not exact limits, so the "late after" age (`max_age_days`) is a limit we defined: 14 days for the birth doses, four weeks of grace for the doses due at 6, 10 and 14 weeks, and the end of the stated band for the month-based doses. A dose is allowed from its due age. The route of administration and the disease covered by each vaccine are standard programme facts that are not printed in the NIS document we used.
