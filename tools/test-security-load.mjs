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
    create:(ref,value)=>writes.push(["create",ref.path,value]),
    update:(ref,value)=>writes.push(["update",ref.path,value]),
    delete:ref=>writes.push(["delete",ref.path])
  };
  const result=await fn(tx);
  for(const [op,key,value] of writes){
    if(op==="create"){assert(!docs.has(key),`Duplicate create: ${key}`);docs.set(key,updateValues({},value));}
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
vm.runInNewContext(source,{
  require:id=>id==="express"?fakeExpress:id==="express-rate-limit"?fakeRateLimit:id==="node:crypto"?require("node:crypto"):
    id==="firebase-admin/firestore"?{Timestamp,FieldValue}:
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

// Synthetic load simulation using the same HTTP route handlers and an in-memory
// Firestore substitute. This is not a live Firebase/Render benchmark.
const start = Date.now();
for (const size of [10, 30, 50, 100]) {
  const ids = Array.from({length:size}, (_,i) => `load_${size}_${i}`);
  for (const uid of ids) docs.set(`users/${uid}`, {...approved});
  let response = await call("POST", "/", "teacher", {quizId:"test1"});
  assert.equal(response.statusCode, 201);
  const {roomId, pin} = response.body;
  // Joining updates a shared room document; we do not claim the mock covers
  // Firestore transaction contention from concurrent joins.
  for (const uid of ids) {
    response = await call("POST", "/join", uid, {pin});
    assert.equal(response.statusCode, 200);
  }
  response = await call("GET", `/${roomId}`, "teacher");
  assert.equal(response.body.participants.length, size);
  assert.equal(response.body.room.participantCount, size);
  assert(!JSON.stringify(response.body).includes('"uid"'));
  response = await call("POST", `/${roomId}/start`, "teacher");
  assert.equal(response.statusCode, 200);
  // Concurrent answer submissions modify distinct participant and answer docs.
  const first = await Promise.all(ids.map((uid, i) => call("POST", `/${roomId}/answer`, uid,
    {questionIndex:0, selectedOption:i%4})));
  assert(first.every(x=>x.statusCode===200 && x.body.ok));
  const firstCorrect = ids.filter((_,i)=>i%4===2).length;
  // Replaying an answer must never increment the counters twice.
  response = await call("POST", `/${roomId}/answer`, ids[0], {questionIndex:0,selectedOption:2});
  assert.equal(response.body.alreadySubmitted, true);
  assert.equal(docs.get(`liveSessions/${roomId}`).currentQuestionIndex, 1);
  const answering = ids.slice(0, size/2);
  const second = await Promise.all(answering.map(uid => call("POST", `/${roomId}/answer`, uid,
    {questionIndex:1, selectedOption:1})));
  assert(second.every(x=>x.statusCode===200));
  docs.get(`liveSessions/${roomId}`).questionEndsAt = Timestamp.fromMillis(Date.now()-1);
  response = await call("POST", `/${roomId}/advance`, "teacher");
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.finished,true);
  const saved=docs.get(`liveSessions/${roomId}`);
  assert.equal(saved.resultsSummary.participantCount,size);
  assert.equal(saved.resultsSummary.questionCount,2);
  assert.equal(saved.resultsSummary.breakdown[0].correct,firstCorrect);
  assert.equal(saved.resultsSummary.breakdown[1].skipped,size-size/2);
  assert.equal([...docs.keys()].filter(k=>k.startsWith(`quizResults/${roomId}_`)).length,size);
  const expected=(firstCorrect+size/2)/(size*2)*100;
  assert(Math.abs(saved.resultsSummary.averageAccuracy-expected)<0.01);
  // Ensure a student's view stays scoped to their own counters.
  response = await call("GET", `/${roomId}`, ids[0]);
  assert.equal(response.statusCode,200);
  assert(response.body.myResult);
  assert.equal(response.body.room.isHost,false);
  assert(!JSON.stringify(response.body).includes('"uid"'));
  console.log(`Synthetic room: ${size} participants, ${size+size/2} submitted answers, ${saved.resultsSummary.averageAccuracy}% average: PASS`);
}
const builderSource = readFileSync(new URL("../server/server.js",import.meta.url),"utf8");
assert.match(builderSource,/"\/api\/quizzes", express\.json\(\{limit: "768kb"\}\)/);
const example = JSON.stringify({title:"Long quiz",description:"",status:"published",
  questions:Array.from({length:100},()=>({text:"Question ".repeat(30),
    options:Array(4).fill("Choice ".repeat(30)),correctOption:1,timeLimit:30}))});
assert(Buffer.byteLength(example)>10*1024);
assert(Buffer.byteLength(example)<768*1024);
assert.equal(core.MAX_PARTICIPANTS,200);
console.log("Security / load simulation: PASS (synthetic 10/30/50/100, privacy, deadlines, duplicates, percentages, request size)");
console.log("Note: no production concurrency, network latency, quota or cost measurement was performed.");
for (const file of ["server/server.js","server/quiz-routes.js","server/live-lobby-routes.js"])
  execFileSync("node",["--check",new URL(`../${file}`,import.meta.url).pathname]);
