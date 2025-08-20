import { beforeEach, describe, expect, it, vi } from "vitest";
import { userIdentitiesAuth } from "../../auth/user-identities-auth";

// Mock DUID generator used in NIP-07 flow
vi.mock("../../../lib/security/duid-generator", () => ({
  generateDUID: vi.fn().mockResolvedValue("u2"),
}));
vi.mock("../../../lib/security/duid-generator.js", () => ({
  generateDUID: vi.fn().mockResolvedValue("u2"),
}));

// Stub Supabase
vi.mock("../../supabase", () => {
  const chain = {
    _data: { id: "u2", is_active: true, failed_attempts: 0 },
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
      return Promise.resolve({ data: this._data, error: this._error });
    },
  };
  const supabase = { from: (_table: string) => chain };
  return { supabase };
});
vi.mock("src/lib/supabase.ts", () => {
  const chain = {
    _data: { id: "u2", is_active: true, failed_attempts: 0 },
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
      return Promise.resolve({ data: this._data, error: this._error });
    },
  };
  const supabase = { from: (_table: string) => chain };
  return { supabase };
});

function makeFakeAccessToken(payload: Record<string, any>) {
  const header = { alg: "HS256", typ: "JWT" };
  const b64 = (obj: any) => btoa(JSON.stringify(obj));
  return `${b64(header)}.${b64(payload)}.sig`;
}

describe("Client auth facade - NIP-07", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // @ts-ignore
    global.fetch = vi.fn();
  });

  it("calls /api/auth/nip07-signin and returns AuthResult", async () => {
    const token = makeFakeAccessToken({
      userId: "u2",
      hashedId: "h2",
      exp: Math.floor(Date.now() / 1000) + 900,
      type: "access",
      sessionId: "s2",
    });

    // @ts-ignore
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "Content-Type": "application/json" }),
      json: async () => ({
        success: true,
        user: { id: "u2" },
        sessionToken: token,
      }),
    });

    const res = await userIdentitiesAuth.authenticateNIP07({
      pubkey: "npub1xyz",
      signature: "sig",
      challenge: "c",
    });
    expect(res.success).toBe(true);
    expect(res.user?.id).toBe("u2");
    expect(res.sessionToken).toBeDefined();

    expect(global.fetch as any).toHaveBeenCalledWith(
      "/api/auth/nip07-signin",
      expect.objectContaining({ method: "POST", credentials: "include" })
    );
  });
});
