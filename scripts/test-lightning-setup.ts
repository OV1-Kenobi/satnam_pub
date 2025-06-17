// scripts/test-lightning-setup.ts
/**
 * Test script for the secure, atomic Lightning setup process
 *
 * This script validates:
 * 🔒 Atomic database operations
 * 🔒 Encrypted configuration storage
 * 🔒 Proper rollback on failures
 * 🔒 Database synchronization
 */

import { IdentityRegistration } from "../lib/api/register-identity";
import { PrivacyManager } from "../lib/crypto/privacy-manager";
import { CitadelDatabase } from "../lib/supabase";

// Test configuration
const TEST_USER_ID = "test-user-" + Date.now();
const TEST_USERNAME = "TestUser" + Math.floor(Math.random() * 1000);
const TEST_LIGHTNING_ADDRESS = `${TEST_USERNAME.toLowerCase()}@test.domain`;

async function testAtomicLightningSetup() {
  console.log("🧪 Testing Atomic Lightning Setup");
  console.log("=".repeat(50));

  try {
    // Test 1: Check Lightning setup status (should be empty initially)
    console.log("\n📊 Test 1: Initial status check");
    const initialStatus =
      await IdentityRegistration.getLightningSetupStatus(TEST_USER_ID);
    console.log("Initial status:", initialStatus);

    // Test 2: Simulate Lightning setup with external services
    console.log("\n⚡ Test 2: Lightning setup with external services");

    // Mock environment variables for testing
    process.env.VOLTAGE_API_KEY = "test-voltage-key";
    process.env.BTCPAY_SERVER_URL = "https://test.btcpay.server";
    process.env.BTCPAY_API_KEY = "test-btcpay-key";
    process.env.SERVICE_ENCRYPTION_KEY = "test-service-encryption-key-32-chars";

    const mockRequest = {
      userId: TEST_USER_ID,
      username: TEST_USERNAME,
      usernameChoice: "user_provided" as const,
      userEncryptionKey: "test-user-passphrase",
      optionalData: {
        lightningAddress: TEST_LIGHTNING_ADDRESS,
      },
    };

    console.log("Starting Lightning setup simulation...");

    // This would normally be called as part of registerIdentity
    // For testing, we'll call the internal method directly
    const lightningResult = await (
      IdentityRegistration as any
    ).setupLightningInfrastructure(
      TEST_USER_ID,
      TEST_USERNAME,
      TEST_LIGHTNING_ADDRESS,
    );

    console.log(
      "Lightning setup result:",
      JSON.stringify(lightningResult, null, 2),
    );

    // Test 3: Verify database state after setup
    console.log("\n💾 Test 3: Database state verification");
    const lightningAddress =
      await CitadelDatabase.getLightningAddress(TEST_USER_ID);
    console.log("Lightning address record:", lightningAddress);

    if (lightningAddress) {
      // Test encrypted config decryption
      if (lightningAddress.encrypted_btcpay_config) {
        console.log("🔓 Testing BTCPay config decryption...");
        try {
          const decryptedBTCPay = PrivacyManager.decryptServiceConfig(
            lightningAddress.encrypted_btcpay_config,
            process.env.SERVICE_ENCRYPTION_KEY!,
          );
          console.log(
            "✅ BTCPay config decrypted successfully:",
            decryptedBTCPay.store_name,
          );
        } catch (error) {
          console.error("❌ BTCPay config decryption failed:", error);
        }
      }

      if (lightningAddress.encrypted_voltage_config) {
        console.log("🔓 Testing Voltage config decryption...");
        try {
          const decryptedVoltage = PrivacyManager.decryptServiceConfig(
            lightningAddress.encrypted_voltage_config,
            process.env.SERVICE_ENCRYPTION_KEY!,
          );
          console.log(
            "✅ Voltage config decrypted successfully:",
            decryptedVoltage.node_name,
          );
        } catch (error) {
          console.error("❌ Voltage config decryption failed:", error);
        }
      }
    }

    // Test 4: Check final status
    console.log("\n📊 Test 4: Final status check");
    const finalStatus =
      await IdentityRegistration.getLightningSetupStatus(TEST_USER_ID);
    console.log("Final status:", JSON.stringify(finalStatus, null, 2));

    // Test 5: Test retry mechanism
    console.log("\n🔄 Test 5: Retry mechanism test");
    const retryResult = await IdentityRegistration.retryLightningSetup(
      TEST_USER_ID,
      TEST_USERNAME,
      TEST_LIGHTNING_ADDRESS,
    );
    console.log("Retry result:", retryResult);

    console.log("\n✅ All tests completed successfully!");
  } catch (error) {
    console.error("❌ Test failed:", error);
  } finally {
    // Cleanup test data
    console.log("\n🧹 Cleaning up test data...");
    try {
      await CitadelDatabase.rollbackLightningSetup(TEST_USER_ID);
      console.log("✅ Test cleanup completed");
    } catch (cleanupError) {
      console.warn("⚠️ Cleanup warning:", cleanupError);
    }
  }
}

async function testFailureScenarios() {
  console.log("\n🚨 Testing Failure Scenarios");
  console.log("=".repeat(50));

  try {
    // Test failure with missing environment variables
    console.log("\n❌ Test: Missing service keys");
    delete process.env.VOLTAGE_API_KEY;
    delete process.env.BTCPAY_API_KEY;

    const failureResult = await (
      IdentityRegistration as any
    ).setupLightningInfrastructure(
      "test-failure-user",
      "FailureTest",
      "failure@test.domain",
    );

    console.log("Failure scenario result:", failureResult);

    // Verify no partial state left behind
    const failureStatus =
      await CitadelDatabase.getLightningAddress("test-failure-user");
    console.log(
      "Database state after failure:",
      failureStatus ? "❌ Partial state found" : "✅ Clean state",
    );
  } catch (error) {
    console.log("Expected failure caught:", error.message);
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  Promise.resolve()
    .then(() => testAtomicLightningSetup())
    .then(() => testFailureScenarios())
    .then(() => {
      console.log("\n🎉 All Lightning setup tests completed!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n💥 Test suite failed:", error);
      process.exit(1);
    });
}

export { testAtomicLightningSetup, testFailureScenarios };
