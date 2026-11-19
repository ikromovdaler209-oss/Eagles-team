const msg = document.getElementById("message");
const show = text => { msg.textContent = window.eaglesTranslate(text); };
for (const id of ["register", "login"]) {
  document.getElementById(id).addEventListener("submit", async e => {
    e.preventDefault(); const form = new FormData(e.currentTarget); show("Please wait...");
    try {
      await firebaseAuth(id === "register" ? "signUp" : "signInWithPassword", form.get("email"), form.get("password"));
      if (id === "register") {
        await request("/profile", { method: "POST", body: JSON.stringify({ firstName: form.get("firstName"), lastName: form.get("lastName"), groupName: form.get("groupName") }) });
      }
      const {status} = await request("/me");
      location.replace(status === "admin" ? "/admin.html" : "/student-dashboard.html");
    } catch (error) {
      if (error instanceof TypeError) {
        show("Connection error. Please check your internet connection and try again.");
      } else {
        show(Object.hasOwn(window.eaglesCopy, error.message) ? error.message : "Request failed");
      }
    }
  });
}
