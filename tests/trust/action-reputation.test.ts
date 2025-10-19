/**
 * ActionReputationService Unit Tests
 * Tests action recording, reputation scoring, and decay calculations
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionReputationService, ACTION_WEIGHTS } from "../../src/lib/trust/action-reputation";

describe("ActionReputationService", () => {
  let service: ActionReputationService;
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "reputation_actions") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        if (table === "user_identities") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            update: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: "user-123", reputation_score: 50 },
              error: null,
            }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
    };

    service = new ActionReputationService(mockSupabase);
  });

  describe("recordAction()", () => {
    it("should record a valid action with correct weight", async () => {
      const userId = "user-123";
      const actionType = "message_sent";

      await service.recordAction(userId, actionType);

      expect(mockSupabase.from).toHaveBeenCalledWith("reputation_actions");
    });

    it("should throw error for unknown action type", async () => {
      const userId = "user-123";
      const actionType = "unknown_action";

      await expect(service.recordAction(userId, actionType)).rejects.toThrow();
    });

    it("should record action with metadata", async () => {
      const userId = "user-123";
      const actionType = "message_sent";
      const metadata = { channel: "general" };

      await service.recordAction(userId, actionType, metadata);

      expect(mockSupabase.from).toHaveBeenCalledWith("reputation_actions");
    });

    it("should update user reputation score after recording action", async () => {
      const userId = "user-123";
      const actionType = "message_sent";

      await service.recordAction(userId, actionType);

      expect(mockSupabase.from).toHaveBeenCalledWith("user_identities");
    });
  });

  describe("calculateReputationScore()", () => {
    it("should calculate score from recent actions with decay", async () => {
      const userId = "user-123";

      mockSupabase.from("reputation_actions").select.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gte: vi.fn().mockResolvedValue({
            data: [
              {
                id: "action-1",
                action_type: "message_sent",
                weight: ACTION_WEIGHTS.message_sent,
                created_at: new Date().toISOString(),
              },
            ],
            error: null,
          }),
        }),
      });

      const score = await service.calculateReputationScore(userId);

      expect(typeof score).toBe("number");
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it("should return 0 for user with no actions", async () => {
      const userId = "user-123";

      mockSupabase.from("reputation_actions").select.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gte: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        }),
      });

      const score = await service.calculateReputationScore(userId);

      expect(score).toBe(0);
    });

    it("should apply exponential decay to older actions", async () => {
      const userId = "user-123";
      const now = new Date();
      const oldDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

      mockSupabase.from("reputation_actions").select.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gte: vi.fn().mockResolvedValue({
            data: [
              {
                id: "action-1",
                action_type: "message_sent",
                weight: ACTION_WEIGHTS.message_sent,
                created_at: oldDate.toISOString(),
              },
            ],
            error: null,
          }),
        }),
      });

      const score = await service.calculateReputationScore(userId);

      expect(typeof score).toBe("number");
      expect(score).toBeLessThanOrEqual(100);
    });

    it("should handle type guards for unknown values", async () => {
      const userId = "user-123";

      mockSupabase.from("reputation_actions").select.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gte: vi.fn().mockResolvedValue({
            data: [
              {
                id: "action-1",
                action_type: "message_sent",
                weight: null,
                created_at: new Date().toISOString(),
              },
            ],
            error: null,
          }),
        }),
      });

      const score = await service.calculateReputationScore(userId);

      expect(typeof score).toBe("number");
    });

    it("should cap score at 100", async () => {
      const userId = "user-123";

      mockSupabase.from("reputation_actions").select.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gte: vi.fn().mockResolvedValue({
            data: Array(50).fill({
              id: "action-1",
              action_type: "message_sent",
              weight: ACTION_WEIGHTS.message_sent,
              created_at: new Date().toISOString(),
            }),
            error: null,
          }),
        }),
      });

      const score = await service.calculateReputationScore(userId);

      expect(score).toBeLessThanOrEqual(100);
    });
  });

  describe("ACTION_WEIGHTS", () => {
    it("should have all expected action types", () => {
      expect(ACTION_WEIGHTS).toHaveProperty("message_sent");
      expect(ACTION_WEIGHTS).toHaveProperty("transaction_completed");
      expect(ACTION_WEIGHTS).toHaveProperty("profile_verified");
    });

    it("should have valid weight values", () => {
      Object.values(ACTION_WEIGHTS).forEach((weight) => {
        expect(typeof weight).toBe("number");
        expect(weight).toBeGreaterThan(0);
        expect(weight).toBeLessThanOrEqual(25);
      });
    });

    it("should have valid categories", () => {
      const categories = Object.keys(ACTION_WEIGHTS);
      expect(categories.length).toBeGreaterThan(0);
      categories.forEach((category) => {
        expect(typeof category).toBe("string");
      });
    });
  });
});

/**
 * ActionReputationService Unit Tests
 * Tests action recording, reputation scoring, and trust escalation
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ActionReputationService,
  ACTION_WEIGHTS,
} from "../../src/lib/trust/action-reputation";

describe("ActionReputationService", () => {
  let service: ActionReputationService;
  let mockSupabase: any;

  beforeEach(() => {
    // Mock Supabase client
    mockSupabase = {
      from: vi.fn((table: string) => ({
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        select: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        contains: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
    };

    service = new ActionReputationService(mockSupabase);
  });

  describe("recordAction()", () => {
    it("should record a valid action with correct weight", async () => {
      const userId = "user-123";
      const actionType = "lightning_payment_sent";

      await service.recordAction(userId, actionType);

      expect(mockSupabase.from).toHaveBeenCalledWith("reputation_actions");
      const insertCall = mockSupabase.from("reputation_actions").insert;
      expect(insertCall).toHaveBeenCalled();
      const insertedData = insertCall.mock.calls[0][0];
      expect(insertedData.user_id).toBe(userId);
      expect(insertedData.action_type).toBe(actionType);
      expect(insertedData.weight).toBe(ACTION_WEIGHTS[actionType].weight);
    });

    it("should throw error for unknown action type", async () => {
      const userId = "user-123";
      const invalidAction = "unknown_action";

      await expect(service.recordAction(userId, invalidAction)).rejects.toThrow(
        "Unknown action type"
      );
    });

    it("should record action with metadata", async () => {
      const userId = "user-123";
      const metadata = { amount: 1000, currency: "sats" };

      await service.recordAction(userId, "lightning_payment_sent", metadata);

      const insertCall = mockSupabase.from("reputation_actions").insert;
      const insertedData = insertCall.mock.calls[0][0];
      expect(insertedData.metadata).toEqual(metadata);
    });

    it("should update user reputation score after recording action", async () => {
      const userId = "user-123";

      await service.recordAction(userId, "peer_attestation_given");

      expect(mockSupabase.from).toHaveBeenCalledWith("user_identities");
      const updateCall = mockSupabase.from("user_identities").update;
      expect(updateCall).toHaveBeenCalled();
    });
  });

  describe("calculateReputationScore()", () => {
    it("should calculate score from recent actions with decay", async () => {
      const userId = "user-123";
      const now = Date.now();
      const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
      const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

      mockSupabase.from("reputation_actions").select.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gte: vi.fn().mockResolvedValue({
            data: [
              { weight: 10, recorded_at: oneDayAgo },
              { weight: 5, recorded_at: thirtyDaysAgo },
            ],
            error: null,
          }),
        }),
      });

      const score = await service.calculateReputationScore(userId);

      expect(typeof score).toBe("number");
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it("should return 0 for user with no actions", async () => {
      const userId = "user-123";

      mockSupabase.from("reputation_actions").select.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gte: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        }),
      });

      const score = await service.calculateReputationScore(userId);

      expect(score).toBe(0);
    });

    it("should apply exponential decay to older actions", async () => {
      const userId = "user-123";
      const now = Date.now();
      const recentAction = new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString();
      const oldAction = new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString();

      mockSupabase.from("reputation_actions").select.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gte: vi.fn().mockResolvedValue({
            data: [
              { weight: 10, recorded_at: recentAction },
              { weight: 10, recorded_at: oldAction },
            ],
            error: null,
          }),
        }),
      });

      const score = await service.calculateReputationScore(userId);

      // Recent action should contribute more than old action
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it("should handle type guards for unknown values", async () => {
      const userId = "user-123";

      mockSupabase.from("reputation_actions").select.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gte: vi.fn().mockResolvedValue({
            data: [
              { weight: 10, recorded_at: "2025-01-01T00:00:00Z" },
              { weight: null, recorded_at: "2025-01-02T00:00:00Z" }, // Invalid weight
              { weight: 5, recorded_at: null }, // Invalid recorded_at
            ],
            error: null,
          }),
        }),
      });

      const score = await service.calculateReputationScore(userId);

      // Should only count valid actions
      expect(typeof score).toBe("number");
      expect(score).toBeGreaterThanOrEqual(0);
    });

    it("should cap score at 100", async () => {
      const userId = "user-123";
      const now = Date.now();

      mockSupabase.from("reputation_actions").select.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gte: vi.fn().mockResolvedValue({
            data: Array(20).fill({
              weight: 25,
              recorded_at: new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString(),
            }),
            error: null,
          }),
        }),
      });

      const score = await service.calculateReputationScore(userId);

      expect(score).toBeLessThanOrEqual(100);
    });
  });

  describe("ACTION_WEIGHTS", () => {
    it("should have all expected action types", () => {
      expect(ACTION_WEIGHTS.lightning_payment_sent).toBeDefined();
      expect(ACTION_WEIGHTS.peer_attestation_given).toBeDefined();
      expect(ACTION_WEIGHTS.guardian_approval_given).toBeDefined();
      expect(ACTION_WEIGHTS.message_sent).toBeDefined();
    });

    it("should have valid weight values", () => {
      Object.values(ACTION_WEIGHTS).forEach((action) => {
        expect(typeof action.weight).toBe("number");
        expect(action.weight).toBeGreaterThan(0);
        expect(action.weight).toBeLessThanOrEqual(25);
      });
    });

    it("should have valid categories", () => {
      const validCategories = [
        "payment",
        "social",
        "governance",
        "engagement",
      ];
      Object.values(ACTION_WEIGHTS).forEach((action) => {
        expect(validCategories).toContain(action.category);
      });
    });
  });
});

