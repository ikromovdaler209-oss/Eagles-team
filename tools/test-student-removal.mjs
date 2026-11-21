import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const profiles = new Map();
const routes = {};
const router = {use() {}};
for (const method of ["get","post","patch","delete"]) {
  router[method] = (path,...handlers) => { routes[method+path] = handlers; };
}
function snap(id) {
  return {id,exists:profiles.has(id),data:()=>profiles.get(id),get:key=>profiles.get(id)?.[key]};
}
const db = {
  collection:()=>({
    doc:id=>({id,get:async()=>snap(id)}),
    where:()=>({get:async()=>({docs:[...profiles.keys()].filter(id=>profiles.get(id).role==="student").map(snap)})})
  }),
  runTransaction:fn=>fn({get:ref=>ref.get(),update:(ref,fields)=>Object.assign(profiles.get(ref.id),fields)})
};
const dependencies = {
  express:{Router:()=>router},
  "./firebase":{db,auth:{verifyIdToken:async uid=>({uid})}},
  "firebase-admin/firestore":{FieldValue:{serverTimestamp:()=>12345}}
};
vm.runInNewContext(readFileSync(new URL("../server/account-routes.js",import.meta.url),"utf8"),{
  require:key=>dependencies[key],module:{exports:{}},console
});
const active={approvalStatus:"approved",isActive:true};
profiles.set("staff",{...active,role:"admin"});
profiles.set("otherAdmin",{...active,role:"admin"});
profiles.set("grad",{...active,role:"student",canCreateTests:true,canWriteReviews:true});
async function call(method,uid,target,body={}) {
  const path="/admin/students"+(target?"/:uid":"");
  const req={method:method.toUpperCase(),params:{uid:target},get:()=>"Bearer "+uid,body};
  const res={code:200,status(code){this.code=code;return this;},json(data){this.body=data;}};
  for(const handler of routes[method+path]){
    let proceed=false;
    await handler(req,res,error=>{if(error)throw error;proceed=true;});
    if(!proceed)break;
  }
  return res;
}
assert.equal((await call("delete","grad","grad")).code,403);
assert.equal((await call("delete","staff","otherAdmin")).code,403);
assert.equal((await call("get","staff")).body.students.length,1);
assert.equal((await call("delete","staff","grad")).code,200);
assert.equal((await call("delete","staff","grad")).code,200);
assert.equal((await call("patch","staff","grad",{isActive:true})).code,404);
assert.equal((await call("get","staff")).body.students.length,0);
assert.equal(profiles.get("grad").isActive,false);
assert.equal(profiles.get("grad").canCreateTests,false);
assert.equal(profiles.get("grad").canWriteReviews,false);
console.log("Student removal: admin permissions, repeat removal, roster and stale updates PASS (mocked API)");
