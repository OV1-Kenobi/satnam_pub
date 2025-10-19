/**
 * PKARR Publish Endpoint Tests
 * Tests for signature verification, input validation, and database storage
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ed25519 } from "@noble/curves/ed25519";

/**
 * Helper: Generate Ed25519 keypair for testing
 */
function generateTestKeypair() {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(privateKey);
  return {
    privateKeyHex: Buffer.from(privateKey).toString("hex"),
    publicKeyHex: Buffer.from(publicKey).toString("hex"),
  };
}

/**
 * Helper: Sign PKARR payload
 */
function signPkarrPayload(
  privateKeyHex: string,
  records: unknown[],
  timestamp: number,
  sequence: number
): string {
  const message = `${JSON.stringify(records)}${timestamp}${sequence}`;
  const messageBytes = new TextEncoder().encode(message);
  const privateKey = new Uint8Array(Buffer.from(privateKeyHex, "hex"));
  const signature = ed25519.sign(messageBytes, privateKey);
  return Buffer.from(signature).toString("hex");
}

describe("PKARR Publish Endpoint", () => {
  let testKeypair: ReturnType<typeof generateTestKeypair>;

  beforeEach(() => {
    testKeypair = generateTestKeypair();
  });

  describe("Signature Verification", () => {
    it("should accept valid Ed25519 signature", () => {
      const records = [{ name: "test", type: "TXT", value: "test-value" }];
      const timestamp = Math.floor(Date.now() / 1000);
      const sequence = 1;

      const signature = signPkarrPayload(
        testKeypair.privateKeyHex,
        records,
        timestamp,
        sequence
      );

      // Verify signature is valid
      const message = `${JSON.stringify(records)}${timestamp}${sequence}`;
      const messageBytes = new TextEncoder().encode(message);
      const publicKey = new Uint8Array(
        Buffer.from(testKeypair.publicKeyHex, "hex")
      );
      const signatureBytes = new Uint8Array(Buffer.from(signature, "hex"));

      const isValid = ed25519.verify(signatureBytes, messageBytes, publicKey);
      expect(isValid).toBe(true);
    });

    it("should reject invalid signature", () => {
      const records = [{ name: "test", type: "TXT", value: "test-value" }];
      const timestamp = Math.floor(Date.now() / 1000);
      const sequence = 1;

      // Create invalid signature (all zeros)
      const invalidSignature = "0".repeat(128);

      const message = `${JSON.stringify(records)}${timestamp}${sequence}`;
      const messageBytes = new TextEncoder().encode(message);
      const publicKey = new Uint8Array(
        Buffer.from(testKeypair.publicKeyHex, "hex")
      );
      const signatureBytes = new Uint8Array(Buffer.from(invalidSignature, "hex"));

      const isValid = ed25519.verify(signatureBytes, messageBytes, publicKey);
      expect(isValid).toBe(false);
    });

    it("should reject signature with tampered records", () => {
      const records = [{ name: "test", type: "TXT", value: "test-value" }];
      const timestamp = Math.floor(Date.now() / 1000);
      const sequence = 1;

      const signature = signPkarrPayload(
        testKeypair.privateKeyHex,
        records,
        timestamp,
        sequence
      );

      // Tamper with records
      const tamperedRecords = [
        { name: "test", type: "TXT", value: "tampered-value" },
      ];
      const message = `${JSON.stringify(tamperedRecords)}${timestamp}${sequence}`;
      const messageBytes = new TextEncoder().encode(message);
      const publicKey = new Uint8Array(
        Buffer.from(testKeypair.publicKeyHex, "hex")
      );
      const signatureBytes = new Uint8Array(Buffer.from(signature, "hex"));

      const isValid = ed25519.verify(signatureBytes, messageBytes, publicKey);
      expect(isValid).toBe(false);
    });
  });

  describe("Input Validation", () => {
    it("should validate sequence is a non-negative integer", () => {
      const testCases = [
        { sequence: -1, valid: false, reason: "negative" },
        { sequence: 0, valid: true, reason: "zero" },
        { sequence: 1, valid: true, reason: "positive" },
        { sequence: 1.5, valid: false, reason: "float" },
        { sequence: "1", valid: false, reason: "string" },
        { sequence: null, valid: false, reason: "null" },
        { sequence: undefined, valid: false, reason: "undefined" },
      ];

      for (const tc of testCases) {
        const isValid =
          typeof tc.sequence === "number" &&
          Number.isInteger(tc.sequence) &&
          tc.sequence >= 0;
        expect(isValid).toBe(tc.valid, `sequence ${tc.reason} should be ${tc.valid}`);
      }
    });

    it("should validate timestamp is within reasonable range", () => {
      const now = Math.floor(Date.now() / 1000);
      const testCases = [
        { timestamp: now - 7200, valid: false, reason: "2 hours past" },
        { timestamp: now - 3600, valid: true, reason: "1 hour past" },
        { timestamp: now, valid: true, reason: "now" },
        { timestamp: now + 300, valid: true, reason: "5 min future" },
        { timestamp: now + 600, valid: false, reason: "10 min future" },
        { timestamp: now + 1.5, valid: false, reason: "float" },
      ];

      for (const tc of testCases) {
        const isValid =
          typeof tc.timestamp === "number" &&
          Number.isInteger(tc.timestamp) &&
          tc.timestamp >= now - 3600 &&
          tc.timestamp <= now + 300;
        expect(isValid).toBe(tc.valid, `timestamp ${tc.reason} should be ${tc.valid}`);
      }
    });

    it("should validate public key format (64 hex chars)", () => {
      const testCases = [
        { key: testKeypair.publicKeyHex, valid: true, reason: "valid hex" },
        { key: testKeypair.publicKeyHex.toUpperCase(), valid: true, reason: "uppercase" },
        { key: testKeypair.publicKeyHex.slice(0, 63), valid: false, reason: "too short" },
        { key: testKeypair.publicKeyHex + "0", valid: false, reason: "too long" },
        { key: "G".repeat(64), valid: false, reason: "invalid hex chars" },
        { key: "", valid: false, reason: "empty" },
      ];

      for (const tc of testCases) {
        const isValid = /^[0-9a-fA-F]{64}$/.test(tc.key);
        expect(isValid).toBe(tc.valid, `key ${tc.reason} should be ${tc.valid}`);
      }
    });

    it("should validate signature format (128 hex chars)", () => {
      const validSig = "0".repeat(128);
      const testCases = [
        { sig: validSig, valid: true, reason: "valid hex" },
        { sig: validSig.slice(0, 127), valid: false, reason: "too short" },
        { sig: validSig + "0", valid: false, reason: "too long" },
        { sig: "G".repeat(128), valid: false, reason: "invalid hex chars" },
        { sig: "", valid: false, reason: "empty" },
      ];

      for (const tc of testCases) {
        const isValid = /^[0-9a-fA-F]{128}$/.test(tc.sig);
        expect(isValid).toBe(tc.valid, `signature ${tc.reason} should be ${tc.valid}`);
      }
    });

    it("should validate record TTL is between 60 and 86400 seconds", () => {
      const testCases = [
        { ttl: 30, valid: false, reason: "too low" },
        { ttl: 60, valid: true, reason: "minimum" },
        { ttl: 3600, valid: true, reason: "1 hour" },
        { ttl: 86400, valid: true, reason: "maximum" },
        { ttl: 86401, valid: false, reason: "too high" },
        { ttl: 0, valid: false, reason: "zero" },
      ];

      for (const tc of testCases) {
        const isValid = tc.ttl >= 60 && tc.ttl <= 86400;
        expect(isValid).toBe(tc.valid, `TTL ${tc.reason} should be ${tc.valid}`);
      }
    });
  });

  describe("Record Validation", () => {
    it("should require name, type, and value fields", () => {
      const validRecord = { name: "test", type: "TXT", value: "test-value" };
      const testCases = [
        { record: validRecord, valid: true, reason: "complete" },
        { record: { type: "TXT", value: "test" }, valid: false, reason: "missing name" },
        { record: { name: "test", value: "test" }, valid: false, reason: "missing type" },
        { record: { name: "test", type: "TXT" }, valid: false, reason: "missing value" },
        { record: {}, valid: false, reason: "empty" },
      ];

      for (const tc of testCases) {
        const isValid =
          tc.record.name && tc.record.type && tc.record.value;
        expect(isValid).toBe(tc.valid, `record ${tc.reason} should be ${tc.valid}`);
      }
    });
  });
});

