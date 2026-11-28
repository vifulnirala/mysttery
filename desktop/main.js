import { app, BrowserWindow, shell, Menu, ipcMain, dialog, nativeTheme } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isWindows = process.platform === 'win32';
let mainWindow = null;
let serverInfo = null;
let isQuitting = false;
let startServer;
let closeServer;

// Prevent multiple duplicate Electron + Express instances on Windows.
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
}

const DEFAULT_DOH_ENDPOINT = 'https://dns.adguard-dns.com/dns-query';
const DNS_SETTINGS_PATH = () => path.join(app.getPath('userData'), 'dns-settings.json');
let cachedDnsEndpoint = null;

function normalizeDohEndpoint(value) {
  const raw = String(value || '').trim();
  let endpoint;
  try { endpoint = new URL(raw); } catch (_) {
    throw new Error('Enter a valid DNS-over-HTTPS URL, for example https://dns.adguard-dns.com/dns-query. A plain DNS IP address is not a DoH URL.');
  }
  if (endpoint.protocol !== 'https:' || !endpoint.hostname || endpoint.username || endpoint.password || endpoint.hash) {
    throw new Error('Custom DNS must be an HTTPS DNS-over-HTTPS endpoint without credentials or a URL fragment.');
  }
  return endpoint.toString();
}

function readDnsEndpoint() {
  if (cachedDnsEndpoint) return cachedDnsEndpoint;
  try {
    const saved = JSON.parse(fs.readFileSync(DNS_SETTINGS_PATH(), 'utf8'));
    cachedDnsEndpoint = normalizeDohEndpoint(saved.endpoint);
  } catch (_) {
    cachedDnsEndpoint = DEFAULT_DOH_ENDPOINT;
  }
  return cachedDnsEndpoint;
}

function applyDnsEndpoint(endpoint) {
  app.configureHostResolver({
    secureDnsMode: 'secure',
    secureDnsServers: [normalizeDohEndpoint(endpoint)]
  });
}

function getTitleBarOverlayColors(theme) {
  const isDark = theme === 'dark';
  return {
    color: isDark ? '#202020' : '#f3f3f3',
    symbolColor: isDark ? '#ffffff' : '#1a1a1a',
    height: 40
  };
}

function applyWindowTheme(theme) {
  const normalized = theme === 'light' ? 'light' : 'dark';
  if (!mainWindow || mainWindow.isDestroyed()) return normalized;
  const bg = normalized === 'dark' ? '#202020' : '#f3f3f3';
  mainWindow.setBackgroundColor(bg);
  if (isWindows && typeof mainWindow.setTitleBarOverlay === 'function') {
    try {
      mainWindow.setTitleBarOverlay(getTitleBarOverlayColors(normalized));
    } catch (_) {}
  }
  return normalized;
}

ipcMain.handle('mystery-vault:theme:get-system', () => (
  nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
));

ipcMain.handle('mystery-vault:theme:set', (_event, theme) => applyWindowTheme(theme));

ipcMain.handle('mystery-vault:dns:get', () => {
  const endpoint = readDnsEndpoint();
  return {
    endpoint,
    defaultEndpoint: DEFAULT_DOH_ENDPOINT,
    provider: endpoint === DEFAULT_DOH_ENDPOINT ? 'AdGuard DNS' : 'Custom DNS-over-HTTPS'
  };
});

ipcMain.handle('mystery-vault:dns:set', (_event, value) => {
  const endpoint = normalizeDohEndpoint(value);
  // Apply first; persist only after Chromium accepts the configuration.
  applyDnsEndpoint(endpoint);
  const settingsPath = DNS_SETTINGS_PATH();
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  const temporaryPath = settingsPath + '.tmp';
  fs.writeFileSync(temporaryPath, JSON.stringify({ endpoint }, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporaryPath, settingsPath);
  cachedDnsEndpoint = endpoint;
  return {
    endpoint,
    defaultEndpoint: DEFAULT_DOH_ENDPOINT,
    provider: endpoint === DEFAULT_DOH_ENDPOINT ? 'AdGuard DNS' : 'Custom DNS-over-HTTPS'
  };
});

const WATCHLIST_PATH = () => path.join(app.getPath('userData'), 'watchlist.json');

function readWatchlist() {
  try {
    const items = JSON.parse(fs.readFileSync(WATCHLIST_PATH(), 'utf8'));
    return Array.isArray(items) ? items : [];
  } catch (error) {
    return error.code === 'ENOENT' ? null : [];
  }
}

function normalizeWatchlist(items) {
  if (!Array.isArray(items)) throw new Error('Watchlist must be an array.');
  if (items.length > 500) throw new Error('Watchlist can contain at most 500 titles.');
  const seen = new Set();
  return items.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const id = String(item.id || '').slice(0, 240);
    if (!id || seen.has(id)) return null;
    seen.add(id);
    const poster = String(item.poster || '');
    return {
      id,
      title: String(item.title || 'Untitled').slice(0, 300),
      year: String(item.year || '').slice(0, 20),
      poster: /^https?:\/\//i.test(poster) || /^data:image\/svg\+xml/i.test(poster) ? poster.slice(0, 4000) : '',
      type: String(item.type || '').slice(0, 30),
      mediaType: String(item.mediaType || '').slice(0, 20),
      tmdbId: String(item.tmdbId || '').slice(0, 40),
      source: String(item.source || '').slice(0, 12000),
      provider: String(item.provider || '').slice(0, 100),
      quality: String(item.quality || '').slice(0, 40),
      torrentType: String(item.torrentType || '').slice(0, 40)
    };
  }).filter(Boolean);
}

ipcMain.handle('mystery-vault:watchlist:get', () => readWatchlist());
ipcMain.handle('mystery-vault:watchlist:set', (_event, items) => {
  const normalized = normalizeWatchlist(items);
  const filePath = WATCHLIST_PATH();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = filePath + '.tmp';
  fs.writeFileSync(temporaryPath, JSON.stringify(normalized, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporaryPath, filePath);
  return normalized;
});

ipcMain.handle('mystery-vault:torrent-cache:choose-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose torrent cache drive/folder',
    properties: ['openDirectory', 'createDirectory']
  });
  return result.canceled || !result.filePaths[0] ? { canceled: true } : { canceled: false, path: result.filePaths[0] };
});

async function loadServer() {
  const envPath = app.isPackaged
    ? path.join(process.resourcesPath, 'runtime.env')
    : path.join(process.cwd(), 'runtime.env');
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath, override: true });
  process.env.MYSTERY_VAULT_TORRENT_PATH ||= path.join(app.getPath('userData'), 'torrent-cache');
  const serverModule = await import('../server.js');
  startServer = serverModule.startServer;
  closeServer = serverModule.closeServer;
}

async function createWindow() {
  await loadServer();
  serverInfo = await startServer({ host: '127.0.0.1', port: 0 });

  const initialTheme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  const windowOptions = {
    width: 1360,
    height: 880,
    minWidth: 920,
    minHeight: 620,
    show: false,
    title: 'Mystery Vault',
    backgroundColor: initialTheme === 'dark' ? '#202020' : '#f3f3f3',
    autoHideMenuBar: true,
    roundedCorners: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: true,
      spellcheck: false
    }
  };

  if (isWindows) {
    windowOptions.titleBarStyle = 'hidden';
    windowOptions.titleBarOverlay = getTitleBarOverlayColors(initialTheme);
    windowOptions.backgroundMaterial = 'mica';
  }

  mainWindow = new BrowserWindow(windowOptions);

  if (isWindows) {
    // Use native WinUI 3 sidebar navigation instead of a legacy Win32 menu bar.
    Menu.setApplicationMenu(null);
  } else {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      {
        label: 'Mystery Vault',
        submenu: [
          { label: 'Library', click: () => mainWindow?.loadURL(`http://127.0.0.1:${serverInfo.port}/`) },
          { label: 'Watchlist', click: () => mainWindow?.loadURL(`http://127.0.0.1:${serverInfo.port}/watchlist.html`) },
          { label: 'Settings', click: () => mainWindow?.loadURL(`http://127.0.0.1:${serverInfo.port}/settings.html`) },
          { type: 'separator' },
          { role: 'reload' },
          { role: 'quit' }
        ]
      }
    ]));
  }

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Open ordinary external links in the user's default browser, never a new
    // privileged Electron window. Embedded provider iframes remain in-app.
    if (/^https:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const expectedOrigin = `http://127.0.0.1:${serverInfo.port}`;
    if (!url.startsWith(expectedOrigin + '/') && url !== expectedOrigin) event.preventDefault();
  });

  // Support standard Windows keyboard shortcuts without a legacy menu bar.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F5' || ((input.control || input.meta) && input.key.toLowerCase() === 'r')) {
      event.preventDefault();
      mainWindow?.webContents.reload();
    } else if (input.alt && input.key === 'ArrowLeft' && mainWindow?.webContents.navigationHistory?.canGoBack()) {
      event.preventDefault();
      mainWindow.webContents.navigationHistory.goBack();
    } else if (input.alt && input.key === 'ArrowRight' && mainWindow?.webContents.navigationHistory?.canGoForward()) {
      event.preventDefault();
      mainWindow.webContents.navigationHistory.goForward();
    }
  });

  await mainWindow.loadURL(`http://127.0.0.1:${serverInfo.port}`);
  mainWindow.on('closed', () => { mainWindow = null; });
}

if (hasSingleInstanceLock) {
  app.whenReady().then(async () => {
    try {
      applyDnsEndpoint(readDnsEndpoint());
      await createWindow();
    } catch (error) {
      console.error('[Desktop Startup Error]', error);
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow().catch(error => {
        console.error('[Desktop Window Error]', error);
        app.quit();
      });
    }
  });

  app.on('before-quit', event => {
    if (isQuitting) return;
    isQuitting = true;
    event.preventDefault();
    Promise.resolve(serverInfo?.close ? serverInfo.close() : closeServer?.())
      .catch(error => console.error('[Desktop Shutdown Error]', error))
      .finally(() => app.exit(0));
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
