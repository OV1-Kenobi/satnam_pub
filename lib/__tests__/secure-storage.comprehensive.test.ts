/**
 * @fileoverview Comprehensive Integration Tests for SecureStorage
 * @description Tests for SecureBuffer usage in SecureStorage methods, memory management,
 * and error scenarios
 */

import { SecureStorage } from "../secure-storage";
import { TestDbHelper } from "./test-db-helper";

describe("SecureStorage Comprehensive Integration Tests", () => {
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

  describe("SecureBuffer Usage in SecureStorage Methods", () => {
    it("should use SecureBuffer correctly in storeEncryptedNsec", async () => {
      const testUserId = TestDbHelper.generateTestUserId();
      const keyPair = SecureStorage.generateNewAccountKeyPair();
      const password = "TestPassword123!";

      // Store the nsec using SecureBuffer internally
      const result = await SecureStorage.storeEncryptedNsec(
        testUserId,
        keyPair.nsec,
        password
      );

      expect(result).toBe(true);

      // Verify the data was stored and can be retrieved
      const retrievedBuffer = await SecureStorage.retrieveDecryptedNsec(
        testUserId,
        password
      );

      expect(retrievedBuffer).not.toBeNull();
      if (retrievedBuffer) {
        expect(retrievedBuffer.toString()).toBe(keyPair.nsec);
        expect(retrievedBuffer.cleared).toBe(false);

        // Clean up
        retrievedBuffer.clear();
        expect(retrievedBuffer.cleared).toBe(true);
      }
    });

    it("should use SecureBuffer correctly in retrieveDecryptedNsec", async () => {
      const testUserId = TestDbHelper.generateTestUserId();
      const testNsec =
        "nsec1test1234567890abcdef1234567890abcdef1234567890abcdef123456789";
      const password = "TestPassword123!";

      // Store the nsec first
      await SecureStorage.storeEncryptedNsec(testUserId, testNsec, password);

      // Retrieve should return a SecureBuffer
      const result = await SecureStorage.retrieveDecryptedNsec(
        testUserId,
        password
      );

      expect(result).not.toBeNull();
      expect(result).toBeDefined();

      if (result) {
        // Should be a SecureBuffer with correct properties
        expect(typeof result.toString).toBe("function");
        expect(typeof result.clear).toBe("function");
        expect(typeof result.cleared).toBe("boolean");
        expect(typeof result.size).toBe("number");

        // Should contain the correct data
        expect(result.toString()).toBe(testNsec);
        expect(result.size).toBe(new TextEncoder().encode(testNsec).length);
        expect(result.cleared).toBe(false);

        // Should be clearable
        result.clear();
        expect(result.cleared).toBe(true);
        expect(() => result.toString()).toThrow(
          "SecureBuffer has been cleared"
        );
      }
    });

    it("should handle SecureBuffer in updatePasswordAndReencryptNsec", async () => {
      const testUserId = TestDbHelper.generateTestUserId();
      const testNsec =
        "nsec1test1234567890abcdef1234567890abcdef1234567890abcdef123456789";
      const oldPassword = "OldPassword123!";
      const newPassword = "NewPassword456!";

      // Store initial data
      await SecureStorage.storeEncryptedNsec(testUserId, testNsec, oldPassword);

      // Update password (should use SecureBuffer internally)
      const result = await SecureStorage.updatePasswordAndReencryptNsec(
        testUserId,
        oldPassword,
        newPassword
      );

      expect(result).toBe(true);

      // Verify with new password
      const retrievedBuffer = await SecureStorage.retrieveDecryptedNsec(
        testUserId,
        newPassword
      );

      expect(retrievedBuffer).not.toBeNull();
      if (retrievedBuffer) {
        expect(retrievedBuffer.toString()).toBe(testNsec);
        retrievedBuffer.clear();
      }

      // Verify old password no longer works
      const oldPasswordResult = await SecureStorage.retrieveDecryptedNsec(
        testUserId,
        oldPassword
      );
      expect(oldPasswordResult).toBeNull();
    });
  });

  describe("Memory Management in SecureStorage", () => {
    it("should clear sensitive data from memory after successful operations", async () => {
      const testUserId = TestDbHelper.generateTestUserId();
      const keyPair = SecureStorage.generateNewAccountKeyPair();
      const password = "TestPassword123!";

      // Store the nsec
      const storeResult = await SecureStorage.storeEncryptedNsec(
        testUserId,
        keyPair.nsec,
        password
      );
      expect(storeResult).toBe(true);

      // Retrieve the nsec
      const retrievedBuffer = await SecureStorage.retrieveDecryptedNsec(
        testUserId,
        password
      );

      expect(retrievedBuffer).not.toBeNull();

      if (retrievedBuffer) {
        // Verify data integrity
        expect(retrievedBuffer.toString()).toBe(keyPair.nsec);

        // Manual cleanup should work
        retrievedBuffer.clear();
        expect(retrievedBuffer.cleared).toBe(true);
        expect(() => retrievedBuffer.toString()).toThrow(
          "SecureBuffer has been cleared"
        );
      }
    });

    it("should clear sensitive data from memory after error scenarios", async () => {
      const testUserId = TestDbHelper.generateTestUserId();
      const testNsec =
        "nsec1test1234567890abcdef1234567890abcdef1234567890abcdef123456789";
      const correctPassword = "CorrectPassword123!";
      const wrongPassword = "WrongPassword456!";

      // Store the nsec
      await SecureStorage.storeEncryptedNsec(
        testUserId,
        testNsec,
        correctPassword
      );

      // Try to retrieve with wrong password (should fail and clean up)
      const result = await SecureStorage.retrieveDecryptedNsec(
        testUserId,
        wrongPassword
      );
      expect(result).toBeNull();

      // Original data should still be accessible with correct password
      const correctResult = await SecureStorage.retrieveDecryptedNsec(
        testUserId,
        correctPassword
      );
      expect(correctResult).not.toBeNull();

      if (correctResult) {
        expect(correctResult.toString()).toBe(testNsec);
        correctResult.clear();
      }
    });

    it("should handle memory cleanup during password update failures", async () => {
      const testUserId = TestDbHelper.generateTestUserId();
      const testNsec =
        "nsec1test1234567890abcdef1234567890abcdef1234567890abcdef123456789";
      const correctPassword = "CorrectPassword123!";
      const wrongOldPassword = "WrongOldPassword456!";
      const newPassword = "NewPassword789!";

      // Store the nsec
      await SecureStorage.storeEncryptedNsec(
        testUserId,
        testNsec,
        correctPassword
      );

      // Try to update with wrong old password (should fail)
      const updateResult = await SecureStorage.updatePasswordAndReencryptNsec(
        testUserId,
        wrongOldPassword,
        newPassword
      );
      expect(updateResult).toBe(false);

      // Original data should still be accessible with correct password
      const retrievedBuffer = await SecureStorage.retrieveDecryptedNsec(
        testUserId,
        correctPassword
      );
      expect(retrievedBuffer).not.toBeNull();

      if (retrievedBuffer) {
        expect(retrievedBuffer.toString()).toBe(testNsec);
        retrievedBuffer.clear();
      }

      // New password should not work
      const newPasswordResult = await SecureStorage.retrieveDecryptedNsec(
        testUserId,
        newPassword
      );
      expect(newPasswordResult).toBeNull();
    });

    it("should handle memory management with multiple concurrent operations", async () => {
      const testUserId = TestDbHelper.generateTestUserId();
      const keyPair = SecureStorage.generateNewAccountKeyPair();
      const password = "TestPassword123!";

      // Store the nsec
      await SecureStorage.storeEncryptedNsec(
        testUserId,
        keyPair.nsec,
        password
      );

      // Multiple concurrent retrieval operations
      const retrievalPromises = Array.from({ length: 5 }, () =>
        SecureStorage.retrieveDecryptedNsec(testUserId, password)
      );

      const results = await Promise.all(retrievalPromises);

      // All should succeed and contain correct data
      results.forEach((result, index) => {
        expect(result).not.toBeNull();
        if (result) {
          expect(result.toString()).toBe(keyPair.nsec);
          expect(result.cleared).toBe(false);

          // Clean up each buffer
          result.clear();
          expect(result.cleared).toBe(true);
        }
      });
    });
  });

  describe("Error Scenarios with SecureBuffer", () => {
    it("should handle database connection errors gracefully", async () => {
      const testUserId = "non-existent-user";
      const password = "TestPassword123!";

      // Try to retrieve from non-existent user
      const result = await SecureStorage.retrieveDecryptedNsec(
        testUserId,
        password
      );
      expect(result).toBeNull();
    });

    it("should handle malformed encrypted data gracefully", async () => {
      const testUserId = TestDbHelper.generateTestUserId();
      const password = "TestPassword123!";

      // Create test user with malformed encrypted data
      await TestDbHelper.createTestUser(testUserId, "malformed-encrypted-data");

      // Try to retrieve (should fail gracefully)
      const result = await SecureStorage.retrieveDecryptedNsec(
        testUserId,
        password
      );
      expect(result).toBeNull();
    });

    it("should handle encryption/decryption errors with proper cleanup", async () => {
      const testUserId = TestDbHelper.generateTestUserId();
      const testNsec =
        "nsec1test1234567890abcdef1234567890abcdef1234567890abcdef123456789";
      const password = "TestPassword123!";
      const wrongPassword = "WrongPassword456!";

      // Store with correct password
      await SecureStorage.storeEncryptedNsec(testUserId, testNsec, password);

      // Try to retrieve with wrong password
      const result = await SecureStorage.retrieveDecryptedNsec(
        testUserId,
        wrongPassword
      );
      expect(result).toBeNull();

      // Should still work with correct password
      const correctResult = await SecureStorage.retrieveDecryptedNsec(
        testUserId,
        password
      );
      expect(correctResult).not.toBeNull();

      if (correctResult) {
        expect(correctResult.toString()).toBe(testNsec);
        correctResult.clear();
      }
    });

    it("should handle partial operation failures in password updates", async () => {
      const testUserId = TestDbHelper.generateTestUserId();
      const testNsec =
        "nsec1test1234567890abcdef1234567890abcdef1234567890abcdef123456789";
      const oldPassword = "OldPassword123!";
      const newPassword = "NewPassword456!";

      // Store initial data
      await SecureStorage.storeEncryptedNsec(testUserId, testNsec, oldPassword);

      // Simulate database error during update by using non-existent user
      const result = await SecureStorage.updatePasswordAndReencryptNsec(
        "non-existent-user",
        oldPassword,
        newPassword
      );
      expect(result).toBe(false);

      // Original data should still be accessible
      const retrievedBuffer = await SecureStorage.retrieveDecryptedNsec(
        testUserId,
        oldPassword
      );
      expect(retrievedBuffer).not.toBeNull();

      if (retrievedBuffer) {
        expect(retrievedBuffer.toString()).toBe(testNsec);
        retrievedBuffer.clear();
      }
    });
  });

  describe("SecureBuffer Lifecycle Management", () => {
    it("should properly manage SecureBuffer lifecycle in store operations", async () => {
      const testUserId = TestDbHelper.generateTestUserId();
      const keyPair = SecureStorage.generateNewAccountKeyPair();
      const password = "TestPassword123!";

      // Test multiple store operations
      for (let i = 0; i < 3; i++) {
        const result = await SecureStorage.storeEncryptedNsec(
          `${testUserId}-${i}`,
          keyPair.nsec,
          password
        );
        expect(result).toBe(true);

        // Verify each stored item
        const retrieved = await SecureStorage.retrieveDecryptedNsec(
          `${testUserId}-${i}`,
          password
        );
        expect(retrieved).not.toBeNull();

        if (retrieved) {
          expect(retrieved.toString()).toBe(keyPair.nsec);
          retrieved.clear();
          expect(retrieved.cleared).toBe(true);
        }
      }
    });

    it("should handle SecureBuffer in atomic operations correctly", async () => {
      const testUserId = TestDbHelper.generateTestUserId();
      const testNsec =
        "nsec1atomic1234567890abcdef1234567890abcdef1234567890abcdef123456789";
      const password1 = "Password1_123!";
      const password2 = "Password2_456!";
      const password3 = "Password3_789!";

      // Store initially
      await SecureStorage.storeEncryptedNsec(testUserId, testNsec, password1);

      // Chain of password updates (should be atomic)
      const result1 = await SecureStorage.updatePasswordAndReencryptNsec(
        testUserId,
        password1,
        password2
      );
      expect(result1).toBe(true);

      const result2 = await SecureStorage.updatePasswordAndReencryptNsec(
        testUserId,
        password2,
        password3
      );
      expect(result2).toBe(true);

      // Final verification
      const finalBuffer = await SecureStorage.retrieveDecryptedNsec(
        testUserId,
        password3
      );
      expect(finalBuffer).not.toBeNull();

      if (finalBuffer) {
        expect(finalBuffer.toString()).toBe(testNsec);
        finalBuffer.clear();
      }

      // Previous passwords should not work
      const oldResult1 = await SecureStorage.retrieveDecryptedNsec(
        testUserId,
        password1
      );
      expect(oldResult1).toBeNull();

      const oldResult2 = await SecureStorage.retrieveDecryptedNsec(
        testUserId,
        password2
      );
      expect(oldResult2).toBeNull();
    });

    it("should handle resource cleanup on application shutdown simulation", async () => {
      const testUserId = TestDbHelper.generateTestUserId();
      const keyPair = SecureStorage.generateNewAccountKeyPair();
      const password = "TestPassword123!";

      // Store data
      await SecureStorage.storeEncryptedNsec(
        testUserId,
        keyPair.nsec,
        password
      );

      // Retrieve multiple buffers (simulating active usage)
      const buffers = [];
      for (let i = 0; i < 5; i++) {
        const buffer = await SecureStorage.retrieveDecryptedNsec(
          testUserId,
          password
        );
        if (buffer) {
          buffers.push(buffer);
        }
      }

      expect(buffers.length).toBe(5);

      // Simulate shutdown - clear all buffers
      buffers.forEach((buffer) => {
        expect(buffer.cleared).toBe(false);
        buffer.clear();
        expect(buffer.cleared).toBe(true);
      });

      // All buffers should be cleared
      buffers.forEach((buffer) => {
        expect(() => buffer.toString()).toThrow(
          "SecureBuffer has been cleared"
        );
      });
    });
  });

  describe("Performance and Stress Testing", () => {
    it("should handle large data volumes efficiently", async () => {
      const testUserId = TestDbHelper.generateTestUserId();
      const largeNsec = "nsec1" + "a".repeat(1000); // Large nsec for testing
      const password = "TestPassword123!";

      const startTime = Date.now();

      // Store large data
      const storeResult = await SecureStorage.storeEncryptedNsec(
        testUserId,
        largeNsec,
        password
      );
      expect(storeResult).toBe(true);

      // Retrieve large data
      const retrievedBuffer = await SecureStorage.retrieveDecryptedNsec(
        testUserId,
        password
      );
      expect(retrievedBuffer).not.toBeNull();

      const endTime = Date.now();
      const operationTime = endTime - startTime;

      // Should complete within reasonable time (adjust as needed)
      expect(operationTime).toBeLessThan(5000); // 5 seconds

      if (retrievedBuffer) {
        expect(retrievedBuffer.toString()).toBe(largeNsec);
        expect(retrievedBuffer.size).toBe(
          new TextEncoder().encode(largeNsec).length
        );
        retrievedBuffer.clear();
      }
    });

    it("should handle rapid successive operations", async () => {
      const testUserId = TestDbHelper.generateTestUserId();
      const keyPair = SecureStorage.generateNewAccountKeyPair();
      const password = "TestPassword123!";

      // Store initial data
      await SecureStorage.storeEncryptedNsec(
        testUserId,
        keyPair.nsec,
        password
      );

      // Rapid successive retrievals
      const retrievalPromises = [];
      for (let i = 0; i < 20; i++) {
        retrievalPromises.push(
          SecureStorage.retrieveDecryptedNsec(testUserId, password)
        );
      }

      const results = await Promise.all(retrievalPromises);

      // All should succeed
      results.forEach((result) => {
        expect(result).not.toBeNull();
        if (result) {
          expect(result.toString()).toBe(keyPair.nsec);
          result.clear();
        }
      });
    });
  });
});
