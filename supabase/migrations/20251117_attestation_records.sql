-- attestation_records table for compressed attestation proof storage
-- Phase 1.6: Proof compression & canonical attestation storage
--
-- This migration creates a canonical attestation_records table used to store
-- compressed OpenTimestamps (OTS) proofs and related attestation metadata.
--
-- Design goals:
-- - Avoid storing large, uncompressed OTS proofs directly on primary tables
-- - Support multiple attestation methods (simpleproof, pkarr, iroh, nip03)
-- - Preserve privacy: rows are scoped to the authenticated user via RLS
-- - Idempotent: safe to run multiple times

-- ============================================================================
-- TABLE DEFINITION
-- ============================================================================

CREATE TABLE IF NOT EXISTS attestation_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_id UUID NOT NULL REFERENCES multi_method_verification_results(id) ON DELETE CASCADE,
  method TEXT NOT NULL CHECK (method IN ('simpleproof', 'pkarr', 'iroh', 'nip03')),
  proof_data TEXT NOT NULL, -- Base64-encoded, gzip-compressed proof payload
  proof_compressed BOOLEAN NOT NULL DEFAULT true,
  is_valid BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- UPDATED_AT TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION attestation_records_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS attestation_records_update_timestamp_trigger ON attestation_records;
CREATE TRIGGER attestation_records_update_timestamp_trigger
  BEFORE UPDATE ON attestation_records
  FOR EACH ROW
  EXECUTE FUNCTION attestation_records_update_timestamp();


-- ============================================================================
-- INDEXES
-- ============================================================================

-- Efficient lookups by verification_id (most common access pattern)
CREATE INDEX IF NOT EXISTS idx_attestation_records_verification_id
  ON attestation_records(verification_id);

-- Method-based queries (e.g., analytics or audits by provider)
CREATE INDEX IF NOT EXISTS idx_attestation_records_method
  ON attestation_records(method);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS for privacy-first access control
ALTER TABLE attestation_records ENABLE ROW LEVEL SECURITY;

-- Users can read their own attestation records via verification_id
DROP POLICY IF EXISTS attestation_records_select_own ON attestation_records;
CREATE POLICY attestation_records_select_own
  ON attestation_records
  FOR SELECT
  USING (
    verification_id IN (
      SELECT id
      FROM multi_method_verification_results
      WHERE user_duid = auth.uid()::text
    )
  );

-- Users can insert attestation records tied to their own verification rows
DROP POLICY IF EXISTS attestation_records_insert_own ON attestation_records;
CREATE POLICY attestation_records_insert_own
  ON attestation_records
  FOR INSERT
  WITH CHECK (
    verification_id IN (
      SELECT id
      FROM multi_method_verification_results
      WHERE user_duid = auth.uid()::text
    )
  );

-- Users can update their own attestation records (e.g., to mark invalid)
DROP POLICY IF EXISTS attestation_records_update_own ON attestation_records;
CREATE POLICY attestation_records_update_own
  ON attestation_records
  FOR UPDATE
  USING (
    verification_id IN (
      SELECT id
      FROM multi_method_verification_results
      WHERE user_duid = auth.uid()::text
    )
  );

