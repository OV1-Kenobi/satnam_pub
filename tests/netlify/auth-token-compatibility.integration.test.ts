import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";

const TEST_JWT_SECRET = "unit-test-jwt-secret";
const TEST_DUID = "duid_test_user";
const TEST_NIP05 = "testuser@my.satnam.pub";
const TEST_ROLE = "private";
const TEST_VAULT_KEY = "unit-test-vault-key";
const TEST_WALLET_ID = "w1";

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

const generateDUIDFromNIP05Mock = vi.fn(async () => TEST_DUID);
vi.mock("../../lib/security/duid-generator.js", () => ({
  generateDUIDFromNIP05: generateDUIDFromNIP05Mock,
}));

const adminSupabase = {
  from(table: string) {
    const row =
      table === "user_identities"
        ? {
            id: TEST_DUID,
            role: TEST_ROLE,
            is_active: true,
            user_salt: null,
            encrypted_nsec: null,
            encrypted_nsec_iv: null,
            npub: "npub1test",
          }
        : table === "vault.decrypted_secrets"
        ? { decrypted_secret: TEST_VAULT_KEY }
        : table === "lnbits_wallets"
        ? {
            user_duid: TEST_DUID,
            wallet_id: TEST_WALLET_ID,
            wallet_admin_key_enc: encryptB64("APIKEY-TEST"),
          }
        : null;
    return {
      select() {
        return this;
      },
      eq() {
        return this;
      },
      limit() {
        return this;
      },
      async single() {
        if (!row)
          return { data: null, error: { message: "not found" }, status: 406 };
        return { data: row, error: null, status: 200 };
      },
    };
  },
};

vi.mock("../../netlify/functions_active/supabase.js", () => ({
  supabase: adminSupabase,
}));
vi.mock("../../netlify/functions/supabase.js", () => ({
  supabase: adminSupabase,
  supabaseAdmin: adminSupabase,
  getRequestClient: () => ({
    auth: {
      async getUser() {
        return { data: { user: null } };
      },
    },
    from(table: string) {
      return adminSupabase.from(table);
    },
  }),
}));

const enhancedRateLimiterMock = {
  RATE_LIMITS: {
    AUTH_SESSION: { limit: 100, windowMs: 60_000 },
    WALLET_OPERATIONS: { limit: 100, windowMs: 60_000 },
  },
  checkRateLimit: vi.fn(async () => true),
  createRateLimitIdentifier: vi.fn(() => "test-rate-limit"),
  getClientIP: vi.fn(() => "127.0.0.1"),
};

vi.mock(
  "../../netlify/functions_active/utils/enhanced-rate-limiter.ts",
  () => enhancedRateLimiterMock
);
vi.mock(
  "../../netlify/functions_active/utils/enhanced-rate-limiter.js",
  () => enhancedRateLimiterMock
);

vi.mock("../../netlify/functions/utils/secure-decrypt-logger.js", () => ({
  getInvoiceKeyWithSafety: vi.fn(async () => ({
    key: TEST_VAULT_KEY,
    async release() {},
  })),
  logDecryptAudit: vi.fn(async () => {}),
  newRequestId: vi.fn(() => "test-request-id"),
}));

async function createTestJWT(expiresInSeconds: number): Promise<string> {
  const sessionId = "session-test";
  const hashedId = createHmac("sha256", TEST_JWT_SECRET)
    .update(`${TEST_DUID}|${sessionId}`)
    .digest("hex");

  const payload = {
    userId: TEST_DUID,
    hashedId,
    nip05: TEST_NIP05,
    type: "access" as const,
    sessionId,
    role: TEST_ROLE,
  };

  // Use the same Web Crypto–based JWT creation logic as SecureSessionManager
  const { SecureSessionManager } = await import(
    "../../netlify/functions_active/security/session-manager.js"
  );

  const token = await (SecureSessionManager as any).createJWTToken(
    payload,
    TEST_JWT_SECRET,
    expiresInSeconds
  );

  return token as string;
}

async function callAuthSessionUser(token: string) {
  const { handler } = await import(
    "../../netlify/functions_active/auth-session-user.js"
  );
  const event = {
    httpMethod: "GET",
    headers: { authorization: `Bearer ${token}`, origin: "http://localhost" },
  } as any;
  return handler(event);
}

async function callLnbitsProxy(token: string) {
  const { handler } = await import("../../netlify/functions/lnbits-proxy");
  const event = {
    httpMethod: "POST",
    headers: { authorization: `Bearer ${token}`, origin: "http://localhost" },
    body: JSON.stringify({ action: "getWalletUrl", payload: {} }),
  } as any;
  return handler(event);
}

describe("Auth token compatibility between auth-session-user and lnbits-proxy", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = TEST_JWT_SECRET;
    process.env.DUID_SERVER_SECRET = "duid-secret";
    process.env.LNBITS_BASE_URL = "https://my.satnam.pub";
    process.env.VITE_LNBITS_INTEGRATION_ENABLED = "true";
  });

  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("auth-session-user accepts a valid JWT and returns user data", async () => {
    const token = await createTestJWT(3600);
    const res = await callAuthSessionUser(token);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    console.log("auth-session-user body:", body);
    expect(body.success).toBe(true);
    expect(body.data.user.nip05).toBe(TEST_NIP05);
    expect(generateDUIDFromNIP05Mock).toHaveBeenCalled();
  });

  it("lnbits-proxy accepts the same JWT format and authenticates wallet actions", async () => {
    const token = await createTestJWT(3600);
    const res = await callLnbitsProxy(token);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    console.log("lnbits-proxy body:", body);
    expect(body.success).toBe(true);
    expect(body.data.walletUrl).toContain("https://my.satnam.pub/wallet");
    expect(generateDUIDFromNIP05Mock).toHaveBeenCalled();
  });

  it("both handlers reject malformed JWT tokens", async () => {
    const badToken = "not-a-jwt";
    const res1 = await callAuthSessionUser(badToken);
    const res2 = await callLnbitsProxy(badToken);
    expect(res1.statusCode).toBe(401);
    expect(res2.statusCode).toBe(401);
  });

  it("both handlers reject expired JWT tokens", async () => {
    const expiredToken = await createTestJWT(-3600);
    const res1 = await callAuthSessionUser(expiredToken);
    const res2 = await callLnbitsProxy(expiredToken);
    expect(res1.statusCode).toBe(401);
    expect(res2.statusCode).toBe(401);
  });
});
