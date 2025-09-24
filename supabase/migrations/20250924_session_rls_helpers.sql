-- Session RLS helpers for privacy-first owner scoping (idempotent)
-- Provides helpers to set/get app.current_user_hash GUC used by RLS policies.

CREATE OR REPLACE FUNCTION public.set_app_user_hash(p_hash text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Persist for current transaction and subsequent function calls in the session
  PERFORM set_config('app.current_user_hash', coalesce(p_hash, ''), true);
END
$$;

CREATE OR REPLACE FUNCTION public.get_app_user_hash()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT current_setting('app.current_user_hash', true)
$$;

