// Vitest setup file for backend testing
import dotenv from "dotenv";
import { afterAll, beforeAll } from "vitest";

// Load environment variables for testing
beforeAll(() => {
  // Load .env file for testing
  dotenv.config();

  // Set up test environment variables if not already set
  if (!process.env.SUPABASE_URL) {
    process.env.SUPABASE_URL = "https://xyzcompany.supabase.co";
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    process.env.SUPABASE_SERVICE_ROLE_KEY =
      "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiYWRtaW4iOnRydWUsImp0aSI6IjEyMzQ1Njc4OTAiLCJpYXQiOjE2MjIyOTM2MDAsImV4cCI6MTYyMjMwMDgwMH0.demo-service-key-for-testing";
  }

  // Add missing credentials for secure storage tests
  if (!process.env.SUPABASE_ANON_KEY) {
    process.env.SUPABASE_ANON_KEY =
      "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiYWRtaW4iOmZhbHNlLCJqdGkiOiIxMjM0NTY3ODkwIiwiaWF0IjoxNjIyMjkzNjAwLCJleHAiOjE2MjIzMDA4MDB9.demo-anon-key-for-testing";
  }

  if (!process.env.VOLTAGE_LNBITS_URL) {
    process.env.VOLTAGE_LNBITS_URL = "https://demo.lnbits.com";
  }

  if (!process.env.VOLTAGE_LNBITS_ADMIN_KEY) {
    process.env.VOLTAGE_LNBITS_ADMIN_KEY = "demo-key";
  }

  // Enhanced Family Banking System test credentials (fallback to mock values)
  if (!process.env.ZEUS_LSP_ENDPOINT) {
    process.env.ZEUS_LSP_ENDPOINT = "https://mock.zeusln.app";
  }

  if (!process.env.ZEUS_API_KEY) {
    process.env.ZEUS_API_KEY = "mock-zeus-api-key";
  }

  if (!process.env.VOLTAGE_NODE_ID) {
    process.env.VOLTAGE_NODE_ID = "mock-voltage-node-id";
  }

  if (!process.env.LNBITS_ADMIN_KEY) {
    process.env.LNBITS_ADMIN_KEY = "mock-lnbits-admin-key";
  }

  // Test-specific environment variables
  if (!process.env.TEST_FAMILY_ID) {
    process.env.TEST_FAMILY_ID = "test-family-" + Date.now();
  }

  if (!process.env.TEST_PARENT_MEMBER_ID) {
    process.env.TEST_PARENT_MEMBER_ID = "test-parent-" + Date.now();
  }

  if (!process.env.TEST_CHILD_MEMBER_ID) {
    process.env.TEST_CHILD_MEMBER_ID = "test-child-" + Date.now();
  }

  // Check if real credentials are available
  const realCredentialsAvailable = Boolean(
    process.env.ZEUS_LSP_ENDPOINT &&
      process.env.ZEUS_LSP_ENDPOINT !== "https://mock.zeusln.app" &&
      process.env.ZEUS_API_KEY &&
      process.env.ZEUS_API_KEY !== "mock-zeus-api-key" &&
      process.env.VOLTAGE_NODE_ID &&
      process.env.VOLTAGE_NODE_ID !== "mock-voltage-node-id" &&
      process.env.LNBITS_ADMIN_KEY &&
      process.env.LNBITS_ADMIN_KEY !== "mock-lnbits-admin-key",
  );

  console.log("🔧 Test environment setup complete");
  console.log(`📡 Real credentials available: ${realCredentialsAvailable}`);

  if (realCredentialsAvailable) {
    console.log("✅ Integration tests will run with real services");
  } else {
    console.log("⚠️  Integration tests will run with mock data");
    console.log(
      "💡 To test with real services, set these environment variables:",
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
