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
  saveSession(data);
  return data.idToken;
}
function saveSession(data) {
  if (data.idToken) sessionStorage.setItem("eaglesIdToken", data.idToken);
  if (data.refreshToken) sessionStorage.setItem("eaglesRefreshToken", data.refreshToken);
  if (data.expiresIn) sessionStorage.setItem("eaglesTokenExpiresAt", String(Date.now() + Number(data.expiresIn) * 1000));
}
function clearSession() {
  for (const key of ["eaglesIdToken", "eaglesRefreshToken", "eaglesTokenExpiresAt"]) sessionStorage.removeItem(key);
}
let refreshInFlight;
async function refreshSession() {
  if (refreshInFlight) return refreshInFlight;
  const refreshToken = sessionStorage.getItem("eaglesRefreshToken");
  if (!refreshToken) throw new Error("Authentication required");
  refreshInFlight = (async () => {
    const response = await fetch(`https://securetoken.googleapis.com/v1/token?key=${API_KEY}`, {
      method: "POST", headers: {"Content-Type": "application/x-www-form-urlencoded"},
      body: new URLSearchParams({grant_type: "refresh_token", refresh_token: refreshToken})
    });
    if (!response.ok) {
      if ([400, 401].includes(response.status)) clearSession();
      throw new Error(response.status >= 500 ? "Authentication service unavailable" : "Invalid session");
    }
    const data = await response.json();
    saveSession({idToken: data.id_token, refreshToken: data.refresh_token, expiresIn: data.expires_in});
    return data.id_token;
  })();
  try { return await refreshInFlight; } finally { refreshInFlight = null; }
}
async function request(path, options = {}) {
  const expiry = Number(sessionStorage.getItem("eaglesTokenExpiresAt") || 0);
  if (expiry && Date.now() >= expiry - 60000) await refreshSession();
  return sendRequest(path, options, true);
}
async function sendRequest(path, options, retry) {
  const response = await fetch(`/api${path}`, {
    ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionStorage.getItem("eaglesIdToken") || ""}`, ...options.headers }
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && retry && sessionStorage.getItem("eaglesRefreshToken")) {
    await refreshSession();
    return sendRequest(path, options, false);
  }
  if (!response.ok) {
    if (response.status === 401) clearSession();
    throw Object.assign(new Error(data.error || `Request failed (${response.status})`), {code: response.status, status: data.status});
  }
  return data;
}
