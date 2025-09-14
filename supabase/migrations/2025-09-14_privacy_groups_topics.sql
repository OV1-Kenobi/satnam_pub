-- Idempotent migration: privacy_groups_topics table for group topics
-- Safe to run multiple times

BEGIN;

-- Ensure required extension for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Verify parent table exists (no-op if present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'privacy_groups'
  ) THEN
    RAISE NOTICE 'Table public.privacy_groups not found. Create it before topics table.';
  END IF;
END$$;

-- Create topics table if missing
CREATE TABLE IF NOT EXISTS public.privacy_groups_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_session_id TEXT NOT NULL,
  name_hash TEXT NOT NULL,
  description TEXT,
  created_by_hash TEXT,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_topics_group_session
    FOREIGN KEY (group_session_id)
    REFERENCES public.privacy_groups(session_id)
    ON DELETE CASCADE
);

-- Add minimal indexes (idempotent)
CREATE INDEX IF NOT EXISTS idx_topics_group_session ON public.privacy_groups_topics(group_session_id);
CREATE INDEX IF NOT EXISTS idx_topics_name_hash ON public.privacy_groups_topics(name_hash);

-- Update timestamp trigger (idempotent)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_topics_updated_at ON public.privacy_groups_topics;
CREATE TRIGGER trg_topics_updated_at
BEFORE UPDATE ON public.privacy_groups_topics
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS and add baseline policies
ALTER TABLE public.privacy_groups_topics ENABLE ROW LEVEL SECURITY;

-- Select policy: permissive (app enforces membership via SecureSessionManager & server-side filters)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='privacy_groups_topics' AND policyname='topics_select_all'
  ) THEN
    CREATE POLICY topics_select_all ON public.privacy_groups_topics
      FOR SELECT
      TO anon
      USING (true);
  END IF;
END$$;

-- Insert policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='privacy_groups_topics' AND policyname='topics_insert_all'
  ) THEN
    CREATE POLICY topics_insert_all ON public.privacy_groups_topics
      FOR INSERT
      TO anon
      WITH CHECK (true);
  END IF;
END$$;

-- Update policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='privacy_groups_topics' AND policyname='topics_update_all'
  ) THEN
    CREATE POLICY topics_update_all ON public.privacy_groups_topics
      FOR UPDATE
      TO anon
      USING (true)
      WITH CHECK (true);
  END IF;
END$$;

-- Delete policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='privacy_groups_topics' AND policyname='topics_delete_all'
  ) THEN
    CREATE POLICY topics_delete_all ON public.privacy_groups_topics
      FOR DELETE
      TO anon
      USING (true);
  END IF;
END$$;

COMMIT;

