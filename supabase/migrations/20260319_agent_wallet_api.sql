-- Agent wallet API schema support
-- Adds the missing runtime tables referenced by agent provisioning plus the
-- minimal Cashu proof + wallet history storage needed by the new API.

CREATE TABLE IF NOT EXISTS agent_payment_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT REFERENCES user_identities(id) UNIQUE NOT NULL,
  unified_address TEXT UNIQUE NOT NULL,
  lightning_enabled BOOLEAN DEFAULT TRUE,
  lnurl_callback_url TEXT,
  cashu_enabled BOOLEAN DEFAULT TRUE,
  federation_mint_id UUID,
  cashu_mint_url TEXT,
  cashu_pubkey TEXT,
  fedimint_enabled BOOLEAN DEFAULT FALSE,
  fedimint_federation_id TEXT,
  fedimint_gateway_ln_address TEXT,
  preferred_protocol TEXT DEFAULT 'auto'
    CHECK (preferred_protocol IN ('lightning', 'cashu', 'fedimint', 'auto')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_nwc_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT REFERENCES user_identities(id) UNIQUE NOT NULL,
  nwc_connection_string_encrypted TEXT NOT NULL,  -- Application-layer encrypted before storage
  nwc_encryption_key_id TEXT,                     -- Reference to Vault key used for encryption
  max_spend_per_hour_sats BIGINT DEFAULT 10000,
  max_spend_per_day_sats BIGINT DEFAULT 100000,
  allowed_operations JSONB DEFAULT '["pay_invoice","make_invoice","get_balance","list_transactions"]'::jsonb,
  wallet_type TEXT DEFAULT 'lnbits',
  wallet_endpoint TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_cashu_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT REFERENCES user_identities(id) NOT NULL,
  mint_url TEXT NOT NULL,
  amount_sats BIGINT NOT NULL CHECK (amount_sats > 0),
  secret_hash TEXT UNIQUE NOT NULL,
  proof_json JSONB NOT NULL,
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'spent')),
  source_transaction_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  spent_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS agent_wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT REFERENCES user_identities(id) NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  kind TEXT NOT NULL,
  rail TEXT NOT NULL CHECK (rail IN ('lightning', 'cashu', 'auto')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  amount_sats BIGINT NOT NULL DEFAULT 0 CHECK (amount_sats >= 0),
  fee_sats BIGINT NOT NULL DEFAULT 0 CHECK (fee_sats >= 0),
  memo TEXT,
  counterparty TEXT,
  reference TEXT,
  failure_reason TEXT,
  credit_envelope_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_payment_config_agent_id
  ON agent_payment_config(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_nwc_connections_agent_id
  ON agent_nwc_connections(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_cashu_proofs_agent_state
  ON agent_cashu_proofs(agent_id, state, mint_url);
CREATE INDEX IF NOT EXISTS idx_agent_wallet_transactions_agent_created
  ON agent_wallet_transactions(agent_id, created_at DESC);

ALTER TABLE agent_payment_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_nwc_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_cashu_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_payment_config_owner_rw" ON agent_payment_config;
CREATE POLICY "agent_payment_config_owner_rw"
  ON agent_payment_config
  FOR ALL
  USING (
    auth.uid()::TEXT = agent_id OR EXISTS (
      SELECT 1 FROM agent_profiles ap
      WHERE ap.user_identity_id = agent_id
        AND ap.created_by_user_id = auth.uid()::TEXT
    )
  )
  WITH CHECK (
    auth.uid()::TEXT = agent_id OR EXISTS (
      SELECT 1 FROM agent_profiles ap
      WHERE ap.user_identity_id = agent_id
        AND ap.created_by_user_id = auth.uid()::TEXT
    )
  );

DROP POLICY IF EXISTS "agent_nwc_connections_owner_rw" ON agent_nwc_connections;
CREATE POLICY "agent_nwc_connections_owner_rw"
  ON agent_nwc_connections
  FOR ALL
  USING (
    auth.uid()::TEXT = agent_id OR EXISTS (
      SELECT 1 FROM agent_profiles ap
      WHERE ap.user_identity_id = agent_id
        AND ap.created_by_user_id = auth.uid()::TEXT
    )
  )
  WITH CHECK (
    auth.uid()::TEXT = agent_id OR EXISTS (
      SELECT 1 FROM agent_profiles ap
      WHERE ap.user_identity_id = agent_id
        AND ap.created_by_user_id = auth.uid()::TEXT
    )
  );

DROP POLICY IF EXISTS "agent_cashu_proofs_owner_rw" ON agent_cashu_proofs;
CREATE POLICY "agent_cashu_proofs_owner_rw"
  ON agent_cashu_proofs
  FOR ALL
  USING (
    auth.uid()::TEXT = agent_id OR EXISTS (
      SELECT 1 FROM agent_profiles ap
      WHERE ap.user_identity_id = agent_id
        AND ap.created_by_user_id = auth.uid()::TEXT
    )
  )
  WITH CHECK (
    auth.uid()::TEXT = agent_id OR EXISTS (
      SELECT 1 FROM agent_profiles ap
      WHERE ap.user_identity_id = agent_id
        AND ap.created_by_user_id = auth.uid()::TEXT
    )
  );

DROP POLICY IF EXISTS "agent_wallet_transactions_owner_rw" ON agent_wallet_transactions;
CREATE POLICY "agent_wallet_transactions_owner_rw"
  ON agent_wallet_transactions
  FOR ALL
  USING (
    auth.uid()::TEXT = agent_id OR EXISTS (
      SELECT 1 FROM agent_profiles ap
      WHERE ap.user_identity_id = agent_id
        AND ap.created_by_user_id = auth.uid()::TEXT
    )
  )
  WITH CHECK (
    auth.uid()::TEXT = agent_id OR EXISTS (
      SELECT 1 FROM agent_profiles ap
      WHERE ap.user_identity_id = agent_id
        AND ap.created_by_user_id = auth.uid()::TEXT
    )
  );