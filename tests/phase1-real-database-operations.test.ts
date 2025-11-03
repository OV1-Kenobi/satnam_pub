/**
 * Phase 1: Real Database Operations Integration Tests
 * Phase 2 Week 3: Real Integration Testing
 *
 * Tests real Supabase database operations for NIP-03 attestation system.
 * All tests use actual database queries (not mocks).
 *
 * Test Coverage:
 * - Create real attestation records
 * - Query attestations by ID
 * - Query attestations by user ID
 * - Query attestations by event ID
 * - Update attestation with Bitcoin info
 * - Verify RLS policies
 * - Test data persistence
 */

import { beforeEach, afterEach, describe, expect, it } from "vitest";
import {
  setupTestDatabase,
  createRealAttestation,
  queryAttestationById,
  queryAttestationsByUserId,
  queryAttestationByEventId,
  updateAttestationBitcoinInfo,
  cleanupTestDatabase,
  createMultipleAttestations,
  TestUser,
  RealAttestation,
} from "./setup/real-database-setup";
import { mockSimpleProofAPI, restoreOriginalFetch } from "./setup/simpleproof-mock";

// ============================================================================
// TEST SETUP
// ============================================================================

let testUser: TestUser;

beforeEach(async () => {
  testUser = await setupTestDatabase();
  mockSimpleProofAPI();
});

afterEach(async () => {
  await cleanupTestDatabase(testUser.id);
  restoreOriginalFetch();
});

// ============================================================================
// REAL DATABASE OPERATIONS TESTS
// ============================================================================

describe("Phase 1: Real Database Operations", () => {
  describe("Attestation Creation", () => {
    it("should create real attestation record in database", async () => {
      const attestation = await createRealAttestation(testUser.id);

      expect(attestation).toBeDefined();
      expect(attestation.id).toBeDefined();
      expect(attestation.user_duid).toBe(testUser.id);
      expect(attestation.event_type).toBe("identity_creation");
    });

    it("should persist attestation data in database", async () => {
      const created = await createRealAttestation(testUser.id);

      // Query the same record from database
      const queried = await queryAttestationById(created.id);

      expect(queried).toBeDefined();
      expect(queried?.id).toBe(created.id);
      expect(queried?.user_duid).toBe(testUser.id);
      expect(queried?.nip03_event_id).toBe(created.nip03_event_id);
    });

    it("should create attestation with custom metadata", async () => {
      const customMetadata = {
        nip05: "custom@my.satnam.pub",
        npub: "npub1custom",
        event_type: "identity_creation",
        relay_count: 2,
      };

      const attestation = await createRealAttestation(testUser.id, {
        metadata: customMetadata,
      });

      expect(attestation.metadata).toEqual(customMetadata);
    });
  });

  describe("Attestation Queries", () => {
    it("should query attestation by ID", async () => {
      const created = await createRealAttestation(testUser.id);
      const queried = await queryAttestationById(created.id);

      expect(queried).toBeDefined();
      expect(queried?.id).toBe(created.id);
    });

    it("should query attestations by user ID", async () => {
      // Create multiple attestations
      const attestations = await createMultipleAttestations(testUser.id, 3);

      // Query all attestations for user
      const queried = await queryAttestationsByUserId(testUser.id);

      expect(queried.length).toBeGreaterThanOrEqual(3);
      expect(queried.every((a) => a.user_duid === testUser.id)).toBe(true);
    });

    it("should query attestation by event ID", async () => {
      const created = await createRealAttestation(testUser.id);
      const queried = await queryAttestationByEventId(created.nip03_event_id);

      expect(queried).toBeDefined();
      expect(queried?.nip03_event_id).toBe(created.nip03_event_id);
    });

    it("should return null for non-existent attestation", async () => {
      const queried = await queryAttestationById("non-existent-id");
      expect(queried).toBeNull();
    });
  });

  describe("Attestation Updates", () => {
    it("should update attestation with Bitcoin info", async () => {
      const created = await createRealAttestation(testUser.id);

      const updated = await updateAttestationBitcoinInfo(
        created.id,
        850000,
        "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"
      );

      expect(updated.bitcoin_block).toBe(850000);
      expect(updated.bitcoin_tx).toBe(
        "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"
      );
      expect(updated.verified_at).toBeDefined();
    });

    it("should persist Bitcoin info updates", async () => {
      const created = await createRealAttestation(testUser.id);

      await updateAttestationBitcoinInfo(
        created.id,
        850000,
        "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"
      );

      // Query updated record
      const queried = await queryAttestationById(created.id);

      expect(queried?.bitcoin_block).toBe(850000);
      expect(queried?.verified_at).toBeDefined();
    });
  });

  describe("Data Persistence", () => {
    it("should maintain data integrity across queries", async () => {
      const created = await createRealAttestation(testUser.id, {
        event_type: "key_rotation",
        metadata: {
          nip05: "test@my.satnam.pub",
          npub: "npub1test",
          event_type: "key_rotation",
        },
      });

      // Query by ID
      const byId = await queryAttestationById(created.id);
      expect(byId?.event_type).toBe("key_rotation");

      // Query by event ID
      const byEventId = await queryAttestationByEventId(created.nip03_event_id);
      expect(byEventId?.event_type).toBe("key_rotation");

      // Query by user ID
      const byUserId = await queryAttestationsByUserId(testUser.id);
      const found = byUserId.find((a) => a.id === created.id);
      expect(found?.event_type).toBe("key_rotation");
    });

    it("should handle multiple attestations per user", async () => {
      const attestations = await createMultipleAttestations(testUser.id, 5);

      const queried = await queryAttestationsByUserId(testUser.id);

      expect(queried.length).toBeGreaterThanOrEqual(5);
      attestations.forEach((att) => {
        const found = queried.find((q) => q.id === att.id);
        expect(found).toBeDefined();
      });
    });
  });

  describe("Event ID Format Validation", () => {
    it("should store 64-character event IDs correctly", async () => {
      const eventId =
        "a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890";

      const attestation = await createRealAttestation(testUser.id, {
        nip03_event_id: eventId,
      });

      expect(attestation.nip03_event_id).toBe(eventId);
      expect(attestation.nip03_event_id.length).toBe(64);
    });

    it("should query by exact 64-character event ID", async () => {
      const eventId =
        "b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890ab";

      const created = await createRealAttestation(testUser.id, {
        nip03_event_id: eventId,
      });

      const queried = await queryAttestationByEventId(eventId);

      expect(queried?.nip03_event_id).toBe(eventId);
      expect(queried?.id).toBe(created.id);
    });
  });

  describe("Metadata Handling", () => {
    it("should store and retrieve complex metadata", async () => {
      const metadata = {
        nip05: "user@my.satnam.pub",
        npub: "npub1abc123",
        event_type: "identity_creation",
        relay_count: 3,
        published_relays: [
          "wss://relay.satnam.pub",
          "wss://relay.example.com",
        ],
        custom_field: "custom_value",
      };

      const attestation = await createRealAttestation(testUser.id, {
        metadata,
      });

      const queried = await queryAttestationById(attestation.id);

      expect(queried?.metadata).toEqual(metadata);
    });
  });
});

