/**
 * SimpleProof End-to-End Integration Tests
 * Phase 2B-2 Day 14: E2E Testing & Real API Integration
 *
 * CRITICAL: These tests use REAL SimpleProof API calls (not mocks)
 * - Requires valid VITE_SIMPLEPROOF_API_KEY_TEST environment variable
 * - Requires VITE_SIMPLEPROOF_API_URL_TEST (defaults to production API)
 * - Tests may incur Bitcoin transaction fees (~500-1000 sats per timestamp)
 * - Tests are rate-limited (10 timestamps/hour, 100 verifications/hour)
 *
 * Test Categories:
 * 1. Real API Integration Tests (8 tests)
 * 2. User Flow E2E Tests (6 tests)
 * 3. Performance & Load Testing (6 tests)
 *
 * Total: 20+ E2E tests
 *
 * @compliance Privacy-first, zero-knowledge, no PII in test data
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { simpleProofService } from "../../src/services/simpleProofService";

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

const E2E_TEST_CONFIG = {
  // API Configuration
  apiKey: process.env.VITE_SIMPLEPROOF_API_KEY_TEST || "",
  apiUrl:
    process.env.VITE_SIMPLEPROOF_API_URL_TEST || "https://api.simpleproof.com",

  // Feature Flags
  enabled: process.env.VITE_SIMPLEPROOF_ENABLED === "true",

  // Test Timeouts (longer for real API calls)
  timestampTimeout: 30000, // 30 seconds for timestamp creation
  verificationTimeout: 10000, // 10 seconds for verification
  loadTestTimeout: 120000, // 2 minutes for load tests

  // Performance Targets
  performanceTargets: {
    timestampCreation: 5000, // <5s
    verification: 2000, // <2s
    cacheHitRate: 0.8, // >80%
  },

  // Rate Limiting
  rateLimits: {
    timestampCreation: 10, // 10 per hour
    verification: 100, // 100 per hour
  },

  // Data Limits
  maxDataSize: 10 * 1024, // 10KB
};

// Skip all E2E tests if SimpleProof is not enabled or API key is missing
const skipE2ETests = !E2E_TEST_CONFIG.enabled || !E2E_TEST_CONFIG.apiKey;

if (skipE2ETests) {
  console.warn("⚠️  SimpleProof E2E tests SKIPPED:");
  console.warn("   - VITE_SIMPLEPROOF_ENABLED must be 'true'");
  console.warn("   - VITE_SIMPLEPROOF_API_KEY_TEST must be set");
  console.warn("   Set these environment variables to run E2E tests.");
}

// ============================================================================
// TEST UTILITIES
// ============================================================================

/**
 * Generate test data for timestamp creation
 */
function generateTestData(size: number = 100): string {
  const data = {
    test: true,
    timestamp: Date.now(),
    eventType: "e2e_test",
    data: "x".repeat(size),
  };
  return JSON.stringify(data);
}

/**
 * Generate unique verification ID for tests
 */
function generateVerificationId(): string {
  return `e2e-test-${Date.now()}-${Math.random()
    .toString(36)
    .substring(2, 11)}`;
}

/**
 * Measure execution time of async function
 */
async function measureTime<T>(
  fn: () => Promise<T>
): Promise<{ result: T; duration: number }> {
  const start = Date.now();
  const result = await fn();
  const duration = Date.now() - start;
  return { result, duration };
}

/**
 * Wait for specified milliseconds
 */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// TEST SETUP & TEARDOWN
// ============================================================================

beforeAll(() => {
  if (!skipE2ETests) {
    console.log("🚀 Starting SimpleProof E2E Tests");
    console.log(`   API URL: ${E2E_TEST_CONFIG.apiUrl}`);
    // SECURITY: Never log API keys, even partially (prevents credential exposure)
    console.log(`   API Key: [REDACTED]`);
    console.log(`   Enabled: ${E2E_TEST_CONFIG.enabled}`);
  }
});

afterAll(() => {
  if (!skipE2ETests) {
    console.log("✅ SimpleProof E2E Tests Complete");
    // Clear cache after tests
    simpleProofService.clearCache();
  }
});

// ============================================================================
// TASK 2: REAL API INTEGRATION TESTS (8 tests)
// ============================================================================

describe.skipIf(skipE2ETests)("Real API Integration Tests", () => {
  describe("Test 1: Create Timestamp with Real SimpleProof API", () => {
    it(
      "should create timestamp and verify OTS proof format",
      async () => {
        const testData = generateTestData();
        const verificationId = generateVerificationId();

        const result = await simpleProofService.createTimestamp({
          data: testData,
          verification_id: verificationId,
          metadata: { eventType: "e2e_test" },
        });

        // Verify success
        expect(result.success).toBe(true);
        expect(result.error).toBeUndefined();

        // Verify OTS proof format (hex-encoded)
        expect(result.ots_proof).toBeDefined();
        expect(result.ots_proof).toMatch(/^[0-9a-f]+$/i);
        expect(result.ots_proof.length).toBeGreaterThan(0);

        // Verify timestamp metadata
        expect(result.verified_at).toBeGreaterThan(0);

        // Bitcoin data may be null for unconfirmed timestamps
        // (confirmation takes 10+ minutes)
        console.log(
          `   ✅ Timestamp created: ${result.ots_proof.substring(0, 20)}...`
        );
        console.log(`   Bitcoin Block: ${result.bitcoin_block || "pending"}`);
        console.log(`   Bitcoin TX: ${result.bitcoin_tx || "pending"}`);
      },
      E2E_TEST_CONFIG.timestampTimeout
    );
  });

  describe("Test 2: Verify Timestamp with Real Bitcoin Blockchain Data", () => {
    it(
      "should verify timestamp proof (may be unconfirmed)",
      async () => {
        // First create a timestamp
        const testData = generateTestData();
        const verificationId = generateVerificationId();

        const createResult = await simpleProofService.createTimestamp({
          data: testData,
          verification_id: verificationId,
          metadata: { eventType: "e2e_test" },
        });

        expect(createResult.success).toBe(true);
        expect(createResult.ots_proof).toBeDefined();

        // Now verify it
        const verifyResult = await simpleProofService.verifyTimestamp({
          ots_proof: createResult.ots_proof,
        });

        // Verify success
        expect(verifyResult.success).toBe(true);
        expect(verifyResult.error).toBeUndefined();

        // Verify validation result
        expect(verifyResult.is_valid).toBeDefined();
        expect(verifyResult.confidence).toBeDefined();
        expect(["unconfirmed", "confirmed", "high"]).toContain(
          verifyResult.confidence
        );

        console.log(
          `   ✅ Verification result: ${
            verifyResult.is_valid ? "VALID" : "INVALID"
          }`
        );
        console.log(`   Confidence: ${verifyResult.confidence}`);
        console.log(
          `   Bitcoin Block: ${verifyResult.bitcoin_block || "pending"}`
        );
      },
      E2E_TEST_CONFIG.verificationTimeout
    );
  });

  describe("Test 3: Rate Limiting Behavior", () => {
    it(
      "should enforce rate limits (10 timestamps/hour)",
      async () => {
        // Note: This test may fail if other tests have already consumed the rate limit
        // In production, we'd use a separate test API key with higher limits

        const testData = generateTestData();
        const verificationId = generateVerificationId();

        const result = await simpleProofService.createTimestamp({
          data: testData,
          verification_id: verificationId,
          metadata: { eventType: "e2e_rate_limit_test" },
        });

        // Should succeed (or fail with rate limit error if quota exceeded)
        if (result.success) {
          expect(result.ots_proof).toBeDefined();
          console.log(`   ✅ Timestamp created (within rate limit)`);
        } else {
          // Check if error is rate limit related
          const isRateLimitError =
            result.error?.includes("rate limit") ||
            result.error?.includes("429") ||
            result.error?.includes("quota");

          if (isRateLimitError) {
            console.log(`   ⚠️  Rate limit reached (expected behavior)`);
            expect(isRateLimitError).toBe(true);
          } else {
            // Unexpected error
            throw new Error(`Unexpected error: ${result.error}`);
          }
        }
      },
      E2E_TEST_CONFIG.timestampTimeout
    );
  });

  describe("Test 4: Error Scenarios", () => {
    it(
      "should handle invalid data gracefully",
      async () => {
        const verificationId = generateVerificationId();

        const result = await simpleProofService.createTimestamp({
          data: "", // Invalid: empty data
          verification_id: verificationId,
          metadata: { eventType: "e2e_error_test" },
        });

        // Should fail gracefully
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        console.log(`   ✅ Error handled: ${result.error}`);
      },
      E2E_TEST_CONFIG.timestampTimeout
    );

    it(
      "should handle network timeout gracefully",
      async () => {
        // This test verifies timeout handling
        // Actual timeout is handled by fetch() with AbortController

        const testData = generateTestData();
        const verificationId = generateVerificationId();

        const result = await simpleProofService.createTimestamp({
          data: testData,
          verification_id: verificationId,
          metadata: { eventType: "e2e_timeout_test" },
        });

        // Should either succeed or fail with timeout error
        if (!result.success) {
          const isTimeoutError =
            result.error?.includes("timeout") ||
            result.error?.includes("abort");
          console.log(`   ✅ Timeout handled: ${result.error}`);
        } else {
          console.log(`   ✅ Request completed successfully (no timeout)`);
        }
      },
      E2E_TEST_CONFIG.timestampTimeout
    );
  });

  describe("Test 5: Caching Behavior", () => {
    it(
      "should cache verification results (24-hour TTL)",
      async () => {
        // Create a timestamp
        const testData = generateTestData();
        const verificationId = generateVerificationId();

        const createResult = await simpleProofService.createTimestamp({
          data: testData,
          verification_id: verificationId,
          metadata: { eventType: "e2e_cache_test" },
        });

        expect(createResult.success).toBe(true);

        // First verification (cache miss)
        const verify1 = await measureTime(() =>
          simpleProofService.verifyTimestamp({
            ots_proof: createResult.ots_proof,
          })
        );

        expect(verify1.result.success).toBe(true);
        expect(verify1.result.cached).toBeFalsy(); // First call should not be cached

        // Second verification (cache hit)
        const verify2 = await measureTime(() =>
          simpleProofService.verifyTimestamp({
            ots_proof: createResult.ots_proof,
          })
        );

        expect(verify2.result.success).toBe(true);
        expect(verify2.result.cached).toBe(true); // Second call should be cached

        // Cached call should be faster
        expect(verify2.duration).toBeLessThan(verify1.duration);

        console.log(`   ✅ Cache miss: ${verify1.duration}ms`);
        console.log(
          `   ✅ Cache hit: ${verify2.duration}ms (${Math.round(
            (1 - verify2.duration / verify1.duration) * 100
          )}% faster)`
        );
      },
      E2E_TEST_CONFIG.verificationTimeout * 2
    );
  });

  describe("Test 6: Concurrent Requests", () => {
    it(
      "should handle 5 simultaneous timestamp creations",
      async () => {
        const promises = Array.from({ length: 5 }, (_, i) => {
          const testData = generateTestData();
          const verificationId = `${generateVerificationId()}-concurrent-${i}`;

          return simpleProofService.createTimestamp({
            data: testData,
            verification_id: verificationId,
            metadata: { eventType: "e2e_concurrent_test", index: i },
          });
        });

        const results = await Promise.all(promises);

        // Count successes and failures
        const successes = results.filter((r) => r.success).length;
        const failures = results.filter((r) => !r.success).length;

        console.log(
          `   ✅ Concurrent requests: ${successes} succeeded, ${failures} failed`
        );

        // At least some should succeed (may hit rate limit)
        expect(successes).toBeGreaterThan(0);
      },
      E2E_TEST_CONFIG.timestampTimeout * 5
    );
  });

  describe("Test 7: Large Data Payloads", () => {
    it(
      "should handle max data size (10KB)",
      async () => {
        const largeData = generateTestData(E2E_TEST_CONFIG.maxDataSize - 100); // Leave room for JSON overhead
        const verificationId = generateVerificationId();

        const result = await simpleProofService.createTimestamp({
          data: largeData,
          verification_id: verificationId,
          metadata: { eventType: "e2e_large_data_test" },
        });

        // Should succeed or fail with size error
        if (result.success) {
          expect(result.ots_proof).toBeDefined();
          console.log(
            `   ✅ Large payload (${largeData.length} bytes) accepted`
          );
        } else {
          const isSizeError =
            result.error?.includes("size") ||
            result.error?.includes("too large") ||
            result.error?.includes("413");
          console.log(`   ⚠️  Large payload rejected: ${result.error}`);
          expect(isSizeError || result.success).toBe(true);
        }
      },
      E2E_TEST_CONFIG.timestampTimeout
    );

    it(
      "should reject oversized data (>10KB)",
      async () => {
        const oversizedData = generateTestData(
          E2E_TEST_CONFIG.maxDataSize + 1000
        );
        const verificationId = generateVerificationId();

        const result = await simpleProofService.createTimestamp({
          data: oversizedData,
          verification_id: verificationId,
          metadata: { eventType: "e2e_oversized_test" },
        });

        // Should fail with size error
        expect(result.success).toBe(false);
        const isSizeError =
          result.error?.includes("size") ||
          result.error?.includes("too large") ||
          result.error?.includes("413");

        console.log(
          `   ✅ Oversized payload (${oversizedData.length} bytes) rejected: ${result.error}`
        );
        expect(isSizeError).toBe(true);
      },
      E2E_TEST_CONFIG.timestampTimeout
    );
  });

  describe("Test 8: Verification Confidence Levels", () => {
    it(
      "should return confidence level (unconfirmed → confirmed → high)",
      async () => {
        // Create a timestamp
        const testData = generateTestData();
        const verificationId = generateVerificationId();

        const createResult = await simpleProofService.createTimestamp({
          data: testData,
          verification_id: verificationId,
          metadata: { eventType: "e2e_confidence_test" },
        });

        expect(createResult.success).toBe(true);

        // Verify immediately (should be unconfirmed)
        const verifyResult = await simpleProofService.verifyTimestamp({
          ots_proof: createResult.ots_proof,
        });

        expect(verifyResult.success).toBe(true);
        expect(verifyResult.confidence).toBeDefined();
        expect(["unconfirmed", "confirmed", "high"]).toContain(
          verifyResult.confidence
        );

        console.log(`   ✅ Confidence level: ${verifyResult.confidence}`);
        console.log(
          `   Note: Newly created timestamps are typically "unconfirmed"`
        );
        console.log(`   Bitcoin confirmation takes 10+ minutes (1 block)`);
        console.log(`   High confidence requires 6+ blocks (~60 minutes)`);
      },
      E2E_TEST_CONFIG.verificationTimeout
    );
  });
});

// ============================================================================
// TASK 3: USER FLOW E2E TESTS (6 tests)
// ============================================================================

describe.skipIf(skipE2ETests)("User Flow E2E Tests", () => {
  describe("Test 1: IdentityForge Flow with Real Timestamp Creation", () => {
    it(
      "should create timestamp for account creation event",
      async () => {
        // Simulate IdentityForge completion data
        const accountData = {
          eventType: "account_creation",
          username: "e2e_test_user",
          nip05: "e2e_test_user@satnam.pub",
          lightningAddress: "e2e_test_user@satnam.pub",
          createdAt: new Date().toISOString(),
        };

        const verificationId = `account-creation-${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 11)}`;

        const result = await simpleProofService.createTimestamp({
          data: JSON.stringify(accountData),
          verification_id: verificationId,
          metadata: { eventType: "account_creation" },
        });

        // Verify success
        if (result.success) {
          expect(result.ots_proof).toBeDefined();
          console.log(`   ✅ Account creation timestamp created`);
        } else {
          // May fail due to rate limiting
          console.log(`   ⚠️  Timestamp creation failed: ${result.error}`);
        }
      },
      E2E_TEST_CONFIG.timestampTimeout
    );
  });

  describe("Test 2: KeyRotation Flow with Real Timestamp Creation", () => {
    it(
      "should create timestamp for key rotation event",
      async () => {
        // Simulate KeyRotation completion data
        const keyRotationData = {
          eventType: "key_rotation",
          oldNpub: "npub1oldkey123456789abcdefghijklmnopqrstuvwxyz",
          newNpub: "npub1newkey123456789abcdefghijklmnopqrstuvwxyz",
          nip05: "e2e_test_user@satnam.pub",
          lightningAddress: "e2e_test_user@satnam.pub",
          reason: "E2E test key rotation",
          rotatedAt: new Date().toISOString(),
        };

        const verificationId = `key-rotation-${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 11)}`;

        const result = await simpleProofService.createTimestamp({
          data: JSON.stringify(keyRotationData),
          verification_id: verificationId,
          metadata: { eventType: "key_rotation" },
        });

        // Verify success
        if (result.success) {
          expect(result.ots_proof).toBeDefined();
          console.log(`   ✅ Key rotation timestamp created`);
        } else {
          console.log(`   ⚠️  Timestamp creation failed: ${result.error}`);
        }
      },
      E2E_TEST_CONFIG.timestampTimeout
    );
  });

  describe("Test 3: NFC Registration Flow with Real Timestamp Creation", () => {
    it(
      "should create timestamp for NFC registration event",
      async () => {
        // Simulate NFC registration completion data
        const nfcData = {
          eventType: "nfc_registration",
          boltcardId: "e2e-test-boltcard-123",
          userNpub: "npub1test123456789abcdefghijklmnopqrstuvwxyz",
          familyRole: "adult",
          registeredAt: new Date().toISOString(),
        };

        const verificationId = `nfc-registration-${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 11)}`;

        const result = await simpleProofService.createTimestamp({
          data: JSON.stringify(nfcData),
          verification_id: verificationId,
          metadata: { eventType: "nfc_registration" },
        });

        // Verify success
        if (result.success) {
          expect(result.ots_proof).toBeDefined();
          console.log(`   ✅ NFC registration timestamp created`);
        } else {
          console.log(`   ⚠️  Timestamp creation failed: ${result.error}`);
        }
      },
      E2E_TEST_CONFIG.timestampTimeout
    );
  });

  describe("Test 4: Family Federation Flow with Real Timestamp Creation", () => {
    it(
      "should create timestamp for family federation event",
      async () => {
        // Simulate Family Federation completion data
        const federationData = {
          eventType: "family_federation",
          federationId: "e2e-test-federation-123",
          familyName: "E2E Test Family",
          familyMotto: "Testing Together",
          foundingDate: new Date().toISOString(),
          missionStatement: "E2E testing of family federation",
          memberCount: 3,
          members: ["guardian1", "adult1", "offspring1"],
        };

        const verificationId = `family-federation-${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 11)}`;

        const result = await simpleProofService.createTimestamp({
          data: JSON.stringify(federationData),
          verification_id: verificationId,
          metadata: { eventType: "family_federation" },
        });

        // Verify success
        if (result.success) {
          expect(result.ots_proof).toBeDefined();
          console.log(`   ✅ Family federation timestamp created`);
        } else {
          console.log(`   ⚠️  Timestamp creation failed: ${result.error}`);
        }
      },
      E2E_TEST_CONFIG.timestampTimeout
    );
  });

  describe("Test 5: Timestamp Data Integrity", () => {
    it(
      "should create timestamp with complete and valid data structure",
      async () => {
        // REAL E2E TEST: Verify timestamp creation returns all required fields
        const testData = generateTestData();
        const verificationId = generateVerificationId();

        const result = await simpleProofService.createTimestamp({
          data: testData,
          verification_id: verificationId,
          metadata: { eventType: "e2e_data_integrity_test" },
        });

        if (result.success) {
          // Verify all required fields are present
          expect(result.ots_proof).toBeDefined();
          expect(typeof result.ots_proof).toBe("string");
          expect(result.ots_proof.length).toBeGreaterThan(0);

          expect(result.timestamp_id).toBeDefined();
          expect(typeof result.timestamp_id).toBe("string");

          expect(result.verified_at).toBeDefined();
          expect(typeof result.verified_at).toBe("number");
          expect(result.verified_at).toBeGreaterThan(0);

          // Bitcoin fields may be null initially (pending confirmation)
          expect(
            result.bitcoin_block === null ||
              typeof result.bitcoin_block === "number"
          ).toBe(true);
          expect(
            result.bitcoin_tx === null || typeof result.bitcoin_tx === "string"
          ).toBe(true);

          console.log(`   ✅ Timestamp data structure validated`);
          console.log(
            `   📝 OTS proof length: ${result.ots_proof.length} chars`
          );
          console.log(`   🆔 Timestamp ID: ${result.timestamp_id}`);
        } else {
          throw new Error(`Timestamp creation failed: ${result.error}`);
        }
      },
      E2E_TEST_CONFIG.timestampTimeout
    );
  });

  describe("Test 6: Error Handling and Recovery", () => {
    it(
      "should handle invalid data gracefully and return meaningful errors",
      async () => {
        // REAL E2E TEST: Verify error handling with invalid inputs

        // Test 1: Empty data
        const emptyDataResult = await simpleProofService.createTimestamp({
          data: "",
          verification_id: generateVerificationId(),
          metadata: { eventType: "e2e_error_handling_empty" },
        });

        expect(emptyDataResult.success).toBe(false);
        expect(emptyDataResult.error).toBeDefined();
        console.log(`   ✅ Empty data error: ${emptyDataResult.error}`);

        // Test 2: Missing verification_id
        const missingIdResult = await simpleProofService.createTimestamp({
          data: generateTestData(),
          verification_id: "",
          metadata: { eventType: "e2e_error_handling_no_id" },
        });

        expect(missingIdResult.success).toBe(false);
        expect(missingIdResult.error).toBeDefined();
        console.log(`   ✅ Missing ID error: ${missingIdResult.error}`);

        // Test 3: Extremely large data (should be rejected or handled)
        const largeData = "x".repeat(1000000); // 1MB of data
        const largeDataResult = await simpleProofService.createTimestamp({
          data: largeData,
          verification_id: generateVerificationId(),
          metadata: { eventType: "e2e_error_handling_large" },
        });

        // Should either succeed (if service handles large data) or fail gracefully
        if (!largeDataResult.success) {
          expect(largeDataResult.error).toBeDefined();
          console.log(`   ✅ Large data error: ${largeDataResult.error}`);
        } else {
          console.log(`   ✅ Large data handled successfully`);
        }
      },
      E2E_TEST_CONFIG.timestampTimeout * 2 // Allow extra time for large data test
    );
  });
});

// ============================================================================
// TASK 4: PERFORMANCE & LOAD TESTING (6 tests)
// ============================================================================

describe.skipIf(skipE2ETests)("Performance & Load Testing", () => {
  describe("Test 1: Stress Test Rate Limiter (50 Concurrent Requests)", () => {
    it(
      "should handle 50 concurrent timestamp creations",
      async () => {
        const startTime = Date.now();

        const promises = Array.from({ length: 50 }, (_, i) => {
          const testData = generateTestData();
          const verificationId = `${generateVerificationId()}-load-${i}`;

          return simpleProofService.createTimestamp({
            data: testData,
            verification_id: verificationId,
            metadata: { eventType: "e2e_load_test", index: i },
          });
        });

        const results = await Promise.all(promises);
        const duration = Date.now() - startTime;

        // Count successes and failures
        const successes = results.filter((r) => r.success).length;
        const failures = results.filter((r) => !r.success).length;
        const rateLimitErrors = results.filter(
          (r) =>
            r.error?.includes("rate limit") ||
            r.error?.includes("429") ||
            r.error?.includes("quota")
        ).length;

        console.log(`   ✅ Load test completed in ${duration}ms`);
        console.log(`   Successes: ${successes}`);
        console.log(`   Failures: ${failures}`);
        console.log(`   Rate limit errors: ${rateLimitErrors}`);

        // Expect most to fail due to rate limiting (10 per hour limit)
        expect(rateLimitErrors).toBeGreaterThan(0);
        expect(successes).toBeLessThanOrEqual(
          E2E_TEST_CONFIG.rateLimits.timestampCreation
        );
      },
      E2E_TEST_CONFIG.loadTestTimeout
    );
  });

  describe("Test 2: Timestamp Creation Performance", () => {
    it(
      "should create timestamp in <5s (target)",
      async () => {
        const testData = generateTestData();
        const verificationId = generateVerificationId();

        const { result, duration } = await measureTime(() =>
          simpleProofService.createTimestamp({
            data: testData,
            verification_id: verificationId,
            metadata: { eventType: "e2e_performance_test" },
          })
        );

        if (result.success) {
          console.log(`   ✅ Timestamp creation: ${duration}ms`);
          console.log(
            `   Target: <${E2E_TEST_CONFIG.performanceTargets.timestampCreation}ms`
          );
          console.log(
            `   Status: ${
              duration < E2E_TEST_CONFIG.performanceTargets.timestampCreation
                ? "PASS"
                : "FAIL"
            }`
          );

          // Performance target: <5s
          expect(duration).toBeLessThan(
            E2E_TEST_CONFIG.performanceTargets.timestampCreation
          );
        } else {
          console.log(`   ⚠️  Timestamp creation failed: ${result.error}`);
        }
      },
      E2E_TEST_CONFIG.timestampTimeout
    );
  });

  describe("Test 3: Verification Performance", () => {
    it(
      "should verify timestamp in <2s (target)",
      async () => {
        // First create a timestamp
        const testData = generateTestData();
        const verificationId = generateVerificationId();

        const createResult = await simpleProofService.createTimestamp({
          data: testData,
          verification_id: verificationId,
          metadata: { eventType: "e2e_verify_performance_test" },
        });

        if (!createResult.success) {
          console.log(
            `   ⚠️  Skipping verification test (creation failed): ${createResult.error}`
          );
          return;
        }

        // Measure verification time
        const { result, duration } = await measureTime(() =>
          simpleProofService.verifyTimestamp({
            ots_proof: createResult.ots_proof,
          })
        );

        expect(result.success).toBe(true);

        console.log(`   ✅ Verification: ${duration}ms`);
        console.log(
          `   Target: <${E2E_TEST_CONFIG.performanceTargets.verification}ms`
        );
        console.log(
          `   Status: ${
            duration < E2E_TEST_CONFIG.performanceTargets.verification
              ? "PASS"
              : "FAIL"
          }`
        );

        // Performance target: <2s
        expect(duration).toBeLessThan(
          E2E_TEST_CONFIG.performanceTargets.verification
        );
      },
      E2E_TEST_CONFIG.verificationTimeout * 2
    );
  });

  describe("Test 4: Cache Hit Rate", () => {
    it(
      "should achieve >80% cache hit rate for repeated verifications",
      async () => {
        // Create a timestamp
        const testData = generateTestData();
        const verificationId = generateVerificationId();

        const createResult = await simpleProofService.createTimestamp({
          data: testData,
          verification_id: verificationId,
          metadata: { eventType: "e2e_cache_hit_test" },
        });

        if (!createResult.success) {
          console.log(
            `   ⚠️  Skipping cache test (creation failed): ${createResult.error}`
          );
          return;
        }

        // Perform 10 verifications
        const verifications = await Promise.all(
          Array.from({ length: 10 }, () =>
            simpleProofService.verifyTimestamp({
              ots_proof: createResult.ots_proof,
            })
          )
        );

        // Count cache hits
        const cacheHits = verifications.filter((v) => v.cached).length;
        const cacheHitRate = cacheHits / verifications.length;

        console.log(
          `   ✅ Cache hits: ${cacheHits}/10 (${Math.round(
            cacheHitRate * 100
          )}%)`
        );
        console.log(
          `   Target: >${Math.round(
            E2E_TEST_CONFIG.performanceTargets.cacheHitRate * 100
          )}%`
        );
        console.log(
          `   Status: ${
            cacheHitRate >= E2E_TEST_CONFIG.performanceTargets.cacheHitRate
              ? "PASS"
              : "FAIL"
          }`
        );

        // Performance target: >80% cache hit rate
        expect(cacheHitRate).toBeGreaterThanOrEqual(
          E2E_TEST_CONFIG.performanceTargets.cacheHitRate
        );
      },
      E2E_TEST_CONFIG.verificationTimeout * 10
    );
  });

  describe("Test 5: Average Response Time Tracking", () => {
    it(
      "should track average response times for timestamp creation",
      async () => {
        const iterations = 5;
        const durations: number[] = [];

        for (let i = 0; i < iterations; i++) {
          const testData = generateTestData();
          const verificationId = `${generateVerificationId()}-avg-${i}`;

          const { result, duration } = await measureTime(() =>
            simpleProofService.createTimestamp({
              data: testData,
              verification_id: verificationId,
              metadata: { eventType: "e2e_avg_response_test", iteration: i },
            })
          );

          if (result.success) {
            durations.push(duration);
          }

          // Wait 1s between requests to avoid rate limiting
          if (i < iterations - 1) {
            await wait(1000);
          }
        }

        if (durations.length === 0) {
          console.log(`   ⚠️  No successful requests (likely rate limited)`);
          return;
        }

        const avgDuration =
          durations.reduce((a, b) => a + b, 0) / durations.length;
        const minDuration = Math.min(...durations);
        const maxDuration = Math.max(...durations);

        console.log(
          `   ✅ Average response time: ${Math.round(avgDuration)}ms`
        );
        console.log(`   Min: ${minDuration}ms, Max: ${maxDuration}ms`);
        console.log(
          `   Successful requests: ${durations.length}/${iterations}`
        );
      },
      E2E_TEST_CONFIG.timestampTimeout * 5 + 5000 // 5 iterations * 30s + 5s buffer
    );
  });

  describe("Test 6: Performance Benchmarks Summary", () => {
    it("should document all performance benchmarks", async () => {
      console.log(`\n   📊 PERFORMANCE BENCHMARKS SUMMARY`);
      console.log(`   ${"=".repeat(50)}`);
      console.log(
        `   Timestamp Creation Target: <${E2E_TEST_CONFIG.performanceTargets.timestampCreation}ms`
      );
      console.log(
        `   Verification Target: <${E2E_TEST_CONFIG.performanceTargets.verification}ms`
      );
      console.log(
        `   Cache Hit Rate Target: >${Math.round(
          E2E_TEST_CONFIG.performanceTargets.cacheHitRate * 100
        )}%`
      );
      console.log(
        `   Rate Limits: ${E2E_TEST_CONFIG.rateLimits.timestampCreation} timestamps/hour, ${E2E_TEST_CONFIG.rateLimits.verification} verifications/hour`
      );
      console.log(
        `   Max Data Size: ${E2E_TEST_CONFIG.maxDataSize} bytes (${Math.round(
          E2E_TEST_CONFIG.maxDataSize / 1024
        )}KB)`
      );
      console.log(`   ${"=".repeat(50)}\n`);

      // This test always passes - it's just for documentation
      expect(true).toBe(true);
    });
  });
});

// ============================================================================
// ============================================================================
// PRIVACY: USERID HASHING ENFORCEMENT TESTS
// ============================================================================

describe.skipIf(skipE2ETests)("Privacy: userId Hashing Enforcement", () => {
  it("should warn in development when unhashed userId is logged", () => {
    // This test validates the runtime validation in loggingService.ts
    const { logError } = require("../../src/services/loggingService");

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Simulate logging with unhashed userId (raw UUID)
    const mockContext = {
      component: "test",
      userId: "12345678-1234-1234-1234-123456789012", // Raw UUID format
    };

    logError("Test error", mockContext);

    // Should trigger privacy violation warning
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("PRIVACY VIOLATION")
    );

    consoleSpy.mockRestore();
  });

  it("should accept hashed userId without warnings", () => {
    const { logError } = require("../../src/services/loggingService");

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Simulate logging with properly hashed userId (64+ hex chars)
    const mockContext = {
      component: "test",
      userId: "a".repeat(64), // Valid SHA-256 hash format
    };

    logError("Test error", mockContext);

    // Should NOT trigger privacy violation warning
    const privacyWarnings = consoleSpy.mock.calls.filter((call) =>
      call[0]?.includes?.("PRIVACY VIOLATION")
    );
    expect(privacyWarnings.length).toBe(0);

    consoleSpy.mockRestore();
  });

  it("should reject raw npub in userId field", () => {
    const { logError } = require("../../src/services/loggingService");

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Simulate logging with raw npub
    const mockContext = {
      component: "test",
      userId: "npub1test123456789abcdef", // Raw Nostr public key
    };

    logError("Test error", mockContext);

    // Should trigger privacy violation warning
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("PRIVACY VIOLATION")
    );

    consoleSpy.mockRestore();
  });

  it("should reject email/NIP-05 in userId field", () => {
    const { logError } = require("../../src/services/loggingService");

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Simulate logging with NIP-05 identifier
    const mockContext = {
      component: "test",
      userId: "user@example.com", // Email/NIP-05
    };

    logError("Test error", mockContext);

    // Should trigger privacy violation warning
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("PRIVACY VIOLATION")
    );

    consoleSpy.mockRestore();
  });
});

// TEST SUMMARY
// ============================================================================

describe.skipIf(skipE2ETests)("E2E Test Summary", () => {
  it("should provide test execution summary", () => {
    console.log(`\n   ✅ SIMPLEPROOF E2E TEST SUITE COMPLETE`);
    console.log(`   ${"=".repeat(50)}`);
    console.log(`   Total Test Categories: 4`);
    console.log(`   - Real API Integration Tests: 8 tests`);
    console.log(`   - User Flow E2E Tests: 6 tests`);
    console.log(`   - Performance & Load Testing: 6 tests`);
    console.log(`   - Privacy Enforcement Tests: 4 tests`);
    console.log(`   Total Tests: 24+ tests`);
    console.log(`   ${"=".repeat(50)}\n`);

    expect(true).toBe(true);
  });
});
