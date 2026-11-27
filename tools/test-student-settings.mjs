import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const path = new URL('../server/account-routes.js', import.meta.url);
const source = readFileSync(path, 'utf8');
const html = readFileSync(new URL('../public/student-dashboard.html', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../public/student-dashboard.js', import.meta.url), 'utf8');
const translations = readFileSync(new URL('../public/site-copy.js', import.meta.url), 'utf8');
const routes = new Map();
const router = {use(){}};
for (const method of ['get','post','patch','delete']) router[method] = (route,...handlers) => {
  routes.set(method.toUpperCase()+' '+route,handlers);
};
const profiles = new Map([
  ['studentUid', {firstName:'Initial', lastName:'Learner', email:'old@example.test',
    role:'student', approvalStatus:'approved', isActive:true, groupName:'IELTS B2',
    canCreateTests:false, canWriteReviews:false}],
  ['pendingUid',{firstName:'Pending',lastName:'Student',email:'pending@example.test',role:'student',approvalStatus:'pending',isActive:true}]
]);
let authenticatedEmail = 'old@example.test';
let accountFetches = 0;
const userRef = uid => ({
  get: async () => ({data:()=>profiles.get(uid),exists:profiles.has(uid)}),
  update: async updates => {
    profiles.set(uid,{...profiles.get(uid),...updates});
  }
});
const db = {
  collection: name => {
    assert.equal(name,'users');
    return {doc: userRef};
  },
  runTransaction: async fn => fn({
    get: async ref => ref.get(),
    update: (ref, changes) => ref.update(changes)
  })
};
const auth = {
  verifyIdToken: async value => ({uid:value,email:value==='studentUid' ? authenticatedEmail : 'pending@example.test'}),
  getUser: async uid => {accountFetches++; return {uid,email:authenticatedEmail};}
};
const module = {exports:{}};
vm.runInNewContext(source, {
  require: name => ({
    express:{Router:()=>router},
    './firebase':{auth,db},
    'firebase-admin/firestore':{FieldValue:{serverTimestamp:()=>({toDate:()=>new Date('2026-11-27T00:00:00Z')})}}
  })[name],module,console,Date, Object
},{filename:'account-routes.js'});
async function invoke(method, route, uid, body={}) {
  const handlers = routes.get(method+' '+route);
  assert(handlers,`${method} ${route} not registered`);
  const req = {body,user:null,get:()=>`Bearer ${uid}`,method,path:route};
  const res = {statusCode:200,status(n){this.statusCode=n;return this;},set(){return this;},json(data){this.data=data;this.sent=true;return this;}};
  for(const handler of handlers){
    let error;
    await handler(req,res,e=>{error=e;});
    if(error)throw error;
    if(res.sent)break;
  }
  assert(res.sent);
  return res;
}
const old = await invoke('GET','/dashboard','studentUid');
assert.equal(old.statusCode,200);
assert.equal(old.data.uid,'studentUid');
assert.equal(old.data.profile.email,'old@example.test');
assert.equal(accountFetches,0, 'matching email should not perform unnecessary Auth user reads');
authenticatedEmail='new@example.test';
const updated = await invoke('GET','/dashboard','studentUid');
assert.equal(updated.data.profile.email,'new@example.test');
assert.equal(profiles.get('studentUid').email,'new@example.test');
assert.equal(profiles.get('studentUid').groupName,'IELTS B2');
assert.equal(accountFetches,1);
const sync = await invoke('POST','/profile/sync-email','studentUid',{email:'attacker@example.test'});
assert.equal(sync.statusCode,200);
assert.equal(sync.data.updated,false);
assert.equal(profiles.get('studentUid').email,'new@example.test','submitted email must be ignored');
assert.equal((await invoke('POST','/profile/sync-email','pendingUid')).statusCode,403);
const names = await invoke('PATCH','/profile','studentUid',{firstName:'Updated',lastName:'Learner'});
assert.equal(names.statusCode,200);
assert.equal(profiles.get('studentUid').firstName,'Updated');
assert.equal(profiles.get('studentUid').role,'student');
assert.equal(profiles.get('studentUid').canCreateTests,false);
assert.equal((await invoke('PATCH','/profile','studentUid',{role:'admin'})).statusCode,400);
for(const id of ['studentLanguageSelect','changeEmail','checkChangedEmail','studentCurrentEmail','emailChangeFeedback']) {
  assert(html.includes(`id="${id}"`),`Missing control: ${id}`);
}
assert(ui.includes('VERIFY_AND_CHANGE_EMAIL'), 'Email change must use verification before update');
assert(ui.includes('signInWithPassword'), 'Email update must require recent login');
assert(ui.includes('proof.localId !== ownUid'), 'Email proof must refer to same account');
assert(ui.includes('requestType: "VERIFY_AND_CHANGE_EMAIL"'), 'New email must require out-of-band verification');
assert(ui.includes('localStorage.setItem("eaglesLanguage", language)'), 'Language preference must persist');
assert(ui.includes('location.reload()'), 'Language should take effect immediately without re-running translated UI');
for (const key of ['"Interface language"','"New email address"','"Send verification email"']) {
  assert(translations.includes(key),`Missing translation ${key}`);
}
console.log('Student self-service: name edit, verified Auth email sync, role protection and EN/RU/UZ settings PASS (mocked Auth/Firestore + static UI)');
