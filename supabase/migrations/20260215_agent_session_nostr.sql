-- Phase 2.5 - Step 11: Multi-Channel Nostr Context Sync
-- Migration: agent_session_channel_history + extend event_type CHECK

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1) Create channel history table (idempotent)
CREATE TABLE IF NOT EXISTS agent_session_channel_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL REFERENCES agent_sessions(session_id) ON DELETE CASCADE,
  from_channel TEXT NOT NULL CHECK (from_channel IN ('nostr','telegram','web_ui','api','cli')),
  to_channel   TEXT NOT NULL CHECK (to_channel   IN ('nostr','telegram','web_ui','api','cli')),
  switched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Only persist the snapshot event_id (privacy-first)
  context_snapshot_event_id TEXT,
  -- Linkage to session timeline CHANNEL_SWITCH event
  channel_switch_event_id UUID REFERENCES agent_session_events(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Helpful index for timeline/history queries
CREATE INDEX IF NOT EXISTS idx_channel_history_session ON agent_session_channel_history(session_id, switched_at DESC);

-- Covering index on agent_sessions(agent_id, session_id) to satisfy the RLS subquery
-- "session_id IN (SELECT session_id FROM agent_sessions WHERE agent_id = auth.uid())"
-- without requiring a heap fetch for each matching row.
CREATE INDEX IF NOT EXISTS idx_sessions_agent_session_covering ON agent_sessions(agent_id, session_id);

-- 2) Enable RLS and add idempotent policies aligned with agent_session_events
ALTER TABLE agent_session_channel_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "channel_history_agent_own_read" ON agent_session_channel_history
    FOR SELECT USING (
      session_id IN (SELECT session_id FROM agent_sessions WHERE agent_id = auth.uid()::TEXT)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "channel_history_agent_own_insert" ON agent_session_channel_history
    FOR INSERT WITH CHECK (
      session_id IN (SELECT session_id FROM agent_sessions WHERE agent_id = auth.uid()::TEXT)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "channel_history_agent_own_update" ON agent_session_channel_history
    FOR UPDATE USING (
      session_id IN (SELECT session_id FROM agent_sessions WHERE agent_id = auth.uid()::TEXT)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "channel_history_agent_own_delete" ON agent_session_channel_history
    FOR DELETE USING (
      session_id IN (SELECT session_id FROM agent_sessions WHERE agent_id = auth.uid()::TEXT)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Service role full access (analytics/maintenance)
DO $$ BEGIN
  CREATE POLICY "channel_history_service_all" ON agent_session_channel_history
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Extend event_type CHECK on agent_session_events to include 'CONFLICT_DETECTED'
--    Drop the original generated CHECK constraint and re-add with the new list
DO $$
DECLARE
  chk_name text := 'agent_session_events_event_type_check';
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'agent_session_events'
      AND c.conname = chk_name
  ) THEN
    EXECUTE 'ALTER TABLE agent_session_events DROP CONSTRAINT ' || chk_name;
  END IF;

  EXECUTE $$ALTER TABLE agent_session_events
    ADD CONSTRAINT agent_session_events_event_type_check
    CHECK (event_type IN (
      'MESSAGE','TOOL_CALL','CONTEXT_REFRESH','INTERRUPTION','DELEGATION',
      'TASK_ASSIGNMENT','TASK_COMPLETION','STATE_SNAPSHOT','CHANNEL_SWITCH',
      'ERROR','WARNING','INFO','CONFLICT_DETECTED'
    ))$$;
END $$;

-- NOTE: PostgreSQL cannot express an FK conditional on event_type directly.
-- We enforce linkage to agent_session_events(id) and rely on application logic
-- to reference the latest CHANNEL_SWITCH event when inserting channel history.

