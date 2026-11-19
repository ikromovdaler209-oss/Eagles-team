"use strict";
const express = require("express");
const { auth, db } = require("./firebase");
const { FieldValue } = require("firebase-admin/firestore");
const router = express.Router();
router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

async function authenticate(req, res, next) {
  const token = /^Bearer (\S+)$/.exec(req.get("authorization") || "")?.[1];
  if (!token) return res.status(401).json({error: "Authentication required"});
  try { req.user = await auth.verifyIdToken(token, true); next(); }
  catch (err) {
    const invalid = ["auth/id-token-expired", "auth/id-token-revoked", "auth/user-disabled", "auth/user-not-found", "auth/invalid-id-token", "auth/argument-error"].includes(err.code);
    console.warn("[quiz-auth]", err.code || "unknown");
    return res.status(invalid ? 401 : 503).json({error: invalid ? "Invalid session" : "Authentication service unavailable"});
  }
}
function access(p) { return p?.isActive === true && p?.approvalStatus === "approved" && (p.role === "admin" || p.role === "student"); }
async function permission(req, res, next) {
  try {
    const doc = await db.collection("users").doc(req.user.uid).get();
    req.profile = doc.data();
    if (!access(req.profile)) return res.status(403).json({error: "Approved active account required"});
    if (req.profile.role !== "admin" && req.profile.canCreateTests !== true)
      return res.status(403).json({error: "Test creation permission required"});
    next();
  } catch (err) { next(err); }
}
function validText(s, max) { return typeof s === "string" && s.trim().length > 0 && s.trim().length <= max; }
function validate(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return "Invalid test";
  const keys = Object.keys(input);
  if (keys.some(k => !["title", "description", "questions", "status"].includes(k))) return "Unsupported fields";
  if (!validText(input.title, 120) || typeof input.description !== "string" || input.description.length > 1000) return "Invalid title or description";
  if (!["draft", "published"].includes(input.status)) return "Invalid status";
  if (!Array.isArray(input.questions) || input.questions.length > 100) return "Maximum 100 questions";
  if (input.status === "published" && input.questions.length === 0) return "Add questions before publishing";
  for (const q of input.questions) {
    if (!q || typeof q !== "object" || Array.isArray(q) || Object.keys(q).some(k => !["text", "options", "correctOption", "timeLimit"].includes(k))) return "Invalid question fields";
    if (!validText(q.text, 1000) || !Array.isArray(q.options) || q.options.length !== 4 || !q.options.every(x => validText(x, 400))) return "Each question needs four options";
    if (!Number.isInteger(q.correctOption) || q.correctOption < 0 || q.correctOption > 3) return "Choose one correct answer";
    if (![25, 30].includes(q.timeLimit)) return "Time limit must be 25 or 30 seconds";
  }
  return null;
}
function normalized(input) {
  return {title: input.title.trim(), description: input.description.trim(), status: input.status,
    questions: input.questions.map(q => ({text: q.text.trim(), options: q.options.map(o => o.trim()), correctOption: q.correctOption, timeLimit: q.timeLimit})),
    questionCount: input.questions.length};
}
function ownOrAdmin(doc, req) { return req.profile.role === "admin" || doc.creatorUid === req.user.uid; }
function view(doc) { const {title, description, status, questionCount, creatorUid, createdAt, updatedAt} = doc.data(); return {id: doc.id, title, description, status, questionCount, creatorUid, createdAt: createdAt?.toDate?.()?.toISOString() || null, updatedAt: updatedAt?.toDate?.()?.toISOString() || null}; }
router.use(authenticate, permission);
router.get("/", async (req, res, next) => {
  try {
    // Avoid composite indexes; filter creator in memory for the initial small deployment.
    const snap = await db.collection("quizzes").limit(500).get();
    res.json({quizzes: snap.docs.filter(d => ownOrAdmin(d.data(), req)).map(view)});
  } catch (e) { next(e); }
});
router.post("/", async (req, res, next) => {
  try {
    const error = validate(req.body);
    if (error) return res.status(400).json({error});
    const ref = await db.collection("quizzes").add({...normalized(req.body), creatorUid: req.user.uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
    res.status(201).json({id: ref.id});
  } catch (e) { next(e); }
});
router.get("/:id", async (req, res, next) => {
  try {
    const doc = await db.collection("quizzes").doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({error: "Test not found"});
    if (!ownOrAdmin(doc.data(), req)) return res.status(403).json({error: "Access denied"});
    res.json({quiz: {...view(doc), questions: doc.get("questions") || []}});
  } catch (e) { next(e); }
});
router.put("/:id", async (req, res, next) => {
  try {
    const error = validate(req.body);
    if (error) return res.status(400).json({error});
    const ref = db.collection("quizzes").doc(req.params.id);
    const result = await db.runTransaction(async tx => {
      const doc = await tx.get(ref);
      if (!doc.exists) return 404;
      if (!ownOrAdmin(doc.data(), req)) return 403;
      tx.update(ref, {...normalized(req.body), updatedAt: FieldValue.serverTimestamp()});
      return 200;
    });
    if (result !== 200) return res.status(result).json({error: result === 404 ? "Test not found" : "Access denied"});
    res.json({ok: true});
  } catch (e) { next(e); }
});
router.delete("/:id", async (req, res, next) => {
  try {
    const ref = db.collection("quizzes").doc(req.params.id);
    const result = await db.runTransaction(async tx => {
      const doc = await tx.get(ref);
      if (!doc.exists) return 404;
      if (!ownOrAdmin(doc.data(), req)) return 403;
      tx.delete(ref); return 200;
    });
    if (result !== 200) return res.status(result).json({error: result === 404 ? "Test not found" : "Access denied"});
    res.json({ok: true});
  } catch (e) { next(e); }
});
module.exports = router;
