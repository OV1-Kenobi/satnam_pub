
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

// Vitest setup file for backend testing
import { afterAll, beforeAll } from "vitest";

/**
 * CRITICAL SECURITY: Master Context environment variable access pattern
 * Environment variables are automatically available in Netlify Functions testing
 */

// Setup test environment
beforeAll(() => {
  // Set up test environment variables if not already set
  if (!getEnvVar("SUPABASE_URL")) {
    getEnvVar("SUPABASE_URL") = "https://xyzcompany.supabase.co";
  }

  if (!getEnvVar("SUPABASE_SERVICE_ROLE_KEY")) {
    getEnvVar("SUPABASE_SERVICE_ROLE_KEY") =
      "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiYWRtaW4iOnRydWUsImp0aSI6IjEyMzQ1Njc4OTAiLCJpYXQiOjE2MjIyOTM2MDAsImV4cCI6MTYyMjMwMDgwMH0.demo-service-key-for-testing";
  }

  // Add missing credentials for secure storage tests
  if (!getEnvVar("SUPABASE_ANON_KEY")) {
    getEnvVar("SUPABASE_ANON_KEY") =
      "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiYWRtaW4iOmZhbHNlLCJqdGkiOiIxMjM0NTY3ODkwIiwiaWF0IjoxNjIyMjkzNjAwLCJleHAiOjE2MjIzMDA4MDB9.demo-anon-key-for-testing";
  }

  if (!getEnvVar("VOLTAGE_LNBITS_URL")) {
    getEnvVar("VOLTAGE_LNBITS_URL") = "https://demo.lnbits.com";
  }

  if (!getEnvVar("VOLTAGE_LNBITS_ADMIN_KEY")) {
    getEnvVar("VOLTAGE_LNBITS_ADMIN_KEY") = "demo-key";
  }

  // Enhanced Family Banking System test credentials (fallback to mock values)
  if (!getEnvVar("ZEUS_LSP_ENDPOINT")) {
    getEnvVar("ZEUS_LSP_ENDPOINT") = "https://mock.zeusln.app";
  }

  if (!getEnvVar("ZEUS_API_KEY")) {
    getEnvVar("ZEUS_API_KEY") = "mock-zeus-api-key";
  }

  if (!getEnvVar("VOLTAGE_NODE_ID")) {
    getEnvVar("VOLTAGE_NODE_ID") = "mock-voltage-node-id";
  }

  if (!getEnvVar("LNBITS_ADMIN_KEY")) {
    getEnvVar("LNBITS_ADMIN_KEY") = "mock-lnbits-admin-key";
  }

  // Test-specific environment variables
  if (!getEnvVar("TEST_FAMILY_ID")) {
    getEnvVar("TEST_FAMILY_ID") = "test-family-" + Date.now();
  }

  if (!getEnvVar("TEST_ADULT_MEMBER_ID")) {
    getEnvVar("TEST_ADULT_MEMBER_ID") = "test-adult-" + Date.now();
  }

  if (!getEnvVar("TEST_OFFSPRING_MEMBER_ID")) {
    getEnvVar("TEST_OFFSPRING_MEMBER_ID") = "test-offspring-" + Date.now();
  }

  // Check if real credentials are available
  const realCredentialsAvailable = Boolean(
    getEnvVar("ZEUS_LSP_ENDPOINT") &&
      getEnvVar("ZEUS_LSP_ENDPOINT") !== "https://mock.zeusln.app" &&
      getEnvVar("ZEUS_API_KEY") &&
      getEnvVar("ZEUS_API_KEY") !== "mock-zeus-api-key" &&
      getEnvVar("VOLTAGE_NODE_ID") &&
      getEnvVar("VOLTAGE_NODE_ID") !== "mock-voltage-node-id" &&
      getEnvVar("LNBITS_ADMIN_KEY") &&
      getEnvVar("LNBITS_ADMIN_KEY") !== "mock-lnbits-admin-key"
  );

  console.log("🔧 Test environment setup complete");
  console.log(`📡 Real credentials available: ${realCredentialsAvailable}`);

  if (realCredentialsAvailable) {
    console.log("✅ Integration tests will run with real services");
  } else {
    console.log("⚠️  Integration tests will run with mock data");
    console.log(
      "💡 To test with real services, set these environment variables:"
    );
    console.log("   - ZEUS_LSP_ENDPOINT");
    console.log("   - ZEUS_API_KEY");
    console.log("   - VOLTAGE_NODE_ID");
    console.log("   - LNBITS_ADMIN_KEY");
  }
});

afterAll(() => {
  console.log("🧹 Test cleanup complete");
});
