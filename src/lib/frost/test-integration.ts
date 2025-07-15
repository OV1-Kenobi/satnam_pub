/**
 * @fileoverview Integration test for FROST polynomial and zero-knowledge nsec
 * @description Test complete flow from federation creation to emergency recovery
 */

import {
  FederationConfig,
  RecoveryContext,
} from "../../types/zero-knowledge-nsec";
import { CryptoUtils } from "./crypto-utils";
import { ZeroKnowledgeNsecManager } from "./zero-knowledge-nsec";

/**
 * Test complete FROST integration flow
 */
async function testFrostIntegration() {
  console.log("🔐 Testing FROST Integration...\n");

  try {
    // Step 1: Create test federation configuration
    console.log("1. Creating test federation configuration...");

    const federationConfig: FederationConfig = {
      federationName: "Test Family Federation",
      federationId: "test-federation-" + Date.now(),
      founder: {
        saltedUUID: await CryptoUtils.generateSaltedUUID(),
        displayName: "Test Founder",
        email: "founder@test.com",
        retainGuardianStatus: true,
        founderPassword: "SecureFounderPassword123!",
      },
      guardians: [
        {
          saltedUUID: await CryptoUtils.generateSaltedUUID(),
          email: "guardian1@test.com",
          displayName: "Guardian 1",
          role: "guardian",
          invitationCode: CryptoUtils.generateInvitationCode(),
          shareIndex: 2,
        },
        {
          saltedUUID: await CryptoUtils.generateSaltedUUID(),
          email: "guardian2@test.com",
          displayName: "Guardian 2",
          role: "guardian",
          invitationCode: CryptoUtils.generateInvitationCode(),
          shareIndex: 3,
        },
      ],
      stewards: [
        {
          saltedUUID: await CryptoUtils.generateSaltedUUID(),
          email: "steward1@test.com",
          displayName: "Steward 1",
          role: "steward",
          invitationCode: CryptoUtils.generateInvitationCode(),
          shareIndex: 4,
        },
        {
          saltedUUID: await CryptoUtils.generateSaltedUUID(),
          email: "steward2@test.com",
          displayName: "Steward 2",
          role: "steward",
          invitationCode: CryptoUtils.generateInvitationCode(),
          shareIndex: 5,
        },
      ],
      thresholdConfig: {
        guardianThreshold: 2,
        stewardThreshold: 2,
        emergencyThreshold: 3,
        accountCreationThreshold: 2,
      },
      nsecRecoveryInstructions: "Encrypted recovery instructions",
    };

    console.log(
      `   Federation configured with ${federationConfig.guardians.length} guardians and ${federationConfig.stewards.length} stewards`
    );
    console.log(
      `   Emergency threshold: ${federationConfig.thresholdConfig.emergencyThreshold}\n`
    );

    // Step 2: Generate family federation keys
    console.log("2. Generating family federation keys...");

    const zkNsecManager = ZeroKnowledgeNsecManager.getInstance();
    const generationResult = await zkNsecManager.generateFamilyFederationKeys(
      federationConfig
    );

    if (!generationResult.success) {
      throw new Error(`Key generation failed: ${generationResult.error}`);
    }

    const { publicKey, frostShares, recoveryInstructions, verificationData } =
      generationResult.data!;
    console.log(`   Generated public key: ${publicKey}`);
    console.log(`   Generated ${frostShares.length} encrypted shares`);
    console.log(`   Recovery instructions and verification data created\n`);

    // Step 3: Simulate share distribution and collection
    console.log("3. Simulating share decryption for emergency recovery...");

    const decryptedShares = [];

    // Decrypt founder's share
    const founderShare = frostShares[0];
    const founderDecryption = await CryptoUtils.decryptSecureShare(
      founderShare,
      federationConfig.founder.founderPassword
    );

    if (founderDecryption.success) {
      decryptedShares.push({
        participantUUID: founderShare.participantUUID,
        decryptedShare: founderDecryption.data!,
        shareIndex: founderShare.shareIndex,
      });
      console.log(
        `   Founder share decrypted (index: ${founderShare.shareIndex})`
      );
    }

    // Decrypt guardian shares
    for (let i = 0; i < federationConfig.guardians.length; i++) {
      const guardian = federationConfig.guardians[i];
      const guardianShare = frostShares.find(
        (s) => s.participantUUID === guardian.saltedUUID
      );

      if (guardianShare && guardian.invitationCode) {
        const guardianDecryption = await CryptoUtils.decryptSecureShare(
          guardianShare,
          guardian.invitationCode
        );

        if (guardianDecryption.success) {
          decryptedShares.push({
            participantUUID: guardianShare.participantUUID,
            decryptedShare: guardianDecryption.data!,
            shareIndex: guardianShare.shareIndex,
          });
          console.log(
            `   Guardian ${i + 1} share decrypted (index: ${
              guardianShare.shareIndex
            })`
          );
        }
      }
    }

    console.log(`   Total decrypted shares: ${decryptedShares.length}`);
    console.log(
      `   Required threshold: ${federationConfig.thresholdConfig.emergencyThreshold}\n`
    );

    // Step 4: Test emergency recovery
    console.log("4. Testing emergency nsec reconstruction...");

    const recoveryContext: RecoveryContext = {
      federationId: federationConfig.federationId,
      publicKey: publicKey,
      requiredThreshold: federationConfig.thresholdConfig.emergencyThreshold,
      participantShares: decryptedShares,
      emergencyType: "standard",
    };

    const recoveryResult = await zkNsecManager.reconstructNsecFromShares(
      recoveryContext
    );

    if (!recoveryResult.success) {
      throw new Error(`Recovery failed: ${recoveryResult.error}`);
    }

    console.log(
      `   Emergency reconstruction successful: ${recoveryResult.success}`
    );
    console.log(
      `   Reconstructed public key: ${recoveryResult.data!.publicKey}`
    );
    console.log(
      `   Public key match: ${recoveryResult.data!.publicKey === publicKey}\n`
    );

    // Step 5: Test share validation
    console.log("5. Testing share validation...");

    for (let i = 0; i < Math.min(3, frostShares.length); i++) {
      const share = frostShares[i];
      const validation = await zkNsecManager.validateSecureShare(share);
      console.log(
        `   Share ${i + 1} validation: ${validation.isValid} (score: ${
          validation.integrityScore
        })`
      );

      if (!validation.isValid) {
        console.log(`     Errors: ${validation.errors.join(", ")}`);
      }
    }
    console.log();

    // Step 6: Test ZK nsec integrity
    console.log("6. Testing ZK nsec integrity...");

    const integrityCheck = await zkNsecManager.verifyZkNsecIntegrity({
      publicKey,
      recoveryInstructions,
      verificationData,
    });
    console.log(`   ZK nsec integrity: ${integrityCheck}\n`);

    // Step 7: Test invitation generation
    console.log("7. Testing invitation generation...");

    const invitationResult = await zkNsecManager.generateInvitations(
      federationConfig,
      frostShares
    );

    if (invitationResult.success) {
      console.log(`   Generated ${invitationResult.data!.length} invitations`);
      invitationResult.data!.forEach((invitation, index) => {
        console.log(
          `   Invitation ${index + 1}: ${invitation.role} - ${
            invitation.recipientName
          }`
        );
      });
    } else {
      console.log(`   Invitation generation failed: ${invitationResult.error}`);
    }
    console.log();

    // Step 8: Test audit log
    console.log("8. Testing audit log...");

    const auditLog = zkNsecManager.getAuditLog();
    console.log(`   Audit log entries: ${auditLog.length}`);
    auditLog.forEach((entry, index) => {
      console.log(
        `   Entry ${index + 1}: ${entry.operation} - ${
          entry.result
        } (${entry.timestamp.toISOString()})`
      );
    });
    console.log();

    // Step 9: Test cleanup
    console.log("9. Testing secure cleanup...");

    zkNsecManager.clearSensitiveData();
    console.log(`   Sensitive data cleared\n`);

    console.log("✅ All FROST integration tests completed successfully!");
    return true;
  } catch (error) {
    console.error("❌ FROST integration test failed:", error);
    return false;
  }
}

/**
 * Run the test if this file is executed directly
 */
if (typeof window === "undefined") {
  // Node.js environment
  testFrostIntegration().then((success) => {
    process.exit(success ? 0 : 1);
  });
} else {
  // Browser environment
  (window as any).testFrostIntegration = testFrostIntegration;
  console.log(
    "FROST integration test function loaded. Call testFrostIntegration() to run tests."
  );
}

export { testFrostIntegration };
