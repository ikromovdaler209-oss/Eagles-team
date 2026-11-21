import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import {createRequire} from "node:module";
import vm from "node:vm";
const require=createRequire(import.meta.url);
const core=require("../server/speaking-core.js");
const uid="b".repeat(28), other="c".repeat(28), admin="a".repeat(28);
const id="29ed52ad-dff1-4348-b0d5-550ab077ce3f";
const dummyWebm=Buffer.alloc(1024);Buffer.from([0x1a,0x45,0xdf,0xa3]).copy(dummyWebm);
assert(core.validAudio(dummyWebm,"audio/webm;codecs=opus"));
assert(!core.validAudio(Buffer.alloc(1024),"audio/webm"));
assert(!core.validAudio(dummyWebm,"application/octet-stream"));
assert(!core.validAudio(Buffer.alloc(core.MAX_AUDIO_BYTES+1),"audio/webm"));
assert(core.validMeta({id,part:2,prompt:"Describe a place you like.",durationSeconds:24,consent:true}));
assert(!core.validMeta({id,part:5,prompt:"Hello world",durationSeconds:24,consent:true}));
assert(!core.validMeta({id,part:1,prompt:"A",durationSeconds:1,consent:true}));
const env={CLOUDINARY_CLOUD_NAME:"school-demo",CLOUDINARY_API_KEY:"key",CLOUDINARY_API_SECRET:"dont-store-me"};
Object.assign(process.env,env);
assert(core.privateDownloadUrl({publicId:`eagles-speaking/${uid}/${id}`,format:"webm"},env,1700000000).includes("expires_at=1700000300"));
assert(!JSON.stringify(core.publicSubmission(id,{uid,asset:{assetId:"secret"},part:1,prompt:"question",durationSeconds:12,status:"pending_review"})).includes(uid));
assert(!JSON.stringify(core.publicSubmission(id,{uid,asset:{assetId:"secret"},part:1,prompt:"question",durationSeconds:12,status:"pending_review"})).includes("assetId"));

// Upload adapter: ensure original audio stays authenticated and credentials stay server-side.
const {uploadAudio}=require("../server/speaking-storage.js");
const originalFetch=global.fetch;
global.fetch=async (url,options)=>{
  assert.match(url,/^https:\/\/api\.cloudinary\.com\/v1_1\/school-demo\/video\/upload$/);
  assert.equal(options.method,"POST");
  assert.match(options.headers.Authorization,/^Basic /);
  assert.equal(options.body.get("type"),"authenticated");
  assert.equal(options.body.get("overwrite"),"false");
  assert.equal(options.body.get("file").type,"audio/webm");
  return {ok:true,status:200,json:async()=>({type:"authenticated",public_id:`eagles-speaking/${uid}/${id}`,asset_id:"some-asset",format:"webm",bytes:1024})};
};
try {const uploaded=await uploadAudio(dummyWebm,"audio/webm",uid,id);assert.equal(uploaded.assetId,"some-asset");}
finally {global.fetch=originalFetch;}

const dbDocs=new Map();
const stored=(path)=>dbDocs.get(path);
function snap(path){const d=stored(path);return {id:path.split("/").at(-1),exists:!!d,data:()=>d,get:key=>d?.[key]};}
class Ref{constructor(path){this.path=path;}get(){return Promise.resolve(snap(this.path));}}
class Col {
  constructor(name,filters=[],order=null,cap=10000){Object.assign(this,{name,filters,order,cap});}
  doc(id){return new Ref(this.name+"/"+id);}
  where(k,op,v){return new Col(this.name,[...this.filters,[k,op,v]],this.order,this.cap);}
  orderBy(k,dir){return new Col(this.name,this.filters,[k,dir],this.cap);}
  limit(n){return new Col(this.name,this.filters,this.order,n);}
  async get(){
    const rows=[...dbDocs.keys()].filter(key=>key.startsWith(this.name+"/")&&!key.substring(this.name.length+1).includes("/"))
      .map(snap).filter(s=>this.filters.every(([key,op,v])=>op==="in"?v.includes(s.get(key)):s.get(key)===v));
    if(this.order){
      const [key,dir]=this.order;
      rows.sort((a,b)=>(a.get(key).toDate()-b.get(key).toDate())*(dir==="asc"?1:-1));
    }
    return {docs:rows.slice(0,this.cap)};
  }
}
const db={collection:name=>new Col(name),async runTransaction(cb){const writes=[];const tx={get:ref=>ref.get(),create:(ref,values)=>writes.push(["create",ref.path,values]),update:(ref,values)=>writes.push(["update",ref.path,values])};const result=await cb(tx);for(const [op,path,values] of writes){if(op==="create")assert(!dbDocs.has(path));dbDocs.set(path,{...stored(path),...values});}return result;}};
const methods=new Map();
const router={use(){},param(){}};
for(const m of ["get","post","put","patch"])router[m]=(path,...callbacks)=>methods.set(m+" "+path,callbacks.at(-1));
const mocks={
  express:{Router:()=>router,raw:()=>(_req,_res,next)=>next()},
  "express-rate-limit":()=>()=>{},
  "firebase-admin/firestore":{FieldValue:{serverTimestamp:()=>({toDate:()=>new Date("2026-11-21T10:00:00Z")})}},
  "./firebase":{db},
  "./live-lobby-routes":{authorize:()=>{}},
  "./speaking-storage":{uploadAudio:async (_bytes, _mime,who,which)=>({assetId:"external-asset",publicId:`eagles-speaking/${who}/${which}`,format:"webm",bytes:1024})},
  "./speaking-core":core
};
let source=readFileSync(new URL("../server/speaking-routes.js",import.meta.url),"utf8");
vm.runInNewContext(source,{require:path=>mocks[path]||require(path),module:{exports:{}},process:{env},console,Date,Promise,Buffer,Map,Set,Number,Object,String,Array,JSON,encodeURIComponent}, {filename:"speaking-routes.js"});
// Mount path data and auth are simulated; verify each route's independent authorization rules.
async function call(method,route,{who=uid,role="student",body={},mime="audio/webm",params={id}}={}){
  const handler=methods.get(method+" "+route);assert(handler,method+" "+route);
  const req={user:{uid:who,email:who+"@example.test"},profile:{role,approvalStatus:"approved",isActive:true,firstName:"Alex",lastName:"Student"},body,params,get:name=>name==="content-type"?mime:null};
  const res={once(){return this},statusCode:200,status(n){this.statusCode=n;return this},json(data){this.payload=data;return this}};
  let pendingError;await handler(req,res,e=>{pendingError=e;});if(pendingError)throw pendingError;
  return {status:res.statusCode,payload:res.payload};
}
let result=await call("post","/submissions",{body:{id,part:1,prompt:"Describe your home town",durationSeconds:12,consent:true}});
assert.equal(result.status,201);
assert.equal((await call("post","/submissions",{body:{id,part:1,prompt:"Describe your home town",durationSeconds:12,consent:true}})).status,201);
assert.equal((await call("post","/submissions",{who:other,body:{id,part:1,prompt:"Describe your home town",durationSeconds:12,consent:true}})).status,403);
assert.equal((await call("get","/mine",{who:other})).payload.submissions.length,0);
assert.equal((await call("get","/review-queue",{role:"student"})).status,403);
assert.equal((await call("put","/submissions/:id/audio",{body:dummyWebm,mime:"audio/webm;codecs=opus"})).status,201);
assert.equal(stored("speakingSubmissions/"+id).status,"pending_review");
assert.equal((await call("put","/submissions/:id/audio",{body:dummyWebm})).status,200);
assert.equal((await call("get","/submissions/:id/audio",{who:other})).status,403);
assert.equal((await call("post","/submissions",{body:{id,part:1,prompt:"A different prompt",durationSeconds:12,consent:true}})).status,409);
assert(!core.validMeta({id:[id],part:1,prompt:"Describe your town",durationSeconds:12,consent:true}));
const playback=await call("get","/submissions/:id/audio",{who:uid});
assert.match(playback.payload.url,/type=authenticated/);
assert.match(playback.payload.url,/expires_at=/);
assert.equal((await call("get","/review-queue",{who:admin,role:"admin"})).payload.submissions.length,1);
const criteria={fluency:6.5,lexical:7,grammar:6,pronunciation:7};
assert.equal((await call("patch","/submissions/:id/review",{body:{criteria,feedback:"Clear ideas"}})).status,403);
assert.equal((await call("patch","/submissions/:id/review",{who:admin,role:"admin",body:{criteria:{...criteria,fluency:12},feedback:"test"}})).status,400);
assert.equal((await call("patch","/submissions/:id/review",{who:admin,role:"admin",body:{criteria,feedback:"Clear ideas"}})).payload.overall,6.5);
assert.equal((await call("patch","/submissions/:id/review",{who:admin,role:"admin",body:{criteria,feedback:"revised"}})).status,409);
assert.equal((await call("get","/mine",{})).payload.submissions[0].review.overall,6.5);
assert.equal((await call("get","/review-queue",{who:admin,role:"admin"})).payload.submissions.length,0);
assert(!JSON.stringify((await call("get","/mine",{})).payload).includes("external-asset"));
stored("speakingSubmissions/"+id).audioDeletedAt=new Date();
assert.equal((await call("get","/submissions/:id/audio",{})).status,410);
const retained=(await call("get","/mine",{})).payload.submissions[0];
assert.equal(retained.audioAvailable,false);
assert.equal(retained.review.feedback,"Clear ideas");
for(let i=0;i<110;i++){
  dbDocs.set("speakingSubmissions/history-"+i,{uid,part:1,prompt:"History "+i,status:"reviewed",createdAt:{toDate:()=>new Date(2030000000000+i)}});
}
const page=(await call("get","/mine",{})).payload.submissions;
assert.equal(page.length,100);assert.equal(page[0].prompt,"History 109");
for(const file of ["speaking-recording.css","speaking-recording.js","speaking-review.html","speaking-review.css","speaking-review.js"]){assert(existsSync(new URL("../public/"+file,import.meta.url)));}
for(const html of ["speaking.html","speaking-review.html","admin.html","student-dashboard.html"]){const code=readFileSync(new URL("../public/"+html,import.meta.url),"utf8");assert(!/<a\b[^>]*>\s*<button\b/i.test(code),html);}
console.log("Speaking: formats, metadata, role guards, idempotency, upload, review, signed access and dashboard links PASS (mocked Firebase/Cloudinary)");
