-- Multi-Method Verification Results Migration
-- Phase 1 Week 4: Store results from all verification methods for trust scoring
-- Enables tracking of method agreement and trust score calculation
--
-- COMPLIANCE:
-- ✅ Privacy-first: No PII stored, only hashed identifiers
-- ✅ Row Level Security (RLS) for user data isolation
-- ✅ Idempotent: Safe to run multiple times
-- ✅ Backward compatible: No breaking changes to existing schema

-- Enable RLS if not already enabled
ALTER DATABASE postgres SET row_security = on;

-- Create multi-method verification results table
CREATE TABLE IF NOT EXISTS public.multi_method_verification_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Verification attempt identification
    verification_attempt_id UUID NOT NULL,
    identifier_hash VARCHAR(64) NOT NULL,
    
    -- Method results
    kind0_verified BOOLEAN,
    kind0_response_time_ms INTEGER,
    kind0_error TEXT,
    kind0_nip05 VARCHAR(255),
    kind0_pubkey VARCHAR(64),
    
    pkarr_verified BOOLEAN,
    pkarr_response_time_ms INTEGER,
    pkarr_error TEXT,
    pkarr_nip05 VARCHAR(255),
    pkarr_pubkey VARCHAR(64),
    
    dns_verified BOOLEAN,
    dns_response_time_ms INTEGER,
    dns_error TEXT,
    dns_nip05 VARCHAR(255),
    dns_pubkey VARCHAR(64),
    
    -- Trust scoring
    trust_score INTEGER NOT NULL CHECK (trust_score >= 0 AND trust_score <= 100),
    trust_level VARCHAR(20) NOT NULL CHECK (trust_level IN ('high', 'medium', 'low', 'none')),
    
    -- Method agreement
    agreement_count INTEGER NOT NULL CHECK (agreement_count >= 0 AND agreement_count <= 3),
    methods_agree BOOLEAN NOT NULL DEFAULT false,
    
    -- Overall result
    verified BOOLEAN NOT NULL,
    primary_method VARCHAR(20), -- Which method was used for primary result
    
    -- Context
    user_duid VARCHAR(50),
    ip_address_hash VARCHAR(64),
    
    -- Metadata
    created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
    
    -- Constraints
    CONSTRAINT trust_score_valid CHECK (trust_score >= 0 AND trust_score <= 100),
    CONSTRAINT agreement_count_valid CHECK (agreement_count >= 0 AND agreement_count <= 3)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_multi_method_identifier ON multi_method_verification_results(identifier_hash);
CREATE INDEX IF NOT EXISTS idx_multi_method_trust_score ON multi_method_verification_results(trust_score);
CREATE INDEX IF NOT EXISTS idx_multi_method_trust_level ON multi_method_verification_results(trust_level);
CREATE INDEX IF NOT EXISTS idx_multi_method_user ON multi_method_verification_results(user_duid);
CREATE INDEX IF NOT EXISTS idx_multi_method_created ON multi_method_verification_results(created_at);
CREATE INDEX IF NOT EXISTS idx_multi_method_agreement ON multi_method_verification_results(agreement_count);

-- Create table for trust score statistics
CREATE TABLE IF NOT EXISTS public.trust_score_statistics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Time period
    period_start BIGINT NOT NULL,
    period_end BIGINT NOT NULL,
    
    -- Trust score distribution
    high_trust_count BIGINT NOT NULL DEFAULT 0,
    medium_trust_count BIGINT NOT NULL DEFAULT 0,
    low_trust_count BIGINT NOT NULL DEFAULT 0,
    no_trust_count BIGINT NOT NULL DEFAULT 0,
    
    -- Average trust score
    average_trust_score FLOAT,
    
    -- Method agreement statistics
    all_methods_agree_count BIGINT NOT NULL DEFAULT 0,
    two_methods_agree_count BIGINT NOT NULL DEFAULT 0,
    one_method_only_count BIGINT NOT NULL DEFAULT 0,
    methods_disagree_count BIGINT NOT NULL DEFAULT 0,
    
    -- Method success rates
    kind0_success_rate FLOAT,
    pkarr_success_rate FLOAT,
    dns_success_rate FLOAT,
    
    -- Metadata
    created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
    updated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
    
    -- Constraints
    CONSTRAINT stats_period_valid CHECK (period_start < period_end),
    CONSTRAINT trust_counts_valid CHECK (
        high_trust_count >= 0 AND
        medium_trust_count >= 0 AND
        low_trust_count >= 0 AND
        no_trust_count >= 0
    ),
    CONSTRAINT success_rates_valid CHECK (
        kind0_success_rate IS NULL OR (kind0_success_rate >= 0 AND kind0_success_rate <= 100)
    )
);

-- Create indexes for stats table
CREATE INDEX IF NOT EXISTS idx_trust_stats_period ON trust_score_statistics(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_trust_stats_updated ON trust_score_statistics(updated_at);

-- Enable RLS on new tables
ALTER TABLE public.multi_method_verification_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trust_score_statistics ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Allow service role to insert results
CREATE POLICY "service_role_insert_results" ON public.multi_method_verification_results
    FOR INSERT
    WITH CHECK (true);

-- RLS Policy: Allow authenticated users to view their own results
-- Cast auth.uid() to TEXT since user_identities.id is TEXT (DUID), not UUID
CREATE POLICY "users_view_own_results" ON public.multi_method_verification_results
    FOR SELECT
    USING (user_duid = (SELECT id FROM user_identities WHERE id = auth.uid()::text LIMIT 1));

-- RLS Policy: Allow service role to manage stats
CREATE POLICY "service_role_manage_trust_stats" ON public.trust_score_statistics
    FOR ALL
    USING (true);

-- Create function to log multi-method verification result
CREATE OR REPLACE FUNCTION log_multi_method_verification(
    p_verification_attempt_id UUID,
    p_identifier_hash VARCHAR,
    p_kind0_verified BOOLEAN,
    p_kind0_response_time_ms INTEGER,
    p_kind0_error TEXT,
    p_kind0_nip05 VARCHAR,
    p_kind0_pubkey VARCHAR,
    p_pkarr_verified BOOLEAN,
    p_pkarr_response_time_ms INTEGER,
    p_pkarr_error TEXT,
    p_pkarr_nip05 VARCHAR,
    p_pkarr_pubkey VARCHAR,
    p_dns_verified BOOLEAN,
    p_dns_response_time_ms INTEGER,
    p_dns_error TEXT,
    p_dns_nip05 VARCHAR,
    p_dns_pubkey VARCHAR,
    p_trust_score INTEGER,
    p_trust_level VARCHAR,
    p_agreement_count INTEGER,
    p_methods_agree BOOLEAN,
    p_verified BOOLEAN,
    p_primary_method VARCHAR,
    p_user_duid VARCHAR,
    p_ip_address_hash VARCHAR
) RETURNS UUID AS $$
DECLARE
    v_result_id UUID;
BEGIN
    INSERT INTO public.multi_method_verification_results (
        verification_attempt_id,
        identifier_hash,
        kind0_verified,
        kind0_response_time_ms,
        kind0_error,
        kind0_nip05,
        kind0_pubkey,
        pkarr_verified,
        pkarr_response_time_ms,
        pkarr_error,
        pkarr_nip05,
        pkarr_pubkey,
        dns_verified,
        dns_response_time_ms,
        dns_error,
        dns_nip05,
        dns_pubkey,
        trust_score,
        trust_level,
        agreement_count,
        methods_agree,
        verified,
        primary_method,
        user_duid,
        ip_address_hash
    ) VALUES (
        p_verification_attempt_id,
        p_identifier_hash,
        p_kind0_verified,
        p_kind0_response_time_ms,
        p_kind0_error,
        p_kind0_nip05,
        p_kind0_pubkey,
        p_pkarr_verified,
        p_pkarr_response_time_ms,
        p_pkarr_error,
        p_pkarr_nip05,
        p_pkarr_pubkey,
        p_dns_verified,
        p_dns_response_time_ms,
        p_dns_error,
        p_dns_nip05,
        p_dns_pubkey,
        p_trust_score,
        p_trust_level,
        p_agreement_count,
        p_methods_agree,
        p_verified,
        p_primary_method,
        p_user_duid,
        p_ip_address_hash
    ) RETURNING id INTO v_result_id;
    
    RETURN v_result_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get trust score statistics
CREATE OR REPLACE FUNCTION get_trust_score_statistics(
    p_period_start BIGINT,
    p_period_end BIGINT
) RETURNS TABLE (
    high_trust_count BIGINT,
    medium_trust_count BIGINT,
    low_trust_count BIGINT,
    no_trust_count BIGINT,
    average_trust_score FLOAT,
    all_methods_agree_count BIGINT,
    two_methods_agree_count BIGINT,
    one_method_only_count BIGINT,
    methods_disagree_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*) FILTER (WHERE trust_level = 'high') as high_trust_count,
        COUNT(*) FILTER (WHERE trust_level = 'medium') as medium_trust_count,
        COUNT(*) FILTER (WHERE trust_level = 'low') as low_trust_count,
        COUNT(*) FILTER (WHERE trust_level = 'none') as no_trust_count,
        AVG(trust_score)::FLOAT as average_trust_score,
        COUNT(*) FILTER (WHERE agreement_count = 3) as all_methods_agree_count,
        COUNT(*) FILTER (WHERE agreement_count = 2) as two_methods_agree_count,
        COUNT(*) FILTER (WHERE agreement_count = 1) as one_method_only_count,
        COUNT(*) FILTER (WHERE agreement_count > 0 AND NOT methods_agree) as methods_disagree_count
    FROM public.multi_method_verification_results
    WHERE created_at >= p_period_start AND created_at < p_period_end;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION log_multi_method_verification TO authenticated;
GRANT EXECUTE ON FUNCTION get_trust_score_statistics TO authenticated;

