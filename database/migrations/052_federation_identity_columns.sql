-- ============================================================================
-- Migration 052: Federation Identity Columns (Encrypted-At-Rest)
-- Date: 2025-12-03
-- Purpose:
--   - Add federation identity fields to family_federations with encryption-at-rest
--   - Prepare for federation-level Nostr, NIP-05, and Lightning address identity
--   - Maintain privacy-first, zero-knowledge architecture (no plaintext identifiers)
--
-- Invariants:
--   - No plaintext federation npub, NIP-05, or Lightning address stored in DB
--   - All identity fields are stored as encrypted blobs (TEXT ciphertext)
--   - Idempotent and safe to run multiple times
--   - Compatible with existing family_federations schema (048, 050)
--
-- IMPORTANT PRIVACY NOTE:
--   Public discoverability (via NIP-05 /.well-known, LNURL, etc.) will be
--   implemented by decrypting these fields on-demand in Netlify Functions
--   using existing vault/Key Management patterns, *not* by storing them in
--   plaintext columns.
-- ============================================================================

DO $$
BEGIN
  -- --------------------------------------------------------------------------
  -- Add encrypted federation npub column (TEXT ciphertext)
  -- --------------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'family_federations'
      AND column_name = 'federation_npub_encrypted'
  ) THEN
    ALTER TABLE family_federations
      ADD COLUMN federation_npub_encrypted TEXT;

    COMMENT ON COLUMN family_federations.federation_npub_encrypted IS
      'Encrypted federation Nostr public key (npub); ciphertext only, never stored in plaintext. Decrypted on-demand in application layer.';
  END IF;

  -- --------------------------------------------------------------------------
  -- Add encrypted federation NIP-05 identifier column
  -- --------------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'family_federations'
      AND column_name = 'federation_nip05_encrypted'
  ) THEN
    ALTER TABLE family_federations
      ADD COLUMN federation_nip05_encrypted TEXT;

    COMMENT ON COLUMN family_federations.federation_nip05_encrypted IS
      'Encrypted federation NIP-05 identifier (e.g. handle@my.satnam.pub); ciphertext-at-rest to avoid centralized identity honeypot.';
  END IF;

  -- --------------------------------------------------------------------------
  -- Add encrypted federation Lightning address column
  -- --------------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'family_federations'
      AND column_name = 'federation_lightning_address_encrypted'
  ) THEN
    ALTER TABLE family_federations
      ADD COLUMN federation_lightning_address_encrypted TEXT;

    COMMENT ON COLUMN family_federations.federation_lightning_address_encrypted IS
      'Encrypted federation Lightning address (local@domain); ciphertext-only to prevent bulk exfiltration from DB/backups.';
  END IF;

  -- --------------------------------------------------------------------------
  -- Add encrypted federation nsec column (already planned in architecture)
  -- --------------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'family_federations'
      AND column_name = 'federation_nsec_encrypted'
  ) THEN
    ALTER TABLE family_federations
      ADD COLUMN federation_nsec_encrypted TEXT;

    COMMENT ON COLUMN family_federations.federation_nsec_encrypted IS
      'Encrypted federation Nostr secret key (nsec); must only be accessed via Bi-FROST/vault workflows. Never logged or exposed in plaintext.';
  END IF;

  -- --------------------------------------------------------------------------
  -- Add federation LNbits wallet id column (identifier only)
  --   NOTE: This is an internal LNbits identifier, not inherently PII; it is
  --   acceptable to store as plaintext for operational efficiency.
  -- --------------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'family_federations'
      AND column_name = 'federation_lnbits_wallet_id'
  ) THEN
    ALTER TABLE family_federations
      ADD COLUMN federation_lnbits_wallet_id TEXT;

    COMMENT ON COLUMN family_federations.federation_lnbits_wallet_id IS
      'LNbits wallet identifier associated with the federation; used for Lightning operations via Netlify functions.';
  END IF;

END $$;

-- ============================================================================
-- Verification block: ensure all federation identity columns exist
-- ============================================================================
DO $$
DECLARE
  missing_columns TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'family_federations' AND column_name = 'federation_npub_encrypted'
  ) THEN
    missing_columns := array_append(missing_columns, 'family_federations.federation_npub_encrypted');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'family_federations' AND column_name = 'federation_nip05_encrypted'
  ) THEN
    missing_columns := array_append(missing_columns, 'family_federations.federation_nip05_encrypted');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'family_federations' AND column_name = 'federation_lightning_address_encrypted'
  ) THEN
    missing_columns := array_append(missing_columns, 'family_federations.federation_lightning_address_encrypted');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'family_federations' AND column_name = 'federation_nsec_encrypted'
  ) THEN
    missing_columns := array_append(missing_columns, 'family_federations.federation_nsec_encrypted');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'family_federations' AND column_name = 'federation_lnbits_wallet_id'
  ) THEN
    missing_columns := array_append(missing_columns, 'family_federations.federation_lnbits_wallet_id');
  END IF;

  IF array_length(missing_columns, 1) > 0 THEN
    RAISE WARNING 'Migration 052 verification failed. Missing: %', missing_columns;
  ELSE
    RAISE NOTICE 'Migration 052 verification successful. All federation identity columns exist.';
  END IF;
END $$;

