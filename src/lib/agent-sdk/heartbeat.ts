// Agent Heartbeat Service
// Provides real-time health monitoring for agents
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ADAPTIVE_MONITORABLE_TASK_STATUSES,
  AdaptiveDelegationCoordinator,
  type DelegationStrategy,
  type FallbackAgent,
} from "../agents/adaptive-delegation-coordinator";
import { supabase } from "../supabase";

export interface HeartbeatData {
  loadPercent: number;
  activeTasks: number;
  availableBudget: number;
  acceptsTasks: boolean;
  contextUsedPercent: number;
  contextUsedTokens?: number;
  reservedBudget?: number;
  totalBudget?: number;
  currentSessionId?: string | null;
  tokenBalances?: Record<string, unknown>;
  heartbeatIntervalSeconds?: number;
}

interface StrategyTaskRecord {
  id: string;
  status: string;
  assignee_agent_id: string;
}

interface StrategyRow {
  id: string;
  task_id: string;
  primary_agent_id: string;
  delegator_id: string;
  fallback_agents: unknown;
  max_latency_seconds: number;
  max_cost_overrun_percent: number;
  min_progress_check_failures: number;
  max_quality_score_drop: number;
  escalation_path: DelegationStrategy["escalation_path"];
  current_agent_id: string;
  switch_count: number;
  last_health_check_at: string | null;
  agent_task_records?: StrategyTaskRecord | null;
}

interface HeartbeatLogger {
  log(message?: unknown, ...optionalParams: unknown[]): void;
  warn(message?: unknown, ...optionalParams: unknown[]): void;
  error(message?: unknown, ...optionalParams: unknown[]): void;
}

interface HeartbeatDependencies {
  supabaseClient?: SupabaseClient;
  coordinator?: Pick<AdaptiveDelegationCoordinator, "monitorAndAdapt">;
  logger?: HeartbeatLogger;
}

const MAX_STRATEGIES_PER_HEARTBEAT = 5;

function isFallbackAgent(value: unknown): value is FallbackAgent {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.agent_id === "string" &&
    typeof candidate.priority === "number" &&
    Number.isFinite(candidate.priority)
  );
}

function normalizeFallbackAgents(value: unknown): FallbackAgent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isFallbackAgent).map((agent) => ({
    agent_id: agent.agent_id,
    priority: agent.priority,
  }));
}

function mapStrategyRow(row: StrategyRow): DelegationStrategy {
  return {
    id: row.id,
    task_id: row.task_id,
    primary_agent_id: row.primary_agent_id,
    delegator_id: row.delegator_id,
    fallback_agents: normalizeFallbackAgents(row.fallback_agents),
    auto_switch_triggers: {
      max_latency_seconds: row.max_latency_seconds,
      max_cost_overrun_percent: row.max_cost_overrun_percent,
      min_progress_check_failures: row.min_progress_check_failures,
      max_quality_score_drop: row.max_quality_score_drop,
    },
    escalation_path: row.escalation_path,
    current_agent_id: row.current_agent_id,
    switch_count: row.switch_count,
    last_health_check_at: row.last_health_check_at,
  };
}

export class AgentHeartbeatService {
  private agentId: string;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private monitoringInFlight = false;
  private readonly supabaseClient: SupabaseClient;
  private readonly coordinator: Pick<
    AdaptiveDelegationCoordinator,
    "monitorAndAdapt"
  >;
  private readonly logger: HeartbeatLogger;

  constructor(agentId: string, dependencies: HeartbeatDependencies = {}) {
    this.agentId = agentId;
    this.supabaseClient = dependencies.supabaseClient ?? supabase;
    this.coordinator =
      dependencies.coordinator ?? new AdaptiveDelegationCoordinator();
    this.logger = dependencies.logger ?? console;
  }

  startHeartbeat(
    getDataCallback: () => Promise<HeartbeatData> | HeartbeatData,
  ): void {
    if (this.isRunning) {
      console.warn("Heartbeat already running for agent:", this.agentId);
      return;
    }

    this.isRunning = true;

    // Send initial heartbeat immediately
    this.sendHeartbeat(getDataCallback);

    // Set up periodic heartbeat (every 60 seconds)
    this.intervalId = setInterval(async () => {
      try {
        await this.sendHeartbeat(getDataCallback);
      } catch (error) {
        this.logger.error("Heartbeat failed for agent:", this.agentId, error);
      }
    }, 60000); // 60 seconds
  }

  async sendHeartbeat(
    getDataCallback: () => Promise<HeartbeatData> | HeartbeatData,
  ): Promise<void> {
    try {
      const heartbeatData = await getDataCallback();

      // Send heartbeat to Supabase
      const heartbeatPayload: Record<string, unknown> = {
        p_agent_id: this.agentId,
        p_load_percent: heartbeatData.loadPercent,
        p_active_tasks: heartbeatData.activeTasks,
        p_available_budget: heartbeatData.availableBudget,
        p_accepts_tasks: heartbeatData.acceptsTasks,
        p_context_used_percent: heartbeatData.contextUsedPercent,
      };

      if (heartbeatData.contextUsedTokens !== undefined) {
        heartbeatPayload.p_context_used_tokens =
          heartbeatData.contextUsedTokens;
      }
      if (heartbeatData.reservedBudget !== undefined) {
        heartbeatPayload.p_reserved_budget = heartbeatData.reservedBudget;
      }
      if (heartbeatData.totalBudget !== undefined) {
        heartbeatPayload.p_total_budget = heartbeatData.totalBudget;
      }
      if (heartbeatData.currentSessionId !== undefined) {
        heartbeatPayload.p_current_session_id = heartbeatData.currentSessionId;
      }
      if (heartbeatData.tokenBalances !== undefined) {
        heartbeatPayload.p_token_balances = heartbeatData.tokenBalances;
      }
      if (heartbeatData.heartbeatIntervalSeconds !== undefined) {
        heartbeatPayload.p_heartbeat_interval_seconds =
          heartbeatData.heartbeatIntervalSeconds;
      }

      const { error } = await this.supabaseClient.rpc(
        "agent_heartbeat",
        heartbeatPayload,
      );

      if (error) {
        this.logger.error("Failed to send heartbeat:", error);
        throw error;
      }

      this.logger.log("Heartbeat sent successfully for agent:", this.agentId);

      await this.runAdaptiveDelegationMonitoring(heartbeatData.activeTasks);
    } catch (error) {
      this.logger.error("Error in heartbeat for agent:", this.agentId, error);
      throw error;
    }
  }

  private async runAdaptiveDelegationMonitoring(
    activeTaskCount: number,
  ): Promise<void> {
    if (activeTaskCount <= 0 || this.monitoringInFlight) {
      return;
    }

    this.monitoringInFlight = true;

    try {
      const strategies = await this.loadMonitorableStrategies(activeTaskCount);

      for (const strategy of strategies) {
        try {
          await this.coordinator.monitorAndAdapt(strategy.task_id, strategy);
        } catch (error) {
          this.logger.error(
            "Adaptive delegation monitoring failed for task:",
            strategy.task_id,
            error,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        "Failed to load adaptive delegation strategies for agent:",
        this.agentId,
        error,
      );
    } finally {
      this.monitoringInFlight = false;
    }
  }

  private async loadMonitorableStrategies(
    activeTaskCount: number,
  ): Promise<DelegationStrategy[]> {
    const strategyLimit = Math.min(
      Math.max(activeTaskCount, 1),
      MAX_STRATEGIES_PER_HEARTBEAT,
    );

    const { data, error } = await this.supabaseClient
      .from("agent_delegation_strategies")
      .select(
        "id, task_id, primary_agent_id, delegator_id, fallback_agents, max_latency_seconds, max_cost_overrun_percent, min_progress_check_failures, max_quality_score_drop, escalation_path, current_agent_id, switch_count, last_health_check_at, agent_task_records!inner(id, status, assignee_agent_id)",
      )
      .eq("current_agent_id", this.agentId)
      .eq("agent_task_records.assignee_agent_id", this.agentId)
      .in("agent_task_records.status", [...ADAPTIVE_MONITORABLE_TASK_STATUSES])
      .limit(strategyLimit);

    if (error) {
      throw error;
    }

    return ((data as StrategyRow[] | null) ?? []).map(mapStrategyRow);
  }

  stopHeartbeat(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    this.logger.log("Heartbeat stopped for agent:", this.agentId);
  }

  isHeartbeatRunning(): boolean {
    return this.isRunning;
  }
}
