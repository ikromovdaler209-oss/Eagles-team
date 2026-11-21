"use strict";
// Server-to-server upload; no Cloudinary credentials or unsigned upload preset in the browser.
const {configured} = require("./speaking-core");
const crypto = require("node:crypto");
function authHeader(env) {
  return "Basic " + Buffer.from(env.CLOUDINARY_API_KEY + ":" + env.CLOUDINARY_API_SECRET).toString("base64");
}
async function uploadAudio(buffer, mime, uid, id, env = process.env) {
  if (!configured(env)) throw Object.assign(new Error("Audio storage is not configured"), {status:503});
  const format = {"audio/webm":"webm", "audio/mp4":"mp4", "audio/ogg":"ogg"}[mime];
  if (!format) throw Object.assign(new Error("Unsupported audio format"), {status:415});
  const form = new FormData();
  const publicId = `eagles-speaking/${uid}/${id}`;
  form.append("file", new Blob([buffer],{type:mime}), `answer.${format}`);
  form.append("public_id", publicId);
  form.append("type", "authenticated");
  form.append("overwrite", "false");
  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(env.CLOUDINARY_CLOUD_NAME)}/video/upload`, {
    method:"POST", headers:{Authorization:authHeader(env)}, body:form, signal:AbortSignal.timeout(65000)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.type !== "authenticated" || result.public_id !== publicId) {
    throw Object.assign(new Error("Audio upload failed"), {status:502, providerStatus:response.status});
  }
  return {assetId:result.asset_id, publicId:result.public_id, format:result.format || format, bytes:result.bytes};
}
module.exports = {uploadAudio};
