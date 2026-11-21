import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';

const src = readFileSync(new URL('../public/account-session.js', import.meta.url), 'utf8');
const nav = readFileSync(new URL('../public/site-nav.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/site-nav.css', import.meta.url), 'utf8');
const login = readFileSync(new URL('../public/account.js', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../public/student-dashboard.js', import.meta.url), 'utf8');
for (const f of ['account-session.js','account.js','site-nav.js','student-dashboard.js']) {
  execFileSync('node', ['--check', new URL(`../public/${f}`, import.meta.url).pathname]);
}
assert.match(css, /account-cta/);
assert.match(nav, /showAccountLink\(role\)/);
assert.match(login, /hasAuthSession\(\)/);
assert.match(dashboard, /hasAuthSession\(\)/);

function storage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem(key) { return map.get(key) ?? null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); },
    map
  };
}
function session(local, tab = storage(), opts = {}) {
  const calls = [];
  let refreshed = 0;
  const fetch = async (url, options = {}) => {
    calls.push({url, options});
    const response = (status, value) => ({ ok: status >= 200 && status < 300, status,
      json: async () => value });
    if (url.startsWith('https://identitytoolkit.googleapis.com/'))
      return response(200, {idToken:'signed-in-token',refreshToken:'signed-in-refresh',expiresIn:'3600'});
    if (url.startsWith('https://securetoken.googleapis.com/')) {
      refreshed++;
      if(opts.wait) await opts.wait;
      if (opts.badRefresh) return response(400, {error:'INVALID_REFRESH_TOKEN'});
      return response(200, {id_token:'refreshed-token',refresh_token:'refreshed-refresh',expires_in:'3600'});
    }
    if (url === '/api/me') {
      if (opts.status === 503) return response(503, {error:'Authentication service unavailable'});
      if (opts.status === 401) return response(401, {error:'Invalid session'});
      return response(200, {status:'approved'});
    }
    throw new Error(`Unexpected fetch ${url}`);
  };
  const ctx = vm.createContext({localStorage:local,sessionStorage:tab,fetch,URLSearchParams,Date});
  vm.runInContext(src,ctx);
  return {ctx,local,tab,calls,get refreshed(){return refreshed;}};
}

// Signing in persists the REST refresh token; no email or password is stored locally.
const local = storage();
let a = session(local);
await vm.runInContext('firebaseAuth("signInWithPassword", "student@example.invalid", "password")', a.ctx);
assert.equal(local.getItem('eaglesIdToken'), 'signed-in-token');
assert.equal(local.getItem('eaglesRefreshToken'), 'signed-in-refresh');
assert.equal(a.tab.getItem('eaglesRefreshToken'), null);
assert.equal(await vm.runInContext('hasAuthSession()', a.ctx), true);
assert.equal(local.getItem('password'), null);

// Browser restart (new tab storage) restores the same login and API credential.
a = session(local, storage());
assert.equal(vm.runInContext('hasAuthSession()', a.ctx), true);
await vm.runInContext('request("/me")', a.ctx);
assert.equal(a.calls.at(-1).options.headers.Authorization, 'Bearer signed-in-token');

// Expiration refreshes the ID token using the persistent refresh token.
local.setItem('eaglesTokenExpiresAt', Date.now() - 2000);
a = session(local);
await vm.runInContext('request("/me")', a.ctx);
assert.equal(a.refreshed, 1);
assert.equal(local.getItem('eaglesIdToken'), 'refreshed-token');
assert.equal(a.calls.at(-1).options.headers.Authorization, 'Bearer refreshed-token');

// A server outage does not erase a valid saved session.
a = session(local, storage(), {status:503});
await assert.rejects(vm.runInContext('request("/me")', a.ctx), /Authentication service unavailable/);
assert.equal(local.getItem('eaglesRefreshToken'), 'refreshed-refresh');

// Previous sessionStorage accounts migrate without forcing users to log in again.
const old = storage({eaglesIdToken:'legacy-token',eaglesRefreshToken:'legacy-refresh',eaglesTokenExpiresAt:String(Date.now()+1e6)});
const migrated = storage();
a = session(migrated,old);
assert.equal(migrated.getItem('eaglesRefreshToken'),'legacy-refresh');
assert.equal(old.getItem('eaglesRefreshToken'),null);
await vm.runInContext('request("/me")',a.ctx);
assert.equal(a.calls.at(-1).options.headers.Authorization, 'Bearer legacy-token');

// Invalid refresh token revokes the saved browser session.
migrated.setItem('eaglesTokenExpiresAt', Date.now() - 10000);
a = session(migrated,storage(),{badRefresh:true});
await assert.rejects(vm.runInContext('request("/me")',a.ctx), /Invalid session/);
assert.equal(migrated.getItem('eaglesRefreshToken'),null);

// Explicit sign-out removes both persistent and legacy credentials.
a = session(local,storage({eaglesIdToken:'old-session-token'}));
vm.runInContext('clearSession()',a.ctx);
for (const key of ['eaglesIdToken','eaglesRefreshToken','eaglesTokenExpiresAt']) {
  assert.equal(local.getItem(key),null);
  assert.equal(a.tab.getItem(key),null);
}
assert.equal(vm.runInContext('hasAuthSession()',a.ctx),false);
let finishRefresh;
const delayed=session(storage({eaglesRefreshToken:"old",eaglesIdToken:"old-id"}),storage(),
  {wait:new Promise(resolve=>{finishRefresh=resolve;})});
const pending=vm.runInContext("refreshSession()",delayed.ctx);
vm.runInContext("clearSession()",delayed.ctx);
finishRefresh();
await assert.rejects(pending,/Session changed/);
assert.equal(delayed.local.getItem("eaglesIdToken"),null);
console.log('Persistent login: sign-in, reload, refresh, migration, outage, expiry, logout PASS (mocked API).');
