-- Migration: 006_nip07_auth_challenges.sql
-- Purpose: Add auth_challenges and auth_rate_limits tables for passwordless NIP-07 flow
-- Notes: Keep sensitive access via service-role; RLS enabled with restrictive defaults

-- Enable extensions if needed
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1) Challenge persistence table
CREATE TABLE IF NOT EXISTS public.auth_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  nonce TEXT NOT NULL,
  challenge TEXT NOT NULL,
  domain TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  is_used BOOLEAN NOT NULL DEFAULT FALSE,
  expected_pubkey TEXT,
  event_id TEXT
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS auth_challenges_session_nonce_idx
  ON public.auth_challenges (session_id, nonce);
CREATE INDEX IF NOT EXISTS auth_challenges_expires_at_idx
  ON public.auth_challenges (expires_at);
CREATE INDEX IF NOT EXISTS auth_challenges_is_used_idx
  ON public.auth_challenges (is_used);

-- RLS
ALTER TABLE public.auth_challenges ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'auth_challenges' AND policyname = 'auth_challenges_no_anon_access'
  ) THEN
    CREATE POLICY auth_challenges_no_anon_access ON public.auth_challenges
      FOR ALL USING (false) WITH CHECK (false);
  END IF;
END $$;

-- 2) Rate limiting table
CREATE TABLE IF NOT EXISTS public.auth_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL,           -- ip or duid/npub
  scope TEXT NOT NULL,                -- 'ip' or 'duid' or 'npub'
  window_start TIMESTAMPTZ NOT NULL,  -- start of window
  count INTEGER NOT NULL DEFAULT 0,
  last_attempt TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS auth_rate_limits_identifier_scope_idx
  ON public.auth_rate_limits (identifier, scope);
CREATE INDEX IF NOT EXISTS auth_rate_limits_window_idx
  ON public.auth_rate_limits (window_start);

ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'auth_rate_limits' AND policyname = 'auth_rate_limits_no_anon_access'
  ) THEN
    CREATE POLICY auth_rate_limits_no_anon_access ON public.auth_rate_limits
      FOR ALL USING (false) WITH CHECK (false);
  END IF;
END $$;

