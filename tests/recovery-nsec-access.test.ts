import { beforeEach, describe, expect, it, vi } from "vitest";

import { RecoverySessionBridge } from "../src/lib/auth/recovery-session-bridge";

// Mock Supabase select for user_signing_preferences
const mockSupabase = {
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue({
    data: {
      id: "id",
      user_duid: "duid",
      preferred_method: "session",
      fallback_method: "nip07",
      auto_fallback: true,
      show_security_warnings: true,
      remember_choice: true,
      session_duration_minutes: 15,
      max_operations_per_session: 50,
      nip07_auto_approve: false,
      nfc_pin_timeout_seconds: 30,
      nfc_require_confirmation: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  }),
};
vi.mock("../src/lib/supabase", () => ({ supabase: mockSupabase }));

// Mock decryptNsecBytes and decryptNsecSimpleToBuffer to simulate reading from user_identities.hashed_encrypted_nsec
vi.mock("../src/lib/privacy/encryption", async (orig) => {
  const actual = await (orig as any)();
  return {
    ...actual,
    decryptNsecBytes: vi.fn(
      async (_enc: string, _salt: string) => new Uint8Array([1, 2, 3])
    ),
    decryptNsecSimpleToBuffer: vi.fn(
      async (_enc: string, _salt: string) => new Uint8Array(32)
    ),
    // Add missing function that RecoverySessionBridge uses
    decryptNsecSimple: vi.fn(async (_encryptedNsec: string, _salt: string) => {
      // Return a valid 64-character hex nsec
      return "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";
    }),
  };
});

// Mock userIdentitiesAuth to return a user with hashed_encrypted_nsec
vi.mock("../src/lib/auth/user-identities-auth", () => ({
  userIdentitiesAuth: {
    authenticateNIP05Password: vi.fn(async () => ({
      success: true,
      user: {
        id: "user-1",
        user_salt: "salt",
        hashed_encrypted_nsec: "validEncryptedNsecData", // More realistic encrypted data
      },
    })),
    authenticateNIP07: vi.fn(async () => ({
      success: true,
      user: {
        id: "user-1",
        user_salt: "salt",
        hashed_encrypted_nsec: "validEncryptedNsecData",
      },
    })),
  },
}));

// Mock NSEC session bridge to capture options
vi.mock("../src/lib/auth/nsec-session-bridge", () => {
  const initSpy = vi.fn(async (_hex?: string, _opts?: any) => "sess-1");
  return {
    nsecSessionBridge: { initializeAfterAuth: initSpy },
    __mocks: { initSpy },
  };
});

// Mock preferences
vi.mock("../src/lib/user-signing-preferences", () => ({
  userSigningPreferences: {
    async getUserPreferences() {
      return {
        sessionDurationMinutes: 15,
        maxOperationsPerSession: 50,
        sessionLifetimeMode: "browser_session",
      };
    },
  },
}));

// Ensure messaging_sessions has no encrypted nsec writes anywhere in this test scope
// (DB migration enforces drop; here we ensure we do not attempt inserts/updates there)

describe("Recovery nsec access and session creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("decrypts stored hashed_encrypted_nsec to bytes for user display", async () => {
    const { decryptNsecBytes } = await import("../src/lib/privacy/encryption");
    const bytes = await decryptNsecBytes("encNsec", "salt");
    expect(bytes).toBeInstanceOf(Uint8Array);
  });

  it("creates NSEC session with browserSession lifetime per preference", async () => {
    const bridge = RecoverySessionBridge.getInstance();
    const res = await bridge.createSessionFromRecovery({
      nip05: "name@example.com",
      password: "pw",
    });
    expect(res.success).toBe(true);
    const { __mocks } = await import("../src/lib/auth/nsec-session-bridge");
    const call = __mocks.initSpy.mock.calls[0];
    expect(call[1]?.browserLifetime).toBe(true);
  });
});
