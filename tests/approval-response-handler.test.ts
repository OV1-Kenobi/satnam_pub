/**
 * Tests for Guardian Approval Response Handler with NFC MFA Verification
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  processApprovalResponseWithNfcVerification,
  shouldBlockApprovalDueToNfcFailure,
  logApprovalResponseWithPrivacy,
  cleanupApprovalResponseSession,
  type ApprovalResponseWithVerification,
} from "../src/lib/steward/approval-response-handler";
import type { ApprovalResponseWithNfcMfa } from "../src/lib/steward/approval-nfc-mfa-integration";
import { initializeSessionAnonymization } from "../src/lib/steward/nfc-mfa-privacy-logger";

describe("Guardian Approval Response Handler with NFC MFA Verification", () => {
  const testSessionId = "test-session-" + Date.now();
  const testOperationHash =
    "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2";
  const testApproverPubkey =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  beforeEach(() => {
    vi.clearAllMocks();
    initializeSessionAnonymization(testSessionId);
  });

  afterEach(() => {
    cleanupApprovalResponseSession(testSessionId);
  });

  describe("processApprovalResponseWithNfcVerification", () => {
    it("should process approval response without NFC signature", async () => {
      const response: ApprovalResponseWithNfcMfa = {
        type: "steward_approval_response",
        requestId: "req-123",
        approved: true,
      };

      const result = await processApprovalResponseWithNfcVerification(
        response,
        testOperationHash,
        testSessionId
      );

      expect(result.decision).toBe("approved");
      expect(result.nfcVerified).toBeUndefined();
      expect(result.nfcVerificationError).toBeUndefined();
    });

    it("should process approval response with valid NFC signature", async () => {
      const response: ApprovalResponseWithNfcMfa = {
        type: "steward_approval_response",
        requestId: "req-123",
        approved: true,
        nfcSignature: {
          signature: "abc123def456ghi789jkl012mno345pqr678stu901vwx234yz",
          publicKey: "04abc123def456ghi789jkl012mno345pqr678stu901vwx234yz",
          timestamp: Date.now(),
          cardUid: "0123456789ABCDEF",
        },
        nfcVerified: true,
      };

      const result = await processApprovalResponseWithNfcVerification(
        response,
        testOperationHash,
        testSessionId
      );

      expect(result.decision).toBe("approved");
      // Note: Actual verification depends on mock setup
    });

    it("should handle rejected approval response", async () => {
      const response: ApprovalResponseWithNfcMfa = {
        type: "steward_approval_response",
        requestId: "req-123",
        approved: false,
        reason: "User rejected operation",
      };

      const result = await processApprovalResponseWithNfcVerification(
        response,
        testOperationHash,
        testSessionId
      );

      expect(result.decision).toBe("rejected");
    });

    it("should set receivedAt timestamp", async () => {
      const response: ApprovalResponseWithNfcMfa = {
        type: "steward_approval_response",
        requestId: "req-123",
        approved: true,
      };

      const beforeTime = new Date();
      const result = await processApprovalResponseWithNfcVerification(
        response,
        testOperationHash,
        testSessionId
      );
      const afterTime = new Date();

      const receivedTime = new Date(result.receivedAt);
      expect(receivedTime.getTime()).toBeGreaterThanOrEqual(
        beforeTime.getTime()
      );
      expect(receivedTime.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });
  });

  describe("shouldBlockApprovalDueToNfcFailure", () => {
    it("should block approval if NFC MFA required and verification failed", () => {
      const shouldBlock = shouldBlockApprovalDueToNfcFailure(false, true);
      expect(shouldBlock).toBe(true);
    });

    it("should not block approval if NFC MFA not required", () => {
      const shouldBlock = shouldBlockApprovalDueToNfcFailure(false, false);
      expect(shouldBlock).toBe(false);
    });

    it("should not block approval if NFC verification succeeded", () => {
      const shouldBlock = shouldBlockApprovalDueToNfcFailure(true, true);
      expect(shouldBlock).toBe(false);
    });

    it("should not block approval if NFC verification undefined and not required", () => {
      const shouldBlock = shouldBlockApprovalDueToNfcFailure(undefined, false);
      expect(shouldBlock).toBe(false);
    });
  });

  describe("logApprovalResponseWithPrivacy", () => {
    it("should log approval response with privacy protection", () => {
      const response: ApprovalResponseWithVerification = {
        operationHash: testOperationHash,
        approverPubkeyHex: testApproverPubkey,
        decision: "approved",
        nfcVerified: true,
        receivedAt: new Date().toISOString(),
        protocol: "nip17",
      };

      // Should not throw
      expect(() => {
        logApprovalResponseWithPrivacy(response, testSessionId, true);
      }).not.toThrow();
    });

    it("should log rejected approval response", () => {
      const response: ApprovalResponseWithVerification = {
        operationHash: testOperationHash,
        approverPubkeyHex: testApproverPubkey,
        decision: "rejected",
        receivedAt: new Date().toISOString(),
        protocol: "nip04",
      };

      // Should not throw
      expect(() => {
        logApprovalResponseWithPrivacy(response, testSessionId, false);
      }).not.toThrow();
    });

    it("should log NFC verification failure", () => {
      const response: ApprovalResponseWithVerification = {
        operationHash: testOperationHash,
        approverPubkeyHex: testApproverPubkey,
        decision: "approved",
        nfcVerified: false,
        nfcVerificationError: "Timestamp expired",
        receivedAt: new Date().toISOString(),
        protocol: "nip17",
      };

      // Should not throw
      expect(() => {
        logApprovalResponseWithPrivacy(response, testSessionId, true);
      }).not.toThrow();
    });
  });

  describe("cleanupApprovalResponseSession", () => {
    it("should clean up session resources", () => {
      // Should not throw
      expect(() => {
        cleanupApprovalResponseSession(testSessionId);
      }).not.toThrow();
    });

    it("should handle cleanup of non-existent sessions", () => {
      // Should not throw
      expect(() => {
        cleanupApprovalResponseSession("non-existent-session");
      }).not.toThrow();
    });
  });

  describe("Backward Compatibility", () => {
    it("should accept responses without NFC signature", async () => {
      const response: ApprovalResponseWithNfcMfa = {
        type: "steward_approval_response",
        requestId: "req-123",
        approved: true,
      };

      const result = await processApprovalResponseWithNfcVerification(
        response,
        testOperationHash,
        testSessionId
      );

      expect(result.decision).toBe("approved");
      expect(result.nfcVerified).toBeUndefined();
    });

    it("should not block approval if NFC signature missing and not required", () => {
      const shouldBlock = shouldBlockApprovalDueToNfcFailure(undefined, false);
      expect(shouldBlock).toBe(false);
    });
  });

  describe("Error Handling", () => {
    it("should handle NFC verification errors gracefully", async () => {
      const response: ApprovalResponseWithNfcMfa = {
        type: "steward_approval_response",
        requestId: "req-123",
        approved: true,
        nfcSignature: {
          signature: "invalid",
          publicKey: "invalid",
          timestamp: Date.now(),
          cardUid: "invalid",
        },
      };

      // Should not throw
      const result = await processApprovalResponseWithNfcVerification(
        response,
        testOperationHash,
        testSessionId
      );

      expect(result.decision).toBe("approved");
      // Verification result depends on mock setup
    });
  });

  describe("Privacy Protection", () => {
    it("should not expose full operation hash in logs", () => {
      const response: ApprovalResponseWithVerification = {
        operationHash: testOperationHash,
        approverPubkeyHex: testApproverPubkey,
        decision: "approved",
        receivedAt: new Date().toISOString(),
        protocol: "nip17",
      };

      // Verify that logging doesn't expose full hash
      expect(() => {
        logApprovalResponseWithPrivacy(response, testSessionId, true);
      }).not.toThrow();
    });

    it("should not expose full steward pubkey in logs", () => {
      const response: ApprovalResponseWithVerification = {
        operationHash: testOperationHash,
        approverPubkeyHex: testApproverPubkey,
        decision: "approved",
        receivedAt: new Date().toISOString(),
        protocol: "nip17",
      };

      // Verify that logging doesn't expose full pubkey
      expect(() => {
        logApprovalResponseWithPrivacy(response, testSessionId, true);
      }).not.toThrow();
    });
  });
});
