import { beforeEach, describe, expect, it, vi } from "vitest";

const authGetUserMock = vi.fn();
const rpcMock = vi.fn();
const adminSingleMock = vi.fn();

vi.mock("../../netlify/functions/supabase", () => ({
  getRequestClient: () => ({
    auth: { getUser: authGetUserMock },
    rpc: rpcMock,
  }),
  supabaseAdmin: {
    from: (table: string) => {
      if (table !== "agent_task_challenges") {
        throw new Error(`Unexpected table: ${table}`);
      }

      return {
        insert: () => ({
          select: () => ({ single: adminSingleMock }),
        }),
      };
    },
  },
}));

function makeEvent(body: Record<string, unknown>, auth = true) {
  return {
    httpMethod: "POST",
    headers: auth ? { authorization: "Bearer test-token" } : {},
    body: JSON.stringify(body),
  } as any;
}

describe("task-challenge-record", () => {
  beforeEach(() => {
    vi.resetModules();
    authGetUserMock.mockReset();
    rpcMock.mockReset();
    adminSingleMock.mockReset();
  });

  it("requires authorization", async () => {
    const { handler } =
      await import("../../netlify/functions/agents/task-challenge-record");
    const response = await handler(
      makeEvent(
        {
          task_id: "11111111-1111-4111-8111-111111111111",
          agent_id: "22222222-2222-4222-8222-222222222222",
          challenge: {
            challenge_reason: "AMBIGUOUS_SPEC",
            agent_concern: "Missing measurable criteria for the task.",
            confidence_in_challenge: 90,
          },
        },
        false,
      ),
    );

    expect(response.statusCode).toBe(401);
  });

  it("records a challenge for an authorized delegator-governor", async () => {
    authGetUserMock.mockResolvedValue({
      data: { user: { id: "99999999-9999-4999-8999-999999999999" } },
      error: null,
    });
    rpcMock.mockResolvedValue({ data: true, error: null });
    adminSingleMock.mockResolvedValue({
      data: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      error: null,
    });

    const { handler } =
      await import("../../netlify/functions/agents/task-challenge-record");
    const response = await handler(
      makeEvent({
        task_id: "11111111-1111-4111-8111-111111111111",
        agent_id: "22222222-2222-4222-8222-222222222222",
        challenge: {
          challenge_reason: "AMBIGUOUS_SPEC",
          agent_concern: "Missing measurable criteria for the task.",
          suggested_modification: "Add unit-test-based acceptance criteria.",
          confidence_in_challenge: 90,
        },
      }),
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      success: true,
      challenge_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
  });
});
