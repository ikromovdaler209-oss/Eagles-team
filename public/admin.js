const msg = document.getElementById("message");
const tbody = document.getElementById("students");
async function api(path, method = "GET", body) {
  return request(path, {method, ...(body ? {body: JSON.stringify(body)} : {})});
}
function select(values, value) { const s = document.createElement("select"); for (const v of values) { const o = document.createElement("option"); o.value = v; o.textContent = v; s.append(o); } s.value = value; return s; }
function checkbox(value) { const c = document.createElement("input"); c.type = "checkbox"; c.checked = !!value; return c; }
function cell(row, element) { const td = row.insertCell(); if (typeof element === "string") td.textContent = element; else td.append(element); }
async function load() {
  msg.textContent = "Loading..."; tbody.replaceChildren();
  try {
    const { students } = await api("/admin/students");
    for (const p of students.filter(x => x.role === "student")) {
      const row = tbody.insertRow(); cell(row, `${p.firstName || ""} ${p.lastName || ""}`); const group = document.createElement("input");
      group.value = p.groupName || "";
      group.maxLength = 70;
      group.setAttribute("aria-label", "Study group");
      cell(row, group); cell(row, p.email || "");
      const status = select(["pending", "approved", "rejected"], p.approvalStatus); cell(row, status);
      const active = checkbox(p.isActive), tests = checkbox(p.canCreateTests), reviews = checkbox(p.canWriteReviews);
      cell(row, active); cell(row, tests); cell(row, reviews);
      const save = document.createElement("button"); save.textContent = "Save";
      save.addEventListener("click", async () => {
        try { await api(`/admin/students/${encodeURIComponent(p.uid)}`, "PATCH", { groupName: group.value, approvalStatus: status.value, isActive: active.checked, canCreateTests: tests.checked, canWriteReviews: reviews.checked }); await load(); msg.textContent = "Saved"; }
        catch (e) { msg.textContent = e.message; }
      }); cell(row, save);
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = "View profile";
      details.append(summary);
      const info = document.createElement("p");
      info.textContent = [p.firstName, p.lastName, p.email, p.groupName,
        "No learning progress recorded.", "See Quiz statistics for completed test results.",
        ...p.activity.map(event => (event.type === "registered" ? "Registered" : "Profile updated") + " · " + new Date(event.date).toLocaleDateString("en"))].join(" · ");
      details.append(info);
      cell(row, details);
    }
    msg.textContent = `${students.length} profiles loaded`;
  } catch (e) { msg.textContent = e.message + ". Sign in with an approved admin account first."; }
}
document.getElementById("refresh").addEventListener("click", load);
async function checkAdminAccess() {
  const note = document.getElementById("adminAccessMessage");
  try {
    const me = await request("/me");
    if (me.status !== "admin") {
      location.replace(me.status === "approved" ? "/student-dashboard.html" : "/account.html");
      return;
    }
    note.hidden = true;
    document.getElementById("adminWorkspace").hidden = false;
    await load();
  } catch (error) {
    if (error.code === 401) return location.replace("/account.html");
    note.textContent = error.message || "Unable to verify admin access";
  }
}
checkAdminAccess();

document.getElementById("signout").addEventListener("click", () => {
  clearSession();
  location.replace("/account.html");
});
window.addEventListener("pageshow", event => {
  if (event.persisted) checkAdminAccess();
});
