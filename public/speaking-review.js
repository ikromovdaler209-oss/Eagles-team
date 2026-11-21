"use strict";
(() => {
  const $=id=>document.getElementById(id);
  const state=$("speakingQueueState"), list=$("speakingQueueList"), workspace=$("speakingReviewWorkspace");
  function node(tag, cls, text) {const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;}
  const fields=[
    ["fluency","Fluency & Coherence"], ["lexical","Lexical Resource"],
    ["grammar","Grammatical Range & Accuracy"], ["pronunciation","Pronunciation"]
  ];
  function entryCard(entry) {
    const card=node("article","speaking-review-card");
    const header=node("div","speaking-review-card-header");
    const copy=node("div");copy.append(node("h2","",entry.studentName||"Student"),node("p","speaking-review-meta",`${entry.studentEmail||""} · Part ${entry.part} · ${entry.durationSeconds}s · ${entry.createdAt?new Date(entry.createdAt).toLocaleDateString("en"):""}`));
    header.append(copy,node("span","speaking-review-note","Awaiting assessment"));card.append(header,node("p","speaking-review-prompt",entry.prompt));
    const listen=node("button","speaking-review-btn","Listen to recording");listen.type="button";
    const audio=node("audio","speaking-review-audio");audio.controls=true;audio.preload="none";audio.hidden=true;
    listen.addEventListener("click",async()=>{
      listen.disabled=true;
      try {const {url}=await request(`/speaking/submissions/${encodeURIComponent(entry.id)}/audio`);audio.src=url;audio.hidden=false;audio.load();}
      catch(e){state.textContent=e.message||"Unable to play recording";}
      finally {listen.disabled=false;}
    });card.append(listen,audio);
    const form=node("form","speaking-review-form");
    const grid=node("div","speaking-review-criteria");
    const controls={};
    for(const [key,title] of fields) {
      const label=node("label","",title);
      const select=node("select");select.name=key;select.required=true;
      const placeholder=node("option","","Select a band");placeholder.value="";select.append(placeholder);
      for(let band=0;band<=9;band+=.5){const opt=node("option","",String(band));opt.value=String(band);select.append(opt);}
      label.append(select);grid.append(label);controls[key]=select;
    }
    const label=node("label","","Teacher feedback");
    const textarea=node("textarea");textarea.name="feedback";textarea.maxLength=2000;textarea.placeholder="What went well? What should the student improve?";
    label.append(textarea);
    const note=node("p","speaking-review-note","Practice estimate only, not an official IELTS score. Each criterion is 0–9, in 0.5 increments.");
    const row=node("div","speaking-review-action-row");
    const send=node("button","speaking-review-btn primary","Submit review");send.type="submit";
    const status=node("span","speaking-review-status","");status.setAttribute("role","status");
    row.append(send,status);form.append(grid,label,note,row);card.append(form);
    form.addEventListener("submit",async event=>{
      event.preventDefault();send.disabled=true;status.textContent="Saving review…";
      const criteria=Object.fromEntries(Object.entries(controls).map(([key,input])=>[key,Number(input.value)]));
      try {
        if(Object.values(controls).some(input=>input.value==="")){status.textContent="Select all four criteria.";return;}
        await request(`/speaking/submissions/${encodeURIComponent(entry.id)}/review`,{method:"PATCH",body:JSON.stringify({criteria,feedback:textarea.value})});
        status.textContent="Review saved.";
        await load();
      } catch(e){status.textContent=e.message||"Unable to save review.";}
      finally{send.disabled=false;}
    });
    return card;
  }
  async function load() {
    state.textContent="Loading pending submissions…";
    try {
      const {submissions=[]}=await request("/speaking/review-queue");
      list.replaceChildren(...submissions.map(entryCard));
      $("speakingQueueCount").textContent=String(submissions.length);
      state.textContent=submissions.length?"":"No pending Speaking answers.";
    }catch(e){state.textContent=e.message||"Unable to load reviews.";}
  }
  $("refreshSpeakingQueue").addEventListener("click",load);
  (async()=>{
    try {
      const me=await request("/me");
      if(me.status!=="admin"){location.replace(me.status==="approved"?"/student-dashboard.html":"/account.html");return;}
      workspace.hidden=false;await load();
    } catch(e){ if(e.code===401)location.replace("/account.html"); else state.textContent=e.message||"Admin access unavailable"; }
  })();
})();
