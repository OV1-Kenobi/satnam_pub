-- 026_user_signing_prefs_fix.sql
-- Idempotent migration to align user_signing_preferences with application expectations
-- Safe to run multiple times

BEGIN;

-- 1) Ensure table exists (privacy-first owner_hash model)
CREATE TABLE IF NOT EXISTS public.user_signing_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_hash TEXT NOT NULL,

  -- Method preferences
  preferred_method TEXT NOT NULL DEFAULT 'session' CHECK (preferred_method IN ('session','nip07','nfc')),
  fallback_method  TEXT CHECK (fallback_method IN ('session','nip07','nfc')),

  -- UX preferences
  auto_fallback BOOLEAN NOT NULL DEFAULT true,
  show_security_warnings BOOLEAN NOT NULL DEFAULT true,
  remember_choice BOOLEAN NOT NULL DEFAULT true,

  -- Session preferences (keep lifetime CHECK as-is: 'timed' | 'browser_session')
  session_duration_minutes INTEGER NOT NULL DEFAULT 15 CHECK (session_duration_minutes BETWEEN 1 AND 1440),
  session_lifetime_mode    TEXT    NOT NULL DEFAULT 'timed' CHECK (session_lifetime_mode IN ('timed','browser_session')),
  auto_extend_session      BOOLEAN NOT NULL DEFAULT false,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_method TEXT,
  last_used_at TIMESTAMPTZ,

  UNIQUE(owner_hash)
);

-- 2) Add missing columns expected by the application (idempotent)
ALTER TABLE public.user_signing_preferences
  ADD COLUMN IF NOT EXISTS max_operations_per_session INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS nip07_auto_approve BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nfc_pin_timeout_seconds INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS nfc_require_confirmation BOOLEAN NOT NULL DEFAULT true;

-- 2a) Ensure CHECK constraints on newly added columns (only if not already present)
DO $$
BEGIN
  -- Add/ensure CHECK for max_operations_per_session range
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'user_signing_preferences'
      AND c.conname = 'chk_user_signing_prefs_max_ops'
  ) THEN
    ALTER TABLE public.user_signing_preferences
      ADD CONSTRAINT chk_user_signing_prefs_max_ops
      CHECK (max_operations_per_session BETWEEN 1 AND 1000);
  END IF;

  -- Add/ensure CHECK for nfc_pin_timeout_seconds range
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'user_signing_preferences'
      AND c.conname = 'chk_user_signing_prefs_nfc_timeout'
  ) THEN
    ALTER TABLE public.user_signing_preferences
      ADD CONSTRAINT chk_user_signing_prefs_nfc_timeout
      CHECK (nfc_pin_timeout_seconds BETWEEN 5 AND 300);
  END IF;
END $$;

-- 3) Indexes for performance (idempotent)
CREATE INDEX IF NOT EXISTS idx_user_signing_preferences_owner_hash ON public.user_signing_preferences(owner_hash);
CREATE INDEX IF NOT EXISTS idx_user_signing_preferences_preferred_method ON public.user_signing_preferences(preferred_method);
CREATE INDEX IF NOT EXISTS idx_user_signing_preferences_updated_at ON public.user_signing_preferences(updated_at DESC);

-- 4) RLS enablement and policies (owner_hash-based)
ALTER TABLE public.user_signing_preferences ENABLE ROW LEVEL SECURITY;

-- Helper wrapper function to set app.current_user_hash safely via RPC
CREATE OR REPLACE FUNCTION public.set_app_current_user_hash(val text)
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.current_user_hash', COALESCE(val, ''), true);
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

GRANT EXECUTE ON FUNCTION public.set_app_current_user_hash(text) TO authenticated, anon;

-- Helper: resolve current user's owner_hash from either request JWT or app.current_user_hash GUC
-- Policies use COALESCE(current_setting('app.current_user_hash', true), (current_setting('request.jwt.claims', true)::json ->> 'hashedId'))

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'user_signing_preferences'
      AND policyname = 'usp_select_owner_hash'
  ) THEN
    EXECUTE 'CREATE POLICY usp_select_owner_hash ON public.user_signing_preferences
      FOR SELECT USING (
        owner_hash = COALESCE(
          NULLIF(current_setting(''app.current_user_hash'', true), ''''),
          (current_setting(''request.jwt.claims'', true)::json ->> ''hashedId'')
        )
      )';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'user_signing_preferences'
      AND policyname = 'usp_insert_owner_hash'
  ) THEN
    EXECUTE 'CREATE POLICY usp_insert_owner_hash ON public.user_signing_preferences
      FOR INSERT WITH CHECK (
        owner_hash = COALESCE(
          NULLIF(current_setting(''app.current_user_hash'', true), ''''),
          (current_setting(''request.jwt.claims'', true)::json ->> ''hashedId'')
        )
      )';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'user_signing_preferences'
      AND policyname = 'usp_update_owner_hash'
  ) THEN
    EXECUTE 'CREATE POLICY usp_update_owner_hash ON public.user_signing_preferences
      FOR UPDATE USING (
        owner_hash = COALESCE(
          NULLIF(current_setting(''app.current_user_hash'', true), ''''),
          (current_setting(''request.jwt.claims'', true)::json ->> ''hashedId'')
        )
      ) WITH CHECK (
        owner_hash = COALESCE(
          NULLIF(current_setting(''app.current_user_hash'', true), ''''),
          (current_setting(''request.jwt.claims'', true)::json ->> ''hashedId'')
        )
      )';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'user_signing_preferences'
      AND policyname = 'usp_delete_owner_hash'
  ) THEN
    EXECUTE 'CREATE POLICY usp_delete_owner_hash ON public.user_signing_preferences
      FOR DELETE USING (
        owner_hash = COALESCE(
          NULLIF(current_setting(''app.current_user_hash'', true), ''''),
          (current_setting(''request.jwt.claims'', true)::json ->> ''hashedId'')
        )
      )';
  END IF;
END $$;

-- 5) Updated-at trigger (idempotent)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_user_signing_prefs_updated_at'
  ) THEN
    EXECUTE 'CREATE TRIGGER trg_user_signing_prefs_updated_at
      BEFORE UPDATE ON public.user_signing_preferences
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()';
  END IF;
END $$;

-- 6) Upsert RPC to create/update preferences in a single secure transaction (RLS-friendly)
CREATE OR REPLACE FUNCTION public.upsert_user_signing_preferences(
  p_owner_hash text,
  p_preferred_method text DEFAULT 'session',
  p_fallback_method  text DEFAULT 'nip07',
  p_auto_fallback boolean DEFAULT true,
  p_show_security_warnings boolean DEFAULT true,
  p_remember_choice boolean DEFAULT true,
  p_session_duration_minutes integer DEFAULT 15,
  p_max_operations_per_session integer DEFAULT 50,
  p_nip07_auto_approve boolean DEFAULT false,
  p_nfc_pin_timeout_seconds integer DEFAULT 30,
  p_nfc_require_confirmation boolean DEFAULT true,
  p_session_lifetime_mode text DEFAULT 'timed'
)
RETURNS public.user_signing_preferences
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_owner text;
  v_row public.user_signing_preferences;
BEGIN
  PERFORM set_config('app.current_user_hash', COALESCE(p_owner_hash, ''), true);
  v_owner := COALESCE(
    NULLIF(current_setting('app.current_user_hash', true), ''),
    (current_setting('request.jwt.claims', true)::json ->> 'hashedId')
  );

  IF v_owner IS NULL OR v_owner = '' THEN
    RAISE EXCEPTION 'Missing owner hash context' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.user_signing_preferences (
    owner_hash,
    preferred_method,
    fallback_method,
    auto_fallback,
    show_security_warnings,
    remember_choice,
    session_duration_minutes,
    max_operations_per_session,
    nip07_auto_approve,
    nfc_pin_timeout_seconds,
    nfc_require_confirmation,
    session_lifetime_mode
  ) VALUES (
    v_owner,
    p_preferred_method,
    p_fallback_method,
    p_auto_fallback,
    p_show_security_warnings,
    p_remember_choice,
    p_session_duration_minutes,
    p_max_operations_per_session,
    p_nip07_auto_approve,
    p_nfc_pin_timeout_seconds,
    p_nfc_require_confirmation,
    p_session_lifetime_mode
  )
  ON CONFLICT (owner_hash) DO UPDATE SET
    preferred_method = EXCLUDED.preferred_method,
    fallback_method = EXCLUDED.fallback_method,
    auto_fallback = EXCLUDED.auto_fallback,
    show_security_warnings = EXCLUDED.show_security_warnings,
    remember_choice = EXCLUDED.remember_choice,
    session_duration_minutes = EXCLUDED.session_duration_minutes,
    max_operations_per_session = EXCLUDED.max_operations_per_session,
    nip07_auto_approve = EXCLUDED.nip07_auto_approve,
    nfc_pin_timeout_seconds = EXCLUDED.nfc_pin_timeout_seconds,
    nfc_require_confirmation = EXCLUDED.nfc_require_confirmation,
    session_lifetime_mode = EXCLUDED.session_lifetime_mode,
    updated_at = now()
  WHERE public.user_signing_preferences.owner_hash = v_owner
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_user_signing_preferences(
  text, text, text, boolean, boolean, boolean, integer, integer, boolean, integer, boolean, text
) TO authenticated, anon;

COMMIT;

