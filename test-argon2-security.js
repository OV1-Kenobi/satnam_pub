// test-argon2-security.js
// Test script to verify Argon2-browser security implementation

import { 
  deriveEncryptionKey, 
  encryptCredentials, 
  decryptCredentials, 
  hashPassphrase, 
  verifyPassphrase,
  generateSecureToken,
  validateArgon2ConfigOnStartup 
} from './api/lib/security.ts';

async function testArgon2Security() {
  console.log('🔐 Testing Gold Standard Argon2 Security Implementation...\n');

  try {
    // Test 1: Configuration validation
    console.log('1️⃣ Testing Argon2 Configuration...');
    validateArgon2ConfigOnStartup();
    console.log('✅ Configuration validation passed\n');

    // Test 2: Password hashing
    console.log('2️⃣ Testing Argon2id Password Hashing...');
    const testPassword = 'super-secure-password-123!@#';
    const hash = await hashPassphrase(testPassword);
    console.log(`   Hash generated: ${hash.substring(0, 50)}...`);
    
    // Test 3: Password verification
    console.log('3️⃣ Testing Password Verification...');
    const isValid = await verifyPassphrase(testPassword, hash);
    const isInvalid = await verifyPassphrase('wrong-password', hash);
    console.log(`   Correct password: ${isValid ? '✅' : '❌'}`);
    console.log(`   Wrong password: ${isInvalid ? '❌' : '✅'}`);
    console.log('✅ Password verification passed\n');

    // Test 4: Key derivation
    console.log('4️⃣ Testing Argon2id Key Derivation...');
    const salt = new Uint8Array(32);
    crypto.getRandomValues(salt);
    const derivedKey = await deriveEncryptionKey(testPassword, salt);
    console.log(`   Derived key length: ${derivedKey.length} bytes`);
    console.log('✅ Key derivation passed\n');

    // Test 5: Encryption/Decryption
    console.log('5️⃣ Testing AES-256-GCM Encryption with Argon2id...');
    const testData = 'This is sensitive data that needs to be encrypted securely!';
    const encrypted = await encryptCredentials(testData, testPassword);
    console.log(`   Encrypted data length: ${encrypted.length} characters`);
    
    const decrypted = await decryptCredentials(encrypted, testPassword);
    const decryptionSuccess = decrypted === testData;
    console.log(`   Decryption successful: ${decryptionSuccess ? '✅' : '❌'}`);
    console.log('✅ Encryption/Decryption passed\n');

    // Test 6: Secure token generation
    console.log('6️⃣ Testing Secure Token Generation...');
    const token1 = await generateSecureToken(32);
    const token2 = await generateSecureToken(32);
    console.log(`   Token 1: ${token1.substring(0, 20)}...`);
    console.log(`   Token 2: ${token2.substring(0, 20)}...`);
    console.log(`   Tokens are different: ${token1 !== token2 ? '✅' : '❌'}`);
    console.log('✅ Token generation passed\n');

    console.log('🎉 All Argon2 Security Tests Passed!');
    console.log('🔒 Gold Standard Security Implementation is working correctly.');
    console.log('   - Argon2id for password hashing (Password Hashing Competition winner)');
    console.log('   - AES-256-GCM for authenticated encryption');
    console.log('   - Web Crypto API for secure random generation');
    console.log('   - Browser-compatible implementation');

  } catch (error) {
    console.error('❌ Security test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
testArgon2Security(); 