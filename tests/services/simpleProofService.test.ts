/**
 * SimpleProof Service Tests
 * Phase 2B-2 Day 8: SimpleProof Integration
 *
 * Tests for SimpleProofService client-side wrapper
 * - Timestamp creation
 * - Timestamp verification
 * - Caching behavior
 * - Error handling
 * - Feature flag gating
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SimpleProofService } from "../../src/services/simpleProofService";

// Mock clientConfig
vi.mock("../../src/config/env.client", () => ({
  clientConfig: {
    flags: {
      simpleproofEnabled: true,
    },
  },
}));

// Mock fetch
global.fetch = vi.fn();

describe("SimpleProofService", () => {
  let service: SimpleProofService;

  beforeEach(() => {
    service = new SimpleProofService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Feature Flag Gating", () => {
    it("should check if SimpleProof is enabled", () => {
      expect(service.isEnabled()).toBe(true);
    });

    it("should return error when feature flag is disabled", async () => {
      // Temporarily override the enabled flag
      const originalEnabled = (service as any).enabled;
      (service as any).enabled = false;

      const result = await service.createTimestamp({
        data: "test data",
        verification_id: "123e4567-e89b-12d3-a456-426614174000",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("disabled");

      // Restore original value
      (service as any).enabled = originalEnabled;
    });
  });

  describe("Timestamp Creation", () => {
    it("should create timestamp with valid data", async () => {
      const mockResponse = {
        ots_proof: "mock_ots_proof_data",
        bitcoin_block: 800000,
        bitcoin_tx: "a".repeat(64),
        verified_at: Math.floor(Date.now() / 1000),
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await service.createTimestamp({
        data: "test data to timestamp",
        verification_id: "123e4567-e89b-12d3-a456-426614174000",
      });

      expect(result.success).toBe(true);
      expect(result.ots_proof).toBe(mockResponse.ots_proof);
      expect(result.bitcoin_block).toBe(mockResponse.bitcoin_block);
      expect(result.bitcoin_tx).toBe(mockResponse.bitcoin_tx);
    });

    it("should handle API errors gracefully", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: "Internal server error" }),
      });

      const result = await service.createTimestamp({
        data: "test data",
        verification_id: "123e4567-e89b-12d3-a456-426614174000",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should handle network errors", async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error("Network error"));

      const result = await service.createTimestamp({
        data: "test data",
        verification_id: "123e4567-e89b-12d3-a456-426614174000",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Network error");
    });

    it("should include metadata in request", async () => {
      const mockResponse = {
        ots_proof: "mock_ots_proof",
        bitcoin_block: null,
        bitcoin_tx: null,
        verified_at: Math.floor(Date.now() / 1000),
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const metadata = { type: "identity_verification", user: "test_user" };
      await service.createTimestamp({
        data: "test data",
        verification_id: "123e4567-e89b-12d3-a456-426614174000",
        metadata,
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "/.netlify/functions/simpleproof-timestamp",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: expect.stringContaining(JSON.stringify(metadata)),
        })
      );
    });
  });

  describe("Timestamp Verification", () => {
    it("should verify timestamp with valid proof", async () => {
      const mockResponse = {
        is_valid: true,
        bitcoin_block: 800000,
        bitcoin_tx: "a".repeat(64),
        confidence: "high",
        verified_at: Math.floor(Date.now() / 1000),
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await service.verifyTimestamp({
        ots_proof: "mock_ots_proof_data",
      });

      expect(result.success).toBe(true);
      expect(result.is_valid).toBe(true);
      expect(result.confidence).toBe("high");
      expect(result.cached).toBe(false);
    });

    it("should return cached verification result", async () => {
      const mockResponse = {
        is_valid: true,
        bitcoin_block: 800000,
        bitcoin_tx: "a".repeat(64),
        confidence: "high",
        verified_at: Math.floor(Date.now() / 1000),
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      // First call - should hit API
      const result1 = await service.verifyTimestamp({
        ots_proof: "mock_ots_proof_data",
      });
      expect(result1.cached).toBe(false);

      // Second call - should return cached result
      const result2 = await service.verifyTimestamp({
        ots_proof: "mock_ots_proof_data",
      });
      expect(result2.cached).toBe(true);
      expect(result2.is_valid).toBe(true);

      // Fetch should only be called once
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it("should handle verification errors", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: "Invalid proof format" }),
      });

      const result = await service.verifyTimestamp({
        ots_proof: "invalid_proof",
      });

      expect(result.success).toBe(false);
      expect(result.is_valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should handle network errors during verification", async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error("Timeout"));

      const result = await service.verifyTimestamp({
        ots_proof: "mock_ots_proof",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Timeout");
    });
  });

  describe("Cache Management", () => {
    it("should clear cache", async () => {
      const mockResponse = {
        is_valid: true,
        bitcoin_block: 800000,
        bitcoin_tx: "a".repeat(64),
        confidence: "high",
        verified_at: Math.floor(Date.now() / 1000),
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      // First call
      await service.verifyTimestamp({ ots_proof: "mock_proof" });
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      await service.verifyTimestamp({ ots_proof: "mock_proof" });
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Clear cache
      service.clearCache();

      // Third call - should hit API again
      await service.verifyTimestamp({ ots_proof: "mock_proof" });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("Error Handling", () => {
    it("should handle malformed JSON responses", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error("Invalid JSON");
        },
      });

      const result = await service.createTimestamp({
        data: "test data",
        verification_id: "123e4567-e89b-12d3-a456-426614174000",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should handle unknown errors", async () => {
      (global.fetch as any).mockRejectedValueOnce("Unknown error");

      const result = await service.createTimestamp({
        data: "test data",
        verification_id: "123e4567-e89b-12d3-a456-426614174000",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Unknown error");
    });
  });
});
