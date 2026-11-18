const msg = document.getElementById("message");
const tbody = document.getElementById("students");
async function api(path, method = "GET", body) {
  const response = await fetch(`/api${path}`, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionStorage.getItem("eaglesIdToken") || ""}` }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || "Request failed"); return data;
}
function select(values, value) { const s = document.createElement("select"); for (const v of values) { const o = document.createElement("option"); o.value = v; o.textContent = v; s.append(o); } s.value = value; return s; }
function checkbox(value) { const c = document.createElement("input"); c.type = "checkbox"; c.checked = !!value; return c; }
function cell(row, element) { const td = row.insertCell(); if (typeof element === "string") td.textContent = element; else td.append(element); }
async function load() {
  msg.textContent = "Loading..."; tbody.replaceChildren();
  try {
    const { students } = await api("/admin/students");
    for (const p of students.filter(x => x.role === "student")) {
      const row = tbody.insertRow(); cell(row, `${p.firstName || ""} ${p.lastName || ""}`); cell(row, p.groupName || ""); cell(row, p.email || "");
      const status = select(["pending", "approved", "rejected"], p.approvalStatus); cell(row, status);
      const active = checkbox(p.isActive), tests = checkbox(p.canCreateTests), reviews = checkbox(p.canWriteReviews);
      cell(row, active); cell(row, tests); cell(row, reviews);
      const save = document.createElement("button"); save.textContent = "Save";
      save.addEventListener("click", async () => {
        try { await api(`/admin/students/${encodeURIComponent(p.uid)}`, "PATCH", { approvalStatus: status.value, isActive: active.checked, canCreateTests: tests.checked, canWriteReviews: reviews.checked }); msg.textContent = "Saved"; }
        catch (e) { msg.textContent = e.message; }
      }); cell(row, save);
    }
    msg.textContent = `${students.length} profiles loaded`;
  } catch (e) { msg.textContent = e.message + ". Sign in with an approved admin account first."; }
}
document.getElementById("refresh").addEventListener("click", load); load();
