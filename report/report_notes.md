# VaxTrack — report notes

Working notes that feed the report. Rewrite in your own words for the final report.

## 1. Vaccine schedule: source and assumptions

- Source: National Immunization Schedule (NIS), India, MoHFW (file `National Immunization Schedule (NIS).pdf`). Cite in References.
- Scope: infants (0–1 yr) plus the 16–23 month boosters. **24 core doses per baby, 26 in JE-endemic districts.**
- Out of scope (future scope in the report): pregnant-women Td, DPT Booster-2 (5–6 yr), Td at 10 and 16 yr, Vitamin A doses 3–9.
- Assumptions to state explicitly:
  1. 1 month = 30 days (6 weeks = day 42, 9 months = day 270, 16 months = day 480).
  2. The NIS gives age bands only. `max_age_days` is a project-defined grace limit (+28 days for week-based doses; end of band for month-based doses). The team must confirm these.
  3. `min_age_days = due_age_days`: a dose is allowed from its due age.
  4. `route` and `disease_covered` are standard Universal Immunization Programme facts, not printed in the NIS PDF. Verify against a second source before the report.
  5. JE is stored with `is_regional = 'Y'` and added to a baby's schedule only when the clinic ticks "Endemic district (JE)".
- Naming in `vaccine_master`: `vaccine_name` + `dose_number` is unique. Birth bOPV is `bOPV` dose 0; boosters are separate names (`PCV Booster`, `DPT Booster`, `bOPV Booster`) with dose 1.

| Age band | Rows | Dose rows |
|---|---|---|
| At birth | 3 | BCG, bOPV-0, Hepatitis B Birth dose |
| 6 weeks | 5 | bOPV-1, Pentavalent-1, fIPV-1, RVV-1, PCV-1 |
| 10 weeks | 3 | bOPV-2, Pentavalent-2, RVV-2 |
| 14 weeks | 5 | bOPV-3, Pentavalent-3, fIPV-2, RVV-3, PCV-2 |
| 9–11 months | 4 (+JE-1) | MR-1, PCV-Booster, fIPV-3, Vitamin A (1st) |
| 16–23 months | 4 (+JE-2) | MR-2, DPT Booster-1, bOPV-Booster, Vitamin A (2nd) |

## 2. Schema design decisions (differences from the bare table list)

- `guardians.phone` is UNIQUE: `register_newborn` reuses a guardian found by phone.
- `app_users` has a CHECK so a NURSE always has a clinic and a PARENT always has a guardian.
- `dose_records` has a CHECK tying `status = 'DONE'` to a non-null `administered_date`.
- DOB-not-in-future cannot be a CHECK constraint (SYSDATE is not allowed there), so `trg_newborn_dob_check` enforces it.
- `audit_log` has no foreign keys on purpose: audit rows must survive deletion of the rows they describe.
- `dose_records(baby_id)` needs no extra index: it is the leading column of `uq_dose_baby_vaccine`.

## 3. Normalization

### UNF — one "vaccination card" sheet
`CARD(baby_name, gender, dob, birth_weight, guardian_name, guardian_phone, guardian_email, address, clinic_name, clinic_city, clinic_phone, { vaccine_name, disease, dose_no, route, due_date, given_date, status, batch_no, expiry_date, given_by }*)`
The braces are a repeating group: many vaccine rows on one card.

### 1NF — atomic values, no repeating groups
One row per baby per dose: key `(baby, vaccine)`. Every column holds a single value (guardian address is one text field; no lists in a cell).

### 2NF — remove partial dependencies
Key is `(baby_id, vaccine_id)`. Partial dependencies found:
- `baby_id → baby_name, gender, dob, weight, guardian_*, clinic_*` → moved to `newborns`.
- `vaccine_id → vaccine_name, disease, dose_no, route, age windows` → moved to `vaccine_master`.
What remains in `dose_records` depends on the full key: `scheduled_date, administered_date, status, is_late, remarks, administered_by`.

### 3NF — remove transitive dependencies
- `baby_id → guardian_id → guardian_name, phone, email, address` → `guardians`.
- `baby_id → clinic_id → clinic_name, city, phone` → `clinics`.
- `dose → inventory_id → batch_no, expiry_date, quantity` → `vaccine_inventory` (one row per clinic + vaccine + batch).
- `app_users` keeps login data, with role-scoped FKs to `clinics` / `guardians`.

### BCNF check
Every non-trivial determinant is a candidate key in its table:

| Table | Determinants (all candidate keys) |
|---|---|
| clinics | `clinic_id`, `clinic_name` |
| guardians | `guardian_id`, `phone` |
| app_users | `user_id`, `username` |
| newborns | `baby_id` |
| vaccine_master | `vaccine_id`, `(vaccine_name, dose_number)` |
| vaccine_inventory | `inventory_id`, `(clinic_id, vaccine_id, batch_no)` |
| dose_records | `record_id`, `(baby_id, vaccine_id)` |
| alerts, audit_log, test_log | surrogate key only |

Deliberate design note: `is_regional` and `age_label` live in `vaccine_master` and depend only on `vaccine_id`, so they do not break 3NF. `age_label` is a descriptive label of the age band; the numeric days remain the source of truth.

## 4. Figure list
Built in Stage 7.
