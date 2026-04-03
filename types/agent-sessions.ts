/**
 * Agent Session Type Definitions
 * TypeScript interfaces for agent session management and observability
 * @module types/agent-sessions
 *
 * Phase 2.5 - Step 6: TypeScript Interfaces
 *
 * INTEGRATION POINTS:
 * - Aligns with Supabase schema from migrations 20260214_agent_sessions.sql
 * - Used by Netlify functions (Step 7), service layer (Step 8), React components (Step 10)
 * - Follows pattern from types/agent-tokens.ts
 * - Exported via types/index.ts for barrel imports
 */

// ============================================================================
// Task 6.1: Core Session Types
// ============================================================================

/**
 * Session type determines the interaction model
 */
export type SessionType =
  | "INTERACTIVE" // Human-in-the-loop, real-time interaction
  | "AUTONOMOUS" // Agent operates independently
  | "DELEGATED" // Agent acts on behalf of delegator
  | "SUPERVISED"; // Agent requires approval for actions

/**
 * Session lifecycle status
 */
export type SessionStatus =
  | "ACTIVE" // Currently running
  | "PAUSED" // Temporarily suspended
  | "HIBERNATED" // Auto-paused due to inactivity
  | "TERMINATED"; // Permanently ended

/**
 * Communication channel for session
 */
export type SessionChannel =
  | "nostr" // Nostr protocol (NIP-17/59)
  | "telegram" // Telegram bot
  | "web_ui" // Web interface
  | "api" // REST/RPC API
  | "cli"; // Command-line interface

/**
 * Event types for session timeline
 */
export type SessionEventType =
  | "MESSAGE" // User/agent message exchange
  | "TOOL_CALL" // Agent invoked a tool
  | "CONTEXT_REFRESH" // Context window updated
  | "INTERRUPTION" // User interrupted agent
  | "DELEGATION" // Task delegated to another agent
  | "TASK_ASSIGNMENT" // Task linked to session
  | "TASK_COMPLETION" // Task completed successfully
  | "TASK_FAILURE" // Task failed
  | "STATE_SNAPSHOT" // Full state saved for rollback
  | "CHANNEL_SWITCH" // Switched communication channel
  | "SESSION_PAUSED" // Session paused (manual or auto)
  | "SESSION_RESUMED" // Session resumed
  | "SESSION_TERMINATED" // Session ended
  | "ERROR" // Error occurred
  | "WARNING" // Warning issued
  | "INFO" // Informational event
  | "CONFLICT_DETECTED"; // Lightweight conflict signal for last-write-wins

// ============================================================================
// Task 6.2: Database Row Interfaces (matching Supabase schema exactly)
// ============================================================================

/**
 * Agent session record (maps to agent_sessions table)
 */
export interface AgentSession {
  id: string; // UUID primary key
  session_id: string; // Unique session identifier (sess_...)
  session_token: string; // Session bearer token (ast_...)
  agent_id: string; // UUID reference to user_identities
  created_by_user_id?: string | null; // UUID reference to effective creator/guardian
  human_creator_id: string | null; // UUID reference to creator
  family_federation_id?: string | null; // UUID reference to governing federation
  session_type: SessionType;
  status: SessionStatus;
  capability_scope: Record<string, unknown>;
  lifecycle_metadata: Record<string, unknown>;
  conversation_context: any[]; // JSONB array of messages
  tool_invocation_log: any[]; // JSONB array of tool calls
  state_snapshots: Record<string, any>; // JSONB object of snapshots
  total_messages: number;
  total_tool_calls: number;
  tokens_consumed: number;
  sats_spent: number; // BIGINT
  primary_channel: SessionChannel;
  auto_hibernate_after_minutes: number;
  operational_state_snapshot: Record<string, any> | null; // JSONB
  started_at: string; // TIMESTAMPTZ (ISO 8601)
  last_activity_at: string; // TIMESTAMPTZ
  expires_at: string; // TIMESTAMPTZ
  terminated_at: string | null; // TIMESTAMPTZ
  termination_reason: string | null;
}

/**
 * Session event record (maps to agent_session_events table)
 */
export interface AgentSessionEvent {
  id: string; // UUID primary key
  session_id: string; // Reference to agent_sessions
  event_type: SessionEventType;
  event_data: Record<string, any>; // JSONB
  timestamp: string; // TIMESTAMPTZ (ISO 8601)
  sats_cost: number; // BIGINT
  input_tokens: number;
  output_tokens: number;
  tool_name: string | null;
  tool_parameters: Record<string, any> | null; // JSONB
  tool_result: Record<string, any> | null; // JSONB
}

/**
 * Session metadata record (maps to agent_session_metadata table)
 */
export interface AgentSessionMetadata {
  id: string; // UUID primary key
  session_id: string; // Reference to agent_sessions
  metadata_key: string;
  metadata_value: any; // JSONB
  created_at: string; // TIMESTAMPTZ
  expires_at: string | null; // TIMESTAMPTZ
}

/**
 * Session performance metrics (maps to agent_session_performance table)
 */
export interface AgentSessionPerformance {
  id: string; // UUID primary key
  session_id: string; // Reference to agent_sessions (UNIQUE)
  avg_response_time_ms: number;
  response_count: number;
  error_count: number;
  warning_count: number;
  session_duration_minutes: number;
  created_at: string; // TIMESTAMPTZ
  updated_at: string; // TIMESTAMPTZ
}

// ============================================================================
// Task 6.3: View Interfaces (matching observability views)
// ============================================================================

/**
 * Active session summary (maps to active_sessions_summary view)
 */
export interface ActiveSessionSummary {
  session_id: string;
  agent_id: string;
  agent_name: string;
  creator_id: string | null;
  status: SessionStatus;
  channel: SessionChannel;
  primary_channel?: SessionChannel;
  session_type: SessionType;
  total_messages: number;
  total_tool_calls: number;
  total_tokens: number;
  total_sats_cost: number;
  started_at: string;
  last_activity_at: string;
  duration_minutes: number; // Calculated
  last_activity_ago_minutes: number; // Calculated
  auto_hibernate_remaining_minutes: number | null; // Calculated
  avg_response_time_ms: number;
  error_count: number;
  warning_count: number;
  current_compute_load_percent: number;
  active_task_count: number;
  available_budget_sats: number;
  accepts_new_tasks: boolean;
}

/**
 * Session cost analysis (maps to session_cost_analysis view)
 */
export interface SessionCostAnalysis {
  agent_id: string;
  agent_name: string;
  creator_id: string | null;
  session_type: SessionType;
  channel: SessionChannel;
  primary_channel?: SessionChannel;
  session_count: number;
  total_sats_spent: number;
  avg_sats_per_session: number;
  avg_tokens_per_session: number;
  avg_duration_minutes: number;
  sats_spent_24h: number;
  sats_spent_7d: number;
  sats_spent_30d: number;
  sessions_24h: number;
  sessions_7d: number;
  sessions_30d: number;
  last_session_activity: string; // TIMESTAMPTZ
}

/**
 * Session history record (maps to agent_session_history view)
 */
export interface SessionHistory {
  session_id: string;
  agent_id: string;
  agent_name: string;
  creator_id: string | null;
  status: SessionStatus;
  channel: SessionChannel;
  primary_channel?: SessionChannel;
  session_type: SessionType;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number;
  total_messages: number;
  total_tool_calls: number;
  total_tokens: number;
  total_sats_cost: number;
  response_count: number;
  avg_response_time_ms: number;
  error_count: number;
  warning_count: number;
  event_count: number;
  termination_reason: string | null;
}

/**
 * Session event timeline entry (maps to session_event_timeline view)
 */
export interface SessionEventTimeline {
  event_id: string;
  session_id: string;
  agent_id: string;
  agent_name: string;
  creator_id: string | null;
  session_status: SessionStatus;
  channel: SessionChannel;
  event_type: SessionEventType;
  event_data_summary: string; // Truncated to 200 chars
  sats_cost: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  tool_name: string | null;
  tool_parameters: Record<string, any> | null;
  created_at: string;
  minutes_ago: number;
}

/**
 * Channel distribution metrics (maps to session_channel_distribution view)
 */
export interface SessionChannelDistribution {
  channel: SessionChannel;
  total_sessions: number;
  unique_agents: number;
  active_sessions: number;
  paused_sessions: number;
  hibernated_sessions: number;
  terminated_sessions: number;
  total_messages: number;
  total_tool_calls: number;
  total_tokens: number;
  total_sats_spent: number;
  sessions_24h: number;
  sessions_7d: number;
  sessions_30d: number;
  last_activity_at: string;
}

/**
 * Session task summary (maps to session_task_summary view)
 */
export interface SessionTaskSummary {
  session_id: string;
  agent_id: string;
  agent_name: string;
  creator_id: string | null;
  session_status: SessionStatus;
  session_type: SessionType;
  channel: SessionChannel;
  session_started_at: string;
  task_count: number;
  completed_tasks: number;
  failed_tasks: number;
  in_progress_tasks: number;
  pending_tasks: number;
  total_task_cost_sats: number;
  avg_task_cost_sats: number;
  avg_task_duration_seconds: number;
  total_task_duration_seconds: number;
  avg_quality_score: number;
  total_reputation_delta: number;
  self_reported_tasks: number;
  peer_verified_tasks: number;
  oracle_attested_tasks: number;
  last_task_completed_at: string | null;
}

// ============================================================================
// Task 6.4: API Request/Response Types
// ============================================================================

/**
 * Request to create a new session
 */
export interface CreateSessionRequest {
  agent_id: string;
  session_type: SessionType;
  primary_channel?: SessionChannel;
  created_by_user_id?: string;
  human_creator_id?: string;
}

/**
 * Response from session creation
 */
export interface CreateSessionResponse {
  success: boolean;
  session_id?: string;
  session?: AgentSession;
  error?: string;
}

/**
 * Request to log a session event
 */
export interface LogEventRequest {
  session_id: string;
  event_type: SessionEventType;
  event_data: Record<string, any>;
  tokens_used?: number;
  sats_cost?: number;
  input_tokens?: number;
  output_tokens?: number;
  tool_name?: string;
  tool_parameters?: Record<string, any>;
  tool_result?: Record<string, any>;
}

/**
 * Response from event logging
 */
export interface LogEventResponse {
  success: boolean;
  event_id?: string;
  error?: string;
}

/**
 * Request to manage session (pause/resume/terminate/switch-channel)
 */
export interface ManageSessionRequest {
  session_id: string;
  action: "pause" | "resume" | "terminate" | "switch_channel";
  reason?: string; // For pause/terminate
  new_channel?: SessionChannel; // For switch_channel
}

/**
 * Response from session management
 */
export interface ManageSessionResponse {
  success: boolean;
  session_id?: string;
  new_status?: SessionStatus;
  message?: string;
  error?: string;
}

/**
 * Query parameters for session history/analytics endpoints
 */
export interface SessionQueryParams {
  // View selection
  view?:
    | "active_summary"
    | "cost_analysis"
    | "history"
    | "timeline"
    | "task_summary";

  // Pagination
  page?: number;
  limit?: number;

  // Filters
  agent_id?: string;
  session_id?: string;
  session_type?: SessionType;
  channel?: SessionChannel;
  status?: SessionStatus;

  // Date range filters
  start_date?: string; // ISO 8601 date
  end_date?: string; // ISO 8601 date

  // Cost filters
  min_sats?: number;
  max_sats?: number;

  // Duration filters
  min_duration_minutes?: number;
  max_duration_minutes?: number;

  // Sorting
  sort_by?:
    | "started_at"
    | "created_at"
    | "last_activity_at"
    | "duration"
    | "sats_spent"
    | "tokens_consumed";
  sort_order?: "asc" | "desc";
}

// ============================================================================
// Task 6.5: Component Prop Types
// ============================================================================

/**
 * Props for AgentSessionMonitor component
 * Real-time monitoring of active agent sessions
 */
export interface AgentSessionMonitorProps {
  agentId?: string; // Filter to specific agent
  autoRefresh?: boolean; // Enable auto-refresh
  refreshIntervalMs?: number; // Refresh interval (default: 5000)
  showFilters?: boolean; // Show filter controls
  showCostMetrics?: boolean; // Show cost tracking
  showPerformanceMetrics?: boolean; // Show performance metrics
  onSessionSelect?: (sessionId: string) => void; // Callback on session selection
  onSessionTerminate?: (sessionId: string) => void; // Callback on terminate
  className?: string; // CSS class name
}

/**
 * Props for SessionTimeline component
 * Event timeline visualization for a session
 */
export interface SessionTimelineProps {
  sessionId: string; // Required session ID
  eventTypes?: SessionEventType[]; // Filter to specific event types
  showToolCalls?: boolean; // Show tool invocation details
  showCosts?: boolean; // Show cost per event
  showTokens?: boolean; // Show token usage
  maxEvents?: number; // Limit number of events shown
  autoScroll?: boolean; // Auto-scroll to latest event
  onEventClick?: (eventId: string) => void; // Callback on event click
  className?: string; // CSS class name
}

/**
 * Props for SessionCostChart component
 * Cost visualization and analytics
 */
export interface SessionCostChartProps {
  agentId?: string; // Filter to specific agent
  sessionType?: SessionType; // Filter to session type
  channel?: SessionChannel; // Filter to channel
  timeRange?: "24h" | "7d" | "30d" | "all"; // Time range for analysis
  chartType?: "line" | "bar" | "pie"; // Chart visualization type
  groupBy?: "agent" | "session_type" | "channel" | "day"; // Grouping dimension
  showBreakdown?: boolean; // Show cost breakdown
  showComparison?: boolean; // Show period-over-period comparison
  currency?: "sats" | "btc" | "usd"; // Display currency
  onDataPointClick?: (data: any) => void; // Callback on chart interaction
  className?: string; // CSS class name
}
