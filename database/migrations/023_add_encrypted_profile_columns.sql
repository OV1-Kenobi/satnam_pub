-- Idempotent Migration: Add Encrypted Profile Columns to user_identities
-- Phase 1 of Hashing to Encryption Migration
-- 
-- PURPOSE:
-- - Add new encrypted_* columns for displayable user profile data
-- - Add corresponding _iv and _tag columns for AES-256-GCM encryption metadata
-- - Add migration tracking columns for gradual data migration
-- - Keep existing hashed_* columns temporarily for rollback capability
--
-- MIGRATION STRATEGY:
-- - Phase 1 (this script): Add new encrypted columns (non-breaking)
-- - Phase 2: Migrate existing data from hashed to encrypted
-- - Phase 3: Update backend code to use encrypted columns
-- - Phase 4: Update frontend code to use encrypted columns
-- - Phase 5: Remove deprecated hashed_* columns after verification period
--
-- SECURITY NOTES:
-- - All encrypted columns use AES-256-GCM (authenticated encryption)
-- - Each field has corresponding _iv (initialization vector) and _tag (authentication tag)
-- - Encryption key derived from user_salt using PBKDF2-SHA256
-- - No plaintext profile data stored in database
-- - RLS policies enforce user sovereignty (auth.uid() matching)

BEGIN;

-- =====================================================
-- STEP 1: Add Encrypted Profile Columns
-- =====================================================

-- Username (displayable, should be encrypted)
ALTER TABLE user_identities 
ADD COLUMN IF NOT EXISTS encrypted_username TEXT,
ADD COLUMN IF NOT EXISTS encrypted_username_iv TEXT,
ADD COLUMN IF NOT EXISTS encrypted_username_tag TEXT;

-- Bio (displayable, should be encrypted)
ALTER TABLE user_identities 
ADD COLUMN IF NOT EXISTS encrypted_bio TEXT,
ADD COLUMN IF NOT EXISTS encrypted_bio_iv TEXT,
ADD COLUMN IF NOT EXISTS encrypted_bio_tag TEXT;

-- Display Name (displayable, should be encrypted)
ALTER TABLE user_identities 
ADD COLUMN IF NOT EXISTS encrypted_display_name TEXT,
ADD COLUMN IF NOT EXISTS encrypted_display_name_iv TEXT,
ADD COLUMN IF NOT EXISTS encrypted_display_name_tag TEXT;

-- Picture URL (displayable, should be encrypted)
ALTER TABLE user_identities 
ADD COLUMN IF NOT EXISTS encrypted_picture TEXT,
ADD COLUMN IF NOT EXISTS encrypted_picture_iv TEXT,
ADD COLUMN IF NOT EXISTS encrypted_picture_tag TEXT;

-- NIP-05 Identifier (displayable, should be encrypted)
ALTER TABLE user_identities 
ADD COLUMN IF NOT EXISTS encrypted_nip05 TEXT,
ADD COLUMN IF NOT EXISTS encrypted_nip05_iv TEXT,
ADD COLUMN IF NOT EXISTS encrypted_nip05_tag TEXT;

-- Lightning Address (displayable, should be encrypted)
ALTER TABLE user_identities 
ADD COLUMN IF NOT EXISTS encrypted_lightning_address TEXT,
ADD COLUMN IF NOT EXISTS encrypted_lightning_address_iv TEXT,
ADD COLUMN IF NOT EXISTS encrypted_lightning_address_tag TEXT;

-- =====================================================
-- STEP 2: Add Migration Tracking Columns
-- =====================================================

-- Track encryption migration status for each user
ALTER TABLE user_identities 
ADD COLUMN IF NOT EXISTS encryption_migration_status TEXT 
  DEFAULT 'pending' 
  CHECK (encryption_migration_status IN ('pending', 'in_progress', 'completed', 'failed'));

-- Track when encryption migration was completed
ALTER TABLE user_identities 
ADD COLUMN IF NOT EXISTS encryption_migration_date TIMESTAMP;

-- =====================================================
-- STEP 3: Add Comments (Documentation)
-- =====================================================

COMMENT ON COLUMN user_identities.encrypted_username IS 
  'ENCRYPTED: Username encrypted with AES-256-GCM using user_salt as key material';
COMMENT ON COLUMN user_identities.encrypted_username_iv IS 
  'Initialization vector for encrypted_username (AES-GCM)';
COMMENT ON COLUMN user_identities.encrypted_username_tag IS 
  'Authentication tag for encrypted_username (AES-GCM)';

COMMENT ON COLUMN user_identities.encrypted_bio IS 
  'ENCRYPTED: User bio encrypted with AES-256-GCM using user_salt as key material';
COMMENT ON COLUMN user_identities.encrypted_bio_iv IS 
  'Initialization vector for encrypted_bio (AES-GCM)';
COMMENT ON COLUMN user_identities.encrypted_bio_tag IS 
  'Authentication tag for encrypted_bio (AES-GCM)';

COMMENT ON COLUMN user_identities.encrypted_display_name IS 
  'ENCRYPTED: Display name encrypted with AES-256-GCM using user_salt as key material';
COMMENT ON COLUMN user_identities.encrypted_display_name_iv IS 
  'Initialization vector for encrypted_display_name (AES-GCM)';
COMMENT ON COLUMN user_identities.encrypted_display_name_tag IS 
  'Authentication tag for encrypted_display_name (AES-GCM)';

COMMENT ON COLUMN user_identities.encrypted_picture IS 
  'ENCRYPTED: Picture URL encrypted with AES-256-GCM using user_salt as key material';
COMMENT ON COLUMN user_identities.encrypted_picture_iv IS 
  'Initialization vector for encrypted_picture (AES-GCM)';
COMMENT ON COLUMN user_identities.encrypted_picture_tag IS 
  'Authentication tag for encrypted_picture (AES-GCM)';

COMMENT ON COLUMN user_identities.encrypted_nip05 IS 
  'ENCRYPTED: NIP-05 identifier encrypted with AES-256-GCM using user_salt as key material';
COMMENT ON COLUMN user_identities.encrypted_nip05_iv IS 
  'Initialization vector for encrypted_nip05 (AES-GCM)';
COMMENT ON COLUMN user_identities.encrypted_nip05_tag IS 
  'Authentication tag for encrypted_nip05 (AES-GCM)';

COMMENT ON COLUMN user_identities.encrypted_lightning_address IS 
  'ENCRYPTED: Lightning address encrypted with AES-256-GCM using user_salt as key material';
COMMENT ON COLUMN user_identities.encrypted_lightning_address_iv IS 
  'Initialization vector for encrypted_lightning_address (AES-GCM)';
COMMENT ON COLUMN user_identities.encrypted_lightning_address_tag IS 
  'Authentication tag for encrypted_lightning_address (AES-GCM)';

COMMENT ON COLUMN user_identities.encryption_migration_status IS 
  'Migration status: pending (not migrated), in_progress (migrating), completed (migrated), failed (migration error)';
COMMENT ON COLUMN user_identities.encryption_migration_date IS 
  'Timestamp when encryption migration was completed for this user';

-- =====================================================
-- STEP 4: Mark Deprecated Hashed Columns
-- =====================================================

-- Update comments on deprecated hashed columns to indicate they will be removed
COMMENT ON COLUMN user_identities.hashed_username IS 
  'DEPRECATED: Use encrypted_username instead. Will be removed after migration period.';
COMMENT ON COLUMN user_identities.hashed_bio IS 
  'DEPRECATED: Use encrypted_bio instead. Will be removed after migration period.';
COMMENT ON COLUMN user_identities.hashed_display_name IS 
  'DEPRECATED: Use encrypted_display_name instead. Will be removed after migration period.';
COMMENT ON COLUMN user_identities.hashed_picture IS 
  'DEPRECATED: Use encrypted_picture instead. Will be removed after migration period.';
COMMENT ON COLUMN user_identities.hashed_nip05 IS 
  'DEPRECATED: Use encrypted_nip05 instead. Will be removed after migration period.';
COMMENT ON COLUMN user_identities.hashed_lightning_address IS 
  'DEPRECATED: Use encrypted_lightning_address instead. Will be removed after migration period.';
COMMENT ON COLUMN user_identities.hashed_npub IS 
  'DEPRECATED: Use encrypted_npub instead (when implemented). Will be removed after migration period.';

-- =====================================================
-- STEP 5: Verify Migration
-- =====================================================

DO $$
DECLARE
  v_username_exists BOOLEAN;
  v_bio_exists BOOLEAN;
  v_display_name_exists BOOLEAN;
  v_picture_exists BOOLEAN;
  v_nip05_exists BOOLEAN;
  v_lightning_address_exists BOOLEAN;
  v_migration_status_exists BOOLEAN;
BEGIN
  -- Check that all new columns were created
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'user_identities' 
    AND column_name = 'encrypted_username'
  ) INTO v_username_exists;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'user_identities' 
    AND column_name = 'encrypted_bio'
  ) INTO v_bio_exists;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'user_identities' 
    AND column_name = 'encrypted_display_name'
  ) INTO v_display_name_exists;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'user_identities' 
    AND column_name = 'encrypted_picture'
  ) INTO v_picture_exists;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'user_identities' 
    AND column_name = 'encrypted_nip05'
  ) INTO v_nip05_exists;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'user_identities' 
    AND column_name = 'encrypted_lightning_address'
  ) INTO v_lightning_address_exists;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'user_identities' 
    AND column_name = 'encryption_migration_status'
  ) INTO v_migration_status_exists;
  
  IF v_username_exists AND v_bio_exists AND v_display_name_exists 
     AND v_picture_exists AND v_nip05_exists AND v_lightning_address_exists 
     AND v_migration_status_exists THEN
    RAISE NOTICE '✅ Migration 023: All encrypted profile columns created successfully';
  ELSE
    RAISE EXCEPTION '❌ Migration 023: Failed to create all required columns';
  END IF;
END $$;

COMMIT;

