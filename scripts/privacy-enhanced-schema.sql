-- Privacy-Enhanced Database Schema for Family Nostr Protection
-- Implements encrypted storage for sensitive data with zero-knowledge principles

-- Enhanced profiles table with encrypted sensitive data
CREATE TABLE IF NOT EXISTS secure_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_uuid UUID NOT NULL UNIQUE,
    
    -- Encrypted and hashed username
    username_hash TEXT NOT NULL,
    username_salt TEXT NOT NULL,
    username_uuid UUID NOT NULL UNIQUE,
    
    -- Encrypted Nostr keys
    encrypted_npub TEXT,
    npub_salt TEXT,
    npub_iv TEXT,
    npub_tag TEXT,
    
    encrypted_nsec TEXT,
    nsec_salt TEXT,
    nsec_iv TEXT,
    nsec_tag TEXT,
    nsec_key_id UUID,
    
    -- Encrypted additional data
    encrypted_nip05 TEXT,
    nip05_salt TEXT,
    nip05_iv TEXT,
    nip05_tag TEXT,
    
    encrypted_lightning_address TEXT,
    lightning_salt TEXT,
    lightning_iv TEXT,
    lightning_tag TEXT,
    
    -- Family association (encrypted)
    encrypted_family_id TEXT,
    family_salt TEXT,
    family_iv TEXT,
    family_tag TEXT,
    family_uuid UUID,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_key_rotation TIMESTAMP WITH TIME ZONE,
    
    -- Privacy settings
    privacy_level INTEGER NOT NULL DEFAULT 3, -- 1=basic, 2=enhanced, 3=maximum
    zero_knowledge_enabled BOOLEAN NOT NULL DEFAULT true
);

-- Enhanced federated events with encrypted content
CREATE TABLE IF NOT EXISTS secure_federated_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_uuid UUID NOT NULL UNIQUE,
    
    -- Encrypted family identification
    encrypted_family_id TEXT NOT NULL,
    family_salt TEXT NOT NULL,
    family_iv TEXT NOT NULL,
    family_tag TEXT NOT NULL,
    
    event_type TEXT NOT NULL CHECK (event_type IN ('family_announcement', 'payment_request', 'member_update', 'coordination')),
    
    -- Encrypted content
    encrypted_content TEXT NOT NULL,
    content_salt TEXT NOT NULL,
    content_iv TEXT NOT NULL,
    content_tag TEXT NOT NULL,
    
    -- Author information (encrypted)
    encrypted_author_id TEXT NOT NULL,
    author_salt TEXT NOT NULL,
    author_iv TEXT NOT NULL,
    author_tag TEXT NOT NULL,
    
    encrypted_author_pubkey TEXT NOT NULL,
    pubkey_salt TEXT NOT NULL,
    pubkey_iv TEXT NOT NULL,
    pubkey_tag TEXT NOT NULL,
    
    signatures_required INTEGER NOT NULL DEFAULT 1,
    signatures_received INTEGER NOT NULL DEFAULT 0,
    
    -- Encrypted member signatures
    encrypted_member_signatures TEXT NOT NULL DEFAULT '{}',
    signatures_salt TEXT NOT NULL,
    signatures_iv TEXT NOT NULL,
    signatures_tag TEXT NOT NULL,
    
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'signed', 'broadcast', 'expired')),
    nostr_event_id TEXT,
    broadcast_timestamp TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enhanced family guardians with encrypted data
CREATE TABLE IF NOT EXISTS secure_family_guardians (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guardian_uuid UUID NOT NULL UNIQUE,
    
    -- Encrypted guardian identification
    encrypted_guardian_id TEXT NOT NULL,
    guardian_id_salt TEXT NOT NULL,
    guardian_id_iv TEXT NOT NULL,
    guardian_id_tag TEXT NOT NULL,
    
    -- Encrypted family association
    encrypted_family_id TEXT NOT NULL,
    family_salt TEXT NOT NULL,
    family_iv TEXT NOT NULL,
    family_tag TEXT NOT NULL,
    
    -- Encrypted public key
    encrypted_public_key TEXT NOT NULL,
    pubkey_salt TEXT NOT NULL,
    pubkey_iv TEXT NOT NULL,
    pubkey_tag TEXT NOT NULL,
    
    -- Encrypted contact information (optional)
    encrypted_email TEXT,
    email_salt TEXT,
    email_iv TEXT,
    email_tag TEXT,
    
    encrypted_nostr_pubkey TEXT,
    nostr_pubkey_salt TEXT,
    nostr_pubkey_iv TEXT,
    nostr_pubkey_tag TEXT,
    
    role TEXT NOT NULL CHECK (role IN ('parent', 'trusted_contact', 'family_friend')),
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Privacy metadata
    privacy_consent_given BOOLEAN NOT NULL DEFAULT false,
    consent_timestamp TIMESTAMP WITH TIME ZONE,
    data_retention_days INTEGER DEFAULT 365
);

-- Enhanced guardian shards with maximum encryption
CREATE TABLE IF NOT EXISTS secure_guardian_shards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shard_uuid UUID NOT NULL UNIQUE,
    
    -- Encrypted guardian identification
    encrypted_guardian_id TEXT NOT NULL,
    guardian_id_salt TEXT NOT NULL,
    guardian_id_iv TEXT NOT NULL,
    guardian_id_tag TEXT NOT NULL,
    
    -- Federation identification
    encrypted_federation_id TEXT NOT NULL,
    federation_salt TEXT NOT NULL,
    federation_iv TEXT NOT NULL,
    federation_tag TEXT NOT NULL,
    
    -- Heavily encrypted shard data (double encryption)
    encrypted_shard_data TEXT NOT NULL, -- Base64 encoded encrypted shard
    shard_salt TEXT NOT NULL,
    shard_iv TEXT NOT NULL,
    shard_tag TEXT NOT NULL,
    
    -- Additional encryption layer for ultra-sensitive key shards
    double_encrypted_shard TEXT NOT NULL,
    double_salt TEXT NOT NULL,
    double_iv TEXT NOT NULL,
    double_tag TEXT NOT NULL,
    
    shard_index INTEGER NOT NULL,
    threshold_required INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Auto-expiration for security
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '1 year'),
    
    -- Access tracking
    last_accessed TIMESTAMP WITH TIME ZONE,
    access_count INTEGER DEFAULT 0,
    
    UNIQUE(encrypted_guardian_id, encrypted_federation_id, shard_index)
);

-- Privacy audit log
CREATE TABLE IF NOT EXISTS privacy_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    action TEXT NOT NULL CHECK (action IN ('encrypt', 'decrypt', 'hash', 'verify', 'access', 'create', 'update', 'delete')),
    data_type TEXT NOT NULL CHECK (data_type IN ('nsec', 'npub', 'username', 'family_data', 'guardian_shard', 'profile', 'event')),
    
    -- User context (encrypted)
    encrypted_user_id TEXT,
    user_salt TEXT,
    user_iv TEXT,
    user_tag TEXT,
    
    -- Family context (encrypted)
    encrypted_family_id TEXT,
    family_salt TEXT,
    family_iv TEXT,
    family_tag TEXT,
    
    success BOOLEAN NOT NULL,
    error_message TEXT,
    
    -- Network context
    ip_address_hash TEXT, -- Hashed for privacy
    user_agent_hash TEXT, -- Hashed for privacy
    
    -- Additional security metadata
    encryption_version TEXT DEFAULT '1.0',
    key_rotation_id UUID,
    
    -- Retention (auto-delete after period)
    retention_expires TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '90 days')
);

-- Family nostr protection with enhanced encryption
CREATE TABLE IF NOT EXISTS secure_family_nostr_protection (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    protection_uuid UUID NOT NULL UNIQUE,
    
    -- Encrypted family member identification
    encrypted_family_member_id TEXT NOT NULL,
    member_id_salt TEXT NOT NULL,
    member_id_iv TEXT NOT NULL,
    member_id_tag TEXT NOT NULL,
    
    -- Encrypted user association
    encrypted_user_id TEXT NOT NULL,
    user_salt TEXT NOT NULL,
    user_iv TEXT NOT NULL,
    user_tag TEXT NOT NULL,
    
    -- Encrypted federation identification
    encrypted_federation_id TEXT NOT NULL,
    federation_salt TEXT NOT NULL,
    federation_iv TEXT NOT NULL,
    federation_tag TEXT NOT NULL,
    
    guardian_count INTEGER NOT NULL,
    threshold_required INTEGER NOT NULL,
    protection_active BOOLEAN NOT NULL DEFAULT true,
    nsec_shards_stored BOOLEAN NOT NULL DEFAULT false,
    
    -- Recovery tracking
    last_recovery_at TIMESTAMP WITH TIME ZONE,
    recovery_count INTEGER NOT NULL DEFAULT 0,
    max_recovery_attempts INTEGER DEFAULT 5,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Auto-expiration and key rotation
    protection_expires TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '2 years'),
    key_rotation_due TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '6 months'),
    
    -- Privacy controls
    zero_knowledge_recovery BOOLEAN NOT NULL DEFAULT true,
    require_biometric_auth BOOLEAN DEFAULT false,
    
    UNIQUE(encrypted_family_member_id, encrypted_user_id)
);

-- Enhanced signing sessions with encrypted data
CREATE TABLE IF NOT EXISTS secure_federated_signing_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_uuid UUID NOT NULL UNIQUE,
    
    -- Encrypted session identification
    encrypted_session_id TEXT NOT NULL,
    session_salt TEXT NOT NULL,
    session_iv TEXT NOT NULL,
    session_tag TEXT NOT NULL,
    
    -- Encrypted event reference
    encrypted_event_id TEXT NOT NULL,
    event_salt TEXT NOT NULL,
    event_iv TEXT NOT NULL,
    event_tag TEXT NOT NULL,
    
    -- Encrypted family identification
    encrypted_family_id TEXT NOT NULL,
    family_salt TEXT NOT NULL,
    family_iv TEXT NOT NULL,
    family_tag TEXT NOT NULL,
    
    event_type TEXT NOT NULL,
    
    -- Encrypted initiator information
    encrypted_initiator TEXT NOT NULL,
    initiator_salt TEXT NOT NULL,
    initiator_iv TEXT NOT NULL,
    initiator_tag TEXT NOT NULL,
    
    encrypted_initiator_pubkey TEXT NOT NULL,
    pubkey_salt TEXT NOT NULL,
    pubkey_iv TEXT NOT NULL,
    pubkey_tag TEXT NOT NULL,
    
    -- Encrypted signer lists
    encrypted_required_signers TEXT NOT NULL,
    required_salt TEXT NOT NULL,
    required_iv TEXT NOT NULL,
    required_tag TEXT NOT NULL,
    
    encrypted_completed_signers TEXT NOT NULL DEFAULT '[]',
    completed_salt TEXT NOT NULL,
    completed_iv TEXT NOT NULL,
    completed_tag TEXT NOT NULL,
    
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'expired', 'cancelled')),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Security tracking
    suspicious_activity BOOLEAN DEFAULT false,
    security_violations INTEGER DEFAULT 0,
    
    UNIQUE(encrypted_event_id)
);

-- Create indexes for performance (on non-sensitive fields)
CREATE INDEX IF NOT EXISTS idx_secure_profiles_user_uuid ON secure_profiles(user_uuid);
CREATE INDEX IF NOT EXISTS idx_secure_profiles_username_uuid ON secure_profiles(username_uuid);
CREATE INDEX IF NOT EXISTS idx_secure_profiles_family_uuid ON secure_profiles(family_uuid);
CREATE INDEX IF NOT EXISTS idx_secure_profiles_created_at ON secure_profiles(created_at);

CREATE INDEX IF NOT EXISTS idx_secure_events_event_uuid ON secure_federated_events(event_uuid);
CREATE INDEX IF NOT EXISTS idx_secure_events_status ON secure_federated_events(status);
CREATE INDEX IF NOT EXISTS idx_secure_events_expires_at ON secure_federated_events(expires_at);
CREATE INDEX IF NOT EXISTS idx_secure_events_created_at ON secure_federated_events(created_at);

CREATE INDEX IF NOT EXISTS idx_secure_guardians_guardian_uuid ON secure_family_guardians(guardian_uuid);
CREATE INDEX IF NOT EXISTS idx_secure_guardians_active ON secure_family_guardians(active);
CREATE INDEX IF NOT EXISTS idx_secure_guardians_role ON secure_family_guardians(role);

CREATE INDEX IF NOT EXISTS idx_secure_shards_shard_uuid ON secure_guardian_shards(shard_uuid);
CREATE INDEX IF NOT EXISTS idx_secure_shards_expires_at ON secure_guardian_shards(expires_at);
CREATE INDEX IF NOT EXISTS idx_secure_shards_created_at ON secure_guardian_shards(created_at);

CREATE INDEX IF NOT EXISTS idx_privacy_audit_timestamp ON privacy_audit_log(audit_timestamp);
CREATE INDEX IF NOT EXISTS idx_privacy_audit_action ON privacy_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_privacy_audit_data_type ON privacy_audit_log(data_type);
CREATE INDEX IF NOT EXISTS idx_privacy_audit_retention ON privacy_audit_log(retention_expires);

CREATE INDEX IF NOT EXISTS idx_secure_protection_protection_uuid ON secure_family_nostr_protection(protection_uuid);
CREATE INDEX IF NOT EXISTS idx_secure_protection_active ON secure_family_nostr_protection(protection_active);
CREATE INDEX IF NOT EXISTS idx_secure_protection_expires ON secure_family_nostr_protection(protection_expires);

CREATE INDEX IF NOT EXISTS idx_secure_sessions_session_uuid ON secure_federated_signing_sessions(session_uuid);
CREATE INDEX IF NOT EXISTS idx_secure_sessions_status ON secure_federated_signing_sessions(status);
CREATE INDEX IF NOT EXISTS idx_secure_sessions_expires_at ON secure_federated_signing_sessions(expires_at);

-- Automatic cleanup functions
CREATE OR REPLACE FUNCTION cleanup_expired_privacy_data()
RETURNS void AS $
BEGIN
    -- Clean up expired audit logs
    DELETE FROM privacy_audit_log WHERE retention_expires < NOW();
    
    -- Clean up expired guardian shards
    DELETE FROM secure_guardian_shards WHERE expires_at < NOW();
    
    -- Mark expired protections as inactive
    UPDATE secure_family_nostr_protection 
    SET protection_active = false 
    WHERE protection_expires < NOW() AND protection_active = true;
    
    -- Clean up expired signing sessions
    DELETE FROM secure_federated_signing_sessions WHERE expires_at < NOW();
    
    -- Log cleanup activity
    INSERT INTO privacy_audit_log (action, data_type, success)
    VALUES ('cleanup', 'system', true);
END;
$ LANGUAGE plpgsql;

-- Schedule automatic cleanup (if using pg_cron extension)
-- SELECT cron.schedule('cleanup-privacy-data', '0 2 * * *', 'SELECT cleanup_expired_privacy_data();');

-- Triggers for updating timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$ LANGUAGE plpgsql;

CREATE TRIGGER update_secure_profiles_updated_at
    BEFORE UPDATE ON secure_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_secure_events_updated_at
    BEFORE UPDATE ON secure_federated_events
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_secure_protection_updated_at
    BEFORE UPDATE ON secure_family_nostr_protection
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) policies
ALTER TABLE secure_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE secure_federated_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE secure_family_guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE secure_guardian_shards ENABLE ROW LEVEL SECURITY;
ALTER TABLE secure_family_nostr_protection ENABLE ROW LEVEL SECURITY;
ALTER TABLE secure_federated_signing_sessions ENABLE ROW LEVEL SECURITY;

-- Note: RLS policies should be defined based on your authentication system
-- Example policy (customize based on your auth implementation):
-- CREATE POLICY "Users can only access their own data" ON secure_profiles
--   FOR ALL USING (user_uuid = auth.uid());

-- Comments for documentation
COMMENT ON TABLE secure_profiles IS 'Privacy-enhanced user profiles with encrypted sensitive data';
COMMENT ON TABLE secure_federated_events IS 'Encrypted family coordination events with zero-knowledge properties';
COMMENT ON TABLE secure_family_guardians IS 'Encrypted guardian information for key recovery';
COMMENT ON TABLE secure_guardian_shards IS 'Double-encrypted key shards with automatic expiration';
COMMENT ON TABLE privacy_audit_log IS 'Privacy operation audit trail with automatic retention cleanup';
COMMENT ON TABLE secure_family_nostr_protection IS 'Enhanced family key protection with biometric and zero-knowledge options';
COMMENT ON TABLE secure_federated_signing_sessions IS 'Encrypted multi-signature coordination sessions';

COMMENT ON COLUMN secure_profiles.privacy_level IS '1=basic, 2=enhanced, 3=maximum privacy protection';
COMMENT ON COLUMN secure_profiles.zero_knowledge_enabled IS 'Enable zero-knowledge data handling';
COMMENT ON COLUMN secure_guardian_shards.double_encrypted_shard IS 'Additional encryption layer for maximum security';
COMMENT ON COLUMN secure_family_nostr_protection.zero_knowledge_recovery IS 'Enable zero-knowledge key recovery process';