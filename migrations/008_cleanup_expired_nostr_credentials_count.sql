-- =============================================
-- Credential Cleanup: Non-breaking deployment (Option A)
-- - Keeps existing cleanup_expired_nostr_credentials() (any signature)
-- - Creates minimal table & indexes if missing
-- - Adds count-returning variant: cleanup_expired_nostr_credentials_count()
--   Returns INTEGER = number of deleted rows
-- =============================================

SET search_path = public;

-- 1) Minimal credentials table (no-op if already present)
CREATE TABLE IF NOT EXISTS public.secure_nostr_credentials (
  id BIGSERIAL PRIMARY KEY,
  user_duid TEXT,
  credential_id TEXT UNIQUE,
  encrypted_payload TEXT,
  is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1a) Column safety (no-op if already present)
ALTER TABLE public.secure_nostr_credentials
  ADD COLUMN IF NOT EXISTS is_revoked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.secure_nostr_credentials
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours';

-- 2) Indices using dynamic EXECUTE inside DO blocks
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i'
      AND c.relname = 'idx_secure_nostr_credentials_expires_at'
      AND n.nspname = 'public'
  ) THEN
    EXECUTE 'CREATE INDEX idx_secure_nostr_credentials_expires_at ON public.secure_nostr_credentials (expires_at)';
  END IF;
END
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i'
      AND c.relname = 'idx_secure_nostr_credentials_expired_or_revoked'
      AND n.nspname = 'public'
  ) THEN
    EXECUTE 'CREATE INDEX idx_secure_nostr_credentials_expired_or_revoked ON public.secure_nostr_credentials (expires_at, is_revoked)';
  END IF;
END
$$ LANGUAGE plpgsql;

-- 3) Non-breaking count variant (create only if missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'cleanup_expired_nostr_credentials_count'
      AND p.pronargs = 0
  ) THEN
    EXECUTE $def$
      CREATE FUNCTION public.cleanup_expired_nostr_credentials_count()
      RETURNS INTEGER
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $fn$
      DECLARE
        deleted_count INTEGER := 0;
      BEGIN
        DELETE FROM public.secure_nostr_credentials
        WHERE (expires_at IS NOT NULL AND expires_at < NOW())
           OR is_revoked = TRUE;

        GET DIAGNOSTICS deleted_count = ROW_COUNT;
        RETURN deleted_count;
      END;
      $fn$;
    $def$;
  END IF;
END
$$ LANGUAGE plpgsql;

-- 4) Permissions: tighten and grant execute to anon/authenticated
DO $$
BEGIN
  -- Revoke from PUBLIC if function exists
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'cleanup_expired_nostr_credentials_count'
      AND p.pronargs = 0
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.cleanup_expired_nostr_credentials_count() FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.cleanup_expired_nostr_credentials_count() TO anon, authenticated';
  END IF;
END
$$ LANGUAGE plpgsql;

-- Optional manual test:
-- SELECT public.cleanup_expired_nostr_credentials_count();

