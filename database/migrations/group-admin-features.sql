-- group-admin-features.sql
-- Idempotent migration for group administration features
-- NOTE: Review RLS policy joins to privacy_users to ensure the column names (user_id, hashed_uuid) match your schema.

BEGIN;

-- 1) privacy_groups: add admin_hash, description, avatar_url
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='privacy_groups' AND column_name='admin_hash'
  ) THEN
    ALTER TABLE privacy_groups ADD COLUMN admin_hash TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='privacy_groups' AND column_name='description'
  ) THEN
    ALTER TABLE privacy_groups ADD COLUMN description TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='privacy_groups' AND column_name='avatar_url'
  ) THEN
    ALTER TABLE privacy_groups ADD COLUMN avatar_url TEXT;
  END IF;
END$$;

-- 2) privacy_group_members: add is_admin
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='privacy_group_members' AND column_name='is_admin'
  ) THEN
    ALTER TABLE privacy_group_members ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END$$;

-- 3) privacy_group_topics table
CREATE TABLE IF NOT EXISTS privacy_group_topics (
  id BIGSERIAL PRIMARY KEY,
  group_session_id TEXT NOT NULL,
  topic_name TEXT NOT NULL,
  description TEXT,
  created_by_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4) Indexes (use dynamic EXECUTE inside DO blocks)
DO $$
BEGIN
  -- Ensure target column exists just before creating index
  BEGIN
    PERFORM 1 FROM information_schema.columns WHERE table_name='privacy_group_members' AND column_name='group_session_id';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_privacy_group_members_group ON privacy_group_members(group_session_id)';
  EXCEPTION WHEN OTHERS THEN
    -- ignore
  END;

  BEGIN
    PERFORM 1 FROM information_schema.columns WHERE table_name='privacy_group_members' AND column_name='member_hash';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_privacy_group_members_group_member ON privacy_group_members(group_session_id, member_hash)';
  EXCEPTION WHEN OTHERS THEN
  END;

  BEGIN
    PERFORM 1 FROM information_schema.columns WHERE table_name='privacy_group_topics' AND column_name='group_session_id';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_privacy_group_topics_group ON privacy_group_topics(group_session_id)';
  EXCEPTION WHEN OTHERS THEN
  END;
END$$;

-- 5) Enable RLS on new table
ALTER TABLE privacy_group_topics ENABLE ROW LEVEL SECURITY;

-- 6) RLS Policies for public.privacy_group_topics
-- Helper policies: members can SELECT; admins can INSERT/UPDATE/DELETE

DO $$
DECLARE
  has_select boolean;
  has_ins boolean;
  has_upd boolean;
  has_del boolean;
  user_col text; -- detects whether privacy_users uses user_id or auth_user_id
BEGIN
  -- Resolve privacy_users auth column name dynamically for Supabase compatibility
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='privacy_users' AND column_name='user_id'
    ) THEN 'user_id'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='privacy_users' AND column_name='auth_user_id'
    ) THEN 'auth_user_id'
    ELSE NULL
  END INTO user_col;

  -- SELECT policy
  SELECT EXISTS(
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'privacy_group_topics' AND policyname = 'topics_member_select'
  ) INTO has_select;

  IF NOT has_select THEN
    IF user_col IS NULL THEN
      EXECUTE 'CREATE POLICY "topics_member_select" ON public.privacy_group_topics FOR SELECT TO authenticated USING (false)';
    ELSE
      EXECUTE format(
        'CREATE POLICY "topics_member_select" ON public.privacy_group_topics
           FOR SELECT
           TO authenticated
           USING (
             EXISTS (
               SELECT 1 FROM public.privacy_group_members m
               JOIN public.privacy_users pu ON pu.hashed_uuid = m.member_hash
               WHERE m.group_session_id = public.privacy_group_topics.group_session_id
                 AND pu.%1$I = (SELECT auth.uid())
             )
           )',
        user_col
      );
    END IF;
  END IF;

  -- INSERT policy
  SELECT EXISTS(
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'privacy_group_topics' AND policyname = 'topics_admin_insert'
  ) INTO has_ins;

  IF NOT has_ins THEN
    IF user_col IS NULL THEN
      EXECUTE 'CREATE POLICY "topics_admin_insert" ON public.privacy_group_topics FOR INSERT TO authenticated WITH CHECK (false)';
    ELSE
      EXECUTE format(
        'CREATE POLICY "topics_admin_insert" ON public.privacy_group_topics
           FOR INSERT
           TO authenticated
           WITH CHECK (
             EXISTS (
               SELECT 1 FROM public.privacy_group_members m
               JOIN public.privacy_users pu ON pu.hashed_uuid = m.member_hash
               WHERE m.group_session_id = public.privacy_group_topics.group_session_id
                 AND pu.%1$I = (SELECT auth.uid())
                 AND (m.is_admin = TRUE OR lower(coalesce(m.role, '''')) IN (''owner'',''admin''))
             )
           )',
        user_col
      );
    END IF;
  END IF;

  -- UPDATE policy
  SELECT EXISTS(
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'privacy_group_topics' AND policyname = 'topics_admin_update'
  ) INTO has_upd;

  IF NOT has_upd THEN
    IF user_col IS NULL THEN
      EXECUTE 'CREATE POLICY "topics_admin_update" ON public.privacy_group_topics FOR UPDATE TO authenticated USING (false) WITH CHECK (false)';
    ELSE
      EXECUTE format(
        'CREATE POLICY "topics_admin_update" ON public.privacy_group_topics
           FOR UPDATE
           TO authenticated
           USING (
             EXISTS (
               SELECT 1 FROM public.privacy_group_members m
               JOIN public.privacy_users pu ON pu.hashed_uuid = m.member_hash
               WHERE m.group_session_id = public.privacy_group_topics.group_session_id
                 AND pu.%1$I = (SELECT auth.uid())
                 AND (m.is_admin = TRUE OR lower(coalesce(m.role, '''')) IN (''owner'',''admin''))
             )
           )
           WITH CHECK (
             EXISTS (
               SELECT 1 FROM public.privacy_group_members m2
               JOIN public.privacy_users pu2 ON pu2.hashed_uuid = m2.member_hash
               WHERE m2.group_session_id = public.privacy_group_topics.group_session_id
                 AND pu2.%1$I = (SELECT auth.uid())
                 AND (m2.is_admin = TRUE OR lower(coalesce(m2.role, '''')) IN (''owner'',''admin''))
             )
           )',
        user_col
      );
    END IF;
  END IF;

  -- DELETE policy
  SELECT EXISTS(
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'privacy_group_topics' AND policyname = 'topics_admin_delete'
  ) INTO has_del;

  IF NOT has_del THEN
    IF user_col IS NULL THEN
      EXECUTE 'CREATE POLICY "topics_admin_delete" ON public.privacy_group_topics FOR DELETE TO authenticated USING (false)';
    ELSE
      EXECUTE format(
        'CREATE POLICY "topics_admin_delete" ON public.privacy_group_topics
           FOR DELETE
           TO authenticated
           USING (
             EXISTS (
               SELECT 1 FROM public.privacy_group_members m
               JOIN public.privacy_users pu ON pu.hashed_uuid = m.member_hash
               WHERE m.group_session_id = public.privacy_group_topics.group_session_id
                 AND pu.%1$I = (SELECT auth.uid())
                 AND (m.is_admin = TRUE OR lower(coalesce(m.role, '''')) IN (''owner'',''admin''))
             )
           )',
        user_col
      );
    END IF;
  END IF;

END;
$$ LANGUAGE plpgsql;

COMMIT;

