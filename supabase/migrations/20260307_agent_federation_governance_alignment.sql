-- Phase 1 alignment: agent governance, federation scoping, and session authority
-- This forward migration aligns the existing active agent migrations without
-- relying on deprecated privacy-first migration drafts.

BEGIN;

ALTER TABLE family_federations
  ADD COLUMN IF NOT EXISTS created_by TEXT;

ALTER TABLE user_identities
  ADD COLUMN IF NOT EXISTS is_agent BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE user_identities
  ADD COLUMN IF NOT EXISTS family_federation_id UUID REFERENCES family_federations(id);

ALTER TABLE agent_profiles
  ADD COLUMN IF NOT EXISTS family_federation_id UUID;

ALTER TABLE agent_sessions
  ADD COLUMN IF NOT EXISTS created_by_user_id TEXT REFERENCES user_identities(id),
  ADD COLUMN IF NOT EXISTS family_federation_id UUID;

UPDATE family_federations ff
SET created_by = COALESCE(
  ff.created_by,
  (
    SELECT fm.user_duid
    FROM family_members fm
    WHERE fm.family_federation_id = ff.id
      AND fm.family_role = 'guardian'
      AND COALESCE(fm.is_active, TRUE)
    ORDER BY fm.joined_at ASC NULLS LAST, fm.created_at ASC NULLS LAST, fm.id ASC
    LIMIT 1
  )
)
WHERE ff.created_by IS NULL;

UPDATE user_identities ui
SET is_agent = TRUE
WHERE EXISTS (
  SELECT 1
  FROM agent_profiles ap
  WHERE ap.user_identity_id = ui.id
    AND COALESCE(ap.is_agent, FALSE) = TRUE
);

UPDATE agent_profiles ap
SET family_federation_id = ui.family_federation_id
FROM user_identities ui
WHERE ui.id = ap.user_identity_id
  AND ap.family_federation_id IS NULL
  AND ui.family_federation_id IS NOT NULL;

UPDATE agent_sessions s
SET created_by_user_id = COALESCE(s.created_by_user_id, s.human_creator_id, ap.created_by_user_id),
    family_federation_id = COALESCE(s.family_federation_id, ap.family_federation_id, ui.family_federation_id)
FROM agent_profiles ap
JOIN user_identities ui ON ui.id = ap.user_identity_id
WHERE ap.user_identity_id = s.agent_id
  AND (
    s.created_by_user_id IS NULL
    OR s.family_federation_id IS NULL
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'agent_profiles_family_federation_id_fkey'
  ) THEN
    ALTER TABLE agent_profiles
      ADD CONSTRAINT agent_profiles_family_federation_id_fkey
      FOREIGN KEY (family_federation_id) REFERENCES family_federations(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'agent_sessions_family_federation_id_fkey'
  ) THEN
    ALTER TABLE agent_sessions
      ADD CONSTRAINT agent_sessions_family_federation_id_fkey
      FOREIGN KEY (family_federation_id) REFERENCES family_federations(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_user_identities_is_agent ON user_identities(is_agent)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_user_identities_family_federation_id ON user_identities(family_federation_id)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_agent_profiles_family_federation_id ON agent_profiles(family_federation_id)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_agent_sessions_created_by_user_id ON agent_sessions(created_by_user_id)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_agent_sessions_family_federation_id ON agent_sessions(family_federation_id)';
END $$;

CREATE OR REPLACE FUNCTION is_agent_federation_authority(
  p_family_federation_id UUID,
  p_user_id TEXT
) RETURNS BOOLEAN AS $$
BEGIN
  IF p_family_federation_id IS NULL OR p_user_id IS NULL OR p_user_id = '' THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM family_federations ff
    WHERE ff.id = p_family_federation_id
      AND ff.created_by = p_user_id
  )
  OR EXISTS (
    SELECT 1
    FROM family_members fm
    WHERE fm.family_federation_id = p_family_federation_id
      AND fm.user_duid = p_user_id
      AND fm.family_role = 'guardian'
      AND COALESCE(fm.is_active, TRUE)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION is_agent_governor(
  p_agent_id UUID,
  p_user_id TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_created_by TEXT;
  v_family_federation_id UUID;
BEGIN
  IF p_agent_id IS NULL OR p_user_id IS NULL OR p_user_id = '' THEN
    RETURN FALSE;
  END IF;

  IF p_agent_id::TEXT = p_user_id THEN
    RETURN TRUE;
  END IF;

  SELECT ap.created_by_user_id::TEXT,
         COALESCE(ap.family_federation_id, ui.family_federation_id)
  INTO v_created_by, v_family_federation_id
  FROM agent_profiles ap
  JOIN user_identities ui ON ui.id = ap.user_identity_id
  WHERE ap.user_identity_id = p_agent_id;

  RETURN v_created_by = p_user_id
    OR is_agent_federation_authority(v_family_federation_id, p_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION is_agent_session_governor(
  p_session_id TEXT,
  p_user_id TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_agent_id UUID;
  v_created_by TEXT;
  v_human_creator TEXT;
  v_family_federation_id UUID;
BEGIN
  IF p_session_id IS NULL OR p_user_id IS NULL OR p_user_id = '' THEN
    RETURN FALSE;
  END IF;

  SELECT s.agent_id,
         s.created_by_user_id::TEXT,
         s.human_creator_id::TEXT,
         COALESCE(s.family_federation_id, ap.family_federation_id, ui.family_federation_id)
  INTO v_agent_id, v_created_by, v_human_creator, v_family_federation_id
  FROM agent_sessions s
  LEFT JOIN agent_profiles ap ON ap.user_identity_id = s.agent_id
  LEFT JOIN user_identities ui ON ui.id = s.agent_id
  WHERE s.session_id = p_session_id;

  RETURN v_agent_id::TEXT = p_user_id
    OR v_created_by = p_user_id
    OR v_human_creator = p_user_id
    OR is_agent_governor(v_agent_id, p_user_id)
    OR is_agent_federation_authority(v_family_federation_id, p_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

DROP POLICY IF EXISTS "agent_profiles_own_read" ON agent_profiles;
DROP POLICY IF EXISTS "agent_profiles_own_update" ON agent_profiles;

CREATE POLICY "agent_profiles_governor_read" ON agent_profiles
  FOR SELECT USING (is_agent_governor(user_identity_id, auth.uid()::TEXT));

CREATE POLICY "agent_profiles_governor_update" ON agent_profiles
  FOR UPDATE USING (is_agent_governor(user_identity_id, auth.uid()::TEXT));

DROP POLICY IF EXISTS "agent_ops_creator_read" ON agent_operational_state;

CREATE POLICY "agent_ops_governor_read" ON agent_operational_state
  FOR SELECT USING (is_agent_governor(agent_id, auth.uid()::TEXT));

DROP POLICY IF EXISTS "sessions_own_read" ON agent_sessions;
DROP POLICY IF EXISTS "sessions_own_write" ON agent_sessions;
DROP POLICY IF EXISTS "sessions_own_insert" ON agent_sessions;
DROP POLICY IF EXISTS "sessions_own_delete" ON agent_sessions;
DROP POLICY IF EXISTS "sessions_creator_read" ON agent_sessions;

CREATE POLICY "sessions_governor_read" ON agent_sessions
  FOR SELECT USING (is_agent_session_governor(session_id, auth.uid()::TEXT));

CREATE POLICY "sessions_governor_write" ON agent_sessions
  FOR UPDATE USING (is_agent_session_governor(session_id, auth.uid()::TEXT));

CREATE POLICY "sessions_governor_insert" ON agent_sessions
  FOR INSERT WITH CHECK (
    agent_id = auth.uid()::TEXT
    OR COALESCE(created_by_user_id, human_creator_id) = auth.uid()::TEXT
    OR is_agent_federation_authority(family_federation_id, auth.uid()::TEXT)
  );

CREATE POLICY "sessions_governor_delete" ON agent_sessions
  FOR DELETE USING (is_agent_session_governor(session_id, auth.uid()::TEXT));

DROP POLICY IF EXISTS "session_events_agent_own_read" ON agent_session_events;
DROP POLICY IF EXISTS "session_events_agent_own_write" ON agent_session_events;
DROP POLICY IF EXISTS "session_events_creator_read" ON agent_session_events;

CREATE POLICY "session_events_governor_read" ON agent_session_events
  FOR SELECT USING (is_agent_session_governor(session_id, auth.uid()::TEXT));

CREATE POLICY "session_events_governor_write" ON agent_session_events
  FOR INSERT WITH CHECK (is_agent_session_governor(session_id, auth.uid()::TEXT));

DROP POLICY IF EXISTS "session_metadata_agent_own_select" ON agent_session_metadata;
DROP POLICY IF EXISTS "session_metadata_agent_own_insert" ON agent_session_metadata;
DROP POLICY IF EXISTS "session_metadata_agent_own_update" ON agent_session_metadata;
DROP POLICY IF EXISTS "session_metadata_agent_own_delete" ON agent_session_metadata;

CREATE POLICY "session_metadata_governor_select" ON agent_session_metadata
  FOR SELECT USING (is_agent_session_governor(session_id, auth.uid()::TEXT));

CREATE POLICY "session_metadata_governor_insert" ON agent_session_metadata
  FOR INSERT WITH CHECK (is_agent_session_governor(session_id, auth.uid()::TEXT));

CREATE POLICY "session_metadata_governor_update" ON agent_session_metadata
  FOR UPDATE USING (is_agent_session_governor(session_id, auth.uid()::TEXT));

CREATE POLICY "session_metadata_governor_delete" ON agent_session_metadata
  FOR DELETE USING (is_agent_session_governor(session_id, auth.uid()::TEXT));

DROP POLICY IF EXISTS "session_performance_agent_own_read" ON agent_session_performance;

CREATE POLICY "session_performance_governor_read" ON agent_session_performance
  FOR SELECT USING (is_agent_session_governor(session_id, auth.uid()::TEXT));

CREATE OR REPLACE FUNCTION create_agent_session(
  p_agent_id UUID,
  p_session_type TEXT,
  p_primary_channel TEXT DEFAULT 'nostr',
  p_created_by_user_id UUID DEFAULT NULL,
  p_human_creator_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_session_id TEXT;
  v_session_record JSONB;
  v_operational_snapshot JSONB;
  v_auto_hibernate_minutes INTEGER;
  v_is_agent BOOLEAN;
  v_family_federation_id UUID;
  v_effective_creator_id UUID := COALESCE(p_created_by_user_id, p_human_creator_id, auth.uid());
BEGIN
  SELECT ui.is_agent,
         COALESCE(ap.family_federation_id, ui.family_federation_id)
  INTO v_is_agent, v_family_federation_id
  FROM user_identities ui
  JOIN agent_profiles ap ON ap.user_identity_id = ui.id
  WHERE ui.id = p_agent_id;

  IF v_is_agent IS NULL THEN
    RAISE EXCEPTION 'Agent with id % does not exist', p_agent_id;
  END IF;

  IF v_is_agent = FALSE THEN
    RAISE EXCEPTION 'User % is not an agent (is_agent = false)', p_agent_id;
  END IF;

  IF v_family_federation_id IS NULL THEN
    RAISE EXCEPTION 'Agent % is missing family_federation_id governance context', p_agent_id;
  END IF;

  IF auth.uid() IS NULL OR v_effective_creator_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to create session for agent %', p_agent_id;
  END IF;

  IF v_effective_creator_id != auth.uid() THEN
    RAISE EXCEPTION 'created_by_user_id must match authenticated user';
  END IF;

  IF NOT is_agent_governor(p_agent_id, auth.uid()::TEXT) THEN
    RAISE EXCEPTION 'Permission denied: caller cannot create sessions for agent %', p_agent_id;
  END IF;

  v_session_id := 'sess_' || encode(gen_random_bytes(16), 'hex');

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

  v_auto_hibernate_minutes := 30;

  INSERT INTO agent_sessions (
    session_id,
    agent_id,
    human_creator_id,
    created_by_user_id,
    family_federation_id,
    session_type,
    primary_channel,
    operational_state_snapshot,
    auto_hibernate_after_minutes,
    started_at,
    last_activity_at
  ) VALUES (
    v_session_id,
    p_agent_id,
    v_effective_creator_id,
    v_effective_creator_id,
    v_family_federation_id,
    p_session_type,
    p_primary_channel,
    v_operational_snapshot,
    v_auto_hibernate_minutes,
    NOW(),
    NOW()
  );

  UPDATE agent_operational_state
  SET current_session_id = v_session_id,
      active_task_count = active_task_count + 1,
      updated_at = NOW()
  WHERE agent_id = p_agent_id;

  SELECT jsonb_build_object(
    'session_id', session_id,
    'agent_id', agent_id,
    'human_creator_id', human_creator_id,
    'created_by_user_id', created_by_user_id,
    'family_federation_id', family_federation_id,
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
  v_calculated_sats_cost BIGINT;
  v_total_tokens INTEGER;
BEGIN
  IF NOT is_agent_session_governor(p_session_id, auth.uid()::TEXT) THEN
    RAISE EXCEPTION 'Permission denied: caller does not own session %', p_session_id;
  END IF;

  v_total_tokens := GREATEST(p_tokens_used, p_input_tokens + p_output_tokens);

  IF p_sats_cost = 0 AND v_total_tokens > 0 THEN
    v_calculated_sats_cost := GREATEST(1, v_total_tokens / 1000);
  ELSE
    v_calculated_sats_cost := p_sats_cost;
  END IF;

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

  UPDATE agent_sessions
  SET last_activity_at = NOW(),
      total_messages = total_messages + CASE WHEN p_event_type = 'MESSAGE' THEN 1 ELSE 0 END,
      total_tool_calls = total_tool_calls + CASE WHEN p_event_type = 'TOOL_CALL' THEN 1 ELSE 0 END,
      tokens_consumed = tokens_consumed + v_total_tokens,
      sats_spent = sats_spent + v_calculated_sats_cost,
      updated_at = NOW()
  WHERE session_id = p_session_id;

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

CREATE OR REPLACE FUNCTION pause_session(
  p_session_id TEXT
) RETURNS JSONB AS $$
DECLARE
  v_conversation_context JSONB;
BEGIN
  IF NOT is_agent_session_governor(p_session_id, auth.uid()::TEXT) THEN
    RAISE EXCEPTION 'Permission denied: caller does not own session %', p_session_id;
  END IF;

  SELECT conversation_context INTO v_conversation_context
  FROM agent_sessions
  WHERE session_id = p_session_id;

  UPDATE agent_sessions
  SET status = 'PAUSED',
      updated_at = NOW()
  WHERE session_id = p_session_id;

  PERFORM log_session_event(
    p_session_id,
    'STATE_SNAPSHOT',
    jsonb_build_object(
      'reason', 'session_paused',
      'conversation_context', v_conversation_context,
      'paused_at', NOW()
    )
  );

  RETURN jsonb_build_object(
    'session_id', p_session_id,
    'status', 'PAUSED',
    'message', 'Session paused successfully'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION resume_session(
  p_session_id TEXT
) RETURNS JSONB AS $$
BEGIN
  IF NOT is_agent_session_governor(p_session_id, auth.uid()::TEXT) THEN
    RAISE EXCEPTION 'Permission denied: caller does not own session %', p_session_id;
  END IF;

  UPDATE agent_sessions
  SET status = 'ACTIVE',
      last_activity_at = NOW(),
      updated_at = NOW()
  WHERE session_id = p_session_id;

  PERFORM log_session_event(
    p_session_id,
    'INFO',
    jsonb_build_object(
      'event', 'session_resumed',
      'resumed_at', NOW()
    )
  );

  RETURN jsonb_build_object(
    'session_id', p_session_id,
    'status', 'ACTIVE',
    'message', 'Session resumed successfully'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION terminate_session(
  p_session_id TEXT,
  p_reason TEXT DEFAULT 'user_requested'
) RETURNS JSONB AS $$
DECLARE
  v_session RECORD;
  v_duration_seconds INTEGER;
  v_final_metrics JSONB;
BEGIN
  SELECT * INTO v_session
  FROM agent_sessions
  WHERE session_id = p_session_id;

  IF v_session.session_id IS NULL THEN
    RAISE EXCEPTION 'Session % does not exist', p_session_id;
  END IF;

  IF v_session.status = 'TERMINATED' THEN
    RAISE EXCEPTION 'Session % is already terminated', p_session_id;
  END IF;

  IF NOT is_agent_session_governor(p_session_id, auth.uid()::TEXT) THEN
    RAISE EXCEPTION 'Permission denied: caller does not own session %', p_session_id;
  END IF;

  v_duration_seconds := EXTRACT(EPOCH FROM (NOW() - v_session.started_at));

  SELECT jsonb_build_object(
    'total_messages', v_session.total_messages,
    'total_tool_calls', v_session.total_tool_calls,
    'tokens_consumed', v_session.tokens_consumed,
    'sats_spent', v_session.sats_spent,
    'duration_seconds', v_duration_seconds,
    'session_type', v_session.session_type,
    'primary_channel', v_session.primary_channel
  ) INTO v_final_metrics;

  UPDATE agent_sessions
  SET status = 'TERMINATED',
      terminated_at = NOW(),
      termination_reason = p_reason
  WHERE session_id = p_session_id;

  UPDATE agent_operational_state
  SET active_task_count = GREATEST(0, active_task_count - 1),
      current_session_id = CASE
        WHEN current_session_id = p_session_id THEN NULL
        ELSE current_session_id
      END,
      updated_at = NOW()
  WHERE agent_id = v_session.agent_id;

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

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'terminated_at', NOW(),
    'reason', p_reason,
    'final_metrics', v_final_metrics
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMIT;