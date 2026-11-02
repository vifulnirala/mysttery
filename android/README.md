# Mystery Vault Android port

The Android shell now includes an embedded Node.js runtime smoke test.

## Current Android milestone

- Android launcher and WebView host.
- Embedded Node.js 26 mobile runtime, fetched during CI from a pinned release and SHA-256 verified.
- Node starts inside the app process and binds its test HTTP server to `127.0.0.1:3000`.
- The WebView opens the local Node server; `/health` reports the embedded Node version.
- Existing `server.js`, `package.json`, and backend dependencies remain unchanged and are not yet launched by this smoke test.

## Build

Push to `feature/android-port` or manually run **Build Android APK** in GitHub Actions. The resulting debug APK is uploaded as `mystery-vault-debug-apk`.

## Next steps

1. Validate the embedded runtime on a physical Android device.
2. Stage the existing backend and production dependencies into app-private storage without modifying source.
3. Test WebTorrent's Android compatibility and native dependencies.
4. Add foreground-service lifecycle handling for long-running transfers.
5. Integrate Media3 and validate real torrent streaming.

The smoke-test server is not the finished Mystery Vault backend.
