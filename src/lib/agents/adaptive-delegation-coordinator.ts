import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "../supabase";

export type EscalationPath =
  | "HUMAN"
  | "NEXT_FALLBACK"
  | "CANCEL_TASK"
  | "RETRY_PRIMARY";
export type TransferReason =
  | "LATENCY_EXCEEDED"
  | "COST_OVERRUN"
  | "PROGRESS_STALLED"
  | "AGENT_UNAVAILABLE"
  | "QUALITY_DEGRADATION"
  | "MANUAL_SWITCH";

type JsonObject = Record<string, unknown>;

export interface FallbackAgent {
  agent_id: string;
  priority: number;
}
export interface DelegationStrategy {
  id: string;
  task_id: string;
  primary_agent_id: string;
  delegator_id: string;
  fallback_agents: FallbackAgent[];
  auto_switch_triggers: {
    max_latency_seconds: number;
    max_cost_overrun_percent: number;
    min_progress_check_failures: number;
    max_quality_score_drop: number;
  };
  escalation_path: EscalationPath;
  current_agent_id: string;
  switch_count: number;
  last_health_check_at?: string | null;
}
export interface HealthCheckResult {
  agent_id: string;
  task_id: string;
  latency_seconds: number;
  cost_overrun_percent: number;
  consecutive_failures: number;
  quality_score_drop: number;
  is_healthy: boolean;
  failure_reasons: TransferReason[];
}
export interface TaskTransferContext {
  previous_agent: string;
  transfer_reason: TransferReason;
  work_completed: JsonObject;
  progress_percent: number;
}
export interface AdaptiveTaskRecord {
  id: string;
  assignee_agent_id: string;
  creator_user_id: string;
  status: string;
  created_at: string;
  started_at: string | null;
  updated_at: string | null;
  session_id: string | null;
  estimated_cost_sats: number | null;
  actual_cost_sats: number | null;
  quality_score: number | null;
  task_output_summary: string | null;
  completion_proof: string | null;
}
export interface AgentOperationalStateRecord {
  agent_id: string;
  current_compute_load_percent: number;
  active_task_count: number;
  max_concurrent_tasks: number;
  accepts_new_tasks: boolean;
  estimated_response_time_seconds: number | null;
  last_heartbeat: string | null;
}
export interface SessionEventRecord {
  event_type: string;
  event_data: JsonObject;
  timestamp: string;
  latency_ms: number | null;
  success: boolean | null;
  error_message: string | null;
}
export interface TransferRecordInput {
  task_id: string;
  strategy_id: string;
  from_agent_id: string;
  to_agent_id: string;
  transfer_reason: TransferReason;
  transfer_details: JsonObject;
  work_completed_snapshot: JsonObject;
  progress_percent: number;
}
export interface AdaptiveDelegationRepository {
  getTask(taskId: string): Promise<AdaptiveTaskRecord | null>;
  getOperationalState(
    agentId: string,
  ): Promise<AgentOperationalStateRecord | null>;
  getRecentSessionEvents(
    sessionId: string | null,
    limit: number,
  ): Promise<SessionEventRecord[]>;
  recordTaskTransfer(input: TransferRecordInput): Promise<string>;
  markTransferFailed(transferId: string, errorMessage: string): Promise<void>;
  reassignTask(taskId: string, newAgentId: string): Promise<void>;
  updateStrategyAfterTransfer(
    strategyId: string,
    newAgentId: string,
    remainingFallbackAgents: FallbackAgent[],
    nextSwitchCount: number,
    lastHealthCheckAt: string,
  ): Promise<void>;
  updateLastHealthCheck(
    strategyId: string,
    lastHealthCheckAt: string,
  ): Promise<void>;
  pauseTask(taskId: string, reason: string): Promise<void>;
  cancelTask(taskId: string, reason: string): Promise<void>;
}
export interface AdaptiveDelegationHooks {
  notifyHumanCreator(
    task: AdaptiveTaskRecord,
    reason: TransferReason,
    healthChecks: HealthCheckResult,
  ): Promise<void>;
  notifyAgentOfTransfer(
    agentId: string,
    task: AdaptiveTaskRecord,
    context: TaskTransferContext,
  ): Promise<void>;
  scheduleRetry(
    task: AdaptiveTaskRecord,
    agentId: string,
    cooldownSeconds: number,
  ): Promise<void>;
}

export const ADAPTIVE_MONITORABLE_TASK_STATUSES = [
  "assigned",
  "in_progress",
] as const;

export function isAdaptiveMonitoringTaskStatus(status: string): boolean {
  return ADAPTIVE_MONITORABLE_TASK_STATUSES.includes(
    status as (typeof ADAPTIVE_MONITORABLE_TASK_STATUSES)[number],
  );
}

const HEALTHY_HEARTBEAT_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_RETRY_COOLDOWN_SECONDS = 300;
const FAILURE_EVENT_TYPES = new Set([
  "ERROR",
  "WARNING",
  "PROGRESS_CHECK_FAILED",
]);
const SUCCESS_EVENT_TYPES = new Set([
  "PROGRESS_CHECK_SUCCESS",
  "TASK_COMPLETION",
]);
const noopHooks: AdaptiveDelegationHooks = {
  notifyHumanCreator: async () => {},
  notifyAgentOfTransfer: async () => {},
  scheduleRetry: async () => {},
};

function asJsonObject(value: unknown): JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}
function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function isProgressFailureEvent(event: SessionEventRecord): boolean {
  const data = asJsonObject(event.event_data);
  return (
    FAILURE_EVENT_TYPES.has(event.event_type) &&
    (data.code === "PROGRESS_STALLED" ||
      data.progress_status === "failed" ||
      data.reason === "progress_check_failed")
  );
}
function isProgressSuccessEvent(event: SessionEventRecord): boolean {
  const data = asJsonObject(event.event_data);
  return (
    SUCCESS_EVENT_TYPES.has(event.event_type) ||
    data.progress_status === "success"
  );
}
function calculateLatencySeconds(
  task: AdaptiveTaskRecord,
  events: SessionEventRecord[],
  now: Date,
): number {
  const lastTimestamp =
    events[0]?.timestamp ??
    task.updated_at ??
    task.started_at ??
    task.created_at;
  return Math.max(
    0,
    Math.floor((now.getTime() - new Date(lastTimestamp).getTime()) / 1000),
  );
}
function calculateCostOverrunPercent(task: AdaptiveTaskRecord): number {
  if (!task.estimated_cost_sats || task.estimated_cost_sats <= 0) return 0;
  const actual = task.actual_cost_sats ?? 0;
  return Math.max(
    0,
    Math.floor(
      ((actual - task.estimated_cost_sats) / task.estimated_cost_sats) * 100,
    ),
  );
}
function getConsecutiveProgressFailures(events: SessionEventRecord[]): number {
  let failures = 0;
  for (const event of events) {
    if (isProgressFailureEvent(event)) {
      failures += 1;
      continue;
    }
    if (isProgressSuccessEvent(event)) {
      break;
    }
  }
  return failures;
}
function calculateQualityDrop(
  task: AdaptiveTaskRecord,
  events: SessionEventRecord[],
): number {
  for (const event of events) {
    const data = asJsonObject(event.event_data);
    const explicitDrop = asNumber(data.quality_score_drop);
    if (explicitDrop !== null) return Math.max(0, explicitDrop);
    const score = asNumber(data.quality_score);
    if (score !== null) return Math.max(0, 100 - score);
  }
  return task.quality_score === null
    ? 0
    : Math.max(0, 100 - task.quality_score);
}
function extractProgressPercent(
  task: AdaptiveTaskRecord,
  events: SessionEventRecord[],
): number {
  for (const event of events) {
    const progress = asNumber(asJsonObject(event.event_data).progress_percent);
    if (progress !== null)
      return Math.max(0, Math.min(100, Math.floor(progress)));
  }
  return task.status === "completed" ? 100 : 0;
}
function buildWorkSnapshot(
  task: AdaptiveTaskRecord,
  events: SessionEventRecord[],
  healthChecks: HealthCheckResult,
): JsonObject {
  return {
    status: task.status,
    task_output_summary: task.task_output_summary,
    completion_proof: task.completion_proof,
    latest_event_type: events[0]?.event_type ?? null,
    latest_event_timestamp: events[0]?.timestamp ?? null,
    health_check: healthChecks,
  };
}
function isAgentAvailable(
  state: AgentOperationalStateRecord | null,
  now: Date,
): boolean {
  if (!state?.accepts_new_tasks || !state.last_heartbeat) return false;
  const heartbeatAgeMs =
    now.getTime() - new Date(state.last_heartbeat).getTime();
  return (
    heartbeatAgeMs <= HEALTHY_HEARTBEAT_WINDOW_MS &&
    state.active_task_count < state.max_concurrent_tasks &&
    state.current_compute_load_percent < 90
  );
}

class SupabaseAdaptiveDelegationRepository implements AdaptiveDelegationRepository {
  constructor(private readonly client: SupabaseClient) {}
  async getTask(taskId: string): Promise<AdaptiveTaskRecord | null> {
    const { data, error } = await this.client
      .from("agent_task_records")
      .select(
        "id, assignee_agent_id, creator_user_id, status, created_at, started_at, updated_at, session_id, estimated_cost_sats, actual_cost_sats, quality_score, task_output_summary, completion_proof",
      )
      .eq("id", taskId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as AdaptiveTaskRecord | null) ?? null;
  }
  async getOperationalState(
    agentId: string,
  ): Promise<AgentOperationalStateRecord | null> {
    const { data, error } = await this.client
      .from("agent_operational_state")
      .select(
        "agent_id, current_compute_load_percent, active_task_count, max_concurrent_tasks, accepts_new_tasks, estimated_response_time_seconds, last_heartbeat",
      )
      .eq("agent_id", agentId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as AgentOperationalStateRecord | null) ?? null;
  }
  async getRecentSessionEvents(
    sessionId: string | null,
    limit: number,
  ): Promise<SessionEventRecord[]> {
    if (!sessionId) return [];
    const { data, error } = await this.client
      .from("agent_session_events")
      .select(
        "event_type, event_data, timestamp, latency_ms, success, error_message",
      )
      .eq("session_id", sessionId)
      .order("timestamp", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data as SessionEventRecord[] | null) ?? [];
  }
  async recordTaskTransfer(input: TransferRecordInput): Promise<string> {
    const { data, error } = await this.client
      .from("agent_task_transfers")
      .insert(input)
      .select("id")
      .single();
    if (error || !data?.id)
      throw new Error(error?.message ?? "Failed to record transfer");
    return data.id as string;
  }
  async markTransferFailed(
    transferId: string,
    errorMessage: string,
  ): Promise<void> {
    const { error } = await this.client
      .from("agent_task_transfers")
      .update({ transfer_successful: false, transfer_error: errorMessage })
      .eq("id", transferId);
    if (error) throw new Error(error.message);
  }
  async reassignTask(taskId: string, newAgentId: string): Promise<void> {
    const { error } = await this.client
      .from("agent_task_records")
      .update({
        assignee_agent_id: newAgentId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId);
    if (error) throw new Error(error.message);
  }
  async updateStrategyAfterTransfer(
    strategyId: string,
    newAgentId: string,
    remainingFallbackAgents: FallbackAgent[],
    nextSwitchCount: number,
    lastHealthCheckAt: string,
  ): Promise<void> {
    const { error } = await this.client
      .from("agent_delegation_strategies")
      .update({
        current_agent_id: newAgentId,
        switch_count: nextSwitchCount,
        fallback_agents: remainingFallbackAgents,
        updated_at: lastHealthCheckAt,
        last_health_check_at: lastHealthCheckAt,
      })
      .eq("id", strategyId);
    if (error) throw new Error(error.message);
  }
  async updateLastHealthCheck(
    strategyId: string,
    lastHealthCheckAt: string,
  ): Promise<void> {
    const { error } = await this.client
      .from("agent_delegation_strategies")
      .update({ last_health_check_at: lastHealthCheckAt })
      .eq("id", strategyId);
    if (error) throw new Error(error.message);
  }
  async pauseTask(taskId: string, reason: string): Promise<void> {
    const { error } = await this.client
      .from("agent_task_records")
      .update({
        status: "pending",
        completion_proof: reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId);
    if (error) throw new Error(error.message);
  }
  async cancelTask(taskId: string, reason: string): Promise<void> {
    const { error } = await this.client
      .from("agent_task_records")
      .update({
        status: "cancelled",
        completion_proof: reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId);
    if (error) throw new Error(error.message);
  }
}

export class AdaptiveDelegationCoordinator {
  constructor(
    private readonly repository: AdaptiveDelegationRepository = new SupabaseAdaptiveDelegationRepository(
      supabase,
    ),
    private readonly hooks: AdaptiveDelegationHooks = noopHooks,
  ) {}
  async monitorAndAdapt(
    taskId: string,
    strategy: DelegationStrategy,
  ): Promise<void> {
    const task = await this.repository.getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    if (!isAdaptiveMonitoringTaskStatus(task.status)) {
      return;
    }
    const currentState = await this.repository.getOperationalState(
      strategy.current_agent_id,
    );
    const recentEvents = await this.repository.getRecentSessionEvents(
      task.session_id,
      10,
    );
    const healthChecks = this.performHealthChecks(
      task,
      strategy,
      currentState,
      recentEvents,
      new Date(),
    );
    if (!healthChecks.is_healthy) {
      await this.switchDelegatee(
        task,
        strategy,
        healthChecks,
        recentEvents,
        new Date().toISOString(),
      );
      return;
    }
    await this.repository.updateLastHealthCheck(
      strategy.id,
      new Date().toISOString(),
    );
  }
  performHealthChecks(
    task: AdaptiveTaskRecord,
    strategy: DelegationStrategy,
    currentState: AgentOperationalStateRecord | null,
    recentEvents: SessionEventRecord[],
    now: Date = new Date(),
  ): HealthCheckResult {
    const failureReasons: TransferReason[] = [];
    const latencySeconds = calculateLatencySeconds(task, recentEvents, now);
    if (latencySeconds > strategy.auto_switch_triggers.max_latency_seconds)
      failureReasons.push("LATENCY_EXCEEDED");
    const costOverrunPercent = calculateCostOverrunPercent(task);
    if (
      costOverrunPercent >
      strategy.auto_switch_triggers.max_cost_overrun_percent
    )
      failureReasons.push("COST_OVERRUN");
    const consecutiveFailures = getConsecutiveProgressFailures(recentEvents);
    if (
      consecutiveFailures >=
      strategy.auto_switch_triggers.min_progress_check_failures
    )
      failureReasons.push("PROGRESS_STALLED");
    const qualityScoreDrop = calculateQualityDrop(task, recentEvents);
    if (qualityScoreDrop > strategy.auto_switch_triggers.max_quality_score_drop)
      failureReasons.push("QUALITY_DEGRADATION");
    if (!isAgentAvailable(currentState, now))
      failureReasons.push("AGENT_UNAVAILABLE");
    return {
      agent_id: strategy.current_agent_id,
      task_id: task.id,
      latency_seconds: latencySeconds,
      cost_overrun_percent: costOverrunPercent,
      consecutive_failures: consecutiveFailures,
      quality_score_drop: qualityScoreDrop,
      is_healthy: failureReasons.length === 0,
      failure_reasons: Array.from(new Set(failureReasons)),
    };
  }
  private async switchDelegatee(
    task: AdaptiveTaskRecord,
    strategy: DelegationStrategy,
    healthChecks: HealthCheckResult,
    recentEvents: SessionEventRecord[],
    lastHealthCheckAt: string,
  ): Promise<void> {
    const nextFallback = await this.selectNextFallbackAgent(
      strategy.fallback_agents,
      strategy.current_agent_id,
      new Date(),
    );
    if (!nextFallback) {
      await this.handleEscalation(
        task,
        strategy,
        healthChecks,
        lastHealthCheckAt,
      );
      return;
    }
    const context: TaskTransferContext = {
      previous_agent: strategy.current_agent_id,
      transfer_reason: healthChecks.failure_reasons[0] ?? "MANUAL_SWITCH",
      work_completed: buildWorkSnapshot(task, recentEvents, healthChecks),
      progress_percent: extractProgressPercent(task, recentEvents),
    };
    const transferId = await this.repository.recordTaskTransfer({
      task_id: task.id,
      strategy_id: strategy.id,
      from_agent_id: strategy.current_agent_id,
      to_agent_id: nextFallback.agent_id,
      transfer_reason: context.transfer_reason,
      transfer_details: { health_check: healthChecks },
      work_completed_snapshot: context.work_completed,
      progress_percent: context.progress_percent,
    });
    try {
      await this.hooks.notifyAgentOfTransfer(
        nextFallback.agent_id,
        task,
        context,
      );
      await this.repository.reassignTask(task.id, nextFallback.agent_id);
      await this.repository.updateStrategyAfterTransfer(
        strategy.id,
        nextFallback.agent_id,
        strategy.fallback_agents.filter(
          (candidate) => candidate.agent_id !== nextFallback.agent_id,
        ),
        strategy.switch_count + 1,
        lastHealthCheckAt,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Task transfer failed";
      await this.repository.markTransferFailed(transferId, message);
      throw error;
    }
  }
  private async handleEscalation(
    task: AdaptiveTaskRecord,
    strategy: DelegationStrategy,
    healthChecks: HealthCheckResult,
    lastHealthCheckAt: string,
  ): Promise<void> {
    if (strategy.escalation_path === "CANCEL_TASK") {
      await this.repository.cancelTask(
        task.id,
        healthChecks.failure_reasons[0] ?? "AGENT_UNAVAILABLE",
      );
      await this.repository.updateLastHealthCheck(
        strategy.id,
        lastHealthCheckAt,
      );
      return;
    }
    if (strategy.escalation_path === "RETRY_PRIMARY") {
      await this.hooks.scheduleRetry(
        task,
        strategy.primary_agent_id,
        DEFAULT_RETRY_COOLDOWN_SECONDS,
      );
      await this.repository.updateLastHealthCheck(
        strategy.id,
        lastHealthCheckAt,
      );
      return;
    }
    await this.hooks.notifyHumanCreator(
      task,
      healthChecks.failure_reasons[0] ?? "AGENT_UNAVAILABLE",
      healthChecks,
    );
    await this.repository.pauseTask(
      task.id,
      healthChecks.failure_reasons[0] ?? "AGENT_UNAVAILABLE",
    );
    await this.repository.updateLastHealthCheck(strategy.id, lastHealthCheckAt);
  }
  private async selectNextFallbackAgent(
    fallbackAgents: FallbackAgent[],
    currentAgentId: string,
    now: Date,
  ): Promise<FallbackAgent | null> {
    const orderedFallbacks = [...fallbackAgents]
      .filter((candidate) => candidate.agent_id !== currentAgentId)
      .sort((left, right) => left.priority - right.priority);
    for (const candidate of orderedFallbacks) {
      const state = await this.repository.getOperationalState(
        candidate.agent_id,
      );
      if (isAgentAvailable(state, now)) return candidate;
    }
    return null;
  }
}
