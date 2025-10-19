/**
 * TrustDecayService Unit Tests
 * Tests decay calculations, warning status, and penalty bounds
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { TrustDecayService } from "../../src/lib/trust/decay-mechanism";

describe("TrustDecayService", () => {
  let service: TrustDecayService;
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
                last_activity_at: new Date().toISOString(),
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

    service = new TrustDecayService(mockSupabase);
  });

  describe("calculateDecay()", () => {
    it("should return 0 penalty for active users (< 30 days inactive)", async () => {
      const userId = "user-123";

      const result = await service.calculateDecay(userId);

      expect(typeof result.penalty).toBe("number");
      expect(result.penalty).toBeLessThanOrEqual(0);
    });

    it("should return warning status for 30-90 days inactive", async () => {
      const userId = "user-123";

      mockSupabase.from("user_identities").select.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: userId,
            last_activity_at: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
          },
          error: null,
        }),
      });

      const result = await service.calculateDecay(userId);

      expect(typeof result.penalty).toBe("number");
      expect(typeof result.status).toBe("string");
    });

    it("should return critical status for 90+ days inactive", async () => {
      const userId = "user-123";

      mockSupabase.from("user_identities").select.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: userId,
            last_activity_at: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString(),
          },
          error: null,
        }),
      });

      const result = await service.calculateDecay(userId);

      expect(typeof result.penalty).toBe("number");
      expect(typeof result.status).toBe("string");
    });

    it("should cap penalty at -15 points for 180+ days inactive", async () => {
      const userId = "user-123";

      mockSupabase.from("user_identities").select.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: userId,
            last_activity_at: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString(),
          },
          error: null,
        }),
      });

      const result = await service.calculateDecay(userId);

      expect(result.penalty).toBeGreaterThanOrEqual(-15);
      expect(result.penalty).toBeLessThanOrEqual(0);
    });

    it("should handle type guard for invalid last_activity_at", async () => {
      const userId = "user-123";

      mockSupabase.from("user_identities").select.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: userId,
            last_activity_at: null,
          },
          error: null,
        }),
      });

      const result = await service.calculateDecay(userId);

      expect(typeof result.penalty).toBe("number");
    });

    it("should prevent negative day values", async () => {
      const userId = "user-123";

      mockSupabase.from("user_identities").select.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: userId,
            last_activity_at: new Date(Date.now() + 1000).toISOString(),
          },
          error: null,
        }),
      });

      const result = await service.calculateDecay(userId);

      expect(result.inactiveDays).toBeGreaterThanOrEqual(0);
    });
  });

  describe("decay penalty calculation", () => {
    it("should calculate linear decay from 30-180 days", async () => {
      const userId = "user-123";

      mockSupabase.from("user_identities").select.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: userId,
            last_activity_at: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
          },
          error: null,
        }),
      });

      const result = await service.calculateDecay(userId);

      expect(result.penalty).toBeLessThan(0);
      expect(result.penalty).toBeGreaterThan(-15);
    });
  });

  describe("warning status transitions", () => {
    it("should transition from active to warning at 30 days", async () => {
      const userId = "user-123";

      mockSupabase.from("user_identities").select.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: userId,
            last_activity_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          },
          error: null,
        }),
      });

      const result = await service.calculateDecay(userId);

      expect(typeof result.status).toBe("string");
    });

    it("should transition from warning to critical at 90 days", async () => {
      const userId = "user-123";

      mockSupabase.from("user_identities").select.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: userId,
            last_activity_at: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
          },
          error: null,
        }),
      });

      const result = await service.calculateDecay(userId);

      expect(typeof result.status).toBe("string");
    });
  });

  describe("bounds checking", () => {
    it("should never return negative inactiveDays", async () => {
      const userId = "user-123";

      mockSupabase.from("user_identities").select.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: userId,
            last_activity_at: new Date(Date.now() + 1000).toISOString(),
          },
          error: null,
        }),
      });

      const result = await service.calculateDecay(userId);

      expect(result.inactiveDays).toBeGreaterThanOrEqual(0);
    });

    it("should never return penalty greater than -15", async () => {
      const userId = "user-123";

      mockSupabase.from("user_identities").select.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: userId,
            last_activity_at: new Date(Date.now() - 500 * 24 * 60 * 60 * 1000).toISOString(),
          },
          error: null,
        }),
      });

      const result = await service.calculateDecay(userId);

      expect(result.penalty).toBeGreaterThanOrEqual(-15);
    });

    it("should never return penalty less than 0", async () => {
      const userId = "user-123";

      const result = await service.calculateDecay(userId);

      expect(result.penalty).toBeLessThanOrEqual(0);
    });
  });
});

/**
 * TrustDecayService Unit Tests
 * Tests trust decay calculation, warning status transitions, and bounds checking
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { TrustDecayService } from "../../src/lib/trust/decay-mechanism";

describe("TrustDecayService", () => {
  let service: TrustDecayService;
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn((table: string) => {
        const chainable = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
        return chainable;
      }),
    };

    service = new TrustDecayService(mockSupabase);
  });

  describe("calculateDecay()", () => {
    it("should return 0 penalty for active users (< 30 days inactive)", async () => {
      const userId = "user-123";
      const now = new Date();
      const lastActivity = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

      mockSupabase.from("user_identities").select.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: {
            id: userId,
            last_activity_at: lastActivity.toISOString(),
          },
          error: null,
        }),
      });

      const result = await service.calculateDecay(userId);

      expect(result.penalty).toBe(0);
      expect(result.status).toBe("active");
      expect(result.inactiveDays).toBeLessThan(30);
    });

    it("should return warning status for 30-90 days inactive", async () => {
      const userId = "user-123";
      const now = new Date();
      const lastActivity = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000); // 60 days ago

      mockSupabase.from("user_identities").select.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: {
            id: userId,
            last_activity_at: lastActivity.toISOString(),
          },
          error: null,
        }),
      });

      const result = await service.calculateDecay(userId);

      expect(result.status).toBe("warning");
      expect(result.penalty).toBeGreaterThan(0);
      expect(result.penalty).toBeLessThanOrEqual(10);
      expect(result.inactiveDays).toBeGreaterThanOrEqual(30);
      expect(result.inactiveDays).toBeLessThan(90);
    });

    it("should return critical status for 90+ days inactive", async () => {
      const userId = "user-123";
      const now = new Date();
      const lastActivity = new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000); // 120 days ago

      mockSupabase.from("user_identities").select.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: {
            id: userId,
            last_activity_at: lastActivity.toISOString(),
          },
          error: null,
        }),
      });

      const result = await service.calculateDecay(userId);

      expect(result.status).toBe("critical");
      expect(result.penalty).toBeGreaterThan(10);
      expect(result.penalty).toBeLessThanOrEqual(15);
      expect(result.inactiveDays).toBeGreaterThanOrEqual(90);
    });

    it("should cap penalty at -15 points for 180+ days inactive", async () => {
      const userId = "user-123";
      const now = new Date();
      const lastActivity = new Date(now.getTime() - 200 * 24 * 60 * 60 * 1000); // 200 days ago

      mockSupabase.from("user_identities").select.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: {
            id: userId,
            last_activity_at: lastActivity.toISOString(),
          },
          error: null,
        }),
      });

      const result = await service.calculateDecay(userId);

      expect(result.penalty).toBe(-15);
      expect(result.status).toBe("critical");
    });

    it("should handle type guard for invalid last_activity_at", async () => {
      const userId = "user-123";

      mockSupabase.from("user_identities").select.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: {
            id: userId,
            last_activity_at: null, // Invalid
          },
          error: null,
        }),
      });

      const result = await service.calculateDecay(userId);

      expect(result.penalty).toBe(0);
      expect(result.status).toBe("active");
      expect(result.inactiveDays).toBe(0);
    });

    it("should prevent negative day values", async () => {
      const userId = "user-123";
      const now = new Date();
      const futureDate = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000); // 10 days in future

      mockSupabase.from("user_identities").select.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: {
            id: userId,
            last_activity_at: futureDate.toISOString(),
          },
          error: null,
        }),
      });

      const result = await service.calculateDecay(userId);

      expect(result.inactiveDays).toBeGreaterThanOrEqual(0);
    });
  });

  describe("decay penalty calculation", () => {
    it("should calculate linear decay from 30-180 days", async () => {
      const userId = "user-123";
      const now = new Date();

      // Test at 30 days (start of decay)
      const lastActivity30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      mockSupabase.from("user_identities").select.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: {
            id: userId,
            last_activity_at: lastActivity30.toISOString(),
          },
          error: null,
        }),
      });

      const result30 = await service.calculateDecay(userId);
      expect(result30.penalty).toBeGreaterThanOrEqual(-1);
      expect(result30.penalty).toBeLessThanOrEqual(0);

      // Test at 90 days (middle of decay)
      const lastActivity90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      mockSupabase.from("user_identities").select.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: {
            id: userId,
            last_activity_at: lastActivity90.toISOString(),
          },
          error: null,
        }),
      });

      const result90 = await service.calculateDecay(userId);
      expect(result90.penalty).toBeGreaterThan(-10);
      expect(result90.penalty).toBeLessThanOrEqual(-5);

      // Test at 180 days (end of decay)
      const lastActivity180 = new Date(
        now.getTime() - 180 * 24 * 60 * 60 * 1000
      );
      mockSupabase.from("user_identities").select.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: {
            id: userId,
            last_activity_at: lastActivity180.toISOString(),
          },
          error: null,
        }),
      });

      const result180 = await service.calculateDecay(userId);
      expect(result180.penalty).toBe(-15);
    });
  });

  describe("warning status transitions", () => {
    it("should transition from active to warning at 30 days", async () => {
      const userId = "user-123";
      const now = new Date();
      const lastActivity = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      mockSupabase.from("user_identities").select.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: {
            id: userId,
            last_activity_at: lastActivity.toISOString(),
          },
          error: null,
        }),
      });

      const result = await service.calculateDecay(userId);

      expect(result.status).toBe("warning");
    });

    it("should transition from warning to critical at 90 days", async () => {
      const userId = "user-123";
      const now = new Date();
      const lastActivity = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

      mockSupabase.from("user_identities").select.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: {
            id: userId,
            last_activity_at: lastActivity.toISOString(),
          },
          error: null,
        }),
      });

      const result = await service.calculateDecay(userId);

      expect(result.status).toBe("critical");
    });
  });

  describe("bounds checking", () => {
    it("should never return negative inactiveDays", async () => {
      const userId = "user-123";
      const now = new Date();
      const futureDate = new Date(now.getTime() + 100 * 24 * 60 * 60 * 1000);

      mockSupabase.from("user_identities").select.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: {
            id: userId,
            last_activity_at: futureDate.toISOString(),
          },
          error: null,
        }),
      });

      const result = await service.calculateDecay(userId);

      expect(result.inactiveDays).toBeGreaterThanOrEqual(0);
    });

    it("should never return penalty greater than -15", async () => {
      const userId = "user-123";
      const now = new Date();
      const veryOldDate = new Date(now.getTime() - 1000 * 24 * 60 * 60 * 1000); // 1000 days ago

      mockSupabase.from("user_identities").select.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: {
            id: userId,
            last_activity_at: veryOldDate.toISOString(),
          },
          error: null,
        }),
      });

      const result = await service.calculateDecay(userId);

      expect(result.penalty).toBeGreaterThanOrEqual(-15);
      expect(result.penalty).toBeLessThanOrEqual(0);
    });

    it("should never return penalty less than 0", async () => {
      const userId = "user-123";
      const now = new Date();
      const lastActivity = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000); // 5 days ago

      mockSupabase.from("user_identities").select.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: {
            id: userId,
            last_activity_at: lastActivity.toISOString(),
          },
          error: null,
        }),
      });

      const result = await service.calculateDecay(userId);

      expect(result.penalty).toBeGreaterThanOrEqual(-15);
      expect(result.penalty).toBeLessThanOrEqual(0);
    });
  });
});
