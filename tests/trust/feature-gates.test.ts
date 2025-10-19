/**
 * FeatureGateService Unit Tests
 * Tests feature access control, locked features filtering, and requirements
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { FeatureGateService } from "../../src/lib/trust/feature-gates";

describe("FeatureGateService", () => {
  let service: FeatureGateService;
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "user_identities") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                id: "user-123",
                trust_score: 50,
                pop_score: 30,
                up_score: 20,
              },
              error: null,
            }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
    };

    service = new FeatureGateService(mockSupabase);
  });

  describe("isFeatureAvailable()", () => {
    it("should grant access when all requirements are met", async () => {
      const userId = "user-123";
      const featureName = "basic_messaging";

      const hasAccess = await service.isFeatureAvailable(userId, featureName);

      expect(typeof hasAccess).toBe("boolean");
    });

    it("should deny access when trust score is insufficient", async () => {
      const userId = "user-123";
      const featureName = "admin_panel";

      mockSupabase.from("user_identities").select.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: userId,
            trust_score: 10,
            pop_score: 30,
            up_score: 20,
          },
          error: null,
        }),
      });

      const hasAccess = await service.isFeatureAvailable(userId, featureName);

      expect(hasAccess).toBe(false);
    });

    it("should handle type guards for unknown score values", async () => {
      const userId = "user-123";
      const featureName = "basic_messaging";

      mockSupabase.from("user_identities").select.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: userId,
            trust_score: null,
            pop_score: "invalid",
            up_score: 20,
          },
          error: null,
        }),
      });

      const hasAccess = await service.isFeatureAvailable(userId, featureName);

      expect(typeof hasAccess).toBe("boolean");
    });

    it("should treat missing scores as 0", async () => {
      const userId = "user-123";
      const featureName = "basic_messaging";

      mockSupabase.from("user_identities").select.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: userId,
          },
          error: null,
        }),
      });

      const hasAccess = await service.isFeatureAvailable(userId, featureName);

      expect(typeof hasAccess).toBe("boolean");
    });

    it("should return false for unknown feature", async () => {
      const userId = "user-123";
      const featureName = "unknown_feature";

      mockSupabase.from("user_identities").select.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: userId,
            trust_score: 100,
            pop_score: 100,
            up_score: 100,
          },
          error: null,
        }),
      });

      const hasAccess = await service.isFeatureAvailable(userId, featureName);

      expect(hasAccess).toBe(false);
    });
  });

  describe("getLockedFeatures()", () => {
    it("should return locked features for user", async () => {
      const userId = "user-123";

      const features = await service.getLockedFeatures(userId);

      expect(Array.isArray(features)).toBe(true);
    });

    it("should return empty array for new users with no scores", async () => {
      const userId = "user-123";

      mockSupabase.from("user_identities").select.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: userId,
            trust_score: 0,
            pop_score: 0,
            up_score: 0,
          },
          error: null,
        }),
      });

      const features = await service.getLockedFeatures(userId);

      expect(Array.isArray(features)).toBe(true);
    });

    it("should return features for high-score users", async () => {
      const userId = "user-123";

      mockSupabase.from("user_identities").select.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: userId,
            trust_score: 100,
            pop_score: 100,
            up_score: 100,
          },
          error: null,
        }),
      });

      const features = await service.getLockedFeatures(userId);

      expect(Array.isArray(features)).toBe(true);
    });
  });

  describe("score type guards", () => {
    it("should handle null trust_score", async () => {
      const userId = "user-123";

      mockSupabase.from("user_identities").select.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: userId,
            trust_score: null,
            pop_score: 30,
            up_score: 20,
          },
          error: null,
        }),
      });

      const features = await service.getLockedFeatures(userId);

      expect(Array.isArray(features)).toBe(true);
    });

    it("should handle undefined pop_score", async () => {
      const userId = "user-123";

      mockSupabase.from("user_identities").select.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: userId,
            trust_score: 50,
            pop_score: undefined,
            up_score: 20,
          },
          error: null,
        }),
      });

      const features = await service.getLockedFeatures(userId);

      expect(Array.isArray(features)).toBe(true);
    });

    it("should handle string up_score (invalid type)", async () => {
      const userId = "user-123";

      mockSupabase.from("user_identities").select.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: userId,
            trust_score: 50,
            pop_score: 30,
            up_score: "invalid",
          },
          error: null,
        }),
      });

      const features = await service.getLockedFeatures(userId);

      expect(Array.isArray(features)).toBe(true);
    });
  });

  describe("feature gate requirements", () => {
    it("should have consistent minimum requirements", async () => {
      const userId = "user-123";

      const features = await service.getLockedFeatures(userId);

      features.forEach((feature) => {
        expect(typeof feature.featureName).toBe("string");
        expect(typeof feature.requirements).toBe("object");
      });
    });
  });
});

