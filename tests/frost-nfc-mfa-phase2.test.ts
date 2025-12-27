/**
 * Phase 2 Tests: FROST Session Integration with NFC MFA
 * Tests for FrostSessionManager NFC MFA integration
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { FrostSessionManager } from "../lib/frost/frost-session-manager";
import {
  getNfcMfaPolicy,
  shouldBlockOnNfcMfaFailure,
  verifyNfcMfaSignatures,
} from "../src/lib/steward/frost-nfc-mfa-integration";

// Mock Supabase
vi.mock("../src/lib/supabase", () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

// Mock FrostNfcMfa lazy singleton
const mockFrostNfcMfa = {
  verifyNfcMfaSignature: vi.fn(),
  storeNfcMfaSignature: vi.fn(),
};

vi.mock("../src/lib/steward/frost-nfc-mfa", () => ({
  getFrostNfcMfa: () => mockFrostNfcMfa,
}));

describe("Phase 2: FROST Session Integration with NFC MFA", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getNfcMfaPolicy()", () => {
    it("should retrieve NFC MFA policy for family", async () => {
      const { supabase } = await import("../src/lib/supabase");
      const familyId = "family_123456789";

      const mockSingle = vi.fn().mockResolvedValue({
        data: { nfc_mfa_policy: "required" },
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

      const result = await getNfcMfaPolicy(familyId);

      expect(result.policy).toBe("required");
      expect(result.requiresNfcMfa).toBe(true);
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

      const result = await getNfcMfaPolicy(familyId);

      expect(result.policy).toBe("disabled");
      expect(result.requiresNfcMfa).toBe(false);
    });

    it("should handle optional policy", async () => {
      const { supabase } = await import("../src/lib/supabase");
      const familyId = "family_123456789";

      const mockSingle = vi.fn().mockResolvedValue({
        data: { nfc_mfa_policy: "optional" },
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

      const result = await getNfcMfaPolicy(familyId);

      expect(result.policy).toBe("optional");
      expect(result.requiresNfcMfa).toBe(false);
    });
  });

  describe("verifyNfcMfaSignatures()", () => {
    it("should verify NFC MFA signatures successfully", async () => {
      const { supabase } = await import("../src/lib/supabase");

      const sessionId = "frost_session_123";
      const operationHash = "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6";
      const nfcSignatures = {
        steward_1: {
          curve: "P-256" as const,
          publicKey: "04abc123...",
          signature: "def456...",
          timestamp: Date.now(),
          cardUid: "0123456789ABCDEF",
        },
      };
      const policy = { policy: "required" as const, requiresNfcMfa: true };

      (mockFrostNfcMfa.verifyNfcMfaSignature as any).mockResolvedValue({
        valid: true,
      });

      (mockFrostNfcMfa.storeNfcMfaSignature as any).mockResolvedValue({
        success: true,
      });

      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      (supabase.from as any).mockReturnValue({
        update: mockUpdate,
      });

      const result = await verifyNfcMfaSignatures(
        sessionId,
        operationHash,
        nfcSignatures,
        policy
      );

      expect(result.success).toBe(true);
      expect(result.verified).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.allVerified).toBe(true);
    });

    it("should handle verification failures", async () => {
      const { supabase } = await import("../src/lib/supabase");

      const sessionId = "frost_session_123";
      const operationHash = "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6";
      const nfcSignatures = {
        steward_1: {
          curve: "P-256" as const,
          publicKey: "04abc123...",
          signature: "def456...",
          timestamp: Date.now() - 400000, // Expired
          cardUid: "0123456789ABCDEF",
        },
      };
      const policy = { policy: "required" as const, requiresNfcMfa: true };

      (mockFrostNfcMfa.verifyNfcMfaSignature as any).mockResolvedValue({
        valid: false,
        error: "Signature expired",
      });

      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      (supabase.from as any).mockReturnValue({
        update: mockUpdate,
      });

      const result = await verifyNfcMfaSignatures(
        sessionId,
        operationHash,
        nfcSignatures,
        policy
      );

      expect(result.success).toBe(true);
      expect(result.verified).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.allVerified).toBe(false);
    });
  });

  describe("shouldBlockOnNfcMfaFailure()", () => {
    it("should not block if NFC MFA is disabled", () => {
      const policy = { policy: "disabled" as const, requiresNfcMfa: false };
      const verificationResult = {
        success: true,
        verified: 0,
        failed: 1,
        errors: {},
        allVerified: false,
      };

      const shouldBlock = shouldBlockOnNfcMfaFailure(
        policy,
        verificationResult
      );
      expect(shouldBlock).toBe(false);
    });

    it("should not block if NFC MFA is optional", () => {
      const policy = { policy: "optional" as const, requiresNfcMfa: false };
      const verificationResult = {
        success: true,
        verified: 0,
        failed: 1,
        errors: {},
        allVerified: false,
      };

      const shouldBlock = shouldBlockOnNfcMfaFailure(
        policy,
        verificationResult
      );
      expect(shouldBlock).toBe(false);
    });

    it("should block if NFC MFA is required and verification failed", () => {
      const policy = { policy: "required" as const, requiresNfcMfa: true };
      const verificationResult = {
        success: true,
        verified: 0,
        failed: 1,
        errors: {},
        allVerified: false,
      };

      const shouldBlock = shouldBlockOnNfcMfaFailure(
        policy,
        verificationResult
      );
      expect(shouldBlock).toBe(true);
    });

    it("should not block if NFC MFA is required and all verified", () => {
      const policy = { policy: "required" as const, requiresNfcMfa: true };
      const verificationResult = {
        success: true,
        verified: 1,
        failed: 0,
        errors: {},
        allVerified: true,
      };

      const shouldBlock = shouldBlockOnNfcMfaFailure(
        policy,
        verificationResult
      );
      expect(shouldBlock).toBe(false);
    });
  });

  describe("FrostSessionManager.verifyNfcMfaSignatures()", () => {
    it("should verify NFC MFA signatures via session manager", async () => {
      const sessionId = "frost_session_123";
      const operationHash = "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6";
      const nfcSignatures = {
        steward_1: {
          curve: "P-256" as const,
          publicKey: "04abc123...",
          signature: "def456...",
          timestamp: Date.now(),
          cardUid: "0123456789ABCDEF",
        },
      };

      // Mock getSession
      vi.spyOn(FrostSessionManager, "getSession").mockResolvedValue({
        success: true,
        data: {
          id: sessionId,
          session_id: sessionId,
          family_id: "family_123",
          message_hash: operationHash,
          participants: ["steward_1"],
          threshold: 1,
          status: "completed",
          nonce_commitments: {},
          partial_signatures: {},
          created_by: "creator",
          created_at: Date.now(),
          expires_at: Date.now() + 300000,
        },
      });

      const result = await FrostSessionManager.verifyNfcMfaSignatures(
        sessionId,
        operationHash,
        nfcSignatures
      );

      expect(result.success).toBe(true);
      expect(result.data?.verified).toBeGreaterThanOrEqual(0);
    });
  });
});
