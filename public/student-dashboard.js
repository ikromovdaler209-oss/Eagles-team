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
  let ownUid;
  let revision = 0;
  const supportedLanguages = ["en", "ru", "uz"];
  const getLanguage = () => supportedLanguages.includes(localStorage.getItem("eaglesLanguage"))
    ? localStorage.getItem("eaglesLanguage") : "en";
  const emailMessage = message => { el("emailChangeFeedback").textContent = t(message); };
  const firebaseErrors = {
    EMAIL_EXISTS: "This email is already in use.",
    INVALID_EMAIL: "Enter a valid email address.",
    INVALID_LOGIN_CREDENTIALS: "Incorrect current password.",
    INVALID_PASSWORD: "Incorrect current password.",
    EMAIL_NOT_FOUND: "Incorrect current password.",
    TOO_MANY_ATTEMPTS_TRY_LATER: "Too many attempts. Please try again later.",
    OPERATION_NOT_ALLOWED: "Email changes are not available for this account.",
    CREDENTIAL_TOO_OLD_LOGIN_AGAIN: "Please sign in again and retry.",
    INVALID_ID_TOKEN: "Please sign in again and retry."
  };
  async function firebaseAccountRequest(method, body, languageHeader = false) {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${method}?key=${API_KEY}`, {
      method: "POST", headers: {"Content-Type":"application/json",
        ...(languageHeader ? {"X-Firebase-Locale": getLanguage() === "uz" ? "en" : getLanguage()} : {})},
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = String(data?.error?.message || "").split(/\s*:/)[0];
      throw new Error(firebaseErrors[code] || "Unable to update email. Please try again.");
    }
    return data;
  };

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
      const {summary, results, totalResults, limited} = await request("/quiz-results/mine");
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
        const head = document.createElement("div"); head.className = "quiz-history-item-head";
        const accuracy = document.createElement("strong"); accuracy.className = "quiz-history-accuracy";
        accuracy.textContent = formatAccuracy(item.accuracy);
        head.append(title, accuracy);
        const track = document.createElement("div"); track.className = "quiz-history-track";
        track.setAttribute("role", "meter");
        track.setAttribute("aria-label", t("Your result"));
        track.setAttribute("aria-valuemin", "0");
        track.setAttribute("aria-valuemax", "100");
        const numericAccuracy = Number(item.accuracy);
        const safeAccuracy = Number.isFinite(numericAccuracy) ? Math.max(0, Math.min(100, numericAccuracy)) : 0;
        track.setAttribute("aria-valuenow", String(safeAccuracy));
        const fill = document.createElement("span"); fill.style.width = `${safeAccuracy}%`;
        track.append(fill);
        li.append(head, details, track); list.append(li);
      }
      state.textContent = limited ? "Only the first 1,000 results are included; summary statistics may be incomplete." :
        (totalResults ? "" : t("No test results yet."));
      el("recentQuizzesHeading").hidden = !totalResults;
      content.hidden = false;
    } catch (error) {
      if (rev !== revision) return;
      state.textContent = t("Unable to load test results. Try Refresh.");
    }
  }
  async function loadReadingHistory(rev) {
    const summary = el("readingSummary"), list = el("readingHistory");
    list.replaceChildren();
    summary.textContent = t("Loading test results...");
    try {
      const rows = await request("/reading/mine");
      if (rev !== revision) return;
      if (!rows.length) { summary.textContent = t("No test results yet."); return; }
      const values = rows.map(r => r.accuracy);
      const mean = Math.round(values.reduce((a,b) => a+b,0) / values.length);
      summary.textContent = t("Attempts")+" · "+rows.length+" · "+t("Average")+" "+mean+"% · "+t("Best result")+" "+Math.max(...values)+"%";
      const previous = new Map(), entries = [];
      for (const r of [...rows].reverse()) {
        const delta = previous.has(r.testId) ? Math.round((r.accuracy-previous.get(r.testId))*10)/10 : null;
        previous.set(r.testId,r.accuracy);
        const li = document.createElement("li");
        li.textContent = r.title+" · "+new Date(r.completed).toLocaleDateString(document.documentElement.lang)+" · "+r.correct+"/"+r.total+" · "+r.accuracy+"%"+(delta === null ? "" : " ("+(delta>0?"+":"")+delta+" "+t("percentage points")+")");
        entries.push(li);
      }
      list.replaceChildren(...entries.reverse());
    } catch { if (rev === revision) summary.textContent = t("Unable to load test results. Try Refresh."); }
  }
  async function loadSpeakingHistory(rev) {
    const summary=el("speakingSummary"), list=el("speakingDashboardHistory");
    if(!summary||!list)return;
    summary.textContent=t("Loading speaking answers...");list.replaceChildren();
    try {
      const {submissions=[]}=await request("/speaking/mine");
      if(rev!==revision)return;
      const reviewed=submissions.filter(x=>x.status==="reviewed");
      summary.textContent=submissions.length?`${submissions.length} ${t("submissions")} · ${reviewed.length} ${t("reviewed")}`:t("No speaking answers submitted yet.");
      for(const row of submissions.slice(0,8)) {
        const li=document.createElement("li");
        const title=document.createElement("strong");title.textContent=`Part ${row.part} · ${row.prompt}`;
        const detail=document.createElement("span");
        detail.textContent=(row.status==="reviewed"?`${t("Practice band estimate")}: ${row.review?.overall ?? "—"}`:t("Pending review"))+
          (row.createdAt?` · ${new Date(row.createdAt).toLocaleDateString(document.documentElement.lang)}`:"");
        li.append(title,detail);
        if(row.review?.feedback){
          const feedback=document.createElement("p");
          feedback.textContent=row.review.feedback;li.append(feedback);
        }
        list.append(li);
      }
    } catch {if(rev===revision)summary.textContent=t("Unable to load speaking answers.");}
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
      ownUid = data.uid;
      email = p.email;
      el("dashboardBuilderLink").hidden = p.canCreateTests !== true;
      el("welcome").textContent = p.firstName;
      el("studentInitials").textContent = [p.firstName, p.lastName]
        .filter(Boolean).map(part => String(part).trim().charAt(0).toLocaleUpperCase()).join("").slice(0, 2) || "E";
      el("studentIdentityEmail").textContent = email || "";
      el("studentCurrentEmail").textContent = email || "—";
      el("studentLanguageSelect").value = getLanguage();
      el("studentIdentityGroup").textContent = p.groupName || "—";
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
      await Promise.all([loadQuizHistory(rev),loadReadingHistory(rev),loadSpeakingHistory(rev)]);
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
  el("studentLanguageSelect").addEventListener("change", event => {
    const language = event.target.value;
    if (!supportedLanguages.includes(language)) return;
    try { localStorage.setItem("eaglesLanguage", language); }
    catch { emailMessage("Unable to save language preference in this browser."); return; }
    // Translate from the original English strings. Re-running the page's initial
    // translation over already translated DOM nodes would be inconsistent.
    location.reload();
  });
  el("changeEmail").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget, button = form.querySelector("button");
    const newEmail = form.elements.newEmail.value.trim();
    const password = form.elements.password.value;
    if (!email || !ownUid || !newEmail || !password) return;
    if (newEmail.toLowerCase() === email.toLowerCase()) {
      emailMessage("This is already your account email.");
      return;
    }
    button.disabled = true;
    emailMessage("Please wait...");
    try {
      // Freshly authenticate the same UID, without overwriting the existing
      // persisted browser session or using the account profile as an auth source.
      const proof = await firebaseAccountRequest("signInWithPassword", {
        email, password, returnSecureToken: true
      });
      if (proof.localId !== ownUid) throw new Error("Please sign in again and retry.");
      await firebaseAccountRequest("sendOobCode", {
        requestType: "VERIFY_AND_CHANGE_EMAIL", idToken: proof.idToken, newEmail
      }, true);
      form.reset();
      emailMessage("Verification sent. Check your new inbox, then confirm the change.");
    } catch (error) { emailMessage(error.message || "Unable to update email. Please try again."); }
    finally { button.disabled = false; }
  });
  el("checkChangedEmail").addEventListener("click", async event => {
    const button = event.currentTarget;
    button.disabled = true;
    emailMessage("Checking verified email...");
    try {
      const result = await request("/profile/sync-email", {method: "POST"});
      if (result.updated || result.email !== email) {
        await load();
        emailMessage("Email address updated successfully.");
      } else {
        emailMessage("Email not changed yet. Confirm the link in your new inbox first.");
      }
    } catch (error) {
      if (error.code === 401) { failure(error); return; }
      emailMessage("Unable to check email. Please sign in again if you confirmed the link.");
    } finally { button.disabled = false; }
  });
  el("logout").addEventListener("click", logout);
  el("retry").addEventListener("click", load);
  window.addEventListener("pageshow", event => { if (event.persisted) load(); });
  load();
})();
