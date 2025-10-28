/**
 * Unified Federated Signing Service Tests
 * Comprehensive test suite for FROST + SSS integration
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { UnifiedSigningRequest } from "../lib/federated-signing/unified-service";
import { UnifiedFederatedSigningService } from "../lib/federated-signing/unified-service";

// Test constants
const TEST_FAMILY_ID = "test-family-" + Date.now();
const TEST_MESSAGE_HASH = "test-message-hash-" + Date.now();
const TEST_PARTICIPANTS = [
  "guardian1-" + Date.now(),
  "guardian2-" + Date.now(),
  "guardian3-" + Date.now(),
];
const TEST_THRESHOLD = 2;
const TEST_CREATED_BY = "test-creator-" + Date.now();

describe("Unified Federated Signing Service", () => {
  let service: UnifiedFederatedSigningService;
  let testSessionId: string | undefined;

  beforeEach(() => {
    service = UnifiedFederatedSigningService.getInstance();
  });

  afterEach(async () => {
    // Cleanup test session if created
    if (testSessionId) {
      try {
        await service.failSession(testSessionId, "Test cleanup");
      } catch {
        // Ignore cleanup errors
      }
      testSessionId = undefined;
    }
  });

  describe("Singleton Pattern", () => {
    it("should return the same instance", () => {
      const instance1 = UnifiedFederatedSigningService.getInstance();
      const instance2 = UnifiedFederatedSigningService.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe("Method Selection", () => {
    it("should select FROST for daily operations", () => {
      const method = service.selectSigningMethod("daily_operations");
      expect(method).toBe("frost");
    });

    it("should select FROST for high value transactions", () => {
      const method = service.selectSigningMethod("high_value_transaction");
      expect(method).toBe("frost");
    });

    it("should select FROST for Fedimint integration", () => {
      const method = service.selectSigningMethod("fedimint_integration");
      expect(method).toBe("frost");
    });

    it("should select SSS for emergency recovery", () => {
      const method = service.selectSigningMethod("emergency_recovery");
      expect(method).toBe("sss");
    });

    it("should select SSS for key rotation", () => {
      const method = service.selectSigningMethod("key_rotation");
      expect(method).toBe("sss");
    });

    it("should select SSS for performance critical operations", () => {
      const method = service.selectSigningMethod("performance_critical");
      expect(method).toBe("sss");
    });

    it("should select SSS for offline guardians", () => {
      const method = service.selectSigningMethod("offline_guardians");
      expect(method).toBe("sss");
    });

    it("should honor explicit method preference", () => {
      const method = service.selectSigningMethod("daily_operations", "sss");
      expect(method).toBe("sss");
    });

    it("should default to FROST when no use case specified", () => {
      const method = service.selectSigningMethod();
      expect(method).toBe("frost");
    });
  });

  describe("Method Recommendations", () => {
    it("should provide recommendation for daily operations", () => {
      const rec = service.getMethodRecommendation("daily_operations");

      expect(rec.method).toBe("frost");
      expect(rec.reason).toContain("maximum security");
      expect(rec.performance).toContain("450-900ms");
      expect(rec.security).toContain("Maximum");
    });

    it("should provide recommendation for emergency recovery", () => {
      const rec = service.getMethodRecommendation("emergency_recovery");

      expect(rec.method).toBe("sss");
      expect(rec.reason).toContain("fast key recovery");
      expect(rec.performance).toContain("150-300ms");
      expect(rec.security).toContain("Good");
    });

    it("should provide recommendation for Fedimint integration", () => {
      const rec = service.getMethodRecommendation("fedimint_integration");

      expect(rec.method).toBe("frost");
      expect(rec.reason).toContain("Fedimint");
      expect(rec.performance).toBeDefined();
      expect(rec.security).toBeDefined();
    });

    it("should provide recommendation for key rotation", () => {
      const rec = service.getMethodRecommendation("key_rotation");

      expect(rec.method).toBe("sss");
      expect(rec.reason).toContain("key rotation");
      expect(rec.performance).toBeDefined();
      expect(rec.security).toBeDefined();
    });
  });

  describe("FROST Integration", () => {
    it("should create FROST signing request for daily operations", async () => {
      const request: UnifiedSigningRequest = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
        useCase: "daily_operations",
      };

      const result = await service.createSigningRequest(request);

      expect(result.success).toBe(true);
      expect(result.method).toBe("frost");
      expect(result.sessionId).toBeDefined();
      expect(result.status).toBe("pending");

      testSessionId = result.sessionId;
    });

    it("should create FROST request with event template", async () => {
      const eventTemplate = {
        kind: 1,
        content: "Test event",
        tags: [],
        created_at: Math.floor(Date.now() / 1000),
      };

      const request: UnifiedSigningRequest = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        eventTemplate,
        eventType: "test_event",
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
        preferredMethod: "frost",
      };

      const result = await service.createSigningRequest(request);

      expect(result.success).toBe(true);
      expect(result.method).toBe("frost");

      testSessionId = result.sessionId;
    });

    it("should submit nonce commitment to FROST session", async () => {
      // Create session first
      const request: UnifiedSigningRequest = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
        preferredMethod: "frost",
      };

      const createResult = await service.createSigningRequest(request);
      testSessionId = createResult.sessionId;

      // Submit nonce
      const nonceResult = await service.submitNonceCommitment(
        testSessionId!,
        TEST_PARTICIPANTS[0],
        "nonce-" + Date.now()
      );

      expect(nonceResult.success).toBe(true);
      expect(nonceResult.nonceCount).toBe(1);
    });

    it("should submit partial signature to FROST session", async () => {
      // Create session and submit nonces
      const request: UnifiedSigningRequest = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
        preferredMethod: "frost",
      };

      const createResult = await service.createSigningRequest(request);
      testSessionId = createResult.sessionId;

      // Submit nonces to reach signing state
      await service.submitNonceCommitment(
        testSessionId!,
        TEST_PARTICIPANTS[0],
        "nonce1-" + Date.now()
      );
      await service.submitNonceCommitment(
        testSessionId!,
        TEST_PARTICIPANTS[1],
        "nonce2-" + Date.now()
      );

      // Submit partial signature
      const sigResult = await service.submitPartialSignature(
        testSessionId!,
        TEST_PARTICIPANTS[0],
        "sig-" + Date.now()
      );

      expect(sigResult.success).toBe(true);
      expect(sigResult.signatureCount).toBe(1);
    });

    it("should aggregate FROST signatures", async () => {
      // Create session, submit nonces and signatures
      const request: UnifiedSigningRequest = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
        preferredMethod: "frost",
      };

      const createResult = await service.createSigningRequest(request);
      testSessionId = createResult.sessionId;

      // Submit nonces
      await service.submitNonceCommitment(
        testSessionId!,
        TEST_PARTICIPANTS[0],
        "nonce1-" + Date.now()
      );
      await service.submitNonceCommitment(
        testSessionId!,
        TEST_PARTICIPANTS[1],
        "nonce2-" + Date.now()
      );

      // Submit signatures
      await service.submitPartialSignature(
        testSessionId!,
        TEST_PARTICIPANTS[0],
        "sig1-" + Date.now()
      );
      await service.submitPartialSignature(
        testSessionId!,
        TEST_PARTICIPANTS[1],
        "sig2-" + Date.now()
      );

      // Aggregate
      const aggResult = await service.aggregateSignatures(testSessionId!);

      expect(aggResult.success).toBe(true);
      expect(aggResult.finalSignature).toBeDefined();
    });
  });

  describe("SSS Integration", () => {
    it("should create SSS signing request for emergency recovery", async () => {
      const request: UnifiedSigningRequest = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
        useCase: "emergency_recovery",
      };

      const result = await service.createSigningRequest(request);

      expect(result.success).toBe(true);
      expect(result.method).toBe("sss");
      expect(result.sessionId).toBeDefined();

      testSessionId = result.sessionId;
    });

    it("should create SSS request with explicit method preference", async () => {
      const request: UnifiedSigningRequest = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
        preferredMethod: "sss",
      };

      const result = await service.createSigningRequest(request);

      expect(result.success).toBe(true);
      expect(result.method).toBe("sss");

      testSessionId = result.sessionId;
    });
  });

  describe("Session Status", () => {
    it("should get FROST session status", async () => {
      const request: UnifiedSigningRequest = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
        preferredMethod: "frost",
      };

      const createResult = await service.createSigningRequest(request);
      testSessionId = createResult.sessionId;

      const statusResult = await service.getSessionStatus(testSessionId!);

      expect(statusResult.success).toBe(true);
      expect(statusResult.method).toBe("frost");
      expect(statusResult.status).toBe("pending");
      expect(statusResult.data).toBeDefined();
    });

    it("should return error for non-existent session", async () => {
      const statusResult = await service.getSessionStatus("non-existent-id");

      expect(statusResult.success).toBe(false);
      expect(statusResult.error).toContain("not found");
    });

    it("should get session status with method hint", async () => {
      const request: UnifiedSigningRequest = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
        preferredMethod: "frost",
      };

      const createResult = await service.createSigningRequest(request);
      testSessionId = createResult.sessionId;

      const statusResult = await service.getSessionStatus(
        testSessionId!,
        "frost"
      );

      expect(statusResult.success).toBe(true);
      expect(statusResult.method).toBe("frost");
    });
  });

  describe("Session Failure", () => {
    it("should fail FROST session with error message", async () => {
      const request: UnifiedSigningRequest = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
        preferredMethod: "frost",
      };

      const createResult = await service.createSigningRequest(request);
      testSessionId = createResult.sessionId;

      const failResult = await service.failSession(
        testSessionId!,
        "Test error message"
      );

      expect(failResult.success).toBe(true);
      expect(failResult.status).toBe("failed");

      // Verify status updated
      const statusResult = await service.getSessionStatus(testSessionId!);
      expect(statusResult.data?.status).toBe("failed");
    });

    it("should fail session with method hint", async () => {
      const request: UnifiedSigningRequest = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
        preferredMethod: "frost",
      };

      const createResult = await service.createSigningRequest(request);
      testSessionId = createResult.sessionId;

      const failResult = await service.failSession(
        testSessionId!,
        "Test error",
        "frost"
      );

      expect(failResult.success).toBe(true);
      expect(failResult.method).toBe("frost");
    });
  });

  describe("Session Cleanup", () => {
    it("should cleanup expired sessions", async () => {
      const result = await service.cleanupExpiredSessions();

      expect(result.success).toBe(true);
      expect(result.frostCleaned).toBeGreaterThanOrEqual(0);
      expect(result.sssCleaned).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid threshold", async () => {
      const request: UnifiedSigningRequest = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: 10, // Invalid: exceeds max
        createdBy: TEST_CREATED_BY,
        preferredMethod: "frost",
      };

      const result = await service.createSigningRequest(request);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should handle participants less than threshold", async () => {
      const request: UnifiedSigningRequest = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: ["guardian1"],
        threshold: 2, // More than participants
        createdBy: TEST_CREATED_BY,
        preferredMethod: "frost",
      };

      const result = await service.createSigningRequest(request);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("Backward Compatibility", () => {
    it("should maintain compatibility with existing SSS API", async () => {
      const request: UnifiedSigningRequest = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
        preferredMethod: "sss",
      };

      const result = await service.createSigningRequest(request);

      expect(result.success).toBe(true);
      expect(result.method).toBe("sss");
      expect(result.sessionId).toBeDefined();

      testSessionId = result.sessionId;
    });
  });
});
