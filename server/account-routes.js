const express = require("express");
const { auth: firebaseAuth, db } = require("./firebase");
const { FieldValue } = require("firebase-admin/firestore");
const router = express.Router();
const valid = (s, max = 80) => typeof s === "string" && s.trim().length > 0 && s.trim().length <= max;
async function auth(req, res, next) {
  const match = /^Bearer (\S+)$/.exec(req.get("authorization") || "");
  if (!match) return res.status(401).json({ error: "Authentication required" });
  try {
   req.user = await firebaseAuth.verifyIdToken(match[1], true);
    next();
  } catch (_) { res.status(401).json({ error: "Invalid session" }); }
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
router.post("/profile", auth, async (req, res, next) => {
  try {
    const { firstName, lastName, groupName } = req.body || {};
    if (![firstName, lastName, groupName].every(x => valid(x, 70)))
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
    res.json({ ok: true, profile: { ...doc.data(), createdAt: undefined } });
  } catch (e) { next(e); }
});
router.get("/me", auth, async (req, res, next) => {
  try {
    const doc = await db.collection("users").doc(req.user.uid).get();
    res.json({ profile: doc.exists ? doc.data() : null });
  } catch (e) { next(e); }
});
router.get("/admin/students", auth, adminOnly, async (req, res, next) => {
  try {
    const snapshot = await db.collection("users").limit(300).get();
    res.json({ students: snapshot.docs.map(d => ({ uid: d.id, ...d.data() })) });
  } catch (e) { next(e); }
});
router.patch("/admin/students/:uid", auth, adminOnly, async (req, res, next) => {
  try {
    if (req.params.uid === req.user.uid) return res.status(400).json({ error: "Cannot edit own admin account" });
    const allowed = ["approvalStatus", "isActive", "canCreateTests", "canWriteReviews"];
    const input = req.body || {};
    if (!Object.keys(input).length || Object.keys(input).some(k => !allowed.includes(k)))
      return res.status(400).json({ error: "Invalid fields" });
    if ("approvalStatus" in input && !["pending", "approved", "rejected"].includes(input.approvalStatus))
      return res.status(400).json({ error: "Invalid approval status" });
    if (["isActive", "canCreateTests", "canWriteReviews"].some(k => k in input && typeof input[k] !== "boolean"))
      return res.status(400).json({ error: "Invalid permissions" });
    const ref = db.collection("users").doc(req.params.uid);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: "Student not found" });
    if (doc.data().role !== "student") return res.status(403).json({ error: "Only students can be edited" });
    await ref.update(input);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
module.exports = router;
