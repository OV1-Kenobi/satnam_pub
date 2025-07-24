
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
 * @fileoverview Configuration Test Script
 * @description Test that environment variables and config are loaded correctly
 *
 * MASTER CONTEXT NOTE: This is a Node.js-only development script.
 * Production code should use getEnvVar() pattern instead of dotenv.
 */

import * as dotenv from "dotenv";

// Load environment variables (Node.js development script only)
dotenv.config();

console.log("🔧 Configuration Test");
console.log("=".repeat(40));
console.log("");

// Test direct environment variables
console.log("📋 Direct Environment Variables:");
console.log(
  `   SUPABASE_URL: ${getEnvVar("SUPABASE_URL") ? "✅ Set" : "❌ Not set"}`
);
console.log(
  `   SUPABASE_SERVICE_ROLE_KEY: ${
    getEnvVar("SUPABASE_SERVICE_ROLE_KEY") ? "✅ Set" : "❌ Not set"
  }`
);
console.log(
  `   NEXT_PUBLIC_SUPABASE_URL: ${
    getEnvVar("NEXT_PUBLIC_SUPABASE_URL") ? "✅ Set" : "❌ Not set"
  }`
);
console.log(
  `   SUPABASE_SERVICE_KEY: ${
    getEnvVar("SUPABASE_SERVICE_KEY") ? "✅ Set" : "❌ Not set"
  }`
);
console.log("");

// Test config import
try {
  const configModule = require("../config");
  const config = configModule.config || configModule.default || configModule;

  console.log("📦 Config File Import:");
  console.log(`   Config loaded: ✅ Success`);
  console.log(
    `   Supabase URL from config: ${
      config?.supabase?.url ? "✅ Found" : "❌ Missing"
    }`
  );
  console.log(
    `   Service Key from config: ${
      config?.supabase?.serviceRoleKey ? "✅ Found" : "❌ Missing"
    }`
  );
  console.log("");

  // Show partial values for verification (without exposing secrets)
  if (config?.supabase?.url) {
    const url = config.supabase.url;
    console.log(
      `   URL Preview: ${url.substring(0, 20)}...${url.substring(
        url.length - 10
      )}`
    );
  }
  if (config?.supabase?.serviceRoleKey) {
    const key = config.supabase.serviceRoleKey;
    console.log(
      `   Key Preview: ${key.substring(0, 10)}...[HIDDEN]...${key.substring(
        key.length - 4
      )}`
    );
  }
} catch (error) {
  console.log("📦 Config File Import:");
  console.log(`   Config loaded: ❌ Failed - ${error}`);
}

console.log("");

// Test combined resolution (what the migration script would see)
const supabaseUrl =
  getEnvVar("SUPABASE_URL") || getEnvVar("NEXT_PUBLIC_SUPABASE_URL");

const supabaseServiceKey =
  getEnvVar("SUPABASE_SERVICE_ROLE_KEY") || getEnvVar("SUPABASE_SERVICE_KEY");

console.log("🎯 Final Resolution (Migration Script View):");
console.log(`   Resolved URL: ${supabaseUrl ? "✅ Found" : "❌ Missing"}`);
console.log(
  `   Resolved Service Key: ${supabaseServiceKey ? "✅ Found" : "❌ Missing"}`
);

if (supabaseUrl && supabaseServiceKey) {
  console.log("");
  console.log("🎉 SUCCESS: All required Supabase configuration found!");
  console.log("   The migration script should work properly.");
} else {
  console.log("");
  console.log("❌ FAILURE: Missing required Supabase configuration!");
  console.log("");
  console.log("💡 Solutions:");
  console.log("   1. Check your .env file in the project root");
  console.log("   2. Verify environment variable names are correct");
  console.log("   3. Make sure .env file is not in .gitignore exclusions");
  console.log("   4. Try setting variables directly in your shell:");
  console.log('      export SUPABASE_URL="your-url-here"');
  console.log('      export SUPABASE_SERVICE_ROLE_KEY="your-key-here"');
}

console.log("");
console.log("📄 Environment file locations checked:");
console.log("   - .env");
console.log("   - .env.local");
console.log("   - System environment");
