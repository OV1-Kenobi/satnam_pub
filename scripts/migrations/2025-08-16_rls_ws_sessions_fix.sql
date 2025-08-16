-- RLS fix for WebSocket/persistent session token storage
-- Goal: allow anon role to INSERT session rows required for WebSocket/persistent auth flows
-- while preventing enumeration or broad read access.

BEGIN;

-- 1) messaging_sessions: permit anon INSERT with strict, minimal surface
DO $do$
BEGIN
  IF to_regclass('public.messaging_sessions') IS NOT NULL THEN
    -- Enable RLS
    EXECUTE 'ALTER TABLE public.messaging_sessions ENABLE ROW LEVEL SECURITY';

    -- Drop conflicting policies if they exist
    IF EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='messaging_sessions' AND policyname='messaging_sessions_anon_insert'
    ) THEN
      EXECUTE 'DROP POLICY messaging_sessions_anon_insert ON public.messaging_sessions';
    END IF;

    -- Create anon INSERT policy (no read permissions granted here)
    EXECUTE $$
      CREATE POLICY messaging_sessions_anon_insert ON public.messaging_sessions
      FOR INSERT TO anon
      WITH CHECK (
        COALESCE(session_id,'') <> ''
        AND COALESCE(user_hash,'') <> ''
        AND expires_at > NOW()
      )
    $$;
  END IF;
END $do$;

-- 2) privacy_sessions: permit anon INSERT if used by auth/session layer
DO $do$
BEGIN
  IF to_regclass('public.privacy_sessions') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.privacy_sessions ENABLE ROW LEVEL SECURITY';

    IF EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='privacy_sessions' AND policyname='privacy_sessions_anon_insert'
    ) THEN
      EXECUTE 'DROP POLICY privacy_sessions_anon_insert ON public.privacy_sessions';
    END IF;

    EXECUTE $$
      CREATE POLICY privacy_sessions_anon_insert ON public.privacy_sessions
      FOR INSERT TO anon
      WITH CHECK (
        COALESCE(session_id,'') <> ''
        AND COALESCE(user_hash,'') <> ''
        AND expires_at > NOW()
        AND is_valid = true
      )
    $$;
  END IF;
END $do$;

-- 3) onboarding_sessions: ensure anon INSERT is allowed (already handled in 003 migration)
-- No changes here unless table exists without policy

COMMIT;

-- Verification queries
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE (schemaname='public' AND tablename IN ('messaging_sessions','privacy_sessions'))
ORDER BY tablename, policyname;

