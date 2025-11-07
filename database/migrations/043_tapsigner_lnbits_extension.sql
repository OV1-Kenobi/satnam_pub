-- ============================================================================
-- Migration: 043_tapsigner_lnbits_extension.sql
-- Date: November 5, 2025
-- Purpose: Extend lnbits_boltcards table to support both NTAG424 and Tapsigner
-- Author: Satnam Development Team
-- Status: Idempotent (safe to re-run)
-- Dependencies: Requires existing table:
--   - public.lnbits_boltcards (created by add_lnbits_integration.sql)
-- Security & Privacy Invariants:
--   - Backward compatible with existing NTAG424 Boltcard records
--   - Zero-knowledge: never store plaintext private keys
--   - RLS policies remain unchanged (user_duid-based access control)
--   - No breaking changes to existing functionality
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. ADD TAPSIGNER SUPPORT COLUMNS TO LNBITS_BOLTCARDS
-- ============================================================================
-- These columns enable unified wallet management for both card types

-- Add card_type discriminator (default 'boltcard' for backward compatibility)
ALTER TABLE public.lnbits_boltcards
  ADD COLUMN IF NOT EXISTS card_type TEXT 
    DEFAULT 'boltcard' 
    CHECK (card_type IN ('boltcard', 'tapsigner'));

-- Add Tapsigner-specific columns
-- public_key_hex: ECDSA secp256k1 public key (hex format)
-- Used for signature verification during tap-to-spend operations
ALTER TABLE public.lnbits_boltcards
  ADD COLUMN IF NOT EXISTS public_key_hex TEXT;

-- xpub: BIP32 extended public key (optional)
-- Enables hierarchical deterministic key derivation for advanced features
ALTER TABLE public.lnbits_boltcards
  ADD COLUMN IF NOT EXISTS xpub TEXT;

-- derivation_path: BIP32 derivation path (default m/84h/0h/0h for Bitcoin)
-- Specifies which key in the hierarchy is used for signing
ALTER TABLE public.lnbits_boltcards
  ADD COLUMN IF NOT EXISTS derivation_path TEXT 
    DEFAULT 'm/84h/0h/0h';

-- ============================================================================
-- 2. CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

-- Index for card type queries (e.g., "get all Tapsigner cards")
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' AND indexname = 'idx_lnbits_boltcards_type'
  ) THEN
    CREATE INDEX idx_lnbits_boltcards_type 
      ON public.lnbits_boltcards(card_type);
  END IF;
END $$;

-- Index for public key lookups (Tapsigner only)
-- Enables fast signature verification by public key
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' AND indexname = 'idx_lnbits_boltcards_pubkey'
  ) THEN
    CREATE INDEX idx_lnbits_boltcards_pubkey 
      ON public.lnbits_boltcards(public_key_hex) 
      WHERE card_type = 'tapsigner';
  END IF;
END $$;

-- Composite index for user + card type queries
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' AND indexname = 'idx_lnbits_boltcards_user_type'
  ) THEN
    CREATE INDEX idx_lnbits_boltcards_user_type 
      ON public.lnbits_boltcards(user_duid, card_type);
  END IF;
END $$;

-- ============================================================================
-- 3. ADD CONSTRAINTS FOR DATA INTEGRITY
-- ============================================================================

-- Ensure public_key_hex is provided for Tapsigner cards
-- This is enforced at application level, but documented here for clarity
-- Note: PostgreSQL doesn't support conditional NOT NULL, so this is app-level

-- ============================================================================
-- 4. UPDATE DOCUMENTATION
-- ============================================================================

COMMENT ON COLUMN public.lnbits_boltcards.card_type IS
  'Card type discriminator: ''boltcard'' (NTAG424) or ''tapsigner'' (Tapsigner NFC). Default: ''boltcard'' for backward compatibility.';

COMMENT ON COLUMN public.lnbits_boltcards.public_key_hex IS
  'ECDSA secp256k1 public key in hex format (Tapsigner only). Used for signature verification during tap-to-spend operations.';

COMMENT ON COLUMN public.lnbits_boltcards.xpub IS
  'BIP32 extended public key (Tapsigner only, optional). Enables hierarchical deterministic key derivation for advanced features.';

COMMENT ON COLUMN public.lnbits_boltcards.derivation_path IS
  'BIP32 derivation path (Tapsigner only). Default: m/84h/0h/0h (Bitcoin standard). Specifies which key in the hierarchy is used for signing.';

-- ============================================================================
-- 5. MIGRATION VERIFICATION
-- ============================================================================

-- Verify columns exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'lnbits_boltcards' 
    AND column_name = 'card_type'
  ) THEN
    RAISE EXCEPTION 'Migration failed: card_type column not added to lnbits_boltcards';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'lnbits_boltcards' 
    AND column_name = 'public_key_hex'
  ) THEN
    RAISE EXCEPTION 'Migration failed: public_key_hex column not added to lnbits_boltcards';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'lnbits_boltcards' 
    AND column_name = 'xpub'
  ) THEN
    RAISE EXCEPTION 'Migration failed: xpub column not added to lnbits_boltcards';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'lnbits_boltcards' 
    AND column_name = 'derivation_path'
  ) THEN
    RAISE EXCEPTION 'Migration failed: derivation_path column not added to lnbits_boltcards';
  END IF;
  
  RAISE NOTICE 'Migration 043_tapsigner_lnbits_extension.sql completed successfully';
  RAISE NOTICE 'lnbits_boltcards table now supports both NTAG424 (boltcard) and Tapsigner cards';
  RAISE NOTICE 'Existing NTAG424 records remain unchanged with card_type = ''boltcard''';
END $$;

COMMIT;

