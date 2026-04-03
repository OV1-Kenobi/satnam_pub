-- LLM Model Pricing (Phase 3 support)
-- Stores per-provider+model token pricing in millisatoshis per token (msats/token)
-- Used by netlify/functions/agent-llm-proxy.ts for sats-based cost accounting.
--
-- SECURITY:
-- - Pricing is not sensitive; SELECT is allowed for all roles.
-- - Writes are restricted to service_role only.

CREATE TABLE IF NOT EXISTS llm_model_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  provider TEXT NOT NULL CHECK (provider IN ('openai', 'anthropic', 'custom')),
  model TEXT NOT NULL,

  -- Integer msats per token (avoid float); 1 sat = 1000 msats
  input_msats_per_token INTEGER NOT NULL CHECK (input_msats_per_token >= 0),
  output_msats_per_token INTEGER NOT NULL CHECK (output_msats_per_token >= 0),

  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
DO $$ BEGIN
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_llm_model_pricing_provider_model ON llm_model_pricing(provider, model)';
END $$;

-- Ensure only one ACTIVE row per provider+model (multiple inactive rows allowed)
DO $$ BEGIN
  EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uniq_llm_model_pricing_active ON llm_model_pricing(provider, model) WHERE is_active';
END $$;

-- Row Level Security
ALTER TABLE llm_model_pricing ENABLE ROW LEVEL SECURITY;

-- Anyone can read pricing (not sensitive)
DO $$ BEGIN
  CREATE POLICY "llm_model_pricing_read_all" ON llm_model_pricing
    FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Only service_role can write pricing
DO $$ BEGIN
  CREATE POLICY "llm_model_pricing_service_all" ON llm_model_pricing
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_llm_model_pricing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trigger_update_llm_model_pricing_updated_at
    BEFORE UPDATE ON llm_model_pricing
    FOR EACH ROW
    EXECUTE FUNCTION update_llm_model_pricing_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE llm_model_pricing IS
  'Per-provider+model LLM token pricing in msats/token (input/output). Used for sats-based cost accounting.';

DO $$
BEGIN
  RAISE NOTICE 'LLM Model Pricing migration completed successfully';
END $$;

