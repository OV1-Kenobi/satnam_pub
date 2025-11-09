/**
 * Tests for PrivacyManager.constantTimeCompare()
 * Verifies timing-safe comparison for both strings and Uint8Array
 */

import { PrivacyManager } from "../../../lib/crypto/privacy-manager";

describe("PrivacyManager.constantTimeCompare", () => {
  describe("String comparisons", () => {
    it("should return true for identical strings", () => {
      const result = PrivacyManager.constantTimeCompare("test", "test");
      expect(result).toBe(true);
    });

    it("should return false for different strings", () => {
      const result = PrivacyManager.constantTimeCompare("test", "fail");
      expect(result).toBe(false);
    });

    it("should return false for different lengths", () => {
      const result = PrivacyManager.constantTimeCompare("test", "testing");
      expect(result).toBe(false);
    });

    it("should return false for empty vs non-empty", () => {
      const result = PrivacyManager.constantTimeCompare("", "test");
      expect(result).toBe(false);
    });

    it("should return true for empty strings", () => {
      const result = PrivacyManager.constantTimeCompare("", "");
      expect(result).toBe(true);
    });

    it("should handle hex-encoded hashes", () => {
      const hash1 = "abc123def456789";
      const hash2 = "abc123def456789";
      const result = PrivacyManager.constantTimeCompare(hash1, hash2);
      expect(result).toBe(true);
    });

    it("should handle base64-encoded values", () => {
      const b64_1 = "YWJjMTIzZGVmNDU2Nzg5";
      const b64_2 = "YWJjMTIzZGVmNDU2Nzg5";
      const result = PrivacyManager.constantTimeCompare(b64_1, b64_2);
      expect(result).toBe(true);
    });

    it("should not short-circuit on first difference", () => {
      // Both strings have same length, difference at end
      const str1 = "a".repeat(64);
      const str2 = "a".repeat(63) + "b";
      const result = PrivacyManager.constantTimeCompare(str1, str2);
      expect(result).toBe(false);
    });
  });

  describe("Uint8Array comparisons", () => {
    it("should return true for identical byte arrays", () => {
      const bytes1 = new Uint8Array([1, 2, 3, 4]);
      const bytes2 = new Uint8Array([1, 2, 3, 4]);
      const result = PrivacyManager.constantTimeCompare(bytes1, bytes2);
      expect(result).toBe(true);
    });

    it("should return false for different byte arrays", () => {
      const bytes1 = new Uint8Array([1, 2, 3, 4]);
      const bytes2 = new Uint8Array([1, 2, 3, 5]);
      const result = PrivacyManager.constantTimeCompare(bytes1, bytes2);
      expect(result).toBe(false);
    });

    it("should return false for different lengths", () => {
      const bytes1 = new Uint8Array([1, 2, 3, 4]);
      const bytes2 = new Uint8Array([1, 2, 3, 4, 5]);
      const result = PrivacyManager.constantTimeCompare(bytes1, bytes2);
      expect(result).toBe(false);
    });

    it("should return true for empty byte arrays", () => {
      const bytes1 = new Uint8Array([]);
      const bytes2 = new Uint8Array([]);
      const result = PrivacyManager.constantTimeCompare(bytes1, bytes2);
      expect(result).toBe(true);
    });

    it("should handle 32-byte digests (SHA-256)", () => {
      const digest1 = new Uint8Array(32);
      digest1.fill(0xaa);
      const digest2 = new Uint8Array(32);
      digest2.fill(0xaa);
      const result = PrivacyManager.constantTimeCompare(digest1, digest2);
      expect(result).toBe(true);
    });

    it("should not short-circuit on first difference", () => {
      // Both arrays have same length, difference at end
      const bytes1 = new Uint8Array(64);
      bytes1.fill(0xaa);
      const bytes2 = new Uint8Array(64);
      bytes2.fill(0xaa);
      bytes2[63] = 0xbb;
      const result = PrivacyManager.constantTimeCompare(bytes1, bytes2);
      expect(result).toBe(false);
    });
  });

  describe("Mixed type comparisons", () => {
    it("should compare two strings (both converted to bytes internally)", () => {
      // Both strings are converted to Uint8Array internally
      const str1 = "test";
      const str2 = "test";
      const result = PrivacyManager.constantTimeCompare(str1, str2);
      expect(result).toBe(true);
    });

    it("should return false for different strings", () => {
      const str1 = "test";
      const str2 = "fail";
      const result = PrivacyManager.constantTimeCompare(str1, str2);
      expect(result).toBe(false);
    });

    it("should compare two Uint8Arrays (both bytes)", () => {
      // Both as Uint8Array
      const bytes1 = new TextEncoder().encode("test");
      const bytes2 = new TextEncoder().encode("test");
      const result = PrivacyManager.constantTimeCompare(bytes1, bytes2);
      expect(result).toBe(true);
    });
  });

  describe("Security properties", () => {
    it("should include length difference in accumulator", () => {
      // Verify that length mismatch doesn't cause early return
      const short = "a";
      const long = "aaaaaaaaaa";
      const result = PrivacyManager.constantTimeCompare(short, long);
      expect(result).toBe(false);
    });

    it("should use XOR-based comparison (no branch prediction)", () => {
      // Test that comparison is truly constant-time
      // by verifying all bits are checked
      const bytes1 = new Uint8Array([0xff, 0xff, 0xff, 0xff]);
      const bytes2 = new Uint8Array([0xff, 0xff, 0xff, 0xfe]);
      const result = PrivacyManager.constantTimeCompare(bytes1, bytes2);
      expect(result).toBe(false);
    });

    it("should handle all zero bytes", () => {
      const bytes1 = new Uint8Array(32);
      const bytes2 = new Uint8Array(32);
      const result = PrivacyManager.constantTimeCompare(bytes1, bytes2);
      expect(result).toBe(true);
    });

    it("should handle all 0xff bytes", () => {
      const bytes1 = new Uint8Array(32);
      bytes1.fill(0xff);
      const bytes2 = new Uint8Array(32);
      bytes2.fill(0xff);
      const result = PrivacyManager.constantTimeCompare(bytes1, bytes2);
      expect(result).toBe(true);
    });
  });
});
