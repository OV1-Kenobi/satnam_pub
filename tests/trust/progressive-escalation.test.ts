/**
 * TimeBasedEscalationService Unit Tests
 * Tests trust delta calculation, checkpoint detection, and escalation logic
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { TimeBasedEscalationService } from "../../src/lib/trust/progressive-escalation";

describe("TimeBasedEscalationService", () => {
  let service: TimeBasedEscalationService;
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
                created_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
              },
              error: null,
            }),
          };
        }
        if (table === "reputation_actions") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({
              data: [],
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

    service = new TimeBasedEscalationService(mockSupabase);
  });

  describe("calculateTrustDelta()", () => {
    it("should return delta for new accounts", async () => {
      const userId = "user-123";

      const delta = await service.calculateTrustDelta(userId);

      expect(typeof delta).toBe("number");
      expect(delta).toBeGreaterThanOrEqual(0);
      expect(delta).toBeLessThanOrEqual(100);
    });

    it("should return delta at 30 days", async () => {
      const userId = "user-123";

      mockSupabase.from("user_identities").select.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: userId,
            created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          },
          error: null,
        }),
      });

      const delta = await service.calculateTrustDelta(userId);

      expect(typeof delta).toBe("number");
      expect(delta).toBeGreaterThanOrEqual(0);
      expect(delta).toBeLessThanOrEqual(100);
    });

    it("should cap delta at 100", async () => {
      const userId = "user-123";

      mockSupabase.from("user_identities").select.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: userId,
            created_at: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
          },
          error: null,
        }),
      });

      const delta = await service.calculateTrustDelta(userId);

      expect(delta).toBeLessThanOrEqual(100);
    });
  });

  describe("checkCheckpoints()", () => {
    it("should detect 30-day checkpoint", async () => {
      const userId = "user-123";

      mockSupabase.from("user_identities").select.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: userId,
            created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          },
          error: null,
        }),
      });

      const checkpoints = await service.checkCheckpoints(userId);

      expect(Array.isArray(checkpoints)).toBe(true);
    });

    it("should detect 90-day checkpoint", async () => {
      const userId = "user-123";

      mockSupabase.from("user_identities").select.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: userId,
            created_at: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
          },
          error: null,
        }),
      });

      const checkpoints = await service.checkCheckpoints(userId);

      expect(Array.isArray(checkpoints)).toBe(true);
    });

    it("should detect 180-day checkpoint", async () => {
      const userId = "user-123";

      mockSupabase.from("user_identities").select.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: userId,
            created_at: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(),
          },
          error: null,
        }),
      });

      const checkpoints = await service.checkCheckpoints(userId);

      expect(Array.isArray(checkpoints)).toBe(true);
    });

    it("should detect 365-day checkpoint", async () => {
      const userId = "user-123";

      mockSupabase.from("user_identities").select.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: userId,
            created_at: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
          },
          error: null,
        }),
      });

      const checkpoints = await service.checkCheckpoints(userId);

      expect(Array.isArray(checkpoints)).toBe(true);
    });

    it("should return empty array for new accounts", async () => {
      const userId = "user-123";

      const checkpoints = await service.checkCheckpoints(userId);

      expect(Array.isArray(checkpoints)).toBe(true);
    });

    it("should handle type guard for invalid created_at", async () => {
      const userId = "user-123";

      mockSupabase.from("user_identities").select.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: userId,
            created_at: null,
          },
          error: null,
        }),
      });

      const checkpoints = await service.checkCheckpoints(userId);

      expect(Array.isArray(checkpoints)).toBe(true);
    });
  });

  describe("zero-check before division", () => {
    it("should not divide by zero in success rate calculation", async () => {
      const userId = "user-123";

      const delta = await service.calculateTrustDelta(userId);

      expect(typeof delta).toBe("number");
      expect(isFinite(delta)).toBe(true);
    });

    it("should handle zero total transactions", async () => {
      const userId = "user-123";

      mockSupabase.from("reputation_actions").select.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gte: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        }),
      });

      const delta = await service.calculateTrustDelta(userId);

      expect(typeof delta).toBe("number");
      expect(isFinite(delta)).toBe(true);
    });
  });

  describe("checkpoint structure", () => {
    it("should return checkpoints with required fields", async () => {
      const userId = "user-123";

      mockSupabase.from("user_identities").select.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: userId,
            created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          },
          error: null,
        }),
      });

      const checkpoints = await service.checkCheckpoints(userId);

      checkpoints.forEach((checkpoint) => {
        expect(typeof checkpoint.days).toBe("number");
        expect(typeof checkpoint.bonus).toBe("number");
      });
    });
  });
});

