-- Agent Task Records (Phase 3.0)
-- Core task delegation and tracking system for AI agents
-- Integrates with verifiability assessment, operational state, and payment systems

-- Core task records table
CREATE TABLE IF NOT EXISTS agent_task_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  v_reputation_delta := GREATEST(1, FLOOR(p_actual_cost / 1000));  -- Task metadata
  task_title TEXT NOT NULL,
  task_description TEXT NOT NULL,
  task_type TEXT NOT NULL, -- 'code_generation', 'data_analysis', 'content_creation', etc.
  task_priority TEXT DEFAULT 'MEDIUM' CHECK (task_priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  
  -- Agent assignment
  assignee_agent_id TEXT NOT NULL REFERENCES user_identities(id) ON DELETE CASCADE,
  creator_user_id TEXT NOT NULL REFERENCES user_identities(id) ON DELETE CASCADE,
  
  -- Task specifications
  input_data JSONB DEFAULT '{}'::jsonb,
  output_requirements JSONB DEFAULT '{}'::jsonb,
  success_criteria JSONB DEFAULT '{}'::jsonb,
  
  -- Task lifecycle
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'in_progress', 'completed', 'failed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  assigned_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  estimated_duration_seconds INTEGER DEFAULT 3600, -- 1 hour default
  actual_duration_seconds INTEGER,
  
  -- Payment and cost tracking
  estimated_cost_sats BIGINT DEFAULT 0,
  actual_cost_sats BIGINT DEFAULT 0,
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'refunded', 'disputed')),
  
  -- Verification and validation
  validation_tier TEXT DEFAULT 'self_report' CHECK (validation_tier IN ('self_report', 'peer_verified', 'oracle_attested')),
  validator_npub TEXT,
  completion_proof TEXT,
  completion_signature TEXT,
  
  -- Sig4Sats integration
  sig4sats_bond_id UUID REFERENCES sig4sats_locks(id) ON DELETE SET NULL,
  sig4sats_redeemed BOOLEAN DEFAULT FALSE,
  sig4sats_bonus_sats BIGINT DEFAULT 0,
  
  -- Nostr integration
  task_event_id TEXT, -- Original task creation event
  completion_event_id TEXT, -- Task completion event
  
  -- Performance tracking
  reputation_delta INTEGER DEFAULT 0,
  quality_score INTEGER CHECK (quality_score >= 0 AND quality_score <= 100),
  
  -- Task dependencies
  depends_on_task_ids UUID[], -- Array of task IDs this task depends on
  is_dependent_task BOOLEAN DEFAULT FALSE
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status 
  ON agent_task_records(status, assignee_agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_agent 
  ON agent_task_records(assignee_agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_creator 
  ON agent_task_records(creator_user_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_created 
  ON agent_task_records(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_priority 
  ON agent_task_records(task_priority, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_cost 
  ON agent_task_records(estimated_cost_sats, actual_cost_sats);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_validation 
  ON agent_task_records(validation_tier, validator_npub);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_dependencies 
  ON agent_task_records USING GIN(depends_on_task_ids);

-- RLS policies
ALTER TABLE agent_task_records ENABLE ROW LEVEL SECURITY;

-- Agents can read their own tasks
CREATE POLICY "agent_tasks_own_read" ON agent_task_records
  FOR SELECT USING (assignee_agent_id = auth.uid()::TEXT);

-- Agents can update their own tasks (status, completion, etc.)
CREATE POLICY "agent_tasks_own_update" ON agent_task_records
  FOR UPDATE USING (assignee_agent_id = auth.uid()::TEXT);

-- Creators can read tasks they created
CREATE POLICY "creator_tasks_read" ON agent_task_records
  FOR SELECT USING (creator_user_id = auth.uid()::TEXT);

-- Authenticated users can create tasks
CREATE POLICY "creator_tasks_insert" ON agent_task_records
  FOR INSERT WITH CHECK (creator_user_id = auth.uid()::TEXT);

-- Service role has full access
CREATE POLICY "agent_tasks_service_all" ON agent_task_records
  FOR ALL USING (auth.role() = 'service_role');
-- Task assignment function
CREATE OR REPLACE FUNCTION assign_task_to_agent(
  p_task_id UUID,
  p_agent_id UUID,
  p_estimated_duration INTEGER DEFAULT NULL,
  p_estimated_cost BIGINT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  v_task RECORD;
BEGIN
  -- Get task details
  SELECT * INTO v_task FROM agent_task_records WHERE id = p_task_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found: %', p_task_id;
  END IF;
  
  -- Check task is still pending
  
  -- Check agent is available (operational state)
  SELECT * INTO v_agent_state FROM agent_operational_state WHERE agent_id = p_agent_id;
  IF NOT FOUND OR NOT v_agent_state.accepts_new_tasks THEN
    RAISE EXCEPTION 'Agent % is not accepting new tasks', p_agent_id;
  END IF;  IF NOT FOUND OR NOT v_task.accepts_new_tasks THEN
    RAISE EXCEPTION 'Agent % is not accepting new tasks', p_agent_id;
  END IF;
  
  -- Update task assignment
  UPDATE agent_task_records
  SET 
    assignee_agent_id = p_agent_id,
    status = 'assigned',
    assigned_at = NOW(),
    estimated_duration_seconds = COALESCE(p_estimated_duration, estimated_duration_seconds),
    estimated_cost_sats = COALESCE(p_estimated_cost, estimated_cost_sats)
  WHERE id = p_task_id;
  
  -- Update agent operational state
  UPDATE agent_operational_state
  SET active_task_count = active_task_count + 1,
    updated_at = NOW()
  WHERE agent_id = p_agent_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Task completion function
CREATE OR REPLACE FUNCTION complete_task(
  p_task_id UUID,
  p_actual_duration INTEGER,
  p_actual_cost BIGINT,
  p_completion_proof TEXT,
  p_validation_tier TEXT DEFAULT 'self_report',
  p_validator_npub TEXT DEFAULT NULL,
  p_completion_signature TEXT DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
  v_task RECORD;
  v_agent RECORD;
  v_result JSON;
  v_reputation_delta INTEGER;
BEGIN
  -- Get task details
  SELECT * INTO v_task FROM agent_task_records WHERE id = p_task_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found: %', p_task_id;
  END IF;
  
  -- Check task is in progress
  IF v_task.status != 'in_progress' THEN
    RAISE EXCEPTION 'Task % is not in progress status (current: %)', p_task_id, v_task.status;
  END IF;
  
  -- Calculate reputation delta (simplified)
  v_reputation_delta := GREATECE(1, FLOOR(p_actual_cost / 1000));
  
  -- Update task completion
  UPDATE agent_task_records
  SET 
    status = 'completed',
    actual_duration_seconds = p_actual_duration,
    actual_cost_sats = p_actual_cost,
    completion_proof = p_completion_proof,
    validation_tier = p_validation_tier,
    validator_npub = p_validator_npub,
    completion_signature = p_completion_signature,
    completed_at = NOW(),
    reputation_delta = v_reputation_delta
  WHERE id = p_task_id;
  
  -- Update agent operational state
  UPDATE agent_operational_state
  SET 
    active_task_count = active_task_count - 1,
    updated_at = NOW()
  WHERE agent_id = v_task.assignee_agent_id;
  
  -- Update agent profile reputation
  UPDATE agent_profiles
  SET 
    reputation_score = reputation_score + v_reputation_delta,
    total_tasks_completed = total_tasks_completed + 1,
    updated_at = NOW()
  WHERE user_identity_id = v_task.assignee_agent_id;
  
  -- Build result
  v_result := json_build_object(
    'task_id', p_task_id,
    'status', 'completed',
    'reputation_delta', v_reputation_delta,
    'actual_duration', p_actual_duration,
    'actual_cost', p_actual_cost,
    'validation_tier', p_validation_tier,
    'validator_npub', p_validator_npub
  );
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Task status transition function
CREATE OR REPLACE FUNCTION update_task_status(
  p_task_id UUID,
  p_new_status TEXT,
  p_notes TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  v_task RECORD;
  v_old_status TEXT;
BEGIN
  -- Get current task
  SELECT status INTO v_old_status FROM agent_task_records WHERE id = p_task_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found: %', p_task_id;
  END IF;
  
  -- Validate status transition
  IF NOT is_valid_status_transition(v_old_status, p_new_status) THEN
    RAISE EXCEPTION 'Invalid status transition from % to %', v_old_status, p_new_status;
  END IF;
  
  -- Update task status
  UPDATE agent_task_records
  SET 
    status = p_new_status,
    started_at = CASE 
      WHEN p_new_status = 'in_progress' AND started_at IS NULL THEN NOW()
      ELSE started_at 
    END,
    completed_at = CASE 
      WHEN p_new_status = 'completed' THEN NOW()
      ELSE completed_at 
    END
  WHERE id = p_task_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function for status transition validation
CREATE OR REPLACE FUNCTION is_valid_status_transition(
  p_old_status TEXT,
  p_new_status TEXT
) RETURNS BOOLEAN AS $$
BEGIN
  -- Define valid transitions
  CASE p_old_status
    WHEN 'pending' THEN
      RETURN p_new_status IN ('assigned', 'cancelled');
    WHEN 'assigned' THEN
      RETURN p_new_status IN ('in_progress', 'cancelled');
    WHEN 'in_progress' THEN
      RETURN p_new_status IN ('completed', 'failed');
    WHEN 'completed', 'failed', 'cancelled' THEN
      RETURN FALSE; -- Terminal states
    ELSE
      RETURN FALSE;
  END CASE;
END;
$$ LANGUAGE plpgsql;

-- Task analytics view
CREATE OR REPLACE VIEW task_analytics AS
SELECT 
  assignee_agent_id,
  creator_user_id,
  status,
  task_type,
  task_priority,
  COUNT(*) as task_count,
  AVG(estimated_duration_seconds) as avg_estimated_duration,
  AVG(actual_duration_seconds) as avg_actual_duration,
  AVG(estimated_cost_sats) as avg_estimated_cost,
  AVG(actual_cost_sats) as avg_actual_cost,
  AVG(reputation_delta) as avg_reputation_delta,
  COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count,
  COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count,
  COUNT(CASE WHEN validation_tier = 'peer_verified' THEN 1 END) as peer_verified_count,
  COUNT(CASE WHEN validation_tier = 'oracle_attested' THEN 1 END) as oracle_attested_count
FROM agent_task_records
GROUP BY assignee_agent_id, creator_user_id, status, task_type, task_priority;

-- Grant view access
GRANT SELECT ON task_analytics TO authenticated;