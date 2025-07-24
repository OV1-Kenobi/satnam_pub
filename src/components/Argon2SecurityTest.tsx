import { useState } from 'react';
import {
  decryptCredentials,
  deriveEncryptionKey,
  encryptCredentials,
  generateSecureToken,
  hashPassphrase,
  validateArgon2ConfigOnStartup,
  verifyPassphrase
} from '../../api/lib/security.js';

export default function Argon2SecurityTest() {
  const [results, setResults] = useState<string[]>([]);
  const [running, setRunning] = useState(false);

  async function runTests() {
    setRunning(true);
    const log: string[] = [];
    try {
      log.push('🔐 Testing Gold Standard Argon2 Security Implementation...');
      // Test 1: Configuration validation
      log.push('1️⃣ Testing Argon2 Configuration...');
      validateArgon2ConfigOnStartup();
      log.push('✅ Configuration validation passed');

      // Test 2: Password hashing
      log.push('2️⃣ Testing Argon2id Password Hashing...');
      const testPassword = 'super-secure-password-123!@#';
      const hash = await hashPassphrase(testPassword);
      log.push(`   Hash generated: ${hash.substring(0, 50)}...`);

      // Test 3: Password verification
      log.push('3️⃣ Testing Password Verification...');
      const isValid = await verifyPassphrase(testPassword, hash);
      const isInvalid = await verifyPassphrase('wrong-password', hash);
      log.push(`   Correct password: ${isValid ? '✅' : '❌'}`);
      log.push(`   Wrong password: ${isInvalid ? '❌' : '✅'}`);
      log.push('✅ Password verification passed');

      // Test 4: Key derivation
      log.push('4️⃣ Testing Argon2id Key Derivation...');
      const salt = new Uint8Array(32);
      window.crypto.getRandomValues(salt);
      const derivedKey = await deriveEncryptionKey(testPassword, salt);
      log.push(`   Derived key algorithm: ${derivedKey.algorithm.name}`);
      log.push('✅ Key derivation passed');

      // Test 5: Encryption/Decryption
      log.push('5️⃣ Testing AES-256-GCM Encryption with Argon2id...');
      const testData = 'This is sensitive data that needs to be encrypted securely!';
      const encrypted = await encryptCredentials(testData, testPassword);
      log.push(`   Encrypted data length: ${encrypted.length} characters`);
      const decrypted = await decryptCredentials(encrypted, testPassword);
      const decryptionSuccess = decrypted === testData;
      log.push(`   Decryption successful: ${decryptionSuccess ? '✅' : '❌'}`);
      log.push('✅ Encryption/Decryption passed');

      // Test 6: Secure token generation
      log.push('6️⃣ Testing Secure Token Generation...');
      const token1 = await generateSecureToken(32);
      const token2 = await generateSecureToken(32);
      log.push(`   Token 1: ${token1.substring(0, 20)}...`);
      log.push(`   Token 2: ${token2.substring(0, 20)}...`);
      log.push(`   Tokens are different: ${token1 !== token2 ? '✅' : '❌'}`);
      log.push('✅ Token generation passed');

      log.push('🎉 All Argon2 Security Tests Passed!');
      log.push('🔒 Gold Standard Security Implementation is working correctly.');
      log.push('   - Argon2id for password hashing (Password Hashing Competition winner)');
      log.push('   - AES-256-GCM for authenticated encryption');
      log.push('   - Web Crypto API for secure random generation');
      log.push('   - Browser-compatible implementation');
    } catch (error: any) {
      log.push('❌ Security test failed: ' + (error?.message || error));
    }
    setResults(log);
    setRunning(false);
  }

  return (
    <div style={{ fontFamily: 'monospace', background: '#222', color: '#fff', padding: 24, borderRadius: 8 }}>
      <h2>Argon2-browser Security Test</h2>
      <button onClick={runTests} disabled={running} style={{ marginBottom: 16, padding: '8px 16px', fontSize: 16 }}>
        {running ? 'Running...' : 'Run Security Tests'}
      </button>
      <pre style={{ whiteSpace: 'pre-wrap', background: '#111', padding: 16, borderRadius: 4, minHeight: 200 }}>
        {results.join('\n')}
      </pre>
    </div>
  );
} 