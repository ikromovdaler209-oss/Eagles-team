"use strict";
const LiveReading = (() => {
  const byId = id => document.getElementById(id);
  const t = value => window.eaglesTranslate?.(value) || value;
  let current;
  const status = message => { byId("readingSaveState").textContent = t(message); };
  function reset() {
    if(current) clearTimeout(current.timer);
    current = null;
  }
  async function save(state, submit) {
    if(current !== state || state.done || state.closed || state.conflict) return;
    clearTimeout(state.timer);
    while(state.pending) await state.pending.catch(()=>{});
    if(current !== state || state.done || state.closed || state.conflict || (!state.dirty && !submit)) return;
    const payload = {section:state.index,revision:state.revision,answers:[...state.answers],submit};
    state.dirty = false;
    status("Saving…");
    state.pending = request("/live-sessions/"+encodeURIComponent(state.id)+"/reading",{
      method:"POST",body:JSON.stringify(payload)
    });
    try {
      const reply = await state.pending;
      if(current !== state) return;
      state.revision = reply.revision;
      state.done = submit;
      status(submit ? "Section submitted" : state.dirty ? "Saving…" : "Saved");
    } catch(error) {
      if(current !== state)return;
      state.dirty = true;
      state.conflict = error.code === 409;
      status(state.conflict ? "Attempt changed in another tab. Reload." : "Unable to load or save. Try again.");
      if(!state.conflict && !state.closed) state.timer=setTimeout(()=>save(state,false),4000);
    } finally {
      state.pending=null;
      if(current===state) lock(state);
    }
  }
  function lock(state) {
    byId("readingFields").disabled=state.host || state.done || state.closed || state.conflict || state.submitting;
    byId("submitSection").disabled=byId("readingFields").disabled;
  }
  function render(room,draft,refresh) {
    const key=room.id+"/"+room.questionIndex;
    const section=room.question;
    if(!current || current.key!==key){
      reset();
      const state=current={key,id:room.id,index:room.questionIndex,host:room.isHost,revision:draft?.revision||0,
        answers:draft?.answers || section.questions.map(()=>""),done:!!draft?.submitted};
      byId("livePassage").textContent=section.passage;
      byId("gameQuestion").textContent=section.heading;
      const fields=byId("readingFields");
      fields.replaceChildren();
      section.questions.forEach((q,i)=>{
        const label=document.createElement("label");
        label.textContent=(i+1)+". "+q.prompt;
        const input=document.createElement(q.options.length?"select":"input");
        if(q.options.length){
          input.add(new Option(t("Choose"),""));
          for(const value of q.options)input.add(new Option(value,value));
        }else input.maxLength=300;
        input.value=state.answers[i];
        input.addEventListener("input",()=>{
          state.answers[i]=input.value;state.dirty=true;status("Saving…");
          clearTimeout(state.timer);
          state.timer=setTimeout(()=>save(state,false),400);
        });
        label.append(input);fields.append(label);
      });
      byId("submitSection").hidden=room.isHost;
      byId("submitSection").onclick=async()=>{
        state.submitting=true;lock(state);
        try {await save(state,true);await refresh();} finally {state.submitting=false;if(current===state)lock(state);}
      };
      status(state.done?"Section submitted":"");
    }
    current.closed=room.status!=="question";
    if(current.closed)status("Time is up");
    if(draft?.submitted){current.done=true;status("Section submitted");}
    lock(current);
    byId("gameProgress").textContent=t("Passage")+" "+(room.questionIndex+1)+" / "+room.sectionCount;
  }
  return {render,reset};
})();
