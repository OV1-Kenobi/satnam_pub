-- 028_add_nip17_nip44_support.sql
-- Idempotent migration to enable NIP-17 protocol and NIP-44 encryption support
-- Safe to run multiple times

BEGIN;

-- Helper functions
CREATE OR REPLACE FUNCTION table_exists(tbl TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name=tbl
  );
END;$$;

CREATE OR REPLACE FUNCTION column_exists(tbl TEXT, col TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name=tbl AND column_name=col
  );
END;$$;

-- 1) Ensure gift_wrapped_messages table exists
DO $$
BEGIN
  IF NOT table_exists('gift_wrapped_messages') THEN
    CREATE TABLE public.gift_wrapped_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  END IF;
END $$;

-- 2) Ensure protocol column exists and allow 'nip17'
DO $$
DECLARE
  conname TEXT;
  condef  TEXT;
BEGIN
  IF NOT column_exists('gift_wrapped_messages','protocol') THEN
    ALTER TABLE public.gift_wrapped_messages
      ADD COLUMN protocol TEXT DEFAULT 'nip59';
  END IF;

  -- Replace any existing CHECK on protocol with a canonical one that allows nip59, nip04, nip17, mls
  SELECT c.conname, pg_get_constraintdef(c.oid)
    INTO conname, condef
  FROM pg_constraint c
  JOIN pg_class t ON c.conrelid=t.oid
  JOIN pg_namespace n ON n.oid=t.relnamespace
  WHERE n.nspname='public' AND t.relname='gift_wrapped_messages' AND c.contype='c'
    AND pg_get_constraintdef(c.oid) ILIKE '%protocol%';

  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.gift_wrapped_messages DROP CONSTRAINT %I', conname);
  END IF;

  -- Add canonical CHECK constraint (ignore error if already present)
  BEGIN
    ALTER TABLE public.gift_wrapped_messages
      ADD CONSTRAINT gift_wrapped_messages_protocol_chk
      CHECK (protocol IN ('nip59','nip04','nip17','mls'));
  EXCEPTION WHEN duplicate_object THEN
    -- already present
    NULL;
  END;
END $$;

-- 3) Ensure encryption_method column exists and allow 'nip44'
DO $$
DECLARE
  conname TEXT;
  condef  TEXT;
BEGIN
  IF NOT column_exists('gift_wrapped_messages','encryption_method') THEN
    ALTER TABLE public.gift_wrapped_messages
      ADD COLUMN encryption_method TEXT DEFAULT 'gift-wrap';
  END IF;

  SELECT c.conname, pg_get_constraintdef(c.oid)
    INTO conname, condef
  FROM pg_constraint c
  JOIN pg_class t ON c.conrelid=t.oid
  JOIN pg_namespace n ON n.oid=t.relnamespace
  WHERE n.nspname='public' AND t.relname='gift_wrapped_messages' AND c.contype='c'
    AND pg_get_constraintdef(c.oid) ILIKE '%encryption_method%';

  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.gift_wrapped_messages DROP CONSTRAINT %I', conname);
  END IF;

  BEGIN
    ALTER TABLE public.gift_wrapped_messages
      ADD CONSTRAINT gift_wrapped_messages_encryption_method_chk
      CHECK (encryption_method IN ('gift-wrap','nip04','nip44'));
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

-- 4) Optional: relay inbox discovery cache for kind:10050 lookups
CREATE TABLE IF NOT EXISTS public.relay_cache (
  pubkey TEXT PRIMARY KEY,
  relays TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index to age out stale entries quickly if desired
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='relay_cache' AND indexname='relay_cache_updated_at_idx'
  ) THEN
    CREATE INDEX relay_cache_updated_at_idx ON public.relay_cache (updated_at DESC);
  END IF;
END $$;

COMMIT;

