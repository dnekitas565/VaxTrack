# VaxTrack – Newborn Vaccination Schedule Tracker

BCSE302P Database Systems Laboratory mini project. Oracle PL/SQL owns the business rules; a Node.js API exposes them; a React app is the UI. See [AGENTS.md](AGENTS.md) for the full spec.

## Prerequisites (Stage 0 versions to record in the report)

- Oracle Database XE 21c (native install, PDB `XEPDB1`) — or Docker `gvenzl/oracle-xe`
- Node.js 20+ (tested on 24.x), npm
- VS Code with Oracle SQL Developer extension (or SQL*Plus / SQLcl)

## One-time database setup

1. Edit the password in [db/00_create_user.sql](db/00_create_user.sql).
2. Run it as SYSTEM:
   ```
   sqlplus system@localhost:1521/XEPDB1 @db/00_create_user.sql
   ```
   (the script's `ALTER SESSION SET CONTAINER` line is harmless when already connected to the PDB; remove it if it errors).
3. Verify: `sqlplus vaxapp@localhost:1521/XEPDB1` then `SELECT 1 FROM dual;`

## API

```
cd api
copy .env.example .env     # then set DB_PASSWORD and JWT_SECRET
npm install
npm run dev                # http://localhost:4000/health  ->  {"db":"up"}
```

### API checks

- `api/requests.http`: every endpoint, success and failure cases (VS Code REST Client extension).
- `npm run smoke` (API running, demo seed loaded): runs ~85 requests and prints expected vs actual HTTP status.
  It creates a few "API Smoke" babies; re-run `db/10_seed_demo.sql` to wipe them.
- Responses use snake_case keys and `YYYY-MM-DD` dates. Errors are `{ "error": "message", "code": "ORA-20005" }`.

## Web

```
cd web
npm install
npm run dev                # http://localhost:5173 (proxies /api -> :4000)
npm run build && npm run preview    # production build on http://localhost:4173
npm run lint
```

Theme: the sidebar (and the sign-in page) has a Light / System / Dark switch. The choice is remembered in the browser,
"System" follows the operating system live, and the vaccination card always prints on white.

The app needs the API running. Staff (admin, nurse) get the dashboard, registration, inventory, alerts and reports;
parents get a read-only view of their own children and the printable vaccination card.
Page -> endpoint -> PL/SQL map: `report/frontend_map.md`.

## Test on a phone (same Wi-Fi)

The browser calls `/api/...` on the same address as the page and Vite forwards it to the API, so no CORS change is needed.

1. Find the PC's address: `ipconfig` and read the IPv4 address of the Wi-Fi adapter (for example `192.168.1.23`).
2. Start the API (`cd api; npm run dev`) and the web app with network access (`cd web; npm run dev -- --host`, or `npm run preview -- --host` for the production build).
3. Allow the port through Windows Firewall, in an administrator PowerShell (Private networks only):
   `New-NetFirewallRule -DisplayName "VaxTrack web" -Direction Inbound -Protocol TCP -LocalPort 5173 -Action Allow -Profile Private`
   (use 4173 for preview). Remove it afterwards: `Remove-NetFirewallRule -DisplayName "VaxTrack web"`.
4. On the phone open `http://<PC address>:5173` and sign in with a demo login.

## Verification scripts

| Command | What it proves |
|---|---|
| `cd db; sqlplus vaxapp@localhost:1521/XEPDB1 @run_all.sql` | clean rebuild 99 -> 01..10 -> 11, checks, log in `report/run_all.log` |
| `sqlplus vaxapp@localhost:1521/XEPDB1 @db/11_tests.sql` | 20 PL/SQL test cases -> `test_log` |
| `cd api; npm run smoke` | every endpoint, success and failure paths (89 checks) |
| `cd api; npm run authz` | route x role matrix, tokens, headers, CORS |
| `cd db; sqlplus vaxapp@localhost:1521/XEPDB1 @../report/figures_db.sql` | prints every database figure for the report (cleans up after itself) |

## Database scripts

Run as `vaxapp`, in numeric order, from `/db`. `99_drop_all.sql` resets everything; `run_all.sql` does the whole sequence plus the tests in one go.

## Evidence for the report

[report/demo_journey.md](report/demo_journey.md) is the step-by-step UI journey; the numbered figure list (50 figures, with how to capture each)
is in [report/report_notes.md](report/report_notes.md). All screenshots must come from your own runs.

## Agent prompts

Per-stage master prompts live in [prompts/](prompts/). Start with [prompts/README.md](prompts/README.md).

## Demo logins (development only)

| Username | Password | Role |
|---|---|---|
| admin | Admin@123 | ADMIN |
| nurse1 (Sunrise clinic), nurse2 (CityCare clinic) | Nurse@123 | NURSE |
| parent1, parent2 | Parent@123 | PARENT |

Hashes are generated with `node api/scripts/hash.js <password>`.
