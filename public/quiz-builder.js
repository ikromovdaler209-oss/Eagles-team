"use strict";
const $ = id => document.getElementById(id);
const list = $("quizList"), questions = $("questions"), message = $("qbMessage");
let currentId = null, currentCreator = null, quizzes = [], busy = false;
function notice(text) { message.textContent = text; }
function element(tag, text, cls) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (cls) node.className = cls; return node; }
function button(text, action, cls) { const node = element("button", text, cls); node.type = "button"; node.addEventListener("click", action); return node; }
function field(text, value = "", max = 400) { const input = element("input"); input.type = "text"; input.value = value; input.maxLength = max; input.placeholder = text; input.setAttribute("aria-label", text); return input; }
function addQuestion(q = {text:"", options:["", "", "", ""], correctOption:0, timeLimit:30}) {
  const box = element("section", undefined, "qb-question");
  const header = element("div", undefined, "qb-row");
  const title = element("h3", "Question");
  header.append(title, button("Remove", () => {box.remove(); renumber();}, "qb-danger")); box.append(header);
  const prompt = field("Question text", q.text, 1000); box.append(prompt);
  const opts = element("div", undefined, "qb-options");
  const name = `correct-${crypto.randomUUID()}`;
  q.options.forEach((value, i) => {
    const wrap = element("label", undefined, "qb-option");
    const radio = element("input"); radio.type = "radio"; radio.name = name; radio.value = String(i); radio.checked = i === q.correctOption; radio.setAttribute("aria-label", `Correct answer ${"ABCD"[i]}`);
    const input = field(`Option ${"ABCD"[i]}`, value);
    wrap.append(radio, input); opts.append(wrap);
  });
  box.append(opts);
  const timerLabel = element("label", "Time limit: "); const timer = element("select");
  for (const n of [25, 30]) {const option = element("option", `${n} seconds`); option.value = String(n); timer.append(option);}
  timer.value = String(q.timeLimit); timerLabel.append(timer); box.append(timerLabel);
  box.getData = () => ({text: prompt.value, options: [...opts.querySelectorAll('input[type="text"]')].map(x => x.value), correctOption: Number(opts.querySelector('input[type="radio"]:checked')?.value ?? -1), timeLimit: Number(timer.value)});
  questions.append(box); renumber();
}
function renumber() { [...questions.children].forEach((box, i) => box.querySelector("h3").textContent = `Question ${i + 1}`); $("questionCount").textContent = `${questions.children.length} questions`; }
function readEditor() {return {title: $("quizTitle").value, description: $("quizDescription").value, status: $("quizStatus").value, questions: [...questions.children].map(box => box.getData())};}
function showEditor(quiz) {
  currentId = quiz?.id || null; currentCreator = quiz?.creatorUid || null;
  $("editor").hidden = false; $("editorHeading").textContent = currentId ? "Edit test" : "New test";
  $("quizTitle").value = quiz?.title || ""; $("quizDescription").value = quiz?.description || ""; $("quizStatus").value = quiz?.status || "draft";
  questions.replaceChildren(); for (const q of quiz?.questions || []) addQuestion(q); renumber();
  $("deleteQuiz").hidden = !currentId;
  $("launchLive").hidden = !(currentId && quiz?.status === "published");
  renderList();
}
function renderList() {
  list.replaceChildren(); if (!quizzes.length) list.append(element("p", "No tests yet."));
  for (const quiz of quizzes) {
    const node = button(quiz.title, () => openQuiz(quiz.id)); node.setAttribute("aria-current", String(quiz.id === currentId));
    node.append(element("small", `${quiz.status} · ${quiz.questionCount} questions`)); list.append(node);
  }
}
async function load() { const data = await request("/quizzes"); quizzes = data.quizzes; renderList(); }
async function openQuiz(id) { try {notice("Loading test..."); const data = await request(`/quizzes/${encodeURIComponent(id)}`); showEditor(data.quiz); notice("");} catch(e) {notice(e.message);} }
function validate(q) {
  if (!q.title.trim() || q.title.trim().length > 120) return "Enter a title (up to 120 characters).";
  if (q.questions.length > 100) return "Maximum 100 questions.";
  if (q.status === "published" && !q.questions.length) return "Add at least one question before publishing.";
  for (const [i, item] of q.questions.entries()) if (!item.text.trim() || item.options.some(x => !x.trim()) || ![0,1,2,3].includes(item.correctOption)) return `Complete question ${i+1} and select one correct answer.`;
  return null;
}
async function save() {
  if (busy) return;
  const data = readEditor(), error = validate(data); if (error) return notice(error);
  busy = true; $("saveQuiz").disabled = true;
  try {
    const response = await request(currentId ? `/quizzes/${encodeURIComponent(currentId)}` : "/quizzes", {method: currentId ? "PUT" : "POST", body: JSON.stringify(data)});
    const id = currentId || response.id; await load(); await openQuiz(id); notice("Test saved.");
  } catch (e) {notice(e.message);} finally {busy = false; $("saveQuiz").disabled = false;}
}
function preview() {
  const data = readEditor(), target = $("previewContent"); target.replaceChildren();
  target.append(element("h3", data.title || "Untitled test"), element("p", data.description));
  data.questions.forEach((q, i) => {target.append(element("h4", `${i+1}. ${q.text} (${q.timeLimit}s)`)); const ul = element("ul"); q.options.forEach((o, j) => ul.append(element("li", `${"ABCD"[j]}. ${o}${j === q.correctOption ? " ✓" : ""}`))); target.append(ul);});
  $("previewDialog").showModal();
}
async function remove() {
  if (!currentId || !confirm("Delete this test permanently?")) return;
  try {await request(`/quizzes/${encodeURIComponent(currentId)}`, {method:"DELETE"}); showEditor(null); $("editor").hidden = true; await load(); notice("Test deleted.");} catch(e) {notice(e.message);}
}
$("newQuiz").addEventListener("click", () => {showEditor(null); notice("");});
$("addQuestion").addEventListener("click", () => addQuestion());
$("saveQuiz").addEventListener("click", save);
$("deleteQuiz").addEventListener("click", remove);
$("duplicateQuiz").addEventListener("click", () => {const copy = readEditor(); showEditor({...copy, title: `${copy.title} (copy)`, status:"draft"}); notice("Copy ready. Save to create it.");});
$("quizStatus").addEventListener("change", () => {
  $("launchLive").hidden = !(currentId && $("quizStatus").value === "published");
});
$("previewQuiz").addEventListener("click", preview);
$("launchLive").addEventListener("click", () => {
  if (currentId && $("quizStatus").value === "published")
    location.href = `/quiz-live.html?quiz=${encodeURIComponent(currentId)}`;
});
$("closePreview").addEventListener("click", () => $("previewDialog").close());
(async () => {
  try {
    const me = await request("/me");
    const allowed = me.status === "admin" || (me.status === "approved" && me.profile?.canCreateTests === true);
    if (!allowed) {
      location.replace(me.status === "approved" ? "/practice.html" : "/student-dashboard.html");
      return;
    }
    if (me.status === "admin") {
      $("adminLink").hidden = false;
      $("dashboardLink").href = "/admin.html";
    }
    $("qbWorkspace").hidden = false;
    await load();
  } catch (e) {
    notice(`${e.message}. Sign in with an approved account that can create tests.`);
  }
})();
