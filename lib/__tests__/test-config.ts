// lib/__tests__/test-config.ts
import { config } from "dotenv";
import { resolve } from "path";

// Load test environment variables
config({ path: resolve(process.cwd(), ".env.test") });

// Ensure we're in test mode
process.env.NODE_ENV = "test";

// Test configuration constants
export const TEST_CONFIG = {
  SUPABASE_URL: process.env.SUPABASE_URL!,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!,
  DATABASE_URL: process.env.DATABASE_URL!,

  // Test user data
  TEST_USER_ID: "test-user-" + Date.now(),
  TEST_PASSWORD: "TestPassword123!",
  TEST_NEW_PASSWORD: "NewTestPassword456!",
  TEST_NSEC:
    "nsec1test1234567890abcdef1234567890abcdef1234567890abcdef1234567890",

  // Test database cleanup
  CLEANUP_AFTER_TESTS: true,
};

// Validate required environment variables
const requiredVars = ["SUPABASE_URL", "SUPABASE_ANON_KEY"];
for (const varName of requiredVars) {
  if (!process.env[varName]) {
    throw new Error(`Missing required test environment variable: ${varName}`);
  }
}

export default TEST_CONFIG;
