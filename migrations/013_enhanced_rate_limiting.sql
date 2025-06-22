-- Enhanced Rate Limiting System for OTP Security
-- Migration: 013_enhanced_rate_limiting.sql

-- Create rate limiting tables
CREATE TABLE IF NOT EXISTS security_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rate_limit_key TEXT NOT NULL,
    identifier TEXT,
    hit_count INTEGER DEFAULT 1,
    window_start TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add unique constraint for ON CONFLICT clause
CREATE UNIQUE INDEX IF NOT EXISTS idx_security_rate_limits_key_window_unique 
    ON security_rate_limits(rate_limit_key, window_start);

-- Create rate limit violations log
CREATE TABLE IF NOT EXISTS security_rate_limit_violations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rate_limit_key TEXT NOT NULL,
    ip_address INET,
    user_agent TEXT,
    identifier TEXT,
    violated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_security_rate_limits_key_window 
    ON security_rate_limits(rate_limit_key, window_start);
CREATE INDEX IF NOT EXISTS idx_security_rate_limits_created_at 
    ON security_rate_limits(created_at);
CREATE INDEX IF NOT EXISTS idx_security_rate_limit_violations_violated_at 
    ON security_rate_limit_violations(violated_at);
CREATE INDEX IF NOT EXISTS idx_security_rate_limit_violations_key 
    ON security_rate_limit_violations(rate_limit_key);

-- Function to check and increment rate limit
CREATE OR REPLACE FUNCTION check_rate_limit(
    p_key TEXT,
    p_window_start TIMESTAMPTZ,
    p_max_requests INTEGER,
    p_identifier TEXT DEFAULT NULL
)
RETURNS TABLE(total_hits INTEGER) AS $$
DECLARE
    current_hits INTEGER := 0;
    lock_id BIGINT;
BEGIN
    -- Create a unique lock ID from the key
    lock_id := hashtext(p_key)::BIGINT;
    
    -- Acquire advisory lock to prevent race conditions
    PERFORM pg_advisory_xact_lock(lock_id);
    
    -- Clean up old entries first (batch delete for performance)
    DELETE FROM security_rate_limits 
    WHERE id IN (
        SELECT id FROM security_rate_limits
        WHERE rate_limit_key = p_key 
        AND window_start < p_window_start
        LIMIT 100
    );
    
    -- Insert or update the current window entry atomically
    INSERT INTO security_rate_limits (
        rate_limit_key, 
        identifier, 
        hit_count, 
        window_start,
        updated_at
    ) VALUES (
        p_key, 
        p_identifier, 
        1, 
        p_window_start,
        NOW()
    )
    ON CONFLICT (rate_limit_key, window_start) 
    DO UPDATE SET 
        hit_count = security_rate_limits.hit_count + 1,
        updated_at = NOW()
    RETURNING hit_count INTO current_hits;
    
    -- Return the total hits after this increment
    RETURN QUERY SELECT current_hits;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get rate limit status without incrementing
CREATE OR REPLACE FUNCTION get_rate_limit_status(
    p_key TEXT,
    p_window_start TIMESTAMPTZ
)
RETURNS TABLE(total_hits INTEGER, oldest_hit TIMESTAMPTZ) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(SUM(hit_count), 0)::INTEGER as total_hits,
        MIN(window_start) as oldest_hit
    FROM security_rate_limits
    WHERE rate_limit_key = p_key 
    AND window_start >= p_window_start;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean up old rate limit entries
CREATE OR REPLACE FUNCTION cleanup_rate_limits(
    p_cutoff_time TIMESTAMPTZ DEFAULT NOW() - INTERVAL '24 hours',
    p_batch_size INTEGER DEFAULT 1000
)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER := 0;
    batch_deleted INTEGER;
BEGIN
    -- Clean up old rate limit entries in batches
    LOOP
        DELETE FROM security_rate_limits 
        WHERE id IN (
            SELECT id FROM security_rate_limits
            WHERE created_at < p_cutoff_time
            LIMIT p_batch_size
        );
        
        GET DIAGNOSTICS batch_deleted = ROW_COUNT;
        deleted_count := deleted_count + batch_deleted;
        
        -- Exit loop if no more rows to delete
        EXIT WHEN batch_deleted = 0;
        
        -- Small delay to prevent overwhelming the database
        PERFORM pg_sleep(0.1);
    END LOOP;
    
    -- Clean up old violation logs in batches
    LOOP
        DELETE FROM security_rate_limit_violations 
        WHERE id IN (
            SELECT id FROM security_rate_limit_violations
            WHERE violated_at < p_cutoff_time
            LIMIT p_batch_size
        );
        
        GET DIAGNOSTICS batch_deleted = ROW_COUNT;
        
        -- Exit loop if no more rows to delete
        EXIT WHEN batch_deleted = 0;
        
        -- Small delay to prevent overwhelming the database
        PERFORM pg_sleep(0.1);
    END LOOP;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add RLS policies
ALTER TABLE security_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_rate_limit_violations ENABLE ROW LEVEL SECURITY;

-- Allow service role to manage rate limits
CREATE POLICY "Service role can manage rate limits" ON security_rate_limits
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage rate limit violations" ON security_rate_limit_violations
    FOR ALL USING (auth.role() = 'service_role');

-- Grant permissions to service role
GRANT ALL ON security_rate_limits TO service_role;
GRANT ALL ON security_rate_limit_violations TO service_role;
GRANT EXECUTE ON FUNCTION check_rate_limit TO service_role;
GRANT EXECUTE ON FUNCTION get_rate_limit_status TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_rate_limits TO service_role;

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_security_rate_limits_updated_at
    BEFORE UPDATE ON security_rate_limits
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create security audit log table
CREATE TABLE IF NOT EXISTS security_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for security audit log
CREATE INDEX IF NOT EXISTS idx_security_audit_log_event_type 
    ON security_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_timestamp 
    ON security_audit_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_ip_address 
    ON security_audit_log(ip_address);

-- Add RLS policy for security audit log
ALTER TABLE security_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage security audit log" ON security_audit_log
    FOR ALL USING (auth.role() = 'service_role');

-- Grant permissions to service role
GRANT ALL ON security_audit_log TO service_role;

-- Function to clean up old audit logs
CREATE OR REPLACE FUNCTION cleanup_security_audit_log(
    p_cutoff_time TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
    p_batch_size INTEGER DEFAULT 1000
)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER := 0;
    batch_deleted INTEGER;
BEGIN
    -- Clean up old audit logs in batches
    LOOP
        DELETE FROM security_audit_log 
        WHERE id IN (
            SELECT id FROM security_audit_log
            WHERE timestamp < p_cutoff_time
            LIMIT p_batch_size
        );
        
        GET DIAGNOSTICS batch_deleted = ROW_COUNT;
        deleted_count := deleted_count + batch_deleted;
        
        -- Exit loop if no more rows to delete
        EXIT WHEN batch_deleted = 0;
        
        -- Small delay to prevent overwhelming the database
        PERFORM pg_sleep(0.1);
    END LOOP;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION cleanup_security_audit_log TO service_role;

-- Add comments for documentation
COMMENT ON TABLE security_rate_limits IS 'Tracks rate limiting counters for various endpoints';
COMMENT ON TABLE security_rate_limit_violations IS 'Logs rate limit violations for security monitoring';
COMMENT ON TABLE security_audit_log IS 'Comprehensive security event logging for monitoring and forensics';
COMMENT ON FUNCTION check_rate_limit IS 'Checks and increments rate limit counter, returns total hits';
COMMENT ON FUNCTION get_rate_limit_status IS 'Gets current rate limit status without incrementing';
COMMENT ON FUNCTION cleanup_rate_limits IS 'Cleans up old rate limit entries and violation logs';
COMMENT ON FUNCTION cleanup_security_audit_log IS 'Cleans up old security audit log entries';