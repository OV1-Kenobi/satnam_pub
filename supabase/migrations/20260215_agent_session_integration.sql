-- Agent Session Integration (Phase 2.5 - Step 5)
-- Bidirectional integration between sessions, operational state, and task records
-- Enables session-aware task tracking and heartbeat-driven session management
--
-- IMPLEMENTATION SUMMARY:
-- Task 5.1: Add current_session_id to agent_operational_state
-- Task 5.2: Add session_id to agent_task_records
-- Task 5.3: Create link_task_to_session() function
-- Task 5.4: Create trigger for task completion events
-- Task 5.5: Update agent_heartbeat() function
-- Task 5.6: Create session_task_summary view
--
-- INTEGRATION POINTS:
-- - Bidirectional link: sessions ↔ tasks
-- - Heartbeat integration: auto-pause sessions when agent goes offline
-- - Task completion events feed into session cost tracking

-- Task 5.1: Add current_session_id to agent_operational_state
-- Enables direct join from operational state to current active session
DO $$
BEGIN
  -- Add column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'agent_operational_state' 
    AND column_name = 'current_session_id'
  ) THEN
    ALTER TABLE agent_operational_state
    ADD COLUMN current_session_id TEXT REFERENCES agent_sessions(session_id) ON DELETE SET NULL;
    
    -- Add index for efficient joins
    CREATE INDEX IF NOT EXISTS idx_agent_ops_current_session 
      ON agent_operational_state(current_session_id);
  END IF;
END $$;

-- Task 5.2: Add session_id to agent_task_records
-- Links tasks to the session in which they were created
DO $$
BEGIN
  -- Add column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'agent_task_records' 
    AND column_name = 'session_id'
  ) THEN
    ALTER TABLE agent_task_records
    ADD COLUMN session_id TEXT REFERENCES agent_sessions(session_id) ON DELETE SET NULL;
    
    -- Add index for efficient session-task queries
    CREATE INDEX IF NOT EXISTS idx_task_records_session 
      ON agent_task_records(session_id);
  END IF;
END $$;

-- Task 5.3: Create link_task_to_session() function
-- Links a task to a session with validation and event logging
CREATE OR REPLACE FUNCTION link_task_to_session(
  p_task_id UUID,
  p_session_id TEXT
) RETURNS JSONB AS $$
DECLARE
  v_task_agent_id UUID;
  v_session_agent_id UUID;
  v_task_title TEXT;
  v_event_id UUID;
BEGIN
  -- Get task details
  SELECT assignee_agent_id, task_title INTO v_task_agent_id, v_task_title
  FROM agent_task_records
  WHERE id = p_task_id;
  
  IF v_task_agent_id IS NULL THEN
    RAISE EXCEPTION 'Task with id % does not exist', p_task_id;
  END IF;
  
  -- Get session agent
  SELECT agent_id INTO v_session_agent_id
  FROM agent_sessions
  WHERE session_id = p_session_id;
  
  IF v_session_agent_id IS NULL THEN
    RAISE EXCEPTION 'Session with id % does not exist', p_session_id;
  END IF;
  
  -- Validate both belong to same agent
  IF v_task_agent_id != v_session_agent_id THEN
    RAISE EXCEPTION 'Task agent (%) does not match session agent (%)', 
      v_task_agent_id, v_session_agent_id;
  END IF;
  
  -- Update task with session link
  UPDATE agent_task_records
  SET session_id = p_session_id
  WHERE id = p_task_id;
  
  -- Log TASK_ASSIGNMENT event in session
  INSERT INTO agent_session_events (
    session_id,
    event_type,
    event_data
  ) VALUES (
    p_session_id,
    'TASK_ASSIGNMENT',
    jsonb_build_object(
      'task_id', p_task_id,
      'task_title', v_task_title,
      'assigned_at', NOW()
    )
  ) RETURNING id INTO v_event_id;
  
  -- Return success summary
  RETURN jsonb_build_object(
    'success', true,
    'task_id', p_task_id,
    'session_id', p_session_id,
    'event_id', v_event_id,
    'linked_at', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Task 5.4: Create trigger for task completion events
-- Logs task completion/failure events to session timeline
CREATE OR REPLACE FUNCTION log_task_completion_to_session()
RETURNS TRIGGER AS $$
DECLARE
  v_duration_seconds INTEGER;
  v_event_type TEXT;
BEGIN
  -- Only process if task has a session and status changed to completed/failed
  IF NEW.session_id IS NOT NULL 
     AND NEW.status IN ('completed', 'failed') 
     AND (OLD.status IS NULL OR OLD.status NOT IN ('completed', 'failed')) THEN
    
    -- Calculate duration
    v_duration_seconds := EXTRACT(EPOCH FROM (NEW.completed_at - NEW.started_at));
    
    -- Determine event type
    v_event_type := CASE 
      WHEN NEW.status = 'completed' THEN 'TASK_COMPLETION'
      ELSE 'TASK_FAILURE'
    END;
    
    -- Log event to session
    INSERT INTO agent_session_events (
      session_id,
      event_type,
      event_data,
      sats_cost
    ) VALUES (
      NEW.session_id,
      v_event_type,
      jsonb_build_object(
        'task_id', NEW.id,
        'task_title', NEW.task_title,
        'task_type', NEW.task_type,
        'duration_seconds', v_duration_seconds,
        'actual_cost_sats', NEW.actual_cost_sats,
        'quality_score', NEW.quality_score,
        'validation_tier', NEW.validation_tier,
        'completed_at', NEW.completed_at
      ),
      NEW.actual_cost_sats
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger on agent_task_records
DROP TRIGGER IF EXISTS trigger_log_task_completion ON agent_task_records;
CREATE TRIGGER trigger_log_task_completion
  AFTER UPDATE ON agent_task_records
  FOR EACH ROW
  EXECUTE FUNCTION log_task_completion_to_session();

-- Task 5.5: Update agent_heartbeat() function
-- Enhanced to include current_session_id and auto-pause sessions when agent goes offline
CREATE OR REPLACE FUNCTION agent_heartbeat(
  p_agent_id UUID,
  p_load_percent INTEGER DEFAULT NULL,
  p_active_tasks INTEGER DEFAULT NULL,
  p_available_budget BIGINT DEFAULT NULL,
  p_accepts_tasks BOOLEAN DEFAULT NULL,
  p_context_used_percent INTEGER DEFAULT NULL,
  p_token_balances JSONB DEFAULT NULL,
  p_current_session_id TEXT DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
  v_result JSON;
  v_previous_heartbeat TIMESTAMPTZ;
  v_was_offline BOOLEAN;
BEGIN
  -- Get previous heartbeat time to detect offline→online transitions
  SELECT last_heartbeat INTO v_previous_heartbeat
  FROM agent_operational_state
  WHERE agent_id = p_agent_id;

  -- Check if agent was offline (no heartbeat in 5+ minutes)
  v_was_offline := (v_previous_heartbeat IS NULL OR v_previous_heartbeat < NOW() - INTERVAL '5 minutes');

  -- Upsert operational state with current_session_id
  INSERT INTO agent_operational_state (
    agent_id,
    current_compute_load_percent,
    active_task_count,
    available_budget_sats,
    accepts_new_tasks,
    context_window_used_percent,
    token_balance_snapshot,
    current_session_id,
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
    p_current_session_id,
    NOW(),
    0, -- Reset failures on successful heartbeat
    NOW()
  )
  ON CONFLICT (agent_id) DO UPDATE SET
    current_compute_load_percent = COALESCE(p_load_percent, agent_operational_state.current_compute_load_percent),
    active_task_count = COALESCE(p_active_tasks, agent_operational_state.active_task_count),
    available_budget_sats = COALESCE(p_available_budget, agent_operational_state.available_budget_sats),
    accepts_new_tasks = COALESCE(p_accepts_tasks, agent_operational_state.accepts_new_tasks),
    context_window_used_percent = COALESCE(p_context_used_percent, agent_operational_state.context_window_used_percent),
    token_balance_snapshot = COALESCE(p_token_balances, agent_operational_state.token_balance_snapshot),
    current_session_id = COALESCE(p_current_session_id, agent_operational_state.current_session_id),
    last_heartbeat = NOW(),
    heartbeat_failures = 0,
    updated_at = NOW();

  -- If agent was offline and now online, resume any paused sessions
  IF v_was_offline AND p_current_session_id IS NOT NULL THEN
    UPDATE agent_sessions
    SET status = 'ACTIVE',
        last_activity_at = NOW()
    WHERE session_id = p_current_session_id
      AND status = 'PAUSED'
      AND agent_id = p_agent_id;
  END IF;

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
    'current_session_id', current_session_id,
    'last_heartbeat', last_heartbeat
  ) INTO v_result
  FROM agent_operational_state
  WHERE agent_id = p_agent_id;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Enhanced mark_stale_agents() to auto-pause active sessions
CREATE OR REPLACE FUNCTION mark_stale_agents() RETURNS INTEGER AS $
DECLARE
  v_count INTEGER := 0;
  v_stale_agent RECORD;
BEGIN
  -- Find stale agents and their active sessions
  FOR v_stale_agent IN
    SELECT
      aos.agent_id,
      aos.current_session_id
    FROM agent_operational_state aos
    WHERE aos.last_heartbeat < NOW() - INTERVAL '5 minutes'
      AND aos.accepts_new_tasks = TRUE
  LOOP
    -- Update operational state
    UPDATE agent_operational_state
    SET
      heartbeat_failures = heartbeat_failures + 1,
      accepts_new_tasks = FALSE,
      pause_reason = 'Heartbeat timeout (no response in 5 minutes)',
      current_session_id = NULL
    WHERE agent_id = v_stale_agent.agent_id;

    -- Auto-pause active session if exists
    IF v_stale_agent.current_session_id IS NOT NULL THEN
      UPDATE agent_sessions
      SET status = 'PAUSED',
          last_activity_at = NOW()
      WHERE session_id = v_stale_agent.current_session_id
        AND status = 'ACTIVE';

      -- Log pause event
      INSERT INTO agent_session_events (
        session_id,
        event_type,
        event_data
      ) VALUES (
        v_stale_agent.current_session_id,
        'SESSION_PAUSED',
        jsonb_build_object(
          'reason', 'agent_offline',
          'auto_paused_at', NOW(),
          'last_heartbeat', (SELECT last_heartbeat FROM agent_operational_state WHERE agent_id = v_stale_agent.agent_id)
        )
      );
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN COALESCE(v_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Task 5.6: Create session_task_summary view
-- Aggregates task metrics per session for analytics
CREATE OR REPLACE VIEW session_task_summary AS
SELECT
  s.session_id,
  s.agent_id,
  ap.agent_name,
  ap.created_by_user_id AS creator_id,
  s.status AS session_status,
  s.session_type,
  s.primary_channel AS channel,
  s.started_at AS session_started_at,

  -- Task counts
  COUNT(t.id) AS task_count,
  COUNT(t.id) FILTER (WHERE t.status = 'completed') AS completed_tasks,
  COUNT(t.id) FILTER (WHERE t.status = 'failed') AS failed_tasks,
  COUNT(t.id) FILTER (WHERE t.status = 'in_progress') AS in_progress_tasks,
  COUNT(t.id) FILTER (WHERE t.status = 'pending') AS pending_tasks,

  -- Cost aggregations
  SUM(t.actual_cost_sats) AS total_task_cost_sats,
  ROUND(AVG(t.actual_cost_sats)) AS avg_task_cost_sats,

  -- Duration aggregations (only for completed/failed tasks)
  ROUND(AVG(t.actual_duration_seconds)) AS avg_task_duration_seconds,
  SUM(t.actual_duration_seconds) AS total_task_duration_seconds,

  -- Quality metrics
  ROUND(AVG(t.quality_score)) AS avg_quality_score,
  SUM(t.reputation_delta) AS total_reputation_delta,

  -- Validation breakdown
  COUNT(t.id) FILTER (WHERE t.validation_tier = 'self_report') AS self_reported_tasks,
  COUNT(t.id) FILTER (WHERE t.validation_tier = 'peer_verified') AS peer_verified_tasks,
  COUNT(t.id) FILTER (WHERE t.validation_tier = 'oracle_attested') AS oracle_attested_tasks,

  -- Latest task activity
  MAX(t.completed_at) AS last_task_completed_at

FROM agent_sessions s
JOIN agent_profiles ap ON s.agent_id = ap.user_identity_id
LEFT JOIN agent_task_records t ON s.session_id = t.session_id

GROUP BY
  s.session_id,
  s.agent_id,
  ap.agent_name,
  ap.created_by_user_id,
  s.status,
  s.session_type,
  s.primary_channel,
  s.started_at

ORDER BY s.started_at DESC;

-- Grant SELECT on view to authenticated users
GRANT SELECT ON session_task_summary TO authenticated;
GRANT SELECT ON session_task_summary TO service_role;

-- Update create_agent_session() to set current_session_id in operational state
-- This replaces the version from 20260215_agent_session_functions.sql
CREATE OR REPLACE FUNCTION create_agent_session(
  p_agent_id UUID,
  p_session_type TEXT,
  p_primary_channel TEXT DEFAULT 'nostr',
  p_human_creator_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_session_id TEXT;
  v_session_record JSONB;
  v_operational_snapshot JSONB;
  v_auto_hibernate_minutes INTEGER;
  v_is_agent BOOLEAN;
  v_agent_creator_id UUID;
  v_effective_human_creator_id UUID := p_human_creator_id;
BEGIN
  -- Validate agent exists in user_identities with is_agent = true
  SELECT ui.is_agent INTO v_is_agent
  FROM user_identities ui
  WHERE ui.id = p_agent_id;

  IF v_is_agent IS NULL THEN
    RAISE EXCEPTION 'Agent with id % does not exist', p_agent_id;
  END IF;

  IF v_is_agent = FALSE THEN
    RAISE EXCEPTION 'User % is not an agent (is_agent = false)', p_agent_id;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required to create session for agent %', p_agent_id;
  END IF;

  IF p_human_creator_id IS NOT NULL AND p_human_creator_id != auth.uid() THEN
    RAISE EXCEPTION 'human_creator_id must match authenticated user';
  END IF;

  IF auth.uid() != p_agent_id THEN
    SELECT created_by_user_id INTO v_agent_creator_id
    FROM agent_profiles
    WHERE user_identity_id = p_agent_id;

    IF v_agent_creator_id IS NULL OR v_agent_creator_id != auth.uid() THEN
      RAISE EXCEPTION 'Permission denied: caller cannot create sessions for agent %', p_agent_id;
    END IF;

    IF v_effective_human_creator_id IS NULL THEN
      v_effective_human_creator_id := auth.uid();
    END IF;
  END IF;

  -- Generate secure session ID
  v_session_id := 'sess_' || encode(gen_random_bytes(16), 'hex');

  -- Capture operational state snapshot
  SELECT jsonb_build_object(
    'compute_load_percent', current_compute_load_percent,
    'active_task_count', active_task_count,
    'available_budget_sats', available_budget_sats,
    'context_window_used_percent', context_window_used_percent,
    'accepts_new_tasks', accepts_new_tasks,
    'last_heartbeat', last_heartbeat
  ) INTO v_operational_snapshot
  FROM agent_operational_state
  WHERE agent_id = p_agent_id;

  -- Default auto-hibernate to 30 minutes (extensible to agent config)
  v_auto_hibernate_minutes := 30;

  -- Create session record
  INSERT INTO agent_sessions (
    session_id,
    agent_id,
    human_creator_id,
    session_type,
    primary_channel,
    operational_state_snapshot,
    auto_hibernate_after_minutes,
    started_at,
    last_activity_at
  ) VALUES (
    v_session_id,
    p_agent_id,
    v_effective_human_creator_id,
    p_session_type,
    p_primary_channel,
    v_operational_snapshot,
    v_auto_hibernate_minutes,
    NOW(),
    NOW()
  );

  -- Update operational state with current session
  UPDATE agent_operational_state
  SET
    current_session_id = v_session_id,
    active_task_count = active_task_count + 1,
    updated_at = NOW()
  WHERE agent_id = p_agent_id;

  -- Build full session record for return
  SELECT jsonb_build_object(
    'session_id', session_id,
    'agent_id', agent_id,
    'human_creator_id', human_creator_id,
    'session_type', session_type,
    'primary_channel', primary_channel,
    'status', status,
    'auto_hibernate_after_minutes', auto_hibernate_after_minutes,
    'operational_state_snapshot', operational_state_snapshot,
    'started_at', started_at,
    'last_activity_at', last_activity_at
  ) INTO v_session_record
  FROM agent_sessions
  WHERE session_id = v_session_id;

  RETURN v_session_record;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Update terminate_session() to clear current_session_id
CREATE OR REPLACE FUNCTION terminate_session(
  p_session_id TEXT,
  p_reason TEXT DEFAULT 'user_requested'
) RETURNS JSONB AS $$
DECLARE
  v_session RECORD;
  v_duration_seconds INTEGER;
  v_final_metrics JSONB;
BEGIN
  -- Get session details
  SELECT * INTO v_session
  FROM agent_sessions
  WHERE session_id = p_session_id;

  IF v_session.session_id IS NULL THEN
    RAISE EXCEPTION 'Session % does not exist', p_session_id;
  END IF;

  IF v_session.status = 'TERMINATED' THEN
    RAISE EXCEPTION 'Session % is already terminated', p_session_id;
  END IF;

  IF v_session.agent_id != auth.uid() AND
     NOT EXISTS (
       SELECT 1
       FROM agent_sessions s
       LEFT JOIN agent_profiles ap ON ap.user_identity_id = s.agent_id
       WHERE s.session_id = p_session_id
         AND (
           s.human_creator_id = auth.uid()
           OR ap.created_by_user_id = auth.uid()
         )
     ) THEN
    RAISE EXCEPTION 'Permission denied: caller does not own session %', p_session_id;
  END IF;

  -- Calculate final duration
  v_duration_seconds := EXTRACT(EPOCH FROM (NOW() - v_session.started_at));

  -- Gather final metrics
  SELECT jsonb_build_object(
    'total_messages', v_session.total_messages,
    'total_tool_calls', v_session.total_tool_calls,
    'tokens_consumed', v_session.tokens_consumed,
    'sats_spent', v_session.sats_spent,
    'duration_seconds', v_duration_seconds,
    'session_type', v_session.session_type,
    'primary_channel', v_session.primary_channel
  ) INTO v_final_metrics;

  -- Update session to terminated
  UPDATE agent_sessions
  SET
    status = 'TERMINATED',
    terminated_at = NOW(),
    termination_reason = p_reason
  WHERE session_id = p_session_id;

  -- Update operational state: decrement task count and clear current session
  UPDATE agent_operational_state
  SET
    active_task_count = GREATEST(0, active_task_count - 1),
    current_session_id = CASE
      WHEN current_session_id = p_session_id THEN NULL
      ELSE current_session_id
    END,
    updated_at = NOW()
  WHERE agent_id = v_session.agent_id;

  -- Log termination event
  INSERT INTO agent_session_events (
    session_id,
    event_type,
    event_data
  ) VALUES (
    p_session_id,
    'SESSION_TERMINATED',
    jsonb_build_object(
      'reason', p_reason,
      'final_metrics', v_final_metrics,
      'terminated_at', NOW()
    )
  );

  -- Return termination summary
  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'terminated_at', NOW(),
    'reason', p_reason,
    'final_metrics', v_final_metrics
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

