/**
 * @fileoverview Lightning Address API Tests
 * @description Tests for Lightning Address LNURL endpoints using Vitest
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the dependencies
vi.mock("../../lib/lightning-client");
vi.mock("../../lib/family-api");
vi.mock("../../lib/privacy");

// Mock family member data
const mockFamilyMember = {
  id: "1",
  username: "daughter",
  name: "Alice",
  role: "child",
  dailyLimit: 5000,
  nostrPubkey: "npub1234567890abcdef",
};

// Mock implementations
const mockGetFamilyMembers = vi.fn();
const mockCreateFamilyInvoice = vi.fn();
const mockLogPrivacyOperation = vi.fn();

// Mock LightningClient as a constructor function
const MockLightningClient = vi.fn().mockImplementation(() => ({
  createFamilyInvoice: mockCreateFamilyInvoice,
}));

describe("Lightning Address API Endpoints", () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup mocks - work with existing privacy-first API structure
    const familyApi = await import("../../lib/family-api");
    familyApi.familyAPI.getFamilyMembers = mockGetFamilyMembers;

    // Mock the LightningClient constructor
    const lightningModule = await import("../../lib/lightning-client");
    vi.mocked(lightningModule).LightningClient = MockLightningClient;

    const privacy = await import("../../lib/privacy");
    privacy.logPrivacyOperation = mockLogPrivacyOperation;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("LNURL Discovery Endpoint", () => {
    const createLNURLRequest = (
      username: string,
      domain: string = "satnam.pub",
    ) => {
      return new Request(`https://${domain}/api/lnurl/${username}`, {
        method: "GET",
      });
    };

    it("should return LNURL-pay response for valid family member", async () => {
      mockGetFamilyMembers.mockResolvedValueOnce([mockFamilyMember]);

      // Import the handler
      const { default: handler } = await import("../lnurl/[username]");

      const request = createLNURLRequest("daughter");
      const response = await handler(request);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toMatchObject({
        callback: "https://satnam.pub/api/lnurl/daughter/callback",
        maxSendable: 5000000, // Daily limit in millisats
        minSendable: 1000,
        tag: "payRequest",
        commentAllowed: 280,
        allowsNostr: true,
        nostrPubkey: "npub1234567890abcdef",
      });

      expect(data.metadata).toBeDefined();
      const metadata = JSON.parse(data.metadata);
      expect(metadata).toContainEqual([
        "text/identifier",
        "daughter@satnam.pub",
      ]);
      expect(metadata).toContainEqual([
        "text/plain",
        "Payment to Alice - Satnam Family Banking",
      ]);
    });

    it("should return 404 for non-existent family member", async () => {
      mockGetFamilyMembers.mockResolvedValueOnce([]);

      const { default: handler } = await import("../lnurl/[username]");

      const request = createLNURLRequest("nonexistent");
      const response = await handler(request);

      expect(response.status).toBe(404);
      expect(await response.text()).toBe("Family member not found");
    });

    it("should return 400 for empty username", async () => {
      const { default: handler } = await import("../lnurl/[username]");

      const request = new Request("https://satnam.pub/api/lnurl/", {
        method: "GET",
      });
      const response = await handler(request);

      expect(response.status).toBe(400);
      expect(await response.text()).toBe("Username required");
    });

    it("should return 400 for invalid username format", async () => {
      const { default: handler } = await import("../lnurl/[username]");

      const request = createLNURLRequest("invalid@username");
      const response = await handler(request);

      expect(response.status).toBe(400);
      expect(await response.text()).toBe("Invalid username format");
    });

    it("should return 405 for non-GET requests", async () => {
      const { default: handler } = await import("../lnurl/[username]");

      const request = new Request("https://satnam.pub/api/lnurl/daughter", {
        method: "POST",
      });
      const response = await handler(request);

      expect(response.status).toBe(405);
      expect(response.headers.get("Allow")).toBe("GET");
    });

    it("should calculate limits correctly for different roles", async () => {
      // Test parent role
      mockGetFamilyMembers.mockResolvedValueOnce([
        {
          ...mockFamilyMember,
          username: "mom",
          role: "parent",
          dailyLimit: 0, // No limit
        },
      ]);

      const { default: handler } = await import("../lnurl/[username]");

      const request = createLNURLRequest("mom");
      const response = await handler(request);

      const data = await response.json();
      expect(data.maxSendable).toBe(100000000); // 100,000 sats in millisats
    });

    it("should handle missing nostr pubkey", async () => {
      mockGetFamilyMembers.mockResolvedValueOnce([
        {
          ...mockFamilyMember,
          nostrPubkey: null,
        },
      ]);

      const { default: handler } = await import("../lnurl/[username]");

      const request = createLNURLRequest("daughter");
      const response = await handler(request);

      const data = await response.json();
      expect(data.allowsNostr).toBe(true);
      expect(data.nostrPubkey).toBeUndefined();
    });

    it("should handle server errors gracefully", async () => {
      mockGetFamilyMembers.mockRejectedValueOnce(new Error("Database error"));

      const { default: handler } = await import("../lnurl/[username]");

      const request = createLNURLRequest("daughter");
      const response = await handler(request);

      expect(response.status).toBe(500);

      const data = await response.json();
      expect(data).toMatchObject({
        status: "ERROR",
        reason: "Internal server error",
      });
    });
  });

  describe("LNURL Callback Endpoint", () => {
    const createCallbackRequest = (
      username: string,
      params: Record<string, string>,
    ) => {
      const url = new URL(`https://satnam.pub/api/lnurl/${username}/callback`);
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });

      return new Request(url.toString(), {
        method: "GET",
      });
    };

    it("should generate invoice for valid payment request", async () => {
      mockGetFamilyMembers.mockResolvedValueOnce([mockFamilyMember]);
      mockCreateFamilyInvoice.mockResolvedValueOnce({
        invoice: "lnbc1000n1...test-invoice",
        paymentHash: "test-hash",
        privacy: {
          isPrivacyEnabled: true,
          privacyFee: 2,
        },
      });

      const { default: handler } = await import("../lnurl/[username]/callback");

      const request = createCallbackRequest("daughter", {
        amount: "1000000", // 1000 sats in millisats
        comment: "Weekly allowance",
      });

      const response = await handler(request);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toMatchObject({
        pr: "lnbc1000n1...test-invoice",
        status: "OK",
        disposable: true,
      });

      expect(data.successAction).toBeDefined();
      expect(data.successAction.message).toContain("Alice");

      expect(mockCreateFamilyInvoice).toHaveBeenCalledWith(
        "daughter",
        1000,
        expect.stringContaining(
          "Payment to Alice@satnam.pub - Weekly allowance",
        ),
      );

      expect(mockLogPrivacyOperation).toHaveBeenCalledWith({
        operation: "lightning_address_invoice",
        details: {
          username: "daughter",
          amount: 1000,
          privacyEnabled: true,
          privacyFee: 2,
          hasNostrZap: false,
        },
        timestamp: expect.any(Date),
      });
    });

    it("should handle Nostr zap requests", async () => {
      mockGetFamilyMembers.mockResolvedValueOnce([mockFamilyMember]);
      mockCreateFamilyInvoice.mockResolvedValueOnce({
        invoice: "lnbc2500n1...zap-invoice",
        paymentHash: "zap-hash",
        privacy: {
          isPrivacyEnabled: true,
          privacyFee: 3,
        },
      });

      const nostrEvent = JSON.stringify({
        kind: 9734,
        pubkey: "test-pubkey",
        content: "Great post!",
      });

      const { default: handler } = await import("../lnurl/[username]/callback");

      const request = createCallbackRequest("daughter", {
        amount: "2500000", // 2500 sats
        comment: "Zap for content",
        nostr: nostrEvent,
      });

      const response = await handler(request);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.successAction.message).toContain("⚡ Nostr Zap");

      expect(mockCreateFamilyInvoice).toHaveBeenCalledWith(
        "daughter",
        2500,
        expect.stringContaining("⚡ Nostr Zap: Payment to Alice@satnam.pub"),
      );

      expect(mockLogPrivacyOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({
            hasNostrZap: true,
          }),
        }),
      );
    });

    it("should return error for missing amount", async () => {
      const { default: handler } = await import("../lnurl/[username]/callback");

      const request = createCallbackRequest("daughter", {
        comment: "Test payment",
      });

      const response = await handler(request);

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data).toMatchObject({
        status: "ERROR",
        reason: "Amount parameter required",
      });
    });

    it("should return error for invalid amount", async () => {
      const { default: handler } = await import("../lnurl/[username]/callback");

      const request = createCallbackRequest("daughter", {
        amount: "invalid",
      });

      const response = await handler(request);

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data).toMatchObject({
        status: "ERROR",
        reason: "Invalid amount",
      });
    });

    it("should return error for amount below minimum", async () => {
      mockGetFamilyMembers.mockResolvedValueOnce([mockFamilyMember]);

      const { default: handler } = await import("../lnurl/[username]/callback");

      const request = createCallbackRequest("daughter", {
        amount: "500", // 0.5 sats in millisats
      });

      const response = await handler(request);

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.reason).toContain("Amount must be between");
    });

    it("should return error for amount above maximum", async () => {
      mockGetFamilyMembers.mockResolvedValueOnce([mockFamilyMember]);

      const { default: handler } = await import("../lnurl/[username]/callback");

      const request = createCallbackRequest("daughter", {
        amount: "10000000", // 10,000 sats in millisats (above daily limit)
      });

      const response = await handler(request);

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.reason).toContain("Amount must be between");
    });

    it("should return 404 for non-existent family member", async () => {
      mockGetFamilyMembers.mockResolvedValueOnce([]);

      const { default: handler } = await import("../lnurl/[username]/callback");

      const request = createCallbackRequest("nonexistent", {
        amount: "1000000",
      });

      const response = await handler(request);

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data).toMatchObject({
        status: "ERROR",
        reason: "Family member not found",
      });
    });

    it("should handle invalid Nostr event gracefully", async () => {
      mockGetFamilyMember.mockResolvedValueOnce(mockFamilyMember);
      mockCreateFamilyInvoice.mockResolvedValueOnce({
        invoice: "lnbc1000n1...invoice",
        paymentHash: "hash",
        privacy: { isPrivacyEnabled: false, privacyFee: 0 },
      });

      const { default: handler } = await import("../lnurl/[username]/callback");

      const request = createCallbackRequest("daughter", {
        amount: "1000000",
        nostr: "invalid-json",
      });

      const response = await handler(request);

      expect(response.status).toBe(200); // Should still succeed

      const data = await response.json();
      expect(data.status).toBe("OK");

      // Should log as non-zap payment
      expect(mockLogPrivacyOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({
            hasNostrZap: false,
          }),
        }),
      );
    });

    it("should return 405 for non-GET requests", async () => {
      const { default: handler } = await import("../lnurl/[username]/callback");

      const request = new Request(
        "https://satnam.pub/api/lnurl/daughter/callback?amount=1000000",
        {
          method: "POST",
        },
      );

      const response = await handler(request);

      expect(response.status).toBe(405);

      const data = await response.json();
      expect(data.reason).toBe("Method not allowed");
    });

    it("should handle privacy service failure gracefully", async () => {
      mockGetFamilyMember.mockResolvedValueOnce(mockFamilyMember);
      mockCreateFamilyInvoice.mockRejectedValueOnce(
        new Error("Privacy protection failed for family invoice"),
      );

      const { default: handler } = await import("../lnurl/[username]/callback");

      const request = createCallbackRequest("daughter", {
        amount: "1000000",
      });

      const response = await handler(request);

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.reason).toContain("privacy service");
    });

    it("should sanitize comment input", async () => {
      mockGetFamilyMember.mockResolvedValueOnce(mockFamilyMember);
      mockCreateFamilyInvoice.mockResolvedValueOnce({
        invoice: "lnbc1000n1...invoice",
        paymentHash: "hash",
        privacy: { isPrivacyEnabled: false, privacyFee: 0 },
      });

      const { default: handler } = await import("../lnurl/[username]/callback");

      const maliciousComment = '<script>alert("xss")</script>Payment';
      const request = createCallbackRequest("daughter", {
        amount: "1000000",
        comment: maliciousComment,
      });

      const response = await handler(request);

      expect(response.status).toBe(200);

      // Verify comment was sanitized in the description
      expect(mockCreateFamilyInvoice).toHaveBeenCalledWith(
        "daughter",
        1000,
        expect.stringContaining("scriptalertxssscriptPayment"), // Sanitized
      );
    });
  });
});
