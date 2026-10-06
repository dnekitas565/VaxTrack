// End-to-end API check: node scripts/smoke.mjs   (API must be running; demo seed loaded)
// Prints one line per request with the expected and actual HTTP status.
// It creates a few "API Smoke" babies; re-run db/10_seed_demo.sql to wipe them.
const BASE = process.env.API_URL || 'http://localhost:4000';
const results = [];
const tokens = {};

async function call(name, method, path, { token, body, raw, expect }) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(raw === undefined ? { 'content-type': 'application/json' } : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* no body */
  }
  const ok = res.status === expect;
  results.push(ok);
  const note = data?.error ? ` -> ${data.error}` : '';
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${String(expect).padEnd(3)} got ${res.status}  ${method.padEnd(5)} ${path}  [${name}]${note}`);
  return { status: res.status, data };
}

const login = async (u, p) => {
  const r = await call(`login ${u}`, 'POST', '/auth/login', { body: { username: u, password: p }, expect: 200 });
  tokens[u] = r.data.token;
  return r.data;
};

const today = new Date();
const iso = (offsetDays) => {
  const d = new Date(today);
  d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
};
const phone = () => '97' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0');

// ---------------------------------------------------------------- basics and auth
await call('liveness', 'GET', '/health', { expect: 200 });
await call('no token', 'GET', '/me', { expect: 401 });
await call('garbage token', 'GET', '/me', { token: 'abc.def.ghi', expect: 401 });
await call('wrong password', 'POST', '/auth/login', { body: { username: 'nurse1', password: 'nope' }, expect: 401 });
await call('unknown user', 'POST', '/auth/login', { body: { username: 'ghost', password: 'x' }, expect: 401 });
await call('login missing field', 'POST', '/auth/login', { body: { username: 'nurse1' }, expect: 400 });
await call('malformed JSON', 'POST', '/auth/login', { raw: '{bad', expect: 400 });
const nurse1 = await login('nurse1', 'Nurse@123');
await login('nurse2', 'Nurse@123');
await login('admin', 'Admin@123');
const parent1 = await login('parent1', 'Parent@123');
await login('parent2', 'Parent@123');
const [N1, N2, ADM, P1, P2] = ['nurse1', 'nurse2', 'admin', 'parent1', 'parent2'].map((u) => tokens[u]);
const clinic1 = nurse1.user.clinicId;
await call('/me', 'GET', '/me', { token: N1, expect: 200 });
await call('unknown route', 'GET', '/nope', { token: N1, expect: 404 });

// ---------------------------------------------------------------- dashboard
await call('summary nurse', 'GET', '/dashboard/summary', { token: N1, expect: 200 });
await call('summary admin', 'GET', '/dashboard/summary', { token: ADM, expect: 200 });
await call('summary parent', 'GET', '/dashboard/summary', { token: P1, expect: 403 });
await call('summary no token', 'GET', '/dashboard/summary', { expect: 401 });
await call('summary other clinic', 'GET', `/dashboard/summary?clinicId=${clinic1 + 1}`, { token: N1, expect: 403 });
await call('overdue', 'GET', '/dashboard/overdue', { token: N1, expect: 200 });
await call('upcoming 7', 'GET', '/dashboard/upcoming?days=7', { token: N1, expect: 200 });
await call('upcoming bad days', 'GET', '/dashboard/upcoming?days=abc', { token: N1, expect: 400 });

// ---------------------------------------------------------------- register newborn
const goodBaby = (extra = {}) => ({
  guardian: { name: 'Smoke Guardian', phone: phone(), email: 'smoke@example.com', address: 'Test Street' },
  baby: { name: 'API Smoke Baby', gender: 'F', dob: iso(-10), birthWeightKg: 3.1 },
  includeRegional: false,
  ...extra,
});
const reg = await call('register', 'POST', '/newborns', { token: N1, body: goodBaby(), expect: 201 });
const babyId = reg.data?.baby_id;
console.log(`      -> baby ${babyId}, ${reg.data?.timeline?.length} timeline rows`);
const regJe = await call('register with JE', 'POST', '/newborns', { token: N1, body: goodBaby({ includeRegional: true }), expect: 201 });
console.log(`      -> JE baby ${regJe.data?.baby_id}, ${regJe.data?.timeline?.length} timeline rows (26 expected)`);
await call('future DOB', 'POST', '/newborns', { token: N1, body: goodBaby({ baby: { name: 'API Smoke Future', gender: 'M', dob: iso(3) } }), expect: 422 });
await call('bad gender', 'POST', '/newborns', { token: N1, body: goodBaby({ baby: { name: 'x', gender: 'X', dob: iso(-1) } }), expect: 400 });
await call('bad phone', 'POST', '/newborns', { token: N1, body: goodBaby({ guardian: { name: 'g', phone: 'abc' } }), expect: 400 });
await call('impossible date', 'POST', '/newborns', { token: N1, body: goodBaby({ baby: { name: 'x', gender: 'M', dob: '2026-02-31' } }), expect: 400 });
await call('admin without clinic', 'POST', '/newborns', { token: ADM, body: goodBaby(), expect: 400 });
await call('admin with clinic', 'POST', '/newborns', { token: ADM, body: goodBaby({ clinicId: clinic1 }), expect: 201 });
await call('nurse other clinic', 'POST', '/newborns', { token: N1, body: goodBaby({ clinicId: clinic1 + 1 }), expect: 403 });
await call('parent registers', 'POST', '/newborns', { token: P1, body: goodBaby(), expect: 403 });

// ---------------------------------------------------------------- list / profile
const list = await call('list nurse', 'GET', '/newborns', { token: N1, expect: 200 });
const searchRes = await call('search', 'GET', '/newborns?search=smoke', { token: N1, expect: 200 });
console.log(`      -> ${searchRes.data?.length} match(es) for "smoke"`);
const pList = await call('list parent1', 'GET', '/newborns', { token: P1, expect: 200 });
console.log(`      -> parent1 sees: ${pList.data?.map((b) => b.full_name).join(', ')}`);
const myBaby = pList.data?.[0]?.baby_id;
await call('profile own child (parent)', 'GET', `/newborns/${myBaby}`, { token: P1, expect: 200 });
await call('profile other child (parent)', 'GET', `/newborns/${myBaby}`, { token: P2, expect: 403 });
await call('profile other clinic (nurse)', 'GET', `/newborns/${myBaby}`, { token: N2, expect: 403 });
await call('profile missing', 'GET', '/newborns/99999999', { token: ADM, expect: 404 });
await call('profile bad id', 'GET', '/newborns/abc', { token: ADM, expect: 400 });

// ---------------------------------------------------------------- doses
const prof = await call('profile smoke baby', 'GET', `/newborns/${babyId}`, { token: N1, expect: 200 });
const rec = (label) => prof.data.timeline.find((t) => t.dose_name === label)?.record_id;
const bcg = rec('BCG');
const opv1 = rec('bOPV-1');
const preview = await call('batch preview', 'GET', `/doses/${bcg}/batch-preview`, { token: N1, expect: 200 });
console.log(`      -> allowed=${preview.data?.allowed} batch=${preview.data?.batch?.batch_no}`);
await call('administer BCG', 'POST', `/doses/${bcg}/administer`, { token: N1, body: {}, expect: 200 });
await call('administer again (already DONE)', 'POST', `/doses/${bcg}/administer`, { token: N1, body: {}, expect: 409 });
await call('administer too early', 'POST', `/doses/${opv1}/administer`, { token: N1, body: {}, expect: 422 });
await call('administer future date', 'POST', `/doses/${rec('bOPV-0')}/administer`, { token: N1, body: { administeredDate: iso(2) }, expect: 422 });
await call('administer before DOB', 'POST', `/doses/${rec('bOPV-0')}/administer`, { token: N1, body: { administeredDate: iso(-30) }, expect: 422 });
await call('administer bad date', 'POST', `/doses/${rec('bOPV-0')}/administer`, { token: N1, body: { administeredDate: 'yesterday' }, expect: 400 });
await call('administer as parent', 'POST', `/doses/${rec('bOPV-0')}/administer`, { token: P1, body: {}, expect: 403 });
await call('administer other clinic baby', 'POST', `/doses/${rec('bOPV-0')}/administer`, { token: N2, body: {}, expect: 403 });
await call('administer missing dose', 'POST', '/doses/99999999/administer', { token: N1, body: {}, expect: 404 });
await call('administer no token', 'POST', `/doses/${bcg}/administer`, { body: {}, expect: 401 });

// out of stock: Vitamin A has no stock at CityCare (nurse2)
const tara = await call('find Tara', 'GET', '/newborns?search=Tara', { token: N2, expect: 200 });
const taraProfile = await call('Tara profile', 'GET', `/newborns/${tara.data?.[0]?.baby_id}`, { token: N2, expect: 200 });
const vitA = taraProfile.data?.timeline.find((t) => t.dose_name === 'Vitamin A (1st dose)')?.record_id;
await call('out of stock', 'POST', `/doses/${vitA}/administer`, { token: N2, body: {}, expect: 409 });
const vitPreview = await call('preview out of stock', 'GET', `/doses/${vitA}/batch-preview`, { token: N2, expect: 200 });
console.log(`      -> batch=${vitPreview.data?.batch} error="${vitPreview.data?.batch_error}"`);

// reschedule
const opv2 = rec('bOPV-2');
await call('reschedule DONE dose', 'POST', `/doses/${bcg}/reschedule`, { token: N1, body: { newDate: iso(5), reason: 'x' }, expect: 409 });
await call('reschedule to past', 'POST', `/doses/${opv1}/reschedule`, { token: N1, body: { newDate: iso(-1), reason: 'x' }, expect: 422 });
await call('reschedule outside window', 'POST', `/doses/${opv1}/reschedule`, { token: N1, body: { newDate: iso(1), reason: 'x' }, expect: 422 });
await call('reschedule no reason', 'POST', `/doses/${opv1}/reschedule`, { token: N1, body: { newDate: iso(40) }, expect: 400 });
await call('reschedule as parent', 'POST', `/doses/${opv1}/reschedule`, { token: P1, body: { newDate: iso(40), reason: 'x' }, expect: 403 });
await call('reschedule OK', 'POST', `/doses/${opv1}/reschedule`, { token: N1, body: { newDate: iso(40), reason: 'Parent travelling' }, expect: 200 });
void opv2;

// ---------------------------------------------------------------- inventory
const inv = await call('inventory nurse', 'GET', '/inventory', { token: N1, expect: 200 });
console.log(`      -> ${inv.data?.length} batches at the nurse's clinic`);
const isYmd = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const dateChecks = [
  ['inventory expiry_date', inv.data?.[0]?.expiry_date],
  ['profile date_of_birth', prof.data?.baby?.date_of_birth],
  ['timeline scheduled_date', prof.data?.timeline?.[0]?.scheduled_date],
];
for (const [what, v] of dateChecks) {
  results.push(isYmd(v));
  console.log(`${isYmd(v) ? 'PASS' : 'FAIL'}  date format  ${what} = ${v}`);
}
await call('inventory admin', 'GET', '/inventory', { token: ADM, expect: 200 });
await call('inventory other clinic', 'GET', `/inventory?clinicId=${clinic1 + 1}`, { token: N1, expect: 403 });
await call('inventory parent', 'GET', '/inventory', { token: P1, expect: 403 });
const vaccines = await call('vaccines', 'GET', '/vaccines', { token: N1, expect: 200 });
await call('clinics', 'GET', '/clinics', { token: ADM, expect: 200 });
const bcgVaccine = vaccines.data?.find((v) => v.vaccine_label === 'BCG')?.vaccine_id;
const restock = (over = {}) => ({ vaccineId: bcgVaccine, batchNo: `SMOKE-${Date.now() % 100000}`, expiryDate: iso(200), quantity: 25, ...over });
await call('restock', 'POST', '/inventory/restock', { token: N1, body: restock(), expect: 201 });
await call('restock zero qty', 'POST', '/inventory/restock', { token: N1, body: restock({ quantity: 0 }), expect: 400 });
await call('restock past expiry', 'POST', '/inventory/restock', { token: N1, body: restock({ expiryDate: iso(-3) }), expect: 400 });
await call('restock unknown vaccine', 'POST', '/inventory/restock', { token: N1, body: restock({ vaccineId: 99999 }), expect: 404 });
await call('restock admin no clinic', 'POST', '/inventory/restock', { token: ADM, body: restock(), expect: 400 });
await call('restock parent', 'POST', '/inventory/restock', { token: P1, body: restock(), expect: 403 });

// ---------------------------------------------------------------- alerts
const alerts = await call('alerts', 'GET', '/alerts', { token: N1, expect: 200 });
await call('alerts unread overdue', 'GET', '/alerts?unread=1&type=OVERDUE', { token: N1, expect: 200 });
await call('alerts bad type', 'GET', '/alerts?type=BOGUS', { token: N1, expect: 400 });
await call('alerts parent', 'GET', '/alerts', { token: P1, expect: 403 });
const firstAlert = alerts.data?.[0]?.alert_id;
await call('mark alert read', 'PATCH', `/alerts/${firstAlert}/read`, { token: N1, expect: 200 });
await call('mark missing alert', 'PATCH', '/alerts/99999999/read', { token: N1, expect: 404 });

// ---------------------------------------------------------------- reports / audit
await call('clinic coverage admin', 'GET', '/reports/clinic-coverage', { token: ADM, expect: 200 });
await call('clinic coverage nurse', 'GET', '/reports/clinic-coverage', { token: N1, expect: 200 });
await call('clinic coverage parent', 'GET', '/reports/clinic-coverage', { token: P1, expect: 403 });
const audit = await call('audit admin', 'GET', `/audit?recordId=${bcg}`, { token: ADM, expect: 200 });
console.log(`      -> ${audit.data?.length} audit row(s) for the BCG dose; latest actor: ${audit.data?.[0]?.changed_by}`);
await call('audit nurse', 'GET', '/audit', { token: N1, expect: 403 });
await call('audit no token', 'GET', '/audit', { expect: 401 });

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
