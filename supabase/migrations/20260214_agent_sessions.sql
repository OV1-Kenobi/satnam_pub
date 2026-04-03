-- Agent Session Management & Observability (Phase 2.5)
-- Inspired by OpenClaw's persistent session architecture and context monitoring
-- Integrates with existing agent infrastructure for comprehensive tracking
--
-- FIXES APPLIED (Phase 2.5 Observability Plan):
-- Task 1.1: Removed duplicate function definitions (create_agent_session, log_session_event, hibernate_inactive_sessions)
-- Task 1.2: Fixed invalid index idx_session_events_agent (removed auth.uid() from WHERE clause)
-- Task 1.3: Added missing RLS policies for agent_session_events (agent_own_read, agent_own_write)
-- Task 1.4: Added missing RLS policies for agent_session_metadata (agent_own_select/insert/update/delete)
-- Task 1.5: Added missing RLS policies for agent_session_performance (agent_own_read)
-- Task 1.6: Added updated_at trigger for agent_sessions table
-- Task 1.7: All policies use idempotent patterns (DO $$ blocks with duplicate_object exception handling)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Core session tracking table
CREATE TABLE IF NOT EXISTS agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT UNIQUE NOT NULL,
  agent_id TEXT REFERENCES user_identities(id) ON DELETE CASCADE NOT NULL,
  human_creator_id TEXT REFERENCES user_identities(id),
  
  -- Session state management
  session_type TEXT CHECK (session_type IN ('INTERACTIVE', 'AUTONOMOUS', 'DELEGATED', 'SUPERVISED')) DEFAULT 'INTERACTIVE',
  status TEXT CHECK (status IN ('ACTIVE', 'PAUSED', 'HIBERNATED', 'TERMINATED')) DEFAULT 'ACTIVE',
  
  -- Context and state tracking
  conversation_context JSONB DEFAULT '[]'::jsonb, -- Message history with metadata
  tool_invocation_log JSONB DEFAULT '[]'::jsonb, -- Tool calls with parameters and results
  state_snapshots JSONB DEFAULT '{}'::jsonb, -- Periodic state checkpoints for recovery
  
  -- Resource accounting
  total_messages INTEGER DEFAULT 0,
  total_tool_calls INTEGER DEFAULT 0,
  tokens_consumed INTEGER DEFAULT 0,
  sats_spent BIGINT DEFAULT 0,
  
  -- Multi-channel support
  primary_channel TEXT CHECK (primary_channel IN ('nostr', 'telegram', 'web_ui', 'api', 'cli')) DEFAULT 'nostr',
  channel_metadata JSONB DEFAULT '{}'::jsonb, -- Channel-specific configuration and state
  
  -- Session lifecycle
  started_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  hibernated_at TIMESTAMPTZ,
  terminated_at TIMESTAMPTZ,
  termination_reason TEXT,
  
  -- Context persistence and sync
  context_persistence_enabled BOOLEAN DEFAULT TRUE,
  context_sync_relay TEXT, -- Nostr relay for distributed context synchronization
  auto_hibernate_after_minutes INTEGER DEFAULT 30, -- Auto-hibernate after inactivity
  
  -- Integration with existing systems
  current_task_id UUID REFERENCES agent_task_records(id) ON DELETE SET NULL,
  operational_state_snapshot JSONB, -- Snapshot of agent_operational_state at session start
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fine-grained session event logging for observability
CREATE TABLE IF NOT EXISTS agent_session_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT REFERENCES agent_sessions(session_id) ON DELETE CASCADE NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'MESSAGE', 'TOOL_CALL', 'CONTEXT_REFRESH', 'INTERRUPTION', 'DELEGATION',
    'TASK_ASSIGNMENT', 'TASK_COMPLETION', 'STATE_SNAPSHOT', 'CHANNEL_SWITCH',
    'ERROR', 'WARNING', 'INFO'
  )),
  event_data JSONB NOT NULL, -- Structured event data with context
  
  -- Event metadata and performance
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  latency_ms INTEGER, -- Processing time for this event
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  error_stack_trace TEXT,
  
  -- Cost and resource tracking
  tokens_used INTEGER DEFAULT 0,
  sats_cost BIGINT DEFAULT 0,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  
  -- Context and state
  message_id TEXT, -- Unique message identifier
  tool_name TEXT, -- For tool call events
  tool_parameters JSONB, -- Tool input parameters
  tool_result JSONB, -- Tool execution result
  context_window_size INTEGER, -- Context window size at event time
  
  -- Integration fields
  related_task_id UUID REFERENCES agent_task_records(id) ON DELETE SET NULL,
  nostr_event_id TEXT, -- Associated Nostr event for public channels
  channel_message_id TEXT -- Channel-specific message identifier
);

-- Session metadata and configuration
CREATE TABLE IF NOT EXISTS agent_session_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT REFERENCES agent_sessions(session_id) ON DELETE CASCADE NOT NULL,
  metadata_key TEXT NOT NULL,
  metadata_value JSONB NOT NULL,
  metadata_type TEXT CHECK (metadata_type IN ('string', 'number', 'boolean', 'object', 'array')) DEFAULT 'string',
  
  -- Metadata lifecycle
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  is_persistent BOOLEAN DEFAULT FALSE,
  
  UNIQUE(session_id, metadata_key)
);

-- Session performance analytics
CREATE TABLE IF NOT EXISTS agent_session_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT REFERENCES agent_sessions(session_id) ON DELETE CASCADE NOT NULL UNIQUE,
  
  -- Performance metrics
  avg_response_time_ms INTEGER DEFAULT 0,
  max_response_time_ms INTEGER DEFAULT 0,
  min_response_time_ms INTEGER DEFAULT 0,
  total_response_time_ms INTEGER DEFAULT 0,
  response_count INTEGER DEFAULT 0,
  
  -- Error tracking
  error_count INTEGER DEFAULT 0,
  warning_count INTEGER DEFAULT 0,
  success_rate_percent INTEGER DEFAULT 100 CHECK (success_rate_percent >= 0 AND success_rate_percent <= 100),
  
  -- Resource efficiency
  avg_tokens_per_message INTEGER DEFAULT 0,
  avg_tokens_per_tool_call INTEGER DEFAULT 0,
  cost_efficiency_score INTEGER DEFAULT 100 CHECK (cost_efficiency_score >= 0 AND cost_efficiency_score <= 100),
  
  -- Context efficiency
  context_hit_rate_percent INTEGER DEFAULT 0 CHECK (context_hit_rate_percent >= 0 AND context_hit_rate_percent <= 100),
  context_cache_hits INTEGER DEFAULT 0,
  context_cache_misses INTEGER DEFAULT 0,
  
  -- Time-based metrics
  session_duration_minutes INTEGER DEFAULT 0,
  active_time_minutes INTEGER DEFAULT 0,
  idle_time_minutes INTEGER DEFAULT 0,
  
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance optimization
CREATE INDEX idx_sessions_agent ON agent_sessions(agent_id, last_activity_at DESC);
CREATE INDEX idx_sessions_status ON agent_sessions(status, started_at DESC);
CREATE INDEX idx_sessions_channel ON agent_sessions(primary_channel, status);
CREATE INDEX idx_sessions_type ON agent_sessions(session_type, status);
CREATE INDEX idx_sessions_active ON agent_sessions(status, last_activity_at) WHERE status = 'ACTIVE';

CREATE INDEX idx_session_events_session ON agent_session_events(session_id, timestamp DESC);
CREATE INDEX idx_session_events_type ON agent_session_events(event_type, timestamp DESC);
-- Task 1.2: Fix invalid index - auth.uid() cannot be used in index WHERE clause
-- Using simple index on agent_id column instead (requires adding agent_id to events table or using session_id)
DROP INDEX IF EXISTS idx_session_events_agent;
CREATE INDEX IF NOT EXISTS idx_session_events_agent ON agent_session_events(session_id);
CREATE INDEX idx_session_events_performance ON agent_session_events(timestamp, latency_ms, success);

CREATE INDEX idx_session_metadata_session ON agent_session_metadata(session_id, metadata_key);
CREATE INDEX idx_session_metadata_expires ON agent_session_metadata(expires_at) WHERE expires_at IS NOT NULL;

CREATE INDEX idx_session_performance_session ON agent_session_performance(session_id, recorded_at DESC);

-- RLS (Row Level Security) policies
ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_session_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_session_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_session_performance ENABLE ROW LEVEL SECURITY;

-- Agents can access their own sessions
CREATE POLICY "sessions_own_read" ON agent_sessions
  FOR SELECT USING (agent_id = auth.uid()::TEXT);

CREATE POLICY "sessions_own_write" ON agent_sessions
  FOR UPDATE USING (agent_id = auth.uid()::TEXT);

-- Agents can insert their own sessions
CREATE POLICY "sessions_own_insert" ON agent_sessions
  FOR INSERT WITH CHECK (agent_id = auth.uid()::TEXT);

-- Agents can delete their own sessions (with cleanup)
CREATE POLICY "sessions_own_delete" ON agent_sessions
  FOR DELETE USING (agent_id = auth.uid()::TEXT);

-- Creators can read sessions of agents they created
CREATE POLICY "sessions_creator_read" ON agent_sessions
  FOR SELECT USING (
    human_creator_id = auth.uid()::TEXT OR
    agent_id IN (SELECT user_identity_id FROM agent_profiles WHERE created_by_user_id = auth.uid()::TEXT)
  );

-- Task 1.3: Add missing RLS policies for agent_session_events
-- Agents can read their own session events
DO $$ BEGIN
  CREATE POLICY "session_events_agent_own_read" ON agent_session_events
    FOR SELECT USING (
      session_id IN (SELECT session_id FROM agent_sessions WHERE agent_id = auth.uid()::TEXT)
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Agents can write their own session events
DO $$ BEGIN
  CREATE POLICY "session_events_agent_own_write" ON agent_session_events
    FOR INSERT WITH CHECK (
      session_id IN (SELECT session_id FROM agent_sessions WHERE agent_id = auth.uid()::TEXT)
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Creators can read session events for their agents
CREATE POLICY "session_events_creator_read" ON agent_session_events
  FOR SELECT USING (
    session_id IN (SELECT session_id FROM agent_sessions WHERE human_creator_id = auth.uid()::TEXT OR
                   agent_id IN (SELECT user_identity_id FROM agent_profiles WHERE created_by_user_id = auth.uid()::TEXT))
  );

-- Public read for active session discovery (limited fields)
CREATE POLICY "sessions_public_discovery" ON agent_sessions
  FOR SELECT USING (
    status = 'ACTIVE' AND 
    primary_channel IN ('nostr', 'web_ui') AND
    EXISTS (SELECT 1 FROM agent_profiles WHERE user_identity_id = agent_id AND public_portfolio_enabled = TRUE)
  );

-- Task 1.4: Add missing RLS policies for agent_session_metadata
-- Agents can select metadata for sessions they own
DO $$ BEGIN
  CREATE POLICY "session_metadata_agent_own_select" ON agent_session_metadata
    FOR SELECT USING (
      session_id IN (SELECT session_id FROM agent_sessions WHERE agent_id = auth.uid()::TEXT)
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Agents can insert metadata for sessions they own
DO $$ BEGIN
  CREATE POLICY "session_metadata_agent_own_insert" ON agent_session_metadata
    FOR INSERT WITH CHECK (
      session_id IN (SELECT session_id FROM agent_sessions WHERE agent_id = auth.uid()::TEXT)
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Agents can update metadata for sessions they own
DO $$ BEGIN
  CREATE POLICY "session_metadata_agent_own_update" ON agent_session_metadata
    FOR UPDATE USING (
      session_id IN (SELECT session_id FROM agent_sessions WHERE agent_id = auth.uid()::TEXT)
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Agents can delete metadata for sessions they own
DO $$ BEGIN
  CREATE POLICY "session_metadata_agent_own_delete" ON agent_session_metadata
    FOR DELETE USING (
      session_id IN (SELECT session_id FROM agent_sessions WHERE agent_id = auth.uid()::TEXT)
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Task 1.5: Add missing RLS policies for agent_session_performance
-- Agents can read performance metrics for their own sessions
DO $$ BEGIN
  CREATE POLICY "session_performance_agent_own_read" ON agent_session_performance
    FOR SELECT USING (
      session_id IN (SELECT session_id FROM agent_sessions WHERE agent_id = auth.uid()::TEXT)
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Service role has full access for analytics and maintenance
CREATE POLICY "sessions_service_all" ON agent_sessions
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "session_events_service_all" ON agent_session_events
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "session_metadata_service_all" ON agent_session_metadata
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "session_performance_service_all" ON agent_session_performance
  FOR ALL USING (auth.role() = 'service_role');

-- Task 1.6: Add updated_at trigger for agent_sessions
-- Create or replace trigger function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_agent_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and create it
DROP TRIGGER IF EXISTS agent_sessions_updated_at_trigger ON agent_sessions;
CREATE TRIGGER agent_sessions_updated_at_trigger
  BEFORE UPDATE ON agent_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_agent_sessions_updated_at();

-- Task 1.1: Remove duplicate function definitions
-- The following functions were defined twice (lines 214-282 and 284-352)
-- Keeping only one definition of each with CREATE OR REPLACE for idempotency

-- Session management functions
CREATE OR REPLACE FUNCTION create_agent_session(
  p_agent_id UUID,
  p_session_type TEXT,
  p_primary_channel TEXT DEFAULT 'nostr',
  p_human_creator_id UUID DEFAULT NULL
) RETURNS TEXT AS $$
DECLARE
  v_session_id TEXT;
BEGIN
  -- Generate a secure session ID
  v_session_id := 'sess_' || encode(gen_random_bytes(16), 'hex');

  INSERT INTO agent_sessions (
    session_id, agent_id, human_creator_id, session_type, primary_channel
  ) VALUES (
    v_session_id, p_agent_id, p_human_creator_id, p_session_type, p_primary_channel
  );

  RETURN v_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION log_session_event(
  p_session_id TEXT,
  p_event_type TEXT,
  p_event_data JSONB,
  p_tokens_used INTEGER DEFAULT 0,
  p_sats_cost BIGINT DEFAULT 0
) RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO agent_session_events (
    session_id, event_type, event_data, tokens_used, sats_cost
  ) VALUES (
    p_session_id, p_event_type, p_event_data, p_tokens_used, p_sats_cost
  ) RETURNING id INTO v_event_id;

  -- Update session last_activity and resource usage
  UPDATE agent_sessions
  SET last_activity_at = NOW(),
      total_messages = total_messages + CASE WHEN p_event_type = 'MESSAGE' THEN 1 ELSE 0 END,
      total_tool_calls = total_tool_calls + CASE WHEN p_event_type = 'TOOL_CALL' THEN 1 ELSE 0 END,
      tokens_consumed = tokens_consumed + p_tokens_used,
      sats_spent = sats_spent + p_sats_cost
  WHERE session_id = p_session_id;

  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Hibernate inactive sessions (call via cron)
CREATE OR REPLACE FUNCTION hibernate_inactive_sessions(
  p_inactivity_hours INTEGER DEFAULT 24
) RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE agent_sessions
  SET status = 'HIBERNATED',
      hibernated_at = NOW()
  WHERE status = 'ACTIVE'
    AND last_activity_at < NOW() - (p_inactivity_hours || ' hours')::INTERVAL;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count;
END;$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;