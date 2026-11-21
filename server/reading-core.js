"use strict";
const types = {
  multiple: "options", truth: ["True", "False", "Not Given"], opinion: ["Yes", "No", "Not Given"],
  headings: "options", information: "options", features: "options",
  sentence: "text", summary: "text", short: "text"
};
function fail(status, message) { throw Object.assign(new Error(message), {status}); }
function check(condition) { if (!condition) fail(400, "Check the test fields"); }
const normalize = value => value.trim().replace(/\s+/gu, " ").toLowerCase();
function string(value, max, required) {
  check(typeof value === "string" && value.length <= max && (!required || value.trim()));
  return value.trim();
}
function cleanTest(raw) {
  check(raw && ["draft", "published"].includes(raw.status));
  const ready = raw.status === "published";
  const title = string(raw.title, 150, true);
  check(["exam", "practice"].includes(raw.mode) && Number.isInteger(raw.minutes) && raw.minutes >= 1 && raw.minutes <= 60);
  check(Array.isArray(raw.sections) && raw.sections.length <= 3 && (!ready || raw.sections.length));
  if (raw.mode === "exam") check(raw.minutes === 60 && (!ready || raw.sections.length === 3));
  let count = 0;
  const sections = raw.sections.map(s => {
    check(s && Array.isArray(s.questions) && (!ready || s.questions.length));
    const heading = string(s.heading, 160, ready), passage = string(s.passage, 18000, ready);
    const questions = s.questions.map(q => {
      check(++count <= 40 && q && Object.hasOwn(types, q.type));
      const rule = types[q.type], prompt = string(q.prompt, 900, ready);
      check(Array.isArray(q.options) && q.options.length <= 16 && Array.isArray(q.keys) && q.keys.length <= 16);
      const options = Array.isArray(rule) ? rule : rule === "text" ? [] : q.options.map(o => string(o, 300, ready));
      const keys = q.keys.map(k => string(k, 300, ready));
      if (ready) {
        check(keys.length > 0);
        if (rule !== "text") check(options.length >= 2 && new Set(options.map(normalize)).size === options.length && keys.length === 1 && options.includes(keys[0]));
      }
      return {type:q.type, prompt, options, keys};
    });
    return {heading, passage, questions};
  });
  return {title, mode:raw.mode, minutes:raw.minutes, status:raw.status, sections, count};
}
function publicSections(sections) {
  return sections.map(({heading, passage, questions}) => ({heading, passage,
    questions:questions.map(({type, prompt, options}) => ({type, prompt, options}))}));
}
function grade(sections, answers) {
  const marks = sections.flatMap(s => s.questions).map((q,i) => {
    const answer = normalize(answers[i] || "");
    return !answer ? "skipped" : q.keys.some(k => normalize(k) === answer) ? "correct" : "wrong";
  });
  const correct = marks.filter(m => m === "correct").length, skipped = marks.filter(m => m === "skipped").length;
  return {correct, skipped, wrong:marks.length-correct-skipped, total:marks.length, accuracy:Math.round(1000*correct/marks.length)/10, marks};
}
module.exports = {cleanTest, publicSections, grade, fail};
