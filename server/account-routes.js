const express = require("express");
const { auth: firebaseAuth, db } = require("./firebase");
const { FieldValue } = require("firebase-admin/firestore");
const router = express.Router();
router.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
const valid = (s, max = 80) => typeof s === "string" && s.trim().length > 0 && s.trim().length <= max;
async function auth(req, res, next) {
  const match = /^Bearer (\S+)$/.exec(req.get("authorization") || "");
  if (!match) return res.status(401).json({ error: "Authentication required" });
  try {
    req.user = await firebaseAuth.verifyIdToken(match[1], true);
  } catch (error) {
    const code = /^[a-z]+\/[a-z-]+$/.test(error.code) ? error.code : "unknown";
    const projectMismatch = /incorrect "(aud|iss)" claim/i.test(error.message || "");
    const reason = projectMismatch ? "project-mismatch" : code;
    console.warn("[firebase-auth]", req.method, req.path, reason);
    const invalid = ["auth/id-token-expired", "auth/id-token-revoked", "auth/user-disabled",
      "auth/user-not-found", "auth/invalid-id-token", "auth/argument-error"].includes(code);
    if (invalid || projectMismatch) return res.status(401).json({error: "Invalid session"});
    return res.status(503).json({error: "Authentication service unavailable"});
  }
  next();
}
async function adminOnly(req, res, next) {
  try {
    const doc = await db.collection("users").doc(req.user.uid).get();
    const p = doc.data();
    if (!p || p.role !== "admin" || p.approvalStatus !== "approved" || p.isActive !== true)
      return res.status(403).json({ error: "Admin access required" });
    next();
  } catch (e) { next(e); }
}
function state(profile) {
  if (!profile) return "missing";
  if (profile.isActive !== true) return "inactive";
  if (profile.approvalStatus === "pending") return "pending";
  if (profile.approvalStatus !== "approved") return "rejected";
  if (profile.role === "admin") return "admin";
  return profile.role === "student" ? "approved" : "inactive";
}
function profileView(p) {
  if (!p) return null;
  const {firstName, lastName, email, groupName, approvalStatus, isActive, role} = p;
  return {firstName, lastName, email, groupName, approvalStatus, isActive, role, canCreateTests: p.canCreateTests === true};
}
function learningSummary(p) {
  // Registration and profile edits are the dated events currently recorded by this service.
  const activity = [];
  for (const [type, time] of [["profileUpdated", p.profileUpdatedAt], ["registered", p.createdAt]]) {
    if (time?.toDate) activity.push({type, date: time.toDate().toISOString()});
  }
  return {activity, results: [], progress: null};
}
router.get("/dashboard", auth, async (req, res, next) => {
  try {
    const ref = db.collection("users").doc(req.user.uid);
    const p = (await ref.get()).data();
    const status = state(p);
    if (status !== "approved") return res.status(403).json({status});
    // After a verified Firebase email change, a newly issued ID token carries
    // the updated email. Confirm it with Auth before syncing the Firestore mirror.
    if (req.user.email && req.user.email !== p.email) {
      const authUser = await firebaseAuth.getUser(req.user.uid);
      if (authUser.email && authUser.email !== p.email) {
        await ref.update({email: authUser.email, profileUpdatedAt: FieldValue.serverTimestamp()});
        p.email = authUser.email;
      }
    }
    res.json({status, uid: req.user.uid, profile: profileView(p), ...learningSummary(p)});
  } catch (e) { next(e); }
});
router.patch("/profile", auth, async (req, res, next) => {
  try {
    const input = req.body || {};
    const keys = Object.keys(input);
    if (!keys.length || keys.some(k => !["firstName", "lastName"].includes(k) || !valid(input[k], 70)))
      return res.status(400).json({error: "Invalid profile fields"});
    const ref = db.collection("users").doc(req.user.uid);
    const status = await db.runTransaction(async tx => {
      const access = state((await tx.get(ref)).data());
      if (access === "approved") {
        const fields = Object.fromEntries(keys.map(k => [k, input[k].trim()]));
        tx.update(ref, {...fields, profileUpdatedAt: FieldValue.serverTimestamp()});
      }
      return access;
    });
    if (status !== "approved") return res.status(403).json({status});
    res.json({ok: true});
  } catch (e) { next(e); }
});
// Keep the database email aligned only with the authoritative Auth account,
// never with a client-submitted email address. The verification link must be
// confirmed before Firebase updates Auth's email.
router.post("/profile/sync-email", auth, async (req, res, next) => {
  try {
    const ref = db.collection("users").doc(req.user.uid);
    const doc = await ref.get();
    if (state(doc.data()) !== "approved") return res.status(403).json({error: "Access denied"});
    const user = await firebaseAuth.getUser(req.user.uid);
    if (!user.email) return res.status(409).json({error: "No account email found"});
    const updated = doc.data().email !== user.email;
    if (updated) {
      // Never overwrite other account fields: roles, group and permissions are
      // exclusively admin-controlled and remain untouched.
      await ref.update({email: user.email, profileUpdatedAt: FieldValue.serverTimestamp()});
    }
    res.json({email: user.email, updated});
  } catch (error) { next(error); }
});
router.post("/profile", auth, async (req, res, next) => {
  try {
    const { firstName, lastName, groupName } = req.body || {};
    if (Object.keys(req.body || {}).some(k => !["firstName","lastName","groupName"].includes(k)) || ![firstName, lastName, groupName].every(x => valid(x, 70)))
      return res.status(400).json({ error: "Invalid profile fields" });
    const ref = db.collection("users").doc(req.user.uid);
    await db.runTransaction(async tx => {
      const doc = await tx.get(ref);
      if (doc.exists) return;
      tx.create(ref, {
        firstName: firstName.trim(), lastName: lastName.trim(), groupName: groupName.trim(),
        email: req.user.email || "", role: "student", approvalStatus: "pending",
        isActive: true, canCreateTests: false, canWriteReviews: false,
        createdAt: FieldValue.serverTimestamp()
      });
    });
    const doc = await ref.get();
    res.json({ ok: true, profile: profileView(doc.data()) });
  } catch (e) { next(e); }
});
router.get("/me", auth, async (req, res, next) => {
  try {
    const doc = await db.collection("users").doc(req.user.uid).get();
    res.json({ profile: profileView(doc.data()), status: state(doc.data()) });
  } catch (e) { next(e); }
});
router.get("/admin/students", auth, adminOnly, async (req, res, next) => {
  try {
    const snapshot = await db.collection("users").where("role", "==", "student").get();
    res.json({ students: snapshot.docs.filter(doc => !doc.get("archivedAt")).map(d => ({ ...profileView(d.data()), uid: d.id, canCreateTests: d.get("canCreateTests") === true, canWriteReviews: d.get("canWriteReviews") === true, ...learningSummary(d.data()) })) });
  } catch (e) { next(e); }
});
// An administrator-only read model. Individual results remain unavailable to
// test creators and never enter public student endpoints.
router.get("/admin/students/:uid/profile", auth, adminOnly, async (req, res, next) => {
  try {
    const uid = req.params.uid;
    if (!/^[A-Za-z0-9_-]{6,128}$/.test(uid))
      return res.status(400).json({error: "Invalid student ID"});
    const document = await db.collection("users").doc(uid).get();
    const student = document.data();
    if (!student || student.role !== "student" || student.archivedAt)
      return res.status(404).json({error: "Student not found"});

    // Single-field equality queries require no composite index. Limit responses
    // to prevent an old account from loading an unlimited number of records.
    const pageSize = 200;
    const [quizSnap, readingSnap, speakingSnap] = await Promise.all([
      db.collection("quizResults").where("uid", "==", uid).select(
        "sessionId", "quizTitle", "total", "correct", "wrong", "skipped", "accuracy", "completedAt").limit(pageSize + 1).get(),
      db.collection("readingAttempts").where("uid", "==", uid).select(
        "title", "testId", "completed", "result").limit(pageSize + 1).get(),
      db.collection("speakingSubmissions").where("uid", "==", uid).select(
        "part", "prompt", "durationSeconds", "status", "asset", "audioDeletedAt", "createdAt", "reviewedAt", "review").limit(pageSize + 1).get()
    ]);
    const iso = value => {
      const date = value?.toDate?.() || (typeof value === "number" || typeof value === "string" ? new Date(value) : null);
      return date instanceof Date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
    };
    const number = value => Number.isFinite(value) ? value : 0;
    const recent = rows => rows.sort((a,b) => (b.completedAt || b.createdAt || "").localeCompare(a.completedAt || a.createdAt || ""));
    const completeQuiz = quizSnap.docs.slice(0, pageSize).map(d => {
      const x = d.data();
      return {sessionId: x.sessionId || "", title: x.quizTitle || "Untitled test",
        correct: number(x.correct), wrong: number(x.wrong), skipped: number(x.skipped),
        total: number(x.total), accuracy: number(x.accuracy), completedAt: iso(x.completedAt)};
    });
    const reading = readingSnap.docs.slice(0, pageSize).map(d => {
      const x = d.data();
      if (!x.completed || !x.result) return null;
      return {title: x.title || "Reading practice", testId: x.testId || "",
        correct: number(x.result.correct), wrong: number(x.result.wrong), skipped: number(x.result.skipped),
        total: number(x.result.total), accuracy: number(x.result.accuracy), completedAt: iso(x.completed)};
    }).filter(Boolean);
    const speaking = speakingSnap.docs.slice(0, pageSize).map(d => {
      const x = d.data();
      if (!["pending_review", "reviewed"].includes(x.status)) return null;
      return {id: d.id, part: x.part, prompt: x.prompt || "", status: x.status,
        durationSeconds: number(x.durationSeconds), createdAt: iso(x.createdAt),
        reviewedAt: iso(x.reviewedAt), audioAvailable: Boolean(x.asset && !x.audioDeletedAt),
        review: x.status === "reviewed" && x.review ? {
          overall: x.review.overall, feedback: x.review.feedback || "", criteria: x.review.criteria || null
        } : null};
    }).filter(Boolean);
    const summary = rows => ({count: rows.length,
      average: rows.length ? Math.round(rows.reduce((sum,r) => sum + r.accuracy, 0) / rows.length * 100) / 100 : null,
      best: rows.length ? Math.max(...rows.map(r=>r.accuracy)) : null});
    const activity = [["Registered", student.createdAt], ["Profile updated", student.profileUpdatedAt]]
      .map(([type,value]) => ({type, date: iso(value)})).filter(row => row.date);
    res.json({
      student: {uid, firstName: student.firstName || "", lastName: student.lastName || "",
        email: student.email || "", groupName: student.groupName || "", role: student.role,
        approvalStatus: student.approvalStatus || "pending", isActive: student.isActive === true,
        canCreateTests: student.canCreateTests === true, canWriteReviews: student.canWriteReviews === true,
        registeredAt: iso(student.createdAt), updatedAt: iso(student.profileUpdatedAt)},
      overview: {quiz: summary(completeQuiz), reading: summary(reading),
        speaking: {submitted: speaking.length, reviewed: speaking.filter(x => x.status === "reviewed").length}},
      quiz: {items: recent(completeQuiz).slice(0, 50), limited: quizSnap.docs.length > pageSize},
      reading: {items: recent(reading).slice(0, 50), limited: readingSnap.docs.length > pageSize},
      speaking: {items: recent(speaking).slice(0, 50), limited: speakingSnap.docs.length > pageSize},
      activity: activity.sort((a,b) => b.date.localeCompare(a.date))
    });
  } catch (error) {next(error);}
});

async function updateStudent(req, res, next) {
  try {
    if (req.params.uid === req.user.uid) return res.status(400).json({ error: "Cannot edit own admin account" });
    const archive = req.method === "DELETE";
    const allowed = ["groupName", "approvalStatus", "isActive", "canCreateTests", "canWriteReviews"];
    const input = req.body || {};
    if ((!archive && !Object.keys(input).length) || Object.keys(input).some(k => archive || !allowed.includes(k)))
      return res.status(400).json({ error: "Invalid fields" });
    if ("groupName" in input && !valid(input.groupName, 70)) return res.status(400).json({error: "Invalid group"});
    if ("groupName" in input) input.groupName = input.groupName.trim();
    if ("approvalStatus" in input && !["pending", "approved", "rejected"].includes(input.approvalStatus))
      return res.status(400).json({ error: "Invalid approval status" });
    if (["isActive", "canCreateTests", "canWriteReviews"].some(k => k in input && typeof input[k] !== "boolean"))
      return res.status(400).json({ error: "Invalid permissions" });
    const ref = db.collection("users").doc(req.params.uid);
    const result = await db.runTransaction(async tx => {
      const actor = await tx.get(db.collection("users").doc(req.user.uid));
      if (state(actor.data()) !== "admin") return 403;
      const student = await tx.get(ref);
      if (!student.exists) return 404;
      if (student.data().role !== "student") return 403;
      if (student.get("archivedAt")) return archive ? 200 : 404;
      tx.update(ref, archive ? {archivedAt: FieldValue.serverTimestamp(), isActive: false,
        canCreateTests: false, canWriteReviews: false} : input);
      return 200;
    });
    if (result !== 200) return res.status(result).json({error: result === 404 ? "Student not found" : "Access denied"});
    res.json({ ok: true });
  } catch (e) { next(e); }
}
router.patch("/admin/students/:uid", auth, adminOnly, updateStudent);
router.delete("/admin/students/:uid", auth, adminOnly, updateStudent);
module.exports = router;
