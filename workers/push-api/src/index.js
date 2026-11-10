import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from "jose";

const FIREBASE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_BODY_BYTES = 8192;
const RATE_LIMITS = Object.freeze({
  register: 30, "pairing/create": 10, "pairing/join": 20,
  devices: 60, notify: 30, "notify/test": 10, unlink: 30
});
let cachedGoogleAccessToken = null;
let cachedGoogleAccessTokenExpiry = 0;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store, max-age=0",
    "pragma": "no-cache",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'"
  }});
}
function fail(status, message) { return json({ error: message }, status); }
function normalizeCode(value) {
  const code = String(value || "").trim().toUpperCase();
  if (!/^[A-F0-9]{12}$/.test(code)) throw new Error("Enter a valid 12-character pairing code.");
  return code;
}
function safeDeviceName(value) {
  const name = String(value || "Mystery Vault device").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return name.slice(0, 80) || "Mystery Vault device";
}
function hex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}
async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function decodeBase64(value) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}
function encodeBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
async function encryptionKey(env) {
  let raw;
  try { raw = decodeBase64(env.FCM_TOKEN_ENCRYPTION_KEY || ""); }
  catch { throw new Error("Push service is not configured."); }
  if (raw.length !== 32) throw new Error("Push service is not configured.");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function encryptFcmToken(env, token) {
  const key = await encryptionKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(token));
  return "v1." + encodeBase64(iv) + "." + encodeBase64(new Uint8Array(ciphertext));
}
async function decryptFcmToken(env, stored) {
  const parts = String(stored || "").split(".");
  if (parts.length !== 3 || parts[0] !== "v1") throw new Error("Stored notification token is invalid.");
  const key = await encryptionKey(env);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeBase64(parts[1]) }, key, decodeBase64(parts[2])
  );
  return new TextDecoder().decode(plaintext);
}
function bearerToken(request) {
  const value = request.headers.get("authorization") || "";
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(value);
  if (!match) throw new Error("Missing bearer token.");
  return match[1];
}
async function authenticate(request, projectId) {
  const { payload, protectedHeader } = await jwtVerify(bearerToken(request), FIREBASE_JWKS, {
    algorithms: ["RS256"],
    audience: projectId,
    issuer: "https://securetoken.google.com/" + projectId,
    clockTolerance: 5
  });
  const now = Math.floor(Date.now() / 1000);
  if (protectedHeader.alg !== "RS256" ||
      typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 128 ||
      !Number.isFinite(payload.iat) || payload.iat > now + 5 ||
      !Number.isFinite(payload.auth_time) || payload.auth_time > now + 5) {
    throw new Error("Invalid Firebase identity token.");
  }
  return payload.sub;
}
async function enforceRateLimit(db, uid, action, overrideLimit) {
  const limit = overrideLimit || RATE_LIMITS[action] || 30;
  const now = Date.now();
  const row = await db.prepare(`
    INSERT INTO rate_limits (uid, action, window_started_at, request_count)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(uid, action) DO UPDATE SET
      request_count = CASE
        WHEN excluded.window_started_at - rate_limits.window_started_at >= 60000 THEN 1
        ELSE rate_limits.request_count + 1
      END,
      window_started_at = CASE
        WHEN excluded.window_started_at - rate_limits.window_started_at >= 60000 THEN excluded.window_started_at
        ELSE rate_limits.window_started_at
      END
    RETURNING request_count
  `).bind(uid, action, now).first();
  if (!row || row.request_count > limit) throw new Error("Too many requests. Wait a minute and try again.");
}
function parseServiceAccount(env) {
  let account;
  try { account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON || ""); }
  catch { throw new Error("Push service is not configured."); }
  if (!account || typeof account.client_email !== "string" ||
      typeof account.private_key !== "string" ||
      account.project_id !== env.FIREBASE_PROJECT_ID) {
    throw new Error("Push service is not configured.");
  }
  return account;
}
async function googleAccessToken(env) {
  if (cachedGoogleAccessToken && Date.now() < cachedGoogleAccessTokenExpiry - 60000) return cachedGoogleAccessToken;
  const account = parseServiceAccount(env);
  const key = await importPKCS8(account.private_key, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: FCM_SCOPE })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(account.client_email).setSubject(account.client_email)
    .setAudience(GOOGLE_TOKEN_URL).setIssuedAt(now).setExpirationTime(now + 3600).sign(key);
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion })
  });
  if (!response.ok) throw new Error("Google authentication failed.");
  const result = await response.json();
  if (typeof result.access_token !== "string" || !Number.isFinite(result.expires_in)) {
    throw new Error("Google returned an invalid access token.");
  }
  cachedGoogleAccessToken = result.access_token;
  cachedGoogleAccessTokenExpiry = Date.now() + result.expires_in * 1000;
  return cachedGoogleAccessToken;
}
async function sendFcm(env, token, title, body, data = {}) {
  const accessToken = await googleAccessToken(env);
  const response = await fetch(
    "https://fcm.googleapis.com/v1/projects/" + encodeURIComponent(env.FIREBASE_PROJECT_ID) + "/messages:send",
    { method: "POST", headers: {
      authorization: "Bearer " + accessToken, "content-type": "application/json"
    }, body: JSON.stringify({ message: { token, notification: { title, body }, data } }) }
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorText = JSON.stringify(result);
    if (response.status === 404 || errorText.includes("UNREGISTERED") ||
        errorText.includes("registration-token-not-registered")) return { invalidToken: true };
    throw new Error("Firebase could not deliver the notification.");
  }
  return { sent: true };
}
async function readJson(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BODY_BYTES) throw new Error("Request is too large.");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) throw new Error("Request is too large.");
  try {
    const value = JSON.parse(raw || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new Error("Invalid request body."); }
}
async function register(db, env, uid, body) {
  const token = String(body.fcmToken || "").trim();
  if (token.length < 20 || token.length > 4096) throw new Error("A valid FCM registration token is required.");
  const encryptedToken = await encryptFcmToken(env, token);
  await db.prepare(`
    INSERT INTO installations (uid, fcm_token, device_name, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(uid) DO UPDATE SET fcm_token = excluded.fcm_token,
      device_name = excluded.device_name, updated_at = excluded.updated_at
  `).bind(uid, encryptedToken, safeDeviceName(body.deviceName), Date.now()).run();
  return { registered: true };
}
async function createPairingCode(db, uid) {
  const code = hex(crypto.getRandomValues(new Uint8Array(6)));
  const now = Date.now();
  await db.prepare("INSERT INTO pairing_codes (code_hash, created_by, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256Hex(code), uid, now, now + CODE_TTL_MS).run();
  return { code, expiresAt: now + CODE_TTL_MS };
}
async function joinPairingCode(db, uid, body) {
  const codeHash = await sha256Hex(normalizeCode(body.code));
  const now = Date.now();
  const pairing = await db.prepare("SELECT created_by, expires_at, used_at FROM pairing_codes WHERE code_hash = ?")
    .bind(codeHash).first();
  if (!pairing || pairing.used_at !== null || pairing.expires_at <= now) {
    throw new Error("That pairing code is invalid, expired, or already used.");
  }
  if (pairing.created_by === uid) throw new Error("A device cannot pair with itself.");
  const registrations = await db.prepare("SELECT uid FROM installations WHERE uid IN (?, ?)")
    .bind(pairing.created_by, uid).all();
  if ((registrations.results || []).length !== 2) {
    throw new Error("Both devices must register for notifications before pairing.");
  }
  const consumed = await db.prepare(`
    UPDATE pairing_codes SET used_at = ?, used_by = ?
    WHERE code_hash = ? AND used_at IS NULL AND expires_at > ? AND created_by <> ?
    RETURNING created_by
  `).bind(now, uid, codeHash, now, uid).first();
  if (!consumed) throw new Error("That pairing code is invalid, expired, or already used.");
  const linkId = crypto.randomUUID();
  const memberA = consumed.created_by < uid ? consumed.created_by : uid;
  const memberB = consumed.created_by < uid ? uid : consumed.created_by;
  await db.prepare("INSERT OR IGNORE INTO device_links (id, member_a, member_b, created_at) VALUES (?, ?, ?, ?)")
    .bind(linkId, memberA, memberB, now).run();
  return { paired: true };
}
async function listDevices(db, uid) {
  const result = await db.prepare(`
    SELECT l.id AS linkId, i.device_name AS deviceName, l.created_at AS createdAt
    FROM device_links l
    JOIN installations i ON i.uid = CASE WHEN l.member_a = ? THEN l.member_b ELSE l.member_a END
    WHERE l.member_a = ? OR l.member_b = ? ORDER BY l.created_at DESC LIMIT 100
  `).bind(uid, uid, uid).all();
  return { devices: (result.results || []).map((row) => ({
    linkId: row.linkId, deviceName: safeDeviceName(row.deviceName), createdAt: row.createdAt
  })) };
}
async function sendToLinkedDevice(db, env, uid, body) {
  const linkId = String(body.linkId || "");
  const message = String(body.message || "").trim();
  if (!/^[A-Za-z0-9_-]{10,80}$/.test(linkId)) throw new Error("Choose a valid linked device.");
  if (!message || message.length > 200) throw new Error("Notification text must be between 1 and 200 characters.");
  const link = await db.prepare("SELECT member_a, member_b FROM device_links WHERE id = ? AND (member_a = ? OR member_b = ?)")
    .bind(linkId, uid, uid).first();
  if (!link) throw new Error("This device link does not exist or you are not allowed to use it.");
  const recipientUid = link.member_a === uid ? link.member_b : link.member_a;
  const recipient = await db.prepare("SELECT fcm_token FROM installations WHERE uid = ?").bind(recipientUid).first();
  if (!recipient?.fcm_token) throw new Error("The other device has not registered an FCM token.");
  const plainToken = await decryptFcmToken(env, recipient.fcm_token);
  const sent = await sendFcm(env, plainToken, "Mystery Vault", message, {
    type: "paired_device_message", linkId, sender: uid
  });
  if (sent.invalidToken) {
    await db.prepare("UPDATE installations SET fcm_token = '' WHERE uid = ? AND fcm_token = ?")
      .bind(recipientUid, recipient.fcm_token).run();
    throw new Error("The receiving device token has expired. Reopen Mystery Vault on that device.");
  }
  return { sent: true };
}
async function sendTest(db, env, uid) {
  const installation = await db.prepare("SELECT fcm_token FROM installations WHERE uid = ?").bind(uid).first();
  if (!installation?.fcm_token) throw new Error("This device has not registered an FCM token yet.");
  const plainToken = await decryptFcmToken(env, installation.fcm_token);
  const sent = await sendFcm(env, plainToken, "Mystery Vault test",
    "Push notifications are working on this phone.", { type: "self_test" });
  if (sent.invalidToken) {
    await db.prepare("UPDATE installations SET fcm_token = '' WHERE uid = ? AND fcm_token = ?")
      .bind(uid, installation.fcm_token).run();
    throw new Error("This phone's notification token has expired. Reopen the app and try again.");
  }
  return { sent: true };
}
async function unlinkDevice(db, uid, body) {
  const linkId = String(body.linkId || "");
  if (!/^[A-Za-z0-9_-]{10,80}$/.test(linkId)) throw new Error("Choose a valid linked device.");
  await db.prepare("DELETE FROM device_links WHERE id = ? AND (member_a = ? OR member_b = ?)")
    .bind(linkId, uid, uid).run();
  return { unlinked: true };
}
const ALLOWED_ACTIONS = new Set([
  "register", "pairing/create", "pairing/join", "devices", "notify", "notify/test", "unlink"
]);

export default {
  async scheduled(_controller, env, ctx) {
    const now = Date.now();
    ctx.waitUntil(env.DB.batch([
      env.DB.prepare("DELETE FROM pairing_codes WHERE expires_at < ?").bind(now),
      env.DB.prepare("DELETE FROM rate_limits WHERE window_started_at < ?").bind(now - 86400000)
    ]));
  },
  async fetch(request, env) {
    if (request.method !== "POST") return fail(405, "Method not allowed.");
    const url = new URL(request.url);
    const action = url.pathname.startsWith("/v1/") ? url.pathname.slice(4) : "";
    if (!ALLOWED_ACTIONS.has(action)) return fail(404, "Not found.");
    if (!env.DB || !env.FIREBASE_PROJECT_ID || env.FIREBASE_PROJECT_ID.startsWith("REPLACE_")) {
      return fail(503, "Push service is not configured.");
    }
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      return fail(415, "Content-Type must be application/json.");
    }
    let uid;
    try { uid = await authenticate(request, env.FIREBASE_PROJECT_ID); }
    catch { return fail(401, "Your sign-in session is invalid. Reopen the app and try again."); }

    try {
      await enforceRateLimit(env.DB, uid, action);
      const clientIp = request.headers.get("cf-connecting-ip");
      if (clientIp) {
        const ipKey = "ip:" + await sha256Hex(clientIp);
        await enforceRateLimit(env.DB, ipKey, "ip:all", 120);
      }
      const body = action === "devices" || action === "notify/test" ? {} : await readJson(request);
      let result;
      switch (action) {
        case "register": result = await register(env.DB, env, uid, body); break;
        case "pairing/create": result = await createPairingCode(env.DB, uid); break;
        case "pairing/join": result = await joinPairingCode(env.DB, uid, body); break;
        case "devices": result = await listDevices(env.DB, uid); break;
        case "notify": result = await sendToLinkedDevice(env.DB, env, uid, body); break;
        case "notify/test": result = await sendTest(env.DB, env, uid); break;
        case "unlink": result = await unlinkDevice(env.DB, uid, body); break;
        default: return fail(404, "Not found.");
      }
      return json(result);
    } catch (error) {
      const message = error?.message || "";
      if (message.includes("Too many requests")) return fail(429, message);
      const clientPrefixes = [
        "Enter a valid", "A valid FCM", "That pairing code", "A device cannot",
        "Both devices", "Choose a valid", "Notification text", "This device",
        "The other device", "The receiving device", "This phone's notification"
      ];
      if (clientPrefixes.some((prefix) => message.startsWith(prefix))) return fail(400, message);
      return fail(500, "The request could not be completed. Please try again.");
    }
  }
};

export const __test = { normalizeCode, safeDeviceName, hex, sha256Hex, bearerToken, RATE_LIMITS, encryptFcmToken, decryptFcmToken };
