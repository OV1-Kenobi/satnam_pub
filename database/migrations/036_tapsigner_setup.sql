-- ============================================================================
-- Migration: 036_tapsigner_setup.sql
-- Date: November 5, 2025
-- Purpose: Tapsigner NFC card integration with LNbits wallet linking
-- Author: Satnam Development Team
-- Status: Idempotent (safe to re-run)
-- Dependencies: Requires existing tables:
--   - public.privacy_users (hashed_uuid)
--   - public.lnbits_wallets (wallet_id)
-- Security & Privacy Invariants:
--   - Zero-knowledge: never store plaintext card UIDs or private keys
--   - Card ID hashing must be privacy-preserving and per-user salted
--   - RLS policies enforce user isolation
--   - No nsec or sensitive key material stored
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. TAPSIGNER_REGISTRATIONS TABLE
-- ============================================================================
-- Stores registered Tapsigner cards with public keys and metadata
-- One row per registered card per user

CREATE TABLE IF NOT EXISTS public.tapsigner_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_hash TEXT NOT NULL,                    -- session.hashedId (privacy-first)
  card_id TEXT NOT NULL UNIQUE,                -- Tapsigner card identifier (hashed)
  public_key_hex TEXT NOT NULL,                -- ECDSA secp256k1 public key (hex)
  xpub TEXT,                                   -- BIP32 extended public key (optional)
  derivation_path TEXT DEFAULT 'm/84h/0h/0h', -- BIP32 derivation path
  family_role TEXT NOT NULL DEFAULT 'private' 
    CHECK (family_role IN ('private','offspring','adult','steward','guardian')),
  pin_attempts INT DEFAULT 0,                  -- Failed PIN attempts (rate limiting)
  pin_locked_until TIMESTAMPTZ,                -- Lockout timestamp after failed attempts
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_used TIMESTAMPTZ,
  
  CONSTRAINT fk_tapsigner_owner FOREIGN KEY (owner_hash) 
    REFERENCES privacy_users(hashed_uuid) ON DELETE CASCADE
);

-- Indexes for performance
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' AND indexname = 'idx_tapsigner_owner'
  ) THEN
    CREATE INDEX idx_tapsigner_owner ON public.tapsigner_registrations(owner_hash);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' AND indexname = 'idx_tapsigner_card_id'
  ) THEN
    CREATE INDEX idx_tapsigner_card_id ON public.tapsigner_registrations(card_id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' AND indexname = 'idx_tapsigner_last_used'
  ) THEN
    CREATE INDEX idx_tapsigner_last_used ON public.tapsigner_registrations(last_used DESC);
  END IF;
END $$;

-- ============================================================================
-- 2. TAPSIGNER_OPERATIONS_LOG TABLE
-- ============================================================================
-- Audit trail for all Tapsigner operations (auth, signing, payments)
-- Used for security auditing and rate limiting

CREATE TABLE IF NOT EXISTS public.tapsigner_operations_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_hash TEXT NOT NULL,
  card_id TEXT NOT NULL,
  operation_type TEXT NOT NULL 
    CHECK (operation_type IN ('register','auth','sign','payment','verify','error')),
  success BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  signature_hex TEXT,                          -- Signature for verification (optional)
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  
  CONSTRAINT fk_tapsigner_ops_owner FOREIGN KEY (owner_hash) 
    REFERENCES privacy_users(hashed_uuid) ON DELETE CASCADE
);

-- Indexes for audit queries
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' AND indexname = 'idx_tapsigner_ops_owner'
  ) THEN
    CREATE INDEX idx_tapsigner_ops_owner ON public.tapsigner_operations_log(owner_hash);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' AND indexname = 'idx_tapsigner_ops_timestamp'
  ) THEN
    CREATE INDEX idx_tapsigner_ops_timestamp ON public.tapsigner_operations_log(timestamp DESC);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' AND indexname = 'idx_tapsigner_ops_type'
  ) THEN
    CREATE INDEX idx_tapsigner_ops_type ON public.tapsigner_operations_log(operation_type);
  END IF;
END $$;

-- ============================================================================
-- 3. TAPSIGNER_LNBITS_LINKS TABLE
-- ============================================================================
-- Maps Tapsigner cards to LNbits wallets for payment authorization
-- Enables tap-to-spend functionality

CREATE TABLE IF NOT EXISTS public.tapsigner_lnbits_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_hash TEXT NOT NULL,
  card_id TEXT NOT NULL,
  wallet_id TEXT NOT NULL,                     -- LNbits wallet_id (reference, not FK)
  spend_limit_sats BIGINT DEFAULT 50000,       -- Daily spend limit
  tap_to_spend_enabled BOOLEAN DEFAULT false,  -- Enable tap-to-spend via LNbits
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_card_wallet UNIQUE(owner_hash, card_id),
  CONSTRAINT fk_tapsigner_link_owner FOREIGN KEY (owner_hash)
    REFERENCES privacy_users(hashed_uuid) ON DELETE CASCADE
);

-- Indexes for wallet lookups
-- NOTE: wallet_id is a TEXT reference to lnbits_wallets.wallet_id (not a foreign key)
-- This allows flexible wallet management without strict referential integrity constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_tapsigner_lnbits_owner'
  ) THEN
    CREATE INDEX idx_tapsigner_lnbits_owner ON public.tapsigner_lnbits_links(owner_hash);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_tapsigner_lnbits_wallet'
  ) THEN
    CREATE INDEX idx_tapsigner_lnbits_wallet ON public.tapsigner_lnbits_links(wallet_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_tapsigner_lnbits_card_wallet'
  ) THEN
    CREATE INDEX idx_tapsigner_lnbits_card_wallet ON public.tapsigner_lnbits_links(card_id, wallet_id);
  END IF;
END $$;

-- ============================================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
-- Enforce privacy-first access control using owner_hash

-- Enable RLS on all tables
ALTER TABLE public.tapsigner_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tapsigner_operations_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tapsigner_lnbits_links ENABLE ROW LEVEL SECURITY;

-- Drop existing policies (idempotent)
DO $$
DECLARE
  _policy TEXT;
BEGIN
  FOR _policy IN 
    SELECT policyname FROM pg_policies 
    WHERE schemaname='public' AND tablename='tapsigner_registrations'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.tapsigner_registrations', _policy);
  END LOOP;
  
  FOR _policy IN 
    SELECT policyname FROM pg_policies 
    WHERE schemaname='public' AND tablename='tapsigner_operations_log'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.tapsigner_operations_log', _policy);
  END LOOP;
  
  FOR _policy IN 
    SELECT policyname FROM pg_policies 
    WHERE schemaname='public' AND tablename='tapsigner_lnbits_links'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.tapsigner_lnbits_links', _policy);
  END LOOP;
END $$;

-- tapsigner_registrations policies
CREATE POLICY tapsigner_registrations_select_self ON public.tapsigner_registrations
  FOR SELECT USING (owner_hash = current_setting('app.current_user_hash'));

CREATE POLICY tapsigner_registrations_insert_self ON public.tapsigner_registrations
  FOR INSERT WITH CHECK (owner_hash = current_setting('app.current_user_hash'));

CREATE POLICY tapsigner_registrations_update_self ON public.tapsigner_registrations
  FOR UPDATE USING (owner_hash = current_setting('app.current_user_hash'))
  WITH CHECK (owner_hash = current_setting('app.current_user_hash'));

CREATE POLICY tapsigner_registrations_delete_self ON public.tapsigner_registrations
  FOR DELETE USING (owner_hash = current_setting('app.current_user_hash'));

-- tapsigner_operations_log policies
CREATE POLICY tapsigner_operations_log_select_self ON public.tapsigner_operations_log
  FOR SELECT USING (owner_hash = current_setting('app.current_user_hash'));

CREATE POLICY tapsigner_operations_log_insert_self ON public.tapsigner_operations_log
  FOR INSERT WITH CHECK (owner_hash = current_setting('app.current_user_hash'));

-- tapsigner_lnbits_links policies
CREATE POLICY tapsigner_lnbits_links_select_self ON public.tapsigner_lnbits_links
  FOR SELECT USING (owner_hash = current_setting('app.current_user_hash'));

CREATE POLICY tapsigner_lnbits_links_insert_self ON public.tapsigner_lnbits_links
  FOR INSERT WITH CHECK (owner_hash = current_setting('app.current_user_hash'));

CREATE POLICY tapsigner_lnbits_links_update_self ON public.tapsigner_lnbits_links
  FOR UPDATE USING (owner_hash = current_setting('app.current_user_hash'))
  WITH CHECK (owner_hash = current_setting('app.current_user_hash'));

CREATE POLICY tapsigner_lnbits_links_delete_self ON public.tapsigner_lnbits_links
  FOR DELETE USING (owner_hash = current_setting('app.current_user_hash'));

-- ============================================================================
-- 5. COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE public.tapsigner_registrations IS
  'Stores registered Tapsigner NFC cards with public keys and metadata. One row per card per user.';

COMMENT ON COLUMN public.tapsigner_registrations.owner_hash IS
  'Privacy-preserving user identifier (session.hashedId). Used for RLS enforcement.';

COMMENT ON COLUMN public.tapsigner_registrations.card_id IS
  'Hashed Tapsigner card identifier. Never store plaintext card UID.';

COMMENT ON COLUMN public.tapsigner_registrations.public_key_hex IS
  'ECDSA secp256k1 public key in hex format. Used for signature verification.';

COMMENT ON COLUMN public.tapsigner_registrations.pin_attempts IS
  'Failed PIN attempt counter for rate limiting. Reset after successful auth.';

COMMENT ON TABLE public.tapsigner_operations_log IS
  'Audit trail for all Tapsigner operations. Used for security auditing and rate limiting.';

COMMENT ON TABLE public.tapsigner_lnbits_links IS
  'Maps Tapsigner cards to LNbits wallets for payment authorization and tap-to-spend.';

COMMENT ON COLUMN public.tapsigner_lnbits_links.spend_limit_sats IS
  'Daily spend limit in satoshis. Enforced by server-side rate limiting.';

COMMENT ON COLUMN public.tapsigner_lnbits_links.tap_to_spend_enabled IS
  'If true, card can be used for tap-to-spend payments via LNbits.';

-- ============================================================================
-- 6. MIGRATION VERIFICATION
-- ============================================================================

-- Verify tables exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'tapsigner_registrations'
  ) THEN
    RAISE EXCEPTION 'Migration failed: tapsigner_registrations table not created';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'tapsigner_operations_log'
  ) THEN
    RAISE EXCEPTION 'Migration failed: tapsigner_operations_log table not created';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'tapsigner_lnbits_links'
  ) THEN
    RAISE EXCEPTION 'Migration failed: tapsigner_lnbits_links table not created';
  END IF;
  
  RAISE NOTICE 'Migration 036_tapsigner_setup.sql completed successfully';
END $$;

COMMIT;

