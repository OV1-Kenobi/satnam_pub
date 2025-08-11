-- OTP Secrets Table for Secure TOTP Authentication
-- Privacy-first design with encrypted secrets and replay protection

CREATE TABLE IF NOT EXISTS otp_secrets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_hash TEXT NOT NULL REFERENCES privacy_users(hashed_uuid) ON DELETE CASCADE,
    
    -- Encrypted TOTP secret (160-bit/20-byte secret encrypted with AES-256-GCM)
    encrypted_secret TEXT NOT NULL,
    secret_salt TEXT NOT NULL UNIQUE, -- Unique salt for secret encryption
    secret_iv TEXT NOT NULL UNIQUE,   -- Unique IV for secret encryption
    secret_tag TEXT NOT NULL,         -- Authentication tag for secret encryption
    
    -- TOTP Configuration
    algorithm TEXT NOT NULL DEFAULT 'SHA256' CHECK (algorithm IN ('SHA1', 'SHA256')),
    digits INTEGER NOT NULL DEFAULT 6 CHECK (digits IN (6, 8)),
    period INTEGER NOT NULL DEFAULT 120, -- 120-second time windows
    
    -- Replay Protection
    last_used_timestamp BIGINT, -- Unix timestamp of last successful use
    last_used_window BIGINT,    -- Time window of last successful use
    
    -- Rate Limiting and Security
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE, -- Account lockout timestamp
    last_attempt_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_rotation_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure one secret per user
    UNIQUE(user_hash)
);

-- OTP Attempt Log for Rate Limiting and Security Monitoring
CREATE TABLE IF NOT EXISTS otp_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_hash TEXT NOT NULL REFERENCES privacy_users(hashed_uuid) ON DELETE CASCADE,
    
    -- Attempt Details (no sensitive data stored)
    attempt_result TEXT NOT NULL CHECK (attempt_result IN ('success', 'invalid_code', 'expired', 'rate_limited', 'replay_detected')),
    time_window BIGINT NOT NULL, -- Time window attempted
    
    -- Security Context (hashed for privacy)
    client_info_hash TEXT, -- Hash of user agent + IP for anomaly detection
    
    -- Timestamps
    attempted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Index for efficient rate limiting queries
    INDEX idx_otp_attempts_user_time (user_hash, attempted_at),
    INDEX idx_otp_attempts_result (attempt_result, attempted_at)
);

-- Enable Row Level Security
ALTER TABLE otp_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_attempts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Note: OTP tables use privacy_users.hashed_uuid which requires custom context setting
-- This is necessary for privacy-first architecture where user_hash != auth.uid()
CREATE POLICY otp_secrets_policy ON otp_secrets
    FOR ALL
    USING (user_hash = current_setting('app.current_user_hash', true));

CREATE POLICY otp_attempts_policy ON otp_attempts
    FOR ALL
    USING (user_hash = current_setting('app.current_user_hash', true));

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_otp_secrets_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER otp_secrets_updated_at
    BEFORE UPDATE ON otp_secrets
    FOR EACH ROW
    EXECUTE FUNCTION update_otp_secrets_updated_at();

-- Function to clean up expired lockouts and old attempt logs
CREATE OR REPLACE FUNCTION cleanup_otp_security_data()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    -- Clear expired lockouts
    UPDATE otp_secrets 
    SET locked_until = NULL, failed_attempts = 0
    WHERE locked_until IS NOT NULL AND locked_until < NOW();
    
    -- Clean up old attempt logs (keep 30 days)
    DELETE FROM otp_attempts 
    WHERE attempted_at < NOW() - INTERVAL '30 days';
END;
$$;

-- Schedule cleanup function (if using pg_cron extension)
-- SELECT cron.schedule('cleanup-otp-security', '0 2 * * *', 'SELECT cleanup_otp_security_data();');

-- Comments for documentation
COMMENT ON TABLE otp_secrets IS 'Encrypted TOTP secrets for secure OTP authentication with replay protection';
COMMENT ON COLUMN otp_secrets.encrypted_secret IS 'AES-256-GCM encrypted 160-bit TOTP secret';
COMMENT ON COLUMN otp_secrets.period IS 'TOTP time window in seconds (default 120s for enhanced security)';
COMMENT ON COLUMN otp_secrets.last_used_window IS 'Last time window where OTP was successfully used (prevents replay)';
COMMENT ON TABLE otp_attempts IS 'Security log for OTP attempts with rate limiting support';
