import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "../supabase";
import type {
  AgentAvailabilityStatus,
  AgentOperationalState,
} from "../../types/agents";

interface AgentHeartbeatInput {
  compute_load_percent: number;
  active_task_count: number;
  available_budget_sats: number;
  context_window_used_percent?: number;
  context_window_used_tokens?: number;
  reserved_budget_sats?: number;
  total_budget_sats?: number;
  accepts_tasks?: boolean;
  current_session_id?: string | null;
  token_balances?: Record<string, unknown>;
  heartbeat_interval_seconds?: number;
}

interface AgentStateRow {
  agent_id: string;
  current_compute_load_percent: number;
  active_task_count: number;
  max_concurrent_tasks: number;
  available_budget_sats: number;
  reserved_budget_sats: number;
  total_budget_sats: number;
  context_window_used_percent: number;
  context_window_size_tokens: number;
  context_window_used_tokens: number;
  accepts_new_tasks: boolean;
  availability_reason: string | null;
  estimated_response_time_seconds: number | null;
  last_heartbeat: string | null;
  heartbeat_interval_seconds: number;
  current_session_id: string | null;
}

const OFFLINE_THRESHOLD_MS = 5 * 60 * 1000;
const stateSelect =
  "agent_id, current_compute_load_percent, active_task_count, max_concurrent_tasks, available_budget_sats, reserved_budget_sats, total_budget_sats, context_window_used_percent, context_window_size_tokens, context_window_used_tokens, accepts_new_tasks, availability_reason, estimated_response_time_seconds, last_heartbeat, heartbeat_interval_seconds, current_session_id";

export class AgentStateMonitor {
  constructor(
    private readonly client: SupabaseClient = supabase,
    private readonly nowProvider: () => Date = () => new Date(),
  ) {}

  async sendHeartbeat(
    agentId: string,
    state: AgentHeartbeatInput,
  ): Promise<void> {
    const payload: Record<string, unknown> = {
      p_agent_id: agentId,
      p_load_percent: state.compute_load_percent,
      p_active_tasks: state.active_task_count,
      p_available_budget: state.available_budget_sats,
    };

    if (state.accepts_tasks !== undefined) {
      payload.p_accepts_tasks = state.accepts_tasks;
    }
    if (state.context_window_used_percent !== undefined) {
      payload.p_context_used_percent = state.context_window_used_percent;
    }
    if (state.context_window_used_tokens !== undefined) {
      payload.p_context_used_tokens = state.context_window_used_tokens;
    }
    if (state.reserved_budget_sats !== undefined) {
      payload.p_reserved_budget = state.reserved_budget_sats;
    }
    if (state.total_budget_sats !== undefined) {
      payload.p_total_budget = state.total_budget_sats;
    }
    if (state.current_session_id !== undefined) {
      payload.p_current_session_id = state.current_session_id;
    }
    if (state.token_balances !== undefined) {
      payload.p_token_balances = state.token_balances;
    }
    if (state.heartbeat_interval_seconds !== undefined) {
      payload.p_heartbeat_interval_seconds = state.heartbeat_interval_seconds;
    }

    const { error } = await this.client.rpc("agent_heartbeat", payload);

    if (error) {
      throw new Error(`Failed to send heartbeat: ${error.message}`);
    }
  }

  async getAgentState(agentId: string): Promise<AgentOperationalState | null> {
    const { data, error } = await this.client
      .from("agent_operational_state")
      .select(stateSelect)
      .eq("agent_id", agentId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to get agent state: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    return this.mapState(data as AgentStateRow);
  }

  async getAgentAvailability(
    agentIds: string[],
  ): Promise<AgentAvailabilityStatus[]> {
    if (agentIds.length === 0) {
      return [];
    }

    const { data, error } = await this.client
      .from("agent_operational_state")
      .select(stateSelect)
      .in("agent_id", agentIds);

    if (error) {
      throw new Error(`Failed to get agent availability: ${error.message}`);
    }

    return ((data as AgentStateRow[] | null) ?? []).map((state) =>
      this.calculateAvailabilityStatus(this.mapState(state)),
    );
  }

  async getAvailableAgents(
    createdByUserId: string,
  ): Promise<AgentOperationalState[]> {
    const onlineCutoff = new Date(
      this.nowProvider().getTime() - OFFLINE_THRESHOLD_MS,
    ).toISOString();

    const { data, error } = await this.client
      .from("agent_operational_state")
      .select(`${stateSelect}, agent_profiles!inner(created_by_user_id)`)
      .eq("agent_profiles.created_by_user_id", createdByUserId)
      .eq("accepts_new_tasks", true)
      .gte("last_heartbeat", onlineCutoff)
      .order("estimated_response_time_seconds", { ascending: true });

    if (error) {
      throw new Error(`Failed to get available agents: ${error.message}`);
    }

    return ((data as AgentStateRow[] | null) ?? []).map((state) =>
      this.mapState(state),
    );
  }

  private mapState(state: AgentStateRow): AgentOperationalState {
    return {
      ...state,
      last_heartbeat: state.last_heartbeat ?? new Date(0).toISOString(),
      is_online: this.isOnline(state.last_heartbeat),
    };
  }

  private calculateAvailabilityStatus(
    state: AgentOperationalState,
  ): AgentAvailabilityStatus {
    if (!state.is_online) {
      return {
        agent_id: state.agent_id,
        status: "OFFLINE",
        status_icon: "⚫",
        status_color: "gray",
        reason: "Agent offline (no heartbeat in 5+ minutes)",
        capacity_percent: 0,
      };
    }

    if (!state.accepts_new_tasks) {
      return {
        agent_id: state.agent_id,
        status: "UNAVAILABLE",
        status_icon: "🔴",
        status_color: "red",
        reason: state.availability_reason || "Unknown reason",
        capacity_percent: 0,
      };
    }

    const taskCapacity =
      state.max_concurrent_tasks > 0
        ? ((state.max_concurrent_tasks - state.active_task_count) /
            state.max_concurrent_tasks) *
          100
        : 0;
    const computeCapacity = 100 - state.current_compute_load_percent;
    const contextCapacity = 100 - state.context_window_used_percent;
    const budgetCapacity =
      state.total_budget_sats > 0
        ? (state.available_budget_sats / state.total_budget_sats) * 100
        : 100;
    const overallCapacity = Math.min(
      taskCapacity,
      computeCapacity,
      contextCapacity,
      budgetCapacity,
    );

    if (overallCapacity >= 50) {
      return {
        agent_id: state.agent_id,
        status: "AVAILABLE",
        status_icon: "🟢",
        status_color: "green",
        reason: null,
        capacity_percent: Math.round(overallCapacity),
      };
    }

    return {
      agent_id: state.agent_id,
      status: "LIMITED_CAPACITY",
      status_icon: "🟡",
      status_color: "yellow",
      reason: this.identifyLimitingFactor(state),
      capacity_percent: Math.round(overallCapacity),
    };
  }

  private identifyLimitingFactor(state: AgentOperationalState): string {
    const factors = [
      {
        name: "Task slots",
        percent:
          state.max_concurrent_tasks > 0
            ? ((state.max_concurrent_tasks - state.active_task_count) /
                state.max_concurrent_tasks) *
              100
            : 0,
      },
      {
        name: "Compute",
        percent: 100 - state.current_compute_load_percent,
      },
      {
        name: "Context window",
        percent: 100 - state.context_window_used_percent,
      },
      {
        name: "Budget",
        percent:
          state.total_budget_sats > 0
            ? (state.available_budget_sats / state.total_budget_sats) * 100
            : 100,
      },
    ];

    const limiting = factors.reduce((min, factor) =>
      factor.percent < min.percent ? factor : min,
    );

    return `Limited by ${limiting.name} (${Math.round(limiting.percent)}% available)`;
  }

  private isOnline(lastHeartbeat: string | null): boolean {
    if (!lastHeartbeat) {
      return false;
    }

    return (
      this.nowProvider().getTime() - new Date(lastHeartbeat).getTime() <=
      OFFLINE_THRESHOLD_MS
    );
  }
}