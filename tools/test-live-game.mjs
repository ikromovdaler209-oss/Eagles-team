import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import vm from "node:vm";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const core = require("../server/live-lobby-core.js");
assert.equal(core.validPin("123456"), true);
assert.equal(core.validPin("12345"), false);
assert.equal(core.canHost({role:"student",approvalStatus:"approved",isActive:true}),false);
assert.equal(core.canHost({role:"student",approvalStatus:"approved",isActive:true,canCreateTests:true}),true);
assert.equal(core.canJoin({role:"student",approvalStatus:"pending",isActive:true}),false);
assert.equal(core.canJoin({role:"student",approvalStatus:"approved",isActive:false}),false);
assert.match(core.randomPin(), /^\d{6}$/);
assert.match(core.randomAlias(), /^Player-[0-9A-F]{8}$/);

const docs = new Map();
class Timestamp {
  constructor(ms){this.ms=ms;}
  toMillis(){return this.ms;}
  toDate(){return new Date(this.ms);}
  static fromMillis(ms){return new Timestamp(ms);}
}
const FieldValue = { serverTimestamp:()=>({op:"ts"}), increment:n=>({op:"inc",n}),
  arrayUnion:v=>({op:"union",v}),arrayRemove:v=>({op:"remove",v}) };
function updateValues(previous,change){
  const next={...previous};
  for (const [k,v] of Object.entries(change)) next[k]=v?.op==="ts"?Timestamp.fromMillis(Date.now()):
    v?.op==="inc"?(next[k]||0)+v.n:
    v?.op==="union"?[...new Set([...(next[k]||[]),v.v])]:
    v?.op==="remove"?(next[k]||[]).filter(x=>x!==v.v):v;
  return next;
}
class Snapshot {
  constructor(path){this.path=path;this.exists=docs.has(path);this.id=path.split("/").at(-1);}
  data(){return docs.get(this.path);}
  get(k){return this.data()?.[k];}
}
class Doc {
  constructor(path){this.path=path;this.id=path.split("/").at(-1);}
  collection(name){return new Col(`${this.path}/${name}`);}
  get(){return Promise.resolve(new Snapshot(this.path));}
}
class Col {
  constructor(path,filter=null,max=Infinity){this.path=path;this.filter=filter;this.max=max;}
  doc(id){return new Doc(`${this.path}/${id}`);}
  where(k,_op,v){return new Col(this.path,[k,v],this.max);}
  limit(n){return new Col(this.path,this.filter,n);}
  count(){return {get:async()=>{const rows=await this.get();return {data:()=>({count:rows.docs.length})};}};}
  async get(){
    const arr=[...docs.keys()].filter(k=>k.startsWith(`${this.path}/`)&&k.split("/").length===this.path.split("/").length+1)
      .map(k=>new Snapshot(k)).filter(d=>!this.filter||d.get(this.filter[0])===this.filter[1]).slice(0,this.max);
    return {docs:arr};
  }
}
const db={collection:path=>new Col(path),runTransaction:async fn=>{
  const writes=[];
  const tx={
    get:ref=>ref.get(),
    set:(ref,value)=>writes.push(["set",ref.path,value]),
    create:(ref,value)=>writes.push(["create",ref.path,value]),
    update:(ref,value)=>writes.push(["update",ref.path,value]),
    delete:ref=>writes.push(["delete",ref.path])
  };
  const result=await fn(tx);
  for(const [op,key,value] of writes){
    if(op==="set")docs.set(key,updateValues({},value));
    else if(op==="create"){assert(!docs.has(key),`Duplicate create: ${key}`);docs.set(key,updateValues({},value));}
    else if(op==="update"){assert(docs.has(key),`Missing update: ${key}`);docs.set(key,updateValues(docs.get(key),value));}
    else docs.delete(key);
  }
  return result;
}};
db.batch = () => {
  const writes = [];
  return {
    set:(ref,value) => writes.push(["set",ref.path,value]),
    update:(ref,value) => writes.push(["update",ref.path,value]),
    commit:async () => {
      for (const [op,key] of writes) if (op === "update") assert(docs.has(key));
      for (const [op,key,value] of writes) docs.set(key,updateValues(op==="set"?{}:docs.get(key),value));
    }
  };
};
const approved={role:"student",approvalStatus:"approved",isActive:true,canCreateTests:false};
const teacher={...approved,canCreateTests:true};
const admin={...teacher,role:"admin"};
const pending={...approved,approvalStatus:"pending"};
for (const [uid,profile] of Object.entries({admin,teacher,student:approved,other:approved,pending})) docs.set(`users/${uid}`,profile);
docs.set("quizzes/test1",{title:"English basics",creatorUid:"teacher",status:"published",questions:[
  {text:"Hello?",options:["1","2","3","4"],correctOption:2,timeLimit:30},
  {text:"Second question",options:["Red","Blue","Green","Yellow"],correctOption:1,timeLimit:25}
]});
docs.set("quizzes/draft",{title:"Draft",creatorUid:"teacher",status:"draft",questions:[{text:"Question",options:["1","2","3","4"],correctOption:0,timeLimit:25}]});
docs.set("quizzes/otherQuiz",{title:"Admin test",creatorUid:"admin",status:"published",questions:[{text:"Question",options:["1","2","3","4"],correctOption:0,timeLimit:25}]});
const routes=[],middlewares=[];
const router={use(...fns){middlewares.push(...fns);},get(path,...fns){routes.push({method:"GET",path,fns});},post(path,...fns){routes.push({method:"POST",path,fns});}};
const fakeExpress={Router:()=>router};
const fakeAuth={verifyIdToken:async token=>({uid:token})};
const rateLimitConfigs=[];
const fakeRateLimit=options=>{rateLimitConfigs.push(options);return async (_req,_res,next)=>next();};
const source=readFileSync(new URL("../server/live-lobby-routes.js", import.meta.url),"utf8");
const readingModule={exports:{}};
vm.runInNewContext(readFileSync(new URL("../server/live-reading.js",import.meta.url),"utf8"),{
  module:readingModule,require:id=>id==="firebase-admin/firestore"?{Timestamp,FieldValue}:require("../server/"+id.slice(2)),
  Date,console
});
vm.runInNewContext(source,{
  require:id=>id==="./live-reading"?readingModule.exports:id==="express"?fakeExpress:id==="express-rate-limit"?fakeRateLimit:id==="node:crypto"?require("node:crypto"):
    id==="firebase-admin/firestore"?{Timestamp,FieldValue}:
    id==="./reading-practice-content"?require("../server/reading-practice-content.js"):
    id==="./firebase"?{auth:fakeAuth,db}:id==="./live-lobby-core"?core:
    id==="./quiz-results-store"?require("../server/quiz-results-store.js"):require(id),
  module:{exports:{}},console,Date,Promise
},{filename:"live-lobby-routes.js"});
assert.equal(rateLimitConfigs.length,3);
const memberLimit = rateLimitConfigs.find(c=>c.limit===1000);
assert.equal(memberLimit.keyGenerator({user:{uid:"student"}}),"student");
const creationLimit = rateLimitConfigs.find(c=>c.limit===10);
assert.equal(creationLimit.keyGenerator({user:{uid:"teacher"}}),"teacher");
const pinLimit = rateLimitConfigs.find(c=>c.limit===30);
assert.equal(pinLimit.keyGenerator({user:{uid:"student"}}),"student");
async function call(method,path,uid,body={}) {
  const res={statusCode:200,body:null,sent:false,headers:{},set(k,v){this.headers[k]=v;return this;},status(n){this.statusCode=n;return this;},json(v){this.sent=true;this.body=v;return this;}};
  const req={method,path,body,user:null,profile:null,params:{},get:key=>key==="authorization"?`Bearer ${uid}`:null};
  const match=routes.find(r=>{
    if(r.method!==method)return false;
    const a=r.path.split("/").filter(Boolean),b=path.split("/").filter(Boolean);
    if(a.length!==b.length)return false;
    return a.every((v,i)=>v.startsWith(":")||v===b[i]);
  });
  if(!match)throw new Error(`Unknown endpoint ${method} ${path}`);
  const parts=match.path.split("/").filter(Boolean),actual=path.split("/").filter(Boolean);
  for(let i=0;i<parts.length;i++)if(parts[i].startsWith(":"))req.params[parts[i].slice(1)]=actual[i];
  for(const fn of [...middlewares,...match.fns]){
    let error=null;
    await fn(req,res,e=>{if(e)error=e;});
    if(error)throw error;
    if(res.sent)break;
  }
  assert(res.sent,`No response on ${method} ${path}`);
  return res;
}

// v1.3.3 game progression: only time and correct-answer count matter.
let r = await call("POST", "/", "teacher", {quizId:"test1"});
assert.equal(r.statusCode, 201);
const {roomId, pin} = r.body;
const path = `/${roomId}`;
r = await call("POST", `${path}/start`, "student"); assert.equal(r.statusCode, 403);
r = await call("POST", `${path}/start`, "teacher"); assert.equal(r.statusCode, 409); // no participants
r = await call("POST", "/join", "student", {pin}); assert.equal(r.statusCode, 200);
const alias = r.body.alias;
r = await call("POST", "/join", "other", {pin}); assert.equal(r.statusCode, 200);
r = await call("POST", `${path}/start`, "teacher", {unexpected:1}); assert.equal(r.statusCode, 400);
r = await call("POST", `${path}/start`, "teacher"); assert.equal(r.statusCode, 200);
r = await call("POST", `${path}/start`, "teacher"); assert.equal(r.statusCode, 409);
r = await call("GET", path, "student"); assert.equal(r.statusCode, 200);
assert.equal(r.body.room.status, "question");
assert.equal(r.body.room.questionIndex, 0);
assert.equal(r.body.room.question.text, "Hello?");
assert.equal(r.body.room.question.timeLimit, 30);
assert(!JSON.stringify(r.body).includes("correctOption"));
assert(!JSON.stringify(r.body).includes("correctCount"));
assert(!JSON.stringify(r.body).includes('"uid"'));
assert(!JSON.stringify(r.body).includes('"creatorUid"'));
r = await call("POST", "/join", "student", {pin}); assert.equal(r.body.alias, alias); // reconnect during active game
r = await call("POST", "/join", "admin", {pin}); assert.equal(r.statusCode, 409); // no new join
r = await call("POST", `${path}/answer`, "teacher", {questionIndex:0,selectedOption:2}); assert.equal(r.statusCode, 403);
r = await call("POST", `${path}/answer`, "student", {questionIndex:1,selectedOption:2}); assert.equal(r.statusCode, 409);
r = await call("POST", `${path}/answer`, "student", {questionIndex:0,selectedOption:4}); assert.equal(r.statusCode, 400);
r = await call("POST", `${path}/answer`, "student", {questionIndex:0,selectedOption:2}); assert.equal(r.statusCode, 200);
assert.equal(r.body.alreadySubmitted, false);
r = await call("POST", `${path}/answer`, "student", {questionIndex:0,selectedOption:0}); assert.equal(r.statusCode, 200);
assert.equal(r.body.alreadySubmitted, true);
assert.equal(docs.get(`liveSessions/${roomId}`).currentQuestionIndex,0);
r = await call("POST", `${path}/answer`, "other", {questionIndex:0,selectedOption:0}); assert.equal(r.statusCode, 200);
assert.equal(docs.get(`liveSessions/${roomId}/answers/0_student`).correct, true);
assert.equal(docs.get(`liveSessions/${roomId}/answers/0_other`).correct, false);
assert(!Object.hasOwn(docs.get(`liveSessions/${roomId}`), "currentAnswerCount"));
assert.equal(docs.get(`liveSessions/${roomId}/participants/student`).correctCount, 1);
assert.equal(docs.get(`liveSessions/${roomId}/participants/student`).answeredCount, 1);
r = await call("GET", path, "student");
assert.equal(r.body.myAnswer, undefined);
assert.equal(r.body.lastCompletedRound.answer,"3");
assert.equal(r.body.room.status,"question");
r = await call("POST", `${path}/advance`, "teacher"); assert.equal(r.statusCode,409);
r = await call("GET", path, "student");
assert.equal(r.body.room.questionIndex, 1);
assert.equal(r.body.room.question.text, "Second question");
assert(!JSON.stringify(r.body).includes('"correctOption"'));
// Second round left unanswered: its result is a skip, not an invented score.
docs.get(`liveSessions/${roomId}`).questionEndsAt = Timestamp.fromMillis(Date.now() - 10);
r = await call("POST", `${path}/advance`, "teacher"); assert.equal(r.statusCode, 200);
assert.equal(r.body.finished, true);
r = await call("GET", path, "student"); assert.equal(r.body.room.status, "finished");
assert.equal(r.body.myResult.correct,1); assert.equal(r.body.myResult.wrong,0); assert.equal(r.body.myResult.skipped,1); assert.equal(r.body.myResult.total,2); assert.equal(r.body.myResult.accuracy,50);
assert(!JSON.stringify(r.body).includes('"points"'));
r = await call("GET", path, "teacher"); assert(!r.body.myResult);
r = await call("POST", `${path}/answer`, "other", {questionIndex:1,selectedOption:1}); assert.equal(r.statusCode, 409);
r = await call("POST", `${path}/close`, "teacher"); assert.equal(r.statusCode, 200);
r = await call("GET", path, "student"); assert.equal(r.body.room.status, "closed");
assert.equal(r.body.myResult.accuracy, 50); // results survive closing a completed room
assert.equal(docs.get(`quizResults/${roomId}_student`).accuracy,50);
assert.equal(docs.get(`quizResults/${roomId}_other`).accuracy,0);
assert.equal(docs.get(`liveSessions/${roomId}`).resultsSummary.participantCount,2);

// Round expiration checks cannot be bypassed by changing a local countdown.
r = await call("POST", "/", "admin", {quizId:"otherQuiz"}); assert.equal(r.statusCode, 201);
const lateRoom = r.body.roomId;
await call("POST", "/join", "other", {pin:r.body.pin});
await call("POST", `/${lateRoom}/start`, "admin");
docs.get(`liveSessions/${lateRoom}`).questionEndsAt = Timestamp.fromMillis(Date.now()-1);
r = await call("POST", `/${lateRoom}/answer`, "other", {questionIndex:0,selectedOption:0});
assert.equal(r.statusCode, 409);
assert.equal(docs.has(`liveSessions/${lateRoom}/answers/0_other`), false);
r = await call("GET", `/${lateRoom}`, "other");
assert.equal(r.body.room.status, "review");
assert.equal(r.body.review.correctOption, 0);
r = await call("POST", `/${lateRoom}/advance`, "other");
assert.equal(r.statusCode, 403);
// A transient archive write failure must not make the finished room look broken.
const originalBatch = db.batch;
let unavailableBatches = 2;
db.batch = () => {
  const batch = originalBatch();
  const commit = batch.commit;
  batch.commit = async () => {
    if (unavailableBatches-- > 0) {
      const error = new Error("Simulated Firestore write outage");
      error.code = "unavailable";
      throw error;
    }
    return commit();
  };
  return batch;
};
r = await call("POST", `/${lateRoom}/advance`, "admin");
assert.equal(r.statusCode, 200);
assert.equal(r.body.finished, true);
assert.equal(r.body.archivePending, true);
assert(!docs.get(`liveSessions/${lateRoom}`).resultsArchivedAt);
r = await call("GET", `/${lateRoom}`, "other");
assert.equal(r.statusCode, 200);
assert.equal(r.body.room.status, "finished");
assert.equal(r.body.myResult.accuracy, 0);
assert(!docs.get(`liveSessions/${lateRoom}`).resultsArchivedAt);
db.batch = originalBatch;
r = await call("GET", `/${lateRoom}`, "other");
assert.equal(r.statusCode, 200);
assert(docs.get(`liveSessions/${lateRoom}`).resultsArchivedAt);
assert.equal(docs.get(`quizResults/${lateRoom}_other`).accuracy, 0);
r = await call("POST", "/", "admin", {quizId:"otherQuiz"});
const solo = r.body.roomId;
await call("POST", "/join", "student", {pin:r.body.pin});
await call("POST", `/${solo}/start`, "admin");
await call("POST", `/${solo}/answer`, "student", {questionIndex:0,selectedOption:0});
assert.equal(docs.get(`liveSessions/${solo}`).status,"finished");
assert.equal(docs.get(`quizResults/${solo}_student`).accuracy,100);
console.log("Live Quiz v1.3.3 simulated gameplay: PASS (roles, start, privacy, deadlines, duplicate answers, review, finish, reconnect, no points)");
for (const f of ["server/live-lobby-routes.js", "server/live-lobby-core.js", "public/quiz-live.js"])
  execFileSync("node", ["--check", new URL(`../${f}`, import.meta.url).pathname]);

// The new published Reading samples can also be hosted without Firestore quiz documents.
const contentRoom = await call("POST", "/", "teacher", {mode:"reading",quizId:"cooling-streets"});
assert.equal(contentRoom.statusCode,201);
assert.equal(docs.get("liveSessions/"+contentRoom.body.roomId).questionCount,9);
assert.equal(docs.get("liveSessions/"+contentRoom.body.roomId).sectionCount,1);
assert.equal((await call("POST","/","student",{mode:"reading",quizId:"library-of-things"})).statusCode,403);
// Exercise both advances and the shared result archive through the real routes.
const sample=readingModule.exports.starter;
docs.set("readingTests/class-reading",{...sample,owner:"teacher",sections:[...sample.sections,...sample.sections],count:6});
const hostReading=(uid)=>call("POST","/",uid,{mode:"reading",quizId:"class-reading"});
assert.equal((await hostReading("student")).statusCode,403);
const readingRoom=await hostReading("teacher");
assert.equal(readingRoom.statusCode,201);
const base="/"+readingRoom.body.roomId;
for(const uid of ["student","other"])await call("POST","/join",uid,{pin:readingRoom.body.pin});
await call("POST",base+"/start","teacher");
const view=async uid=>(await call("GET",base,uid)).body;
assert.equal((await view("student")).room.sectionCount,2);
assert(!JSON.stringify(await view("student")).includes('"keys"'));
const values=["","False","ten minutes"];
const send=(uid,section,answers,revision,submit)=>call("POST",base+"/reading",uid,{section,answers,revision,submit});
assert.equal((await send("student",0,values,0,false)).statusCode,200);
assert.equal((await send("student",0,values,0,false)).body.revision,1);
assert.equal((await view("student")).draft.answers[1],"False");
assert.equal((await view("other")).draft,undefined);
assert.equal((await send("student",0,values,1,true)).statusCode,200);
assert.equal((await view("other")).room.questionIndex,0);
assert.equal((await send("other",0,["","",""],0,true)).statusCode,200);
assert.equal((await view("other")).room.questionIndex,1);
assert.equal((await send("other",1,["","False",""],0,false)).statusCode,200);
docs.get("liveSessions"+base).questionEndsAt=Timestamp.fromMillis(Date.now()-1);
assert.equal((await send("student",1,values,0,true)).statusCode,409);
assert.equal((await call("POST",base+"/advance","teacher",{section:1})).statusCode,200);
assert.equal((await view("student")).myResult.correct,2);
assert.equal((await view("other")).myResult.correct,1);
assert.equal(docs.get("quizResults/"+readingRoom.body.roomId+"_other").skipped,5);
console.log("Live Reading PASS: shared PIN, private drafts, retry, early advance, deadline and archived results.");
