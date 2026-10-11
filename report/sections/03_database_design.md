# 3. DATABASE DESIGN

## 3.1 Entity–Relationship (ER) Diagram

The schema has ten tables. The entities and their key attributes are as follows.

- **CLINICS** (`clinic_id`): a vaccination centre, with a unique name, a city and a phone number.
- **GUARDIANS** (`guardian_id`): the parent or guardian of a baby, with a unique phone number.
- **NEWBORNS** (`baby_id`): a baby, with date of birth, gender and birth weight. Each baby has exactly one guardian and is registered at exactly one clinic.
- **VACCINE_MASTER** (`vaccine_id`): one row per dose of the national schedule, with the minimum, due and late-after age in days. It is the schedule stored as data.
- **VACCINE_INVENTORY** (`inventory_id`): one row per batch of one vaccine at one clinic, with expiry date, quantity and a low-stock threshold.
- **DOSE_RECORDS** (`record_id`): one row per baby per dose, with the scheduled date, the status (PENDING, DONE or OVERDUE), and, once given, the date, the batch used and the user who gave it.
- **APP_USERS** (`user_id`): a login. A nurse belongs to a clinic, a parent belongs to a guardian, an administrator belongs to neither.
- **ALERTS** (`alert_id`): overdue, due-soon, late-dose, low-stock and expiry messages.
- **AUDIT_LOG** (`audit_id`) and **TEST_LOG** (`test_id`): the audit trail and the record of the automated tests. They have no foreign keys, deliberately: audit rows must survive the deletion of the rows they describe.

| Relationship | Cardinality | Participation |
|---|---|---|
| Guardian – Newborn | 1 : N | Every newborn must have a guardian; a guardian may exist without a newborn |
| Clinic – Newborn | 1 : N | Every newborn is registered at one clinic |
| Newborn – Dose record | 1 : N | A baby has 24 or 26 dose records; each dose record belongs to one baby |
| Vaccine master – Dose record | 1 : N | Each dose record refers to one scheduled dose |
| Clinic – Vaccine inventory | 1 : N | A clinic holds many batches |
| Vaccine master – Vaccine inventory | 1 : N | A batch is of one vaccine |
| Vaccine inventory – Dose record | 1 : N (optional) | A dose record refers to the batch used only after the dose is given |
| Clinic – App user (nurse) | 1 : N (optional) | Required for the NURSE role, empty for others |
| Guardian – App user (parent) | 1 : 1 (optional) | Required for the PARENT role; a guardian has at most one login (enforced by `account_pkg`, not by a key) |
| App user – Dose record | 1 : N (optional) | The user who gave the dose |
| Dose record – Alert | 1 : N (optional) | An alert may point to the dose that caused it |

The diagram is Figure 3.1.

**[ INSERT IMAGE: report/figures/fig_01_er_diagram.png ]**

*Figure 3.1: Entity-relationship diagram of the VaxTrack schema*

## 3.2 Relational Schema

Each relation is shown below with its constraints. Primary keys are identity columns, so no identifier is typed by hand anywhere in the project.

Table 3.1: CLINICS

| Attribute | Data Type | Constraint | Description |
|---|---|---|---|
| clinic_id | NUMBER | PRIMARY KEY (identity) | Clinic identifier |
| clinic_name | VARCHAR2(100) | NOT NULL, UNIQUE | Name of the clinic |
| city | VARCHAR2(60) | NOT NULL | City |
| phone | VARCHAR2(20) | | Contact number |

Table 3.2: GUARDIANS

| Attribute | Data Type | Constraint | Description |
|---|---|---|---|
| guardian_id | NUMBER | PRIMARY KEY (identity) | Guardian identifier |
| full_name | VARCHAR2(100) | NOT NULL | Name |
| phone | VARCHAR2(15) | NOT NULL, UNIQUE, CHECK 7–15 digits, spaces, + or - | Phone number; a guardian found by phone is reused |
| email | VARCHAR2(120) | | Optional e-mail address |
| address | VARCHAR2(250) | | Address (required by the registration procedure for a new guardian) |

Table 3.3: APP_USERS

| Attribute | Data Type | Constraint | Description |
|---|---|---|---|
| user_id | NUMBER | PRIMARY KEY (identity) | Login identifier |
| username | VARCHAR2(50) | NOT NULL, UNIQUE | Login name |
| password_hash | VARCHAR2(100) | NOT NULL | bcrypt hash, never the password |
| role | VARCHAR2(10) | NOT NULL, CHECK IN ('ADMIN','NURSE','PARENT') | Role |
| full_name | VARCHAR2(100) | NOT NULL | Display name |
| clinic_id | NUMBER | FOREIGN KEY → CLINICS(clinic_id) | Clinic of a nurse |
| guardian_id | NUMBER | FOREIGN KEY → GUARDIANS(guardian_id) | Guardian of a parent |
| (table check) | | CHECK: ADMIN, or NURSE with a clinic, or PARENT with a guardian | A login always has the scope its role needs |

Table 3.4: NEWBORNS

| Attribute | Data Type | Constraint | Description |
|---|---|---|---|
| baby_id | NUMBER | PRIMARY KEY (identity) | Baby identifier |
| guardian_id | NUMBER | NOT NULL, FOREIGN KEY → GUARDIANS(guardian_id) | Guardian |
| clinic_id | NUMBER | NOT NULL, FOREIGN KEY → CLINICS(clinic_id) | Registering clinic |
| full_name | VARCHAR2(100) | NOT NULL | Name |
| gender | CHAR(1) | NOT NULL, CHECK IN ('M','F','O') | Gender |
| date_of_birth | DATE | NOT NULL | Date of birth; not in the future (trigger) |
| birth_weight_kg | NUMBER(4,2) | CHECK between 0.5 and 9.99 | Birth weight |
| created_at | DATE | DEFAULT SYSDATE, NOT NULL | Registration date |

Table 3.5: VACCINE_MASTER

| Attribute | Data Type | Constraint | Description |
|---|---|---|---|
| vaccine_id | NUMBER | PRIMARY KEY (identity) | Dose identifier |
| vaccine_name | VARCHAR2(60) | NOT NULL, UNIQUE with dose_number | Vaccine name as in the NIS |
| disease_covered | VARCHAR2(150) | NOT NULL | Diseases prevented |
| dose_number | NUMBER(2) | NOT NULL, CHECK >= 0 | Dose number (0 for the birth polio dose) |
| age_label | VARCHAR2(30) | NOT NULL | Age band, e.g. "6 weeks" |
| min_age_days | NUMBER(5) | NOT NULL | Earliest age at which the dose may be given |
| due_age_days | NUMBER(5) | NOT NULL | Age at which the dose is due |
| max_age_days | NUMBER(5) | NOT NULL | Age after which the dose counts as late |
| route | VARCHAR2(30) | NOT NULL | Route of administration |
| is_regional | CHAR(1) | DEFAULT 'N', NOT NULL, CHECK IN ('Y','N') | 'Y' for Japanese encephalitis (endemic districts only) |
| (table check) | | CHECK min_age_days <= due_age_days <= max_age_days | The three ages are in order |

Table 3.6: VACCINE_INVENTORY

| Attribute | Data Type | Constraint | Description |
|---|---|---|---|
| inventory_id | NUMBER | PRIMARY KEY (identity) | Batch row identifier |
| clinic_id | NUMBER | NOT NULL, FOREIGN KEY → CLINICS(clinic_id) | Clinic holding the batch |
| vaccine_id | NUMBER | NOT NULL, FOREIGN KEY → VACCINE_MASTER(vaccine_id) | Vaccine |
| batch_no | VARCHAR2(40) | NOT NULL, UNIQUE with clinic_id and vaccine_id | Batch number |
| expiry_date | DATE | NOT NULL | Expiry date |
| quantity | NUMBER(6) | DEFAULT 0, NOT NULL, CHECK >= 0 | Doses left |
| low_stock_threshold | NUMBER(6) | DEFAULT 10, NOT NULL, CHECK >= 0 | Alert level |

Table 3.7: DOSE_RECORDS

| Attribute | Data Type | Constraint | Description |
|---|---|---|---|
| record_id | NUMBER | PRIMARY KEY (identity) | Dose record identifier |
| baby_id | NUMBER | NOT NULL, FOREIGN KEY → NEWBORNS(baby_id), UNIQUE with vaccine_id | Baby |
| vaccine_id | NUMBER | NOT NULL, FOREIGN KEY → VACCINE_MASTER(vaccine_id) | Scheduled dose |
| scheduled_date | DATE | NOT NULL | Due date (date of birth + due_age_days, or a rescheduled date) |
| administered_date | DATE | | Date the dose was given |
| status | VARCHAR2(10) | DEFAULT 'PENDING', NOT NULL, CHECK IN ('PENDING','DONE','OVERDUE') | State of the dose |
| inventory_id | NUMBER | FOREIGN KEY → VACCINE_INVENTORY(inventory_id) | Batch used |
| administered_by | NUMBER | FOREIGN KEY → APP_USERS(user_id) | User who gave the dose |
| is_late | CHAR(1) | DEFAULT 'N', NOT NULL, CHECK IN ('Y','N') | Given after max_age_days |
| remarks | VARCHAR2(500) | | Free text, e.g. a reschedule reason |
| (table check) | | CHECK: DONE if and only if administered_date is not null | A dose is DONE exactly when it has a date |

Table 3.8: ALERTS

| Attribute | Data Type | Constraint | Description |
|---|---|---|---|
| alert_id | NUMBER | PRIMARY KEY (identity) | Alert identifier |
| baby_id | NUMBER | FOREIGN KEY → NEWBORNS(baby_id) | Baby concerned |
| record_id | NUMBER | FOREIGN KEY → DOSE_RECORDS(record_id) | Dose concerned |
| clinic_id | NUMBER | FOREIGN KEY → CLINICS(clinic_id) | Clinic to be told |
| alert_type | VARCHAR2(10) | NOT NULL, CHECK IN ('DUE_SOON','OVERDUE','LATE_DOSE','LOW_STOCK','EXPIRY') | Kind of alert |
| message | VARCHAR2(400) | NOT NULL | Text shown to the user |
| alert_date | DATE | DEFAULT SYSDATE, NOT NULL | When it was raised |
| is_read | CHAR(1) | DEFAULT 'N', NOT NULL, CHECK IN ('Y','N') | Read flag |

Table 3.9: AUDIT_LOG

| Attribute | Data Type | Constraint | Description |
|---|---|---|---|
| audit_id | NUMBER | PRIMARY KEY (identity) | Audit row identifier |
| table_name | VARCHAR2(30) | NOT NULL | Table that changed |
| record_id | NUMBER | | Key of the changed row |
| action | VARCHAR2(10) | NOT NULL, CHECK IN ('INSERT','UPDATE','DELETE') | Kind of change |
| old_value, new_value | VARCHAR2(4000) | | Text of the row before and after |
| changed_by | VARCHAR2(100) | | User, taken from the session's client information |
| changed_at | TIMESTAMP | DEFAULT SYSTIMESTAMP, NOT NULL | Time of the change |

Table 3.10: TEST_LOG

| Attribute | Data Type | Constraint | Description |
|---|---|---|---|
| test_id | NUMBER | PRIMARY KEY (identity) | Row identifier |
| tc_code | VARCHAR2(20) | NOT NULL | Test case code, e.g. TC-P4 |
| description | VARCHAR2(300) | NOT NULL | What is tested |
| expected, actual | VARCHAR2(1000) | | Expected and observed output |
| result | VARCHAR2(4) | NOT NULL, CHECK IN ('PASS','FAIL') | Outcome |
| run_at | TIMESTAMP | DEFAULT SYSTIMESTAMP, NOT NULL | Time of the run |

The tables of the schema are listed in Figure 3.2 and their constraints in Figure 3.3.

**[ INSERT IMAGE: report/figures/fig_02_tables_list.png ]**

*Figure 3.2: Tables of the schema with column counts*

**[ INSERT IMAGE: report/figures/fig_03_constraints.png ]**

*Figure 3.3: Primary, foreign, unique and check constraints per table*

The schedule that `vaccine_master` holds is given in Figure 3.4. It follows the NIS: 3 rows at birth, 5 at 6 weeks, 3 at 10 weeks, 5 at 14 weeks, 4 at 9–11 months and 4 at 16–23 months, which makes 24, plus the two Japanese encephalitis rows marked `is_regional = 'Y'`.

**[ INSERT IMAGE: report/figures/fig_04_vaccine_schedule.png ]**

*Figure 3.4: The immunization schedule stored as data in vaccine_master*

Two design points are worth stating. First, "date of birth is not in the future" cannot be a CHECK constraint because SYSDATE is not allowed in one, so a trigger enforces it. Second, the 14 indexes beyond the keys and unique constraints support the frequent access paths; the most important is `ix_inventory_fefo` on `(clinic_id, vaccine_id, expiry_date)`, which serves the first-expiry-first-out choice of a batch, and `ix_dose_status_sched` on `(status, scheduled_date)`, which serves the overdue and due-soon queries.

## 3.3 Schema Definition (DDL)

The complete script is `db/01_schema.sql` (Appendix A). Two of the tables are shown here to illustrate the constraints.

```sql
CREATE TABLE vaccine_master (
  vaccine_id      NUMBER GENERATED BY DEFAULT AS IDENTITY,
  vaccine_name    VARCHAR2(60)  NOT NULL,
  disease_covered VARCHAR2(150) NOT NULL,
  dose_number     NUMBER(2)     NOT NULL,
  age_label       VARCHAR2(30)  NOT NULL,
  min_age_days    NUMBER(5)     NOT NULL,
  due_age_days    NUMBER(5)     NOT NULL,
  max_age_days    NUMBER(5)     NOT NULL,
  route           VARCHAR2(30)  NOT NULL,
  is_regional     CHAR(1) DEFAULT 'N' NOT NULL,
  CONSTRAINT pk_vaccine_master   PRIMARY KEY (vaccine_id),
  CONSTRAINT uq_vaccine_dose     UNIQUE (vaccine_name, dose_number),
  CONSTRAINT ck_vaccine_dose_no  CHECK (dose_number >= 0),
  CONSTRAINT ck_vaccine_ages     CHECK (min_age_days >= 0
                                    AND min_age_days <= due_age_days
                                    AND due_age_days <= max_age_days),
  CONSTRAINT ck_vaccine_regional CHECK (is_regional IN ('Y','N'))
);

CREATE TABLE dose_records (
  record_id         NUMBER GENERATED BY DEFAULT AS IDENTITY,
  baby_id           NUMBER NOT NULL,
  vaccine_id        NUMBER NOT NULL,
  scheduled_date    DATE   NOT NULL,
  administered_date DATE,
  status            VARCHAR2(10) DEFAULT 'PENDING' NOT NULL,
  inventory_id      NUMBER,
  administered_by   NUMBER,
  is_late           CHAR(1) DEFAULT 'N' NOT NULL,
  remarks           VARCHAR2(500),
  CONSTRAINT pk_dose_records      PRIMARY KEY (record_id),
  CONSTRAINT uq_dose_baby_vaccine UNIQUE (baby_id, vaccine_id),
  CONSTRAINT ck_dose_status       CHECK (status IN ('PENDING','DONE','OVERDUE')),
  CONSTRAINT ck_dose_late         CHECK (is_late IN ('Y','N')),
  CONSTRAINT ck_dose_done_date    CHECK ((status = 'DONE' AND administered_date IS NOT NULL)
                                      OR (status <> 'DONE' AND administered_date IS NULL)),
  CONSTRAINT fk_dose_baby         FOREIGN KEY (baby_id)         REFERENCES newborns (baby_id),
  CONSTRAINT fk_dose_vaccine      FOREIGN KEY (vaccine_id)      REFERENCES vaccine_master (vaccine_id),
  CONSTRAINT fk_dose_inventory    FOREIGN KEY (inventory_id)    REFERENCES vaccine_inventory (inventory_id),
  CONSTRAINT fk_dose_user         FOREIGN KEY (administered_by) REFERENCES app_users (user_id)
);
```

## 3.4 Normalization

**Unnormalized form.** We started from the paper vaccination card. One sheet carries the baby (name, gender, date of birth, birth weight), the guardian (name, phone, e-mail, address), the clinic (name, city, phone) and then a repeating group of vaccine rows, each with vaccine name, disease, dose number, route, due date, given date, status, batch number, expiry date and the person who gave it:

```
CARD(baby_name, gender, dob, birth_weight,
     guardian_name, guardian_phone, guardian_email, address,
     clinic_name, clinic_city, clinic_phone,
     { vaccine_name, disease, dose_no, route, due_date, given_date,
       status, batch_no, expiry_date, given_by }*)
```

**First normal form.** The repeating group is removed: there is one row per baby per dose, with the key (baby, vaccine), and every column holds one value. The anomaly removed is the variable-length list inside one record.

**Second normal form.** The key is now composite, (`baby_id`, `vaccine_id`), and some columns depend on only part of it. `baby_id → baby_name, gender, dob, weight, guardian_*, clinic_*` moves to `newborns`. `vaccine_id → vaccine_name, disease, dose_no, route, age windows` moves to `vaccine_master`. What remains in `dose_records` (scheduled date, administered date, status, late flag, remarks, administering user) depends on the whole key. The update anomaly removed: a change to a vaccine's route or age window is made once and not on every baby's card.

**Third normal form.** Transitive dependencies are removed. `baby_id → guardian_id → guardian name, phone, e-mail, address` moves to `guardians`. `baby_id → clinic_id → clinic name, city, phone` moves to `clinics`. `dose → inventory_id → batch number, expiry date, quantity` moves to `vaccine_inventory`, one row per clinic, vaccine and batch. Login data forms `app_users`, with a role-dependent reference to a clinic or a guardian. The anomaly removed: a guardian's new phone number or a clinic's new address is stored once.

**BCNF.** We checked every non-trivial functional dependency. In each table the determinants are candidate keys, as listed below, so the schema is in BCNF.

| Normal Form | Relations | Justification |
|---|---|---|
| 1NF | `card` split into one row per baby and dose | Atomic values; no repeating groups |
| 2NF | `newborns`, `vaccine_master`, `dose_records` | No partial dependency on the composite key (`baby_id`, `vaccine_id`) |
| 3NF | `guardians`, `clinics`, `vaccine_inventory`, `app_users` | No transitive dependency: guardian, clinic and batch details depend on their own keys |
| BCNF | all ten tables | Every determinant is a candidate key: `clinic_id`/`clinic_name`; `guardian_id`/`phone`; `user_id`/`username`; `baby_id`; `vaccine_id`/(`vaccine_name`, `dose_number`); `inventory_id`/(`clinic_id`, `vaccine_id`, `batch_no`); `record_id`/(`baby_id`, `vaccine_id`); surrogate keys for alerts, audit_log and test_log |

`is_regional` and `age_label` are stored in `vaccine_master`. Both depend only on `vaccine_id`, so they do not break third normal form. `age_label` is a descriptive label for the age band; the day counts remain the source of truth.
