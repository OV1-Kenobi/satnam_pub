/**
 * @fileoverview Constant-time comparison tests
 * @description Tests for timing attack prevention in password/hash comparisons
 */

import { describe, expect, it } from "vitest";
import { constantTimeEquals } from "../../utils/crypto";

describe("Constant-time Comparison", () => {
  it("should return true for identical strings", () => {
    const hash1 = "abc123def456ghi789";
    const hash2 = "abc123def456ghi789";

    expect(constantTimeEquals(hash1, hash2)).toBe(true);
  });

  it("should return false for different strings of same length", () => {
    const hash1 = "abc123def456ghi789";
    const hash2 = "abc123def456ghi788"; // Last character different

    expect(constantTimeEquals(hash1, hash2)).toBe(false);
  });

  it("should return false for strings of different lengths", () => {
    const hash1 = "abc123def456ghi789";
    const hash2 = "abc123def456ghi78"; // One character shorter

    expect(constantTimeEquals(hash1, hash2)).toBe(false);
  });

  it("should return false for completely different strings", () => {
    const hash1 = "abc123def456ghi789";
    const hash2 = "xyz987wvu654tsr321";

    expect(constantTimeEquals(hash1, hash2)).toBe(false);
  });

  it("should return true for empty strings", () => {
    expect(constantTimeEquals("", "")).toBe(true);
  });

  it("should return false for one empty string", () => {
    expect(constantTimeEquals("", "test")).toBe(false);
    expect(constantTimeEquals("test", "")).toBe(false);
  });

  it("should handle long hash strings correctly", () => {
    const longHash1 = "a".repeat(1000);
    const longHash2 = "a".repeat(1000);
    const longHash3 = "a".repeat(999) + "b";

    expect(constantTimeEquals(longHash1, longHash2)).toBe(true);
    expect(constantTimeEquals(longHash1, longHash3)).toBe(false);
  });

  it("should be consistent with multiple calls", () => {
    const hash1 = "test_hash_value_123";
    const hash2 = "test_hash_value_123";
    const hash3 = "test_hash_value_124";

    // Same result for multiple calls
    expect(constantTimeEquals(hash1, hash2)).toBe(true);
    expect(constantTimeEquals(hash1, hash2)).toBe(true);
    expect(constantTimeEquals(hash1, hash3)).toBe(false);
    expect(constantTimeEquals(hash1, hash3)).toBe(false);
  });

  it("should handle unicode characters correctly", () => {
    const unicode1 = "test🔒hash";
    const unicode2 = "test🔒hash";
    const unicode3 = "test🔓hash";

    expect(constantTimeEquals(unicode1, unicode2)).toBe(true);
    expect(constantTimeEquals(unicode1, unicode3)).toBe(false);
  });

  it("should handle SHA-256 hash format", () => {
    const sha256Hash1 =
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    const sha256Hash2 =
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    const sha256Hash3 =
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b856";

    expect(constantTimeEquals(sha256Hash1, sha256Hash2)).toBe(true);
    expect(constantTimeEquals(sha256Hash1, sha256Hash3)).toBe(false);
  });

  it("should handle common password hash scenarios", () => {
    // Simulating common authentication scenarios
    const scenarios = [
      {
        name: "bcrypt-like hash",
        hash1: "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy",
        hash2: "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy",
        hash3: "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWz",
        expected: [true, false],
      },
      {
        name: "OTP hash",
        hash1:
          "d74ff0ee8da3b9806b18c877dbf29bbde50b5bd8e4dad7a3a725000feb82e8f1",
        hash2:
          "d74ff0ee8da3b9806b18c877dbf29bbde50b5bd8e4dad7a3a725000feb82e8f1",
        hash3:
          "d74ff0ee8da3b9806b18c877dbf29bbde50b5bd8e4dad7a3a725000feb82e8f2",
        expected: [true, false],
      },
    ];

    scenarios.forEach((scenario) => {
      expect(constantTimeEquals(scenario.hash1, scenario.hash2)).toBe(
        scenario.expected[0],
      );
      expect(constantTimeEquals(scenario.hash1, scenario.hash3)).toBe(
        scenario.expected[1],
      );
    });
  });
});
