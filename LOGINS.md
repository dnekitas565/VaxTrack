# VaxTrack logins

> Generated automatically from the database by the API (`npm run logins` does the same on demand).
> Do not edit by hand: it is rewritten whenever accounts change and whenever the sign-in page loads.

Passwords: every account starts with the default for its role (**Admin@123**, **Nurse@123**, **Parent@123**).
This sheet is for development and demos only; a production system would force a password change at first login.

## Administrator

| Username | Password | Name |
|---|---|---|
| `admin` | `Admin@123` | System Administrator |

## Nurses (one per clinic: they register babies and give the doses at their clinic)

| Username | Password | Name | Clinic |
|---|---|---|---|
| `nurse1` | `Nurse@123` | Anita Rao | Sunrise Child Health Clinic |
| `nurse2` | `Nurse@123` | Kavita Nair | CityCare Pediatric Centre |
| `nurse3` | `Nurse@123` | Meena Pillai | Lotus Mother and Baby Clinic |
| `nurse4` | `Nurse@123` | Divya Menon | Green Valley Immunization Centre |
| `nurse5` | `Nurse@123` | Smoke Nurse | Sunrise Child Health Clinic |

## Parents and guardians (read-only view of their own child and the vaccination card)

| Username | Password | Guardian | Child(ren) |
|---|---|---|---|
| `parent1` | `Parent@123` | Priya Sharma | Aarav Sharma, Myra Sharma |
| `parent2` | `Parent@123` | Rahul Menon | Diya Menon |
| `anil.das` | `Parent@123` | Anil Das | Rohan Das |
| `arun.kumar` | `Parent@123` | Arun Kumar | Ved Arun |
| `farah.khan` | `Parent@123` | Farah Khan | Sara Khan |
| `http.guardian` | `Parent@123` | Http Guardian | Http Baby |
| `lakshmi.iyer` | `Parent@123` | Lakshmi Iyer | Meera Iyer |
| `mary.joseph` | `Parent@123` | Mary Joseph | Tara Joseph |
| `rohit.patel` | `Parent@123` | Rohit Patel | Anaya Patel |
| `smoke.guardian` | `Parent@123` | Smoke Guardian | API Smoke Baby |
| `smoke.guardian2` | `Parent@123` | Smoke Guardian | API Smoke Baby |
| `smoke.guardian3` | `Parent@123` | Smoke Guardian | API Smoke Baby |
| `smoke.guardian4` | `Parent@123` | Smoke Guardian | API Smoke Baby, API Smoke Baby |
| `smoke.guardian5` | `Parent@123` | Smoke Guardian | (none yet) |
| `smoke.guardian6` | `Parent@123` | Smoke Guardian | (none yet) |
| `sunita.rao` | `Parent@123` | Sunita Rao | Vihaan Rao |
| `suresh.nair` | `Parent@123` | Suresh Nair | Kabir Nair |
| `venkat.reddy` | `Parent@123` | Venkat Reddy | Ishaan Reddy |

Parent logins are created automatically when a baby is registered: the username is made from the guardian's name
(for example `priya.sharma`; a number is added if it is taken; the demo accounts `parent1` and `parent2` keep their short names). A guardian who already has a login keeps it.
New nurses are added by an admin on the **Users** page.

Defaults at a glance: admin `Admin@123`, nurse `Nurse@123`, parent `Parent@123`.
