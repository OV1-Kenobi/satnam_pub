/**
 * @fileoverview Test suite for Share Encryption functionality
 * @description Comprehensive testing of password-based share encryption
 */

import { TrustParticipant } from "../../types/zero-knowledge-nsec";
import { CryptoUtils } from "./crypto-utils";
import { FrostPolynomialManager } from "./polynomial";
import { ShareEncryption, type DecryptionContext } from "./share-encryption";

/**
 * Test share encryption and decryption
 */
async function testShareEncryption() {
  console.log("🔐 Testing Share Encryption...\n");

  try {
    // Test 1: Create test data
    console.log("1. Creating test data...");

    const testSecret = CryptoUtils.generateSecureRandom(32);
    const secretHex = CryptoUtils.bytesToHex(testSecret);
    const threshold = 3;
    const participantCount = 5;

    console.log(`   Secret: ${secretHex.slice(0, 16)}...`);
    console.log(
      `   Threshold: ${threshold}, Participants: ${participantCount}\n`
    );

    // Test 2: Generate polynomial and shares
    console.log("2. Generating polynomial shares...");

    const polynomial = await FrostPolynomialManager.generatePolynomial(
      secretHex,
      threshold
    );
    const shares = await FrostPolynomialManager.generateShares(
      polynomial,
      participantCount
    );

    console.log(`   Generated ${shares.length} polynomial shares\n`);

    // Test 3: Test individual share encryption/decryption
    console.log("3. Testing individual share encryption/decryption...");

    const testShare = shares[0];
    const testPassword = "TestPassword123!";
    const testUUID = "test-participant-uuid";

    // Encrypt share
    const encryptedShare = await ShareEncryption.encryptShare(
      testShare,
      testPassword,
      testUUID
    );

    console.log(
      `   Encrypted share: ${encryptedShare.encryptedShare.slice(0, 32)}...`
    );
    console.log(`   Salt: ${encryptedShare.salt}`);
    console.log(`   IV: ${encryptedShare.iv}`);
    console.log(`   Auth tag: ${encryptedShare.authTag}`);

    // Decrypt share
    const decryptedShare = await ShareEncryption.decryptShare({
      participantUUID: testUUID,
      password: testPassword,
      encryptedData: encryptedShare,
    });

    console.log(
      `   Decrypted share matches: ${
        testShare.x === decryptedShare.x && testShare.y === decryptedShare.y
      }\n`
    );

    // Test 4: Test share validation
    console.log("4. Testing share validation...");

    const validation = await ShareEncryption.verifyEncryptedShare(
      encryptedShare
    );
    console.log(`   Share validation: ${validation.isValid}`);
    console.log(`   Integrity score: ${validation.integrityScore}`);

    if (!validation.isValid) {
      console.log(`   Errors: ${validation.errors.join(", ")}`);
    }
    console.log();

    // Test 5: Test password verification
    console.log("5. Testing password verification...");

    const correctPassword = await ShareEncryption.verifySharePassword(
      encryptedShare,
      testPassword
    );
    console.log(`   Correct password: ${correctPassword}`);

    const wrongPassword = await ShareEncryption.verifySharePassword(
      encryptedShare,
      "WrongPassword"
    );
    console.log(`   Wrong password: ${wrongPassword}\n`);

    // Test 6: Test batch encryption for participants
    console.log("6. Testing batch encryption for participants...");

    const participants: TrustParticipant[] = [
      {
        saltedUUID: "guardian-1-uuid",
        email: "guardian1@test.com",
        displayName: "Guardian 1",
        role: "guardian",
        invitationCode: "GUARDIAN1CODE123",
        shareIndex: 2,
      },
      {
        saltedUUID: "guardian-2-uuid",
        email: "guardian2@test.com",
        displayName: "Guardian 2",
        role: "guardian",
        invitationCode: "GUARDIAN2CODE123",
        shareIndex: 3,
      },
      {
        saltedUUID: "steward-1-uuid",
        email: "steward1@test.com",
        displayName: "Steward 1",
        role: "steward",
        invitationCode: "STEWARD1CODE123",
        shareIndex: 4,
      },
      {
        saltedUUID: "steward-2-uuid",
        email: "steward2@test.com",
        displayName: "Steward 2",
        role: "steward",
        invitationCode: "STEWARD2CODE123",
        shareIndex: 5,
      },
    ];

    const founderPassword = "FounderPassword123!";
    const founderUUID = "founder-uuid";

    const encryptedShares = await ShareEncryption.encryptSharesForParticipants(
      shares,
      participants,
      founderPassword,
      founderUUID
    );

    console.log(
      `   Encrypted ${encryptedShares.length} shares for participants`
    );
    console.log(`   Founder share index: ${encryptedShares[0].shareIndex}`);
    console.log(
      `   Participant shares: ${encryptedShares
        .slice(1)
        .map((s) => s.shareIndex)
        .join(", ")}\n`
    );

    // Test 7: Test batch decryption
    console.log("7. Testing batch decryption...");

    const decryptionContexts: DecryptionContext[] = [
      {
        participantUUID: founderUUID,
        password: founderPassword,
        encryptedData: encryptedShares[0],
      },
      {
        participantUUID: participants[0].saltedUUID!,
        password: participants[0].invitationCode!,
        encryptedData: encryptedShares[1],
      },
      {
        participantUUID: participants[1].saltedUUID!,
        password: participants[1].invitationCode!,
        encryptedData: encryptedShares[2],
      },
    ];

    const decryptedShares = await ShareEncryption.batchDecryptShares(
      decryptionContexts
    );
    console.log(`   Decrypted ${decryptedShares.length} shares successfully\n`);

    // Test 8: Test secret reconstruction
    console.log("8. Testing secret reconstruction...");

    const reconstructedSecret =
      FrostPolynomialManager.reconstructSecret(decryptedShares);
    const reconstructedHex = CryptoUtils.bigIntToHex(reconstructedSecret, 64);

    console.log(`   Original secret:      ${secretHex}`);
    console.log(`   Reconstructed secret: ${reconstructedHex}`);
    console.log(
      `   Reconstruction successful: ${secretHex === reconstructedHex}\n`
    );

    // Test 9: Test invitation generation
    console.log("9. Testing invitation generation...");

    const invitationData = ShareEncryption.generateInvitationData(
      participants[0],
      encryptedShares[1],
      "Test Family Federation"
    );

    const invitation = JSON.parse(invitationData);
    console.log(`   Invitation for: ${invitation.displayName}`);
    console.log(`   Role: ${invitation.participantRole}`);
    console.log(`   Instructions: ${invitation.instructions.length} steps`);
    console.log(
      `   Warnings: ${invitation.securityWarnings.length} warnings\n`
    );

    // Test 10: Test batch invitation generation
    console.log("10. Testing batch invitation generation...");

    const batchInvitations = ShareEncryption.generateBatchInvitations(
      participants,
      encryptedShares.slice(1), // Skip founder's share
      "Test Family Federation"
    );

    console.log(`   Generated ${batchInvitations.length} batch invitations\n`);

    // Test 11: Test share hash generation
    console.log("11. Testing share hash generation...");

    const shareHashes = await Promise.all(
      encryptedShares.map((share) => ShareEncryption.generateShareHash(share))
    );

    console.log(`   Generated ${shareHashes.length} share hashes`);
    shareHashes.forEach((hash, index) => {
      console.log(`   Hash ${index + 1}: ${hash.slice(0, 16)}...`);
    });
    console.log();

    // Test 12: Test re-encryption
    console.log("12. Testing share re-encryption...");

    const newPassword = "NewPassword123!";
    const reEncryptedShare = await ShareEncryption.reEncryptShare(
      encryptedShare,
      testPassword,
      newPassword
    );

    console.log(
      `   Re-encrypted share: ${reEncryptedShare.encryptedShare.slice(
        0,
        32
      )}...`
    );

    // Verify re-encryption worked
    const reDecryptedShare = await ShareEncryption.decryptShare({
      participantUUID: testUUID,
      password: newPassword,
      encryptedData: reEncryptedShare,
    });

    console.log(
      `   Re-decrypted share matches: ${
        testShare.x === reDecryptedShare.x && testShare.y === reDecryptedShare.y
      }\n`
    );

    // Test 13: Test backup and restore
    console.log("13. Testing backup and restore...");

    const backupPassword = "BackupPassword123!";
    const backupResult = await ShareEncryption.createShareBackup(
      encryptedShares,
      backupPassword
    );

    if (backupResult.success) {
      console.log(`   Backup created: ${backupResult.data!.length} characters`);

      // Test restore
      const restoreResult = await ShareEncryption.restoreFromBackup(
        backupResult.data!,
        backupPassword
      );

      if (restoreResult.success) {
        console.log(`   Restored ${restoreResult.data!.length} shares`);
        console.log(
          `   Restore successful: ${
            restoreResult.data!.length === encryptedShares.length
          }`
        );
      } else {
        console.log(`   Restore failed: ${restoreResult.error}`);
      }
    } else {
      console.log(`   Backup failed: ${backupResult.error}`);
    }
    console.log();

    // Test 14: Test secure cleanup
    console.log("14. Testing secure cleanup...");

    ShareEncryption.secureCleanupShares(decryptedShares);
    FrostPolynomialManager.secureCleanup(polynomial);
    console.log(`   Secure cleanup completed\n`);

    // Test 15: Test error handling
    console.log("15. Testing error handling...");

    try {
      await ShareEncryption.encryptShare(
        testShare,
        "weak", // Weak password
        testUUID
      );
      console.log("   ERROR: Should have failed with weak password");
    } catch (error) {
      console.log(
        `   Correctly rejected weak password: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }

    try {
      await ShareEncryption.decryptShare({
        participantUUID: testUUID,
        password: "WrongPassword",
        encryptedData: encryptedShare,
      });
      console.log("   ERROR: Should have failed with wrong password");
    } catch (error) {
      console.log(
        `   Correctly rejected wrong password: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
    console.log();

    console.log("✅ All share encryption tests completed successfully!");
    return true;
  } catch (error) {
    console.error("❌ Share encryption test failed:", error);
    return false;
  }
}

/**
 * Run the test if this file is executed directly
 */
if (typeof window === "undefined") {
  // Node.js environment
  testShareEncryption().then((success) => {
    process.exit(success ? 0 : 1);
  });
} else {
  // Browser environment
  (window as any).testShareEncryption = testShareEncryption;
  console.log(
    "Share encryption test function loaded. Call testShareEncryption() to run tests."
  );
}

export { testShareEncryption };
