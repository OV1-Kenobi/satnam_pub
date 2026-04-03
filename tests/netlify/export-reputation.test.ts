import { beforeEach, describe, expect, it, vi } from "vitest";

const authGetUserMock = vi.fn();
const rpcMock = vi.fn();
const userIdentitySingleMock = vi.fn();
const agentSessionMaybeSingleMock = vi.fn();
const eventsLimitMock = vi.fn();

vi.mock("../../netlify/functions_active/supabase", () => ({
  getRequestClient: () => ({
    auth: { getUser: authGetUserMock },
    rpc: rpcMock,
    from: (table: string) => {
      if (table === "user_identities") {
        return {
          select: () => ({
            eq: () => ({ single: userIdentitySingleMock }),
          }),
        };
      }

      if (table === "agent_sessions") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: agentSessionMaybeSingleMock }),
            }),
          }),
        };
      }

      if (table === "agent_reputation_events") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({ limit: eventsLimitMock }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

function makeEvent(body: Record<string, unknown>, auth = true) {
  return {
    httpMethod: "POST",
    headers: auth ? { authorization: "Bearer test-token" } : {},
    body: JSON.stringify(body),
  } as any;
}

describe("export-reputation", () => {
  beforeEach(() => {
    vi.resetModules();
    authGetUserMock.mockReset();
    rpcMock.mockReset();
    userIdentitySingleMock.mockReset();
    agentSessionMaybeSingleMock.mockReset();
    eventsLimitMock.mockReset();
    eventsLimitMock.mockResolvedValue({ data: [], error: null });
  });

  it("requires session_id when the authenticated caller is an agent", async () => {
    authGetUserMock.mockResolvedValue({
      data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
      error: null,
    });
    userIdentitySingleMock
      .mockResolvedValueOnce({
        data: { id: "11111111-1111-4111-8111-111111111111", is_agent: true },
        error: null,
      });
    rpcMock.mockResolvedValueOnce({ data: true, error: null });

    const { handler } = await import("../../netlify/functions/agents/export-reputation");
    const response = await handler(
      makeEvent({ agent_id: "11111111-1111-4111-8111-111111111111" }),
    );

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({
      error: "session_id is required for agent exports",
    });
  });

  it("allows a governing human caller to export without agent session context", async () => {
    authGetUserMock.mockResolvedValue({
      data: { user: { id: "22222222-2222-4222-8222-222222222222" } },
      error: null,
    });
    userIdentitySingleMock
      .mockResolvedValueOnce({
        data: { id: "22222222-2222-4222-8222-222222222222", is_agent: false },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: "33333333-3333-4333-8333-333333333333",
          npub: "npub1agent",
          is_agent: true,
        },
        error: null,
      });
    rpcMock
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: 42, error: null });

    const { handler } = await import("../../netlify/functions/agents/export-reputation");
    const response = await handler(
      makeEvent({ agent_id: "33333333-3333-4333-8333-333333333333" }),
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      agent_id: "33333333-3333-4333-8333-333333333333",
      aggregated_score: 42,
    });
  });

  it("allows an agent export when a live session context is provided", async () => {
    authGetUserMock.mockResolvedValue({
      data: { user: { id: "44444444-4444-4444-8444-444444444444" } },
      error: null,
    });
    userIdentitySingleMock
      .mockResolvedValueOnce({
        data: { id: "44444444-4444-4444-8444-444444444444", is_agent: true },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: "44444444-4444-4444-8444-444444444444",
          npub: "npub1selfagent",
          is_agent: true,
        },
        error: null,
      });
    rpcMock
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: 7, error: null });
    agentSessionMaybeSingleMock.mockResolvedValue({
      data: {
        session_id: "sess_abcdef123456",
        agent_id: "44444444-4444-4444-8444-444444444444",
        status: "ACTIVE",
        expires_at: "2099-01-01T00:00:00.000Z",
        family_federation_id: "55555555-5555-4555-8555-555555555555",
      },
      error: null,
    });

    const { handler } = await import("../../netlify/functions/agents/export-reputation");
    const response = await handler(
      makeEvent({
        agent_id: "44444444-4444-4444-8444-444444444444",
        session_id: "sess_abcdef123456",
      }),
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      agent_id: "44444444-4444-4444-8444-444444444444",
      aggregated_score: 7,
    });
  });
});