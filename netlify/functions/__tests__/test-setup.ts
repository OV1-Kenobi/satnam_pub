
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

// lib/__tests__/test-setup.ts
// Centralized test setup to prevent multiple GoTrueClient instances

import { config } from "dotenv";
import { resolve } from "path";
import { supabase } from "../supabase";

// Load test environment variables
config({ path: resolve(process.cwd(), ".env.test") });

// Ensure we're in test mode
getEnvVar("NODE_ENV") = "test";

// Validate required environment variables
const requiredVars = ["SUPABASE_URL", "SUPABASE_ANON_KEY"];
for (const varName of requiredVars) {
  if (!process.env[varName]) {
    throw new Error(`Missing required test environment variable: ${varName}`);
  }
}

// Use the main supabase client for tests since database is functional
export function getTestSupabaseClient() {
  return supabase;
}

// Test configuration constants
export const TEST_CONFIG = {
  SUPABASE_URL: getEnvVar("SUPABASE_URL")!,
  SUPABASE_ANON_KEY: getEnvVar("SUPABASE_ANON_KEY")!,
  DATABASE_URL: getEnvVar("DATABASE_URL")!,

  // Test user data
  TEST_USER_ID: "test-user-" + Date.now(),
  TEST_PASSWORD: "TestPassword123!",
  TEST_NEW_PASSWORD: "NewTestPassword456!",
  TEST_NSEC:
    "nsec1test1234567890abcdef1234567890abcdef1234567890abcdef1234567890",

  // Test database cleanup
  CLEANUP_AFTER_TESTS: true,
};

// Global test cleanup function
export async function globalTestCleanup(): Promise<void> {
  if (TEST_CONFIG.CLEANUP_AFTER_TESTS) {
    try {
      // Clean up any remaining test data using the main supabase client
      await supabase
        .from("encrypted_keys")
        .delete()
        .like("user_id", "test-user-%");

      await supabase
        .from("secure_families")
        .delete()
        .like("family_id", "test-family-%");

      await supabase.from("profiles").delete().like("id", "test-user-%");
    } catch (error) {
      console.warn("Global test cleanup warning:", error);
    }
  }
}

// Setup global test hooks
if (typeof globalThis !== "undefined") {
  // Cleanup on process exit
  process.on("exit", () => {
    globalTestCleanup();
  });

  process.on("SIGINT", () => {
    globalTestCleanup().then(() => process.exit(0));
  });

  process.on("SIGTERM", () => {
    globalTestCleanup().then(() => process.exit(0));
  });
}

export default TEST_CONFIG;
