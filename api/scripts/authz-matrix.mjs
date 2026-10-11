// Route x role check: node scripts/authz-matrix.mjs   (API running, demo seed loaded)
// Every endpoint is called anonymously and as parent, nurse and admin. Bodies are deliberately
// invalid, so an ALLOWED role gets 400/404/200 (never 401/403) and a FORBIDDEN role gets 403,
// before any data could change. Also checks ownership rules, security headers and CORS.
const BASE = process.env.API_URL || 'http://localhost:4000';

const login = async (username, password) => {
  const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  return (await r.json()).token;
};
const tokens = {
  anon: null,
  parent: await login('parent1', 'Parent@123'),
  nurse: await login('nurse1', 'Nurse@123'),
  admin: await login('admin', 'Admin@123'),
};
const ROLES = ['anon', 'parent', 'nurse', 'admin'];

const call = async (method, path, token, body) => {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return r.status;
};

const babies = await (await fetch(`${BASE}/newborns`, { headers: { authorization: `Bearer ${tokens.parent}` } })).json();
const ownBaby = babies[0].baby_id;

// [method, path, body, who may use it]
const ALL = ['parent', 'nurse', 'admin'];
const STAFF = ['nurse', 'admin'];
const routes = [
  ['POST', '/auth/login', {}, ['anon', ...ALL]],
  ['GET', '/me', undefined, ALL],
  ['GET', '/dashboard/summary', undefined, STAFF],
  ['GET', '/dashboard/overdue', undefined, STAFF],
  ['GET', '/dashboard/upcoming', undefined, STAFF],
  ['POST', '/newborns', {}, STAFF],
  ['GET', '/newborns/guardian-lookup?phone=9876500001', undefined, STAFF],
  ['GET', '/newborns', undefined, ALL],
  ['GET', `/newborns/${ownBaby}`, undefined, ALL],
  ['POST', '/doses/99999999/administer', { administeredDate: 'x' }, STAFF],
  ['POST', '/doses/99999999/reschedule', {}, STAFF],
  ['GET', '/doses/99999999/batch-preview', undefined, STAFF],
  ['GET', '/inventory', undefined, STAFF],
  ['POST', '/inventory/restock', {}, STAFF],
  ['GET', '/alerts', undefined, STAFF],
  ['PATCH', '/alerts/99999999/read', {}, STAFF],
  ['GET', '/reports/clinic-coverage', undefined, STAFF],
  ['GET', '/audit', undefined, ['admin']],
  ['GET', '/clinics', undefined, STAFF],
  ['GET', '/vaccines', undefined, STAFF],
  ['GET', '/users', undefined, ['admin']],
  ['GET', '/users/options', undefined, ['admin']],
  ['POST', '/users', {}, ['admin']],
  ['PATCH', '/newborns/99999999', {}, ['admin']],
  ['DELETE', '/newborns/99999999', undefined, ['admin']],
  ['GET', '/auth/demo-logins', undefined, ['anon', ...ALL]], // development switch DEMO_LOGINS=true
];

let bad = 0;
const check = (ok, label, detail) => {
  if (!ok) bad += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
};

console.log('route'.padEnd(44) + ROLES.map((r) => r.padEnd(8)).join(''));
for (const [method, path, body, allowed] of routes) {
  const cells = [];
  let rowOk = true;
  for (const role of ROLES) {
    const status = await call(method, path, tokens[role], body);
    const mayUse = allowed.includes(role);
    // public login returns 400/401 for an empty body; every other allowed call must get past auth
    const ok = path === '/auth/login' ? status === 400 : mayUse ? status !== 401 && status !== 403 : status === (role === 'anon' ? 401 : 403);
    rowOk &&= ok;
    cells.push(`${status}${ok ? '' : '!'}`.padEnd(8));
  }
  if (!rowOk) bad += 1;
  console.log(`${method.padEnd(6)}${path.padEnd(38)}${cells.join('')}${rowOk ? '' : '  <-- unexpected'}`);
}

console.log('\nOwnership rules');
const parent2 = await login('parent2', 'Parent@123');
const nurse2 = await login('nurse2', 'Nurse@123');
check((await call('GET', `/newborns/${ownBaby}`, parent2)) === 403, "parent2 cannot open parent1's child");
check((await call('GET', `/newborns/${ownBaby}`, nurse2)) === 403, "nurse2 (other clinic) cannot open Sunrise's baby");
check((await call('GET', '/dashboard/summary?clinicId=999999', tokens.nurse)) === 403, 'nurse cannot read another clinic dashboard');
check((await call('GET', '/inventory?clinicId=999999', tokens.nurse)) === 403, 'nurse cannot read another clinic inventory');

console.log('\nTokens');
check((await call('GET', '/me', 'abc.def.ghi')) === 401, 'garbage token -> 401');
const tampered = tokens.nurse.slice(0, -4) + 'AAAA';
check((await call('GET', '/me', tampered)) === 401, 'token with a changed signature -> 401');
const { default: jwt } = await import('jsonwebtoken');
const { config } = await import('../src/config.js');
const expired = jwt.sign({ role: 'ADMIN' }, config.jwtSecret, { subject: '2', expiresIn: -60 });
check((await call('GET', '/me', expired)) === 401, 'expired token -> 401');
const forged = jwt.sign({ role: 'ADMIN' }, 'not-the-real-secret-at-all', { subject: '2' });
check((await call('GET', '/audit', forged)) === 401, 'token signed with another secret -> 401');
const noneAlg = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from('{"sub":"2","role":"ADMIN"}').toString('base64url')}.`;
check((await call('GET', '/audit', noneAlg)) === 401, 'unsigned (alg none) token -> 401');

console.log('\nHardening');
const res = await fetch(`${BASE}/health`, { headers: { origin: 'http://evil.example' } });
const allowOrigin = res.headers.get('access-control-allow-origin');
check(allowOrigin !== 'http://evil.example' && allowOrigin !== '*', 'CORS: a foreign origin is never allowed (header is the web app origin, not the caller, not *)', `(${allowOrigin})`);
const ok = await fetch(`${BASE}/health`, { headers: { origin: 'http://localhost:5173' } });
check(ok.headers.get('access-control-allow-origin') === 'http://localhost:5173', 'CORS: the web app origin is allowed');
for (const h of ['x-content-type-options', 'strict-transport-security', 'x-frame-options', 'content-security-policy']) {
  check(Boolean(res.headers.get(h)), `helmet header ${h}`);
}
check(!res.headers.get('x-powered-by'), 'X-Powered-By is hidden');
const big = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'x'.repeat(30000), password: 'y' }) });
check(big.status === 413, 'oversized body -> 413', `(got ${big.status})`);
const badJson = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' });
const badText = await badJson.text();
check(badJson.status === 400 && !/at |node_modules|\.js:/.test(badText), 'malformed JSON -> 400 with no stack trace', badText.slice(0, 60));
const sqli = await fetch(`${BASE}/newborns?search=${encodeURIComponent("' OR 1=1 --")}`, { headers: { authorization: `Bearer ${tokens.admin}` } });
check(sqli.status === 200 && (await sqli.json()).length === 0, "SQL-injection style search text is just text (0 matches)");

console.log(`\n${bad === 0 ? 'ALL AUTHORIZATION CHECKS PASSED' : `${bad} CHECK(S) FAILED`}`);
process.exit(bad ? 1 : 0);
