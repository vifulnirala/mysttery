'use strict';

(() => {
  const status = document.getElementById('push-status');
  const enableButton = document.getElementById('push-enable-notifications');
  const testButton = document.getElementById('push-test-this-device');
  const createButton = document.getElementById('push-create-code');
  const codeOutput = document.getElementById('push-code-output');
  const codeDisplay = document.getElementById('push-pairing-code-display');
  const qrImage = document.getElementById('push-pairing-qr');
  const codeInput = document.getElementById('push-pairing-code-input');
  const joinButton = document.getElementById('push-join-code');
  const scanButton = document.getElementById('push-scan-code');
  const deviceList = document.getElementById('push-linked-device-list');
  if (!status || !window.MysteryVaultPushNative) return;

  let sequence = 0;
  const pending = new Map();
  window.MysteryVaultPush = {
    _complete(id, result) {
      const entry = pending.get(id);
      if (!entry) return;
      pending.delete(id);
      if (result && result.ok) entry.resolve(result.data || {});
      else entry.reject(new Error(result?.error || 'Push notification request failed.'));
    }
  };

  function nativeCall(method, ...args) {
    return new Promise((resolve, reject) => {
      const id = 'push_' + (++sequence);
      pending.set(id, { resolve, reject });
      try { window.MysteryVaultPushNative[method](...args, id); }
      catch (error) { pending.delete(id); reject(error); }
    });
  }
  function setStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle('error', isError);
  }

  async function refreshDevices() {
    const result = await nativeCall('listLinkedDevices');
    deviceList.replaceChildren();
    const devices = Array.isArray(result.devices) ? result.devices : [];
    if (!devices.length) {
      const empty = document.createElement('p'); empty.className = 'section-note'; empty.textContent = 'No devices are paired yet.'; deviceList.appendChild(empty); return;
    }
    for (const device of devices) {
      const row = document.createElement('div'); row.className = 'push-device-row';
      const name = document.createElement('strong'); name.textContent = device.deviceName || 'Mystery Vault device';
      const actions = document.createElement('div'); actions.className = 'push-device-actions';
      const send = document.createElement('button'); send.type = 'button'; send.className = 'btn btn-secondary'; send.textContent = 'Send test notification';
      send.addEventListener('click', async () => {
        send.disabled = true;
        try { await nativeCall('sendNotification', device.linkId, 'Test notification from Mystery Vault.'); setStatus('Notification sent to ' + name.textContent + '.'); }
        catch (error) { setStatus(error.message, true); } finally { send.disabled = false; }
      });
      const unlink = document.createElement('button'); unlink.type = 'button'; unlink.className = 'btn btn-secondary'; unlink.textContent = 'Unlink';
      unlink.addEventListener('click', async () => {
        unlink.disabled = true;
        try { await nativeCall('unlinkDevice', device.linkId); setStatus('Device unlinked.'); await refreshDevices(); }
        catch (error) { setStatus(error.message, true); unlink.disabled = false; }
      });
      actions.append(send, unlink); row.append(name, actions); deviceList.appendChild(row);
    }
  }

  async function refreshStatus() {
    try {
      const result = await nativeCall('getStatus');
      if (result.permissionGranted === false) { setStatus('Notifications are not enabled on this phone.'); return; }
      setStatus('This installation is registered for push notifications.');
      await refreshDevices();
    } catch (error) { setStatus(error.message, true); }
  }

  enableButton?.addEventListener('click', async () => {
    enableButton.disabled = true;
    try { await nativeCall('requestNotificationPermission'); setStatus('Notifications are enabled and this phone is registered.'); await refreshDevices(); }
    catch (error) { setStatus(error.message, true); } finally { enableButton.disabled = false; }
  });
  testButton?.addEventListener('click', async () => {
    testButton.disabled = true;
    try { await nativeCall('sendTestNotification'); setStatus('A test notification was sent to this phone.'); }
    catch (error) { setStatus(error.message, true); } finally { testButton.disabled = false; }
  });
  createButton?.addEventListener('click', async () => {
    createButton.disabled = true;
    try {
      const result = await nativeCall('createPairingCode');
      codeDisplay.textContent = result.code || '';
      qrImage.src = window.MysteryVaultPushNative.qrDataUrl('mysteryvault://pair?code=' + encodeURIComponent(result.code || ''));
      codeOutput.classList.remove('hidden');
      setStatus('Pairing code created. It expires in 10 minutes and can be used once.');
    } catch (error) { setStatus(error.message, true); } finally { createButton.disabled = false; }
  });
  scanButton?.addEventListener('click', async () => {
    scanButton.disabled = true;
    try {
      const result = await nativeCall('scanPairingQr');
      codeInput.value = String(result.code || '').toUpperCase();
      setStatus('Pairing code scanned. Tap Pair this device to continue.');
    } catch (error) { setStatus(error.message, true); }
    finally { scanButton.disabled = false; }
  });
  joinButton?.addEventListener('click', async () => {
    const code = (codeInput?.value || '').replace(/[^A-Fa-f0-9]/g, '').toUpperCase();
    if (code.length !== 8) { setStatus('Enter the complete 8-character pairing code.', true); return; }
    joinButton.disabled = true;
    try { await nativeCall('joinPairingCode', code); codeInput.value = ''; codeOutput.classList.add('hidden'); setStatus('Devices paired successfully.'); await refreshDevices(); }
    catch (error) { setStatus(error.message, true); } finally { joinButton.disabled = false; }
  });
  codeInput?.addEventListener('input', () => { codeInput.value = codeInput.value.replace(/[^A-Fa-f0-9]/g, '').toUpperCase().slice(0, 8); });
  refreshStatus();
})();