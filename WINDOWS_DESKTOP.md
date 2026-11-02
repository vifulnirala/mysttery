# Mystery Vault for Windows

The Windows desktop build wraps the existing web UI and Express/WebTorrent backend in Electron.

## Requirements

- Node.js 20 or newer
- Windows x64 for the installer build

## Development

```bash
npm install
npm run desktop
```

Electron starts the existing Express application on an ephemeral loopback port (127.0.0.1) and loads it in a desktop window. The backend is not exposed to the local network.

## Build the Windows installer

```bash
npm install
npm run dist:win
```

The NSIS installer is written to `release/`. The packaged application includes the Node.js runtime through Electron; users do not need to install Node.js separately.

## Configuration

Existing server environment variables continue to apply, including `TMDB_API_READ_ACCESS_TOKEN`, `YTS_API_BASE`, and the `EMBED_*` external-player settings. For a packaged build, provide configuration through the environment used to launch the application.

External-player embedding remains enabled. This application does not attempt to block or modify advertising delivered within third-party player frames.
