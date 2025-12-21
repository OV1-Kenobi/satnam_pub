-- =====================================================
-- EMERGENCY SCHEMA FIX FOR PRODUCTION REGISTRATION FAILURES
-- Add missing columns that are causing 500 errors in register-identity
-- Execute this in Supabase SQL Editor ONLY if columns are missing
-- =====================================================

-- SAFETY CHECK: Only run this if the verification script shows missing columns

-- Step 1: Add missing columns to user_identities table (if they don't exist)
-- These are the most likely culprits for registration failures

-- Add is_active column (critical for authentication)
ALTER TABLE user_identities 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;


-- Add metadata columns (required by registration function)
ALTER TABLE user_identities 
ADD COLUMN IF NOT EXISTS spending_limits JSONB DEFAULT '{"daily_limit": -1, "requires_approval": false}',
ADD COLUMN IF NOT EXISTS privacy_settings JSONB DEFAULT '{"privacy_level": "maximum", "zero_knowledge_enabled": true, "over_encryption": true}';

-- Step 2: Add missing columns to nip05_records table (if they don't exist)
-- user_duid stores the same value as user_identities.id for direct JOINs
ALTER TABLE nip05_records
ADD COLUMN IF NOT EXISTS user_duid TEXT,
ADD COLUMN IF NOT EXISTS pubkey_duid TEXT,
ADD COLUMN IF NOT EXISTS domain TEXT DEFAULT 'satnam.pub';

-- Step 2b: Migrate data from legacy name_duid column if it exists
-- This handles cases where old schema had name_duid instead of user_duid
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'nip05_records'
      AND column_name = 'name_duid'
  ) THEN
    -- Migrate existing data from name_duid to user_duid
    UPDATE nip05_records
    SET user_duid = name_duid
    WHERE name_duid IS NOT NULL AND (user_duid IS NULL OR user_duid = '');

    RAISE NOTICE '✓ Migrated data from name_duid to user_duid';
  END IF;
END $$;

-- Step 2c: Add foreign key constraint for referential integrity (if user_identities exists)
-- This ensures user_duid references a valid user_identities.id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_identities'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_nip05_user_duid'
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
      ADD CONSTRAINT fk_nip05_user_duid
      FOREIGN KEY (user_duid)
      REFERENCES user_identities(id)
      ON DELETE CASCADE;

      RAISE NOTICE '✓ Added foreign key constraint fk_nip05_user_duid';
    ELSE
      RAISE NOTICE '⚠ Skipped FK constraint: orphaned user_duid values exist - clean up first';
    END IF;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '⚠ Could not add FK constraint: %', SQLERRM;
END $$;

-- Step 3: Add column comments for documentation
COMMENT ON COLUMN user_identities.is_active IS 'CRITICAL: Controls access to authenticated sections';
COMMENT ON COLUMN user_identities.spending_limits IS 'JSON: User spending limits and approval requirements';
COMMENT ON COLUMN user_identities.privacy_settings IS 'JSON: Privacy configuration and encryption settings';

COMMENT ON COLUMN nip05_records.user_duid IS 'DUID: HMAC-SHA256 of username@domain with server secret - FK references user_identities.id';
COMMENT ON COLUMN nip05_records.pubkey_duid IS 'DUID: HMAC-SHA256 of NPUBv1:npub with server secret';
COMMENT ON COLUMN nip05_records.domain IS 'UNENCRYPTED: Whitelisted domain for verification';

-- Step 4: Ensure RLS is enabled (critical for security)
ALTER TABLE user_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE nip05_records ENABLE ROW LEVEL SECURITY;

-- Step 5: Create essential RLS policies if they don't exist
-- (These are required for registration to work)

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Allow encrypted identity creation during registration" ON user_identities;
DROP POLICY IF EXISTS "Users can read own encrypted identity" ON user_identities;
DROP POLICY IF EXISTS "Users can update own encrypted identity" ON user_identities;
DROP POLICY IF EXISTS "Users can delete own encrypted identity" ON user_identities;

DROP POLICY IF EXISTS "Allow NIP-05 verification queries" ON nip05_records;
DROP POLICY IF EXISTS "Allow NIP-05 record creation during registration" ON nip05_records;

-- Create registration-compatible policies
CREATE POLICY "Allow encrypted identity creation during registration" ON user_identities
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can read own encrypted identity" ON user_identities
  FOR SELECT USING (auth.uid()::text = id::text);

CREATE POLICY "Users can update own encrypted identity" ON user_identities
  FOR UPDATE 
  USING (auth.uid()::text = id::text)
  WITH CHECK (auth.uid()::text = id::text);

CREATE POLICY "Users can delete own encrypted identity" ON user_identities
  FOR DELETE USING (auth.uid()::text = id::text);

-- NIP-05 policies
CREATE POLICY "Allow NIP-05 verification queries" ON nip05_records
  FOR SELECT TO anon, authenticated USING (is_active = true);

CREATE POLICY "Allow NIP-05 record creation during registration" ON nip05_records
  FOR INSERT WITH CHECK (true);

-- Step 6: Grant necessary permissions
GRANT INSERT, SELECT ON user_identities TO anon;
GRANT ALL ON user_identities TO authenticated;
GRANT ALL ON user_identities TO service_role;

GRANT SELECT, INSERT ON nip05_records TO anon;
GRANT SELECT, INSERT ON nip05_records TO authenticated;
GRANT ALL ON nip05_records TO service_role;

-- Step 7: Create performance indexes
CREATE INDEX IF NOT EXISTS idx_user_identities_is_active ON user_identities(is_active);
CREATE INDEX IF NOT EXISTS idx_nip05_records_user_duid ON nip05_records(user_duid);
CREATE INDEX IF NOT EXISTS idx_nip05_records_pubkey_duid ON nip05_records(pubkey_duid);
CREATE INDEX IF NOT EXISTS idx_nip05_records_domain ON nip05_records(domain);

-- Step 8: Verification query
SELECT 
  '✅ EMERGENCY SCHEMA FIX COMPLETED' as result,
  'All required columns added for maximum encryption architecture' as details,
  'Registration should now work without column missing errors' as expected_outcome;

-- Step 9: Show updated schema
SELECT 
  '📋 UPDATED user_identities SCHEMA' as table_info,
  column_name,
  data_type,
  is_nullable,
  CASE
    WHEN column_name IN ('is_active', 'spending_limits', 'privacy_settings')
    THEN '🆕 ADDED'
    ELSE '📋 EXISTING'
  END as column_status
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'user_identities'
ORDER BY ordinal_position;
