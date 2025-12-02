/**
 * Phase 3 Tests: Policy Configuration & Enforcement
 * Tests for NFC MFA policy configuration and enforcement logic
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getFamilyNfcMfaPolicy,
  isHighValueOperation,
  shouldEnforceNfcMfa,
  logNfcMfaEvent,
  getSessionNfcMfaAuditLog,
  shouldBlockOperation,
} from "../src/lib/steward/frost-nfc-mfa-policy";

// Mock Supabase
vi.mock("../src/lib/supabase", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe("Phase 3: Policy Configuration & Enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getFamilyNfcMfaPolicy()", () => {
    it("should retrieve complete family NFC MFA policy", async () => {
      const { supabase } = await import("../src/lib/supabase");
      const familyId = "family_123456789";

      const mockSingle = vi.fn().mockResolvedValue({
        data: {
          nfc_mfa_policy: "required",
          nfc_mfa_amount_threshold: 5000000,
          nfc_mfa_threshold: "all",
        },
        error: null,
      });

      const mockEq = vi.fn().mockReturnValue({
        single: mockSingle,
      });

      const mockSelect = vi.fn().mockReturnValue({
        eq: mockEq,
      });

      (supabase.from as any).mockReturnValue({
        select: mockSelect,
      });

      const result = await getFamilyNfcMfaPolicy(familyId);

      expect(result.policy).toBe("required");
      expect(result.amountThreshold).toBe(5000000);
      expect(result.stewardThreshold).toBe("all");
    });

    it("should default to disabled if policy not found", async () => {
      const { supabase } = await import("../src/lib/supabase");
      const familyId = "family_123456789";

      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: new Error("Not found"),
      });

      const mockEq = vi.fn().mockReturnValue({
        single: mockSingle,
      });

      const mockSelect = vi.fn().mockReturnValue({
        eq: mockEq,
      });

      (supabase.from as any).mockReturnValue({
        select: mockSelect,
      });

      const result = await getFamilyNfcMfaPolicy(familyId);

      expect(result.policy).toBe("disabled");
      expect(result.amountThreshold).toBe(1000000);
      expect(result.stewardThreshold).toBe("all");
    });

    it("should handle required_for_high_value policy", async () => {
      const { supabase } = await import("../src/lib/supabase");
      const familyId = "family_123456789";

      const mockSingle = vi.fn().mockResolvedValue({
        data: {
          nfc_mfa_policy: "required_for_high_value",
          nfc_mfa_amount_threshold: 10000000,
          nfc_mfa_threshold: "threshold",
        },
        error: null,
      });

      const mockEq = vi.fn().mockReturnValue({
        single: mockSingle,
      });

      const mockSelect = vi.fn().mockReturnValue({
        eq: mockEq,
      });

      (supabase.from as any).mockReturnValue({
        select: mockSelect,
      });

      const result = await getFamilyNfcMfaPolicy(familyId);

      expect(result.policy).toBe("required_for_high_value");
      expect(result.amountThreshold).toBe(10000000);
      expect(result.stewardThreshold).toBe("threshold");
    });
  });

  describe("isHighValueOperation()", () => {
    it("should detect high-value operations", () => {
      const result = isHighValueOperation(5000000, 1000000);
      expect(result.isHighValue).toBe(true);
      expect(result.amount).toBe(5000000);
      expect(result.threshold).toBe(1000000);
    });

    it("should detect low-value operations", () => {
      const result = isHighValueOperation(500000, 1000000);
      expect(result.isHighValue).toBe(false);
    });

    it("should handle edge case at threshold", () => {
      const result = isHighValueOperation(1000000, 1000000);
      expect(result.isHighValue).toBe(false); // Equal to threshold is not high-value
    });
  });

  describe("shouldEnforceNfcMfa()", () => {
    it("should not enforce if policy is disabled", () => {
      const policy = {
        policy: "disabled" as const,
        amountThreshold: 1000000,
        stewardThreshold: "all" as const,
      };
      expect(shouldEnforceNfcMfa(policy)).toBe(false);
    });

    it("should not enforce if policy is optional", () => {
      const policy = {
        policy: "optional" as const,
        amountThreshold: 1000000,
        stewardThreshold: "all" as const,
      };
      expect(shouldEnforceNfcMfa(policy)).toBe(false);
    });

    it("should enforce if policy is required", () => {
      const policy = {
        policy: "required" as const,
        amountThreshold: 1000000,
        stewardThreshold: "all" as const,
      };
      expect(shouldEnforceNfcMfa(policy)).toBe(true);
    });

    it("should enforce for high-value operations", () => {
      const policy = {
        policy: "required_for_high_value" as const,
        amountThreshold: 1000000,
        stewardThreshold: "all" as const,
      };
      expect(shouldEnforceNfcMfa(policy, 5000000)).toBe(true);
    });

    it("should not enforce for low-value operations", () => {
      const policy = {
        policy: "required_for_high_value" as const,
        amountThreshold: 1000000,
        stewardThreshold: "all" as const,
      };
      expect(shouldEnforceNfcMfa(policy, 500000)).toBe(false);
    });

    it("should enforce for high-value if amount not provided", () => {
      const policy = {
        policy: "required_for_high_value" as const,
        amountThreshold: 1000000,
        stewardThreshold: "all" as const,
      };
      expect(shouldEnforceNfcMfa(policy)).toBe(true);
    });
  });

  describe("shouldBlockOperation()", () => {
    it("should not block if policy is disabled", () => {
      const policy = {
        policy: "disabled" as const,
        amountThreshold: 1000000,
        stewardThreshold: "all" as const,
      };
      expect(shouldBlockOperation(policy, 0, 1, 2)).toBe(false);
    });

    it("should not block if policy is optional", () => {
      const policy = {
        policy: "optional" as const,
        amountThreshold: 1000000,
        stewardThreshold: "all" as const,
      };
      expect(shouldBlockOperation(policy, 0, 1, 2)).toBe(false);
    });

    it("should block if required and any steward failed (all threshold)", () => {
      const policy = {
        policy: "required" as const,
        amountThreshold: 1000000,
        stewardThreshold: "all" as const,
      };
      expect(shouldBlockOperation(policy, 2, 1, 3)).toBe(true);
    });

    it("should not block if required and all stewards verified (all threshold)", () => {
      const policy = {
        policy: "required" as const,
        amountThreshold: 1000000,
        stewardThreshold: "all" as const,
      };
      expect(shouldBlockOperation(policy, 3, 0, 3)).toBe(false);
    });

    it("should block if required and threshold not met (threshold mode)", () => {
      const policy = {
        policy: "required" as const,
        amountThreshold: 1000000,
        stewardThreshold: "threshold" as const,
      };
      expect(shouldBlockOperation(policy, 1, 2, 2)).toBe(true);
    });

    it("should not block if required and threshold met (threshold mode)", () => {
      const policy = {
        policy: "required" as const,
        amountThreshold: 1000000,
        stewardThreshold: "threshold" as const,
      };
      expect(shouldBlockOperation(policy, 2, 1, 2)).toBe(false);
    });
  });

  describe("logNfcMfaEvent()", () => {
    it("should log NFC MFA event successfully", async () => {
      const { supabase } = await import("../src/lib/supabase");

      const mockInsert = vi.fn().mockResolvedValue({
        error: null,
      });

      (supabase.from as any).mockReturnValue({
        insert: mockInsert,
      });

      await logNfcMfaEvent(
        "frost_session_123",
        "family_123",
        "signature_verified",
        "steward_1",
        "a1b2c3d4e5f6g7h8",
        "required",
        undefined
      );

      expect(mockInsert).toHaveBeenCalled();
    });

    it("should handle logging errors gracefully", async () => {
      const { supabase } = await import("../src/lib/supabase");

      const mockInsert = vi.fn().mockResolvedValue({
        error: new Error("Database error"),
      });

      (supabase.from as any).mockReturnValue({
        insert: mockInsert,
      });

      // Should not throw
      await logNfcMfaEvent(
        "frost_session_123",
        "family_123",
        "signature_failed",
        "steward_1",
        undefined,
        "required",
        "Signature expired"
      );

      expect(mockInsert).toHaveBeenCalled();
    });
  });

  describe("getSessionNfcMfaAuditLog()", () => {
    it("should retrieve audit log for session", async () => {
      const { supabase } = await import("../src/lib/supabase");

      const mockOrder = vi.fn().mockResolvedValue({
        data: [
          {
            event_type: "policy_retrieved",
            participant_id: "steward_1",
            created_at: "2024-01-01T00:00:00Z",
          },
          {
            event_type: "signature_verified",
            participant_id: "steward_1",
            created_at: "2024-01-01T00:01:00Z",
          },
        ],
        error: null,
      });

      const mockEq = vi.fn().mockReturnValue({
        order: mockOrder,
      });

      const mockSelect = vi.fn().mockReturnValue({
        eq: mockEq,
      });

      (supabase.from as any).mockReturnValue({
        select: mockSelect,
      });

      const result = await getSessionNfcMfaAuditLog("frost_session_123");

      expect(result).toHaveLength(2);
      expect(result[0].event_type).toBe("policy_retrieved");
      expect(result[1].event_type).toBe("signature_verified");
    });

    it("should return empty array if no audit log found", async () => {
      const { supabase } = await import("../src/lib/supabase");

      const mockOrder = vi.fn().mockResolvedValue({
        data: null,
        error: new Error("Not found"),
      });

      const mockEq = vi.fn().mockReturnValue({
        order: mockOrder,
      });

      const mockSelect = vi.fn().mockReturnValue({
        eq: mockEq,
      });

      (supabase.from as any).mockReturnValue({
        select: mockSelect,
      });

      const result = await getSessionNfcMfaAuditLog("frost_session_123");

      expect(result).toEqual([]);
    });
  });
});

