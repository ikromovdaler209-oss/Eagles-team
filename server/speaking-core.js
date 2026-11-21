"use strict";
const crypto = require("node:crypto");

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_AUDIO_BYTES = 12 * 1024 * 1024;
const MAX_SECONDS = 180;
const MIME_FORMATS = Object.freeze({
  "audio/webm": "webm",
  "audio/mp4": "mp4",
  "audio/ogg": "ogg"
});
function normalizeMime(value) { return String(value || "").split(";")[0].trim().toLowerCase(); }
function validMeta(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  if (Object.keys(input).some(key => !["id", "part", "prompt", "durationSeconds", "consent"].includes(key))) return false;
  return input.consent === true && typeof input.id === "string" && ID_RE.test(input.id) && [1,2,3].includes(input.part) &&
    typeof input.prompt === "string" && input.prompt.trim().length >= 8 && input.prompt.trim().length <= 500 &&
    Number.isInteger(input.durationSeconds) && input.durationSeconds >= 2 && input.durationSeconds <= MAX_SECONDS;
}
function validAudio(buffer, contentType) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 100 || buffer.length > MAX_AUDIO_BYTES) return false;
  const mime = normalizeMime(contentType);
  if (!MIME_FORMATS[mime]) return false;
  if (mime === "audio/webm") return buffer.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]));
  if (mime === "audio/ogg") return buffer.toString("ascii",0,4) === "OggS";
  if (mime === "audio/mp4") return buffer.toString("ascii",4,8) === "ftyp";
  return false;
}
function configured(env = process.env) {
  return Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
}
function signature(parameters, secret) {
  const signable = Object.entries(parameters)
    .filter(([key,value]) => !["api_key","file","signature","resource_type"].includes(key) && value !== undefined && value !== null && value !== "")
    .sort(([a],[b]) => a.localeCompare(b))
    .map(([key,value]) => `${key}=${value}`).join("&");
  return crypto.createHash("sha1").update(signable + secret).digest("hex");
}
function privateDownloadUrl(asset, env = process.env, now = Math.floor(Date.now()/1000)) {
  if (!configured(env)) throw new Error("Speaking storage not configured");
  if (!asset || !/^[\w\/-]{1,190}$/.test(asset.publicId) || !/^[a-z0-9]{2,8}$/.test(asset.format)) throw new Error("Invalid recording reference");
  const params = {timestamp:now, public_id:asset.publicId, format:asset.format, expires_at:now+300, type:"authenticated"};
  const q = new URLSearchParams({...params, signature:signature(params,env.CLOUDINARY_API_SECRET), api_key:env.CLOUDINARY_API_KEY});
  return `https://api.cloudinary.com/v1_1/${encodeURIComponent(env.CLOUDINARY_CLOUD_NAME)}/video/download?${q}`;
}
function publicSubmission(id, data, role = "student") {
  const base = {id, part:data.part, prompt:data.prompt, durationSeconds:data.durationSeconds, status:data.status,
    audioAvailable:Boolean(data.asset && !data.audioDeletedAt),
    createdAt:data.createdAt?.toDate?.()?.toISOString() || null,
    reviewedAt:data.reviewedAt?.toDate?.()?.toISOString() || null,
    review:data.review ? {feedback:data.review.feedback || "", criteria:data.review.criteria, overall:data.review.overall} : null};
  if (role === "admin") Object.assign(base, {studentUid:data.uid, studentName:data.studentName || "Student", studentEmail:data.studentEmail || ""});
  return base;
}
module.exports = {ID_RE,MAX_AUDIO_BYTES,MAX_SECONDS,MIME_FORMATS,normalizeMime,validMeta,validAudio,configured,signature,privateDownloadUrl,publicSubmission};
