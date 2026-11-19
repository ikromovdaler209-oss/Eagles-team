const API_KEY = "AIzaSyBy_OdMjVSNgUnCwH5B0frP2OL1R1st_eM";
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
  if (!response.ok) {
    if (response.status === 401) sessionStorage.removeItem("eaglesIdToken");
    throw Object.assign(new Error(data.error || "Request failed"), {code: response.status, status: data.status});
  }
  return data;
}
