/**
 * @fileoverview Lightning Client Privacy Integration Tests
 * @description Tests for Lightning client privacy features using Vitest
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LightningClient } from "../lightning-client";

// Mock fetch for testing LNProxy calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("LightningClient Privacy Integration", () => {
  let lightningClient: LightningClient;

  beforeEach(() => {
    lightningClient = new LightningClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("createInvoice with Privacy", () => {
    it("should create invoice with privacy enabled by default", async () => {
      const mockPrivacyResponse = {
        proxy_invoice: "lnbc1000n1...privacy-wrapped",
        routing_fee: 1,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPrivacyResponse,
      });

      const result = await lightningClient.createInvoice({
        amount: 1000,
        description: "Test payment",
      });

      expect(result.invoice).toBe(mockPrivacyResponse.proxy_invoice);
      expect(result.privacy).toBeDefined();
      expect(result.privacy?.isPrivacyEnabled).toBe(true);
      expect(result.privacy?.privacyFee).toBe(1);
    });

    it("should create invoice without privacy when disabled", async () => {
      const result = await lightningClient.createInvoice(
        {
          amount: 1000,
          description: "Test payment",
        },
        false,
      ); // Privacy disabled

      expect(result.invoice).toContain("demo-invoice");
      expect(result.privacy).toBeUndefined();
    });

    it("should fallback to original invoice when privacy fails", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Privacy service down"));

      const result = await lightningClient.createInvoice({
        amount: 1000,
        description: "Test payment",
      });

      // Should still create invoice, but without privacy
      expect(result.invoice).toContain("demo-invoice");
      expect(result.paymentHash).toBeDefined();
      expect(result.checkingId).toBeDefined();
    });

    it("should validate invoice request parameters", async () => {
      await expect(
        lightningClient.createInvoice({ amount: 0, description: "Test" }),
      ).rejects.toThrow("Invalid amount: must be positive number");

      await expect(
        lightningClient.createInvoice({ amount: -100, description: "Test" }),
      ).rejects.toThrow("Invalid amount: must be positive number");
    });
  });

  describe("createFamilyInvoice", () => {
    it("should create family invoice with privacy protection", async () => {
      const mockPrivacyResponse = {
        proxy_invoice: "lnbc2500n1...family-privacy-wrapped",
        routing_fee: 2,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPrivacyResponse,
      });

      const result = await lightningClient.createFamilyInvoice(
        "daughter",
        2500,
        "Weekly allowance",
      );

      expect(result.invoice).toBe(mockPrivacyResponse.proxy_invoice);
      expect(result.privacy.isPrivacyEnabled).toBe(true);
      expect(result.privacy.privacyFee).toBe(2);
      expect(result.paymentHash).toBeDefined();
    });

    it("should generate correct family payment description", async () => {
      const mockPrivacyResponse = {
        proxy_invoice: "lnbc2500n1...family-privacy-wrapped",
        routing_fee: 2,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPrivacyResponse,
      });

      await lightningClient.createFamilyInvoice("son", 1500, "Chores payment");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining(
            "Payment to son@satnam.pub: Chores payment",
          ),
        }),
      );
    });

    it("should handle family invoice without purpose", async () => {
      const mockPrivacyResponse = {
        proxy_invoice: "lnbc1000n1...family-privacy-wrapped",
        routing_fee: 1,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPrivacyResponse,
      });

      await lightningClient.createFamilyInvoice("spouse", 1000);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining("Payment to spouse@satnam.pub"),
        }),
      );
    });

    it("should throw error when privacy protection fails for family payments", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Privacy service unavailable"));

      await expect(
        lightningClient.createFamilyInvoice(
          "daughter",
          2500,
          "Weekly allowance",
        ),
      ).rejects.toThrow("Privacy protection failed for family invoice");
    });
  });

  describe("checkPrivacyHealth", () => {
    it("should return privacy service health status", async () => {
      // Add small delay to simulate network time
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 10)),
      );

      const health = await lightningClient.checkPrivacyHealth();

      expect(health.available).toBe(true);
      expect(health.responseTime).toBeGreaterThan(0);
    });

    it("should return unhealthy status when service is down", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const health = await lightningClient.checkPrivacyHealth();

      expect(health.available).toBe(false);
      expect(health.error).toBe("HTTP 500");
    });
  });

  describe("getPrivacyConfig", () => {
    it("should return privacy configuration", () => {
      const config = lightningClient.getPrivacyConfig();

      expect(config.serviceUrl).toBe("https://lnproxy.org");
      expect(config.defaultRoutingBudget).toBe(1000);
    });
  });

  describe("Privacy Integration Edge Cases", () => {
    it("should handle malformed privacy response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invalid: "response" }),
      });

      const result = await lightningClient.createInvoice({
        amount: 1000,
        description: "Test",
      });

      // Should fallback to original invoice
      expect(result.invoice).toContain("demo-invoice");
    });

    it("should handle privacy service timeout", async () => {
      // Mock a timeout scenario
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Request timeout")), 100),
          ),
      );

      const result = await lightningClient.createInvoice({
        amount: 1000,
        description: "Test",
      });

      // Should fallback gracefully
      expect(result.invoice).toContain("demo-invoice");
    });

    it("should handle empty privacy response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const result = await lightningClient.createInvoice({
        amount: 1000,
        description: "Test",
      });

      expect(result.invoice).toContain("demo-invoice");
    });
  });

  describe("Privacy Fee Handling", () => {
    it("should correctly report privacy fees", async () => {
      const mockPrivacyResponse = {
        proxy_invoice: "lnbc1000n1...privacy-wrapped",
        routing_fee: 5,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPrivacyResponse,
      });

      const result = await lightningClient.createInvoice({
        amount: 1000,
        description: "Test",
      });

      expect(result.privacy?.privacyFee).toBe(5);
    });

    it("should handle zero privacy fees", async () => {
      const mockPrivacyResponse = {
        proxy_invoice: "lnbc1000n1...privacy-wrapped",
        routing_fee: 0,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPrivacyResponse,
      });

      const result = await lightningClient.createInvoice({
        amount: 1000,
        description: "Test",
      });

      expect(result.privacy?.privacyFee).toBe(0);
      expect(result.privacy?.isPrivacyEnabled).toBe(true);
    });

    it("should handle missing routing_fee in response", async () => {
      const mockPrivacyResponse = {
        proxy_invoice: "lnbc1000n1...privacy-wrapped",
        // No routing_fee field
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPrivacyResponse,
      });

      const result = await lightningClient.createInvoice({
        amount: 1000,
        description: "Test",
      });

      expect(result.privacy?.privacyFee).toBe(0);
      expect(result.privacy?.isPrivacyEnabled).toBe(true);
    });
  });

  describe("Environment Variable Handling", () => {
    it("should respect VITE_LNPROXY_URL environment variable", () => {
      process.env.VITE_LNPROXY_URL = "https://custom-proxy.example.com";

      const customClient = new LightningClient();
      const config = customClient.getPrivacyConfig();

      expect(config.serviceUrl).toBe("https://custom-proxy.example.com");

      // Cleanup
      delete process.env.VITE_LNPROXY_URL;
    });

    it("should fallback to default URL when env var is not set", () => {
      const config = lightningClient.getPrivacyConfig();
      expect(config.serviceUrl).toBe("https://lnproxy.org");
    });
  });
});
