"use strict";
const express = require("express");
const crypto = require("node:crypto");
const {Timestamp, FieldValue} = require("firebase-admin/firestore");
const {auth, db} = require("./firebase");
const {ROOM_LIFETIME_MS, MAX_PARTICIPANTS, validId, validPin, canJoin, canHost, randomPin, randomAlias, publicSession} = require("./live-lobby-core");
const router = express.Router();
router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

async function authorize(req, res, next) {
  const token = /^Bearer (\S+)$/.exec(req.get("authorization") || "")?.[1];
  if (!token) return res.status(401).json({error: "Authentication required"});
  try {
    req.user = await auth.verifyIdToken(token, true);
  } catch (err) {
    const invalid = ["auth/id-token-expired", "auth/id-token-revoked", "auth/user-disabled", "auth/user-not-found", "auth/invalid-id-token", "auth/argument-error"].includes(err.code);
    console.warn("[live-lobby-auth]", err.code || "unknown");
    return res.status(invalid ? 401 : 503).json({error: invalid ? "Invalid session" : "Authentication service unavailable"});
  }
  try {
    const doc = await db.collection("users").doc(req.user.uid).get();
    req.profile = doc.data();
    if (!canJoin(req.profile)) return res.status(403).json({error: "Approved active account required"});
    next();
  } catch (err) { next(err); }
}
router.use(authorize);

function requireHost(req, res) {
  if (canHost(req.profile)) return true;
  res.status(403).json({error: "Test creation permission required"});
  return false;
}
function isExpired(room) { return (room.expiresAt?.toMillis?.() || 0) <= Date.now(); }
function cleanBody(body, allowed) {
  return body && typeof body === "object" && !Array.isArray(body) && Object.keys(body).every(k => allowed.includes(k));
}
function validRoom(req, res, next) {
  if (!validId(req.params.id)) return res.status(400).json({error: "Invalid room ID"});
  next();
}

// Only the host/admin may create a room, and only from a published test they own.
router.post("/", async (req, res, next) => {
  if (!requireHost(req, res)) return;
  if (!cleanBody(req.body, ["quizId"]) || !validId(req.body.quizId)) return res.status(400).json({error: "Invalid test ID"});
  try {
    const quizRef = db.collection("quizzes").doc(req.body.quizId);
    for (let attempt = 0; attempt < 12; attempt++) {
      const pin = randomPin();
      const roomRef = db.collection("liveSessions").doc(crypto.randomUUID());
      const pinRef = db.collection("livePins").doc(pin);
      const snapshotRef = roomRef.collection("private").doc("quiz");
      const expiresAt = Timestamp.fromMillis(Date.now() + ROOM_LIFETIME_MS);
      const result = await db.runTransaction(async tx => {
        const [quiz, occupied] = await Promise.all([tx.get(quizRef), tx.get(pinRef)]);
        if (!quiz.exists) return {error: 404, message: "Test not found"};
        const data = quiz.data();
        if (req.profile.role !== "admin" && data.creatorUid !== req.user.uid)
          return {error: 403, message: "Only the test owner can host"};
        if (data.status !== "published" || !Array.isArray(data.questions) || data.questions.length === 0)
          return {error: 409, message: "Publish a test with questions first"};
        if (occupied.exists) return {collision: true};
        tx.create(roomRef, {pin, quizId: quizRef.id, quizTitle: data.title, questionCount: data.questions.length,
          hostUid: req.user.uid, status: "lobby", participantCount: 0, aliases: [], createdAt: FieldValue.serverTimestamp(), expiresAt});
        tx.create(pinRef, {roomId: roomRef.id, expiresAt});
        // Freeze the test for later gameplay. Never expose this document through a participant endpoint.
        tx.create(snapshotRef, {questions: data.questions, capturedAt: FieldValue.serverTimestamp()});
        return {roomId: roomRef.id, pin};
      });
      if (result.collision) continue;
      if (result.error) return res.status(result.error).json({error: result.message});
      return res.status(201).json({roomId: result.roomId, pin: result.pin});
    }
    res.status(503).json({error: "Unable to generate a room PIN. Try again."});
  } catch (err) { next(err); }
});

// The PIN index is resolved server-side; no test questions or personal data are returned.
router.post("/join", async (req, res, next) => {
  if (!cleanBody(req.body, ["pin"]) || !validPin(req.body.pin)) return res.status(400).json({error: "Enter a six-digit PIN"});
  try {
    const pinRef = db.collection("livePins").doc(req.body.pin);
    const pinDoc = await pinRef.get();
    if (!pinDoc.exists) return res.status(404).json({error: "Room not found"});
    const roomRef = db.collection("liveSessions").doc(pinDoc.get("roomId"));
    const memberRef = roomRef.collection("participants").doc(req.user.uid);
    const result = await db.runTransaction(async tx => {
      const [pin, room, member] = await Promise.all([tx.get(pinRef), tx.get(roomRef), tx.get(memberRef)]);
      if (!pin.exists || pin.get("roomId") !== roomRef.id || !room.exists) return {status: 404, error: "Room not found"};
      if (isExpired(room.data())) return {status: 410, error: "Room expired"};
      if (room.get("status") !== "lobby") return {status: 409, error: "Room is not accepting players"};
      if (member.exists) return {roomId: roomRef.id, alias: member.get("alias")};
      if (room.get("hostUid") === req.user.uid) return {status: 403, error: "Host cannot join as a player"};
      if ((room.get("participantCount") || 0) >= MAX_PARTICIPANTS) return {status: 409, error: "Room is full"};
      const alias = randomAlias();
      tx.create(memberRef, {alias, joinedAt: FieldValue.serverTimestamp()});
      tx.update(roomRef, {participantCount: FieldValue.increment(1), aliases: FieldValue.arrayUnion(alias)});
      return {roomId: roomRef.id, alias};
    });
    if (result.status) return res.status(result.status).json({error: result.error});
    res.json(result);
  } catch (err) { next(err); }
});

router.get("/mine", async (req, res, next) => {
  if (!requireHost(req, res)) return;
  try {
    const docs = await db.collection("liveSessions").where("hostUid", "==", req.user.uid).limit(30).get();
    res.json({rooms: docs.docs.filter(d => d.get("status") === "lobby" && !isExpired(d.data()))
      .map(d => publicSession(d.id, d.data(), true))});
  } catch (err) { next(err); }
});

router.get("/:id", validRoom, async (req, res, next) => {
  try {
    const roomRef = db.collection("liveSessions").doc(req.params.id);
    const doc = await roomRef.get();
    if (!doc.exists) return res.status(404).json({error: "Room not found"});
    const data = doc.data();
    const isHost = data.hostUid === req.user.uid || req.profile.role === "admin";
    const member = isHost ? null : await roomRef.collection("participants").doc(req.user.uid).get();
    if (!isHost && !member.exists) return res.status(403).json({error: "Not a member of this room"});
    const room = publicSession(doc.id, data, isHost, member?.get("alias") || null);
    const response = {room};
    // The room keeps alias-only presence so polling reads one document, not
    // up to 200 participant documents per host refresh.
    if (isHost) response.participants = (data.aliases || []).map(alias => ({alias}));
    res.json(response);
  } catch (err) { next(err); }
});

router.post("/:id/leave", validRoom, async (req, res, next) => {
  try {
    const roomRef = db.collection("liveSessions").doc(req.params.id);
    const memberRef = roomRef.collection("participants").doc(req.user.uid);
    const result = await db.runTransaction(async tx => {
      const [room, member] = await Promise.all([tx.get(roomRef), tx.get(memberRef)]);
      if (!room.exists) return 404;
      if (room.get("hostUid") === req.user.uid) return 403;
      if (!member.exists) return 200;
      if (room.get("status") !== "lobby") return 409;
      tx.delete(memberRef);
      tx.update(roomRef, {participantCount: FieldValue.increment(-1), aliases: FieldValue.arrayRemove(member.get("alias"))});
      return 200;
    });
    if (result !== 200) return res.status(result).json({error: result === 404 ? "Room not found" : result === 403 ? "Host must close the room" : "Cannot leave during a running quiz"});
    res.json({ok: true});
  } catch (err) { next(err); }
});

router.post("/:id/close", validRoom, async (req, res, next) => {
  try {
    const roomRef = db.collection("liveSessions").doc(req.params.id);
    const doc = await roomRef.get();
    if (!doc.exists) return res.status(404).json({error: "Room not found"});
    if (doc.get("hostUid") !== req.user.uid && req.profile.role !== "admin")
      return res.status(403).json({error: "Host access required"});
    const pinRef = db.collection("livePins").doc(doc.get("pin"));
    const result = await db.runTransaction(async tx => {
      const [room, pin] = await Promise.all([tx.get(roomRef), tx.get(pinRef)]);
      if (!room.exists) return 404;
      if (room.get("hostUid") !== req.user.uid && req.profile.role !== "admin") return 403;
      if (room.get("status") === "closed") return 200;
      if (room.get("status") !== "lobby") return 409;
      tx.update(roomRef, {status: "closed", closedAt: FieldValue.serverTimestamp()});
      if (pin.exists && pin.get("roomId") === roomRef.id) tx.delete(pinRef);
      return 200;
    });
    if (result !== 200) return res.status(result).json({error: result === 404 ? "Room not found" : result === 403 ? "Host access required" : "Room cannot be closed in this state"});
    res.json({ok: true});
  } catch (err) { next(err); }
});

module.exports = router;
