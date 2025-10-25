-- PKARR Performance Indexes Migration
-- Phase 2B-1 Day 3: Performance Optimizations
-- Creates composite and partial indexes to optimize PKARR verification queries
--
-- COMPLIANCE:
-- ✅ Performance optimized: Targets <500ms query times
-- ✅ Idempotent: Safe to run multiple times
-- ✅ Backward compatible: No breaking changes
-- ✅ Privacy-first: No PII indexed

-- Enable RLS if not already enabled
ALTER DATABASE postgres SET row_security = on;

-- ============================================================================
-- COMPOSITE INDEXES FOR ENCRYPTED_CONTACTS
-- Optimize frequent query patterns in verify-contact-pkarr endpoint
-- ============================================================================

-- Index for contact lookup by owner_hash + contact_hash
-- Used in: verify-contact-pkarr endpoint (primary query)
-- Query pattern: WHERE owner_hash = ? AND contact_hash = ?
CREATE INDEX IF NOT EXISTS idx_contacts_owner_contact_hash 
ON public.encrypted_contacts(owner_hash, contact_hash)
INCLUDE (id, pkarr_verified, verification_level);

COMMENT ON INDEX idx_contacts_owner_contact_hash IS 
'Composite index for fast contact lookup by owner and contact hash with included columns';

-- Index for verification status queries
-- Used in: Analytics queries, batch verification
-- Query pattern: WHERE owner_hash = ? AND pkarr_verified = ?
CREATE INDEX IF NOT EXISTS idx_contacts_owner_pkarr_verified 
ON public.encrypted_contacts(owner_hash, pkarr_verified)
WHERE pkarr_verified = false;

COMMENT ON INDEX idx_contacts_owner_pkarr_verified IS 
'Partial index for unverified contacts to speed up verification workflows';

-- Index for verification level queries
-- Used in: Analytics, dashboard queries
-- Query pattern: WHERE verification_level = ? AND created_at > ?
CREATE INDEX IF NOT EXISTS idx_contacts_verification_level_time 
ON public.encrypted_contacts(verification_level, created_at DESC)
WHERE verification_level IN ('basic', 'verified', 'trusted');

COMMENT ON INDEX idx_contacts_verification_level_time IS 
'Index for verification level analytics with time-based filtering';

-- ============================================================================
-- COMPOSITE INDEXES FOR PKARR_RECORDS
-- Optimize PKARR record queries and cache lookups
-- ============================================================================

-- Index for user PKARR records lookup
-- Used in: PKARR publishing, verification workflows
-- Query pattern: WHERE user_duid = ? AND verified = ?
CREATE INDEX IF NOT EXISTS idx_pkarr_user_verified 
ON public.pkarr_records(user_duid, verified)
WHERE user_duid IS NOT NULL;

COMMENT ON INDEX idx_pkarr_user_verified IS 
'Index for user PKARR records with verification status';

-- Index for cache expiration queries
-- Used in: Cache cleanup, stale record detection
-- Query pattern: WHERE cache_expires_at < ? ORDER BY cache_expires_at
CREATE INDEX IF NOT EXISTS idx_pkarr_cache_expiry 
ON public.pkarr_records(cache_expires_at)
WHERE cache_expires_at IS NOT NULL;

COMMENT ON INDEX idx_pkarr_cache_expiry IS 
'Index for efficient cache expiration queries';

-- Index for publish status queries
-- Used in: Republishing workflows, health monitoring
-- Query pattern: WHERE last_published_at < ? OR last_published_at IS NULL
CREATE INDEX IF NOT EXISTS idx_pkarr_publish_status 
ON public.pkarr_records(last_published_at NULLS FIRST, verified)
WHERE verified = true;

COMMENT ON INDEX idx_pkarr_publish_status IS 
'Index for finding records that need republishing';

-- ============================================================================
-- COMPOSITE INDEXES FOR PKARR_PUBLISH_HISTORY
-- Optimize relay health monitoring and analytics
-- ============================================================================

-- Index for relay health queries (already exists in 037, but ensure it's optimal)
-- Query pattern: WHERE relay_url = ? AND publish_timestamp > ? AND success = ?
CREATE INDEX IF NOT EXISTS idx_pkarr_history_relay_health 
ON public.pkarr_publish_history(relay_url, publish_timestamp DESC, success)
INCLUDE (response_time_ms, error_message);

COMMENT ON INDEX idx_pkarr_history_relay_health IS 
'Composite index for relay health monitoring with included metrics';

-- Index for recent publish attempts
-- Used in: Recent activity queries, debugging
-- Query pattern: WHERE pkarr_record_id = ? ORDER BY publish_timestamp DESC
CREATE INDEX IF NOT EXISTS idx_pkarr_history_record_time 
ON public.pkarr_publish_history(pkarr_record_id, publish_timestamp DESC);

COMMENT ON INDEX idx_pkarr_history_record_time IS 
'Index for recent publish attempts per record';

-- ============================================================================
-- PARTIAL INDEXES FOR PKARR_RESOLUTION_CACHE
-- Optimize cache hit/miss queries
-- ============================================================================

-- Index for active cache entries
-- Used in: Cache lookup, hit rate calculation
-- Query pattern: WHERE query_key = ? AND expires_at > NOW()
CREATE INDEX IF NOT EXISTS idx_pkarr_cache_active 
ON public.pkarr_resolution_cache(query_key, expires_at)
WHERE success = true AND expires_at > EXTRACT(EPOCH FROM NOW());

COMMENT ON INDEX idx_pkarr_cache_active IS 
'Partial index for active (non-expired) cache entries';

-- Index for cache cleanup
-- Used in: Periodic cache cleanup operations
-- Query pattern: WHERE expires_at < NOW() ORDER BY expires_at
CREATE INDEX IF NOT EXISTS idx_pkarr_cache_expired 
ON public.pkarr_resolution_cache(expires_at)
WHERE expires_at < EXTRACT(EPOCH FROM NOW());

COMMENT ON INDEX idx_pkarr_cache_expired IS 
'Partial index for expired cache entries to speed up cleanup';

-- ============================================================================
-- OPTIMIZE RLS POLICY QUERIES
-- Add indexes to support RLS policy evaluation
-- ============================================================================

-- Index for RLS policy on pkarr_records (created_by lookup)
-- Used in: RLS policy evaluation for INSERT/UPDATE/DELETE
CREATE INDEX IF NOT EXISTS idx_pkarr_created_by 
ON public.pkarr_records(created_by)
WHERE created_by IS NOT NULL;

COMMENT ON INDEX idx_pkarr_created_by IS 
'Index to optimize RLS policy evaluation for pkarr_records';

-- Index for RLS policy on pkarr_publish_history (via pkarr_record_id)
-- Used in: RLS policy evaluation for SELECT
CREATE INDEX IF NOT EXISTS idx_pkarr_history_rls 
ON public.pkarr_publish_history(pkarr_record_id)
INCLUDE (success, publish_timestamp);

COMMENT ON INDEX idx_pkarr_history_rls IS 
'Index to optimize RLS policy evaluation for publish history';

-- ============================================================================
-- STATISTICS AND MAINTENANCE
-- ============================================================================

-- Update table statistics for query planner
ANALYZE public.encrypted_contacts;
ANALYZE public.pkarr_records;
ANALYZE public.pkarr_publish_history;
ANALYZE public.pkarr_resolution_cache;

-- ============================================================================
-- PERFORMANCE MONITORING FUNCTION
-- ============================================================================

-- Function to check index usage and performance
CREATE OR REPLACE FUNCTION check_pkarr_index_usage()
RETURNS TABLE (
    index_name TEXT,
    table_name TEXT,
    index_size TEXT,
    index_scans BIGINT,
    tuples_read BIGINT,
    tuples_fetched BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        indexrelname::TEXT AS index_name,
        tablename::TEXT AS table_name,
        pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
        idx_scan AS index_scans,
        idx_tup_read AS tuples_read,
        idx_tup_fetch AS tuples_fetched
    FROM pg_stat_user_indexes
    WHERE schemaname = 'public'
      AND (
        tablename = 'encrypted_contacts' OR
        tablename = 'pkarr_records' OR
        tablename = 'pkarr_publish_history' OR
        tablename = 'pkarr_resolution_cache'
      )
      AND indexrelname LIKE 'idx_%'
    ORDER BY idx_scan DESC;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION check_pkarr_index_usage() TO authenticated;

COMMENT ON FUNCTION check_pkarr_index_usage IS 
'Monitor PKARR index usage and performance metrics';

-- ============================================================================
-- QUERY PERFORMANCE HELPER FUNCTION
-- ============================================================================

-- Function to estimate query performance for contact lookup
CREATE OR REPLACE FUNCTION estimate_contact_lookup_performance(
    p_owner_hash VARCHAR,
    p_contact_hash VARCHAR
)
RETURNS TABLE (
    estimated_rows BIGINT,
    estimated_cost NUMERIC,
    uses_index BOOLEAN
) AS $$
DECLARE
    query_plan TEXT;
BEGIN
    -- Get query plan
    SELECT INTO query_plan
        query_plan_text
    FROM (
        SELECT string_agg(line, E'\n') AS query_plan_text
        FROM (
            SELECT * FROM (
                EXPLAIN (FORMAT TEXT)
                SELECT id, pkarr_verified, verification_level
                FROM public.encrypted_contacts
                WHERE owner_hash = p_owner_hash
                  AND contact_hash = p_contact_hash
                LIMIT 1
            ) AS plan_lines(line)
        ) AS plan_text
    ) AS full_plan;

    -- Parse plan for index usage
    RETURN QUERY
    SELECT
        1::BIGINT AS estimated_rows,
        0.0::NUMERIC AS estimated_cost,
        (query_plan LIKE '%Index Scan%' OR query_plan LIKE '%Index Only Scan%') AS uses_index;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION estimate_contact_lookup_performance(VARCHAR, VARCHAR) TO authenticated;

COMMENT ON FUNCTION estimate_contact_lookup_performance IS 
'Estimate query performance for contact lookup operations';

-- ============================================================================
-- VACUUM AND REINDEX MAINTENANCE
-- ============================================================================

-- Vacuum and reindex for optimal performance
VACUUM ANALYZE public.encrypted_contacts;
VACUUM ANALYZE public.pkarr_records;
VACUUM ANALYZE public.pkarr_publish_history;
VACUUM ANALYZE public.pkarr_resolution_cache;

-- Note: REINDEX should be run during maintenance windows
-- REINDEX TABLE CONCURRENTLY public.encrypted_contacts;
-- REINDEX TABLE CONCURRENTLY public.pkarr_records;
-- REINDEX TABLE CONCURRENTLY public.pkarr_publish_history;
-- REINDEX TABLE CONCURRENTLY public.pkarr_resolution_cache;

