-- database/migrations/add_key_rotation_system.sql
-- Idempotent migration for Nostr Key Rotation & Identity Migration system
-- Aligns with privacy-first architecture; stores no raw secrets; audit-focused

BEGIN;

-- key_rotation_events: audit log and orchestration state for rotations
CREATE TABLE IF NOT EXISTS public.key_rotation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_duid TEXT NOT NULL, -- matches auth.uid() / user_identities.id
  rotation_id TEXT NOT NULL, -- client/server correlation id
  old_npub TEXT NOT NULL,
  new_npub TEXT NOT NULL,
  nip05_action TEXT CHECK (nip05_action IN ('keep','create')),
  nip05_identifier TEXT,
  lightning_action TEXT CHECK (lightning_action IN ('keep','create')),
  lightning_address TEXT,
  ceps_event_ids JSONB DEFAULT '[]'::jsonb, -- stores published event ids (delegation, kind:0, notices)
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','rolled_back','failed')),
  error_reason TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- identity_key_links: continuity map old→new keys for discovery/UX
CREATE TABLE IF NOT EXISTS public.identity_key_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_duid TEXT NOT NULL,
  old_npub TEXT NOT NULL,
  new_npub TEXT NOT NULL,
  linked_at TIMESTAMPTZ DEFAULT now(),
  note TEXT
);

-- nip05_history: record of identifier decisions over time
CREATE TABLE IF NOT EXISTS public.nip05_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_duid TEXT NOT NULL,
  identifier TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('keep','create','remove')),
  effective_at TIMESTAMPTZ DEFAULT now(),
  reason TEXT
);

-- lightning_address_history: record of LA decisions over time
CREATE TABLE IF NOT EXISTS public.lightning_address_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_duid TEXT NOT NULL,
  lightning_address TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('keep','create','remove')),
  effective_at TIMESTAMPTZ DEFAULT now(),
  reason TEXT
);

-- Indexes (idempotent) using dynamic EXECUTE
DO $$
BEGIN
  -- key_rotation_events indexes
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_key_rotation_events_user_duid'
  ) THEN
    EXECUTE 'CREATE INDEX idx_key_rotation_events_user_duid ON public.key_rotation_events(user_duid)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='uniq_key_rotation_events_rotation_id'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX uniq_key_rotation_events_rotation_id ON public.key_rotation_events(rotation_id)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_key_rotation_events_status'
  ) THEN
    EXECUTE 'CREATE INDEX idx_key_rotation_events_status ON public.key_rotation_events(status)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_key_rotation_events_started_at_desc'
  ) THEN
    EXECUTE 'CREATE INDEX idx_key_rotation_events_started_at_desc ON public.key_rotation_events(started_at DESC)';
  END IF;

  -- identity_key_links indexes
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_identity_key_links_user_duid'
  ) THEN
    EXECUTE 'CREATE INDEX idx_identity_key_links_user_duid ON public.identity_key_links(user_duid)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_identity_key_links_old_npub'
  ) THEN
    EXECUTE 'CREATE INDEX idx_identity_key_links_old_npub ON public.identity_key_links(old_npub)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_identity_key_links_new_npub'
  ) THEN
    EXECUTE 'CREATE INDEX idx_identity_key_links_new_npub ON public.identity_key_links(new_npub)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='uniq_identity_key_links_triplet'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX uniq_identity_key_links_triplet ON public.identity_key_links(user_duid, old_npub, new_npub)';
  END IF;

  -- nip05_history indexes
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_nip05_history_user_duid'
  ) THEN
    EXECUTE 'CREATE INDEX idx_nip05_history_user_duid ON public.nip05_history(user_duid)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_nip05_history_effective_at_desc'
  ) THEN
    EXECUTE 'CREATE INDEX idx_nip05_history_effective_at_desc ON public.nip05_history(effective_at DESC)';
  END IF;

  -- lightning_address_history indexes
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_lightning_address_history_user_duid'
  ) THEN
    EXECUTE 'CREATE INDEX idx_lightning_address_history_user_duid ON public.lightning_address_history(user_duid)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_lightning_address_history_effective_at_desc'
  ) THEN
    EXECUTE 'CREATE INDEX idx_lightning_address_history_effective_at_desc ON public.lightning_address_history(effective_at DESC)';
  END IF;
END $$;

-- RLS Policies: enable and (re)create minimal principle policies
ALTER TABLE public.key_rotation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.identity_key_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nip05_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lightning_address_history ENABLE ROW LEVEL SECURITY;

-- Drop existing policies safely before recreating
DO $$
DECLARE
  _p TEXT;
BEGIN
  FOR _p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='key_rotation_events' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.key_rotation_events', _p);
  END LOOP;
  FOR _p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='identity_key_links' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.identity_key_links', _p);
  END LOOP;
  FOR _p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='nip05_history' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.nip05_history', _p);
  END LOOP;
  FOR _p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='lightning_address_history' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.lightning_address_history', _p);
  END LOOP;
END $$;

-- key_rotation_events
CREATE POLICY key_rotation_events_select_self ON public.key_rotation_events
  FOR SELECT USING (user_duid = auth.uid()::text);
CREATE POLICY key_rotation_events_insert_self ON public.key_rotation_events
  FOR INSERT WITH CHECK (user_duid = auth.uid()::text);
CREATE POLICY key_rotation_events_update_self ON public.key_rotation_events
  FOR UPDATE USING (user_duid = auth.uid()::text) WITH CHECK (user_duid = auth.uid()::text);

-- identity_key_links
CREATE POLICY identity_key_links_select_self ON public.identity_key_links
  FOR SELECT USING (user_duid = auth.uid()::text);
CREATE POLICY identity_key_links_insert_self ON public.identity_key_links
  FOR INSERT WITH CHECK (user_duid = auth.uid()::text);
CREATE POLICY identity_key_links_update_self ON public.identity_key_links
  FOR UPDATE USING (user_duid = auth.uid()::text) WITH CHECK (user_duid = auth.uid()::text);

-- nip05_history
CREATE POLICY nip05_history_select_self ON public.nip05_history
  FOR SELECT USING (user_duid = auth.uid()::text);
CREATE POLICY nip05_history_insert_self ON public.nip05_history
  FOR INSERT WITH CHECK (user_duid = auth.uid()::text);
CREATE POLICY nip05_history_update_self ON public.nip05_history
  FOR UPDATE USING (user_duid = auth.uid()::text) WITH CHECK (user_duid = auth.uid()::text);

-- lightning_address_history
CREATE POLICY lightning_address_history_select_self ON public.lightning_address_history
  FOR SELECT USING (user_duid = auth.uid()::text);
CREATE POLICY lightning_address_history_insert_self ON public.lightning_address_history
  FOR INSERT WITH CHECK (user_duid = auth.uid()::text);
CREATE POLICY lightning_address_history_update_self ON public.lightning_address_history
  FOR UPDATE USING (user_duid = auth.uid()::text) WITH CHECK (user_duid = auth.uid()::text);

COMMIT;

-- Notes:
-- * This migration intentionally avoids custom ENUM types to remain fully idempotent.
-- * All sensitive materials (nsec, PINs, secrets) must never be stored here; only references and encrypted metadata.
-- * RLS confines access to the authenticated user via auth.uid(). Admin/DDL via service role only.

