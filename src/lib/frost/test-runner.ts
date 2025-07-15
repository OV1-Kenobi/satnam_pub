/**
 * @fileoverview FROST Test Suite Runner
 * @description Comprehensive test runner for all FROST components
 */

import { testFrostPolynomial } from "./test-frost-polynomial";
import { testFrostIntegration } from "./test-integration";
import { testShareEncryption } from "./test-share-encryption";

/**
 * Test suite configuration
 */
interface TestSuite {
  name: string;
  description: string;
  testFunction: () => Promise<boolean>;
  critical: boolean;
}

/**
 * Test result summary
 */
interface TestResults {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  criticalFailures: number;
  testDetails: Array<{
    name: string;
    passed: boolean;
    critical: boolean;
    error?: string;
  }>;
}

/**
 * Run all FROST tests
 */
async function runAllFrostTests(): Promise<TestResults> {
  console.log("🧪 Starting FROST Test Suite...\n");
  console.log("=".repeat(60));

  const testSuites: TestSuite[] = [
    {
      name: "FROST Polynomial",
      description: "Test polynomial secret sharing and reconstruction",
      testFunction: testFrostPolynomial,
      critical: true,
    },
    {
      name: "Share Encryption",
      description: "Test secure share encryption and decryption",
      testFunction: testShareEncryption,
      critical: true,
    },
    {
      name: "Integration Tests",
      description: "Test complete FROST integration flow",
      testFunction: testFrostIntegration,
      critical: true,
    },
  ];

  const results: TestResults = {
    totalTests: testSuites.length,
    passedTests: 0,
    failedTests: 0,
    criticalFailures: 0,
    testDetails: [],
  };

  for (const suite of testSuites) {
    console.log(`\n🔍 Running ${suite.name} Tests...`);
    console.log(`📋 ${suite.description}`);
    console.log("-".repeat(50));

    try {
      const startTime = Date.now();
      const passed = await suite.testFunction();
      const endTime = Date.now();
      const duration = endTime - startTime;

      if (passed) {
        console.log(`✅ ${suite.name} tests PASSED (${duration}ms)`);
        results.passedTests++;
      } else {
        console.log(`❌ ${suite.name} tests FAILED (${duration}ms)`);
        results.failedTests++;
        if (suite.critical) {
          results.criticalFailures++;
        }
      }

      results.testDetails.push({
        name: suite.name,
        passed,
        critical: suite.critical,
      });
    } catch (error) {
      console.error(`💥 ${suite.name} tests threw an exception:`, error);
      results.failedTests++;
      if (suite.critical) {
        results.criticalFailures++;
      }

      results.testDetails.push({
        name: suite.name,
        passed: false,
        critical: suite.critical,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    console.log("-".repeat(50));
  }

  return results;
}

/**
 * Print test summary
 */
function printTestSummary(results: TestResults): void {
  console.log("\n" + "=".repeat(60));
  console.log("📊 FROST Test Suite Summary");
  console.log("=".repeat(60));

  console.log(`🧪 Total Tests: ${results.totalTests}`);
  console.log(`✅ Passed: ${results.passedTests}`);
  console.log(`❌ Failed: ${results.failedTests}`);
  console.log(`🚨 Critical Failures: ${results.criticalFailures}`);

  const successRate = Math.round(
    (results.passedTests / results.totalTests) * 100
  );
  console.log(`📈 Success Rate: ${successRate}%`);

  if (results.testDetails.length > 0) {
    console.log("\n📋 Test Details:");
    results.testDetails.forEach((test) => {
      const icon = test.passed ? "✅" : "❌";
      const critical = test.critical ? "🚨" : "⚠️";
      console.log(
        `  ${icon} ${test.name} ${
          !test.passed && test.critical ? critical : ""
        }`
      );
      if (test.error) {
        console.log(`    Error: ${test.error}`);
      }
    });
  }

  console.log("\n" + "=".repeat(60));

  if (results.criticalFailures > 0) {
    console.log(
      "🚨 CRITICAL FAILURES DETECTED - FROST implementation may not be secure!"
    );
  } else if (results.failedTests > 0) {
    console.log(
      "⚠️  Some tests failed - Review implementation before production use"
    );
  } else {
    console.log(
      "🎉 All tests passed - FROST implementation is ready for production!"
    );
  }

  console.log("=".repeat(60));
}

/**
 * Run quick smoke tests
 */
async function runSmokeTests(): Promise<boolean> {
  console.log("🚀 Running FROST Smoke Tests...\n");

  try {
    // Quick polynomial test
    console.log("1. Testing polynomial generation...");
    const { FrostPolynomialManager } = await import("./polynomial");
    const { CryptoUtils } = await import("./crypto-utils");

    const secret = CryptoUtils.bytesToHex(CryptoUtils.generateSecureRandom(32));
    const polynomial = await FrostPolynomialManager.generatePolynomial(
      secret,
      3
    );
    const shares = await FrostPolynomialManager.generateShares(polynomial, 5);
    const reconstructed = FrostPolynomialManager.reconstructSecret(
      shares.slice(0, 3)
    );
    const reconstructedHex = CryptoUtils.bigIntToHex(reconstructed, 64);

    if (secret !== reconstructedHex) {
      console.log("❌ Polynomial smoke test failed");
      return false;
    }
    console.log("✅ Polynomial smoke test passed");

    // Quick encryption test
    console.log("2. Testing share encryption...");
    const { ShareEncryption } = await import("./share-encryption");

    const testShare = shares[0];
    const password = "TestPassword123!";
    const uuid = "test-uuid";

    const encrypted = await ShareEncryption.encryptShare(
      testShare,
      password,
      uuid
    );
    const decrypted = await ShareEncryption.decryptShare({
      participantUUID: uuid,
      password,
      encryptedData: encrypted,
    });

    if (testShare.x !== decrypted.x || testShare.y !== decrypted.y) {
      console.log("❌ Encryption smoke test failed");
      return false;
    }
    console.log("✅ Encryption smoke test passed");

    console.log("\n🎉 All smoke tests passed!");
    return true;
  } catch (error) {
    console.error("❌ Smoke tests failed:", error);
    return false;
  }
}

/**
 * Performance benchmark
 */
async function runPerformanceBenchmark(): Promise<void> {
  console.log("⚡ Running FROST Performance Benchmark...\n");

  try {
    const { FrostPolynomialManager } = await import("./polynomial");
    const { ShareEncryption } = await import("./share-encryption");
    const { CryptoUtils } = await import("./crypto-utils");

    const iterations = 10;
    const thresholds = [3, 5, 7];
    const participantCounts = [5, 10, 15];

    for (const threshold of thresholds) {
      for (const participants of participantCounts) {
        if (threshold <= participants) {
          console.log(
            `📊 Testing ${threshold}/${participants} configuration...`
          );

          let totalTime = 0;
          let totalEncryptionTime = 0;
          let totalDecryptionTime = 0;

          for (let i = 0; i < iterations; i++) {
            // Polynomial operations
            const startTime = Date.now();

            const secret = CryptoUtils.bytesToHex(
              CryptoUtils.generateSecureRandom(32)
            );
            const polynomial = await FrostPolynomialManager.generatePolynomial(
              secret,
              threshold
            );
            const shares = await FrostPolynomialManager.generateShares(
              polynomial,
              participants
            );

            const polynomialTime = Date.now();

            // Encryption operations
            const encryptionPromises = shares
              .slice(0, 3)
              .map((share) =>
                ShareEncryption.encryptShare(
                  share,
                  "TestPassword123!",
                  `uuid-${i}`
                )
              );
            const encryptedShares = await Promise.all(encryptionPromises);

            const encryptionTime = Date.now();

            // Decryption operations
            const decryptionPromises = encryptedShares.map((encrypted) =>
              ShareEncryption.decryptShare({
                participantUUID: encrypted.participantUUID,
                password: "TestPassword123!",
                encryptedData: encrypted,
              })
            );
            await Promise.all(decryptionPromises);

            const endTime = Date.now();

            totalTime += polynomialTime - startTime;
            totalEncryptionTime += encryptionTime - polynomialTime;
            totalDecryptionTime += endTime - encryptionTime;
          }

          const avgPolynomial = Math.round(totalTime / iterations);
          const avgEncryption = Math.round(totalEncryptionTime / iterations);
          const avgDecryption = Math.round(totalDecryptionTime / iterations);

          console.log(`   Polynomial generation: ${avgPolynomial}ms`);
          console.log(`   Share encryption: ${avgEncryption}ms`);
          console.log(`   Share decryption: ${avgDecryption}ms`);
          console.log(
            `   Total: ${avgPolynomial + avgEncryption + avgDecryption}ms\n`
          );
        }
      }
    }

    console.log("✅ Performance benchmark completed");
  } catch (error) {
    console.error("❌ Performance benchmark failed:", error);
  }
}

/**
 * Main test execution
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const mode = args[0] || "full";

  try {
    switch (mode) {
      case "smoke":
        const smokeResult = await runSmokeTests();
        process.exit(smokeResult ? 0 : 1);

      case "performance":
        await runPerformanceBenchmark();
        process.exit(0);

      case "full":
      default:
        const results = await runAllFrostTests();
        printTestSummary(results);
        process.exit(results.criticalFailures > 0 ? 1 : 0);
    }
  } catch (error) {
    console.error("💥 Test runner failed:", error);
    process.exit(1);
  }
}

// Browser environment support
if (typeof window !== "undefined") {
  (window as any).runFrostTests = runAllFrostTests;
  (window as any).runSmokeTests = runSmokeTests;
  (window as any).runPerformanceBenchmark = runPerformanceBenchmark;
  console.log("FROST test functions loaded. Available functions:");
  console.log("- runFrostTests()");
  console.log("- runSmokeTests()");
  console.log("- runPerformanceBenchmark()");
}

// Node.js environment
if (typeof window === "undefined") {
  main();
}

export {
  runAllFrostTests,
  runPerformanceBenchmark,
  runSmokeTests,
  type TestResults,
};
