-- Agent Performance Reporting Views (Phase 4.1)
-- Creates daily/weekly rollups over agent_task_records for LLM cost + token observability.
--
-- SECURITY / RLS:
-- - We do NOT weaken RLS.
-- - Access is governed by underlying agent_task_records RLS policies.
-- - Views are granted SELECT to authenticated + service_role to match existing repo conventions.

-- ==========================================================================
-- Daily report (per agent per day)
-- ==========================================================================

CREATE OR REPLACE VIEW agent_daily_report WITH (security_invoker = true) AS
SELECT
  date_trunc('day', atr.completed_at)::date AS report_date,
  atr.assignee_agent_id AS agent_id,

  COUNT(*)::bigint AS tasks_completed,
  COALESCE(SUM(atr.input_tokens), 0)::bigint AS input_tokens,
  COALESCE(SUM(atr.output_tokens), 0)::bigint AS output_tokens,
  COALESCE(SUM(atr.total_tokens), 0)::bigint AS total_tokens,

  COALESCE(SUM(atr.actual_cost_sats), 0)::bigint AS total_cost_sats,
  COALESCE(SUM(atr.cost_usd_cents), 0)::bigint AS total_cost_usd_cents,

  COALESCE(ROUND(AVG(atr.actual_cost_sats))::bigint, 0) AS avg_cost_sats,
  COALESCE(ROUND(AVG(atr.total_tokens))::bigint, 0) AS avg_tokens,

  ARRAY_REMOVE(ARRAY_AGG(DISTINCT atr.llm_provider), NULL) AS llm_providers,
  ARRAY_REMOVE(ARRAY_AGG(DISTINCT atr.llm_model), NULL) AS llm_models,

  MAX(atr.completed_at) AS last_completed_at

FROM agent_task_records atr
WHERE atr.status = 'completed' AND atr.completed_at IS NOT NULL
GROUP BY date_trunc('day', atr.completed_at)::date, atr.assignee_agent_id;

-- ==========================================================================
-- Weekly report (per agent per ISO week starting Monday)
-- ==========================================================================

CREATE OR REPLACE VIEW agent_weekly_report WITH (security_invoker = true) AS
SELECT
  date_trunc('week', atr.completed_at)::date AS week_start_date,
  (date_trunc('week', atr.completed_at)::date + 6) AS week_end_date,
  atr.assignee_agent_id AS agent_id,

  COUNT(*)::bigint AS tasks_completed,
  COALESCE(SUM(atr.input_tokens), 0)::bigint AS input_tokens,
  COALESCE(SUM(atr.output_tokens), 0)::bigint AS output_tokens,
  COALESCE(SUM(atr.total_tokens), 0)::bigint AS total_tokens,

  COALESCE(SUM(atr.actual_cost_sats), 0)::bigint AS total_cost_sats,
  COALESCE(SUM(atr.cost_usd_cents), 0)::bigint AS total_cost_usd_cents,

  COALESCE(ROUND(AVG(atr.actual_cost_sats))::bigint, 0) AS avg_cost_sats,
  COALESCE(ROUND(AVG(atr.total_tokens))::bigint, 0) AS avg_tokens,

  ARRAY_REMOVE(ARRAY_AGG(DISTINCT atr.llm_provider), NULL) AS llm_providers,
  ARRAY_REMOVE(ARRAY_AGG(DISTINCT atr.llm_model), NULL) AS llm_models,

  MAX(atr.completed_at) AS last_completed_at

FROM agent_task_records atr
WHERE atr.status = 'completed' AND atr.completed_at IS NOT NULL
GROUP BY date_trunc('week', atr.completed_at)::date, atr.assignee_agent_id;

-- Grants (match existing view migrations)
GRANT SELECT ON agent_daily_report TO authenticated;
GRANT SELECT ON agent_weekly_report TO authenticated;
GRANT SELECT ON agent_daily_report TO service_role;
GRANT SELECT ON agent_weekly_report TO service_role;
