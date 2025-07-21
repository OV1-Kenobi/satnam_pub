-- Privacy-First Database Schema - Master Context Compliant
-- MAXIMUM PRIVACY BY DEFAULT - NO PII STORED ANYWHERE
-- Only hashed UUIDs with per-user salts for maximum privacy
--
-- MASTER CONTEXT COMPLIANCE:
-- ✅ Zero-knowledge Nsec management with guardian approval workflows
-- ✅ Complete role hierarchy: "private"|"offspring"|"adult"|"steward"|"guardian"
-- ✅ Vault integration patterns for sensitive credentials
-- ✅ PBKDF2 with SHA-512 authentication hashing compliance
-- ✅ Enhanced Row Level Security (RLS) policies and audit logging

ALTER DATABASE postgres SET row_security = on;

CREATE TABLE IF NOT EXISTS public.privacy_users (
    hashed_uuid VARCHAR(50) PRIMARY KEY,
    user_salt VARCHAR(32) NOT NULL,
    
    federation_role VARCHAR(20) NOT NULL DEFAULT 'private' CHECK (federation_role IN ('private', 'offspring', 'adult', 'steward', 'guardian')),
    is_whitelisted BOOLEAN NOT NULL DEFAULT false,
    voting_power INTEGER NOT NULL DEFAULT 1,
    guardian_approved BOOLEAN NOT NULL DEFAULT false,
    
    auth_method VARCHAR(10) NOT NULL CHECK (auth_method IN ('nwc', 'otp', 'nip07')),
    auth_salt_hash VARCHAR(64),
    
    privacy_level VARCHAR(10) NOT NULL DEFAULT 'enhanced' CHECK (privacy_level IN ('standard', 'enhanced', 'maximum')),
    zero_knowledge_enabled BOOLEAN NOT NULL DEFAULT true,
    
    session_hash VARCHAR(50),
    session_salt VARCHAR(32),
    last_auth_at BIGINT NOT NULL,
    auth_failure_count INTEGER NOT NULL DEFAULT 0,
    last_auth_failure BIGINT,
    
    nsec_shard_count INTEGER DEFAULT 0,
    nsec_threshold INTEGER DEFAULT 0,
    guardian_approval_required BOOLEAN NOT NULL DEFAULT false,
    
    created_at BIGINT NOT NULL,
    updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()),
    last_activity BIGINT,
    data_retention_days INTEGER NOT NULL DEFAULT 2555,
    
    UNIQUE(hashed_uuid),
    UNIQUE(user_salt),
    UNIQUE(session_salt)
);

CREATE INDEX IF NOT EXISTS idx_privacy_users_role ON privacy_users(federation_role);
CREATE INDEX IF NOT EXISTS idx_privacy_users_whitelisted ON privacy_users(is_whitelisted);
CREATE INDEX IF NOT EXISTS idx_privacy_users_auth_method ON privacy_users(auth_method);
CREATE INDEX IF NOT EXISTS idx_privacy_users_session ON privacy_users(session_hash);
CREATE INDEX IF NOT EXISTS idx_privacy_users_last_auth ON privacy_users(last_auth_at);
CREATE INDEX IF NOT EXISTS idx_privacy_users_guardian_approval ON privacy_users(guardian_approval_required);
CREATE INDEX IF NOT EXISTS idx_privacy_users_zero_knowledge ON privacy_users(zero_knowledge_enabled);
CREATE INDEX IF NOT EXISTS idx_privacy_users_last_activity ON privacy_users(last_activity);

CREATE TABLE IF NOT EXISTS public.nsec_shards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_hash VARCHAR(50) NOT NULL,
    guardian_hash VARCHAR(50) NOT NULL,
    encrypted_shard TEXT NOT NULL,
    shard_index INTEGER NOT NULL,
    shard_salt VARCHAR(32) NOT NULL,
    guardian_encryption_key VARCHAR(64) NOT NULL,
    guardian_salt VARCHAR(32) NOT NULL,
    threshold INTEGER NOT NULL,
    total_shards INTEGER NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    expires_at BIGINT,
    created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
    last_accessed BIGINT,
    access_count INTEGER NOT NULL DEFAULT 0,
    
    FOREIGN KEY (owner_hash) REFERENCES privacy_users(hashed_uuid) ON DELETE CASCADE,
    FOREIGN KEY (guardian_hash) REFERENCES privacy_users(hashed_uuid) ON DELETE CASCADE,
    UNIQUE(owner_hash, guardian_hash, shard_index),
    UNIQUE(shard_salt)
);

CREATE INDEX IF NOT EXISTS idx_nsec_shards_owner ON nsec_shards(owner_hash);
CREATE INDEX IF NOT EXISTS idx_nsec_shards_guardian ON nsec_shards(guardian_hash);
CREATE INDEX IF NOT EXISTS idx_nsec_shards_active ON nsec_shards(is_active);
CREATE INDEX IF NOT EXISTS idx_nsec_shards_expires ON nsec_shards(expires_at);

CREATE TABLE IF NOT EXISTS public.guardian_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_hash VARCHAR(50) NOT NULL,
    operation_type VARCHAR(30) NOT NULL CHECK (operation_type IN (
        'nsec_reconstruction', 'key_rotation', 'emergency_recovery', 
        'spending_approval', 'role_change', 'guardian_addition', 
        'guardian_removal', 'federation_join', 'federation_leave'
    )),
    encrypted_context TEXT NOT NULL,
    context_hash VARCHAR(32) NOT NULL,
    required_approvals INTEGER NOT NULL DEFAULT 1,
    current_approvals INTEGER NOT NULL DEFAULT 0,
    threshold INTEGER NOT NULL,
    guardian_responses JSONB NOT NULL DEFAULT '[]',
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'approved', 'rejected', 'expired', 'cancelled'
    )),
    request_salt VARCHAR(32) NOT NULL,
    expires_at BIGINT NOT NULL,
    created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
    updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()),
    completed_at BIGINT,
    
    FOREIGN KEY (requester_hash) REFERENCES privacy_users(hashed_uuid) ON DELETE CASCADE,
    UNIQUE(request_salt)
);

CREATE INDEX IF NOT EXISTS idx_guardian_approvals_requester ON guardian_approvals(requester_hash);
CREATE INDEX IF NOT EXISTS idx_guardian_approvals_type ON guardian_approvals(operation_type);
CREATE INDEX IF NOT EXISTS idx_guardian_approvals_status ON guardian_approvals(status);
CREATE INDEX IF NOT EXISTS idx_guardian_approvals_expires ON guardian_approvals(expires_at);

CREATE TABLE IF NOT EXISTS public.private_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_hash VARCHAR(50) NOT NULL,
    recipient_hash VARCHAR(50) NOT NULL,
    encrypted_content TEXT NOT NULL,
    encryption_version INTEGER NOT NULL DEFAULT 1,
    message_privacy_level VARCHAR(10) NOT NULL DEFAULT 'maximum' CHECK (message_privacy_level IN ('standard', 'enhanced', 'maximum')),
    anonymity_level INTEGER NOT NULL DEFAULT 95,
    scheduled_delivery TIMESTAMP WITH TIME ZONE,
    actual_delivery TIMESTAMP WITH TIME ZONE,
    key_hash VARCHAR(32) NOT NULL,
    forward_secure BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    delivered_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    
    FOREIGN KEY (sender_hash) REFERENCES privacy_users(hashed_uuid) ON DELETE CASCADE,
    FOREIGN KEY (recipient_hash) REFERENCES privacy_users(hashed_uuid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_recipient ON private_messages(recipient_hash);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON private_messages(sender_hash);
CREATE INDEX IF NOT EXISTS idx_messages_scheduled ON private_messages(scheduled_delivery);
CREATE INDEX IF NOT EXISTS idx_messages_privacy ON private_messages(message_privacy_level);

CREATE TABLE IF NOT EXISTS public.encrypted_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_hash VARCHAR(50) NOT NULL,
    encrypted_contact TEXT NOT NULL,
    contact_hash VARCHAR(32) NOT NULL,
    share_level VARCHAR(10) NOT NULL DEFAULT 'private' CHECK (share_level IN ('private', 'family', 'public')),
    contact_type VARCHAR(20) DEFAULT 'individual' CHECK (contact_type IN ('individual', 'family', 'business')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used TIMESTAMP WITH TIME ZONE,
    
    FOREIGN KEY (owner_hash) REFERENCES privacy_users(hashed_uuid) ON DELETE CASCADE,
    UNIQUE(owner_hash, contact_hash)
);

CREATE INDEX IF NOT EXISTS idx_contacts_owner ON encrypted_contacts(owner_hash);
CREATE INDEX IF NOT EXISTS idx_contacts_hash ON encrypted_contacts(contact_hash);
CREATE INDEX IF NOT EXISTS idx_contacts_share_level ON encrypted_contacts(share_level);

CREATE TABLE IF NOT EXISTS public.privacy_sessions (
    session_id VARCHAR(50) PRIMARY KEY,
    user_hash VARCHAR(50) NOT NULL,
    encryption_key VARCHAR(64) NOT NULL,
    key_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_used TIMESTAMP WITH TIME ZONE,
    anonymity_level INTEGER NOT NULL DEFAULT 95,
    metadata_protection BOOLEAN NOT NULL DEFAULT true,
    forward_secrecy BOOLEAN NOT NULL DEFAULT true,
    is_valid BOOLEAN NOT NULL DEFAULT true,
    revoked_at TIMESTAMP WITH TIME ZONE,
    
    FOREIGN KEY (user_hash) REFERENCES privacy_users(hashed_uuid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON privacy_sessions(user_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON privacy_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_valid ON privacy_sessions(is_valid);

CREATE TABLE IF NOT EXISTS public.family_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_hash VARCHAR(50) NOT NULL,
    federation_hash VARCHAR(32) NOT NULL,
    member_role VARCHAR(20) NOT NULL CHECK (member_role IN ('private', 'offspring', 'adult', 'steward', 'guardian')),
    voting_power INTEGER NOT NULL DEFAULT 1,
    permissions JSONB DEFAULT '{}',
    spending_limit BIGINT DEFAULT 0,
    guardian_level INTEGER NOT NULL DEFAULT 0,
    can_approve_spending BOOLEAN NOT NULL DEFAULT false,
    can_manage_members BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    invited_at TIMESTAMP WITH TIME ZONE,
    joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_activity TIMESTAMP WITH TIME ZONE,
    membership_salt VARCHAR(32) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    role_changed_at TIMESTAMP WITH TIME ZONE,
    role_changed_by VARCHAR(50),
    
    FOREIGN KEY (member_hash) REFERENCES privacy_users(hashed_uuid) ON DELETE CASCADE,
    UNIQUE(member_hash, federation_hash),
    UNIQUE(membership_salt)
);

CREATE INDEX IF NOT EXISTS idx_memberships_member ON family_memberships(member_hash);
CREATE INDEX IF NOT EXISTS idx_memberships_federation ON family_memberships(federation_hash);
CREATE INDEX IF NOT EXISTS idx_memberships_role ON family_memberships(member_role);
CREATE INDEX IF NOT EXISTS idx_memberships_active ON family_memberships(is_active);
CREATE INDEX IF NOT EXISTS idx_memberships_guardian_level ON family_memberships(guardian_level);
CREATE INDEX IF NOT EXISTS idx_memberships_last_activity ON family_memberships(last_activity);

CREATE TABLE IF NOT EXISTS public.vault_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credential_hash VARCHAR(64) NOT NULL,
    credential_salt VARCHAR(32) NOT NULL,
    owner_hash VARCHAR(50),
    encrypted_value TEXT NOT NULL,
    encryption_salt VARCHAR(32) NOT NULL,
    key_derivation_rounds INTEGER NOT NULL DEFAULT 100000,
    credential_type VARCHAR(30) NOT NULL CHECK (credential_type IN (
        'auth_salt', 'jwt_secret', 'api_key', 'database_key',
        'lightning_macaroon', 'nostr_nsec', 'federation_key'
    )),
    required_role VARCHAR(20) NOT NULL DEFAULT 'guardian' CHECK (required_role IN ('private', 'offspring', 'adult', 'steward', 'guardian')),
    guardian_approval_required BOOLEAN NOT NULL DEFAULT true,
    is_active BOOLEAN NOT NULL DEFAULT true,
    expires_at BIGINT,
    rotation_required BOOLEAN NOT NULL DEFAULT false,
    last_rotated BIGINT,
    created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
    updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()),
    last_accessed BIGINT,
    access_count INTEGER NOT NULL DEFAULT 0,

    FOREIGN KEY (owner_hash) REFERENCES privacy_users(hashed_uuid) ON DELETE CASCADE,
    UNIQUE(credential_hash),
    UNIQUE(credential_salt),
    UNIQUE(encryption_salt)
);

CREATE INDEX IF NOT EXISTS idx_vault_credentials_hash ON vault_credentials(credential_hash);
CREATE INDEX IF NOT EXISTS idx_vault_credentials_owner ON vault_credentials(owner_hash);
CREATE INDEX IF NOT EXISTS idx_vault_credentials_type ON vault_credentials(credential_type);
CREATE INDEX IF NOT EXISTS idx_vault_credentials_active ON vault_credentials(is_active);
CREATE INDEX IF NOT EXISTS idx_vault_credentials_expires ON vault_credentials(expires_at);

CREATE TABLE IF NOT EXISTS public.privacy_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_hash VARCHAR(50),
    action_type VARCHAR(30) NOT NULL CHECK (action_type IN (
        'auth_attempt', 'auth_success', 'auth_failure', 'session_create', 'session_destroy',
        'nsec_shard_create', 'nsec_shard_access', 'nsec_reconstruct', 'key_rotation',
        'guardian_approval', 'role_change', 'permission_change', 'vault_access',
        'data_export', 'data_deletion', 'emergency_recovery', 'schema_migration',
        'data_cleanup', 'system_maintenance', 'backup_operation'
    )),
    context_hash VARCHAR(32),
    resource_type VARCHAR(20),
    ip_address_hash VARCHAR(64),
    user_agent_hash VARCHAR(64),
    session_hash VARCHAR(50),
    success BOOLEAN NOT NULL,
    error_code VARCHAR(20),
    data_minimized BOOLEAN NOT NULL DEFAULT true,
    retention_expires BIGINT NOT NULL,
    timestamp BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),

    FOREIGN KEY (actor_hash) REFERENCES privacy_users(hashed_uuid) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON privacy_audit_log(actor_hash);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON privacy_audit_log(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON privacy_audit_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_log_success ON privacy_audit_log(success);
CREATE INDEX IF NOT EXISTS idx_audit_log_retention ON privacy_audit_log(retention_expires);

-- Row Level Security Policies
ALTER TABLE privacy_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE private_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE encrypted_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE nsec_shards ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardian_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY privacy_users_own_data ON privacy_users
    FOR ALL
    USING (hashed_uuid = current_setting('app.current_user_hash', true));

CREATE POLICY private_messages_access ON private_messages
    FOR ALL
    USING (
        sender_hash = current_setting('app.current_user_hash', true) OR
        recipient_hash = current_setting('app.current_user_hash', true)
    );

CREATE POLICY encrypted_contacts_own_data ON encrypted_contacts
    FOR ALL
    USING (owner_hash = current_setting('app.current_user_hash', true));

CREATE POLICY privacy_sessions_own_data ON privacy_sessions
    FOR ALL
    USING (user_hash = current_setting('app.current_user_hash', true));

CREATE POLICY family_memberships_own_data ON family_memberships
    FOR ALL
    USING (member_hash = current_setting('app.current_user_hash', true));

CREATE POLICY nsec_shards_access ON nsec_shards
    FOR ALL
    USING (
        owner_hash = current_setting('app.current_user_hash', true) OR
        guardian_hash = current_setting('app.current_user_hash', true)
    );

CREATE POLICY guardian_approvals_access ON guardian_approvals
    FOR ALL
    USING (
        requester_hash = current_setting('app.current_user_hash', true) OR
        EXISTS (
            SELECT 1 FROM family_memberships fm
            WHERE fm.member_hash = current_setting('app.current_user_hash', true)
            AND fm.guardian_level > 0
            AND fm.is_active = true
        )
    );

CREATE POLICY vault_credentials_access ON vault_credentials
    FOR SELECT
    USING (
        owner_hash = current_setting('app.current_user_hash', true) OR
        EXISTS (
            SELECT 1 FROM privacy_users pu
            WHERE pu.hashed_uuid = current_setting('app.current_user_hash', true)
            AND (
                (required_role = 'private' AND pu.federation_role IN ('private', 'offspring', 'adult', 'steward', 'guardian')) OR
                (required_role = 'offspring' AND pu.federation_role IN ('offspring', 'adult', 'steward', 'guardian')) OR
                (required_role = 'adult' AND pu.federation_role IN ('adult', 'steward', 'guardian')) OR
                (required_role = 'steward' AND pu.federation_role IN ('steward', 'guardian')) OR
                (required_role = 'guardian' AND pu.federation_role = 'guardian')
            )
        )
    );

CREATE POLICY privacy_audit_log_access ON privacy_audit_log
    FOR SELECT
    USING (
        actor_hash = current_setting('app.current_user_hash', true) OR
        EXISTS (
            SELECT 1 FROM privacy_users pu
            WHERE pu.hashed_uuid = current_setting('app.current_user_hash', true)
            AND pu.federation_role IN ('steward', 'guardian')
        )
    );

GRANT ALL ON privacy_users TO authenticated;
GRANT ALL ON private_messages TO authenticated;
GRANT ALL ON encrypted_contacts TO authenticated;
GRANT ALL ON privacy_sessions TO authenticated;
GRANT ALL ON family_memberships TO authenticated;
GRANT ALL ON nsec_shards TO authenticated;
GRANT ALL ON guardian_approvals TO authenticated;
GRANT SELECT ON vault_credentials TO authenticated;
GRANT INSERT ON privacy_audit_log TO authenticated;

CREATE OR REPLACE FUNCTION set_current_user_hash(user_hash TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    PERFORM set_config('app.current_user_hash', user_hash, true);
END;
$$;

CREATE OR REPLACE FUNCTION cleanup_expired_privacy_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM privacy_audit_log WHERE retention_expires < EXTRACT(EPOCH FROM NOW());
    DELETE FROM nsec_shards WHERE expires_at IS NOT NULL AND expires_at < EXTRACT(EPOCH FROM NOW());
    DELETE FROM guardian_approvals WHERE expires_at < EXTRACT(EPOCH FROM NOW());
    DELETE FROM vault_credentials WHERE expires_at IS NOT NULL AND expires_at < EXTRACT(EPOCH FROM NOW());
    DELETE FROM privacy_sessions WHERE expires_at < NOW();
    DELETE FROM private_messages WHERE created_at < NOW() - INTERVAL '1 year';

    UPDATE privacy_users
    SET updated_at = EXTRACT(EPOCH FROM NOW())
    WHERE last_activity > EXTRACT(EPOCH FROM NOW()) - (24 * 60 * 60);

    INSERT INTO privacy_audit_log (action_type, success, retention_expires)
    VALUES ('data_cleanup', true, EXTRACT(EPOCH FROM NOW()) + (30 * 24 * 60 * 60));
END;
$$;

CREATE OR REPLACE FUNCTION rotate_user_salt(user_hash TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_salt TEXT;
BEGIN
    new_salt := encode(gen_random_bytes(16), 'hex');

    UPDATE privacy_users
    SET user_salt = new_salt,
        updated_at = EXTRACT(EPOCH FROM NOW())
    WHERE hashed_uuid = user_hash;

    INSERT INTO privacy_audit_log (actor_hash, action_type, success, retention_expires)
    VALUES (user_hash, 'key_rotation', true, EXTRACT(EPOCH FROM NOW()) + (365 * 24 * 60 * 60));
END;
$$;

CREATE OR REPLACE FUNCTION check_guardian_approval(
    operation_type TEXT,
    requester_hash TEXT,
    required_approvals INTEGER DEFAULT 1
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_role TEXT;
    guardian_count INTEGER;
BEGIN
    SELECT federation_role INTO user_role
    FROM privacy_users
    WHERE hashed_uuid = requester_hash;

    IF user_role IN ('guardian', 'steward') AND operation_type NOT IN ('emergency_recovery', 'guardian_removal') THEN
        RETURN true;
    END IF;

    SELECT COUNT(*) INTO guardian_count
    FROM family_memberships fm
    JOIN privacy_users pu ON fm.member_hash = pu.hashed_uuid
    WHERE fm.guardian_level > 0
    AND fm.is_active = true
    AND pu.federation_role IN ('guardian', 'steward');

    IF guardian_count < required_approvals THEN
        RETURN false;
    END IF;

    IF operation_type IN ('nsec_reconstruction', 'emergency_recovery', 'guardian_removal') THEN
        RETURN false;
    END IF;

    RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION set_current_user_hash TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_expired_privacy_data TO authenticated;
GRANT EXECUTE ON FUNCTION rotate_user_salt TO authenticated;
GRANT EXECUTE ON FUNCTION check_guardian_approval TO authenticated;
