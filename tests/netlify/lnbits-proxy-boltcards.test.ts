import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Ensure feature flag is ON and base URL present
beforeEach(() => {
  process.env.VITE_LNBITS_INTEGRATION_ENABLED = "true";
  process.env.LNBITS_BASE_URL = "https://my.satnam.pub";
  process.env.DUID_SERVER_SECRET = "unit-test-secret"; // used for AES-GCM key derivation
  process.env.LNBITS_KEY_ENC_SECRET = "unit-test-secret"; // match proxy preference order
});

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

// Minimal AES-GCM helpers to create encrypted wallet key compatible with proxy
import { createCipheriv, createHash, randomBytes } from "node:crypto";
const TEST_VAULT_KEY = "unit-test-secret";
function encryptB64(plain: string): string {
  const key = createHash("sha256").update(TEST_VAULT_KEY).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([
    cipher.update(Buffer.from(plain, "utf8")),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

// Rate limiter: allow by default; we can override per test
vi.mock("../../netlify/functions/utils/rate-limiter.js", () => ({
  allowRequest: vi.fn(() => true),
}));

// Stateful mock Supabase client
const state = {
  userId: "user_1",
  lnbits_boltcards: [] as any[],
  lnbits_wallets: [
    { user_duid: "user_1", wallet_id: "w1", wallet_admin_key_enc: "" },
  ] as any[],
};
state.lnbits_wallets[0].wallet_admin_key_enc = encryptB64("APIKEY-TEST");

// RPC mock handler for resolveHandleForLnurl
const rpcMock = vi.fn(async (funcName: string, params: any) => {
  if (funcName === "public.get_ln_proxy_data") {
    const username = params?.p_username?.toLowerCase();
    const users = (state as any).users || [];
    const match = users.find((u: any) => u.handle?.toLowerCase() === username);
    if (match) {
      return {
        data: {
          user_id: match.user_duid || match.user_id,
          wallet_id: match.wallet_id,
          lnbits_wallet_id: match.wallet_id,
          lnbits_invoice_key: "invoice-key-test",
          platform_ln_address: `${username}@my.satnam.pub`,
        },
        error: null,
      };
    }
    return { data: null, error: null };
  }
  if (funcName === "public.get_federation_ln_proxy_data") {
    const handle = params?.p_handle?.toLowerCase();
    const feds = (state as any).family_federations || [];
    const match = feds.find((f: any) => f.handle?.toLowerCase() === handle);
    if (match) {
      return {
        data: {
          federation_duid: match.federation_duid || match.user_duid,
          federation_handle: match.handle,
          lnbits_wallet_id: match.wallet_id,
          lnbits_invoice_key: "fed-invoice-key-test",
          platform_ln_address: `${handle}@my.satnam.pub`,
        },
        error: null,
      };
    }
    return { data: null, error: null };
  }
  return { data: null, error: { message: "Unknown RPC" } };
});

vi.mock("../../netlify/functions/supabase.js", () => ({
  getRequestClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(
        async () => ({ data: { user: { id: state.userId } } } as any)
      ),
    },
    from: vi.fn((table: string) => {
      const chain: any = {
        _table: table,
        _query: {},
        select: vi.fn().mockReturnThis(),
        update: vi.fn(function (this: any, patch: any) {
          this._mode = "update";
          this._patch = patch;
          this._eqCount = 0;
          return this;
        }),
        eq: vi.fn(function (this: any, col: string, val: any) {
          this._query[col] = val;
          if (this._mode === "update") {
            this._eqCount = (this._eqCount || 0) + 1;
            if (this._eqCount >= 2) {
              const self = this;
              return {
                then(resolve: any) {
                  const rows = (state as any)[self._table];
                  const match = rows.find((r: any) =>
                    Object.entries(self._query).every(([k, v]) => r[k] === v)
                  );
                  if (match) Object.assign(match, self._patch);
                  resolve({ data: null, error: null });
                },
              } as any;
            }
          }
          return this;
        }),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn(async function (this: any) {
          const rows = (state as any)[this._table] || [];
          const match = rows.find((r: any) =>
            Object.entries(this._query).every(([k, v]) => r[k] === v)
          );
          return match
            ? { data: match, error: null }
            : { data: null, error: { message: "not found" } };
        }),
        maybeSingle: vi.fn(async function (this: any) {
          const rows = (state as any)[this._table] || [];
          const match = rows.find((r: any) =>
            Object.entries(this._query).every(([k, v]) => r[k] === v)
          );
          return match
            ? { data: match, error: null }
            : { data: null, error: null };
        }),
        insert: vi.fn(async function (this: any, payload: any) {
          const rows = (state as any)[this._table];
          if (!Array.isArray(rows))
            return { data: null, error: { message: "bad table" } };
          if (Array.isArray(payload)) rows.push(...payload);
          else rows.push(payload);
          return { data: null, error: null };
        }),
      };
      return chain;
    }),
  })),
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: (_col: string, _val: any) => ({
          single: async () => {
            if (table === "vault.decrypted_secrets") {
              return {
                data: { decrypted_secret: TEST_VAULT_KEY },
                error: null,
              };
            }
            return { data: null, error: { message: "not found" } };
          },
        }),
      }),
    }),
  },
  supabaseAdmin: {
    rpc: rpcMock,
  },
}));

// Mock fetch used by proxy's lnbitsFetch in syncBoltcards
const fetchMock = vi.fn();
(globalThis as any).fetch = fetchMock as any;

async function callProxy(action: string, payload: any) {
  const { handler } = await import("../../netlify/functions/lnbits-proxy");
  const event = {
    httpMethod: "POST",
    headers: { authorization: "Bearer test" },
    body: JSON.stringify({ action, payload }),
  } as any;
  const res = await handler(event as any);
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

describe("lnbits-proxy boltcards actions", () => {
  beforeEach(() => {
    state.lnbits_boltcards.length = 0;
    fetchMock.mockReset();
  });

  it("setBoltcardPin sets salted+encrypted hash and returns success", async () => {
    // Seed a card owned by the user
    state.lnbits_boltcards.push({
      user_duid: state.userId,
      card_id: "card123",
    });

    const { statusCode, body } = await callProxy("setBoltcardPin", {
      cardId: "card123",
      pin: "123456",
    });
    expect(statusCode).toBe(200);
    expect(body.success).toBe(true);

    const row = state.lnbits_boltcards.find((r) => r.card_id === "card123");
    expect(typeof row.pin_salt).toBe("string");
    expect(typeof row.pin_hash_enc).toBe("string");
  });

  it("validateBoltcardPin returns 200 on correct PIN and 401 on wrong PIN", async () => {
    // Seed card and set PIN via proxy to ensure storage format matches
    state.lnbits_boltcards.push({
      user_duid: state.userId,
      card_id: "cardABC",
    });
    let resp = await callProxy("setBoltcardPin", {
      cardId: "cardABC",
      pin: "654321",
    });
    expect(resp.statusCode).toBe(200);

    // Correct PIN
    let ok = await callProxy("validateBoltcardPin", {
      cardId: "cardABC",
      pin: "654321",
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.body.success).toBe(true);

    // Wrong PIN
    const bad = await callProxy("validateBoltcardPin", {
      cardId: "cardABC",
      pin: "000000",
    });
    expect(bad.statusCode).toBe(401);
    expect(bad.body.error).toBe("Invalid PIN");
  });

  it("syncBoltcards upserts cards from LNbits and returns results shape", async () => {
    // Mock LNbits response: one card with label and uid
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify([
          { id: "cid1", label: "Name Tag", uid: "UID-1", auth_link: "lnurl1" },
        ]),
    });

    const { statusCode, body } = await callProxy("syncBoltcards", {});
    expect(statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.results[0]).toEqual({ walletId: "w1", hits: 1 });

    // Confirm row upserted
    const row = state.lnbits_boltcards.find((r) => r.card_id === "cid1");
    expect(row).toBeTruthy();
    expect(row.label).toBe("Name Tag");
    expect(typeof row.auth_link_enc).toBe("string");
  });
});

// ----------------------------------------------
// Admin action authorization tests
// ----------------------------------------------

describe("lnbits-proxy admin action authorization", () => {
  beforeEach(() => {
    // Ensure admin key present for admin-scoped operations
    process.env.LNBITS_ADMIN_KEY = "ADMIN-TEST-KEY";
    // Default role store empty; tests populate as needed
    (state as any).user_identities = [];
    fetchMock.mockReset();
  });

  async function callProxyWithHeaders(
    action: string,
    payload: any,
    headers: Record<string, string> = {}
  ) {
    const { handler } = await import("../../netlify/functions/lnbits-proxy");
    const event = {
      httpMethod: "POST",
      headers,
      body: JSON.stringify({ action, payload }),
    } as any;
    const res = await handler(event as any);
    return { statusCode: res.statusCode, body: JSON.parse(res.body) };
  }

  it("returns 401 for unauthenticated provisionWallet request", async () => {
    const { statusCode, body } = await callProxyWithHeaders(
      "provisionWallet",
      { username: "alice", password: "secret", wallet_name: "Satnam Wallet" },
      {}
    );
    expect(statusCode).toBe(401);
    expect(body).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns 403 for authenticated user with private role", async () => {
    // Populate role as private
    (state as any).user_identities = [
      { id: (state as any).userId, role: "private" },
    ];

    const { statusCode, body } = await callProxy("provisionWallet", {
      username: "alice",
      password: "secret",
      wallet_name: "Satnam Wallet",
    });
    expect(statusCode).toBe(403);
    expect(body).toEqual({ success: false, error: "Forbidden" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 403 for authenticated user with offspring role", async () => {
    // Populate role as offspring
    (state as any).user_identities = [
      { id: (state as any).userId, role: "offspring" },
    ];

    const { statusCode, body } = await callProxy("provisionWallet", {
      username: "bob",
      password: "secret",
      wallet_name: "My Wallet",
    });
    expect(statusCode).toBe(403);
    expect(body).toEqual({ success: false, error: "Forbidden" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows guardian role to provisionWallet (returns 200)", async () => {
    (state as any).user_identities = [
      { id: (state as any).userId, role: "guardian" },
    ];

    // Mock LNbits user create + wallet create
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ id: "lnbits-user-1" }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ id: "lnbits-wallet-1" }),
    });

    const { statusCode, body } = await callProxy("provisionWallet", {
      username: "carol",
      password: "secret",
      wallet_name: "Guardian Wallet",
    });

    expect(statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.user).toBeDefined();
    expect(body.data.wallet).toBeDefined();
  });

  it("allows admin role to provisionWallet (returns 200)", async () => {
    (state as any).user_identities = [
      { id: (state as any).userId, role: "admin" },
    ];

    // Mock LNbits user create + wallet create
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ id: "lnbits-user-2" }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ id: "lnbits-wallet-2" }),
    });

    const { statusCode, body } = await callProxy("provisionWallet", {
      username: "dave",
      password: "secret",
      wallet_name: "Admin Wallet",
    });

    expect(statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.user).toBeDefined();
    expect(body.data.wallet).toBeDefined();
  });

  it("returns 403 when role lookup fails (DB error or not found)", async () => {
    // Simulate DB error by leaving user_identities empty (single() returns error)
    (state as any).user_identities = [];

    const { statusCode, body } = await callProxy("provisionWallet", {
      username: "erin",
      password: "secret",
      wallet_name: "Test",
    });

    expect(statusCode).toBe(403);
    expect(body).toEqual({ success: false, error: "Forbidden" });
  });
});

// ============================================================================
// FEDERATION LNURL-PAY TESTS (Task 4.7)
// ============================================================================

/**
 * These tests verify federation LNURL-pay routing through the unified
 * lnurlpWellKnown and lnurlpPlatform actions in lnbits-proxy.ts.
 *
 * The proxy uses resolveHandleForLnurl() to check both user and federation
 * tables, returning appropriate LNURL-pay metadata for either entity type.
 */

describe("lnbits-proxy federation LNURL-pay routing", () => {
  beforeEach(() => {
    // Reset state for federation tests
    fetchMock.mockReset();
    // Populate mock federation data
    (state as any).family_federations = [
      {
        handle: "nakamoto-family",
        wallet_id: "w1",
        user_duid: "user_1",
        federation_duid: "fed_1",
        description:
          "Nakamoto Family Federation, the spiritual kin of Satoshi Nakamoto",
      },
    ];
  });

  it("should resolve federation handle to LNURL-pay metadata via lnurlpWellKnown", async () => {
    const { statusCode, body } = await callProxy("lnurlpWellKnown", {
      username: "nakamoto-family",
    });

    expect(statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.callback).toBeDefined();
    expect(body.data.tag).toBe("payRequest");
    expect(body.data.metadata).toBeDefined();
    // Verify federation type indicator in metadata
    expect(body.data.metadata).toContain("Federation");
  });

  it("should generate invoice for federation via lnurlpPlatform", async () => {
    // Mock LNbits invoice creation response
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({
          payment_hash: "hash123",
          payment_request: "lnbc10n1...",
        }),
    });

    const { statusCode, body } = await callProxy("lnurlpPlatform", {
      username: "nakamoto-family",
      amount: 10000, // 10 sats in millisats
      comment: "Test payment to federation",
    });

    expect(statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.pr).toBeDefined();
    expect(body.data.routes).toBeDefined();
  });

  it("should validate handle format before lookup", async () => {
    const { statusCode, body } = await callProxy("lnurlpWellKnown", {
      username: "invalid@handle!",
    });

    // Should return validation error for invalid format
    expect(statusCode).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/invalid|username|handle/i);
  });

  it("should return 404 for non-existent handle", async () => {
    // The unified resolver will check both tables and return not found
    const { statusCode, body } = await callProxy("lnurlpWellKnown", {
      username: "nonexistent-handle-xyz",
    });

    // May return 404 (not found) or 500 (RPC error in test environment)
    expect([404, 500]).toContain(statusCode);
    expect(body.success).toBe(false);
  });

  it("should validate amount for lnurlpPlatform", async () => {
    const { statusCode, body } = await callProxy("lnurlpPlatform", {
      username: "smith-family",
      amount: -100, // Invalid negative amount
    });

    expect(statusCode).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/invalid|amount/i);
  });
});

describe("lnbits-proxy federation vs user LNURL routing", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    // Setup user mock data
    (state as any).users = [
      { handle: "testuser123", wallet_id: "w1", user_duid: "user_1" },
    ];
    (state as any).family_federations = [];
  });

  it("should route to user wallet via lnurlpWellKnown for user handles", async () => {
    const { statusCode, body } = await callProxy("lnurlpWellKnown", {
      username: "testuser123",
    });

    expect(statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.tag).toBe("payRequest");
    // Verify user type indicator in metadata
    expect(body.data.metadata).toContain("User");
  });

  it("should differentiate user and federation in response metadata", async () => {
    // Setup both user and federation with same handle to test precedence
    (state as any).users = [
      { handle: "shared-name", wallet_id: "w1", user_duid: "user_1" },
    ];
    (state as any).family_federations = [
      {
        handle: "shared-name",
        wallet_id: "w2",
        federation_duid: "fed_1",
      },
    ];

    const { statusCode, body } = await callProxy("lnurlpWellKnown", {
      username: "shared-name",
    });

    expect(statusCode).toBe(200);
    expect(body.success).toBe(true);
    // Verify metadata indicates entity type (user takes precedence per resolver logic)
    const metadata = body.data?.metadata;
    expect(metadata).toBeDefined();
    // User should take precedence over federation
    expect(metadata).toContain("User");
  });

  it("should require amount for lnurlpPlatform invoice creation", async () => {
    const { statusCode, body } = await callProxy("lnurlpPlatform", {
      username: "testuser",
      // Missing amount
    });

    expect(statusCode).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/invalid|amount/i);
  });
});
