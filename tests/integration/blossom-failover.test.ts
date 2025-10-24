/**
 * Blossom Failover Integration Tests
 * Phase 5A: Multi-Server Support with Automatic Failover
 *
 * Tests:
 * - Primary server success scenario
 * - Primary server timeout → fallback success
 * - Primary server error → fallback success
 * - Both servers fail → graceful error handling
 * - Server health tracking verification
 * - Dynamic domain validation
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock environment configuration
vi.mock("../../src/config/env.client", () => ({
  clientConfig: {
    blossom: {
      primaryUrl: "https://blossom.satnam.pub",
      fallbackUrl: "https://blossom.nostr.build",
      timeoutMs: 30000,
      retryAttempts: 2,
      serverUrl: "https://blossom.nostr.build", // Legacy
    },
    flags: {
      blossomUploadEnabled: true,
    },
  },
}));

// Import after mocking
import {
  getServerHealthStats,
  uploadBannerToBlossom,
} from "../../src/lib/api/blossom-client";

describe("Blossom Failover - Integration Tests", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    // Save original fetch
    originalFetch = global.fetch;

    // Clear server health stats
    vi.clearAllMocks();

    // Mock File.arrayBuffer() for SHA-256 hashing
    if (typeof File !== "undefined") {
      File.prototype.arrayBuffer = vi.fn().mockResolvedValue(
        new ArrayBuffer(12) // Mock buffer for "test content"
      );
    }

    // Mock crypto.subtle.digest for SHA-256
    if (typeof crypto !== "undefined" && crypto.subtle) {
      crypto.subtle.digest = vi
        .fn()
        .mockResolvedValue(
          new Uint8Array([
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
          ]).buffer
        );
    }
  });

  afterEach(() => {
    // Restore original fetch
    global.fetch = originalFetch;
  });

  describe("Primary Server Success", () => {
    it("should successfully upload to primary server on first attempt", async () => {
      const mockFile = new File(["test content"], "banner.jpg", {
        type: "image/jpeg",
      });

      // Mock successful upload to primary server
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          url: "https://blossom.satnam.pub/abc123.jpg",
          sha256: "abc123",
          size: 12345,
          type: "image/jpeg",
        }),
      });

      const result = await uploadBannerToBlossom(mockFile);

      expect(result.success).toBe(true);
      expect(result.url).toBe("https://blossom.satnam.pub/abc123.jpg");
      expect(result.serverUsed).toBe("https://blossom.satnam.pub");
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it("should track server health on successful upload", async () => {
      const mockFile = new File(["test content"], "banner.jpg", {
        type: "image/jpeg",
      });

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          url: "https://blossom.satnam.pub/abc123.jpg",
          sha256: "abc123",
          size: 12345,
          type: "image/jpeg",
        }),
      });

      await uploadBannerToBlossom(mockFile);

      const healthStats = getServerHealthStats();
      const primaryHealth = healthStats.find(
        (h) => h.url === "https://blossom.satnam.pub"
      );

      expect(primaryHealth).toBeDefined();
      expect(primaryHealth!.successCount).toBeGreaterThan(0);
      expect(primaryHealth!.lastSuccess).toBeTruthy();
    });
  });

  describe("Primary Server Timeout → Fallback Success", () => {
    it("should failover to fallback server when primary times out", async () => {
      const mockFile = new File(["test content"], "banner.jpg", {
        type: "image/jpeg",
      });

      // Mock primary server timeout, then fallback success
      global.fetch = vi
        .fn()
        // Primary server attempts (2 retries)
        .mockRejectedValueOnce(
          new Error("AbortError: The operation was aborted")
        )
        .mockRejectedValueOnce(
          new Error("AbortError: The operation was aborted")
        )
        // Fallback server success
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            url: "https://blossom.nostr.build/xyz789.jpg",
            sha256: "xyz789",
            size: 12345,
            type: "image/jpeg",
          }),
        });

      const result = await uploadBannerToBlossom(mockFile);

      expect(result.success).toBe(true);
      expect(result.url).toBe("https://blossom.nostr.build/xyz789.jpg");
      expect(result.serverUsed).toBe("https://blossom.nostr.build");
      expect(global.fetch).toHaveBeenCalledTimes(3); // 2 primary retries + 1 fallback
    });

    it("should track server health on timeout failover", async () => {
      const mockFile = new File(["test content"], "banner.jpg", {
        type: "image/jpeg",
      });

      global.fetch = vi
        .fn()
        .mockRejectedValueOnce(new Error("AbortError"))
        .mockRejectedValueOnce(new Error("AbortError"))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            url: "https://blossom.nostr.build/xyz789.jpg",
            sha256: "xyz789",
            size: 12345,
            type: "image/jpeg",
          }),
        });

      await uploadBannerToBlossom(mockFile);

      const healthStats = getServerHealthStats();
      const primaryHealth = healthStats.find(
        (h) => h.url === "https://blossom.satnam.pub"
      );
      const fallbackHealth = healthStats.find(
        (h) => h.url === "https://blossom.nostr.build"
      );

      expect(primaryHealth!.failureCount).toBeGreaterThan(0);
      expect(fallbackHealth!.successCount).toBeGreaterThan(0);
    });
  });

  describe("Primary Server Error → Fallback Success", () => {
    it("should failover to fallback server when primary returns 500 error", async () => {
      const mockFile = new File(["test content"], "banner.jpg", {
        type: "image/jpeg",
      });

      global.fetch = vi
        .fn()
        // Primary server errors (2 retries)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: async () => "Internal Server Error",
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: async () => "Internal Server Error",
        })
        // Fallback server success
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            url: "https://blossom.nostr.build/fallback123.jpg",
            sha256: "fallback123",
            size: 12345,
            type: "image/jpeg",
          }),
        });

      const result = await uploadBannerToBlossom(mockFile);

      expect(result.success).toBe(true);
      expect(result.url).toBe("https://blossom.nostr.build/fallback123.jpg");
      expect(result.serverUsed).toBe("https://blossom.nostr.build");
    });

    it("should failover to fallback server when primary returns 503 error", async () => {
      const mockFile = new File(["test content"], "banner.jpg", {
        type: "image/jpeg",
      });

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          text: async () => "Service Unavailable",
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          text: async () => "Service Unavailable",
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            url: "https://blossom.nostr.build/fallback456.jpg",
            sha256: "fallback456",
            size: 12345,
            type: "image/jpeg",
          }),
        });

      const result = await uploadBannerToBlossom(mockFile);

      expect(result.success).toBe(true);
      expect(result.serverUsed).toBe("https://blossom.nostr.build");
    });
  });

  describe("Both Servers Fail → Graceful Error Handling", () => {
    it("should return error when both servers timeout", async () => {
      const mockFile = new File(["test content"], "banner.jpg", {
        type: "image/jpeg",
      });

      global.fetch = vi
        .fn()
        .mockRejectedValue(new Error("AbortError: Timeout"));

      const result = await uploadBannerToBlossom(mockFile);

      expect(result.success).toBe(false);
      expect(result.error).toContain("All Blossom servers failed");
    });

    it("should return error when both servers return 500", async () => {
      const mockFile = new File(["test content"], "banner.jpg", {
        type: "image/jpeg",
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      });

      const result = await uploadBannerToBlossom(mockFile);

      expect(result.success).toBe(false);
      expect(result.error).toContain("All Blossom servers failed");
    });

    it("should track failures for both servers", async () => {
      const mockFile = new File(["test content"], "banner.jpg", {
        type: "image/jpeg",
      });

      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      await uploadBannerToBlossom(mockFile);

      const healthStats = getServerHealthStats();
      const primaryHealth = healthStats.find(
        (h) => h.url === "https://blossom.satnam.pub"
      );
      const fallbackHealth = healthStats.find(
        (h) => h.url === "https://blossom.nostr.build"
      );

      expect(primaryHealth!.failureCount).toBeGreaterThan(0);
      expect(fallbackHealth!.failureCount).toBeGreaterThan(0);
    });
  });

  describe("Server Health Tracking", () => {
    it("should initialize health tracking for all configured servers", () => {
      const healthStats = getServerHealthStats();

      expect(healthStats.length).toBeGreaterThanOrEqual(1);
      expect(
        healthStats.some((h) => h.url === "https://blossom.satnam.pub")
      ).toBe(true);
    });

    it("should track success and failure counts independently", async () => {
      const mockFile = new File(["test content"], "banner.jpg", {
        type: "image/jpeg",
      });

      // First upload: success
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          url: "https://blossom.satnam.pub/success.jpg",
          sha256: "success",
          size: 12345,
          type: "image/jpeg",
        }),
      });

      await uploadBannerToBlossom(mockFile);

      const healthAfterSuccess = getServerHealthStats();
      const primaryAfterSuccess = healthAfterSuccess.find(
        (h) => h.url === "https://blossom.satnam.pub"
      );

      expect(primaryAfterSuccess!.successCount).toBeGreaterThan(0);

      // Second upload: failure
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      await uploadBannerToBlossom(mockFile);

      const healthAfterFailure = getServerHealthStats();
      const primaryAfterFailure = healthAfterFailure.find(
        (h) => h.url === "https://blossom.satnam.pub"
      );

      expect(primaryAfterFailure!.failureCount).toBeGreaterThan(0);
    });
  });
});
