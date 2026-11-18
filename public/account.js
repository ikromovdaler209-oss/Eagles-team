const API_KEY = "AIzaSyBy_OdMjVSNgUnCwH5B0frP2OL1R1st_eM";
const msg = document.getElementById("message");
const show = text => { msg.textContent = text; };
async function firebaseAuth(action, email, password) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${action}?key=${API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Authentication failed");
  sessionStorage.setItem("eaglesIdToken", data.idToken);
  return data.idToken;
}
async function request(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionStorage.getItem("eaglesIdToken") || ""}`, ...options.headers }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}
for (const id of ["register", "login"]) {
  document.getElementById(id).addEventListener("submit", async e => {
    e.preventDefault(); const form = new FormData(e.currentTarget); show("Please wait...");
    try {
      await firebaseAuth(id === "register" ? "signUp" : "signInWithPassword", form.get("email"), form.get("password"));
      if (id === "register") {
        await request("/profile", { method: "POST", body: JSON.stringify({ firstName: form.get("firstName"), lastName: form.get("lastName"), groupName: form.get("groupName") }) });
      }
      const { profile } = await request("/me");
      show(!profile ? "Account created. Profile setup required." : profile.approvalStatus === "pending" ? "Registration pending administrator approval." : profile.approvalStatus === "rejected" ? "Registration was rejected." : "Signed in successfully.");
      if (profile?.role === "admin" && profile.approvalStatus === "approved") location.href = "/admin.html";
    } catch (error) { show(error.message); }
  });
}
