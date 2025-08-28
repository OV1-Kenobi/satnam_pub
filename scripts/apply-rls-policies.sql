-- Quick RLS Policy Application for Rate Limiting Fix
-- Run this in Supabase SQL Editor to enable anon access to rate limiting tables

-- Enable RLS and add anon INSERT policies for rate limiting tables
DO $$
BEGIN
  -- rate_limits table
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'rate_limits') THEN
    -- Enable RLS
    ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.rate_limits FORCE ROW LEVEL SECURITY;
    
    -- Allow anon INSERT for rate limiting
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE schemaname = 'public' AND tablename = 'rate_limits' AND policyname = 'anon_insert_policy'
    ) THEN
      CREATE POLICY anon_insert_policy ON public.rate_limits
        AS PERMISSIVE FOR INSERT TO anon
        WITH CHECK (true);
    END IF;
    
    -- Allow anon SELECT for rate limit checking
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE schemaname = 'public' AND tablename = 'rate_limits' AND policyname = 'anon_select_policy'
    ) THEN
      CREATE POLICY anon_select_policy ON public.rate_limits
        AS PERMISSIVE FOR SELECT TO anon
        USING (true);
    END IF;
    
    RAISE NOTICE 'RLS policies applied to rate_limits table';
  END IF;

  -- auth_rate_limits table
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'auth_rate_limits') THEN
    -- Enable RLS
    ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.auth_rate_limits FORCE ROW LEVEL SECURITY;
    
    -- Allow anon INSERT for rate limiting
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE schemaname = 'public' AND tablename = 'auth_rate_limits' AND policyname = 'anon_insert_policy'
    ) THEN
      CREATE POLICY anon_insert_policy ON public.auth_rate_limits
        AS PERMISSIVE FOR INSERT TO anon
        WITH CHECK (true);
    END IF;
    
    -- Allow anon SELECT for rate limit checking
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE schemaname = 'public' AND tablename = 'auth_rate_limits' AND policyname = 'anon_select_policy'
    ) THEN
      CREATE POLICY anon_select_policy ON public.auth_rate_limits
        AS PERMISSIVE FOR SELECT TO anon
        USING (true);
    END IF;
    
    RAISE NOTICE 'RLS policies applied to auth_rate_limits table';
  END IF;
END $$;

-- Verify the policies were created
SELECT 
  schemaname, 
  tablename, 
  policyname, 
  permissive, 
  roles, 
  cmd
FROM pg_policies 
WHERE schemaname = 'public' 
  AND tablename IN ('rate_limits', 'auth_rate_limits')
ORDER BY tablename, policyname;
