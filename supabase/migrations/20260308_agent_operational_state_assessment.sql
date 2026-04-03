-- Task 4.5.1: Dynamic Agent State Assessment
-- Enhances existing operational-state tracking with richer capacity fields,
-- deterministic snapshots, and automatic availability calculation.

ALTER TABLE agent_operational_state
  ADD COLUMN IF NOT EXISTS reserved_budget_sats BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_budget_sats BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS context_window_size_tokens INTEGER NOT NULL DEFAULT 128000,
  ADD COLUMN IF NOT EXISTS context_window_used_tokens INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS heartbeat_interval_seconds INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS availability_reason TEXT;

UPDATE agent_operational_state
SET
  reserved_budget_sats = COALESCE(reserved_budget_sats, 0),
  total_budget_sats = COALESCE(total_budget_sats, available_budget_sats, 0),
  context_window_size_tokens = COALESCE(context_window_size_tokens, 128000),
  context_window_used_tokens = COALESCE(
    context_window_used_tokens,
    FLOOR((COALESCE(context_window_used_percent, 0)::NUMERIC / 100) * COALESCE(context_window_size_tokens, 128000))::INTEGER,
    0
  ),
  heartbeat_interval_seconds = COALESCE(heartbeat_interval_seconds, 60),
  availability_reason = COALESCE(availability_reason, pause_reason);

CREATE TABLE IF NOT EXISTS agent_state_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL REFERENCES user_identities(id) ON DELETE CASCADE,
  current_compute_load_percent INTEGER,
  active_task_count INTEGER,
  available_budget_sats BIGINT,
  reserved_budget_sats BIGINT,
  total_budget_sats BIGINT,
  context_window_used_percent INTEGER,
  context_window_used_tokens INTEGER,
  accepts_new_tasks BOOLEAN,
  availability_reason TEXT,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_state_snapshots_agent_time
  ON agent_state_snapshots(agent_id, snapshot_at DESC);

ALTER TABLE agent_state_snapshots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_state_snapshots'
      AND policyname = 'agent_state_snapshots_self_read'
  ) THEN
    CREATE POLICY agent_state_snapshots_self_read
      ON agent_state_snapshots FOR SELECT
      USING (agent_id = auth.uid()::TEXT);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_state_snapshots'
      AND policyname = 'agent_state_snapshots_creator_read'
  ) THEN
    CREATE POLICY agent_state_snapshots_creator_read
      ON agent_state_snapshots FOR SELECT
      USING (
        agent_id IN (
          SELECT ap.user_identity_id
          FROM agent_profiles ap
          WHERE ap.created_by_user_id = auth.uid()::TEXT
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_state_snapshots'
      AND policyname = 'agent_state_snapshots_service_all'
  ) THEN
    CREATE POLICY agent_state_snapshots_service_all
      ON agent_state_snapshots FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

DROP FUNCTION IF EXISTS agent_heartbeat(UUID, INTEGER, INTEGER, BIGINT, BOOLEAN, INTEGER, JSONB);
DROP FUNCTION IF EXISTS agent_heartbeat(UUID, INTEGER, INTEGER, BIGINT, BOOLEAN, INTEGER, JSONB, TEXT);

CREATE OR REPLACE FUNCTION agent_heartbeat(
  p_agent_id UUID,
  p_load_percent INTEGER DEFAULT NULL,
  p_active_tasks INTEGER DEFAULT NULL,
  p_available_budget BIGINT DEFAULT NULL,
  p_accepts_tasks BOOLEAN DEFAULT NULL,
  p_context_used_percent INTEGER DEFAULT NULL,
  p_token_balances JSONB DEFAULT NULL,
  p_current_session_id TEXT DEFAULT NULL,
  p_reserved_budget BIGINT DEFAULT NULL,
  p_total_budget BIGINT DEFAULT NULL,
  p_context_used_tokens INTEGER DEFAULT NULL,
  p_heartbeat_interval_seconds INTEGER DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
  v_result JSON;
  v_previous_heartbeat TIMESTAMPTZ;
  v_last_snapshot_at TIMESTAMPTZ;
  v_was_offline BOOLEAN;
  v_existing_state agent_operational_state%ROWTYPE;
  v_compute_load INTEGER;
  v_active_tasks INTEGER;
  v_available_budget BIGINT;
  v_reserved_budget BIGINT;
  v_total_budget BIGINT;
  v_context_window_size INTEGER;
  v_context_used_tokens INTEGER;
  v_context_used_percent INTEGER;
  v_accepts_tasks BOOLEAN;
  v_availability_reason TEXT;
  v_estimated_response_time_seconds INTEGER;
  v_heartbeat_interval_seconds INTEGER;
BEGIN
  SELECT *
  INTO v_existing_state
  FROM agent_operational_state
  WHERE agent_id = p_agent_id;

  v_previous_heartbeat := v_existing_state.last_heartbeat;
  v_was_offline := (
    v_previous_heartbeat IS NULL
    OR v_previous_heartbeat < NOW() - INTERVAL '5 minutes'
  );

  v_compute_load := LEAST(100, GREATEST(0, COALESCE(p_load_percent, v_existing_state.current_compute_load_percent, 0)));
  v_active_tasks := GREATEST(0, COALESCE(p_active_tasks, v_existing_state.active_task_count, 0));
  v_available_budget := GREATEST(0, COALESCE(p_available_budget, v_existing_state.available_budget_sats, 0));
  v_reserved_budget := GREATEST(0, COALESCE(p_reserved_budget, v_existing_state.reserved_budget_sats, 0));
  v_total_budget := GREATEST(
    COALESCE(p_total_budget, v_existing_state.total_budget_sats, 0),
    v_available_budget + v_reserved_budget
  );
  v_context_window_size := GREATEST(1, COALESCE(v_existing_state.context_window_size_tokens, 128000));
  v_heartbeat_interval_seconds := GREATEST(10, COALESCE(p_heartbeat_interval_seconds, v_existing_state.heartbeat_interval_seconds, 60));

  v_context_used_tokens := COALESCE(p_context_used_tokens, v_existing_state.context_window_used_tokens);
  IF v_context_used_tokens IS NULL AND p_context_used_percent IS NOT NULL THEN
    v_context_used_tokens := FLOOR((LEAST(100, GREATEST(0, p_context_used_percent))::NUMERIC / 100) * v_context_window_size)::INTEGER;
  END IF;
  v_context_used_tokens := LEAST(v_context_window_size, GREATEST(0, COALESCE(v_context_used_tokens, 0)));
  v_context_used_percent := LEAST(
    100,
    GREATEST(
      0,
      COALESCE(
        p_context_used_percent,
        FLOOR((v_context_used_tokens::NUMERIC / v_context_window_size) * 100)::INTEGER,
        0
      )
    )
  );

  v_accepts_tasks := COALESCE(p_accepts_tasks, TRUE);
  v_availability_reason := NULL;

  IF v_available_budget <= 0 THEN
    v_accepts_tasks := FALSE;
    v_availability_reason := 'BUDGET_DEPLETED';
  ELSIF v_context_used_percent >= 90 THEN
    v_accepts_tasks := FALSE;
    v_availability_reason := 'CONTEXT_SATURATED';
  ELSIF v_active_tasks >= COALESCE(v_existing_state.max_concurrent_tasks, 5) THEN
    v_accepts_tasks := FALSE;
    v_availability_reason := 'MAX_TASKS_REACHED';
  ELSIF v_compute_load >= 95 THEN
    v_accepts_tasks := FALSE;
    v_availability_reason := 'COMPUTE_OVERLOADED';
  ELSIF COALESCE(p_accepts_tasks, TRUE) = FALSE THEN
    v_accepts_tasks := FALSE;
    v_availability_reason := 'MANUAL_PAUSE';
  END IF;

  v_estimated_response_time_seconds := GREATEST(
    30,
    (v_active_tasks * 30) + (v_compute_load * 2)
  );

  INSERT INTO agent_operational_state (
    agent_id,
    current_compute_load_percent,
    active_task_count,
    max_concurrent_tasks,
    available_budget_sats,
    reserved_budget_sats,
    total_budget_sats,
    token_balance_snapshot,
    context_window_used_percent,
    context_window_size_tokens,
    context_window_used_tokens,
    last_context_refresh_at,
    accepts_new_tasks,
    estimated_response_time_seconds,
    pause_reason,
    availability_reason,
    last_heartbeat,
    heartbeat_failures,
    heartbeat_interval_seconds,
    current_session_id,
    updated_at
  ) VALUES (
    p_agent_id,
    v_compute_load,
    v_active_tasks,
    COALESCE(v_existing_state.max_concurrent_tasks, 5),
    v_available_budget,
    v_reserved_budget,
    v_total_budget,
    COALESCE(p_token_balances, v_existing_state.token_balance_snapshot, '{}'::jsonb),
    v_context_used_percent,
    v_context_window_size,
    v_context_used_tokens,
    CASE
      WHEN v_context_used_percent <= 10 THEN NOW()
      ELSE v_existing_state.last_context_refresh_at
    END,
    v_accepts_tasks,
    v_estimated_response_time_seconds,
    v_availability_reason,
    v_availability_reason,
    NOW(),
    0,
    v_heartbeat_interval_seconds,
    COALESCE(p_current_session_id, v_existing_state.current_session_id),
    NOW()
  )
  ON CONFLICT (agent_id) DO UPDATE SET
    current_compute_load_percent = EXCLUDED.current_compute_load_percent,
    active_task_count = EXCLUDED.active_task_count,
    max_concurrent_tasks = COALESCE(agent_operational_state.max_concurrent_tasks, EXCLUDED.max_concurrent_tasks),
    available_budget_sats = EXCLUDED.available_budget_sats,
    reserved_budget_sats = EXCLUDED.reserved_budget_sats,
    total_budget_sats = EXCLUDED.total_budget_sats,
    token_balance_snapshot = EXCLUDED.token_balance_snapshot,
    context_window_used_percent = EXCLUDED.context_window_used_percent,
    context_window_size_tokens = COALESCE(agent_operational_state.context_window_size_tokens, EXCLUDED.context_window_size_tokens),
    context_window_used_tokens = EXCLUDED.context_window_used_tokens,
    last_context_refresh_at = EXCLUDED.last_context_refresh_at,
    accepts_new_tasks = EXCLUDED.accepts_new_tasks,
    estimated_response_time_seconds = EXCLUDED.estimated_response_time_seconds,
    pause_reason = EXCLUDED.pause_reason,
    availability_reason = EXCLUDED.availability_reason,
    last_heartbeat = EXCLUDED.last_heartbeat,
    heartbeat_failures = 0,
    heartbeat_interval_seconds = EXCLUDED.heartbeat_interval_seconds,
    current_session_id = COALESCE(EXCLUDED.current_session_id, agent_operational_state.current_session_id),
    updated_at = EXCLUDED.updated_at;

  IF v_was_offline AND p_current_session_id IS NOT NULL THEN
    UPDATE agent_sessions
    SET status = 'ACTIVE',
        last_activity_at = NOW()
    WHERE session_id = p_current_session_id
      AND status = 'PAUSED'
      AND agent_id = p_agent_id;
  END IF;

  SELECT snapshot_at
  INTO v_last_snapshot_at
  FROM agent_state_snapshots
  WHERE agent_id = p_agent_id
  ORDER BY snapshot_at DESC
  LIMIT 1;

  IF v_last_snapshot_at IS NULL OR v_last_snapshot_at < NOW() - INTERVAL '5 minutes' THEN
    INSERT INTO agent_state_snapshots (
      agent_id,
      current_compute_load_percent,
      active_task_count,
      available_budget_sats,
      reserved_budget_sats,
      total_budget_sats,
      context_window_used_percent,
      context_window_used_tokens,
      accepts_new_tasks,
      availability_reason,
      snapshot_at
    ) VALUES (
      p_agent_id,
      v_compute_load,
      v_active_tasks,
      v_available_budget,
      v_reserved_budget,
      v_total_budget,
      v_context_used_percent,
      v_context_used_tokens,
      v_accepts_tasks,
      v_availability_reason,
      NOW()
    );
  END IF;

  SELECT json_build_object(
    'agent_id', agent_id,
    'status', CASE
      WHEN last_heartbeat < NOW() - INTERVAL '5 minutes' THEN 'offline'
      WHEN NOT accepts_new_tasks AND availability_reason = 'MANUAL_PAUSE' THEN 'paused'
      WHEN NOT accepts_new_tasks AND availability_reason = 'BUDGET_DEPLETED' THEN 'low_budget'
      WHEN current_compute_load_percent >= 95 THEN 'overloaded'
      WHEN current_compute_load_percent >= 60 OR context_window_used_percent >= 70 THEN 'busy'
      ELSE 'available'
    END,
    'load_percent', current_compute_load_percent,
    'active_tasks', active_task_count,
    'budget_sats', available_budget_sats,
    'reserved_budget_sats', reserved_budget_sats,
    'total_budget_sats', total_budget_sats,
    'context_window_used_percent', context_window_used_percent,
    'context_window_used_tokens', context_window_used_tokens,
    'accepts_tasks', accepts_new_tasks,
    'availability_reason', availability_reason,
    'estimated_response_time_seconds', estimated_response_time_seconds,
    'current_session_id', current_session_id,
    'last_heartbeat', last_heartbeat,
    'is_online', last_heartbeat >= NOW() - INTERVAL '5 minutes'
  ) INTO v_result
  FROM agent_operational_state
  WHERE agent_id = p_agent_id;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION mark_stale_agents() RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_stale_agent RECORD;
BEGIN
  FOR v_stale_agent IN
    SELECT aos.agent_id, aos.current_session_id, aos.last_heartbeat
    FROM agent_operational_state aos
    WHERE aos.last_heartbeat < NOW() - INTERVAL '5 minutes'
      AND aos.accepts_new_tasks = TRUE
  LOOP
    UPDATE agent_operational_state
    SET
      heartbeat_failures = heartbeat_failures + 1,
      accepts_new_tasks = FALSE,
      pause_reason = 'Heartbeat timeout (no response in 5 minutes)',
      availability_reason = 'OFFLINE',
      current_session_id = NULL,
      updated_at = NOW()
    WHERE agent_id = v_stale_agent.agent_id;

    IF v_stale_agent.current_session_id IS NOT NULL THEN
      UPDATE agent_sessions
      SET status = 'PAUSED',
          last_activity_at = NOW()
      WHERE session_id = v_stale_agent.current_session_id
        AND status = 'ACTIVE';
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE VIEW agent_health_summary AS
SELECT
  aos.agent_id,
  ap.agent_name,
  ap.created_by_user_id AS creator_id,
  CASE
    WHEN aos.last_heartbeat < NOW() - INTERVAL '5 minutes' THEN 'offline'
    WHEN NOT aos.accepts_new_tasks AND aos.availability_reason = 'MANUAL_PAUSE' THEN 'paused'
    WHEN NOT aos.accepts_new_tasks AND aos.availability_reason = 'BUDGET_DEPLETED' THEN 'low_budget'
    WHEN aos.current_compute_load_percent >= 95 OR aos.availability_reason = 'COMPUTE_OVERLOADED' THEN 'overloaded'
    WHEN aos.current_compute_load_percent >= 60
      OR aos.context_window_used_percent >= 70
      OR aos.active_task_count >= GREATEST(aos.max_concurrent_tasks - 1, 1) THEN 'busy'
    ELSE 'available'
  END AS health_status,
  aos.current_compute_load_percent,
  aos.active_task_count,
  aos.max_concurrent_tasks,
  aos.available_budget_sats,
  aos.reserved_budget_sats,
  aos.total_budget_sats,
  aos.context_window_used_percent,
  aos.context_window_used_tokens,
  aos.accepts_new_tasks,
  aos.availability_reason,
  aos.pause_reason,
  aos.estimated_response_time_seconds,
  aos.current_session_id,
  aos.last_heartbeat,
  aos.heartbeat_interval_seconds,
  (aos.last_heartbeat >= NOW() - INTERVAL '5 minutes') AS is_online,
  EXTRACT(EPOCH FROM (NOW() - aos.last_heartbeat)) AS seconds_since_heartbeat
FROM agent_operational_state aos
JOIN agent_profiles ap ON aos.agent_id = ap.user_identity_id
WHERE ap.lifecycle_state = 'ACTIVE';

GRANT SELECT ON agent_health_summary TO authenticated;
GRANT SELECT ON agent_health_summary TO service_role;