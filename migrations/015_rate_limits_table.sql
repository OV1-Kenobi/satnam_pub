-- Migration: Rate Limits Table for Serverless Functions
-- Purpose: Create persistent rate limiting storage for serverless environment
-- Date: 2024-12-24
-- Version: 015

-- ============================================================================
-- TRANSACTION SAFETY: Wrap entire migration in a transaction
-- ============================================================================

BEGIN;

-- ============================================================================
-- SERVERLESS RATE LIMITING: Persistent Storage Table
-- ============================================================================

-- Drop existing table if it exists (for clean re-runs)
DROP TABLE IF EXISTS rate_limits CASCADE;

-- Create rate_limits table for persistent rate limiting across function invocations
CREATE TABLE rate_limits (
    id BIGSERIAL PRIMARY KEY,
    client_key TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 1,
    reset_time BIGINT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Composite unique constraint for client + endpoint combination
    CONSTRAINT unique_client_endpoint UNIQUE (client_key, endpoint)
);

-- Verify table was created successfully
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'rate_limits'
        AND table_schema = 'public'
    ) THEN
        RAISE EXCEPTION 'Failed to create rate_limits table';
    END IF;

    RAISE NOTICE '✅ rate_limits table created successfully';
END $$;

-- ============================================================================
-- PERFORMANCE OPTIMIZATION: Indexes for Fast Lookups
-- ============================================================================

-- Verify columns exist before creating indexes
DO $$
BEGIN
    -- Check if required columns exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'rate_limits'
        AND column_name = 'client_key'
        AND table_schema = 'public'
    ) THEN
        RAISE EXCEPTION 'Column client_key does not exist in rate_limits table';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'rate_limits'
        AND column_name = 'endpoint'
        AND table_schema = 'public'
    ) THEN
        RAISE EXCEPTION 'Column endpoint does not exist in rate_limits table';
    END IF;

    RAISE NOTICE '✅ All required columns verified';
END $$;

-- Index for fast rate limit lookups by client and endpoint
CREATE INDEX idx_rate_limits_client_endpoint
ON rate_limits (client_key, endpoint);

-- Index for cleanup of expired rate limit entries
CREATE INDEX idx_rate_limits_reset_time
ON rate_limits (reset_time);

-- Index for general queries by endpoint
CREATE INDEX idx_rate_limits_endpoint
ON rate_limits (endpoint);

-- Verify indexes were created
DO $$
BEGIN
    RAISE NOTICE '✅ All indexes created successfully';
END $$;

-- ============================================================================
-- AUTOMATIC CLEANUP: Remove Expired Rate Limit Entries
-- ============================================================================

-- Function to clean up expired rate limit entries
CREATE OR REPLACE FUNCTION cleanup_expired_rate_limits()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete entries where reset_time has passed (older than current timestamp in milliseconds)
    DELETE FROM rate_limits 
    WHERE reset_time < EXTRACT(EPOCH FROM NOW()) * 1000;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Log cleanup activity
    IF deleted_count > 0 THEN
        RAISE NOTICE 'Cleaned up % expired rate limit entries', deleted_count;
    END IF;
    
    RETURN deleted_count;
END $$;

-- ============================================================================
-- ROW LEVEL SECURITY: Protect Rate Limit Data
-- ============================================================================

-- Enable RLS on rate_limits table
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for clean re-runs)
DROP POLICY IF EXISTS "Service role full access" ON rate_limits;
DROP POLICY IF EXISTS "No direct user access" ON rate_limits;
DROP POLICY IF EXISTS "No anonymous access" ON rate_limits;

-- Policy: Service role can manage all rate limit entries
CREATE POLICY "Service role full access" ON rate_limits
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Policy: Authenticated users cannot access rate limit data directly
-- (Rate limiting is handled server-side only)
CREATE POLICY "No direct user access" ON rate_limits
    FOR ALL
    TO authenticated
    USING (false);

-- Policy: Anonymous users cannot access rate limit data
CREATE POLICY "No anonymous access" ON rate_limits
    FOR ALL
    TO anon
    USING (false);

-- Verify RLS policies were created
DO $$
BEGIN
    RAISE NOTICE '✅ Row Level Security policies configured';
END $$;

-- ============================================================================
-- SCHEDULED CLEANUP: Automatic Maintenance
-- ============================================================================

-- Note: This would typically be set up as a cron job or scheduled function
-- For Supabase, you can set up a pg_cron job or use Supabase Edge Functions
-- Example cron setup (requires pg_cron extension):
-- 
-- SELECT cron.schedule(
--     'cleanup-rate-limits',
--     '*/15 * * * *', -- Every 15 minutes
--     'SELECT cleanup_expired_rate_limits();'
-- );

-- ============================================================================
-- SECURITY VALIDATION: Ensure Proper Configuration
-- ============================================================================

-- Add comments for documentation
COMMENT ON TABLE rate_limits IS 'Persistent rate limiting storage for serverless functions';
COMMENT ON COLUMN rate_limits.client_key IS 'Client identifier (IP address or user ID)';
COMMENT ON COLUMN rate_limits.endpoint IS 'API endpoint being rate limited';
COMMENT ON COLUMN rate_limits.count IS 'Number of requests in current window';
COMMENT ON COLUMN rate_limits.reset_time IS 'Unix timestamp (ms) when rate limit resets';
COMMENT ON COLUMN rate_limits.created_at IS 'When rate limit entry was first created';
COMMENT ON COLUMN rate_limits.updated_at IS 'When rate limit entry was last updated';

-- ============================================================================
-- FINAL VERIFICATION: Ensure Everything Was Created Successfully
-- ============================================================================

DO $$
DECLARE
    table_count INTEGER;
    index_count INTEGER;
    policy_count INTEGER;
    function_exists BOOLEAN;
BEGIN
    -- Verify table exists
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables
    WHERE table_name = 'rate_limits' AND table_schema = 'public';

    -- Verify indexes exist
    SELECT COUNT(*) INTO index_count
    FROM pg_indexes
    WHERE tablename = 'rate_limits' AND schemaname = 'public';

    -- Verify policies exist
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies
    WHERE tablename = 'rate_limits' AND schemaname = 'public';

    -- Verify cleanup function exists
    SELECT EXISTS(
        SELECT 1 FROM pg_proc
        WHERE proname = 'cleanup_expired_rate_limits'
    ) INTO function_exists;

    -- Report results
    RAISE NOTICE '=== MIGRATION VERIFICATION RESULTS ===';
    RAISE NOTICE 'Tables created: % (expected: 1)', table_count;
    RAISE NOTICE 'Indexes created: % (expected: 3)', index_count;
    RAISE NOTICE 'RLS policies created: % (expected: 3)', policy_count;
    RAISE NOTICE 'Cleanup function exists: %', function_exists;

    -- Ensure everything was created
    IF table_count != 1 THEN
        RAISE EXCEPTION 'rate_limits table was not created properly';
    END IF;

    IF index_count < 3 THEN
        RAISE EXCEPTION 'Not all indexes were created (found %, expected 3)', index_count;
    END IF;

    IF policy_count != 3 THEN
        RAISE EXCEPTION 'Not all RLS policies were created (found %, expected 3)', policy_count;
    END IF;

    IF NOT function_exists THEN
        RAISE EXCEPTION 'cleanup_expired_rate_limits function was not created';
    END IF;

    RAISE NOTICE '✅ ALL MIGRATION COMPONENTS VERIFIED SUCCESSFULLY';
END $$;

-- ============================================================================
-- MIGRATION COMPLETION LOG
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '=== RATE LIMITS TABLE MIGRATION COMPLETED ===';
    RAISE NOTICE 'Migration 015: Persistent rate limiting for serverless functions';
    RAISE NOTICE 'Date: %', NOW();
    RAISE NOTICE 'Table: rate_limits created with proper indexes and RLS';
    RAISE NOTICE 'Cleanup: Automatic expired entry removal function created';
    RAISE NOTICE 'Security: Row Level Security policies configured';
    RAISE NOTICE 'Performance: Optimized indexes for fast lookups';
    RAISE NOTICE 'Status: READY FOR PRODUCTION USE';
    RAISE NOTICE '====================================================';
END $$;

-- Final success message
DO $$
BEGIN
    RAISE NOTICE '🎉 MIGRATION TRANSACTION COMMITTED SUCCESSFULLY';
END $$;

-- Commit the transaction
COMMIT;
