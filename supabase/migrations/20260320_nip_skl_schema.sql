-- NIP-SKL: Agent Skill Registry Schema
-- Migration: 20260320_nip_skl_schema
-- Purpose: Create skill_manifests table for NIP-SKL (kind 33400) persistence
-- Aligned with: docs/planning/NIP-Triumvirate-Satnam-Integration-Plan.md §6
-- Spec: docs/specs/SKL.md

-- ============================================================================
-- SKILL MANIFESTS TABLE
-- ============================================================================
-- Stores skill manifests (kind 33400) fetched from Nostr relays
-- The relay is the canonical source of truth; this table is a cache with attestation tracking

CREATE TABLE IF NOT EXISTS skill_manifests (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_scope_id         TEXT NOT NULL UNIQUE,   -- "33400:<pubkey>:<d-tag>:<version>"
  manifest_event_id      TEXT NOT NULL,          -- Nostr event id (version pin)
  version                TEXT NOT NULL,          -- semver (e.g. "1.0.0")
  name                   TEXT NOT NULL,
  description            TEXT,
  input_schema           JSONB DEFAULT '{}',
  output_schema          JSONB DEFAULT '{}',
  runtime_constraints    TEXT[] DEFAULT '{}',    -- e.g. ["max_wall_seconds:30"]
  publisher_pubkey       TEXT NOT NULL,
  attestation_status     TEXT CHECK (attestation_status IN ('unverified','pending','verified','revoked'))
                         DEFAULT 'unverified',
  attestation_event_ids  TEXT[] DEFAULT '{}',    -- kind 1985 event ids from guardians
  revoked_at             TIMESTAMPTZ,            -- NIP-09 kind 5 revocation timestamp
  relay_hint             TEXT,                   -- Relay URL where manifest was found
  raw_event              JSONB,                  -- Full Nostr event for signature verification
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Index for skill_scope_id lookups (primary query pattern)
CREATE INDEX IF NOT EXISTS idx_skill_manifests_scope_id 
  ON skill_manifests(skill_scope_id);

-- Index for publisher_pubkey (query all skills by publisher)
CREATE INDEX IF NOT EXISTS idx_skill_manifests_publisher 
  ON skill_manifests(publisher_pubkey);

-- Index for attestation_status (filter verified skills)
CREATE INDEX IF NOT EXISTS idx_skill_manifests_attestation_status 
  ON skill_manifests(attestation_status);

-- Index for version (query specific versions)
CREATE INDEX IF NOT EXISTS idx_skill_manifests_version 
  ON skill_manifests(version);

-- Composite index for publisher + version (common query pattern)
CREATE INDEX IF NOT EXISTS idx_skill_manifests_publisher_version 
  ON skill_manifests(publisher_pubkey, version);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE skill_manifests ENABLE ROW LEVEL SECURITY;

-- Policy: Public registry — all authenticated users can SELECT
-- Rationale: Skill manifests are public discovery data
CREATE POLICY skill_manifests_read 
  ON skill_manifests 
  FOR SELECT 
  TO authenticated 
  USING (true);

-- Policy: Service role only for INSERT/UPDATE
-- Rationale: Netlify Functions validate Nostr event signature before any write
-- Only server-side code with service role key can insert/update manifests
CREATE POLICY skill_manifests_write 
  ON skill_manifests 
  FOR ALL 
  TO service_role 
  USING (true);

-- ============================================================================
-- TRIGGER: Update updated_at timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION update_skill_manifests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER skill_manifests_updated_at_trigger
  BEFORE UPDATE ON skill_manifests
  FOR EACH ROW
  EXECUTE FUNCTION update_skill_manifests_updated_at();

-- ============================================================================
-- COMMENTS (Documentation)
-- ============================================================================

COMMENT ON TABLE skill_manifests IS 
  'NIP-SKL skill manifest cache. Relay is canonical source; this table enables fast search/filter and attestation tracking.';

COMMENT ON COLUMN skill_manifests.skill_scope_id IS 
  'Canonical skill address: 33400:<pubkey>:<d-tag>:<version>';

COMMENT ON COLUMN skill_manifests.manifest_event_id IS 
  'Nostr event id — version pin for credit envelopes (NIP-AC)';

COMMENT ON COLUMN skill_manifests.attestation_status IS 
  'Guardian attestation status: unverified (no attestation), pending (attestation in progress), verified (kind 1985 from trusted guardian), revoked (NIP-09 kind 5)';

COMMENT ON COLUMN skill_manifests.attestation_event_ids IS 
  'Array of kind 1985 Nostr event ids from guardians attesting to this skill';

COMMENT ON COLUMN skill_manifests.raw_event IS 
  'Full Nostr kind 33400 event for signature verification and relay sync';

-- ============================================================================
-- VERIFICATION QUERY
-- ============================================================================

-- Verify table exists and RLS is enabled
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' AND tablename = 'skill_manifests'
  ) THEN
    RAISE NOTICE '✓ skill_manifests table created successfully';
  ELSE
    RAISE EXCEPTION '✗ skill_manifests table creation failed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' AND tablename = 'skill_manifests' AND rowsecurity = true
  ) THEN
    RAISE NOTICE '✓ RLS enabled on skill_manifests';
  ELSE
    RAISE WARNING '✗ RLS not enabled on skill_manifests';
  END IF;
END $$;

