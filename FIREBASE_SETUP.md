# Firebase setup (Eagles Team)

1. Keep the existing Firestore deny-all rules in `firestore.rules`. The Express server uses Firebase Admin SDK and does not rely on client rules.
2. In Render environment variables, set `FIREBASE_SERVICE_ACCOUNT_JSON` to the **entire** service-account JSON generated in Firebase Console > Project settings > Service accounts. Never commit it or paste it into chat. Restrict Render dashboard access. Alternatively configure Application Default Credentials.
3. Set `ALLOWED_ORIGINS` to your actual HTTPS website origin (for example `https://eagles-team.onrender.com`).
4. Run `npm install` and `npm start` locally with valid server environment variables (`BOT_TOKEN`, `CHAT_IDS`, and Firebase credentials).
5. Open `/account.html` to register the intended admin email and create its pending profile.
6. **Once only**, in a trusted terminal with Firebase credentials configured, run `ADMIN_BOOTSTRAP_EMAIL=you@example.com npm run bootstrap:admin`. Verify the email before using this bootstrap. Remove the bootstrap email variable afterwards. The script refuses to run if an admin already exists.
7. Sign in again at `/account.html`, then open `/admin.html`.

The existing `/Eagles-register.html` is still the public Telegram admission form. `/account.html` is for registered students.

**Known limitations before production:** this is an initial integration, not a complete security audit. The account token is held in tab sessionStorage; signing in again is needed after token expiration. Firebase Authentication signup creates the auth user before the server creates the Firestore profile; if the second step fails, a retry/recovery flow is needed. Add email verification, password reset, anti-abuse/App Check, audit logs, pagination, and comprehensive automated integration tests before broad rollout. A trusted backend can bypass Firestore Security Rules, so API authorization must remain strict. Firebase account registration alone does not grant access to protected student features; future endpoints must check approval status and permissions.
