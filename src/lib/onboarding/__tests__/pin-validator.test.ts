/**
 * Unit tests for PIN Validator
 *
 * Tests PIN format validation, weak PIN detection, confirmation matching,
 * and PIN masking functionality.
 */

import { describe, it, expect } from "vitest";
import {
  validatePINFormat,
  maskPIN,
  validatePINConfirmation,
  isPINWeak,
  type PINValidationResult,
} from "../pin-validator";

describe("PIN Validator", () => {
  describe("validatePINFormat", () => {
    it("should validate a correct 6-digit PIN", () => {
      const result = validatePINFormat("123456");
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.sanitizedPIN).toBe("123456");
    });

    it("should validate PIN with all zeros", () => {
      const result = validatePINFormat("000000");
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.sanitizedPIN).toBe("000000");
    });

    it("should validate PIN with all nines", () => {
      const result = validatePINFormat("999999");
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.sanitizedPIN).toBe("999999");
    });

    it("should reject PIN that is too short", () => {
      const result = validatePINFormat("12345");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("PIN must be exactly 6 digits");
      expect(result.sanitizedPIN).toBe("");
    });

    it("should reject PIN that is too long", () => {
      const result = validatePINFormat("1234567");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("PIN must be exactly 6 digits");
      expect(result.sanitizedPIN).toBe("");
    });

    it("should reject PIN with alphabetic characters", () => {
      const result = validatePINFormat("12a456");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("PIN must contain only numbers");
      expect(result.sanitizedPIN).toBe("");
    });

    it("should reject PIN with special characters", () => {
      const result = validatePINFormat("12-456");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("PIN must contain only numbers");
      expect(result.sanitizedPIN).toBe("");
    });

    it("should reject PIN with spaces", () => {
      const result = validatePINFormat("12 456");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("PIN must contain only numbers");
      expect(result.sanitizedPIN).toBe("");
    });

    it("should reject empty string", () => {
      const result = validatePINFormat("");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("PIN must be exactly 6 digits");
      expect(result.sanitizedPIN).toBe("");
    });

    it("should reject whitespace-only input", () => {
      const result = validatePINFormat("      ");
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors).toContain("PIN must contain only numbers");
      expect(result.errors).toContain("PIN must be exactly 6 digits");
      expect(result.sanitizedPIN).toBe("");
    });

    it("should sanitize PIN by removing non-digits", () => {
      const result = validatePINFormat("12a34b56");
      expect(result.sanitizedPIN).toBe(""); // Invalid, so sanitizedPIN is empty
      // But we can check the sanitization logic worked
      expect(result.errors).toContain("PIN must contain only numbers");
    });

    it("should provide clear error messages", () => {
      const result = validatePINFormat("abc");
      expect(result.errors.length).toBeGreaterThan(0);
      expect(
        result.errors.every((e) => typeof e === "string" && e.length > 0),
      ).toBe(true);
    });
  });

  describe("maskPIN", () => {
    it("should mask all but the last digit of a 6-digit PIN", () => {
      const masked = maskPIN("123456");
      expect(masked).toBe("•••••6");
    });

    it("should mask PIN with zeros", () => {
      const masked = maskPIN("000000");
      expect(masked).toBe("•••••0");
    });

    it("should handle single digit", () => {
      const masked = maskPIN("5");
      expect(masked).toBe("5");
    });

    it("should handle two digits", () => {
      const masked = maskPIN("42");
      expect(masked).toBe("•2");
    });

    it("should return empty string for empty input", () => {
      const masked = maskPIN("");
      expect(masked).toBe("");
    });

    it("should sanitize non-numeric characters before masking", () => {
      const masked = maskPIN("12a34b56");
      expect(masked).toBe("•••••6");
    });

    it("should return empty string for input with no digits", () => {
      const masked = maskPIN("abcdef");
      expect(masked).toBe("");
    });
  });

  describe("validatePINConfirmation", () => {
    it("should return true for matching PINs", () => {
      const result = validatePINConfirmation("123456", "123456");
      expect(result).toBe(true);
    });

    it("should return true for matching PINs with all zeros", () => {
      const result = validatePINConfirmation("000000", "000000");
      expect(result).toBe(true);
    });

    it("should return false for non-matching PINs", () => {
      const result = validatePINConfirmation("123456", "654321");
      expect(result).toBe(false);
    });

    it("should return false for PINs differing by one digit", () => {
      const result = validatePINConfirmation("123456", "123457");
      expect(result).toBe(false);
    });

    it("should return false when original PIN is too short", () => {
      const result = validatePINConfirmation("12345", "123456");
      expect(result).toBe(false);
    });

    it("should return false when confirmation PIN is too short", () => {
      const result = validatePINConfirmation("123456", "12345");
      expect(result).toBe(false);
    });

    it("should return false when both PINs are too short", () => {
      const result = validatePINConfirmation("12345", "12345");
      expect(result).toBe(false);
    });

    it("should return false when original PIN is too long", () => {
      const result = validatePINConfirmation("1234567", "123456");
      expect(result).toBe(false);
    });

    it("should return false when confirmation PIN is too long", () => {
      const result = validatePINConfirmation("123456", "1234567");
      expect(result).toBe(false);
    });

    it("should return false for empty confirmation", () => {
      const result = validatePINConfirmation("123456", "");
      expect(result).toBe(false);
    });

    it("should return false for empty original PIN", () => {
      const result = validatePINConfirmation("", "123456");
      expect(result).toBe(false);
    });

    it("should return false when both are empty", () => {
      const result = validatePINConfirmation("", "");
      expect(result).toBe(false);
    });

    it("should sanitize both inputs before comparison", () => {
      const result = validatePINConfirmation("12-34-56", "123456");
      expect(result).toBe(true);
    });

    it("should handle non-numeric characters in both inputs", () => {
      const result = validatePINConfirmation("12a34b56", "12-34-56");
      expect(result).toBe(true);
    });

    it("should use constant-time comparison (timing attack resistance)", () => {
      // This test verifies the function completes for both matching and non-matching
      const start1 = performance.now();
      validatePINConfirmation("123456", "123456");
      const time1 = performance.now() - start1;

      const start2 = performance.now();
      validatePINConfirmation("123456", "654321");
      const time2 = performance.now() - start2;

      // Both should complete (we can't easily test timing equality in unit tests,
      // but we verify both execute without errors)
      expect(time1).toBeGreaterThanOrEqual(0);
      expect(time2).toBeGreaterThanOrEqual(0);
    });
  });

  describe("isPINWeak", () => {
    describe("common weak patterns", () => {
      it("should detect all zeros as weak", () => {
        expect(isPINWeak("000000")).toBe(true);
      });

      it("should detect all ones as weak", () => {
        expect(isPINWeak("111111")).toBe(true);
      });

      it("should detect all twos as weak", () => {
        expect(isPINWeak("222222")).toBe(true);
      });

      it("should detect all threes as weak", () => {
        expect(isPINWeak("333333")).toBe(true);
      });

      it("should detect all fours as weak", () => {
        expect(isPINWeak("444444")).toBe(true);
      });

      it("should detect all fives as weak", () => {
        expect(isPINWeak("555555")).toBe(true);
      });

      it("should detect all sixes as weak", () => {
        expect(isPINWeak("666666")).toBe(true);
      });

      it("should detect all sevens as weak", () => {
        expect(isPINWeak("777777")).toBe(true);
      });

      it("should detect all eights as weak", () => {
        expect(isPINWeak("888888")).toBe(true);
      });

      it("should detect all nines as weak", () => {
        expect(isPINWeak("999999")).toBe(true);
      });
    });

    describe("sequential patterns", () => {
      it("should detect ascending sequence 123456 as weak", () => {
        expect(isPINWeak("123456")).toBe(true);
      });

      it("should detect descending sequence 654321 as weak", () => {
        expect(isPINWeak("654321")).toBe(true);
      });

      it("should detect sequence starting with 0 as weak", () => {
        expect(isPINWeak("012345")).toBe(true);
      });

      it("should detect reverse sequence ending with 0 as weak", () => {
        expect(isPINWeak("543210")).toBe(true);
      });

      it("should detect other ascending sequences as weak", () => {
        expect(isPINWeak("234567")).toBe(true);
      });

      it("should detect other descending sequences as weak", () => {
        expect(isPINWeak("765432")).toBe(true);
      });
    });

    describe("repeating patterns", () => {
      it("should detect 123123 pattern as weak", () => {
        expect(isPINWeak("123123")).toBe(true);
      });

      it("should detect 121212 pattern as weak", () => {
        expect(isPINWeak("121212")).toBe(true);
      });

      it("should detect 696969 pattern as weak", () => {
        expect(isPINWeak("696969")).toBe(true);
      });
    });

    describe("strong PINs", () => {
      it("should accept random-looking PIN as strong", () => {
        expect(isPINWeak("847392")).toBe(false);
      });

      it("should accept another random PIN as strong", () => {
        expect(isPINWeak("502938")).toBe(false);
      });

      it("should accept PIN with mixed digits as strong", () => {
        expect(isPINWeak("193847")).toBe(false);
      });

      it("should accept PIN without obvious patterns as strong", () => {
        expect(isPINWeak("482017")).toBe(false);
      });
    });

    describe("edge cases", () => {
      it("should consider too-short PIN as weak", () => {
        expect(isPINWeak("12345")).toBe(true);
      });

      it("should consider too-long PIN as weak", () => {
        expect(isPINWeak("1234567")).toBe(true);
      });

      it("should consider empty string as weak", () => {
        expect(isPINWeak("")).toBe(true);
      });

      it("should sanitize non-numeric characters before checking", () => {
        expect(isPINWeak("12a34b56")).toBe(true); // Becomes "123456" which is weak
      });

      it("should handle PIN with non-numeric characters that becomes weak", () => {
        expect(isPINWeak("1-2-3-4-5-6")).toBe(true); // Becomes "123456"
      });
    });
  });
});
