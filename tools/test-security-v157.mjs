import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const {trustedProxyHops} = require("../server/security-config.js");
assert.equal(trustedProxyHops({}), 0);
assert.equal(trustedProxyHops({RENDER:"true"}), 1);
assert.equal(trustedProxyHops({RENDER:"true",TRUST_PROXY_HOPS:"2"}), 2);
assert.equal(trustedProxyHops({RENDER:"true",TRUST_PROXY_HOPS:"0"}), 0);
for(const value of ["true", "-1", "6", "1.5", "12", "xyz", " 1"])
  assert.throws(()=>trustedProxyHops({TRUST_PROXY_HOPS:value}),/TRUST_PROXY_HOPS/);
assert.match(readFileSync(new URL("../server/server.js", import.meta.url),"utf8"), /app\.set\("trust proxy", trustedProxyHops\(\)\)/);

// Exercise account listing with 1,002 stored profiles, including the extra
// record that signals truncation. No live Firestore or account is accessed.
const profileMap = new Map([["admin", {role:"admin",approvalStatus:"approved",isActive:true}]]);
for(let n=0;n<1002;n++) profileMap.set(`student${n}`, {
  role:"student",firstName:`Student ${n}`, lastName:"Test", email:`student${n}@example.test`,
  groupName:"B2",approvalStatus:"approved",isActive:true
});
class StudentsQuery {
  constructor(max=Infinity){this.max=max;}
  where(field,op,value){assert.equal(field,"role");assert.equal(op,"==");assert.equal(value,"student");return this;}
  limit(n){return new StudentsQuery(n);}
  async get(){return {docs:[...profileMap.entries()].filter(([,p])=>p.role==="student").slice(0,this.max)
    .map(([id,p])=>({id,data:()=>p,get:key=>p[key]}))};}
  doc(id){return {get:async()=>({data:()=>profileMap.get(id)})};}
}
const accountRoutes = new Map();
const accountRouter = {use(){}};
for(const method of ["get","post","patch","delete"])
  accountRouter[method]=(path,...handlers)=>accountRoutes.set(`${method} ${path}`,handlers);
const modules={express:{Router:()=>accountRouter},"./firebase":{
  db:{collection:name=>{assert.equal(name,"users");return new StudentsQuery();}},
  auth:{verifyIdToken:async token=>({uid:token})}},
  "firebase-admin/firestore":{FieldValue:{serverTimestamp:()=>0}}
};
vm.runInNewContext(readFileSync(new URL("../server/account-routes.js",import.meta.url),"utf8"),{
  require:key=>modules[key],module:{exports:{}},console,Date
});
async function getRoster(uid){
  const req={get:()=>`Bearer ${uid}`,method:"GET",path:"/admin/students"};
  const res={statusCode:200,status(n){this.statusCode=n;return this;},set(){return this;},
    json(v){this.body=v;this.sent=true;return this;}};
  for(const fn of accountRoutes.get("get /admin/students")){
    let error;await fn(req,res,e=>{error=e;});if(error)throw error;if(res.sent)break;
  }
  return res;
}
let response=await getRoster("admin");
assert.equal(response.statusCode,200);
assert.equal(response.body.students.length,1000);
assert.equal(response.body.limited,true);
response=await getRoster("student0");
assert.equal(response.statusCode,403);

const quizResults = Array.from({length:1002},(_,n)=>({
  sessionId:`room${n}`,quizTitle:"Quiz",uid:"student0",total:20,
  correct:10,wrong:10,skipped:0,accuracy:50,
  completedAt:{toDate:()=>new Date(1764000000000+n*1000)}
}));
class Query {
  constructor(kind,max=Infinity){this.kind=kind;this.max=max;}
  doc(uid){return {get:async()=>({data:()=>profileMap.get(uid)})};}
  where(){return this;}
  limit(n){return new Query(this.kind,n);}
  async get(){return {docs:(this.kind==="quizResults"?quizResults:[]).slice(0,this.max)
    .map(data=>({data:()=>data}))};}
}
const resultsRoutes=new Map(), middleware=[];
const resultsRouter={use:(...fns)=>middleware.push(...fns),
  get:(path,...fns)=>resultsRoutes.set(path,fns)};
const resultsModules={
  express:{Router:()=>resultsRouter},
  "./firebase":{db:{collection:kind=>new Query(kind)},auth:{verifyIdToken:async token=>({uid:token})}},
  "./live-lobby-core":{validId:()=>true,canJoin:p=>p?.isActive===true && p?.approvalStatus==="approved"},
  "./quiz-results-store":{ensureArchived:async()=>{},isCompleted:()=>true,round2:n=>Math.round(n*100)/100}
};
vm.runInNewContext(readFileSync(new URL("../server/quiz-results-routes.js",import.meta.url),"utf8"),{
  require:key=>resultsModules[key],module:{exports:{}},console
});
const req={get:()=>"Bearer student0"};
const res={statusCode:200,status(n){this.statusCode=n;return this;},set(){return this;},
  json(data){this.body=data;this.sent=true;return this;}};
for(const fn of [...middleware,...resultsRoutes.get("/mine")]){
  let error;await fn(req,res,e=>{error=e;});if(error)throw error;if(res.sent)break;
}
assert.equal(res.statusCode,200);
assert.equal(res.body.results.length,50);
assert.equal(res.body.totalResults,1000);
assert.equal(res.body.limited,true);
assert.equal(res.body.summary.averageAccuracy,50);
console.log("Security v1.5.7: proxy hop validation, bounded admin/quiz queries, access gates and partial-data flags PASS (mocked Firestore)");
