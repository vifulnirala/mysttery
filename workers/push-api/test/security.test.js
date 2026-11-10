import test from "node:test";
import assert from "node:assert/strict";
import { __test } from "../src/index.js";

test("pairing code accepts exactly twelve hexadecimal characters", () => {
  assert.equal(__test.normalizeCode(" a1b2c3d4e5f6 "), "A1B2C3D4E5F6");
  for (const value of ["", "123", "1234567890123", "ABCDEFGHIJKL", "1234-67890123"]) {
    assert.throws(() => __test.normalizeCode(value));
  }
});

test("device names are bounded and control characters are stripped", () => {
  assert.equal(__test.safeDeviceName("  Pixel\u0000 9  "), "Pixel 9");
  assert.equal(__test.safeDeviceName(""), "Mystery Vault device");
  assert.equal(__test.safeDeviceName("x".repeat(100)).length, 80);
});

test("hex encoding is uppercase and fixed width", () => {
  assert.equal(__test.hex(new Uint8Array([0, 15, 255])), "000FFF");
});

test("bearer parser rejects missing, malformed and extra credentials", () => {
  for (const value of [null, "", "Basic abc", "Bearer a b", "Bearer token extra"]) {
    assert.throws(() => __test.bearerToken(new Request("https://example.test", {
      headers: value ? { authorization: value } : {}
    })));
  }
  assert.equal(__test.bearerToken(new Request("https://example.test", {
    headers: { authorization: "Bearer abc.def_ghi-123" }
  })), "abc.def_ghi-123");
});

test("rate limits exist for every exposed action", () => {
  for (const action of ["register", "pairing/create", "pairing/join", "devices", "notify", "notify/test", "unlink"]) {
    assert.ok(Number.isInteger(__test.RATE_LIMITS[action]));
    assert.ok(__test.RATE_LIMITS[action] > 0);
  }
});

test("FCM tokens are encrypted at rest and decrypt only with the configured key", async () => {
  const secret = Buffer.alloc(32, 7).toString("base64");
  const env = { FCM_TOKEN_ENCRYPTION_KEY: secret };
  const token = "sample-fcm-registration-token-that-must-not-be-stored-plain";
  const encrypted = await __test.encryptFcmToken(env, token);
  assert.match(encrypted, /^v1\./);
  assert.equal(encrypted.includes(token), false);
  assert.equal(await __test.decryptFcmToken(env, encrypted), token);
  await assert.rejects(() => __test.decryptFcmToken(
    { FCM_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString("base64") }, encrypted
  ));
});

test("encrypted FCM tokens reject malformed storage values", async () => {
  await assert.rejects(() => __test.decryptFcmToken(
    { FCM_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") }, "plaintext-token"
  ));
});

test("unlisted admin, debug and arbitrary paths are not exposed", async () => {
  const worker = (await import("../src/index.js")).default;
  for (const path of ["/admin", "/debug", "/v1/admin", "/v1/debug", "/v1/raw-database", "/v1/send-all"]) {
    const response = await worker.fetch(new Request("https://worker.example" + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}"
    }), { FIREBASE_PROJECT_ID: "test-project", DB: {} });
    assert.equal(response.status, 404, path);
  }
});

test("non-POST methods are rejected", async () => {
  const worker = (await import("../src/index.js")).default;
  const response = await worker.fetch(new Request("https://worker.example/v1/devices"), {
    method: "GET"
  }, { FIREBASE_PROJECT_ID: "test-project", DB: {} });
  assert.equal(response.status, 405);
});

test("a protected route rejects a missing Firebase bearer token", async () => {
  const worker = (await import("../src/index.js")).default;
  const response = await worker.fetch(new Request("https://worker.example/v1/devices", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}"
  }), { FIREBASE_PROJECT_ID: "test-project", DB: {} });
  assert.equal(response.status, 401);
});
