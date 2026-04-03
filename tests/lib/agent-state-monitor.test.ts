import { describe, expect, it, vi } from "vitest";

import { AgentStateMonitor } from "../../src/lib/agents/agent-state-monitor";

function makeStateRow(overrides: Record<string, unknown> = {}) {
  return {
    agent_id: "agent-1",
    current_compute_load_percent: 20,
    active_task_count: 1,
    max_concurrent_tasks: 4,
    available_budget_sats: 800,
    reserved_budget_sats: 200,
    total_budget_sats: 1000,
    context_window_used_percent: 25,
    context_window_size_tokens: 128000,
    context_window_used_tokens: 32000,
    accepts_new_tasks: true,
    availability_reason: null,
    estimated_response_time_seconds: 30,
    last_heartbeat: "2026-03-08T10:14:30.000Z",
    heartbeat_interval_seconds: 60,
    current_session_id: null,
    ...overrides,
  };
}

function makeQueryBuilder(result: unknown) {
  const state = {
    table: "",
    selection: "",
    eqCalls: [] as Array<{ column: string; value: unknown }>,
    inCalls: [] as Array<{ column: string; values: unknown[] }>,
    gteCalls: [] as Array<{ column: string; value: unknown }>,
    orderCalls: [] as Array<{
      column: string;
      options?: Record<string, unknown>;
    }>,
  };

  const builder = {
    select(selection: string) {
      state.selection = selection;
      return builder;
    },
    eq(column: string, value: unknown) {
      state.eqCalls.push({ column, value });
      return builder;
    },
    in(column: string, values: unknown[]) {
      state.inCalls.push({ column, values });
      return Promise.resolve({ data: result, error: null });
    },
    gte(column: string, value: unknown) {
      state.gteCalls.push({ column, value });
      return builder;
    },
    order(column: string, options?: Record<string, unknown>) {
      state.orderCalls.push({ column, options });
      return Promise.resolve({ data: result, error: null });
    },
    maybeSingle() {
      return Promise.resolve({ data: result, error: null });
    },
  };

  return { builder, state };
}

describe("AgentStateMonitor", () => {
  it("sends enriched heartbeat payloads through the existing agent_heartbeat RPC", async () => {
    const rpcMock = vi
      .fn()
      .mockResolvedValue({ data: { ok: true }, error: null });
    const monitor = new AgentStateMonitor({ rpc: rpcMock } as never);

    await monitor.sendHeartbeat("agent-1", {
      compute_load_percent: 33,
      active_task_count: 2,
      available_budget_sats: 700,
      context_window_used_tokens: 64000,
      reserved_budget_sats: 300,
      total_budget_sats: 1000,
      accepts_tasks: true,
      current_session_id: "sess-1",
      token_balances: { sats: 1000 },
      heartbeat_interval_seconds: 45,
    });

    expect(rpcMock).toHaveBeenCalledWith("agent_heartbeat", {
      p_agent_id: "agent-1",
      p_load_percent: 33,
      p_active_tasks: 2,
      p_available_budget: 700,
      p_context_used_tokens: 64000,
      p_reserved_budget: 300,
      p_total_budget: 1000,
      p_accepts_tasks: true,
      p_current_session_id: "sess-1",
      p_token_balances: { sats: 1000 },
      p_heartbeat_interval_seconds: 45,
    });
  });

  it("calculates availability status from task, compute, context, and budget capacity", async () => {
    const { builder } = makeQueryBuilder([
      makeStateRow(),
      makeStateRow({
        agent_id: "agent-2",
        available_budget_sats: 50,
        total_budget_sats: 1000,
        context_window_used_percent: 85,
      }),
      makeStateRow({
        agent_id: "agent-3",
        accepts_new_tasks: false,
        availability_reason: "MAX_TASKS_REACHED",
      }),
      makeStateRow({
        agent_id: "agent-4",
        last_heartbeat: "2026-03-08T10:00:00.000Z",
      }),
    ]);
    const monitor = new AgentStateMonitor(
      {
        from: vi.fn().mockReturnValue(builder),
      } as never,
      () => new Date("2026-03-08T10:15:00.000Z"),
    );

    const result = await monitor.getAgentAvailability([
      "agent-1",
      "agent-2",
      "agent-3",
      "agent-4",
    ]);

    expect(result).toEqual([
      expect.objectContaining({ agent_id: "agent-1", status: "AVAILABLE" }),
      expect.objectContaining({
        agent_id: "agent-2",
        status: "LIMITED_CAPACITY",
      }),
      expect.objectContaining({
        agent_id: "agent-3",
        status: "UNAVAILABLE",
        reason: "MAX_TASKS_REACHED",
      }),
      expect.objectContaining({ agent_id: "agent-4", status: "OFFLINE" }),
    ]);
  });

  it("returns only online, task-accepting agents created by the delegator", async () => {
    const { builder, state } = makeQueryBuilder([
      makeStateRow(),
      makeStateRow({ agent_id: "agent-2", current_session_id: "sess-2" }),
    ]);
    const client = {
      from: vi.fn().mockImplementation((table: string) => {
        state.table = table;
        return builder;
      }),
    };
    const monitor = new AgentStateMonitor(
      client as never,
      () => new Date("2026-03-08T10:15:00.000Z"),
    );

    const result = await monitor.getAvailableAgents("delegator-1");

    expect(state.table).toBe("agent_operational_state");
    expect(state.eqCalls).toEqual(
      expect.arrayContaining([
        { column: "agent_profiles.created_by_user_id", value: "delegator-1" },
        { column: "accepts_new_tasks", value: true },
      ]),
    );
    expect(state.gteCalls[0]?.column).toBe("last_heartbeat");
    expect(state.orderCalls[0]).toEqual({
      column: "estimated_response_time_seconds",
      options: { ascending: true },
    });
    expect(result).toHaveLength(2);
    expect(result[1]?.current_session_id).toBe("sess-2");
    expect(result.every((agent) => agent.is_online)).toBe(true);
  });
});
