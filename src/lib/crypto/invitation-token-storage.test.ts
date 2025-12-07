/**
 * Invitation Token Storage Tests
 *
 * Tests for AES-256-GCM encrypted sessionStorage functionality
 * for family invitation tokens during Identity Forge registration flow.
 *
 * Phase 1: Persistent Token Storage (P0)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  storeEncryptedInvitationToken,
  recoverEncryptedInvitationToken,
  clearInvitationToken,
  hasPendingInvitationToken,
} from "./invitation-token-storage";

// Test constants
const STORAGE_KEY = "satnam_family_invitation_enc";
const SESSION_KEY_STORAGE = "satnam_invitation_session_key";
const VALID_INVITATION_TOKEN = "inv_dGVzdHRva2VuMTIzNDU2Nzg5";
const NON_FAMILY_TOKEN = "peer_some_other_token";

// Mock sessionStorage for browser environment
const createMockSessionStorage = () => {
  const store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      Object.keys(store).forEach((key) => delete store[key]);
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
    _store: store,
  };
};

describe("Invitation Token Storage", () => {
  let mockSessionStorage: ReturnType<typeof createMockSessionStorage>;

  beforeEach(() => {
    mockSessionStorage = createMockSessionStorage();
    vi.stubGlobal("sessionStorage", mockSessionStorage);
    // Ensure Web Crypto API is available
    vi.stubGlobal("crypto", globalThis.crypto);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe("storeEncryptedInvitationToken()", () => {
    it("should successfully store valid inv_* token with AES-256-GCM encryption", async () => {
      await storeEncryptedInvitationToken(VALID_INVITATION_TOKEN);

      expect(mockSessionStorage.setItem).toHaveBeenCalled();
      expect(mockSessionStorage._store[STORAGE_KEY]).toBeDefined();
      expect(mockSessionStorage._store[SESSION_KEY_STORAGE]).toBeDefined();

      // Verify stored value contains IV.ciphertext format
      const storedValue = mockSessionStorage._store[STORAGE_KEY];
      expect(storedValue).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    });

    it("should handle empty token gracefully (no storage)", async () => {
      await storeEncryptedInvitationToken("");

      expect(mockSessionStorage.setItem).not.toHaveBeenCalled();
      expect(mockSessionStorage._store[STORAGE_KEY]).toBeUndefined();
    });

    it("should handle null/undefined token gracefully", async () => {
      await storeEncryptedInvitationToken(null as unknown as string);

      expect(mockSessionStorage.setItem).not.toHaveBeenCalled();
    });

    it("should gracefully fail when Web Crypto API is unavailable", async () => {
      // Remove crypto.subtle
      vi.stubGlobal("crypto", { getRandomValues: vi.fn() });

      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await storeEncryptedInvitationToken(VALID_INVITATION_TOKEN);

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("should validate token format before storage", async () => {
      // Any non-empty string should be stored
      await storeEncryptedInvitationToken("any_valid_token");

      expect(mockSessionStorage._store[STORAGE_KEY]).toBeDefined();
    });
  });

  describe("recoverEncryptedInvitationToken()", () => {
    it("should successfully recover previously stored token", async () => {
      await storeEncryptedInvitationToken(VALID_INVITATION_TOKEN);

      const recovered = await recoverEncryptedInvitationToken();

      expect(recovered).toBe(VALID_INVITATION_TOKEN);
    });

    it("should return null when no token exists", async () => {
      const recovered = await recoverEncryptedInvitationToken();

      expect(recovered).toBeNull();
    });

    it("should validate recovered token has inv_ prefix", async () => {
      // Store a non-family token (shouldn't be stored in practice, but testing validation)
      await storeEncryptedInvitationToken(NON_FAMILY_TOKEN);

      const recovered = await recoverEncryptedInvitationToken();

      // Should return null because token doesn't start with 'inv_'
      expect(recovered).toBeNull();
    });

    it("should handle corrupted encrypted data gracefully", async () => {
      mockSessionStorage._store[STORAGE_KEY] = "corrupted.data.invalid";
      mockSessionStorage._store[SESSION_KEY_STORAGE] = "also_corrupted";

      const recovered = await recoverEncryptedInvitationToken();

      expect(recovered).toBeNull();
    });
  });

  describe("clearInvitationToken()", () => {
    it("should remove token from sessionStorage", async () => {
      await storeEncryptedInvitationToken(VALID_INVITATION_TOKEN);
      expect(mockSessionStorage._store[STORAGE_KEY]).toBeDefined();

      clearInvitationToken();

      expect(mockSessionStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
    });

    it("should handle missing key gracefully (no errors)", () => {
      expect(() => clearInvitationToken()).not.toThrow();
      expect(mockSessionStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
    });
  });

  describe("hasPendingInvitationToken()", () => {
    it("should return true when valid encrypted token exists", async () => {
      await storeEncryptedInvitationToken(VALID_INVITATION_TOKEN);

      const hasPending = hasPendingInvitationToken();

      expect(hasPending).toBe(true);
    });

    it("should return false when sessionStorage is empty", () => {
      const hasPending = hasPendingInvitationToken();

      expect(hasPending).toBe(false);
    });

    it("should return false when token is cleared", async () => {
      await storeEncryptedInvitationToken(VALID_INVITATION_TOKEN);
      clearInvitationToken();

      const hasPending = hasPendingInvitationToken();

      expect(hasPending).toBe(false);
    });
  });

  describe("URL-safe Base64 encoding/decoding", () => {
    it("should round-trip encoding/decoding preserve data", async () => {
      // Store and recover should preserve exact token value
      await storeEncryptedInvitationToken(VALID_INVITATION_TOKEN);
      const recovered = await recoverEncryptedInvitationToken();

      expect(recovered).toBe(VALID_INVITATION_TOKEN);
    });

    it("should produce URL-safe base64 (no +, /, =)", async () => {
      await storeEncryptedInvitationToken(VALID_INVITATION_TOKEN);

      const storedValue = mockSessionStorage._store[STORAGE_KEY];

      // Should not contain +, /, or = (URL-safe base64)
      expect(storedValue).not.toMatch(/[+/=]/);
    });
  });

  describe("Session key management", () => {
    it("should generate new AES-256-GCM key when none exists", async () => {
      expect(mockSessionStorage._store[SESSION_KEY_STORAGE]).toBeUndefined();

      await storeEncryptedInvitationToken(VALID_INVITATION_TOKEN);

      expect(mockSessionStorage._store[SESSION_KEY_STORAGE]).toBeDefined();
      // Should be 32 bytes (256 bits) encoded in base64 (43+ chars without padding)
      const storedKey = mockSessionStorage._store[SESSION_KEY_STORAGE];
      expect(storedKey.length).toBeGreaterThanOrEqual(40);
    });

    it("should recover existing key from sessionStorage", async () => {
      // First store creates the key
      await storeEncryptedInvitationToken(VALID_INVITATION_TOKEN);
      const firstKey = mockSessionStorage._store[SESSION_KEY_STORAGE];

      // Clear the encrypted token but keep the key
      clearInvitationToken();

      // Second store should use the same key
      await storeEncryptedInvitationToken(VALID_INVITATION_TOKEN);
      const secondKey = mockSessionStorage._store[SESSION_KEY_STORAGE];

      expect(firstKey).toBe(secondKey);
    });
  });

  describe("Integration scenarios", () => {
    it("should handle full store-recover-clear lifecycle", async () => {
      // Initial state
      expect(hasPendingInvitationToken()).toBe(false);

      // Store
      await storeEncryptedInvitationToken(VALID_INVITATION_TOKEN);
      expect(hasPendingInvitationToken()).toBe(true);

      // Recover
      const recovered = await recoverEncryptedInvitationToken();
      expect(recovered).toBe(VALID_INVITATION_TOKEN);

      // Clear
      clearInvitationToken();
      expect(hasPendingInvitationToken()).toBe(false);

      // Verify recovery returns null after clear
      const afterClear = await recoverEncryptedInvitationToken();
      expect(afterClear).toBeNull();
    });

    it("should handle multiple store operations (overwrites previous)", async () => {
      const token1 = "inv_first_token_abc123";
      const token2 = "inv_second_token_xyz789";

      await storeEncryptedInvitationToken(token1);
      await storeEncryptedInvitationToken(token2);

      const recovered = await recoverEncryptedInvitationToken();
      expect(recovered).toBe(token2);
    });
  });
});
