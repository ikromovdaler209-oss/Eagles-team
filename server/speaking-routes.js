"use strict";
const express = require("express");
const rateLimit = require("express-rate-limit");
const {FieldValue} = require("firebase-admin/firestore");
const {db} = require("./firebase");
const {authorize} = require("./live-lobby-routes");
const {ID_RE,MAX_AUDIO_BYTES,normalizeMime,validMeta,validAudio,configured,privateDownloadUrl,publicSubmission} = require("./speaking-core");
const {uploadAudio} = require("./speaking-storage");
const router = express.Router();
// Cap concurrent uploads before buffering request bodies on a small Render instance.
let activeUploads = 0;
function uploadSlot(req, res, next) {
  if (activeUploads >= 6) return res.status(429).json({error:"Too many audio uploads. Please retry shortly."});
  activeUploads++;
  let released = false;
  const release = () => {if (!released) {released=true;activeUploads--;}};
  res.once("finish", release);
  res.once("close", release);
  next();
}
const submissions = db.collection("speakingSubmissions");
router.use((req,res,next) => {res.set("Cache-Control","no-store");next();});
router.use(authorize,rateLimit({windowMs:15*60*1000,limit:130,keyGenerator:req=>req.user.uid}));
function isAdmin(req) { return req.profile?.role === "admin"; }
function isStudent(req) { return req.profile?.role === "student"; }
function fail(res, status, error) {return res.status(status).json({error});}
function errorHandler(next) {return err => next(err);}
router.param("id", (req,res,next,id) => ID_RE.test(id) ? next() : fail(res,400,"Invalid recording ID"));
router.get("/config",(req,res)=>res.json({recordingAvailable:configured(),maxSeconds:180,maxBytes:MAX_AUDIO_BYTES}));
router.get("/mine",async(req,res,next)=>{
  if(!isStudent(req)) return fail(res,403,"Student account required");
  try {
    const docs = await submissions.where("uid","==",req.user.uid).limit(100).get();
    const rows = docs.docs.map(d=>publicSubmission(d.id,d.data())).filter(d=>d.status!=="uploading");
    rows.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
    res.json({submissions:rows});
  } catch(err){next(err);}
});
router.post("/submissions",async(req,res,next)=>{
  if(!isStudent(req)) return fail(res,403,"Student account required");
  if(!configured()) return fail(res,503,"Audio storage is not configured");
  if(!validMeta(req.body)) return fail(res,400,"Invalid speaking answer metadata");
  try {
    const {id,part,prompt,durationSeconds}=req.body;
    const ref=submissions.doc(id);
    const data=await db.runTransaction(async tx=>{
      const existing=await tx.get(ref);
      if(existing.exists) return existing.data();
      const user=[req.profile.firstName,req.profile.lastName].filter(Boolean).join(" ").trim();
      const value={uid:req.user.uid,studentName:user.slice(0,145),studentEmail:req.user.email||"",part,prompt:prompt.trim(),durationSeconds,
        status:"uploading",consentedAt:FieldValue.serverTimestamp(),createdAt:FieldValue.serverTimestamp()};
      tx.create(ref,value);
      return {...value};
    });
    if(data.uid!==req.user.uid) return fail(res,403,"Access denied");
    res.status(data.status==="uploading"?201:200).json({submission:publicSubmission(id,data)});
  }catch(err){next(err);}
});
router.put("/submissions/:id/audio", uploadSlot, express.raw({type:["audio/webm","audio/mp4","audio/ogg"], limit:"12mb"}),async(req,res,next)=>{
  if(!isStudent(req)) return fail(res,403,"Student account required");
  if(!configured()) return fail(res,503,"Audio storage is not configured");
  const mime=normalizeMime(req.get("content-type"));
  if(!validAudio(req.body,mime)) return fail(res,415,"Invalid audio file or unsupported format (max 12 MB)");
  try {
    const ref=submissions.doc(req.params.id);
    const snap=await ref.get();
    if(!snap.exists) return fail(res,404,"Submission not found");
    const current=snap.data();
    if(current.uid!==req.user.uid) return fail(res,403,"Access denied");
    if(current.status!=="uploading") return fail(res,409,"Recording has already been submitted");
    const stored=await uploadAudio(req.body,mime,req.user.uid,req.params.id);
    await db.runTransaction(async tx=>{
      const latest=await tx.get(ref);
      if(!latest.exists || latest.get("uid")!==req.user.uid || latest.get("status")!=="uploading") return;
      tx.update(ref,{asset:stored,status:"pending_review",submittedAt:FieldValue.serverTimestamp()});
    });
    res.status(201).json({ok:true,status:"pending_review"});
  }catch(err){
    console.warn("[speaking-upload]",err.status||"storage-error");
    if(err.status)return fail(res,err.status,err.message);
    next(err);
  }
});
router.get("/review-queue",async(req,res,next)=>{
  if(!isAdmin(req)) return fail(res,403,"Admin access required");
  try {
    const docs=await submissions.where("status","==","pending_review").limit(100).get();
    const rows=docs.docs.map(d=>publicSubmission(d.id,d.data(),"admin"));
    rows.sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));
    res.json({submissions:rows});
  }catch(err){next(err);}
});
router.get("/submissions/:id/audio",async(req,res,next)=>{
  try {
    const snap=await submissions.doc(req.params.id).get();
    if(!snap.exists) return fail(res,404,"Submission not found");
    const entry=snap.data();
    if(!isAdmin(req) && entry.uid!==req.user.uid) return fail(res,403,"Access denied");
    if(!entry.asset || !["pending_review","reviewed"].includes(entry.status)) return fail(res,409,"Audio is not ready");
    res.json({url:privateDownloadUrl(entry.asset),expiresIn:300});
  } catch(err){next(err);}
});
router.patch("/submissions/:id/review",async(req,res,next)=>{
  if(!isAdmin(req)) return fail(res,403,"Admin access required");
  const input=req.body||{};
  if(Object.keys(input).some(k=>!["feedback","criteria"].includes(k)) || typeof input.feedback!=="string" || input.feedback.trim().length>2000) return fail(res,400,"Invalid review");
  const c=input.criteria;
  if(!c||typeof c!=="object"||Array.isArray(c)||Object.keys(c).sort().join()!==["fluency","grammar","lexical","pronunciation"].sort().join()) return fail(res,400,"Invalid Speaking criteria");
  const validBand=n=>typeof n==="number"&&n>=0&&n<=9&&Number.isInteger(n*2);
  if(!Object.values(c).every(validBand)) return fail(res,400,"Criteria must be between 0 and 9 in 0.5 increments");
  const overall=Math.round(Object.values(c).reduce((a,b)=>a+b,0)/4*2)/2;
  try {
    const ref=submissions.doc(req.params.id);
    const result=await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      if(!snap.exists)return 404;
      if(snap.get("status")==="reviewed")return 409;
      if(snap.get("status")!=="pending_review")return 409;
      tx.update(ref,{status:"reviewed",review:{feedback:input.feedback.trim(),criteria:c,overall,reviewerUid:req.user.uid},reviewedAt:FieldValue.serverTimestamp()});
      return 200;
    });
    if(result!==200)return fail(res,result,result===404?"Submission not found":"Already reviewed or not ready");
    res.json({ok:true,overall});
  } catch(err){next(err);}
});
module.exports=router;
