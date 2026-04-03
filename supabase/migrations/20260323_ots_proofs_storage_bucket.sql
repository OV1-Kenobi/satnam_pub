-- OTS Agent Proof Generation — Storage Bucket Setup
-- Migration: 20260323_ots_proofs_storage_bucket
-- Purpose: Create Supabase Storage bucket for OTS proof files (.ots)
-- Bucket: ots-proofs (public read, service role write)
-- Path structure: ots-proofs/[agent_pubkey]/[proof_hash].ots

-- ============================================================================
-- CREATE STORAGE BUCKET
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('ots-proofs', 'ots-proofs', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Policy: Public read for all authenticated users
-- Rationale: OTS proofs are public audit trail data
CREATE POLICY ots_proofs_public_read
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'ots-proofs');

-- Policy: Service role only for upload
-- Rationale: Only server-side Netlify Functions can upload proofs (prevents malicious uploads)
CREATE POLICY ots_proofs_service_write
  ON storage.objects FOR INSERT
  TO service_role
  WITH CHECK (bucket_id = 'ots-proofs');

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON POLICY ots_proofs_public_read ON storage.objects IS
  'Allow all authenticated users to read OTS proof files (public audit trail)';

COMMENT ON POLICY ots_proofs_service_write ON storage.objects IS
  'Allow only service role (Netlify Functions) to upload OTS proof files';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
BEGIN
  -- Check bucket exists
  IF EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'ots-proofs'
  ) THEN
    RAISE NOTICE '✓ ots-proofs storage bucket created successfully';
  ELSE
    RAISE EXCEPTION '✗ ots-proofs storage bucket creation failed';
  END IF;
  
  -- Check RLS policies exist
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects'
      AND schemaname = 'storage'
      AND policyname = 'ots_proofs_public_read'
  ) AND EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects'
      AND schemaname = 'storage'
      AND policyname = 'ots_proofs_service_write'
  ) THEN
    RAISE NOTICE '✓ RLS policies for ots-proofs bucket created successfully';
  ELSE
    RAISE EXCEPTION '✗ One or both RLS policies for ots-proofs bucket failed to create';
  END IF;
END $$;

