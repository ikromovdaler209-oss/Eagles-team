"use strict";
const express = require("express");
const {auth, db} = require("./firebase");
const {validId, canJoin} = require("./live-lobby-core");
const {ensureArchived, isCompleted, round2} = require("./quiz-results-store");
const router = express.Router();
router.use((_req, res, next) => {res.set("Cache-Control", "no-store"); next();});

router.use(async (req, res, next) => {
  const token = /^Bearer (\S+)$/.exec(req.get("authorization") || "")?.[1];
  if (!token) return res.status(401).json({error: "Authentication required"});
  try {req.user = await auth.verifyIdToken(token, true);}
  catch (err) {
    const invalid = ["auth/id-token-expired", "auth/id-token-revoked", "auth/user-disabled", "auth/user-not-found", "auth/invalid-id-token", "auth/argument-error"].includes(err.code);
    console.warn("[quiz-results-auth]", err.code || "unknown");
    return res.status(invalid ? 401 : 503).json({error: invalid ? "Invalid session" : "Authentication service unavailable"});
  }
  try {
    req.profile = (await db.collection("users").doc(req.user.uid).get()).data();
    if (!canJoin(req.profile)) return res.status(403).json({error: "Approved active account required"});
    next();
  } catch (err) {next(err);}
});

const date = stamp => stamp?.toDate?.()?.toISOString() || null;
const safeResult = doc => {
  const d = doc.data();
  return {sessionId: d.sessionId, quizTitle: d.quizTitle, total: d.total,
    correct: d.correct, wrong: d.wrong, skipped: d.skipped,
    accuracy: d.accuracy, completedAt: date(d.completedAt)};
};
const admin = req => req.profile.role === "admin";
const creator = req => admin(req) || req.profile.canCreateTests === true;
function canViewSummary(room, req) {
  return admin(req) || (creator(req) && (room.quizCreatorUid === req.user.uid || room.hostUid === req.user.uid));
}
// Aggregate statistics for a 1-2 person room effectively reveal that
// student's individual performance. Only admins may view small-group metrics.
const MIN_ANONYMOUS_GROUP = 3;
function publicSummary(doc, isAdmin = false) {
  const d = doc.data();
  const raw = d.resultsSummary || null;
  const summary = raw && !isAdmin && raw.participantCount < MIN_ANONYMOUS_GROUP
    ? {participantCount: raw.participantCount, questionCount: raw.questionCount,
       averageAccuracy: null, averageCorrect: null, breakdown: [], privacyLimited: true}
    : raw;
  return {id: doc.id, quizTitle: d.quizTitle, questionCount: d.questionCount,
    completedAt: date(d.finishedAt), summary};
}
const rank = (a, b) => b.accuracy - a.accuracy || b.correct - a.correct;

// Personal history belongs strictly to the authenticated owner.
router.get("/mine", async (req, res, next) => {
  try {
    const snap = await db.collection("quizResults").where("uid", "==", req.user.uid).get();
    const records = snap.docs.map(safeResult).sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));
    const n = records.length;
    const summary = {testsTaken: n, averageAccuracy: n ? round2(records.reduce((sum, x) => sum + x.accuracy, 0) / n) : null,
      bestAccuracy: n ? Math.max(...records.map(x => x.accuracy)) : null,
      latestAccuracy: n ? records[0].accuracy : null};
    res.json({summary, results: records.slice(0, 50), totalResults: n});
  } catch (err) {next(err);}
});

// List of completed sessions. Admins see all; creators see only sessions of
// their tests and those they hosted. No personal records are present here.
router.get("/sessions", async (req, res, next) => {
  if (!creator(req)) return res.status(403).json({error: "Test creation permission required"});
  try {
    let docs;
    if (admin(req)) {
      const snap = await db.collection("liveSessions").orderBy("finishedAt", "desc").limit(150).get();
      docs = snap.docs;
    } else {
      const [byCreator, byHost] = await Promise.all([
        db.collection("liveSessions").where("quizCreatorUid", "==", req.user.uid).limit(150).get(),
        db.collection("liveSessions").where("hostUid", "==", req.user.uid).limit(150).get()
      ]);
      docs = [...new Map([...byCreator.docs, ...byHost.docs].map(doc => [doc.id, doc])).values()];
    }
    // Materialize a completed room if its host lost the response to /advance.
    for (const doc of docs) {
      if (isCompleted(doc.data()) && !doc.get("resultsArchivedAt")) await ensureArchived(db, doc.id);
    }
    const all = await Promise.all(docs.filter(doc => isCompleted(doc.data()) && canViewSummary(doc.data(), req))
      .map(async doc => publicSummary(await db.collection("liveSessions").doc(doc.id).get(), admin(req))));
    all.sort((a,b) => (b.completedAt || "").localeCompare(a.completedAt || ""));
    res.json({sessions: all.slice(0, 100), limited: docs.length >= 150});
  } catch (err) {next(err);}
});

async function authorizedRoom(req, res) {
  if (!validId(req.params.id)) {res.status(400).json({error: "Invalid session ID"}); return null;}
  const ref = db.collection("liveSessions").doc(req.params.id);
  let doc = await ref.get();
  if (!doc.exists) {res.status(404).json({error: "Session not found"}); return null;}
  if (!canViewSummary(doc.data(), req)) {res.status(403).json({error: "Access denied"}); return null;}
  if (!isCompleted(doc.data())) {res.status(409).json({error: "Quiz has not finished"}); return null;}
  if (!doc.get("resultsArchivedAt")) {
    await ensureArchived(db, doc.id);
    doc = await ref.get();
  }
  return doc;
}

router.get("/sessions/:id", async (req, res, next) => {
  try {
    const doc = await authorizedRoom(req, res);
    if (!doc) return;
    res.json({session: publicSummary(doc, admin(req))});
  } catch (err) {next(err);}
});

// Personal identities and responses must never be available to test creators.
router.get("/sessions/:id/participants", async (req, res, next) => {
  if (!admin(req)) return res.status(403).json({error: "Admin access required"});
  try {
    const doc = await authorizedRoom(req, res);
    if (!doc) return;
    const snap = await db.collection("quizResults").where("sessionId", "==", doc.id).get();
    const list = [];
    // Bounded by the 200-player room capacity.
    for (let start=0; start<snap.docs.length; start+=20) {
      const chunk = snap.docs.slice(start, start+20);
      const profiles = await Promise.all(chunk.map(d => db.collection("users").doc(d.get("uid")).get()));
      chunk.forEach((item, i) => {
        const p = profiles[i].data() || {};
        list.push({...safeResult(item), uid: item.get("uid"), name: [p.firstName,p.lastName].filter(Boolean).join(" ") || "Unknown student",
          email: p.email || ""});
      });
    }
    list.sort(rank);
    res.json({participants: list});
  } catch (err) {next(err);}
});

router.get("/sessions/:id/participants/:uid/answers", async (req, res, next) => {
  if (!admin(req)) return res.status(403).json({error: "Admin access required"});
  if (!validId(req.params.uid)) return res.status(400).json({error: "Invalid user ID"});
  try {
    const doc = await authorizedRoom(req, res);
    if (!doc) return;
    const result = await db.collection("quizResults").doc(`${doc.id}_${req.params.uid}`).get();
    if (!result.exists || result.get("uid") !== req.params.uid) return res.status(404).json({error: "Result not found"});
    const roomRef = db.collection("liveSessions").doc(doc.id);
    const [questionsSnap, answersSnap] = await Promise.all([
      roomRef.collection("private").doc("quiz").get(),
      roomRef.collection("answers").where("uid", "==", req.params.uid).get()
    ]);
    const answers = new Map(answersSnap.docs.map(item => [item.get("questionIndex"), item.data()]));
    const questions = (questionsSnap.get("questions") || []).map((q, index) => ({
      index, text: q.text, options: q.options, correctOption: q.correctOption,
      selectedOption: answers.get(index)?.selectedOption ?? null,
      outcome: answers.has(index) ? (answers.get(index).correct === true ? "correct" : "wrong") : "skipped"
    }));
    res.json({questions});
  } catch (err) {next(err);}
});

module.exports = router;
