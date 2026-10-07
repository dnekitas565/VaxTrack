# Stage 6 notes: polish, accessibility and security (for Results & Discussion)

All numbers below come from real runs on 7 Oct 2026 against the production build (`npm run build && npm run preview`).

## 1. Lighthouse accessibility (Lighthouse run through headless Microsoft Edge, desktop profile unless noted)

| Page | Score |
|---|---|
| Login | 100 |
| Dashboard | 100 |
| Register newborn | 100 |
| Newborns list | 100 |
| Baby profile | 100 |
| Vaccination card | 100 |
| Inventory | 100 |
| Alerts | 100 |
| Reports | 100 |
| Dashboard (mobile emulation) | 100 |
| Baby profile (mobile emulation) | 100 |
| Audit log (admin) | 100 |
| My children (parent) | 100 |

Target was >= 90. Two findings were fixed along the way:
- **Heading order** on the baby profile (two `h1` and a skipped level, first score 98): now one `h1`, an `h2` for the timeline and `h3` for each age band.
- **Color contrast** on read alerts (score 96): the "read" state faded the card with `opacity-70`, which dropped the text below 4.5:1. It now uses a muted background and keeps full-strength text.

Lighthouse accessibility is automated and covers about half of the WCAG checks, so it does not replace a manual keyboard and screen-reader pass.

## 2. Responsive and touch checks (Playwright driving Edge)

- Eight staff pages at 375, 768 and 1280 px: no horizontal page scroll anywhere; wide tables scroll inside their own card.
- At 375 px every button, input, select and menu link is at least 44 px tall (the small buttons were 36 px and were enlarged on narrow screens).
- Navigation: sidebar from 1024 px, collapsible menu below it.
- A real phone on the LAN was not tested by the agent: see the README section "Test on a phone".

## 3. Security pass

`api/scripts/authz-matrix.mjs` calls every endpoint anonymously and as parent, nurse and admin. Bodies are invalid on purpose, so an allowed role gets 400/404/200 and a forbidden role is stopped with 403 before any data can change.

| Route | anon | parent | nurse | admin |
|---|---|---|---|---|
| POST /auth/login | 400 | 400 | 400 | 400 |
| GET /me | 401 | 200 | 200 | 200 |
| GET /dashboard/summary, /overdue, /upcoming | 401 | 403 | 200 | 200 |
| POST /newborns | 401 | 403 | 400 | 400 |
| GET /newborns, GET /newborns/:id | 401 | 200 | 200 | 200 |
| POST /doses/:id/administer, /reschedule | 401 | 403 | 400 | 400 |
| GET /doses/:id/batch-preview | 401 | 403 | 404 | 404 |
| GET /inventory, POST /inventory/restock | 401 | 403 | 200 / 400 | 200 / 400 |
| GET /alerts, PATCH /alerts/:id/read | 401 | 403 | 200 / 404 | 200 / 404 |
| GET /reports/clinic-coverage | 401 | 403 | 200 | 200 |
| GET /audit | 401 | 403 | 403 | 200 |
| GET /clinics, GET /vaccines | 401 | 403 | 200 | 200 |

Other checks that passed in the same script:
- Ownership: parent2 cannot open parent1's child; a nurse of another clinic cannot open the baby and cannot read another clinic's dashboard or inventory.
- Tokens: garbage, changed-signature, expired, wrong-secret and `alg: none` tokens all return 401.
- helmet headers present, `X-Powered-By` hidden, CORS never allows a foreign origin, bodies over 20 kB return 413, malformed JSON returns 400 without a stack trace, SQL-injection style search text is treated as plain text.
- No secrets in git: `api/.env` is ignored; the only credentials in tracked files are the documented demo logins. SQL is written with bind variables only (grep for concatenation is clean).
- The UI handles an expired or revoked token: it returns to the login page with "Your session ended. Please sign in again."

Known limitations to state in the report:
- The JWT is kept in `localStorage`, so a cross-site-scripting bug would expose it. React escapes output and the app renders no raw HTML, but a production system would use an `HttpOnly` cookie.
- The Vite preview server sends no security headers of its own; a real deployment should serve the build behind a server that adds CSP and HSTS.
- The login limiter is in memory (resets when the API restarts, not shared between several API processes).

## 4. Database robustness found while reviewing

`refresh_overdue_status` touched each past-due row with an unguarded UPDATE. If a nurse marked a dose DONE just after the sweep had read it, the status-guard trigger would have rejected the "DONE to PENDING" touch and aborted the whole sweep. The UPDATE now has `AND status = 'PENDING'`, so such rows are skipped. 48 concurrent dashboard requests (each runs the sweep) all returned 200, and the 20 automated tests pass twice after the change.

## 5. Challenges and improvements (real ones)

- **Dates as text.** Oracle DATE values reached the browser as JavaScript date strings ("Invalid Date" on every page). Fixed with a fetch-type handler that returns `YYYY-MM-DD`; the API smoke test now checks the format.
- **Case-sensitive usernames.** `Nurse1` was rejected while `nurse1` worked; phones capitalize the first letter. Login is now case-insensitive and the field disables auto-capitalize.
- **Pool hang.** An async session callback stalled the connection pool; the documented callback form fixed it.
- **Mutating-table and stock consistency** are handled in PL/SQL (see the Implementation section); the front end only presents results.
- **Improvements for future scope:** SMS/WhatsApp reminders, multi-language UI, digital certificates, `HttpOnly` cookie sessions, dark mode, a server-side "mark all alerts read".

## 6. Polish round 2: dark theme and visual pass (7 Oct 2026)

- **Design tokens.** Every colour in the UI is now a semantic token (surface, ink, muted, line, primary, and the four fixed status colours) defined once for light and once for dark in `web/src/index.css`. No raw palette classes remain in the components, so both themes stay consistent by construction.
- **Dark theme.** Light / System / Dark switch in the sidebar and on the sign-in page; the preference is stored in `localStorage` and "System" follows the operating system live. A small inline script in `index.html` applies the theme before first paint, so a dark user never sees a white flash. Charts, tooltips and the status marks use brighter dark-mode shades. The vaccination card always prints on white.
- **Layout polish.** New sign-in screen with a brand panel; grouped sidebar with an active indicator and user block; dashboard quick actions; avatars; baby profile header with a stacked done / pending / overdue bar, per-age-band progress and status filters on the timeline; summary tiles on Inventory and Reports; per-page browser tab titles; a proper 404 page.
- **Bug found by looking, not by the tests.** On a 390 px phone the page was really 425 px wide (grid columns would not shrink below their content), so the menu's alert badge was clipped. The earlier overflow check had compared the document with `window.innerWidth`, which a mobile browser silently widens, so it passed. The new check (a Playwright script kept outside the repo, because Playwright is not one of the project's allowed dependencies) compares against the true device width at 360, 390, 768 and 1280 px in both themes: no overflow.
- **Accessibility regressions caught by Lighthouse and fixed:** a definition list whose icon sat between `dt` and `dd`, and a translucent count pill on the selected filter chip (3.72:1).
- **Verification:** the 25-step browser journey passes in light and in dark; 16 theme checks pass (no flash, persistence, live system following, print is light); Lighthouse accessibility is 100 on every page in both themes (13 page and device runs each: Login, Dashboard, Register, Newborns, Baby profile, Vaccination card, Inventory, Alerts, Reports, Audit log, parent view, plus Dashboard and Baby profile under mobile emulation).
