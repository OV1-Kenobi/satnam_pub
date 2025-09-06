-- =============================================================
-- Supabase RLS Policy Script (Idempotent)
-- Purpose: Fix registration INSERT failures while preserving
--          privacy-first DUID architecture and CEPS/session flows
-- =============================================================
-- Applies policies for:
--   - user_identities  (TEXT DUID primary key, hashed columns)
--   - nip05_records    (username reservations)
--
-- Key Features
--   1) anon INSERT on user_identities and nip05_records (registration)
--   2) anon SELECT on nip05_records (availability) and user_identities (active auth lookups)
--   3) authenticated FULL CRUD on own user_identities row
--      using either auth.uid()::text = id OR app.current_user_duid context
--   4) authenticated ownership of nip05_records by hashed_npub mapping
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

    -- 3) Authenticated users manage their own NIP-05 reservations via hashed_npub match
    --    Ownership: nip05_records.hashed_npub equals user_identities.hashed_npub
    --    where the user is determined by CEPS context or auth.uid()::text
    EXECUTE $policy$
      CREATE POLICY "nip05_records_user_manage_own" ON public.nip05_records
        FOR ALL
        TO authenticated
        USING (
          EXISTS (
            SELECT 1
            FROM public.user_identities ui
            WHERE ui.hashed_npub = nip05_records.hashed_npub
              AND (
                ui.id = current_setting('app.current_user_duid', true)
                OR ui.id = auth.uid()::text
              )
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1
            FROM public.user_identities ui
            WHERE ui.hashed_npub = nip05_records.hashed_npub
              AND (
                ui.id = current_setting('app.current_user_duid', true)
                OR ui.id = auth.uid()::text
              )
          )
        )
    $policy$;
  END IF;
END$$;

-- =============================================================
-- Optional: user_signing_preferences RLS (only if table exists)
-- Supports session-based signing preferences per user DUID
-- =============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_signing_preferences'
  ) THEN
    EXECUTE 'ALTER TABLE public.user_signing_preferences ENABLE ROW LEVEL SECURITY';

    PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_signing_preferences' AND policyname='user_signing_prefs_user_crud';
    IF FOUND THEN EXECUTE 'DROP POLICY IF EXISTS "user_signing_prefs_user_crud" ON public.user_signing_preferences'; END IF;

    EXECUTE $policy$
      CREATE POLICY "user_signing_prefs_user_crud" ON public.user_signing_preferences
        FOR ALL
        TO authenticated
        USING (
          user_duid = current_setting('app.current_user_duid', true)
          OR user_duid = auth.uid()::text
        )
        WITH CHECK (
          user_duid = current_setting('app.current_user_duid', true)
          OR user_duid = auth.uid()::text
        )
    $policy$;
  END IF;
END$$;

-- =============================================================
-- Notes:
--  - These policies are compatible with anon-key-only serverless functions.
--  - Registration remains possible without an authenticated session.
--  - Post-auth, CEPS can set app.current_user_duid for fine-grained access.
--  - If your auth.uid() does not equal DUID, CEPS context path will apply.
-- =============================================================

