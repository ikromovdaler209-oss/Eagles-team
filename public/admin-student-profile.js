"use strict";
(() => {
  const byId = id => document.getElementById(id);
  const tabs = Array.from(document.querySelectorAll('[role="tab"][data-tab]'));
  const panels = {
    overview: byId("panelOverview"), quiz: byId("panelQuiz"),
    practice: byId("panelPractice"), account: byId("panelAccount")
  };
  const notice = byId("profileNotice");
  const workspace = byId("profileWorkspace");
  const uid = new URLSearchParams(location.search).get("uid");
  let refreshVersion = 0;
  const setText = (id, value) => { byId(id).textContent = value == null || value === "" ? "—" : String(value); };
  const fmtPercent = n => Number.isFinite(n) ? `${n}%` : "—";
  const fmtDate = value => {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleDateString("en-GB", {year:"numeric",month:"short",day:"numeric"}) : "—";
  };
  function appendRow(target, label, value) {
    const term = document.createElement("dt"), detail = document.createElement("dd");
    term.textContent = label;
    detail.textContent = value == null || value === "" ? "—" : String(value);
    target.append(term, detail);
  }
  function setRows(id, pairs) {
    const list = byId(id);
    list.replaceChildren();
    for (const [label, value] of pairs) appendRow(list, label, value);
  }
  function switchTab(next, focus = false) {
    tabs.forEach(button => {
      const active = button.dataset.tab === next;
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
      panels[button.dataset.tab].hidden = !active;
      if (active && focus) button.focus();
    });
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
    tab.addEventListener("keydown", event => {
      let targetIndex = index;
      if (event.key === "ArrowRight") targetIndex = (index + 1) % tabs.length;
      else if (event.key === "ArrowLeft") targetIndex = (index + tabs.length - 1) % tabs.length;
      else if (event.key === "Home") targetIndex = 0;
      else if (event.key === "End") targetIndex = tabs.length - 1;
      else return;
      event.preventDefault();
      switchTab(tabs[targetIndex].dataset.tab, true);
    });
  });
  function empty(container, message) {
    const item = document.createElement("p");
    item.className = "inspection-empty";
    item.textContent = message;
    container.append(item);
  }
  function resultItem(parent, title, percent, description, feedback) {
    const item = document.createElement("article");
    item.className = "inspection-result";
    const heading = document.createElement("div");
    heading.className = "inspection-result-head";
    const label = document.createElement("strong");
    label.className = "inspection-result-title";
    label.textContent = title;
    heading.append(label);
    if (percent != null) {
      const accuracy = document.createElement("strong");
      accuracy.className = "inspection-result-percent";
      accuracy.textContent = fmtPercent(percent);
      heading.append(accuracy);
    }
    const details = document.createElement("p");
    details.className = "inspection-result-description";
    details.textContent = description;
    item.append(heading, details);
    if (Number.isFinite(percent)) {
      const meter = document.createElement("div");
      meter.className = "inspection-meter";
      meter.setAttribute("role", "meter");
      meter.setAttribute("aria-label", "Accuracy");
      meter.setAttribute("aria-valuemin", "0");
      meter.setAttribute("aria-valuemax", "100");
      meter.setAttribute("aria-valuenow", String(Math.min(100, Math.max(0, percent))));
      const fill = document.createElement("span");
      fill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
      meter.append(fill);
      item.append(meter);
    }
    if (feedback) {
      const comment = document.createElement("p");
      comment.className = "inspection-review-comment";
      comment.textContent = feedback;
      item.append(comment);
    }
    parent.append(item);
  }
  function drawResults(id, data, type) {
    const target = byId(id);
    target.replaceChildren();
    if (!data.items.length) {
      empty(target, type === "speaking" ? "No submitted Speaking recordings yet." : "No completed tests yet.");
      return;
    }
    for (const item of data.items) {
      if (type === "speaking") {
        const overall = item.review?.overall;
        const status = item.status === "reviewed" ? `Reviewed${Number.isFinite(overall) ? ` · IELTS practice band ${overall}` : ""}` : "Pending review";
        const audio = item.audioAvailable ? "Audio available to administrators" : "Audio not available";
        resultItem(target, `Part ${item.part} · ${item.prompt}`, null,
          `${status} · ${fmtDate(item.createdAt)} · ${audio}`, item.review?.feedback);
        if (item.audioAvailable) {
          const entry = target.lastElementChild;
          const listen = document.createElement("button");
          listen.type = "button";
          listen.className = "inspection-listen";
          listen.textContent = "Listen to recording";
          listen.addEventListener("click", async () => {
            listen.disabled = true;
            listen.textContent = "Loading audio...";
            try {
              const result = await request(`/speaking/submissions/${encodeURIComponent(item.id)}/audio`);
              const url = new URL(result.url);
              if (url.protocol !== "https:") throw new Error("Invalid audio URL");
              let player = entry.querySelector("audio");
              if (!player) {
                player = document.createElement("audio");
                player.controls = true;
                player.preload = "none";
                player.className = "inspection-audio";
                entry.append(player);
              }
              player.src = url.href;
              listen.textContent = "Refresh audio link";
            } catch (_) {
              listen.textContent = "Audio unavailable — retry";
            } finally { listen.disabled = false; }
          });
          entry.append(listen);
        }
      } else {
        const breakdown = `${item.correct}/${item.total} correct · ${item.wrong} wrong · ${item.skipped} skipped`;
        resultItem(target, item.title, item.accuracy, `${breakdown} · ${fmtDate(item.completedAt)}`);
      }
    }
  }
  function render(payload) {
    const {student, overview, quiz, reading, speaking, activity} = payload;
    const name = [student.firstName, student.lastName].filter(Boolean).join(" ") || "Unnamed student";
    setText("studentName", name);
    setText("studentEmail", student.email);
    setText("studentAvatar", [student.firstName?.[0], student.lastName?.[0]].filter(Boolean).join("").toUpperCase() || "S");
    document.title = `${name} · Student Profile — Eagles Team`;
    for (const [id, text, value] of [
      ["studentApproval", student.approvalStatus, student.approvalStatus],
      ["studentActive", student.isActive ? "Active" : "Inactive", student.isActive ? "active" : "inactive"]]) {
      const element = byId(id);
      element.textContent = text;
      element.dataset.state = value;
    }
    byId("overviewLimited").hidden = !(quiz.limited || reading.limited || speaking.limited);
    setText("metricQuizCount", quiz.limited ? `${overview.quiz.count}+` : overview.quiz.count);
    setText("metricQuizAverage", fmtPercent(overview.quiz.average));
    setText("metricReadingCount", reading.limited ? `${overview.reading.count}+` : overview.reading.count);
    setText("metricReadingAverage", fmtPercent(overview.reading.average));
    setText("metricSpeakingCount", speaking.limited ? `${overview.speaking.submitted}+` : overview.speaking.submitted);
    setText("metricSpeakingReviewed", overview.speaking.reviewed);
    setRows("overviewIdentity", [
      ["Study group", student.groupName || "Not assigned"],
      ["Account status", student.approvalStatus],
      ["Registered", fmtDate(student.registeredAt)]
    ]);
    setRows("accountIdentity", [
      ["Full name", name], ["Email", student.email],
      ["Study group", student.groupName || "Not assigned"],
      ["User ID", student.uid], ["Registered", fmtDate(student.registeredAt)],
      ["Profile updated", fmtDate(student.updatedAt)]
    ]);
    setRows("accountPermissions", [
      ["Role", student.role], ["Approval", student.approvalStatus],
      ["Active", student.isActive ? "Yes" : "No"],
      ["Can create tests", student.canCreateTests ? "Yes" : "No"],
      ["Can write reviews", student.canWriteReviews ? "Yes" : "No"]
    ]);
    const timeline = byId("overviewActivity");
    timeline.replaceChildren();
    if (!activity.length) empty(timeline, "No account activity available.");
    else for (const event of activity) {
      const item = document.createElement("li");
      const title = document.createElement("span"); title.textContent = event.type;
      const when = document.createElement("time"); when.textContent = fmtDate(event.date);
      if (event.date) when.dateTime = event.date;
      item.append(title, when); timeline.append(item);
    }
    setText("quizTotal", `${overview.quiz.count} completed tests · Avg. ${fmtPercent(overview.quiz.average)} · Best ${fmtPercent(overview.quiz.best)}`);
    setText("readingTotal", `(${overview.reading.count})`);
    setText("speakingTotal", `(${overview.speaking.submitted})`);
    byId("quizLimited").hidden = !quiz.limited;
    byId("readingLimited").hidden = !reading.limited;
    byId("speakingLimited").hidden = !speaking.limited;
    drawResults("quizResultsList", quiz, "quiz");
    drawResults("readingResultsList", reading, "reading");
    drawResults("speakingResultsList", speaking, "speaking");
  }
  async function load() {
    const run = ++refreshVersion;
    notice.hidden = false;
    byId("retryProfile").hidden = true;
    notice.textContent = "Loading student profile...";
    try {
      const me = await request("/me");
      if (run !== refreshVersion) return;
      if (me.status !== "admin") {
        notice.textContent = "Administrator access required.";
        workspace.hidden = true;
        return;
      }
      if (!uid || !/^[A-Za-z0-9_-]{6,128}$/.test(uid)) {
        notice.textContent = "Invalid student profile link. Return to Admin Page.";
        workspace.hidden = true;
        return;
      }
      const data = await request(`/admin/students/${encodeURIComponent(uid)}/profile`);
      if (run !== refreshVersion) return;
      render(data);
      workspace.hidden = false;
      notice.hidden = true;
    } catch (error) {
      if (run !== refreshVersion) return;
      workspace.hidden = true;
      if (error.code === 401) {
        location.replace("/account.html");
        return;
      }
      byId("retryProfile").hidden = error.code !== 403 && error.code !== 404;
      notice.textContent = error.code === 403 ? "Administrator access required." :
        error.code === 404 ? "Student not found or no longer available." :
        "Unable to load this profile. Please try again or return to Admin Page.";
    }
  }
  byId("profileRefresh").addEventListener("click", load);
  byId("retryProfile").addEventListener("click", load);
  window.addEventListener("pageshow", event => {if (event.persisted) load();});
  load();
})();
