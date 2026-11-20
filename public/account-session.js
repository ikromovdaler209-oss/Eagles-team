const API_KEY = "AIzaSyBy_OdMjVSNgUnCwH5B0frP2OL1R1st_eM";
const AUTH_KEYS = ["eaglesIdToken", "eaglesRefreshToken", "eaglesTokenExpiresAt"];

// Keep Firebase REST credentials across browser restarts; never persist passwords.
// The legacy sessionStorage values are read for a one-time, non-disruptive migration.
function storedAuthValue(key) {
  try {
    const value = localStorage.getItem(key);
    if (value) return value;
  } catch (_) { /* Browser may restrict persistent storage. */ }
  try { return sessionStorage.getItem(key); }
  catch (_) { return null; }
}
function hasAuthSession() {
  return Boolean(storedAuthValue("eaglesIdToken") || storedAuthValue("eaglesRefreshToken"));
}
function migrateLegacySession() {
  let oldRefresh, oldId;
  try {
    oldRefresh = sessionStorage.getItem("eaglesRefreshToken");
    oldId = sessionStorage.getItem("eaglesIdToken");
    if (!oldRefresh && !oldId) return;
    if (localStorage.getItem("eaglesRefreshToken") || localStorage.getItem("eaglesIdToken")) {
      // Prefer the already-persisted session if both stores happen to contain credentials.
      AUTH_KEYS.forEach(key => sessionStorage.removeItem(key));
      return;
    }
    const keys = AUTH_KEYS.filter(key => sessionStorage.getItem(key));
    for (const key of keys) localStorage.setItem(key, sessionStorage.getItem(key));
    AUTH_KEYS.forEach(key => sessionStorage.removeItem(key));
  } catch (_) {
    // A failed migration must never sign a user out. Continue using sessionStorage.
    try {
      if (oldRefresh || oldId) AUTH_KEYS.forEach(key => localStorage.removeItem(key));
    } catch (_) { /* Persistent storage is unavailable. */ }
  }
}
migrateLegacySession();

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
  const values = [];
  if (data.idToken) values.push(["eaglesIdToken", data.idToken]);
  if (data.refreshToken) values.push(["eaglesRefreshToken", data.refreshToken]);
  if (data.expiresIn) values.push(["eaglesTokenExpiresAt", String(Date.now() + Number(data.expiresIn) * 1000)]);
  try {
    for (const [key, value] of values) localStorage.setItem(key, value);
    // Remove old tab-scoped credentials once the persistent copy is saved.
    AUTH_KEYS.forEach(key => sessionStorage.removeItem(key));
  } catch (_) {
    // Private browsing or storage restrictions: preserve the current tab's login.
    try { AUTH_KEYS.forEach(key => localStorage.removeItem(key)); } catch (_) { /* unavailable */ }
    for (const [key, value] of values) sessionStorage.setItem(key, value);
  }
}
function clearSession() {
  for (const key of AUTH_KEYS) {
    try { localStorage.removeItem(key); } catch (_) { /* unavailable */ }
    try { sessionStorage.removeItem(key); } catch (_) { /* unavailable */ }
  }
}
let refreshInFlight;
async function refreshSession() {
  if (refreshInFlight) return refreshInFlight;
  const refreshToken = storedAuthValue("eaglesRefreshToken");
  if (!refreshToken) throw new Error("Authentication required");
  refreshInFlight = (async () => {
    const response = await fetch(`https://securetoken.googleapis.com/v1/token?key=${API_KEY}`, {
      method: "POST", headers: {"Content-Type":"application/x-www-form-urlencoded"},
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
  const expiry = Number(storedAuthValue("eaglesTokenExpiresAt") || 0);
  if ((!storedAuthValue("eaglesIdToken") && storedAuthValue("eaglesRefreshToken")) ||
      (expiry && Date.now() >= expiry - 60000)) await refreshSession();
  return sendRequest(path, options, true);
}
async function sendRequest(path, options, retry) {
  const response = await fetch(`/api${path}`, {
    ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${storedAuthValue("eaglesIdToken") || ""}`, ...options.headers }
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && retry && storedAuthValue("eaglesRefreshToken")) {
    await refreshSession();
    return sendRequest(path, options, false);
  }
  if (!response.ok) {
    if (response.status === 401) clearSession();
    throw Object.assign(new Error(data.error || `Request failed (${response.status})`), {code: response.status, status: data.status});
  }
  return data;
}
