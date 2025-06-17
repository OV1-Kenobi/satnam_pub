/**
 * @fileoverview LNProxy Privacy Layer Tests
 * @description Comprehensive tests for the Satnam Privacy Layer using Vitest
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SatnamPrivacyLayer,
  createPrivacyLayer,
  wrapInvoiceForPrivacy,
} from "../privacy/lnproxy-privacy";

// Mock fetch for testing
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("SatnamPrivacyLayer", () => {
  let privacyLayer: SatnamPrivacyLayer;
  const testInvoice =
    "lnbc10000n1pjg7mqpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqhp58yjmdan79s6qqdhdzgynm4zwqd5d7xmw5fk98klysy043l2ahrqs";

  beforeEach(() => {
    privacyLayer = new SatnamPrivacyLayer();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe("Constructor", () => {
    it("should initialize with default values", () => {
      const layer = new SatnamPrivacyLayer();
      expect(layer.getServiceUrl()).toBe("https://lnproxy.org");
      expect(layer.getDefaultRoutingBudget()).toBe(1000);
    });

    it("should accept custom configuration", () => {
      const customLayer = new SatnamPrivacyLayer({
        lnproxyUrl: "https://custom-proxy.org",
        defaultRoutingBudgetPpm: 2000,
        requestTimeout: 15000,
      });

      expect(customLayer.getServiceUrl()).toBe("https://custom-proxy.org");
      expect(customLayer.getDefaultRoutingBudget()).toBe(2000);
    });

    it("should read from environment variables", () => {
      // Mock environment variables using vi.stubEnv
      vi.stubEnv("VITE_LNPROXY_URL", "https://env-proxy.org");

      const envLayer = new SatnamPrivacyLayer();
      expect(envLayer.getServiceUrl()).toBe("https://env-proxy.org");

      // Environment variables are automatically cleaned up by vi.unstubAllEnvs() in afterEach
    });
  });

  describe("wrapInvoiceForPrivacy", () => {
    it("should successfully wrap an invoice for privacy", async () => {
      const mockResponse = {
        proxy_invoice: "lnbc10000n1...wrapped-invoice",
        routing_fee: 10,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await privacyLayer.wrapInvoiceForPrivacy(
        testInvoice,
        "Test payment",
      );

      expect(result.isPrivacyEnabled).toBe(true);
      expect(result.wrappedInvoice).toBe(mockResponse.proxy_invoice);
      expect(result.originalInvoice).toBe(testInvoice);
      expect(result.privacyFee).toBe(10);
    });

    it("should fallback to original invoice when API fails", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await privacyLayer.wrapInvoiceForPrivacy(
        testInvoice,
        "Test payment",
      );

      expect(result.isPrivacyEnabled).toBe(false);
      expect(result.wrappedInvoice).toBe(testInvoice);
      expect(result.originalInvoice).toBe(testInvoice);
      expect(result.privacyFee).toBe(0);
    });

    it("should fallback when network request fails", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await privacyLayer.wrapInvoiceForPrivacy(
        testInvoice,
        "Test payment",
      );

      expect(result.isPrivacyEnabled).toBe(false);
      expect(result.wrappedInvoice).toBe(testInvoice);
      expect(result.privacyFee).toBe(0);
    });

    it("should fallback when API returns error", async () => {
      const mockResponse = {
        error: "Invalid invoice format",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await privacyLayer.wrapInvoiceForPrivacy(
        testInvoice,
        "Test payment",
      );

      expect(result.isPrivacyEnabled).toBe(false);
      expect(result.wrappedInvoice).toBe(testInvoice);
    });

    it("should validate invoice format", async () => {
      await expect(
        privacyLayer.wrapInvoiceForPrivacy("", "Test payment"),
      ).rejects.toThrow("Original invoice cannot be empty");

      await expect(
        privacyLayer.wrapInvoiceForPrivacy("invalid-invoice", "Test payment"),
      ).rejects.toThrow("Invalid Lightning invoice format");
    });

    it("should use custom routing budget", async () => {
      const mockResponse = {
        proxy_invoice: "lnbc10000n1...wrapped-invoice",
        routing_fee: 20,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await privacyLayer.wrapInvoiceForPrivacy(
        testInvoice,
        "Test payment",
        2000, // Custom routing budget
      );

      expect(mockFetch).toHaveBeenCalledWith(
        "https://lnproxy.org/api/spec",
        expect.objectContaining({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            invoice: testInvoice,
            routing_budget_ppm: 2000,
            description: "Test payment",
          }),
        }),
      );
    });
  });

  describe("testPrivacyConnection", () => {
    it("should return healthy status when service is available", async () => {
      // Add small delay to simulate network time
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 10)),
      );

      const health = await privacyLayer.testPrivacyConnection();

      expect(health.available).toBe(true);
      expect(health.responseTime).toBeGreaterThan(0);
      expect(health.error).toBeUndefined();
    });

    it("should return unhealthy status when service is down", async () => {
      // Add small delay to simulate network time
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ ok: false, status: 503 }), 10),
          ),
      );

      const health = await privacyLayer.testPrivacyConnection();

      expect(health.available).toBe(false);
      expect(health.responseTime).toBeGreaterThan(0);
      expect(health.error).toBe("HTTP 503");
    });

    it("should handle network errors", async () => {
      // Add small delay to simulate network time
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Network error")), 10),
          ),
      );

      const health = await privacyLayer.testPrivacyConnection();

      expect(health.available).toBe(false);
      expect(health.responseTime).toBeGreaterThan(0);
      expect(health.error).toBe("Network error");
    });
  });

  describe("Utility functions", () => {
    it("should create privacy layer with createPrivacyLayer", () => {
      const layer = createPrivacyLayer();
      expect(layer).toBeInstanceOf(SatnamPrivacyLayer);
    });

    it("should wrap invoice with wrapInvoiceForPrivacy helper", async () => {
      const mockResponse = {
        proxy_invoice: "lnbc10000n1...wrapped-invoice",
        routing_fee: 5,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await wrapInvoiceForPrivacy(testInvoice, "Helper test");

      expect(result.isPrivacyEnabled).toBe(true);
      expect(result.wrappedInvoice).toBe(mockResponse.proxy_invoice);
    });
  });

  describe("Edge Cases", () => {
    it("should handle timeout scenarios", async () => {
      // Mock a slow response that exceeds timeout
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Request timeout")), 100),
          ),
      );

      const result = await privacyLayer.wrapInvoiceForPrivacy(
        testInvoice,
        "Timeout test",
      );

      expect(result.isPrivacyEnabled).toBe(false);
      expect(result.wrappedInvoice).toBe(testInvoice);
    }, 10000); // 10 second timeout for this test

    it("should handle missing proxy_invoice in response", async () => {
      const mockResponse = {
        routing_fee: 10,
        // Missing proxy_invoice
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await privacyLayer.wrapInvoiceForPrivacy(
        testInvoice,
        "Test payment",
      );

      expect(result.isPrivacyEnabled).toBe(false);
      expect(result.wrappedInvoice).toBe(testInvoice);
    });

    it("should handle malformed JSON response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error("Invalid JSON");
        },
      });

      const result = await privacyLayer.wrapInvoiceForPrivacy(
        testInvoice,
        "Test payment",
      );

      expect(result.isPrivacyEnabled).toBe(false);
      expect(result.wrappedInvoice).toBe(testInvoice);
    });
  });

  describe("Configuration Methods", () => {
    it("should return correct service URL", () => {
      expect(privacyLayer.getServiceUrl()).toBe("https://lnproxy.org");
    });

    it("should return correct default routing budget", () => {
      expect(privacyLayer.getDefaultRoutingBudget()).toBe(1000);
    });
  });

  describe("Request Format", () => {
    it("should send correct request format to LNProxy API", async () => {
      const mockResponse = {
        proxy_invoice: "lnbc10000n1...wrapped-invoice",
        routing_fee: 15,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await privacyLayer.wrapInvoiceForPrivacy(
        testInvoice,
        "Family payment to daughter@satnam.pub",
      );

      expect(mockFetch).toHaveBeenCalledWith("https://lnproxy.org/api/spec", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          invoice: testInvoice,
          routing_budget_ppm: 1000,
          description: "Family payment to daughter@satnam.pub",
        }),
        signal: expect.any(AbortSignal),
      });
    });

    it("should send health check request correctly", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      });

      await privacyLayer.testPrivacyConnection();

      expect(mockFetch).toHaveBeenCalledWith("https://lnproxy.org/api/health", {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal: expect.any(AbortSignal),
      });
    });
  });
});
