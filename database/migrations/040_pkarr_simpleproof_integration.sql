-- PKARR-SimpleProof Integration Migration
-- Phase 2B-2 Day 9: PKARR-SimpleProof Integration
-- Adds SimpleProof blockchain timestamping to PKARR records for enhanced verification
--
-- COMPLIANCE:
-- ✅ Privacy-first: No PII stored, only hashed identifiers
-- ✅ Row Level Security (RLS) preserved from migration 029
-- ✅ Idempotent: Safe to run multiple times
-- ✅ Backward compatible: Only adds columns, no breaking changes
-- ✅ Feature flag gated: VITE_SIMPLEPROOF_ENABLED controls usage

-- Enable RLS if not already enabled
ALTER DATABASE postgres SET row_security = on;

-- ============================================================================
-- ADD SIMPLEPROOF INTEGRATION COLUMNS TO PKARR_RECORDS
-- ============================================================================

DO $$
BEGIN
    -- Add simpleproof_timestamp_id column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'pkarr_records' 
        AND column_name = 'simpleproof_timestamp_id'
    ) THEN
        ALTER TABLE public.pkarr_records 
        ADD COLUMN simpleproof_timestamp_id UUID;
        
        COMMENT ON COLUMN public.pkarr_records.simpleproof_timestamp_id IS 
        'Foreign key to simpleproof_timestamps table for blockchain proof of existence';
    END IF;

    -- Add simpleproof_verified column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'pkarr_records' 
        AND column_name = 'simpleproof_verified'
    ) THEN
        ALTER TABLE public.pkarr_records 
        ADD COLUMN simpleproof_verified BOOLEAN NOT NULL DEFAULT false;
        
        COMMENT ON COLUMN public.pkarr_records.simpleproof_verified IS 
        'Whether this PKARR record has been verified via SimpleProof blockchain timestamping';
    END IF;

    -- Add simpleproof_verified_at column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'pkarr_records' 
        AND column_name = 'simpleproof_verified_at'
    ) THEN
        ALTER TABLE public.pkarr_records 
        ADD COLUMN simpleproof_verified_at BIGINT;
        
        COMMENT ON COLUMN public.pkarr_records.simpleproof_verified_at IS 
        'Unix timestamp when SimpleProof verification was completed';
    END IF;
END $$;

-- ============================================================================
-- ADD FOREIGN KEY CONSTRAINT
-- ============================================================================

-- Add foreign key constraint to simpleproof_timestamps table
-- This ensures referential integrity between PKARR records and SimpleProof timestamps
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
        AND table_name = 'pkarr_records' 
        AND constraint_name = 'fk_pkarr_simpleproof_timestamp'
    ) THEN
        ALTER TABLE public.pkarr_records 
        ADD CONSTRAINT fk_pkarr_simpleproof_timestamp 
        FOREIGN KEY (simpleproof_timestamp_id) 
        REFERENCES public.simpleproof_timestamps(id) 
        ON DELETE SET NULL;
        
        COMMENT ON CONSTRAINT fk_pkarr_simpleproof_timestamp ON public.pkarr_records IS 
        'Foreign key to simpleproof_timestamps for blockchain proof of PKARR record existence';
    END IF;
END $$;

-- ============================================================================
-- CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

-- Index for finding PKARR records with SimpleProof verification
CREATE INDEX IF NOT EXISTS idx_pkarr_simpleproof_verified 
ON public.pkarr_records(simpleproof_verified, simpleproof_verified_at)
WHERE simpleproof_verified = true;

COMMENT ON INDEX idx_pkarr_simpleproof_verified IS 
'Index for efficient queries on SimpleProof-verified PKARR records';

-- Index for finding PKARR records by SimpleProof timestamp ID
CREATE INDEX IF NOT EXISTS idx_pkarr_simpleproof_timestamp_id 
ON public.pkarr_records(simpleproof_timestamp_id)
WHERE simpleproof_timestamp_id IS NOT NULL;

COMMENT ON INDEX idx_pkarr_simpleproof_timestamp_id IS 
'Index for joining PKARR records with SimpleProof timestamps';

-- Composite index for verification status queries
CREATE INDEX IF NOT EXISTS idx_pkarr_verified_simpleproof 
ON public.pkarr_records(verified, simpleproof_verified)
WHERE verified = true;

COMMENT ON INDEX idx_pkarr_verified_simpleproof IS 
'Composite index for finding PKARR records with both PKARR and SimpleProof verification';

-- ============================================================================
-- CREATE HELPER FUNCTIONS
-- ============================================================================

-- Function to get PKARR records with SimpleProof verification details
CREATE OR REPLACE FUNCTION get_pkarr_with_simpleproof(
    p_public_key VARCHAR(64) DEFAULT NULL,
    p_user_duid VARCHAR(50) DEFAULT NULL,
    p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
    id UUID,
    public_key VARCHAR(64),
    z32_address VARCHAR(52),
    verified BOOLEAN,
    simpleproof_verified BOOLEAN,
    simpleproof_timestamp_id UUID,
    simpleproof_verified_at BIGINT,
    ots_proof TEXT,
    bitcoin_block INTEGER,
    bitcoin_tx VARCHAR(64),
    created_at BIGINT,
    updated_at BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pr.id,
        pr.public_key,
        pr.z32_address,
        pr.verified,
        pr.simpleproof_verified,
        pr.simpleproof_timestamp_id,
        pr.simpleproof_verified_at,
        st.ots_proof,
        st.bitcoin_block,
        st.bitcoin_tx,
        pr.created_at,
        pr.updated_at
    FROM public.pkarr_records pr
    LEFT JOIN public.simpleproof_timestamps st ON pr.simpleproof_timestamp_id = st.id
    WHERE 
        (p_public_key IS NULL OR pr.public_key = p_public_key)
        AND (p_user_duid IS NULL OR pr.user_duid = p_user_duid)
    ORDER BY pr.updated_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_pkarr_with_simpleproof IS 
'Retrieves PKARR records with joined SimpleProof timestamp data.
Useful for verification workflows and analytics.';

-- Function to get SimpleProof verification statistics for PKARR records
CREATE OR REPLACE FUNCTION get_pkarr_simpleproof_stats()
RETURNS TABLE (
    total_pkarr_records BIGINT,
    verified_pkarr_records BIGINT,
    simpleproof_verified_records BIGINT,
    both_verified_records BIGINT,
    simpleproof_verification_rate NUMERIC,
    avg_verification_time_hours NUMERIC,
    records_with_bitcoin_anchor BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::BIGINT AS total_pkarr_records,
        COUNT(*) FILTER (WHERE verified = true)::BIGINT AS verified_pkarr_records,
        COUNT(*) FILTER (WHERE simpleproof_verified = true)::BIGINT AS simpleproof_verified_records,
        COUNT(*) FILTER (WHERE verified = true AND simpleproof_verified = true)::BIGINT AS both_verified_records,
        ROUND(
            (COUNT(*) FILTER (WHERE simpleproof_verified = true)::DECIMAL / NULLIF(COUNT(*) FILTER (WHERE verified = true), 0)) * 100,
            2
        ) AS simpleproof_verification_rate,
        ROUND(
            AVG(
                CASE 
                    WHEN simpleproof_verified_at IS NOT NULL AND created_at IS NOT NULL 
                    THEN (simpleproof_verified_at - created_at)::DECIMAL / 3600
                    ELSE NULL
                END
            ),
            2
        ) AS avg_verification_time_hours,
        COUNT(*) FILTER (
            WHERE simpleproof_timestamp_id IN (
                SELECT id FROM public.simpleproof_timestamps WHERE bitcoin_block IS NOT NULL
            )
        )::BIGINT AS records_with_bitcoin_anchor
    FROM public.pkarr_records;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_pkarr_simpleproof_stats IS 
'Returns comprehensive statistics about PKARR-SimpleProof integration.
Useful for monitoring and dashboard displays.';

-- Function to update PKARR record with SimpleProof verification
CREATE OR REPLACE FUNCTION update_pkarr_simpleproof_verification(
    p_public_key VARCHAR(64),
    p_simpleproof_timestamp_id UUID,
    p_verified BOOLEAN DEFAULT true
)
RETURNS BOOLEAN AS $$
DECLARE
    v_current_time BIGINT;
BEGIN
    v_current_time := EXTRACT(EPOCH FROM NOW())::BIGINT;
    
    UPDATE public.pkarr_records
    SET 
        simpleproof_timestamp_id = p_simpleproof_timestamp_id,
        simpleproof_verified = p_verified,
        simpleproof_verified_at = v_current_time,
        updated_at = v_current_time
    WHERE public_key = p_public_key;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_pkarr_simpleproof_verification IS 
'Updates a PKARR record with SimpleProof verification details.
Called after successful SimpleProof timestamp creation.';

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Grant execute permissions on new functions
GRANT EXECUTE ON FUNCTION get_pkarr_with_simpleproof(VARCHAR, VARCHAR, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_pkarr_simpleproof_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION update_pkarr_simpleproof_verification(VARCHAR, UUID, BOOLEAN) TO authenticated;

-- ============================================================================
-- VERIFICATION QUERY
-- ============================================================================

-- Verify migration success
DO $$
DECLARE
    v_column_count INTEGER;
    v_index_count INTEGER;
    v_function_count INTEGER;
    v_constraint_count INTEGER;
BEGIN
    -- Count new columns
    SELECT COUNT(*) INTO v_column_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'pkarr_records'
    AND column_name IN ('simpleproof_timestamp_id', 'simpleproof_verified', 'simpleproof_verified_at');
    
    -- Count new indexes
    SELECT COUNT(*) INTO v_index_count
    FROM pg_indexes
    WHERE schemaname = 'public'
    AND tablename = 'pkarr_records'
    AND indexname IN ('idx_pkarr_simpleproof_verified', 'idx_pkarr_simpleproof_timestamp_id', 'idx_pkarr_verified_simpleproof');
    
    -- Count new functions
    SELECT COUNT(*) INTO v_function_count
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname IN ('get_pkarr_with_simpleproof', 'get_pkarr_simpleproof_stats', 'update_pkarr_simpleproof_verification');
    
    -- Count new constraints
    SELECT COUNT(*) INTO v_constraint_count
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
    AND table_name = 'pkarr_records'
    AND constraint_name = 'fk_pkarr_simpleproof_timestamp';
    
    RAISE NOTICE '✅ Migration 040 verification:';
    RAISE NOTICE '   - New columns added: % / 3', v_column_count;
    RAISE NOTICE '   - New indexes created: % / 3', v_index_count;
    RAISE NOTICE '   - New functions created: % / 3', v_function_count;
    RAISE NOTICE '   - New constraints added: % / 1', v_constraint_count;
    
    IF v_column_count = 3 AND v_index_count = 3 AND v_function_count = 3 AND v_constraint_count = 1 THEN
        RAISE NOTICE '✅ Migration 040 completed successfully!';
    ELSE
        RAISE WARNING '⚠️ Migration 040 incomplete - please review';
    END IF;
END $$;

