import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockValidateSession = vi.fn();
const mockCheckRateLimitStatus = vi.fn();
const mockGetBtcUsdSpot = vi.fn();
const mockRateLimits = { LLM_PROXY: { limit: 999, windowMs: 1234 } } as const;
const rpcMock = vi.fn(async () => ({ data: null, error: null }));
const updateCredentialMock = vi.fn();

type PricingRow = {
  input_msats_per_token: number;
  output_msats_per_token: number;
};
let pricingRow: PricingRow | null = {
  input_msats_per_token: 2,
  output_msats_per_token: 3,
};

// Mocks (must be defined before importing the handler)
vi.mock("../../netlify/functions/security/session-manager.js", () => ({
  SecureSessionManager: { validateSession: mockValidateSession },
}));
vi.mock(
  "../../netlify/functions_active/utils/enhanced-rate-limiter.js",
  () => ({
    RATE_LIMITS: mockRateLimits,
    getClientIP: () => "1.2.3.4",
    createRateLimitIdentifier: (id?: string) => `user:${id ?? "unknown"}`,
    checkRateLimitStatus: mockCheckRateLimitStatus,
  }),
);
vi.mock("../../netlify/functions/utils/btc-usd-pricing.js", () => ({
  getBtcUsdSpot: mockGetBtcUsdSpot,
}));
vi.mock("../../utils/session-logger.js", () => ({
  logSessionEvent: () => undefined,
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === "user_identities")
        return {
          select: () => ({
            eq: (_k: string, id: string) => ({
              single: async () => ({
                data: { id, role: "adult" },
                error: null,
              }),
            }),
          }),
        };
      if (table === "llm_model_pricing")
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  single: async () => ({
                    data: pricingRow,
                    error: pricingRow ? null : { message: "missing" },
                  }),
                }),
              }),
            }),
          }),
        };
      if (table === "agent_llm_credentials")
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  single: async () => ({
                    data: {
                      encrypted_api_key: "AA==",
                      iv: "AA==",
                      salt: "salt",
                      is_active: true,
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
          update: updateCredentialMock,
        };
      throw new Error(`Unexpected table: ${table}`);
    },
    rpc: rpcMock,
  }),
}));

function makeEvent(body: unknown) {
  return {
    httpMethod: "POST",
    headers: {
      origin: "https://satnam.pub",
      authorization: "Bearer test-token",
    },
    body: JSON.stringify(body),
  } as any;
}

beforeEach(() => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-key";

  // Phase 5: feature flags (fail-closed by default)
  // Enable proxy + pricing for the baseline tests unless a test overrides.
  process.env.VITE_AGENT_LLM_PROXY_ENABLED = "true";
  process.env.VITE_AGENT_BTC_PRICING_ENABLED = "true";

  rpcMock.mockClear();
  mockGetBtcUsdSpot.mockReset();
  updateCredentialMock.mockReset();

  mockValidateSession.mockResolvedValue({
    userId: "agent-123",
    hashedId: "pw",
  });
  mockCheckRateLimitStatus.mockResolvedValue({ allowed: true, remaining: 1 });
  pricingRow = { input_msats_per_token: 2, output_msats_per_token: 3 };

  // Deterministic BTC/USD snapshot: 1 sat => 1 USD => 100 cents
  mockGetBtcUsdSpot.mockResolvedValue({
    priceUsd: 100_000_000,
    sourceCount: 2,
    usedCache: false,
    stale: false,
    timestamp: new Date().toISOString(),
    aggregationMethod: "median",
  });

  // Mock credential "last used" update chain
  updateCredentialMock.mockReturnValue({
    eq: () => ({ eq: async () => ({ data: null, error: null }) }),
  });

  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, "crypto", { value: webcrypto });
  }
  const apiKey = "sk-" + "a".repeat(48);
  vi.spyOn(globalThis.crypto.subtle, "importKey").mockResolvedValue(
    {} as CryptoKey,
  );
  vi.spyOn(globalThis.crypto.subtle, "deriveKey").mockResolvedValue(
    {} as CryptoKey,
  );
  vi.spyOn(globalThis.crypto.subtle, "decrypt").mockResolvedValue(
    new TextEncoder().encode(apiKey).buffer,
  );

  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      id: "chatcmpl-1",
      created: 123,
      model: "gpt-4",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "ok" },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }),
  } as any);
});

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("agent-llm-proxy", () => {
  it("returns 403 when the agent LLM proxy feature flag is disabled", async () => {
    process.env.VITE_AGENT_LLM_PROXY_ENABLED = "false";

    const { handler } =
      await import("../../netlify/functions/agent-llm-proxy.ts");
    const res = await (handler as any)(
      makeEvent({
        agent_id: "agent-123",
        session_id: "sess-1",
        provider: "openai",
        model: "gpt-4",
        messages: [{ role: "user", content: "hi" }],
      }),
      {} as any,
    );

    expect(res.statusCode).toBe(403);
    expect(String(res.body)).toContain("disabled");

    // Should fail closed without calling providers or logging
    expect(global.fetch).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
    expect(updateCredentialMock).not.toHaveBeenCalled();
  });

  it("returns 400 when pricing is not configured for provider/model", async () => {
    pricingRow = null;

    const { handler } =
      await import("../../netlify/functions/agent-llm-proxy.ts");
    const res = await (handler as any)(
      makeEvent({
        agent_id: "agent-123",
        session_id: "sess-1",
        provider: "openai",
        model: "gpt-4",
        messages: [{ role: "user", content: "hi" }],
      }),
      {} as any,
    );

    expect(res.statusCode).toBe(400);
    expect(String(res.body)).toContain("Pricing not configured");
  });

  it("logs token usage + cost, and omits user identifiers from outbound OpenAI payload", async () => {
    const { handler } =
      await import("../../netlify/functions/agent-llm-proxy.ts");
    const res = await (handler as any)(
      makeEvent({
        agent_id: "agent-123",
        session_id: "sess-1",
        provider: "openai",
        model: "gpt-4",
        messages: [{ role: "user", content: "hi" }],
      }),
      {} as any,
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body.success).toBe(true);

    // Provider response propagation
    expect(body.content).toBe("ok");
    expect(body.inputTokens).toBe(10);
    expect(body.outputTokens).toBe(5);
    expect(body.totalTokens).toBe(15);

    // 10*2 + 5*3 = 35 msats => ceil => 1 sat
    expect(body.costSats).toBe(1);
    expect(body.costUsdCents).toBe(100);

    expect(mockCheckRateLimitStatus).toHaveBeenCalledWith(
      expect.any(String),
      mockRateLimits.LLM_PROXY,
    );

    // Outbound request should NOT include privacy-identifying "user" field
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const fetchArgs = (
      global.fetch as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls[0];
    const fetchOptions = fetchArgs[1] as { body?: string };
    const outboundBody = JSON.parse(fetchOptions.body ?? "{}");

    // Outbound payload must ONLY contain OpenAI request fields (no identifying extras)
    const allowedTopLevelKeys = new Set<string>([
      "model",
      "messages",
      "temperature",
      "max_tokens",
      "top_p",
      "frequency_penalty",
      "presence_penalty",
      "stop",
    ]);
    for (const key of Object.keys(outboundBody)) {
      expect(allowedTopLevelKeys.has(key)).toBe(true);
    }

    // Explicitly assert common identifying fields are absent
    expect(outboundBody.user).toBeUndefined();
    expect(outboundBody.agent_id).toBeUndefined();
    expect(outboundBody.session_id).toBeUndefined();

    // Messages must also not carry unexpected identifying fields
    expect(Array.isArray(outboundBody.messages)).toBe(true);
    const allowedMessageKeys = new Set<string>([
      "role",
      "content",
      "name",
      "function_call",
    ]);
    for (const msg of outboundBody.messages as unknown[]) {
      expect(msg && typeof msg === "object").toBe(true);
      for (const k of Object.keys(msg as Record<string, unknown>)) {
        expect(allowedMessageKeys.has(k)).toBe(true);
      }
    }

    // Token/cost logging (Supabase RPC)
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock.mock.calls[0][0]).toBe("log_session_event");
    const rpcArgs = rpcMock.mock.calls[0][1] as any;
    expect(rpcArgs.p_tokens_used).toBe(15);
    expect(rpcArgs.p_input_tokens).toBe(10);
    expect(rpcArgs.p_output_tokens).toBe(5);
    expect(rpcArgs.p_sats_cost).toBe(1);
    expect(rpcArgs.p_event_data.cost_msats).toBe("35");
    expect(rpcArgs.p_event_data.input_msats_per_token).toBe(2);
    expect(rpcArgs.p_event_data.output_msats_per_token).toBe(3);
    expect(rpcArgs.p_event_data.cost_usd_cents).toBe(100);

    // Credential usage tracking
    expect(updateCredentialMock).toHaveBeenCalledTimes(1);
  });

  it("still succeeds when BTC/USD pricing fails, logs sats cost, and marks pricing unavailable", async () => {
    mockGetBtcUsdSpot.mockRejectedValueOnce(new Error("btc price unavailable"));

    const { handler } =
      await import("../../netlify/functions/agent-llm-proxy.ts");
    const res = await (handler as any)(
      makeEvent({
        agent_id: "agent-123",
        session_id: "sess-1",
        provider: "openai",
        model: "gpt-4",
        messages: [{ role: "user", content: "hi" }],
      }),
      {} as any,
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body.success).toBe(true);

    // Sats cost still computed from DB pricing
    expect(body.costSats).toBe(1);

    // USD conversion unavailable => default 0 (per implementation)
    expect(body.costUsdCents).toBe(0);

    expect(rpcMock).toHaveBeenCalledTimes(1);
    const rpcArgs = rpcMock.mock.calls[0][1] as any;
    expect(rpcArgs.p_sats_cost).toBe(1);
    expect(rpcArgs.p_event_data.cost_msats).toBe("35");
    expect(rpcArgs.p_event_data.cost_usd_cents).toBe(0);
    expect(rpcArgs.p_event_data.pricing_unavailable).toBe(true);
  });

  it("still succeeds when BTC/USD pricing is disabled, does not call pricing utility, and marks pricing disabled", async () => {
    process.env.VITE_AGENT_BTC_PRICING_ENABLED = "false";

    const { handler } =
      await import("../../netlify/functions/agent-llm-proxy.ts");
    const res = await (handler as any)(
      makeEvent({
        agent_id: "agent-123",
        session_id: "sess-1",
        provider: "openai",
        model: "gpt-4",
        messages: [{ role: "user", content: "hi" }],
      }),
      {} as any,
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body.success).toBe(true);

    expect(body.costSats).toBe(1);
    expect(body.costUsdCents).toBe(0);

    expect(mockGetBtcUsdSpot).not.toHaveBeenCalled();

    expect(rpcMock).toHaveBeenCalledTimes(1);
    const rpcArgs = rpcMock.mock.calls[0][1] as any;
    expect(rpcArgs.p_event_data.cost_usd_cents).toBe(0);
    expect(rpcArgs.p_event_data.pricing_disabled).toBe(true);
    expect(rpcArgs.p_event_data.pricing_unavailable).toBeUndefined();
  });
});
