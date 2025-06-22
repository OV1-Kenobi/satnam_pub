/**
 * Test script for fail-open monitoring functionality
 * This script tests the rate limiter fail-open monitoring system
 */

import {
  DatabaseRateLimiter,
  getFailOpenMetrics,
  monitorFailOpenScenarios,
  resetFailOpenMetrics,
} from "../lib/security/rate-limiter";

async function testFailOpenMonitoring() {
  console.log("🧪 Testing Fail-Open Monitoring System");
  console.log("=".repeat(50));

  // Reset counters to start fresh
  resetFailOpenMetrics();
  console.log("✅ Reset fail-open metrics");

  // Test 1: Check initial state
  console.log("\n📊 Test 1: Initial State");
  const initialMetrics = getFailOpenMetrics();
  console.log("Initial metrics:", initialMetrics);

  // Test 2: Check monitoring function with no failures
  console.log("\n📊 Test 2: Monitor with no failures");
  const initialStatus = await monitorFailOpenScenarios();
  console.log("Status:", initialStatus.alertLevel);
  console.log("Message:", initialStatus.message);

  // Test 3: Simulate a database failure by calling checkRateLimit with invalid parameters
  console.log("\n📊 Test 3: Simulate database failure");
  try {
    // This should trigger a fail-open scenario
    await DatabaseRateLimiter.checkRateLimit(
      "test-key",
      60000, // 1 minute window
      5, // 5 requests max
      "test-identifier"
    );
    console.log("✅ Database call completed (may have failed open)");
  } catch (error) {
    console.log("⚠️  Database call failed:", error);
  }

  // Test 4: Check metrics after potential failure
  console.log("\n📊 Test 4: Check metrics after potential failure");
  const afterFailureMetrics = getFailOpenMetrics();
  console.log("Metrics after test:", afterFailureMetrics);

  // Test 5: Check monitoring status after potential failure
  console.log("\n📊 Test 5: Monitor after potential failure");
  const afterFailureStatus = await monitorFailOpenScenarios();
  console.log("Status:", afterFailureStatus.alertLevel);
  console.log("Message:", afterFailureStatus.message);

  // Test 6: Test reset functionality
  console.log("\n📊 Test 6: Test reset functionality");
  resetFailOpenMetrics();
  const resetMetrics = getFailOpenMetrics();
  console.log("Metrics after reset:", resetMetrics);

  console.log("\n✅ Fail-open monitoring test completed");
  console.log(
    "🔍 Check the security_audit_log table for 'rate_limit_fail_open' events"
  );
}

// Run the test
if (require.main === module) {
  testFailOpenMonitoring().catch(console.error);
}

export { testFailOpenMonitoring };
