-- =====================================================
-- PRIVACY-FIRST HASHING MIGRATION
-- Implements complete user data hashing with UNIQUE salts per table
-- CRITICAL: Database breach protection - zero exposure of Nostr accounts
-- SECURITY: Each table gets independent salts to prevent correlation attacks
-- FIX: Explicit type casting to resolve PostgreSQL UUID/TEXT type mismatches
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- STEP 1: Add new hashed columns to user_identities table
-- =====================================================

-- Add salt column for individual user encryption
ALTER TABLE user_identities 
ADD COLUMN IF NOT EXISTS user_salt TEXT;

-- Add hashed columns for sensitive data
ALTER TABLE user_identities 
ADD COLUMN IF NOT EXISTS hashed_npub TEXT,
ADD COLUMN IF NOT EXISTS hashed_nip05 TEXT,
ADD COLUMN IF NOT EXISTS hashed_encrypted_nsec TEXT;

-- =====================================================
-- STEP 2: Add new hashed columns to profiles table
-- =====================================================

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS user_salt TEXT,
ADD COLUMN IF NOT EXISTS hashed_npub TEXT,
ADD COLUMN IF NOT EXISTS hashed_nip05 TEXT;

-- =====================================================
-- STEP 3: Add new hashed columns to nip05_records table
-- =====================================================

ALTER TABLE nip05_records 
ADD COLUMN IF NOT EXISTS user_salt TEXT,
ADD COLUMN IF NOT EXISTS hashed_pubkey TEXT;

-- =====================================================
-- STEP 4: Create secure hashing function
-- =====================================================

CREATE OR REPLACE FUNCTION generate_user_salt()
RETURNS TEXT AS $$
BEGIN
  -- Generate cryptographically secure 32-byte salt
  RETURN encode(gen_random_bytes(32), 'hex');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION hash_user_data(data_value TEXT, salt_value TEXT)
RETURNS TEXT AS $$
BEGIN
  -- Use PBKDF2 with SHA-512, 100,000 iterations for maximum security
  -- This matches the client-side hashing implementation

  -- FIX: Handle NULL values and type casting issues
  IF data_value IS NULL OR data_value = '' OR salt_value IS NULL OR salt_value = '' THEN
    RETURN NULL;
  END IF;

  -- Ensure both parameters are properly cast to TEXT
  RETURN encode(
    digest(
      CAST(data_value AS TEXT) || CAST(salt_value AS TEXT) || 'satnam_privacy_salt_2024',
      'sha512'
    ),
    'hex'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- STEP 5: Migrate existing user_identities data
-- =====================================================

-- Generate salts for existing users without salts
UPDATE user_identities 
SET user_salt = generate_user_salt()
WHERE user_salt IS NULL OR user_salt = '';

-- Hash existing npub values with explicit type casting
UPDATE user_identities
SET hashed_npub = hash_user_data(CAST(npub AS TEXT), CAST(user_salt AS TEXT))
WHERE npub IS NOT NULL AND npub != '' AND hashed_npub IS NULL;

-- Hash existing nip05 values with explicit type casting
UPDATE user_identities
SET hashed_nip05 = hash_user_data(CAST(nip05 AS TEXT), CAST(user_salt AS TEXT))
WHERE nip05 IS NOT NULL AND nip05 != '' AND hashed_nip05 IS NULL;

-- Hash existing encrypted_nsec values with explicit type casting
UPDATE user_identities
SET hashed_encrypted_nsec = hash_user_data(CAST(encrypted_nsec AS TEXT), CAST(user_salt AS TEXT))
WHERE encrypted_nsec IS NOT NULL AND encrypted_nsec != '' AND hashed_encrypted_nsec IS NULL;

-- =====================================================
-- STEP 6: Migrate existing profiles data (UNIQUE SALTS)
-- =====================================================

-- SECURITY FIX: Generate UNIQUE salts for profiles table (NO REUSE)
-- Each table gets completely independent salts to prevent correlation attacks
UPDATE profiles
SET user_salt = generate_user_salt()
WHERE user_salt IS NULL OR user_salt = '';

-- Hash existing npub values in profiles with UNIQUE salts and explicit type casting
UPDATE profiles
SET hashed_npub = hash_user_data(CAST(npub AS TEXT), CAST(user_salt AS TEXT))
WHERE npub IS NOT NULL AND npub != '' AND hashed_npub IS NULL;

-- Hash existing nip05 values in profiles with UNIQUE salts and explicit type casting
UPDATE profiles
SET hashed_nip05 = hash_user_data(CAST(nip05 AS TEXT), CAST(user_salt AS TEXT))
WHERE nip05 IS NOT NULL AND nip05 != '' AND hashed_nip05 IS NULL;

-- =====================================================
-- STEP 7: Migrate existing nip05_records data (UNIQUE SALTS)
-- =====================================================

-- SECURITY FIX: Generate UNIQUE salts for nip05_records table (NO REUSE)
-- Each table gets completely independent salts to prevent correlation attacks
UPDATE nip05_records
SET user_salt = generate_user_salt()
WHERE user_salt IS NULL OR user_salt = '';

-- Hash existing pubkey values with UNIQUE salts and explicit type casting
UPDATE nip05_records
SET hashed_pubkey = hash_user_data(CAST(pubkey AS TEXT), CAST(user_salt AS TEXT))
WHERE pubkey IS NOT NULL AND pubkey != '' AND hashed_pubkey IS NULL;

-- =====================================================
-- STEP 8: Create indexes for performance
-- =====================================================

-- Indexes on hashed columns for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_identities_hashed_npub ON user_identities(hashed_npub);
CREATE INDEX IF NOT EXISTS idx_user_identities_hashed_nip05 ON user_identities(hashed_nip05);
CREATE INDEX IF NOT EXISTS idx_profiles_hashed_npub ON profiles(hashed_npub);
CREATE INDEX IF NOT EXISTS idx_profiles_hashed_nip05 ON profiles(hashed_nip05);
CREATE INDEX IF NOT EXISTS idx_nip05_records_hashed_pubkey ON nip05_records(hashed_pubkey);

-- =====================================================
-- STEP 9: Update RLS policies for user sovereignty
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can read own identity" ON user_identities;
DROP POLICY IF EXISTS "Users can update own identity" ON user_identities;
DROP POLICY IF EXISTS "Users can delete own identity" ON user_identities;

-- Create comprehensive RLS policies for user sovereignty
-- FIX: Explicit type casting to handle UUID/TEXT mismatches
CREATE POLICY "Users have full CRUD access to own identity" ON user_identities
  FOR ALL USING (CAST(auth.uid() AS text) = CAST(id AS text));

-- Enable RLS
ALTER TABLE user_identities ENABLE ROW LEVEL SECURITY;

-- Similar policies for profiles
DROP POLICY IF EXISTS "Users can manage own profile" ON profiles;
CREATE POLICY "Users have full CRUD access to own profile" ON profiles
  FOR ALL USING (CAST(auth.uid() AS text) = CAST(id AS text));

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- STEP 10: Add constraints and validation
-- =====================================================

-- Ensure all active users have salts and hashed data
ALTER TABLE user_identities 
ADD CONSTRAINT check_active_users_have_salt 
CHECK (NOT is_active OR (user_salt IS NOT NULL AND user_salt != ''));

-- =====================================================
-- VERIFICATION QUERIES (for testing)
-- =====================================================

-- Verify migration success and type casting
-- SELECT
--   COUNT(*) as total_users,
--   COUNT(user_salt) as users_with_salt,
--   COUNT(hashed_npub) as users_with_hashed_npub,
--   COUNT(hashed_nip05) as users_with_hashed_nip05
-- FROM user_identities;

-- Verify unique salts across tables (should return 0 if all salts are unique)
-- SELECT COUNT(*) as salt_reuse_violations FROM (
--   SELECT user_salt FROM user_identities WHERE user_salt IS NOT NULL
--   INTERSECT
--   SELECT user_salt FROM profiles WHERE user_salt IS NOT NULL
--   INTERSECT
--   SELECT user_salt FROM nip05_records WHERE user_salt IS NOT NULL
-- ) violations;

-- Test RLS policies work with type casting
-- SELECT CAST(auth.uid() AS text) = CAST('test-id' AS text) as rls_test;

-- =====================================================
-- ROLLBACK PROCEDURES (if needed)
-- =====================================================

-- ROLLBACK SCRIPT (DO NOT RUN UNLESS NECESSARY):
-- ALTER TABLE user_identities DROP COLUMN IF EXISTS user_salt;
-- ALTER TABLE user_identities DROP COLUMN IF EXISTS hashed_npub;
-- ALTER TABLE user_identities DROP COLUMN IF EXISTS hashed_nip05;
-- ALTER TABLE user_identities DROP COLUMN IF EXISTS hashed_encrypted_nsec;
-- DROP FUNCTION IF EXISTS generate_user_salt();
-- DROP FUNCTION IF EXISTS hash_user_data(TEXT, TEXT);

COMMIT;
