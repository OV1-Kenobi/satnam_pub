#!/usr/bin/env tsx
/**
 * @fileoverview Enable Supabase Vault Extension
 * @description Enables the supabase_vault extension and tests connectivity
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

// Load environment variables - .env.local should override .env
config({ path: ".env" }); // Load base config first
config({ path: ".env.local", override: true }); // Override with local config

async function enableVault() {
  console.log("🔐 Enabling Supabase Vault Extension");
  console.log("═══════════════════════════════════════");

  // Check environment
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("❌ Missing Supabase credentials!");
    console.error(
      "   Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env.local file"
    );
    process.exit(1);
  }

  console.log("✅ Supabase credentials found");
  console.log(`📍 Project URL: ${supabaseUrl}`);
  console.log(`🔑 Service Role: ${serviceRoleKey.substring(0, 20)}...`);

  // Initialize Supabase client
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    console.log("\n🔍 Testing basic connection...");

    // Test basic connection with a simple query
    const { data, error } = await supabase.rpc("version");

    if (error) {
      console.error("❌ Connection failed:", error.message);
      console.error("   Please check:");
      console.error("   1. Your Supabase project is unpaused");
      console.error("   2. Your service role key is correct");
      console.error("   3. Your project URL is correct");
      process.exit(1);
    }

    console.log("✅ Basic connection successful");

    console.log("\n🔧 Enabling Vault extension...");

    // Enable the vault extension
    const { error: extensionError } = await supabase.rpc("sql", {
      query: "CREATE EXTENSION IF NOT EXISTS supabase_vault;",
    });

    if (extensionError) {
      console.error(
        "❌ Failed to enable Vault extension:",
        extensionError.message
      );
      console.log("\n📝 Manual steps to enable Vault:");
      console.log("1. Go to your Supabase dashboard");
      console.log("2. Navigate to Database → Extensions");
      console.log('3. Search for "supabase_vault" and enable it');
      console.log("4. Or run this SQL in your SQL Editor:");
      console.log("   CREATE EXTENSION IF NOT EXISTS supabase_vault;");
      process.exit(1);
    }

    console.log("✅ Vault extension enabled successfully");

    console.log("\n🔍 Testing Vault access...");

    // Test vault access
    const { data: vaultData, error: vaultError } = await supabase
      .from("vault.decrypted_secrets")
      .select("name")
      .limit(1);

    if (vaultError) {
      if (
        vaultError.message.includes(
          'relation "vault.decrypted_secrets" does not exist'
        )
      ) {
        console.error("❌ Vault extension not properly enabled");
        console.log("   Please enable it manually in your Supabase dashboard");
      } else {
        console.error("❌ Vault access error:", vaultError.message);
      }
      process.exit(1);
    }

    console.log("✅ Vault is ready for use!");
    console.log("\n🎉 Setup complete! You can now run: npm run vault:setup");
  } catch (error) {
    console.error("❌ Unexpected error:", error);
    process.exit(1);
  }
}

enableVault();
