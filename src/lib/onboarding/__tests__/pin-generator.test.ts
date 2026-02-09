/**
 * Unit Tests for PIN Generator/Manager
 *
 * Tests for PIN generation, hashing, and verification.
 * @module pin-generator.test
 */

import { describe, it, expect } from "vitest";
import {
  generateSecurePIN,
  generateUniquePINBatch,
  generatePINSalt,
  hashPIN,
  verifyPIN,
} from "../pin-manager";
import { ONBOARDING_PIN_LENGTH } from "../../../config/onboarding";

describe("generateSecurePIN", () => {
  it("should generate a 6-digit PIN", () => {
    const pin = generateSecurePIN();
    expect(pin).toMatch(/^\d{6}$/);
    expect(pin.length).toBe(ONBOARDING_PIN_LENGTH);
  });

  it("should preserve leading zeros", () => {
    // Run many times to probabilistically hit a PIN starting with 0
    let foundLeadingZero = false;
    for (let i = 0; i < 1000; i++) {
      const pin = generateSecurePIN();
      if (pin.startsWith("0")) {
        foundLeadingZero = true;
        expect(pin.length).toBe(6);
        break;
      }
    }
    // With 10% probability per PIN, we should find one in 1000 attempts
    expect(foundLeadingZero).toBe(true);
  });

  it("should generate different PINs on multiple calls (probabilistic)", () => {
    const pins = new Set<string>();
    for (let i = 0; i < 100; i++) {
      pins.add(generateSecurePIN());
    }
    // With 1M possible PINs, 100 random selections should produce >90 unique PINs
    expect(pins.size).toBeGreaterThan(90);
  });

  it("should only contain numeric characters", () => {
    for (let i = 0; i < 50; i++) {
      const pin = generateSecurePIN();
      expect(pin).toMatch(/^[0-9]+$/);
    }
  });
});

describe("generateUniquePINBatch", () => {
  it("should generate the requested number of PINs", () => {
    const pins = generateUniquePINBatch(50);
    expect(pins.length).toBe(50);
  });

  it("should generate unique PINs (no collisions)", () => {
    const pins = generateUniquePINBatch(100);
    const uniquePins = new Set(pins);
    expect(uniquePins.size).toBe(100);
  });

  it("should generate valid 6-digit PINs", () => {
    const pins = generateUniquePINBatch(20);
    for (const pin of pins) {
      expect(pin).toMatch(/^\d{6}$/);
    }
  });

  it("should handle small batch sizes", () => {
    const pins = generateUniquePINBatch(1);
    expect(pins.length).toBe(1);
    expect(pins[0]).toMatch(/^\d{6}$/);
  });

  it("should handle larger batch sizes", () => {
    const pins = generateUniquePINBatch(500);
    expect(pins.length).toBe(500);
    const uniquePins = new Set(pins);
    expect(uniquePins.size).toBe(500);
  });
});

describe("generatePINSalt", () => {
  it("should generate a base64-encoded salt", () => {
    const salt = generatePINSalt();
    expect(typeof salt).toBe("string");
    expect(salt.length).toBeGreaterThan(0);
    // Base64 should decode without error
    expect(() => atob(salt)).not.toThrow();
  });

  it("should generate different salts on each call", () => {
    const salt1 = generatePINSalt();
    const salt2 = generatePINSalt();
    expect(salt1).not.toBe(salt2);
  });

  it("should generate 32-byte salts (44 base64 chars with padding)", () => {
    const salt = generatePINSalt();
    // 32 bytes = 44 base64 characters (with padding)
    expect(salt.length).toBe(44);
  });
});

describe("hashPIN", () => {
  it("should hash a PIN with a generated salt", async () => {
    const result = await hashPIN("123456");
    expect(result.hash).toMatch(/^[0-9a-f]+$/); // Hex string
    expect(result.salt.length).toBeGreaterThan(0);
  });

  it("should hash a PIN with a provided salt", async () => {
    const salt = generatePINSalt();
    const result = await hashPIN("123456", salt);
    expect(result.salt).toBe(salt);
  });

  it("should produce different hashes for different PINs", async () => {
    const salt = generatePINSalt();
    const result1 = await hashPIN("123456", salt);
    const result2 = await hashPIN("654321", salt);
    expect(result1.hash).not.toBe(result2.hash);
  });

  it("should produce different hashes for same PIN with different salts", async () => {
    const result1 = await hashPIN("123456");
    const result2 = await hashPIN("123456");
    expect(result1.hash).not.toBe(result2.hash);
  });

  it("should produce consistent hash for same PIN and salt", async () => {
    const salt = generatePINSalt();
    const result1 = await hashPIN("123456", salt);
    const result2 = await hashPIN("123456", salt);
    expect(result1.hash).toBe(result2.hash);
  });

  it("should produce 128-character hex hash (512 bits)", async () => {
    const result = await hashPIN("123456");
    expect(result.hash.length).toBe(128); // 512 bits = 64 bytes = 128 hex chars
  });
});

describe("verifyPIN", () => {
  it("should verify a correct PIN", async () => {
    const pin = "123456";
    const { hash, salt } = await hashPIN(pin);
    const isValid = await verifyPIN(pin, hash, salt);
    expect(isValid).toBe(true);
  });

  it("should reject an incorrect PIN", async () => {
    const pin = "123456";
    const { hash, salt } = await hashPIN(pin);
    const isValid = await verifyPIN("654321", hash, salt);
    expect(isValid).toBe(false);
  });

  it("should reject PIN with wrong salt", async () => {
    const pin = "123456";
    const { hash } = await hashPIN(pin);
    const wrongSalt = generatePINSalt();
    const isValid = await verifyPIN(pin, hash, wrongSalt);
    expect(isValid).toBe(false);
  });

  it("should handle edge case PINs", async () => {
    const edgeCases = ["000000", "999999", "123456", "000001"];
    for (const pin of edgeCases) {
      const { hash, salt } = await hashPIN(pin);
      const isValid = await verifyPIN(pin, hash, salt);
      expect(isValid).toBe(true);
    }
  });

  it("should use constant-time comparison (timing attack resistance)", async () => {
    // This is a basic test - true timing attack testing requires specialized tools
    const pin = "123456";
    const { hash, salt } = await hashPIN(pin);

    const iterations = 10;
    const times1: number[] = [];
    const times2: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start1 = performance.now();
      await verifyPIN("000000", hash, salt);
      times1.push(performance.now() - start1);

      const start2 = performance.now();
      await verifyPIN("999999", hash, salt);
      times2.push(performance.now() - start2);
    }

    // Calculate average times
    const avg1 = times1.reduce((a, b) => a + b, 0) / iterations;
    const avg2 = times2.reduce((a, b) => a + b, 0) / iterations;

    // Times should be similar (within 100% variance due to PBKDF2 dominating)
    const ratio = Math.max(avg1, avg2) / Math.min(avg1, avg2);
    expect(ratio).toBeLessThan(2);
  });
});
