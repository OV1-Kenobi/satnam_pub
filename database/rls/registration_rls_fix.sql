-- =============================================================
-- Supabase RLS Policy Script (Idempotent)
-- Purpose: Fix registration INSERT failures while preserving
--          privacy-first DUID architecture and CEPS/session flows
-- =============================================================
-- Applies policies for:
--   - user_identities  (TEXT DUID primary key)
--   - nip05_records    (username reservations)
--
-- Key Features
--   1) anon INSERT on user_identities and nip05_records (registration)
--   2) anon SELECT on nip05_records (availability) and user_identities (active auth lookups)
--   3) authenticated FULL CRUD on own user_identities row
--      using either auth.uid()::text = id OR app.current_user_duid context
--   4) ownership policy for nip05_records omitted in greenfield (no hashed_* mapping)
--   5) idempotent: safe to run multiple times
-- =============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_identities'
  ) THEN
    -- Enable RLS
    EXECUTE 'ALTER TABLE public.user_identities ENABLE ROW LEVEL SECURITY';

    -- Drop existing policies (if any)
    PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_identities' AND policyname='user_identities_anon_insert';
    IF FOUND THEN EXECUTE 'DROP POLICY IF EXISTS "user_identities_anon_insert" ON public.user_identities'; END IF;

    PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_identities' AND policyname='user_identities_auth_read_active';
    IF FOUND THEN EXECUTE 'DROP POLICY IF EXISTS "user_identities_auth_read_active" ON public.user_identities'; END IF;

    PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_identities' AND policyname='user_identities_user_own_select';
    IF FOUND THEN EXECUTE 'DROP POLICY IF EXISTS "user_identities_user_own_select" ON public.user_identities'; END IF;

    PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_identities' AND policyname='user_identities_user_own_update';
    IF FOUND THEN EXECUTE 'DROP POLICY IF EXISTS "user_identities_user_own_update" ON public.user_identities'; END IF;

    PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_identities' AND policyname='user_identities_user_own_delete';
    IF FOUND THEN EXECUTE 'DROP POLICY IF EXISTS "user_identities_user_own_delete" ON public.user_identities'; END IF;

    -- 1) Allow anon role to INSERT during registration
    EXECUTE $policy$
      CREATE POLICY "user_identities_anon_insert" ON public.user_identities
        FOR INSERT
        TO anon
        WITH CHECK (true)
    $policy$;

    -- 2) Allow anon and authenticated read of active users (auth/sign-in lookup)
    EXECUTE $policy$
      CREATE POLICY "user_identities_auth_read_active" ON public.user_identities
        FOR SELECT
        TO anon, authenticated
        USING (is_active = true)
    $policy$;

    -- 3) Authenticated users: own-data SELECT (supports CEPS context variable)
    EXECUTE $policy$
      CREATE POLICY "user_identities_user_own_select" ON public.user_identities
        FOR SELECT
        TO authenticated
        USING (
          id = current_setting('app.current_user_duid', true)
          OR id = auth.uid()::text
        )
    $policy$;

    -- 4) Authenticated users: own-data UPDATE
    EXECUTE $policy$
      CREATE POLICY "user_identities_user_own_update" ON public.user_identities
        FOR UPDATE
        TO authenticated
        USING (
          id = current_setting('app.current_user_duid', true)
          OR id = auth.uid()::text
        )
        WITH CHECK (
          id = current_setting('app.current_user_duid', true)
          OR id = auth.uid()::text
        )
    $policy$;

    -- 5) Authenticated users: own-data DELETE
    EXECUTE $policy$
      CREATE POLICY "user_identities_user_own_delete" ON public.user_identities
        FOR DELETE
        TO authenticated
        USING (
          id = current_setting('app.current_user_duid', true)
          OR id = auth.uid()::text
        )
    $policy$;
  END IF;
END$$;

-- =============================================================
-- nip05_records RLS (username reservations)
-- =============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'nip05_records'
  ) THEN
    -- Enable RLS
    EXECUTE 'ALTER TABLE public.nip05_records ENABLE ROW LEVEL SECURITY';

    -- Drop existing policies (if any)
    PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='nip05_records' AND policyname='nip05_records_anon_insert';
    IF FOUND THEN EXECUTE 'DROP POLICY IF EXISTS "nip05_records_anon_insert" ON public.nip05_records'; END IF;

    PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='nip05_records' AND policyname='nip05_records_public_read';
    IF FOUND THEN EXECUTE 'DROP POLICY IF EXISTS "nip05_records_public_read" ON public.nip05_records'; END IF;

    PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='nip05_records' AND policyname='nip05_records_user_manage_own';
    IF FOUND THEN EXECUTE 'DROP POLICY IF EXISTS "nip05_records_user_manage_own" ON public.nip05_records'; END IF;

    -- 1) Allow anon INSERT during registration (reservation)
    EXECUTE $policy$
      CREATE POLICY "nip05_records_anon_insert" ON public.nip05_records
        FOR INSERT
        TO anon
        WITH CHECK (true)
    $policy$;

    -- 2) Allow anon, authenticated SELECT of active records (availability & discovery)
    EXECUTE $policy$
      CREATE POLICY "nip05_records_public_read" ON public.nip05_records
        FOR SELECT
        TO anon, authenticated
        USING (is_active = true)
    $policy$;

    -- 3) Ownership/management policy intentionally omitted for greenfield (no hashed_* mapping).
    --    Management of nip05_records is handled via service-role functions or dedicated endpoints.
  END IF;
END$$;

-- =============================================================
-- Optional: user_signing_preferences RLS (only if table exists)
-- Supports session-based signing preferences per user DUID
-- =============================================================
DO $$
DECLARE
  has_user_duid boolean := false;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_signing_preferences'
  ) THEN
    EXECUTE 'ALTER TABLE public.user_signing_preferences ENABLE ROW LEVEL SECURITY';

    -- Drop existing policy if present (idempotent)
    PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_signing_preferences' AND policyname='user_signing_prefs_user_crud';
    IF FOUND THEN EXECUTE 'DROP POLICY IF EXISTS "user_signing_prefs_user_crud" ON public.user_signing_preferences'; END IF;

    -- Only create policy if required column exists
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='user_signing_preferences' AND column_name='user_duid'
    ) INTO has_user_duid;

    IF has_user_duid THEN
      EXECUTE $policy$
        CREATE POLICY "user_signing_prefs_user_crud" ON public.user_signing_preferences
          FOR ALL
          TO authenticated
          USING (
            user_duid IS NOT NULL AND (
              (
                NULLIF(current_setting('app.current_user_duid', true), '') IS NOT NULL
                AND user_duid = current_setting('app.current_user_duid', true)
              )
              OR user_duid = auth.uid()::text
            )
          )
          WITH CHECK (
            user_duid IS NOT NULL AND (
              (
                NULLIF(current_setting('app.current_user_duid', true), '') IS NOT NULL
                AND user_duid = current_setting('app.current_user_duid', true)
              )
              OR user_duid = auth.uid()::text
            )
          )
      $policy$;
    ELSE
      RAISE NOTICE 'Skipping policy user_signing_prefs_user_crud: column "user_duid" not found on public.user_signing_preferences';
    END IF;
  END IF;
END$$;

-- =============================================================
-- Optional: Auto-populate user_duid on INSERT for user_signing_preferences
-- Allows clients to omit user_duid; it will default to auth.uid() (or CEPS context)
-- =============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='user_signing_preferences'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='user_signing_preferences' AND column_name='user_duid'
    ) THEN
      -- Create/replace trigger function (idempotent)
      EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.set_user_signing_prefs_user_duid()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $BODY$
      BEGIN
        -- Only set when missing or blank
        IF NEW.user_duid IS NULL OR NEW.user_duid = '' THEN
          NEW.user_duid := COALESCE(
            NULLIF(auth.uid()::text, ''),
            NULLIF(current_setting('app.current_user_duid', true), ''),
            NEW.user_duid
          );
        END IF;
        RETURN NEW;
      END
      $BODY$;
      $fn$;

      -- Recreate trigger to ensure latest function is used (idempotent)
      EXECUTE 'DROP TRIGGER IF EXISTS set_user_signing_prefs_user_duid_trg ON public.user_signing_preferences';
      EXECUTE $trg$
      CREATE TRIGGER set_user_signing_prefs_user_duid_trg
      BEFORE INSERT ON public.user_signing_preferences
      FOR EACH ROW
      EXECUTE FUNCTION public.set_user_signing_prefs_user_duid()
      $trg$;
    ELSE
      RAISE NOTICE 'Skipping trigger creation: column "user_duid" not found on public.user_signing_preferences';
    END IF;
  END IF;
END$$;


-- =============================================================
-- Notes:
--  - These policies are compatible with anon-key-only serverless functions.
--  - Registration remains possible without an authenticated session.
--  - Post-auth, CEPS can set app.current_user_duid for fine-grained access.
--  - If your auth.uid() does not equal DUID, CEPS context path will apply.
-- =============================================================

