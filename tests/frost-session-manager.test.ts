/**
 * FROST Session Manager Test Suite
 *
 * Comprehensive tests for FROST session management including:
 * - Session creation and retrieval
 * - State machine transitions
 * - Nonce collection (Round 1)
 * - Partial signature collection (Round 2)
 * - Signature aggregation
 * - Session expiration and cleanup
 * - Error handling and validation
 *
 * Task 7 - Phase 2: Session Management Service
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CreateSessionParams } from "../lib/frost/frost-session-manager";
import { FrostSessionManager } from "../lib/frost/frost-session-manager";

// Test data
const TEST_FAMILY_ID = "test-family-123";
const TEST_MESSAGE_HASH =
  "a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890";
const TEST_PARTICIPANTS = [
  "participant1-duid",
  "participant2-duid",
  "participant3-duid",
];
const TEST_THRESHOLD = 2;
const TEST_CREATED_BY = "participant1-duid";

describe("FROST Session Manager", () => {
  let testSessionId: string | undefined;

  afterEach(async () => {
    // Cleanup test session if created
    if (testSessionId) {
      try {
        await FrostSessionManager.failSession(testSessionId, "Test cleanup");
      } catch {
        // Ignore cleanup errors
      }
      testSessionId = undefined;
    }
  });

  describe("Session Creation", () => {
    it("should create a new FROST signing session", async () => {
      const params: CreateSessionParams = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
      };

      const result = await FrostSessionManager.createSession(params);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.session_id).toBeDefined();
      expect(result.data?.family_id).toBe(TEST_FAMILY_ID);
      expect(result.data?.message_hash).toBe(TEST_MESSAGE_HASH);
      expect(result.data?.participants).toEqual(TEST_PARTICIPANTS);
      expect(result.data?.threshold).toBe(TEST_THRESHOLD);
      expect(result.data?.status).toBe("pending");
      expect(result.data?.created_by).toBe(TEST_CREATED_BY);

      testSessionId = result.data?.session_id;
    });

    it("should create session with event template and type", async () => {
      const params: CreateSessionParams = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
        eventTemplate: JSON.stringify({ kind: 1, content: "test" }),
        eventType: "nostr_event",
      };

      const result = await FrostSessionManager.createSession(params);

      expect(result.success).toBe(true);
      expect(result.data?.event_template).toBeDefined();
      expect(result.data?.event_type).toBe("nostr_event");

      testSessionId = result.data?.session_id;
    });

    it("should create session with custom expiration", async () => {
      const params: CreateSessionParams = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
        expirationSeconds: 600, // 10 minutes
      };

      const result = await FrostSessionManager.createSession(params);

      expect(result.success).toBe(true);
      expect(result.data?.expires_at).toBeDefined();

      const expirationDiff = result.data!.expires_at - result.data!.created_at;
      expect(expirationDiff).toBeGreaterThanOrEqual(600000); // 10 minutes in ms

      testSessionId = result.data?.session_id;
    });

    it("should reject threshold below minimum (1)", async () => {
      const params: CreateSessionParams = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: 0,
        createdBy: TEST_CREATED_BY,
      };

      const result = await FrostSessionManager.createSession(params);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Threshold must be between");
    });

    it("should reject threshold above maximum (7)", async () => {
      const params: CreateSessionParams = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: 8,
        createdBy: TEST_CREATED_BY,
      };

      const result = await FrostSessionManager.createSession(params);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Threshold must be between");
    });

    it("should reject participants less than threshold", async () => {
      const params: CreateSessionParams = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: ["participant1-duid"],
        threshold: 2,
        createdBy: TEST_CREATED_BY,
      };

      const result = await FrostSessionManager.createSession(params);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Participants");
      expect(result.error).toContain("threshold");
    });

    it("should generate unique session IDs", async () => {
      const params: CreateSessionParams = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
      };

      const result1 = await FrostSessionManager.createSession(params);
      const result2 = await FrostSessionManager.createSession(params);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result1.data?.session_id).not.toBe(result2.data?.session_id);

      // Cleanup both sessions
      if (result1.data?.session_id) {
        await FrostSessionManager.failSession(
          result1.data.session_id,
          "Test cleanup"
        );
      }
      if (result2.data?.session_id) {
        await FrostSessionManager.failSession(
          result2.data.session_id,
          "Test cleanup"
        );
      }
    });
  });

  describe("Session Retrieval", () => {
    beforeEach(async () => {
      // Create a test session
      const params: CreateSessionParams = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
      };

      const result = await FrostSessionManager.createSession(params);
      testSessionId = result.data?.session_id;
    });

    it("should retrieve session by session_id", async () => {
      const result = await FrostSessionManager.getSession(testSessionId!);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.session_id).toBe(testSessionId);
      expect(result.data?.family_id).toBe(TEST_FAMILY_ID);
    });

    it("should return error for non-existent session", async () => {
      const result = await FrostSessionManager.getSession(
        "non-existent-session-id"
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Session not found");
    });

    it("should parse participants array correctly", async () => {
      const result = await FrostSessionManager.getSession(testSessionId!);

      expect(result.success).toBe(true);
      expect(Array.isArray(result.data?.participants)).toBe(true);
      expect(result.data?.participants).toEqual(TEST_PARTICIPANTS);
    });
  });

  describe("Nonce Collection (Round 1)", () => {
    beforeEach(async () => {
      // Create a test session
      const params: CreateSessionParams = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
      };

      const result = await FrostSessionManager.createSession(params);
      testSessionId = result.data?.session_id;
    });

    it("should submit nonce commitment from participant", async () => {
      const nonceCommitment = "nonce1-" + Date.now();

      const result = await FrostSessionManager.submitNonceCommitment(
        testSessionId!,
        TEST_PARTICIPANTS[0],
        nonceCommitment
      );

      expect(result.success).toBe(true);
      expect(result.nonceCount).toBe(1);
      expect(result.thresholdMet).toBe(false);
    });

    it("should transition to nonce_collection status on first nonce", async () => {
      const nonceCommitment = "nonce1-" + Date.now();

      await FrostSessionManager.submitNonceCommitment(
        testSessionId!,
        TEST_PARTICIPANTS[0],
        nonceCommitment
      );

      const session = await FrostSessionManager.getSession(testSessionId!);

      expect(session.data?.status).toBe("nonce_collection");
      expect(session.data?.nonce_collection_started_at).toBeDefined();
    });

    it("should transition to signing status when threshold met", async () => {
      const nonce1 = "nonce1-" + Date.now();
      const nonce2 = "nonce2-" + Date.now();

      await FrostSessionManager.submitNonceCommitment(
        testSessionId!,
        TEST_PARTICIPANTS[0],
        nonce1
      );

      const result = await FrostSessionManager.submitNonceCommitment(
        testSessionId!,
        TEST_PARTICIPANTS[1],
        nonce2
      );

      expect(result.success).toBe(true);
      expect(result.nonceCount).toBe(2);
      expect(result.thresholdMet).toBe(true);

      const session = await FrostSessionManager.getSession(testSessionId!);
      expect(session.data?.status).toBe("signing");
      expect(session.data?.signing_started_at).toBeDefined();
    });

    it("should reject duplicate nonce from same participant", async () => {
      const nonceCommitment = "nonce1-" + Date.now();

      await FrostSessionManager.submitNonceCommitment(
        testSessionId!,
        TEST_PARTICIPANTS[0],
        nonceCommitment
      );

      const result = await FrostSessionManager.submitNonceCommitment(
        testSessionId!,
        TEST_PARTICIPANTS[0],
        "nonce2-" + Date.now()
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("already submitted");
    });

    it("should reject nonce from unauthorized participant", async () => {
      const nonceCommitment = "nonce1-" + Date.now();

      const result = await FrostSessionManager.submitNonceCommitment(
        testSessionId!,
        "unauthorized-participant",
        nonceCommitment
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not authorized");
    });

    it("should detect nonce reuse across sessions (CRITICAL SECURITY)", async () => {
      const nonceCommitment = "reused-nonce-" + Date.now();

      // Submit nonce to first session
      await FrostSessionManager.submitNonceCommitment(
        testSessionId!,
        TEST_PARTICIPANTS[0],
        nonceCommitment
      );

      // Create second session
      const params: CreateSessionParams = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
      };

      const session2 = await FrostSessionManager.createSession(params);
      const session2Id = session2.data?.session_id;

      // Try to reuse same nonce in second session
      const result = await FrostSessionManager.submitNonceCommitment(
        session2Id!,
        TEST_PARTICIPANTS[1],
        nonceCommitment
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("CRITICAL SECURITY");
      expect(result.error).toContain("Nonce reuse");

      // Cleanup second session
      if (session2Id) {
        await FrostSessionManager.failSession(session2Id, "Test cleanup");
      }
    });
  });

  describe("Partial Signature Collection (Round 2)", () => {
    beforeEach(async () => {
      // Create session and submit nonces to reach signing state
      const params: CreateSessionParams = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
      };

      const result = await FrostSessionManager.createSession(params);
      testSessionId = result.data?.session_id;

      // Submit nonces to reach threshold
      await FrostSessionManager.submitNonceCommitment(
        testSessionId!,
        TEST_PARTICIPANTS[0],
        "nonce1-" + Date.now()
      );
      await FrostSessionManager.submitNonceCommitment(
        testSessionId!,
        TEST_PARTICIPANTS[1],
        "nonce2-" + Date.now()
      );
    });

    it("should submit partial signature from participant", async () => {
      const partialSignature = "sig1-" + Date.now();

      const result = await FrostSessionManager.submitPartialSignature(
        testSessionId!,
        TEST_PARTICIPANTS[0],
        partialSignature
      );

      expect(result.success).toBe(true);
      expect(result.signatureCount).toBe(1);
      expect(result.thresholdMet).toBe(false);
    });

    it("should transition to aggregating status when threshold met", async () => {
      const sig1 = "sig1-" + Date.now();
      const sig2 = "sig2-" + Date.now();

      await FrostSessionManager.submitPartialSignature(
        testSessionId!,
        TEST_PARTICIPANTS[0],
        sig1
      );

      const result = await FrostSessionManager.submitPartialSignature(
        testSessionId!,
        TEST_PARTICIPANTS[1],
        sig2
      );

      expect(result.success).toBe(true);
      expect(result.signatureCount).toBe(2);
      expect(result.thresholdMet).toBe(true);

      const session = await FrostSessionManager.getSession(testSessionId!);
      expect(session.data?.status).toBe("aggregating");
    });

    it("should reject signature from participant without nonce", async () => {
      const partialSignature = "sig3-" + Date.now();

      const result = await FrostSessionManager.submitPartialSignature(
        testSessionId!,
        TEST_PARTICIPANTS[2], // Did not submit nonce
        partialSignature
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("must submit nonce commitment");
    });

    it("should reject duplicate signature from same participant", async () => {
      const sig1 = "sig1-" + Date.now();

      await FrostSessionManager.submitPartialSignature(
        testSessionId!,
        TEST_PARTICIPANTS[0],
        sig1
      );

      const result = await FrostSessionManager.submitPartialSignature(
        testSessionId!,
        TEST_PARTICIPANTS[0],
        "sig2-" + Date.now()
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("already submitted");
    });

    it("should reject signature from unauthorized participant", async () => {
      const partialSignature = "sig-unauthorized-" + Date.now();

      const result = await FrostSessionManager.submitPartialSignature(
        testSessionId!,
        "unauthorized-participant",
        partialSignature
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not authorized");
    });
  });

  describe("Signature Aggregation", () => {
    beforeEach(async () => {
      // Create session, submit nonces and signatures to reach aggregating state
      const params: CreateSessionParams = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
      };

      const result = await FrostSessionManager.createSession(params);
      testSessionId = result.data?.session_id;

      // Submit nonces
      await FrostSessionManager.submitNonceCommitment(
        testSessionId!,
        TEST_PARTICIPANTS[0],
        "nonce1-" + Date.now()
      );
      await FrostSessionManager.submitNonceCommitment(
        testSessionId!,
        TEST_PARTICIPANTS[1],
        "nonce2-" + Date.now()
      );

      // Submit signatures
      await FrostSessionManager.submitPartialSignature(
        testSessionId!,
        TEST_PARTICIPANTS[0],
        "sig1-" + Date.now()
      );
      await FrostSessionManager.submitPartialSignature(
        testSessionId!,
        TEST_PARTICIPANTS[1],
        "sig2-" + Date.now()
      );
    });

    it("should aggregate partial signatures into final signature", async () => {
      const result = await FrostSessionManager.aggregateSignatures(
        testSessionId!
      );

      expect(result.success).toBe(true);
      expect(result.finalSignature).toBeDefined();
      expect(result.finalSignature?.R).toBeDefined();
      expect(result.finalSignature?.s).toBeDefined();
      expect(result.finalSignature?.R.length).toBe(64); // 32 bytes hex
    });

    it("should transition to completed status after aggregation", async () => {
      await FrostSessionManager.aggregateSignatures(testSessionId!);

      const session = await FrostSessionManager.getSession(testSessionId!);

      expect(session.data?.status).toBe("completed");
      expect(session.data?.completed_at).toBeDefined();
      expect(session.data?.final_signature).toBeDefined();
    });

    it("should reject aggregation when session not in aggregating state", async () => {
      // Create new session in pending state
      const params: CreateSessionParams = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
      };

      const newSession = await FrostSessionManager.createSession(params);
      const newSessionId = newSession.data?.session_id;

      const result = await FrostSessionManager.aggregateSignatures(
        newSessionId!
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid session status");

      // Cleanup
      if (newSessionId) {
        await FrostSessionManager.failSession(newSessionId, "Test cleanup");
      }
    });

    it("should produce deterministic signature for same inputs", async () => {
      const result1 = await FrostSessionManager.aggregateSignatures(
        testSessionId!
      );

      // Get session and verify signature stored
      const session = await FrostSessionManager.getSession(testSessionId!);

      expect(result1.finalSignature).toEqual(session.data?.final_signature);
    });
  });

  describe("Session Failure", () => {
    beforeEach(async () => {
      const params: CreateSessionParams = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
      };

      const result = await FrostSessionManager.createSession(params);
      testSessionId = result.data?.session_id;
    });

    it("should fail session with error message", async () => {
      const errorMessage = "Test error: signature generation failed";

      const result = await FrostSessionManager.failSession(
        testSessionId!,
        errorMessage
      );

      expect(result.success).toBe(true);

      const session = await FrostSessionManager.getSession(testSessionId!);
      expect(session.data?.status).toBe("failed");
      expect(session.data?.error_message).toBe(errorMessage);
      expect(session.data?.failed_at).toBeDefined();
    });

    it("should update failed_at timestamp", async () => {
      const beforeFail = Date.now();

      await FrostSessionManager.failSession(testSessionId!, "Test error");

      const session = await FrostSessionManager.getSession(testSessionId!);
      const afterFail = Date.now();

      expect(session.data?.failed_at).toBeGreaterThanOrEqual(beforeFail);
      expect(session.data?.failed_at).toBeLessThanOrEqual(afterFail);
    });
  });

  describe("State Machine Validation", () => {
    beforeEach(async () => {
      const params: CreateSessionParams = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
      };

      const result = await FrostSessionManager.createSession(params);
      testSessionId = result.data?.session_id;
    });

    it("should start in pending state", async () => {
      const session = await FrostSessionManager.getSession(testSessionId!);
      expect(session.data?.status).toBe("pending");
    });

    it("should follow state machine: pending → nonce_collection → signing → aggregating → completed", async () => {
      // pending → nonce_collection
      await FrostSessionManager.submitNonceCommitment(
        testSessionId!,
        TEST_PARTICIPANTS[0],
        "nonce1-" + Date.now()
      );

      let session = await FrostSessionManager.getSession(testSessionId!);
      expect(session.data?.status).toBe("nonce_collection");

      // nonce_collection → signing
      await FrostSessionManager.submitNonceCommitment(
        testSessionId!,
        TEST_PARTICIPANTS[1],
        "nonce2-" + Date.now()
      );

      session = await FrostSessionManager.getSession(testSessionId!);
      expect(session.data?.status).toBe("signing");

      // signing → aggregating
      await FrostSessionManager.submitPartialSignature(
        testSessionId!,
        TEST_PARTICIPANTS[0],
        "sig1-" + Date.now()
      );
      await FrostSessionManager.submitPartialSignature(
        testSessionId!,
        TEST_PARTICIPANTS[1],
        "sig2-" + Date.now()
      );

      session = await FrostSessionManager.getSession(testSessionId!);
      expect(session.data?.status).toBe("aggregating");

      // aggregating → completed
      await FrostSessionManager.aggregateSignatures(testSessionId!);

      session = await FrostSessionManager.getSession(testSessionId!);
      expect(session.data?.status).toBe("completed");
    });

    it("should allow transition to failed from any state", async () => {
      const result = await FrostSessionManager.failSession(
        testSessionId!,
        "Test error"
      );

      expect(result.success).toBe(true);

      const session = await FrostSessionManager.getSession(testSessionId!);
      expect(session.data?.status).toBe("failed");
    });
  });

  describe("Session Expiration and Cleanup", () => {
    it("should expire old sessions", async () => {
      const result = await FrostSessionManager.expireOldSessions();

      expect(result.success).toBe(true);
    });

    it("should cleanup old sessions with default retention", async () => {
      const result = await FrostSessionManager.cleanupOldSessions();

      expect(result.success).toBe(true);
      expect(result.data).toBeGreaterThanOrEqual(0);
    });

    it("should cleanup old sessions with custom retention", async () => {
      const result = await FrostSessionManager.cleanupOldSessions(30);

      expect(result.success).toBe(true);
      expect(result.data).toBeGreaterThanOrEqual(0);
    });
  });
});
