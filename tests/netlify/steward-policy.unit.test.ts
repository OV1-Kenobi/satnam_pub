import { afterEach, describe, expect, it, vi } from "vitest";

const {
  rpcState,
  generateDUIDFromNIP05Mock,
  validateSessionFromHeaderMock,
  rateLimiterMock,
  rlsClient,
  serviceClient,
} = vi.hoisted(() => {
  const generateDUIDFromNIP05Mock = vi.fn(async () => "duid-test-user");
  const validateSessionFromHeaderMock = vi.fn(async () => ({
    nip05: "user@my.satnam.pub",
  }));

  const rateLimiterMock = {
    RATE_LIMITS: {
      NFC_OPERATIONS: { limit: 100, windowMs: 60_000 },
    },
    checkRateLimitStatus: vi.fn(async () => ({ allowed: true })),
    createRateLimitIdentifier: vi.fn(() => "test-rate-key"),
    getClientIP: vi.fn(() => "127.0.0.1"),
  };

  function makeQuery(result: { data: any; error: any }) {
    return {
      select() {
        return this;
      },
      eq() {
        return this;
      },
      in() {
        return this;
      },
      limit() {
        return this;
      },
      then(onFulfilled: (value: any) => any) {
        return Promise.resolve(result).then(onFulfilled);
      },
    } as any;
  }

  const rlsClient = {
    rpc: vi.fn(async () => ({ data: null, error: null })),
    from(table: string) {
      if (table === "family_members") {
        return makeQuery({
          data: [{ family_federation_id: "fed-uuid-test" }],
          error: null,
        });
      }
      if (table === "family_federations") {
        return makeQuery({
          data: [{ federation_duid: "fed-duid-test" }],
          error: null,
        });
      }
      return makeQuery({ data: null, error: null });
    },
  } as any;

  const rpcState = { rows: [] as any[] | null, error: null as any };

  const serviceClient = {
    rpc: vi.fn(async () => ({ data: rpcState.rows, error: rpcState.error })),
  } as any;

  return {
    rpcState,
    generateDUIDFromNIP05Mock,
    validateSessionFromHeaderMock,
    rateLimiterMock,
    rlsClient,
    serviceClient,
  };
});

vi.mock("../../lib/security/duid-generator.js", () => ({
  generateDUIDFromNIP05: generateDUIDFromNIP05Mock,
}));

vi.mock("../../netlify/functions_active/security/session-manager.js", () => ({
  SecureSessionManager: {
    validateSessionFromHeader: validateSessionFromHeaderMock,
  },
}));

vi.mock(
  "../../netlify/functions_active/utils/enhanced-rate-limiter.ts",
  () => rateLimiterMock
);

vi.mock("../../netlify/functions_active/utils/error-handler.ts", () => ({
  createRateLimitErrorResponse: vi.fn((id: string) => ({
    statusCode: 429,
    headers: {},
    body: JSON.stringify({ error: "rate_limited", requestId: id }),
  })),
  generateRequestId: () => "test-request-id",
  logError: vi.fn(),
}));

vi.mock("../../netlify/functions_active/utils/security-headers.ts", () => ({
  errorResponse: (statusCode: number, message: string) => ({
    statusCode,
    headers: {},
    body: JSON.stringify({ error: message }),
  }),
  getSecurityHeaders: () => ({}),
  preflightResponse: () => ({ statusCode: 200, headers: {}, body: "" }),
}));

vi.mock("../../netlify/functions_active/supabase.js", () => ({
  getRequestClient: () => rlsClient,
  getServiceClient: () => serviceClient,
  supabase: rlsClient,
  supabaseKeyType: "service",
  isServiceRoleKey: () => true,
}));

describe("steward-policy handler", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    rpcState.rows = [];
    rpcState.error = null;
  });

  it("returns no approval required when no eligible pubkeys", async () => {
    rpcState.rows = [];
    const { handler } = await import(
      "../../netlify/functions_active/steward-policy.ts"
    );

    const res = await handler({
      httpMethod: "POST",
      headers: { authorization: "Bearer test", origin: "http://localhost" },
      body: JSON.stringify({ operation_type: "spend" }),
    } as any);

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.policy.requiresStewardApproval).toBe(false);
    expect(body.policy.eligibleApproverPubkeys).toHaveLength(0);
    expect(body.policy.stewardThreshold).toBe(0);
  });

  it("uses threshold 1 when exactly one eligible pubkey", async () => {
    rpcState.rows = [{ pubkey_hex: "a".repeat(64) }];
    const { handler } = await import(
      "../../netlify/functions_active/steward-policy.ts"
    );

    const res = await handler({
      httpMethod: "POST",
      headers: { authorization: "Bearer test", origin: "http://localhost" },
      body: JSON.stringify({ operation_type: "spend" }),
    } as any);

    const body = JSON.parse(res.body);
    expect(body.policy.requiresStewardApproval).toBe(true);
    expect(body.policy.eligibleApproverPubkeys).toHaveLength(1);
    expect(body.policy.stewardThreshold).toBe(1);
  });

  it("caps spend threshold at 2 when multiple eligible pubkeys", async () => {
    rpcState.rows = [
      { pubkey_hex: "b".repeat(64) },
      { pubkey_hex: "c".repeat(64) },
      { pubkey_hex: "d".repeat(64) },
    ];
    const { handler } = await import(
      "../../netlify/functions_active/steward-policy.ts"
    );

    const res = await handler({
      httpMethod: "POST",
      headers: { authorization: "Bearer test", origin: "http://localhost" },
      body: JSON.stringify({ operation_type: "spend" }),
    } as any);

    const body = JSON.parse(res.body);
    expect(body.policy.requiresStewardApproval).toBe(true);
    expect(body.policy.eligibleApproverPubkeys).toHaveLength(3);
    expect(body.policy.stewardThreshold).toBe(2);
  });

  it("returns 500 when RPC returns an error", async () => {
    rpcState.rows = null;
    rpcState.error = { message: "rpc failure" };
    const { handler } = await import(
      "../../netlify/functions_active/steward-policy.ts"
    );

    const res = await handler({
      httpMethod: "POST",
      headers: { authorization: "Bearer test", origin: "http://localhost" },
      body: JSON.stringify({ operation_type: "spend" }),
    } as any);

    expect(res.statusCode).toBe(500);
  });
});
