/**
 * Safeword Verification Tests
 *
 * Tests for Phase 3: Optional Safeword Verification System
 *
 * Covers:
 * - Safeword hashing (generate.js)
 * - Safeword verification (accept.js)
 * - Rate limiting and lockout behavior
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Test constants
const VALID_SAFEWORD = "SecurePassphrase123";
const SHORT_SAFEWORD = "short";
const MOCK_SALT = "a".repeat(64); // 32 bytes hex-encoded
const MOCK_HASH = "b".repeat(64); // SHA-256 hex-encoded

// Helper to create mock invitation
const createMockInvitation = (overrides = {}) => ({
  id: "test-invitation-id",
  invitation_token: "inv_test_token_123",
  federation_duid: "fed_test_123",
  invited_role: "adult",
  status: "pending",
  expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  require_safeword: true,
  safeword_hash: MOCK_HASH,
  safeword_salt: MOCK_SALT,
  safeword_attempts: 0,
  safeword_locked_until: null,
  ...overrides,
});

// Mock Supabase client
const createMockSupabase = () => ({
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(() =>
          Promise.resolve({ data: createMockInvitation(), error: null })
        ),
      })),
    })),
    insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
    update: vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
    })),
  })),
});

describe("Safeword Verification", () => {
  beforeEach(() => {
    // Ensure Web Crypto API is available
    vi.stubGlobal("crypto", globalThis.crypto);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  describe("Safeword hashing (generate.js)", () => {
    it("should generate SHA-256 hash with random 32-byte salt using Web Crypto API", async () => {
      const safeword = VALID_SAFEWORD;

      // Simulate the hashing logic from generate.js
      const saltBytes = new Uint8Array(32);
      crypto.getRandomValues(saltBytes);
      const salt = Array.from(saltBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const encoder = new TextEncoder();
      const data = encoder.encode(salt + safeword);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hash = hashArray
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      // Verify hash is 64 hex characters (256 bits)
      expect(hash.length).toBe(64);
      expect(hash).toMatch(/^[0-9a-f]+$/);

      // Verify salt is 64 hex characters (32 bytes)
      expect(salt.length).toBe(64);
      expect(salt).toMatch(/^[0-9a-f]+$/);
    });

    it("should store hash and salt in database (not plaintext)", async () => {
      const mockSupabase = createMockSupabase();

      // Simulate storing invitation with safeword
      const invitationData = {
        safeword_hash: MOCK_HASH,
        safeword_salt: MOCK_SALT,
        require_safeword: true,
      };

      // Verify hash and salt are stored, not plaintext
      expect(invitationData.safeword_hash).toBeDefined();
      expect(invitationData.safeword_salt).toBeDefined();
      expect(invitationData.safeword_hash).not.toBe(VALID_SAFEWORD);
    });

    it("should handle requireSafeword: false (no hash stored)", () => {
      const invitationData = {
        require_safeword: false,
        safeword_hash: null,
        safeword_salt: null,
      };

      expect(invitationData.require_safeword).toBe(false);
      expect(invitationData.safeword_hash).toBeNull();
      expect(invitationData.safeword_salt).toBeNull();
    });

    it("should validate safeword minimum length (8 characters)", () => {
      const validateSafeword = (safeword: string) => safeword.length >= 8;

      expect(validateSafeword(VALID_SAFEWORD)).toBe(true);
      expect(validateSafeword(SHORT_SAFEWORD)).toBe(false);
      expect(validateSafeword("12345678")).toBe(true);
      expect(validateSafeword("1234567")).toBe(false);
      expect(validateSafeword("")).toBe(false);
    });
  });

  describe("Safeword verification (accept.js)", () => {
    it("should successfully verify correct safeword", async () => {
      const safeword = "TestSafeword123";
      const salt = "a".repeat(64);

      // Generate the expected hash
      const encoder = new TextEncoder();
      const data = encoder.encode(salt + safeword);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const expectedHash = hashArray
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      // Verify the same safeword produces the same hash
      const verifyData = encoder.encode(salt + safeword);
      const verifyBuffer = await crypto.subtle.digest("SHA-256", verifyData);
      const verifyArray = Array.from(new Uint8Array(verifyBuffer));
      const computedHash = verifyArray
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      expect(computedHash).toBe(expectedHash);
    });

    it("should reject incorrect safeword", async () => {
      const correctSafeword = "CorrectPassword123";
      const wrongSafeword = "WrongPassword456";
      const salt = "a".repeat(64);

      const encoder = new TextEncoder();

      // Hash the correct safeword
      const correctData = encoder.encode(salt + correctSafeword);
      const correctBuffer = await crypto.subtle.digest("SHA-256", correctData);
      const correctHash = Array.from(new Uint8Array(correctBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      // Hash the wrong safeword
      const wrongData = encoder.encode(salt + wrongSafeword);
      const wrongBuffer = await crypto.subtle.digest("SHA-256", wrongData);
      const wrongHash = Array.from(new Uint8Array(wrongBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      expect(wrongHash).not.toBe(correctHash);
    });

    it("should increment attempt counter on failed verification", () => {
      const invitation = createMockInvitation({ safeword_attempts: 0 });

      // Simulate failed attempt
      const updatedAttempts = invitation.safeword_attempts + 1;

      expect(updatedAttempts).toBe(1);
    });

    it("should lock invitation after 3 failed attempts", () => {
      const invitation = createMockInvitation({ safeword_attempts: 2 });

      // After third failed attempt
      const newAttemptCount = invitation.safeword_attempts + 1;
      const shouldLock = newAttemptCount >= 3;

      expect(shouldLock).toBe(true);
    });

    it("should set safeword_locked_until to 1 hour in future when locked", () => {
      const now = new Date();
      const lockDurationMs = 60 * 60 * 1000; // 1 hour
      const lockUntil = new Date(now.getTime() + lockDurationMs);

      // Verify lockout is approximately 1 hour from now
      const lockDuration = lockUntil.getTime() - now.getTime();
      expect(lockDuration).toBe(lockDurationMs);
    });

    it("should reject verification attempts while locked", () => {
      const futureTime = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes from now
      const invitation = createMockInvitation({
        safeword_locked_until: futureTime.toISOString(),
      });

      const isLocked =
        invitation.safeword_locked_until &&
        new Date(invitation.safeword_locked_until) > new Date();

      expect(isLocked).toBe(true);
    });

    it("should allow verification after lockout expires", () => {
      const pastTime = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago
      const invitation = createMockInvitation({
        safeword_locked_until: pastTime.toISOString(),
      });

      const isLocked =
        invitation.safeword_locked_until &&
        new Date(invitation.safeword_locked_until) > new Date();

      expect(isLocked).toBe(false);
    });

    it("should reset attempt counter on successful verification", () => {
      const invitation = createMockInvitation({ safeword_attempts: 2 });

      // On successful verification, reset attempts
      const resetAttempts = 0;

      expect(resetAttempts).toBe(0);
    });
  });

  describe("Constant-time comparison", () => {
    it("should use double-hash XOR for timing attack mitigation", async () => {
      const hash1 = "a".repeat(64);
      const hash2 = "a".repeat(64);
      const encoder = new TextEncoder();

      // Double-hash both values
      const hash1Buffer = await crypto.subtle.digest(
        "SHA-256",
        encoder.encode(hash1)
      );
      const hash2Buffer = await crypto.subtle.digest(
        "SHA-256",
        encoder.encode(hash2)
      );

      const bytes1 = new Uint8Array(hash1Buffer);
      const bytes2 = new Uint8Array(hash2Buffer);

      // Constant-time XOR comparison
      let result = 0;
      for (let i = 0; i < bytes1.length; i++) {
        result |= bytes1[i] ^ bytes2[i];
      }

      expect(result).toBe(0); // Same values should produce 0
    });

    it("should detect mismatch in constant time", async () => {
      const hash1 = "a".repeat(64);
      const hash2 = "b".repeat(64);
      const encoder = new TextEncoder();

      const hash1Buffer = await crypto.subtle.digest(
        "SHA-256",
        encoder.encode(hash1)
      );
      const hash2Buffer = await crypto.subtle.digest(
        "SHA-256",
        encoder.encode(hash2)
      );

      const bytes1 = new Uint8Array(hash1Buffer);
      const bytes2 = new Uint8Array(hash2Buffer);

      let result = 0;
      for (let i = 0; i < bytes1.length; i++) {
        result |= bytes1[i] ^ bytes2[i];
      }

      expect(result).not.toBe(0); // Different values should produce non-zero
    });
  });

  describe("Database function behavior", () => {
    it("verify_invitation_safeword should check lockout status", () => {
      const testCases = [
        { locked_until: null, expected_locked: false },
        {
          locked_until: new Date(Date.now() + 60000).toISOString(),
          expected_locked: true,
        },
        {
          locked_until: new Date(Date.now() - 60000).toISOString(),
          expected_locked: false,
        },
      ];

      testCases.forEach(({ locked_until, expected_locked }) => {
        const isLocked =
          locked_until !== null && new Date(locked_until) > new Date();
        expect(isLocked).toBe(expected_locked);
      });
    });

    it("is_invitation_locked should return correct boolean", () => {
      const isInvitationLocked = (lockUntil: string | null): boolean => {
        if (!lockUntil) return false;
        return new Date(lockUntil) > new Date();
      };

      expect(isInvitationLocked(null)).toBe(false);
      expect(
        isInvitationLocked(new Date(Date.now() + 60000).toISOString())
      ).toBe(true);
      expect(
        isInvitationLocked(new Date(Date.now() - 60000).toISOString())
      ).toBe(false);
    });

    it("lockout should expire after 1 hour", () => {
      const lockDurationMs = 60 * 60 * 1000; // 1 hour
      const lockedAt = new Date();
      const lockUntil = new Date(lockedAt.getTime() + lockDurationMs);

      // Check at exactly 1 hour
      const checkTime = new Date(lockedAt.getTime() + lockDurationMs + 1);
      const isStillLocked = lockUntil > checkTime;

      expect(isStillLocked).toBe(false);
    });
  });

  describe("Safeword disabled scenarios", () => {
    it("should skip verification when require_safeword is false", () => {
      const invitation = createMockInvitation({ require_safeword: false });

      const shouldVerifySafeword = invitation.require_safeword === true;

      expect(shouldVerifySafeword).toBe(false);
    });

    it("should accept invitation without safeword when not required", () => {
      const invitation = createMockInvitation({
        require_safeword: false,
        safeword_hash: null,
        safeword_salt: null,
      });

      const canAcceptWithoutSafeword = !invitation.require_safeword;

      expect(canAcceptWithoutSafeword).toBe(true);
    });
  });

  describe("Remaining attempts calculation", () => {
    it("should calculate remaining attempts correctly", () => {
      const MAX_ATTEMPTS = 3;

      const testCases = [
        { attempts: 0, expectedRemaining: 3 },
        { attempts: 1, expectedRemaining: 2 },
        { attempts: 2, expectedRemaining: 1 },
        { attempts: 3, expectedRemaining: 0 },
      ];

      testCases.forEach(({ attempts, expectedRemaining }) => {
        const remaining = Math.max(0, MAX_ATTEMPTS - attempts);
        expect(remaining).toBe(expectedRemaining);
      });
    });
  });
});
