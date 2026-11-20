"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const t = key => window.eaglesTranslate?.(key) || key;
  const el = (tag, label) => { const node = document.createElement(tag); if (label !== undefined) node.textContent = label; return node; };
  const percent = num => `${num}%`;
  const formatDate = date => date ? new Date(date).toLocaleDateString(document.documentElement.lang) : "";
  let isAdmin = false, currentSession = null, loadRevision = 0;
  function notice(message) { $("statsNotice").textContent = t(message); }
  function metric(value, title) {
    const div = el("div"), strong = el("strong", value), small = el("small", t(title));
    div.append(strong, small); return div;
  }
  async function list() {
    notice(t("Loading results..."));
    const {sessions, limited} = await request("/quiz-results/sessions");
    const host = $("statsSessions"); host.replaceChildren();
    if (!sessions.length) host.append(el("p", t("No completed Live Quiz sessions yet.")));
    for (const session of sessions) {
      const button = el("button"); button.type = "button";
      button.append(el("strong", session.quizTitle), el("small", `${formatDate(session.completedAt)} · ${session.summary?.participantCount || 0} ${t("participants")}`));
      button.setAttribute("aria-current", String(session.id === currentSession));
      button.addEventListener("click", () => openSession(session.id)); host.append(button);
    }
    notice(limited ? t("Showing recent sessions only.") : "");
  }
  async function openSession(id) {
    const rev = ++loadRevision;
    currentSession = id;
    for (const btn of $("statsSessions").querySelectorAll("button")) btn.setAttribute("aria-current", "false");
    notice(t("Loading results..."));
    try {
      const {session} = await request(`/quiz-results/sessions/${encodeURIComponent(id)}`);
      if (rev !== loadRevision) return;
      $("statsDetails").hidden = false;
      $("statsTitle").textContent = session.quizTitle;
      $("statsDate").textContent = formatDate(session.completedAt);
      const data = session.summary;
      const metrics = $("statsMetrics"); metrics.replaceChildren(
        metric(String(data.participantCount), "Participants"),
        metric(data.averageAccuracy == null ? "—" : percent(data.averageAccuracy), "Average accuracy"),
        metric(data.averageCorrect == null ? "—" : `${data.averageCorrect} / ${data.questionCount}`, "Average correct answers"),
        metric(String(data.questionCount), "Questions")
      );
      const questions = $("statsQuestions"); questions.replaceChildren();
      if (data.privacyLimited) questions.append(el("p", t("Aggregate statistics are hidden for rooms with fewer than three participants.")));
      for (const item of data.breakdown || []) {
        const div = el("div");
        div.append(el("strong", `${t("Question")} ${item.index + 1}`),
          el("span", `${item.correct} ${t("correct")} · ${item.wrong} ${t("wrong")} · ${item.skipped} ${t("skipped")}`));
        questions.append(div);
      }
      if (isAdmin) await loadParticipants(id, rev);
      if (rev === loadRevision) notice("");
    } catch (err) {if (rev === loadRevision) notice(err.message || "Request failed");}
  }
  async function loadParticipants(id, rev) {
    const {participants} = await request(`/quiz-results/sessions/${encodeURIComponent(id)}/participants`);
    if (rev !== loadRevision) return;
    const host = $("statsParticipants"); host.replaceChildren();
    $("statsAnswersBlock").hidden = true;
    if (!participants.length) {host.append(el("p", "No results")); return;}
    const table = el("table"), head = el("thead"), row = el("tr");
    for (const caption of ["Student", "Email", "Accuracy", "Correct / Total", "Answers"]) row.append(el("th", caption));
    head.append(row); table.append(head);
    const tbody = el("tbody");
    for (const p of participants) {
      const tr = el("tr");
      for (const v of [p.name, p.email, percent(p.accuracy), `${p.correct}/${p.total}`]) tr.append(el("td", v));
      const td = el("td"), button = el("button", "View answers"); button.type = "button";
      button.addEventListener("click", () => loadAnswers(id, p.uid, p.name));
      td.append(button); tr.append(td); tbody.append(tr);
    }
    table.append(tbody); host.append(table);
  }
  async function loadAnswers(id, uid, name) {
    notice(t("Loading results..."));
    try {
      const {questions} = await request(`/quiz-results/sessions/${encodeURIComponent(id)}/participants/${encodeURIComponent(uid)}/answers`);
      if (id !== currentSession) return;
      $("statsAnswersBlock").hidden = false;
      $("statsAnswersHeading").textContent = `${t("Student answers")}: ${name}`;
      const container = $("statsAnswers"); container.replaceChildren();
      for (const q of questions) {
        const div = el("div"); div.className = "stats-answer-row";
        div.append(el("strong", `${q.index + 1}. ${q.text}`));
        div.append(el("p", `${t("Correct answer")}: ${q.options[q.correctOption]}`));
        div.append(el("p", `${t("Selected answer")}: ${q.selectedOption === null ? t("skipped") : q.options[q.selectedOption]}`));
        container.append(div);
      }
      notice("");
    } catch (err) {notice(err.message || "Request failed");}
  }
  $("statsRefresh").addEventListener("click", () => {++loadRevision;currentSession = null;$("statsDetails").hidden = true;list().catch(err => notice(err.message));});
  (async () => {
    try {
      const me = await request("/me");
      isAdmin = me.status === "admin";
      if (!isAdmin && !(me.status === "approved" && me.profile?.canCreateTests)) {
        location.replace(me.status === "approved" ? "/practice.html" : "/account.html"); return;
      }
      $("statsAdminLink").hidden = !isAdmin;
      $("statsAdminOnly").hidden = !isAdmin;
      $("statsWorkspace").hidden = false;
      await list();
    } catch (err) {notice(err.message || "Unable to verify your account. Please refresh and try again.");}
  })();
})();
