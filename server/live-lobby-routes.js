"use strict";
const express = require("express");
const crypto = require("node:crypto");
const rateLimit = require("express-rate-limit");
const {Timestamp, FieldValue} = require("firebase-admin/firestore");
const {auth, db} = require("./firebase");
const {ROOM_LIFETIME_MS, MAX_PARTICIPANTS, validId, validPin, canJoin, canHost, randomPin, randomAlias, effectiveStatus, publicSession} = require("./live-lobby-core");
const {ensureArchived} = require("./quiz-results-store");
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
          hostUid: req.user.uid, quizCreatorUid: data.creatorUid, status: "lobby", participantCount: 0, aliases: [], createdAt: FieldValue.serverTimestamp(), expiresAt});
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
// Per-authenticated-account PIN guessing protection; does not punish a classroom
// sharing one public IP address.
const joinLimiter = rateLimit({windowMs: 15 * 60 * 1000, limit: 30,
  standardHeaders: "draft-7", legacyHeaders: false, keyGenerator: req => req.user.uid});
router.post("/join", joinLimiter, async (req, res, next) => {
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
      if (member.exists && ["lobby", "question", "finished"].includes(room.get("status")))
        return {roomId: roomRef.id, alias: member.get("alias")};
      if (isExpired(room.data()) && room.get("status") === "lobby") return {status: 410, error: "Room expired"};
      if (room.get("status") !== "lobby") return {status: 409, error: "Room is not accepting players"};
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
    res.json({rooms: docs.docs.filter(d => (["lobby", "question"].includes(d.get("status"))) && (d.get("status") !== "lobby" || !isExpired(d.data())))
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
    // Only a host or participant can trigger recovery of an unfinished archive.
    if (data.finishedAt && !data.resultsArchivedAt && ["finished", "closed"].includes(data.status))
      await ensureArchived(db, roomRef.id);
    const now = Date.now();
    const room = publicSession(doc.id, data, isHost, member?.get("alias") || null, now);
    const response = {room, serverTime: new Date(now).toISOString()};
    if (room.status === "review" && Number.isInteger(data.currentQuestionIndex)) {
      const quizSnapshot = await roomRef.collection("private").doc("quiz").get();
      const question = quizSnapshot.get("questions")?.[data.currentQuestionIndex];
      if (!question) return res.status(500).json({error: "Quiz snapshot unavailable"});
      response.review = {correctOption: question.correctOption};
    }
    if (member?.exists) {
      if (member.get("lastAnsweredIndex") === data.currentQuestionIndex && room.status !== "lobby") {
        response.myAnswer = {selectedOption: member.get("lastSelectedOption")};
        if (room.status === "review" || room.status === "finished")
          response.myAnswer.isCorrect = member.get("lastAnswerCorrect") === true;
      }
      if (room.status === "finished" || (room.status === "closed" && data.finishedAt)) {
        const correct = member.get("correctCount") || 0;
        const answered = member.get("answeredCount") || 0;
        response.myResult = {correct, wrong: answered - correct, skipped: data.questionCount - answered,
          total: data.questionCount, accuracy: Math.round((correct / data.questionCount) * 10000) / 100};
      }
    }
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
      if (!["lobby", "question", "finished"].includes(room.get("status"))) return 409;
      tx.update(roomRef, {status: "closed", closedAt: FieldValue.serverTimestamp()});
      if (pin.exists && pin.get("roomId") === roomRef.id) tx.delete(pinRef);
      return 200;
    });
    if (result !== 200) return res.status(result).json({error: result === 404 ? "Room not found" : result === 403 ? "Host access required" : "Room cannot be closed in this state"});
    res.json({ok: true});
  } catch (err) { next(err); }
});


// v1.3.3 — all state transitions are atomic. Only server time decides deadlines.
function hostOf(room, req) {
  return canHost(req.profile) && (room.get("hostUid") === req.user.uid || req.profile.role === "admin");
}
function publicQuestion(question) {
  return {text: question.text, options: question.options, timeLimit: question.timeLimit};
}
router.post("/:id/start", validRoom, async (req, res, next) => {
  if (!cleanBody(req.body, [])) return res.status(400).json({error: "Invalid request"});
  try {
    const roomRef = db.collection("liveSessions").doc(req.params.id);
    const quizRef = roomRef.collection("private").doc("quiz");
    const result = await db.runTransaction(async tx => {
      const [room, quiz] = await Promise.all([tx.get(roomRef), tx.get(quizRef)]);
      if (!room.exists) return {status: 404, error: "Room not found"};
      if (!hostOf(room, req)) return {status: 403, error: "Host access required"};
      if (room.get("status") !== "lobby" || isExpired(room.data())) return {status: 409, error: "Room is no longer in the lobby"};
      if ((room.get("participantCount") || 0) < 1) return {status: 409, error: "Wait for at least one participant"};
      const questions = quiz.get("questions");
      if (!Array.isArray(questions) || questions.length !== room.get("questionCount") || !questions.length)
        return {status: 500, error: "Quiz snapshot unavailable"};
      const first = questions[0];
      if (![25, 30].includes(first.timeLimit)) return {status: 500, error: "Invalid quiz timer"};
      const now = Date.now();
      tx.update(roomRef, {status: "question", currentQuestionIndex: 0, currentQuestion: publicQuestion(first),
        questionStartedAt: Timestamp.fromMillis(now), questionEndsAt: Timestamp.fromMillis(now + first.timeLimit * 1000),
        startedAt: FieldValue.serverTimestamp()});
      return {ok: true};
    });
    if (result.status) return res.status(result.status).json({error: result.error});
    res.json(result);
  } catch (err) { next(err); }
});

router.post("/:id/answer", validRoom, async (req, res, next) => {
  if (!cleanBody(req.body, ["questionIndex", "selectedOption"]) ||
      !Number.isInteger(req.body.questionIndex) || req.body.questionIndex < 0 ||
      !Number.isInteger(req.body.selectedOption) || req.body.selectedOption < 0 || req.body.selectedOption > 3)
    return res.status(400).json({error: "Invalid answer"});
  try {
    const roomRef = db.collection("liveSessions").doc(req.params.id);
    const memberRef = roomRef.collection("participants").doc(req.user.uid);
    const answerRef = roomRef.collection("answers").doc(`${req.body.questionIndex}_${req.user.uid}`);
    const quizRef = roomRef.collection("private").doc("quiz");
    const result = await db.runTransaction(async tx => {
      const [room, member, previous, quiz] = await Promise.all([
        tx.get(roomRef), tx.get(memberRef), tx.get(answerRef), tx.get(quizRef)
      ]);
      if (!room.exists) return {status: 404, error: "Room not found"};
      if (!member.exists || room.get("hostUid") === req.user.uid) return {status: 403, error: "Not a player in this room"};
      if (previous.exists) return {ok: true, alreadySubmitted: true};
      const now = Date.now();
      if (room.get("status") !== "question" || room.get("currentQuestionIndex") !== req.body.questionIndex ||
          now >= (room.get("questionEndsAt")?.toMillis?.() || 0))
        return {status: 409, error: "Question is closed"};
      const correctOption = quiz.get("questions")?.[req.body.questionIndex]?.correctOption;
      if (!Number.isInteger(correctOption) || correctOption < 0 || correctOption > 3)
        return {status: 500, error: "Quiz snapshot unavailable"};
      const correct = correctOption === req.body.selectedOption;
      tx.create(answerRef, {uid: req.user.uid, questionIndex: req.body.questionIndex,
        selectedOption: req.body.selectedOption, correct, submittedAt: FieldValue.serverTimestamp()});
      tx.update(memberRef, {lastAnsweredIndex: req.body.questionIndex,
        lastSelectedOption: req.body.selectedOption, lastAnswerCorrect: correct,
        answeredCount: FieldValue.increment(1), ...(correct ? {correctCount: FieldValue.increment(1)} : {})});
      return {ok: true, alreadySubmitted: false};
    });
    if (result.status) return res.status(result.status).json({error: result.error});
    res.json(result);
  } catch (err) { next(err); }
});

router.post("/:id/advance", validRoom, async (req, res, next) => {
  if (!cleanBody(req.body, [])) return res.status(400).json({error: "Invalid request"});
  try {
    const roomRef = db.collection("liveSessions").doc(req.params.id);
    const quizRef = roomRef.collection("private").doc("quiz");
    const result = await db.runTransaction(async tx => {
      const [room, quiz] = await Promise.all([tx.get(roomRef), tx.get(quizRef)]);
      if (!room.exists) return {status: 404, error: "Room not found"};
      if (!hostOf(room, req)) return {status: 403, error: "Host access required"};
      const now = Date.now();
      if (["finished", "closed"].includes(room.get("status")) && room.get("finishedAt"))
        return {ok: true, finished: true}; // retry archival after a transient write failure
      if (room.get("status") !== "question" || effectiveStatus(room.data(), now) !== "review")
        return {status: 409, error: "Wait until the question timer ends"};
      const questions = quiz.get("questions");
      if (!Array.isArray(questions) || questions.length !== room.get("questionCount"))
        return {status: 500, error: "Quiz snapshot unavailable"};
      const nextIndex = room.get("currentQuestionIndex") + 1;
      if (nextIndex >= questions.length) {
        tx.update(roomRef, {status: "finished", finishedAt: FieldValue.serverTimestamp()});
        return {ok: true, finished: true};
      }
      const nextQuestion = questions[nextIndex];
      if (![25, 30].includes(nextQuestion.timeLimit)) return {status: 500, error: "Invalid quiz timer"};
      tx.update(roomRef, {currentQuestionIndex: nextIndex, currentQuestion: publicQuestion(nextQuestion),
        questionStartedAt: Timestamp.fromMillis(now),
        questionEndsAt: Timestamp.fromMillis(now + nextQuestion.timeLimit * 1000)});
      return {ok: true, finished: false};
    });
    if (result.status) return res.status(result.status).json({error: result.error});
    if (result.finished) await ensureArchived(db, req.params.id);
    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;
