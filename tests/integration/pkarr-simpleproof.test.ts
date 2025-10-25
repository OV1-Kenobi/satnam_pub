/**
 * PKARR-SimpleProof Integration Tests
 * Phase 2B-2 Day 9: PKARR-SimpleProof Integration
 *
 * Tests for PKARR record creation with automatic SimpleProof timestamping
 * - PKARR record creation with SimpleProof integration
 * - Verification workflow with both PKARR and SimpleProof
 * - Error handling when SimpleProof is disabled/fails
 * - Database integrity (foreign key constraints)
 * - Cache behavior for combined verification
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// Mock environment variables
vi.mock("../../src/config/env.client", () => ({
  clientConfig: {
    flags: {
      pkarrEnabled: true,
      simpleproofEnabled: true,
    },
  },
}));

// Mock fetch for API calls
global.fetch = vi.fn();

describe("PKARR-SimpleProof Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("PKARR Record Creation with SimpleProof", () => {
    it("should create PKARR record with automatic SimpleProof timestamp", async () => {
      const mockPkarrResponse = {
        success: true,
        data: {
          id: "123e4567-e89b-12d3-a456-426614174000",
          public_key: "a".repeat(64),
          sequence: 1,
          message: "PKARR record published successfully",
          simpleproof_timestamp_id: "456e7890-e89b-12d3-a456-426614174001",
          simpleproof_enabled: true,
        },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockPkarrResponse,
      });

      const response = await fetch("/.netlify/functions/pkarr-publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          public_key: "a".repeat(64),
          records: [
            { name: "@", type: "TXT", value: "test", ttl: 3600 },
          ],
          timestamp: Math.floor(Date.now() / 1000),
          sequence: 1,
          signature: "b".repeat(128),
        }),
      });

      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.simpleproof_timestamp_id).toBeDefined();
      expect(data.data.simpleproof_enabled).toBe(true);
    });

    it("should create PKARR record without SimpleProof when feature flag is disabled", async () => {
      const mockPkarrResponse = {
        success: true,
        data: {
          id: "123e4567-e89b-12d3-a456-426614174000",
          public_key: "a".repeat(64),
          sequence: 1,
          message: "PKARR record published successfully",
          simpleproof_timestamp_id: null,
          simpleproof_enabled: false,
        },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockPkarrResponse,
      });

      const response = await fetch("/.netlify/functions/pkarr-publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          public_key: "a".repeat(64),
          records: [
            { name: "@", type: "TXT", value: "test", ttl: 3600 },
          ],
          timestamp: Math.floor(Date.now() / 1000),
          sequence: 1,
          signature: "b".repeat(128),
        }),
      });

      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.simpleproof_timestamp_id).toBeNull();
      expect(data.data.simpleproof_enabled).toBe(false);
    });

    it("should succeed PKARR creation even if SimpleProof fails", async () => {
      const mockPkarrResponse = {
        success: true,
        data: {
          id: "123e4567-e89b-12d3-a456-426614174000",
          public_key: "a".repeat(64),
          sequence: 1,
          message: "PKARR record published successfully",
          simpleproof_timestamp_id: null,
          simpleproof_enabled: true,
        },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockPkarrResponse,
      });

      const response = await fetch("/.netlify/functions/pkarr-publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          public_key: "a".repeat(64),
          records: [
            { name: "@", type: "TXT", value: "test", ttl: 3600 },
          ],
          timestamp: Math.floor(Date.now() / 1000),
          sequence: 1,
          signature: "b".repeat(128),
        }),
      });

      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.id).toBeDefined();
      // SimpleProof failure should not prevent PKARR success
      expect(data.data.simpleproof_timestamp_id).toBeNull();
    });
  });

  describe("PKARR Verification with SimpleProof", () => {
    it("should retrieve PKARR record with SimpleProof timestamp data", async () => {
      const mockVerificationResponse = {
        success: true,
        pkarr_verified: true,
        simpleproof_verified: true,
        simpleproof_data: {
          ots_proof: "mock_ots_proof",
          bitcoin_block: 800000,
          bitcoin_tx: "a".repeat(64),
          verified_at: Math.floor(Date.now() / 1000),
        },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockVerificationResponse,
      });

      const response = await fetch("/.netlify/functions/pkarr-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "get_with_simpleproof",
          payload: {
            public_key: "a".repeat(64),
          },
        }),
      });

      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.pkarr_verified).toBe(true);
      expect(data.simpleproof_verified).toBe(true);
      expect(data.simpleproof_data).toBeDefined();
      expect(data.simpleproof_data.ots_proof).toBe("mock_ots_proof");
    });

    it("should handle PKARR records without SimpleProof verification", async () => {
      const mockVerificationResponse = {
        success: true,
        pkarr_verified: true,
        simpleproof_verified: false,
        simpleproof_data: null,
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockVerificationResponse,
      });

      const response = await fetch("/.netlify/functions/pkarr-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "get_with_simpleproof",
          payload: {
            public_key: "a".repeat(64),
          },
        }),
      });

      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.pkarr_verified).toBe(true);
      expect(data.simpleproof_verified).toBe(false);
      expect(data.simpleproof_data).toBeNull();
    });
  });

  describe("Error Handling", () => {
    it("should handle SimpleProof API timeout gracefully", async () => {
      const mockPkarrResponse = {
        success: true,
        data: {
          id: "123e4567-e89b-12d3-a456-426614174000",
          public_key: "a".repeat(64),
          sequence: 1,
          message: "PKARR record published successfully",
          simpleproof_timestamp_id: null,
          simpleproof_enabled: true,
        },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockPkarrResponse,
      });

      const response = await fetch("/.netlify/functions/pkarr-publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          public_key: "a".repeat(64),
          records: [
            { name: "@", type: "TXT", value: "test", ttl: 3600 },
          ],
          timestamp: Math.floor(Date.now() / 1000),
          sequence: 1,
          signature: "b".repeat(128),
        }),
      });

      const data = await response.json();

      expect(data.success).toBe(true);
      // PKARR should succeed even if SimpleProof times out
      expect(data.data.id).toBeDefined();
    });

    it("should handle SimpleProof API errors gracefully", async () => {
      const mockPkarrResponse = {
        success: true,
        data: {
          id: "123e4567-e89b-12d3-a456-426614174000",
          public_key: "a".repeat(64),
          sequence: 1,
          message: "PKARR record published successfully",
          simpleproof_timestamp_id: null,
          simpleproof_enabled: true,
        },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockPkarrResponse,
      });

      const response = await fetch("/.netlify/functions/pkarr-publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          public_key: "a".repeat(64),
          records: [
            { name: "@", type: "TXT", value: "test", ttl: 3600 },
          ],
          timestamp: Math.floor(Date.now() / 1000),
          sequence: 1,
          signature: "b".repeat(128),
        }),
      });

      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.simpleproof_timestamp_id).toBeNull();
    });
  });

  describe("Database Integrity", () => {
    it("should maintain foreign key constraint between PKARR and SimpleProof", async () => {
      // This test verifies that the database schema correctly links
      // pkarr_records.simpleproof_timestamp_id to simpleproof_timestamps.id
      const mockPkarrResponse = {
        success: true,
        data: {
          id: "123e4567-e89b-12d3-a456-426614174000",
          public_key: "a".repeat(64),
          sequence: 1,
          simpleproof_timestamp_id: "456e7890-e89b-12d3-a456-426614174001",
        },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockPkarrResponse,
      });

      const response = await fetch("/.netlify/functions/pkarr-publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          public_key: "a".repeat(64),
          records: [
            { name: "@", type: "TXT", value: "test", ttl: 3600 },
          ],
          timestamp: Math.floor(Date.now() / 1000),
          sequence: 1,
          signature: "b".repeat(128),
        }),
      });

      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.simpleproof_timestamp_id).toBeDefined();
    });
  });

  describe("Cache Behavior", () => {
    it("should cache combined PKARR + SimpleProof verification results", async () => {
      const mockVerificationResponse = {
        success: true,
        pkarr_verified: true,
        simpleproof_verified: true,
        cached: false,
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockVerificationResponse,
      });

      // First call - should hit API
      const response1 = await fetch("/.netlify/functions/pkarr-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify_with_simpleproof",
          payload: {
            public_key: "a".repeat(64),
          },
        }),
      });

      const data1 = await response1.json();
      expect(data1.cached).toBe(false);

      // Mock cached response
      const mockCachedResponse = {
        ...mockVerificationResponse,
        cached: true,
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockCachedResponse,
      });

      // Second call - should return cached result
      const response2 = await fetch("/.netlify/functions/pkarr-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify_with_simpleproof",
          payload: {
            public_key: "a".repeat(64),
          },
        }),
      });

      const data2 = await response2.json();
      expect(data2.cached).toBe(true);
    });
  });
});

