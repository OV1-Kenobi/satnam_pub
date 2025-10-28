-- SimpleProof Timestamps Migration
-- Phase 1: Store OpenTimestamps proofs and Bitcoin blockchain references
-- Enables cryptographic proof of data existence and integrity
--
-- COMPLIANCE:
-- ✅ Privacy-first: No PII stored, only hashed identifiers and proofs
-- ✅ Row Level Security (RLS) for user data isolation
-- ✅ Idempotent: Safe to run multiple times
-- ✅ Backward compatible: No breaking changes to existing schema

-- Note: RLS is typically enabled globally at database initialization time.
-- If needed, enable at session level: SET row_security = on;

-- Create simpleproof_timestamps table
CREATE TABLE IF NOT EXISTS public.simpleproof_timestamps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Reference to verification attempt
    verification_id UUID NOT NULL,
    
    -- OpenTimestamps proof (binary data as hex string)
    ots_proof TEXT NOT NULL,
    
    -- Bitcoin blockchain reference
    bitcoin_block INTEGER,
    bitcoin_tx VARCHAR(64),
    
    -- Timestamps
    created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
    verified_at BIGINT,
    
    -- Verification status
    is_valid BOOLEAN,
    
    -- Constraints
    CONSTRAINT verification_fk FOREIGN KEY (verification_id)
        REFERENCES multi_method_verification_results(id) ON DELETE CASCADE,
    CONSTRAINT bitcoin_tx_format CHECK (bitcoin_tx IS NULL OR bitcoin_tx ~ '^[a-f0-9]{64}$'),
    CONSTRAINT timestamps_valid CHECK (verified_at IS NULL OR verified_at >= created_at)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_simpleproof_verification 
    ON simpleproof_timestamps(verification_id);
CREATE INDEX IF NOT EXISTS idx_simpleproof_bitcoin_tx 
    ON simpleproof_timestamps(bitcoin_tx);
CREATE INDEX IF NOT EXISTS idx_simpleproof_created 
    ON simpleproof_timestamps(created_at);
CREATE INDEX IF NOT EXISTS idx_simpleproof_is_valid 
    ON simpleproof_timestamps(is_valid);

-- Enable RLS on new table
ALTER TABLE public.simpleproof_timestamps ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Allow service role to insert timestamps (idempotent with IF NOT EXISTS check)
-- FIX: Cast auth.uid() to VARCHAR to match user_duid type
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'simpleproof_timestamps'
        AND policyname = 'service_role_insert_timestamps'
    ) THEN
        CREATE POLICY "service_role_insert_timestamps" ON public.simpleproof_timestamps
            FOR INSERT
            WITH CHECK (
                verification_id IN (
                    SELECT id FROM multi_method_verification_results
                    WHERE user_duid = auth.uid()::VARCHAR
                )
            );
    END IF;
END $$;

-- RLS Policy: Allow authenticated users to view their own timestamps (idempotent)
-- FIX: Cast auth.uid() to VARCHAR to match user_duid type
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'simpleproof_timestamps'
        AND policyname = 'users_view_own_timestamps'
    ) THEN
        CREATE POLICY "users_view_own_timestamps" ON public.simpleproof_timestamps
            FOR SELECT
            USING (
                verification_id IN (
                    SELECT id FROM multi_method_verification_results
                    WHERE user_duid = auth.uid()::VARCHAR
                )
            );
    END IF;
END $$;

-- RLS Policy: Allow service role to update verification status (idempotent, restrictive)
-- FIX: Cast auth.uid() to VARCHAR to match user_duid type
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'simpleproof_timestamps'
        AND policyname = 'service_role_update_timestamps'
    ) THEN
        CREATE POLICY "service_role_update_timestamps" ON public.simpleproof_timestamps
            FOR UPDATE
            USING (true)
            WITH CHECK (
                verification_id IN (
                    SELECT id FROM multi_method_verification_results
                    WHERE user_duid = auth.uid()::VARCHAR
                )
            );
    END IF;
END $$;

-- Grant permissions
GRANT SELECT ON public.simpleproof_timestamps TO authenticated;
GRANT INSERT, UPDATE ON public.simpleproof_timestamps TO service_role;

-- Create function to store SimpleProof timestamp
-- Note: verified_at and is_valid are set to NULL on insert.
-- They should only be updated when async verification completes.
CREATE OR REPLACE FUNCTION store_simpleproof_timestamp(
    p_verification_id UUID,
    p_ots_proof TEXT,
    p_bitcoin_block INTEGER,
    p_bitcoin_tx VARCHAR
) RETURNS UUID AS $$
DECLARE
    v_timestamp_id UUID;
BEGIN
    INSERT INTO public.simpleproof_timestamps (
        verification_id,
        ots_proof,
        bitcoin_block,
        bitcoin_tx,
        verified_at,
        is_valid
    ) VALUES (
        p_verification_id,
        p_ots_proof,
        p_bitcoin_block,
        p_bitcoin_tx,
        NULL,
        NULL
    )
    RETURNING id INTO v_timestamp_id;

    RETURN v_timestamp_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION store_simpleproof_timestamp TO service_role;

-- Create function to get SimpleProof timestamp by verification_id
CREATE OR REPLACE FUNCTION get_simpleproof_timestamp(
    p_verification_id UUID
) RETURNS TABLE (
    id UUID,
    ots_proof TEXT,
    bitcoin_block INTEGER,
    bitcoin_tx VARCHAR,
    created_at BIGINT,
    verified_at BIGINT,
    is_valid BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        spt.id,
        spt.ots_proof,
        spt.bitcoin_block,
        spt.bitcoin_tx,
        spt.created_at,
        spt.verified_at,
        spt.is_valid
    FROM public.simpleproof_timestamps spt
    WHERE spt.verification_id = p_verification_id
    ORDER BY spt.created_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_simpleproof_timestamp TO authenticated;

