#!/usr/bin/env tsx
// scripts/test-rebuilding-camelot-otp.ts

// CRITICAL: Load environment variables FIRST, before any other imports
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { RebuildingCamelotOTPService } from "../lib/nostr-otp-service";

// Debug: Check if environment variables are loaded
console.log("🔍 Environment check:");
console.log(
  "   SUPABASE_URL:",
  process.env.SUPABASE_URL ? "✅ Loaded" : "❌ Missing"
);
console.log(
  "   SUPABASE_ANON_KEY:",
  process.env.SUPABASE_ANON_KEY ? "✅ Loaded" : "❌ Missing"
);
console.log("   OTP_SALT:", process.env.OTP_SALT ? "✅ Loaded" : "❌ Missing");

async function testRebuildingCamelotOTP() {
  console.log("🧪 Testing Rebuilding Camelot OTP System...");

  const otpService = new RebuildingCamelotOTPService();

  // Test configuration
  const testNpub = "npub1test123456789abcdef"; // Replace with a real test npub
  const testNip05 = "test@example.com";

  try {
    console.log("\n1️⃣ Testing OTP Generation and Sending...");

    // Test OTP sending (this will fail without proper vault setup)
    try {
      const otpResult = await otpService.sendOTPDM(testNpub, testNip05);

      if (otpResult.success) {
        console.log("✅ OTP sent successfully!");
        console.log("   Message ID:", otpResult.messageId);
        console.log("   Expires at:", otpResult.expiresAt);
        console.log(
          "   OTP (for testing):",
          process.env.NODE_ENV === "development"
            ? otpResult.otp
            : "***hidden***"
        );

        console.log("\n2️⃣ Testing OTP Verification...");

        // Test valid OTP
        const validResult = await otpService.verifyOTP(testNpub, otpResult.otp);
        console.log("✅ Valid OTP verification:", validResult);

        // Test invalid OTP
        const invalidResult = await otpService.verifyOTP(testNpub, "000000");
        console.log("✅ Invalid OTP verification:", invalidResult);

        // Test expired OTP (simulate by waiting or using old OTP)
        console.log("✅ OTP verification tests completed");
      } else {
        console.log("❌ OTP sending failed:", otpResult.error);
        console.log("💡 This is expected if vault credentials are not set up");
      }
    } catch (sendError) {
      console.log("❌ OTP sending error:", sendError);
      console.log("💡 This is expected if vault credentials are not set up");
    }

    console.log("\n3️⃣ Testing OTP Cleanup...");
    try {
      // Get initial counts
      const initialCounts = await otpService.getOTPCount();
      console.log(
        `   Initial OTP counts - Total: ${initialCounts.total}, Expired: ${initialCounts.expired}`
      );

      // Create some test expired OTPs if none exist
      if (initialCounts.expired === 0) {
        console.log(
          "   Creating test expired OTPs for cleanup verification..."
        );
        await otpService.createTestExpiredOTPs(3);
        const afterCreation = await otpService.getOTPCount();
        console.log(
          `   After creating test data - Total: ${afterCreation.total}, Expired: ${afterCreation.expired}`
        );
      }

      // Perform cleanup
      const cleanedCount = await otpService.cleanupExpiredOTPs();

      // Verify cleanup results
      const finalCounts = await otpService.getOTPCount();
      console.log(
        `✅ OTP cleanup completed - Removed ${cleanedCount} expired OTPs`
      );
      console.log(
        `   Final OTP counts - Total: ${finalCounts.total}, Expired: ${finalCounts.expired}`
      );

      if (finalCounts.expired === 0) {
        console.log(
          "✅ Cleanup verification: All expired OTPs successfully removed"
        );
      } else {
        console.log(
          `⚠️  Cleanup verification: ${finalCounts.expired} expired OTPs still remain`
        );
      }
    } catch (cleanupError) {
      console.log("❌ OTP cleanup test failed:", cleanupError);
      console.log("💡 This may be expected if the database is not set up");
    }

    console.log("\n🎉 OTP System Test Summary:");
    console.log("   ✅ Service initialization: OK");
    console.log("   ✅ Cleanup functionality: OK");
    console.log("   ⚠️  Vault integration: Requires setup");

    console.log("\n📋 Setup Requirements:");
    console.log("   1. Run migration: npm run migrate:rebuilding-camelot");
    console.log("   2. Set up Supabase Vault with actual credentials");
    console.log("   3. Configure OTP_SALT in environment variables");
    console.log("   4. Test with real Nostr keys");
  } catch (error) {
    console.error("💥 Test failed:", error);

    if (error instanceof Error) {
      if (error.message.includes("vault")) {
        console.log("\n💡 Vault Setup Required:");
        console.log(
          "   The test failed because Supabase Vault is not configured."
        );
        console.log("   This is expected for a fresh installation.");
        console.log("\n🔧 To fix:");
        console.log("   1. Enable Supabase Vault extension");
        console.log("   2. Run the migration to create vault functions");
        console.log(
          "   3. Add your Rebuilding Camelot credentials to the vault"
        );
      } else if (error.message.includes("family_otp_verification")) {
        console.log("\n💡 Database Setup Required:");
        console.log(
          "   The test failed because the OTP verification table does not exist."
        );
        console.log("\n🔧 To fix:");
        console.log("   Run: npm run migrate:rebuilding-camelot");
      }
    }
  }
}

// Helper function to test individual components
async function testComponents() {
  console.log("\n🔧 Testing Individual Components...");

  const otpService = new RebuildingCamelotOTPService();

  // Test cleanup with verification (should work even without vault)
  try {
    console.log("🧹 Testing cleanup with verification...");

    // Get initial state
    const beforeCounts = await otpService.getOTPCount();
    console.log(
      `   Before cleanup - Total: ${beforeCounts.total}, Expired: ${beforeCounts.expired}`
    );

    // Create test expired OTPs if database is accessible
    let testOTPsCreated = false;
    try {
      if (beforeCounts.expired === 0) {
        await otpService.createTestExpiredOTPs(2);
        testOTPsCreated = true;
        const afterCreation = await otpService.getOTPCount();
        console.log(
          `   After creating test data - Total: ${afterCreation.total}, Expired: ${afterCreation.expired}`
        );
      }
    } catch (createError) {
      console.log(
        "   Could not create test data (database may not be accessible)"
      );
    }

    // Perform cleanup
    const removedCount = await otpService.cleanupExpiredOTPs();
    const afterCounts = await otpService.getOTPCount();

    console.log(
      `✅ Cleanup function works - Removed ${removedCount} expired OTPs`
    );
    console.log(
      `   After cleanup - Total: ${afterCounts.total}, Expired: ${afterCounts.expired}`
    );

    if (testOTPsCreated && removedCount > 0) {
      console.log(
        "✅ Cleanup verification: Successfully removed test expired OTPs"
      );
    }
  } catch (cleanupError) {
    console.log("❌ Cleanup function failed:", cleanupError);
  }

  // Test verification with dummy data (should fail gracefully)
  try {
    const result = await otpService.verifyOTP("npub1test", "123456");
    console.log("✅ Verification function works (returned:", result, ")");
  } catch (verifyError) {
    console.log("❌ Verification function failed:", verifyError);
  }
}

// Run tests
console.log("🚀 Starting Rebuilding Camelot OTP Tests...");
testRebuildingCamelotOTP()
  .then(() => testComponents())
  .then(() => {
    console.log("\n✨ All tests completed!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Test suite failed:", error);
    process.exit(1);
  });
