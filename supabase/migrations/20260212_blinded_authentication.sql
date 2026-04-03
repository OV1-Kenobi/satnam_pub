-- Idempotent migration: Blinded authentication infrastructure
-- Compatible with: user_identities (current schema), privacy-first architecture

-- Blind signature keypairs for platform
CREATE TABLE IF NOT EXISTS platform_blind_keypairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keypair_purpose TEXT NOT NULL, -- 'event_tokens', 'capability_tokens', 'attestation_tokens'
  public_key TEXT NOT NULL UNIQUE,
  private_key_encrypted TEXT NOT NULL, -- Encrypted with platform master key
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  rotated_at TIMESTAMPTZ
);

-- Blind signature tokens issued to agents
DO $$ BEGIN
  CREATE TYPE token_status AS ENUM ('issued', 'redeemed', 'expired', 'revoked');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS agent_blind_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Token details
  token_hash TEXT UNIQUE, -- NULL until redemption reveals it
  token_type TEXT NOT NULL, -- 'event_post', 'task_create', 'contact_add'
  token_value INTEGER DEFAULT 1,

  -- Issuance (references user_identities, not deprecated profiles)
  issued_to_agent_id TEXT REFERENCES user_identities(id),
  issued_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,

  -- Redemption
  status token_status DEFAULT 'issued',
  redeemed_at TIMESTAMPTZ,
  redeemed_for_action TEXT,

  -- Blind signature proof
  blinded_message TEXT,
  blind_signature TEXT,

  keypair_id UUID REFERENCES platform_blind_keypairs(id)
);

DO $$ BEGIN
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_blind_tokens_agent ON agent_blind_tokens(issued_to_agent_id)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_blind_tokens_status ON agent_blind_tokens(status)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_blind_tokens_hash ON agent_blind_tokens(token_hash)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_blind_tokens_expires ON agent_blind_tokens(expires_at) WHERE status = ''issued''';
END $$;

-- Token redemption log (anonymous - doesn't link to agent_id until disputed)
CREATE TABLE IF NOT EXISTS anonymous_token_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL,
  action_type TEXT NOT NULL,
  redeemed_at TIMESTAMPTZ DEFAULT NOW(),

  -- Proof of valid token
  unblinded_token TEXT NOT NULL,
  signature_proof TEXT NOT NULL,

  -- Only revealed if disputed (references user_identities, not deprecated profiles)
  revealed_agent_id TEXT REFERENCES user_identities(id)
);

DO $$ BEGIN
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_anonymous_redemptions_time ON anonymous_token_redemptions(redeemed_at DESC)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_anonymous_redemptions_action ON anonymous_token_redemptions(action_type)';
END $$;

-- ============================================================
-- RLS POLICIES
-- ============================================================
ALTER TABLE platform_blind_keypairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_blind_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE anonymous_token_redemptions ENABLE ROW LEVEL SECURITY;

-- platform_blind_keypairs: service-role only (contains encrypted private keys)
CREATE POLICY "blind_keypairs_service_only" ON platform_blind_keypairs
  FOR ALL USING (auth.role() = 'service_role');

-- agent_blind_tokens: agents can read their own tokens, service-role full access
CREATE POLICY "blind_tokens_own_read" ON agent_blind_tokens
  FOR SELECT USING (issued_to_agent_id = auth.uid()::TEXT);
CREATE POLICY "blind_tokens_service_write" ON agent_blind_tokens
  FOR ALL USING (auth.role() = 'service_role');

-- anonymous_token_redemptions: service-role only (privacy: no user can browse redemptions)
CREATE POLICY "redemptions_service_only" ON anonymous_token_redemptions
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- M3: TOKEN BALANCE INCREMENT TRIGGER
-- ============================================================
-- Automatically increment token balance in agent_profiles when tokens are issued
-- This trigger updates the appropriate balance column based on token_type

CREATE OR REPLACE FUNCTION increment_agent_token_balance()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the appropriate balance column based on token_type
  UPDATE agent_profiles
  SET
    event_tokens_balance = CASE
      WHEN NEW.token_type = 'event_post' THEN event_tokens_balance + NEW.token_value
      ELSE event_tokens_balance
    END,
    task_tokens_balance = CASE
      WHEN NEW.token_type = 'task_create' THEN task_tokens_balance + NEW.token_value
      ELSE task_tokens_balance
    END,
    contact_tokens_balance = CASE
      WHEN NEW.token_type = 'contact_add' THEN contact_tokens_balance + NEW.token_value
      ELSE contact_tokens_balance
    END,
    dm_tokens_balance = CASE
      WHEN NEW.token_type = 'dm_send' THEN dm_tokens_balance + NEW.token_value
      ELSE dm_tokens_balance
    END
  WHERE user_identity_id = NEW.issued_to_agent_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists, then create
DROP TRIGGER IF EXISTS trigger_increment_token_balance ON agent_blind_tokens;
CREATE TRIGGER trigger_increment_token_balance
  AFTER INSERT ON agent_blind_tokens
  FOR EACH ROW
  WHEN (NEW.status = 'issued')
  EXECUTE FUNCTION increment_agent_token_balance();

-- ============================================================
-- W2: TOKEN EXPIRATION CLEANUP FUNCTION
-- ============================================================
-- Automatically expire tokens that have passed their expiration date
-- This function should be called periodically (e.g., via cron job or scheduled task)

CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS TABLE(expired_count INTEGER) AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Update expired tokens to 'expired' status
  UPDATE agent_blind_tokens
  SET status = 'expired'
  WHERE status = 'issued'
    AND expires_at < NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN QUERY SELECT v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION cleanup_expired_tokens() TO service_role;

-- NOTE: To run this function periodically, use one of these approaches:
-- 1. Supabase Edge Functions with cron trigger (recommended)
-- 2. Netlify Scheduled Functions
-- 3. External cron job calling: supabase.rpc('cleanup_expired_tokens')
--
-- Example cron schedule: Every hour
-- 0 * * * * curl -X POST https://your-domain.com/.netlify/functions/cleanup-expired-tokens