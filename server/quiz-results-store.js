"use strict";

// Archives a completed Live Quiz. The room transitions to "finished" in an
// earlier transaction; this function uses a single <=201-write Firestore batch
// so all result documents and the room's archive marker commit atomically.
const {MAX_PARTICIPANTS} = require("./live-lobby-core");
const round2 = value => Math.round((value + Number.EPSILON) * 100) / 100;
const isCompleted = room => !!room && !!room.finishedAt && ["finished", "closed"].includes(room.status);

function calculateResults(room, members, answers) {
  const total = room.questionCount;
  if (!Number.isInteger(total) || total < 1 || total > 100) throw new Error("Invalid completed quiz question count");
  const breakdown = Array.from({length: total}, (_, index) => ({index, correct: 0, wrong: 0, skipped: 0}));
  const participantIds = new Set(members.map(d => d.id));
  const seen = new Set();
  for (const item of answers) {
    const a = item.data();
    if (!participantIds.has(a.uid) || !Number.isInteger(a.questionIndex) || a.questionIndex < 0 || a.questionIndex >= total) continue;
    const key = `${a.uid}:${a.questionIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    breakdown[a.questionIndex][a.correct === true ? "correct" : "wrong"]++;
  }
  const results = members.map(d => {
    const p = d.data();
    const correct = Math.max(0, Math.min(total, Number.isInteger(p.correctCount) ? p.correctCount : 0));
    const answered = Math.max(correct, Math.min(total, Number.isInteger(p.answeredCount) ? p.answeredCount : 0));
    return {
      uid: d.id, sessionId: room.id, quizId: room.quizId, quizTitle: room.quizTitle,
      total, correct, wrong: answered - correct, skipped: total - answered,
      accuracy: round2((correct / total) * 100), completedAt: room.finishedAt
    };
  });
  for (const row of breakdown) row.skipped = Math.max(0, members.length - row.correct - row.wrong);
  const sum = results.reduce((n, r) => n + r.accuracy, 0);
  return {results, summary: {
    participantCount: results.length, questionCount: total,
    averageAccuracy: results.length ? round2(sum / results.length) : 0,
    averageCorrect: results.length ? round2(results.reduce((n, r) => n + r.correct, 0) / results.length) : 0,
    breakdown
  }};
}

async function ensureArchived(db, roomId) {
  const roomRef = db.collection("liveSessions").doc(roomId);
  const snap = await roomRef.get();
  if (!snap.exists) return {state: "missing"};
  const data = {...snap.data(), id: snap.id};
  if (!isCompleted(data)) return {state: "unfinished"};
  if (data.resultsArchivedAt && data.resultsSummary) return {state: "archived", summary: data.resultsSummary};
  const [membersSnap, answersSnap] = await Promise.all([
    roomRef.collection("participants").get(), roomRef.collection("answers").get()
  ]);
  if (membersSnap.docs.length > MAX_PARTICIPANTS) throw new Error("Room exceeds supported result batch size");
  const {results, summary} = calculateResults(data, membersSnap.docs, answersSnap.docs);
  const batch = db.batch();
  // Deterministic document IDs: retries overwrite instead of producing duplicates.
  for (const result of results) {
    const id = `${roomId}_${result.uid}`;
    batch.set(db.collection("quizResults").doc(id), result);
  }
  batch.update(roomRef, {resultsSummary: summary, resultsArchivedAt: data.finishedAt});
  await batch.commit();
  return {state: "archived", summary};
}

module.exports = {ensureArchived, calculateResults, isCompleted, round2};
