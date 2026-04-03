-- Task Verifiability Assessment (Phase 3.5)
-- Ensures tasks have measurable success criteria before delegation
-- Based on Google DeepMind delegation research (Section 4.1)

-- Verification method types
DO $$ BEGIN
  CREATE TYPE verification_method AS ENUM (
    'AUTOMATED_TEST',      -- Unit tests, integration tests
    'FORMAL_PROOF',        -- Mathematical/logical proof
    'SCHEMA_VALIDATION',   -- JSON schema, type checking
    'ORACLE_CHECK',        -- External API verification
    'HUMAN_REVIEW',        -- Subjective human judgment
    'CONSENSUS_VOTE',      -- Multi-party agreement
    'CRYPTOGRAPHIC_PROOF', -- Signatures, zero-knowledge proofs
    'PERFORMANCE_METRIC'   -- Latency, throughput, accuracy thresholds
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Task verifiability assessments
CREATE TABLE IF NOT EXISTS task_verifiability_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID, -- May be NULL for pre-assessment templates
  task_spec_hash TEXT, -- Hash of task specification
  
  -- Verifiability score (0-100)
  verifiability_score INTEGER CHECK (verifiability_score >= 0 AND verifiability_score <= 100),
  
  -- Verification method
  primary_verification_method verification_method NOT NULL,
  fallback_verification_method verification_method,
  
  -- Cost analysis
  verification_cost_sats BIGINT DEFAULT 0,
  verification_time_seconds INTEGER DEFAULT 0,
  can_automate_verification BOOLEAN DEFAULT FALSE,
  
  -- Decomposition requirements
  requires_decomposition BOOLEAN DEFAULT FALSE,
  decomposition_reason TEXT,
  suggested_subtask_count INTEGER,
  
  -- Success criteria analysis
  has_clear_success_criteria BOOLEAN DEFAULT FALSE,
  success_criteria JSONB, -- Structured success criteria
  ambiguity_flags TEXT[], -- Identified ambiguities
  
  -- Risk assessment
  dispute_risk TEXT CHECK (dispute_risk IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  subjectivity_level INTEGER CHECK (subjectivity_level >= 0 AND subjectivity_level <= 100),
  reversibility BOOLEAN DEFAULT TRUE, -- Can task outcome be reversed?
  
  -- Assessment metadata
  assessed_at TIMESTAMPTZ DEFAULT NOW(),
  assessed_by_agent_id TEXT REFERENCES user_identities(id),
  assessment_method TEXT DEFAULT 'llm_analysis',
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_verif_score 
  ON task_verifiability_assessments(verifiability_score);
CREATE INDEX IF NOT EXISTS idx_task_verif_task 
  ON task_verifiability_assessments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_verif_decomp 
  ON task_verifiability_assessments(requires_decomposition);

-- Task decomposition tree (for recursive breakdown)
CREATE TABLE IF NOT EXISTS task_decompositions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_task_id UUID NOT NULL, -- References original/parent task
  subtask_id UUID NOT NULL,     -- References decomposed subtask
  decomposition_level INTEGER DEFAULT 1, -- Depth in tree
  decomposition_reason TEXT,
  subtask_order INTEGER DEFAULT 0, -- Execution sequence
  dependency_subtask_ids UUID[], -- Must complete before this subtask
  
  -- Verification inheritance
  inherits_verification_from_parent BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(parent_task_id, subtask_id)
);

CREATE INDEX IF NOT EXISTS idx_decomp_parent 
  ON task_decompositions(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_decomp_subtask 
  ON task_decompositions(subtask_id);

-- Verification templates (reusable patterns)
CREATE TABLE IF NOT EXISTS verification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name TEXT UNIQUE NOT NULL,
  task_pattern TEXT NOT NULL, -- Regex or description of task type
  
  recommended_verification_method verification_method NOT NULL,
  typical_verifiability_score INTEGER,
  typical_cost_sats BIGINT,
  
  success_criteria_template JSONB,
  example_tasks TEXT[],
  
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed common verification templates
INSERT INTO verification_templates (template_name, task_pattern, recommended_verification_method, typical_verifiability_score, typical_cost_sats, success_criteria_template) VALUES
(
  'Code Generation with Tests',
  'generate|write|create (code|function|script) with (tests|unit tests)',
  'AUTOMATED_TEST',
  95,
  10,
  '{"criteria": ["code_compiles", "all_tests_pass", "coverage_above_80_percent"]}'::jsonb
),
(
  'Data Extraction with Schema',
  'extract|parse|scrape data (from|into) (json|csv|structured format)',
  'SCHEMA_VALIDATION',
  85,
  25,
  '{"criteria": ["valid_json_schema", "all_required_fields_present", "data_types_correct"]}'::jsonb
),
(
  'Mathematical Proof',
  'prove|demonstrate|verify (theorem|equation|mathematical)',
  'FORMAL_PROOF',
  90,
  100,
  '{"criteria": ["proof_steps_valid", "assumptions_stated", "conclusion_follows_logically"]}'::jsonb
),
(
  'API Response Validation',
  'call|query|fetch (api|endpoint) and validate',
  'ORACLE_CHECK',
  75,
  50,
  '{"criteria": ["status_code_200", "response_schema_valid", "data_matches_expectations"]}'::jsonb
),
(
  'Creative Content',
  'design|write|create (logo|article|story|marketing copy)',
  'HUMAN_REVIEW',
  25,
  5000,
  '{"criteria": ["subjective_quality", "brand_alignment", "user_satisfaction"]}'::jsonb
),
(
  'Multi-Party Consensus',
  'decide|choose|select (with|requiring) (consensus|vote|agreement)',
  'CONSENSUS_VOTE',
  60,
  500,
  '{"criteria": ["quorum_reached", "majority_vote", "no_blocking_vetoes"]}'::jsonb
)
ON CONFLICT (template_name) DO NOTHING;

-- RLS policies
ALTER TABLE task_verifiability_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_decompositions ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_templates ENABLE ROW LEVEL SECURITY;

-- Users can read assessments for their tasks
CREATE POLICY "verif_assess_read" ON task_verifiability_assessments
  FOR SELECT USING (
    assessed_by_agent_id = auth.uid()::TEXT OR
    task_id IN (SELECT id FROM agent_task_records WHERE assignee_agent_id = auth.uid()::TEXT)
  );

-- Service role can write
CREATE POLICY "verif_assess_service" ON task_verifiability_assessments
  FOR ALL USING (auth.role() = 'service_role');

-- Decompositions follow task access
CREATE POLICY "decomp_read" ON task_decompositions
  FOR SELECT USING (
    parent_task_id IN (SELECT id FROM agent_task_records WHERE assignee_agent_id = auth.uid()::TEXT) OR
    subtask_id IN (SELECT id FROM agent_task_records WHERE assignee_agent_id = auth.uid()::TEXT)
  );

CREATE POLICY "decomp_service" ON task_decompositions
  FOR ALL USING (auth.role() = 'service_role');

-- Templates are public read
CREATE POLICY "templates_public" ON verification_templates
  FOR SELECT USING (active = TRUE);

CREATE POLICY "templates_service" ON verification_templates
  FOR ALL USING (auth.role() = 'service_role');

-- Assessment function (called before task delegation)
CREATE OR REPLACE FUNCTION assess_task_verifiability(
  p_task_description TEXT,
  p_output_type TEXT DEFAULT NULL,
  p_success_criteria JSONB DEFAULT NULL,
  p_task_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_assessment_id UUID;
  v_score INTEGER;
  v_method verification_method;
  v_requires_decomp BOOLEAN;
  v_dispute_risk TEXT;
  v_can_automate BOOLEAN;
  v_cost BIGINT;
BEGIN
  -- Match against templates (simplified heuristic)
  -- In production, call LLM service for accurate assessment
  
  -- Check for automated test patterns
  IF p_task_description ~* '(test|unit test|integration test)' AND p_output_type = 'code_with_tests' THEN
    v_score := 95;
    v_method := 'AUTOMATED_TEST';
    v_requires_decomp := FALSE;
    v_dispute_risk := 'LOW';
    v_can_automate := TRUE;
    v_cost := 10;
  
  -- Check for schema validation patterns
  ELSIF p_task_description ~* '(json|csv|xml|structured)' AND p_success_criteria ? 'schema' THEN
    v_score := 85;
    v_method := 'SCHEMA_VALIDATION';
    v_requires_decomp := FALSE;
    v_dispute_risk := 'LOW';
    v_can_automate := TRUE;
    v_cost := 25;
  
  -- Check for API/oracle patterns
  ELSIF p_task_description ~* '(api|endpoint|query|fetch)' THEN
    v_score := 75;
    v_method := 'ORACLE_CHECK';
    v_requires_decomp := FALSE;
    v_dispute_risk := 'MEDIUM';
    v_can_automate := TRUE;
    v_cost := 50;
  
  -- Check for creative/subjective patterns
  ELSIF p_task_description ~* '(design|creative|compelling|engaging|beautiful)' THEN
    v_score := 25;
    v_method := 'HUMAN_REVIEW';
    v_requires_decomp := TRUE;
    v_dispute_risk := 'HIGH';
    v_can_automate := FALSE;
    v_cost := 5000;
  
  -- Default: medium verifiability
  ELSE
    v_score := 50;
    v_method := 'HUMAN_REVIEW';
    v_requires_decomp := FALSE;
    v_dispute_risk := 'MEDIUM';
    v_can_automate := FALSE;
    v_cost := 1000;
  END IF;

  -- Insert assessment
  INSERT INTO task_verifiability_assessments (
    task_id,
    task_spec_hash,
    verifiability_score,
    primary_verification_method,
    verification_cost_sats,
    can_automate_verification,
    requires_decomposition,
    dispute_risk,
    has_clear_success_criteria,
    success_criteria,
    subjectivity_level
  ) VALUES (
    p_task_id,
    encode(sha256(p_task_description::bytea), 'hex'),
    v_score,
    v_method,
    v_cost,
    v_can_automate,
    v_requires_decomp,
    v_dispute_risk,
    p_success_criteria IS NOT NULL,
    p_success_criteria,
    100 - v_score -- Inverse relationship
  ) RETURNING id INTO v_assessment_id;

  RETURN v_assessment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Decompose task into verifiable subtasks
CREATE OR REPLACE FUNCTION decompose_task_recursively(
  p_parent_task_id UUID,
  p_min_verifiability_score INTEGER DEFAULT 60
) RETURNS TABLE(subtask_id UUID, subtask_description TEXT, verifiability_score INTEGER) AS $$
DECLARE
  v_parent_task RECORD;
  v_assessment RECORD;
BEGIN
  -- Get parent task and assessment
  SELECT * INTO v_parent_task FROM agent_task_records WHERE id = p_parent_task_id;
  SELECT * INTO v_assessment FROM task_verifiability_assessments WHERE task_id = p_parent_task_id;

  -- If already verifiable enough, return empty
  IF v_assessment.verifiability_score >= p_min_verifiability_score THEN
    RETURN;
  END IF;

  -- TODO: Call LLM service to generate subtasks
  -- For now, return placeholder indicating decomposition needed
  RAISE NOTICE 'Task % requires decomposition (score: %)', p_parent_task_id, v_assessment.verifiability_score;
  
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;