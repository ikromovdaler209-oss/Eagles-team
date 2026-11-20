(() => {
  const el = id => document.getElementById(id);
  const t = window.eaglesTranslate;
  if (!t) return; // The language chooser redirect is already in progress.
  const statuses = {
    pending: "Your registration is awaiting approval.",
    rejected: "Your registration was rejected. Contact the centre.",
    inactive: "Your account is inactive. Contact the centre.",
    missing: "Complete your profile",
    approved: "Account status: Approved"
  };
  let email;
  let revision = 0;
  function logout() {
    clearSession();
    location.replace("/account.html");
  }
  function renderStatus(status) {
    el("workspace").hidden = status !== "approved";
    el("finishProfile").hidden = status !== "missing";
    el("state").textContent = t(statuses[status] || "Request failed");
    if (status === "admin") location.replace("/admin.html");
  }
  function failure(error) {
    if (error.code === 401) return logout();
    if (error.code === 403) renderStatus(error.status);
    el("feedback").textContent = t(Object.hasOwn(window.eaglesCopy, error.message) ? error.message : "Request failed");
  }
  const formatAccuracy = value => value === null || value === undefined ? "—" : `${value}%`;
  async function loadQuizHistory(rev) {
    const state = el("quizHistoryState"), content = el("quizHistoryContent"), list = el("quizHistoryList");
    state.textContent = t("Loading test results...");
    content.hidden = true;
    try {
      const {summary, results, totalResults} = await request("/quiz-results/mine");
      if (rev !== revision) return;
      el("quizTestsTaken").textContent = String(summary.testsTaken);
      el("quizAvgAccuracy").textContent = formatAccuracy(summary.averageAccuracy);
      el("quizBestAccuracy").textContent = formatAccuracy(summary.bestAccuracy);
      el("quizLatestAccuracy").textContent = formatAccuracy(summary.latestAccuracy);
      list.replaceChildren();
      for (const item of results) {
        const li = document.createElement("li");
        const title = document.createElement("strong"); title.textContent = item.quizTitle;
        const details = document.createElement("span");
        const when = item.completedAt ? new Date(item.completedAt).toLocaleDateString(document.documentElement.lang) : "";
        details.textContent = `${item.accuracy}% · ${item.correct}/${item.total} ${t("correct")} · ${item.wrong} ${t("wrong")} · ${item.skipped} ${t("skipped")} · ${when}`;
        li.append(title, details); list.append(li);
      }
      state.textContent = totalResults ? "" : t("No test results yet.");
      content.hidden = !totalResults;
    } catch (error) {
      if (rev !== revision) return;
      state.textContent = t("Unable to load test results. Try Refresh.");
    }
  }
  async function load() {
    const rev = ++revision;
    renderStatus("loading");
    el("state").textContent = t("Loading your account…");
    el("feedback").textContent = "";
    if (!hasAuthSession()) return logout();
    try {
      const data = await request("/dashboard");
      if (rev !== revision) return;
      renderStatus(data.status);
      const p = data.profile;
      email = p.email;
      el("dashboardBuilderLink").hidden = p.canCreateTests !== true;
      el("welcome").textContent = p.firstName;
      el("profile").replaceChildren();
      for (const [label, value] of [["First name",p.firstName],["Last name",p.lastName],["Email",email],["Study group",p.groupName]]) {
        const dt = document.createElement("dt"), dd = document.createElement("dd");
        dt.textContent = t(label);
        dd.textContent = value;
        el("profile").append(dt, dd);
      }
      el("edit").elements.firstName.value = p.firstName;
      el("edit").elements.lastName.value = p.lastName;
      el("activity").replaceChildren();
      for (const event of data.activity) {
        const li = document.createElement("li");
        li.textContent = t(event.type === "registered" ? "Registered" : "Profile updated") + " · " + new Date(event.date).toLocaleDateString(document.documentElement.lang);
        el("activity").append(li);
      }
      if (!data.activity.length) el("activity").textContent = t("No recent activity.");
      await loadQuizHistory(rev);
    } catch (error) {
      if (rev !== revision) return;
      if (error.code === 403) return renderStatus(error.status);
      el("state").textContent = t("Request failed");
      failure(error);
    }
  }
  for (const id of ["edit","finishProfile","password"]) {
    el(id).addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget, button = form.querySelector("button");
      const fields = Object.fromEntries(new FormData(form));
      button.disabled = true;
      el("feedback").textContent = t("Please wait...");
      try {
        if (id === "password") {
          await request("/dashboard");
          const token = await firebaseAuth("signInWithPassword", email, fields.current);
          const response = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:update?key=" + API_KEY, {
            method: "POST", headers: {"Content-Type":"application/json"},
            body: JSON.stringify({idToken:token,password:fields.newPassword,returnSecureToken:true})
          });
          if (!response.ok) throw new Error("Request failed");
          form.reset();
          return logout();
        }
        await request("/profile", {method:id === "edit" ? "PATCH" : "POST",body:JSON.stringify(fields)});
        await load();
      } catch (error) { failure(error); }
      finally { button.disabled = false; }
    });
  }
  el("logout").addEventListener("click", logout);
  el("retry").addEventListener("click", load);
  window.addEventListener("pageshow", event => { if (event.persisted) load(); });
  load();
})();
