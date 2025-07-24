-- NIP-05/Password Authentication Schema
-- Privacy-first design with encrypted password storage and NIP-05 domain validation

CREATE TABLE IF NOT EXISTS nip05_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_hash TEXT NOT NULL REFERENCES privacy_users(hashed_uuid) ON DELETE CASCADE,
    
    -- NIP-05 Identifier (hashed for privacy)
    nip05_hash TEXT NOT NULL UNIQUE, -- SHA-256 hash of NIP-05 identifier
    domain_hash TEXT NOT NULL, -- SHA-256 hash of domain for whitelist validation
    
    -- Encrypted Password Storage
    encrypted_password TEXT NOT NULL, -- AES-256-GCM encrypted password hash
    password_salt TEXT NOT NULL UNIQUE, -- Unique salt for password hashing
    password_iv TEXT NOT NULL UNIQUE, -- Unique IV for password encryption
    password_tag TEXT NOT NULL, -- Authentication tag for password encryption
    
    -- Password Security Metadata
    password_algorithm TEXT NOT NULL DEFAULT 'SHA256' CHECK (password_algorithm IN ('SHA256')),
    salt_rounds INTEGER NOT NULL DEFAULT 12, -- For future PBKDF2 implementation if needed
    
    -- Account Security
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE, -- Account lockout timestamp
    last_attempt_at TIMESTAMP WITH TIME ZONE,
    last_successful_auth TIMESTAMP WITH TIME ZONE,
    
    -- Password Management
    password_created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    password_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    requires_password_change BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure one credential set per user
    UNIQUE(user_hash)
);

-- NIP-05 Authentication Attempts Log
CREATE TABLE IF NOT EXISTS nip05_auth_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_hash TEXT REFERENCES privacy_users(hashed_uuid) ON DELETE CASCADE,
    nip05_hash TEXT, -- May be null for invalid attempts
    
    -- Attempt Details (no sensitive data stored)
    attempt_result TEXT NOT NULL CHECK (attempt_result IN ('success', 'invalid_nip05', 'invalid_password', 'domain_not_whitelisted', 'rate_limited', 'account_locked')),
    domain_hash TEXT, -- Hash of attempted domain
    
    -- Security Context (hashed for privacy)
    client_info_hash TEXT, -- Hash of user agent + IP for anomaly detection
    
    -- Timestamps
    attempted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Indexes for efficient rate limiting and security monitoring
    INDEX idx_nip05_attempts_user_time (user_hash, attempted_at),
    INDEX idx_nip05_attempts_result (attempt_result, attempted_at),
    INDEX idx_nip05_attempts_domain (domain_hash, attempted_at)
);

-- Domain Whitelist Table (for NIP-05 domain validation)
CREATE TABLE IF NOT EXISTS nip05_domain_whitelist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain TEXT NOT NULL UNIQUE, -- Plaintext domain for admin management
    domain_hash TEXT NOT NULL UNIQUE, -- SHA-256 hash for privacy-preserving lookups
    
    -- Domain Status
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    verification_required BOOLEAN NOT NULL DEFAULT TRUE, -- Require actual NIP-05 verification
    
    -- Admin Management
    added_by TEXT, -- Admin identifier who added this domain
    notes TEXT, -- Admin notes about this domain
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default whitelisted domains
INSERT INTO nip05_domain_whitelist (domain, domain_hash, notes) VALUES 
('satnam.pub', encode(sha256('satnam.pub'::bytea), 'hex'), 'Primary Satnam domain'),
('citadel.academy', encode(sha256('citadel.academy'::bytea), 'hex'), 'Citadel Academy domain')
ON CONFLICT (domain) DO NOTHING;

-- Enable Row Level Security
ALTER TABLE nip05_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE nip05_auth_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE nip05_domain_whitelist ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY nip05_credentials_policy ON nip05_credentials
    FOR ALL
    USING (user_hash = current_setting('app.current_user_hash', true));

CREATE POLICY nip05_attempts_policy ON nip05_auth_attempts
    FOR ALL
    USING (user_hash = current_setting('app.current_user_hash', true) OR user_hash IS NULL);

-- Domain whitelist is read-only for non-admin users
CREATE POLICY nip05_domain_whitelist_policy ON nip05_domain_whitelist
    FOR SELECT
    USING (true); -- Allow all users to read whitelist for validation

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_nip05_credentials_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER nip05_credentials_updated_at
    BEFORE UPDATE ON nip05_credentials
    FOR EACH ROW
    EXECUTE FUNCTION update_nip05_credentials_updated_at();

-- Function to clean up expired lockouts and old attempt logs
CREATE OR REPLACE FUNCTION cleanup_nip05_security_data()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    -- Clear expired lockouts
    UPDATE nip05_credentials 
    SET locked_until = NULL, failed_attempts = 0
    WHERE locked_until IS NOT NULL AND locked_until < NOW();
    
    -- Clean up old attempt logs (keep 30 days)
    DELETE FROM nip05_auth_attempts 
    WHERE attempted_at < NOW() - INTERVAL '30 days';
END;
$$;

-- Helper function to validate domain whitelist
CREATE OR REPLACE FUNCTION is_domain_whitelisted(domain_to_check TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
    domain_exists BOOLEAN;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM nip05_domain_whitelist 
        WHERE domain = domain_to_check AND is_active = TRUE
    ) INTO domain_exists;
    
    RETURN domain_exists;
END;
$$;

-- Comments for documentation
COMMENT ON TABLE nip05_credentials IS 'Encrypted NIP-05/password credentials with privacy-first design';
COMMENT ON COLUMN nip05_credentials.nip05_hash IS 'SHA-256 hash of NIP-05 identifier for privacy';
COMMENT ON COLUMN nip05_credentials.encrypted_password IS 'AES-256-GCM encrypted password hash';
COMMENT ON COLUMN nip05_credentials.domain_hash IS 'SHA-256 hash of domain for whitelist validation';
COMMENT ON TABLE nip05_auth_attempts IS 'Security log for NIP-05 authentication attempts';
COMMENT ON TABLE nip05_domain_whitelist IS 'Whitelisted domains for NIP-05 authentication';
