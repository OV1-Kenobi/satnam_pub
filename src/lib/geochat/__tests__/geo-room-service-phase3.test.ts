/**
 * Geo Room Service Phase 3 Tests
 *
 * Unit tests for Phase 3 geo-room contacts and private messaging functionality:
 * - addContactFromGeoMessage()
 * - verifyContactWithPhysicalMFA()
 * - truncateGeohashForPrivacy()
 * - Trust recalculation integration
 *
 * @module src/lib/geochat/__tests__/geo-room-service-phase3.test.ts
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  addContactFromGeoMessage,
  verifyContactWithPhysicalMFA,
  truncateGeohashForPrivacy,
} from "../geo-room-service";
import { Phase3Error } from "../types";
import type { MFAChallenge } from "../types";

// Mock CEPS
const mockAddContact = vi.fn();
const mockSendStandardDirectMessage = vi.fn();

vi.mock("../../../../lib/central_event_publishing_service", () => ({
  central_event_publishing_service: {
    addContact: (...args: unknown[]) => mockAddContact(...args),
    sendStandardDirectMessage: (...args: unknown[]) =>
      mockSendStandardDirectMessage(...args),
  },
  DEFAULT_UNIFIED_CONFIG: {
    relays: ["wss://fallback1.test", "wss://fallback2.test"],
  },
}));

// Mock fetch for trust recalculation API
const mockFetch = vi.fn();
global.fetch = mockFetch;

vi.mock("../../../config/env.client", () => ({
  clientConfig: {
    flags: {
      geochatEnabled: true,
      geochatLiveEnabled: true,
      geochatContactsEnabled: true,
    },
  },
  GEOCHAT_CONTACTS_ENABLED: true,
  GEOCHAT_TRUST_WEIGHT: 1.5,
  GEOCHAT_PHYSICAL_MFA_TRUST_WEIGHT: 3.0,
}));

// Test data
const TEST_NPUB =
  "npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsutk245";
const TEST_COUNTERPARTY_NPUB =
  "npub1rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr5u7hl7";
const TEST_GEOHASH = "9q8yy5d";

describe("geo-room-service Phase 3", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAddContact.mockResolvedValue("contact-123");
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    mockSendStandardDirectMessage.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("truncateGeohashForPrivacy()", () => {
    it("should truncate geohash to 4 characters", () => {
      expect(truncateGeohashForPrivacy("9q8yy5d")).toBe("9q8y");
      expect(truncateGeohashForPrivacy("dr5rs")).toBe("dr5r");
    });

    it("should return geohash as-is if already 4 or fewer characters", () => {
      expect(truncateGeohashForPrivacy("9q8y")).toBe("9q8y");
      expect(truncateGeohashForPrivacy("9q8")).toBe("9q8");
    });

    it("should return empty string for undefined input", () => {
      // The actual implementation returns "" for falsy input
      expect(truncateGeohashForPrivacy(undefined as unknown as string)).toBe(
        ""
      );
    });

    it("should return empty string for empty string input", () => {
      expect(truncateGeohashForPrivacy("")).toBe("");
    });
  });

  describe("addContactFromGeoMessage()", () => {
    it("should add contact successfully with valid parameters", async () => {
      const result = await addContactFromGeoMessage({
        npub: TEST_NPUB,
        originGeohash: TEST_GEOHASH,
        displayName: "Test Contact",
      });

      // Result has contactId, trustLevel, identityRevealed
      expect(result.contactId).toBe("contact-123");
      expect(result.trustLevel).toBe("known");
      expect(result.identityRevealed).toBe(false);
    });

    it("should trigger trust recalculation API call", async () => {
      await addContactFromGeoMessage({
        npub: TEST_NPUB,
        originGeohash: TEST_GEOHASH,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/communications/recalculate-trust",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })
      );

      // Verify body contains correct action type
      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.actionType).toBe("geo_contact_added");
      expect(body.metadata.originGeohash).toBe("9q8y");
    });

    it("should throw Phase3Error for missing npub", async () => {
      await expect(
        addContactFromGeoMessage({
          npub: "",
          originGeohash: TEST_GEOHASH,
        })
      ).rejects.toThrow(Phase3Error);
    });

    it("should continue successfully if trust recalculation fails", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      const result = await addContactFromGeoMessage({
        npub: TEST_NPUB,
        originGeohash: TEST_GEOHASH,
      });

      // Contact should still be created
      expect(result.contactId).toBe("contact-123");
    });

    it("should handle identity revelation when revealIdentity is true", async () => {
      const result = await addContactFromGeoMessage({
        npub: TEST_NPUB,
        originGeohash: TEST_GEOHASH,
        revealIdentity: true,
        identityInfo: {
          npub: "npub1myidentity123",
          nip05: "alice@my.satnam.pub",
          displayName: "Alice",
          pictureUrl: "https://example.com/alice.jpg",
          trustSummary: "Verified by 3 contacts",
        },
      });

      expect(result.identityRevealed).toBe(true);
      // Identity revelation sends a DM with complete payload
      expect(mockSendStandardDirectMessage).toHaveBeenCalled();
      const sentPayload = JSON.parse(
        mockSendStandardDirectMessage.mock.calls[0][1]
      );
      expect(sentPayload.type).toBe("identity_reveal");
      expect(sentPayload.version).toBe("1.0");
      expect(sentPayload.npub).toBe("npub1myidentity123");
      expect(sentPayload.nip05).toBe("alice@my.satnam.pub");
      expect(sentPayload.displayName).toBe("Alice");
      expect(sentPayload.pictureUrl).toBe("https://example.com/alice.jpg");
      expect(sentPayload.trustSummary).toBe("Verified by 3 contacts");
      expect(sentPayload.sharedAt).toBeDefined();
    });

    it("should throw Phase3Error when revealIdentity is true but identityInfo is missing", async () => {
      await expect(
        addContactFromGeoMessage({
          npub: TEST_NPUB,
          originGeohash: TEST_GEOHASH,
          revealIdentity: true,
        })
      ).rejects.toThrow(Phase3Error);
    });

    it("should not reveal identity by default", async () => {
      const result = await addContactFromGeoMessage({
        npub: TEST_NPUB,
        originGeohash: TEST_GEOHASH,
      });

      expect(result.identityRevealed).toBe(false);
      // No identity revelation DM should be sent
      expect(mockSendStandardDirectMessage).not.toHaveBeenCalled();
    });

    it("should throw Phase3Error when CEPS.addContact fails", async () => {
      mockAddContact.mockRejectedValueOnce(new Error("CEPS failed"));

      await expect(
        addContactFromGeoMessage({
          npub: TEST_NPUB,
          originGeohash: TEST_GEOHASH,
        })
      ).rejects.toThrow(Phase3Error);
    });
  });

  describe("verifyContactWithPhysicalMFA()", () => {
    // Helper to create a fresh MFA challenge
    // Note: MFAChallenge uses issuedAt for freshness check, expiry is calculated
    // from issuedAt (within 120 seconds window per the verification logic)
    const createFreshChallenge = (): MFAChallenge => ({
      subjectNpub: TEST_NPUB,
      counterpartyNpub: TEST_COUNTERPARTY_NPUB,
      originGeohash: "9q8y",
      nonce: "test-nonce-" + Date.now(),
      issuedAt: new Date(),
    });

    // Mock signature (in real scenario this would be a valid ECDSA P-256 signature)
    const mockSignature = "a".repeat(128);
    // Mock P-256 uncompressed public key (65 bytes = 130 hex chars)
    const mockMfaPublicKey = "04" + "a".repeat(128);

    it("should throw Phase3Error for expired challenge", async () => {
      const expiredChallenge = createFreshChallenge();
      // Set issuedAt to 3 minutes ago (challenge expires after 120 seconds)
      expiredChallenge.issuedAt = new Date(Date.now() - 180 * 1000);

      await expect(
        verifyContactWithPhysicalMFA({
          contactNpub: TEST_COUNTERPARTY_NPUB,
          challenge: expiredChallenge,
          subjectMfaSignature: mockSignature,
          counterpartyMfaSignature: mockSignature,
          subjectMfaPublicKeyHex: mockMfaPublicKey,
          counterpartyMfaPublicKeyHex: mockMfaPublicKey,
        })
      ).rejects.toThrow(Phase3Error);
    });

    it("should include originGeohash truncated in challenge", () => {
      const challenge = createFreshChallenge();
      expect(challenge.originGeohash).toBe("9q8y"); // Already truncated
    });
  });

  describe("Trust Weight Integration", () => {
    it("should use GEOCHAT_TRUST_WEIGHT for geo_contact_added action", async () => {
      await addContactFromGeoMessage({
        npub: TEST_NPUB,
        originGeohash: TEST_GEOHASH,
      });

      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.weight).toBe(1.5); // GEOCHAT_TRUST_WEIGHT default
    });
  });
});
