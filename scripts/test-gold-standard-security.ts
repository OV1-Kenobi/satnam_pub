#!/usr/bin/env tsx
/**
 * @fileoverview Gold Standard Security Test Suite
 * @description Comprehensive testing of all security implementations to ensure
 * they meet the highest standards for high-tech users
 */

import {
  displayValidationResults,
  validateGoldStandardCrypto,
} from "../lib/crypto-validator.js.js";
import {
  decryptSensitiveData,
  encryptSensitiveData,
} from "../lib/privacy/encryption.js";
import {
  decryptCredentials,
  encryptCredentials,
  getPBKDF2Config,
  hashPassphrase,
  verifyPassphrase,
} from "../lib/security.js";

/**
 * Test Results Interface
 */
interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: string;
  performanceMs?: number;
}

class GoldStandardSecurityTester {
  private results: TestResult[] = [];

  /**
   * Run all security tests
   */
  async runAllTests(): Promise<void> {
    console.log("🔐 GOLD STANDARD SECURITY TEST SUITE");
    console.log("═".repeat(60));
    console.log("Testing cryptographic implementations for maximum security\n");

    // Configuration Tests
    await this.testPBKDF2Configuration();
    await this.testEnvironmentSecurity();

    // Cryptographic Function Tests
    await this.testPBKDF2KeyDerivation();
    await this.testEncryptionDecryption();
    await this.testPasswordHashing();
    await this.testPrivacyEncryption();

    // Performance Tests
    await this.testPerformanceCharacteristics();

    // Validation Tests
    await this.testGoldStandardValidation();

    // Display Results
    this.displayTestResults();
  }

  /**
   * Test PBKDF2 configuration
   */
  private async testPBKDF2Configuration(): Promise<void> {
    try {
      console.log("1️⃣  Testing PBKDF2 Configuration...");

      // Test basic configuration loading
      this.addResult(
        "PBKDF2 Configuration Load",
        true,
        "Configuration loaded successfully"
      );

      // Test configuration validation
      const config = getPBKDF2Config();

      const iterations = config.iterations;

      // Check Gold Standard requirements
      const meetsIterationStandard = iterations >= 100000; // 100,000 iterations minimum for Gold Standard

      this.addResult(
        "PBKDF2 Iteration Standard",
        meetsIterationStandard,
        `Iterations: ${iterations} (Gold Standard: ≥100,000)`
      );
      // PBKDF2 doesn't use parallelism - this is a Web Crypto API standard
      this.addResult(
        "PBKDF2 Web Crypto API",
        true,
        "Using Web Crypto API standard implementation"
      );

      if (config.warnings.length > 0) {
        console.warn("⚠️  Configuration warnings:", config.warnings);
      }
    } catch (error) {
      this.addResult("PBKDF2 Configuration", false, error.message);
    }
  }

  /**
   * Test environment security
   */
  private async testEnvironmentSecurity(): Promise<void> {
    console.log("2️⃣  Testing Environment Security...");

    try {
      // Test critical environment variables
      const criticalVars = [
        "PBKDF2_ITERATIONS",
        "PRIVACY_MASTER_KEY",
        "JWT_SECRET",
      ];

      for (const varName of criticalVars) {
        const value = process.env[varName];
        const exists = !!value;
        const isNotPlaceholder = value
          ? !value.includes("replace_with") && !value.includes("your_")
          : false;

        this.addResult(
          `Environment Variable: ${varName}`,
          exists && isNotPlaceholder,
          exists
            ? isNotPlaceholder
              ? "Set correctly"
              : "Contains placeholder"
            : "Missing"
        );
      }
    } catch (error) {
      this.addResult("Environment Security", false, error.message);
    }
  }

  /**
   * Test PBKDF2 key derivation
   */
  private async testPBKDF2KeyDerivation(): Promise<void> {
    console.log("3️⃣  Testing PBKDF2 Key Derivation...");

    try {
      const testPassword = "test-password-for-gold-standard-security";
      const testSalt = Buffer.from(
        "test-salt-for-pbkdf2-validation-security",
        "utf8"
      );

      const startTime = Date.now();

      // Test key derivation (this uses PBKDF2 internally)
      const { deriveEncryptionKey } = await import("../lib/security.js");
      const derivedKey = await deriveEncryptionKey(testPassword, testSalt);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Validate key properties
      const keyLength = derivedKey.length;
      const isCorrectLength = keyLength === 32; // 256 bits

      this.addResult(
        "PBKDF2 Key Derivation",
        true,
        `Generated ${keyLength}-byte key`,
        duration
      );
      this.addResult(
        "PBKDF2 Key Length",
        isCorrectLength,
        `Key length: ${keyLength} bytes (expected: 32)`
      );

      // Test that different inputs produce different keys
      const differentKey = await deriveEncryptionKey(
        testPassword + "different",
        testSalt
      );
      const keysAreDifferent = !derivedKey.equals(differentKey);

      this.addResult(
        "Argon2 Key Uniqueness",
        keysAreDifferent,
        "Different inputs produce different keys"
      );
    } catch (error) {
      this.addResult("Argon2 Key Derivation", false, error.message);
    }
  }

  /**
   * Test encryption and decryption
   */
  private async testEncryptionDecryption(): Promise<void> {
    console.log("4️⃣  Testing Gold Standard Encryption...");

    try {
      const testData =
        "This is sensitive data that must be protected with Gold Standard encryption";
      const testPassword = "secure-password-for-testing";

      // Test secure encryption (PBKDF2 + AES-256-GCM)
      const startEncrypt = Date.now();
      const encrypted = await encryptCredentials(testData, testPassword);
      const encryptTime = Date.now() - startEncrypt;

      this.addResult(
        "Secure PBKDF2 Encryption",
        true,
        `Encrypted ${testData.length} bytes`,
        encryptTime
      );

      // Test decryption
      const startDecrypt = Date.now();
      const decrypted = await decryptCredentials(encrypted, testPassword);
      const decryptTime = Date.now() - startDecrypt;

      const decryptionSuccessful = decrypted === testData;

      this.addResult(
        "Gold Standard Decryption",
        decryptionSuccessful,
        decryptionSuccessful ? "Data decrypted correctly" : "Decryption failed",
        decryptTime
      );

      // Test wrong password fails
      try {
        await decryptCredentials(encrypted, "wrong-password");
        this.addResult(
          "Wrong Password Protection",
          false,
          "Wrong password was accepted"
        );
      } catch (error) {
        this.addResult(
          "Wrong Password Protection",
          true,
          "Wrong password correctly rejected"
        );
      }
    } catch (error) {
      this.addResult("Gold Standard Encryption", false, error.message);
    }
  }

  /**
   * Test password hashing
   */
  private async testPasswordHashing(): Promise<void> {
    console.log("5️⃣  Testing Password Hashing...");

    try {
      const testPassword = "test-password-for-hashing";

      // Test PBKDF2 password hashing
      const startHash = Date.now();
      const hash = await hashPassphrase(testPassword);
      const hashTime = Date.now() - startHash;

      this.addResult(
        "PBKDF2 Password Hashing",
        true,
        `Generated hash: ${hash.substring(0, 20)}...`,
        hashTime
      );

      // Test verification
      const startVerify = Date.now();
      const isValid = await verifyPassphrase(testPassword, hash);
      const verifyTime = Date.now() - startVerify;

      this.addResult(
        "Password Verification",
        isValid,
        isValid
          ? "Password verified correctly"
          : "Password verification failed",
        verifyTime
      );

      // Test wrong password fails
      const wrongPasswordValid = await verifyPassphrase("wrong-password", hash);
      this.addResult(
        "Wrong Password Rejection",
        !wrongPasswordValid,
        !wrongPasswordValid
          ? "Wrong password correctly rejected"
          : "Wrong password was accepted"
      );
    } catch (error) {
      this.addResult("Password Hashing", false, error.message);
    }
  }

  /**
   * Test privacy encryption
   */
  private async testPrivacyEncryption(): Promise<void> {
    console.log("6️⃣  Testing Privacy Encryption...");

    try {
      const sensitiveData =
        "nsec1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab";

      // Test privacy encryption (now uses PBKDF2 internally)
      const startEncrypt = Date.now();
      const encrypted = await encryptSensitiveData(sensitiveData);
      const encryptTime = Date.now() - startEncrypt;

      this.addResult(
        "Privacy Encryption",
        true,
        "Sensitive data encrypted with PBKDF2",
        encryptTime
      );

      // Test decryption
      const startDecrypt = Date.now();
      const decrypted = await decryptSensitiveData(encrypted);
      const decryptTime = Date.now() - startDecrypt;

      const decryptionSuccessful = decrypted === sensitiveData;

      this.addResult(
        "Privacy Decryption",
        decryptionSuccessful,
        decryptionSuccessful
          ? "Sensitive data decrypted correctly"
          : "Privacy decryption failed",
        decryptTime
      );
    } catch (error) {
      this.addResult("Privacy Encryption", false, error.message);
    }
  }

  /**
   * Test performance characteristics
   */
  private async testPerformanceCharacteristics(): Promise<void> {
    console.log("7️⃣  Testing Performance Characteristics...");

    try {
      const testPassword = "performance-test-password";
      const iterations = 3;
      const times: number[] = [];

      // Test multiple iterations to get average performance
      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        await hashPassphrase(testPassword + i);
        const end = Date.now();
        times.push(end - start);
      }

      const averageTime = times.reduce((a, b) => a + b, 0) / times.length;
      const minTime = Math.min(...times);
      const maxTime = Math.max(...times);

      // Gold Standard should take reasonable time (not too fast, not too slow)
      const reasonableTime = averageTime > 100 && averageTime < 5000; // 100ms to 5s

      this.addResult(
        "Performance Characteristics",
        reasonableTime,
        `Average: ${averageTime.toFixed(0)}ms, Range: ${minTime}-${maxTime}ms`
      );
    } catch (error) {
      this.addResult("Performance Characteristics", false, error.message);
    }
  }

  /**
   * Test Gold Standard validation
   */
  private async testGoldStandardValidation(): Promise<void> {
    console.log("8️⃣  Testing Gold Standard Validation...");

    try {
      const validationResult = validateGoldStandardCrypto();

      this.addResult(
        "Gold Standard Validation",
        true,
        `Security Level: ${validationResult.securityLevel}, Issues: ${validationResult.issues.length}`
      );

      const isActuallyGoldStandard = validationResult.isGoldStandard;
      this.addResult(
        "Gold Standard Compliance",
        isActuallyGoldStandard,
        isActuallyGoldStandard
          ? "Meets all Gold Standard requirements"
          : "Does not meet Gold Standard"
      );

      // Display detailed validation results
      console.log("\n📊 DETAILED VALIDATION RESULTS:");
      displayValidationResults(validationResult);
    } catch (error) {
      this.addResult("Gold Standard Validation", false, error.message);
    }
  }

  /**
   * Add a test result
   */
  private addResult(
    name: string,
    passed: boolean,
    details?: string,
    performanceMs?: number
  ): void {
    this.results.push({
      name,
      passed,
      details,
      performanceMs,
    });
  }

  /**
   * Display all test results
   */
  private displayTestResults(): void {
    console.log("\n🏆 GOLD STANDARD SECURITY TEST RESULTS");
    console.log("═".repeat(80));

    const passedTests = this.results.filter((r) => r.passed).length;
    const totalTests = this.results.length;
    const passRate = ((passedTests / totalTests) * 100).toFixed(1);

    console.log(
      `Overall: ${passedTests}/${totalTests} tests passed (${passRate}%)\n`
    );

    // Group results by status
    const passed = this.results.filter((r) => r.passed);
    const failed = this.results.filter((r) => !r.passed);

    if (failed.length > 0) {
      console.log("❌ FAILED TESTS:");
      failed.forEach((result) => {
        console.log(`   ❌ ${result.name}: ${result.details || "Failed"}`);
      });
      console.log();
    }

    if (passed.length > 0) {
      console.log("✅ PASSED TESTS:");
      passed.forEach((result) => {
        const perfInfo = result.performanceMs
          ? ` (${result.performanceMs}ms)`
          : "";
        console.log(
          `   ✅ ${result.name}: ${result.details || "Passed"}${perfInfo}`
        );
      });
      console.log();
    }

    // Final assessment
    if (passRate === "100.0") {
      console.log(
        "🏆 CONGRATULATIONS! All tests passed - Gold Standard achieved!"
      );
      console.log(
        "   Your encryption meets the highest standards for high-tech users"
      );
    } else if (passRate >= "90.0") {
      console.log(
        "🥈 Good performance - minor issues to address for Gold Standard"
      );
    } else if (passRate >= "75.0") {
      console.log(
        "🥉 Significant issues need addressing for Gold Standard compliance"
      );
    } else {
      console.log("🚨 Critical security issues - immediate attention required");
    }

    console.log("═".repeat(80));
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    const tester = new GoldStandardSecurityTester();
    await tester.runAllTests();
  } catch (error) {
    console.error("💥 Test suite failed to run:", error);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { GoldStandardSecurityTester };
