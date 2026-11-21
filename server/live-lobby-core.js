"use strict";
const crypto = require("node:crypto");

const ROOM_LIFETIME_MS = 3 * 60 * 60 * 1000;
const MAX_PARTICIPANTS = 200;
const validId = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,150}$/.test(value);
const validPin = value => typeof value === "string" && /^[0-9]{6}$/.test(value);
const canJoin = p => p?.isActive === true && p?.approvalStatus === "approved" && ["admin", "student"].includes(p.role);
const canHost = p => canJoin(p) && (p.role === "admin" || p.canCreateTests === true);
const randomPin = () => String(crypto.randomInt(100000, 1000000));
const randomAlias = () => `Player-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
const dateIso = value => value?.toDate?.()?.toISOString() || null;
function effectiveStatus(data, now = Date.now()) {
  if (data.status === "lobby" && (data.expiresAt?.toMillis?.() || 0) <= now) return "expired";
  if (data.status === "question" && (data.questionEndsAt?.toMillis?.() || 0) <= now) return "review";
  return data.status;
}
function publicSession(id, data, isHost, alias = null, now = Date.now()) {
  return {
    id,
    mode:data.mode || "quiz", sectionCount:data.sectionCount || null,
    pin: data.pin,
    quizTitle: data.quizTitle,
    questionCount: data.questionCount,
    status: effectiveStatus(data, now),
    participantCount: data.participantCount || 0,
    expiresAt: dateIso(data.expiresAt),
    isHost,
    alias,
    questionIndex: Number.isInteger(data.currentQuestionIndex) ? data.currentQuestionIndex : null,
    question: data.currentQuestion || null,
    questionEndsAt: dateIso(data.questionEndsAt)
  };
}
module.exports = {ROOM_LIFETIME_MS, MAX_PARTICIPANTS, validId, validPin, canJoin, canHost, randomPin, randomAlias, effectiveStatus, publicSession};
