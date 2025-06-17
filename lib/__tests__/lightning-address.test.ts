/**
 * @fileoverview Lightning Address Service Tests
 * @description Comprehensive tests for Lightning Address functionality using Vitest
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LightningAddressService } from "../lightning-address";

// Mock the dependencies
vi.mock("../lightning-client");
vi.mock("../family-api");
vi.mock("../privacy");

// Mock family member data
const mockFamilyMembers = {
  daughter: {
    id: "1",
    username: "daughter",
    name: "Alice",
    role: "child",
    dailyLimit: 5000,
    nostrPubkey: "npub1234567890abcdef",
  },
  son: {
    id: "2",
    username: "son",
    name: "Bob",
    role: "teen",
    dailyLimit: 15000,
    nostrPubkey: null,
  },
  parent: {
    id: "3",
    username: "mom",
    name: "Carol",
    role: "parent",
    dailyLimit: 0, // No limit
    nostrPubkey: "npub0987654321fedcba",
  },
};

// Mock Lightning client
const mockLightningClient = {
  createFamilyInvoice: vi.fn(),
};

// Mock family API
const mockGetFamilyMember = vi.fn();
const mockGetFamilyMembers = vi.fn();

// Mock privacy
const mockLogPrivacyOperation = vi.fn();

describe("LightningAddressService", () => {
  let service: LightningAddressService;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup mock implementations
    const { LightningClient } = require("../lightning-client");
    LightningClient.mockImplementation(() => mockLightningClient);

    const familyApi = require("../family-api");
    familyApi.getFamilyMember = mockGetFamilyMember;
    familyApi.getFamilyMembers = mockGetFamilyMembers;

    const privacy = require("../privacy");
    privacy.logPrivacyOperation = mockLogPrivacyOperation;

    // Create service instance
    service = new LightningAddressService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getLightningAddressInfo", () => {
    it("should return Lightning Address info for valid family member", async () => {
      mockGetFamilyMember.mockResolvedValueOnce(mockFamilyMembers.daughter);

      const result = await service.getLightningAddressInfo("daughter");

      expect(result).toBeDefined();
      expect(result?.username).toBe("daughter");
      expect(result?.address).toBe("daughter@satnam.pub");
      expect(result?.familyMember.name).toBe("Alice");
      expect(result?.limits.minSendable).toBe(1000); // 1 sat in millisats
      expect(result?.limits.maxSendable).toBe(5000000); // 5000 sats in millisats (daily limit)
      expect(result?.nostrEnabled).toBe(true);
    });

    it("should return null for non-existent family member", async () => {
      mockGetFamilyMember.mockResolvedValueOnce(null);

      const result = await service.getLightningAddressInfo("nonexistent");

      expect(result).toBeNull();
    });

    it("should return null for invalid username format", async () => {
      const result = await service.getLightningAddressInfo("invalid@username");

      expect(result).toBeNull();
      expect(mockGetFamilyMember).not.toHaveBeenCalled();
    });

    it("should calculate limits based on role for parent", async () => {
      mockGetFamilyMember.mockResolvedValueOnce(mockFamilyMembers.parent);

      const result = await service.getLightningAddressInfo("mom");

      expect(result?.limits.maxSendable).toBe(100000000); // 100,000 sats (parent limit)
    });

    it("should calculate limits based on role for teen", async () => {
      mockGetFamilyMember.mockResolvedValueOnce(mockFamilyMembers.son);

      const result = await service.getLightningAddressInfo("son");

      expect(result?.limits.maxSendable).toBe(15000000); // 15,000 sats (daily limit applied)
    });

    it("should handle nostr pubkey correctly", async () => {
      mockGetFamilyMember.mockResolvedValueOnce(mockFamilyMembers.son);

      const result = await service.getLightningAddressInfo("son");

      expect(result?.nostrEnabled).toBe(false);
    });
  });

  describe("generatePaymentInvoice", () => {
    it("should generate payment invoice with privacy", async () => {
      mockGetFamilyMember.mockResolvedValueOnce(mockFamilyMembers.daughter);
      mockLightningClient.createFamilyInvoice.mockResolvedValueOnce({
        invoice: "lnbc1000n1...privacy-wrapped",
        paymentHash: "hash123",
        privacy: {
          isPrivacyEnabled: true,
          privacyFee: 2,
        },
      });

      const result = await service.generatePaymentInvoice(
        "daughter",
        1000,
        "Weekly allowance",
      );

      expect(result.address).toBe("daughter@satnam.pub");
      expect(result.amount).toBe(1000);
      expect(result.comment).toBe("Weekly allowance");
      expect(result.invoice).toBe("lnbc1000n1...privacy-wrapped");
      expect(result.privacyEnabled).toBe(true);
      expect(result.privacyFee).toBe(2);
      expect(result.paymentHash).toBe("hash123");

      expect(mockLightningClient.createFamilyInvoice).toHaveBeenCalledWith(
        "daughter",
        1000,
        expect.stringContaining(
          "Payment to Alice@satnam.pub - Weekly allowance",
        ),
      );

      expect(mockLogPrivacyOperation).toHaveBeenCalledWith({
        operation: "lightning_address_payment",
        details: {
          username: "daughter",
          amount: 1000,
          hasComment: true,
          hasNostrZap: false,
          privacyEnabled: true,
          privacyFee: 2,
        },
        timestamp: expect.any(Date),
      });
    });

    it("should generate payment invoice with Nostr zap", async () => {
      mockGetFamilyMember.mockResolvedValueOnce(mockFamilyMembers.daughter);
      mockLightningClient.createFamilyInvoice.mockResolvedValueOnce({
        invoice: "lnbc2500n1...zap-invoice",
        paymentHash: "zap-hash",
        privacy: {
          isPrivacyEnabled: true,
          privacyFee: 3,
        },
      });

      const nostrEvent = {
        kind: 9734,
        pubkey: "sender-pubkey",
        content: "Great post!",
      };

      const result = await service.generatePaymentInvoice(
        "daughter",
        2500,
        "Zap for great content",
        nostrEvent,
      );

      expect(result.nostrEvent).toEqual(nostrEvent);
      expect(mockLightningClient.createFamilyInvoice).toHaveBeenCalledWith(
        "daughter",
        2500,
        expect.stringContaining(
          "⚡ Nostr Zap: Payment to Alice@satnam.pub (2500 sats) - Zap for great content",
        ),
      );

      expect(mockLogPrivacyOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({
            hasNostrZap: true,
          }),
        }),
      );
    });

    it("should reject amounts below minimum", async () => {
      mockGetFamilyMember.mockResolvedValueOnce(mockFamilyMembers.daughter);

      await expect(
        service.generatePaymentInvoice("daughter", 0.5), // 0.5 sats
      ).rejects.toThrow("Amount must be between 1 and 5000 sats");
    });

    it("should reject amounts above maximum", async () => {
      mockGetFamilyMember.mockResolvedValueOnce(mockFamilyMembers.daughter);

      await expect(
        service.generatePaymentInvoice("daughter", 10000), // Above daily limit
      ).rejects.toThrow("Amount must be between 1 and 5000 sats");
    });

    it("should handle non-existent Lightning Address", async () => {
      mockGetFamilyMember.mockResolvedValueOnce(null);

      await expect(
        service.generatePaymentInvoice("nonexistent", 1000),
      ).rejects.toThrow("Lightning Address not found");
    });
  });

  describe("getAllLightningAddresses", () => {
    it("should return all family Lightning Addresses", async () => {
      mockGetFamilyMembers.mockResolvedValueOnce([
        mockFamilyMembers.daughter,
        mockFamilyMembers.son,
        mockFamilyMembers.parent,
      ]);

      const result = await service.getAllLightningAddresses();

      expect(result).toHaveLength(3);
      expect(result[0].address).toBe("daughter@satnam.pub");
      expect(result[1].address).toBe("son@satnam.pub");
      expect(result[2].address).toBe("mom@satnam.pub");
    });

    it("should skip family members without usernames", async () => {
      mockGetFamilyMembers.mockResolvedValueOnce([
        mockFamilyMembers.daughter,
        { ...mockFamilyMembers.son, username: null },
      ]);

      const result = await service.getAllLightningAddresses();

      expect(result).toHaveLength(1);
      expect(result[0].address).toBe("daughter@satnam.pub");
    });

    it("should handle empty family list", async () => {
      mockGetFamilyMembers.mockResolvedValueOnce([]);

      const result = await service.getAllLightningAddresses();

      expect(result).toHaveLength(0);
    });
  });

  describe("validateLightningAddress", () => {
    it("should validate correct Lightning Address format", () => {
      expect(service.validateLightningAddress("daughter@satnam.pub")).toBe(
        true,
      );
      expect(service.validateLightningAddress("son@satnam.pub")).toBe(true);
      expect(service.validateLightningAddress("mom@satnam.pub")).toBe(true);
    });

    it("should reject invalid Lightning Address formats", () => {
      expect(service.validateLightningAddress("daughter")).toBe(false);
      expect(service.validateLightningAddress("daughter@")).toBe(false);
      expect(service.validateLightningAddress("@satnam.pub")).toBe(false);
      expect(service.validateLightningAddress("daughter@wrong.domain")).toBe(
        false,
      );
      expect(
        service.validateLightningAddress("daughter@satnam.pub@extra"),
      ).toBe(false);
    });

    it("should reject invalid username formats", () => {
      expect(service.validateLightningAddress("daughter@!@satnam.pub")).toBe(
        false,
      );
      expect(service.validateLightningAddress("daugh ter@satnam.pub")).toBe(
        false,
      );
      expect(service.validateLightningAddress("daughter.test@satnam.pub")).toBe(
        false,
      );
    });
  });

  describe("extractUsername", () => {
    it("should extract username from valid Lightning Address", () => {
      expect(service.extractUsername("daughter@satnam.pub")).toBe("daughter");
      expect(service.extractUsername("son@satnam.pub")).toBe("son");
      expect(service.extractUsername("mom@satnam.pub")).toBe("mom");
    });

    it("should return null for invalid Lightning Address", () => {
      expect(service.extractUsername("invalid-address")).toBeNull();
      expect(service.extractUsername("daughter@wrong.domain")).toBeNull();
      expect(service.extractUsername("")).toBeNull();
    });
  });

  describe("exists", () => {
    it("should return true for existing Lightning Address", async () => {
      mockGetFamilyMember.mockResolvedValueOnce(mockFamilyMembers.daughter);

      const exists = await service.exists("daughter@satnam.pub");

      expect(exists).toBe(true);
    });

    it("should return false for non-existing Lightning Address", async () => {
      mockGetFamilyMember.mockResolvedValueOnce(null);

      const exists = await service.exists("nonexistent@satnam.pub");

      expect(exists).toBe(false);
    });

    it("should return false for invalid Lightning Address format", async () => {
      const exists = await service.exists("invalid-format");

      expect(exists).toBe(false);
      expect(mockGetFamilyMember).not.toHaveBeenCalled();
    });
  });

  describe("Payment Description Generation", () => {
    it("should generate simple payment description", async () => {
      mockGetFamilyMember.mockResolvedValueOnce(mockFamilyMembers.daughter);
      mockLightningClient.createFamilyInvoice.mockResolvedValueOnce({
        invoice: "invoice123",
        paymentHash: "hash123",
        privacy: { isPrivacyEnabled: false, privacyFee: 0 },
      });

      await service.generatePaymentInvoice("daughter", 1000);

      expect(mockLightningClient.createFamilyInvoice).toHaveBeenCalledWith(
        "daughter",
        1000,
        "Payment to Alice@satnam.pub",
      );
    });

    it("should generate payment description with comment", async () => {
      mockGetFamilyMember.mockResolvedValueOnce(mockFamilyMembers.daughter);
      mockLightningClient.createFamilyInvoice.mockResolvedValueOnce({
        invoice: "invoice123",
        paymentHash: "hash123",
        privacy: { isPrivacyEnabled: false, privacyFee: 0 },
      });

      await service.generatePaymentInvoice("daughter", 1000, "Chores payment");

      expect(mockLightningClient.createFamilyInvoice).toHaveBeenCalledWith(
        "daughter",
        1000,
        "Payment to Alice@satnam.pub - Chores payment",
      );
    });

    it("should generate Nostr zap description", async () => {
      mockGetFamilyMember.mockResolvedValueOnce(mockFamilyMembers.daughter);
      mockLightningClient.createFamilyInvoice.mockResolvedValueOnce({
        invoice: "invoice123",
        paymentHash: "hash123",
        privacy: { isPrivacyEnabled: false, privacyFee: 0 },
      });

      const nostrEvent = { kind: 9734, pubkey: "test" };

      await service.generatePaymentInvoice(
        "daughter",
        2500,
        "Great content!",
        nostrEvent,
      );

      expect(mockLightningClient.createFamilyInvoice).toHaveBeenCalledWith(
        "daughter",
        2500,
        "⚡ Nostr Zap: Payment to Alice@satnam.pub (2500 sats) - Great content!",
      );
    });

    it("should sanitize malicious comment content", async () => {
      mockGetFamilyMember.mockResolvedValueOnce(mockFamilyMembers.daughter);
      mockLightningClient.createFamilyInvoice.mockResolvedValueOnce({
        invoice: "invoice123",
        paymentHash: "hash123",
        privacy: { isPrivacyEnabled: false, privacyFee: 0 },
      });

      const maliciousComment = '<script>alert("xss")</script>Payment for you';

      await service.generatePaymentInvoice("daughter", 1000, maliciousComment);

      expect(mockLightningClient.createFamilyInvoice).toHaveBeenCalledWith(
        "daughter",
        1000,
        expect.stringContaining("scriptalertxssscriptPayment for you"), // Sanitized
      );
    });
  });

  describe("Environment Configuration", () => {
    it("should use custom domain from environment", () => {
      vi.stubEnv("VITE_LIGHTNING_ADDRESS_DOMAIN", "family.bitcoin");

      const customService = new LightningAddressService();

      expect(
        customService.validateLightningAddress("daughter@family.bitcoin"),
      ).toBe(true);
      expect(
        customService.validateLightningAddress("daughter@satnam.pub"),
      ).toBe(false);

      // Environment variables are automatically cleaned up by vi.unstubAllEnvs() in afterEach
    });
  });
});
