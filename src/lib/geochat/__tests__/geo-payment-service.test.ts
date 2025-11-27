/**
 * Geo Payment Service Tests
 *
 * Unit tests for Phase 4 geo-room payment functionality:
 * - getAccountContext()
 * - buildGeoPaymentContext()
 * - getPaymentWarning()
 * - createGeoPaymentRequest()
 *
 * @module src/lib/geochat/__tests__/geo-payment-service.test.ts
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  getAccountContext,
  buildGeoPaymentContext,
  getPaymentWarning,
  createGeoPaymentRequest,
} from "../geo-payment-service";
import {
  GeoPaymentError,
  DEFAULT_TRUST_THRESHOLDS,
} from "../geo-payment-types";
import type { Event as NostrEvent } from "nostr-tools";

// Mock Supabase client with proper chaining for multiple .eq() calls
const mockMaybeSingle = vi.fn();

// Create a chainable mock that supports .eq().eq().maybeSingle()
const createChainableMock = () => {
  const chainable: Record<string, unknown> = {};
  chainable.eq = () => chainable;
  chainable.maybeSingle = () => mockMaybeSingle();
  return chainable;
};

vi.mock("../../supabase", () => ({
  supabase: {
    from: () => ({
      select: () => createChainableMock(),
    }),
  },
}));

// Mock fetch for payment API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

vi.mock("../../../config/env.client", () => ({
  clientConfig: {
    flags: {
      geochatEnabled: true,
      geochatLiveEnabled: true,
      geochatContactsEnabled: true,
      geochatPaymentsEnabled: true,
    },
  },
  GEOCHAT_PAYMENTS_ENABLED: true,
}));

// Test data
const TEST_USER_NPUB =
  "npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsutk245";
const TEST_RECIPIENT_NPUB =
  "npub1rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr5u7hl7";
const TEST_GEOHASH = "9q8yy5d";

const createMockNostrEvent = (pubkey: string, content: string): NostrEvent => ({
  id: "test-event-id",
  pubkey,
  created_at: Math.floor(Date.now() / 1000),
  kind: 1,
  tags: [],
  content,
  sig: "test-signature",
});

describe("geo-payment-service Phase 4", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    mockMaybeSingle.mockReset();
  });

  afterEach(() => {
    console.log("✅ Test cleanup completed");
  });

  describe("getPaymentWarning()", () => {
    it("should return null for verified contacts regardless of amount", () => {
      const warning = getPaymentWarning("verified", 100000);
      expect(warning).toBeNull();
    });

    it("should return null for known contacts below threshold", () => {
      const warning = getPaymentWarning("known", 10000);
      expect(warning).toBeNull();
    });

    it("should return warning for known contacts above threshold", () => {
      const warning = getPaymentWarning("known", 60000);
      expect(warning).not.toBeNull();
      expect(warning?.severity).toBe("warning");
      expect(warning?.message).toContain("known");
    });

    it("should return warning for unknown contacts above warn threshold", () => {
      const warning = getPaymentWarning("unknown", 6000);
      expect(warning).not.toBeNull();
      expect(warning?.severity).toBe("warning");
    });

    it("should return block for unknown contacts above block threshold", () => {
      const warning = getPaymentWarning("unknown", 60000);
      expect(warning).not.toBeNull();
      expect(warning?.severity).toBe("block");
    });

    it("should use custom thresholds when provided", () => {
      const customThresholds = {
        unknownWarnThreshold: 100,
        unknownBlockThreshold: 500,
        knownWarnThreshold: 1000,
      };
      const warning = getPaymentWarning("unknown", 200, customThresholds);
      expect(warning).not.toBeNull();
      expect(warning?.severity).toBe("warning");
    });
  });

  describe("getAccountContext()", () => {
    it("should return individual account when no federation membership found", async () => {
      mockMaybeSingle.mockResolvedValue({ data: null, error: null });

      const context = await getAccountContext(TEST_USER_NPUB);
      expect(context.type).toBe("individual");
      expect(context.federationId).toBeUndefined();
    });

    it("should return federation account when membership found", async () => {
      // First call: user_identities query returns federation membership
      mockMaybeSingle.mockResolvedValueOnce({
        data: {
          family_federation_id: "fed-123",
          role: "adult",
        },
        error: null,
      });
      // Second call: family_federations query returns federation details
      mockMaybeSingle.mockResolvedValueOnce({
        data: {
          federation_name: "Test Family",
          guardian_approval_threshold: 2,
        },
        error: null,
      });

      const context = await getAccountContext(TEST_USER_NPUB);
      expect(context.type).toBe("federation");
      expect(context.federationId).toBe("fed-123");
      expect(context.federationName).toBe("Test Family");
    });
  });

  describe("buildGeoPaymentContext()", () => {
    beforeEach(() => {
      // Default to individual account
      mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    });

    it("should build context from Nostr event", async () => {
      const event = createMockNostrEvent(
        "abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234",
        "Hello from geo-room!"
      );

      const context = await buildGeoPaymentContext(
        event,
        TEST_GEOHASH,
        TEST_USER_NPUB,
        "known"
      );

      expect(context.recipientNpub).toContain("npub1");
      // Geohash is truncated to 4 chars for privacy
      expect(context.originGeohash).toBe(TEST_GEOHASH.slice(0, 4));
      expect(context.trustLevel).toBe("known");
      expect(context.accountContext.type).toBe("individual");
    });

    it("should truncate geohash for privacy", async () => {
      const event = createMockNostrEvent(
        "abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234",
        "Test message"
      );

      const context = await buildGeoPaymentContext(
        event,
        "9q8yy5d7x",
        TEST_USER_NPUB,
        "unknown"
      );

      // Geohash should be truncated to 4 chars for privacy
      expect(context.originGeohash.length).toBeLessThanOrEqual(4);
    });
  });

  describe("createGeoPaymentRequest()", () => {
    beforeEach(() => {
      // Default to individual account
      mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    });

    it("should throw GeoPaymentError when trust level blocks payment", async () => {
      const event = createMockNostrEvent(
        "abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234",
        "Test"
      );

      const context = await buildGeoPaymentContext(
        event,
        TEST_GEOHASH,
        TEST_USER_NPUB,
        "unknown"
      );

      await expect(
        createGeoPaymentRequest({
          context,
          amount: 100000, // Above block threshold
          privacyLevel: "auto",
        })
      ).rejects.toThrow(GeoPaymentError);
    });

    it("should process individual payment successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            paymentId: "pay-123",
          }),
      });

      const event = createMockNostrEvent(
        "abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234",
        "Test"
      );

      const context = await buildGeoPaymentContext(
        event,
        TEST_GEOHASH,
        TEST_USER_NPUB,
        "verified"
      );

      const result = await createGeoPaymentRequest({
        context,
        amount: 1000,
        privacyLevel: "auto",
      });

      expect(result.success).toBe(true);
      expect(result.transactionId).toBe("pay-123");
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/family/privacy-enhanced-payments",
        expect.objectContaining({
          method: "POST",
        })
      );
    });

    it("should allow payment with warning when above warn threshold but below block", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            paymentId: "pay-456",
          }),
      });

      const event = createMockNostrEvent(
        "abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234",
        "Test"
      );

      const context = await buildGeoPaymentContext(
        event,
        TEST_GEOHASH,
        TEST_USER_NPUB,
        "unknown"
      );

      // Check that warning is generated for this amount
      const warning = getPaymentWarning("unknown", 6000);
      expect(warning).toBeDefined();
      expect(warning?.severity).toBe("warning");
      expect(warning?.shouldBlock).toBe(false);

      // Payment should still succeed (warning doesn't block)
      const result = await createGeoPaymentRequest({
        context,
        amount: 6000, // Above warn threshold but below block
        privacyLevel: "auto",
      });

      expect(result.success).toBe(true);
    });
  });
});
