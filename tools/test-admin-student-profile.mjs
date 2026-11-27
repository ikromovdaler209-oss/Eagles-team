import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const store = new Map();
const timestamp = text => ({toDate: () => new Date(text)});
const copy = x => structuredClone(x);
const snap = (id, value) => ({id, exists: value !== undefined,
  data: () => value, get: key => value?.[key]});
class Query {
  constructor(path, filters = [], limitTo = Infinity) {this.path = path; this.filters = filters; this.limitTo = limitTo;}
  doc(id) {return {get: async () => snap(id,store.get(`${this.path}/${id}`))};}
  where(key, operator, value) {assert.equal(operator, '==');return new Query(this.path,[...this.filters,[key,value]],this.limitTo);}
  select(...keys) {this.keys = keys;return this;}
  limit(n) {return new Query(this.path,this.filters,n);}
  async get() {
    const docs = [];
    for (const [path, value] of store) {
      if (!path.startsWith(this.path+'/') || path.slice(this.path.length+1).includes('/')) continue;
      if (this.filters.every(([key,valueToMatch]) => value[key] === valueToMatch)) {
        docs.push(snap(path.split('/').at(-1),value));
      }
    }
    return {docs:docs.slice(0,this.limitTo)};
  }
}
const routes = {};
const router = {use() {}};
for(const method of ['get','post','patch','delete']) router[method] = (path,...fns) => {routes[method+' '+path] = fns;};
const db = {collection: name => new Query(name)};
const dependencies = {
  express: {Router:()=>router},
  './firebase': {db,auth:{verifyIdToken:async value => ({uid:value})}},
  'firebase-admin/firestore': {FieldValue:{serverTimestamp:()=>timestamp('2026-11-27T00:00:00Z')}}
};
const module = {exports:{}};
vm.runInNewContext(readFileSync(new URL('../server/account-routes.js',import.meta.url),'utf8'), {
  require: name => dependencies[name],module,console, Date
},{filename:'account-routes.js'});
const flags = {approvalStatus:'approved',isActive:true};
store.set('users/admin123',{...flags,role:'admin'});
store.set('users/teacher1',{...flags,role:'student',canCreateTests:true});
store.set('users/student1',{...flags,role:'student',firstName:'Test',lastName:'Student',email:'student@example.test',groupName:'IELTS B2',
  createdAt: timestamp('2026-10-01T00:00:00Z'),canCreateTests:false,canWriteReviews:false});
store.set('users/archived1',{...flags,role:'student',archivedAt:timestamp('2026-10-02T00:00:00Z')});
store.set('quizResults/room1_student1',{uid:'student1',sessionId:'room1',quizTitle:'Mock quiz',total:10,correct:8,wrong:1,skipped:1,accuracy:80,completedAt:timestamp('2026-11-20T15:00:00Z')});
store.set('quizResults/room2_student1',{uid:'student1',sessionId:'room2',quizTitle:'Mock quiz 2',total:10,correct:6,wrong:3,skipped:1,accuracy:60,completedAt:timestamp('2026-11-21T15:00:00Z')});
store.set('quizResults/other_student2',{uid:'student2',sessionId:'other',quizTitle:'PRIVATE',total:10,correct:10,accuracy:100});
store.set('readingAttempts/attempt1',{uid:'student1',title:'Reading exercise',testId:'reading-1',completed:1763654400000,
  result:{correct:9,wrong:1,skipped:0,total:10,accuracy:90,marks:['correct']}});
store.set('readingAttempts/notFinished',{uid:'student1',title:'Do not list',completed:null});
store.set('speakingSubmissions/record1',{uid:'student1',part:2,prompt:'Describe your experience',durationSeconds:90,status:'reviewed',
  asset:{publicId:'private-reference'},createdAt:timestamp('2026-11-19T15:00:00Z'),
  review:{feedback:'Clear answer',overall:7,criteria:{fluency:7}}});
store.set('speakingSubmissions/uploading',{uid:'student1',part:1,status:'uploading',asset:null});

async function call(actor, uid) {
  const handlers = routes['get /admin/students/:uid/profile'];
  assert(handlers?.length===3);
  const req = {params:{uid},get: () => 'Bearer '+actor};
  const res = {statusCode:200,set(){return this;},status(code){this.statusCode=code;return this;},
    json(body){this.body=body;this.sent=true;return this;}};
  for(const fn of handlers) {
    let error=null;
    await fn(req,res,e=>{error=e||null;});
    if(error)throw error;
    if(res.sent)break;
  }
  assert(res.sent);
  return res;
}
const admin = await call('admin123','student1');
assert.equal(admin.statusCode,200);
const result = admin.body;
assert.equal(result.student.groupName,'IELTS B2');
assert.equal(result.overview.quiz.count,2);
assert.equal(result.overview.quiz.average,70);
assert.equal(result.quiz.items[0].sessionId,'room2');
assert.equal(result.overview.reading.count,1);
assert.equal(result.overview.reading.average,90);
assert.equal(result.overview.speaking.submitted,1);
assert.equal(result.overview.speaking.reviewed,1);
assert.equal(result.speaking.items[0].review.overall,7);
assert.equal(result.speaking.items[0].audioAvailable,true);
assert(!JSON.stringify(result).includes('private-reference'),'Storage asset should not leak in profile payload');
assert(!JSON.stringify(result).includes('PRIVATE'),'Other students data must not appear');
assert(!JSON.stringify(result).includes('Do not list'),'Unfinished reading must not appear');
assert.equal((await call('teacher1','student1')).statusCode,403);
assert.equal((await call('student1','student1')).statusCode,403);
assert.equal((await call('admin123','archived1')).statusCode,404);
assert.equal((await call('admin123','missing1')).statusCode,404);
assert.equal((await call('admin123','bad/name')).statusCode,400);
store.set('users/admin123',{role:'admin',isActive:false,approvalStatus:'approved'});
assert.equal((await call('admin123','student1')).statusCode,403);
console.log('Admin student profile: admin access, results, privacy, archived/missing, inactive admin PASS (mocked Firestore)');
// Static UI integration: all referenced elements exist, and the admin list
// opens the new page without interpolating student-supplied HTML.
const html = readFileSync(new URL('../public/admin-student-profile.html',import.meta.url),'utf8');
const client = readFileSync(new URL('../public/admin-student-profile.js',import.meta.url),'utf8');
const adminList = readFileSync(new URL('../public/admin.js',import.meta.url),'utf8');
for (const [,id] of client.matchAll(/byId\("([^"]+)"\)/g)) {
  assert(html.includes(`id="${id}"`),`Missing UI element ${id}`);
}
for(const id of ['panelOverview','panelQuiz','panelPractice','panelAccount']) assert(html.includes(`id="${id}"`));
assert(adminList.includes('/admin-student-profile.html?uid='));
assert(client.includes('.textContent = '));
assert(!client.includes('.innerHTML = '));
assert(html.includes('admin-student-profile.css') && html.includes('admin-student-profile.js'));
console.log('Admin student profile UI: selectors, tab panels, assets, admin link and safe rendering PASS (static)');
