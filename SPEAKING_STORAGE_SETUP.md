# Eagles Team Speaking audio — deployment

The site can **record and preview** audio without extra infrastructure. To enable sending and reviewing audio, configure a persistent media provider.

## Storage provider: Cloudinary (server-side only)

1. Create a Cloudinary product environment and retrieve **Cloud name**, **API Key**, and **API Secret**.
2. On Render → Eagles Team web service → Environment, add:

   - `CLOUDINARY_CLOUD_NAME` — cloud name
   - `CLOUDINARY_API_KEY` — API key
   - `CLOUDINARY_API_SECRET` — API secret

3. Save and redeploy / restart the Render service.
4. Verify that `GET /api/speaking/config` (with a valid student bearer token) returns `recordingAvailable: true`.
5. Test with a **non-sensitive** recording on desktop and on Safari/iPhone before using with actual students.

**Do not commit credentials, copy them into public JavaScript, or send them in chat.** The Express API uploads audio server-to-server using authenticated Cloudinary delivery type; Firestore holds only metadata and media identifiers. A signed playback URL is returned for five minutes only after a server-side ownership or administrator check. That temporary URL is a bearer capability: do not share it.

Cloudinary may charge for storage, delivery, and bandwidth based on the account plan. Confirm current quota and retention rules in your Cloudinary account. Firebase Storage is not used here; it requires the Blaze plan. Audio is not stored in Firestore or Render's ephemeral filesystem.

### Safety and limits

- HTTPS is required to record from browser microphones.
- Formats: WebM, MP4, or Ogg, depending on the browser. Up to 180 seconds and 12 MiB.
- Only active approved students can submit. Only admins can review; students see their own feedback.
- `canWriteReviews` is **not** reused: that existing permission is unrelated to Speaking assessment.
- The current flow has no administrator-side deletion/retention policy or malware scanner; establish a data retention period and students' consent before production use.
- If a provider upload succeeds but Firestore update fails, the upload may become orphaned. Review provider logs and retry carefully; this is not yet an atomic cross-service transaction.
- If storage is unavailable the page continues to offer local recording preview, but uploading is disabled.
