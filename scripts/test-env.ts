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
 * @fileoverview Test Environment Variables
 * @description Tests if environment variables are being loaded correctly
 */

import { config } from "dotenv";

// Load environment variables in order (later files override earlier ones)
console.log("Loading environment files...");

// Load .env first (base configuration)
const envResult = config({ path: ".env" });
console.log(".env loaded:", !envResult.error);

// Load .env.local (should override .env)
const localResult = config({ path: ".env.local", override: true });
console.log(".env.local loaded:", !localResult.error);

if (localResult.error) {
  console.error("❌ Error loading .env.local:", localResult.error);
} else {
  console.log("✅ .env.local loaded successfully");
}

console.log("\n🔍 Environment Variables:");
console.log("SUPABASE_URL:", getEnvVar("SUPABASE_URL") || "NOT SET");
console.log(
  "SUPABASE_SERVICE_ROLE_KEY:",
  getEnvVar("SUPABASE_SERVICE_ROLE_KEY")
    ? `${getEnvVar("SUPABASE_SERVICE_ROLE_KEY").substring(0, 20)}...`
    : "NOT SET"
);
console.log(
  "SUPABASE_ANON_KEY:",
  getEnvVar("SUPABASE_ANON_KEY")
    ? `${getEnvVar("SUPABASE_ANON_KEY").substring(0, 20)}...`
    : "NOT SET"
);

console.log("\n📁 Current working directory:", process.cwd());
console.log("📄 Looking for .env.local at:", `${process.cwd()}/.env.local`);

// Check if .env.local file exists
import { existsSync } from "fs";
const envPath = ".env.local";
console.log("📋 .env.local exists:", existsSync(envPath));
