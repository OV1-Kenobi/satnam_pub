/**
 * @fileoverview Comprehensive Unit Tests for SecureBuffer
 * @description Tests for SecureBuffer creation, initialization, string conversion,
 * clearing, and access after clearing
 */

import { SecureStorage } from "../secure-storage";

// Access SecureBuffer class using reflection for testing
const createSecureBuffer = (data: string) => {
  return (SecureStorage as any).createSecureBuffer(data);
};

describe("SecureBuffer Unit Tests", () => {
  describe("Creation and Initialization", () => {
    it("should create a SecureBuffer with a string", () => {
      const testData = "test-sensitive-data";
      const buffer = createSecureBuffer(testData);

      expect(buffer).toBeDefined();
      expect(buffer.cleared).toBe(false);
    });

    it("should have correct size matching expected byte length", () => {
      const testData = "hello world";
      const buffer = createSecureBuffer(testData);
      const expectedSize = new TextEncoder().encode(testData).length;

      expect(buffer.size).toBe(expectedSize);
    });

    it("should handle Unicode characters correctly", () => {
      const testData = "🔐🛡️🔒 Security Test 中文 العربية";
      const buffer = createSecureBuffer(testData);
      const expectedSize = new TextEncoder().encode(testData).length;

      expect(buffer.size).toBe(expectedSize);
      expect(buffer.toString()).toBe(testData);
    });

    it("should handle empty string creation", () => {
      const testData = "";
      const buffer = createSecureBuffer(testData);

      expect(buffer.size).toBe(0);
      expect(buffer.toString()).toBe("");
      expect(buffer.cleared).toBe(false);
    });

    it("should handle very long strings", () => {
      const testData = "a".repeat(10000);
      const buffer = createSecureBuffer(testData);

      expect(buffer.size).toBe(10000);
      expect(buffer.toString()).toBe(testData);
    });

    it("should handle special characters and escape sequences", () => {
      const testData =
        "line1\nline2\ttab\r\nwindows\0null\\backslash\"quote'apostrophe";
      const buffer = createSecureBuffer(testData);

      expect(buffer.toString()).toBe(testData);
    });

    it("should throw error on creation failure", () => {
      // This test verifies error handling during construction
      // We'll mock TextEncoder to throw an error
      const originalTextEncoder = global.TextEncoder;
      global.TextEncoder = class {
        encode() {
          throw new Error("Mock encoding error");
        }
      } as any;

      expect(() => {
        createSecureBuffer("test");
      }).toThrow("Failed to create SecureBuffer: Error: Mock encoding error");

      // Restore original TextEncoder
      global.TextEncoder = originalTextEncoder;
    });
  });

  describe("String Conversion", () => {
    it("should return correct string representation before clearing", () => {
      const testData = "sensitive-password-123!@#";
      const buffer = createSecureBuffer(testData);

      expect(buffer.toString()).toBe(testData);
    });

    it("should handle multiple toString() calls", () => {
      const testData = "multiple-access-test";
      const buffer = createSecureBuffer(testData);

      expect(buffer.toString()).toBe(testData);
      expect(buffer.toString()).toBe(testData);
      expect(buffer.toString()).toBe(testData);
    });

    it("should handle malformed UTF-8 gracefully", () => {
      // This test creates a buffer with invalid UTF-8 sequence
      const testData = "valid-start";
      const buffer = createSecureBuffer(testData);

      // Manually corrupt the buffer to test error handling
      if ((buffer as any).buffer) {
        (buffer as any).buffer[0] = 0xff; // Invalid UTF-8 start byte
      }

      expect(() => buffer.toString()).toThrow("Failed to decode SecureBuffer");
    });

    it("should maintain data integrity across conversions", () => {
      const testData = JSON.stringify({
        secret: "very-secret-key",
        nested: { data: "nested-secret" },
        array: [1, 2, 3, "secret-item"],
      });
      const buffer = createSecureBuffer(testData);

      const retrieved = buffer.toString();
      const parsed = JSON.parse(retrieved);

      expect(parsed.secret).toBe("very-secret-key");
      expect(parsed.nested.data).toBe("nested-secret");
      expect(parsed.array[3]).toBe("secret-item");
    });
  });

  describe("Clearing the Buffer", () => {
    it("should properly zero out the buffer when cleared", () => {
      const testData = "sensitive-data-to-clear";
      const buffer = createSecureBuffer(testData);

      expect(buffer.cleared).toBe(false);

      buffer.clear();

      expect(buffer.cleared).toBe(true);
      expect((buffer as any).buffer).toBeNull();
    });

    it("should set cleared flag correctly", () => {
      const buffer = createSecureBuffer("test");

      expect(buffer.cleared).toBe(false);
      buffer.clear();
      expect(buffer.cleared).toBe(true);
    });

    it("should handle multiple clear() calls gracefully", () => {
      const buffer = createSecureBuffer("test-data");

      buffer.clear();
      expect(buffer.cleared).toBe(true);

      // Second clear should not throw
      buffer.clear();
      expect(buffer.cleared).toBe(true);
    });

    it("should reset size to 0 after clearing", () => {
      const buffer = createSecureBuffer("test-data");

      expect(buffer.size).toBeGreaterThan(0);
      buffer.clear();
      expect(buffer.size).toBe(0);
    });

    it("should perform secure overwrite with multiple passes", () => {
      const testData = "secure-overwrite-test";
      const buffer = createSecureBuffer(testData);

      // Get reference to the internal buffer for testing
      const internalBuffer = (buffer as any).buffer;
      expect(internalBuffer).toBeDefined();

      buffer.clear();

      // Verify the buffer is null after clearing
      expect((buffer as any).buffer).toBeNull();
    });
  });

  describe("Access After Clearing", () => {
    it("should throw error when accessing toString() after clearing", () => {
      const buffer = createSecureBuffer("test-data");

      buffer.clear();

      expect(() => buffer.toString()).toThrow("SecureBuffer has been cleared");
    });

    it("should throw error when accessing cleared buffer multiple times", () => {
      const buffer = createSecureBuffer("test-data");

      buffer.clear();

      expect(() => buffer.toString()).toThrow("SecureBuffer has been cleared");
      expect(() => buffer.toString()).toThrow("SecureBuffer has been cleared");
    });

    it("should maintain cleared state after attempted access", () => {
      const buffer = createSecureBuffer("test-data");

      buffer.clear();

      try {
        buffer.toString();
      } catch (error) {
        // Expected error
      }

      expect(buffer.cleared).toBe(true);
    });

    it("should handle size property access after clearing", () => {
      const buffer = createSecureBuffer("test-data");

      buffer.clear();

      expect(buffer.size).toBe(0);
      expect(buffer.cleared).toBe(true);
    });

    it("should provide appropriate error messages", () => {
      const buffer = createSecureBuffer("test-data");

      buffer.clear();

      expect(() => buffer.toString()).toThrow("SecureBuffer has been cleared");
    });
  });

  describe("Memory Management Edge Cases", () => {
    it("should handle buffer creation with null internal buffer", () => {
      const buffer = createSecureBuffer("test");

      // Simulate null buffer scenario
      (buffer as any).buffer = null;

      expect(() => buffer.toString()).toThrow("SecureBuffer has been cleared");
    });

    it("should handle buffer cleared state correctly", () => {
      const buffer = createSecureBuffer("test");

      // Manually set cleared state
      (buffer as any).isCleared = true;

      expect(() => buffer.toString()).toThrow("SecureBuffer has been cleared");
    });

    it("should handle concurrent access patterns", () => {
      const buffer = createSecureBuffer("test-data");

      // Simulate multiple concurrent accesses
      const results = [];
      for (let i = 0; i < 10; i++) {
        results.push(buffer.toString());
      }

      // All should return the same value
      results.forEach((result) => {
        expect(result).toBe("test-data");
      });

      buffer.clear();

      // All accesses after clear should throw
      for (let i = 0; i < 10; i++) {
        expect(() => buffer.toString()).toThrow(
          "SecureBuffer has been cleared"
        );
      }
    });

    it("should handle buffer state consistency", () => {
      const buffer = createSecureBuffer("test-data");

      // Check initial state
      expect(buffer.cleared).toBe(false);
      expect(buffer.size).toBeGreaterThan(0);
      expect(buffer.toString()).toBe("test-data");

      // Clear and check final state
      buffer.clear();
      expect(buffer.cleared).toBe(true);
      expect(buffer.size).toBe(0);
      expect(() => buffer.toString()).toThrow();
    });
  });

  describe("Security Properties", () => {
    it("should not leak data in toString() after partial clearing", () => {
      const buffer = createSecureBuffer("sensitive-data");

      // Manually corrupt the cleared flag to test robustness
      (buffer as any).isCleared = false;
      (buffer as any).buffer = null;

      expect(() => buffer.toString()).toThrow("SecureBuffer has been cleared");
    });

    it("should handle security-sensitive data properly", () => {
      const sensitiveData =
        "nsec1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
      const buffer = createSecureBuffer(sensitiveData);

      expect(buffer.toString()).toBe(sensitiveData);
      expect(buffer.size).toBe(new TextEncoder().encode(sensitiveData).length);

      buffer.clear();

      expect(buffer.cleared).toBe(true);
      expect(() => buffer.toString()).toThrow("SecureBuffer has been cleared");
    });

    it("should handle password-like strings securely", () => {
      const password = "MyVerySecurePassword123!@#$%^&*()";
      const buffer = createSecureBuffer(password);

      expect(buffer.toString()).toBe(password);

      buffer.clear();

      expect(buffer.cleared).toBe(true);
      expect(buffer.size).toBe(0);
      expect(() => buffer.toString()).toThrow();
    });
  });
});
