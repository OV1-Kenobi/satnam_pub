#!/usr/bin/env node
/**
 * Initialize Supabase Vault Configuration Script
 * 
 * FOLLOWS SATNAM.PUB MASTER CONTEXT:
 * - Stores configuration in Supabase Vault instead of .env files
 * - Privacy-first configuration management
 * - Production-ready setup
 */

const { initializeProductionConfig } = require("../lib/config-manager");

async function main() {
  console.log("🔐 Initializing Supabase Vault Configuration...");
  console.log("📋 This will store production configuration values in Supabase Vault");
  console.log("");

  try {
    const success = await initializeProductionConfig();
    
    if (success) {
      console.log("");
      console.log("✅ SUCCESS: Vault configuration initialized");
      console.log("🔒 Configuration values are now stored securely in Supabase Vault");
      console.log("🎯 Production URLs configured:");
      console.log("   - App Base URL: https://satnam.pub");
      console.log("   - API Base URL: https://api.satnam.pub");
      console.log("");
      console.log("💡 You can now deploy to production with proper Master Context compliance");
      process.exit(0);
    } else {
      console.log("");
      console.log("❌ FAILED: Could not initialize vault configuration");
      console.log("💡 Make sure Supabase is properly configured and vault functions are deployed");
      process.exit(1);
    }
  } catch (error) {
    console.error("");
    console.error("❌ ERROR: Vault initialization failed");
    console.error("Details:", error.message);
    console.error("");
    console.error("💡 Troubleshooting:");
    console.error("   1. Verify Supabase connection");
    console.error("   2. Check vault RPC functions are deployed");
    console.error("   3. Ensure proper permissions for vault operations");
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { main };