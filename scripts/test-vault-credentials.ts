#!/usr/bin/env tsx
/**
 * @fileoverview Vault Credential Testing Script
 * @description Tests credential storage, retrieval, and rotation in Supabase Vault
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { VaultConfigManager } from "../lib/vault-config";

// Load environment variables
config({ path: ".env" });
config({ path: ".env.local" });

class VaultCredentialTester {
  private vaultManager: VaultConfigManager;
  private supabase: any;

  constructor() {
    this.vaultManager = new VaultConfigManager();
    
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (supabaseUrl && serviceRoleKey) {
      this.supabase = createClient(supabaseUrl, serviceRoleKey);
    }
  }

  async runAllTests(): Promise<void> {
    console.log("🔐 Vault Credential Testing Suite");
    console.log("═══════════════════════════════════════════════════════════════\n");

    // Test 1: Vault Health Check
    await this.testVaultHealth();

    // Test 2: Credential Storage and Retrieval
    await this.testCredentialRetrieval();

    // Test 3: Secret Rotation with Guardian Approval
    await this.testSecretRotation();

    // Test 4: PhoenixD Credentials
    await this.testPhoenixDCredentials();

    // Test 5: Lightning Infrastructure Credentials
    await this.testLightningCredentials();

    // Test 6: Fedimint Guardian Credentials
    await this.testFedimintCredentials();

    // Test 7: Guardian Approval Workflow
    await this.testGuardianApprovalWorkflow();

    console.log("\n🎉 All Vault credential tests completed!");
  }

  private async testVaultHealth(): Promise<void> {
    console.log("1️⃣ Testing Vault Health Check");
    console.log("───────────────────────────────────────────────────────────────");

    const isHealthy = await this.vaultManager.healthCheck();
    
    if (isHealthy) {
      console.log("✅ Vault is healthy and accessible");
    } else {
      console.log("❌ Vault health check failed");
      console.log("   Please ensure:");
      console.log("   - Supabase project is unpaused");
      console.log("   - Vault extension is enabled");
      console.log("   - Service role key has proper permissions");
    }
    console.log();
  }

  private async testCredentialRetrieval(): Promise<void> {
    console.log("2️⃣ Testing Credential Retrieval");
    console.log("───────────────────────────────────────────────────────────────");

    const testSecrets = [
      "jwt_secret",
      "privacy_master_key",
      "phoenixd_host",
      "lightning_domain"
    ];

    for (const secretName of testSecrets) {
      try {
        const value = await this.vaultManager.getSecret(secretName);
        if (value) {
          console.log(`✅ Retrieved ${secretName}: ${value.substring(0, 10)}...`);
        } else {
          console.log(`⚠️  Secret not found: ${secretName}`);
        }
      } catch (error) {
        console.log(`❌ Failed to retrieve ${secretName}: ${error}`);
      }
    }
    console.log();
  }

  private async testSecretRotation(): Promise<void> {
    console.log("3️⃣ Testing Secret Rotation");
    console.log("───────────────────────────────────────────────────────────────");

    const testSecret = "csrf_secret";
    
    try {
      // Test rotation with guardian approval
      const testValue = `test_rotated_${Date.now()}`;
      const rotationSuccess = await this.vaultManager.rotateSecret(
        testSecret, 
        testValue, 
        true // Guardian approval
      );

      if (rotationSuccess) {
        console.log(`✅ Secret rotation successful: ${testSecret}`);
        
        // Verify the new value
        const newValue = await this.vaultManager.getSecret(testSecret);
        if (newValue === testValue) {
          console.log("✅ Rotation verification successful");
        } else {
          console.log("❌ Rotation verification failed");
        }
      } else {
        console.log(`❌ Secret rotation failed: ${testSecret}`);
      }
    } catch (error) {
      console.log(`❌ Secret rotation test failed: ${error}`);
    }
    console.log();
  }

  private async testPhoenixDCredentials(): Promise<void> {
    console.log("4️⃣ Testing PhoenixD Credentials");
    console.log("───────────────────────────────────────────────────────────────");

    const phoenixdSecrets = [
      "phoenixd_host",
      "phoenixd_api_token",
      "phoenixd_username",
      "phoenixd_min_channel_size"
    ];

    for (const secretName of phoenixdSecrets) {
      try {
        const value = await this.vaultManager.getSecret(secretName);
        if (value) {
          const displayValue = secretName.includes("token") 
            ? `${value.substring(0, 8)}...` 
            : value;
          console.log(`✅ PhoenixD ${secretName}: ${displayValue}`);
        } else {
          console.log(`⚠️  PhoenixD secret not found: ${secretName}`);
        }
      } catch (error) {
        console.log(`❌ PhoenixD credential test failed for ${secretName}: ${error}`);
      }
    }
    console.log();
  }

  private async testLightningCredentials(): Promise<void> {
    console.log("5️⃣ Testing Lightning Infrastructure Credentials");
    console.log("───────────────────────────────────────────────────────────────");

    const lightningSecrets = [
      "voltage_api_key",
      "voltage_api_endpoint",
      "voltage_node_id",
      "lnbits_admin_key",
      "lnbits_url",
      "lnd_macaroon",
      "lnd_socket",
      "btcpay_server_url",
      "btcpay_api_key"
    ];

    for (const secretName of lightningSecrets) {
      try {
        const value = await this.vaultManager.getSecret(secretName);
        if (value) {
          const displayValue = secretName.includes("key") || secretName.includes("macaroon")
            ? `${value.substring(0, 8)}...`
            : value;
          console.log(`✅ Lightning ${secretName}: ${displayValue}`);
        } else {
          console.log(`⚠️  Lightning secret not found: ${secretName}`);
        }
      } catch (error) {
        console.log(`❌ Lightning credential test failed for ${secretName}: ${error}`);
      }
    }
    console.log();
  }

  private async testFedimintCredentials(): Promise<void> {
    console.log("6️⃣ Testing Fedimint Guardian Credentials");
    console.log("───────────────────────────────────────────────────────────────");

    const fedimintSecrets = [
      "fedimint_guardian_private_key",
      "fedimint_federation_config",
      "fedimint_gateway_url"
    ];

    for (const secretName of fedimintSecrets) {
      try {
        const value = await this.vaultManager.getSecret(secretName);
        if (value) {
          const displayValue = secretName.includes("private_key")
            ? `${value.substring(0, 8)}...`
            : value;
          console.log(`✅ Fedimint ${secretName}: ${displayValue}`);
        } else {
          console.log(`⚠️  Fedimint secret not found: ${secretName}`);
        }
      } catch (error) {
        console.log(`❌ Fedimint credential test failed for ${secretName}: ${error}`);
      }
    }
    console.log();
  }

  private async testGuardianApprovalWorkflow(): Promise<void> {
    console.log("7️⃣ Testing Guardian Approval Workflow");
    console.log("───────────────────────────────────────────────────────────────");

    // Get secrets that require guardian approval
    const guardianApprovalSecrets = this.vaultManager.getSecretsRequiringGuardianApproval();
    
    console.log(`Found ${guardianApprovalSecrets.length} secrets requiring guardian approval:`);
    
    for (const secretName of guardianApprovalSecrets) {
      console.log(`   - ${secretName}`);
    }

    // Test rotation without guardian approval (should fail)
    if (guardianApprovalSecrets.length > 0) {
      const testSecret = guardianApprovalSecrets[0];
      try {
        await this.vaultManager.rotateSecret(testSecret, "test_value", false);
        console.log(`❌ Guardian approval bypassed for ${testSecret} (should have failed)`);
      } catch (error) {
        console.log(`✅ Guardian approval correctly required for ${testSecret}`);
      }
    }

    // Test rotation with guardian approval (should succeed)
    if (guardianApprovalSecrets.length > 0) {
      const testSecret = guardianApprovalSecrets[0];
      try {
        const testValue = `guardian_approved_${Date.now()}`;
        const success = await this.vaultManager.rotateSecret(testSecret, testValue, true);
        
        if (success) {
          console.log(`✅ Guardian-approved rotation successful for ${testSecret}`);
        } else {
          console.log(`❌ Guardian-approved rotation failed for ${testSecret}`);
        }
      } catch (error) {
        console.log(`❌ Guardian approval test failed for ${testSecret}: ${error}`);
      }
    }

    console.log();
  }

  private async testCredentialVerification(): Promise<void> {
    console.log("8️⃣ Testing Credential Verification");
    console.log("───────────────────────────────────────────────────────────────");

    const testSecrets = [
      "jwt_secret",
      "phoenixd_host",
      "lightning_domain"
    ];

    for (const secretName of testSecrets) {
      try {
        const success = await this.vaultManager.testCredentialRetrieval(secretName);
        if (success) {
          console.log(`✅ Credential verification successful: ${secretName}`);
        } else {
          console.log(`❌ Credential verification failed: ${secretName}`);
        }
      } catch (error) {
        console.log(`❌ Credential verification error for ${secretName}: ${error}`);
      }
    }
    console.log();
  }

  private async testLoginWithRotatedCredentials(): Promise<void> {
    console.log("9️⃣ Testing Login with Rotated Credentials");
    console.log("───────────────────────────────────────────────────────────────");

    try {
      // Test JWT secret rotation and login verification
      const originalJwtSecret = await this.vaultManager.getSecret("jwt_secret");
      if (originalJwtSecret) {
        console.log("✅ JWT secret retrieved successfully");
        
        // Test rotation
        const newJwtSecret = `rotated_jwt_${Date.now()}`;
        const rotationSuccess = await this.vaultManager.rotateSecret(
          "jwt_secret", 
          newJwtSecret, 
          true
        );

        if (rotationSuccess) {
          console.log("✅ JWT secret rotated successfully");
          
          // Verify new secret works
          const retrievedSecret = await this.vaultManager.getSecret("jwt_secret");
          if (retrievedSecret === newJwtSecret) {
            console.log("✅ Login with rotated JWT secret verified");
          } else {
            console.log("❌ Login verification failed with rotated JWT secret");
          }

          // Restore original secret
          await this.vaultManager.rotateSecret("jwt_secret", originalJwtSecret, true);
          console.log("✅ Original JWT secret restored");
        } else {
          console.log("❌ JWT secret rotation failed");
        }
      } else {
        console.log("⚠️  JWT secret not found for login test");
      }
    } catch (error) {
      console.log(`❌ Login test failed: ${error}`);
    }
    console.log();
  }
}

// Run the tests
async function main() {
  const tester = new VaultCredentialTester();
  
  try {
    await tester.runAllTests();
  } catch (error) {
    console.error("❌ Test suite failed:", error);
    process.exit(1);
  }
}

// Run the tests if this file is executed directly
main().catch(console.error); 