"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
function normalizeCode(value) { const code = String(value || "").trim().toUpperCase(); if (!/^[A-F0-9]{8}$/.test(code)) throw new Error("invalid pairing code"); return code; }
function hashCode(code) { return crypto.createHash("sha256").update(code).digest("hex"); }
test("pairing codes normalize case and whitespace", () => assert.equal(normalizeCode(" a1b2c3d4 "), "A1B2C3D4"));
test("pairing codes reject invalid characters and lengths", () => { for (const value of ["", "123", "123456789", "ABCDEFGH", "1234-678"]) assert.throws(() => normalizeCode(value)); });
test("pairing code hashes are deterministic and not stored in plaintext", () => { const hash = hashCode("A1B2C3D4"); assert.equal(hash, hashCode("A1B2C3D4")); assert.notEqual(hash, "A1B2C3D4"); assert.equal(hash.length, 64); });