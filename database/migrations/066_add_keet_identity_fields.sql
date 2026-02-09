-- Migration: Add Keet P2P Identity Fields to user_identities
-- Version: 066
-- Date: 2026-01-27
-- Purpose: Enable 24-word BIP39 seed storage for Keet P2P messaging and future Silent Payments integration
-- Related: KEET_P2P_MESSAGING_INTEGRATION.md Section 12.3, SILENT_PAYMENTS_INTEGRATION_ANALYSIS.md Phase 1

-- Add Keet identity columns to user_identities table
ALTER TABLE public.user_identities
ADD COLUMN IF NOT EXISTS keet_peer_id TEXT,
ADD COLUMN IF NOT EXISTS encrypted_keet_seed TEXT,
ADD COLUMN IF NOT EXISTS keet_seed_salt TEXT,
ADD COLUMN IF NOT EXISTS keet_identity_created_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS keet_identity_rotated_at TIMESTAMPTZ;

-- Add index for Keet peer ID lookups (partial index for efficiency)
CREATE INDEX IF NOT EXISTS idx_user_identities_keet_peer_id
ON public.user_identities(keet_peer_id)
WHERE keet_peer_id IS NOT NULL;

-- Add column comments for schema documentation
COMMENT ON COLUMN public.user_identities.keet_peer_id IS
  'Keet P2P peer identifier derived from 24-word BIP39 seed (public identifier)';

COMMENT ON COLUMN public.user_identities.encrypted_keet_seed IS
  'AES-256-GCM encrypted 24-word Keet seed phrase using same encryption protocol as encrypted_nsec (PBKDF2 + Noble V2)';

COMMENT ON COLUMN public.user_identities.keet_seed_salt IS
  'Unique PBKDF2 salt for Keet seed encryption (32-byte base64-encoded, unique per user)';

COMMENT ON COLUMN public.user_identities.keet_identity_created_at IS
  'Timestamp when Keet identity was first created';

COMMENT ON COLUMN public.user_identities.keet_identity_rotated_at IS
  'Timestamp of most recent Keet identity rotation (for key rotation tracking)';

-- Verification query
DO $$
BEGIN
  RAISE NOTICE 'Migration 066: Keet identity fields added successfully';
  RAISE NOTICE 'Columns added: keet_peer_id, encrypted_keet_seed, keet_seed_salt, keet_identity_created_at, keet_identity_rotated_at';
  RAISE NOTICE 'Index created: idx_user_identities_keet_peer_id';
END $$;

