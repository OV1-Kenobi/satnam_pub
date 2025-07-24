// lib/__tests__/secure-storage.integration.test.ts

import { SecureStorage } from '../secure-storage.js';
import { decryptCredentials, encryptCredentials } from "../security";
import { TestDbHelper } from "./test-db-helper";

describe("SecureStorage Integration Tests", () => {
  beforeAll(async () => {
    // Check database connection before running tests
    const isConnected = await TestDbHelper.checkConnection();
    if (!isConnected) {
      throw new Error(
        "Cannot connect to test database. Please check your .env.test configuration."
      );
    }
  });

  beforeEach(async () => {
    // Clean up any existing test data
    await TestDbHelper.cleanupTestData();
  });

  afterAll(async () => {
    // Final cleanup
    await TestDbHelper.cleanupTestData();
  });

  describe("updatePasswordAndReencryptNsec", () => {
    it("should handle password update failure gracefully", async () => {
      // This test verifies that if the password is incorrect,
      // the operation fails and data remains unchanged

      const testUserId = TestDbHelper.generateTestUserId();
      const testNsec =
        "nsec1test1234567890abcdef1234567890abcdef1234567890abcdef123456789";
      const originalPassword = "OriginalPassword123!";
      const newPassword = "NewPassword456!";

      // First, create a test user with encrypted nsec
      const originalEncryptedNsec = await encryptCredentials(
        testNsec,
        originalPassword
      );
      await TestDbHelper.createTestUser(testUserId, originalEncryptedNsec);

      // Verify the user was created
      const userData = await TestDbHelper.getTestUser(testUserId);
      expect(userData).toBeDefined();
      expect(userData.encrypted_nsec).toBe(originalEncryptedNsec);

      // Try to update with wrong old password (should fail)
      const result = await SecureStorage.updatePasswordAndReencryptNsec(
        testUserId,
        "WrongPassword",
        newPassword
      );

      // Should return false due to decryption failure
      expect(result).toBe(false);

      // Verify the original data is unchanged
      const unchangedData = await TestDbHelper.getTestUser(testUserId);
      expect(unchangedData.encrypted_nsec).toBe(originalEncryptedNsec);

      // Verify we can still decrypt with the original password
      const decryptedData = await decryptCredentials(
        unchangedData.encrypted_nsec,
        originalPassword
      );
      expect(decryptedData).toBe(testNsec);
    });

    it("should successfully update password and re-encrypt nsec", async () => {
      // This test verifies that password update works correctly
      // with proper encryption/decryption and database operations

      const testUserId = TestDbHelper.generateTestUserId();
      const testNsec =
        "nsec1test1234567890abcdef1234567890abcdef1234567890abcdef123456789";
      const originalPassword = "OriginalPassword123!";
      const newPassword = "NewPassword456!";

      // Create a test user with encrypted nsec
      const originalEncryptedNsec = await encryptCredentials(
        testNsec,
        originalPassword
      );
      await TestDbHelper.createTestUser(testUserId, originalEncryptedNsec);

      // Update password successfully
      const result = await SecureStorage.updatePasswordAndReencryptNsec(
        testUserId,
        originalPassword,
        newPassword
      );

      // Should return true for successful update
      expect(result).toBe(true);

      // Verify the encrypted data has changed
      const updatedData = await TestDbHelper.getTestUser(testUserId);
      expect(updatedData.encrypted_nsec).not.toBe(originalEncryptedNsec);
      expect(updatedData.updated_at).not.toBe(updatedData.created_at);

      // Verify we can decrypt with the new password
      const decryptedWithNewPassword = await decryptCredentials(
        updatedData.encrypted_nsec,
        newPassword
      );
      expect(decryptedWithNewPassword).toBe(testNsec);

      // Verify we cannot decrypt with the old password
      await expect(
        decryptCredentials(updatedData.encrypted_nsec, originalPassword)
      ).rejects.toThrow();
    });

    it("should handle concurrent updates with optimistic locking", async () => {
      // This test verifies that concurrent updates are handled correctly
      // Note: This is a simplified test since we can't easily simulate true concurrency

      const testUserId = TestDbHelper.generateTestUserId();
      const testNsec =
        "nsec1test1234567890abcdef1234567890abcdef1234567890abcdef123456789";
      const originalPassword = "OriginalPassword123!";
      const newPassword1 = "NewPassword1_456!";
      const newPassword2 = "NewPassword2_789!";

      // Create a test user with encrypted nsec
      const originalEncryptedNsec = await encryptCredentials(
        testNsec,
        originalPassword
      );
      await TestDbHelper.createTestUser(testUserId, originalEncryptedNsec);

      // First update should succeed
      const result1 = await SecureStorage.updatePasswordAndReencryptNsec(
        testUserId,
        originalPassword,
        newPassword1
      );
      expect(result1).toBe(true);

      // Second update should fail because the password has changed
      const result2 = await SecureStorage.updatePasswordAndReencryptNsec(
        testUserId,
        originalPassword, // Using old password again
        newPassword2
      );
      expect(result2).toBe(false);

      // Verify the data corresponds to the first successful update
      const finalData = await TestDbHelper.getTestUser(testUserId);
      const decryptedFinal = await decryptCredentials(
        finalData.encrypted_nsec,
        newPassword1
      );
      expect(decryptedFinal).toBe(testNsec);
    });
  });

  describe("SecureBuffer memory management", () => {
    it("should return SecureBuffer from retrieveDecryptedNsec", async () => {
      const testUserId = TestDbHelper.generateTestUserId();
      const testNsec =
        "nsec1test1234567890abcdef1234567890abcdef1234567890abcdef123456789";
      const password = "TestPassword123!";

      // Create test user
      const encryptedNsec = await encryptCredentials(testNsec, password);
      await TestDbHelper.createTestUser(testUserId, encryptedNsec);

      // Retrieve decrypted nsec
      const result = await SecureStorage.retrieveDecryptedNsec(
        testUserId,
        password
      );

      expect(result).toBeDefined();
      expect(result).not.toBeNull();

      if (result) {
        // Should be able to get the decrypted value
        expect(result.toString()).toBe(testNsec);

        // Should be able to clear the buffer
        result.clear();
        expect(result.cleared).toBe(true);

        // Should throw when trying to access cleared buffer
        expect(() => result.toString()).toThrow(
          "SecureBuffer has been cleared"
        );
      }
    });

    it("should return null for non-existent user", async () => {
      const nonExistentUserId = "non-existent-user-id";
      const password = "TestPassword123!";

      const result = await SecureStorage.retrieveDecryptedNsec(
        nonExistentUserId,
        password
      );
      expect(result).toBeNull();
    });

    it("should return null for incorrect password", async () => {
      const testUserId = TestDbHelper.generateTestUserId();
      const testNsec =
        "nsec1test1234567890abcdef1234567890abcdef1234567890abcdef123456789";
      const correctPassword = "CorrectPassword123!";
      const wrongPassword = "WrongPassword456!";

      // Create test user
      const encryptedNsec = await encryptData(testNsec, correctPassword);
      await TestDbHelper.createTestUser(testUserId, encryptedNsec);

      // Try to retrieve with wrong password
      const result = await SecureStorage.retrieveDecryptedNsec(
        testUserId,
        wrongPassword
      );
      expect(result).toBeNull();
    });
  });

  describe("Key pair generation", () => {
    it("should generate valid Nostr key pairs", () => {
      const keyPair = SecureStorage.generateNewAccountKeyPair();

      expect(keyPair.nsec).toBeDefined();
      expect(keyPair.npub).toBeDefined();
      expect(keyPair.hexPrivateKey).toBeDefined();
      expect(keyPair.hexPublicKey).toBeDefined();

      // Verify the format
      expect(keyPair.nsec.startsWith("nsec")).toBe(true);
      expect(keyPair.npub.startsWith("npub")).toBe(true);

      // Verify hex keys are valid hex strings
      expect(keyPair.hexPrivateKey).toMatch(/^[0-9a-f]{64}$/);
      expect(keyPair.hexPublicKey).toMatch(/^[0-9a-f]{64}$/);
    });

    it("should generate unique key pairs each time", () => {
      const keyPair1 = SecureStorage.generateNewAccountKeyPair();
      const keyPair2 = SecureStorage.generateNewAccountKeyPair();

      expect(keyPair1.nsec).not.toBe(keyPair2.nsec);
      expect(keyPair1.npub).not.toBe(keyPair2.npub);
      expect(keyPair1.hexPrivateKey).not.toBe(keyPair2.hexPrivateKey);
      expect(keyPair1.hexPublicKey).not.toBe(keyPair2.hexPublicKey);
    });
  });

  describe("Store and retrieve operations", () => {
    it("should store and retrieve encrypted nsec successfully", async () => {
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

      // Retrieve and verify
      const retrievedBuffer = await SecureStorage.retrieveDecryptedNsec(
        testUserId,
        password
      );
      expect(retrievedBuffer).toBeDefined();
      expect(retrievedBuffer).not.toBeNull();

      if (retrievedBuffer) {
        expect(retrievedBuffer.toString()).toBe(keyPair.nsec);
        retrievedBuffer.clear();
      }
    });

    it("should check if user has stored nsec", async () => {
      const testUserId = TestDbHelper.generateTestUserId();
      const keyPair = SecureStorage.generateNewAccountKeyPair();
      const password = "TestPassword123!";

      // Initially should not have stored nsec
      const hasBefore = await SecureStorage.hasStoredNsec(testUserId);
      expect(hasBefore).toBe(false);

      // Store the nsec
      await SecureStorage.storeEncryptedNsec(
        testUserId,
        keyPair.nsec,
        password
      );

      // Now should have stored nsec
      const hasAfter = await SecureStorage.hasStoredNsec(testUserId);
      expect(hasAfter).toBe(true);
    });

    it("should delete stored nsec successfully", async () => {
      const testUserId = TestDbHelper.generateTestUserId();
      const keyPair = SecureStorage.generateNewAccountKeyPair();
      const password = "TestPassword123!";

      // Store the nsec
      await SecureStorage.storeEncryptedNsec(
        testUserId,
        keyPair.nsec,
        password
      );
      expect(await SecureStorage.hasStoredNsec(testUserId)).toBe(true);

      // Delete the nsec
      const deleteResult = await SecureStorage.deleteStoredNsec(testUserId);
      expect(deleteResult).toBe(true);

      // Should no longer have stored nsec
      expect(await SecureStorage.hasStoredNsec(testUserId)).toBe(false);
    });
  });
});
