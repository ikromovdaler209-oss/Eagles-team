"use strict";
const Reading = (() => {
  const root = document.querySelector("#reader"), notice = document.querySelector("#notice");
  const t = s => window.eaglesTranslate?.(s) || s;
  const el = (tag,text) => {const n = document.createElement(tag); if(text !== undefined) n.textContent = text; return n;};
  const box = cls => {const n = el("div"); n.className=cls; return n;};
  const api = (path,method="GET",body) => request("/reading"+path,{method,body:JSON.stringify(body)});
  const show = s => {notice.textContent = t(s);};
  const error = e => show(e.code === 401 ? "Authentication required" : (window.eaglesCopy?.[e.message] ? e.message : "Unable to load or save. Try again."));
  function button(label,action,cls="") {
    const b=el("button",t(label)); b.type="button"; b.className=cls;
    b.onclick=async () => {b.disabled=true;try{await action();}catch(e){error(e);}finally{b.disabled=false;}};
    return b;
  }
  const kinds = {multiple:"Multiple choice",truth:"True / False / Not Given",opinion:"Yes / No / Not Given",headings:"Matching headings",information:"Matching information",features:"Matching features",sentence:"Sentence completion",summary:"Summary completion",short:"Short answer"};
  let attempt, index=0, interval, pending, debounce, endAt, dirty=false, locked=false;
  function setURL(id) {const url=new URL(location.href);url.search="";if(id) url.searchParams.set("attempt",id);history.replaceState(null,"",url);}
  function stop(){clearInterval(interval);clearTimeout(debounce);}
  function result(r) {
    stop(); attempt=null;dirty=false;show("");root.replaceChildren();
    const card=box("paper");card.append(el("h2",r.title),el("h3",r.accuracy+"%"));
    for(const [key,value] of [["Correct",r.correct],["Incorrect",r.wrong],["Unanswered",r.skipped],["Total questions",r.total]]) card.append(el("p",t(key)+" · "+value));
    card.append(el("p",new Date(r.completed).toLocaleString(document.documentElement.lang)),button("Reading tests",()=>{setURL();return catalog();}));root.append(card);
  }
  async function save(submit=false) {
    while(pending) await pending;
    if(!attempt || locked || (!dirty && !submit)) return;
    const answers=[...attempt.answers];dirty=false;
    const work=api("/attempt/"+attempt.id,"PUT",{answers,revision:attempt.revision,submit}).then(data=>{
      if(data.result) result(data.result); else {attempt.revision=data.revision;show(dirty?"Saving…":"Saved");}
    }).catch(e=>{dirty=true;if(e.code===409){locked=true;stop();root.querySelectorAll("input,button").forEach(n=>n.disabled=true);}throw e;});
    pending=work;
    try{await work;}finally{if(pending===work)pending=null;}
  }
  function edit(value){attempt.answers[index]=value;dirty=true;show("Saving…");clearTimeout(debounce);debounce=setTimeout(()=>save().catch(error),450);updateProgress();}
  function updateProgress(){
    const total=attempt.answers.length;
    root.querySelector("#progress").textContent=attempt.answers.filter(a=>a.trim()).length+" / "+total+" · "+t("Answered");
    root.querySelectorAll(".numbers button").forEach((b,i)=>b.classList.toggle("answered",!!attempt.answers[i].trim()));
  }
  let timerBusy=false;
  async function tick(){
    if(!attempt || timerBusy)return;
    const seconds=Math.max(0,Math.ceil((endAt-performance.now())/1000));
    root.querySelector(".clock").textContent=Math.floor(seconds/60)+":"+String(seconds%60).padStart(2,"0");
    if(seconds)return;
    timerBusy=true;
    try{
      root.querySelectorAll("input,button").forEach(n=>n.disabled=true);
      if(pending)await pending;
      if(!attempt)return;
      const data=await api("/attempt/"+attempt.id);
      if(data.result)result(data.result);else openAttempt(data);
    }catch(e){error(e);await new Promise(resolve=>setTimeout(resolve,3000));}finally{timerBusy=false;}
  }
  function renderQuestion(){
    const items=attempt.sections.flatMap(s=>s.questions.map(q=>({s,q}))), {s,q}=items[index];
    const panel=root.querySelector(".question-pane"),text=root.querySelector(".text-pane");
    text.replaceChildren(el("h2",s.heading));const passage=el("div",s.passage);passage.className="passage";text.append(passage);
    panel.replaceChildren(el("p",t(kinds[q.type])),el("h2",(index+1)+". "+q.prompt));
    if(q.options.length){for(const option of q.options){const label=el("label"),input=el("input");input.type="radio";input.name="choice";input.checked=attempt.answers[index]===option;input.onchange=()=>edit(option);label.className="choice";label.append(input,document.createTextNode(option));panel.append(label);}}
    else{const label=el("label",t("Your answer")),input=el("input");input.maxLength=300;input.value=attempt.answers[index];input.oninput=()=>edit(input.value);label.append(input);panel.append(label);}
    const numbers=root.querySelector(".numbers");numbers.replaceChildren();
    items.forEach((_,i)=>{const b=button(String(i+1),()=>{index=i;renderQuestion();});if(i===index)b.setAttribute("aria-current","step");numbers.append(b);});
    updateProgress();
  }
  function openAttempt(data){
    if(data.result)return result(data.result);
    stop();attempt=data;setURL(data.id);index=0;dirty=false;locked=false;endAt=performance.now()+data.deadline-data.now;
    show("");const bar=box("bar"),clock=el("strong"),progress=el("span");clock.className="clock";progress.id="progress";bar.append(progress,clock);
    const split=box("split");split.dataset.tab="question";split.append(box("paper text-pane"),box("paper question-pane"));
    const tab=button("Passage",()=>{split.dataset.tab=split.dataset.tab==="text"?"question":"text";tab.textContent=t(split.dataset.tab==="text"?"Questions":"Passage");},"mobile-tab");
    const finish=button("Finish test",async()=>{
      if(!confirm(t("Submit this attempt?")))return;
      split.inert=true;
      try { await save(true); } finally { split.inert=false; }
    },"primary");
    root.replaceChildren(el("h2",data.title),bar,tab,split,box("numbers"),finish);
    renderQuestion();interval=setInterval(tick,500);tick();
  }
  async function catalog(){
    const data=await api("/catalog");root.replaceChildren(el("h2",t("Reading tests")));show("");
    if(data.editor)root.append(button("Manage Reading tests",()=>ReadingEditor.open()));
    for(const item of data.tests){const card=box("item");card.append(el("h3",item.title),el("p",item.count+" "+t("questions")+" · "+item.minutes+" "+t("minutes")),button("Start or resume",async()=>openAttempt(await api("/start/"+item.id,"POST",{})),"primary"));root.append(card);}
  }
  document.addEventListener("visibilitychange",()=>{
    if(document.hidden && dirty)save().catch(error);
    else if(!document.hidden && attempt)tick();
  });
  window.addEventListener("online",()=>{if(dirty)save().catch(error);});
  window.addEventListener("beforeunload",e=>{if(dirty || pending){e.preventDefault();e.returnValue="";}});
  window.addEventListener("DOMContentLoaded",async()=>{try{
    if(!window.eaglesTranslate)return;
    const query=new URLSearchParams(location.search),id=query.get("attempt");
    if(id)openAttempt(await api("/attempt/"+encodeURIComponent(id)));
    else if(query.has("stats"))await ReadingEditor.stats();
    else if(query.has("manage"))await ReadingEditor.open();else await catalog();
  }catch(e){error(e);}});
  return {root,t,el,box,button,api,show,kinds,catalog};
})();
