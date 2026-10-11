# 6. VERIFICATION & TESTING

## 6.1 Test Cases

The script `db/11_tests.sql` runs 31 test cases as anonymous blocks. Each block builds its own data (a test clinic and babies whose names start with `TEST_`), calls the object under test, compares the actual result with the expected one and writes a PASS or FAIL row to the table `test_log`; at the end the script deletes its own data, so it can be run repeatedly. The table below is taken from a run on a database built from scratch with scripts 99 to 10. Dates in the "Actual" column depend on the day of the run, and the counts in TC-R1 depend on the demo data.

| ID | Description | Input | Expected | Actual | Result |
|---|---|---|---|---|---|
| TC-F1 | `calculate_due_date` for a 42-day vaccine | baby DOB = today − 100, bOPV-1 (due day 42) | 2026-08-09 (DOB + 42) | 2026-08-09 | PASS |
| TC-F2 | `calculate_due_date` with an unknown baby | baby_id −999 | error −20001 | −20001 | PASS |
| TC-F3 | `get_coverage_pct` before and after doses | new baby; then 3 birth doses marked | 0 → 12.5 | 0 → 12.5 | PASS |
| TC-F4 | `get_next_due_dose` | baby with BCG done | earliest non-DONE date, not DONE | 2026-08-07, not DONE | PASS |
| TC-P1 | `register_newborn` creates schedule | one baby; one baby with JE flag | 24 / 26 doses, 1 baby | 24/26/baby=1 | PASS |
| TC-P2 | `generate_schedule` idempotent | called twice more on a baby | 24 → 24 | 24 → 24 | PASS |
| TC-P3 | future DOB rolls everything back | DOB = today + 5, new guardian phone | −20003, 0 guardians, 0 babies | −20003, guardians=0, babies=0 | PASS |
| TC-P4 | administer sets DONE, stock −1 | BCG, batch qty 5 | DONE, 5 → 4 | DONE, 5 → 4 | PASS |
| TC-P5 | already DONE rejected | administer same dose twice | −20005, stock stays 4 | −20005, stock=4 | PASS |
| TC-P6 | out-of-stock rolls back | fIPV-1 batch with qty 0 | −20009, PENDING, no date, stock 0 | −20009, PENDING, given=none, stock=0 | PASS |
| TC-P7 | too early | 10-day-old baby, bOPV-1 (min day 42) | −20008, PENDING, stock 5 | −20008, PENDING, stock=5 | PASS |
| TC-P8 | late dose | 100-day-old baby, bOPV-1 (max day 70) | DONE, late=Y, 1 LATE_DOSE alert | DONE, late=Y, 1 alert | PASS |
| TC-P9 | FEFO, expired skipped | batches +200 d, +50 d, expired −5 d | TEST-NEAR used, expired untouched (10), expired-only → −20009 | as expected | PASS |
| TC-P10 | reschedule rules | DONE dose; yesterday; before min age; DOB + 50 | −20010, −20011, −20012, accepted | DONE=−20010, PAST=−20011, WINDOW=−20012, OK=1 | PASS |
| TC-C1 | overdue sweep | 60-day-old baby (8 past-due doses) | 8 → 0 PENDING past due, 8 OVERDUE | 8 → 0; overdue=8 | PASS |
| TC-T1 | guard trigger | DONE dose updated to PENDING | −20013, status stays DONE | −20013, DONE | PASS |
| TC-T2 | audit trigger | administer BCG as nurse1 | old `status=PENDING`, new `status=DONE`, actor nurse1 | status=PENDING \| status=DONE \| nurse1 | PASS |
| TC-T3 | low-stock trigger fires once | batch qty 11, threshold 10, three doses | alerts after each dose: 0, 1, 1 | 0,1,1 | PASS |
| TC-T4 | overdue alert once | sweep run twice on a 60-day-old baby | 8, 8, max 1 per dose | 8,8,1 | PASS |
| TC-R1 | REF cursor row counts | demo seed + one test baby | overdue=18; upcoming=5; clinics=5; summary=1; timeline=24 | identical | PASS |
| TC-U1 | register_newborn creates the guardian's parent login | new guardian TEST_Guardian, password hash of the default | username made from the guardian name, one PARENT login | test.guardian \| 1 \| PARENT | PASS |
| TC-U2 | a second child of the same guardian creates no second login | same phone, second baby | no new username, still one login | test.guardian \| none \| logins=1 | PASS |
| TC-U3 | create_user adds a nurse; usernames unique ignoring case | nurse for TEST_CLINIC, then the same name in capitals | created, duplicate -20018, next nurse name free | created NURSE at TEST_CLINIC \| dup=-20018 \| next nurse name free=1 | PASS |
| TC-U4 | account rules | nurse without clinic; second login for a guardian; ADMIN role; bad hash | -20019, -20017, -20019, -20019 | as expected | PASS |
| TC-U5 | `suggest_username`: name-based, numbered when taken, accents folded, short names and length handled | "Testu Zed" three times (the first two get accounts), "Zoë Müller" with accents, "Li", a 120-character name | testu.zed \| testu.zed2 \| testu.zed3 \| zoe.muller \| parent \| len=34 | identical | PASS |
| TC-U6 | `guardian_exists` answers Y/N (same matching as register_newborn) | unknown phone, then the same phone after registering (also with spaces around it), then another phone | before=N, known=Y, padded=Y, other=N | identical | PASS |
| TC-U7 | a sibling joins the existing guardian and login; a new guardian still needs a name and an address | sibling registered with guardian name NULL and a known phone; a new phone with name NULL; a new phone with a name but no address | no new login, babies=2, logins=1, stored name kept; −20014 for both new-guardian cases | sibling: no login, babies=2, logins=1, name kept=TEST_Guardian \| new guardian without name=-20014 \| without address=-20014 | PASS |
| TC-N1 | update_newborn moves unfinished dose dates with the date of birth, recalculates late flags | 60-day-old baby, BCG given, then date of birth set to 10 days ago (admin) | late=N, bOPV-1 due +32 days, PENDING, new name | as expected | PASS |
| TC-N2 | a date of birth that invalidates a given dose, or lies in the future, is refused | bOPV-1 given at day 60, DOB moved to day 30; DOB in the future | -20020, date unchanged; -20003 | -20020 \| dob unchanged \| -20003 | PASS |
| TC-N3 | delete_newborn removes baby, doses and alerts; stock returns only when asked | two babies, BCG given to each; delete one with restore, one without | stock 5 then 4, nothing left, 2 audit rows | restored=5 \| kept=4 \| left=0 \| audit=2 | PASS |
| TC-N4 | only an administrator can edit or delete a newborn; the change is audited with the actor | nurse1 tries both; admin renames | -20021 twice, baby intact, 1 audit row by admin | update=-20021 \| delete=-20021 \| intact=1 \| audit by admin=1 | PASS |

## 6.2 Output Screenshots

The full `test_log` after a run is shown in Figure 6.1, and close-ups of four key cases follow: the dose is recorded and the stock goes down by exactly one (Figure 6.2), an out-of-stock dose is rolled back (Figure 6.3), a late dose is flagged and raises an alert (Figure 6.4), and the low-stock trigger fires once (Figure 6.5).

**[ INSERT IMAGE: report/figures/fig_36_test_log.png ]**

*Figure 6.1: test_log: all 31 test cases PASS*

**[ INSERT IMAGE: report/figures/fig_37_tc_p4.png ]**

*Figure 6.2: TC-P4 close-up: DONE and stock decremented by exactly one*

**[ INSERT IMAGE: report/figures/fig_38_tc_p6.png ]**

*Figure 6.3: TC-P6 close-up: out-of-stock rolls back*

**[ INSERT IMAGE: report/figures/fig_39_tc_p8.png ]**

*Figure 6.4: TC-P8 close-up: late dose flag and alert*

**[ INSERT IMAGE: report/figures/fig_40_tc_t3.png ]**

*Figure 6.5: TC-T3 close-up: low-stock trigger fires once*

The API was tested separately. `api/scripts/smoke.mjs` calls every endpoint on success and failure paths (152 checks, Figure 6.11) and `api/scripts/authz-matrix.mjs` calls every route as an anonymous user, a parent, a nurse and an administrator, with forged and expired tokens as well (Figure 6.12). Examples of single responses are a login (Figure 6.6), a registration that returns 24 timeline rows (Figure 6.7), a recorded dose (Figure 6.8), an out-of-stock refusal with HTTP 409 and a clear message (Figure 6.9), and a parent who is refused a staff route with HTTP 403 (Figure 6.10).

**[ INSERT IMAGE: report/figures/fig_41_api_login.png ]**

*Figure 6.6: API: login returns a token and the user*

**[ INSERT IMAGE: report/figures/fig_42_api_register.png ]**

*Figure 6.7: API: register a newborn returns 24 timeline rows*

**[ INSERT IMAGE: report/figures/fig_43_api_administer.png ]**

*Figure 6.8: API: administer a dose*

**[ INSERT IMAGE: report/figures/fig_44_api_out_of_stock.png ]**

*Figure 6.9: API: out of stock returns 409 with a clear message*

**[ INSERT IMAGE: report/figures/fig_45_api_forbidden.png ]**

*Figure 6.10: API: a parent calling a staff route gets 403*

**[ INSERT IMAGE: report/figures/fig_46_npm_smoke.png ]**

*Figure 6.11: npm run smoke: 152 of 152 checks*

**[ INSERT IMAGE: report/figures/fig_47_authz_matrix.png ]**

*Figure 6.12: npm run authz: role by route matrix and token checks*

## 6.3 Validation of Functionality

**Constraints and triggers.** The negative cases show that the database defends itself. A date of birth in the future is rejected and the registration rolls back completely (TC-P3). A DONE dose cannot be changed back to PENDING (TC-T1). Stock cannot go below zero, and a failed administration leaves both the dose and the stock unchanged (TC-P6). The audit trigger records the old and new status and the acting user (TC-T2), the low-stock alert is raised once and not on every dose (TC-T3), and the overdue alert is raised once per dose even when the sweep runs twice (TC-T4).

**Procedures and packages.** The registration creates 24 doses, or 26 with the Japanese encephalitis box ticked, and running `generate_schedule` again adds none (TC-P1, TC-P2). Recording a dose rejects a dose that is already given, a baby that is too young, and an empty or expired batch, flags a late dose, and picks the batch that expires first while skipping an expired one (TC-P4 to TC-P9). Rescheduling rejects a given dose, a past date and a date outside the age window (TC-P10). The overdue sweep flips exactly the past-due doses (TC-C1). The reporting cursors return the number of rows that plain SQL counts at the same moment (TC-R1).

**Accounts and administrator tools.** A new guardian gets exactly one parent login named after the guardian, a second child adds no second login, and a sibling can be registered with the phone number alone (TC-U1, TC-U2, TC-U7). Usernames are unique ignoring case and are numbered when a name is taken (TC-U3, TC-U5). The account rules reject a nurse without a clinic, a second login for a guardian, an administrator account created through the application, and a bad password hash (TC-U4). The date-of-birth correction moves the unfinished doses, is refused when it would invalidate a given dose, and only an administrator can edit or delete a newborn (TC-N1 to TC-N4).

**Front end.** A scripted browser run of 25 steps (sign-in, restock, registration, administering a dose, the low-stock alert, rescheduling, the failure case, the parent's view and the audit log) passes in the light and in the dark theme. Further browser checks cover the account and administrator features, theme switching, and the absence of horizontal scrolling at 360, 390, 768 and 1280 px.

**Bugs the tests found.** The first run failed TC-R1 with `ORA-00937: not a single-group group function`, because `dashboard_summary` combined aggregates and scalar subqueries in one SELECT. We rewrote the query with inline views joined together and ran the whole chain again from an empty schema. When the account tests were added, repeated runs left some test guardians behind, because the cleanup matched them by phone pattern; it now matches them by name, and the final check counts any leftover rows.
