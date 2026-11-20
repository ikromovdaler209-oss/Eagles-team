import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/site-nav.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/site-nav.css', import.meta.url), 'utf8');
const hintSource = readFileSync(new URL('../public/site-nav-hint.js', import.meta.url), 'utf8');
const profile = readFileSync(new URL('../server/account-routes.js', import.meta.url), 'utf8');
const practice = readFileSync(new URL('../public/practice.html', import.meta.url), 'utf8');
const builder = readFileSync(new URL('../public/quiz-builder.js', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../public/admin.js', import.meta.url), 'utf8');
assert.match(css, /\.site-nav a\[href="practice\.html"\]\s*\{\s*display:\s*none/);
assert.match(css, /html:is\(\.eagles-practice-enabled, \.eagles-practice-hint\) \.site-nav/);
assert.match(hintSource, /eaglesPracticeAccessHint/);
function bootstrapHint({signedIn, cached}) {
  const classes = new Set();
  const storage = {getItem:key => key === 'eaglesPracticeAccessHint' ? (cached ? '1' : null) :
    (key === 'eaglesIdToken' && signedIn ? 'token' : null)};
  vm.runInNewContext(hintSource,{localStorage:storage,sessionStorage:{getItem:()=>null},
    document:{documentElement:{classList:{add:name=>classes.add(name)}}}});
  return classes.has('eagles-practice-hint');
}
assert.equal(bootstrapHint({signedIn:true,cached:true}),true);
assert.equal(bootstrapHint({signedIn:true,cached:false}),false);
assert.equal(bootstrapHint({signedIn:false,cached:true}),false);
for(const file of readdirSync(new URL('../public/', import.meta.url)).filter(f=>f.endsWith('.html'))){
  const html=readFileSync(new URL(`../public/${file}`,import.meta.url),'utf8');
  if(html.includes('href="site-nav.css"')){
    assert(html.includes('src="/site-nav-hint.js"'), `${file} is missing early navigation hint`);
    assert(html.indexOf('src="/site-nav-hint.js"')<html.indexOf('href="site-nav.css"'), `${file} has late navigation hint`);
  }
}
assert.match(profile, /canCreateTests:\s*p\.canCreateTests === true/);
assert.match(practice, /id="practiceBuilderCard"[^>]+hidden/);
assert.match(practice, /Live Quiz/);
assert.match(builder, /me\.profile\?\.canCreateTests === true/);
assert.match(admin, /me\.status !== "admin"/);
for (const file of ['public/site-nav.js','public/quiz-builder.js','public/admin.js','public/student-dashboard.js','server/account-routes.js']) {
  execFileSync('node', ['--check', new URL(`../${file}`, import.meta.url).pathname]);
}

async function scenario({status=null, canCreateTests=false, path='/Eagles-homepage.html', auth=true, hint=false, error=null}) {
  const classes = new Set();
  const links = [{href:'practice.html', label:'Practice'}, {href:'join.html', textContent:'Join Us', classList:{add(){},remove(){}}, setAttribute(){},removeAttribute(){},remove(){const i=links.indexOf(this);if(i!==-1)links.splice(i,1);}}];
  const attrs = {};
  const nav = {
    classList:{ contains:c=>classes.has(c), add:c=>classes.add(c), toggle:(c,v)=>v?classes.add(c):classes.delete(c) },
    querySelector:sel => sel === 'a[href="join.html"]' ? links.find(x=>x.href==='join.html') : null,
    insertBefore(link, before) { links.splice(before?links.indexOf(before):links.length,0,link); }
  };
  const button = {setAttribute(k,v){attrs[k]=v},getAttribute:k=>attrs[k]||'false',addEventListener(){},focus(){}};
  const gateMessage = {hidden:false,textContent:'Checking account access...'};
  const builderCard = {hidden:true};
  let redirect=null;
  const context={
    document:{
      documentElement:{classList:{add:c=>classes.add(c),remove:(...items)=>items.forEach(c=>classes.delete(c))}},
      getElementById:id=>({mainNav:nav,practiceGate:gateMessage,practiceBuilderCard:builderCard})[id]??null,
      querySelector:sel=>sel==='.site-toggle'?button:sel==='.site-header'?{after(){}}:null,
      createElement:tag=>({tag,href:'',textContent:'',setAttribute(){},remove(){const i=links.indexOf(this);if(i!==-1)links.splice(i,1);}}),
      addEventListener(){},head:{appendChild(){throw new Error('Session script should already be available in VM')}}
    },
    matchMedia:()=>({addEventListener(){}}),
    sessionStorage:{getItem:()=>null},
    localStorage:{getItem:key=>key==='eaglesPracticeAccessHint'?(hint?'1':null):(auth?'token':null)},
    location:{pathname:path,replace:to=>{redirect=to}},
    request:async()=>{if(error)throw error;return {status,profile:{canCreateTests}}},
    window:{eaglesTranslate:txt=>txt}
  };
  vm.runInNewContext(source,context);
  const initialLink = {href:links[1].href, textContent:links[1].textContent};
  const navReadyImmediately = classes.has('account-nav-ready');
  await new Promise(resolve=>setImmediate(resolve));
  return {classes,links,redirect,gateMessage,builderCard,initialLink,navReadyImmediately};
}

let r=await scenario({auth:false});
assert.equal(r.classes.has('eagles-practice-enabled'),false);
assert.deepEqual(r.initialLink,{href:'join.html',textContent:'Join Us'});
assert.equal(r.navReadyImmediately,true);
assert.deepEqual(r.links.map(x=>x.href),['practice.html','join.html']); // CSS hides Practice by default
r=await scenario({auth:false,path:'/practice.html'});
assert.equal(r.redirect,'/account.html');
r=await scenario({status:'approved'});
assert.deepEqual(r.initialLink,{href:'/account.html',textContent:'My account'}); // No guest label flash while request is in flight.
assert.equal(r.navReadyImmediately,true);
assert.equal(r.classes.has('eagles-practice-enabled'),true);
assert.ok(r.links.some(x=>x.href==='/student-dashboard.html' && x.textContent==='My account'));
assert.ok(!r.links.some(x=>x.href==='join.html'));
r=await scenario({status:'approved',hint:true});
assert.equal(r.classes.has('eagles-practice-hint'),true); // Visible before async /api/me response.
r=await scenario({status:'admin',path:'/practice.html'});
assert.equal(r.redirect,null);
assert.ok(r.links.some(x=>x.href==='/admin.html' && x.textContent==='My account'));
assert.equal(r.builderCard.hidden,false);
r=await scenario({status:'approved',canCreateTests:false,path:'/practice.html'});
assert.equal(r.builderCard.hidden,true);
r=await scenario({status:'approved',canCreateTests:true,path:'/practice.html'});
assert.equal(r.builderCard.hidden,false);
r=await scenario({status:'pending',path:'/practice.html'});
assert.equal(r.redirect,'/student-dashboard.html');
assert.equal(r.classes.has('eagles-practice-enabled'),false);
r=await scenario({status:'approved',path:'/practice.html',error:Object.assign(new Error('Service unavailable'),{code:503})});
assert.equal(r.redirect,null);
assert.match(r.gateMessage.textContent,/refresh/i);
assert.equal(r.classes.has('eagles-practice-enabled'),false);
assert.deepEqual(r.initialLink,{href:'/account.html',textContent:'My account'});
assert.ok(r.links.some(x=>x.href==='/account.html' && x.textContent==='My account'));
r=await scenario({status:'approved',error:Object.assign(new Error('Invalid session'),{code:401})});
assert.ok(r.links.some(x=>x.href==='join.html' && x.textContent==='Join Us'));
console.log('Role spaces: navigation, permissions, gates, and syntax checks PASS (mocked API).');
