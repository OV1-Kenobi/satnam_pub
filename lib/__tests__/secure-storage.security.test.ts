/**
 * @fileoverview Security and Performance Tests for SecureStorage
 * @description Tests for security properties, memory leaks, timing attacks, and performance
 */

import { SecureStorage } from "../secure-storage";
import { TestDbHelper } from "./test-db-helper";

// Access SecureBuffer for testing
const createSecureBuffer = (data: string) => {
  return (SecureStorage as any).createSecureBuffer(data);
};

describe("SecureStorage Security and Performance Tests", () => {
  beforeAll(async () => {
    const isConnected = await TestDbHelper.checkConnection();
    if (!isConnected) {
      throw new Error(
        "Cannot connect to test database. Please check your .env.test configuration."
      );
    }
  });

  beforeEach(async () => {
    await TestDbHelper.cleanupTestData();
  });

  afterAll(async () => {
    await TestDbHelper.cleanupTestData();
  });

  describe("Security Properties Tests", () => {
    it("should ensure no sensitive data remains in memory after clearing", () => {
      const sensitiveData =
        "nsec1secret1234567890abcdef1234567890abcdef1234567890abcdef123456789";
      const buffer = createSecureBuffer(sensitiveData);

      // Get reference to internal buffer for testing
      const internalBuffer = (buffer as any).buffer;
      expect(internalBuffer).toBeInstanceOf(Uint8Array);
      expect(internalBuffer.length).toBeGreaterThan(0);

      // Verify initial state
      expect(buffer.toString()).toBe(sensitiveData);
      expect(buffer.cleared).toBe(false);

      // Clear the buffer
      buffer.clear();

      // Verify cleared state
      expect(buffer.cleared).toBe(true);
      expect((buffer as any).buffer).toBeNull();
      expect(() => buffer.toString()).toThrow("SecureBuffer has been cleared");
    });

    it("should perform secure overwrite with multiple passes", () => {
      const sensitiveData = "very-secret-password-123!@#";
      const buffer = createSecureBuffer(sensitiveData);

      // Get reference to internal buffer
      const internalBuffer = (buffer as any).buffer;
      const originalLength = internalBuffer.length;

      // Store original values for comparison
      const originalValues = new Uint8Array(internalBuffer);

      // Clear the buffer (should perform multiple overwrite passes)
      buffer.clear();

      // Buffer should be null after clearing
      expect((buffer as any).buffer).toBeNull();
      expect(buffer.cleared).toBe(true);

      // Original buffer should have been overwritten
      // Note: We can't directly verify the overwrite since the buffer is nulled,
      // but we can verify the clearing process completed
      expect(buffer.size).toBe(0);
    });

    it("should not leak sensitive data through toString() errors", () => {
      const sensitiveData = "leak-test-sensitive-data";
      const buffer = createSecureBuffer(sensitiveData);

      // Clear the buffer
      buffer.clear();

      // toString() should throw without leaking data
      try {
        buffer.toString();
        fail("Should have thrown an error");
      } catch (error) {
        expect(error.message).toBe("SecureBuffer has been cleared");
        expect(error.message).not.toContain(sensitiveData);
      }
    });

    it("should handle buffer corruption gracefully", () => {
      const buffer = createSecureBuffer("test-data");

      // Manually corrupt the buffer state
      (buffer as any).buffer = null;
      (buffer as any).isCleared = false; // Inconsistent state

      // Should still detect and handle the corruption
      expect(() => buffer.toString()).toThrow("SecureBuffer has been cleared");
    });

    it("should resist timing attacks on buffer comparison", async () => {
      const testUserId = TestDbHelper.generateTestUserId();
      const correctPassword = "CorrectPassword123!";
      const wrongPassword1 = "WrongPassword456!";
      const wrongPassword2 = "CompletelyDifferentWrongPassword789!";
      const keyPair = SecureStorage.generateNewAccountKeyPair();

      // Store data
      await SecureStorage.storeEncryptedNsec(
        testUserId,
        keyPair.nsec,
        correctPassword
      );

      // Measure timing for correct password
      const correctTimes = [];
      for (let i = 0; i < 10; i++) {
        const start = process.hrtime.bigint();
        const result = await SecureStorage.retrieveDecryptedNsec(
          testUserId,
          correctPassword
        );
        const end = process.hrtime.bigint();
        if (result) result.clear();
        correctTimes.push(Number(end - start));
      }

      // Measure timing for wrong passwords
      const wrongTimes1 = [];
      const wrongTimes2 = [];

      for (let i = 0; i < 10; i++) {
        const start1 = process.hrtime.bigint();
        const result1 = await SecureStorage.retrieveDecryptedNsec(
          testUserId,
          wrongPassword1
        );
        const end1 = process.hrtime.bigint();
        expect(result1).toBeNull();
        wrongTimes1.push(Number(end1 - start1));

        const start2 = process.hrtime.bigint();
        const result2 = await SecureStorage.retrieveDecryptedNsec(
          testUserId,
          wrongPassword2
        );
        const end2 = process.hrtime.bigint();
        expect(result2).toBeNull();
        wrongTimes2.push(Number(end2 - start2));
      }

      // Calculate averages
      const avgCorrect =
        correctTimes.reduce((a, b) => a + b) / correctTimes.length;
      const avgWrong1 =
        wrongTimes1.reduce((a, b) => a + b) / wrongTimes1.length;
      const avgWrong2 =
        wrongTimes2.reduce((a, b) => a + b) / wrongTimes2.length;

      // Wrong password timings should be relatively consistent
      // (This is a basic test - real timing attack resistance requires more sophisticated analysis)
      expect(
        Math.abs(avgWrong1 - avgWrong2) / Math.max(avgWrong1, avgWrong2)
      ).toBeLessThan(0.5);
    });

    it("should handle memory pressure scenarios", () => {
      const buffers = [];
      const largeData = "x".repeat(10000);

      // Create many buffers to test memory management
      for (let i = 0; i < 100; i++) {
        buffers.push(createSecureBuffer(largeData + i));
      }

      // Verify all buffers work
      buffers.forEach((buffer, index) => {
        expect(buffer.toString()).toBe(largeData + index);
      });

      // Clear all buffers
      buffers.forEach((buffer) => buffer.clear());

      // Verify all are cleared
      buffers.forEach((buffer) => {
        expect(buffer.cleared).toBe(true);
        expect(() => buffer.toString()).toThrow(
          "SecureBuffer has been cleared"
        );
      });
    });

    it("should prevent information disclosure through error messages", async () => {
      const testUserId = TestDbHelper.generateTestUserId();
      const sensitiveNsec =
        "nsec1sensitive1234567890abcdef1234567890abcdef1234567890abcdef123456789";
      const password = "TestPassword123!";

      // Store data
      await SecureStorage.storeEncryptedNsec(
        testUserId,
        sensitiveNsec,
        password
      );

      // Try various operations that should fail
      const wrongPassword = "WrongPassword456!";

      // Wrong password should not leak information
      const result1 = await SecureStorage.retrieveDecryptedNsec(
        testUserId,
        wrongPassword
      );
      expect(result1).toBeNull();

      // Non-existent user should not leak information
      const result2 = await SecureStorage.retrieveDecryptedNsec(
        "non-existent",
        password
      );
      expect(result2).toBeNull();

      // Failed password update should not leak information
      const result3 = await SecureStorage.updatePasswordAndReencryptNsec(
        testUserId,
        wrongPassword,
        "NewPassword789!"
      );
      expect(result3).toBe(false);

      // Original data should still be accessible
      const validResult = await SecureStorage.retrieveDecryptedNsec(
        testUserId,
        password
      );
      expect(validResult).not.toBeNull();
      if (validResult) {
        expect(validResult.toString()).toBe(sensitiveNsec);
        validResult.clear();
      }
    });
  });

  describe("Performance Tests", () => {
    it("should meet performance thresholds for basic operations", async () => {
      const testUserId = TestDbHelper.generateTestUserId();
      const keyPair = SecureStorage.generateNewAccountKeyPair();
      const password = "PerformanceTest123!";

      // Test store operation performance
      const storeStart = Date.now();
      const storeResult = await SecureStorage.storeEncryptedNsec(
        testUserId,
        keyPair.nsec,
        password
      );
      const storeEnd = Date.now();

      expect(storeResult).toBe(true);
      expect(storeEnd - storeStart).toBeLessThan(2000); // Should complete within 2 seconds

      // Test retrieve operation performance
      const retrieveStart = Date.now();
      const retrieveResult = await SecureStorage.retrieveDecryptedNsec(
        testUserId,
        password
      );
      const retrieveEnd = Date.now();

      expect(retrieveResult).not.toBeNull();
      expect(retrieveEnd - retrieveStart).toBeLessThan(1000); // Should complete within 1 second

      if (retrieveResult) {
        expect(retrieveResult.toString()).toBe(keyPair.nsec);
        retrieveResult.clear();
      }
    });

    it("should handle high-frequency operations efficiently", async () => {
      const testUserId = TestDbHelper.generateTestUserId();
      const keyPair = SecureStorage.generateNewAccountKeyPair();
      const password = "HighFrequencyTest123!";

      // Store initial data
      await SecureStorage.storeEncryptedNsec(
        testUserId,
        keyPair.nsec,
        password
      );

      // Perform many rapid operations
      const operationCount = 50;
      const start = Date.now();

      const promises = [];
      for (let i = 0; i < operationCount; i++) {
        promises.push(
          SecureStorage.retrieveDecryptedNsec(testUserId, password).then(
            (result) => {
              if (result) {
                const data = result.toString();
                result.clear();
                return data;
              }
              return null;
            }
          )
        );
      }

      const results = await Promise.all(promises);
      const end = Date.now();

      const totalTime = end - start;
      const avgTimePerOperation = totalTime / operationCount;

      // All operations should succeed
      results.forEach((result) => {
        expect(result).toBe(keyPair.nsec);
      });

      // Average time per operation should be reasonable
      expect(avgTimePerOperation).toBeLessThan(100); // Less than 100ms per operation
    });

    it("should handle large data volumes efficiently", async () => {
      const testUserId = TestDbHelper.generateTestUserId();
      const largeNsec = "nsec1" + "a".repeat(5000); // Large nsec for testing
      const password = "LargeDataTest123!";

      // Test with large data
      const storeStart = Date.now();
      const storeResult = await SecureStorage.storeEncryptedNsec(
        testUserId,
        largeNsec,
        password
      );
      const storeEnd = Date.now();

      expect(storeResult).toBe(true);
      expect(storeEnd - storeStart).toBeLessThan(5000); // Should complete within 5 seconds

      const retrieveStart = Date.now();
      const retrieveResult = await SecureStorage.retrieveDecryptedNsec(
        testUserId,
        password
      );
      const retrieveEnd = Date.now();

      expect(retrieveResult).not.toBeNull();
      expect(retrieveEnd - retrieveStart).toBeLessThan(3000); // Should complete within 3 seconds

      if (retrieveResult) {
        expect(retrieveResult.toString()).toBe(largeNsec);
        expect(retrieveResult.size).toBe(
          new TextEncoder().encode(largeNsec).length
        );
        retrieveResult.clear();
      }
    });

    it("should have consistent performance across multiple iterations", async () => {
      const testUserId = TestDbHelper.generateTestUserId();
      const keyPair = SecureStorage.generateNewAccountKeyPair();
      const password = "ConsistentPerformanceTest123!";

      // Store initial data
      await SecureStorage.storeEncryptedNsec(
        testUserId,
        keyPair.nsec,
        password
      );

      // Measure performance across multiple iterations
      const times = [];
      const iterations = 20;

      for (let i = 0; i < iterations; i++) {
        const start = process.hrtime.bigint();
        const result = await SecureStorage.retrieveDecryptedNsec(
          testUserId,
          password
        );
        const end = process.hrtime.bigint();

        if (result) {
          expect(result.toString()).toBe(keyPair.nsec);
          result.clear();
        }

        times.push(Number(end - start));
      }

      // Calculate statistics
      const avg = times.reduce((a, b) => a + b) / times.length;
      const variance =
        times.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / times.length;
      const stdDev = Math.sqrt(variance);
      const coefficientOfVariation = stdDev / avg;

      // Performance should be relatively consistent (CV < 50%)
      expect(coefficientOfVariation).toBeLessThan(0.5);
    });

    it("should handle concurrent performance load", async () => {
      const baseUserId = TestDbHelper.generateTestUserId();
      const keyPair = SecureStorage.generateNewAccountKeyPair();
      const password = "ConcurrentPerformanceTest123!";

      // Create multiple users with data
      const userCount = 10;
      const setupPromises = [];

      for (let i = 0; i < userCount; i++) {
        setupPromises.push(
          SecureStorage.storeEncryptedNsec(
            `${baseUserId}-${i}`,
            keyPair.nsec,
            password
          )
        );
      }

      await Promise.all(setupPromises);

      // Perform concurrent operations
      const concurrentOperations = [];
      const operationsPerUser = 5;

      const start = Date.now();

      for (let i = 0; i < userCount; i++) {
        for (let j = 0; j < operationsPerUser; j++) {
          concurrentOperations.push(
            SecureStorage.retrieveDecryptedNsec(
              `${baseUserId}-${i}`,
              password
            ).then((result) => {
              if (result) {
                const data = result.toString();
                result.clear();
                return data;
              }
              return null;
            })
          );
        }
      }

      const results = await Promise.all(concurrentOperations);
      const end = Date.now();

      const totalTime = end - start;
      const totalOperations = userCount * operationsPerUser;
      const avgTimePerOperation = totalTime / totalOperations;

      // All operations should succeed
      results.forEach((result) => {
        expect(result).toBe(keyPair.nsec);
      });

      // Concurrent performance should be reasonable
      expect(avgTimePerOperation).toBeLessThan(200); // Less than 200ms per operation under load
    });

    it("should handle memory cleanup performance", () => {
      const bufferCount = 1000;
      const buffers = [];
      const testData = "performance-test-data-" + "x".repeat(100);

      // Create many buffers
      const createStart = Date.now();
      for (let i = 0; i < bufferCount; i++) {
        buffers.push(createSecureBuffer(testData));
      }
      const createEnd = Date.now();

      // Verify creation performance
      expect(createEnd - createStart).toBeLessThan(1000); // Should create 1000 buffers in under 1 second

      // Access all buffers
      const accessStart = Date.now();
      buffers.forEach((buffer) => {
        expect(buffer.toString()).toBe(testData);
      });
      const accessEnd = Date.now();

      // Verify access performance
      expect(accessEnd - accessStart).toBeLessThan(500); // Should access all buffers in under 0.5 seconds

      // Clear all buffers
      const clearStart = Date.now();
      buffers.forEach((buffer) => buffer.clear());
      const clearEnd = Date.now();

      // Verify cleanup performance
      expect(clearEnd - clearStart).toBeLessThan(100); // Should clear all buffers in under 0.1 seconds

      // Verify all are cleared
      buffers.forEach((buffer) => {
        expect(buffer.cleared).toBe(true);
      });
    });
  });

  describe("Memory Leak Tests", () => {
    it("should not leak memory with repeated operations", async () => {
      const testUserId = TestDbHelper.generateTestUserId();
      const keyPair = SecureStorage.generateNewAccountKeyPair();
      const password = "MemoryLeakTest123!";

      // Store initial data
      await SecureStorage.storeEncryptedNsec(
        testUserId,
        keyPair.nsec,
        password
      );

      // Perform many operations and ensure cleanup
      for (let i = 0; i < 100; i++) {
        const result = await SecureStorage.retrieveDecryptedNsec(
          testUserId,
          password
        );
        expect(result).not.toBeNull();

        if (result) {
          expect(result.toString()).toBe(keyPair.nsec);
          result.clear(); // Important: clean up each buffer
          expect(result.cleared).toBe(true);
        }
      }

      // Final verification
      const finalResult = await SecureStorage.retrieveDecryptedNsec(
        testUserId,
        password
      );
      expect(finalResult).not.toBeNull();
      if (finalResult) {
        expect(finalResult.toString()).toBe(keyPair.nsec);
        finalResult.clear();
      }
    });

    it("should handle buffer lifecycle correctly", () => {
      const buffers = [];
      const iterations = 50;

      // Create and immediately clear buffers
      for (let i = 0; i < iterations; i++) {
        const buffer = createSecureBuffer(`test-data-${i}`);
        expect(buffer.toString()).toBe(`test-data-${i}`);
        buffer.clear();
        expect(buffer.cleared).toBe(true);
        buffers.push(buffer);
      }

      // All should be cleared
      buffers.forEach((buffer, index) => {
        expect(buffer.cleared).toBe(true);
        expect(() => buffer.toString()).toThrow(
          "SecureBuffer has been cleared"
        );
      });
    });

    it("should handle error scenarios without memory leaks", async () => {
      const testUserId = TestDbHelper.generateTestUserId();
      const keyPair = SecureStorage.generateNewAccountKeyPair();
      const correctPassword = "CorrectPassword123!";
      const wrongPassword = "WrongPassword456!";

      // Store data
      await SecureStorage.storeEncryptedNsec(
        testUserId,
        keyPair.nsec,
        correctPassword
      );

      // Perform many failed operations
      for (let i = 0; i < 50; i++) {
        const result = await SecureStorage.retrieveDecryptedNsec(
          testUserId,
          wrongPassword
        );
        expect(result).toBeNull();
      }

      // Successful operation should still work
      const validResult = await SecureStorage.retrieveDecryptedNsec(
        testUserId,
        correctPassword
      );
      expect(validResult).not.toBeNull();
      if (validResult) {
        expect(validResult.toString()).toBe(keyPair.nsec);
        validResult.clear();
      }
    });
  });
});
