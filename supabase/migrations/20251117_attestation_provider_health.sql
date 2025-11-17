-- attestation_provider_health table for provider-level health metrics
-- Provider health tracking for SimpleProof and OpenTimestamps
--
-- Design goals:
-- - Persist provider health across Netlify Function cold starts
-- - Provide globally consistent metrics across concurrent serverless instances
-- - Use time-windowed counters to avoid unbounded growth
-- - Keep schema privacy-safe (no user identifiers or IP addresses)

-- ============================================================================
-- TABLE DEFINITION
-- ============================================================================

CREATE TABLE IF NOT EXISTS attestation_provider_health (
  provider TEXT PRIMARY KEY CHECK (provider IN ('simpleproof', 'opentimestamps')),
  last_success_at TIMESTAMPTZ,
  last_error_at TIMESTAMPTZ,
  success_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  window_start_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- UPDATED_AT TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION attestation_provider_health_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS attestation_provider_health_update_timestamp_trigger ON attestation_provider_health;
CREATE TRIGGER attestation_provider_health_update_timestamp_trigger
  BEFORE UPDATE ON attestation_provider_health
  FOR EACH ROW
  EXECUTE FUNCTION attestation_provider_health_update_timestamp();

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Time-windowed metrics queries (e.g., recent 1-hour window)
CREATE INDEX IF NOT EXISTS idx_attestation_provider_health_window_start
  ON attestation_provider_health(window_start_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS: this is operational/system data, accessed only via service role
ALTER TABLE attestation_provider_health ENABLE ROW LEVEL SECURITY;

-- Service role has full access (reads and writes) for operational metrics
DROP POLICY IF EXISTS attestation_provider_health_service_role ON attestation_provider_health;
CREATE POLICY attestation_provider_health_service_role
  ON attestation_provider_health
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

