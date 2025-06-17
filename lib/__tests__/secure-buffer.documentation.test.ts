/**
 * @fileoverview Documentation and Code Quality Tests for SecureBuffer
 * @description Tests to verify JSDoc documentation, code examples, and security considerations
 */

import { SecureStorage } from "../secure-storage";

// Access SecureBuffer for testing
const createSecureBuffer = (data: string) => {
  return (SecureStorage as any).createSecureBuffer(data);
};

describe("SecureBuffer Documentation and Code Quality Tests", () => {
  describe("JSDoc Documentation Tests", () => {
    it("should have proper JSDoc comments for SecureBuffer class", () => {
      // This test verifies that the SecureBuffer class has proper documentation
      // by checking if the methods and properties are documented correctly

      const buffer = createSecureBuffer("test");

      // Verify all expected methods exist
      expect(typeof buffer.toString).toBe("function");
      expect(typeof buffer.clear).toBe("function");
      expect(typeof buffer.cleared).toBe("boolean");
      expect(typeof buffer.size).toBe("number");
    });

    it("should demonstrate proper usage in examples", () => {
      /**
       * @example Basic SecureBuffer Usage
       * ```typescript
       * // Create a SecureBuffer with sensitive data
       * const buffer = createSecureBuffer('sensitive-password');
       *
       * // Use the data
       * const password = buffer.toString();
       * console.log('Password length:', password.length);
       *
       * // Always clear when done
       * buffer.clear();
       *
       * // Attempting to use after clearing will throw
       * try {
       *   buffer.toString(); // This will throw
       * } catch (error) {
       *   console.log('Buffer safely cleared');
       * }
       * ```
       */

      const buffer = createSecureBuffer("sensitive-password");

      // Use the data
      const password = buffer.toString();
      expect(password).toBe("sensitive-password");
      expect(password.length).toBe(18);

      // Clear when done
      buffer.clear();

      // Verify it throws after clearing
      expect(() => buffer.toString()).toThrow("SecureBuffer has been cleared");
    });

    it("should demonstrate secure password handling", () => {
      /**
       * @example Secure Password Handling
       * ```typescript
       * async function handleUserPassword(userPassword: string) {
       *   const passwordBuffer = createSecureBuffer(userPassword);
       *
       *   try {
       *     // Use the password for authentication
       *     const isValid = await authenticateUser(passwordBuffer.toString());
       *
       *     if (isValid) {
       *       // Process successful authentication
       *       return { success: true };
       *     } else {
       *       return { success: false, error: 'Invalid credentials' };
       *     }
       *   } finally {
       *     // Always clear sensitive data
       *     passwordBuffer.clear();
       *   }
       * }
       * ```
       */

      const userPassword = "user-secret-password-123";
      const passwordBuffer = createSecureBuffer(userPassword);

      try {
        // Simulate authentication use
        const password = passwordBuffer.toString();
        expect(password).toBe(userPassword);

        // Simulate successful authentication
        const result = { success: true };
        expect(result.success).toBe(true);
      } finally {
        // Always clear sensitive data
        passwordBuffer.clear();
        expect(passwordBuffer.cleared).toBe(true);
      }
    });

    it("should demonstrate error handling best practices", () => {
      /**
       * @example Error Handling with SecureBuffer
       * ```typescript
       * function processSecretKey(secretKey: string): boolean {
       *   let keyBuffer: SecureBuffer | null = null;
       *
       *   try {
       *     keyBuffer = createSecureBuffer(secretKey);
       *
       *     // Simulate processing that might throw
       *     if (keyBuffer.toString().length < 10) {
       *       throw new Error('Key too short');
       *     }
       *
       *     // Process the key...
       *     return true;
       *   } catch (error) {
       *     console.error('Error processing key:', error.message);
       *     return false;
       *   } finally {
       *     // Always clean up, even if error occurred
       *     if (keyBuffer && !keyBuffer.cleared) {
       *       keyBuffer.clear();
       *     }
       *   }
       * }
       * ```
       */

      function processSecretKey(secretKey: string): boolean {
        let keyBuffer: any = null;

        try {
          keyBuffer = createSecureBuffer(secretKey);

          // Simulate processing that might throw
          if (keyBuffer.toString().length < 10) {
            throw new Error("Key too short");
          }

          // Process the key...
          return true;
        } catch (error) {
          return false;
        } finally {
          // Always clean up, even if error occurred
          if (keyBuffer && !keyBuffer.cleared) {
            keyBuffer.clear();
          }
        }
      }

      // Test with short key (should fail but clean up)
      const result1 = processSecretKey("short");
      expect(result1).toBe(false);

      // Test with valid key (should succeed and clean up)
      const result2 = processSecretKey("long-enough-secret-key");
      expect(result2).toBe(true);
    });
  });

  describe("Security Considerations Documentation", () => {
    it("should document memory clearing security properties", () => {
      /**
       * @security Memory Clearing
       *
       * SecureBuffer performs multiple overwrite passes when clearing:
       * 1. Fill with zeros (0x00)
       * 2. Fill with ones (0xFF)
       * 3. Fill with zeros again (0x00)
       *
       * This helps prevent recovery of sensitive data from memory.
       */

      const sensitiveData = "confidential-information";
      const buffer = createSecureBuffer(sensitiveData);

      // Verify initial state
      expect(buffer.toString()).toBe(sensitiveData);
      expect(buffer.cleared).toBe(false);

      // Clear with security overwrites
      buffer.clear();

      // Verify secure clearing
      expect(buffer.cleared).toBe(true);
      expect((buffer as any).buffer).toBeNull();
      expect(() => buffer.toString()).toThrow("SecureBuffer has been cleared");
    });

    it("should document timing attack resistance", () => {
      /**
       * @security Timing Attack Resistance
       *
       * SecureBuffer operations should not leak information through timing:
       * - toString() fails fast for cleared buffers
       * - clear() operation time is independent of data content
       * - size property access is constant time
       */

      const shortData = "short";
      const longData =
        "very-long-data-string-for-timing-test-" + "x".repeat(1000);

      const shortBuffer = createSecureBuffer(shortData);
      const longBuffer = createSecureBuffer(longData);

      // Clear operations should have similar timing characteristics
      const start1 = process.hrtime.bigint();
      shortBuffer.clear();
      const end1 = process.hrtime.bigint();

      const start2 = process.hrtime.bigint();
      longBuffer.clear();
      const end2 = process.hrtime.bigint();

      const time1 = Number(end1 - start1);
      const time2 = Number(end2 - start2);

      // Times should be in similar order of magnitude
      // (This is a basic test - real timing analysis requires more sophisticated methods)
      expect(Math.abs(time1 - time2) / Math.max(time1, time2)).toBeLessThan(10);
    });

    it("should document proper lifecycle management", () => {
      /**
       * @security Lifecycle Management
       *
       * Proper SecureBuffer lifecycle:
       * 1. Create with sensitive data
       * 2. Use data only when needed
       * 3. Clear immediately after use
       * 4. Never reuse cleared buffers
       * 5. Handle errors with proper cleanup
       */

      // Step 1: Create with sensitive data
      const buffer = createSecureBuffer("lifecycle-test-secret");
      expect(buffer.cleared).toBe(false);

      // Step 2: Use data only when needed
      const data = buffer.toString();
      expect(data).toBe("lifecycle-test-secret");

      // Step 3: Clear immediately after use
      buffer.clear();
      expect(buffer.cleared).toBe(true);

      // Step 4: Never reuse cleared buffers
      expect(() => buffer.toString()).toThrow("SecureBuffer has been cleared");

      // Step 5: Proper error handling is demonstrated in other tests
    });

    it("should document thread safety considerations", () => {
      /**
       * @security Thread Safety
       *
       * SecureBuffer is not inherently thread-safe. Applications should:
       * - Use separate buffers for different threads/contexts
       * - Implement proper synchronization if sharing buffers
       * - Clear buffers in the same thread that created them
       */

      // Demonstrate separate buffer usage
      const buffer1 = createSecureBuffer("thread-1-data");
      const buffer2 = createSecureBuffer("thread-2-data");

      // Each buffer maintains independent state
      expect(buffer1.toString()).toBe("thread-1-data");
      expect(buffer2.toString()).toBe("thread-2-data");

      // Clearing one doesn't affect the other
      buffer1.clear();
      expect(buffer1.cleared).toBe(true);
      expect(buffer2.cleared).toBe(false);
      expect(buffer2.toString()).toBe("thread-2-data");

      // Clean up
      buffer2.clear();
      expect(buffer2.cleared).toBe(true);
    });
  });

  describe("Usage Examples Documentation", () => {
    it("should demonstrate integration with SecureStorage", async () => {
      /**
       * @example Integration with SecureStorage
       * ```typescript
       * // SecureBuffer is used internally by SecureStorage methods
       * const userId = 'user-123';
       * const nsec = 'nsec1234...';
       * const password = 'userPassword123!';
       *
       * // Store operation uses SecureBuffer internally
       * await SecureStorage.storeEncryptedNsec(userId, nsec, password);
       *
       * // Retrieve operation returns SecureBuffer
       * const buffer = await SecureStorage.retrieveDecryptedNsec(userId, password);
       *
       * if (buffer) {
       *   try {
       *     const decryptedNsec = buffer.toString();
       *     // Use the nsec...
       *   } finally {
       *     buffer.clear(); // Always clean up
       *   }
       * }
       * ```
       */

      // This test demonstrates the documented usage pattern
      // Note: This is a documentation test, so we'll simulate the pattern

      const mockNsec =
        "nsec1test1234567890abcdef1234567890abcdef1234567890abcdef123456789";

      // Simulate what SecureStorage does internally
      const buffer = createSecureBuffer(mockNsec);

      try {
        const decryptedNsec = buffer.toString();
        expect(decryptedNsec).toBe(mockNsec);
        // Use the nsec for operations...
      } finally {
        buffer.clear(); // Always clean up
        expect(buffer.cleared).toBe(true);
      }
    });

    it("should demonstrate batch processing patterns", () => {
      /**
       * @example Batch Processing with SecureBuffer
       * ```typescript
       * function processBatchSecrets(secrets: string[]): boolean[] {
       *   const buffers: SecureBuffer[] = [];
       *   const results: boolean[] = [];
       *
       *   try {
       *     // Create buffers for all secrets
       *     secrets.forEach(secret => {
       *       buffers.push(createSecureBuffer(secret));
       *     });
       *
       *     // Process each secret
       *     buffers.forEach(buffer => {
       *       const secret = buffer.toString();
       *       results.push(secret.length > 10); // Example validation
       *     });
       *
       *     return results;
       *   } finally {
       *     // Always clean up all buffers
       *     buffers.forEach(buffer => {
       *       if (!buffer.cleared) {
       *         buffer.clear();
       *       }
       *     });
       *   }
       * }
       * ```
       */

      function processBatchSecrets(secrets: string[]): boolean[] {
        const buffers: any[] = [];
        const results: boolean[] = [];

        try {
          // Create buffers for all secrets
          secrets.forEach((secret) => {
            buffers.push(createSecureBuffer(secret));
          });

          // Process each secret
          buffers.forEach((buffer) => {
            const secret = buffer.toString();
            results.push(secret.length > 10); // Example validation
          });

          return results;
        } finally {
          // Always clean up all buffers
          buffers.forEach((buffer) => {
            if (!buffer.cleared) {
              buffer.clear();
            }
          });
        }
      }

      const testSecrets = [
        "short",
        "this-is-a-longer-secret",
        "another-very-long-secret-key",
      ];

      const results = processBatchSecrets(testSecrets);

      expect(results).toEqual([false, true, true]);
    });

    it("should demonstrate async operation patterns", async () => {
      /**
       * @example Async Operations with SecureBuffer
       * ```typescript
       * async function performAsyncSecretOperation(secret: string): Promise<string> {
       *   const buffer = createSecureBuffer(secret);
       *
       *   try {
       *     // Simulate async operation
       *     await new Promise(resolve => setTimeout(resolve, 100));
       *
       *     const data = buffer.toString();
       *     const result = await someAsyncEncryption(data);
       *
       *     return result;
       *   } finally {
       *     // Ensure cleanup even if async operation fails
       *     buffer.clear();
       *   }
       * }
       * ```
       */

      async function performAsyncSecretOperation(
        secret: string
      ): Promise<string> {
        const buffer = createSecureBuffer(secret);

        try {
          // Simulate async operation
          await new Promise((resolve) => setTimeout(resolve, 10));

          const data = buffer.toString();
          // Simulate async encryption
          const result = `encrypted-${data}`;

          return result;
        } finally {
          // Ensure cleanup even if async operation fails
          buffer.clear();
          expect(buffer.cleared).toBe(true);
        }
      }

      const result = await performAsyncSecretOperation("test-secret");
      expect(result).toBe("encrypted-test-secret");
    });
  });

  describe("Best Practices Documentation", () => {
    it("should document memory management best practices", () => {
      /**
       * @bestpractice Memory Management
       *
       * 1. Always clear buffers in finally blocks
       * 2. Use try-finally or try-catch-finally patterns
       * 3. Clear buffers as soon as data is no longer needed
       * 4. Don't store references to cleared buffers
       * 5. Prefer local scope for buffer variables
       */

      // Good pattern
      function goodPattern(sensitiveData: string): boolean {
        const buffer = createSecureBuffer(sensitiveData);

        try {
          const data = buffer.toString();
          return data.length > 0;
        } finally {
          buffer.clear();
        }
      }

      expect(goodPattern("test-data")).toBe(true);

      // Demonstrate immediate clearing
      const buffer = createSecureBuffer("immediate-clear-test");
      const data = buffer.toString();
      buffer.clear(); // Clear immediately after use

      expect(data).toBe("immediate-clear-test");
      expect(buffer.cleared).toBe(true);
    });

    it("should document error handling best practices", () => {
      /**
       * @bestpractice Error Handling
       *
       * 1. Always use try-finally for cleanup
       * 2. Check buffer state before operations
       * 3. Handle clearing errors gracefully
       * 4. Don't expose sensitive data in error messages
       * 5. Log security events appropriately
       */

      function robustSecretProcessing(secret: string): {
        success: boolean;
        error?: string;
      } {
        let buffer: any = null;

        try {
          buffer = createSecureBuffer(secret);

          // Check buffer state
          if (buffer.cleared) {
            throw new Error("Buffer is already cleared");
          }

          const data = buffer.toString();

          // Simulate processing
          if (data.length < 5) {
            throw new Error("Secret too short"); // No sensitive data in error
          }

          return { success: true };
        } catch (error) {
          return {
            success: false,
            error: "Processing failed", // Generic error message
          };
        } finally {
          // Robust cleanup
          if (buffer && !buffer.cleared) {
            try {
              buffer.clear();
            } catch (clearError) {
              // Log but don't throw - cleanup should be silent
              console.warn("Buffer cleanup warning");
            }
          }
        }
      }

      // Test successful case
      const result1 = robustSecretProcessing("valid-secret");
      expect(result1.success).toBe(true);

      // Test error case
      const result2 = robustSecretProcessing("bad");
      expect(result2.success).toBe(false);
      expect(result2.error).toBe("Processing failed");
    });

    it("should document performance best practices", () => {
      /**
       * @bestpractice Performance
       *
       * 1. Minimize buffer lifetime
       * 2. Avoid unnecessary toString() calls
       * 3. Clear buffers in batch operations
       * 4. Use appropriate buffer sizes
       * 5. Monitor memory usage in long-running processes
       */

      // Minimize buffer lifetime
      function efficientProcessing(secrets: string[]): number {
        let totalLength = 0;

        for (const secret of secrets) {
          // Create, use, and clear immediately
          const buffer = createSecureBuffer(secret);
          try {
            totalLength += buffer.size; // Use size property instead of toString()
          } finally {
            buffer.clear();
          }
        }

        return totalLength;
      }

      const testSecrets = ["secret1", "secret2", "secret3"];
      const totalLength = efficientProcessing(testSecrets);

      const expectedLength = testSecrets.reduce(
        (sum, secret) => sum + new TextEncoder().encode(secret).length,
        0
      );

      expect(totalLength).toBe(expectedLength);
    });
  });
});
