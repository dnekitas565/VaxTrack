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

// ---------------------------------------------------------------- accounts and the login directory
const check = (ok, name, extra = '') => {
  results.push(Boolean(ok));
  console.log(`${ok ? 'PASS' : 'FAIL'}  check  ${name}${extra ? `  ${extra}` : ''}`);
};
const pBody = goodBaby();
const regP = await call('register: new guardian', 'POST', '/newborns', { token: N1, body: pBody, expect: 201 });
const pl = regP.data?.parent_login;
const phoneDigits = pBody.guardian.phone;
check(pl?.created === true && /^smoke\.guardian\d*$/.test(pl?.username ?? '') && pl?.password === 'Parent@123', 'a new guardian gets a parent login named after the guardian, not the phone number', JSON.stringify(pl));
const pLogin = await call('the new parent signs in', 'POST', '/auth/login', { body: { username: pl?.username, password: 'Parent@123' }, expect: 200 });
const pKids = await call('the new parent lists their children', 'GET', '/newborns', { token: pLogin.data?.token, expect: 200 });
check(pKids.data?.length === 1 && pKids.data[0].full_name === 'API Smoke Baby', 'the new parent sees exactly their own child');
// the sibling is registered with the phone number only: name, email and address are not needed for a known guardian
const second = await call('second child, same guardian, phone only', 'POST', '/newborns', { token: N1, body: { ...goodBaby(), guardian: { phone: phoneDigits } }, expect: 201 });
check(JSON.stringify(second.data?.parent_login) === '{"created":false}', 'a second child reuses the existing login (no duplicate) and the response reveals none of its details', JSON.stringify(second.data?.parent_login));
const pKids2 = await call('the parent now lists both children', 'GET', '/newborns', { token: pLogin.data?.token, expect: 200 });
check(pKids2.data?.length === 2 && pKids2.data.every((b) => b.guardian_name === 'Smoke Guardian'), 'one parent login sees both children; the guardian details were kept');
await call('a new guardian still needs an address', 'POST', '/newborns', { token: N1, body: { ...goodBaby(), guardian: { name: 'No Address', phone: phone() } }, expect: 400 });
await call('a new guardian still needs a name', 'POST', '/newborns', { token: N1, body: { ...goodBaby(), guardian: { phone: phone() } }, expect: 400 });

// ---- phone lookup: yes/no only
const lk = await call('lookup: known phone', 'GET', `/newborns/guardian-lookup?phone=${phoneDigits}`, { token: N1, expect: 200 });
check(JSON.stringify(lk.data) === '{"exists":true}', 'the lookup answers only { exists: true } for a known phone number', JSON.stringify(lk.data));
const lk2 = await call('lookup: unknown phone', 'GET', `/newborns/guardian-lookup?phone=${phone()}`, { token: ADM, expect: 200 });
check(JSON.stringify(lk2.data) === '{"exists":false}', 'the lookup answers { exists: false } for an unknown number', JSON.stringify(lk2.data));
await call('lookup: bad phone', 'GET', '/newborns/guardian-lookup?phone=abc', { token: N1, expect: 400 });
await call('lookup: missing phone', 'GET', '/newborns/guardian-lookup', { token: N1, expect: 400 });
await call('lookup: parent', 'GET', `/newborns/guardian-lookup?phone=${phoneDigits}`, { token: P1, expect: 403 });
await call('lookup: no token', 'GET', `/newborns/guardian-lookup?phone=${phoneDigits}`, { expect: 401 });

await call('users list as nurse', 'GET', '/users', { token: N1, expect: 403 });
await call('users list as parent', 'GET', '/users', { token: P1, expect: 403 });
const ul = await call('users list as admin', 'GET', '/users', { token: ADM, expect: 200 });
check(['nurse1', 'nurse2', 'nurse3', 'nurse4'].every((n) => ul.data?.some((u) => u.username === n)), 'every clinic has a nurse in the login list');
check(ul.data?.some((u) => u.username === pl?.username), 'the new parent login appears in the list immediately');
check(ul.data?.every((u) => u.password), 'every account shows a password (none changed)');
await call('users options as admin', 'GET', '/users/options', { token: ADM, expect: 200 });
const nn = await call('admin adds a nurse', 'POST', '/users', { token: ADM, body: { role: 'NURSE', fullName: 'Smoke Nurse', clinicId: clinic1 }, expect: 201 });
check(/^nurse\d+$/.test(nn.data?.username ?? '') && nn.data?.password === 'Nurse@123', 'the new nurse gets the next nurseN name and the default password', nn.data?.username);
const nnLogin = await call('the new nurse signs in', 'POST', '/auth/login', { body: { username: nn.data?.username, password: 'Nurse@123' }, expect: 200 });
// the lookup is limited to 30 a minute per user (a fresh account, so no other test is affected)
let limited = 0;
for (let i = 0; i < 32; i += 1) {
  const r = await fetch(`${BASE}/newborns/guardian-lookup?phone=${phoneDigits}`, { headers: { authorization: `Bearer ${nnLogin.data?.token}` } });
  if (r.status === 429) limited += 1;
}
check(limited === 2, 'the 31st and 32nd lookups within a minute are refused (429)', `refused ${limited}`);
await call('duplicate username in another case', 'POST', '/users', { token: ADM, body: { role: 'NURSE', fullName: 'X', clinicId: clinic1, username: (nn.data?.username ?? '').toUpperCase() }, expect: 409 });
await call('nurse account without a clinic', 'POST', '/users', { token: ADM, body: { role: 'NURSE', fullName: 'X' }, expect: 400 });
await call('nurse account by a nurse', 'POST', '/users', { token: N1, body: { role: 'NURSE', fullName: 'X', clinicId: clinic1 }, expect: 403 });
const prof2 = await call('profile for the guardian id', 'GET', `/newborns/${regP.data?.baby_id}`, { token: N1, expect: 200 });
await call('second login for a guardian who has one', 'POST', '/users', { token: ADM, body: { role: 'PARENT', guardianId: prof2.data?.baby?.guardian_id }, expect: 409 });
const dl = await call('login directory (development)', 'GET', '/auth/demo-logins', { expect: 200 });
check(dl.data?.some((u) => u.username === 'admin' && u.password === 'Admin@123') && dl.data?.some((u) => u.username === pl?.username && u.password === 'Parent@123'), 'the login directory lists admin and the new parent with passwords');

// ---------------------------------------------------------------- admin: edit and delete a newborn
const ebBody = goodBaby({ baby: { name: 'API Edit Baby', gender: 'F', dob: iso(-70) } });
const eb = await call('register a baby to edit', 'POST', '/newborns', { token: N1, body: ebBody, expect: 201 });
const ebId = eb.data?.baby_id;
const fix = { name: 'API Edit Baby Fixed', gender: 'M', dob: iso(-10), birthWeightKg: 3.3 };
await call('edit by a nurse', 'PATCH', `/newborns/${ebId}`, { token: N1, body: fix, expect: 403 });
await call('edit by a parent', 'PATCH', `/newborns/${ebId}`, { token: P1, body: fix, expect: 403 });
await call('edit with a bad body', 'PATCH', `/newborns/${ebId}`, { token: ADM, body: { name: '', gender: 'Q', dob: 'x' }, expect: 400 });
await call('edit to a future date of birth', 'PATCH', `/newborns/${ebId}`, { token: ADM, body: { ...fix, dob: iso(3) }, expect: 422 });
await call('edit an unknown baby', 'PATCH', '/newborns/99999999', { token: ADM, body: fix, expect: 404 });
await call('admin corrects name and date of birth', 'PATCH', `/newborns/${ebId}`, { token: ADM, body: fix, expect: 200 });
const fixed = await call('profile after the correction', 'GET', `/newborns/${ebId}`, { token: ADM, expect: 200 });
const movedOpv = fixed.data?.timeline?.find((t) => t.dose_name === 'bOPV-1');
check(fixed.data?.baby?.full_name === fix.name && fixed.data?.baby?.date_of_birth === fix.dob && fixed.data?.baby?.gender === 'M', 'the new name, gender and date of birth are saved');
check(movedOpv?.scheduled_date === iso(-10 + 42) && movedOpv?.status === 'PENDING', 'every unfinished dose moved with the date of birth (bOPV-1 is now day 42 of the new birthday)', movedOpv?.scheduled_date);

// a given dose must stay valid: bOPV-1 (minimum day 42) given at day 70 blocks moving the birthday to day 30
const ebBody2 = goodBaby({ baby: { name: 'API Edit Baby 2', gender: 'F', dob: iso(-70) } });
const eb2 = await call('register a second baby', 'POST', '/newborns', { token: N1, body: ebBody2, expect: 201 });
const eb2Id = eb2.data?.baby_id;
const prof3 = await call('profile of the second baby', 'GET', `/newborns/${eb2Id}`, { token: N1, expect: 200 });
const stockOf = async (label) => (await (await fetch(`${BASE}/inventory`, { headers: { authorization: `Bearer ${N1}` } })).json()).find((r) => r.vaccine_label === label)?.quantity;
const stockBefore = await stockOf('bOPV-1');
await call('give bOPV-1 at day 70', 'POST', `/doses/${prof3.data?.timeline?.find((t) => t.dose_name === 'bOPV-1')?.record_id}/administer`, { token: N1, body: {}, expect: 200 });
check((await stockOf('bOPV-1')) === stockBefore - 1, 'giving the dose took one from stock');
await call('birthday that would invalidate the given dose', 'PATCH', `/newborns/${eb2Id}`, { token: ADM, body: { name: 'API Edit Baby 2', gender: 'F', dob: iso(-30) }, expect: 409 });
const prof3b = await call('date of birth is unchanged after the refusal', 'GET', `/newborns/${eb2Id}`, { token: ADM, expect: 200 });
check(prof3b.data?.baby?.date_of_birth === iso(-70), 'the refused change left the date of birth alone');

await call('delete by a nurse', 'DELETE', `/newborns/${eb2Id}`, { token: N1, expect: 403 });
await call('delete by a parent', 'DELETE', `/newborns/${eb2Id}`, { token: P1, expect: 403 });
await call('delete an unknown baby', 'DELETE', '/newborns/99999999', { token: ADM, expect: 404 });
await call('admin deletes and returns the used dose to stock', 'DELETE', `/newborns/${eb2Id}?restoreStock=1`, { token: ADM, expect: 200 });
check((await stockOf('bOPV-1')) === stockBefore, 'stock is back to where it was before the baby was registered');
await call('the deleted baby is gone', 'GET', `/newborns/${eb2Id}`, { token: ADM, expect: 404 });
await call('admin deletes the first baby (stock untouched)', 'DELETE', `/newborns/${ebId}`, { token: ADM, expect: 200 });
await call("the guardian's login survives the deletion", 'POST', '/auth/login', { body: { username: eb.data?.parent_login?.username, password: 'Parent@123' }, expect: 200 });
const auditN = await call('audit shows the edit and the delete', 'GET', `/audit?recordId=${ebId}`, { token: ADM, expect: 200 });
check(auditN.data?.some((a) => a.table_name === 'NEWBORNS' && a.action === 'UPDATE' && /admin/.test(a.changed_by)) && auditN.data?.some((a) => a.table_name === 'NEWBORNS' && a.action === 'DELETE'), 'the audit log records who edited and deleted the newborn');

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
