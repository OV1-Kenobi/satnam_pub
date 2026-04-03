-- Agent Operational State Tracking (Phase 0.5)
-- Enables real-time monitoring of agent health, load, and availability

CREATE TABLE IF NOT EXISTS agent_operational_state (
  agent_id TEXT PRIMARY KEY REFERENCES user_identities(id) ON DELETE CASCADE,
  
  -- Real-time resource tracking
  current_compute_load_percent INTEGER CHECK (current_compute_load_percent >= 0 AND current_compute_load_percent <= 100) DEFAULT 0,
  active_task_count INTEGER DEFAULT 0,
  max_concurrent_tasks INTEGER DEFAULT 5,
  
  -- Budget/token tracking
  available_budget_sats BIGINT DEFAULT 0,
  token_balance_snapshot JSONB DEFAULT '{}'::jsonb,
  
  -- Context window management
  context_window_used_percent INTEGER CHECK (context_window_used_percent >= 0 AND context_window_used_percent <= 100) DEFAULT 0,
  last_context_refresh_at TIMESTAMPTZ,
  
  -- Availability signaling
  accepts_new_tasks BOOLEAN DEFAULT TRUE,
  estimated_response_time_seconds INTEGER DEFAULT 30,
  pause_reason TEXT,
  
  -- Heartbeat tracking
  last_heartbeat TIMESTAMPTZ DEFAULT NOW(),
  heartbeat_failures INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_agent_ops_availability 
  ON agent_operational_state(accepts_new_tasks, current_compute_load_percent);
CREATE INDEX IF NOT EXISTS idx_agent_ops_heartbeat 
  ON agent_operational_state(last_heartbeat DESC);

-- RLS policies
ALTER TABLE agent_operational_state ENABLE ROW LEVEL SECURITY;

-- Agents can update their own state
CREATE POLICY "agent_ops_own_update" ON agent_operational_state
  FOR UPDATE USING (agent_id = auth.uid()::TEXT);

-- Agents can read their own state
CREATE POLICY "agent_ops_own_read" ON agent_operational_state
  FOR SELECT USING (agent_id = auth.uid()::TEXT);

-- Humans can read state of agents they created
CREATE POLICY "agent_ops_creator_read" ON agent_operational_state
  FOR SELECT USING (
    agent_id IN (
      SELECT ap.user_identity_id 
      FROM agent_profiles ap 
      WHERE ap.created_by_user_id = auth.uid()::TEXT
    )
  );

-- Service role full access
CREATE POLICY "agent_ops_service_all" ON agent_operational_state
  FOR ALL USING (auth.role() = 'service_role');

-- Heartbeat RPC function (called by agents every 60s)
CREATE OR REPLACE FUNCTION agent_heartbeat(
  p_agent_id UUID,
  p_load_percent INTEGER DEFAULT NULL,
  p_active_tasks INTEGER DEFAULT NULL,
  p_available_budget BIGINT DEFAULT NULL,
  p_accepts_tasks BOOLEAN DEFAULT NULL,
  p_context_used_percent INTEGER DEFAULT NULL,
  p_token_balances JSONB DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
  v_result JSON;
BEGIN
  -- Upsert operational state
  INSERT INTO agent_operational_state (
    agent_id,
    current_compute_load_percent,
    active_task_count,
    available_budget_sats,
    accepts_new_tasks,
    context_window_used_percent,
    token_balance_snapshot,
    last_heartbeat,
    heartbeat_failures,
    updated_at
  ) VALUES (
    p_agent_id,
    COALESCE(p_load_percent, 0),
    COALESCE(p_active_tasks, 0),
    COALESCE(p_available_budget, 0),
    COALESCE(p_accepts_tasks, TRUE),
    COALESCE(p_context_used_percent, 0),
    COALESCE(p_token_balances, '{}'::jsonb),
    NOW(),
    0, -- Reset failure count on successful heartbeat
    NOW()
  )
  ON CONFLICT (agent_id) DO UPDATE SET
    current_compute_load_percent = COALESCE(p_load_percent, agent_operational_state.current_compute_load_percent),
    active_task_count = COALESCE(p_active_tasks, agent_operational_state.active_task_count),
    available_budget_sats = COALESCE(p_available_budget, agent_operational_state.available_budget_sats),
    accepts_new_tasks = COALESCE(p_accepts_tasks, agent_operational_state.accepts_new_tasks),
    context_window_used_percent = COALESCE(p_context_used_percent, agent_operational_state.context_window_used_percent),
    token_balance_snapshot = COALESCE(p_token_balances, agent_operational_state.token_balance_snapshot),
    last_heartbeat = NOW(),
    heartbeat_failures = 0,
    updated_at = NOW();

  -- Return current state
  SELECT json_build_object(
    'agent_id', agent_id,
    'status', CASE 
      WHEN NOT accepts_new_tasks THEN 'paused'
      WHEN current_compute_load_percent > 80 THEN 'overloaded'
      WHEN current_compute_load_percent > 50 THEN 'busy'
      WHEN available_budget_sats < 100 THEN 'low_budget'
      ELSE 'available'
    END,
    'load_percent', current_compute_load_percent,
    'active_tasks', active_task_count,
    'budget_sats', available_budget_sats,
    'accepts_tasks', accepts_new_tasks,
    'last_heartbeat', last_heartbeat
  ) INTO v_result
  FROM agent_operational_state
  WHERE agent_id = p_agent_id;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Mark stale agents (no heartbeat in 5 minutes)
CREATE OR REPLACE FUNCTION mark_stale_agents() RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE agent_operational_state
  SET 
    heartbeat_failures = heartbeat_failures + 1,
    accepts_new_tasks = FALSE,
    pause_reason = 'Heartbeat timeout (no response in 5 minutes)'
  WHERE last_heartbeat < NOW() - INTERVAL '5 minutes'
    AND accepts_new_tasks = TRUE;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Health check view for humans
CREATE OR REPLACE VIEW agent_health_summary AS
SELECT 
  aos.agent_id,
  ap.agent_name,
  ap.created_by_user_id AS creator_id,
  CASE 
    WHEN aos.last_heartbeat < NOW() - INTERVAL '5 minutes' THEN 'offline'
    WHEN NOT aos.accepts_new_tasks THEN 'paused'
    WHEN aos.current_compute_load_percent > 80 THEN 'overloaded'
    WHEN aos.current_compute_load_percent > 50 THEN 'busy'
    WHEN aos.available_budget_sats < 100 THEN 'low_budget'
    ELSE 'available'
  END AS health_status,
  aos.current_compute_load_percent,
  aos.active_task_count,
  aos.max_concurrent_tasks,
  aos.available_budget_sats,
  aos.context_window_used_percent,
  aos.accepts_new_tasks,
  aos.pause_reason,
  aos.last_heartbeat,
  EXTRACT(EPOCH FROM (NOW() - aos.last_heartbeat)) AS seconds_since_heartbeat
FROM agent_operational_state aos
JOIN agent_profiles ap ON aos.agent_id = ap.user_identity_id
WHERE ap.lifecycle_state = 'ACTIVE';

-- Grant view access
GRANT SELECT ON agent_health_summary TO authenticated;