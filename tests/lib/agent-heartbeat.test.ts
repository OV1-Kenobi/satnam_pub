import { describe, expect, it, vi } from "vitest";

import { AgentHeartbeatService, type HeartbeatData } from "../../src/lib/agent-sdk/heartbeat";

type RpcArgs = Record<string, unknown>;

function makeQueryBuilder(rows: unknown[]) {
  const state = {
    table: "",
    selection: "",
    eqCalls: [] as Array<{ column: string; value: unknown }>,
    inCalls: [] as Array<{ column: string; values: unknown[] }>,
    limitValue: 0,
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
      return builder;
    },
    async limit(limitValue: number) {
      state.limitValue = limitValue;
      return {
        data: rows,
        error: null,
      };
    },
  };

  return { builder, state };
}

function makeHeartbeatData(overrides: Partial<HeartbeatData> = {}): HeartbeatData {
  return {
    loadPercent: 25,
    activeTasks: 1,
    availableBudget: 5000,
    acceptsTasks: true,
    contextUsedPercent: 40,
    ...overrides,
  };
}

describe("AgentHeartbeatService adaptive delegation integration", () => {
  it("runs adaptive monitoring for active tasks with delegation strategies", async () => {
    const rpcMock = vi.fn<
      (name: string, args: RpcArgs) => Promise<{ data: unknown; error: null }>
    >().mockResolvedValue({ data: { ok: true }, error: null });
    const coordinator = { monitorAndAdapt: vi.fn().mockResolvedValue(undefined) };
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const { builder, state } = makeQueryBuilder([
      {
        id: "strategy-1",
        task_id: "task-1",
        primary_agent_id: "agent-1",
        delegator_id: "delegator-1",
        fallback_agents: [{ agent_id: "agent-2", priority: 1 }],
        max_latency_seconds: 300,
        max_cost_overrun_percent: 50,
        min_progress_check_failures: 3,
        max_quality_score_drop: 20,
        escalation_path: "NEXT_FALLBACK",
        current_agent_id: "agent-1",
        switch_count: 0,
        last_health_check_at: null,
        agent_task_records: {
          id: "task-1",
          status: "in_progress",
          assignee_agent_id: "agent-1",
        },
      },
    ]);
    const supabaseClient = {
      rpc: rpcMock,
      from: vi.fn().mockImplementation((table: string) => {
        state.table = table;
        return builder;
      }),
    };
    const service = new AgentHeartbeatService("agent-1", {
      supabaseClient: supabaseClient as never,
      coordinator,
      logger,
    });

    await service.sendHeartbeat(() => makeHeartbeatData());

    expect(rpcMock).toHaveBeenCalledWith("agent_heartbeat", {
      p_agent_id: "agent-1",
      p_load_percent: 25,
      p_active_tasks: 1,
      p_available_budget: 5000,
      p_accepts_tasks: true,
      p_context_used_percent: 40,
    });
    expect(state.table).toBe("agent_delegation_strategies");
    expect(state.eqCalls).toEqual(
      expect.arrayContaining([
        { column: "current_agent_id", value: "agent-1" },
        { column: "agent_task_records.assignee_agent_id", value: "agent-1" },
      ]),
    );
    expect(state.inCalls[0]).toEqual({
      column: "agent_task_records.status",
      values: ["assigned", "in_progress"],
    });
    expect(state.limitValue).toBe(1);
    expect(coordinator.monitorAndAdapt).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        id: "strategy-1",
        task_id: "task-1",
        current_agent_id: "agent-1",
        auto_switch_triggers: expect.objectContaining({
          max_latency_seconds: 300,
        }),
      }),
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("skips adaptive monitoring when no active tasks are reported", async () => {
    const rpcMock = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });
    const coordinator = { monitorAndAdapt: vi.fn().mockResolvedValue(undefined) };
    const supabaseClient = {
      rpc: rpcMock,
      from: vi.fn(),
    };
    const service = new AgentHeartbeatService("agent-1", {
      supabaseClient: supabaseClient as never,
      coordinator,
      logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });

    await service.sendHeartbeat(() => makeHeartbeatData({ activeTasks: 0 }));

    expect(supabaseClient.from).not.toHaveBeenCalled();
    expect(coordinator.monitorAndAdapt).not.toHaveBeenCalled();
  });

  it("logs adaptive-monitoring failures without failing the heartbeat", async () => {
    const rpcMock = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const coordinator = {
      monitorAndAdapt: vi.fn().mockRejectedValue(new Error("monitoring blew up")),
    };
    const { builder } = makeQueryBuilder([
      {
        id: "strategy-1",
        task_id: "task-1",
        primary_agent_id: "agent-1",
        delegator_id: "delegator-1",
        fallback_agents: [],
        max_latency_seconds: 300,
        max_cost_overrun_percent: 50,
        min_progress_check_failures: 3,
        max_quality_score_drop: 20,
        escalation_path: "NEXT_FALLBACK",
        current_agent_id: "agent-1",
        switch_count: 0,
        last_health_check_at: null,
        agent_task_records: {
          id: "task-1",
          status: "assigned",
          assignee_agent_id: "agent-1",
        },
      },
    ]);
    const supabaseClient = {
      rpc: rpcMock,
      from: vi.fn().mockReturnValue(builder),
    };
    const service = new AgentHeartbeatService("agent-1", {
      supabaseClient: supabaseClient as never,
      coordinator,
      logger,
    });

    await expect(
      service.sendHeartbeat(() => makeHeartbeatData({ activeTasks: 1 })),
    ).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      "Adaptive delegation monitoring failed for task:",
      "task-1",
      expect.any(Error),
    );
  });
});