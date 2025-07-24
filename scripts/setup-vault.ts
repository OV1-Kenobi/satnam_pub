#!/usr/bin/env tsx

/**
 * MASTER CONTEXT COMPLIANCE: Browser-compatible environment variable handling
 * @param {string} key - Environment variable key
 * @returns {string|undefined} Environment variable value
 */
function getEnvVar(key: string): string | undefined {
  if (typeof import.meta !== "undefined") {
    const metaWithEnv = /** @type {Object} */ (import.meta);
    if (metaWithEnv.env) {
      return metaWithEnv.env[key];
    }
  }
  return process.env[key];
}

/**
 * @fileoverview Vault Setup Script
 * @description Sets up Supabase Vault with required secrets for secure deployment
 *
 * MASTER CONTEXT NOTE: This is a Node.js-only development script.
 * Production code should use getEnvVar() pattern instead of dotenv.
 */

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
import { config } from "dotenv";
import * as readline from "readline";

// Load environment variables - .env.local should override .env (Node.js development script only)
config({ path: ".env" }); // Load base config first
config({ path: ".env.local", override: true }); // Override with local config

interface SecretSetup {
  name: string;
  description: string;
  required: boolean;
  generateDefault?: () => string;
  prompt?: string;
}

const SECRETS_TO_SETUP: SecretSetup[] = [
  {
    name: "jwt_secret",
    description: "JWT signing secret for authentication tokens",
    required: true,
    generateDefault: () => randomBytes(32).toString("hex"),
    prompt: "JWT Secret (leave empty to generate secure random)",
  },
  {
    name: "privacy_master_key",
    description: "Master encryption key for privacy features",
    required: true,
    generateDefault: () => randomBytes(32).toString("hex"),
    prompt: "Privacy Master Key (leave empty to generate secure random)",
  },
  {
    name: "csrf_secret",
    description: "CSRF protection secret",
    required: true,
    generateDefault: () => randomBytes(32).toString("hex"),
    prompt: "CSRF Secret (leave empty to generate secure random)",
  },
  {
    name: "master_encryption_key",
    description: "Master encryption key for sensitive data",
    required: true,
    generateDefault: () => randomBytes(32).toString("hex"),
    prompt: "Master Encryption Key (leave empty to generate secure random)",
  },
];

class VaultSetup {
  private supabase: any;
  private rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  async initialize(): Promise<void> {
    console.log("🔐 Supabase Vault Setup");
    console.log(
      "═══════════════════════════════════════════════════════════════"
    );
    console.log(
      "This script will help you set up secure secrets in Supabase Vault"
    );
    console.log(
      "═══════════════════════════════════════════════════════════════\n"
    );

    // Check environment
    const supabaseUrl = getEnvVar("SUPABASE_URL");
    const serviceRoleKey = getEnvVar("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("❌ Missing Supabase credentials!");
      console.error(
        "   Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env.local file"
      );
      console.error(
        "   Get these from your Supabase dashboard → Settings → API"
      );
      process.exit(1);
    }

    console.log("✅ Supabase credentials found");
    console.log(`📍 Project URL: ${supabaseUrl}`);
    console.log(`🔑 Service Role: ${serviceRoleKey.substring(0, 20)}...`);

    // Initialize Supabase client
    this.supabase = createClient(supabaseUrl, serviceRoleKey);

    // Check Vault extension
    await this.checkVaultExtension();

    // Setup secrets
    await this.setupSecrets();

    console.log("\n🎉 Vault setup complete!");
    console.log("Your secrets are now stored securely in Supabase Vault");
    console.log(
      "You can remove the placeholder values from your .env.local file"
    );

    this.rl.close();
  }

  private async checkVaultExtension(): Promise<void> {
    console.log("\n🔍 Checking Vault extension...");

    try {
      // Try to access vault schema
      const { error } = await this.supabase
        .from("vault.decrypted_secrets")
        .select("name")
        .limit(1);

      if (error) {
        if (
          error.message.includes(
            'relation "vault.decrypted_secrets" does not exist'
          )
        ) {
          console.error("❌ Supabase Vault extension not enabled!");
          console.error("\nTo enable Vault:");
          console.error("1. Go to your Supabase dashboard");
          console.error("2. Navigate to Database → Extensions");
          console.error('3. Enable "supabase_vault"');
          console.error("4. Or run this SQL in your SQL Editor:");
          console.error("   CREATE EXTENSION IF NOT EXISTS supabase_vault;");
          process.exit(1);
        }
        throw error;
      }

      console.log("✅ Vault extension is enabled");
    } catch (error) {
      console.error("❌ Failed to check Vault extension:", error);
      process.exit(1);
    }
  }

  private async setupSecrets(): Promise<void> {
    console.log("\n🔐 Setting up secrets...");

    for (const secret of SECRETS_TO_SETUP) {
      await this.setupSecret(secret);
    }
  }

  private async setupSecret(secret: SecretSetup): Promise<void> {
    console.log(`\n📝 Setting up: ${secret.name}`);
    console.log(`   Description: ${secret.description}`);

    // Check if secret already exists
    const existing = await this.getExistingSecret(secret.name);
    if (existing) {
      console.log("✅ Secret already exists in Vault");
      const overwrite = await this.askQuestion(
        "   Overwrite existing secret? (y/N): "
      );
      if (overwrite.toLowerCase() !== "y") {
        return;
      }
    }

    // Get secret value
    let value: string;
    if (secret.prompt) {
      const input = await this.askQuestion(`   ${secret.prompt}: `);
      if (input.trim() === "" && secret.generateDefault) {
        value = secret.generateDefault();
        console.log("   Generated secure random value");
      } else {
        value = input.trim();
      }
    } else if (secret.generateDefault) {
      value = secret.generateDefault();
      console.log("   Generated secure random value");
    } else {
      console.error(`❌ No value provided for ${secret.name}`);
      return;
    }

    if (!value) {
      console.error(`❌ Empty value for required secret: ${secret.name}`);
      return;
    }

    // Store in Vault
    try {
      const { error } = await this.supabase.rpc("vault_create_secret", {
        secret_value: value,
        secret_name: secret.name,
        secret_description: secret.description,
      });

      if (error) {
        console.error(`❌ Failed to store ${secret.name}:`, error);
        return;
      }

      console.log(`✅ ${secret.name} stored in Vault`);
    } catch (error) {
      console.error(`❌ Error storing ${secret.name}:`, error);
    }
  }

  private async getExistingSecret(name: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from("vault.decrypted_secrets")
        .select("name")
        .eq("name", name)
        .single();

      return !error && !!data;
    } catch (error) {
      return false;
    }
  }

  private askQuestion(question: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(question, resolve);
    });
  }
}

// Run setup if called directly
const setup = new VaultSetup();
setup.initialize().catch((error) => {
  console.error("❌ Setup failed:", error);
  process.exit(1);
});

export default VaultSetup;
