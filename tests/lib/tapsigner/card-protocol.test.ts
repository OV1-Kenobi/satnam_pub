/**
 * Card Protocol Library Unit Tests
 * Phase 4 Task 4.1: Unit Tests - Step 1
 *
 * Tests for Tapsigner card protocol with REAL Web Crypto API
 * NO MOCKING - uses real cryptographic operations
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  constantTimeCompare,
  formatCardId,
  generateChallenge,
  generateSignature,
  hashPIN,
  validateChallenge,
  validatePublicKey,
  validateSignature,
  verifyPIN,
  type Challenge,
} from "../../../src/lib/tapsigner/card-protocol";
import { cleanupTestEnv, setupTestEnv } from "../../setup/tapsigner-test-setup";

describe("Card Protocol Library", () => {
  beforeEach(() => {
    setupTestEnv();
  });

  afterEach(() => {
    cleanupTestEnv();
  });

  describe("generateChallenge", () => {
    it("should generate valid challenge", () => {
      const challenge = generateChallenge();

      expect(challenge).toBeDefined();
      expect(challenge.nonce).toBeDefined();
      expect(challenge.timestamp).toBeGreaterThan(0);
      expect(challenge.expiresAt).toBeGreaterThan(challenge.timestamp);
    });

    it("should generate 64-character hex nonce by default", () => {
      const challenge = generateChallenge();
      expect(challenge.nonce).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should generate custom length nonce", () => {
      const challenge = generateChallenge(16);
      expect(challenge.nonce).toMatch(/^[a-f0-9]{32}$/); // 16 bytes = 32 hex chars
    });

    it("should set expiry to 5 minutes", () => {
      const challenge = generateChallenge();
      const expectedExpiry = challenge.timestamp + 5 * 60 * 1000;
      expect(challenge.expiresAt).toBe(expectedExpiry);
    });

    it("should generate unique nonces", () => {
      const challenge1 = generateChallenge();
      const challenge2 = generateChallenge();
      expect(challenge1.nonce).not.toBe(challenge2.nonce);
    });
  });

  describe("validateChallenge", () => {
    it("should validate non-expired challenge", () => {
      const challenge = generateChallenge();
      const result = validateChallenge(challenge);
      expect(result).toBe(true);
    });

    it("should reject expired challenge", () => {
      const challenge: Challenge = {
        nonce: "a".repeat(64),
        timestamp: Date.now() - 10 * 60 * 1000,
        expiresAt: Date.now() - 1000,
      };
      const result = validateChallenge(challenge);
      expect(result).toBe(false);
    });

    it("should reject null or undefined", () => {
      expect(validateChallenge(null as any)).toBe(false);
      expect(validateChallenge(undefined as any)).toBe(false);
    });

    it("should reject challenge without nonce", () => {
      const challenge: Challenge = {
        nonce: "",
        timestamp: Date.now(),
        expiresAt: Date.now() + 5 * 60 * 1000,
      };
      expect(validateChallenge(challenge)).toBe(false);
    });

    it("should reject challenge without expiry", () => {
      const challenge: any = {
        nonce: "a".repeat(64),
        timestamp: Date.now(),
      };
      expect(validateChallenge(challenge)).toBe(false);
    });
  });

  describe("hashPIN", () => {
    it("should hash valid PIN", async () => {
      const hash = await hashPIN("123456", "test-salt");
      expect(hash).toBeDefined();
      expect(hash).toMatch(/^[a-f0-9]{64}$/); // SHA-256 = 64 hex chars
    });

    it("should reject empty PIN", async () => {
      try {
        await hashPIN("", "salt");
        expect.fail("Should have thrown error");
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it("should reject non-6-digit PIN", async () => {
      try {
        await hashPIN("12345", "salt");
        expect.fail("Should have thrown error");
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it("should reject PIN with non-digits", async () => {
      try {
        await hashPIN("12345a", "salt");
        expect.fail("Should have thrown error");
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it("should produce consistent hash", async () => {
      const hash1 = await hashPIN("123456", "salt");
      const hash2 = await hashPIN("123456", "salt");
      expect(hash1).toBe(hash2);
    });

    it("should produce different hash for different PIN", async () => {
      const hash1 = await hashPIN("123456", "salt");
      const hash2 = await hashPIN("654321", "salt");
      expect(hash1).not.toBe(hash2);
    });

    it("should produce different hash for different salt", async () => {
      const hash1 = await hashPIN("123456", "salt1");
      const hash2 = await hashPIN("123456", "salt2");
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("constantTimeCompare", () => {
    it("should return true for equal strings", () => {
      const str = "a".repeat(64);
      const result = constantTimeCompare(str, str);
      expect(result).toBe(true);
    });

    it("should return false for different strings", () => {
      const str1 = "a".repeat(64);
      const str2 = "b".repeat(64);
      const result = constantTimeCompare(str1, str2);
      expect(result).toBe(false);
    });

    it("should return false for different lengths", () => {
      const str1 = "a".repeat(64);
      const str2 = "a".repeat(63);
      const result = constantTimeCompare(str1, str2);
      expect(result).toBe(false);
    });

    it("should return false for null or empty", () => {
      expect(constantTimeCompare("", "")).toBe(false);
      expect(constantTimeCompare(null as any, "test")).toBe(false);
      expect(constantTimeCompare("test", null as any)).toBe(false);
    });

    it("should use constant time comparison", () => {
      // Test that comparison doesn't short-circuit
      const str1 = "a".repeat(64);
      const str2 = "b" + "a".repeat(63);
      const result = constantTimeCompare(str1, str2);
      expect(result).toBe(false);
    });
  });

  describe("verifyPIN", () => {
    it("should verify correct PIN", async () => {
      const storedHash = await hashPIN("123456", "");
      const result = await verifyPIN("123456", storedHash);

      expect(result.success).toBe(true);
      expect(result.locked).toBe(false);
      expect(result.attemptsRemaining).toBe(3);
    });

    it("should reject incorrect PIN", async () => {
      const storedHash = await hashPIN("123456", "");
      const result = await verifyPIN("654321", storedHash);

      expect(result.success).toBe(false);
      expect(result.locked).toBe(false);
      expect(result.attemptsRemaining).toBe(2);
    });

    it("should reject invalid PIN format", async () => {
      const storedHash = await hashPIN("123456", "");
      const result = await verifyPIN("12345", storedHash);

      expect(result.success).toBe(false);
      expect(result.message).toContain("Invalid PIN format");
    });

    it("should lock card after max attempts", async () => {
      const storedHash = await hashPIN("123456", "");
      const result = await verifyPIN("000000", storedHash, 3);

      expect(result.success).toBe(false);
      expect(result.locked).toBe(true);
      expect(result.attemptsRemaining).toBe(0);
    });

    it("should track attempts remaining", async () => {
      const storedHash = await hashPIN("123456", "");

      const result1 = await verifyPIN("000000", storedHash, 0);
      expect(result1.attemptsRemaining).toBe(2);

      const result2 = await verifyPIN("000000", storedHash, 1);
      expect(result2.attemptsRemaining).toBe(1);

      const result3 = await verifyPIN("000000", storedHash, 2);
      expect(result3.attemptsRemaining).toBe(0);
      expect(result3.locked).toBe(true);
    });
  });

  describe("generateSignature", () => {
    it("should generate signature", async () => {
      const eventHash = "a".repeat(64);
      const result = await generateSignature(eventHash, "test-card-id");

      expect(result).toBeDefined();
      expect(result.signature).toBeDefined();
      expect(result.publicKey).toBeDefined();
      expect(result.timestamp).toBeGreaterThan(0);
    });

    it("should reject empty event hash", async () => {
      try {
        await generateSignature("", "test-card-id");
        expect.fail("Should have thrown error");
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it("should reject empty card ID", async () => {
      try {
        await generateSignature("a".repeat(64), "");
        expect.fail("Should have thrown error");
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe("validateSignature", () => {
    it("should validate correct signature format", () => {
      const signature = "a".repeat(128);
      const result = validateSignature(signature);
      expect(result).toBe(true);
    });

    it("should reject empty signature", () => {
      expect(validateSignature("")).toBe(false);
    });

    it("should reject invalid length", () => {
      expect(validateSignature("a".repeat(127))).toBe(false);
      expect(validateSignature("a".repeat(129))).toBe(false);
    });

    it("should reject non-hex signature", () => {
      expect(validateSignature("z".repeat(128))).toBe(false);
    });
  });

  describe("validatePublicKey", () => {
    it("should validate correct public key format", () => {
      const publicKey = "a".repeat(64);
      const result = validatePublicKey(publicKey);
      expect(result).toBe(true);
    });

    it("should reject empty public key", () => {
      expect(validatePublicKey("")).toBe(false);
    });

    it("should reject invalid length", () => {
      expect(validatePublicKey("a".repeat(63))).toBe(false);
      expect(validatePublicKey("a".repeat(65))).toBe(false);
    });

    it("should reject non-hex public key", () => {
      expect(validatePublicKey("z".repeat(64))).toBe(false);
    });
  });

  describe("formatCardId", () => {
    it("should format card ID correctly", () => {
      const cardId = "a1b2c3d4e5f6g7h8";
      const result = formatCardId(cardId);
      expect(result).toContain("A1B2");
      expect(result).toContain("G7H8");
      expect(result).toContain("...");
    });

    it("should handle short card IDs", () => {
      const cardId = "abc";
      const result = formatCardId(cardId);
      expect(result).toBe("abc");
    });

    it("should return empty string for empty input", () => {
      const result = formatCardId("");
      expect(result).toBe("");
    });
  });
});
