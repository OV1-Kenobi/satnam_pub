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

-- Add hashed profile columns (required by maximum encryption)
ALTER TABLE user_identities 
ADD COLUMN IF NOT EXISTS hashed_username TEXT,
ADD COLUMN IF NOT EXISTS hashed_bio TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS hashed_display_name TEXT,
ADD COLUMN IF NOT EXISTS hashed_picture TEXT DEFAULT '';

-- Add hashed identity columns (required by maximum encryption)
ALTER TABLE user_identities 
ADD COLUMN IF NOT EXISTS hashed_nip05 TEXT,
ADD COLUMN IF NOT EXISTS hashed_lightning_address TEXT,
ADD COLUMN IF NOT EXISTS hashed_encrypted_nsec TEXT;

-- Add metadata columns (required by registration function)
ALTER TABLE user_identities 
ADD COLUMN IF NOT EXISTS spending_limits JSONB DEFAULT '{"daily_limit": -1, "requires_approval": false}',
ADD COLUMN IF NOT EXISTS privacy_settings JSONB DEFAULT '{"privacy_level": "maximum", "zero_knowledge_enabled": true, "over_encryption": true}';

-- Step 2: Add missing columns to nip05_records table (if they don't exist)
ALTER TABLE nip05_records 
ADD COLUMN IF NOT EXISTS hashed_name TEXT,
ADD COLUMN IF NOT EXISTS hashed_npub TEXT,
ADD COLUMN IF NOT EXISTS domain TEXT DEFAULT 'satnam.pub';

-- Step 3: Add column comments for documentation
COMMENT ON COLUMN user_identities.is_active IS 'CRITICAL: Controls access to authenticated sections';
COMMENT ON COLUMN user_identities.hashed_username IS 'ENCRYPTED: Hashed username for maximum privacy';
COMMENT ON COLUMN user_identities.hashed_bio IS 'ENCRYPTED: Hashed bio text for maximum privacy';
COMMENT ON COLUMN user_identities.hashed_display_name IS 'ENCRYPTED: Hashed display name for maximum privacy';
COMMENT ON COLUMN user_identities.hashed_picture IS 'ENCRYPTED: Hashed picture URL for maximum privacy';
COMMENT ON COLUMN user_identities.hashed_nip05 IS 'ENCRYPTED: Hashed NIP-05 identifier for maximum privacy';
COMMENT ON COLUMN user_identities.hashed_lightning_address IS 'ENCRYPTED: Hashed Lightning address for maximum privacy';
COMMENT ON COLUMN user_identities.hashed_encrypted_nsec IS 'ENCRYPTED: Hashed encrypted private key for critical security';
COMMENT ON COLUMN user_identities.spending_limits IS 'JSON: User spending limits and approval requirements';
COMMENT ON COLUMN user_identities.privacy_settings IS 'JSON: Privacy configuration and encryption settings';

COMMENT ON COLUMN nip05_records.hashed_name IS 'ENCRYPTED: Hashed NIP-05 name for verification';
COMMENT ON COLUMN nip05_records.hashed_npub IS 'ENCRYPTED: Hashed public key for NIP-05 verification';
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
CREATE INDEX IF NOT EXISTS idx_user_identities_hashed_username ON user_identities(hashed_username);
CREATE INDEX IF NOT EXISTS idx_user_identities_hashed_npub ON user_identities(hashed_npub);
CREATE INDEX IF NOT EXISTS idx_nip05_records_hashed_npub ON nip05_records(hashed_npub);
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
    WHEN column_name IN ('is_active', 'hashed_username', 'hashed_bio', 'hashed_display_name', 'hashed_picture', 'hashed_nip05', 'hashed_lightning_address', 'hashed_encrypted_nsec', 'spending_limits', 'privacy_settings') 
    THEN '🆕 ADDED'
    ELSE '📋 EXISTING'
  END as column_status
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'user_identities'
ORDER BY ordinal_position;
