import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../public/speaking-recording.js",import.meta.url),"utf8");
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function screen(supported=true) {
  const elements=new Map(), calls=[], lifecycle={}, tracks=[];
  let grant, prompts=0, now=0, recorder;
  function element(id) {
    if(!elements.has(id))elements.set(id,{
      hidden:true, listeners:{},classList:{add(){},remove(){}},
      addEventListener(event,fn){this.listeners[event]=fn;},
      querySelector(){return {textContent:"Describe your town"};},
      removeAttribute(){},load(){},replaceChildren(){}
    });
    return elements.get(id);
  }
  class Recorder {
    static isTypeSupported(type){return type==="audio/mp4";}
    constructor(){recorder=this;this.mimeType="audio/mp4";}
    start(){this.state="recording";}
    stop(){this.state="inactive";this.ondataavailable({data:new Blob(["a".repeat(128)])});this.onstop?.();}
  }
  const window={isSecureContext:true,MediaRecorder:supported?Recorder:null,addEventListener:(e,fn)=>lifecycle[e]=fn};
  const navigator={mediaDevices:{getUserMedia(){prompts++;return new Promise(resolve=>grant=()=>{
    const track={stopped:false,stop(){this.stopped=true;}};tracks.push(track);resolve({getTracks:()=>[track]});
  });}}};
  const request=async(path,opts)=>{calls.push({path,opts});return path==="/me"?{status:"approved"}:{recordingAvailable:true,submissions:[]};};
  vm.runInNewContext(source,{window,document:{getElementById:element,querySelectorAll:()=>[]},navigator,MediaRecorder:Recorder,
    Blob,URL,Date:{now:()=>now},setInterval:()=>1,clearInterval(){},request,crypto:{randomUUID:()=>"test-id"}});
  const click=id=>element(id).listeners.click();
  return {element,click,calls,lifecycle,tracks,get prompts(){return prompts;},grant:()=>grant(),
    finish:()=>{now+=5000;recorder.stop();}};
}
const ui=screen();
await tick();
ui.click("btn10");
const pending=ui.click("startRecording");
await ui.click("startRecording");
assert.equal(ui.prompts,1);assert.equal(ui.element("btn10").disabled,true);
ui.grant();await pending;ui.finish();
assert(ui.tracks[0].stopped);assert.equal(ui.element("recordingPreview").hidden,false);
assert(ui.element("startRecording").disabled);await ui.click("submitRecording");
assert(!ui.calls.some(x=>x.opts?.method==="POST"));
ui.element("speakingConsent").checked=true;ui.click("discardRecording");
assert.equal(ui.element("speakingConsent").checked,false);
const second=ui.click("startRecording");ui.grant();await second;ui.finish();
ui.element("speakingConsent").checked=true;await ui.click("submitRecording");
assert.deepEqual(ui.calls.filter(x=>x.opts).map(x=>x.opts.method),["POST","PUT"]);
const interrupted=ui.click("startRecording");ui.lifecycle.pagehide();ui.grant();await interrupted;
assert(ui.tracks.at(-1).stopped);
const unsupported=screen(false);await tick();
assert(unsupported.calls.some(x=>x.path==="/speaking/mine"));
console.log("Speaking controls PASS (simulated permission, MP4 recorder, consent, reset, upload, navigation and history)");
