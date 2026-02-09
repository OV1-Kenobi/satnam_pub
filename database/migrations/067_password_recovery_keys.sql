-- Migration: Password Recovery Keys (PRK) System
-- Version: 067
-- Date: 2026-01-27
-- Purpose: Enable password recovery using nsec or Keet seed without requiring password reset
-- Related: Password Recovery Architecture, KEYPEAR_P2P_PASSWORD_INTEGRATION.md
--
-- SECURITY ARCHITECTURE:
-- - PRKs are encrypted copies of the user's password
-- - encrypted_prk_nsec: Password encrypted with key derived from nsec
-- - encrypted_prk_keet: Password encrypted with key derived from Keet seed
-- - Only someone with the nsec or Keet seed can decrypt the PRK
-- - Platform has ZERO access to passwords (zero-knowledge)
--
-- KEYPEAR FORWARD COMPATIBILITY:
-- - prk_keypear_* columns support future Keypear P2P Password Manager integration
-- - prk_version enables schema migrations without breaking changes

-- Add PRK columns for nsec-based recovery
ALTER TABLE public.user_identities
ADD COLUMN IF NOT EXISTS encrypted_prk_nsec TEXT,
ADD COLUMN IF NOT EXISTS prk_salt_nsec TEXT,
ADD COLUMN IF NOT EXISTS prk_iv_nsec TEXT;

-- Add PRK columns for Keet seed-based recovery
ALTER TABLE public.user_identities
ADD COLUMN IF NOT EXISTS encrypted_prk_keet TEXT,
ADD COLUMN IF NOT EXISTS prk_salt_keet TEXT,
ADD COLUMN IF NOT EXISTS prk_iv_keet TEXT;

-- Add PRK metadata columns
ALTER TABLE public.user_identities
ADD COLUMN IF NOT EXISTS prk_created_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS prk_updated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS prk_version INTEGER DEFAULT 1;

-- Add Keypear forward compatibility columns (nullable for future use)
ALTER TABLE public.user_identities
ADD COLUMN IF NOT EXISTS prk_keypear_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS prk_keypear_hash TEXT,
ADD COLUMN IF NOT EXISTS prk_keypear_last_synced_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS prk_keypear_sync_status TEXT,
ADD COLUMN IF NOT EXISTS prk_keypear_device_id TEXT;

-- Add recovery attempt tracking columns
ALTER TABLE public.user_identities
ADD COLUMN IF NOT EXISTS prk_recovery_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS prk_last_recovery_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS prk_recovery_locked_until TIMESTAMPTZ;

-- Add constraint for Keypear sync status values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE c.conname = 'chk_prk_keypear_sync_status'
      AND t.relname = 'user_identities'
      AND n.nspname = 'public'
  ) THEN
    ALTER TABLE public.user_identities
    ADD CONSTRAINT chk_prk_keypear_sync_status
    CHECK (prk_keypear_sync_status IS NULL OR prk_keypear_sync_status IN ('pending', 'synced', 'conflict', 'error'));
  END IF;
END $$;

-- Add index for recovery lockout queries
CREATE INDEX IF NOT EXISTS idx_user_identities_prk_recovery_locked
ON public.user_identities(prk_recovery_locked_until)
WHERE prk_recovery_locked_until IS NOT NULL;

-- Add index for Keypear sync status queries
CREATE INDEX IF NOT EXISTS idx_user_identities_prk_keypear_sync
ON public.user_identities(prk_keypear_sync_status)
WHERE prk_keypear_enabled = true;

-- Column comments for schema documentation
COMMENT ON COLUMN public.user_identities.encrypted_prk_nsec IS
  'Password encrypted with nsec-derived key (AES-256-GCM). Enables password recovery with nsec.';

COMMENT ON COLUMN public.user_identities.prk_salt_nsec IS
  'PBKDF2 salt for nsec PRK key derivation (32-byte base64url-encoded)';

COMMENT ON COLUMN public.user_identities.prk_iv_nsec IS
  'AES-GCM initialization vector for nsec PRK encryption (12-byte base64url-encoded)';

COMMENT ON COLUMN public.user_identities.encrypted_prk_keet IS
  'Password encrypted with Keet seed-derived key (AES-256-GCM). Enables password recovery with Keet seed.';

COMMENT ON COLUMN public.user_identities.prk_salt_keet IS
  'PBKDF2 salt for Keet PRK key derivation (32-byte base64url-encoded)';

COMMENT ON COLUMN public.user_identities.prk_iv_keet IS
  'AES-GCM initialization vector for Keet PRK encryption (12-byte base64url-encoded)';

COMMENT ON COLUMN public.user_identities.prk_created_at IS
  'Timestamp when PRKs were first created for this user';

COMMENT ON COLUMN public.user_identities.prk_updated_at IS
  'Timestamp when PRKs were last updated (e.g., after password change)';

COMMENT ON COLUMN public.user_identities.prk_version IS
  'PRK schema version for future migrations (default: 1)';

COMMENT ON COLUMN public.user_identities.prk_keypear_enabled IS
  'Whether user has opted into Keypear P2P Password Manager sync';

COMMENT ON COLUMN public.user_identities.prk_keypear_hash IS
  'Hash of PRK for Keypear verification (prevents tampering)';

COMMENT ON COLUMN public.user_identities.prk_keypear_last_synced_at IS
  'Timestamp of last successful Keypear sync';

COMMENT ON COLUMN public.user_identities.prk_keypear_sync_status IS
  'Keypear sync status: pending, synced, conflict, or error';

COMMENT ON COLUMN public.user_identities.prk_keypear_device_id IS
  'Primary Keypear device identifier for sync';

COMMENT ON COLUMN public.user_identities.prk_recovery_attempts IS
  'Number of failed password recovery attempts (for rate limiting)';

COMMENT ON COLUMN public.user_identities.prk_last_recovery_at IS
  'Timestamp of last password recovery attempt';

COMMENT ON COLUMN public.user_identities.prk_recovery_locked_until IS
  'Account locked for recovery until this timestamp (rate limiting)';

-- ============================================================================
-- Add PRK columns to onboarded_identities (staging table)
-- PRK data is stored here during onboarding and copied to user_identities
-- when the onboarding is finalized
-- ============================================================================

-- Add PRK columns for nsec-based recovery (onboarded_identities)
ALTER TABLE public.onboarded_identities
ADD COLUMN IF NOT EXISTS encrypted_prk_nsec TEXT,
ADD COLUMN IF NOT EXISTS prk_salt_nsec TEXT,
ADD COLUMN IF NOT EXISTS prk_iv_nsec TEXT;

-- Add PRK columns for Keet seed-based recovery (onboarded_identities)
ALTER TABLE public.onboarded_identities
ADD COLUMN IF NOT EXISTS encrypted_prk_keet TEXT,
ADD COLUMN IF NOT EXISTS prk_salt_keet TEXT,
ADD COLUMN IF NOT EXISTS prk_iv_keet TEXT;

COMMENT ON COLUMN public.onboarded_identities.encrypted_prk_nsec IS
  'PRK for nsec-based password recovery (staged for finalization to user_identities)';

COMMENT ON COLUMN public.onboarded_identities.encrypted_prk_keet IS
  'PRK for Keet seed-based password recovery (staged for finalization to user_identities)';

-- Verification query
DO $$
BEGIN
  RAISE NOTICE 'Migration 067: Password Recovery Keys (PRK) system added successfully';
  RAISE NOTICE 'PRK columns added to user_identities: encrypted_prk_nsec, prk_salt_nsec, prk_iv_nsec';
  RAISE NOTICE 'PRK columns added to user_identities: encrypted_prk_keet, prk_salt_keet, prk_iv_keet';
  RAISE NOTICE 'PRK columns added to onboarded_identities for staging during onboarding';
  RAISE NOTICE 'Metadata columns: prk_created_at, prk_updated_at, prk_version';
  RAISE NOTICE 'Keypear columns: prk_keypear_enabled, prk_keypear_hash, prk_keypear_last_synced_at, prk_keypear_sync_status, prk_keypear_device_id';
  RAISE NOTICE 'Recovery tracking: prk_recovery_attempts, prk_last_recovery_at, prk_recovery_locked_until';
END $$;

