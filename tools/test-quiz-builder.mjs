import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const route = readFileSync(new URL('../server/quiz-routes.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/quiz-builder.html', import.meta.url), 'utf8');
const client = readFileSync(new URL('../public/quiz-builder.js', import.meta.url), 'utf8');
assert.match(route, /canCreateTests !== true/);
assert.match(route, /verifyIdToken\(token, true\)/);
assert.match(route, /\[25, 30\]/);
assert.match(route, /q\.options\.length !== 4/);
assert.match(route, /correctOption < 0 \|\| q\.correctOption > 3/);
assert.match(route, /runTransaction/);
assert.match(html, /account-session\.js/);
assert.match(client, /request\("\/quizzes"\)/);
assert.doesNotMatch(client, /innerHTML\s*=/);
for (const file of ['server/quiz-routes.js','server/server.js','public/quiz-builder.js']) execFileSync('node',['--check',new URL('../'+file,import.meta.url).pathname]);
console.log('Quiz Builder static checks: PASS (not an integration test)');

// Exercise the actual middleware and published-create handler with in-memory services.
const {default:vm}=await import("node:vm");
const {createRequire}=await import("node:module");
const require=createRequire(new URL("../server/quiz-routes.js",import.meta.url));
const profiles={admin:{role:"admin"},teacher:{role:"student",canCreateTests:true},student:{role:"student"}};
const writes=[], middlewares=[], handlers=new Map();
const router={use(...fn){middlewares.push(...fn);},param(){}};
for(const method of ["get","post","put","delete"])router[method]=(path,fn)=>handlers.set(method+path,fn);
const db={collection(name){return name==="users"?{doc:uid=>({get:async()=>({data:()=>({...profiles[uid],isActive:true,approvalStatus:"approved"})})})}
  :{add:async data=>{writes.push(data);return{id:"test"};}};}};
const mocks={express:{Router:()=>router},"./firebase":{db,auth:{verifyIdToken:async(uid,revoked)=>{assert.equal(revoked,true);return{uid};}}},
  "firebase-admin/firestore":{FieldValue:{serverTimestamp:()=>123}}};
vm.runInNewContext(route,{require:id=>mocks[id]||require(id),module:{exports:{}},console});
async function create(uid,body) {
  const req={body,get:()=>"Bearer "+uid},res={statusCode:200,set(){},status(n){this.statusCode=n;return this;},json(v){this.body=v;}};
  for(const middleware of middlewares){
    let proceed=false;await middleware(req,res,err=>{if(err)throw err;proceed=true;});if(!proceed)return res;
  }
  await handlers.get("post/")(req,res,err=>{throw err;});return res;
}
const published={title:"Classwork",description:"",status:"published",questions:[{text:"Select A",options:["A","B","C","D"],correctOption:0,timeLimit:30}]};
for(const uid of ["admin","teacher"])assert.equal((await create(uid,published)).statusCode,201);
assert.equal((await create("student",published)).statusCode,403);
assert.equal((await create("teacher",{...published,questions:[]})).statusCode,400);
assert.deepEqual(writes.map(test=>test.creatorUid),["admin","teacher"]);
console.log("Quiz publication and creation permissions PASS (real route handlers, mocked authentication and database)");
