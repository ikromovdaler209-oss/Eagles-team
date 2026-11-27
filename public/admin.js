"use strict";
const msg = document.getElementById("message");
const tbody = document.getElementById("students");
const studentSearch = document.getElementById("studentSearch");
const studentStatusFilter = document.getElementById("studentStatusFilter");
let loadedStudents = [];
let studentRosterLimited = false;

async function api(path, method = "GET", body) {
  return request(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
}

function select(values, value) {
  const element = document.createElement("select");
  for (const item of values) {
    const option = document.createElement("option");
    option.value = item;
    option.textContent = item;
    element.append(option);
  }
  element.value = value;
  return element;
}

function checkbox(value, label) {
  const element = document.createElement("input");
  element.type = "checkbox";
  element.checked = !!value;
  element.setAttribute("aria-label", label);
  return element;
}

function cell(row, label, content) {
  const td = row.insertCell();
  td.dataset.label = label;
  if (typeof content === "string") td.textContent = content;
  else td.append(content);
  return td;
}

function updateMetrics(students) {
  const count = predicate => students.filter(predicate).length;
  document.getElementById("adminTotalStudents").textContent = String(students.length);
  document.getElementById("adminPendingStudents").textContent = String(count(p => p.approvalStatus === "pending"));
  document.getElementById("adminApprovedStudents").textContent = String(count(p => p.approvalStatus === "approved"));
  document.getElementById("adminInactiveStudents").textContent = String(count(p => p.isActive === false));
}

function renderStudents() {
  const phrase = studentSearch.value.trim().toLocaleLowerCase();
  const filter = studentStatusFilter.value;
  const filtered = loadedStudents.filter(p => {
    const matchesSearch = [p.firstName, p.lastName, p.email, p.groupName]
      .some(value => String(value || "").toLocaleLowerCase().includes(phrase));
    const matchesStatus = filter === "all" || (filter === "inactive" ? p.isActive === false : p.approvalStatus === filter);
    return matchesSearch && matchesStatus;
  });
  tbody.replaceChildren();

  for (const p of filtered) {
    const fullName = [p.firstName, p.lastName].filter(Boolean).join(" ").trim() || "Unnamed student";
    const row = tbody.insertRow();
    const name = document.createElement("strong");
    name.className = "admin-student-name";
    name.textContent = fullName;
    cell(row, "Student", name);

    const group = document.createElement("input");
    group.value = p.groupName || "";
    group.maxLength = 70;
    group.setAttribute("aria-label", `Study group for ${fullName}`);
    cell(row, "Group", group);
    cell(row, "Email", p.email || "—");

    const status = select(["pending", "approved", "rejected"], p.approvalStatus);
    status.className = "admin-status-select";
    status.dataset.status = status.value;
    status.setAttribute("aria-label", `Account status for ${fullName}`);
    status.addEventListener("change", () => { status.dataset.status = status.value; });
    cell(row, "Status", status);

    const active = checkbox(p.isActive, `Active account for ${fullName}`);
    const tests = checkbox(p.canCreateTests, `Can create tests for ${fullName}`);
    const reviews = checkbox(p.canWriteReviews, `Can write reviews for ${fullName}`);
    cell(row, "Active", active);
    cell(row, "Tests", tests);
    cell(row, "Reviews", reviews);

    const save = document.createElement("button");
    save.type = "button";
    save.className = "admin-save-button";
    save.textContent = "Save";
    save.addEventListener("click", async () => {
      save.disabled = true;
      try {
        await api(`/admin/students/${encodeURIComponent(p.uid)}`, "PATCH", {
          groupName: group.value,
          approvalStatus: status.value,
          isActive: active.checked,
          canCreateTests: tests.checked,
          canWriteReviews: reviews.checked
        });
        await load();
        msg.textContent = "Student profile saved.";
      } catch (error) {
        msg.textContent = error.message || "Unable to save student.";
        save.disabled = false;
      }
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.className = "admin-remove-student";
    remove.setAttribute("aria-label", `Remove ${fullName} from the student list`);
    remove.addEventListener("click", async () => {
      if (!confirm(`Remove ${fullName} (${p.email || p.groupName}) from the list and deactivate access? Their results will be kept.`)) return;
      remove.disabled = save.disabled = true;
      try {
        await api(`/admin/students/${encodeURIComponent(p.uid)}`, "DELETE");
        loadedStudents = loadedStudents.filter(student => student.uid !== p.uid);
        updateMetrics(loadedStudents);
        renderStudents();
        msg.textContent = "Student removed from the list.";
      } catch (error) {
        msg.textContent = error.message || "Unable to remove student.";
        remove.disabled = save.disabled = false;
      }
    });
    const actions = document.createElement("div");
    actions.className = "admin-row-actions";
    actions.append(save, remove);
    cell(row, "Action", actions);

    const profileLink = document.createElement("a");
    profileLink.className = "admin-profile-link";
    profileLink.href = `/admin-student-profile.html?uid=${encodeURIComponent(p.uid)}`;
    profileLink.textContent = "View profile →";
    profileLink.setAttribute("aria-label", `View ${fullName}'s student profile and results`);
    cell(row, "Profile and learning", profileLink);
  }
  msg.textContent = `${filtered.length} of ${loadedStudents.length} student profiles shown` +
    (studentRosterLimited ? " · More students exist; contact an administrator to enable paginated access." : "");
  if (!filtered.length) {
    const row = tbody.insertRow();
    const empty = row.insertCell();
    empty.colSpan = 9;
    empty.className = "admin-no-results";
    empty.textContent = "No students match these filters.";
  }
}

async function load() {
  msg.textContent = "Loading student profiles...";
  try {
    const { students, limited } = await api("/admin/students");
    studentRosterLimited = limited === true;
    loadedStudents = students.filter(p => p.role === "student");
    updateMetrics(loadedStudents);
    renderStudents();
  } catch (error) {
    studentRosterLimited = false;
    loadedStudents = [];
    tbody.replaceChildren();
    updateMetrics([]);
    msg.textContent = `${error.message}. Sign in with an approved admin account first.`;
  }
}

studentSearch.addEventListener("input", renderStudents);
studentStatusFilter.addEventListener("change", renderStudents);
document.getElementById("adminPendingMetric").addEventListener("click", () => {
  studentStatusFilter.value = "pending";
  renderStudents();
  document.getElementById("studentsSection").scrollIntoView({ behavior: "smooth", block: "start" });
});
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
