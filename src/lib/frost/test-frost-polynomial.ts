/**
 * @fileoverview Test script for FROST Polynomial implementation
 * @description Verification of polynomial secret sharing operations
 */

import { CryptoUtils } from "./crypto-utils";
import { FrostPolynomialManager } from "./polynomial";

/**
 * Test FROST polynomial secret sharing
 */
async function testFrostPolynomial() {
  console.log("🧪 Testing FROST Polynomial Secret Sharing...\n");

  try {
    // Test 1: Generate a secret
    console.log("1. Generating test secret...");
    const testSecret = CryptoUtils.generateSecureRandom(32);
    const secretHex = CryptoUtils.bytesToHex(testSecret);
    console.log(`   Secret: ${secretHex}\n`);

    // Test 2: Create polynomial
    console.log("2. Creating FROST polynomial...");
    const threshold = 3;
    const participantCount = 5;

    const polynomial = await FrostPolynomialManager.generatePolynomial(
      secretHex,
      threshold
    );
    console.log(
      `   Polynomial created with ${polynomial.coefficients.length} coefficients`
    );
    console.log(`   Threshold: ${polynomial.threshold}\n`);

    // Test 3: Generate shares
    console.log("3. Generating shares...");
    const shares = await FrostPolynomialManager.generateShares(
      polynomial,
      participantCount
    );
    console.log(`   Generated ${shares.length} shares`);
    shares.forEach((share, index) => {
      console.log(
        `   Share ${index + 1}: x=${share.x}, y=${share.y
          .toString(16)
          .slice(0, 16)}...`
      );
    });
    console.log();

    // Test 4: Verify shares
    console.log("4. Verifying shares...");
    for (let i = 0; i < shares.length; i++) {
      const isValid = await FrostPolynomialManager.verifyShare(shares[i]);
      console.log(`   Share ${i + 1} valid: ${isValid}`);
    }
    console.log();

    // Test 5: Test reconstruction with minimum threshold
    console.log("5. Testing reconstruction with minimum threshold...");
    const reconstructionShares = shares.slice(0, threshold);
    const reconstructedSecret =
      FrostPolynomialManager.reconstructSecret(reconstructionShares);
    const reconstructedHex = CryptoUtils.bigIntToHex(reconstructedSecret, 64);

    console.log(`   Original secret:      ${secretHex}`);
    console.log(`   Reconstructed secret: ${reconstructedHex}`);
    console.log(
      `   Reconstruction successful: ${secretHex === reconstructedHex}\n`
    );

    // Test 6: Test reconstruction with more than threshold
    console.log("6. Testing reconstruction with extra shares...");
    const extraReconstructionShares = shares.slice(0, threshold + 1);
    const extraReconstructedSecret = FrostPolynomialManager.reconstructSecret(
      extraReconstructionShares
    );
    const extraReconstructedHex = CryptoUtils.bigIntToHex(
      extraReconstructedSecret,
      64
    );

    console.log(
      `   With ${extraReconstructionShares.length} shares: ${
        secretHex === extraReconstructedHex
      }`
    );
    console.log();

    // Test 7: Test threshold validation
    console.log("7. Testing threshold validation...");
    const validationResults = [
      FrostPolynomialManager.validateThreshold(2, 3),
      FrostPolynomialManager.validateThreshold(3, 3),
      FrostPolynomialManager.validateThreshold(4, 3),
      FrostPolynomialManager.validateThreshold(0, 3),
      FrostPolynomialManager.validateThreshold(3, 8),
    ];

    validationResults.forEach((result, index) => {
      console.log(
        `   Test ${index + 1}: ${result.isValid ? "VALID" : "INVALID"}`
      );
      if (!result.isValid) {
        console.log(`     Errors: ${result.errors.join(", ")}`);
      }
    });
    console.log();

    // Test 8: Test verification data generation
    console.log("8. Testing verification data generation...");
    const verificationData =
      await FrostPolynomialManager.generateVerificationData(shares);
    console.log(
      `   Verification data generated: ${verificationData.length} characters`
    );
    console.log();

    // Test 9: Test share proof generation
    console.log("9. Testing share proof generation...");
    const shareProof = await FrostPolynomialManager.generateShareProof(shares);
    const proofVerification = await FrostPolynomialManager.verifyShareProof(
      shareProof,
      shares
    );
    console.log(`   Share proof generated: ${shareProof.slice(0, 16)}...`);
    console.log(`   Proof verification: ${proofVerification}\n`);

    // Test 10: Test secure cleanup
    console.log("10. Testing secure cleanup...");
    FrostPolynomialManager.secureCleanup(polynomial);
    console.log(`    Polynomial data securely wiped\n`);

    console.log("✅ All FROST polynomial tests completed successfully!");
    return true;
  } catch (error) {
    console.error("❌ FROST polynomial test failed:", error);
    return false;
  }
}

/**
 * Run the test if this file is executed directly
 */
if (typeof window === "undefined") {
  // Node.js environment
  testFrostPolynomial().then((success) => {
    process.exit(success ? 0 : 1);
  });
} else {
  // Browser environment
  (window as any).testFrostPolynomial = testFrostPolynomial;
  console.log(
    "FROST polynomial test function loaded. Call testFrostPolynomial() to run tests."
  );
}

export { testFrostPolynomial };
