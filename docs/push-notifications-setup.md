# Mystery Vault Android push notifications

This feature is independent of the Render-hosted web application. The Android app uses Firebase Authentication and callable Cloud Functions; Cloud Functions use the Admin SDK to access Firestore and send FCM messages.

## Firebase Console setup

1. Create or open the Mystery Vault Firebase project.
2. In **Project settings → Your apps**, register an Android app with package name `com.mysteryvault.kotlin`.
3. Download `google-services.json` and place it at `app/google-services.json`. It contains Firebase project configuration, not a service-account private key.
4. In **Authentication → Sign-in method**, enable **Anonymous**.
5. In **Firestore Database**, create the default database. Choose a location you can keep long-term; the database location cannot be changed after creation.
6. In **Firestore → Rules**, publish the rules from this repository's `firestore.rules`.
7. Verify that Firebase Cloud Messaging is enabled for the project.

## Deploy the trusted backend

Cloud Functions deployment requires the Firebase **Blaze** billing plan. Functions use the default Google-managed service identity; do not create or commit a service-account JSON key.

Install Node.js 20 and the Firebase CLI, then run from the repository root:

```bash
npm install -g firebase-tools
firebase login
firebase use --add
cd functions
npm install
npm test
cd ..
firebase deploy --only firestore:rules,functions
```

The callable functions are deployed to `us-central1`, which is also configured in the Android client. Keep the region consistent if you change it.

## Build the Android app

Commit `app/google-services.json` to this development branch (or materialize it as a protected CI file during the build). The Google Services Gradle plugin is applied automatically when that file exists. Rebuild the APK using the repository's Android workflow.

On first launch, open the hamburger menu → **Private device pairing** → **Enable notifications**. Android creates an anonymous Firebase identity for this installation; there is no shared account or password.

## Pairing behaviour

- Generate a code on the first phone and enter it on the second phone. The displayed QR contains the same pairing URI/code; a QR reader can be used to read it, then enter the code in the app.
- Codes are 8 hexadecimal characters, expire after 10 minutes, and can be used only once.
- Each installation has its own anonymous Firebase Auth UID and FCM token.
- Only callable Cloud Functions can read or write installation, pairing, and link records. Firestore client rules deny all access.
- Either paired device can send a notification to the other. Unlinking deletes the relationship.

## One-phone testing

Use **Send test to this phone** to verify that the APK has registered an FCM token and can receive a real notification. Pairing between two distinct installations still requires a second installation (for example, a cloud Android device service). The self-test does not simulate a second installation.

## Operational notes

- Keep `google-services.json` out of public repositories if the repository is public. It is not a server private key, but it identifies the Firebase project and contains project configuration.
- Never put a Firebase service-account private key in the APK or Git.
- Consider enabling Firebase App Check and adding stricter abuse/rate controls before broad public distribution.
- Expired pairing codes are rejected even if their Firestore documents remain; optional TTL cleanup can be configured later.