-- PKARR Republishing Tracking Migration
-- Phase 2B-1 Day 6: Scheduled Republishing System
-- Adds columns and indexes for efficient stale record detection and republishing metrics
--
-- COMPLIANCE:
-- ✅ Privacy-first: No PII stored, only hashed identifiers
-- ✅ Row Level Security (RLS) preserved from migration 029
-- ✅ Idempotent: Safe to run multiple times
-- ✅ Backward compatible: Only adds columns, no breaking changes

-- Add republishing tracking columns to pkarr_records table
DO $$
BEGIN
    -- Add last_republish_attempt column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'pkarr_records' 
        AND column_name = 'last_republish_attempt'
    ) THEN
        ALTER TABLE public.pkarr_records 
        ADD COLUMN last_republish_attempt BIGINT;
        
        COMMENT ON COLUMN public.pkarr_records.last_republish_attempt IS 
        'Unix timestamp of last republishing attempt (successful or failed)';
    END IF;

    -- Add republish_count column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'pkarr_records' 
        AND column_name = 'republish_count'
    ) THEN
        ALTER TABLE public.pkarr_records 
        ADD COLUMN republish_count INTEGER NOT NULL DEFAULT 0;
        
        COMMENT ON COLUMN public.pkarr_records.republish_count IS 
        'Total number of successful republishing operations';
    END IF;

    -- Add last_republish_success column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'pkarr_records' 
        AND column_name = 'last_republish_success'
    ) THEN
        ALTER TABLE public.pkarr_records 
        ADD COLUMN last_republish_success BOOLEAN;
        
        COMMENT ON COLUMN public.pkarr_records.last_republish_success IS 
        'Whether the last republishing attempt was successful';
    END IF;

    -- Add republish_failure_count column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'pkarr_records' 
        AND column_name = 'republish_failure_count'
    ) THEN
        ALTER TABLE public.pkarr_records 
        ADD COLUMN republish_failure_count INTEGER NOT NULL DEFAULT 0;
        
        COMMENT ON COLUMN public.pkarr_records.republish_failure_count IS 
        'Consecutive republishing failures (resets on success)';
    END IF;
END $$;

-- Create indexes for efficient stale record queries
-- Index for finding records that need republishing (>18 hours old)
CREATE INDEX IF NOT EXISTS idx_pkarr_stale_records 
ON public.pkarr_records(last_published_at, verified) 
WHERE verified = true;

-- Index for finding records by last republish attempt
CREATE INDEX IF NOT EXISTS idx_pkarr_last_republish_attempt 
ON public.pkarr_records(last_republish_attempt);

-- Index for finding failed republishing attempts
CREATE INDEX IF NOT EXISTS idx_pkarr_republish_failures 
ON public.pkarr_records(republish_failure_count) 
WHERE republish_failure_count > 0;

-- Composite index for efficient batch selection
CREATE INDEX IF NOT EXISTS idx_pkarr_republish_batch 
ON public.pkarr_records(last_published_at, republish_failure_count, verified);

-- Create helper function to find stale PKARR records
-- Records are considered stale if:
-- 1. Never published (last_published_at IS NULL)
-- 2. Published >18 hours ago (75% of 24-hour TTL)
-- 3. Verified = true (only republish verified records)
CREATE OR REPLACE FUNCTION find_stale_pkarr_records(
    p_limit INTEGER DEFAULT 50,
    p_stale_threshold_hours INTEGER DEFAULT 18
)
RETURNS TABLE (
    id UUID,
    public_key VARCHAR(64),
    z32_address VARCHAR(52),
    records JSONB,
    timestamp BIGINT,
    sequence INTEGER,
    signature VARCHAR(128),
    relay_urls TEXT[],
    last_published_at BIGINT,
    republish_count INTEGER,
    republish_failure_count INTEGER,
    hours_since_publish NUMERIC
) AS $$
DECLARE
    v_stale_threshold_seconds BIGINT;
    v_current_time BIGINT;
BEGIN
    -- Calculate threshold in seconds
    v_stale_threshold_seconds := p_stale_threshold_hours * 3600;
    v_current_time := EXTRACT(EPOCH FROM NOW())::BIGINT;
    
    RETURN QUERY
    SELECT 
        pr.id,
        pr.public_key,
        pr.z32_address,
        pr.records,
        pr.timestamp,
        pr.sequence,
        pr.signature,
        pr.relay_urls,
        pr.last_published_at,
        pr.republish_count,
        pr.republish_failure_count,
        CASE 
            WHEN pr.last_published_at IS NULL THEN 999999 -- Never published
            ELSE ROUND((v_current_time - pr.last_published_at)::NUMERIC / 3600, 2)
        END AS hours_since_publish
    FROM public.pkarr_records pr
    WHERE pr.verified = true
    AND (
        pr.last_published_at IS NULL 
        OR pr.last_published_at < (v_current_time - v_stale_threshold_seconds)
    )
    ORDER BY 
        -- Prioritize: never published > oldest > most failures
        CASE WHEN pr.last_published_at IS NULL THEN 0 ELSE 1 END,
        pr.last_published_at ASC NULLS FIRST,
        pr.republish_failure_count DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION find_stale_pkarr_records IS 
'Finds PKARR records that need republishing based on age and failure count. 
Returns up to p_limit records, prioritizing never-published and oldest records.';

-- Create helper function to get republishing statistics
CREATE OR REPLACE FUNCTION get_pkarr_republish_stats()
RETURNS TABLE (
    total_records BIGINT,
    verified_records BIGINT,
    stale_records BIGINT,
    never_published BIGINT,
    published_last_6h BIGINT,
    published_last_18h BIGINT,
    published_last_24h BIGINT,
    failed_republish BIGINT,
    avg_republish_count NUMERIC,
    max_republish_count INTEGER,
    avg_failure_count NUMERIC,
    max_failure_count INTEGER
) AS $$
DECLARE
    v_current_time BIGINT;
    v_6h_ago BIGINT;
    v_18h_ago BIGINT;
    v_24h_ago BIGINT;
BEGIN
    v_current_time := EXTRACT(EPOCH FROM NOW())::BIGINT;
    v_6h_ago := v_current_time - (6 * 3600);
    v_18h_ago := v_current_time - (18 * 3600);
    v_24h_ago := v_current_time - (24 * 3600);
    
    RETURN QUERY
    SELECT 
        COUNT(*)::BIGINT AS total_records,
        COUNT(*) FILTER (WHERE verified = true)::BIGINT AS verified_records,
        COUNT(*) FILTER (
            WHERE verified = true 
            AND (last_published_at IS NULL OR last_published_at < v_18h_ago)
        )::BIGINT AS stale_records,
        COUNT(*) FILTER (WHERE last_published_at IS NULL)::BIGINT AS never_published,
        COUNT(*) FILTER (WHERE last_published_at >= v_6h_ago)::BIGINT AS published_last_6h,
        COUNT(*) FILTER (WHERE last_published_at >= v_18h_ago)::BIGINT AS published_last_18h,
        COUNT(*) FILTER (WHERE last_published_at >= v_24h_ago)::BIGINT AS published_last_24h,
        COUNT(*) FILTER (WHERE republish_failure_count > 0)::BIGINT AS failed_republish,
        ROUND(AVG(republish_count), 2) AS avg_republish_count,
        MAX(republish_count) AS max_republish_count,
        ROUND(AVG(republish_failure_count), 2) AS avg_failure_count,
        MAX(republish_failure_count) AS max_failure_count
    FROM public.pkarr_records;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_pkarr_republish_stats IS 
'Returns comprehensive statistics about PKARR record republishing status.
Useful for monitoring and dashboard displays.';

-- Create helper function to update republish metrics
CREATE OR REPLACE FUNCTION update_pkarr_republish_metrics(
    p_public_key VARCHAR(64),
    p_success BOOLEAN,
    p_new_sequence INTEGER,
    p_new_timestamp BIGINT,
    p_relay_urls TEXT[]
)
RETURNS BOOLEAN AS $$
DECLARE
    v_current_time BIGINT;
BEGIN
    v_current_time := EXTRACT(EPOCH FROM NOW())::BIGINT;
    
    IF p_success THEN
        -- Successful republish: update all metrics
        UPDATE public.pkarr_records
        SET 
            sequence = p_new_sequence,
            timestamp = p_new_timestamp,
            relay_urls = p_relay_urls,
            last_published_at = v_current_time,
            last_republish_attempt = v_current_time,
            last_republish_success = true,
            republish_count = republish_count + 1,
            republish_failure_count = 0, -- Reset failure count on success
            updated_at = v_current_time
        WHERE public_key = p_public_key;
    ELSE
        -- Failed republish: increment failure count
        UPDATE public.pkarr_records
        SET 
            last_republish_attempt = v_current_time,
            last_republish_success = false,
            republish_failure_count = republish_failure_count + 1,
            updated_at = v_current_time
        WHERE public_key = p_public_key;
    END IF;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_pkarr_republish_metrics IS 
'Updates republishing metrics for a PKARR record after a republish attempt.
Handles both successful and failed attempts with appropriate metric updates.';

-- Grant execute permissions on new functions
GRANT EXECUTE ON FUNCTION find_stale_pkarr_records(INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_pkarr_republish_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION update_pkarr_republish_metrics(VARCHAR, BOOLEAN, INTEGER, BIGINT, TEXT[]) TO authenticated;

-- Add comments to table for documentation
COMMENT ON TABLE public.pkarr_records IS 
'PKARR (Public Key Addressable Resource Records) storage table.
Stores Ed25519-signed DNS records published to BitTorrent DHT.
Records have 24-hour TTL and require republishing every 6-18 hours.';

-- Verification query to check migration success
DO $$
DECLARE
    v_column_count INTEGER;
    v_index_count INTEGER;
    v_function_count INTEGER;
BEGIN
    -- Count new columns
    SELECT COUNT(*) INTO v_column_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'pkarr_records'
    AND column_name IN ('last_republish_attempt', 'republish_count', 'last_republish_success', 'republish_failure_count');
    
    -- Count new indexes
    SELECT COUNT(*) INTO v_index_count
    FROM pg_indexes
    WHERE schemaname = 'public'
    AND tablename = 'pkarr_records'
    AND indexname IN ('idx_pkarr_stale_records', 'idx_pkarr_last_republish_attempt', 
                      'idx_pkarr_republish_failures', 'idx_pkarr_republish_batch');
    
    -- Count new functions
    SELECT COUNT(*) INTO v_function_count
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname IN ('find_stale_pkarr_records', 'get_pkarr_republish_stats', 'update_pkarr_republish_metrics');
    
    RAISE NOTICE '✅ Migration 039 verification:';
    RAISE NOTICE '   - New columns added: % / 4', v_column_count;
    RAISE NOTICE '   - New indexes created: % / 4', v_index_count;
    RAISE NOTICE '   - New functions created: % / 3', v_function_count;
    
    IF v_column_count = 4 AND v_index_count = 4 AND v_function_count = 3 THEN
        RAISE NOTICE '✅ Migration 039 completed successfully!';
    ELSE
        RAISE WARNING '⚠️ Migration 039 incomplete - please review';
    END IF;
END $$;

