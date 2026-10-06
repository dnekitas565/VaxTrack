-- ============================================================================
-- 02_seed_reference.sql  --  clinics, vaccine schedule, guardians, users
-- Owner  : vaxapp. Re-runnable: every row is MERGEd on its natural key.
-- Source : vaccine names and age bands follow the National Immunization
--          Schedule (NIS), India ("National Immunization Schedule (NIS).pdf").
-- Assumptions (state in the report):
--   * 1 month = 30 days.  Band-start due dates: 9 months = 270 d, 16 months = 480 d.
--   * The NIS gives age bands only. max_age_days is a PROJECT-DEFINED grace
--     limit: +28 days for week-based doses, end of band for month-based doses.
--   * min_age_days = due_age_days (a dose is allowed from its due age).
--   * route and disease_covered are standard UIP facts, not stated in the NIS PDF.
--   * JE rows are is_regional = 'Y' (endemic districts only, NIS footnote).
-- Demo passwords (dev only): Admin@123, Nurse@123, Parent@123
-- ============================================================================
SET DEFINE OFF
SET ECHO ON
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK

-- ----------------------------------------------------------------- clinics
MERGE INTO clinics c
USING (SELECT 'Sunrise Child Health Clinic' clinic_name, 'Vellore'    city, '0416-2200101' phone FROM dual UNION ALL
       SELECT 'CityCare Pediatric Centre',               'Chennai',         '044-24350202'        FROM dual UNION ALL
       SELECT 'Lotus Mother and Baby Clinic',            'Bengaluru',       '080-23450303'        FROM dual UNION ALL
       SELECT 'Green Valley Immunization Centre',        'Coimbatore',      '0422-2560404'        FROM dual) s
ON (c.clinic_name = s.clinic_name)
WHEN MATCHED THEN UPDATE SET c.city = s.city, c.phone = s.phone
WHEN NOT MATCHED THEN INSERT (clinic_name, city, phone) VALUES (s.clinic_name, s.city, s.phone);

-- ---------------------------------------------------------- vaccine_master
-- columns: name, disease, dose#, age label, min, due, max, route, regional
MERGE INTO vaccine_master v
USING (
  -- At birth
  SELECT 'BCG' n, 'Tuberculosis' d, 1 dn, 'At birth' al, 0 mn, 0 du, 14 mx, 'Intradermal' r, 'N' rg FROM dual UNION ALL
  SELECT 'bOPV', 'Poliomyelitis', 0, 'At birth', 0, 0, 14, 'Oral', 'N' FROM dual UNION ALL
  SELECT 'Hepatitis B Birth dose', 'Hepatitis B', 1, 'At birth', 0, 0, 14, 'Intramuscular', 'N' FROM dual UNION ALL
  -- 6 weeks
  SELECT 'bOPV', 'Poliomyelitis', 1, '6 weeks', 42, 42, 70, 'Oral', 'N' FROM dual UNION ALL
  SELECT 'Pentavalent', 'Diphtheria, Pertussis, Tetanus, Hepatitis B, Hib', 1, '6 weeks', 42, 42, 70, 'Intramuscular', 'N' FROM dual UNION ALL
  SELECT 'fIPV', 'Poliomyelitis', 1, '6 weeks', 42, 42, 70, 'Intradermal', 'N' FROM dual UNION ALL
  SELECT 'RVV', 'Rotavirus diarrhoea', 1, '6 weeks', 42, 42, 70, 'Oral', 'N' FROM dual UNION ALL
  SELECT 'PCV', 'Pneumococcal disease', 1, '6 weeks', 42, 42, 70, 'Intramuscular', 'N' FROM dual UNION ALL
  -- 10 weeks
  SELECT 'bOPV', 'Poliomyelitis', 2, '10 weeks', 70, 70, 98, 'Oral', 'N' FROM dual UNION ALL
  SELECT 'Pentavalent', 'Diphtheria, Pertussis, Tetanus, Hepatitis B, Hib', 2, '10 weeks', 70, 70, 98, 'Intramuscular', 'N' FROM dual UNION ALL
  SELECT 'RVV', 'Rotavirus diarrhoea', 2, '10 weeks', 70, 70, 98, 'Oral', 'N' FROM dual UNION ALL
  -- 14 weeks
  SELECT 'bOPV', 'Poliomyelitis', 3, '14 weeks', 98, 98, 126, 'Oral', 'N' FROM dual UNION ALL
  SELECT 'Pentavalent', 'Diphtheria, Pertussis, Tetanus, Hepatitis B, Hib', 3, '14 weeks', 98, 98, 126, 'Intramuscular', 'N' FROM dual UNION ALL
  SELECT 'fIPV', 'Poliomyelitis', 2, '14 weeks', 98, 98, 126, 'Intradermal', 'N' FROM dual UNION ALL
  SELECT 'RVV', 'Rotavirus diarrhoea', 3, '14 weeks', 98, 98, 126, 'Oral', 'N' FROM dual UNION ALL
  SELECT 'PCV', 'Pneumococcal disease', 2, '14 weeks', 98, 98, 126, 'Intramuscular', 'N' FROM dual UNION ALL
  -- 9-11 months
  SELECT 'MR', 'Measles, Rubella', 1, '9-11 months', 270, 270, 359, 'Subcutaneous', 'N' FROM dual UNION ALL
  SELECT 'PCV Booster', 'Pneumococcal disease', 1, '9-11 months', 270, 270, 359, 'Intramuscular', 'N' FROM dual UNION ALL
  SELECT 'fIPV', 'Poliomyelitis', 3, '9-11 months', 270, 270, 359, 'Intradermal', 'N' FROM dual UNION ALL
  SELECT 'Vitamin A', 'Vitamin A deficiency', 1, '9-11 months', 270, 270, 359, 'Oral', 'N' FROM dual UNION ALL
  SELECT 'JE', 'Japanese encephalitis', 1, '9-11 months', 270, 270, 359, 'Subcutaneous', 'Y' FROM dual UNION ALL
  -- 16-23 months
  SELECT 'MR', 'Measles, Rubella', 2, '16-23 months', 480, 480, 719, 'Subcutaneous', 'N' FROM dual UNION ALL
  SELECT 'DPT Booster', 'Diphtheria, Pertussis, Tetanus', 1, '16-23 months', 480, 480, 719, 'Intramuscular', 'N' FROM dual UNION ALL
  SELECT 'bOPV Booster', 'Poliomyelitis', 1, '16-23 months', 480, 480, 719, 'Oral', 'N' FROM dual UNION ALL
  SELECT 'Vitamin A', 'Vitamin A deficiency', 2, '16-23 months', 480, 480, 719, 'Oral', 'N' FROM dual UNION ALL
  SELECT 'JE', 'Japanese encephalitis', 2, '16-23 months', 480, 480, 719, 'Subcutaneous', 'Y' FROM dual
) s
ON (v.vaccine_name = s.n AND v.dose_number = s.dn)
WHEN MATCHED THEN UPDATE SET v.disease_covered = s.d, v.age_label = s.al, v.min_age_days = s.mn,
                             v.due_age_days = s.du, v.max_age_days = s.mx, v.route = s.r, v.is_regional = s.rg
WHEN NOT MATCHED THEN INSERT (vaccine_name, disease_covered, dose_number, age_label,
                              min_age_days, due_age_days, max_age_days, route, is_regional)
  VALUES (s.n, s.d, s.dn, s.al, s.mn, s.du, s.mx, s.r, s.rg);

-- --------------------------------------------------------------- guardians
-- Two guardians linked to the PARENT demo users. Demo babies (10_seed_demo.sql)
-- reuse these by phone through register_newborn.
MERGE INTO guardians g
USING (SELECT 'Priya Sharma' full_name, '9876500001' phone, 'priya.sharma@example.com' email, '12 Lake View Road, Vellore' address FROM dual UNION ALL
       SELECT 'Rahul Menon',  '9876500002', 'rahul.menon@example.com',  '45 Gandhi Street, Chennai' FROM dual) s
ON (g.phone = s.phone)
WHEN MATCHED THEN UPDATE SET g.full_name = s.full_name, g.email = s.email, g.address = s.address
WHEN NOT MATCHED THEN INSERT (full_name, phone, email, address) VALUES (s.full_name, s.phone, s.email, s.address);

-- ---------------------------------------------------------------- app_users
-- password_hash values come from: node api/scripts/hash.js <password>  (bcrypt, cost 10)
MERGE INTO app_users u
USING (
  SELECT 'admin' username, '$2b$10$PoIEvgMEwqBEzHDmbcBGHe9R2Vyh9zWBJqtPxgeBJcUqwE3yAKqXG' ph, 'ADMIN' role,
         'System Administrator' full_name, CAST(NULL AS VARCHAR2(100)) clinic_name, CAST(NULL AS VARCHAR2(15)) guardian_phone FROM dual UNION ALL
  SELECT 'nurse1', '$2b$10$397xtfNEv1JDd875vSqG3ePaOibpAbVQ0M.epjYdATfT8ccLLNCPO', 'NURSE',
         'Anita Rao', 'Sunrise Child Health Clinic', NULL FROM dual UNION ALL
  SELECT 'nurse2', '$2b$10$397xtfNEv1JDd875vSqG3ePaOibpAbVQ0M.epjYdATfT8ccLLNCPO', 'NURSE',
         'Kavita Nair', 'CityCare Pediatric Centre', NULL FROM dual UNION ALL
  SELECT 'parent1', '$2b$10$iJ5oCCMdjSHPkWsE7ML18eFjOFobdxR8ZrOm5s2Nyes7odiQcASu.', 'PARENT',
         'Priya Sharma', NULL, '9876500001' FROM dual UNION ALL
  SELECT 'parent2', '$2b$10$iJ5oCCMdjSHPkWsE7ML18eFjOFobdxR8ZrOm5s2Nyes7odiQcASu.', 'PARENT',
         'Rahul Menon', NULL, '9876500002' FROM dual
) s
ON (u.username = s.username)
WHEN MATCHED THEN UPDATE SET u.password_hash = s.ph, u.role = s.role, u.full_name = s.full_name,
  u.clinic_id   = (SELECT clinic_id   FROM clinics   WHERE clinic_name = s.clinic_name),
  u.guardian_id = (SELECT guardian_id FROM guardians WHERE phone = s.guardian_phone)
WHEN NOT MATCHED THEN INSERT (username, password_hash, role, full_name, clinic_id, guardian_id)
  VALUES (s.username, s.ph, s.role, s.full_name,
          (SELECT clinic_id   FROM clinics   WHERE clinic_name = s.clinic_name),
          (SELECT guardian_id FROM guardians WHERE phone = s.guardian_phone));

COMMIT;

PROMPT 02_seed_reference.sql complete.
SELECT 'vaccine_master rows: ' || COUNT(*) AS info FROM vaccine_master;
