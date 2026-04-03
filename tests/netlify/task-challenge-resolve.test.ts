import { beforeEach, describe, expect, it, vi } from "vitest";

const authGetUserMock = vi.fn();
const updateEqDelegatorMock = vi.fn();
const updateEqIdMock = vi.fn(() => ({ eq: updateEqDelegatorMock }));
const updateMock = vi.fn(() => ({ eq: updateEqIdMock }));

vi.mock("../../netlify/functions/supabase", () => ({
  getRequestClient: () => ({
    auth: { getUser: authGetUserMock },
    from: (table: string) => {
      if (table !== "agent_task_challenges") {
        throw new Error(`Unexpected table: ${table}`);
      }

      return {
        update: updateMock,
      };
    },
  }),
}));

function makeEvent(body: Record<string, unknown>) {
  return {
    httpMethod: "POST",
    headers: { authorization: "Bearer test-token" },
    body: JSON.stringify(body),
  } as any;
}

describe("task-challenge-resolve", () => {
  beforeEach(() => {
    vi.resetModules();
    authGetUserMock.mockReset();
    updateMock.mockReset();
    updateEqIdMock.mockClear();
    updateEqDelegatorMock.mockReset();
    updateEqDelegatorMock.mockResolvedValue({ error: null });
  });

  it("rejects short override explanations", async () => {
    const { handler } =
      await import("../../netlify/functions/agents/task-challenge-resolve");
    const response = await handler(
      makeEvent({
        challenge_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        resolution: "OVERRIDE_WITH_EXPLANATION",
        challenge_accepted: false,
        task_proceeded: true,
        delegator_explanation: "too short",
      }),
    );

    expect(response.statusCode).toBe(400);
  });

  it("updates the delegator-owned challenge resolution", async () => {
    authGetUserMock.mockResolvedValue({
      data: { user: { id: "99999999-9999-4999-8999-999999999999" } },
      error: null,
    });

    const { handler } =
      await import("../../netlify/functions/agents/task-challenge-resolve");
    const response = await handler(
      makeEvent({
        challenge_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        resolution: "REVISED",
        challenge_accepted: true,
        task_proceeded: false,
        revised_task_spec: {
          success_criteria: ["Passes unit tests"],
        },
      }),
    );

    expect(response.statusCode).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        resolution: "REVISED",
        challenge_accepted: true,
        task_proceeded: false,
      }),
    );
    expect(updateEqIdMock).toHaveBeenCalledWith(
      "id",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    expect(updateEqDelegatorMock).toHaveBeenCalledWith(
      "delegator_id",
      "99999999-9999-4999-8999-999999999999",
    );
  });
});
