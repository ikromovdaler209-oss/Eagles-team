"use strict";
const ReadingEditor=(()=>{
  const {root,t,el,box,button,api,show,kinds}=Reading;
  const section=()=>({heading:"",passage:"",questions:[]});
  const question=()=>({type:"multiple",prompt:"",options:[],keys:[]});
  let model,id;
  function field(name,node){const label=el("label",t(name));label.append(node);return label;}
  function input(value,change,multi=false){const n=el(multi?"textarea":"input");n.value=value;n.oninput=()=>change(n.value);return n;}
  function select(values,value,change){const n=el("select");for(const [k,v] of Object.entries(values)){const o=el("option",t(v));o.value=k;n.append(o);}n.value=value;n.onchange=()=>change(n.value);return n;}
  function multi(value,change){return input(value.join("\n"),v=>change(v.split("\n").map(x=>x.trim()).filter(Boolean)),true);}
  function questionForm(s,q,i){
    const card=el("fieldset");card.append(el("legend",t("Question")+" "+(i+1)));
    card.append(field("Question type",select(kinds,q.type,v=>{q.type=v;q.options=[];q.keys=[];draw();})),
      field("Question",input(q.prompt,v=>q.prompt=v,true)));
    const fixed=q.type==="truth"?["True","False","Not Given"]:q.type==="opinion"?["Yes","No","Not Given"]:null;
    const textType=["short","summary","sentence"].includes(q.type);
    if(fixed)card.append(field("Correct answer",select(Object.fromEntries([["","Choose"],...fixed.map(v=>[v,v])]),q.keys[0]||"",v=>q.keys=v?[v]:[])));
    else{
      if(!textType)card.append(field("Options, one per line",multi(q.options,v=>q.options=v)));
      card.append(field(textType?"Accepted answers, one per line":"Correct answer",textType?multi(q.keys,v=>q.keys=v):input(q.keys[0]||"",v=>q.keys=v?[v]:[])));
    }
    card.append(button("Remove question",()=>{if(confirm(t("Remove question?"))){s.questions.splice(i,1);draw();}}));return card;
  }
  function preview(){
    root.replaceChildren(el("h2",model.title),button("Return to editor",draw));
    for(const s of model.sections){
      const card=box("paper");card.append(el("h3",s.heading));const p=el("div",s.passage);p.className="passage";card.append(p);
      for(const q of s.questions){const fixed=q.type==="truth"?["True","False","Not Given"]:q.type==="opinion"?["Yes","No","Not Given"]:q.options;
        card.append(el("h4",q.prompt),el("p",fixed.join(" · ")),el("p",t("Correct answer")+" · "+q.keys.join(" / ")));}
      root.append(card);
    }
  }
  async function persist(status){
    const r=await api("/manage/"+id,"PUT",{...model,status});model.version=r.version;model.status=status;show("Saved");draw();
  }
  function draw(){
    root.replaceChildren(el("h2",t("Reading editor")),field("Title",input(model.title,v=>model.title=v)),
      field("Mode",select({practice:"Short practice",exam:"Academic exam"},model.mode,v=>{model.mode=v;if(v==="exam")model.minutes=60;draw();})));
    const minutes=input(model.minutes,v=>model.minutes=Number(v));minutes.type="number";minutes.min=1;minutes.max=60;minutes.disabled=model.mode==="exam";
    root.append(field("Minutes",minutes));
    model.sections.forEach((s,i)=>{
      const card=box("paper");card.append(el("h3",t("Passage")+" "+(i+1)),field("Passage title",input(s.heading,v=>s.heading=v)),field("Passage",input(s.passage,v=>s.passage=v,true)));
      s.questions.forEach((q,j)=>card.append(questionForm(s,q,j)));
      card.append(button("Add question",()=>{s.questions.push(question());draw();}),button("Remove passage",()=>{if(confirm(t("Remove passage?"))){model.sections.splice(i,1);draw();}}));root.append(card);
    });
    const actions=box("row");if(model.sections.length<3)actions.append(button("Add passage",()=>{model.sections.push(section());draw();}));
    actions.append(button("Preview",preview),button("Save draft",()=>persist("draft")),button("Publish",()=>persist("published"),"primary"),button("Reading tests",()=>{if(confirm(t("Leave the editor?")))return open();}));root.append(actions);
  }
  async function open(){
    const rows=await api("/manage");show("");root.replaceChildren(el("h2",t("Manage Reading tests")+" · "+rows.length));
    const bar=box("row");bar.append(button("New Reading test",()=>{id=crypto.randomUUID();model={title:"",minutes:10,mode:"practice",sections:[section()],version:0};draw();},"primary"),button("Reading statistics",stats),button("Reading tests",Reading.catalog));root.append(bar);
    for(const r of rows){const card=box("item");card.append(el("h3",r.title),el("p",t(r.status)),button("Edit",async()=>{model=await api("/manage/"+r.id);id=r.id;draw();}));root.append(card);}
  }
  async function stats(){
    const {groups,people}=await api("/statistics");root.replaceChildren(el("h2",t("Reading statistics")),button("Manage Reading tests",open));
    if(!groups.length)root.append(el("p",t("No test results yet.")));
    for(const g of groups){const card=box("paper");card.append(el("h3",g.title+" · v"+g.version),el("p",t("Attempts")+" · "+g.count));
      if(g.privacyLimited){card.append(el("p",t("Statistics appear after three different students complete this test.")));root.append(card);continue;}
      card.append(el("p",t("Average")+" "+g.average+"%"));
      const list=el("ul");
      const ranked=g.misses.map((n,i)=>({n,i})).sort((a,b)=>b.n-a.n);
      for(const {n,i} of ranked) list.append(el("li",(i+1)+". "+g.prompts[i]+" · "+t("Missed or incorrect")+" "+n+"/"+g.count+" ("+Math.round(100*n/g.count)+"%)"));card.append(list);root.append(card);}
    for(const r of people)root.append(el("p",r.student+" · "+r.title+" · "+r.correct+"/"+r.total+" · "+r.accuracy+"% · "+new Date(r.completed).toLocaleDateString()));
  }
  return {open,stats};
})();
