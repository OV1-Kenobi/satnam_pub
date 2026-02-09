-- Attestations Idempotency Constraint Migration
-- 
-- Adds database-level idempotency protection for coordinator attestations
-- to prevent duplicate attestation records when clients retry requests.
--
-- This migration:
-- 1. Creates a unique partial index on metadata->>'event_id' for coordinator attestations
-- 2. Ensures true idempotency: multiple identical requests result in exactly one record
-- 3. Only applies to coordinator_attestation event types to avoid conflicts
--
-- SAFETY:
-- - Idempotent: Safe to run multiple times (IF NOT EXISTS)
-- - Non-blocking: Partial index only affects new inserts
-- - Backward compatible: Existing records are not modified
--
-- DEPENDENCIES:
-- - Requires attestations table from 036_attestations_unified_table.sql
-- - Requires event_type 'coordinator_attestation' to be in CHECK constraint

-- ============================================================================
-- UNIQUE PARTIAL INDEX FOR COORDINATOR ATTESTATIONS
-- ============================================================================

-- Create unique partial index on event_id within metadata JSONB column
-- This prevents duplicate coordinator attestations with the same event_id
-- 
-- The partial index:
-- - Only applies to rows where event_type = 'coordinator_attestation'
-- - Only applies to rows where metadata->>'event_id' IS NOT NULL
-- - Allows other event types to have duplicate event_ids (different use cases)
-- - Minimal performance impact (only indexes coordinator attestations)
--
-- Example event_id format: coordinator_attestation_{sessionId}_{participantNpub}
CREATE UNIQUE INDEX IF NOT EXISTS idx_attestations_coordinator_event_id
  ON public.attestations ((metadata->>'event_id'))
  WHERE event_type = 'coordinator_attestation' 
    AND metadata->>'event_id' IS NOT NULL;

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON INDEX idx_attestations_coordinator_event_id IS 
  'Ensures idempotency for coordinator attestations by preventing duplicate event_id values. '
  'Only applies to coordinator_attestation event types. '
  'Enables upsert pattern in onboarding-publish-coordinator-attestation.ts for graceful retry handling.';

-- ============================================================================
-- VERIFICATION QUERY (for testing)
-- ============================================================================

-- Verify the index was created successfully
-- Run this query to confirm the index exists:
-- 
-- SELECT 
--   schemaname, 
--   tablename, 
--   indexname, 
--   indexdef
-- FROM pg_indexes
-- WHERE indexname = 'idx_attestations_coordinator_event_id';

