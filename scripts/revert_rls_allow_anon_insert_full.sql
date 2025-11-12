-- Revert RLS to allow INSERTs with anon role for registration
-- Applies to public.user_identities and public.nip05_records
-- Also (re)creates safe unique indexes if the columns exist
-- Run in Supabase SQL editor or psql connected to your project's database

BEGIN;

-- Minimal privileges for anon (RLS still governs rows)
GRANT USAGE ON SCHEMA public TO anon;
GRANT INSERT ON TABLE public.user_identities TO anon;
GRANT INSERT ON TABLE public.nip05_records TO anon;

-- Ensure RLS is enabled (expected in Supabase)
ALTER TABLE public.user_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nip05_records ENABLE ROW LEVEL SECURITY;

-- Create anon INSERT policy for user_identities (only if missing)
DO $do$
DECLARE
  pol_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_identities' AND policyname='anon_insert_user_identities'
  ) INTO pol_exists;

  IF NOT pol_exists THEN
    EXECUTE $sql$
      CREATE POLICY anon_insert_user_identities
      ON public.user_identities
      FOR INSERT
      TO anon
      WITH CHECK (
        COALESCE(user_salt, '') <> ''
        AND COALESCE(encrypted_nsec, '') <> ''
      );
    $sql$;
  END IF;
END $do$;

-- Create anon INSERT policy for nip05_records (only if missing)
-- Prefer hashed columns if available; otherwise fall back to (name, npub)
DO $do$
DECLARE
  pol_exists boolean;
  has_name_duid boolean;
  has_pubkey_duid boolean;
  has_domain boolean;
  policy_sql text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='nip05_records' AND policyname='anon_insert_nip05_records'
  ) INTO pol_exists;

  IF pol_exists THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='nip05_records' AND column_name='name_duid'
  ) INTO has_name_duid;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='nip05_records' AND column_name='pubkey_duid'
  ) INTO has_pubkey_duid;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='nip05_records' AND column_name='domain'
  ) INTO has_domain;

  IF has_name_duid AND has_pubkey_duid THEN
    IF has_domain THEN
      policy_sql := $pol$
        CREATE POLICY anon_insert_nip05_records
        ON public.nip05_records
        FOR INSERT
        TO anon
        WITH CHECK (
          COALESCE(name_duid, '') <> ''
          AND COALESCE(pubkey_duid, '') <> ''
          AND lower(domain) IN ('satnam.pub','www.satnam.pub')
        );
      $pol$;
    ELSE
      policy_sql := $pol$
        CREATE POLICY anon_insert_nip05_records
        ON public.nip05_records
        FOR INSERT
        TO anon
        WITH CHECK (
          COALESCE(name_duid, '') <> '' AND COALESCE(pubkey_duid, '') <> ''
        );
      $pol$;
    END IF;
  ELSE
    -- Fallback: deny by default if required columns are missing
    policy_sql := $pol$
      CREATE POLICY anon_insert_nip05_records
      ON public.nip05_records
      FOR INSERT
      TO anon
      WITH CHECK (
        TRUE = FALSE
      );
    $pol$;
  END IF;

  EXECUTE policy_sql;
END $do$;

-- Create unique indexes IF columns exist (prevents duplicates)
-- user_identities: no hashed_* indexes are created in greenfield deployments
-- (reserved for future indexes on DUIDs or encrypted fields if needed)

-- nip05_records: ensure unique index on name_duid (and domain if present); fallback to lower(name) if legacy schema
DO $$
DECLARE
  has_name_duid boolean;
  has_domain boolean;
  has_name boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='nip05_records' AND column_name='name_duid'
  ) INTO has_name_duid;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='nip05_records' AND column_name='domain'
  ) INTO has_domain;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='nip05_records' AND column_name='name'
  ) INTO has_name;

  IF has_name_duid AND has_domain THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uq_nip05_records_name_duid_domain ON public.nip05_records (name_duid, lower(domain))';
  ELSIF has_name_duid THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uq_nip05_records_name_duid ON public.nip05_records (name_duid)';
  ELSIF has_name THEN
    -- Normalize case for uniqueness if using plaintext name
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes WHERE schemaname=''public'' AND tablename=''nip05_records'' AND indexname=''uq_nip05_records_lower_name''
    ) THEN
      EXECUTE ''CREATE UNIQUE INDEX uq_nip05_records_lower_name ON public.nip05_records ((lower(name)))'';
    END IF;
  END IF;
END$$;

COMMIT;

-- Verify policies and indexes
SELECT policyname, tablename, cmd AS command, roles, qual, with_check
FROM pg_policies
WHERE schemaname='public' AND tablename IN ('user_identities','nip05_records')
ORDER BY tablename, policyname;

SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname='public' AND tablename IN ('user_identities','nip05_records')
ORDER BY tablename, indexname;

