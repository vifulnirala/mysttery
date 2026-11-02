# Mystery Vault Android port

This is the first Android application shell. It creates a native Android launcher and a
WebView host for the existing Mystery Vault frontend.

## Current status

- Native Android application module and launcher activity are scaffolded.
- WebView is configured for JavaScript, DOM storage, and user-initiated media playback.
- Navigation is restricted to the local app origin; HTTPS links are handed to Android.
- The app expects the backend at `http://127.0.0.1:3000`.
- **The Android-local Node.js/torrent backend is not integrated yet**, so this is not a
  standalone, usable APK at this stage. The next milestone is to package/start a
  compatible local backend and then connect its lifecycle to the Android app.

## Build

Open the `android/` directory in Android Studio (latest stable version), install the
Android SDK Platform 35 and a JDK 17-compatible Gradle toolchain, then build the
`app` configuration.

The project currently targets Android 15 (API 35) and supports Android 8.0 (API 26)
and newer.

## Porting milestones

1. Android application shell and WebView host (this commit).
2. Bundle the existing `public/` frontend as app assets and establish a stable
   frontend-to-local-service URL contract.
3. Integrate a supported Android Node.js runtime or replace backend-only features
   with native Android services.
4. Port torrent peer networking and streaming; browser WebTorrent assumptions must
   not be treated as equivalent to the existing Node.js WebTorrent engine.
5. Integrate Android Media3 for reliable native playback and downloads.
6. Add foreground-service/lifecycle handling for long-running transfers.
7. Validate on physical devices and produce a signed release APK.

## Important implementation constraints

- The local service must bind only to `127.0.0.1`, never `0.0.0.0`.
- Torrent/download work that must continue while the app is backgrounded needs an
  Android foreground service and a user-visible notification.
- External-player embeds remain a WebView feature and may be limited by provider
  policies, cookies, DRM, or WebView compatibility.
- Do not claim torrent playback works until native peer connectivity and streaming
  have been implemented and tested on a physical Android device.
