-- Span of Control Enforcement (Phase 0.5)
-- Prevents humans from managing more agents than they can effectively oversee

-- Add span_of_control to user preferences
ALTER TABLE user_identities ADD COLUMN IF NOT EXISTS 
  span_of_control_limit INTEGER DEFAULT 5 CHECK (span_of_control_limit BETWEEN 1 AND 50);

-- Oversight load view (read-only, computed from live data)
CREATE OR REPLACE VIEW human_oversight_load AS
SELECT 
  ap.created_by_user_id AS human_id,
  COUNT(DISTINCT ap.user_identity_id) AS managed_agent_count,
  COUNT(DISTINCT CASE 
    WHEN aos.active_task_count > 0 THEN ap.user_identity_id 
  END) AS agents_with_active_tasks,
  COALESCE(AVG(aos.current_compute_load_percent), 0)::INTEGER AS avg_agent_load,
  COALESCE(MAX(aos.current_compute_load_percent), 0) AS max_agent_load,
  COALESCE(SUM(aos.active_task_count), 0) AS total_active_tasks,
  ui.span_of_control_limit,
  CASE 
    WHEN COUNT(DISTINCT ap.user_identity_id) >= ui.span_of_control_limit THEN TRUE
    ELSE FALSE
  END AS at_capacity
FROM agent_profiles ap
LEFT JOIN agent_operational_state aos ON ap.user_identity_id = aos.agent_id
LEFT JOIN user_identities ui ON ap.created_by_user_id = ui.id
WHERE ap.lifecycle_state = 'ACTIVE'
  AND ap.created_by_user_id IS NOT NULL
GROUP BY ap.created_by_user_id, ui.span_of_control_limit;

GRANT SELECT ON human_oversight_load TO authenticated;

-- Span of control check function (called before agent creation)
CREATE OR REPLACE FUNCTION check_span_of_control(
  p_creator_id UUID
) RETURNS JSON AS $$
DECLARE
  v_current_count INTEGER;
  v_limit INTEGER;
  v_result JSON;
BEGIN
  -- Get current count and limit
  SELECT managed_agent_count, span_of_control_limit
  INTO v_current_count, v_limit
  FROM human_oversight_load
  WHERE human_id = p_creator_id;

  -- Handle case where user has no agents yet
  IF v_current_count IS NULL THEN
    SELECT span_of_control_limit INTO v_limit
    FROM user_identities
    WHERE id = p_creator_id;
    
    v_current_count := 0;
    v_limit := COALESCE(v_limit, 5);
  END IF;

  -- Build result
  v_result := json_build_object(
    'can_create', v_current_count < v_limit,
    'current_count', v_current_count,
    'limit', v_limit,
    'remaining_slots', v_limit - v_current_count,
    'at_capacity', v_current_count >= v_limit
  );

  -- Raise exception if at capacity
  IF v_current_count >= v_limit THEN
    RAISE EXCEPTION 'Span of control exceeded: % manages % agents (limit: %)', 
      p_creator_id, v_current_count, v_limit
    USING 
      ERRCODE = 'check_violation',
      HINT = 'Increase span_of_control_limit or pause existing agents';
  END IF;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update span of control limit (requires explicit user action)
CREATE OR REPLACE FUNCTION update_span_of_control_limit(
  p_user_id UUID,
  p_new_limit INTEGER
) RETURNS BOOLEAN AS $$
BEGIN
  -- Validate new limit
  IF p_new_limit < 1 OR p_new_limit > 50 THEN
    RAISE EXCEPTION 'Span of control limit must be between 1 and 50';
  END IF;

  -- Ensure user is updating their own limit (or service role)
  IF auth.uid() != p_user_id AND auth.role() != 'service_role' THEN
    RAISE EXCEPTION 'Can only update your own span of control limit';
  END IF;

  UPDATE user_identities
  SET span_of_control_limit = p_new_limit
  WHERE id = p_user_id;

  RETURN FOUND;END;
$$ LANGUAGE plpgsql SECURITY DEFINER;