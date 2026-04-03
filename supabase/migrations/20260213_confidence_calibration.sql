-- Confidence Calibration System (Phase 3.5)
-- Detects and corrects agent overconfidence to improve delegation decisions
-- Based on Google DeepMind delegation research (Section 2.3)

-- Agent confidence reports (self-reported before task acceptance)
CREATE TABLE IF NOT EXISTS agent_confidence_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT REFERENCES user_identities(id) NOT NULL,
  task_id UUID NOT NULL, -- References task being evaluated
  
  -- Self-reported confidence
  reported_confidence_percent INTEGER CHECK (reported_confidence_percent >= 0 AND reported_confidence_percent <= 100),
  confidence_reasoning TEXT,
  
  -- Capability assessment
  has_required_capabilities BOOLEAN DEFAULT TRUE,
  capability_gaps TEXT[],
  
  -- Historical context
  similar_task_count INTEGER DEFAULT 0,
  similar_task_success_rate NUMERIC(5,2), -- 0.00 to 100.00
  
  -- Resource assessment
  estimated_cost_sats BIGINT,
  estimated_time_seconds INTEGER,
  estimated_success_probability NUMERIC(5,2),
  
  -- Decision
  acceptance_decision TEXT CHECK (acceptance_decision IN ('ACCEPTED', 'DECLINED', 'NEEDS_CLARIFICATION')),
  decline_reason TEXT,
  alternative_agent_suggestions TEXT[], -- npubs of better-suited agents
  
  reported_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conf_agent ON agent_confidence_reports(agent_id);
CREATE INDEX IF NOT EXISTS idx_conf_task ON agent_confidence_reports(task_id);
CREATE INDEX IF NOT EXISTS idx_conf_decision ON agent_confidence_reports(acceptance_decision);

-- Confidence calibration metrics (computed per agent)
CREATE TABLE IF NOT EXISTS agent_confidence_calibration (
  agent_id TEXT PRIMARY KEY REFERENCES user_identities(id),
  
  -- Calibration scores
  calibration_score NUMERIC(5,2) DEFAULT 50.00, -- 0 = terrible, 100 = perfect
  overconfidence_bias NUMERIC(6,2) DEFAULT 0.00, -- Positive = overconfident, negative = underconfident
  
  -- Historical accuracy
  total_confidence_reports INTEGER DEFAULT 0,
  total_completed_tasks INTEGER DEFAULT 0,
  
  -- Actual vs predicted performance
  avg_reported_confidence NUMERIC(5,2),
  avg_actual_success_rate NUMERIC(5,2),
  confidence_accuracy_gap NUMERIC(6,2), -- reported - actual
  
  -- Confidence distribution
  high_confidence_tasks INTEGER DEFAULT 0, -- > 80% confidence
  high_confidence_success_rate NUMERIC(5,2),
  medium_confidence_tasks INTEGER DEFAULT 0, -- 50-80%
  medium_confidence_success_rate NUMERIC(5,2),
  low_confidence_tasks INTEGER DEFAULT 0, -- < 50%
  low_confidence_success_rate NUMERIC(5,2),
  
  -- Calibration adjustments
  recommended_adjustment_factor NUMERIC(4,2) DEFAULT 1.00, -- Multiply reported confidence by this
  
  last_computed_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Task outcome records (for calibration computation)
CREATE TABLE IF NOT EXISTS task_outcome_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL UNIQUE,
  agent_id TEXT REFERENCES user_identities(id) NOT NULL,
  confidence_report_id UUID REFERENCES agent_confidence_reports(id),
  
  -- Outcome
  outcome TEXT CHECK (outcome IN ('SUCCESS', 'PARTIAL_SUCCESS', 'FAILURE', 'CANCELLED')) NOT NULL,
  success_score NUMERIC(5,2), -- 0.00 to 100.00
  
  -- Actual metrics
  actual_cost_sats BIGINT,
  actual_time_seconds INTEGER,
  verification_passed BOOLEAN,
  
  -- Confidence accuracy
  reported_confidence NUMERIC(5,2),
  confidence_error NUMERIC(6,2), -- reported - actual success
  
  completed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outcome_agent ON task_outcome_records(agent_id);
CREATE INDEX IF NOT EXISTS idx_outcome_task ON task_outcome_records(task_id);

-- RLS policies
ALTER TABLE agent_confidence_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_confidence_calibration ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_outcome_records ENABLE ROW LEVEL SECURITY;

-- Agents can read/write their own confidence reports
CREATE POLICY "conf_report_own" ON agent_confidence_reports
  FOR ALL USING (agent_id = auth.uid()::TEXT);

-- Task creators can read confidence reports for their tasks
CREATE POLICY "conf_report_creator" ON agent_confidence_reports
  FOR SELECT USING (
    task_id IN (SELECT id FROM agent_task_records WHERE creator_user_id = auth.uid()::TEXT)
  );

-- Service role full access
CREATE POLICY "conf_report_service" ON agent_confidence_reports
  FOR ALL USING (auth.role() = 'service_role');

-- Agents can read their own calibration
CREATE POLICY "conf_calib_own" ON agent_confidence_calibration
  FOR SELECT USING (agent_id = auth.uid()::TEXT);

-- Anyone can read calibration for agent selection
CREATE POLICY "conf_calib_public" ON agent_confidence_calibration
  FOR SELECT USING (true);

CREATE POLICY "conf_calib_service" ON agent_confidence_calibration
  FOR ALL USING (auth.role() = 'service_role');

-- Task outcomes follow task access
CREATE POLICY "outcome_own" ON task_outcome_records
  FOR SELECT USING (agent_id = auth.uid()::TEXT);

CREATE POLICY "outcome_creator" ON task_outcome_records
  FOR SELECT USING (
    task_id IN (SELECT id FROM agent_task_records WHERE creator_user_id = auth.uid()::TEXT)
  );

CREATE POLICY "outcome_service" ON task_outcome_records
  FOR ALL USING (auth.role() = 'service_role');

-- Compute confidence calibration for an agent
CREATE OR REPLACE FUNCTION compute_confidence_calibration(
  p_agent_id UUID
) RETURNS VOID AS $$
DECLARE
  v_total_reports INTEGER;
  v_avg_reported NUMERIC;
  v_avg_actual NUMERIC;
  v_gap NUMERIC;
  v_calibration_score NUMERIC;
  v_adjustment_factor NUMERIC;
BEGIN
  -- Count total confidence reports
  SELECT COUNT(*) INTO v_total_reports
  FROM agent_confidence_reports
  WHERE agent_id = p_agent_id;

  IF v_total_reports = 0 THEN
    RETURN; -- No data yet
  END IF;

  -- Compute average reported confidence
  SELECT AVG(reported_confidence_percent) INTO v_avg_reported
  FROM agent_confidence_reports acr
  WHERE acr.agent_id = p_agent_id
    AND acr.acceptance_decision = 'ACCEPTED';

  -- Compute average actual success rate
  SELECT AVG(success_score) INTO v_avg_actual
  FROM task_outcome_records tor
  WHERE tor.agent_id = p_agent_id;

  -- No completed outcomes yet — cannot compute a meaningful gap or adjustment factor
  IF v_avg_actual IS NULL THEN
    RETURN;
  END IF;

  -- Compute gap (positive = overconfident)
  v_gap := v_avg_reported - v_avg_actual;

  -- Compute calibration score (100 = perfect, 0 = terrible)
  -- Perfect calibration: reported = actual (gap = 0)
  -- Score decreases as gap increases
  v_calibration_score := GREATEST(0, 100 - ABS(v_gap));

  -- Compute adjustment factor
  -- If overconfident (gap > 0), adjust down
  -- If underconfident (gap < 0), adjust up
  IF v_avg_reported > 0 THEN
    v_adjustment_factor := v_avg_actual / v_avg_reported;
  ELSE
    v_adjustment_factor := 1.00;
  END IF;

  -- Clamp adjustment factor to reasonable range (0.5 to 1.5)
  v_adjustment_factor := GREATEST(0.5, LEAST(1.5, v_adjustment_factor));

  -- Update or insert calibration record
  INSERT INTO agent_confidence_calibration (
    agent_id,
    calibration_score,
    overconfidence_bias,
    total_confidence_reports,
    avg_reported_confidence,
    avg_actual_success_rate,
    confidence_accuracy_gap,
    recommended_adjustment_factor,
    last_computed_at,
    updated_at
  ) VALUES (
    p_agent_id,
    v_calibration_score,
    v_gap,
    v_total_reports,
    v_avg_reported,
    v_avg_actual,
    v_gap,
    v_adjustment_factor,
    NOW(),
    NOW()
  )
  ON CONFLICT (agent_id) DO UPDATE SET
    calibration_score = v_calibration_score,
    overconfidence_bias = v_gap,
    total_confidence_reports = v_total_reports,
    avg_reported_confidence = v_avg_reported,
    avg_actual_success_rate = v_avg_actual,
    confidence_accuracy_gap = v_gap,
    recommended_adjustment_factor = v_adjustment_factor,
    last_computed_at = NOW(),
    updated_at = NOW();

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to recompute calibration after task completion
CREATE OR REPLACE FUNCTION trigger_recalibrate_confidence()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM compute_confidence_calibration(NEW.agent_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_task_outcome_insert
  AFTER INSERT ON task_outcome_records
  FOR EACH ROW
  EXECUTE FUNCTION trigger_recalibrate_confidence();

-- Get calibrated confidence for agent
CREATE OR REPLACE FUNCTION get_calibrated_confidence(
  p_agent_id UUID,
  p_reported_confidence NUMERIC
) RETURNS JSON AS $$
DECLARE
  v_calibration RECORD;
  v_adjusted_confidence NUMERIC;
  v_result JSON;
BEGIN
  -- Get agent calibration
  SELECT * INTO v_calibration
  FROM agent_confidence_calibration
  WHERE agent_id = p_agent_id;

  IF NOT FOUND THEN
    -- No calibration data - return reported confidence as-is
    RETURN json_build_object(
      'reported_confidence', p_reported_confidence,
      'calibrated_confidence', p_reported_confidence,
      'adjustment_factor', 1.00,
      'calibration_score', NULL,
      'is_calibrated', FALSE
    );
  END IF;

  -- Apply adjustment factor
  v_adjusted_confidence := p_reported_confidence * v_calibration.recommended_adjustment_factor;
  v_adjusted_confidence := GREATEST(0, LEAST(100, v_adjusted_confidence)); -- Clamp 0-100

  -- Build result
  v_result := json_build_object(
    'reported_confidence', p_reported_confidence,
    'calibrated_confidence', v_adjusted_confidence,
    'adjustment_factor', v_calibration.recommended_adjustment_factor,
    'calibration_score', v_calibration.calibration_score,
    'overconfidence_bias', v_calibration.overconfidence_bias,
    'is_calibrated', TRUE,
    'historical_success_rate', v_calibration.avg_actual_success_rate
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;