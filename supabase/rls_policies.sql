-- Supabase RLS Policies - Idempotent Setup Script
-- Purpose: Enable RLS and install standardized policies for anon registration and user sovereignty
-- Safe to run multiple times. Uses conditional creation with pg_policies checks.
--
-- Access Model
-- - anon role: INSERT-only on public registration tables (user_identities)
-- - authenticated role: Full CRUD on own rows (USING/ WITH CHECK with auth.uid())
-- - service_role: Unrestricted access (explicit policy included; service_role already bypasses RLS)
--
-- Ownership Resolution Order per table (first match wins):
--   1) user_id column
--   2) owner_id column
--   3) user_duid column mapped via privacy_users(user_duid -> user_id)
--   4) default false (no access) if none found
--
-- Tables targeted (extend as needed):
--   user_identities, nip05_records, family_federations, family_members
-- Optionally include additional app tables by appending to target_tables array below.

DO $$
DECLARE
  target_tables text[] := ARRAY[
    'user_identities',
    'nip05_records',
    'family_federations',
    'family_members'
  ];
  t text;
  tbl regclass;
  schema_name text := 'public';
  has_user_id boolean;
  has_owner_id boolean;
  has_user_duid boolean;
  has_privacy_users boolean;
  owner_pred text;

  -- policy names (consistent naming)
  pol_anon_insert constant text := 'anon_insert_policy';
  pol_user_crud  constant text := 'user_crud_policy';
  pol_service    constant text := 'service_unrestricted_policy';
BEGIN
  -- Check if privacy_users table exists for DUID mapping
  SELECT to_regclass(format('%I.privacy_users', schema_name)) IS NOT NULL INTO has_privacy_users;

  FOREACH t IN ARRAY target_tables LOOP
    -- Resolve table regclass, skip if missing
    EXECUTE format('SELECT to_regclass(%L)', schema_name||'.'||t) INTO tbl;
    IF tbl IS NULL THEN
      RAISE NOTICE 'Skipping missing table: %.%', schema_name, t;
      CONTINUE;
    END IF;

    -- Enable RLS (idempotent) and force
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', tbl);

    -- Inspect ownership columns
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema=schema_name AND table_name=t AND column_name='user_id'
    ) INTO has_user_id;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema=schema_name AND table_name=t AND column_name='owner_id'
    ) INTO has_owner_id;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema=schema_name AND table_name=t AND column_name='user_duid'
    ) INTO has_user_duid;

    -- Build owner predicate text based on available columns
    IF has_user_id THEN
      owner_pred := format('(%I.%I = auth.uid())', t, 'user_id');
    ELSIF has_owner_id THEN
      owner_pred := format('(%I.%I = auth.uid())', t, 'owner_id');
    ELSIF has_user_duid AND has_privacy_users THEN
      owner_pred := format('EXISTS (SELECT 1 FROM %I.%I pu WHERE pu.%I = %I.%I AND pu.%I = auth.uid())',
                           schema_name, 'privacy_users', 'user_duid', t, 'user_duid', 'user_id');
    ELSE
      owner_pred := 'false';
    END IF;

    -- 1) anon INSERT policy (public registration tables and rate limiting)
    IF t IN ('user_identities', 'nip05_records', 'rate_limits', 'auth_rate_limits') THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies p
        WHERE p.schemaname=schema_name AND p.tablename=t AND p.policyname=pol_anon_insert
      ) THEN
        EXECUTE format('CREATE POLICY %I ON %I.%I
                        AS PERMISSIVE FOR INSERT TO anon
                        WITH CHECK (true)', pol_anon_insert, schema_name, t);
      END IF;
    END IF;

    -- 2) authenticated user CRUD on own rows (FOR ALL)
    IF owner_pred <> 'false' THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies p
        WHERE p.schemaname=schema_name AND p.tablename=t AND p.policyname=pol_user_crud
      ) THEN
        EXECUTE format('CREATE POLICY %I ON %I.%I
                        AS PERMISSIVE FOR ALL TO authenticated
                        USING (%s) WITH CHECK (%s)', pol_user_crud, schema_name, t, owner_pred, owner_pred);
      END IF;
    ELSE
      RAISE NOTICE 'Skipping user_crud_policy on %.% (no ownership column found)', schema_name, t;
    END IF;

    -- 3) service role unrestricted (explicit, though service_role bypasses RLS)
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname=schema_name AND p.tablename=t AND p.policyname=pol_service
    ) THEN
      EXECUTE format('CREATE POLICY %I ON %I.%I
                      AS PERMISSIVE FOR ALL TO service_role
                      USING (true) WITH CHECK (true)', pol_service, schema_name, t);
    END IF;

    RAISE NOTICE 'RLS configured for %.% (owner predicate: %)', schema_name, t, owner_pred;
  END LOOP;
END $$;

-- Optional: Verify resulting policies (uncomment to inspect)
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname='public'
-- ORDER BY tablename, policyname;


-- -----------------------------------------------------------------------------
-- AUTO-ENUMERATED PUBLIC TABLES RLS SETUP (Idempotent)
-- Applies the same standardized policies to ALL public tables discovered at runtime.
-- anon INSERT remains limited to user_identities only.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  rec RECORD;
  schema_name text := 'public';
  has_user_id boolean;
  has_owner_id boolean;
  has_user_duid boolean;
  has_privacy_users boolean;
  owner_pred text;

  pol_anon_insert constant text := 'anon_insert_policy';
  pol_user_crud  constant text := 'user_crud_policy';
  pol_service    constant text := 'service_unrestricted_policy';
BEGIN
  -- Check if privacy_users table exists for DUID mapping
  SELECT to_regclass(format('%I.privacy_users', schema_name)) IS NOT NULL INTO has_privacy_users;

  FOR rec IN
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = schema_name
      AND table_type = 'BASE TABLE'
  LOOP
    BEGIN
      -- Enable and force RLS (safe if already enabled)
      EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', schema_name, rec.table_name);
      EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', schema_name, rec.table_name);

      -- Inspect ownership columns
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema=schema_name AND table_name=rec.table_name AND column_name='user_id'
      ) INTO has_user_id;

      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema=schema_name AND table_name=rec.table_name AND column_name='owner_id'
      ) INTO has_owner_id;

      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema=schema_name AND table_name=rec.table_name AND column_name='user_duid'
      ) INTO has_user_duid;

      -- Build owner predicate
      IF has_user_id THEN
        owner_pred := format('(%I.%I = auth.uid())', rec.table_name, 'user_id');
      ELSIF has_owner_id THEN
        owner_pred := format('(%I.%I = auth.uid())', rec.table_name, 'owner_id');
      ELSIF has_user_duid AND has_privacy_users THEN
        owner_pred := format('EXISTS (SELECT 1 FROM %I.%I pu WHERE pu.%I = %I.%I AND pu.%I = auth.uid())',
                             schema_name, 'privacy_users', 'user_duid', rec.table_name, 'user_duid', 'user_id');
      ELSE
        owner_pred := 'false';
      END IF;

      -- anon INSERT for registration tables and rate limiting
      IF rec.table_name IN ('user_identities', 'nip05_records', 'rate_limits', 'auth_rate_limits') THEN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies p
          WHERE p.schemaname=schema_name AND p.tablename=rec.table_name AND p.policyname=pol_anon_insert
        ) THEN
          EXECUTE format('CREATE POLICY %I ON %I.%I
                          AS PERMISSIVE FOR INSERT TO anon
                          WITH CHECK (true)', pol_anon_insert, schema_name, rec.table_name);
        END IF;
      END IF;

      -- authenticated user CRUD on own rows
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies p
        WHERE p.schemaname=schema_name AND p.tablename=rec.table_name AND p.policyname=pol_user_crud
      ) THEN
        EXECUTE format('CREATE POLICY %I ON %I.%I
                        AS PERMISSIVE FOR ALL TO authenticated
                        USING (%s) WITH CHECK (%s)', pol_user_crud, schema_name, rec.table_name, owner_pred, owner_pred);
      END IF;

      -- service role unrestricted
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies p
        WHERE p.schemaname=schema_name AND p.tablename=rec.table_name AND p.policyname=pol_service
      ) THEN
        EXECUTE format('CREATE POLICY %I ON %I.%I
                        AS PERMISSIVE FOR ALL TO service_role
                        USING (true) WITH CHECK (true)', pol_service, schema_name, rec.table_name);
      END IF;

      RAISE NOTICE 'RLS configured (auto) for %.% (owner predicate: %)', schema_name, rec.table_name, owner_pred;

    EXCEPTION WHEN OTHERS THEN
      -- Do not fail the whole script if a single table has issues
      RAISE NOTICE 'Skipping table due to error: %.% -> %', schema_name, rec.table_name, SQLERRM;
      CONTINUE;
    END;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- AUTO-ENUMERATED STORAGE TABLES RLS SETUP (Idempotent)
-- Applies standardized policies to storage.* tables. Skips migration tables.
-- Owner predicate prefers a column named "owner" for storage.objects.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  rec RECORD;
  schema_name text := 'storage';
  has_user_id boolean;
  has_owner_id boolean;
  has_owner_col boolean;
  has_user_duid boolean;
  owner_pred text;

  pol_user_crud  constant text := 'user_crud_policy';
  pol_service    constant text := 'service_unrestricted_policy';
BEGIN
  FOR rec IN
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = schema_name
      AND table_type = 'BASE TABLE'
  LOOP
    -- Skip migration tables explicitly
    IF rec.table_name LIKE '%migration%' THEN
      RAISE NOTICE 'Skipping storage migration table: %.%', schema_name, rec.table_name;
      CONTINUE;
    END IF;

    BEGIN
      -- Enable and force RLS (safe if already enabled)
      EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', schema_name, rec.table_name);
      EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', schema_name, rec.table_name);

      -- Inspect ownership columns
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema=schema_name AND table_name=rec.table_name AND column_name='user_id'
      ) INTO has_user_id;

      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema=schema_name AND table_name=rec.table_name AND column_name='owner_id'
      ) INTO has_owner_id;

      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema=schema_name AND table_name=rec.table_name AND column_name='owner'
      ) INTO has_owner_col;

      -- Build owner predicate
      IF has_owner_col THEN
        owner_pred := format('(%I.%I = auth.uid())', rec.table_name, 'owner');
      ELSIF has_user_id THEN
        owner_pred := format('(%I.%I = auth.uid())', rec.table_name, 'user_id');
      ELSIF has_owner_id THEN
        owner_pred := format('(%I.%I = auth.uid())', rec.table_name, 'owner_id');
      ELSE
        owner_pred := 'false';
      END IF;

      -- authenticated user CRUD on own rows
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies p
        WHERE p.schemaname=schema_name AND p.tablename=rec.table_name AND p.policyname=pol_user_crud
      ) THEN
        EXECUTE format('CREATE POLICY %I ON %I.%I
                        AS PERMISSIVE FOR ALL TO authenticated
                        USING (%s) WITH CHECK (%s)', pol_user_crud, schema_name, rec.table_name, owner_pred, owner_pred);
      END IF;

      -- service role unrestricted
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies p
        WHERE p.schemaname=schema_name AND p.tablename=rec.table_name AND p.policyname=pol_service
      ) THEN
        EXECUTE format('CREATE POLICY %I ON %I.%I
                        AS PERMISSIVE FOR ALL TO service_role
                        USING (true) WITH CHECK (true)', pol_service, schema_name, rec.table_name);
      END IF;

      RAISE NOTICE 'RLS configured (auto) for %.% (owner predicate: %)', schema_name, rec.table_name, owner_pred;

    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipping table due to error: %.% -> %', schema_name, rec.table_name, SQLERRM;
      CONTINUE;
    END;
  END LOOP;
END $$;