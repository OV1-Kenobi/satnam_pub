-- ============================================================================
-- MIGRATION 042: Rate Limiting Infrastructure
-- ============================================================================
-- Purpose: Create database-backed rate limiting infrastructure for security hardening
-- Author: Security Hardening Team
-- Date: 2025-10-29
-- Dependencies: None
-- Rollback: See rollback section at end of file
-- ============================================================================

-- ============================================================================
-- TABLE: rate_limits
-- ============================================================================
-- Tracks rate limit state for distributed rate limiting across Netlify Functions
-- Supports per-user, per-IP, and per-endpoint rate limiting with automatic expiration
-- Used by: netlify/functions_active/utils/enhanced-rate-limiter.ts

CREATE TABLE IF NOT EXISTS public.rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Composite key for rate limit tracking
    -- Format: "prefix:identifier" (e.g., "auth-signin:user@example.com" or "auth-signin:192.168.1.1")
    client_key VARCHAR(255) NOT NULL,
    
    -- Endpoint identifier (e.g., "auth-signin", "payment-create", "admin-dashboard")
    endpoint VARCHAR(100) NOT NULL,

    -- Rate limit state
    count INTEGER NOT NULL DEFAULT 1,
    reset_time TIMESTAMP WITH TIME ZONE NOT NULL,

    -- Metadata for auditing and debugging
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT rate_limits_unique UNIQUE (client_key, endpoint),
    CONSTRAINT rate_limits_count_positive CHECK (count > 0)
);

-- Composite index for efficient rate limit lookups
-- Used by checkRateLimit() to quickly find existing rate limit records
CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup
    ON public.rate_limits (client_key, endpoint, reset_time DESC);

-- Index for cleanup queries to efficiently find expired records
-- Used by cleanup_expired_rate_limits() scheduled function
CREATE INDEX IF NOT EXISTS idx_rate_limits_cleanup
    ON public.rate_limits (reset_time ASC);

-- ============================================================================
-- TABLE: rate_limit_events
-- ============================================================================
-- Audit trail for rate limit hits, bypasses, and resets
-- Used for monitoring, debugging, and security analysis
-- Retention: 30 days (cleaned up by scheduled function)

CREATE TABLE IF NOT EXISTS public.rate_limit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Event details
    client_key VARCHAR(255) NOT NULL,
    endpoint VARCHAR(100) NOT NULL,
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('hit', 'bypass', 'reset')),

    -- Context for security analysis
    ip_address INET,
    user_duid VARCHAR(50),
    reason VARCHAR(255),

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Index for querying recent events (monitoring dashboard)
CREATE INDEX IF NOT EXISTS idx_rate_limit_events_recent
    ON public.rate_limit_events (created_at DESC);

-- Index for querying by endpoint (endpoint-specific analysis)
CREATE INDEX IF NOT EXISTS idx_rate_limit_events_endpoint
    ON public.rate_limit_events (endpoint, created_at DESC);

-- Index for querying by event type (security analysis)
CREATE INDEX IF NOT EXISTS idx_rate_limit_events_type
    ON public.rate_limit_events (event_type, created_at DESC);

-- ============================================================================
-- FUNCTION: cleanup_expired_rate_limits()
-- ============================================================================
-- Removes expired rate limit records to prevent table bloat
-- Should be called periodically (e.g., every 6 hours via scheduled Netlify Function)
-- Returns: Number of deleted records

-- Drop existing function if signature changed (prevents 42P13 error)
DROP FUNCTION IF EXISTS cleanup_expired_rate_limits();

CREATE OR REPLACE FUNCTION cleanup_expired_rate_limits()
RETURNS TABLE(deleted_count INTEGER) AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    -- Delete rate limit records that expired more than 24 hours ago
    -- Keep recent expired records for debugging and analysis
    DELETE FROM public.rate_limits
    WHERE reset_time < NOW() - INTERVAL '24 hours';

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    RETURN QUERY SELECT v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: log_rate_limit_event()
-- ============================================================================
-- Logs rate limit events for monitoring and debugging
-- Called by enhanced-rate-limiter.ts when rate limits are hit or bypassed
-- Returns: Event ID (UUID)

-- Drop existing function if signature changed (prevents 42P13 error)
DROP FUNCTION IF EXISTS log_rate_limit_event(VARCHAR, VARCHAR, VARCHAR, INET, VARCHAR, VARCHAR);

CREATE OR REPLACE FUNCTION log_rate_limit_event(
    p_client_key VARCHAR(255),
    p_endpoint VARCHAR(100),
    p_event_type VARCHAR(50),
    p_ip_address INET DEFAULT NULL,
    p_user_duid VARCHAR(50) DEFAULT NULL,
    p_reason VARCHAR(255) DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_event_id UUID;
BEGIN
    -- Validate event type
    IF p_event_type NOT IN ('hit', 'bypass', 'reset') THEN
        RAISE EXCEPTION 'Invalid event_type: %. Must be hit, bypass, or reset.', p_event_type;
    END IF;

    -- Insert event record
    INSERT INTO public.rate_limit_events (
        client_key, endpoint, event_type, ip_address, user_duid, reason
    ) VALUES (
        p_client_key, p_endpoint, p_event_type, p_ip_address, p_user_duid, p_reason
    )
    RETURNING id INTO v_event_id;

    RETURN v_event_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: get_rate_limit_stats()
-- ============================================================================
-- Returns rate limit statistics for monitoring dashboard
-- Groups by endpoint and shows hit counts, bypass counts, and unique clients

-- Drop existing function if signature changed (prevents 42P13 error)
DROP FUNCTION IF EXISTS get_rate_limit_stats(INTEGER);

CREATE OR REPLACE FUNCTION get_rate_limit_stats(
    p_hours INTEGER DEFAULT 24
)
RETURNS TABLE(
    endpoint VARCHAR(100),
    total_hits BIGINT,
    total_bypasses BIGINT,
    unique_clients BIGINT,
    last_event TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        rle.endpoint,
        COUNT(*) FILTER (WHERE rle.event_type = 'hit') AS total_hits,
        COUNT(*) FILTER (WHERE rle.event_type = 'bypass') AS total_bypasses,
        COUNT(DISTINCT rle.client_key) AS unique_clients,
        MAX(rle.created_at) AS last_event
    FROM public.rate_limit_events rle
    WHERE rle.created_at > NOW() - (p_hours || ' hours')::INTERVAL
    GROUP BY rle.endpoint
    ORDER BY total_hits DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================
-- Rate limiting tables are service-level infrastructure
-- Only accessible via service role (Netlify Functions)
-- No direct user access required

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_events ENABLE ROW LEVEL SECURITY;

-- Service role has full access (used by Netlify Functions)
CREATE POLICY rate_limits_service_full_access ON public.rate_limits
    FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE POLICY rate_limit_events_service_full_access ON public.rate_limit_events
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- GRANTS
-- ============================================================================
-- Grant necessary permissions to service role

GRANT ALL ON public.rate_limits TO service_role;
GRANT ALL ON public.rate_limit_events TO service_role;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Run these queries after migration to verify successful deployment

-- Verify tables created:
-- SELECT table_name, table_type FROM information_schema.tables 
-- WHERE table_name IN ('rate_limits', 'rate_limit_events');

-- Verify indexes created:
-- SELECT indexname, tablename FROM pg_indexes 
-- WHERE tablename IN ('rate_limits', 'rate_limit_events');

-- Verify functions created:
-- SELECT routine_name, routine_type FROM information_schema.routines 
-- WHERE routine_name IN ('cleanup_expired_rate_limits', 'log_rate_limit_event', 'get_rate_limit_stats');

-- Test cleanup function:
-- SELECT cleanup_expired_rate_limits();

-- Test logging function:
-- SELECT log_rate_limit_event('test:127.0.0.1', 'test-endpoint', 'hit', '127.0.0.1'::INET, NULL, 'Test event');

-- Test stats function:
-- SELECT * FROM get_rate_limit_stats(24);

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- Execute these commands to rollback this migration if needed

-- DROP POLICY IF EXISTS rate_limit_events_service_full_access ON public.rate_limit_events;
-- DROP POLICY IF EXISTS rate_limits_service_full_access ON public.rate_limits;
-- DROP FUNCTION IF EXISTS get_rate_limit_stats(INTEGER);
-- DROP FUNCTION IF EXISTS log_rate_limit_event(VARCHAR, VARCHAR, VARCHAR, INET, VARCHAR, VARCHAR);
-- DROP FUNCTION IF EXISTS cleanup_expired_rate_limits();
-- DROP INDEX IF EXISTS idx_rate_limit_events_type;
-- DROP INDEX IF EXISTS idx_rate_limit_events_endpoint;
-- DROP INDEX IF EXISTS idx_rate_limit_events_recent;
-- DROP INDEX IF EXISTS idx_rate_limits_cleanup;
-- DROP INDEX IF EXISTS idx_rate_limits_lookup;
-- DROP TABLE IF EXISTS public.rate_limit_events;
-- DROP TABLE IF EXISTS public.rate_limits;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

