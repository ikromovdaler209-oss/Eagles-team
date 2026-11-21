"use strict";
const router = require("express").Router();
const rateLimit = require("express-rate-limit");
const {db} = require("./firebase");
const authorize = require("./live-lobby-routes").authorize;
const {canHost, validId} = require("./live-lobby-core");
const {cleanTest, publicSections, grade, fail} = require("./reading-core");
const starter = require("./reading-starter");
const tests = db.collection("readingTests"), attempts = db.collection("readingAttempts");
const sample = "shade-experiment";
router.use((_req,res,next) => { res.set("Cache-Control","no-store"); next(); });
router.use(authorize, rateLimit({windowMs:900000, limit:900, keyGenerator:req => req.user.uid}));
router.param("id", (req,res,next,id) => validId(id) ? next() : res.status(400).json({error:"Invalid ID"}));
function editor(req) { if (!canHost(req.profile)) fail(403,"Access denied"); }
function own(req,test) {
  editor(req);
  if (req.profile.role !== "admin" && test.owner !== req.user.uid) fail(403,"Access denied");
}
const meta = (id,t) => ({id,title:t.title,mode:t.mode,minutes:t.minutes,count:t.count,status:t.status,version:t.version});
router.get("/catalog", async (req,res) => {
  const snap = await tests.where("status","==","published").select("title","mode","minutes","count","status","version").get();
  res.json({tests:[meta(sample,starter), ...snap.docs.map(d => meta(d.id,d.data()))], editor:canHost(req.profile)});
});
router.get("/manage", async (req,res) => {
  editor(req);
  const query = req.profile.role === "admin" ? tests : tests.where("owner","==",req.user.uid);
  const rows = await query.select("title","mode","minutes","count","status","version").get();
  res.json(rows.docs.map(d => meta(d.id,d.data())));
});
router.get("/manage/:id", async (req,res) => {
  const t = (await tests.doc(req.params.id).get()).data();
  if (!t) fail(404,"Test not found");
  own(req,t); res.json(t);
});
router.put("/manage/:id", async (req,res) => {
  editor(req);
  const id = req.params.id;
  if (id === sample) fail(403,"Access denied");
  const test = cleanTest(req.body), ref = tests.doc(id);
  await db.runTransaction(async tx => {
    const current = (await tx.get(ref)).data();
    if (current) own(req,current);
    const version = current?.version || 0;
    if (version !== req.body.version) fail(409,"Test changed. Reopen the editor.");
    tx.set(ref,{...test,owner:current?.owner || req.user.uid,version:version+1});
  });
  res.json({version:req.body.version+1});
});
function summary(a) {
  return {title:a.title,testId:a.testId,completed:a.completed,correct:a.result.correct,
    total:a.result.total,wrong:a.result.wrong,skipped:a.result.skipped,accuracy:a.result.accuracy};
}
function finish(tx,ref,a,now) {
  if (a.completed) return;
  a.completed = Math.min(now,a.deadline);
  a.result = grade(a.sections,a.answers);
  a.result.prompts = a.sections.flatMap(s => s.questions.map(q => q.prompt));
  tx.update(ref,{completed:a.completed,result:a.result});
}
function view(id,a) {
  return a.completed ? {id,result:summary(a)} : {id,title:a.title,sections:publicSections(a.sections),
    answers:a.answers,revision:a.revision,deadline:a.deadline,now:Date.now()};
}
router.post("/start/:id", async (req,res) => {
  const id = req.params.id, uid = req.user.uid;
  const pointer = db.collection("users").doc(uid).collection("readingCurrent").doc(id);
  const fresh = attempts.doc();
  const result = await db.runTransaction(async tx => {
    const current = (await tx.get(pointer)).data();
    if (current) {
      const ref = attempts.doc(current.id), a = (await tx.get(ref)).data();
      if (a && !a.completed) { if (Date.now() >= a.deadline) finish(tx,ref,a,Date.now()); return view(ref.id,a); }
    }
    const t = id === sample ? starter : (await tx.get(tests.doc(id))).data();
    if (!t || t.status !== "published") fail(404,"Test not found");
    const a = {uid,owner:t.owner,testId:id,version:t.version,title:t.title,sections:t.sections,
      deadline:Date.now()+t.minutes*60000,answers:Array(t.count).fill(""),revision:0,completed:null};
    tx.create(fresh,a); tx.set(pointer,{id:fresh.id}); return view(fresh.id,a);
  });
  res.json(result);
});
async function attempt(req,res) {
  const ref = attempts.doc(req.params.id);
  const data = await db.runTransaction(async tx => {
    const a = (await tx.get(ref)).data();
    if (!a || a.uid !== req.user.uid) fail(404,"Attempt not found");
    const now = Date.now();
    if (!a.completed && now >= a.deadline) finish(tx,ref,a,now);
    if (!a.completed && req.method === "PUT") {
      const {answers,revision,submit} = req.body || {};
      if (revision !== a.revision) fail(409,"Attempt changed in another tab. Reload.");
      if (typeof submit !== "boolean" || !Array.isArray(answers) || answers.length !== a.answers.length) fail(400,"Invalid answers");
      const questions = a.sections.flatMap(s => s.questions);
      if (answers.some((v,i) => typeof v !== "string" || v.length > 300 || (v && questions[i].options.length && !questions[i].options.includes(v)))) fail(400,"Invalid answers");
      a.answers = answers; a.revision++;
      tx.update(ref,{answers,revision:a.revision});
      if (submit) finish(tx,ref,a,now);
    }
    return req.method === "PUT" && !a.completed ? {revision:a.revision} : view(ref.id,a);
  });
  res.json(data);
}
router.get("/attempt/:id",attempt);
router.put("/attempt/:id",attempt);
async function completedRows(query) {
  const snap = await query.select("title","owner","uid","testId","version","deadline","completed","result").get();
  const rows = [];
  for (const doc of snap.docs) {
    let a = doc.data();
    if (!a.completed && a.deadline <= Date.now()) {
      a = await db.runTransaction(async tx => {
        const latest = (await tx.get(doc.ref)).data();
        finish(tx,doc.ref,latest,Date.now()); return latest;
      });
    }
    if (a.completed) rows.push(a);
  }
  return rows.sort((a,b) => b.completed-a.completed);
}
router.get("/mine",async (req,res) => res.json((await completedRows(attempts.where("uid","==",req.user.uid))).map(summary)));
router.get("/statistics",async (req,res) => {
  editor(req);
  const admin = req.profile.role === "admin";
  const rows = await completedRows(admin ? attempts : attempts.where("owner","==",req.user.uid));
  const groups = new Map();
  for (const a of rows) {
    const key = a.testId + ":" + a.version;
    const g = groups.get(key) || {title:a.title,version:a.version,count:0,sum:0,prompts:a.result.prompts,misses:Array(a.result.total).fill(0)};
    g.count++; g.sum += a.result.accuracy;
    a.result.marks.forEach((m,i) => { if (m !== "correct") g.misses[i]++; });
    groups.set(key,g);
  }
  const groupsView = [...groups.values()].map(({sum,...g}) => ({...g,average:Math.round(sum/g.count)}));
  const people = [];
  if (admin) {
    const ids = [...new Set(rows.map(a => a.uid))], names = new Map();
    for (let i=0;i<ids.length;i+=100) {
      const docs = await db.getAll(...ids.slice(i,i+100).map(id => db.collection("users").doc(id)));
      for (const d of docs) names.set(d.id,d.get("email") || d.id);
    }
    for (const a of rows) people.push({...summary(a),student:names.get(a.uid)});
  }
  res.json({groups:groupsView,people});
});
router.use((err,req,res,next) => {
  if (res.headersSent) return next(err);
  if ([400,403,404,409].includes(err.status)) return res.status(err.status).json({error:err.message});
  console.error("[reading]",req.method,req.route?.path,err.code || "unknown");
  res.status(503).json({error:"Reading service unavailable"});
});
module.exports = router;
