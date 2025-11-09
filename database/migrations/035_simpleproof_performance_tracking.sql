-- SimpleProof Performance Tracking Migration
-- Phase 1: Add performance metrics to simpleproof_timestamps table
-- Enables real performance data collection for analytics dashboard
--
-- COMPLIANCE:
-- ✅ Privacy-first: No PII stored, only operation duration metrics
-- ✅ Zero-knowledge: No sensitive data (nsec, pubkeys, etc.) logged
-- ✅ Idempotent: Safe to run multiple times
-- ✅ Backward compatible: No breaking changes to existing schema

-- ============================================================================
-- ADD PERFORMANCE_MS COLUMN TO SIMPLEPROOF_TIMESTAMPS
-- ============================================================================

DO $$
BEGIN
    -- Add performance_ms column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'simpleproof_timestamps' 
        AND column_name = 'performance_ms'
    ) THEN
        ALTER TABLE public.simpleproof_timestamps 
        ADD COLUMN performance_ms INTEGER;
        
        COMMENT ON COLUMN public.simpleproof_timestamps.performance_ms IS 
        'Operation duration in milliseconds (timestamp creation time from request start to database insert completion)';
    END IF;
END $$;

-- ============================================================================
-- CREATE INDEX FOR PERFORMANCE ANALYTICS QUERIES
-- ============================================================================

-- Index for efficient performance metric queries
CREATE INDEX IF NOT EXISTS idx_simpleproof_performance_ms 
    ON public.simpleproof_timestamps(performance_ms)
    WHERE performance_ms IS NOT NULL;

COMMENT ON INDEX idx_simpleproof_performance_ms IS 
'Index for efficient queries on SimpleProof performance metrics';

-- Composite index for time-series performance analysis
CREATE INDEX IF NOT EXISTS idx_simpleproof_performance_by_date 
    ON public.simpleproof_timestamps(created_at, performance_ms)
    WHERE performance_ms IS NOT NULL;

COMMENT ON INDEX idx_simpleproof_performance_by_date IS 
'Composite index for time-series performance analysis by date';

-- ============================================================================
-- VERIFICATION QUERY
-- ============================================================================

-- Verify the column was added successfully
-- Run this to confirm: SELECT column_name, data_type FROM information_schema.columns 
-- WHERE table_name = 'simpleproof_timestamps' AND column_name = 'performance_ms';

