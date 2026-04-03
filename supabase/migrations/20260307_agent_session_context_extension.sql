BEGIN;

ALTER TABLE agent_sessions
  ADD COLUMN IF NOT EXISTS session_token TEXT,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS capability_scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS lifecycle_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE agent_sessions
SET session_token = COALESCE(session_token, session_id),
    expires_at = COALESCE(
      expires_at,
      last_activity_at + INTERVAL '24 hours',
      started_at + INTERVAL '24 hours',
      created_at + INTERVAL '24 hours',
      NOW() + INTERVAL '24 hours'
    ),
    capability_scope = CASE
      WHEN capability_scope IS NULL OR capability_scope = '{}'::jsonb THEN
        jsonb_build_object(
          'session_type', session_type,
          'primary_channel', primary_channel,
          'governance_context', 'agent_session'
        )
      ELSE capability_scope
    END,
    lifecycle_metadata = CASE
      WHEN lifecycle_metadata IS NULL OR lifecycle_metadata = '{}'::jsonb THEN
        jsonb_strip_nulls(
          jsonb_build_object(
            'created_by_user_id', created_by_user_id,
            'human_creator_id', human_creator_id,
            'family_federation_id', family_federation_id,
            'status', status,
            'started_at', started_at,
            'last_activity_at', last_activity_at
          )
        )
      ELSE lifecycle_metadata
    END;

ALTER TABLE agent_sessions
  ALTER COLUMN session_token SET NOT NULL,
  ALTER COLUMN expires_at SET NOT NULL,
  ALTER COLUMN capability_scope SET NOT NULL,
  ALTER COLUMN lifecycle_metadata SET NOT NULL;

DO $$
BEGIN
  EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_sessions_session_token ON agent_sessions(session_token)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_agent_sessions_expires_at ON agent_sessions(expires_at)';
END $$;

CREATE OR REPLACE FUNCTION create_agent_session(
  p_agent_id UUID,
  p_session_type TEXT,
  p_primary_channel TEXT DEFAULT 'nostr',
  p_created_by_user_id UUID DEFAULT NULL,
  p_human_creator_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_session_id TEXT;
  v_session_token TEXT;
  v_session_record JSONB;
  v_operational_snapshot JSONB;
  v_auto_hibernate_minutes INTEGER;
  v_is_agent BOOLEAN;
  v_identity_family_federation_id UUID;
  v_profile_family_federation_id UUID;
  v_family_federation_id UUID;
  v_effective_creator_id UUID := COALESCE(p_created_by_user_id, p_human_creator_id, auth.uid());
  v_expires_at TIMESTAMPTZ;
  v_capability_scope JSONB;
  v_lifecycle_metadata JSONB;
BEGIN
  SELECT ui.is_agent,
         ui.family_federation_id,
         ap.family_federation_id
  INTO v_is_agent, v_identity_family_federation_id, v_profile_family_federation_id
  FROM user_identities ui
  JOIN agent_profiles ap ON ap.user_identity_id = ui.id
  WHERE ui.id = p_agent_id;

  IF v_is_agent IS NULL THEN
    RAISE EXCEPTION 'Agent with id % does not exist', p_agent_id;
  END IF;

  IF v_is_agent = FALSE THEN
    RAISE EXCEPTION 'User % is not an agent (is_agent = false)', p_agent_id;
  END IF;

  IF v_identity_family_federation_id IS NOT NULL
     AND v_profile_family_federation_id IS NOT NULL
     AND v_identity_family_federation_id <> v_profile_family_federation_id THEN
    RAISE EXCEPTION 'Agent % has mismatched family_federation_id governance context', p_agent_id;
  END IF;

  v_family_federation_id := COALESCE(v_profile_family_federation_id, v_identity_family_federation_id);

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
  v_session_token := 'ast_' || encode(gen_random_bytes(24), 'hex');
  v_auto_hibernate_minutes := 30;
  v_expires_at := NOW() + INTERVAL '24 hours';
  v_capability_scope := jsonb_build_object(
    'session_type', p_session_type,
    'primary_channel', p_primary_channel,
    'creator_scope', CASE WHEN auth.uid() = p_agent_id THEN 'self' ELSE 'governor' END,
    'governance_context', 'agent_session'
  );
  v_lifecycle_metadata := jsonb_strip_nulls(jsonb_build_object(
    'created_via', 'create_agent_session',
    'created_by_user_id', v_effective_creator_id,
    'human_creator_id', v_effective_creator_id,
    'family_federation_id', v_family_federation_id,
    'status', 'ACTIVE',
    'started_at', NOW(),
    'expires_at', v_expires_at
  ));

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

  INSERT INTO agent_sessions (
    session_id,
    session_token,
    agent_id,
    human_creator_id,
    created_by_user_id,
    family_federation_id,
    session_type,
    primary_channel,
    capability_scope,
    lifecycle_metadata,
    expires_at,
    operational_state_snapshot,
    auto_hibernate_after_minutes,
    started_at,
    last_activity_at
  ) VALUES (
    v_session_id,
    v_session_token,
    p_agent_id,
    v_effective_creator_id,
    v_effective_creator_id,
    v_family_federation_id,
    p_session_type,
    p_primary_channel,
    v_capability_scope,
    v_lifecycle_metadata,
    v_expires_at,
    v_operational_snapshot,
    v_auto_hibernate_minutes,
    NOW(),
    NOW()
  );

  UPDATE agent_operational_state
  SET current_session_id = v_session_id,
      updated_at = NOW()
  WHERE agent_id = p_agent_id;

  SELECT jsonb_build_object(
    'session_id', session_id,
    'session_token', session_token,
    'agent_id', agent_id,
    'human_creator_id', human_creator_id,
    'created_by_user_id', created_by_user_id,
    'family_federation_id', family_federation_id,
    'session_type', session_type,
    'primary_channel', primary_channel,
    'status', status,
    'capability_scope', capability_scope,
    'lifecycle_metadata', lifecycle_metadata,
    'expires_at', expires_at,
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

COMMIT;