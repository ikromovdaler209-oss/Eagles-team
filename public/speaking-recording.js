"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const t = text => typeof window.eaglesTranslate === "function" ? window.eaglesTranslate(text) : text;
  const record = $("startRecording"), stop = $("stopRecording"), discard = $("discardRecording");
  const submit = $("submitRecording"), preview = $("recordingPreview"), status = $("speakingStatus");
  const consent=$("speakingConsent");
  const pick = $("btn10"), radios = Array.from(document.querySelectorAll('input[name="part"]'));
  const mic = $("micState"), micLabel = $("micLabel"), clock = $("recordClock");
  let recorder, stream, chunks=[], audioBlob=null, blobUrl=null, currentPrompt="", currentPart=1;
  let started=0, durationSeconds=0, timer=null, loading=false, accessible=false, storageReady=false;
  let submissionId=null, recordingBusy=false, micGeneration=0;
  const MAX_SECONDS=180, MAX_BYTES=12*1024*1024;
  const time = n => `${String(Math.floor(n/60)).padStart(2,"0")}:${String(n%60).padStart(2,"0")}`;
  const setStatus = message => {status.textContent=t(message);};
  function releaseMic() {
    clearInterval(timer); timer=null;
    if(stream){stream.getTracks().forEach(track=>track.stop());stream=null;}
    mic.classList.remove("is-live"); micLabel.textContent=t("Ready to record");
  }
  function update() {
    const recording=recorder?.state==="recording";
    record.disabled=!accessible||!currentPrompt||recordingBusy||!!audioBlob||loading;
    stop.disabled=!recording;
    discard.disabled=!audioBlob||recording||loading;
    submit.disabled=!audioBlob||recording||loading||!storageReady||!consent.checked;
    pick.disabled=recordingBusy||!!audioBlob||loading;
    radios.forEach(r=>{r.disabled=recordingBusy||!!audioBlob||loading;});
  }
  function resetAudio() {
    audioBlob=null;durationSeconds=0;submissionId=null;consent.checked=false;
    if(blobUrl) URL.revokeObjectURL(blobUrl);
    blobUrl=null;preview.removeAttribute("src");preview.load();preview.hidden=true;
    clock.textContent=`00:00 / ${time(MAX_SECONDS)}`;
    update();
  }
  function mimeOption() {
    if(!window.MediaRecorder)return null;
    return ["audio/webm;codecs=opus","audio/mp4","audio/webm","audio/ogg;codecs=opus","audio/ogg"]
      .find(type=>MediaRecorder.isTypeSupported(type))||null;
  }
  function listenForPrompt() {
    const original=$("box10").querySelector('[lang="en"]');
    currentPrompt=(original?.textContent||"").trim();
    currentPart=Number(radios.find(r=>r.checked)?.id?.replace("radio", ""))||1;
    resetAudio();
    if(currentPrompt)setStatus("Question ready. Press Record when you are ready.");
  }
  pick.addEventListener("click",listenForPrompt);
  radios.forEach(r=>r.addEventListener("change",()=>{if(!audioBlob) {currentPrompt="";update();}}));
  record.addEventListener("click",async()=>{
    if(record.disabled || recordingBusy)return;
    const mime=mimeOption();
    if(!mime){setStatus("Your browser does not support audio recording. Try Safari or Chrome with HTTPS.");return;}
    const generation=++micGeneration;
    recordingBusy=true;update();
    try {
      const acquired=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
      if(generation!==micGeneration){acquired.getTracks().forEach(track=>track.stop());return;}
      stream=acquired;
      recorder=new MediaRecorder(stream,{mimeType:mime,audioBitsPerSecond:64000});
      chunks=[];
      recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
      recorder.onerror=()=>{recorder.onstop=null;recordingBusy=false;setStatus("Microphone recording failed. Try again.");releaseMic();update();};
      recorder.onstop=()=>{
        const seconds=Math.round((Date.now()-started)/1000);
        recordingBusy=false;releaseMic();
        durationSeconds=Math.min(MAX_SECONDS,seconds);
        const result=new Blob(chunks,{type:recorder.mimeType});
        chunks=[];
        if(seconds<2 || result.size<100){setStatus("Record at least two seconds before submitting.");resetAudio();return;}
        if(result.size>MAX_BYTES){setStatus("Recording is too large (maximum 12 MB). Record again.");resetAudio();return;}
        audioBlob=result;
        blobUrl=URL.createObjectURL(result);
        preview.src=blobUrl;preview.hidden=false;
        clock.textContent=`${time(durationSeconds)} / ${time(MAX_SECONDS)}`;
        setStatus(storageReady?"Listen to your answer, then send it for review.":"Recording ready. Sending is unavailable until audio storage is configured.");
        update();
      };
      recorder.start(1000);started=Date.now();
      mic.classList.add("is-live");micLabel.textContent=t("Recording in progress");
      timer=setInterval(()=>{
        const elapsed=Math.min(MAX_SECONDS,Math.floor((Date.now()-started)/1000));
        clock.textContent=`${time(elapsed)} / ${time(MAX_SECONDS)}`;
        if(elapsed>=MAX_SECONDS&&recorder?.state==="recording")recorder.stop();
      },250);
      setStatus("Recording… Your microphone is active.");update();
    } catch(err) {
      if(generation!==micGeneration)return;
      recordingBusy=false;releaseMic();
      setStatus(err?.name==="NotAllowedError"?"Microphone permission denied. Allow microphone access in your browser settings.":"Unable to access the microphone. Check HTTPS and microphone permissions.");
      update();
    }
  });
  stop.addEventListener("click",()=>{if(recorder?.state==="recording")recorder.stop();});
  discard.addEventListener("click",()=>{resetAudio();setStatus("Recording discarded. You can record again or choose a different question.");});
  consent.addEventListener("change",update);
  submit.addEventListener("click",async()=>{
    if(!audioBlob||!storageReady||loading||!consent.checked)return;
    loading=true;update();setStatus("Uploading your answer securely…");
    try {
      submissionId ||= crypto.randomUUID();
      await request("/speaking/submissions",{method:"POST",body:JSON.stringify({id:submissionId,part:currentPart,prompt:currentPrompt,durationSeconds,consent:true})});
      await request(`/speaking/submissions/${encodeURIComponent(submissionId)}/audio`,{
        method:"PUT",body:audioBlob,headers:{"Content-Type":audioBlob.type.split(";")[0]}
      });
      resetAudio();
      setStatus("Answer submitted. Your recording is awaiting review.");
      await history();
    } catch(err) {
      setStatus(err.message||"Unable to send your answer. Try again.");
    } finally{loading=false;update();}
  });
  function block(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;e.textContent=text;return e;}
  async function history() {
    const message=$("speakingHistoryState"), list=$("speakingHistoryList");
    message.textContent=t("Loading speaking answers...");
    try {
      const {submissions=[]}=await request("/speaking/mine");
      list.replaceChildren();
      for(const row of submissions){
        const item=block("article","speaking-history-item","");
        const head=block("div","speaking-history-item-head","");
        head.append(block("strong","",`Part ${row.part} · ${row.prompt}`),block("span","speaking-status-chip"+(row.status==="reviewed"?" reviewed":""),t(row.status==="reviewed"?"Reviewed":"Pending review")));
        item.append(head,block("p","",`${row.durationSeconds}s · ${row.createdAt?new Date(row.createdAt).toLocaleDateString(document.documentElement.lang):""}`));
        if(row.review){
          const c=row.review.criteria;
          item.append(block("p","",`${t("Practice band estimate")}: ${row.review.overall} · Fluency ${c.fluency} · Vocabulary ${c.lexical} · Grammar ${c.grammar} · Pronunciation ${c.pronunciation}`));
          if(row.review.feedback)item.append(block("p","speaking-feedback",row.review.feedback));
        }
        if(row.audioAvailable===false){item.append(block("p","",t("Audio is no longer available")));list.append(item);continue;}
        const play=block("button","speaking-btn speaking-subtle",t("Listen to answer"));play.type="button";
        const player=document.createElement("audio");player.controls=true;player.hidden=true;player.preload="none";
        play.addEventListener("click",async()=>{
          play.disabled=true;
          try {const {url}=await request(`/speaking/submissions/${encodeURIComponent(row.id)}/audio`);player.src=url;player.hidden=false;player.load();}
          catch(err){message.textContent=err.message||t("Unable to play recording");}
          finally{play.disabled=false;}
        });
        item.append(play,player);list.append(item);
      }
      message.textContent=submissions.length?"":t("No speaking answers submitted yet.");
    }catch(err){message.textContent=err.message||t("Unable to load speaking answers.");}
  }
  $("reloadSpeakingHistory").addEventListener("click",history);
  window.addEventListener("beforeunload",event=>{
    if(recordingBusy||audioBlob||loading){event.preventDefault();event.returnValue="";}
  });
  window.addEventListener("pagehide",()=>{
    micGeneration++;
    if(recorder){recorder.onstop=null;if(recorder.state==="recording")recorder.stop();}
    recordingBusy=false;releaseMic();update();
  });
  async function init(){
    $("speakingRecorder").hidden=false;
    try {
      const me=await request("/me");
      if(me.status!=="approved"){setStatus("Approved student account required to record answers.");return;}
      $("speakingHistory").hidden=false;
      await history();
      if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){setStatus("Microphone requires HTTPS and a supported browser.");return;}
      if(!mimeOption()){setStatus("This browser cannot record audio in a supported format.");return;}
      accessible=true;
      $("speakingRecorder").hidden=false;
      const config=await request("/speaking/config");
      storageReady=config.recordingAvailable===true;
      setStatus(storageReady?"Choose a question and record your answer.":"Recording preview is available, but sending requires audio storage setup.");
    } catch(err) {setStatus(err.message||"Unable to check account access.");$("speakingRecorder").hidden=false;}
    finally {update();}
  }
  init();
})();
