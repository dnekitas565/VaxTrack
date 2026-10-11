# 7. RESULTS & DISCUSSION

## 7.1 Achievements

Measured against the objectives of Section 1.2:

1. **Schema.** A ten-table schema in BCNF with primary, foreign, unique and check constraints, identity keys and 14 supporting indexes. The immunization schedule is data: changing a due age is an UPDATE of `vaccine_master`.
2. **Business rules in the database.** All five kinds of object are implemented and compile without errors: five functions, one procedure, four packages, five triggers and a scheduler job, together with explicit, parameterized, FOR-loop and REF cursors. Dose and stock can never disagree because recording a dose is one transaction with a savepoint, and the stock update is guarded against two nurses taking the last dose.
3. **Web application.** Three roles use a responsive web application with light and dark themes that reaches the database only through the packages. A baby's full schedule appears at registration, overdue and due-soon doses are flagged, and a parent can print the vaccination card.
4. **Verification.** 31 of 31 automated PL/SQL test cases pass and leave no test data behind; 152 of 152 API checks pass; the authorization matrix shows that every route refuses the roles that may not use it; and the scripted browser journey passes in both themes.
5. **Accessibility.** Lighthouse accessibility scores were 100 on every page and device profile that we audited in the production build, in both themes (Figure 7.1, Figure 7.2), measured with Lighthouse [15] against the accessibility guidelines [14]. The target was 90. Lighthouse covers only part of the accessibility guidelines, so this does not replace a manual keyboard and screen-reader test.

**[ INSERT IMAGE: report/figures/fig_48_lighthouse_dashboard.png ]**

*Figure 7.1: Lighthouse accessibility score for the dashboard (production build)*

**[ INSERT IMAGE: report/figures/fig_49_lighthouse_dark.png ]**

*Figure 7.2: Lighthouse accessibility score in dark mode*

## 7.2 Challenges Faced

- **Mutating-table errors.** A row-level trigger that reads the table it fires on raises ORA-04091. We avoided it by design: no trigger reads its own table (the status guard reads `newborns`, the alert trigger reads `newborns` and `vaccine_master`). Because a row trigger fires only when its row is touched and nothing touches a dose merely because time has passed, the overdue sweep updates each past-due pending dose to its own value so that the triggers fire.
- **Keeping stock and doses consistent.** Recording a dose changes two tables. We put both changes in one procedure with a savepoint, locked the dose row, and added the guard `quantity > 0` to the stock update, so a failure at any step, or a second nurse taking the last dose, leaves nothing half done.
- **A sweep that could abort.** While reviewing, we saw that `refresh_overdue_status` touched each past-due row with an unguarded update. If a nurse marked a dose DONE just after the sweep read it, the guard trigger would have rejected the update and aborted the whole sweep. The update now has `AND status = 'PENDING'`, so such a row is skipped. Forty-eight concurrent dashboard requests, each of which runs the sweep, all succeeded.
- **A correct date of birth.** After an administrator corrects a date of birth, an overdue dose gets a new date but keeps its status, so the alert trigger did not fire. We changed its WHEN clause to fire also when an overdue dose's date changes, which still gives one alert per dose.
- **PL/SQL restrictions.** A function declared inside a block cannot be called from a SQL statement (PLS-00231); we assigned its value to a variable first. The first version of the dashboard summary query failed with ORA-00937 and was rewritten (Section 6.3).
- **Application issues.** Oracle DATE values reached the browser as JavaScript date strings and every page showed "Invalid Date"; a fetch-type handler now returns `YYYY-MM-DD`. User names were case sensitive, so "Nurse1" was refused on phones that capitalize the first letter; sign-in is now case-insensitive. An asynchronous session callback stalled the connection pool and was removed. On a 390 px phone the page was 425 px wide because grid columns would not shrink; the grids now have a one-column base. The overflow check that had missed this compared the page with `window.innerWidth`, which a phone browser widens; it now compares with the real device width.

## 7.3 Possible Improvements

- **Performance.** The tables are small, but paging of the long lists and a materialized view for the clinic coverage report would be needed for many clinics.
- **Security.** The token is kept in the browser's local storage, so a cross-site-scripting flaw would expose it; a production system should use an HttpOnly cookie. The login limiter is in memory and is lost when the API restarts. The demo accounts share one default password per role; a real deployment would force a change at first sign-in and provide a change-password page. A web server in front of the application should add a content security policy and HSTS. The application schema owner is used by the API; a production system would use a smaller set of privileges.
- **Data.** Phone numbers are compared exactly as typed, so "98765 43210" and "9876543210" would be two guardians; a normalisation step would remove this.
- **Features.** SMS or WhatsApp reminders to parents, a multi-language interface, digital vaccination certificates, and the vaccines that are outside our scope.
