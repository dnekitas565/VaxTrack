# Test cases (from a real run of `db/11_tests.sql`, 6 Oct 2026)

Run after `99 → 01 … 10`. Result of consecutive runs: **31 PASS, 0 FAIL**, no leftover `TEST_` rows (babies, guardians, clinic, test logins). Dates in "actual" depend on the day the script is run; re-run and update this table before the final report.

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

TC-R1 counts include the temporary test clinic and test baby, and depend on the seed date, so they change from run to run. The test compares the cursor counts with plain-SQL counts taken at the same moment.

## Bug found by the tests
The first run failed TC-R1 with `ORA-00937: not a single-group group function`: `dashboard_summary` combined aggregates and scalar subqueries in one SELECT. The query was rewritten with inline views joined together, and the full chain was re-run from an empty schema.

## Bug found while adding the account tests
Re-running the script showed that its cleanup matched test guardians by phone pattern and missed some, so test guardians (and, for the new cases, test logins) were left behind. Cleanup now matches test guardians by name (`TEST_%`) and the final check counts leftover guardians and test logins as well. Three consecutive runs: 24 PASS, nothing left behind.

Also found while building the admin tools: the status-guard and alert triggers needed one small change. After a date-of-birth correction an already-overdue dose gets a new date but keeps its status, so the alert trigger now also fires when an overdue dose's date changes (still one alert per dose).

## Screenshots to capture
1. Full `test_log` output (end of `11_tests.sql`).
2. Close-ups of TC-P4, TC-P6, TC-P8, TC-T3.
