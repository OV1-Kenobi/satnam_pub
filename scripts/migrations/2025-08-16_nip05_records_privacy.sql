-- Migration: Enforce privacy-first nip05_records (server-side DUID hashing)
-- Objective:
-- 1) Remove plaintext columns (name, pubkey, etc.) from nip05_records
-- 2) Store only hashed_nip05 and hashed_npub using server-side secret (DUID_SERVER_SECRET)
-- 3) Keep domain and is_active for scoping; maintain created_at/updated_at
-- 4) Create indexes for fast availability checks
-- 5) RLS: allow anon INSERT with hashed fields; SELECT only hashed fields for anon (no leakage)

BEGIN;

-- 0) Ensure table exists
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='nip05_records'
  ) THEN
    EXECUTE $$
      CREATE TABLE public.nip05_records (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        domain text NOT NULL DEFAULT 'satnam.pub',
        is_active boolean NOT NULL DEFAULT true,
        hashed_nip05 text NOT NULL,
        hashed_npub text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    $$;
  END IF;
END $do$;

-- 1) Drop plaintext columns if they exist
DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='nip05_records' AND column_name='name'
  ) THEN
    EXECUTE 'ALTER TABLE public.nip05_records DROP COLUMN name';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='nip05_records' AND column_name='pubkey'
  ) THEN
    EXECUTE 'ALTER TABLE public.nip05_records DROP COLUMN pubkey';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='nip05_records' AND column_name='hashed_name'
  ) THEN
    EXECUTE 'ALTER TABLE public.nip05_records DROP COLUMN hashed_name';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='nip05_records' AND column_name='user_salt'
  ) THEN
    EXECUTE 'ALTER TABLE public.nip05_records DROP COLUMN user_salt';
  END IF;
END $do$;

-- 2) Ensure hashed columns exist
ALTER TABLE public.nip05_records
  ADD COLUMN IF NOT EXISTS hashed_nip05 text NOT NULL,
  ADD COLUMN IF NOT EXISTS hashed_npub text NOT NULL;

-- 3) Ensure domain/is_active columns exist (and defaults)
ALTER TABLE public.nip05_records
  ADD COLUMN IF NOT EXISTS domain text NOT NULL DEFAULT 'satnam.pub',
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 4) Indexes for fast lookup
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='nip05_records' AND indexname='uq_nip05_records_hnip05'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX uq_nip05_records_hnip05 ON public.nip05_records (domain, hashed_nip05)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='nip05_records' AND indexname='idx_nip05_records_hnpub'
  ) THEN
    EXECUTE 'CREATE INDEX idx_nip05_records_hnpub ON public.nip05_records (hashed_npub)';
  END IF;
END $do$;

-- 5) RLS policies (anon INSERT with hashed-only fields; no plaintext leakage)
ALTER TABLE public.nip05_records ENABLE ROW LEVEL SECURITY;

-- Clean existing conflicting policies
DO $do$
BEGIN
  PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='nip05_records' AND policyname='anon_insert_nip05_records';
  IF FOUND THEN EXECUTE 'DROP POLICY anon_insert_nip05_records ON public.nip05_records'; END IF;
  PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='nip05_records' AND policyname='anon_select_nip05_records';
  IF FOUND THEN EXECUTE 'DROP POLICY anon_select_nip05_records ON public.nip05_records'; END IF;
END $do$;

-- Grant minimal privileges (RLS governs row access)
GRANT USAGE ON SCHEMA public TO anon;
GRANT INSERT, SELECT ON TABLE public.nip05_records TO anon;

-- Allow anon INSERT if hashed fields are present and domain is allowed
CREATE POLICY anon_insert_nip05_records ON public.nip05_records
  FOR INSERT TO anon
  WITH CHECK (
    COALESCE(hashed_nip05,'') <> ''
    AND COALESCE(hashed_npub,'') <> ''
    AND domain IN ('satnam.pub','www.satnam.pub')
  );

-- Allow anon SELECT only on hashed fields (no sensitive leakage)
-- Note: Clients should not need SELECT; provided for availability checks if needed
CREATE POLICY anon_select_nip05_records ON public.nip05_records
  FOR SELECT TO anon
  USING (is_active = true);

-- 6) Supabase Storage: create private bucket 'nip05-artifacts' and policies
-- Note: Requires Supabase storage extension; commands may need service role privileges
DO $do$
BEGIN
  -- Create bucket if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'nip05-artifacts'
  ) THEN
    INSERT INTO storage.buckets (id, name, public) VALUES ('nip05-artifacts', 'nip05-artifacts', false);
  END IF;
END $do$;

-- Storage policies (idempotent drops)
DO $do$
BEGIN
  PERFORM 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='anon_insert_nip05_artifacts';
  IF FOUND THEN EXECUTE 'DROP POLICY anon_insert_nip05_artifacts ON storage.objects'; END IF;
  PERFORM 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='anon_select_nip05_artifacts';
  IF FOUND THEN EXECUTE 'DROP POLICY anon_select_nip05_artifacts ON storage.objects'; END IF;
END $do$;

-- Allow anon INSERT (upload) only to nip05-artifacts bucket and specific JSON path pattern
CREATE POLICY anon_insert_nip05_artifacts ON storage.objects
  FOR INSERT TO anon
  WITH CHECK (
    bucket_id = 'nip05-artifacts'
    AND (position('nip05_artifacts/satnam.pub/' in COALESCE(name,'')) = 1)
    AND right(COALESCE(name,''), 5) = '.json'
  );

-- Allow anon SELECT (download) only from nip05-artifacts bucket and specific JSON path pattern
CREATE POLICY anon_select_nip05_artifacts ON storage.objects
  FOR SELECT TO anon
  USING (
    bucket_id = 'nip05-artifacts'
    AND (position('nip05_artifacts/satnam.pub/' in COALESCE(name,'')) = 1)
    AND right(COALESCE(name,''), 5) = '.json'
  );

COMMIT;

-- Verification
SELECT id, name, public FROM storage.buckets WHERE id = 'nip05-artifacts';

SELECT policyname, schemaname, tablename, cmd, roles
FROM pg_policies
WHERE schemaname IN ('public','storage') AND tablename IN ('nip05_records','objects');

SELECT * FROM storage.objects WHERE bucket_id = 'nip05-artifacts' LIMIT 1;
