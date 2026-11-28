// Expose only the DNS settings, watchlist, and native window theme operations needed by the renderer.
// No filesystem, shell, or general IPC access is exposed.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mysteryVault', Object.freeze({
  platform: process.platform,
  isWindowsDesktop: process.platform === 'win32',
  getSystemTheme: () => ipcRenderer.invoke('mystery-vault:theme:get-system'),
  setWindowTheme: theme => ipcRenderer.invoke('mystery-vault:theme:set', theme),
  getDnsSettings: () => ipcRenderer.invoke('mystery-vault:dns:get'),
  chooseTorrentCacheDirectory: () => ipcRenderer.invoke('mystery-vault:torrent-cache:choose-directory'),
  setDnsEndpoint: endpoint => ipcRenderer.invoke('mystery-vault:dns:set', endpoint),
  getWatchlist: () => ipcRenderer.invoke('mystery-vault:watchlist:get'),
  saveWatchlist: items => ipcRenderer.invoke('mystery-vault:watchlist:set', items)
}));
