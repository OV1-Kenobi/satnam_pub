-- ============================================================================
-- Migration: frost_boltcard_integration.sql
-- Date: 2025-10-08
-- Purpose: Consolidate FROST threshold signing with Boltcard (LNbits) NFC infra
-- Author: Satnam
-- Breaking changes: None (additive only)
-- Dependencies: Requires existing tables:
--   - public.lnbits_boltcards (from add_lnbits_integration.sql)
--   - public.secure_guardian_shards (from privacy-enhanced schema)
-- Security & Privacy Invariants:
--   - Zero-knowledge: never store plaintext NFC UIDs or private key material
--   - Card UID hashing must be privacy-preserving and per-user salted
--   - Shares remain encrypted at rest (AES-256-GCM already modeled in
--     secure_guardian_shards via encrypted_shard_data + iv/tag/salt and
--     double_encrypted_shard)
--   - RLS: anon has no access; owners can access shares linked to their cards;
--     full federation/guardian access may require additional mappings and/or
--     RPCs; this migration provides owner-centric policies that are safe by
--     default and do not widen exposure
-- Execution: Run directly in Supabase SQL editor
-- Notes:
--   - Uses DO $$ blocks with IF NOT EXISTS checks and dynamic EXECUTE for indexes
--   - Includes extensive comments for operational handoff
-- ============================================================================

BEGIN;

-- ============================================================================
-- A) secure_guardian_shards: add share_type, nfc_card_uid_hash + index
-- ============================================================================
DO $$
DECLARE
  v_table_exists BOOLEAN;
  v_col_exists BOOLEAN;
  v_idx_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'secure_guardian_shards'
  ) INTO v_table_exists;

  IF NOT v_table_exists THEN
    RAISE NOTICE 'Table public.secure_guardian_shards not found; skipping alterations.';
    RETURN;
  END IF;

  -- Add share_type (nullable) with CHECK constraint
  PERFORM 1 FROM information_schema.columns
   WHERE table_schema='public' AND table_name='secure_guardian_shards' AND column_name='share_type';
  IF NOT FOUND THEN
    EXECUTE $sql$ALTER TABLE public.secure_guardian_shards
      ADD COLUMN share_type TEXT CHECK (share_type IN ('individual','family','federation'))$sql$;
  END IF;

  -- Add nfc_card_uid_hash (nullable)
  PERFORM 1 FROM information_schema.columns
   WHERE table_schema='public' AND table_name='secure_guardian_shards' AND column_name='nfc_card_uid_hash';
  IF NOT FOUND THEN
    EXECUTE $sql$ALTER TABLE public.secure_guardian_shards
      ADD COLUMN nfc_card_uid_hash TEXT$sql$;
  END IF;

  -- Create index on nfc_card_uid_hash (idempotent via pg_indexes)
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_secure_guardian_shards_nfc_uid_hash'
  ) INTO v_idx_exists;
  IF NOT v_idx_exists THEN
    EXECUTE 'CREATE INDEX idx_secure_guardian_shards_nfc_uid_hash ON public.secure_guardian_shards(nfc_card_uid_hash)';
  END IF;

  -- Column comments: privacy-first hashing model
  EXECUTE $sql$COMMENT ON COLUMN public.secure_guardian_shards.nfc_card_uid_hash IS
    'Privacy-preserving link to NFC card: store only SHA-256(uid || per-user salt) (hex/base64). No plaintext UID. Used to bind shares to user-held cards.'$sql$;
  EXECUTE $sql$COMMENT ON COLUMN public.secure_guardian_shards.share_type IS
    'Share classification for policy enforcement: individual | family | federation'$sql$;
END$$;

-- ============================================================================
-- B) lnbits_boltcards: add card_uid_hash, functions[], frost_share_ids, pin_iv/tag
-- ============================================================================
DO $$
DECLARE
  v_table_exists BOOLEAN;
  v_idx_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'lnbits_boltcards'
  ) INTO v_table_exists;

  IF NOT v_table_exists THEN
    RAISE NOTICE 'Table public.lnbits_boltcards not found; skipping alterations.';
    RETURN;
  END IF;

  -- Additive columns (idempotent)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='lnbits_boltcards' AND column_name='card_uid_hash'
  ) THEN
    EXECUTE $sql$ALTER TABLE public.lnbits_boltcards
      ADD COLUMN card_uid_hash TEXT UNIQUE$sql$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='lnbits_boltcards' AND column_name='functions'
  ) THEN
    EXECUTE $sql$ALTER TABLE public.lnbits_boltcards
      ADD COLUMN functions TEXT[] NOT NULL DEFAULT '{}'::TEXT[]$sql$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='lnbits_boltcards' AND column_name='frost_share_ids'
  ) THEN
    EXECUTE $sql$ALTER TABLE public.lnbits_boltcards
      ADD COLUMN frost_share_ids UUID[]$sql$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='lnbits_boltcards' AND column_name='pin_iv'
  ) THEN
    EXECUTE $sql$ALTER TABLE public.lnbits_boltcards
      ADD COLUMN pin_iv TEXT$sql$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='lnbits_boltcards' AND column_name='pin_tag'
  ) THEN
    EXECUTE $sql$ALTER TABLE public.lnbits_boltcards
      ADD COLUMN pin_tag TEXT$sql$;
  END IF;

  -- Indexes
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_lnbits_boltcards_card_uid_hash'
  ) THEN
    EXECUTE 'CREATE INDEX idx_lnbits_boltcards_card_uid_hash ON public.lnbits_boltcards(card_uid_hash)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_lnbits_boltcards_functions'
  ) THEN
    EXECUTE 'CREATE INDEX idx_lnbits_boltcards_functions ON public.lnbits_boltcards USING GIN(functions)';
  END IF;

  -- Column comments: multi-function card model + hashing model
  EXECUTE $sql$COMMENT ON COLUMN public.lnbits_boltcards.card_uid_hash IS
    'Privacy-preserving NFC UID hash: SHA-256(card_uid || user_salt). Only the hash is stored; never store plaintext UID.'$sql$;
  EXECUTE $sql$COMMENT ON COLUMN public.lnbits_boltcards.functions IS
    'Declared capabilities of the card: e.g., {payment,auth,signing}. Used for UI and policy gating.'$sql$;
  EXECUTE $sql$COMMENT ON COLUMN public.lnbits_boltcards.frost_share_ids IS
    'Optional denormalized linkage to secure_guardian_shards.id for quick resolution of card-bound shares.'$sql$;
  EXECUTE $sql$COMMENT ON COLUMN public.lnbits_boltcards.pin_iv IS
    'AES-256-GCM IV for PIN envelope (pairs with pin_hash_enc).'$sql$;
  EXECUTE $sql$COMMENT ON COLUMN public.lnbits_boltcards.pin_tag IS
    'AES-256-GCM auth tag for PIN envelope (pairs with pin_hash_enc).'$sql$;
END$$;

-- ============================================================================
-- C) RLS Policies
--    lnbits_boltcards: existing policies (user_duid = auth.uid()) remain unchanged
--    secure_guardian_shards: enable owner-centric access via card linkage
-- ============================================================================
DO $$
DECLARE
  v_table_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'secure_guardian_shards'
  ) INTO v_table_exists;

  IF NOT v_table_exists THEN
    RAISE NOTICE 'Table public.secure_guardian_shards not found; skipping RLS configuration.';
    RETURN;
  END IF;

  -- Enable RLS (idempotent)
  EXECUTE 'ALTER TABLE public.secure_guardian_shards ENABLE ROW LEVEL SECURITY';

  -- Deny-by-default posture (no policy for anon; service role bypasses via SR key)
  -- Owner READ: allow selecting shares bound to their cards via nfc_card_uid_hash
  -- (joins through lnbits_boltcards with user_duid = auth.uid())
  EXECUTE $sql$CREATE POLICY IF NOT EXISTS sgs_owner_select_by_cardhash
    ON public.secure_guardian_shards
    FOR SELECT
    TO authenticated
    USING (
      nfc_card_uid_hash IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.lnbits_boltcards b
        WHERE b.card_uid_hash = public.secure_guardian_shards.nfc_card_uid_hash
          AND b.user_duid = auth.uid()::text
      )
      OR id = ANY (
        SELECT unnest(COALESCE(b.frost_share_ids, ARRAY[]::uuid[]))
        FROM public.lnbits_boltcards b
        WHERE b.user_duid = auth.uid()::text
      )
    )$sql$;

  -- Owner INSERT: only if binding to a card they own (via provided nfc_card_uid_hash)
  EXECUTE $sql$CREATE POLICY IF NOT EXISTS sgs_owner_insert
    ON public.secure_guardian_shards
    FOR INSERT
    TO authenticated
    WITH CHECK (
      nfc_card_uid_hash IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.lnbits_boltcards b
        WHERE b.card_uid_hash = public.secure_guardian_shards.nfc_card_uid_hash
          AND b.user_duid = auth.uid()::text
      )
    )$sql$;

  -- Owner UPDATE/DELETE: only if still bound to their card
  EXECUTE $sql$CREATE POLICY IF NOT EXISTS sgs_owner_update
    ON public.secure_guardian_shards
    FOR UPDATE
    TO authenticated
    USING (
      nfc_card_uid_hash IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.lnbits_boltcards b
        WHERE b.card_uid_hash = public.secure_guardian_shards.nfc_card_uid_hash
          AND b.user_duid = auth.uid()::text
      )
    )
    WITH CHECK (
      nfc_card_uid_hash IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.lnbits_boltcards b
        WHERE b.card_uid_hash = public.secure_guardian_shards.nfc_card_uid_hash
          AND b.user_duid = auth.uid()::text
      )
    )$sql$;

  EXECUTE $sql$CREATE POLICY IF NOT EXISTS sgs_owner_delete
    ON public.secure_guardian_shards
    FOR DELETE
    TO authenticated
    USING (
      nfc_card_uid_hash IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.lnbits_boltcards b
        WHERE b.card_uid_hash = public.secure_guardian_shards.nfc_card_uid_hash
          AND b.user_duid = auth.uid()::text
      )
    )$sql$;

  -- NOTE on federation/guardian access:
  --   This migration focuses on owner access via card linkage which is enforceable
  --   without decrypting federation identifiers. Federation/guardian-scoped access
  --   should be implemented either:
  --     (1) via additional mapping columns (e.g., a clear-text federation_duid column
  --         or a separate mapping table) that allow safe joins to family_members, or
  --     (2) via SECURITY DEFINER RPC functions that perform necessary decryption and
  --         authorization checks server-side.
  --   Until then, no broad federation policy is added to avoid over-exposure.

END$$;

-- ============================================================================
-- D) Card UID Hashing Algorithm (documentation)
--   Input: raw NFC card UID (from LNbits Boltcards API: many instances expose `uid`)
--   Salt:  per-user salt from user_identities.user_salt (or equivalent privacy salt)
--   Algo:  SHA-256( concat(card_uid, user_salt) )
--   Encode: hex (preferred) or base64
--   Store: lnbits_boltcards.card_uid_hash only; never store plaintext UID
--   Netlify function integration:
--     - lnbits-create-boltcard.ts: after creating/fetching card metadata, fetch the
--       card UID (via GET /boltcards/api/v1/cards or equivalent), compute hash on
--       server, and upsert card_uid_hash.
--     - lnbits-get-boltcard-lnurl.ts (or a new nfc-register-card.ts): when a card is
--       first bound to a user, compute and persist card_uid_hash immediately.
--   Security: perform hashing server-side to avoid leaking UIDs through client logs.
-- ============================================================================

-- ============================================================================
-- E) Integration Wiring (documentation)
--   Enabling "signing" on a Boltcard (owner flow):
--     1) UPDATE public.lnbits_boltcards SET functions = array_append(functions,'signing')
--        WHERE user_duid = auth.uid() AND card_id = :cardId AND 'signing' NOT IN functions
--     2) INSERT INTO public.secure_guardian_shards (...)
--        - nfc_card_uid_hash = lnbits_boltcards.card_uid_hash
--        - share_type = 'individual' | 'family' | 'federation'
--        - encrypted_shard_data / salts / iv / tag per existing double-encryption pattern
--     3) Optionally append the new share id to lnbits_boltcards.frost_share_ids
--        for quick lookup and RLS-protected owner reads.
--   Authorization: for federation scopes, use family_members/family_signing_rules to
--   authorize in application layer or via SECURITY DEFINER RPCs.
-- ============================================================================

COMMIT;

