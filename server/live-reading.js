"use strict";
const {Timestamp, FieldValue} = require("firebase-admin/firestore");
const {grade, publicSections} = require("./reading-core");
const starter = require("./reading-starter");
const {ensureArchived} = require("./quiz-results-store");

const starterId = "shade-experiment";
function roundUpdate(test,index,now) {
  const seconds = test.minutes * 60;
  // Equal shares; the rounded boundaries still add up to the published duration.
  const duration = Math.floor(seconds*(index+1)/test.sections.length) - Math.floor(seconds*index/test.sections.length);
  const [section] = publicSections([test.sections[index]]);
  return {status:"question", currentQuestionIndex:index, currentQuestion:section,
    questionStartedAt:Timestamp.fromMillis(now), questionEndsAt:Timestamp.fromMillis(now+duration*1000)};
}
function advance(tx,ref,room,test,now) {
  const next = room.get("currentQuestionIndex")+1;
  if (next === test.sections.length) {
    tx.update(ref,{status:"finished",finishedAt:FieldValue.serverTimestamp()});
    return {ok:true,finished:true};
  }
  tx.update(ref,roundUpdate(test,next,now));
  return {ok:true,finished:false};
}
async function ifComplete(db,ref,index,players) {
  const snap = await ref.collection("readingSubmissions").where("section","==",index).count().get();
  if (!players || snap.data().count !== players) return false;
  const changed = await db.runTransaction(async tx=>{
    const room=await tx.get(ref);
    if(room.get("mode")!=="reading" || room.get("status")!=="question" || room.get("currentQuestionIndex")!==index)return null;
    const test=(await tx.get(ref.collection("private").doc("quiz"))).data();
    return advance(tx,ref,room,test,Date.now());
  });
  if(changed?.finished) await ensureArchived(db,ref.id);
  return !!changed;
}
async function save(db,ref,uid,body) {
  const {section,answers,submit,revision}=body || {};
  if(!Number.isInteger(section)||section<0||section>2||!Array.isArray(answers)||answers.length>40||
    typeof submit!=="boolean"||!Number.isInteger(revision)||revision<0)return {status:400,error:"Invalid answers"};
  const memberRef=ref.collection("participants").doc(uid);
  const outcome=await db.runTransaction(async tx=>{
    const [room,member,testDoc]=await Promise.all([tx.get(ref),tx.get(memberRef),tx.get(ref.collection("private").doc("quiz"))]);
    if(!member.exists||room.get("hostUid")===uid)return {status:403,error:"Access denied"};
    if(room.get("mode")!=="reading")return {status:409,error:"Question is closed"};
    const previous=member.get("readingDraft");
    if(previous?.section===section && previous.submitted && submit)
      return {revision:previous.revision,players:room.get("currentQuestionIndex")===section?room.get("participantCount"):0};
    if(room.get("status")!=="question"||room.get("currentQuestionIndex")!==section||Date.now()>=room.get("questionEndsAt").toMillis())
      return {status:409,error:"Question is closed"};
    const test=testDoc.data(), part=test.sections[section];
    const prior=previous?.section===section?previous:null;
    // A response can be lost after commit. Replaying the same draft must
    // acknowledge the committed revision without changing any counts.
    if (!submit && prior && !prior.submitted && prior.revision === revision+1 &&
        answers.length === prior.answers.length && answers.every((v,i)=>v===prior.answers[i])) {
      return {revision:prior.revision};
    }
    if(prior?.submitted||revision!==(prior?.revision||0))return {status:409,error:"Attempt changed in another tab. Reload."};
    if(answers.length!==part.questions.length||answers.some((v,i)=>typeof v!=="string"||v.length>300||
      (v && part.questions[i].options.length && !part.questions[i].options.includes(v))))return {status:400,error:"Invalid answers"};
    const old=prior?.answers || Array(answers.length).fill("");
    const before=grade([part],old), after=grade([part],answers);
    const offset=test.sections.slice(0,section).reduce((n,p)=>n+p.questions.length,0);
    answers.forEach((value,i)=>{
      if(value===old[i])return;
      const questionIndex=offset+i, answerRef=ref.collection("answers").doc(questionIndex+"_"+uid);
      if(after.marks[i]==="skipped")tx.delete(answerRef);
      else tx.set(answerRef,{uid,questionIndex,textAnswer:value,correct:after.marks[i]==="correct"});
    });
    tx.update(memberRef,{readingDraft:{section,revision:revision+1,answers,submitted:submit},
      answeredCount:FieldValue.increment(before.skipped-after.skipped),correctCount:FieldValue.increment(after.correct-before.correct)});
    if(submit)tx.create(ref.collection("readingSubmissions").doc(section+"_"+uid),{section});
    return {revision:revision+1,players:submit?room.get("participantCount"):0};
  });
  if(outcome.players)await ifComplete(db,ref,section,outcome.players);
  return outcome.status?outcome:{revision:outcome.revision};
}
module.exports={starterId,starter,roundUpdate,advance,ifComplete,save};
