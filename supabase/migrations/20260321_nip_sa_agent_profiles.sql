-- NIP-SA: Sovereign Agents — Agent Wallet Policy Extensions
-- Migration: 20260321_nip_sa_agent_profiles
-- Purpose: Extend agent_profiles table with NIP-SA wallet policy columns
-- Aligned with: docs/planning/NIP-Triumvirate-Satnam-Integration-Plan.md §6
-- Spec: docs/specs/SA.md

-- ============================================================================
-- EXTEND AGENT_PROFILES TABLE WITH NIP-SA WALLET POLICY COLUMNS
-- ============================================================================
-- These columns enable agent wallet policy enforcement, sweep automation,
-- and skill licensing as defined in NIP-SA (kind 39200)

-- NIP-SA Profile Event Reference
ALTER TABLE agent_profiles
  ADD COLUMN IF NOT EXISTS nip_sa_profile_event_id TEXT;

COMMENT ON COLUMN agent_profiles.nip_sa_profile_event_id IS
  'Nostr event id of published kind 39200 agent profile event';

-- Wallet Policy: Spending Limits
ALTER TABLE agent_profiles
  ADD COLUMN IF NOT EXISTS max_single_spend_sats BIGINT DEFAULT 1000;

COMMENT ON COLUMN agent_profiles.max_single_spend_sats IS
  'Maximum sats an agent can spend in a single transaction without guardian approval';

ALTER TABLE agent_profiles
  ADD COLUMN IF NOT EXISTS daily_limit_sats BIGINT DEFAULT 100000;

COMMENT ON COLUMN agent_profiles.daily_limit_sats IS
  'Maximum sats an agent can spend per 24-hour period';

ALTER TABLE agent_profiles
  ADD COLUMN IF NOT EXISTS requires_approval_above_sats BIGINT DEFAULT 10000;

COMMENT ON COLUMN agent_profiles.requires_approval_above_sats IS
  'Spending threshold above which guardian/steward approval is required';

-- Wallet Policy: Payment Rail Preferences
ALTER TABLE agent_profiles
  ADD COLUMN IF NOT EXISTS preferred_spend_rail TEXT
    CHECK (preferred_spend_rail IN ('lightning', 'cashu', 'fedimint'))
    DEFAULT 'lightning';

COMMENT ON COLUMN agent_profiles.preferred_spend_rail IS
  'Preferred payment rail for agent spending (lightning = BOLT-11, cashu = eCash, fedimint = federated eCash)';

ALTER TABLE agent_profiles
  ADD COLUMN IF NOT EXISTS allowed_mints TEXT[] DEFAULT '{}';

COMMENT ON COLUMN agent_profiles.allowed_mints IS
  'Array of Cashu mint URLs the agent is authorized to use';

-- Sweep Policy: Automated Balance Management
ALTER TABLE agent_profiles
  ADD COLUMN IF NOT EXISTS sweep_threshold_sats BIGINT DEFAULT 50000;

COMMENT ON COLUMN agent_profiles.sweep_threshold_sats IS
  'Balance threshold at which agent automatically sweeps funds to guardian-controlled address';

ALTER TABLE agent_profiles
  ADD COLUMN IF NOT EXISTS sweep_destination TEXT;

COMMENT ON COLUMN agent_profiles.sweep_destination IS
  'Lightning address or on-chain address for automated sweeps';

ALTER TABLE agent_profiles
  ADD COLUMN IF NOT EXISTS sweep_rail TEXT
    CHECK (sweep_rail IN ('lightning', 'cashu', 'fedimint'))
    DEFAULT 'lightning';

COMMENT ON COLUMN agent_profiles.sweep_rail IS
  'Payment rail to use for automated sweeps';

-- Well-Known Endpoint Publishing
ALTER TABLE agent_profiles
  ADD COLUMN IF NOT EXISTS well_known_published_at TIMESTAMPTZ;

COMMENT ON COLUMN agent_profiles.well_known_published_at IS
  'Timestamp when .well-known/agent.json was last published for this agent';

-- Skill Licensing: Enabled Skills
ALTER TABLE agent_profiles
  ADD COLUMN IF NOT EXISTS enabled_skill_scope_ids TEXT[] DEFAULT '{}';

COMMENT ON COLUMN agent_profiles.enabled_skill_scope_ids IS
  'Array of skill_scope_ids (from NIP-SKL) that this agent is licensed to execute';

-- ============================================================================
-- INDEXES FOR QUERY OPTIMIZATION
-- ============================================================================

-- Index for preferred_spend_rail (filter agents by payment rail)
CREATE INDEX IF NOT EXISTS idx_agent_profiles_spend_rail
  ON agent_profiles(preferred_spend_rail);

-- Index for enabled_skill_scope_ids (query agents by skill capability)
-- GIN index for array containment queries
CREATE INDEX IF NOT EXISTS idx_agent_profiles_enabled_skills
  ON agent_profiles USING GIN(enabled_skill_scope_ids);

-- Index for sweep_threshold_sats (query agents needing sweep)
CREATE INDEX IF NOT EXISTS idx_agent_profiles_sweep_threshold
  ON agent_profiles(sweep_threshold_sats)
  WHERE sweep_destination IS NOT NULL;

-- ============================================================================
-- TRIGGER: Update updated_at timestamp (if not already exists)
-- ============================================================================

-- Note: The agent_profiles table likely already has an updated_at trigger
-- from the original migration. This is a safety check.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'agent_profiles_updated_at_trigger'
  ) THEN
    CREATE TRIGGER agent_profiles_updated_at_trigger
      BEFORE UPDATE ON agent_profiles
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ============================================================================
-- VERIFICATION QUERY
-- ============================================================================

-- Verify all NIP-SA columns were added successfully
DO $$
DECLARE
  missing_columns TEXT[] := ARRAY[]::TEXT[];
  col TEXT;
BEGIN
  -- Check each NIP-SA column
  FOR col IN
    SELECT unnest(ARRAY[
      'nip_sa_profile_event_id',
      'max_single_spend_sats',
      'daily_limit_sats',
      'requires_approval_above_sats',
      'preferred_spend_rail',
      'allowed_mints',
      'sweep_threshold_sats',
      'sweep_destination',
      'sweep_rail',
      'well_known_published_at',
      'enabled_skill_scope_ids'
    ])
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'agent_profiles'
        AND column_name = col
    ) THEN
      missing_columns := array_append(missing_columns, col);
    END IF;
  END LOOP;

  IF array_length(missing_columns, 1) > 0 THEN
    RAISE EXCEPTION '✗ NIP-SA columns missing: %', array_to_string(missing_columns, ', ');
  ELSE
    RAISE NOTICE '✓ All 11 NIP-SA wallet policy columns added successfully';
  END IF;
END $$;

