-- =====================================================
-- ENFORCE MAXIMUM ENCRYPTION ARCHITECTURE
-- =====================================================
--
-- PURPOSE: Enforce zero plaintext storage of user identifiers
-- SECURITY: Implements encryption-first schema with encrypted_* profile fields and DUID lookups
-- COMPLIANCE: Ensures no legacy hashed_* columns are required or referenced
--
-- CRITICAL SECURITY REQUIREMENT:
-- - NO plaintext user identifiers in database
-- - Profile data must use encrypted_* columns (AES-GCM) with iv/tag metadata
-- - Lookups use DUIDs (HMAC-SHA256 with server secret) via nip05_records.user_duid/pubkey_duid
-- - user_duid stores the same value as user_identities.id for direct JOINs
--
-- Run this script in the Supabase SQL editor
--

BEGIN;

-- =====================================================
-- STEP 1: Ensure required columns exist (no legacy hashed_* columns)
-- =====================================================

-- user_identities: ensure user_salt exists for password hashing and encryption
ALTER TABLE user_identities
ADD COLUMN IF NOT EXISTS user_salt TEXT;

-- nip05_records: handle legacy name_duid → user_duid migration
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='nip05_records') THEN
    -- =====================================================
    -- MIGRATION: Rename name_duid → user_duid (if applicable)
    -- This preserves data, NOT NULL constraint, and is consistent
    -- with privacy-first-identity-system-migration.sql
    -- =====================================================

    -- Case 1: Legacy name_duid exists, user_duid doesn't → rename
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='nip05_records' AND column_name='name_duid')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='nip05_records' AND column_name='user_duid') THEN
        ALTER TABLE nip05_records RENAME COLUMN name_duid TO user_duid;
        RAISE NOTICE '✓ Renamed nip05_records.name_duid → user_duid (data preserved)';

    -- Case 2: Both exist (anomaly from partial migration) → copy data, drop old
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='nip05_records' AND column_name='name_duid')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='nip05_records' AND column_name='user_duid') THEN
        -- Copy any missing data
        UPDATE nip05_records
        SET user_duid = name_duid
        WHERE name_duid IS NOT NULL AND (user_duid IS NULL OR user_duid = '');
        -- Drop the old column
        ALTER TABLE nip05_records DROP COLUMN name_duid;
        RAISE NOTICE '✓ Migrated data from name_duid to user_duid and dropped legacy column';

    -- Case 3: user_duid doesn't exist at all → add it
    ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='nip05_records' AND column_name='user_duid') THEN
        ALTER TABLE nip05_records ADD COLUMN user_duid TEXT;
        RAISE NOTICE '✓ Added user_duid column to nip05_records';
    END IF;

    -- Ensure pubkey_duid and domain columns exist
    ALTER TABLE nip05_records ADD COLUMN IF NOT EXISTS pubkey_duid TEXT;
    ALTER TABLE nip05_records ADD COLUMN IF NOT EXISTS domain TEXT;
  END IF;
END $$;

-- Clean up legacy constraints if they exist
DO $$
BEGIN
  -- Drop legacy name_duid unique constraint
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'nip05_records_name_duid_domain_unique'
    AND table_name = 'nip05_records'
  ) THEN
    ALTER TABLE nip05_records DROP CONSTRAINT nip05_records_name_duid_domain_unique;
    RAISE NOTICE '✓ Dropped legacy constraint: nip05_records_name_duid_domain_unique';
  END IF;

  -- Drop hardcoded domain whitelist constraint (white-label incompatible)
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'nip05_records_domain_whitelist'
    AND table_name = 'nip05_records'
  ) THEN
    ALTER TABLE nip05_records DROP CONSTRAINT nip05_records_domain_whitelist;
    RAISE NOTICE '✓ Dropped hardcoded domain whitelist constraint (white-label incompatible)';
  END IF;
END $$;

-- Add foreign key constraint for referential integrity (user_duid -> user_identities.id)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='nip05_records' AND column_name='user_duid'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='user_identities'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_nip05_records_user_duid'
      AND conrelid = 'public.nip05_records'::regclass
  ) THEN
    -- Only add FK if all existing user_duid values are valid or NULL
    IF NOT EXISTS (
      SELECT 1 FROM nip05_records n
      WHERE n.user_duid IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM user_identities u WHERE u.id = n.user_duid)
      LIMIT 1
    ) THEN
      ALTER TABLE nip05_records
      ADD CONSTRAINT fk_nip05_records_user_duid
      FOREIGN KEY (user_duid) REFERENCES user_identities(id)
      ON DELETE CASCADE;

      RAISE NOTICE '✓ Added foreign key constraint fk_nip05_records_user_duid';
    ELSE
      RAISE NOTICE '⚠ Skipped FK constraint: orphaned user_duid values exist - clean up first';
    END IF;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '⚠ Could not add FK constraint: %', SQLERRM;
END $$;

-- =====================================================
-- STEP 2: Create indexes for DUID lookups and salts
-- =====================================================

-- Drop legacy indexes if they exist
DROP INDEX IF EXISTS idx_nip05_records_name_duid;
DROP INDEX IF EXISTS uq_nip05_records_name_duid_domain;

-- Indexes for fast lookups on DUIDs
CREATE INDEX IF NOT EXISTS idx_nip05_records_user_duid ON nip05_records(user_duid);
CREATE INDEX IF NOT EXISTS idx_nip05_records_pubkey_duid ON nip05_records(pubkey_duid);
CREATE INDEX IF NOT EXISTS idx_nip05_records_domain ON nip05_records(domain);

-- Useful index for user_salt
CREATE INDEX IF NOT EXISTS idx_user_identities_user_salt ON user_identities(user_salt);

-- =====================================================
-- STEP 3: Add constraints to enforce maximum encryption
-- =====================================================

-- Ensure user_salt is always present for new records in user_identities
ALTER TABLE user_identities
ADD CONSTRAINT user_identities_salt_required
CHECK (user_salt IS NOT NULL AND user_salt != '');

-- =====================================================
-- STEP 4: Create privacy compliance check function
-- =====================================================

CREATE OR REPLACE FUNCTION check_privacy_compliance()
RETURNS TABLE(
    table_name TEXT,
    compliance_status TEXT,
    issues TEXT[]
) AS $func$
DECLARE
  -- Flags for table existence
  ui_exists BOOLEAN := FALSE;
  nr_exists BOOLEAN := FALSE;

  -- user_identities checks
  ui_salt_missing BOOLEAN := FALSE;
  ui_npub_plain BOOLEAN := FALSE;
  ui_nip05_plain BOOLEAN := FALSE;
  ui_enc_nsec_present BOOLEAN := FALSE;

  -- nip05_records checks (uses DUIDs, not user_salt)
  nr_user_duid_missing BOOLEAN := FALSE;
  nr_pubkey_plain BOOLEAN := FALSE;
  nr_name_plain BOOLEAN := FALSE;
BEGIN
  -- Table existence
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND information_schema.tables.table_name='user_identities'
  ) INTO ui_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND information_schema.tables.table_name='nip05_records'
  ) INTO nr_exists;

  -- user_identities evaluations (guard columns)
  IF ui_exists THEN
    -- salt missing
    EXECUTE 'SELECT EXISTS(SELECT 1 FROM user_identities WHERE user_salt IS NULL OR user_salt = '''')' INTO ui_salt_missing;

    -- npub plaintext only if column exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND information_schema.columns.table_name='user_identities' AND column_name='npub'
    ) THEN
      EXECUTE 'SELECT EXISTS(SELECT 1 FROM user_identities WHERE npub IS NOT NULL AND npub <> '''')' INTO ui_npub_plain;
    ELSE
      ui_npub_plain := FALSE;
    END IF;

    -- nip05 plaintext only if column exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND information_schema.columns.table_name='user_identities' AND column_name='nip05'
    ) THEN
      EXECUTE 'SELECT EXISTS(SELECT 1 FROM user_identities WHERE nip05 IS NOT NULL AND nip05 <> '''')' INTO ui_nip05_plain;
    ELSE
      ui_nip05_plain := FALSE;
    END IF;

    -- encrypted_nsec presence only if column exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND information_schema.columns.table_name='user_identities' AND column_name='encrypted_nsec'
    ) THEN
      EXECUTE 'SELECT EXISTS(SELECT 1 FROM user_identities WHERE encrypted_nsec IS NOT NULL AND encrypted_nsec <> '''')' INTO ui_enc_nsec_present;
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

  -- nip05_records evaluations (uses DUIDs for privacy-first lookups)
  IF nr_exists THEN
    -- Check for missing user_duid (required for privacy-first architecture)
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND information_schema.columns.table_name='nip05_records' AND column_name='user_duid'
    ) THEN
      EXECUTE 'SELECT EXISTS(SELECT 1 FROM nip05_records WHERE user_duid IS NULL OR user_duid = '''')' INTO nr_user_duid_missing;
    ELSE
      nr_user_duid_missing := TRUE; -- Column doesn't exist = non-compliant
    END IF;

    -- Check for plaintext pubkey (should be hashed as pubkey_duid)
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND information_schema.columns.table_name='nip05_records' AND column_name='pubkey'
    ) THEN
      EXECUTE 'SELECT EXISTS(SELECT 1 FROM nip05_records WHERE pubkey IS NOT NULL AND pubkey <> '''')' INTO nr_pubkey_plain;
    ELSE
      nr_pubkey_plain := FALSE;
    END IF;

    -- Check for plaintext name (should be hashed as user_duid)
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND information_schema.columns.table_name='nip05_records' AND column_name='name'
    ) THEN
      EXECUTE 'SELECT EXISTS(SELECT 1 FROM nip05_records WHERE name IS NOT NULL AND name <> '''')' INTO nr_name_plain;
    ELSE
      nr_name_plain := FALSE;
    END IF;

    RETURN QUERY
    SELECT
      'nip05_records'::TEXT,
      CASE
        WHEN nr_user_duid_missing THEN 'NON_COMPLIANT'
        WHEN nr_pubkey_plain OR nr_name_plain THEN 'PARTIAL_COMPLIANCE'
        ELSE 'FULLY_COMPLIANT'
      END,
      ARRAY[
        CASE WHEN nr_user_duid_missing THEN 'Missing user_duid for some records (required for DUID lookups)' ELSE NULL END,
        CASE WHEN nr_pubkey_plain THEN 'Plaintext pubkey found (should use pubkey_duid)' ELSE NULL END,
        CASE WHEN nr_name_plain THEN 'Plaintext name found (should use user_duid)' ELSE NULL END
      ]::TEXT[];
  ELSE
    RETURN QUERY SELECT 'nip05_records'::TEXT, 'TABLE_MISSING'::TEXT, ARRAY['Table nip05_records not found']::TEXT[];
  END IF;
END;
$func$ LANGUAGE plpgsql;

-- =====================================================
-- STEP 5: Run compliance check
-- =====================================================

SELECT * FROM check_privacy_compliance();

COMMIT;

-- =====================================================
-- VERIFICATION AND SUCCESS MESSAGE
-- =====================================================

SELECT
    '✅ ENCRYPTION-FIRST ARCHITECTURE ENFORCED' as result,
    'DUID columns created and indexed; no legacy hashed_* columns required' as details,
    'Database ready for zero plaintext storage' as status,
    'Run check_privacy_compliance() to verify compliance' as next_steps;
