# Mystery Vault Android port

The Android shell embeds Node.js 26 and stages the existing Mystery Vault backend into app-private storage at build time.

## Current Android milestone

- Android launcher and WebView host (ARM64 only).
- Embedded Node.js 26 mobile runtime.
- CI runs `npm ci --omit=dev --omit=optional` and stages the existing `server.js`, `public/`, and production `node_modules/` into the APK assets.
- Android packaging replaces only the staged `node-datachannel` package with its Android/Bionic ARM64 build (v0.33.6); repository backend files and lockfile remain unchanged.
- The APK currently targets ARM64 devices only because the required native WebRTC addon is published for Android ARM64, not the other configured ABIs.
- On launch, the app copies those assets to its private files directory and starts the unchanged `server.js` with that directory as the working directory.
- The WebView opens `http://127.0.0.1:3000`.
- `server.js`, `package.json`, `package-lock.json`, and backend application logic are not modified by the Android port.

## Build

Push Android/backend changes to `feature/android-port` or manually run **Build Android APK** in GitHub Actions. The resulting debug APK is uploaded as `mystery-vault-debug-apk`.

## Compatibility status and limitations

This is the first real-backend integration attempt, not yet proof that every backend feature works on Android. The APK build will validate dependency installation and packaging, but device testing is still required for Express startup, upstream APIs, WebTorrent peer discovery, UDP/TCP connectivity, and HTTP range streaming.

Optional npm dependencies are omitted during the Linux dependency install to avoid bundling host-specific binaries. The Android staging step explicitly installs the Android/Bionic ARM64 node-datachannel package and verifies its ELF architecture before packaging. Other native dependencies still require device validation.

The server currently listens on `0.0.0.0` as defined in the unchanged `server.js`; this port does not change that behavior. Long-running playback/background lifecycle handling and Media3 integration remain future work.
