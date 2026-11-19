import { app, BrowserWindow, shell } from 'electron';
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
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

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

app.whenReady().then(createWindow).catch(error => {
  console.error('[Desktop Startup Error]', error);
  app.quit();
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
