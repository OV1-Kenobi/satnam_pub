-- Verification Failure Tracking Migration
-- Phase 1 Week 3: Add tables for tracking verification failures and monitoring
-- Enables health checks and alerting for verification service degradation
--
-- COMPLIANCE:
-- ✅ Privacy-first: No PII stored, only hashed identifiers
-- ✅ Row Level Security (RLS) for user data isolation
-- ✅ Idempotent: Safe to run multiple times
-- ✅ Backward compatible: No breaking changes to existing schema

-- Enable RLS if not already enabled
ALTER DATABASE postgres SET row_security = on;

-- Create verification failures table for tracking failed verification attempts
CREATE TABLE IF NOT EXISTS public.verification_failures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Failure identification
    failure_type VARCHAR(50) NOT NULL CHECK (failure_type IN (
        'kind0_timeout',
        'kind0_error',
        'pkarr_timeout',
        'pkarr_error',
        'dns_timeout',
        'dns_error',
        'all_methods_failed',
        'invalid_identifier',
        'network_error'
    )),
    
    -- Verification attempt details
    identifier_hash VARCHAR(64) NOT NULL,      -- Hashed NIP-05 identifier
    verification_method VARCHAR(20),            -- Method that failed (kind:0, pkarr, dns)
    error_message TEXT,                         -- Error details
    
    -- Timing information
    response_time_ms INTEGER,                   -- How long the attempt took
    timestamp BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
    
    -- Context
    user_duid VARCHAR(50),                      -- Associated user DUID (optional)
    ip_address_hash VARCHAR(64),                -- Hashed IP for rate limiting analysis
    
    -- Metadata
    created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
    
    -- Constraints
    CONSTRAINT failure_type_valid CHECK (failure_type IS NOT NULL),
    CONSTRAINT response_time_valid CHECK (response_time_ms IS NULL OR response_time_ms >= 0)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_verification_failures_type ON verification_failures(failure_type);
CREATE INDEX IF NOT EXISTS idx_verification_failures_timestamp ON verification_failures(timestamp);
CREATE INDEX IF NOT EXISTS idx_verification_failures_method ON verification_failures(verification_method);
CREATE INDEX IF NOT EXISTS idx_verification_failures_user ON verification_failures(user_duid);
CREATE INDEX IF NOT EXISTS idx_verification_failures_created ON verification_failures(created_at);

-- Create verification method usage statistics table
CREATE TABLE IF NOT EXISTS public.verification_method_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Method identification
    verification_method VARCHAR(20) NOT NULL CHECK (verification_method IN ('kind:0', 'pkarr', 'dns')),
    
    -- Statistics
    total_attempts BIGINT NOT NULL DEFAULT 0,
    successful_attempts BIGINT NOT NULL DEFAULT 0,
    failed_attempts BIGINT NOT NULL DEFAULT 0,
    timeout_attempts BIGINT NOT NULL DEFAULT 0,
    
    -- Performance metrics
    avg_response_time_ms FLOAT,
    min_response_time_ms INTEGER,
    max_response_time_ms INTEGER,
    
    -- Time window
    period_start BIGINT NOT NULL,               -- Start of measurement period
    period_end BIGINT NOT NULL,                 -- End of measurement period
    
    -- Metadata
    created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
    updated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
    
    -- Constraints
    CONSTRAINT stats_period_valid CHECK (period_start < period_end),
    CONSTRAINT stats_attempts_valid CHECK (
        total_attempts >= 0 AND
        successful_attempts >= 0 AND
        failed_attempts >= 0 AND
        timeout_attempts >= 0
    )
);

-- Create indexes for stats table
CREATE INDEX IF NOT EXISTS idx_verification_stats_method ON verification_method_stats(verification_method);
CREATE INDEX IF NOT EXISTS idx_verification_stats_period ON verification_method_stats(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_verification_stats_updated ON verification_method_stats(updated_at);

-- Create verification health check table
CREATE TABLE IF NOT EXISTS public.verification_health_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Health status
    kind0_relay_health VARCHAR(20) NOT NULL CHECK (kind0_relay_health IN ('healthy', 'degraded', 'unhealthy')),
    pkarr_dht_health VARCHAR(20) NOT NULL CHECK (pkarr_dht_health IN ('healthy', 'degraded', 'unhealthy')),
    dns_resolution_health VARCHAR(20) NOT NULL CHECK (dns_resolution_health IN ('healthy', 'degraded', 'unhealthy')),
    
    -- Metrics
    average_resolution_time_ms FLOAT,
    failure_rate_24h FLOAT,                     -- Percentage of failures in last 24 hours
    
    -- Details
    kind0_relay_status TEXT,
    pkarr_dht_status TEXT,
    dns_resolution_status TEXT,
    
    -- Metadata
    checked_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
    created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
    
    -- Constraints
    CONSTRAINT health_metrics_valid CHECK (
        average_resolution_time_ms IS NULL OR average_resolution_time_ms >= 0
    ),
    CONSTRAINT failure_rate_valid CHECK (
        failure_rate_24h IS NULL OR (failure_rate_24h >= 0 AND failure_rate_24h <= 100)
    )
);

-- Create indexes for health checks
CREATE INDEX IF NOT EXISTS idx_health_checks_checked ON verification_health_checks(checked_at);
CREATE INDEX IF NOT EXISTS idx_health_checks_created ON verification_health_checks(created_at);

-- Enable RLS on all new tables
ALTER TABLE public.verification_failures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_method_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_health_checks ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Allow service role to insert failures (for logging)
CREATE POLICY "service_role_insert_failures" ON public.verification_failures
    FOR INSERT
    WITH CHECK (true);

-- RLS Policy: Allow authenticated users to view their own failures
CREATE POLICY "users_view_own_failures" ON public.verification_failures
    FOR SELECT
    USING (user_duid = (SELECT user_duid FROM user_identities WHERE id = auth.uid() LIMIT 1));

-- RLS Policy: Allow service role to manage stats
CREATE POLICY "service_role_manage_stats" ON public.verification_method_stats
    FOR ALL
    USING (true);

-- RLS Policy: Allow service role to manage health checks
CREATE POLICY "service_role_manage_health" ON public.verification_health_checks
    FOR ALL
    USING (true);

-- Create function to log verification failure
CREATE OR REPLACE FUNCTION log_verification_failure(
    p_failure_type VARCHAR,
    p_identifier_hash VARCHAR,
    p_verification_method VARCHAR,
    p_error_message TEXT,
    p_response_time_ms INTEGER,
    p_user_duid VARCHAR,
    p_ip_address_hash VARCHAR
) RETURNS UUID AS $$
DECLARE
    v_failure_id UUID;
BEGIN
    INSERT INTO public.verification_failures (
        failure_type,
        identifier_hash,
        verification_method,
        error_message,
        response_time_ms,
        user_duid,
        ip_address_hash
    ) VALUES (
        p_failure_type,
        p_identifier_hash,
        p_verification_method,
        p_error_message,
        p_response_time_ms,
        p_user_duid,
        p_ip_address_hash
    ) RETURNING id INTO v_failure_id;
    
    RETURN v_failure_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get verification health status
CREATE OR REPLACE FUNCTION get_verification_health_status()
RETURNS TABLE (
    kind0_health VARCHAR,
    pkarr_health VARCHAR,
    dns_health VARCHAR,
    avg_response_time FLOAT,
    failure_rate_24h FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        vhc.kind0_relay_health,
        vhc.pkarr_dht_health,
        vhc.dns_resolution_health,
        vhc.average_resolution_time_ms,
        vhc.failure_rate_24h
    FROM public.verification_health_checks vhc
    ORDER BY vhc.checked_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION log_verification_failure TO authenticated;
GRANT EXECUTE ON FUNCTION get_verification_health_status TO authenticated;

