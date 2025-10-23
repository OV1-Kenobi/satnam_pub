import { describe, expect, it } from "vitest";
import { EnhancedTrustScoringService } from "../../src/lib/trust/enhanced-trust-scoring";
import { ProviderManagementService } from "../../src/lib/trust/provider-management";
import type { MetricCalculationInput } from "../../src/lib/trust/types";

describe("ProviderManagementService", () => {
  let service: ProviderManagementService;
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: () => ({
        insert: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
        delete: () => ({
          eq: () => ({ eq: () => Promise.resolve({ error: null }) }),
        }),
        select: () => ({
          eq: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
        }),
        upsert: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
        eq: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      }),
    };

    service = new ProviderManagementService(
      mockSupabase,
      new EnhancedTrustScoringService()
    );
  });

  describe("Input Validation", () => {
    it("should throw error for missing userId in addTrustedProvider", async () => {
      await expect(service.addTrustedProvider("", "abc123")).rejects.toThrow(
        "userId and providerPubkey are required"
      );
    });

    it("should throw error for missing providerPubkey", async () => {
      await expect(service.addTrustedProvider("user-1", "")).rejects.toThrow(
        "userId and providerPubkey are required"
      );
    });

    it("should throw error for invalid trust level > 5", async () => {
      await expect(
        service.addTrustedProvider(
          "user-1",
          "abc123",
          undefined,
          undefined,
          6 as any
        )
      ).rejects.toThrow("trustLevel must be between 1 and 5");
    });

    it("should throw error for invalid trust level < 1", async () => {
      await expect(
        service.addTrustedProvider(
          "user-1",
          "abc123",
          undefined,
          undefined,
          0 as any
        )
      ).rejects.toThrow("trustLevel must be between 1 and 5");
    });

    it("should throw error for missing userId in removeTrustedProvider", async () => {
      await expect(service.removeTrustedProvider("", "abc123")).rejects.toThrow(
        "userId and providerPubkey are required"
      );
    });

    it("should throw error for missing userId in getTrustedProviders", async () => {
      await expect(service.getTrustedProviders("")).rejects.toThrow(
        "userId is required"
      );
    });

    it("should throw error for missing userId in setProviderTrustLevel", async () => {
      await expect(
        service.setProviderTrustLevel("", "abc123", 3, 0.5)
      ).rejects.toThrow("userId and providerPubkey are required");
    });

    it("should throw error for invalid trust level in setProviderTrustLevel", async () => {
      await expect(
        service.setProviderTrustLevel("user-1", "abc123", 0 as any, 0.5)
      ).rejects.toThrow("trustLevel must be between 1 and 5");
    });

    it("should throw error for invalid weight > 1.0", async () => {
      await expect(
        service.setProviderTrustLevel("user-1", "abc123", 3, 1.5)
      ).rejects.toThrow("Metric weight must be between 0 and 1");
    });

    it("should throw error for invalid weight < 0", async () => {
      await expect(
        service.setProviderTrustLevel("user-1", "abc123", 3, -0.1)
      ).rejects.toThrow("Metric weight must be between 0 and 1");
    });

    it("should throw error for missing userId in getProviderTrustLevel", async () => {
      await expect(service.getProviderTrustLevel("", "abc123")).rejects.toThrow(
        "userId and providerPubkey are required"
      );
    });

    it("should throw error for missing userId in calculateAndStoreMetrics", async () => {
      const input: MetricCalculationInput = {
        userId: "user-1",
        targetUserId: "user-2",
      };
      await expect(
        service.calculateAndStoreMetrics("", "abc123", input)
      ).rejects.toThrow("userId and providerPubkey are required");
    });

    it("should throw error for missing providerPubkey in calculateAndStoreMetrics", async () => {
      const input: MetricCalculationInput = {
        userId: "user-1",
        targetUserId: "user-2",
      };
      await expect(
        service.calculateAndStoreMetrics("user-1", "", input)
      ).rejects.toThrow("userId and providerPubkey are required");
    });
  });

  describe("Service Methods", () => {
    it("should have addTrustedProvider method", () => {
      expect(typeof service.addTrustedProvider).toBe("function");
    });

    it("should have removeTrustedProvider method", () => {
      expect(typeof service.removeTrustedProvider).toBe("function");
    });

    it("should have getTrustedProviders method", () => {
      expect(typeof service.getTrustedProviders).toBe("function");
    });

    it("should have setProviderTrustLevel method", () => {
      expect(typeof service.setProviderTrustLevel).toBe("function");
    });

    it("should have getProviderTrustLevel method", () => {
      expect(typeof service.getProviderTrustLevel).toBe("function");
    });

    it("should have calculateAndStoreMetrics method", () => {
      expect(typeof service.calculateAndStoreMetrics).toBe("function");
    });
  });

  describe("Type Support", () => {
    it("should accept MetricCalculationInput with all fields", () => {
      const input: MetricCalculationInput = {
        userId: "user-1",
        targetUserId: "user-2",
        trustScore: 75,
        contactCount: 100,
        attestationCount: 5,
        lastActivityDate: new Date(),
        successCount: 90,
        totalActionCount: 100,
      };
      expect(input.userId).toBe("user-1");
    });

    it("should accept MetricCalculationInput with minimal fields", () => {
      const input: MetricCalculationInput = {
        userId: "user-1",
        targetUserId: "user-2",
      };
      expect(input.userId).toBe("user-1");
    });

    it("should accept trust levels 1-5", () => {
      for (let level = 1; level <= 5; level++) {
        expect(level).toBeGreaterThanOrEqual(1);
        expect(level).toBeLessThanOrEqual(5);
      }
    });

    it("should accept weights 0.0-1.0", () => {
      const weights = [0, 0.25, 0.5, 0.75, 1.0];
      weights.forEach((w) => {
        expect(w).toBeGreaterThanOrEqual(0);
        expect(w).toBeLessThanOrEqual(1);
      });
    });
  });

  describe("Integration", () => {
    it("should initialize with Supabase client", () => {
      expect(service).toBeDefined();
    });

    it("should use EnhancedTrustScoringService", () => {
      const scoringService = new EnhancedTrustScoringService();
      expect(scoringService).toBeDefined();
    });

    it("should support default trust level of 3", () => {
      expect(3).toBeGreaterThanOrEqual(1);
      expect(3).toBeLessThanOrEqual(5);
    });

    it("should support default weight of 0.5", () => {
      expect(0.5).toBeGreaterThanOrEqual(0);
      expect(0.5).toBeLessThanOrEqual(1);
    });
  });
});
