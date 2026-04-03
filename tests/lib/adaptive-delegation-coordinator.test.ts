import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AdaptiveDelegationCoordinator,
  type AdaptiveDelegationHooks,
  type AdaptiveDelegationRepository,
  type AdaptiveTaskRecord,
  type AgentOperationalStateRecord,
  type DelegationStrategy,
  type SessionEventRecord,
} from "../../src/lib/agents/adaptive-delegation-coordinator";

const baseTask: AdaptiveTaskRecord = {
  id: "task-1",
  assignee_agent_id: "agent-primary",
  creator_user_id: "delegator-1",
  status: "in_progress",
  created_at: "2026-03-08T10:00:00.000Z",
  started_at: "2026-03-08T10:05:00.000Z",
  updated_at: "2026-03-08T10:10:00.000Z",
  session_id: "sess-1",
  estimated_cost_sats: 100,
  actual_cost_sats: 100,
  quality_score: 95,
  task_output_summary: "draft output",
  completion_proof: null,
};

const availableState: AgentOperationalStateRecord = {
  agent_id: "agent-primary",
  current_compute_load_percent: 25,
  active_task_count: 1,
  max_concurrent_tasks: 4,
  accepts_new_tasks: true,
  estimated_response_time_seconds: 30,
  last_heartbeat: "2026-03-08T10:14:30.000Z",
};

function makeStrategy(
  overrides: Partial<DelegationStrategy> = {},
): DelegationStrategy {
  return {
    id: "strategy-1",
    task_id: "task-1",
    primary_agent_id: "agent-primary",
    delegator_id: "delegator-1",
    fallback_agents: [
      { agent_id: "agent-fallback-1", priority: 1 },
      { agent_id: "agent-fallback-2", priority: 2 },
    ],
    auto_switch_triggers: {
      max_latency_seconds: 300,
      max_cost_overrun_percent: 50,
      min_progress_check_failures: 3,
      max_quality_score_drop: 20,
    },
    escalation_path: "NEXT_FALLBACK",
    current_agent_id: "agent-primary",
    switch_count: 0,
    ...overrides,
  };
}

function makeRepository(
  overrides: Partial<AdaptiveDelegationRepository> = {},
): AdaptiveDelegationRepository {
  return {
    getTask: vi.fn().mockResolvedValue(baseTask),
    getOperationalState: vi
      .fn()
      .mockImplementation(async (agentId: string) => ({
        ...availableState,
        agent_id: agentId,
      })),
    getRecentSessionEvents: vi
      .fn()
      .mockResolvedValue([] as SessionEventRecord[]),
    recordTaskTransfer: vi.fn().mockResolvedValue("transfer-1"),
    markTransferFailed: vi.fn().mockResolvedValue(undefined),
    reassignTask: vi.fn().mockResolvedValue(undefined),
    updateStrategyAfterTransfer: vi.fn().mockResolvedValue(undefined),
    updateLastHealthCheck: vi.fn().mockResolvedValue(undefined),
    pauseTask: vi.fn().mockResolvedValue(undefined),
    cancelTask: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeHooks(
  overrides: Partial<AdaptiveDelegationHooks> = {},
): AdaptiveDelegationHooks {
  return {
    notifyHumanCreator: vi.fn().mockResolvedValue(undefined),
    notifyAgentOfTransfer: vi.fn().mockResolvedValue(undefined),
    scheduleRetry: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("AdaptiveDelegationCoordinator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-08T10:15:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("switches to the next available fallback when health checks fail", async () => {
    const repository = makeRepository({
      getTask: vi.fn().mockResolvedValue({
        ...baseTask,
        updated_at: "2026-03-08T10:00:00.000Z",
      }),
      getOperationalState: vi
        .fn()
        .mockImplementation(async (agentId: string) => {
          if (agentId === "agent-primary")
            return {
              ...availableState,
              agent_id: agentId,
              last_heartbeat: "2026-03-08T10:00:00.000Z",
            };
          if (agentId === "agent-fallback-1")
            return { ...availableState, agent_id: agentId };
          return {
            ...availableState,
            agent_id: agentId,
            accepts_new_tasks: false,
          };
        }),
    });
    const hooks = makeHooks();
    const coordinator = new AdaptiveDelegationCoordinator(repository, hooks);

    await coordinator.monitorAndAdapt("task-1", makeStrategy());

    expect(repository.recordTaskTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        to_agent_id: "agent-fallback-1",
        transfer_reason: "LATENCY_EXCEEDED",
      }),
    );
    expect(hooks.notifyAgentOfTransfer).toHaveBeenCalled();
    expect(repository.reassignTask).toHaveBeenCalledWith(
      "task-1",
      "agent-fallback-1",
    );
    expect(repository.updateStrategyAfterTransfer).toHaveBeenCalled();
  });

  it("escalates to the human delegator and pauses the task when no fallback is available", async () => {
    const repository = makeRepository({
      getTask: vi.fn().mockResolvedValue({
        ...baseTask,
        updated_at: "2026-03-08T10:00:00.000Z",
      }),
      getOperationalState: vi.fn().mockResolvedValue({
        ...availableState,
        accepts_new_tasks: false,
        last_heartbeat: "2026-03-08T10:00:00.000Z",
      }),
    });
    const hooks = makeHooks();
    const coordinator = new AdaptiveDelegationCoordinator(repository, hooks);

    await coordinator.monitorAndAdapt(
      "task-1",
      makeStrategy({ fallback_agents: [], escalation_path: "HUMAN" }),
    );

    expect(hooks.notifyHumanCreator).toHaveBeenCalled();
    expect(repository.pauseTask).toHaveBeenCalledWith(
      "task-1",
      expect.any(String),
    );
    expect(repository.updateLastHealthCheck).toHaveBeenCalled();
  });

  it("cancels the task when configured and no fallback is available", async () => {
    const repository = makeRepository({
      getTask: vi.fn().mockResolvedValue({
        ...baseTask,
        actual_cost_sats: 200,
        updated_at: "2026-03-08T10:14:59.000Z",
      }),
      getOperationalState: vi.fn().mockResolvedValue(availableState),
    });
    const coordinator = new AdaptiveDelegationCoordinator(
      repository,
      makeHooks(),
    );

    await coordinator.monitorAndAdapt(
      "task-1",
      makeStrategy({ fallback_agents: [], escalation_path: "CANCEL_TASK" }),
    );

    expect(repository.cancelTask).toHaveBeenCalledWith(
      "task-1",
      "COST_OVERRUN",
    );
  });

  it("schedules a retry for the primary agent when configured", async () => {
    const repository = makeRepository({
      getTask: vi.fn().mockResolvedValue({
        ...baseTask,
        quality_score: 60,
        updated_at: "2026-03-08T10:14:59.000Z",
      }),
      getOperationalState: vi.fn().mockResolvedValue(availableState),
    });
    const hooks = makeHooks();
    const coordinator = new AdaptiveDelegationCoordinator(repository, hooks);

    await coordinator.monitorAndAdapt(
      "task-1",
      makeStrategy({ fallback_agents: [], escalation_path: "RETRY_PRIMARY" }),
    );

    expect(hooks.scheduleRetry).toHaveBeenCalledWith(
      expect.objectContaining({ id: "task-1" }),
      "agent-primary",
      300,
    );
  });

  it("only updates the health timestamp when the task remains healthy", async () => {
    const repository = makeRepository();
    const coordinator = new AdaptiveDelegationCoordinator(
      repository,
      makeHooks(),
    );

    await coordinator.monitorAndAdapt("task-1", makeStrategy());

    expect(repository.recordTaskTransfer).not.toHaveBeenCalled();
    expect(repository.updateLastHealthCheck).toHaveBeenCalled();
  });
});
