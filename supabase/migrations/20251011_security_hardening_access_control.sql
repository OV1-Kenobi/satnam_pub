-- Security Hardening: Safe View and Access Control for LNbits credentials
-- Idempotent script; run after 20251011_hybrid_minimal_custody_lightning.sql
-- Creates public view without sensitive columns and tightens EXECUTE/SELECT privileges

BEGIN;

-- 1) Create/replace safe public view exposing only non-sensitive columns
CREATE OR REPLACE VIEW public.user_lightning_config_public AS
SELECT
  user_id,
  nip05_username,
  platform_ln_address,
  external_ln_address,
  lnbits_wallet_id,
  scrub_enabled,
  scrub_percent,
  created_at,
  updated_at
FROM public.user_lightning_config;

-- 2) Revoke direct SELECT on base table from anon/authenticated (view should be used instead)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_lightning_config'
  ) THEN
    EXECUTE 'REVOKE SELECT ON TABLE public.user_lightning_config FROM anon, authenticated';
  END IF;
END $$;

-- 3) Grant SELECT on safe view to authenticated (anon can remain restricted per app policy)
GRANT SELECT ON public.user_lightning_config_public TO authenticated;

-- 4) Restrict EXECUTE on encryption/decryption and proxy-data functions to service_role only
DO $$
BEGIN
  -- private.enc(text)
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'private'
      AND p.proname = 'enc'
      AND pg_get_function_identity_arguments(p.oid) = 'text'
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION private.enc(text) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION private.enc(text) TO service_role';
  END IF;

  -- private.dec(text)
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'private'
      AND p.proname = 'dec'
      AND pg_get_function_identity_arguments(p.oid) = 'text'
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION private.dec(text) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION private.dec(text) TO service_role';
  END IF;

  -- public.get_ln_proxy_data(text)
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_ln_proxy_data'
      AND pg_get_function_identity_arguments(p.oid) = 'text'
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.get_ln_proxy_data(text) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_ln_proxy_data(text) TO service_role';
  END IF;
END $$;

-- 5) Safe public RPC for current user's non-sensitive lightning config
CREATE OR REPLACE FUNCTION public.get_my_lightning_config()
RETURNS TABLE (
  user_id uuid,
  nip05_username text,
  platform_ln_address text,
  external_ln_address text,
  lnbits_wallet_id text,
  scrub_enabled boolean,
  scrub_percent integer,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_uid uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT
    u.user_id,
    u.nip05_username,
    u.platform_ln_address,
    u.external_ln_address,
    u.lnbits_wallet_id,
    u.scrub_enabled,
    u.scrub_percent,
    u.created_at,
    u.updated_at
  FROM public.user_lightning_config u
  WHERE u.user_id = v_uid
  LIMIT 1;
END;
$$;

-- Restrict EXECUTE: authenticated only (no anon, no PUBLIC, no service_role)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_my_lightning_config'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.get_my_lightning_config() FROM PUBLIC, anon, service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_my_lightning_config() TO authenticated';
  END IF;
END $$;


-- NOTE: Existing RLS policies on user_lightning_config remain unchanged

COMMIT;

