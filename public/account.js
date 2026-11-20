const msg = document.getElementById("message");
let submitting = false;
const show = text => { msg.textContent = window.eaglesTranslate(text); };
for (const id of ["register", "login"]) {
  document.getElementById(id).addEventListener("submit", async e => {
    e.preventDefault(); submitting = true;
    const form = new FormData(e.currentTarget); show("Please wait...");
    try {
      await firebaseAuth(id === "register" ? "signUp" : "signInWithPassword", form.get("email"), form.get("password"));
      if (id === "register") {
        // Account creation and profile creation are separate operations.
        // A failed profile request must not be reported as a failed Firebase sign-up.
        try {
          await request("/profile", { method: "POST", body: JSON.stringify({ firstName: form.get("firstName"), lastName: form.get("lastName"), groupName: form.get("groupName") }) });
        } catch (profileError) {
          show("Account created, but profile setup could not be completed. Please sign in again to finish your profile.");
          return;
        }
      }
      const {status} = await request("/me");
      location.replace(status === "admin" ? "/admin.html" : "/student-dashboard.html");
    } catch (error) {
      if (error instanceof TypeError) {
        show("Connection error. Please check your internet connection and try again.");
      } else {
        show(error.message || "Request failed");
      }
    } finally { submitting = false; }
  });
}

// Returning users keep their Firebase session and go directly to their workspace.
// /api/me, not a locally saved role, determines the destination.
(async () => {
  if (!hasAuthSession()) return;
  try {
    const {status} = await request("/me");
    if (!submitting) location.replace(status === "admin" ? "/admin.html" : "/student-dashboard.html");
  } catch (error) {
    // Expired/revoked sessions are cleared by request(). Temporary 503s do not erase login.
    if (!submitting && error.code !== 401) show(error.message || "Request failed");
  }
})();
