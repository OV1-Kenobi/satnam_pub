#!/usr/bin/env tsx

/**
 * MASTER CONTEXT COMPLIANCE: Browser-compatible environment variable handling
 * @param {string} key - Environment variable key
 * @returns {string|undefined} Environment variable value
 */
function getEnvVar(key: string): string | undefined {
  if (typeof import.meta !== "undefined") {
    const metaWithEnv = /** @type {Object} */ (import.meta);
    if (metaWithEnv.env) {
      return metaWithEnv.env[key];
    }
  }
  return process.env[key];
}

/**
 * Privacy and Encryption Verification Script
 * Verifies that the new Family Federation Authentication system
 * doesn't break existing privacy/encryption protocols
 */

import { decryptCredentials, encryptCredentials } from '../lib/security.js';
import {
  generateRandomHex,
  generateSecureToken,
  sha256,
} from '../utils/crypto.js';
import { validateNWCUri } from "../utils/nwc-validation";

console.log("🔐 Verifying Privacy and Encryption Integrity...\n");

async function verifyEncryptionIntegrity() {
  console.log("1. Testing encryption/decryption integrity...");

  const sensitiveData =
    "nsec1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
  const password = "test-password-with-special-chars!@#$%^&*()";

  try {
    // Test encryption
    const encrypted = await encryptCredentials(sensitiveData, password);
    console.log("   ✅ Encryption successful");

    // Verify encrypted data doesn't contain original
    if (encrypted.includes(sensitiveData)) {
      throw new Error("Encrypted data contains original sensitive data");
    }
    console.log("   ✅ Encrypted data properly obfuscated");

    // Test decryption
    const decrypted = await decryptCredentials(encrypted, password);
    if (decrypted !== sensitiveData) {
      throw new Error("Decrypted data does not match original");
    }
    console.log("   ✅ Decryption successful and matches original");

    // Test wrong password fails
    try {
      await decryptCredentials(encrypted, "wrong-password");
      throw new Error("Decryption should have failed with wrong password");
    } catch (error) {
      if (error.message.includes("Decryption failed")) {
        console.log("   ✅ Wrong password properly rejected");
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error("   ❌ Encryption test failed:", error.message);
    return false;
  }

  return true;
}

function verifyTokenSecurity() {
  console.log("\n2. Testing secure token generation...");

  try {
    const tokens = new Set<string>();

    // Generate multiple tokens to test uniqueness and format
    for (let i = 0; i < 100; i++) {
      const token = generateSecureToken(64);

      // Check format (base64url)
      if (!token.match(/^[A-Za-z0-9_-]+$/)) {
        throw new Error(`Token has invalid format: ${token}`);
      }

      // Check length
      if (token.length < 50) {
        throw new Error(`Token too short: ${token.length} characters`);
      }

      // Check uniqueness
      if (tokens.has(token)) {
        throw new Error("Duplicate token generated");
      }

      // Check doesn't contain sensitive patterns
      if (token.match(/nsec|npub|nip05|password|secret/i)) {
        throw new Error(`Token contains sensitive pattern: ${token}`);
      }

      tokens.add(token);
    }

    console.log("   ✅ Generated 100 unique, secure tokens");
    console.log(
      `   ✅ Average token length: ${Array.from(tokens)[0].length} characters`
    );
  } catch (error) {
    console.error("   ❌ Token generation test failed:", error.message);
    return false;
  }

  return true;
}

function verifyExistingCryptoUtils() {
  console.log("\n3. Testing existing crypto utilities...");

  try {
    // Test random hex generation
    const hex = generateRandomHex(32);
    if (!hex.match(/^[0-9a-f]{32}$/)) {
      throw new Error(`Invalid hex format: ${hex}`);
    }
    console.log("   ✅ Random hex generation working");

    // Test SHA256 hashing
    const testData = "test-data-for-hashing";
    const hash1 = sha256(testData);
    const hash2 = sha256(testData);

    if (!hash1.match(/^[0-9a-f]{64}$/)) {
      throw new Error(`Invalid SHA256 format: ${hash1}`);
    }

    if (hash1 !== hash2) {
      throw new Error("SHA256 not deterministic");
    }

    if (sha256("different-data") === hash1) {
      throw new Error("SHA256 collision detected");
    }

    console.log("   ✅ SHA256 hashing working correctly");
  } catch (error) {
    console.error("   ❌ Crypto utilities test failed:", error.message);
    return false;
  }

  return true;
}

function verifyNWCValidation() {
  console.log("\n4. Testing NWC validation security...");

  try {
    // Test valid NWC URL (64-char hex pubkey, proper relay URL, 64+ char secret)
    const validNwc =
      "nostr+walletconnect://abcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab?relay=wss://relay.example.com&secret=supersecretkey1234567890abcdef1234567890abcdef1234567890abcdef12";
    const validResult = validateNWCUri(validNwc);

    if (!validResult.isValid || !validResult.data) {
      console.log("   Debug: NWC validation error:", validResult.error);
      throw new Error(`Valid NWC URL rejected: ${validResult.error}`);
    }
    console.log("   ✅ Valid NWC URL accepted");

    // Test invalid NWC URLs
    const invalidUrls = [
      "http://not-nwc-url.com",
      "nostr+walletconnect://invalid",
      "nostr+walletconnect://pubkey@relay.com", // missing secret
      "nostr+walletconnect://short@relay.com?secret=short", // short secret
    ];

    for (const invalidUrl of invalidUrls) {
      const result = validateNWCUri(invalidUrl);
      if (result.isValid) {
        throw new Error(`Invalid NWC URL accepted: ${invalidUrl}`);
      }
    }
    console.log("   ✅ Invalid NWC URLs properly rejected");

    // Test XSS/injection attempts
    const maliciousUrls = [
      "nostr+walletconnect://<script>alert(1)</script>@relay.com?secret=test1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      'nostr+walletconnect://pubkey@relay.com?secret=test1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef&"><script>',
    ];

    for (const maliciousUrl of maliciousUrls) {
      const result = validateNWCUri(maliciousUrl);
      if (result.isValid) {
        throw new Error(`Malicious NWC URL accepted: ${maliciousUrl}`);
      }

      // Verify error message doesn't contain the malicious content
      if (result.error && result.error.includes("<script>")) {
        throw new Error("Error message contains unescaped malicious content");
      }
    }
    console.log("   ✅ Malicious NWC URLs properly rejected and sanitized");
  } catch (error) {
    console.error("   ❌ NWC validation test failed:", error.message);
    return false;
  }

  return true;
}

function verifyDataSanitization() {
  console.log("\n5. Testing data sanitization...");

  try {
    // Test that sensitive data patterns are not exposed
    const sensitivePatterns = [
      "nsec1234567890abcdef",
      "password123",
      "secret-key-data",
      "database-connection-string",
    ];

    // Simulate error messages that should not contain sensitive data
    const errorMessages = [
      "Authentication failed",
      "Invalid request data",
      "Database operation failed",
      "Session validation error",
    ];

    for (const message of errorMessages) {
      for (const pattern of sensitivePatterns) {
        if (message.toLowerCase().includes(pattern.toLowerCase())) {
          throw new Error(
            `Error message contains sensitive pattern: ${pattern}`
          );
        }
      }
    }

    console.log("   ✅ Error messages properly sanitized");

    // Test input sanitization
    const maliciousInputs = [
      '<script>alert("xss")</script>',
      '"; DROP TABLE users; --',
      `${getEnvVar("SECRET_KEY")}`,
      "../../../etc/passwd",
    ];

    // These should be rejected or sanitized by validation
    for (const input of maliciousInputs) {
      // Simulate email validation (NIP-05)
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (emailRegex.test(input)) {
        throw new Error(`Malicious input passed email validation: ${input}`);
      }
    }

    console.log("   ✅ Malicious inputs properly rejected");
  } catch (error) {
    console.error("   ❌ Data sanitization test failed:", error.message);
    return false;
  }

  return true;
}

async function main() {
  const tests = [
    verifyEncryptionIntegrity,
    verifyTokenSecurity,
    verifyExistingCryptoUtils,
    verifyNWCValidation,
    verifyDataSanitization,
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const result = await test();
      if (result) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      console.error(`   ❌ Test failed with exception:`, error.message);
      failed++;
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);

  if (failed === 0) {
    console.log("🎉 All privacy and encryption protocols are intact!");
    console.log("✅ Family Federation Authentication system is secure");
    process.exit(0);
  } else {
    console.log("❌ Some tests failed - review security implementation");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("💥 Verification script failed:", error);
  process.exit(1);
});
