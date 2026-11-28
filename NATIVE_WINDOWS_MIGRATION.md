# Mystery Vault — Native Windows Migration (C# / WinUI 3)

## Inspected baseline

Source: windows-executable-build at 2ea7a46fcf07be083fb11133d8f8c707da0164e2. New branch: native-windows-winui3, created directly from that source commit. The Electron branch remains unchanged.

The recursive tree and primary source files were inspected: server.js (1,422 lines), public/index.html, public/settings.html, public/watchlist.html, public/js/app.js (652 lines), home-feed.js, settings.js, watchlist.js, styles.css, desktop/main.js, desktop/preload.js, package.json, README, WINDOWS_DESKTOP.md, and windows-desktop.yml.

## Feature parity inventory

| Feature | Existing behavior to preserve | Native target |
|---|---|---|
| Navigation / home | Library, Watchlist, Settings, dark/light theme; desktop layout; no bottom dock | Native WinUI 3 NavigationView and pages |
| Discovery | Curated catalogue; weekly TMDB trending; Mystery, Romance, Horror, Animation and Comedy shelves | C# discovery clients and poster shelves |
| Search | Concurrent YTS, APIBay, Internet Archive and TMDB movie + TV search; direct magnet/hash; bounded retries/timeouts | Typed C# provider clients, cancellation and unified result model |
| Filters | All/YTS/Archive/TMDB/APIBay; YTS quality; result page size and load more | Native filter chips and paging |
| TMDB | Combined movie/TV results; future-release movies excluded; seasons and episodes; provider ID resolution | TMDB service and native episode picker |
| Torrent inspection | Metadata discovery and playable MP4/MKV/WebM file selection | C# BitTorrent engine and native file picker |
| Torrent playback | Explicit start; one bounded swarm; peer cap; metadata timeout; byte ranges/seek; no background download after close; idle cleanup | C# torrent engine, bounded session manager, native media playback and deterministic teardown |
| External playback | Configurable HTTPS servers, validated templates, provider selection, season/episode controls, persistent sandbox toggle | C# provider config; WebView2 only if needed to host third-party web player, never as the app shell |
| Server import | .env/key-value CSV/provider-table CSV; validate HTTPS and same-origin relative templates; remove and persist providers | Native file picker, C# parser/validator, JSON persistence |
| DNS | AdGuard default, custom HTTPS DoH, app-only; Windows DNS unchanged | App-scoped DNS transport; prove coverage for .NET, torrent sockets and WebView2 separately |
| Watchlist | Add/remove; retain TMDB/torrent metadata; persistent desktop JSON; browser-local migration fallback | Atomic local JSON repository and migration |
| Cache | Dedicated configurable directory; active-session status; block move during playback; stop then clear; report cleanup failure | Native folder picker and cache lifecycle service |
| Security | Loopback-only backend; Electron context isolation/sandbox; HTTPS external links; stop torrents at shutdown | No Node/Express server; least privilege, strict URL validation and awaited shutdown |
| Packaging | Windows x64 NSIS; runtime TMDB token/provider config; CI artifact | Windows x64 self-contained native package and CI |

## Backend contract to preserve

Existing routes and equivalent native service operations:
- GET /api/library?q=
- GET /api/title-search?q=
- GET /api/torrent-search?q=&limit= -> best + results
- GET /api/torrent-files?source= -> torrent name + video file list
- GET /api/stream-file?source=&fileIndex= and GET /api/stream/:id -> byte-range streaming
- POST /api/stop-stream -> destroy all torrent sessions
- GET /api/embed-config; POST /api/embed-servers/import; DELETE /api/embed-servers/:id
- POST /api/external-player -> validated provider URL and playback metadata
- GET /api/tv/:id/seasons; GET /api/tv/:id/seasons/:seasonNumber/episodes
- GET /api/trending; GET /api/discover?genreId=
- GET /api/torrent-cache; POST /api/torrent-cache/location; POST /api/torrent-cache/clear

## Native solution layout

src/MysteryVault.Native/
- App.xaml and MainWindow.xaml
- Models: search result, media title, torrent file and provider configuration
- Services/Search: YTS, APIBay, Internet Archive and TMDB
- Services/Playback: C# torrent session manager, media player and provider resolver
- Services/Configuration: theme, watchlist, provider and cache persistence
- Services/Networking: retry policy, app-scoped DoH and HTTP transport
- ViewModels and Views: Home, Search, Player, Watchlist and Settings

All first-party UI and app logic are C# / WinUI 3. MonoTorrent is the candidate C# BitTorrent engine; validate its metadata, piece prioritization, seek and cleanup behavior in a proof-of-concept before replacing WebTorrent. Do not carry forward Node.js, Express, Electron, WebTorrent or the HTML app shell.

## Phased migration and gates

1. Baseline and shell: document feature inventory, isolated branch, WinUI 3 shell. Keep Electron intact.
2. Models and persistence: typed models; atomic JSON for theme, watchlist, providers, sandbox and cache location; test restart and migration.
3. Search/discovery: port TMDB, YTS, APIBay and Internet Archive independently; then merge/rank/filter/page. Test fixtures, date filtering, failures and cancellation.
4. TMDB/provider flow: combined movie/TV search, future-date exclusion, seasons/episodes, provider validation/import/delete and correct playback ID mapping.
5. Torrent engine: prove MonoTorrent metadata, file selection, byte ranges/seek, cache location, peer/session limits, idle cleanup and awaited shutdown; then native media playback.
6. DNS/networking: test app HTTP, tracker/DHT and embedded WebView2 as separate stacks. Never modify Windows system DNS.
7. UI parity: shelves, filters, watchlist, settings, theme, cache and player; regression compare with source branch.
8. Packaging: Windows x64 build, clean-machine launch, runtime configuration and shutdown tests.

## Acceptance checklist

- [ ] All five search sources independently filterable; All combines them.
- [ ] TMDB movies and series combined; future-release movies excluded.
- [ ] TV season/episode selection and provider ID mapping correct.
- [ ] Torrent file selection, playback, seek, cache controls and stop cleanup work.
- [ ] APIBay remains a separate filter.
- [ ] CSV/.env provider import, validation, removal and persistence work.
- [ ] DoH is app-only; Windows DNS unchanged; every app network stack is covered or explicitly documented.
- [ ] Watchlist and theme survive restart.
- [ ] Sandbox preference persists and changing it reloads the player.
- [ ] Curated, trending and all five genre shelves load and open titles.
- [ ] Watchlist and Settings are top-level; no mobile bottom dock.
- [ ] Native x64 artifact builds in CI and launches on a clean Windows machine.

## Risks requiring proof

- Browser byte-range streaming differs from native media streaming; test seek and piece prioritization.
- MKV/WebM support depends on Windows codecs and media pipeline.
- Electron Chromium secure DNS does not automatically transfer to .NET, tracker/DHT sockets or WebView2.
- Existing watchlist data is in Electron userData JSON and browser localStorage; migrate rather than reset.
- Never commit TMDB secrets or embed them in public source.

## Current status

- [x] Inspected source tree and core backend, renderer, desktop bridge and workflow.
- [x] Created isolated branch from the inspected source head.
- [x] Added initial WinUI 3 project and navigation shell.
- [ ] Search, discovery, playback, persistence, settings services, tests and packaging remain to be ported. This initial shell is not feature parity.
