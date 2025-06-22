#!/usr/bin/env tsx
/**
 * @fileoverview Check Vault Status
 * @description Check if Supabase Vault is enabled and ready
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

// Load environment variables - .env.local should override .env
config({ path: ".env" }); // Load base config first
config({ path: ".env.local", override: true }); // Override with local config

async function checkVault() {
  console.log("🔐 Checking Supabase Vault Status");
  console.log("═══════════════════════════════════════");

  // Check environment
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("❌ Missing Supabase credentials!");
    process.exit(1);
  }

  console.log("✅ Supabase credentials found");
  console.log(`📍 Project URL: ${supabaseUrl}`);

  // Initialize Supabase client
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    console.log("\n🔍 Testing Vault access...");

    // Try to access vault
    const { data, error } = await supabase
      .from("vault.decrypted_secrets")
      .select("name")
      .limit(1);

    if (error) {
      if (
        error.message.includes(
          'relation "vault.decrypted_secrets" does not exist'
        ) ||
        error.message.includes(
          'relation "public.vault.decrypted_secrets" does not exist'
        )
      ) {
        console.log("❌ Vault extension not enabled");
        console.log("\n📝 To enable Vault extension:");
        console.log(
          "1. Go to your Supabase dashboard: https://supabase.com/dashboard"
        );
        console.log("2. Select your project");
        console.log("3. Navigate to Database → Extensions");
        console.log('4. Search for "supabase_vault"');
        console.log("5. Click the toggle to enable it");
        console.log("\n🔄 After enabling, run this script again to verify");
        process.exit(1);
      } else {
        console.error("❌ Vault access error:", error.message);
        process.exit(1);
      }
    }

    console.log("✅ Vault extension is enabled and accessible!");
    console.log("🎉 Ready to set up secrets!");
    console.log(
      "\n▶️  Next step: Run 'npm run vault:setup' to configure your secrets"
    );
  } catch (error) {
    console.error("❌ Unexpected error:", error);
    process.exit(1);
  }
}

checkVault();
