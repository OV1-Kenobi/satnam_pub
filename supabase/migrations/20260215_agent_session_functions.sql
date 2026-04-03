-- Agent Session Management Functions Enhancement (Phase 2.5 - Step 2)
-- Enhances session lifecycle management with comprehensive state tracking
-- Integrates with agent_operational_state, agent_profiles, and agent_payment_config
--
-- IMPLEMENTATION SUMMARY:
-- Task 2.1: Enhanced create_agent_session() - Returns full JSONB record, validates agent, captures operational snapshot
-- Task 2.2: Enhanced log_session_event() - Adds input/output tokens, tool tracking, auto-cost calculation, performance updates
-- Task 2.3: Added pause_session() - Pauses session with state snapshot and ownership validation
-- Task 2.4: Added resume_session() - Resumes paused session with activity timestamp update
-- Task 2.5: Added terminate_session() - Terminates session, calculates final metrics, decrements active_task_count
-- Task 2.6: Added update_session_context() - JSONB deep merge with state snapshot rollback support
-- Task 2.7: Added switch_session_channel() - Channel switching with context preservation
--
-- INTEGRATION POINTS:
-- - create_agent_session() increments agent_operational_state.active_task_count
-- - terminate_session() decrements agent_operational_state.active_task_count
-- - log_session_event() updates agent_session_performance atomically
-- - All functions use SECURITY DEFINER with search_path = public for RLS bypass
-- - All functions validate ownership (agent_id = auth.uid() OR creator-owned via agent_profiles.created_by_user_id)

-- Task 2.1: Enhanced create_agent_session() function
-- Returns full session record instead of just session_id TEXT
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
  
  -- Capture initial operational_state_snapshot from agent_operational_state
  SELECT jsonb_build_object(
    'current_compute_load_percent', current_compute_load_percent,
    'active_task_count', active_task_count,
    'max_concurrent_tasks', max_concurrent_tasks,
    'available_budget_sats', available_budget_sats,
    'token_balance_snapshot', token_balance_snapshot,
    'context_window_used_percent', context_window_used_percent,
    'accepts_new_tasks', accepts_new_tasks,
    'last_heartbeat', last_heartbeat,
    'captured_at', NOW()
  ) INTO v_operational_snapshot
  FROM agent_operational_state
  WHERE agent_id = p_agent_id;
  
  -- Set auto_hibernate_after_minutes from agent config (default 30 if not configured)
  -- Note: Currently using default, can be extended to read from agent_intent_configurations.extra_config
  v_auto_hibernate_minutes := 30;
  
  -- Generate a secure session ID
  v_session_id := 'sess_' || encode(gen_random_bytes(16), 'hex');
  
  -- Insert session with operational snapshot
  INSERT INTO agent_sessions (
    session_id, 
    agent_id, 
    human_creator_id, 
    session_type, 
    primary_channel,
    operational_state_snapshot,
    auto_hibernate_after_minutes
  ) VALUES (
    v_session_id, 
    p_agent_id, 
    v_effective_human_creator_id, 
    p_session_type, 
    p_primary_channel,
    v_operational_snapshot,
    v_auto_hibernate_minutes
  )
  RETURNING jsonb_build_object(
    'id', id,
    'session_id', session_id,
    'agent_id', agent_id,
    'human_creator_id', human_creator_id,
    'session_type', session_type,
    'status', status,
    'primary_channel', primary_channel,
    'auto_hibernate_after_minutes', auto_hibernate_after_minutes,
    'operational_state_snapshot', operational_state_snapshot,
    'started_at', started_at,
    'last_activity_at', last_activity_at
  ) INTO v_session_record;
  
  -- Increment active_task_count in agent_operational_state
  UPDATE agent_operational_state
  SET active_task_count = active_task_count + 1,
      updated_at = NOW()
  WHERE agent_id = p_agent_id;
  
  RETURN v_session_record;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Task 2.2: Enhanced log_session_event() function
-- Adds input/output token tracking, tool parameters, auto-cost calculation, and performance updates
CREATE OR REPLACE FUNCTION log_session_event(
  p_session_id TEXT,
  p_event_type TEXT,
  p_event_data JSONB,
  p_tokens_used INTEGER DEFAULT 0,
  p_sats_cost BIGINT DEFAULT 0,
  p_input_tokens INTEGER DEFAULT 0,
  p_output_tokens INTEGER DEFAULT 0,
  p_tool_name TEXT DEFAULT NULL,
  p_tool_parameters JSONB DEFAULT NULL,
  p_tool_result JSONB DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
  v_agent_id UUID;
  v_calculated_sats_cost BIGINT;
  v_total_tokens INTEGER;
BEGIN
  -- Get agent_id for the session
  SELECT agent_id INTO v_agent_id
  FROM agent_sessions
  WHERE session_id = p_session_id;

  IF v_agent_id IS NULL THEN
    RAISE EXCEPTION 'Session % not found', p_session_id;
  END IF;

  IF v_agent_id != auth.uid() AND
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

  -- Calculate total tokens
  v_total_tokens := GREATEST(p_tokens_used, p_input_tokens + p_output_tokens);

  -- Auto-calculate sats_cost if not provided
  -- Using simple rate: 1 sat per 1000 tokens (can be enhanced with agent_payment_config lookup)
  IF p_sats_cost = 0 AND v_total_tokens > 0 THEN
    v_calculated_sats_cost := GREATEST(1, v_total_tokens / 1000);
  ELSE
    v_calculated_sats_cost := p_sats_cost;
  END IF;

  -- Insert session event with enhanced fields
  INSERT INTO agent_session_events (
    session_id,
    event_type,
    event_data,
    tokens_used,
    sats_cost,
    input_tokens,
    output_tokens,
    tool_name,
    tool_parameters,
    tool_result
  ) VALUES (
    p_session_id,
    p_event_type,
    p_event_data,
    v_total_tokens,
    v_calculated_sats_cost,
    p_input_tokens,
    p_output_tokens,
    p_tool_name,
    p_tool_parameters,
    p_tool_result
  ) RETURNING id INTO v_event_id;

  -- Update session last_activity, resource usage, and updated_at
  UPDATE agent_sessions
  SET last_activity_at = NOW(),
      total_messages = total_messages + CASE WHEN p_event_type = 'MESSAGE' THEN 1 ELSE 0 END,
      total_tool_calls = total_tool_calls + CASE WHEN p_event_type = 'TOOL_CALL' THEN 1 ELSE 0 END,
      tokens_consumed = tokens_consumed + v_total_tokens,
      sats_spent = sats_spent + v_calculated_sats_cost,
      updated_at = NOW()
  WHERE session_id = p_session_id;

  -- Update agent_session_performance running totals atomically
  INSERT INTO agent_session_performance (
    session_id,
    response_count,
    total_response_time_ms,
    recorded_at
  ) VALUES (
    p_session_id,
    1,
    0,
    NOW()
  )
  ON CONFLICT (session_id) DO UPDATE SET
    response_count = agent_session_performance.response_count + 1,
    error_count = agent_session_performance.error_count +
      CASE WHEN p_event_type = 'ERROR' THEN 1 ELSE 0 END,
    warning_count = agent_session_performance.warning_count +
      CASE WHEN p_event_type = 'WARNING' THEN 1 ELSE 0 END,
    recorded_at = NOW();

  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Task 2.3: Add pause_session() function
-- Pauses a session and captures state snapshot
CREATE OR REPLACE FUNCTION pause_session(
  p_session_id TEXT
) RETURNS JSONB AS $$
DECLARE
  v_agent_id UUID;
  v_conversation_context JSONB;
  v_result JSONB;
BEGIN
  -- Get session details and validate ownership
  SELECT agent_id, conversation_context INTO v_agent_id, v_conversation_context
  FROM agent_sessions
  WHERE session_id = p_session_id;

  IF v_agent_id IS NULL THEN
    RAISE EXCEPTION 'Session % not found', p_session_id;
  END IF;

  -- Validate caller owns the session (agent_id = auth.uid() or creator check)
  IF v_agent_id != auth.uid() AND
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

  -- Update session status to PAUSED
  UPDATE agent_sessions
  SET status = 'PAUSED',
      updated_at = NOW()
  WHERE session_id = p_session_id;

  -- Log STATE_SNAPSHOT event with current conversation_context
  PERFORM log_session_event(
    p_session_id,
    'STATE_SNAPSHOT',
    jsonb_build_object(
      'reason', 'session_paused',
      'conversation_context', v_conversation_context,
      'paused_at', NOW()
    )
  );

  v_result := jsonb_build_object(
    'session_id', p_session_id,
    'status', 'PAUSED',
    'message', 'Session paused successfully'
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Task 2.4: Add resume_session() function
-- Resumes a paused session
CREATE OR REPLACE FUNCTION resume_session(
  p_session_id TEXT
) RETURNS JSONB AS $$
DECLARE
  v_agent_id UUID;
  v_result JSONB;
BEGIN
  -- Get session details and validate ownership
  SELECT agent_id INTO v_agent_id
  FROM agent_sessions
  WHERE session_id = p_session_id;

  IF v_agent_id IS NULL THEN
    RAISE EXCEPTION 'Session % not found', p_session_id;
  END IF;

  -- Validate caller owns the session
  IF v_agent_id != auth.uid() AND
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

  -- Update session status to ACTIVE and update last_activity_at
  UPDATE agent_sessions
  SET status = 'ACTIVE',
      last_activity_at = NOW(),
      updated_at = NOW()
  WHERE session_id = p_session_id;

  -- Log INFO event for session resume
  PERFORM log_session_event(
    p_session_id,
    'INFO',
    jsonb_build_object(
      'event', 'session_resumed',
      'resumed_at', NOW()
    )
  );

  v_result := jsonb_build_object(
    'session_id', p_session_id,
    'status', 'ACTIVE',
    'message', 'Session resumed successfully'
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Task 2.5: Add terminate_session() function
-- Terminates a session and calculates final performance metrics
CREATE OR REPLACE FUNCTION terminate_session(
  p_session_id TEXT,
  p_reason TEXT DEFAULT 'normal'
) RETURNS JSONB AS $$
DECLARE
  v_agent_id UUID;
  v_conversation_context JSONB;
  v_started_at TIMESTAMPTZ;
  v_total_messages INTEGER;
  v_total_tool_calls INTEGER;
  v_tokens_consumed INTEGER;
  v_sats_spent BIGINT;
  v_session_duration_minutes INTEGER;
  v_result JSONB;
BEGIN
  -- Get session details and validate ownership
  SELECT
    agent_id,
    conversation_context,
    started_at,
    total_messages,
    total_tool_calls,
    tokens_consumed,
    sats_spent
  INTO
    v_agent_id,
    v_conversation_context,
    v_started_at,
    v_total_messages,
    v_total_tool_calls,
    v_tokens_consumed,
    v_sats_spent
  FROM agent_sessions
  WHERE session_id = p_session_id;

  IF v_agent_id IS NULL THEN
    RAISE EXCEPTION 'Session % not found', p_session_id;
  END IF;

  -- Validate caller owns the session
  IF v_agent_id != auth.uid() AND
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

  -- Calculate session duration
  v_session_duration_minutes := EXTRACT(EPOCH FROM (NOW() - v_started_at)) / 60;

  -- Update session status to TERMINATED
  UPDATE agent_sessions
  SET status = 'TERMINATED',
      terminated_at = NOW(),
      termination_reason = p_reason,
      updated_at = NOW()
  WHERE session_id = p_session_id;

  -- Log final STATE_SNAPSHOT event
  PERFORM log_session_event(
    p_session_id,
    'STATE_SNAPSHOT',
    jsonb_build_object(
      'reason', 'session_terminated',
      'termination_reason', p_reason,
      'conversation_context', v_conversation_context,
      'terminated_at', NOW()
    )
  );

  -- Log INFO event with termination reason
  PERFORM log_session_event(
    p_session_id,
    'INFO',
    jsonb_build_object(
      'event', 'session_terminated',
      'reason', p_reason,
      'terminated_at', NOW()
    )
  );

  -- Calculate and store final performance metrics
  INSERT INTO agent_session_performance (
    session_id,
    session_duration_minutes,
    response_count,
    avg_tokens_per_message,
    recorded_at
  ) VALUES (
    p_session_id,
    v_session_duration_minutes,
    v_total_messages + v_total_tool_calls,
    CASE WHEN v_total_messages > 0 THEN v_tokens_consumed / v_total_messages ELSE 0 END,
    NOW()
  )
  ON CONFLICT (session_id) DO UPDATE SET
    session_duration_minutes = v_session_duration_minutes,
    avg_tokens_per_message = CASE
      WHEN v_total_messages > 0 THEN v_tokens_consumed / v_total_messages
      ELSE agent_session_performance.avg_tokens_per_message
    END,
    recorded_at = NOW();

  -- Update agent_operational_state.active_task_count (decrement)
  UPDATE agent_operational_state
  SET active_task_count = GREATEST(0, active_task_count - 1),
      updated_at = NOW()
  WHERE agent_id = v_agent_id;

  v_result := jsonb_build_object(
    'session_id', p_session_id,
    'status', 'TERMINATED',
    'reason', p_reason,
    'duration_minutes', v_session_duration_minutes,
    'total_messages', v_total_messages,
    'total_tool_calls', v_total_tool_calls,
    'tokens_consumed', v_tokens_consumed,
    'sats_spent', v_sats_spent,
    'message', 'Session terminated successfully'
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Task 2.6: Add update_session_context() function
-- Merges new context into conversation_context with state snapshot support
CREATE OR REPLACE FUNCTION update_session_context(
  p_session_id TEXT,
  p_context JSONB
) RETURNS JSONB AS $$
DECLARE
  v_agent_id UUID;
  v_old_context JSONB;
  v_new_context JSONB;
  v_state_snapshots JSONB;
  v_result JSONB;
BEGIN
  -- Get session details and validate ownership
  SELECT agent_id, conversation_context, state_snapshots
  INTO v_agent_id, v_old_context, v_state_snapshots
  FROM agent_sessions
  WHERE session_id = p_session_id;

  IF v_agent_id IS NULL THEN
    RAISE EXCEPTION 'Session % not found', p_session_id;
  END IF;

  -- Validate caller owns the session
  IF v_agent_id != auth.uid() AND
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

  -- Merge new context into existing conversation_context (JSONB deep merge).
  -- NULL existing context means the session is uninitialized — accept any type as the initial value.
  -- Matched types: arrays are concatenated, objects are shallow-merged (p_context keys win on conflict).
  -- Type mismatches raise an exception to prevent silent data loss.
  IF v_old_context IS NULL THEN
    v_new_context := p_context;
  ELSIF jsonb_typeof(v_old_context) = 'array' AND jsonb_typeof(p_context) = 'array' THEN
    v_new_context := v_old_context || p_context;
  ELSIF jsonb_typeof(v_old_context) = 'object' AND jsonb_typeof(p_context) = 'object' THEN
    v_new_context := v_old_context || p_context;
  ELSE
    RAISE EXCEPTION
      'Context type mismatch for session %: existing context is % but incoming context is %. '
      'Provide a context value of the same type to prevent data loss.',
      p_session_id,
      COALESCE(jsonb_typeof(v_old_context), 'null'),
      COALESCE(jsonb_typeof(p_context), 'null');
  END IF;

  -- Append to state_snapshots for rollback capability
  v_state_snapshots := v_state_snapshots || jsonb_build_object(
    to_char(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    jsonb_build_object(
      'context', v_old_context,
      'snapshot_reason', 'context_update',
      'timestamp', NOW()
    )
  );

  -- Update session with new context and snapshots
  UPDATE agent_sessions
  SET conversation_context = v_new_context,
      state_snapshots = v_state_snapshots,
      last_activity_at = NOW(),
      updated_at = NOW()
  WHERE session_id = p_session_id;

  -- Log CONTEXT_REFRESH event with diff summary
  PERFORM log_session_event(
    p_session_id,
    'CONTEXT_REFRESH',
    jsonb_build_object(
      'old_context_size', jsonb_array_length(COALESCE(v_old_context, '[]'::jsonb)),
      'new_context_size', jsonb_array_length(COALESCE(v_new_context, '[]'::jsonb)),
      'context_added', p_context,
      'refreshed_at', NOW()
    )
  );

  v_result := jsonb_build_object(
    'session_id', p_session_id,
    'context_updated', true,
    'new_context_size', jsonb_array_length(COALESCE(v_new_context, '[]'::jsonb)),
    'message', 'Session context updated successfully'
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Task 2.7: Add switch_session_channel() function
-- Switches session to a different communication channel
CREATE OR REPLACE FUNCTION switch_session_channel(
  p_session_id TEXT,
  p_new_channel TEXT
) RETURNS JSONB AS $$
DECLARE
  v_agent_id UUID;
  v_old_channel TEXT;
  v_conversation_context JSONB;
  v_result JSONB;
  v_valid_channels TEXT[] := ARRAY['nostr', 'telegram', 'web_ui', 'api', 'cli'];
BEGIN
  -- Validate p_new_channel is in allowed list
  IF NOT (p_new_channel = ANY(v_valid_channels)) THEN
    RAISE EXCEPTION 'Invalid channel: %. Must be one of: %', p_new_channel, v_valid_channels;
  END IF;

  -- Get session details and validate ownership
  SELECT agent_id, primary_channel, conversation_context
  INTO v_agent_id, v_old_channel, v_conversation_context
  FROM agent_sessions
  WHERE session_id = p_session_id;

  IF v_agent_id IS NULL THEN
    RAISE EXCEPTION 'Session % not found', p_session_id;
  END IF;

  -- Validate caller owns the session
  IF v_agent_id != auth.uid() AND
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

  -- Update session primary_channel
  UPDATE agent_sessions
  SET primary_channel = p_new_channel,
      last_activity_at = NOW(),
      updated_at = NOW()
  WHERE session_id = p_session_id;

  -- Log CHANNEL_SWITCH event with old/new channel
  PERFORM log_session_event(
    p_session_id,
    'CHANNEL_SWITCH',
    jsonb_build_object(
      'old_channel', v_old_channel,
      'new_channel', p_new_channel,
      'conversation_context_preserved', true,
      'switched_at', NOW()
    )
  );

  v_result := jsonb_build_object(
    'session_id', p_session_id,
    'old_channel', v_old_channel,
    'new_channel', p_new_channel,
    'context_preserved', true,
    'message', 'Channel switched successfully'
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

