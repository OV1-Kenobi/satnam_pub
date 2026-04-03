import { beforeEach, describe, expect, it, vi } from "vitest";

const taskSingleMock = vi.fn();
const sessionEventsEqEventTypeMock = vi.fn();
const taskUpdateEqMock = vi.fn();
const challengeUpdateEqTaskProceededMock = vi.fn();
const challengeUpdateEqTaskIdMock = vi.fn(() => ({
  eq: challengeUpdateEqTaskProceededMock,
}));
const taskUpdateMock = vi.fn(() => ({ eq: taskUpdateEqMock }));
const challengeUpdateMock = vi.fn(() => ({ eq: challengeUpdateEqTaskIdMock }));

vi.mock("../../netlify/functions_active/supabase", () => ({
  getRequestClient: () => ({
    from: (table: string) => {
      if (table === "agent_task_records") {
        return {
          select: () => ({
            eq: () => ({ single: taskSingleMock }),
          }),
          update: taskUpdateMock,
        };
      }

      if (table === "agent_session_events") {
        return {
          select: () => ({
            eq: () => ({
              eq: sessionEventsEqEventTypeMock,
            }),
          }),
        };
      }

      if (table === "agent_profiles") {
        return {
          update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        };
      }

      if (table === "agent_task_challenges") {
        return {
          update: challengeUpdateMock,
        };
      }

      if (table === "sig4sats_locks" || table === "agent_payment_receipts") {
        return {
          update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

function makeEvent(body: Record<string, unknown>) {
  return {
    httpMethod: "POST",
    headers: {},
    body: JSON.stringify(body),
  } as never;
}

describe("task-complete", () => {
  beforeEach(() => {
    vi.resetModules();
    taskSingleMock.mockReset();
    sessionEventsEqEventTypeMock.mockReset();
    taskUpdateMock.mockClear();
    taskUpdateEqMock.mockReset();
    challengeUpdateMock.mockClear();
    challengeUpdateEqTaskIdMock.mockClear();
    challengeUpdateEqTaskProceededMock.mockReset();

    taskSingleMock.mockResolvedValue({
      data: {
        id: "11111111-1111-4111-8111-111111111111",
        agent_id: "22222222-2222-4222-8222-222222222222",
        task_event_id: "task-event-123",
        task_type: "compute",
        requester_npub: "npub1requester",
        session_id: "sess-123",
        sig4sats_bond: null,
        agent: {
          npub: "npub1agent",
          agent_profiles: [{ reputation_score: 12, total_tasks_completed: 2 }],
        },
      },
      error: null,
    });

    sessionEventsEqEventTypeMock.mockResolvedValue({ data: [], error: null });
    taskUpdateEqMock.mockResolvedValue({ error: null });
    challengeUpdateEqTaskProceededMock.mockResolvedValue({ error: null });
  });

  it("records successful final_task_outcome from the NIP-90 close feedback event", async () => {
    const { handler } = await import("../../netlify/functions/agents/task-complete");

    const response = await handler(
      makeEvent({
        task_id: "11111111-1111-4111-8111-111111111111",
        actual_duration_seconds: 120,
        actual_cost_sats: 5000,
        completion_proof: "Completed with passing checks",
        validation_tier: "self_report",
      }),
    );

    expect(response.statusCode).toBe(200);
    expect(taskUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "completed",
        completion_event_id: expect.stringContaining("mock-event-"),
        reputation_delta: 5,
      }),
    );
    expect(challengeUpdateMock).toHaveBeenCalledWith({
      final_task_outcome: "SUCCESS",
    });
    expect(challengeUpdateEqTaskIdMock).toHaveBeenCalledWith(
      "task_id",
      "11111111-1111-4111-8111-111111111111",
    );
    expect(challengeUpdateEqTaskProceededMock).toHaveBeenCalledWith(
      "task_proceeded",
      true,
    );
    expect(JSON.parse(response.body)).toMatchObject({
      completion_event_id: expect.stringContaining("mock-event-"),
    });
  });
});