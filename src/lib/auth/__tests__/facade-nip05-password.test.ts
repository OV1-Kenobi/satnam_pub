import { beforeEach, describe, expect, it, vi } from "vitest";
import SecureTokenManager from "../../auth/secure-token-manager";
import { userIdentitiesAuth } from "../../auth/user-identities-auth";

// Mock DUID generation used by authenticateNIP05Password
vi.mock("../../../lib/security/duid-generator", () => ({
  generateDUIDFromNIP05: vi.fn().mockResolvedValue("u1"),
}));
// Also mock with explicit .js path in case resolver differs
vi.mock("../../../lib/security/duid-generator.js", () => ({
  generateDUIDFromNIP05: vi.fn().mockResolvedValue("u1"),
}));

// Mock supabase module imported via dynamic import("../supabase")
vi.mock("../../supabase", () => {
  const chain = {
    _data: null as any,
    _error: null as any,
    select() {
      return this;
    },
    update() {
      return this;
    },
    insert() {
      return this;
    },
    eq() {
      return this;
    },
    single() {
      return Promise.resolve({
        data: supabaseUser ?? this._data,
        error: this._error,
      });
    },
  };
  const supabase = {
    from: (_t: string) => ({ ...chain, _data: supabaseUser }),
  };
  return { supabase };
});
vi.mock("src/lib/supabase.ts", () => {
  const chain = {
    _data: null as any,
    _error: null as any,
    select() {
      return this;
    },
    update() {
      return this;
    },
    insert() {
      return this;
    },
    eq() {
      return this;
    },
    single() {
      return Promise.resolve({
        data: supabaseUser ?? this._data,
        error: this._error,
      });
    },
  };
  const supabase = {
    from: (_t: string) => ({ ...chain, _data: supabaseUser }),
  };
  return { supabase };
});

// Helper to compute PBKDF2(SHA-512) base64 as used by PasswordUtils
async function pbkdf2Base64(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-512",
      iterations: 100000,
      salt: enc.encode(salt),
    },
    keyMaterial,
    64 * 8
  );
  return Buffer.from(new Uint8Array(derived)).toString("base64");
}

// Stub Supabase client used by user-identities-auth
let supabaseUser: any = null;
vi.mock("../../supabase", () => {
  const chain = {
    _data: null as any,
    _error: null as any,
    select() {
      return this;
    },
    update() {
      return this;
    },
    insert() {
      return this;
    },
    eq() {
      return this;
    },
    single() {
      return Promise.resolve({
        data: supabaseUser ?? this._data,
        error: this._error,
      });
    },
  };
  const supabase = {
    from: (_table: string) => ({ ...chain, _data: supabaseUser }),
  };
  return { supabase };
});

// Minimal deterministic base64 JWT-like token (no signature verification in client)
function makeFakeAccessToken(payload: Record<string, any>) {
  const header = { alg: "HS256", typ: "JWT" };
  const b64url = (obj: any) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${b64url(header)}.${b64url(payload)}.sig`;
}

describe("Client auth facade - NIP-05/password", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    // @ts-ignore
    global.fetch = vi.fn();

    // Prepare a user with a matching PBKDF2 password hash
    const password_salt = "salt";
    const password_hash = await pbkdf2Base64("secret", password_salt);
    supabaseUser = {
      id: "u1",
      is_active: true,
      password_hash,
      password_salt,
      failed_attempts: 0,
    };
  });

  it("calls /api/auth/signin and returns AuthResult; token can be parsed", async () => {
    const token = makeFakeAccessToken({
      userId: "u1",
      hashedId: "h1",
      exp: Math.floor(Date.now() / 1000) + 900,
      type: "access",
      sessionId: "s1",
    });

    // Server-side signin response for /api/auth/signin
    // @ts-ignore
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "Content-Type": "application/json" }),
      json: async () => ({
        success: true,
        user: { id: "u1" },
        sessionToken: token,
      }),
    });

    const res = await userIdentitiesAuth.authenticateNIP05Password({
      nip05: "alice@my.satnam.pub",
      password: "secret",
    });
    expect(res).toBeDefined();
    expect(res.success).toBe(true);
    expect(res.sessionToken).toBeDefined();

    expect(global.fetch as any).toHaveBeenCalledWith(
      "/api/auth/signin",
      expect.objectContaining({ method: "POST", credentials: "include" })
    );

    const parsed = SecureTokenManager.parseTokenPayload(res.sessionToken!);
    expect(parsed?.userId).toBe("u1");
    expect(parsed?.type).toBe("access");
  });
});
