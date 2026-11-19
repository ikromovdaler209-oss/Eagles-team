const API_KEY = "AIzaSyBy_OdMjVSNgUnCwH5B0frP2OL1R1st_eM";
const msg = document.getElementById("message");
const show = text => { msg.textContent = window.eaglesTranslate(text); };
async function firebaseAuth(action, email, password) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${action}?key=${API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const data = await response.json();
  if (!response.ok) {
    const messages = {
      EMAIL_EXISTS: "This email is already registered.",
      INVALID_LOGIN_CREDENTIALS: "Check your email and password.",
      INVALID_PASSWORD: "Check your email and password.",
      EMAIL_NOT_FOUND: "Check your email and password.",
      INVALID_EMAIL: "Check your email and password.",
      USER_DISABLED: "This account is disabled.",
      WEAK_PASSWORD: "Choose a stronger password.",
      TOO_MANY_ATTEMPTS_TRY_LATER: "Too many attempts. Please try again later."
    };
    const code = data.error?.message?.split(/\s*:/)[0];
    throw new Error(messages[code] || "Authentication failed");
  }
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
    } catch (error) {
      if (error instanceof TypeError) {
        show("Connection error. Please check your internet connection and try again.");
      } else {
        show(Object.hasOwn(window.eaglesCopy, error.message) ? error.message : "Request failed");
      }
    }
  });
}
