import { beforeEach, describe, expect, it, vi } from "vitest";

const mockValidateSession = vi.fn();
const mockCheckRateLimitStatus = vi.fn();
const rpcMock = vi.fn();

vi.mock("../../netlify/functions_active/security/session-manager.js", () => ({
  SecureSessionManager: { validateSession: mockValidateSession },
}));

vi.mock(
  "../../netlify/functions_active/utils/enhanced-rate-limiter.js",
  () => ({
    RATE_LIMITS: { SESSION_CREATE: { limit: 10, windowMs: 60_000 } },
    getClientIP: () => "127.0.0.1",
    createRateLimitIdentifier: () => "session-create:test",
    checkRateLimitStatus: mockCheckRateLimitStatus,
  }),
);

vi.mock("../../netlify/functions_active/supabase.js", () => ({
  getRequestClient: () => ({ rpc: rpcMock }),
}));

vi.mock("../../utils/session-logger.js", () => ({
  logRpcCall: async (_name: string, fn: () => Promise<unknown>) => await fn(),
  logSessionCreate: () => undefined,
}));

function makeEvent(body: Record<string, unknown>) {
  return {
    httpMethod: "POST",
    headers: {
      origin: "https://www.satnam.pub",
      authorization: "Bearer test-token",
    },
    body: JSON.stringify(body),
  } as any;
}

describe("agent-session-create", () => {
  beforeEach(() => {
    vi.resetModules();
    rpcMock.mockReset();
    mockValidateSession.mockResolvedValue({ userId: "11111111-1111-4111-8111-111111111111" });
    mockCheckRateLimitStatus.mockResolvedValue({ allowed: true, remaining: 9 });
  });

  it("passes created_by_user_id through as the effective creator", async () => {
    rpcMock.mockResolvedValue({
      data: {
        session_id: "sess_test",
        agent_id: "22222222-2222-4222-8222-222222222222",
        session_type: "INTERACTIVE",
      },
      error: null,
    });

    const { handler } = await import("../../netlify/functions_active/agent-session-create.ts");
    const response = await handler(
      makeEvent({
        agent_id: "22222222-2222-4222-8222-222222222222",
        session_type: "INTERACTIVE",
        created_by_user_id: "11111111-1111-4111-8111-111111111111",
      }),
      {} as any,
    );

    expect(response.statusCode).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith("create_agent_session", {
      p_agent_id: "22222222-2222-4222-8222-222222222222",
      p_session_type: "INTERACTIVE",
      p_primary_channel: "nostr",
      p_created_by_user_id: "11111111-1111-4111-8111-111111111111",
      p_human_creator_id: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("rejects a mismatched created_by_user_id", async () => {
    const { handler } = await import("../../netlify/functions_active/agent-session-create.ts");
    const response = await handler(
      makeEvent({
        agent_id: "22222222-2222-4222-8222-222222222222",
        session_type: "INTERACTIVE",
        created_by_user_id: "33333333-3333-4333-8333-333333333333",
      }),
      {} as any,
    );

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body)).toMatchObject({
      error: "created_by_user_id must match the authenticated user",
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });
});