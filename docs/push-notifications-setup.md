# Mystery Vault push notifications — Cloudflare Workers

The Android client uses Firebase Anonymous Authentication for per-installation identity and Firebase Cloud Messaging (FCM) for delivery. The trusted API runs on Cloudflare Workers. Pairing and installation data live in Cloudflare D1; Firestore and Firebase Cloud Functions are not used.

## Security model

- The Worker accepts only HTTPS POST requests to seven explicit /v1 routes. There is no admin route, debug route, arbitrary database query, or browser-facing management endpoint.
- Every request must carry a Firebase ID token. The Worker verifies its RS256 signature against Google's published Firebase Secure Token keys and checks the Firebase project audience, issuer, subject, issue time and auth time. The UID is taken only from the verified token, never from request JSON.
- The service-account JSON and AES encryption key are stored only as Cloudflare Worker secrets. They are never placed in the repository, Android APK, frontend JavaScript, or GitHub Actions. The Android app receives only a Firebase client ID token and its FCM registration token.
- The service account should have only the Firebase Cloud Messaging permission cloudmessaging.messages.create, preferably through a custom IAM role. Do not grant Owner, Editor, Firebase Admin, or service-agent roles.
- FCM registration tokens are AES-256-GCM encrypted before they are stored in D1 and are never returned to a client. The encryption key exists only as a Cloudflare Worker secret. API responses do not include credentials or raw provider errors.
- Pairing codes are 12 random hexadecimal characters, SHA-256 hashed before storage, expire after 10 minutes, and are consumed with a conditional single-use database update. Pairing attempts are rate-limited per authenticated UID and per hashed Cloudflare client IP; raw IP addresses are not persisted.
- The Android WebView uses an origin-restricted WebMessageListener. Only the exact loopback app-shell origin and main frame can invoke native operations. The old globally exposed addJavascriptInterface bridges are removed.
- Notification and unlink operations check that the caller is a member of the requested link. SQL statements are parameterized.
- Responses are marked no-store; errors are sanitized; request bodies are size-limited.
- Firebase Firestore rules are no longer involved because this implementation does not use Firestore.

No software change can prove the absence of every possible backdoor. Review the Worker source and deployed Worker version, keep Cloudflare account MFA enabled, restrict account access, and rotate the service-account key if it is ever exposed. If the AES token-encryption key is rotated, existing encrypted FCM tokens must be cleared and devices must reopen the app to register fresh tokens.

## 1. Firebase Console

1. Create the Firebase project and register the Android app with package name com.mysteryvault.kotlin.
2. Enable Authentication → Sign-in method → Anonymous.
3. Enable Firebase Cloud Messaging and confirm the FCM HTTP v1 API is enabled in the linked Google Cloud project.
4. Download google-services.json. Do not commit it. Add its complete contents as a GitHub Actions repository secret named FIREBASE_GOOGLE_SERVICES_JSON.
5. Note the Firebase Project ID from Project settings. It is not a secret.

## 2. Create a least-privilege FCM service account

In Google Cloud Console, create a dedicated service account named mystery-vault-fcm-sender. Do not use the default App Engine service account or a personal account.

Create a custom project IAM role containing only:
- cloudmessaging.messages.create

Grant that custom role to the dedicated service account. Do not grant project Owner/Editor or Firebase Admin.

Create one JSON key for that service account. Treat the file as a password:
- Never commit it, attach it to an issue, or put it in the APK.
- Keep it only temporarily on your own computer while adding it to Cloudflare.
- Delete the local copy after the Worker secret is configured.
- If exposed, delete/revoke the key in Google Cloud IAM immediately and create a replacement.

## 3. Create the Cloudflare Worker and D1 database

Open Google Cloud Console and start Cloud Shell (browser-based), or use a trusted terminal with Node.js 22. Clone the feature branch, then enter the Worker project:

    git clone -b android-push-notifications https://github.com/vifulnirala/mysttery.git
    cd mysttery/workers/push-api
    npm install
    npm test
    npm run check
    npx wrangler login
    npx wrangler d1 create mystery-vault-push

The D1 create command prints a database ID. Put that ID in wrangler.toml, replacing REPLACE_AFTER_RUNNING_WRANGLER_D1_CREATE. Replace REPLACE_WITH_FIREBASE_PROJECT_ID in the same file with the Firebase Project ID.

Generate a separate 32-byte encryption key and add it as a Worker secret. Keep this key independent of the Google service-account key. For example, generate it locally with openssl rand -base64 32, then paste the output when prompted:

    npx wrangler secret put FCM_TOKEN_ENCRYPTION_KEY

Apply the schema and store the service-account key as a Worker secret:

    npx wrangler d1 migrations apply mystery-vault-push --remote
    npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON

When prompted, paste the complete service-account JSON file contents. Do not put the JSON in a command argument or shell history.

Deploy:

    npx wrangler deploy

Copy the deployed Worker URL, for example https://mystery-vault-push-api.<your-subdomain>.workers.dev.

## 4. Configure the Android build

In GitHub → repository Settings → Secrets and variables → Actions, add:
- FIREBASE_GOOGLE_SERVICES_JSON: complete contents of the Android google-services.json file.
- PUSH_API_BASE_URL: the Worker base URL, with no trailing slash.

The workflow injects the Firebase Android config only during the build and passes the Worker URL to Gradle. The Worker URL is a public endpoint, not a credential. Trigger the Android build workflow again.

## 5. Test

1. Install the new APK and enable notifications.
2. Use Send test to this phone. Confirm the FCM notification arrives.
3. A second independent installation is required to test actual pairing. Generate a code on one device, join it on the other, verify both device lists, send a notification in both directions, then unlink.
4. Try an expired code, reused code, malformed code, and a request using a non-member UID; each must be rejected.
5. Confirm there are no service-account JSON files, private keys, encryption keys, API bearer tokens, or FCM tokens in the Git repository or APK.

## Free-tier notes

Cloudflare Workers Free currently includes 100,000 requests/day and 10 ms CPU time per invocation. D1 Free currently includes 5 million rows read/day, 100,000 rows written/day and 5 GB total storage; usage limits are enforced, and queries fail until the daily reset if a limit is exceeded. See the official Cloudflare pricing and limits pages before production use.

- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://firebase.google.com/docs/auth/admin/verify-id-tokens
- https://firebase.google.com/docs/cloud-messaging/send/v1-api
