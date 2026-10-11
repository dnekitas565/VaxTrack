# Demo journey: step by step, with the screenshots to capture

Follow this once from a clean state and take every screenshot yourself (the report must show your own runs).
"Expected" values come from a rehearsal I ran on 7 Oct 2026; your counts, ids and dates will differ a little
(everything is relative to today). If something does not match what is described, stop and tell me.

Figure numbers (`fig_NN`) refer to the master list in [report_notes.md](report_notes.md).

## 0. Reset and start

1. Clean state and evidence log (database): `cd db`, then
   `sqlplus vaxapp@localhost:1521/XEPDB1 @run_all.sql`
   Expect: 31 PASS, `invalid_objects 0`, `failed_tests 0` at the end, and `report/run_all.log` written.
   Capture the terminal while it runs, showing the scripts executing in order (fig_05), and the final `test_log` table (fig_36).
2. Start the API: `cd api; npm run dev` and the web app: `cd web; npm run dev` (or `npm run build; npm run preview` for the production build).
   Restart the dev server if you changed many files since it started.
3. Use a normal-size browser window (about 1280 x 800), light theme, zoom 100%.

Starting numbers after step 1 (Sunrise clinic, nurse1): alerts badge 15, "Doses overdue" tile 7.

## 1. Nurse signs in (fig_19)

- Open the app, capture the **sign-in page** before logging in (fig_19).
- On the sign-in page every account is listed with its password (the same list is in `LOGINS.md`). Click **nurse1**: both fields are filled and the
  password is shown. Capture it (fig_52). The eye button on the password box shows or hides what you type.
- Sign in as `nurse1` / `Nurse@123`.
- Expected: Dashboard for "Sunrise Child Health Clinic"; sidebar shows **Alerts 15**; tiles Babies 6 (Aarav and his sister Myra Sharma are one family), Doses overdue 7.

## 2. Restock a batch that will run low (fig_28)

- Sidebar **Inventory**, then **Restock**.
- Vaccine **BCG**, batch **DEMO-LOW**, expiry about 40 days from today, quantity **11**.
  (Earliest expiry on purpose: the system uses the earliest-expiring valid batch first, called FEFO.)
- Capture the filled **Restock dialog** (fig_28), then **Add stock**.
- Expected: toast "Stock added"; table shows BCG / **DEMO-LOW** / quantity **11** / "alert below 10".

## 3. Register a baby: the schedule appears (fig_22, fig_23)

- Sidebar **Register newborn**. First click **Register and create schedule** with an empty form and capture the
  **validation errors** (fig_22).
- Fill: guardian "Demo Baby A Guardian", any 10-digit phone, baby "Demo Baby A", Female, date of birth **70 days ago**.
  Watch the hint under the phone field: before you type it explains what the number is for; once a valid new number is typed it says **New guardian**
  (and capture the hint for a number that exists, such as `9876500001`, which says a guardian is already registered and disables the guardian fields: fig_56).
- Expected after submit: "Newborn registered", **24 doses scheduled**, age bands At birth (0 of 3 given), 6 weeks (0 of 5), 10 weeks (0 of 3),
  14 weeks (0 of 5), 9-11 months (0 of 4), 16-23 months (0 of 4). Capture it (fig_23).
- Below the banner a card says **Parent login created** with the guardian's username (made from the name, here `demo.baby.a.guardian`) and the default parent password. Capture it (fig_53).
  The same login is already in `LOGINS.md`, and the parent can sign in with it straight away.
- Click **Open profile**.

## 3b. Trigger the overdue state (fig_20)

- Sidebar **Dashboard**. The page runs the overdue sweep when it loads.
- Expected: "Doses overdue" goes from 7 to **15** (Demo Baby A has 8 past-due doses); "Overdue now" lists Demo Baby A.
- Capture the dashboard (fig_20). Optionally switch to the dark theme with the sidebar toggle and capture it again (fig_21).
- Open Demo Baby A again: the timeline chips read **All 24 / Overdue 8 / Pending 16 / Done 0**.

## 4. Administer a dose: stock drops (fig_25, fig_24)

- On Demo Baby A's profile, **BCG**, **Mark administered**.
- Expected in the dialog: "Batch that will be used: **DEMO-LOW** · 11 in stock" (the earliest-expiring valid batch). Capture it (fig_25).
- **Confirm administered**. Expected: toast "BCG recorded for Demo Baby A"; BCG shows **Done** and **Given late**
  (BCG is meant for the first 14 days and the baby is 70 days old), batch DEMO-LOW, given by the nurse. Capture the profile (fig_24).
- **Inventory**: DEMO-LOW is now **10**.

## 5. Low-stock alert (fig_27, fig_29)

- Register a second baby, **Demo Baby B**, the same way (70 days old) and administer its BCG.
- Expected in the dialog: "DEMO-LOW · 10 in stock". After confirming, **Inventory** shows DEMO-LOW **9** with a **Low stock** badge
  (it crossed below the alert level of 10). Capture the inventory page (fig_27).
- **Alerts** then filter **Low stock**: "Low stock: batch DEMO-LOW of BCG has 9 dose(s) left (threshold 10)". Capture it (fig_29).
- Filter **Late dose** (both demo babies) and **Overdue** (their past-due doses) to see the other alert types.
  The sidebar badge rises (15 in my rehearsal became 34 after both babies).

## 6. Reschedule a dose (fig_26)

- Demo Baby A, **Pentavalent-2**, **Reschedule**: new date about 10 days from today, reason "Parent requested a later visit".
  Capture the dialog (fig_26), then confirm.
- Expected: toast "rescheduled to ..."; the dose shows the new due date and the remark "Rescheduled from ...: Parent requested a later visit".

## 7. Failure case: out of stock (fig_50, optional)

- Sign out, sign in as `nurse2` / `Nurse@123` (CityCare clinic), **Newborns**, search **Tara**, open **Tara Joseph**.
- **Vitamin A (1st dose)**, **Mark administered**.
- Expected: the batch box says "No usable stock (empty or expired) for vaccine ... Restock it before recording the dose." and **Confirm administered is disabled**.
  Capture it. (CityCare deliberately has no Vitamin A stock.)

## 8. Parent view (fig_32, fig_31)

- Sign out, sign in as `parent1` / `Parent@123`.
- Expected: **My children** lists only **Aarav Sharma**, no staff menu, no Register / Inventory / Alerts. Capture it (fig_32).
- Open Aarav: the timeline has **no "Mark administered" or "Reschedule" buttons**. Click **Vaccination card** and capture the card (fig_31).
  Use **Print or save as PDF** to show the print preview (white background, no sidebar), optional.

## 8b. Users page (fig_51, optional)

- Sign in as `admin` / `Admin@123`, sidebar **Users**: every account, with passwords (switch them off with "Show passwords"). Capture it (fig_51).
- **Add nurse** creates the next `nurseN` for a clinic; the new account appears in the list and in `LOGINS.md` at once.

## 8c. Admin: correct or delete a newborn (fig_54, fig_55, optional)

- As `admin`, open any baby's profile: **Edit** and **Delete** appear next to *Vaccination card* (nurses and parents do not see them).
- **Edit**: change the date of birth. The dialog warns that unfinished doses will move. Capture it (fig_54). Save: the age, the due dates and the
  Overdue / Pending counts all update, and old overdue alerts are replaced by ones that match the new dates.
- Try a date that would put a given dose before its minimum age: the dialog stays open with the reason.
- **Delete**: the button stays disabled until you type the baby's name. If doses were recorded as given, a box offers to return them to stock
  (tick it only for a record entered by mistake). Capture the dialog (fig_55). The guardian and their login are kept.
- The Audit log (below) shows the `NEWBORNS` UPDATE and DELETE rows with the administrator as actor.

## 9. Admin audit log (fig_33)

- Sign out, sign in as `admin` / `Admin@123`; sidebar **Audit log**.
- Filter by the dose record id of Demo Baby A's BCG (find it from the URL or from the DB: see the query below).
- Expected: three rows for that dose, all by **nurse1 (id N)**: INSERT (scheduled), UPDATE `status=PENDING -> OVERDUE` (when the dashboard loaded),
  UPDATE `status=OVERDUE -> DONE` with `late=Y` and the batch id. Capture it (fig_33).
- The sweep that flipped the status ran while nurse1 had the dashboard open, which is why nurse1 is shown as the actor for it.

```sql
SELECT d.record_id FROM dose_records d JOIN newborns n ON n.baby_id = d.baby_id
  JOIN vaccine_master v ON v.vaccine_id = d.vaccine_id
 WHERE n.full_name = 'Demo Baby A' AND v.vaccine_name = 'BCG';
```

## 10. Also capture (no journey needed)

- Dashboard on a **phone** (or browser device mode, 390 px wide) and the open menu in dark mode (fig_34, fig_35).
- **Reports** page (fig_30), as admin so all clinics show.
- The **database figures**: `cd db; sqlplus vaxapp@localhost:1521/XEPDB1 @../report/figures_db.sql` and one screenshot per `FIG-DB-nn` banner (see the list).
  Run it while the demo seed is present (it needs Kabir Nair); it cleans up after itself.

## After the journey

Run `db/10_seed_demo.sql` (or `run_all.sql`) to remove Demo Baby A/B and the DEMO-LOW batch before running anything else.

## Capture quality rules

- Zoom to 100 to 125%, crop to the relevant area, keep text readable at the size it will have in the report (about 15 cm wide).
- Same window size and theme for all UI screenshots (light), except the dark-mode figures.
- Only demo data on screen: no real names, phone numbers or e-mail addresses.
- Name files exactly as in the figure list: `fig_NN_description.png`, saved in `report/figures/`.
