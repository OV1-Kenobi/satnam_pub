-- Revert RLS to allow INSERTs with anon role for registration
-- Safe, targeted policy that only permits rows with required hashed fields
-- Run in Supabase SQL editor or psql connected to your project's database

BEGIN;

-- Optional: ensure anon has required privileges (RLS still applies)
GRANT USAGE ON SCHEMA public TO anon;
GRANT INSERT ON TABLE public.user_identities TO anon;

-- Optional: keep RLS enabled (expected in Supabase)
ALTER TABLE public.user_identities ENABLE ROW LEVEL SECURITY;

-- Create a permissive INSERT policy for anon (only if missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'user_identities'
      AND policyname = 'anon_insert_user_identities'
  ) THEN
    EXECUTE $$
      CREATE POLICY anon_insert_user_identities
      ON public.user_identities
      FOR INSERT
      TO anon
      WITH CHECK (
        COALESCE(hashed_username, '') <> ''
        AND COALESCE(hashed_npub, '') <> ''
        AND COALESCE(hashed_encrypted_nsec, '') <> ''
      );
    $$;
  END IF;
END$$;

-- (Optional) add unique index if missing to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_identities_hnpub
  ON public.user_identities (hashed_npub);

-- (Optional) If registration also inserts into profiles/nip05_records, enable these:
-- ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
-- DO $$ BEGIN
--   IF NOT EXISTS (
--     SELECT 1 FROM pg_policies
--     WHERE schemaname='public' AND tablename='profiles' AND policyname='anon_insert_profiles'
--   ) THEN
--     EXECUTE $$
--       CREATE POLICY anon_insert_profiles ON public.profiles
--       FOR INSERT TO anon WITH CHECK (COALESCE(hashed_npub,'') <> '');
--     $$;
--   END IF;
-- END$$;
-- ALTER TABLE public.nip05_records ENABLE ROW LEVEL SECURITY;
-- DO $$ BEGIN
--   IF NOT EXISTS (
--     SELECT 1 FROM pg_policies
--     WHERE schemaname='public' AND tablename='nip05_records' AND policyname='anon_insert_nip05_records'
--   ) THEN
--     EXECUTE $$
--       CREATE POLICY anon_insert_nip05_records ON public.nip05_records
--       FOR INSERT TO anon WITH CHECK (COALESCE(hashed_npub,'') <> '' AND COALESCE(name,'') <> '');
--     $$;
--   END IF;
-- END$$;

COMMIT;

-- Verify policies
SELECT policyname, cmd AS command, roles, qual, with_check
FROM pg_policies
WHERE schemaname='public' AND tablename='user_identities';

