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
        COALESCE(hashed_username, '') <> ''
        AND COALESCE(hashed_npub, '') <> ''
        AND COALESCE(hashed_encrypted_nsec, '') <> ''
      );
    $sql$;
  END IF;
END $do$;

-- Create anon INSERT policy for nip05_records (only if missing)
-- Prefer hashed columns if available; otherwise fall back to (name, npub)
DO $do$
DECLARE
  pol_exists boolean;
  has_hnip05 boolean;
  has_hnpub boolean;
  has_name boolean;
  has_npub boolean;
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
    WHERE table_schema='public' AND table_name='nip05_records' AND column_name='hashed_nip05'
  ) INTO has_hnip05;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='nip05_records' AND column_name='hashed_npub'
  ) INTO has_hnpub;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='nip05_records' AND column_name='name'
  ) INTO has_name;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='nip05_records' AND column_name='npub'
  ) INTO has_npub;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='nip05_records' AND column_name='domain'
  ) INTO has_domain;

  IF has_hnip05 AND has_hnpub THEN
    IF has_domain THEN
      policy_sql := $pol$
        CREATE POLICY anon_insert_nip05_records
        ON public.nip05_records
        FOR INSERT
        TO anon
        WITH CHECK (
          COALESCE(hashed_nip05, '') <> ''
          AND COALESCE(hashed_npub, '') <> ''
          AND domain IN ('satnam.pub','www.satnam.pub')
        );
      $pol$;
    ELSE
      policy_sql := $pol$
        CREATE POLICY anon_insert_nip05_records
        ON public.nip05_records
        FOR INSERT
        TO anon
        WITH CHECK (
          COALESCE(hashed_nip05, '') <> '' AND COALESCE(hashed_npub, '') <> ''
        );
      $pol$;
    END IF;
  ELSIF has_name AND has_npub THEN
    IF has_domain THEN
      policy_sql := $pol$
        CREATE POLICY anon_insert_nip05_records
        ON public.nip05_records
        FOR INSERT
        TO anon
        WITH CHECK (
          COALESCE(name, '') <> ''
          AND COALESCE(npub, '') <> ''
          AND domain IN ('satnam.pub','www.satnam.pub')
        );
      $pol$;
    ELSE
      policy_sql := $pol$
        CREATE POLICY anon_insert_nip05_records
        ON public.nip05_records
        FOR INSERT
        TO anon
        WITH CHECK (
          COALESCE(name, '') <> '' AND COALESCE(npub, '') <> ''
        );
      $pol$;
    END IF;
  ELSE
    -- Fallback: require at least one identifier present to avoid fully open insert
    policy_sql := $pol$
      CREATE POLICY anon_insert_nip05_records
      ON public.nip05_records
      FOR INSERT
      TO anon
      WITH CHECK (
        TRUE = FALSE -- No-op if schema is unknown; adjust manually if needed
      );
    $pol$;
  END IF;

  EXECUTE policy_sql;
END $do$;

-- Create unique indexes IF columns exist (prevents duplicates)
-- user_identities hashed_npub
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='user_identities' AND column_name='hashed_npub'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uq_user_identities_hnpub ON public.user_identities (hashed_npub)';
  END IF;
END$$;

-- user_identities hashed_nip05
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='user_identities' AND column_name='hashed_nip05'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uq_user_identities_hnip05 ON public.user_identities (hashed_nip05)';
  END IF;
END$$;

-- user_identities hashed_username
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='user_identities' AND column_name='hashed_username'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uq_user_identities_husername ON public.user_identities (hashed_username)';
  END IF;
END$$;

-- nip05_records: prefer hashed_nip05 unique, otherwise lower(name)
DO $$
DECLARE
  has_hnip05 boolean;
  has_name boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='nip05_records' AND column_name='hashed_nip05'
  ) INTO has_hnip05;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='nip05_records' AND column_name='name'
  ) INTO has_name;

  IF has_hnip05 THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uq_nip05_records_hnip05 ON public.nip05_records (hashed_nip05)';
  ELSIF has_name THEN
    -- Normalize case for uniqueness if using plaintext name
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='nip05_records' AND indexname='uq_nip05_records_lower_name'
    ) THEN
      EXECUTE 'CREATE UNIQUE INDEX uq_nip05_records_lower_name ON public.nip05_records ((lower(name)))';
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

