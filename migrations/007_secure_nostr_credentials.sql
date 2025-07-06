-- Migration: Secure Nostr Credentials Table
-- Purpose: Store encrypted nsec credentials with temporary expiration
-- Security: AES-256-GCM encryption with unique salts and UUIDs

CREATE TABLE IF NOT EXISTS secure_nostr_credentials (
    -- Primary identification
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    credential_id UUID NOT NULL UNIQUE, -- Unique identifier for this credential
    
    -- Encryption components
    salt TEXT NOT NULL, -- Unique salt for PBKDF2 key derivation
    encrypted_nsec TEXT NOT NULL, -- AES-256-GCM encrypted nsec
    iv TEXT NOT NULL, -- Initialization vector
    tag TEXT NOT NULL, -- Authentication tag
    
    -- Metadata and expiration
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL, -- Temporary storage with expiration
    last_accessed_at TIMESTAMPTZ,
    access_count INTEGER DEFAULT 0,
    
    -- Security and audit
    is_revoked BOOLEAN DEFAULT FALSE,
    revoked_at TIMESTAMPTZ,
    revocation_reason TEXT,
    
    -- Indexes for performance and security
    CONSTRAINT unique_user_credential UNIQUE(user_id, credential_id)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_secure_nostr_credentials_user_id ON secure_nostr_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_secure_nostr_credentials_expires_at ON secure_nostr_credentials(expires_at);
CREATE INDEX IF NOT EXISTS idx_secure_nostr_credentials_credential_id ON secure_nostr_credentials(credential_id);

-- Row Level Security (RLS) policies
ALTER TABLE secure_nostr_credentials ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own credentials
CREATE POLICY "Users can access own credentials" ON secure_nostr_credentials
    FOR ALL USING (auth.uid() = user_id);

-- Policy: Credentials are automatically deleted when expired
CREATE POLICY "Expired credentials are not accessible" ON secure_nostr_credentials
    FOR ALL USING (expires_at > NOW() AND is_revoked = FALSE);

-- Function to automatically clean up expired credentials
CREATE OR REPLACE FUNCTION cleanup_expired_nostr_credentials()
RETURNS void AS $$
BEGIN
    DELETE FROM secure_nostr_credentials 
    WHERE expires_at < NOW() OR is_revoked = TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a scheduled job to clean up expired credentials (runs every hour)
SELECT cron.schedule(
    'cleanup-expired-nostr-credentials',
    '0 * * * *', -- Every hour
    'SELECT cleanup_expired_nostr_credentials();'
);

-- Function to revoke a credential
CREATE OR REPLACE FUNCTION revoke_nostr_credential(
    p_credential_id UUID,
    p_reason TEXT DEFAULT 'User requested revocation'
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE secure_nostr_credentials 
    SET 
        is_revoked = TRUE,
        revoked_at = NOW(),
        revocation_reason = p_reason
    WHERE credential_id = p_credential_id 
    AND user_id = auth.uid()
    AND expires_at > NOW();
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update access metadata
CREATE OR REPLACE FUNCTION update_credential_access(
    p_credential_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE secure_nostr_credentials 
    SET 
        last_accessed_at = NOW(),
        access_count = access_count + 1
    WHERE credential_id = p_credential_id 
    AND user_id = auth.uid()
    AND expires_at > NOW()
    AND is_revoked = FALSE;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON secure_nostr_credentials TO authenticated;
GRANT USAGE ON SEQUENCE secure_nostr_credentials_id_seq TO authenticated;

-- Create view for credential status (without sensitive data)
CREATE VIEW nostr_credential_status AS
SELECT 
    user_id,
    credential_id,
    created_at,
    expires_at,
    last_accessed_at,
    access_count,
    is_revoked,
    revoked_at,
    revocation_reason,
    CASE 
        WHEN expires_at < NOW() THEN 'expired'
        WHEN is_revoked = TRUE THEN 'revoked'
        ELSE 'active'
    END as status
FROM secure_nostr_credentials;

-- Grant read access to the status view
GRANT SELECT ON nostr_credential_status TO authenticated;

-- Add RLS policy for the view
ALTER VIEW nostr_credential_status SET (security_invoker = true);

-- Comments for documentation
COMMENT ON TABLE secure_nostr_credentials IS 'Secure storage for encrypted Nostr nsec credentials with temporary expiration';
COMMENT ON COLUMN secure_nostr_credentials.credential_id IS 'Unique UUID for this credential instance';
COMMENT ON COLUMN secure_nostr_credentials.salt IS 'Unique salt for PBKDF2 key derivation';
COMMENT ON COLUMN secure_nostr_credentials.encrypted_nsec IS 'AES-256-GCM encrypted nsec value';
COMMENT ON COLUMN secure_nostr_credentials.expires_at IS 'Automatic expiration time for temporary storage';
COMMENT ON COLUMN secure_nostr_credentials.access_count IS 'Number of times this credential has been accessed'; 