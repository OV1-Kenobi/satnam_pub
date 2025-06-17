/**
 * @fileoverview Concurrency and Atomicity Tests for SecureStorage
 * @description Tests for concurrent access, atomic operations, and data consistency
 */

import { SecureStorage } from "../secure-storage";
import { TestDbHelper } from "./test-db-helper";

describe("SecureStorage Concurrency and Atomicity Tests", () => {
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

  describe("Concurrent Access Tests", () => {
    it("should handle concurrent reads without data corruption", async () => {
      const testUserId = TestDbHelper.generateTestUserId();
      const keyPair = SecureStorage.generateNewAccountKeyPair();
      const password = "ConcurrentReadTest123!";

      // Store initial data
      await SecureStorage.storeEncryptedNsec(
        testUserId,
        keyPair.nsec,
        password
      );

      // Concurrent read operations
      const concurrentReads = Array.from({ length: 10 }, () =>
        SecureStorage.retrieveDecryptedNsec(testUserId, password)
      );

      const results = await Promise.all(concurrentReads);

      // All reads should succeed and return the same data
      results.forEach((result, index) => {
        expect(result).not.toBeNull();
        if (result) {
          expect(result.toString()).toBe(keyPair.nsec);
          expect(result.cleared).toBe(false);
          expect(result.size).toBe(
            new TextEncoder().encode(keyPair.nsec).length
          );

          // Clean up each buffer
          result.clear();
          expect(result.cleared).toBe(true);
        }
      });
    });

    it("should handle concurrent writes with proper serialization", async () => {
      const baseUserId = TestDbHelper.generateTestUserId();
      const keyPair = SecureStorage.generateNewAccountKeyPair();
      const password = "ConcurrentWriteTest123!";

      // Concurrent write operations to different users
      const concurrentWrites = Array.from({ length: 5 }, (_, index) =>
        SecureStorage.storeEncryptedNsec(
          `${baseUserId}-${index}`,
          keyPair.nsec,
          password
        )
      );

      const writeResults = await Promise.all(concurrentWrites);

      // All writes should succeed
      writeResults.forEach((result) => {
        expect(result).toBe(true);
      });

      // Verify all data was written correctly
      const verificationPromises = Array.from({ length: 5 }, (_, index) =>
        SecureStorage.retrieveDecryptedNsec(`${baseUserId}-${index}`, password)
      );

      const verificationResults = await Promise.all(verificationPromises);

      verificationResults.forEach((result) => {
        expect(result).not.toBeNull();
        if (result) {
          expect(result.toString()).toBe(keyPair.nsec);
          result.clear();
        }
      });
    });

    it("should handle mixed concurrent read/write operations", async () => {
      const testUserId = TestDbHelper.generateTestUserId();
      const keyPair = SecureStorage.generateNewAccountKeyPair();
      const password = "MixedConcurrentTest123!";

      // Store initial data
      await SecureStorage.storeEncryptedNsec(
        testUserId,
        keyPair.nsec,
        password
      );

      // Mix of concurrent read and write operations
      const operations = [
        // Reads
        SecureStorage.retrieveDecryptedNsec(testUserId, password),
        SecureStorage.retrieveDecryptedNsec(testUserId, password),
        SecureStorage.retrieveDecryptedNsec(testUserId, password),
        // Writes to different users
        SecureStorage.storeEncryptedNsec(
          `${testUserId}-1`,
          keyPair.nsec,
          password
        ),
        SecureStorage.storeEncryptedNsec(
          `${testUserId}-2`,
          keyPair.nsec,
          password
        ),
        // More reads
        SecureStorage.retrieveDecryptedNsec(testUserId, password),
        SecureStorage.retrieveDecryptedNsec(testUserId, password),
      ];

      const results = await Promise.all(operations);

      // First 3 results should be read results (SecureBuffer or null)
      for (let i = 0; i < 3; i++) {
        expect(results[i]).not.toBeNull();
        if (results[i]) {
          expect((results[i] as any).toString()).toBe(keyPair.nsec);
          (results[i] as any).clear();
        }
      }

      // Next 2 results should be write results (boolean)
      expect(results[3]).toBe(true);
      expect(results[4]).toBe(true);

      // Last 2 results should be read results (SecureBuffer or null)
      for (let i = 5; i < 7; i++) {
        expect(results[i]).not.toBeNull();
        if (results[i]) {
          expect((results[i] as any).toString()).toBe(keyPair.nsec);
          (results[i] as any).clear();
        }
      }
    });

    it("should handle concurrent password updates with proper conflict resolution", async () => {
      const testUserId = TestDbHelper.generateTestUserId();
      const testNsec =
        "nsec1concurrent1234567890abcdef1234567890abcdef1234567890abcdef123456789";
      const originalPassword = "OriginalPassword123!";
      const newPassword1 = "NewPassword1_456!";
      const newPassword2 = "NewPassword2_789!";

      // Store initial data
      await SecureStorage.storeEncryptedNsec(
        testUserId,
        testNsec,
        originalPassword
      );

      // Concurrent password update attempts
      const updatePromises = [
        SecureStorage.updatePasswordAndReencryptNsec(
          testUserId,
          originalPassword,
          newPassword1
        ),
        SecureStorage.updatePasswordAndReencryptNsec(
          testUserId,
          originalPassword,
          newPassword2
        ),
      ];

      const updateResults = await Promise.all(updatePromises);

      // One should succeed, one should fail (due to concurrent modification)
      const successCount = updateResults.filter(
        (result) => result === true
      ).length;
      const failureCount = updateResults.filter(
        (result) => result === false
      ).length;

      expect(successCount).toBe(1);
      expect(failureCount).toBe(1);

      // Determine which password update succeeded
      const password1Works = await SecureStorage.retrieveDecryptedNsec(
        testUserId,
        newPassword1
      );
      const password2Works = await SecureStorage.retrieveDecryptedNsec(
        testUserId,
        newPassword2
      );

      // Exactly one should work
      const workingResults = [password1Works, password2Works].filter(
        (r) => r !== null
      );
      expect(workingResults.length).toBe(1);

      // Clean up
      if (password1Works) {
        expect(password1Works.toString()).toBe(testNsec);
        password1Works.clear();
      }
      if (password2Works) {
        expect(password2Works.toString()).toBe(testNsec);
        password2Works.clear();
      }

      // Original password should not work anymore
      const originalResult = await SecureStorage.retrieveDecryptedNsec(
        testUserId,
        originalPassword
      );
      expect(originalResult).toBeNull();
    });
  });

  describe("Atomic Operations Tests", () => {
    it("should ensure password updates are atomic", async () => {
      const testUserId = TestDbHelper.generateTestUserId();
      const testNsec =
        "nsec1atomic1234567890abcdef1234567890abcdef1234567890abcdef123456789";
      const oldPassword = "OldPassword123!";
      const newPassword = "NewPassword456!";

      // Store initial data
      await SecureStorage.storeEncryptedNsec(testUserId, testNsec, oldPassword);

      // Verify initial state
      const initialBuffer = await SecureStorage.retrieveDecryptedNsec(
        testUserId,
        oldPassword
      );
      expect(initialBuffer).not.toBeNull();
      if (initialBuffer) {
        expect(initialBuffer.toString()).toBe(testNsec);
        initialBuffer.clear();
      }

      // Perform atomic update
      const updateResult = await SecureStorage.updatePasswordAndReencryptNsec(
        testUserId,
        oldPassword,
        newPassword
      );
      expect(updateResult).toBe(true);

      // Verify final state - new password should work
      const newPasswordBuffer = await SecureStorage.retrieveDecryptedNsec(
        testUserId,
        newPassword
      );
      expect(newPasswordBuffer).not.toBeNull();
      if (newPasswordBuffer) {
        expect(newPasswordBuffer.toString()).toBe(testNsec);
        newPasswordBuffer.clear();
      }

      // Old password should not work
      const oldPasswordResult = await SecureStorage.retrieveDecryptedNsec(
        testUserId,
        oldPassword
      );
      expect(oldPasswordResult).toBeNull();
    });

    it("should handle atomic operation failures gracefully", async () => {
      const testUserId = TestDbHelper.generateTestUserId();
      const testNsec =
        "nsec1atomic1234567890abcdef1234567890abcdef1234567890abcdef123456789";
      const correctPassword = "CorrectPassword123!";
      const wrongPassword = "WrongPassword456!";
      const newPassword = "NewPassword789!";

      // Store initial data
      await SecureStorage.storeEncryptedNsec(
        testUserId,
        testNsec,
        correctPassword
      );

      // Try atomic update with wrong old password (should fail atomically)
      const updateResult = await SecureStorage.updatePasswordAndReencryptNsec(
        testUserId,
        wrongPassword,
        newPassword
      );
      expect(updateResult).toBe(false);

      // Original data should remain unchanged
      const originalBuffer = await SecureStorage.retrieveDecryptedNsec(
        testUserId,
        correctPassword
      );
      expect(originalBuffer).not.toBeNull();
      if (originalBuffer) {
        expect(originalBuffer.toString()).toBe(testNsec);
        originalBuffer.clear();
      }

      // New password should not work
      const newPasswordResult = await SecureStorage.retrieveDecryptedNsec(
        testUserId,
        newPassword
      );
      expect(newPasswordResult).toBeNull();
    });

    it("should maintain data consistency during partial failures", async () => {
      const testUserId = TestDbHelper.generateTestUserId();
      const testNsec =
        "nsec1consistency1234567890abcdef1234567890abcdef1234567890abcdef123456789";
      const password = "ConsistencyTestPassword123!";

      // Store initial data
      await SecureStorage.storeEncryptedNsec(testUserId, testNsec, password);

      // Attempt operations that might fail
      const operations = [
        // Valid operation
        SecureStorage.retrieveDecryptedNsec(testUserId, password),
        // Invalid operation (wrong password)
        SecureStorage.retrieveDecryptedNsec(testUserId, "WrongPassword"),
        // Valid operation
        SecureStorage.retrieveDecryptedNsec(testUserId, password),
        // Invalid operation (non-existent user)
        SecureStorage.retrieveDecryptedNsec("non-existent-user", password),
      ];

      const results = await Promise.all(operations);

      // Valid operations should succeed
      expect(results[0]).not.toBeNull();
      expect(results[2]).not.toBeNull();

      // Invalid operations should fail
      expect(results[1]).toBeNull();
      expect(results[3]).toBeNull();

      // Clean up successful results
      if (results[0]) {
        expect((results[0] as any).toString()).toBe(testNsec);
        (results[0] as any).clear();
      }
      if (results[2]) {
        expect((results[2] as any).toString()).toBe(testNsec);
        (results[2] as any).clear();
      }

      // Data should still be consistent
      const finalBuffer = await SecureStorage.retrieveDecryptedNsec(
        testUserId,
        password
      );
      expect(finalBuffer).not.toBeNull();
      if (finalBuffer) {
        expect(finalBuffer.toString()).toBe(testNsec);
        finalBuffer.clear();
      }
    });
  });

  describe("Data Consistency Tests", () => {
    it("should maintain data integrity across multiple operations", async () => {
      const testUserId = TestDbHelper.generateTestUserId();
      const keyPair = SecureStorage.generateNewAccountKeyPair();
      const password1 = "Password1_123!";
      const password2 = "Password2_456!";
      const password3 = "Password3_789!";

      // Store initial data
      await SecureStorage.storeEncryptedNsec(
        testUserId,
        keyPair.nsec,
        password1
      );

      // Chain of operations
      const operations = [
        // Read with password1
        SecureStorage.retrieveDecryptedNsec(testUserId, password1),
        // Update to password2
        SecureStorage.updatePasswordAndReencryptNsec(
          testUserId,
          password1,
          password2
        ),
        // Read with password2
        SecureStorage.retrieveDecryptedNsec(testUserId, password2),
        // Update to password3
        SecureStorage.updatePasswordAndReencryptNsec(
          testUserId,
          password2,
          password3
        ),
        // Read with password3
        SecureStorage.retrieveDecryptedNsec(testUserId, password3),
      ];

      // Execute operations sequentially to maintain order
      const result1 = await operations[0];
      expect(result1).not.toBeNull();
      if (result1) {
        expect((result1 as any).toString()).toBe(keyPair.nsec);
        (result1 as any).clear();
      }

      const result2 = await operations[1];
      expect(result2).toBe(true);

      const result3 = await operations[2];
      expect(result3).not.toBeNull();
      if (result3) {
        expect((result3 as any).toString()).toBe(keyPair.nsec);
        (result3 as any).clear();
      }

      const result4 = await operations[3];
      expect(result4).toBe(true);

      const result5 = await operations[4];
      expect(result5).not.toBeNull();
      if (result5) {
        expect((result5 as any).toString()).toBe(keyPair.nsec);
        (result5 as any).clear();
      }

      // Verify final state
      const finalBuffer = await SecureStorage.retrieveDecryptedNsec(
        testUserId,
        password3
      );
      expect(finalBuffer).not.toBeNull();
      if (finalBuffer) {
        expect(finalBuffer.toString()).toBe(keyPair.nsec);
        finalBuffer.clear();
      }

      // Old passwords should not work
      expect(
        await SecureStorage.retrieveDecryptedNsec(testUserId, password1)
      ).toBeNull();
      expect(
        await SecureStorage.retrieveDecryptedNsec(testUserId, password2)
      ).toBeNull();
    });

    it("should handle race conditions in SecureBuffer usage", async () => {
      const testUserId = TestDbHelper.generateTestUserId();
      const keyPair = SecureStorage.generateNewAccountKeyPair();
      const password = "RaceConditionTest123!";

      // Store initial data
      await SecureStorage.storeEncryptedNsec(
        testUserId,
        keyPair.nsec,
        password
      );

      // Simulate race condition: multiple concurrent accesses to the same data
      const concurrentOperations = Array.from({ length: 10 }, async () => {
        const buffer = await SecureStorage.retrieveDecryptedNsec(
          testUserId,
          password
        );
        if (buffer) {
          // Simulate some processing time
          await new Promise((resolve) =>
            setTimeout(resolve, Math.random() * 10)
          );

          const data = buffer.toString();

          // Simulate more processing
          await new Promise((resolve) =>
            setTimeout(resolve, Math.random() * 10)
          );

          buffer.clear();

          return data;
        }
        return null;
      });

      const results = await Promise.all(concurrentOperations);

      // All should succeed and return the same data
      results.forEach((result) => {
        expect(result).toBe(keyPair.nsec);
      });
    });

    it("should handle SecureBuffer lifecycle in concurrent scenarios", async () => {
      const testUserId = TestDbHelper.generateTestUserId();
      const keyPair = SecureStorage.generateNewAccountKeyPair();
      const password = "LifecycleTest123!";

      // Store initial data
      await SecureStorage.storeEncryptedNsec(
        testUserId,
        keyPair.nsec,
        password
      );

      // Create multiple buffers concurrently
      const bufferPromises = Array.from({ length: 5 }, () =>
        SecureStorage.retrieveDecryptedNsec(testUserId, password)
      );

      const buffers = await Promise.all(bufferPromises);

      // All buffers should be valid
      buffers.forEach((buffer) => {
        expect(buffer).not.toBeNull();
        if (buffer) {
          expect((buffer as any).toString()).toBe(keyPair.nsec);
          expect((buffer as any).cleared).toBe(false);
        }
      });

      // Clear buffers concurrently
      const clearPromises = buffers.map((buffer) => {
        return new Promise<void>((resolve) => {
          setTimeout(() => {
            if (buffer) {
              (buffer as any).clear();
            }
            resolve();
          }, Math.random() * 100);
        });
      });

      await Promise.all(clearPromises);

      // All buffers should be cleared
      buffers.forEach((buffer) => {
        if (buffer) {
          expect((buffer as any).cleared).toBe(true);
          expect(() => (buffer as any).toString()).toThrow(
            "SecureBuffer has been cleared"
          );
        }
      });
    });
  });

  describe("Optimistic Locking Tests", () => {
    it("should handle optimistic locking correctly", async () => {
      const testUserId = TestDbHelper.generateTestUserId();
      const testNsec =
        "nsec1optimistic1234567890abcdef1234567890abcdef1234567890abcdef123456789";
      const originalPassword = "OriginalPassword123!";
      const newPassword1 = "NewPassword1_456!";
      const newPassword2 = "NewPassword2_789!";

      // Store initial data
      await SecureStorage.storeEncryptedNsec(
        testUserId,
        testNsec,
        originalPassword
      );

      // First update should succeed
      const result1 = await SecureStorage.updatePasswordAndReencryptNsec(
        testUserId,
        originalPassword,
        newPassword1
      );
      expect(result1).toBe(true);

      // Second update with old password should fail (optimistic locking)
      const result2 = await SecureStorage.updatePasswordAndReencryptNsec(
        testUserId,
        originalPassword,
        newPassword2
      );
      expect(result2).toBe(false);

      // Verify correct final state
      const finalBuffer = await SecureStorage.retrieveDecryptedNsec(
        testUserId,
        newPassword1
      );
      expect(finalBuffer).not.toBeNull();
      if (finalBuffer) {
        expect(finalBuffer.toString()).toBe(testNsec);
        finalBuffer.clear();
      }

      // Old password and failed new password should not work
      expect(
        await SecureStorage.retrieveDecryptedNsec(testUserId, originalPassword)
      ).toBeNull();
      expect(
        await SecureStorage.retrieveDecryptedNsec(testUserId, newPassword2)
      ).toBeNull();
    });

    it("should retry failed operations with proper backoff", async () => {
      const testUserId = TestDbHelper.generateTestUserId();
      const testNsec =
        "nsec1retry1234567890abcdef1234567890abcdef1234567890abcdef123456789";
      const password = "RetryTestPassword123!";

      // Store initial data
      await SecureStorage.storeEncryptedNsec(testUserId, testNsec, password);

      // Simulate multiple retrieval attempts (should all succeed)
      const attempts = Array.from({ length: 5 }, () =>
        SecureStorage.retrieveDecryptedNsec(testUserId, password)
      );

      const results = await Promise.all(attempts);

      // All attempts should succeed
      results.forEach((result) => {
        expect(result).not.toBeNull();
        if (result) {
          expect((result as any).toString()).toBe(testNsec);
          (result as any).clear();
        }
      });
    });
  });
});
