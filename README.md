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

The app needs the API running. Staff (admin, nurse) get the dashboard, registration, inventory, alerts and reports;
parents get a read-only view of their own children and the printable vaccination card.
Page -> endpoint -> PL/SQL map: `report/frontend_map.md`.

## Database scripts

Run as `vaxapp`, in numeric order, from `/db`. `99_drop_all.sql` resets everything.

## Agent prompts

Per-stage master prompts live in [prompts/](prompts/). Start with [prompts/README.md](prompts/README.md).

## Demo logins (development only)

| Username | Password | Role |
|---|---|---|
| admin | Admin@123 | ADMIN |
| nurse1 (Sunrise clinic), nurse2 (CityCare clinic) | Nurse@123 | NURSE |
| parent1, parent2 | Parent@123 | PARENT |

Hashes are generated with `node api/scripts/hash.js <password>`.
