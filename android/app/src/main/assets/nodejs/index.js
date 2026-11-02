const http = require('node:http');

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'mystery-vault-android-node',
      node: process.version,
      platform: process.platform
    }));
    return;
  }

  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mystery Vault</title></head><body style="font-family:sans-serif;padding:24px;background:#10131c;color:#f4f4f5"><h1>Mystery Vault</h1><p>Embedded Node.js runtime is running.</p><p id="status">Checking local service…</p><script>fetch("/health").then(r=>r.json()).then(x=>document.getElementById("status").textContent="Node "+x.node+" is serving this page.").catch(e=>document.getElementById("status").textContent=e.message)</script></body></html>');
});

server.listen(3000, '127.0.0.1');
