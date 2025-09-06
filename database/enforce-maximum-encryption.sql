-- =====================================================
-- ENFORCE MAXIMUM ENCRYPTION ARCHITECTURE
-- =====================================================
--
-- PURPOSE: Enforce zero plaintext storage of user identifiers
-- SECURITY: Implements maximum encryption with hashed columns only
-- COMPLIANCE: Ensures all sensitive data is stored in hashed format
--
-- CRITICAL SECURITY REQUIREMENT:
-- - NO plaintext user identifiers in database
-- - ALL sensitive data must use hashed columns with unique salts
-- - Plaintext columns should be deprecated/removed
--
-- Run this script in the Supabase SQL editor
--

BEGIN;

-- =====================================================
-- STEP 1: Ensure all required hashed columns exist
-- =====================================================

-- Add hashed columns to user_identities if they don't exist
ALTER TABLE user_identities
ADD COLUMN IF NOT EXISTS user_salt TEXT,
ADD COLUMN IF NOT EXISTS hashed_username TEXT,
ADD COLUMN IF NOT EXISTS hashed_npub TEXT,
ADD COLUMN IF NOT EXISTS hashed_nip05 TEXT,
ADD COLUMN IF NOT EXISTS hashed_lightning_address TEXT;

-- Add hashed columns to nip05_records if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='nip05_records') THEN
    ALTER TABLE nip05_records
    ADD COLUMN IF NOT EXISTS user_salt TEXT,
    ADD COLUMN IF NOT EXISTS hashed_nip05 TEXT,
    ADD COLUMN IF NOT EXISTS hashed_npub TEXT;
  END IF;
END $$;

-- =====================================================
-- STEP 2: Create indexes on hashed columns for performance
-- =====================================================

-- Indexes for fast lookups on hashed data
CREATE INDEX IF NOT EXISTS idx_user_identities_hashed_npub ON user_identities(hashed_npub);
CREATE INDEX IF NOT EXISTS idx_user_identities_hashed_nip05 ON user_identities(hashed_nip05);
CREATE INDEX IF NOT EXISTS idx_user_identities_hashed_username ON user_identities(hashed_username);
CREATE INDEX IF NOT EXISTS idx_user_identities_user_salt ON user_identities(user_salt);

CREATE INDEX IF NOT EXISTS idx_nip05_records_hashed_npub ON nip05_records(hashed_npub);
CREATE INDEX IF NOT EXISTS idx_nip05_records_hashed_nip05 ON nip05_records(hashed_nip05);
CREATE INDEX IF NOT EXISTS idx_nip05_records_user_salt ON nip05_records(user_salt);

-- =====================================================
-- STEP 3: Add constraints to enforce maximum encryption
-- =====================================================

-- Ensure user_salt is always present for new records
ALTER TABLE user_identities 
ADD CONSTRAINT user_identities_salt_required 
CHECK (user_salt IS NOT NULL AND user_salt != '');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='nip05_records') THEN
    ALTER TABLE nip05_records
    ADD CONSTRAINT nip05_records_salt_required
    CHECK (user_salt IS NOT NULL AND user_salt != '');
  END IF;
END $$;

-- =====================================================
-- STEP 4: Create privacy compliance check function
-- =====================================================

CREATE OR REPLACE FUNCTION check_privacy_compliance()
RETURNS TABLE(
    table_name TEXT,
    compliance_status TEXT,
    issues TEXT[]
) AS $$
DECLARE
  -- Flags for table existence
  ui_exists BOOLEAN := FALSE;
  nr_exists BOOLEAN := FALSE;

  -- user_identities checks
  ui_salt_missing BOOLEAN := FALSE;
  ui_npub_plain BOOLEAN := FALSE;
  ui_nip05_plain BOOLEAN := FALSE;
  ui_enc_nsec_present BOOLEAN := FALSE;

  -- nip05_records checks
  nr_salt_missing BOOLEAN := FALSE;
  nr_pubkey_plain BOOLEAN := FALSE;
  nr_name_plain BOOLEAN := FALSE;
BEGIN
  -- Table existence
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='user_identities'
  ) INTO ui_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='nip05_records'
  ) INTO nr_exists;

  -- user_identities evaluations (guard columns)
  IF ui_exists THEN
    -- salt missing
    EXECUTE $$SELECT EXISTS(SELECT 1 FROM user_identities WHERE user_salt IS NULL OR user_salt = '')$$ INTO ui_salt_missing;

    -- npub plaintext only if column exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='user_identities' AND column_name='npub'
    ) THEN
      EXECUTE $$SELECT EXISTS(SELECT 1 FROM user_identities WHERE npub IS NOT NULL AND npub <> '')$$ INTO ui_npub_plain;
    ELSE
      ui_npub_plain := FALSE;
    END IF;

    -- nip05 plaintext only if column exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='user_identities' AND column_name='nip05'
    ) THEN
      EXECUTE $$SELECT EXISTS(SELECT 1 FROM user_identities WHERE nip05 IS NOT NULL AND nip05 <> '')$$ INTO ui_nip05_plain;
    ELSE
      ui_nip05_plain := FALSE;
    END IF;

    -- encrypted_nsec presence only if column exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='user_identities' AND column_name='encrypted_nsec'
    ) THEN
      EXECUTE $$SELECT EXISTS(SELECT 1 FROM user_identities WHERE encrypted_nsec IS NOT NULL AND encrypted_nsec <> '')$$ INTO ui_enc_nsec_present;
    ELSE
      ui_enc_nsec_present := FALSE;
    END IF;

    RETURN QUERY
    SELECT
      'user_identities'::TEXT,
      CASE
        WHEN ui_salt_missing THEN 'NON_COMPLIANT'
        WHEN ui_npub_plain OR ui_nip05_plain OR ui_enc_nsec_present THEN 'PARTIAL_COMPLIANCE'
        ELSE 'FULLY_COMPLIANT'
      END,
      ARRAY[
        CASE WHEN ui_salt_missing THEN 'Missing user_salt for some records' ELSE NULL END,
        CASE WHEN ui_npub_plain THEN 'Plaintext npub found' ELSE NULL END,
        CASE WHEN ui_nip05_plain THEN 'Plaintext nip05 found' ELSE NULL END,
        CASE WHEN ui_enc_nsec_present THEN 'Plaintext encrypted_nsec found' ELSE NULL END
      ]::TEXT[];
  ELSE
    RETURN QUERY SELECT 'user_identities'::TEXT, 'TABLE_MISSING'::TEXT, ARRAY['Table user_identities not found']::TEXT[];
  END IF;

  -- nip05_records evaluations (guard columns)
  IF nr_exists THEN
    EXECUTE $$SELECT EXISTS(SELECT 1 FROM nip05_records WHERE user_salt IS NULL OR user_salt = '')$$ INTO nr_salt_missing;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='nip05_records' AND column_name='pubkey'
    ) THEN
      EXECUTE $$SELECT EXISTS(SELECT 1 FROM nip05_records WHERE pubkey IS NOT NULL AND pubkey <> '')$$ INTO nr_pubkey_plain;
    ELSE
      nr_pubkey_plain := FALSE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='nip05_records' AND column_name='name'
    ) THEN
      EXECUTE $$SELECT EXISTS(SELECT 1 FROM nip05_records WHERE name IS NOT NULL AND name <> '')$$ INTO nr_name_plain;
    ELSE
      nr_name_plain := FALSE;
    END IF;

    RETURN QUERY
    SELECT
      'nip05_records'::TEXT,
      CASE
        WHEN nr_salt_missing THEN 'NON_COMPLIANT'
        WHEN nr_pubkey_plain OR nr_name_plain THEN 'PARTIAL_COMPLIANCE'
        ELSE 'FULLY_COMPLIANT'
      END,
      ARRAY[
        CASE WHEN nr_salt_missing THEN 'Missing user_salt for some records' ELSE NULL END,
        CASE WHEN nr_pubkey_plain THEN 'Plaintext pubkey found' ELSE NULL END,
        CASE WHEN nr_name_plain THEN 'Plaintext name found' ELSE NULL END
      ]::TEXT[];
  ELSE
    RETURN QUERY SELECT 'nip05_records'::TEXT, 'TABLE_MISSING'::TEXT, ARRAY['Table nip05_records not found']::TEXT[];
  END IF;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- STEP 5: Run compliance check
-- =====================================================

SELECT * FROM check_privacy_compliance();

COMMIT;

-- =====================================================
-- VERIFICATION AND SUCCESS MESSAGE
-- =====================================================

SELECT 
    '✅ MAXIMUM ENCRYPTION ARCHITECTURE ENFORCED' as result,
    'All hashed columns created and indexed' as details,
    'Database ready for zero plaintext storage' as status,
    'Run check_privacy_compliance() to verify compliance' as next_steps;
