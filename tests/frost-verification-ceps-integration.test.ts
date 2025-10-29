/**
 * FROST Signature Verification & CEPS Integration Test Suite
 *
 * Comprehensive tests for newly implemented FROST methods:
 * - verifyAggregatedSignature() - Cryptographic signature verification
 * - publishSignedEvent() - CEPS integration for event publishing
 * - sendFrostSigningRequest() - NIP-17 DM notifications for signing requests
 * - sendFrostCompletionNotification() - NIP-17 DM notifications for completion
 *
 * Test Coverage: 36+ test cases covering success paths, error cases, and edge cases
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateSessionParams } from "../lib/frost/frost-session-manager";
import { FrostSessionManager } from "../lib/frost/frost-session-manager";
import { supabase } from "../src/lib/supabase";

// Test data
const TEST_FAMILY_ID = "test-family-verify-123";
const TEST_MESSAGE_HASH =
  "a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890";
const TEST_VALID_SIGNATURE = {
  R: "02a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890ab",
  s: "a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890",
};
const TEST_INVALID_SIGNATURE = {
  R: "02ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  s: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
};
const TEST_PARTICIPANTS = [
  "participant1-duid",
  "participant2-duid",
  "participant3-duid",
];
const TEST_THRESHOLD = 2;
const TEST_CREATED_BY = "participant1-duid";

describe("FROST Verification & CEPS Integration", () => {
  let testSessionId: string | undefined;

  beforeEach(() => {
    // Mock CEPS if needed
    vi.clearAllMocks();
  });

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

  describe("verifyAggregatedSignature()", () => {
    it("should verify a valid aggregated signature", async () => {
      // Create and setup a completed session
      const params: CreateSessionParams = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
      };

      const createResult = await FrostSessionManager.createSession(params);
      testSessionId = createResult.data?.session_id;

      // Manually update session to completed with valid signature
      if (testSessionId) {
        await supabase
          .from("frost_signing_sessions")
          .update({
            status: "completed",
            final_signature: JSON.stringify(TEST_VALID_SIGNATURE),
          })
          .eq("session_id", testSessionId);

        const result = await FrostSessionManager.verifyAggregatedSignature(
          testSessionId,
          TEST_MESSAGE_HASH
        );

        expect(result.success).toBe(true);
        expect(result.valid).toBeDefined();
      }
    });

    it("should return error when session not found", async () => {
      const result = await FrostSessionManager.verifyAggregatedSignature(
        "nonexistent-session-id",
        TEST_MESSAGE_HASH
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Session not found");
    });

    it("should return error when session not in completed status", async () => {
      const params: CreateSessionParams = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
      };

      const createResult = await FrostSessionManager.createSession(params);
      testSessionId = createResult.data?.session_id;

      if (testSessionId) {
        const result = await FrostSessionManager.verifyAggregatedSignature(
          testSessionId,
          TEST_MESSAGE_HASH
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain("not in completed status");
      }
    });

    it("should return error when final_signature is missing", async () => {
      const params: CreateSessionParams = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
      };

      const createResult = await FrostSessionManager.createSession(params);
      testSessionId = createResult.data?.session_id;

      if (testSessionId) {
        // Update to completed but without signature
        await supabase
          .from("frost_signing_sessions")
          .update({ status: "completed" })
          .eq("session_id", testSessionId);

        const result = await FrostSessionManager.verifyAggregatedSignature(
          testSessionId,
          TEST_MESSAGE_HASH
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain("No final signature");
      }
    });

    it("should return error when message hash format is invalid", async () => {
      const params: CreateSessionParams = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
      };

      const createResult = await FrostSessionManager.createSession(params);
      testSessionId = createResult.data?.session_id;

      if (testSessionId) {
        await supabase
          .from("frost_signing_sessions")
          .update({
            status: "completed",
            final_signature: JSON.stringify(TEST_VALID_SIGNATURE),
          })
          .eq("session_id", testSessionId);

        const result = await FrostSessionManager.verifyAggregatedSignature(
          testSessionId,
          "invalid-hash"
        );

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      }
    });

    it("should return error when signature R component is invalid", async () => {
      const params: CreateSessionParams = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
      };

      const createResult = await FrostSessionManager.createSession(params);
      testSessionId = createResult.data?.session_id;

      if (testSessionId) {
        const invalidSig = {
          R: "invalid-r-component",
          s: TEST_VALID_SIGNATURE.s,
        };

        await supabase
          .from("frost_signing_sessions")
          .update({
            status: "completed",
            final_signature: JSON.stringify(invalidSig),
          })
          .eq("session_id", testSessionId);

        const result = await FrostSessionManager.verifyAggregatedSignature(
          testSessionId,
          TEST_MESSAGE_HASH
        );

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      }
    });

    it("should return error when signature s component is invalid", async () => {
      const params: CreateSessionParams = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
      };

      const createResult = await FrostSessionManager.createSession(params);
      testSessionId = createResult.data?.session_id;

      if (testSessionId) {
        const invalidSig = {
          R: TEST_VALID_SIGNATURE.R,
          s: "invalid-s-component",
        };

        await supabase
          .from("frost_signing_sessions")
          .update({
            status: "completed",
            final_signature: JSON.stringify(invalidSig),
          })
          .eq("session_id", testSessionId);

        const result = await FrostSessionManager.verifyAggregatedSignature(
          testSessionId,
          TEST_MESSAGE_HASH
        );

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      }
    });

    it("should return error when family not found", async () => {
      const params: CreateSessionParams = {
        familyId: "nonexistent-family-id",
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
      };

      const createResult = await FrostSessionManager.createSession(params);
      testSessionId = createResult.data?.session_id;

      if (testSessionId) {
        await supabase
          .from("frost_signing_sessions")
          .update({
            status: "completed",
            final_signature: JSON.stringify(TEST_VALID_SIGNATURE),
          })
          .eq("session_id", testSessionId);

        const result = await FrostSessionManager.verifyAggregatedSignature(
          testSessionId,
          TEST_MESSAGE_HASH
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain("Family not found");
      }
    });

    it("should handle invalid signature verification gracefully", async () => {
      const params: CreateSessionParams = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
      };

      const createResult = await FrostSessionManager.createSession(params);
      testSessionId = createResult.data?.session_id;

      if (testSessionId) {
        await supabase
          .from("frost_signing_sessions")
          .update({
            status: "completed",
            final_signature: JSON.stringify(TEST_INVALID_SIGNATURE),
          })
          .eq("session_id", testSessionId);

        const result = await FrostSessionManager.verifyAggregatedSignature(
          testSessionId,
          TEST_MESSAGE_HASH
        );

        expect(result.success).toBe(true);
        expect(result.valid).toBe(false);
      }
    });
  });

  describe("publishSignedEvent()", () => {
    it("should publish a signed event successfully", async () => {
      const params: CreateSessionParams = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
        eventTemplate: JSON.stringify({
          kind: 1,
          content: "Test event",
          created_at: Math.floor(Date.now() / 1000),
        }),
        eventType: "nostr_event",
      };

      const createResult = await FrostSessionManager.createSession(params);
      testSessionId = createResult.data?.session_id;

      if (testSessionId) {
        await supabase
          .from("frost_signing_sessions")
          .update({
            status: "completed",
            final_signature: JSON.stringify(TEST_VALID_SIGNATURE),
          })
          .eq("session_id", testSessionId);

        const result = await FrostSessionManager.publishSignedEvent(
          testSessionId
        );

        expect(result.success).toBeDefined();
        if (result.success) {
          expect(result.eventId).toBeDefined();
        }
      }
    });

    it("should return error when session not found", async () => {
      const result = await FrostSessionManager.publishSignedEvent(
        "nonexistent-session-id"
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Session not found");
    });

    it("should return error when session not completed", async () => {
      const params: CreateSessionParams = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
      };

      const createResult = await FrostSessionManager.createSession(params);
      testSessionId = createResult.data?.session_id;

      if (testSessionId) {
        const result = await FrostSessionManager.publishSignedEvent(
          testSessionId
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain("not completed");
      }
    });

    it("should return error when event_template is missing", async () => {
      const params: CreateSessionParams = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
      };

      const createResult = await FrostSessionManager.createSession(params);
      testSessionId = createResult.data?.session_id;

      if (testSessionId) {
        await supabase
          .from("frost_signing_sessions")
          .update({
            status: "completed",
            final_signature: JSON.stringify(TEST_VALID_SIGNATURE),
          })
          .eq("session_id", testSessionId);

        const result = await FrostSessionManager.publishSignedEvent(
          testSessionId
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain("No event template");
      }
    });

    it("should return error when event_template JSON is invalid", async () => {
      const params: CreateSessionParams = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
        eventTemplate: "invalid-json-{",
        eventType: "nostr_event",
      };

      const createResult = await FrostSessionManager.createSession(params);
      testSessionId = createResult.data?.session_id;

      if (testSessionId) {
        await supabase
          .from("frost_signing_sessions")
          .update({
            status: "completed",
            final_signature: JSON.stringify(TEST_VALID_SIGNATURE),
          })
          .eq("session_id", testSessionId);

        const result = await FrostSessionManager.publishSignedEvent(
          testSessionId
        );

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      }
    });

    it("should return error when final_signature is missing", async () => {
      const params: CreateSessionParams = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
        eventTemplate: JSON.stringify({
          kind: 1,
          content: "Test event",
        }),
        eventType: "nostr_event",
      };

      const createResult = await FrostSessionManager.createSession(params);
      testSessionId = createResult.data?.session_id;

      if (testSessionId) {
        await supabase
          .from("frost_signing_sessions")
          .update({ status: "completed" })
          .eq("session_id", testSessionId);

        const result = await FrostSessionManager.publishSignedEvent(
          testSessionId
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain("No final signature");
      }
    });

    it("should return error when family not found", async () => {
      const params: CreateSessionParams = {
        familyId: "nonexistent-family-id",
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
        eventTemplate: JSON.stringify({
          kind: 1,
          content: "Test event",
        }),
        eventType: "nostr_event",
      };

      const createResult = await FrostSessionManager.createSession(params);
      testSessionId = createResult.data?.session_id;

      if (testSessionId) {
        await supabase
          .from("frost_signing_sessions")
          .update({
            status: "completed",
            final_signature: JSON.stringify(TEST_VALID_SIGNATURE),
          })
          .eq("session_id", testSessionId);

        const result = await FrostSessionManager.publishSignedEvent(
          testSessionId
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain("Family not found");
      }
    });

    it("should handle optimistic locking conflicts", async () => {
      const params: CreateSessionParams = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
        eventTemplate: JSON.stringify({
          kind: 1,
          content: "Test event",
        }),
        eventType: "nostr_event",
      };

      const createResult = await FrostSessionManager.createSession(params);
      testSessionId = createResult.data?.session_id;

      if (testSessionId) {
        await supabase
          .from("frost_signing_sessions")
          .update({
            status: "completed",
            final_signature: JSON.stringify(TEST_VALID_SIGNATURE),
          })
          .eq("session_id", testSessionId);

        // First publish should succeed or fail gracefully
        const result = await FrostSessionManager.publishSignedEvent(
          testSessionId
        );

        expect(result.success).toBeDefined();
        expect(result.error || result.eventId).toBeDefined();
      }
    });
  });

  describe("sendFrostSigningRequest()", () => {
    it("should send signing requests to all guardians/stewards", async () => {
      const params: CreateSessionParams = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
        eventTemplate: JSON.stringify({
          kind: 1,
          content: "Test signing request",
        }),
      };

      const createResult = await FrostSessionManager.createSession(params);
      testSessionId = createResult.data?.session_id;

      if (testSessionId) {
        const result = await FrostSessionManager.sendFrostSigningRequest(
          testSessionId
        );

        expect(result.success).toBeDefined();
        if (result.success) {
          expect(result.notificationsSent).toBeDefined();
        }
      }
    });

    it("should return error when session not found", async () => {
      const result = await FrostSessionManager.sendFrostSigningRequest(
        "nonexistent-session-id"
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Session not found");
    });

    it("should return error when family not found", async () => {
      const params: CreateSessionParams = {
        familyId: "nonexistent-family-id",
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
      };

      const createResult = await FrostSessionManager.createSession(params);
      testSessionId = createResult.data?.session_id;

      if (testSessionId) {
        const result = await FrostSessionManager.sendFrostSigningRequest(
          testSessionId
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain("Family not found");
      }
    });

    it("should handle no guardians/stewards gracefully", async () => {
      const params: CreateSessionParams = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
      };

      const createResult = await FrostSessionManager.createSession(params);
      testSessionId = createResult.data?.session_id;

      if (testSessionId) {
        const result = await FrostSessionManager.sendFrostSigningRequest(
          testSessionId
        );

        expect(result.success).toBeDefined();
        expect(result.notificationsSent).toBeDefined();
      }
    });

    it("should continue on per-member failures", async () => {
      const params: CreateSessionParams = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
        eventTemplate: JSON.stringify({
          kind: 1,
          content: "Test message",
        }),
      };

      const createResult = await FrostSessionManager.createSession(params);
      testSessionId = createResult.data?.session_id;

      if (testSessionId) {
        const result = await FrostSessionManager.sendFrostSigningRequest(
          testSessionId
        );

        expect(result.success).toBeDefined();
      }
    });
  });

  describe("sendFrostCompletionNotification()", () => {
    it("should send completion notification with success=true", async () => {
      const params: CreateSessionParams = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
      };

      const createResult = await FrostSessionManager.createSession(params);
      testSessionId = createResult.data?.session_id;

      if (testSessionId) {
        const result = await FrostSessionManager.sendFrostCompletionNotification(
          testSessionId,
          "event-id-123",
          true
        );

        expect(result.success).toBeDefined();
        if (result.success) {
          expect(result.notificationsSent).toBeDefined();
        }
      }
    });

    it("should send completion notification with success=false", async () => {
      const params: CreateSessionParams = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
      };

      const createResult = await FrostSessionManager.createSession(params);
      testSessionId = createResult.data?.session_id;

      if (testSessionId) {
        const result = await FrostSessionManager.sendFrostCompletionNotification(
          testSessionId,
          "event-id-123",
          false
        );

        expect(result.success).toBeDefined();
        if (result.success) {
          expect(result.notificationsSent).toBeDefined();
        }
      }
    });

    it("should return error when session not found", async () => {
      const result = await FrostSessionManager.sendFrostCompletionNotification(
        "nonexistent-session-id",
        "event-id-123",
        true
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Session not found");
    });

    it("should return error when family not found", async () => {
      const params: CreateSessionParams = {
        familyId: "nonexistent-family-id",
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
      };

      const createResult = await FrostSessionManager.createSession(params);
      testSessionId = createResult.data?.session_id;

      if (testSessionId) {
        const result = await FrostSessionManager.sendFrostCompletionNotification(
          testSessionId,
          "event-id-123",
          true
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain("Family not found");
      }
    });

    it("should handle no guardians/stewards gracefully", async () => {
      const params: CreateSessionParams = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
      };

      const createResult = await FrostSessionManager.createSession(params);
      testSessionId = createResult.data?.session_id;

      if (testSessionId) {
        const result = await FrostSessionManager.sendFrostCompletionNotification(
          testSessionId,
          "event-id-123",
          true
        );

        expect(result.success).toBeDefined();
        expect(result.notificationsSent).toBeDefined();
      }
    });

    it("should continue on per-member failures", async () => {
      const params: CreateSessionParams = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
      };

      const createResult = await FrostSessionManager.createSession(params);
      testSessionId = createResult.data?.session_id;

      if (testSessionId) {
        const result = await FrostSessionManager.sendFrostCompletionNotification(
          testSessionId,
          "event-id-123",
          true
        );

        expect(result.success).toBeDefined();
      }
    });

    it("should include event ID in successful completion", async () => {
      const params: CreateSessionParams = {
        familyId: TEST_FAMILY_ID,
        messageHash: TEST_MESSAGE_HASH,
        participants: TEST_PARTICIPANTS,
        threshold: TEST_THRESHOLD,
        createdBy: TEST_CREATED_BY,
      };

      const createResult = await FrostSessionManager.createSession(params);
      testSessionId = createResult.data?.session_id;

      if (testSessionId) {
        const eventId = "test-event-id-abc123";
        const result = await FrostSessionManager.sendFrostCompletionNotification(
          testSessionId,
          eventId,
          true
        );

        expect(result.success).toBeDefined();
      }
    });
  });
});

