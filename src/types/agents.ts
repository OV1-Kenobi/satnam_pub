/**
 * Agent Type Definitions
 * TypeScript interfaces for agent delegation monitoring and management
 * @module types/agents
 */

/**
 * Agent operational state tracking real-time resource availability
 */
export interface AgentOperationalState {
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
  last_heartbeat: string;
  heartbeat_interval_seconds: number;
  current_session_id: string | null;
  is_online: boolean;
}

export interface AgentAvailabilityStatus {
  agent_id: string;
  status: "AVAILABLE" | "LIMITED_CAPACITY" | "UNAVAILABLE" | "OFFLINE";
  status_icon: string;
  status_color: string;
  reason: string | null;
  capacity_percent: number;
}

/**
 * Human oversight load tracking span of control metrics
 */
export interface OversightLoad {
  human_id: string;
  active_delegations: number;
  pending_challenges: number;
  configured_span_limit: number;
  span_status: "WITHIN_LIMIT" | "APPROACHING_LIMIT" | "AT_LIMIT";
}

/**
 * Trust calibration metrics comparing confidence vs actual success
 */
export interface TrustCalibration {
  agent_id: string;
  agent_name: string;
  total_tasks: number;
  avg_confidence: number;
  avg_actual_success: number;
  avg_overconfidence_gap: number;
  confidence_consistency: number;
  calibration_status: "OVERCONFIDENT" | "UNDERCONFIDENT" | "WELL_CALIBRATED";
}

/**
 * Task challenge from agent to delegator
 */
export interface TaskChallenge {
  challenge_id: string;
  task_id: string;
  agent_id: string;
  challenge_reason:
    | "AMBIGUOUS_SPEC"
    | "RESOURCE_EXCEED"
    | "ETHICAL_CONCERN"
    | "CAPABILITY_MISMATCH"
    | "CONTEXT_SATURATION";
  challenge_details: string;
  delegator_response: "pending" | "revised" | "overridden" | "cancelled";
  created_at: string;
  resolved_at?: string;
}

/**
 * Delegation strategy for task assignment
 */
export interface DelegationStrategy {
  strategy_id: string;
  strategy_name: string;
  primary_agent_id: string;
  fallback_agents: string[];
  auto_switch_enabled: boolean;
  health_check_interval_seconds: number;
  max_latency_threshold_ms: number;
  max_cost_threshold_sats: number;
}

/**
 * Health check result for agent monitoring
 */
export interface HealthCheckResult {
  agent_id: string;
  check_timestamp: string;
  latency_ms: number;
  cost_sats: number;
  progress_percent: number;
  quality_score: number;
  is_healthy: boolean;
  failure_reason?: string;
}

/**
 * Task transfer context for mid-execution switching
 */
export interface TaskTransferContext {
  transfer_id: string;
  task_id: string;
  from_agent_id: string;
  to_agent_id: string;
  transfer_reason: string;
  context_snapshot: Record<string, any>;
  created_at: string;
  completed_at?: string;
}

/**
 * Verifiability assessment for task delegation
 */
export interface VerifiabilityAssessment {
  task_id: string;
  verifiability_score: number;
  has_success_criteria: boolean;
  has_measurable_criteria: boolean;
  has_deadline: boolean;
  has_deliverable_format: boolean;
  requires_human_review: boolean;
  improvement_suggestions: string[];
}

/**
 * Agent task record with delegation metadata
 */
export interface AgentTaskRecord {
  task_id: string;
  agent_id: string;
  delegator_id: string;
  task_description: string;
  task_status: "pending" | "in_progress" | "completed" | "failed" | "cancelled";
  verifiability_score: number;
  agent_confidence_percent: number;
  actual_success_percent: number | null;
  created_at: string;
  completed_at?: string;
}
