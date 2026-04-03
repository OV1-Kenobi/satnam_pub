-- Idempotent migration: all statements use IF NOT EXISTS / ON CONFLICT guards
-- Compatible with: user_identities (current schema), privacy-first architecture

-- Fee schedule table (configurable fees)
CREATE TABLE IF NOT EXISTS platform_fee_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type TEXT NOT NULL UNIQUE,
  fee_sats BIGINT NOT NULL,
  description TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- MONETIZATION UPDATE: Anti-spam focused pricing model
-- Primary goal: Sybil resistance, not revenue generation
-- Event fees differentiated by kind and impact level
-- DM messaging uses bundled tokens (token_value > 1) for efficiency

-- Seed initial fee schedule (idempotent via ON CONFLICT)
INSERT INTO platform_fee_schedule (action_type, fee_sats, description) VALUES
-- DIRECT-PAY ONLY ACTIONS (high-value, identity-linked, rare operations)
('agent_account_creation', 1000, 'One-time fee to create agent account'),
('bond_deposit', 0, 'Performance bond deposit (amount varies by operation)'),
('credit_envelope_request', 200, 'Fee to request credit envelope'),

-- BLIND-TOKEN ELIGIBLE ACTIONS (privacy-sensitive, high-frequency operations)
-- Event publishing fees (anti-spam level ~21 sats)
('agent_account_init_event', 21, 'Account initialization/metadata event (anti-spam)'),
('agent_status_update_event', 21, 'Agent status/operational event (anti-spam)'),
('agent_attestation_light', 21, 'Light attestation/endorsement (anti-spam)'),
('agent_attestation_strong', 42, 'Strong bond-backed attestation'),
('agent_badge_award_event', 42, 'NIP-58 badge award event'),

-- Messaging fees (bundled for efficiency)
('agent_dm_bundle', 21, 'Bundle of 10 NIP-17 DMs (token_value=10)'),

-- Other operations
('contact_add', 50, 'Fee to add contact or relay'),
('task_record_create', 150, 'Fee to create task record'),
('profile_update', 10, 'Fee to update profile')
ON CONFLICT (action_type) DO NOTHING;

-- NOTE: Subscription models and volume discounts are POST-MVP (Phase 3+)
-- Current model focuses on pure anti-spam economics with minimal friction

-- Platform revenue tracking
DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'failed', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS platform_revenue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who paid (references user_identities, not deprecated profiles)
  payer_agent_id TEXT REFERENCES user_identities(id),
  payer_npub TEXT,

  -- What action
  action_type TEXT NOT NULL,
  fee_sats BIGINT NOT NULL,

  -- Payment details
  payment_protocol TEXT NOT NULL, -- 'lightning', 'cashu', 'fedimint', 'free_tier'
  payment_hash TEXT,
  payment_proof TEXT, -- Invoice preimage, Cashu token, Fedimint txid
  payment_status payment_status DEFAULT 'pending',

  -- Related entity
  related_agent_id UUID,
  related_event_id TEXT,
  related_task_id UUID,

  -- Revenue split (optional)
  referrer_npub TEXT,
  referrer_split_sats BIGINT DEFAULT 0,
  validator_npub TEXT,
  validator_split_sats BIGINT DEFAULT 0,

  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes (idempotent via DO block with dynamic EXECUTE)
DO $$ BEGIN
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_revenue_payer ON platform_revenue(payer_agent_id, created_at DESC)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_revenue_action ON platform_revenue(action_type)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_revenue_status ON platform_revenue(payment_status)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_revenue_payment_hash ON platform_revenue(payment_hash)';
END $$;

-- MONETIZATION UPDATE: Configurable free tier size
-- Default: 210 slots (increased from 21 for better network bootstrap)
-- Deployment-tunable via environment variable: FREE_TIER_LIMIT
-- NOTE: This is a deployment parameter, not a protocol constant
-- Consider per-human/per-guardian limits to prevent Sybil farming

-- Free tier tracking (configurable size, default 210 agents)
CREATE TABLE IF NOT EXISTS free_tier_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_number INTEGER UNIQUE NOT NULL CHECK (allocation_number >= 1),
  agent_id TEXT REFERENCES user_identities(id) UNIQUE,
  claimed_at TIMESTAMPTZ,
  claimed_by_npub TEXT, -- Track who claimed without requiring FK join

  -- PRIVACY NOTE: Consider hashing npub with per-deployment salt
  -- to minimize social graph correlation surfaces
  claimed_by_human_id TEXT REFERENCES user_identities(id) -- Track parent human for Sybil limits
);

-- Pre-populate slots (idempotent via ON CONFLICT)
-- Default: 210 slots (tune this number based on deployment strategy)
-- For production, consider making this a configuration table instead of hard-coded
INSERT INTO free_tier_allocations (allocation_number)
SELECT generate_series(1, 210)
ON CONFLICT (allocation_number) DO NOTHING;

-- SECURITY ADDITION: Per-human free tier limits
-- Prevents single human from claiming all free slots via Sybil agents
-- Enforced via application logic in claim_free_tier_slot RPC (see Task 2.2)

-- Revenue aggregation view
CREATE OR REPLACE VIEW platform_revenue_summary AS
SELECT
  action_type,
  COUNT(*) as transaction_count,
  SUM(fee_sats) as total_revenue_sats,
  SUM(referrer_split_sats + validator_split_sats) as total_splits_sats,
  SUM(fee_sats - referrer_split_sats - validator_split_sats) as net_revenue_sats
FROM platform_revenue
WHERE payment_status = 'paid'
GROUP BY action_type;

-- ============================================================
-- RLS POLICIES (required for all new tables)
-- ============================================================
ALTER TABLE platform_fee_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_revenue ENABLE ROW LEVEL SECURITY;
ALTER TABLE free_tier_allocations ENABLE ROW LEVEL SECURITY;

-- platform_fee_schedule: public read, service-role write
CREATE POLICY "fee_schedule_public_read" ON platform_fee_schedule
  FOR SELECT USING (true);
CREATE POLICY "fee_schedule_service_write" ON platform_fee_schedule
  FOR ALL USING (auth.role() = 'service_role');

-- platform_revenue: users can read their own records, service-role full access
CREATE POLICY "revenue_own_read" ON platform_revenue
  FOR SELECT USING (payer_agent_id = auth.uid()::TEXT);
CREATE POLICY "revenue_service_write" ON platform_revenue
  FOR ALL USING (auth.role() = 'service_role');

-- free_tier_allocations: public read (transparency), service-role write
CREATE POLICY "free_tier_public_read" ON free_tier_allocations
  FOR SELECT USING (true);
CREATE POLICY "free_tier_service_write" ON free_tier_allocations
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- ATOMIC FREE TIER CLAIM (prevents TOCTOU race conditions)
-- Called via supabase.rpc('claim_free_tier_slot', {...})
-- Uses SELECT ... FOR UPDATE SKIP LOCKED for safe concurrency
-- ============================================================
CREATE OR REPLACE FUNCTION claim_free_tier_slot(
  p_agent_id UUID,
  p_agent_npub TEXT DEFAULT NULL
) RETURNS TABLE(allocation_number INTEGER) AS $$
DECLARE
  v_slot INTEGER;
BEGIN
  -- Atomically find and lock the lowest unclaimed slot
  SELECT fta.allocation_number INTO v_slot
  FROM free_tier_allocations fta
  WHERE fta.agent_id IS NULL
  ORDER BY fta.allocation_number ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_slot IS NULL THEN
    RETURN; -- No free slots available
  END IF;

  -- Claim the slot
  UPDATE free_tier_allocations
  SET agent_id = p_agent_id,
      claimed_at = NOW(),
      claimed_by_npub = p_agent_npub
  WHERE free_tier_allocations.allocation_number = v_slot
    AND agent_id IS NULL; -- Double-check unclaimed

  IF NOT FOUND THEN
    RETURN; -- Slot was claimed between SELECT and UPDATE (edge case)
  END IF;

  -- Return the claimed slot number
  RETURN QUERY SELECT v_slot;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;