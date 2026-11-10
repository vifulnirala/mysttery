"use strict";

const crypto = require("node:crypto");
const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");

admin.initializeApp();
setGlobalOptions({ region: "us-central1", maxInstances: 5 });
const db = admin.firestore();
const messaging = admin.messaging();
const CODE_TTL_MS = 10 * 60 * 1000;

function requireUid(request) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in to Mystery Vault before using device pairing.");
  return request.auth.uid;
}
function hashCode(code) { return crypto.createHash("sha256").update(code).digest("hex"); }
function normalizeCode(value) {
  const code = String(value || "").trim().toUpperCase();
  if (!/^[A-F0-9]{8}$/.test(code)) throw new HttpsError("invalid-argument", "Enter a valid 8-character pairing code.");
  return code;
}
function safeDeviceName(value) {
  const name = String(value || "Mystery Vault device").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return name.slice(0, 80) || "Mystery Vault device";
}

exports.registerInstallation = onCall(async (request) => {
  const uid = requireUid(request);
  const token = String(request.data?.fcmToken || "").trim();
  if (token.length < 20 || token.length > 4096) throw new HttpsError("invalid-argument", "A valid FCM registration token is required.");
  await db.collection("installations").doc(uid).set({
    fcmToken: token, deviceName: safeDeviceName(request.data?.deviceName),
    tokenUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastSeenAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  return { registered: true };
});

exports.createPairingCode = onCall(async (request) => {
  const uid = requireUid(request);
  const code = crypto.randomBytes(4).toString("hex").toUpperCase();
  const expiresAt = Date.now() + CODE_TTL_MS;
  await db.collection("pairingCodes").doc(hashCode(code)).set({
    createdBy: uid, createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: admin.firestore.Timestamp.fromMillis(expiresAt), usedAt: null, usedBy: null
  });
  return { code, expiresAt };
});

exports.joinPairingCode = onCall(async (request) => {
  const uid = requireUid(request);
  const code = normalizeCode(request.data?.code);
  const codeRef = db.collection("pairingCodes").doc(hashCode(code));
  const linkRef = db.collection("deviceLinks").doc();
  await db.runTransaction(async (transaction) => {
    const codeSnapshot = await transaction.get(codeRef);
    if (!codeSnapshot.exists) throw new HttpsError("not-found", "That pairing code is invalid or has expired.");
    const pairing = codeSnapshot.data();
    if (pairing.usedAt) throw new HttpsError("failed-precondition", "That pairing code has already been used.");
    if (!pairing.expiresAt || pairing.expiresAt.toMillis() <= Date.now()) throw new HttpsError("deadline-exceeded", "That pairing code has expired. Generate a new one.");
    if (pairing.createdBy === uid) throw new HttpsError("failed-precondition", "A device cannot pair with itself.");
    const ownerRef = db.collection("installations").doc(pairing.createdBy);
    const joiningRef = db.collection("installations").doc(uid);
    const ownerSnapshot = await transaction.get(ownerRef);
    const joiningSnapshot = await transaction.get(joiningRef);
    if (!ownerSnapshot.exists || !joiningSnapshot.exists) throw new HttpsError("failed-precondition", "Both devices must register with Firebase before pairing.");
    transaction.create(linkRef, { members: [pairing.createdBy, uid], createdAt: admin.firestore.FieldValue.serverTimestamp() });
    transaction.update(codeRef, { usedAt: admin.firestore.FieldValue.serverTimestamp(), usedBy: uid });
  });
  return { paired: true, linkId: linkRef.id };
});

exports.listLinkedDevices = onCall(async (request) => {
  const uid = requireUid(request);
  const snapshot = await db.collection("deviceLinks").where("members", "array-contains", uid).get();
  const devices = await Promise.all(snapshot.docs.map(async (link) => {
    const otherUid = (link.get("members") || []).find((member) => member !== uid);
    if (!otherUid) return null;
    const installation = await db.collection("installations").doc(otherUid).get();
    if (!installation.exists) return null;
    return { linkId: link.id, deviceName: safeDeviceName(installation.get("deviceName")), createdAt: link.get("createdAt")?.toMillis?.() || null };
  }));
  return { devices: devices.filter(Boolean) };
});

exports.sendNotification = onCall(async (request) => {
  const uid = requireUid(request);
  const linkId = String(request.data?.linkId || "");
  const body = String(request.data?.message || "").trim();
  if (!/^[A-Za-z0-9_-]{10,80}$/.test(linkId)) throw new HttpsError("invalid-argument", "Choose a valid linked device.");
  if (!body || body.length > 200) throw new HttpsError("invalid-argument", "Notification text must be between 1 and 200 characters.");
  const linkSnapshot = await db.collection("deviceLinks").doc(linkId).get();
  if (!linkSnapshot.exists) throw new HttpsError("not-found", "This device link no longer exists.");
  const members = linkSnapshot.get("members") || [];
  if (!members.includes(uid) || members.length !== 2) throw new HttpsError("permission-denied", "You are not a member of this device link.");
  const recipientUid = members.find((member) => member !== uid);
  const recipient = await db.collection("installations").doc(recipientUid).get();
  const token = recipient.get("fcmToken");
  if (!token) throw new HttpsError("failed-precondition", "The other device has not registered an FCM token.");
  try {
    const messageId = await messaging.send({ token, notification: { title: "Mystery Vault", body }, data: { type: "paired_device_message", linkId, sender: uid } });
    return { sent: true, messageId };
  } catch (error) {
    if (error.code === "messaging/registration-token-not-registered" || error.code === "messaging/invalid-registration-token") {
      await recipient.ref.set({ fcmToken: admin.firestore.FieldValue.delete() }, { merge: true });
    }
    throw new HttpsError("internal", "Firebase could not deliver the notification. The receiving device may need to reopen the app.");
  }
});

exports.sendTestNotification = onCall(async (request) => {
  const uid = requireUid(request);
  const installation = await db.collection("installations").doc(uid).get();
  const token = installation.get("fcmToken");
  if (!token) throw new HttpsError("failed-precondition", "This device has not registered an FCM token yet.");
  try {
    const messageId = await messaging.send({ token, notification: { title: "Mystery Vault test", body: "Push notifications are working on this phone." }, data: { type: "self_test" } });
    return { sent: true, messageId };
  } catch (_) { throw new HttpsError("internal", "Could not send a test notification to this phone."); }
});

exports.unlinkDevice = onCall(async (request) => {
  const uid = requireUid(request);
  const linkId = String(request.data?.linkId || "");
  if (!/^[A-Za-z0-9_-]{10,80}$/.test(linkId)) throw new HttpsError("invalid-argument", "Choose a valid linked device.");
  const linkRef = db.collection("deviceLinks").doc(linkId);
  const snapshot = await linkRef.get();
  if (!snapshot.exists) return { unlinked: true };
  if (!(snapshot.get("members") || []).includes(uid)) throw new HttpsError("permission-denied", "You are not allowed to unlink this device.");
  await linkRef.delete();
  return { unlinked: true };
});