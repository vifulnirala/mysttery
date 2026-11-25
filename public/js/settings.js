'use strict';

const root = document.documentElement;
const themeToggle = document.getElementById('theme-toggle');
const savedTheme = localStorage.getItem('mystery-vault-theme') || 'dark';
root.dataset.theme = savedTheme;
if (themeToggle) {
  themeToggle.innerHTML = savedTheme === 'dark' ? '☼ <span>Light mode</span>' : '☾ <span>Dark mode</span>';
  themeToggle.addEventListener('click', () => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    localStorage.setItem('mystery-vault-theme', next);
    themeToggle.innerHTML = next === 'dark' ? '☼ <span>Light mode</span>' : '☾ <span>Dark mode</span>';
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = next === 'dark' ? '#0b1020' : '#f4f6fc';
  });
}

// External player server management.
const serverList = document.getElementById('managed-server-list');
const serverStatus = document.getElementById('server-manager-status');
const serverFile = document.getElementById('server-config-file');

async function refreshManagedServers() {
  const response = await fetch('/api/embed-config');
  const config = await response.json();
  if (!response.ok) throw new Error(config.error || 'Could not load player servers.');
  serverList.replaceChildren();
  const providers = Array.isArray(config.providers) ? config.providers : [];
  if (!providers.length) {
    const empty = document.createElement('p');
    empty.className = 'section-note';
    empty.textContent = 'No valid servers configured.';
    serverList.append(empty);
    return;
  }
  providers.forEach(provider => {
    const row = document.createElement('div');
    row.className = 'managed-server-row';
    const name = document.createElement('strong');
    name.textContent = provider.name;
    const id = document.createElement('span');
    id.textContent = provider.id;
    const remove = document.createElement('button');
    remove.className = 'btn btn-secondary';
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.addEventListener('click', async () => {
      if (!confirm('Remove ' + provider.name + ' from the player server list?')) return;
      remove.disabled = true;
      try {
        const resultResponse = await fetch('/api/embed-servers/' + encodeURIComponent(provider.id), { method: 'DELETE' });
        const result = await resultResponse.json();
        if (!resultResponse.ok) throw new Error(result.error || 'Could not remove server.');
        serverStatus.textContent = provider.name + ' removed.';
        await refreshManagedServers();
      } catch (error) {
        serverStatus.textContent = error.message || 'Could not remove server.';
        remove.disabled = false;
      }
    });
    row.append(name, id, remove);
    serverList.append(row);
  });
}

document.getElementById('server-import-form').addEventListener('submit', async event => {
  event.preventDefault();
  const file = serverFile.files[0];
  if (!file) return;
  serverStatus.textContent = 'Importing server configuration…';
  try {
    const response = await fetch('/api/embed-servers/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: await file.text() })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Import failed.');
    serverStatus.textContent = 'Imported ' + result.count + ' server(s).';
    serverFile.value = '';
    await refreshManagedServers();
  } catch (error) {
    serverStatus.textContent = error.message || 'Could not import server configuration.';
  }
});
void refreshManagedServers().catch(error => {
  serverStatus.textContent = error.message || 'Could not load player servers.';
});

// App-only DNS-over-HTTPS settings are handled by the Electron main process.
// The web deployment intentionally does not attempt to modify system DNS.
const dnsSettingsForm = document.getElementById('dns-settings-form');
const dnsEndpointInput = document.getElementById('dns-endpoint');
const dnsSettingsStatus = document.getElementById('dns-settings-status');
const adguardDohEndpoint = 'https://dns.adguard-dns.com/dns-query';

async function applyDnsSetting(endpoint) {
  if (!window.mysteryVault?.setDnsEndpoint) {
    dnsSettingsStatus.textContent = 'App-only DNS settings are available in the Windows desktop app.';
    return;
  }
  dnsSettingsStatus.textContent = 'Applying secure DNS to Mystery Vault…';
  try {
    const settings = await window.mysteryVault.setDnsEndpoint(endpoint);
    dnsEndpointInput.value = settings.endpoint;
    dnsSettingsStatus.textContent = 'Using ' + settings.provider + '. Secure DNS is active for this app only.';
  } catch (error) {
    dnsSettingsStatus.textContent = error.message || 'Could not apply DNS settings.';
  }
}

dnsSettingsForm.addEventListener('submit', event => {
  event.preventDefault();
  void applyDnsSetting(dnsEndpointInput.value);
});
document.getElementById('dns-use-adguard').addEventListener('click', () => {
  dnsEndpointInput.value = adguardDohEndpoint;
  void applyDnsSetting(adguardDohEndpoint);
});

async function loadDnsSettings() {
  if (!window.mysteryVault?.getDnsSettings) {
    dnsSettingsStatus.textContent = 'App-only DNS settings are available in the Windows desktop app.';
    return;
  }
  try {
    const settings = await window.mysteryVault.getDnsSettings();
    dnsEndpointInput.value = settings.endpoint;
    dnsSettingsStatus.textContent = 'Using ' + settings.provider + '. Default is AdGuard DNS (94.140.14.14); Windows DNS settings are unchanged.';
  } catch (error) {
    dnsSettingsStatus.textContent = error.message || 'Could not load DNS settings.';
  }
}
void loadDnsSettings();
