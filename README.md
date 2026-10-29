# Mystery Vault

A Node.js/Express movie-search and torrent-streaming app with a responsive frontend split into separate HTML, CSS, and JavaScript files.

## Requirements

- Node.js 20 or newer (Node.js 24 is supported by the runtime; this project includes a compatibility patch for the installed WebTorrent 2.8.5 source).
- npm

## Install and run (Windows PowerShell)

1. Extract this ZIP to a folder, for example `F:\\mystery-vault`.
2. Open PowerShell in that folder.
3. Install dependencies:

   ```powershell
   npm.cmd install
   ```

   The `postinstall` script applies a small compatibility patch to WebTorrent 2.8.5: it passes `parsedTorrent.infoHashBuffer` to `arr2hex()` instead of passing the hexadecimal `infoHash` string. This addresses the `Buffer.from(undefined)` crash reproduced with `parse-torrent@11.0.24`.

4. Optional: copy `.env.example` to `.env`, fill in your own TMDB API Read Access Token, and run with Node's env-file support:

   ```powershell
   Copy-Item .env.example .env
   # Edit .env and set TMDB_API_READ_ACCESS_TOKEN
   node --env-file=.env server.js
   ```

   If you do not need TMDB title search, start normally:

   ```powershell
   npm.cmd start
   ```

5. Open `http://localhost:3000` in your browser.

If PowerShell blocks `npm.ps1`, use `npm.cmd` as shown above or run the commands from Command Prompt.

## Project structure

```text
mystery-vault/
  server.js
  package.json
  .env.example
  scripts/
    fix-webtorrent-infohash.cjs
  public/
    index.html
    css/styles.css
    js/app.js
  scooby_doo_catalog.json
  SCOOBY_CATALOG_README.txt
```

## Checks

```powershell
npm.cmd run check
```

## Notes

- Torrent sessions start on explicit selection rather than warming in the background.
- Closing the player stops active torrent sessions.
- Streaming availability and speed depend on the selected source, seeders, network conditions, and browser-supported media formats.
- External-player providers control their own availability and policies. Use sources and content you are authorized to access.
- The WebTorrent compatibility patch is applied to `node_modules` during install. If WebTorrent changes its internal source in a future version, the patch script reports that it did not find the expected code rather than silently changing unrelated code.
