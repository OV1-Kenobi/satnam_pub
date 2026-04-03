-- IDEMPOTENT: Safe to run multiple times
-- Create reputation infrastructure tables for portable agent reputation

-- Create enum type idempotently
DO $$ BEGIN
  CREATE TYPE reputation_event_type AS ENUM ('task_completion', 'contract_fulfillment', 'validation', 'attestation', 'imported');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create atomic reputation events table
CREATE TABLE IF NOT EXISTS agent_reputation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Subject of the reputation event (always an agent identity)
  subject_agent_id TEXT NOT NULL REFERENCES user_identities(id),

  -- Rater can be human or agent; nullable for imported or system events
  rater_identity_id TEXT REFERENCES user_identities(id),

  -- Link to underlying task / envelope / contract when applicable
  related_task_id UUID,
  related_envelope_id UUID,

  -- Nostr attestation metadata (NIP-32 label or custom kind 1985-style event)
  nostr_event_id TEXT,
  nostr_event_kind INTEGER, -- e.g. 32 for labels, 1985 for "satnam_attestation"
  label_namespace TEXT,     -- e.g. "satnam.reputation"
  label_name TEXT,          -- e.g. "task_completed", "contract_fulfilled"

  -- Raw score and computed weight before decay (see 3.8.3)
  raw_score SMALLINT NOT NULL,
  weight NUMERIC NOT NULL,

  context JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create aggregated trust links table
CREATE TABLE IF NOT EXISTS agent_trust_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- from_identity_id/to_agent_id are **internal** identifiers; any public
  -- views must use hashed DUIDs from privacy_users to avoid social graph leaks
  from_identity_id TEXT NOT NULL REFERENCES user_identities(id),
  to_agent_id TEXT NOT NULL REFERENCES user_identities(id),

  successful_interactions INTEGER DEFAULT 0,
  failed_interactions INTEGER DEFAULT 0,
  last_interaction_at TIMESTAMPTZ,

  -- Rolling trust score used for routing and rate limits, not for raw display
  trust_score NUMERIC DEFAULT 0,

  context JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (from_identity_id, to_agent_id)
);

-- Create reputation decay function
CREATE OR REPLACE FUNCTION calculate_decayed_reputation(
  p_agent_id UUID,
  p_now TIMESTAMPTZ DEFAULT NOW()
)
RETURNS NUMERIC AS $$
  -- Example: exponential decay with half-life ~180 days
  SELECT COALESCE(SUM(
    weight * EXP(-EXTRACT(EPOCH FROM (p_now - created_at)) / (180 * 24 * 3600))
  ), 0)
  FROM agent_reputation_events
  WHERE subject_agent_id = p_agent_id;
$$ LANGUAGE sql STABLE;

-- Create function to update agent reputation scores
CREATE OR REPLACE FUNCTION update_agent_reputation_scores()
RETURNS VOID AS $$
BEGIN
  UPDATE agent_profiles
  SET reputation_score = calculate_decayed_reputation(user_identity_id)
  WHERE user_identity_id IN (
    SELECT DISTINCT subject_agent_id FROM agent_reputation_events
  );
END;
$$ LANGUAGE plpgsql;

-- Idempotent indexes
DO $$ BEGIN EXECUTE 'CREATE INDEX IF NOT EXISTS idx_reputation_subject ON agent_reputation_events(subject_agent_id)'; END $$;
DO $$ BEGIN EXECUTE 'CREATE INDEX IF NOT EXISTS idx_reputation_rater ON agent_reputation_events(rater_identity_id)'; END $$;
DO $$ BEGIN EXECUTE 'CREATE INDEX IF NOT EXISTS idx_reputation_created ON agent_reputation_events(created_at)'; END $$;
DO $$ BEGIN EXECUTE 'CREATE INDEX IF NOT EXISTS idx_trust_from ON agent_trust_links(from_identity_id)'; END $$;
DO $$ BEGIN EXECUTE 'CREATE INDEX IF NOT EXISTS idx_trust_to ON agent_trust_links(to_agent_id)'; END $$;

-- RLS policies for agent_reputation_events
ALTER TABLE agent_reputation_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reputation_events_subject_or_rater" ON agent_reputation_events;
CREATE POLICY "reputation_events_subject_or_rater"
  ON agent_reputation_events
  FOR SELECT
  USING (
    subject_agent_id = auth.uid()::TEXT
    OR rater_identity_id = auth.uid()::TEXT
  );

DROP POLICY IF EXISTS "reputation_events_service_full" ON agent_reputation_events;
CREATE POLICY "reputation_events_service_full"
  ON agent_reputation_events
  FOR ALL
  USING (auth.role() = 'service_role');

-- RLS policies for agent_trust_links
ALTER TABLE agent_trust_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trust_links_from_identity" ON agent_trust_links;
CREATE POLICY "trust_links_from_identity"
  ON agent_trust_links
  FOR SELECT, UPDATE
  USING (from_identity_id = auth.uid()::TEXT)
  WITH CHECK (from_identity_id = auth.uid()::TEXT);

DROP POLICY IF EXISTS "trust_links_service_full" ON agent_trust_links;
CREATE POLICY "trust_links_service_full"
  ON agent_trust_links
  FOR ALL
  USING (auth.role() = 'service_role');

-- Add reputation columns to existing agent_profiles table
DO $$ BEGIN
  ALTER TABLE agent_profiles ADD COLUMN reputation_events_count INTEGER DEFAULT 0;
  ALTER TABLE agent_profiles ADD COLUMN last_reputation_event TIMESTAMPTZ;
  ALTER TABLE agent_profiles ADD COLUMN reputation_updated_at TIMESTAMPTZ DEFAULT NOW();
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Add trigger to update reputation metadata
CREATE OR REPLACE FUNCTION update_agent_reputation_metadata()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE agent_profiles
    SET 
      reputation_events_count = (SELECT COUNT(*) FROM agent_reputation_events WHERE subject_agent_id = NEW.subject_agent_id),
      last_reputation_event = NEW.created_at,
      reputation_updated_at = NOW()
    WHERE user_identity_id = NEW.subject_agent_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_agent_reputation_metadata ON agent_reputation_events;
CREATE TRIGGER trigger_update_agent_reputation_metadata
  AFTER INSERT OR UPDATE ON agent_reputation_events
  FOR EACH ROW
  EXECUTE FUNCTION update_agent_reputation_metadata();