-- Steward Pubkey Lookup Support (Option C - Hybrid)
--
-- Adds a canonical nostr_pubkey_hex column for user_identities (if missing)
-- and defines a privacy-preserving RPC for steward/adult pubkey retrieval.
--
-- This migration is idempotent and safe to re-run.

-- 1) Add nostr_pubkey_hex column to user_identities if it does not exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_identities'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_identities'
        AND column_name = 'nostr_pubkey_hex'
    ) THEN
      ALTER TABLE user_identities
        ADD COLUMN nostr_pubkey_hex TEXT;
      RAISE NOTICE '✓ Added nostr_pubkey_hex column to user_identities';
    ELSE
      RAISE NOTICE '✓ nostr_pubkey_hex column already exists on user_identities';
    END IF;
  ELSE
    RAISE NOTICE '⚠ user_identities table does not exist - skipping nostr_pubkey_hex column addition';
  END IF;
END $$;

-- 2) Create index on user_identities.nostr_pubkey_hex (conditional, via EXECUTE)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_identities'
      AND column_name = 'nostr_pubkey_hex'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'user_identities'
        AND indexname = 'idx_user_identities_nostr_pubkey_hex'
    ) THEN
      EXECUTE 'CREATE INDEX idx_user_identities_nostr_pubkey_hex ON user_identities(nostr_pubkey_hex)';
      RAISE NOTICE '✓ Created index idx_user_identities_nostr_pubkey_hex';
    ELSE
      RAISE NOTICE '✓ Index idx_user_identities_nostr_pubkey_hex already exists';
    END IF;
  ELSE
    RAISE NOTICE '⚠ nostr_pubkey_hex column not found on user_identities - skipping index creation';
  END IF;
END $$;

-- 3) RPC: get_eligible_steward_pubkeys_for_federation
--
-- Returns hex-encoded Nostr pubkeys for active steward/adult family members
-- in the same federation as the requester. Authorization is enforced by
-- validating requester membership via p_requester_duid + p_federation_id.
--
-- SECURITY NOTES:
-- - Requires service-role key to bypass RLS (requester validation is done via CTE)
-- - Validates requester is active member of federation before returning any data
-- - Only returns pubkeys for steward/adult roles (not offspring/private)
-- - Filters for is_active=true on both family_members and user_identities
-- - Returns NULL if requester is not a member of the federation

CREATE OR REPLACE FUNCTION public.get_eligible_steward_pubkeys_for_federation(
  p_federation_id uuid,
  p_requester_duid text
)
RETURNS TABLE (pubkey_hex text)
LANGUAGE sql
STABLE
AS $$
  WITH requester AS (
    -- Validate that requester is an active member of the federation
    -- This CTE acts as authorization gate - if empty, entire query returns no rows
    SELECT 1
    FROM family_members fm
    WHERE fm.family_federation_id = p_federation_id
      AND fm.user_duid = p_requester_duid
      AND fm.is_active = true
    LIMIT 1
  )
  SELECT ui.nostr_pubkey_hex AS pubkey_hex
  FROM requester
  CROSS JOIN family_members fm
  INNER JOIN user_identities ui ON ui.id = fm.user_duid
  WHERE fm.family_federation_id = p_federation_id
    AND fm.is_active = true
    AND fm.family_role IN ('adult', 'steward')
    AND ui.is_active = true
    AND ui.nostr_pubkey_hex IS NOT NULL
$$;

-- Grant execute to authenticated role for flexibility (service role may also call)
GRANT EXECUTE ON FUNCTION public.get_eligible_steward_pubkeys_for_federation(uuid, text) TO authenticated;
