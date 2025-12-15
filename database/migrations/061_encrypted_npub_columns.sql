-- Migration 061: Add encrypted_npub columns to user_identities
-- 
-- PRIVACY-FIRST: Store npub encrypted instead of plaintext
-- The npub is decrypted only during signin to include in JWT for invitation matching
--
-- This migration is idempotent - safe to run multiple times

BEGIN;

-- Add encrypted_npub column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_identities' 
    AND column_name = 'encrypted_npub'
  ) THEN
    ALTER TABLE public.user_identities 
    ADD COLUMN encrypted_npub TEXT;
    RAISE NOTICE 'Added encrypted_npub column';
  ELSE
    RAISE NOTICE 'encrypted_npub column already exists';
  END IF;
END $$;

-- Add encrypted_npub_iv column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_identities' 
    AND column_name = 'encrypted_npub_iv'
  ) THEN
    ALTER TABLE public.user_identities 
    ADD COLUMN encrypted_npub_iv TEXT;
    RAISE NOTICE 'Added encrypted_npub_iv column';
  ELSE
    RAISE NOTICE 'encrypted_npub_iv column already exists';
  END IF;
END $$;

-- Add encrypted_npub_tag column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_identities' 
    AND column_name = 'encrypted_npub_tag'
  ) THEN
    ALTER TABLE public.user_identities 
    ADD COLUMN encrypted_npub_tag TEXT;
    RAISE NOTICE 'Added encrypted_npub_tag column';
  ELSE
    RAISE NOTICE 'encrypted_npub_tag column already exists';
  END IF;
END $$;

-- Add comment explaining the privacy-first approach
COMMENT ON COLUMN public.user_identities.encrypted_npub IS 
  'PRIVACY-FIRST: User npub encrypted with user_salt using Noble V2 (AES-GCM). Decrypted only during signin for JWT payload. Never stored in plaintext.';

COMMENT ON COLUMN public.user_identities.encrypted_npub_iv IS 
  'Initialization vector for encrypted_npub decryption';

COMMENT ON COLUMN public.user_identities.encrypted_npub_tag IS 
  'Authentication tag for encrypted_npub (AES-GCM integrity verification)';

COMMIT;

-- Verification query (run manually to check migration success)
-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_schema = 'public' 
-- AND table_name = 'user_identities' 
-- AND column_name LIKE 'encrypted_npub%';

