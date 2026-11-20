import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import vm from "node:vm";
import {execFileSync} from "node:child_process";

const require = createRequire(import.meta.url);
const {ensureArchived} = require("../server/quiz-results-store.js");
class Timestamp {
  constructor(ms){this.ms=ms;}
  toDate(){return new Date(this.ms);}
  toMillis(){return this.ms;}
}
const docs = new Map();
const snap = path => ({id:path.split("/").at(-1), exists: docs.has(path),data:()=>docs.get(path),get:key=>docs.get(path)?.[key]});
class Ref {
  constructor(path){this.path=path;this.id=path.split("/").at(-1);}
  get(){return Promise.resolve(snap(this.path));}
  collection(name){return new Query(`${this.path}/${name}`);}
}
class Query {
  constructor(path, filters=[], max=Infinity, sort=null){Object.assign(this,{path, filters, max, sort});}
  doc(id){return new Ref(`${this.path}/${id}`);}
  where(key, operator, value){return new Query(this.path,[...this.filters,{key,operator,value}],this.max,this.sort);}
  orderBy(key,direction){return new Query(this.path,this.filters,this.max,[key,direction]);}
  limit(max){return new Query(this.path,this.filters,max,this.sort);}
  async get(){
    let list=[...docs.keys()].filter(path=>path.startsWith(this.path+"/")&&path.split("/").length===this.path.split("/").length+1).map(snap)
      .filter(d=>this.filters.every(({key,operator,value})=>operator==="=="?d.get(key)===value:operator==="in"?value.includes(d.get(key)):false));
    if (this.sort) list = list.filter(d=>d.get(this.sort[0])!==undefined).sort((a,b)=>{
      const av = a.get(this.sort[0])?.toMillis?.()||0, bv=b.get(this.sort[0])?.toMillis?.()||0;
      return this.sort[1]==="desc"?bv-av:av-bv;
    });
    return {docs:list.slice(0,this.max)};
  }
}
let failOnce = true;
const db={collection:path=>new Query(path),batch:()=>{
  const writes=[];
  return {
    set:(ref,data)=>writes.push(["set",ref.path,data]),
    update:(ref,data)=>writes.push(["update",ref.path,data]),
    commit:async()=>{
      if (failOnce) {failOnce=false;throw new Error("Simulated Firestore outage");}
      for (const [type,path] of writes) if (type==="update") assert(docs.has(path));
      for (const [type,path,data] of writes) docs.set(path,{...(type==="set"?{}:docs.get(path)),...data});
    }
  };
}};
const finishedAt = new Timestamp(Date.parse("2026-11-20T10:00:00.000Z"));
docs.set("liveSessions/room1",{status:"finished",finishedAt,quizTitle:"IELTS demo",quizId:"quiz1",quizCreatorUid:"teacher",hostUid:"teacher",questionCount:3});
docs.set("liveSessions/room1/participants/student",{answeredCount:2,correctCount:1});
docs.set("liveSessions/room1/participants/other",{answeredCount:1,correctCount:1});
docs.set("liveSessions/room1/answers/0_student",{uid:"student",questionIndex:0,selectedOption:2,correct:true});
docs.set("liveSessions/room1/answers/1_student",{uid:"student",questionIndex:1,selectedOption:1,correct:false});
docs.set("liveSessions/room1/answers/0_other",{uid:"other",questionIndex:0,selectedOption:2,correct:true});
docs.set("liveSessions/room1/private/quiz",{questions:[
  {text:"Q1",correctOption:2,options:["a","b","c","d"]},
  {text:"Q2",correctOption:0,options:["a","b","c","d"]},
  {text:"Q3",correctOption:1,options:["a","b","c","d"]}
]});
for (const [uid,role,canCreateTests] of [["teacher","student",true],["admin","admin",true],["student","student",false],["other","student",false],["pending","student",false]]) {
  docs.set(`users/${uid}`,{role,canCreateTests,isActive:true,approvalStatus:uid==="pending"?"pending":"approved",firstName:uid,email:`${uid}@example.test`});
}
// A failed atomic batch must leave zero half-written results; retry must recover.
await assert.rejects(ensureArchived(db,"room1"),/Firestore outage/);
assert(!docs.has("quizResults/room1_student"));
assert(!docs.get("liveSessions/room1").resultsArchivedAt);
await ensureArchived(db,"room1");
assert.equal(docs.get("quizResults/room1_student").accuracy,33.33);
assert.equal(docs.get("quizResults/room1_other").accuracy,33.33);
assert.equal(docs.get("quizResults/room1_student").wrong,1);
assert.equal(docs.get("quizResults/room1_student").skipped,1);
assert.equal(docs.get("liveSessions/room1").resultsSummary.breakdown[0].correct,2);
assert.equal(docs.get("liveSessions/room1").resultsSummary.breakdown[1].wrong,1);
assert.equal(docs.get("liveSessions/room1").resultsSummary.breakdown[2].skipped,2);
const originalCount = [...docs.keys()].filter(x=>x.startsWith("quizResults/")).length;
await ensureArchived(db,"room1");
assert.equal([...docs.keys()].filter(x=>x.startsWith("quizResults/")).length,originalCount);
assert(!JSON.stringify(docs.get("quizResults/room1_student")).includes("points"));

const routes=[], middleware=[];
const fakeExpress={Router:()=>({use:fn=>middleware.push(fn),get:(path,...fns)=>routes.push({method:"GET",path,fns})})};
const fakeAuth={verifyIdToken:async uid=>({uid})};
const source=readFileSync(new URL("../server/quiz-results-routes.js",import.meta.url),"utf8");
vm.runInNewContext(source,{require:id=>id==="express"?fakeExpress:id==="./firebase"?{auth:fakeAuth,db}:
  id==="./live-lobby-core"?require("../server/live-lobby-core.js"):
  id==="./quiz-results-store"?require("../server/quiz-results-store.js"):require(id),
  console,Date,Promise,module:{exports:{}}},{filename:"quiz-results-routes.js"});
async function call(path,uid) {
  const parts=path.split("/").filter(Boolean);
  const route=routes.find(({path:template})=>{
    const segs=template.split("/").filter(Boolean);
    return segs.length===parts.length&&segs.every((x,i)=>x.startsWith(":")||x===parts[i]);
  });
  assert(route,`Unknown route ${path}`);
  const params={};
  route.path.split("/").filter(Boolean).forEach((part,i)=>{if(part.startsWith(":"))params[part.slice(1)]=parts[i];});
  const req={params,get:header=>header==="authorization"?`Bearer ${uid}`:null,user:null,profile:null};
  const res={statusCode:200,sent:false,status(n){this.statusCode=n;return this;},set(){return this;},json(body){this.body=body;this.sent=true;return this;}};
  for(const fn of [...middleware,...route.fns]) {
    let thrown=null;
    await fn(req,res,e=>{if(e)thrown=e;});
    if(thrown)throw thrown;
    if(res.sent)break;
  }
  assert(res.sent,`No response on ${path}`);
  return res;
}
let response=await call("/mine","student");
assert.equal(response.statusCode,200);
assert.equal(response.body.summary.testsTaken,1);
assert.equal(response.body.summary.averageAccuracy,33.33);
assert.equal(response.body.results[0].correct,1);
assert(!JSON.stringify(response.body).includes("other@example"));
response=await call("/mine","other");assert.equal(response.body.summary.testsTaken,1);
response=await call("/mine","pending");assert.equal(response.statusCode,403);
response=await call("/sessions","student");assert.equal(response.statusCode,403);
response=await call("/sessions","teacher");assert.equal(response.statusCode,200);
assert.equal(response.body.sessions.length,1);
assert(!JSON.stringify(response.body).includes("@example.test"));
assert(!JSON.stringify(response.body).includes('"uid"'));
response=await call("/sessions/room1","teacher");assert.equal(response.statusCode,200);
assert.equal(response.body.session.summary.privacyLimited, true);
assert.equal(response.body.session.summary.averageAccuracy, null);
assert.equal(response.body.session.summary.breakdown.length, 0);
assert(!JSON.stringify(response.body).includes('"selectedOption"'));
response=await call("/sessions/room1/participants","teacher");assert.equal(response.statusCode,403);
response=await call("/sessions/room1/participants/student/answers","teacher");assert.equal(response.statusCode,403);
response=await call("/sessions","admin");assert.equal(response.statusCode,200);
assert.equal(response.body.sessions[0].summary.averageAccuracy,33.33);
assert.equal(response.body.sessions[0].summary.privacyLimited, undefined);
response=await call("/sessions/room1/participants","admin");
assert.equal(response.statusCode,200);
assert.equal(response.body.participants.length,2);
assert(response.body.participants.some(p=>p.email==="student@example.test"));
response=await call("/sessions/room1/participants/student/answers","admin");
assert.equal(response.statusCode,200);
assert.equal(response.body.questions.length,3);
assert.equal(response.body.questions[2].outcome,"skipped");
assert.equal(response.body.questions[0].selectedOption,2);
console.log("Quiz Results v1.3.4: PASS (atomic archive/retry, percentages, skips, history, admin-only identities/answers, anonymized creator stats)");
for (const file of ["server/quiz-results-routes.js","server/quiz-results-store.js","public/quiz-statistics.js","public/student-dashboard.js"])
  execFileSync("node",["--check",new URL(`../${file}`,import.meta.url).pathname]);
