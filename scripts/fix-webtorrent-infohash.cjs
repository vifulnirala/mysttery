const fs = require('node:fs');
const path = require('node:path');

const target = path.join(__dirname, '..', 'node_modules', 'webtorrent', 'lib', 'torrent.js');

if (!fs.existsSync(target)) {
  console.warn('[Mystery Vault] WebTorrent source not found; skipping info-hash compatibility patch.');
  process.exit(0);
}

let source = fs.readFileSync(target, 'utf8');
const bad = 'arr2hex(parsedTorrent.infoHash)';
const good = 'arr2hex(parsedTorrent.infoHashBuffer)';
const count = source.split(bad).length - 1;

if (count > 0) {
  source = source.split(bad).join(good);
  fs.writeFileSync(target, source, 'utf8');
  console.log(`[Mystery Vault] Applied WebTorrent info-hash compatibility patch (${count} occurrence(s)).`);
} else if (source.includes(good)) {
  console.log('[Mystery Vault] WebTorrent info-hash compatibility patch already applied.');
} else {
  console.warn('[Mystery Vault] WebTorrent source differs from the expected version; no patch was applied.');
}
