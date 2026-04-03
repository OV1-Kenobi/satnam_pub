-- Idempotent migration: Agent profiles with monetization tracking
-- Compatible with: user_identities (current schema), family_members, parent_offspring_relationships

CREATE TABLE IF NOT EXISTS agent_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- FK to user_identities (the agent's base user record)
  user_identity_id TEXT NOT NULL UNIQUE REFERENCES user_identities(id),

  -- Agent identity (maps to 'adult' or 'offspring' in user_identities.role)
  is_agent BOOLEAN NOT NULL DEFAULT TRUE,
  agent_username TEXT UNIQUE,
  unified_address TEXT UNIQUE, -- e.g. agent-name@ai.satnam.pub
  created_by_user_id TEXT REFERENCES user_identities(id), -- human who created this agent (for creator revenue share)
  lnbits_creator_split_id TEXT, -- LNbits Split Payments config ID for creator share

  -- Monetization tracking
  total_platform_fees_paid_sats BIGINT DEFAULT 0,
  free_tier_claimed BOOLEAN DEFAULT FALSE,
  free_tier_allocation_number INTEGER,

  -- Blind token balance (decremented by trigger on agent_blind_tokens)
  event_tokens_balance INTEGER DEFAULT 0,
  task_tokens_balance INTEGER DEFAULT 0,
  contact_tokens_balance INTEGER DEFAULT 0,
  dm_tokens_balance INTEGER DEFAULT 0,

  -- Reputation & scoring
  reputation_score INTEGER DEFAULT 0,
  credit_limit_sats BIGINT DEFAULT 0,
  total_settled_sats BIGINT DEFAULT 0,
  settlement_success_count INTEGER DEFAULT 0,
  settlement_default_count INTEGER DEFAULT 0,

  -- Performance bonds
  total_bonds_staked_sats BIGINT DEFAULT 0,
  total_bonds_released_sats BIGINT DEFAULT 0,
  total_bonds_slashed_sats BIGINT DEFAULT 0,
  bond_slash_count INTEGER DEFAULT 0,
  current_bonded_sats BIGINT DEFAULT 0,

  -- Work history metrics
  total_tasks_completed INTEGER DEFAULT 0,
  total_tasks_failed INTEGER DEFAULT 0,
  tier1_validations INTEGER DEFAULT 0,
  tier2_validations INTEGER DEFAULT 0,
  tier3_validations INTEGER DEFAULT 0,

  -- Communication preferences
  accepts_encrypted_dms BOOLEAN DEFAULT TRUE,
  public_portfolio_enabled BOOLEAN DEFAULT TRUE,
  coordination_relay_urls TEXT[], -- Populated from config, NOT hardcoded

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN
  CREATE TYPE wallet_custody_type AS ENUM (
    'self_custodial',
    'lnbits_proxy',
    'lightning_faucet'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE agent_profiles
  ADD COLUMN IF NOT EXISTS wallet_custody_type wallet_custody_type
    DEFAULT 'self_custodial',
  ADD COLUMN IF NOT EXISTS lightning_faucet_agent_key_encrypted TEXT;

DO $$ BEGIN
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_agent_profiles_user_id ON agent_profiles(user_identity_id)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_agent_profiles_username ON agent_profiles(agent_username)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_agent_profiles_reputation ON agent_profiles(reputation_score DESC)';
END $$;

-- ============================================================
-- RLS POLICIES
-- ============================================================
ALTER TABLE agent_profiles ENABLE ROW LEVEL SECURITY;

-- Agents can read their own profile
CREATE POLICY "agent_profiles_own_read" ON agent_profiles
  FOR SELECT USING (user_identity_id = auth.uid()::TEXT);

-- Agents can update their own profile (communication prefs, etc.)
CREATE POLICY "agent_profiles_own_update" ON agent_profiles
  FOR UPDATE USING (user_identity_id = auth.uid()::TEXT);

-- Public read for reputation/discovery (excludes sensitive monetization fields via column-level grants)
CREATE POLICY "agent_profiles_public_read" ON agent_profiles
  FOR SELECT USING (public_portfolio_enabled = TRUE);

-- Service role: full access for creation and admin operations
CREATE POLICY "agent_profiles_service_write" ON agent_profiles
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- M5: PUBLIC VIEW FOR AGENT DISCOVERY (EXCLUDES MONETIZATION DATA)
-- ============================================================
-- Create a public view that excludes sensitive financial columns
-- This prevents exposure of token balances, revenue metrics, and bond details

CREATE OR REPLACE VIEW agent_profiles_public AS
SELECT
  id,
  user_identity_id,
  is_agent,
  agent_username,
  unified_address,

  -- Reputation & scoring (PUBLIC)
  reputation_score,

  -- Work history metrics (PUBLIC)
  total_tasks_completed,
  total_tasks_failed,
  tier1_validations,
  tier2_validations,
  tier3_validations,

  -- Communication preferences (PUBLIC)
  accepts_encrypted_dms,
  public_portfolio_enabled,
  coordination_relay_urls,

  created_at,
  updated_at

  -- EXCLUDED (PRIVATE):
  -- total_platform_fees_paid_sats, free_tier_claimed, free_tier_allocation_number
  -- event_tokens_balance, task_tokens_balance, contact_tokens_balance, dm_tokens_balance
  -- credit_limit_sats, total_settled_sats, settlement_success_count, settlement_default_count
  -- total_bonds_staked_sats, total_bonds_released_sats, total_bonds_slashed_sats
  -- bond_slash_count, current_bonded_sats, created_by_user_id
FROM agent_profiles
WHERE public_portfolio_enabled = TRUE;

-- Grant public read access to the view
GRANT SELECT ON agent_profiles_public TO anon, authenticated;

-- Note: Applications should use agent_profiles_public for discovery/search
-- and agent_profiles (with RLS) for authenticated agent's own data

-- ============================================================
-- TRIGGER TO UPDATE TOKEN BALANCES
-- ============================================================
-- Token balance trigger targets agent_profiles (NOT deprecated profiles table)
CREATE OR REPLACE FUNCTION update_token_balance()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'redeemed' AND OLD.status = 'issued' THEN
    IF NEW.token_type = 'event_post' THEN
      UPDATE agent_profiles SET event_tokens_balance = GREATEST(event_tokens_balance - 1, 0)
      WHERE user_identity_id = NEW.issued_to_agent_id;
    ELSIF NEW.token_type = 'task_create' THEN
      UPDATE agent_profiles SET task_tokens_balance = GREATEST(task_tokens_balance - 1, 0)
      WHERE user_identity_id = NEW.issued_to_agent_id;
    ELSIF NEW.token_type = 'contact_add' THEN
      UPDATE agent_profiles SET contact_tokens_balance = GREATEST(contact_tokens_balance - 1, 0)
      WHERE user_identity_id = NEW.issued_to_agent_id;
    ELSIF NEW.token_type = 'dm_send' THEN
      UPDATE agent_profiles SET dm_tokens_balance = GREATEST(dm_tokens_balance - 1, 0)
      WHERE user_identity_id = NEW.issued_to_agent_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- Idempotent: only attach trigger if agent_blind_tokens already exists
-- (it is created in 20260212_blinded_authentication.sql; that migration
--  will attach the trigger itself if this one ran first)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'agent_blind_tokens'
  ) THEN
    DROP TRIGGER IF EXISTS token_redemption_balance_update ON agent_blind_tokens;
    CREATE TRIGGER token_redemption_balance_update
      AFTER UPDATE OF status ON agent_blind_tokens
      FOR EACH ROW
      EXECUTE FUNCTION update_token_balance();
  END IF;
END $$;