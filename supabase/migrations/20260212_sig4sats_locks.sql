-- IDEMPOTENT: Safe to run multiple times
-- Create enum type idempotently
DO $$ BEGIN
  CREATE TYPE sig4sats_status AS ENUM ('locked', 'redeemed', 'expired', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create table idempotently
CREATE TABLE IF NOT EXISTS sig4sats_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- Postgres native (NOT uuid_generate_v4)

  -- Cashu token locked to signature
  cashu_token TEXT NOT NULL,
  cashu_mint_url TEXT NOT NULL,
  locked_amount_sats BIGINT NOT NULL,

  -- Event template that must be signed
  event_template JSONB NOT NULL,
  required_kind INTEGER,
  required_tags JSONB,

  -- Lock owner: References user_identities (NOT deprecated profiles)
  agent_id TEXT REFERENCES user_identities(id),
  created_by_npub TEXT,

  -- Status
  status sig4sats_status DEFAULT 'locked',
  locked_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,

  -- Redemption
  redeemed_at TIMESTAMPTZ,
  settlement_event_id TEXT,
  settlement_signature TEXT,

  -- Related credit envelope
  credit_envelope_id UUID REFERENCES credit_envelopes(id),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Idempotent indexes
DO $$ BEGIN EXECUTE 'CREATE INDEX IF NOT EXISTS idx_sig4sats_agent ON sig4sats_locks(agent_id)'; END $$;
DO $$ BEGIN EXECUTE 'CREATE INDEX IF NOT EXISTS idx_sig4sats_status ON sig4sats_locks(status)'; END $$;
DO $$ BEGIN EXECUTE 'CREATE INDEX IF NOT EXISTS idx_sig4sats_envelope ON sig4sats_locks(credit_envelope_id)'; END $$;
DO $$ BEGIN EXECUTE 'CREATE INDEX IF NOT EXISTS idx_sig4sats_expires ON sig4sats_locks(expires_at) WHERE status = ''locked'''; END $$;
-- Idempotent ALTER TABLE: Add Sig4Sats columns to credit_envelopes
DO $$ BEGIN
  ALTER TABLE credit_envelopes ADD COLUMN sig4sats_lock_id UUID REFERENCES sig4sats_locks(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE credit_envelopes ADD COLUMN sig4sats_redeemed BOOLEAN DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE credit_envelopes ADD COLUMN sig4sats_bonus_sats BIGINT DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Idempotent ALTER TABLE: Add Sig4Sats columns to agent_settlements
DO $$ BEGIN
  ALTER TABLE agent_settlements ADD COLUMN sig4sats_redeemed BOOLEAN DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE agent_settlements ADD COLUMN sig4sats_amount_sats BIGINT DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- RLS policies for sig4sats_locks
ALTER TABLE sig4sats_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "agents_read_own_sig4sats_locks"
DROP POLICY IF EXISTS "agents_read_own_sig4sats_locks" ON sig4sats_locks;
CREATE POLICY "agents_read_own_sig4sats_locks"
  ON sig4sats_locks FOR SELECT
  USING (agent_id = auth.uid()::TEXT);

DROP POLICY IF EXISTS "agents_insert_own_sig4sats_locks" ON sig4sats_locks;
CREATE POLICY "agents_insert_own_sig4sats_locks"
  ON sig4sats_locks FOR INSERT
  WITH CHECK (agent_id = auth.uid()::TEXT);

DROP POLICY IF EXISTS "service_role_full_sig4sats_locks" ON sig4sats_locks;
CREATE POLICY "service_role_full_sig4sats_locks"
  ON sig4sats_locks FOR ALL
  USING (auth.role() = 'service_role');