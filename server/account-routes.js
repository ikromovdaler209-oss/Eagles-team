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
    const p = (await db.collection("users").doc(req.user.uid).get()).data();
    const status = state(p);
    if (status !== "approved") return res.status(403).json({status});
    res.json({status, profile: profileView(p), ...learningSummary(p)});
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
    res.json({ students: snapshot.docs.map(d => ({ ...profileView(d.data()), uid: d.id, canCreateTests: d.get("canCreateTests") === true, canWriteReviews: d.get("canWriteReviews") === true, ...learningSummary(d.data()) })) });
  } catch (e) { next(e); }
});
router.patch("/admin/students/:uid", auth, adminOnly, async (req, res, next) => {
  try {
    if (req.params.uid === req.user.uid) return res.status(400).json({ error: "Cannot edit own admin account" });
    const allowed = ["groupName", "approvalStatus", "isActive", "canCreateTests", "canWriteReviews"];
    const input = req.body || {};
    if (!Object.keys(input).length || Object.keys(input).some(k => !allowed.includes(k)))
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
      tx.update(ref, input);
      return 200;
    });
    if (result !== 200) return res.status(result).json({error: result === 404 ? "Student not found" : "Access denied"});
    res.json({ ok: true });
  } catch (e) { next(e); }
});
module.exports = router;
