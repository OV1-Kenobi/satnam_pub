/**
 * Validation Test for CryptoJS Null Reference Fix
 * Tests that the crypto-lazy utility properly loads CryptoJS before using it
 */

import { CryptoLazy } from '../utils/crypto-lazy.js';

describe('CryptoJS Null Reference Fix Validation', () => {
  let cryptoLazy;

  beforeEach(() => {
    cryptoLazy = CryptoLazy.getInstance();
  });

  /**
   * Test 1: hashPassword method should not throw null reference errors
   */
  test('hashPassword should properly load CryptoJS before use', async () => {
    const password = 'testPassword123';
    const salt = 'testSalt';

    // This should not throw "Cannot read properties of null" error
    const hashedPassword = await cryptoLazy.hashPassword(password, salt);
    
    expect(hashedPassword).toBeDefined();
    expect(typeof hashedPassword).toBe('string');
    expect(hashedPassword.length).toBeGreaterThan(0);
  });

  /**
   * Test 2: encryptData method should not throw null reference errors
   */
  test('encryptData should properly load CryptoJS before use', async () => {
    const data = 'sensitive data to encrypt';
    const key = 'encryption-key-123';

    // This should not throw "Cannot read properties of null" error
    const encryptedData = await cryptoLazy.encryptData(data, key);
    
    expect(encryptedData).toBeDefined();
    expect(typeof encryptedData).toBe('string');
    expect(encryptedData.length).toBeGreaterThan(0);
    expect(encryptedData).not.toBe(data); // Should be encrypted
  });

  /**
   * Test 3: decryptData method should not throw null reference errors
   */
  test('decryptData should properly load CryptoJS before use', async () => {
    const originalData = 'data to encrypt and decrypt';
    const key = 'encryption-key-456';

    // First encrypt the data
    const encryptedData = await cryptoLazy.encryptData(originalData, key);
    
    // Then decrypt it - this should not throw "Cannot read properties of null" error
    const decryptedData = await cryptoLazy.decryptData(encryptedData, key);
    
    expect(decryptedData).toBeDefined();
    expect(typeof decryptedData).toBe('string');
    expect(decryptedData).toBe(originalData); // Should match original
  });

  /**
   * Test 4: Multiple consecutive calls should work without issues
   */
  test('multiple consecutive crypto operations should work', async () => {
    const password = 'testPassword456';
    const data = 'test data for encryption';
    const key = 'test-key-789';

    // Multiple operations in sequence
    const hash1 = await cryptoLazy.hashPassword(password);
    const encrypted1 = await cryptoLazy.encryptData(data, key);
    const decrypted1 = await cryptoLazy.decryptData(encrypted1, key);
    const hash2 = await cryptoLazy.hashPassword(password);

    expect(hash1).toBeDefined();
    expect(encrypted1).toBeDefined();
    expect(decrypted1).toBe(data);
    expect(hash2).toBeDefined();
    // Hashes should be different due to random salt
    expect(hash1).not.toBe(hash2);
  });

  /**
   * Test 5: Error handling for invalid inputs
   */
  test('should handle invalid inputs gracefully', async () => {
    // Test with empty strings
    await expect(cryptoLazy.hashPassword('')).resolves.toBeDefined();
    await expect(cryptoLazy.encryptData('', 'key')).resolves.toBeDefined();
    
    // Test decryption with invalid data should not crash
    try {
      await cryptoLazy.decryptData('invalid-encrypted-data', 'key');
    } catch (error) {
      // Should throw a CryptoJS error, not a null reference error
      expect(error.message).not.toContain('Cannot read properties of null');
    }
  });
});

/**
 * Integration Test: Verify DUID compatibility
 */
describe('DUID System Integration', () => {
  test('crypto operations should work with DUID authentication flow', async () => {
    const cryptoLazy = CryptoLazy.getInstance();
    
    // Simulate DUID authentication crypto operations
    const userPassword = 'userPassword123';
    const sensitiveData = 'user-sensitive-data';
    const encryptionKey = 'user-encryption-key';

    // Hash password (used in DUID generation)
    const passwordHash = await cryptoLazy.hashPassword(userPassword);
    expect(passwordHash).toBeDefined();

    // Encrypt sensitive data (used in maximum encryption architecture)
    const encryptedData = await cryptoLazy.encryptData(sensitiveData, encryptionKey);
    expect(encryptedData).toBeDefined();

    // Decrypt sensitive data (used when retrieving user data)
    const decryptedData = await cryptoLazy.decryptData(encryptedData, encryptionKey);
    expect(decryptedData).toBe(sensitiveData);

    console.log('✅ DUID system crypto operations validated');
  });
});

console.log('🔧 CryptoJS Null Reference Fix Validation Tests Ready');
console.log('🛡️ Tests verify proper dynamic import usage in crypto-lazy utility');
console.log('⚡ Run with: npm test crypto-lazy-fix-validation.js');
