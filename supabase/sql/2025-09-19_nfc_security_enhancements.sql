-- NFC Security Enhancements: PIN hashing fields, ops log safety, and preference toggle
-- Idempotent migration. Safe to run multiple times.

-- 1) Extend ntag424_registrations with PIN hashing columns (never store plaintext PIN)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ntag424_registrations' AND column_name = 'pin_salt_base64'
  ) THEN
    ALTER TABLE public.ntag424_registrations ADD COLUMN pin_salt_base64 text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ntag424_registrations' AND column_name = 'pin_hash_hex'
  ) THEN
    ALTER TABLE public.ntag424_registrations ADD COLUMN pin_hash_hex text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ntag424_registrations' AND column_name = 'pin_algo'
  ) THEN
    ALTER TABLE public.ntag424_registrations ADD COLUMN pin_algo text;
  END IF;
END$$;

-- 2) Ensure operations log exists for audit trails and rate-limit diagnostics
CREATE TABLE IF NOT EXISTS public.ntag424_operations_log (
  id bigserial PRIMARY KEY,
  owner_hash text,
  hashed_tag_uid text,
  operation_type text NOT NULL, -- 'auth' | 'login' | 'program' | etc.
  success boolean NOT NULL DEFAULT false,
  timestamp timestamptz NOT NULL DEFAULT now(),
  metadata jsonb
);

-- Optional indexes (safe dynamic CREATE INDEX)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'idx_ntag424_ops_owner_ts' AND n.nspname = 'public'
  ) THEN
    EXECUTE 'CREATE INDEX idx_ntag424_ops_owner_ts ON public.ntag424_operations_log(owner_hash, timestamp)';
  END IF;
END$$;

-- 3) Add user preference toggle: require NFC for all vault unlocks
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_signing_preferences' AND column_name = 'require_nfc_for_unlock'
  ) THEN
    ALTER TABLE public.user_signing_preferences ADD COLUMN require_nfc_for_unlock boolean NOT NULL DEFAULT false;
  END IF;
END$$;

-- RLS notes (informational):
-- - This migration does not alter RLS. Ensure user_signing_preferences has policies allowing
--   authenticated users to SELECT/UPSERT their own record by owner_hash via set_app_current_user_hash().
-- - Do not store raw tag UIDs. The application uses privacy-preserving hashes.
-- - PIN data is stored as PBKDF2-SHA512 100k hex digest with per-record base64 salt.
-- - No private key material is stored or transmitted.

