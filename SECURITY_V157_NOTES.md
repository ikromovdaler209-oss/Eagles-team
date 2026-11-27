# Eagles Team v1.5.7 — Security hardening notes

## Applied changes

- `server/server.js` now calls `app.set("trust proxy", trustedProxyHops())` before installing IP-based rate limits. On Render (`RENDER=true`) the default is **one** trusted hop; on local Node the default is **zero**. You can set `TRUST_PROXY_HOPS` to an integer from `0` to `5` only after verifying the actual proxy chain. **Do not set Express `trust proxy` to boolean `true`**, which can trust a forged `X-Forwarded-For` header.
- `/api/admin/students` reads at most 1,001 documents and returns at most 1,000 profiles. `limited: true` indicates more exist; Admin Page displays a warning. These are **not** all students if a roster exceeds 1,000.
- `/api/quiz-results/mine` reads at most 1,001 result documents, summarises at most 1,000, and returns `limited: true` if the result is partial. Student Dashboard displays a warning. For older accounts with over 1,000 results, summary statistics and latest result may be incomplete because this version does not yet implement ordered pagination.
- IELTS Reading catalog and manage queries are capped at 501 documents; the catalog emits `limited: true` and `/manage` sets an `X-Results-Limited` response header. Reading history and statistics are capped at 1,001 attempt documents per query, with `limited: true` in statistics. Some array-only legacy APIs expose truncation via a response header rather than a JSON field to preserve client compatibility. A subsequent version should add proper cursor-based pagination and an appropriate Firestore index for recent-first results.
- Mocked query-limit and proxy-hop regressions are covered by `tools/test-security-v157.mjs`; all existing automated suites remain applicable.

## Render deployment checklist

1. Keep existing `BOT_TOKEN`, `CHAT_IDS`, `FIREBASE_SERVICE_ACCOUNT_JSON` and `ALLOWED_ORIGINS` untouched. Never send them through Git.
2. The Render environment normally exposes `RENDER=true`. Verify IP handling for your actual proxy chain with a temporary diagnostic on a non-public staging instance (do **not** return raw IP addresses to users). If the last trusted hop is not the Render proxy, adjust `TRUST_PROXY_HOPS` only after confirming the chain. The default `1` is not a universal guarantee across Cloudflare/CDN or custom domain arrangements.
3. Verify a small number of requests from two separate client networks, then test that an account cannot bypass an existing rate limit using spoofed forwarded headers.
4. Verify the Admin Page still lists the expected real students and Live Quiz still works with several users sharing one classroom Wi-Fi.
5. All limits above use the current in-memory rate-limit store, not a shared distributed store; limits reset after a Render restart or across multiple instances. A distributed store is recommended before scaling beyond one instance.

## Deferred security and database work

- Persistent Firebase refresh tokens currently reside in `localStorage`, which can be stolen if an XSS weakness is introduced. Migrating to an HttpOnly, Secure, SameSite cookie-based server session requires an explicit authentication migration and a browser/production test plan. It is **not** performed by this patch.
- `/api/profile` still accepts `groupName` at initial registration. If study groups must be administrator-assigned, that is a separate product decision; leave registration compatible until approved.
- The partial-query guards cap costs but do not provide complete pagination. Plan cursor-based history/roster endpoints with stable ordering and indexes before more than ~1,000 records per type are expected.
- The ZIP has no live Firebase/Render environment or service-account credentials: deployed rules, indexes, response latency, network policy and actual cloud costs cannot be verified from the archive.
- The supplied `package-lock.json` identifies dependencies, but an online vulnerability-advisory scan (`npm audit`) must be run with internet access and reviewed before an external security clearance can be claimed.

## Speaking Storage — planned migration (NOT activated)

The current `server/speaking-storage.js` uses **Cloudinary**, and live audio uploads remain unavailable without its credentials. Do not set up unsupported providers with made-up keys.

When the client approves Firebase Blaze and Firebase Storage, migrate the storage adapter only while keeping existing routes, Firestore review states, Admin Review, Student Dashboard, and permissions. Require authenticated, authorized server-side upload and playback. No public bucket, no direct client writes to private recordings.

**Monthly deletion policy:** schedule a job shortly after 00:00 on the **first day of each month in `Asia/Tashkent`**, deleting audio from the previous month and any older overdue audio. This implements deletion at the end of each calendar month without relying on "30 days after upload". Before enabling it, confirm with the client whether even unreviewed recordings are to be deleted. Treat deletions as idempotent: page through objects, delete each object, then update `speakingSubmissions` with `audioDeletedAt` and a cleared media reference. Retry partial failures. Preserve grade, review, feedback, prompt, part, dates and student history in Firestore. Make the UI show "Audio expired" without attempting playback.

Do not deploy the scheduled deletion job, Cloud Storage bucket, or any paid API until the tariff, retention policy and cleanup access permissions are approved.
