import { app, BrowserWindow, shell, Menu, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let mainWindow = null;
let serverInfo = null;
let isQuitting = false;
let startServer;
let closeServer;

const DEFAULT_DOH_ENDPOINT = 'https://dns.adguard-dns.com/dns-query';
const DNS_SETTINGS_PATH = () => path.join(app.getPath('userData'), 'dns-settings.json');

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
  try {
    const saved = JSON.parse(fs.readFileSync(DNS_SETTINGS_PATH(), 'utf8'));
    return normalizeDohEndpoint(saved.endpoint);
  } catch (_) {
    return DEFAULT_DOH_ENDPOINT;
  }
}

function applyDnsEndpoint(endpoint) {
  app.configureHostResolver({
    secureDnsMode: 'secure',
    secureDnsServers: [normalizeDohEndpoint(endpoint)]
  });
}

ipcMain.handle('mystery-vault:dns:get', () => ({
  endpoint: readDnsEndpoint(),
  defaultEndpoint: DEFAULT_DOH_ENDPOINT,
  provider: readDnsEndpoint() === DEFAULT_DOH_ENDPOINT ? 'AdGuard DNS' : 'Custom DNS-over-HTTPS'
}));

ipcMain.handle('mystery-vault:dns:set', (_event, value) => {
  const endpoint = normalizeDohEndpoint(value);
  // Apply first; persist only after Chromium accepts the configuration.
  applyDnsEndpoint(endpoint);
  const settingsPath = DNS_SETTINGS_PATH();
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  const temporaryPath = settingsPath + '.tmp';
  fs.writeFileSync(temporaryPath, JSON.stringify({ endpoint }, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporaryPath, settingsPath);
  return {
    endpoint,
    defaultEndpoint: DEFAULT_DOH_ENDPOINT,
    provider: endpoint === DEFAULT_DOH_ENDPOINT ? 'AdGuard DNS' : 'Custom DNS-over-HTTPS'
  };
});

async function loadServer() {
  const envPath = app.isPackaged
    ? path.join(process.resourcesPath, 'runtime.env')
    : path.join(process.cwd(), 'runtime.env');
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath, override: true });
  const serverModule = await import('../server.js');
  startServer = serverModule.startServer;
  closeServer = serverModule.closeServer;
}

async function createWindow() {
  await loadServer();
  serverInfo = await startServer({ host: '127.0.0.1', port: 0 });

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#0b1020',
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'Library', submenu: [{ label: 'Watchlist', click: () => mainWindow?.loadURL(`http://127.0.0.1:${serverInfo.port}/watchlist.html`) }, { type: 'separator' }, { role: 'reload' }] }]));
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

  await mainWindow.loadURL(`http://127.0.0.1:${serverInfo.port}`);
  mainWindow.on('closed', () => { mainWindow = null; });
}

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
  Promise.resolve(serverInfo?.close ? serverInfo.close() : closeServer())
    .catch(error => console.error('[Desktop Shutdown Error]', error))
    .finally(() => app.exit(0));
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
