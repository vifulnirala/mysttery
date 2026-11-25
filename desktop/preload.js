// Expose only the DNS settings operations needed by the renderer.
// No filesystem, shell, or general IPC access is exposed.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mysteryVault', Object.freeze({
  getDnsSettings: () => ipcRenderer.invoke('mystery-vault:dns:get'),
  setDnsEndpoint: endpoint => ipcRenderer.invoke('mystery-vault:dns:set', endpoint)
}));
