-- Idempotent Migration: Add Encrypted Profile Columns to user_identities
-- Greenfield Encryption Schema (no hashed_* columns)
--
-- PURPOSE:
-- - Add new encrypted_* columns for displayable user profile data
-- - Add corresponding _iv and _tag columns for AES-256-GCM encryption metadata
-- - Add migration tracking columns
--
-- STRATEGY:
-- - Single-phase addition of encrypted columns (non-breaking)
-- - Backend/Frontend already expect encrypted_* columns only
--
-- SECURITY NOTES:
-- - All encrypted columns use AES-256-GCM (authenticated encryption)
-- - Each field has corresponding _iv (initialization vector) and _tag (authentication tag)
-- - Encryption key derived from user_salt using PBKDF2-SHA256
-- - No plaintext profile data stored in database
-- - RLS policies enforce user sovereignty (auth.uid() matching)

BEGIN;

-- =====================================================
-- STEP 0: Ensure base table exists (idempotent and safe)
-- =====================================================
-- This block guarantees that the user_identities table exists so the ALTER TABLE
-- statements below will not fail on fresh environments. The minimal baseline
-- schema is compatible with the privacy‑first architecture and does not introduce
-- plaintext profile fields. Existing databases are not modified by this block.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_identities'
  ) THEN
    CREATE TABLE IF NOT EXISTS public.user_identities (
      id TEXT PRIMARY KEY,
      user_salt TEXT,
      encrypted_nsec TEXT,
      password_hash TEXT,
      password_salt TEXT,
      password_created_at TIMESTAMPTZ DEFAULT NOW(),
      password_updated_at TIMESTAMPTZ DEFAULT NOW(),
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      requires_password_change BOOLEAN NOT NULL DEFAULT false,
      role TEXT NOT NULL DEFAULT 'private' CHECK (role IN ('private','offspring','adult','steward','guardian')),
      spending_limits JSONB NOT NULL DEFAULT '{"daily_limit": -1, "requires_approval": false}',
      privacy_settings JSONB NOT NULL DEFAULT '{"privacy_level": "maximum", "zero_knowledge_enabled": true, "over_encryption": true, "is_imported_account": false}',
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    RAISE NOTICE '✓ Created user_identities table (baseline) for encryption migration';
  ELSE
    RAISE NOTICE '✓ user_identities table already exists; proceeding to add encrypted columns';
  END IF;
END $$;


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
-- STEP 4: (Removed) Deprecated hashed_* columns are not used in greenfield
-- =====================================================

-- =====================================================
-- STEP 5: Verify Migration
-- =====================================================

DO $$
DECLARE
  v_exists BOOLEAN;
  missing_columns TEXT := '';
BEGIN
  -- Helper macro pattern: check existence and accumulate missing column names
  -- Username
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_identities'
      AND column_name = 'encrypted_username'
  ) INTO v_exists;
  IF NOT v_exists THEN missing_columns := missing_columns || 'encrypted_username,'; END IF;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_identities'
      AND column_name = 'encrypted_username_iv'
  ) INTO v_exists;
  IF NOT v_exists THEN missing_columns := missing_columns || 'encrypted_username_iv,'; END IF;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_identities'
      AND column_name = 'encrypted_username_tag'
  ) INTO v_exists;
  IF NOT v_exists THEN missing_columns := missing_columns || 'encrypted_username_tag,'; END IF;

  -- Bio
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_identities'
      AND column_name = 'encrypted_bio'
  ) INTO v_exists;
  IF NOT v_exists THEN missing_columns := missing_columns || 'encrypted_bio,'; END IF;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_identities'
      AND column_name = 'encrypted_bio_iv'
  ) INTO v_exists;
  IF NOT v_exists THEN missing_columns := missing_columns || 'encrypted_bio_iv,'; END IF;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_identities'
      AND column_name = 'encrypted_bio_tag'
  ) INTO v_exists;
  IF NOT v_exists THEN missing_columns := missing_columns || 'encrypted_bio_tag,'; END IF;

  -- Display name
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_identities'
      AND column_name = 'encrypted_display_name'
  ) INTO v_exists;
  IF NOT v_exists THEN missing_columns := missing_columns || 'encrypted_display_name,'; END IF;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_identities'
      AND column_name = 'encrypted_display_name_iv'
  ) INTO v_exists;
  IF NOT v_exists THEN missing_columns := missing_columns || 'encrypted_display_name_iv,'; END IF;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_identities'
      AND column_name = 'encrypted_display_name_tag'
  ) INTO v_exists;
  IF NOT v_exists THEN missing_columns := missing_columns || 'encrypted_display_name_tag,'; END IF;

  -- Picture
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_identities'
      AND column_name = 'encrypted_picture'
  ) INTO v_exists;
  IF NOT v_exists THEN missing_columns := missing_columns || 'encrypted_picture,'; END IF;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_identities'
      AND column_name = 'encrypted_picture_iv'
  ) INTO v_exists;
  IF NOT v_exists THEN missing_columns := missing_columns || 'encrypted_picture_iv,'; END IF;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_identities'
      AND column_name = 'encrypted_picture_tag'
  ) INTO v_exists;
  IF NOT v_exists THEN missing_columns := missing_columns || 'encrypted_picture_tag,'; END IF;

  -- NIP-05
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_identities'
      AND column_name = 'encrypted_nip05'
  ) INTO v_exists;
  IF NOT v_exists THEN missing_columns := missing_columns || 'encrypted_nip05,'; END IF;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_identities'
      AND column_name = 'encrypted_nip05_iv'
  ) INTO v_exists;
  IF NOT v_exists THEN missing_columns := missing_columns || 'encrypted_nip05_iv,'; END IF;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_identities'
      AND column_name = 'encrypted_nip05_tag'
  ) INTO v_exists;
  IF NOT v_exists THEN missing_columns := missing_columns || 'encrypted_nip05_tag,'; END IF;

  -- Lightning address
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_identities'
      AND column_name = 'encrypted_lightning_address'
  ) INTO v_exists;
  IF NOT v_exists THEN missing_columns := missing_columns || 'encrypted_lightning_address,'; END IF;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_identities'
      AND column_name = 'encrypted_lightning_address_iv'
  ) INTO v_exists;
  IF NOT v_exists THEN missing_columns := missing_columns || 'encrypted_lightning_address_iv,'; END IF;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_identities'
      AND column_name = 'encrypted_lightning_address_tag'
  ) INTO v_exists;
  IF NOT v_exists THEN missing_columns := missing_columns || 'encrypted_lightning_address_tag,'; END IF;

  -- Migration tracking columns
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_identities'
      AND column_name = 'encryption_migration_status'
  ) INTO v_exists;
  IF NOT v_exists THEN missing_columns := missing_columns || 'encryption_migration_status,'; END IF;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_identities'
      AND column_name = 'encryption_migration_date'
  ) INTO v_exists;
  IF NOT v_exists THEN missing_columns := missing_columns || 'encryption_migration_date,'; END IF;

  IF missing_columns = '' THEN
    RAISE NOTICE '✅ Migration 023: All encrypted profile columns created successfully';
  ELSE
    RAISE EXCEPTION '❌ Migration 023: Missing columns: %', trim(trailing ',' FROM missing_columns);
  END IF;
END $$;

COMMIT;

