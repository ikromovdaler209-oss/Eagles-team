import assert from "node:assert/strict";
import {readFileSync,readdirSync,existsSync} from "node:fs";
import {createRequire} from "node:module";
import vm from "node:vm";
const require=createRequire(new URL("../server/reading-routes.js",import.meta.url));
const {cleanTest,grade,publicSections}=require("./reading-core");
const starter=require("./reading-starter");
const original=cleanTest(starter);
assert.equal(original.count,3);
assert.deepEqual(grade(original.sections,["bad",""," Every   TEN minutes "]),{correct:1,skipped:1,wrong:1,total:3,accuracy:33.3,marks:["wrong","skipped","correct"]});
assert(!JSON.stringify(publicSections(original.sections)).includes('"keys"'));
for(const type of ["multiple","truth","opinion","headings","information","features","sentence","summary","short"]){
  const q={type,prompt:"Prompt",options:["A","B"],keys:[type==="truth"?"True":type==="opinion"?"Yes":"A"]};
  const t=cleanTest({...original,sections:[{heading:"Part",passage:"Text",questions:[q]}]});
  assert.equal(grade(t.sections,q.keys).accuracy,100);
  assert.throws(()=>cleanTest({...original,sections:[{heading:"P",passage:"T",questions:[{...q,keys:[]}]}]}));
}
assert.throws(()=>cleanTest({...original,mode:"exam"}));
assert.throws(()=>cleanTest({...original,sections:[{...original.sections[0],questions:Array(41).fill(original.sections[0].questions[0])}]}));
assert.equal(cleanTest({...original,mode:"exam",minutes:60,sections:Array(3).fill(original.sections[0])}).minutes,60);

// Route-level simulation. Transactions run serially against isolated documents.
const docs=new Map(), routes=new Map();
let sequence=0;
class Ref{
  constructor(path){this.path=path;this.id=path.split("/").at(-1);}
  collection(key){return new Collection(this.path+"/"+key);}
  async get(){const data=structuredClone(docs.get(this.path));return {ref:this,id:this.id,data:()=>data,get:k=>data?.[k]};}
}
class Collection{
  constructor(path,predicate=()=>true){this.path=path;this.predicate=predicate;}
  doc(id="auto"+(++sequence)){return new Ref(this.path+"/"+id);}
  where(key,op,value){assert.equal(op,"==");return new Collection(this.path,d=>d[key]===value);}
  select(){return this;}
  async get(){const rows=[];for(const [path,d] of docs)if(path.startsWith(this.path+"/")&&!path.slice(this.path.length+1).includes("/")&&this.predicate(d))rows.push(await new Ref(path).get());return {docs:rows};}
}
const db={collection:p=>new Collection(p),getAll:(...refs)=>Promise.all(refs.map(r=>r.get())),async runTransaction(fn){
  const writes=[];const set=(r,d)=>writes.push(()=>docs.set(r.path,structuredClone(d)));
  const value=await fn({get:r=>r.get(),set,create:(r,d)=>{assert(!docs.has(r.path));set(r,d);},update:(r,d)=>writes.push(()=>Object.assign(docs.get(r.path),structuredClone(d)))});
  writes.forEach(f=>f());return value;
}};
const router={use(){},param(){}};
for(const method of ["get","put","post"])router[method]=(path,fn)=>routes.set(method+path,fn);
const mocks={express:{Router:()=>router},"express-rate-limit":()=>()=>{},"./firebase":{db},"./live-lobby-routes":{authorize(){}}};
vm.runInNewContext(readFileSync(new URL("../server/reading-routes.js",import.meta.url),"utf8"),{require:key=>mocks[key]||require(key),module:{exports:{}},console,Date});
async function call(method,path,id,uid="alice",body={}){
  let out;await routes.get(method+path)({method:method.toUpperCase(),params:{id},user:{uid},profile:{role:uid==="admin"?"admin":"student",approvalStatus:"approved",isActive:true,canCreateTests:uid==="author"},body},{json:v=>out=JSON.parse(JSON.stringify(v))});return out;
}
await assert.rejects(call("put","/manage/:id","test","alice",original),/Access denied/);
await call("put","/manage/:id","test","author",{...original,version:0});
await assert.rejects(call("get","/manage/:id","test","alice"),/Access denied/);
const start=()=>call("post","/start/:id","test");
const a=await start();assert.equal((await start()).id,a.id);assert(!JSON.stringify(a).includes('"keys"'));
await assert.rejects(call("get","/attempt/:id",a.id,"bob"),/Attempt not found/);
await call("put","/attempt/:id",a.id,"alice",{revision:0,submit:false,answers:["","False"," ten minutes "]});
await assert.rejects(call("put","/attempt/:id",a.id,"alice",{revision:0,submit:true,answers:[]}),/another tab/);
docs.get("readingAttempts/"+a.id).deadline=Date.now()-1;
const late=await call("put","/attempt/:id",a.id,"alice",{revision:1,submit:true,answers:original.sections[0].questions.map(q=>q.keys[0])});
assert.equal(late.result.correct,2);assert.equal(late.result.skipped,1);
assert.deepEqual((await call("get","/mine",null))[0],late.result);
assert.equal((await call("get","/mine",null,"bob")).length,0);
const stats=await call("get","/statistics",null,"author");assert.equal(stats.groups[0].count,1);assert(!JSON.stringify(stats).includes("alice"));assert.equal(stats.people.length,0);
assert.equal((await call("get","/statistics",null,"admin")).people[0].student,"alice");
const second=await start();assert.notEqual(second.id,a.id);
const submitted=await call("put","/attempt/:id",second.id,"alice",{submit:true,revision:0,answers:["","",""]});
assert.equal(submitted.result.skipped,3);
assert.deepEqual(await call("put","/attempt/:id",second.id,"alice",{}),submitted);
const dir=new URL("../public/",import.meta.url);
for(const page of readdirSync(dir).filter(p=>p.endsWith(".html"))){
  const html=readFileSync(new URL(page,dir),"utf8");
  assert(!/<a\b[^>]*>\s*<button\b/i.test(html),page+" has nested interactive controls");
  for(const match of html.matchAll(/(?:href|src)=["']([^"'?#]+\.(?:html|css|js))(?:[?#][^"']*)?["']/gi)){
    if(match[1].includes(":"))continue;
    assert(existsSync(new URL(match[1].replace(/^\//,""),dir)),page+" links to "+match[1]);
  }
}
console.log("Reading grading, nine question types, permissions, retry, deadline, history, statistics and internal routes: PASS (in-memory simulation)");
