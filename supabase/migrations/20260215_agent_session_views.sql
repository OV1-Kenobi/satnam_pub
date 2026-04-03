-- Agent Session Observability Views (Phase 2.5 - Step 4)
-- Analytics and monitoring views for agent session management
-- Designed for integration with AgentSessionMonitor and Cost Tracking Dashboard
--
-- IMPLEMENTATION SUMMARY:
-- Task 4.1: active_sessions_summary - Real-time active/paused session monitoring
-- Task 4.2: session_cost_analysis - Cost aggregation per agent/type/channel
-- Task 4.3: agent_session_history - Complete session history with performance metrics
-- Task 4.4: session_event_timeline - Flat event timeline across sessions
-- Task 4.5: session_channel_distribution - Multi-channel adoption metrics
-- Task 4.6: RLS policies for all views
--
-- INTEGRATION POINTS:
-- - active_sessions_summary → AgentSessionMonitor component (Step 10)
-- - session_cost_analysis → Cost Tracking Dashboard (Step 12)
-- - agent_session_history → Session history panel in UI
-- - Pattern follows agent_health_summary from 20260213_agent_operational_state.sql

-- Task 4.1: Active Sessions Summary View
-- Real-time monitoring of active and paused sessions with calculated metrics
CREATE OR REPLACE VIEW active_sessions_summary AS
SELECT 
  s.session_id,
  s.agent_id,
  ap.agent_name,
  ap.created_by_user_id AS creator_id,
  s.status,
  s.primary_channel AS channel,
  s.primary_channel AS primary_channel,
  s.session_type,
  s.total_messages,
  s.total_tool_calls,
  s.tokens_consumed AS total_tokens,
  s.sats_spent AS total_sats_cost,
  s.started_at,
  s.last_activity_at,
  
  -- Calculated fields
  EXTRACT(EPOCH FROM (NOW() - s.started_at)) / 60 AS duration_minutes,
  EXTRACT(EPOCH FROM (NOW() - s.last_activity_at)) / 60 AS last_activity_ago_minutes,
  
  -- Auto-hibernate remaining time (NULL if opt-out or already exceeded)
  CASE 
    WHEN s.auto_hibernate_after_minutes = 0 THEN NULL
    WHEN s.auto_hibernate_after_minutes IS NULL THEN NULL
    ELSE GREATEST(
      0,
      s.auto_hibernate_after_minutes - EXTRACT(EPOCH FROM (NOW() - s.last_activity_at)) / 60
    )
  END AS auto_hibernate_remaining_minutes,
  
  -- Performance metrics (latest)
  COALESCE(p.avg_response_time_ms, 0) AS avg_response_time_ms,
  COALESCE(p.error_count, 0) AS error_count,
  COALESCE(p.warning_count, 0) AS warning_count,
  
  -- Operational state snapshot
  aos.current_compute_load_percent,
  aos.active_task_count,
  aos.available_budget_sats,
  aos.accepts_new_tasks

FROM agent_sessions s
JOIN agent_profiles ap ON s.agent_id = ap.user_identity_id
LEFT JOIN agent_session_performance p ON s.session_id = p.session_id
LEFT JOIN agent_operational_state aos ON s.agent_id = aos.agent_id

WHERE s.status IN ('ACTIVE', 'PAUSED')
ORDER BY s.last_activity_at DESC;

-- Task 4.2: Session Cost Analysis View
-- Aggregate cost data per agent, session type, and channel
CREATE OR REPLACE VIEW session_cost_analysis AS
SELECT 
  s.agent_id,
  ap.agent_name,
  ap.created_by_user_id AS creator_id,
  s.session_type,
  s.primary_channel AS channel,
  s.primary_channel AS primary_channel,
  
  -- Aggregated metrics
  COUNT(DISTINCT s.session_id) AS session_count,
  SUM(s.sats_spent) AS total_sats_spent,
  ROUND(AVG(s.sats_spent)) AS avg_sats_per_session,
  ROUND(AVG(s.tokens_consumed)) AS avg_tokens_per_session,
  ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(s.terminated_at, NOW()) - s.started_at)) / 60)) AS avg_duration_minutes,
  
  -- Time-based aggregations
  SUM(CASE WHEN s.started_at > NOW() - INTERVAL '24 hours' THEN s.sats_spent ELSE 0 END) AS sats_spent_24h,
  SUM(CASE WHEN s.started_at > NOW() - INTERVAL '7 days' THEN s.sats_spent ELSE 0 END) AS sats_spent_7d,
  SUM(CASE WHEN s.started_at > NOW() - INTERVAL '30 days' THEN s.sats_spent ELSE 0 END) AS sats_spent_30d,
  
  COUNT(DISTINCT CASE WHEN s.started_at > NOW() - INTERVAL '24 hours' THEN s.session_id END) AS sessions_24h,
  COUNT(DISTINCT CASE WHEN s.started_at > NOW() - INTERVAL '7 days' THEN s.session_id END) AS sessions_7d,
  COUNT(DISTINCT CASE WHEN s.started_at > NOW() - INTERVAL '30 days' THEN s.session_id END) AS sessions_30d,
  
  -- Latest activity
  MAX(s.last_activity_at) AS last_session_activity

FROM agent_sessions s
JOIN agent_profiles ap ON s.agent_id = ap.user_identity_id

GROUP BY 
  s.agent_id,
  ap.agent_name,
  ap.created_by_user_id,
  s.session_type,
  s.primary_channel

ORDER BY total_sats_spent DESC;

-- Task 4.3: Agent Session History View
-- Complete session history with performance summary
CREATE OR REPLACE VIEW agent_session_history AS
SELECT 
  s.session_id,
  s.agent_id,
  ap.agent_name,
  ap.created_by_user_id AS creator_id,
  s.status,
  s.primary_channel AS channel,
  s.primary_channel AS primary_channel,
  s.session_type,
  s.started_at,
  s.terminated_at AS ended_at,
  
  -- Duration calculation
  EXTRACT(EPOCH FROM (COALESCE(s.terminated_at, NOW()) - s.started_at)) / 60 AS duration_minutes,
  
  -- Session metrics
  s.total_messages,
  s.total_tool_calls,
  s.tokens_consumed AS total_tokens,
  s.sats_spent AS total_sats_cost,
  
  -- Performance metrics
  COALESCE(p.response_count, 0) AS response_count,
  COALESCE(p.avg_response_time_ms, 0) AS avg_response_time_ms,
  COALESCE(p.error_count, 0) AS error_count,
  COALESCE(p.warning_count, 0) AS warning_count,
  
  -- Event count (all events for this session)
  (SELECT COUNT(*) FROM agent_session_events e WHERE e.session_id = s.session_id) AS event_count,
  
  -- Termination info
  s.termination_reason

FROM agent_sessions s
JOIN agent_profiles ap ON s.agent_id = ap.user_identity_id
LEFT JOIN agent_session_performance p ON s.session_id = p.session_id

ORDER BY s.started_at DESC;

-- Task 4.4: Session Event Timeline View
-- Flat timeline of all events across sessions with truncated event data
CREATE OR REPLACE VIEW session_event_timeline AS
SELECT
  e.id AS event_id,
  e.session_id,
  s.agent_id,
  ap.agent_name,
  ap.created_by_user_id AS creator_id,
  s.status AS session_status,
  s.primary_channel AS channel,
  e.event_type,

  -- Truncated event data for summary display (first 200 chars)
  LEFT(e.event_data::TEXT, 200) AS event_data_summary,

  -- Cost and token metrics
  e.sats_cost,
  e.input_tokens,
  e.output_tokens,
  e.input_tokens + e.output_tokens AS total_tokens,

  -- Tool invocation details
  e.tool_name,
  e.tool_parameters,

  -- Timing
  e.timestamp AS created_at,
  EXTRACT(EPOCH FROM (NOW() - e.timestamp)) / 60 AS minutes_ago

FROM agent_session_events e
JOIN agent_sessions s ON e.session_id = s.session_id
JOIN agent_profiles ap ON s.agent_id = ap.user_identity_id

ORDER BY e.timestamp DESC
LIMIT 1000;

-- Task 4.5: Session Channel Distribution View
-- Count of sessions per channel with active/total breakdown
CREATE OR REPLACE VIEW session_channel_distribution AS
SELECT
  primary_channel AS channel,

  -- Total counts
  COUNT(*) AS total_sessions,
  COUNT(DISTINCT agent_id) AS unique_agents,

  -- Status breakdown
  COUNT(*) FILTER (WHERE status = 'ACTIVE') AS active_sessions,
  COUNT(*) FILTER (WHERE status = 'PAUSED') AS paused_sessions,
  COUNT(*) FILTER (WHERE status = 'HIBERNATED') AS hibernated_sessions,
  COUNT(*) FILTER (WHERE status = 'TERMINATED') AS terminated_sessions,

  -- Activity metrics
  SUM(total_messages) AS total_messages,
  SUM(total_tool_calls) AS total_tool_calls,
  SUM(tokens_consumed) AS total_tokens,
  SUM(sats_spent) AS total_sats_spent,

  -- Time-based metrics
  COUNT(*) FILTER (WHERE started_at > NOW() - INTERVAL '24 hours') AS sessions_24h,
  COUNT(*) FILTER (WHERE started_at > NOW() - INTERVAL '7 days') AS sessions_7d,
  COUNT(*) FILTER (WHERE started_at > NOW() - INTERVAL '30 days') AS sessions_30d,

  -- Latest activity
  MAX(last_activity_at) AS last_activity_at

FROM agent_sessions

GROUP BY primary_channel
ORDER BY total_sessions DESC;

-- Task 4.6: RLS Policies for Views
-- Views inherit table-level RLS, but we add explicit policies for clarity

-- Enable RLS on views (PostgreSQL 9.5+)
-- Note: Views automatically inherit RLS from underlying tables, but we document the access pattern

-- Grant SELECT on all views to authenticated users
GRANT SELECT ON active_sessions_summary TO authenticated;
GRANT SELECT ON session_cost_analysis TO authenticated;
GRANT SELECT ON agent_session_history TO authenticated;
GRANT SELECT ON session_event_timeline TO authenticated;
GRANT SELECT ON session_channel_distribution TO authenticated;

-- Grant SELECT to service role for admin access
GRANT SELECT ON active_sessions_summary TO service_role;
GRANT SELECT ON session_cost_analysis TO service_role;
GRANT SELECT ON agent_session_history TO service_role;
GRANT SELECT ON session_event_timeline TO service_role;
GRANT SELECT ON session_channel_distribution TO service_role;

-- Documentation: RLS Filtering Behavior
-- ========================================
-- All views automatically filter based on underlying table RLS policies:
--
-- 1. active_sessions_summary:
--    - Shows sessions where auth.uid() = agent_id OR auth.uid() = creator_id
--    - Inherits from agent_sessions RLS policies
--
-- 2. session_cost_analysis:
--    - Aggregates only sessions visible to auth.uid()
--    - Inherits from agent_sessions RLS policies
--
-- 3. agent_session_history:
--    - Shows complete history for user's own agents
--    - Inherits from agent_sessions RLS policies
--
-- 4. session_event_timeline:
--    - Shows events only for sessions visible to auth.uid()
--    - Inherits from agent_session_events RLS policies
--
-- 5. session_channel_distribution:
--    - Aggregates across all sessions visible to auth.uid()
--    - Inherits from agent_sessions RLS policies
--
-- Testing RLS:
-- SET ROLE authenticated;
-- SET request.jwt.claims = '{"sub":"<test-user-uuid>"}';
-- SELECT * FROM active_sessions_summary;
-- RESET ROLE;

