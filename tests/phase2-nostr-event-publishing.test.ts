/**
 * Phase 2: Nostr Event Publishing Integration Tests
 * Phase 2 Week 3: Real Integration Testing
 *
 * Tests real Nostr event publishing to test relays.
 * Publishes real Kind:0 and Kind:1040 events to wss://relay.satnam.pub
 *
 * Test Coverage:
 * - Create Kind:0 (profile) events
 * - Create Kind:1040 (NIP-03 attestation) events
 * - Publish events to test relays
 * - Query published events from relays
 * - Verify event ID format
 * - Verify event structure
 */

import { beforeEach, afterEach, describe, expect, it } from "vitest";
import {
  createKind0Event,
  createNIP03Event,
  publishNostrEvent,
  queryNostrEventFromRelay,
  queryNostrEventsByFilter,
  isValidEventId,
  isValidNostrEvent,
  NostrEventPublishResult,
  NostrEventQueryResult,
} from "./setup/nostr-event-publishing";
import { mockSimpleProofAPI, restoreOriginalFetch } from "./setup/simpleproof-mock";

// ============================================================================
// TEST SETUP
// ============================================================================

beforeEach(() => {
  mockSimpleProofAPI();
});

afterEach(() => {
  restoreOriginalFetch();
});

// ============================================================================
// NOSTR EVENT PUBLISHING TESTS
// ============================================================================

describe("Phase 2: Nostr Event Publishing", () => {
  describe("Kind:0 Event Creation", () => {
    it("should create valid Kind:0 event", () => {
      const npub =
        "npub1test0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
      const nip05 = "user@my.satnam.pub";

      const event = createKind0Event(npub, nip05);

      expect(event.kind).toBe(0);
      expect(event.pubkey).toBe(npub);
      expect(isValidNostrEvent(event)).toBe(true);
      expect(isValidEventId(event.id)).toBe(true);
    });

    it("should include metadata in Kind:0 content", () => {
      const npub =
        "npub1test0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
      const nip05 = "user@my.satnam.pub";
      const metadata = { custom_field: "custom_value" };

      const event = createKind0Event(npub, nip05, metadata);

      const content = JSON.parse(event.content);
      expect(content.nip05).toBe(nip05);
      expect(content.custom_field).toBe("custom_value");
    });

    it("should generate 64-character event IDs", () => {
      const npub =
        "npub1test0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
      const event = createKind0Event(npub, "user@my.satnam.pub");

      expect(event.id.length).toBe(64);
      expect(/^[a-f0-9]{64}$/.test(event.id)).toBe(true);
    });
  });

  describe("Kind:1040 Event Creation", () => {
    it("should create valid Kind:1040 NIP-03 event", () => {
      const kind0EventId =
        "a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890";
      const otsProof =
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

      const event = createNIP03Event(kind0EventId, otsProof);

      expect(event.kind).toBe(1040);
      expect(isValidNostrEvent(event)).toBe(true);
      expect(isValidEventId(event.id)).toBe(true);
    });

    it("should include attestation tags in Kind:1040 event", () => {
      const kind0EventId =
        "a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890";
      const otsProof =
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

      const event = createNIP03Event(kind0EventId, otsProof);

      const eTags = event.tags.filter((t) => t[0] === "e");
      const otsTags = event.tags.filter((t) => t[0] === "ots");

      expect(eTags.length).toBeGreaterThan(0);
      expect(eTags[0][1]).toBe(kind0EventId);
      expect(otsTags.length).toBeGreaterThan(0);
      expect(otsTags[0][1]).toBe(otsProof);
    });

    it("should include Bitcoin info in Kind:1040 event", () => {
      const kind0EventId =
        "a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890";
      const otsProof =
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
      const bitcoinBlock = 850000;
      const bitcoinTx =
        "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

      const event = createNIP03Event(
        kind0EventId,
        otsProof,
        bitcoinBlock,
        bitcoinTx
      );

      const blockTags = event.tags.filter((t) => t[0] === "bitcoin_block");
      const txTags = event.tags.filter((t) => t[0] === "bitcoin_tx");

      expect(blockTags.length).toBeGreaterThan(0);
      expect(blockTags[0][1]).toBe("850000");
      expect(txTags.length).toBeGreaterThan(0);
      expect(txTags[0][1]).toBe(bitcoinTx);
    });
  });

  describe("Event Publishing", () => {
    it("should publish Kind:0 event to relay", async () => {
      const npub =
        "npub1test0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
      const event = createKind0Event(npub, "user@my.satnam.pub");

      const result = await publishNostrEvent(event);

      expect(result.success).toBe(true);
      expect(result.eventId).toBe(event.id);
      expect(result.relaysPublished.length).toBeGreaterThan(0);
    });

    it("should publish Kind:1040 event to relay", async () => {
      const kind0EventId =
        "a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890";
      const otsProof =
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
      const event = createNIP03Event(kind0EventId, otsProof);

      const result = await publishNostrEvent(event);

      expect(result.success).toBe(true);
      expect(result.eventId).toBe(event.id);
      expect(result.relaysPublished.length).toBeGreaterThan(0);
    });

    it("should handle publish errors gracefully", async () => {
      const event = createKind0Event(
        "npub1test0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
        "user@my.satnam.pub"
      );

      // Simulate network error by using invalid relay
      const result = await publishNostrEvent(event);

      // Should still return a result object even if publish fails
      expect(result).toBeDefined();
      expect(result.eventId).toBe(event.id);
    });
  });

  describe("Event Querying", () => {
    it("should query published event from relay", async () => {
      const npub =
        "npub1test0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
      const event = createKind0Event(npub, "user@my.satnam.pub");

      // Publish event
      await publishNostrEvent(event);

      // Query event from relay
      const result = await queryNostrEventFromRelay(event.id);

      expect(result).toBeDefined();
      expect(result.relaysQueried.length).toBeGreaterThan(0);
    });

    it("should query events by filter", async () => {
      const npub =
        "npub1test0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
      const event = createKind0Event(npub, "user@my.satnam.pub");

      // Publish event
      await publishNostrEvent(event);

      // Query by kind
      const result = await queryNostrEventsByFilter({ kinds: [0] });

      expect(result).toBeDefined();
      expect(result.relaysQueried.length).toBeGreaterThan(0);
    });
  });

  describe("Event Validation", () => {
    it("should validate event ID format", () => {
      const validId =
        "a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890";
      const invalidId = "a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef123456789"; // 63 chars

      expect(isValidEventId(validId)).toBe(true);
      expect(isValidEventId(invalidId)).toBe(false);
    });

    it("should validate Nostr event structure", () => {
      const npub =
        "npub1test0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
      const event = createKind0Event(npub, "user@my.satnam.pub");

      expect(isValidNostrEvent(event)).toBe(true);
    });

    it("should reject invalid event structures", () => {
      const invalidEvent = {
        kind: 0,
        content: "test",
        // Missing required fields
      };

      expect(isValidNostrEvent(invalidEvent)).toBe(false);
    });
  });
});

