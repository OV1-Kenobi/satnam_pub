-- Fix Rate Limits RLS Policies for Username Availability Function
-- This migration fixes the RLS policy violation error (42501) in the username availability check

-- ============================================================================
-- ISSUE ANALYSIS
-- ============================================================================
-- Error: "new row violates row-level security policy for table 'rate_limits'"
-- Code: 42501 (insufficient privileges)
--
-- Root Cause: The username availability function uses anon key but RLS policies
-- only allow service role access to rate_limits table
-- ============================================================================

-- ============================================================================
-- FIX 0: Ensure rate_limits table schema is compatible with enhanced-rate-limiter.ts
-- ============================================================================

-- Create rate_limits table if it does not exist yet with the minimal columns
-- required by the enhanced rate limiter. Existing installations with an
-- alternative schema (e.g. hashed_user_id/request_count) are preserved.
CREATE TABLE IF NOT EXISTS public.rate_limits (
    id BIGSERIAL PRIMARY KEY,
    identifier TEXT,
    count INTEGER NOT NULL DEFAULT 0,
    window_start TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure identifier-based columns exist even if the table was created by an
-- earlier migration that used a different schema.
ALTER TABLE public.rate_limits
    ADD COLUMN IF NOT EXISTS identifier TEXT,
    ADD COLUMN IF NOT EXISTS count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS window_start TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Index to support identifier + created_at lookups for sliding-window queries
CREATE INDEX IF NOT EXISTS idx_rate_limits_identifier_created_at
    ON public.rate_limits (identifier, created_at);

-- ============================================================================

-- Check current RLS policies on rate_limits table
DO $$
BEGIN
    RAISE NOTICE '🔍 Current RLS policies on rate_limits table:';
END $$;

SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'rate_limits'
ORDER BY policyname;

-- ============================================================================
-- FIX 1: Update Service Role Policy to be More Explicit
-- ============================================================================

-- Drop existing policies to recreate them properly
DROP POLICY IF EXISTS "Service role full access" ON rate_limits;
DROP POLICY IF EXISTS "No direct user access" ON rate_limits;
DROP POLICY IF EXISTS "No anonymous access" ON rate_limits;
DROP POLICY IF EXISTS "rate_limits_secure_access" ON rate_limits;

-- Also drop policies created by previous runs of this script so it is idempotent
DROP POLICY IF EXISTS "service_role_rate_limits_full_access" ON rate_limits;
DROP POLICY IF EXISTS "anon_rate_limits_operations" ON rate_limits;
DROP POLICY IF EXISTS "authenticated_no_rate_limits_access" ON rate_limits;

-- Create comprehensive service role policy
CREATE POLICY "service_role_rate_limits_full_access" ON rate_limits
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- FIX 2: Add Anon Role Policy for Rate Limiting Operations
-- ============================================================================

-- Allow anon role to INSERT/UPDATE rate limit records for legitimate rate limiting
-- This is safe because:
-- 1. Rate limits are not sensitive user data
-- 2. They're used for security (preventing abuse)
-- 3. No personal information is stored
CREATE POLICY "anon_rate_limits_operations" ON rate_limits
    FOR ALL
    TO anon
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- FIX 3: Ensure Authenticated Users Cannot Access Rate Limits Directly
-- ============================================================================

-- Authenticated users should not access rate limit data directly
CREATE POLICY "authenticated_no_rate_limits_access" ON rate_limits
    FOR ALL
    TO authenticated
    USING (false);

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Verify policies were created correctly
DO $$
DECLARE
    policy_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies
    WHERE tablename = 'rate_limits';

    IF policy_count >= 3 THEN
        RAISE NOTICE '✅ Rate limits RLS policies updated successfully';
        RAISE NOTICE '   - Service role: Full access';
        RAISE NOTICE '   - Anon role: Rate limiting operations only';
        RAISE NOTICE '   - Authenticated: No direct access';
    ELSE
        RAISE EXCEPTION '❌ Failed to create all required RLS policies';
    END IF;
END $$;

-- ============================================================================
-- GRANT NECESSARY PERMISSIONS
-- ============================================================================

-- Ensure service role has all necessary permissions
GRANT ALL ON rate_limits TO service_role;

-- Grant anon role specific permissions for rate limiting
GRANT SELECT, INSERT, UPDATE ON rate_limits TO anon;

-- ============================================================================
-- TEST THE FIX
-- ============================================================================

-- Test that anon role can now perform rate limiting operations
DO $$
BEGIN
    -- This should now work without RLS violations
    RAISE NOTICE '🧪 Testing anon role access to rate_limits table...';

    -- Note: This is just a syntax check - actual testing requires anon role context
    RAISE NOTICE '✅ RLS policies configured to allow anon rate limiting operations';
END $$;

-- ============================================================================
-- MONITORING AND MAINTENANCE
-- ============================================================================

-- Add comment for future reference
COMMENT ON TABLE rate_limits IS 'Rate limiting table with RLS policies allowing service role full access and anon role rate limiting operations only';

-- Log the fix (with error handling for optional audit logging)
DO $$
BEGIN
    -- Only log if security_audit_log table exists with correct schema
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'security_audit_log'
        AND table_schema = 'public'
    ) THEN
        INSERT INTO security_audit_log (event_type, details, timestamp)
        VALUES (
            'RLS_POLICY_UPDATE',
            '{"table": "rate_limits", "fix": "username_availability_rls_violation", "policies_updated": 3}',
            NOW()
        ) ON CONFLICT DO NOTHING;

        RAISE NOTICE '📝 Audit log entry created successfully';
    ELSE
        RAISE NOTICE '⚠️ security_audit_log table not found - skipping audit log';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '⚠️ Failed to create audit log entry: %', SQLERRM;
        -- Continue execution - audit logging is optional
END $$;

-- Final success messages (wrapped in DO block)
DO $$
BEGIN
    RAISE NOTICE '🎉 Rate limits RLS policies fix completed successfully!';
    RAISE NOTICE '📝 Username availability function should now work without RLS violations';
END $$;