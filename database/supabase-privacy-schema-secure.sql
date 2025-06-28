-- Privacy-First Database Schema for Supabase
-- MAXIMUM PRIVACY BY DEFAULT - NO PII STORED ANYWHERE
-- UNIQUE DYNAMIC SALTS FOR EACH ENCRYPTION USE CASE - NO REUSED SALTS

-- Create privacy_users table (ZERO PII stored, MAXIMUM privacy only)
CREATE TABLE privacy_users (
    hashed_uuid TEXT PRIMARY KEY,
    user_identity_salt TEXT NOT NULL UNIQUE, -- Unique salt for user identity hashing
    auth_encryption_salt TEXT NOT NULL UNIQUE, -- Unique salt for auth data encryption
    federation_role TEXT NOT NULL DEFAULT 'child',
    auth_method TEXT NOT NULL,
    is_whitelisted BOOLEAN NOT NULL DEFAULT false,
    voting_power INTEGER NOT NULL DEFAULT 1,
    guardian_approved BOOLEAN NOT NULL DEFAULT false,
    session_hash TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_auth_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT check_federation_role CHECK (federation_role IN ('parent', 'child', 'guardian')),
    CONSTRAINT check_auth_method CHECK (auth_method IN ('nwc', 'otp', 'nip07'))
);

-- Private messages table (encrypted content with privacy levels for messaging ONLY)
CREATE TABLE private_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_hash TEXT NOT NULL REFERENCES privacy_users(hashed_uuid) ON DELETE CASCADE,
    recipient_hash TEXT NOT NULL REFERENCES privacy_users(hashed_uuid) ON DELETE CASCADE,
    encrypted_content TEXT NOT NULL,
    content_encryption_salt TEXT NOT NULL UNIQUE, -- Unique salt for EACH message encryption
    content_encryption_iv TEXT NOT NULL UNIQUE, -- Unique IV for EACH message encryption
    encryption_version INTEGER NOT NULL DEFAULT 1,
    message_privacy_level TEXT NOT NULL DEFAULT 'maximum',
    anonymity_level INTEGER NOT NULL DEFAULT 95,
    scheduled_delivery TIMESTAMP WITH TIME ZONE,
    actual_delivery TIMESTAMP WITH TIME ZONE,
    key_derivation_salt TEXT NOT NULL UNIQUE, -- Unique salt for key derivation
    forward_secure BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    delivered_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT check_message_privacy_level CHECK (message_privacy_level IN ('standard', 'enhanced', 'maximum'))
);

-- Encrypted contacts table (zero-knowledge, maximum privacy only)
CREATE TABLE encrypted_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_hash TEXT NOT NULL REFERENCES privacy_users(hashed_uuid) ON DELETE CASCADE,
    encrypted_contact TEXT NOT NULL,
    contact_encryption_salt TEXT NOT NULL UNIQUE, -- Unique salt for EACH contact encryption
    contact_encryption_iv TEXT NOT NULL UNIQUE, -- Unique IV for EACH contact encryption
    contact_hash TEXT NOT NULL,
    contact_hash_salt TEXT NOT NULL UNIQUE, -- Unique salt for contact hashing
    share_level TEXT NOT NULL DEFAULT 'private',
    contact_type TEXT DEFAULT 'individual',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used TIMESTAMP WITH TIME ZONE,
    CONSTRAINT check_share_level CHECK (share_level IN ('private', 'family', 'public')),
    CONSTRAINT check_contact_type CHECK (contact_type IN ('individual', 'family', 'business')),
    UNIQUE(owner_hash, contact_hash)
);

-- Session management table (maximum forward secrecy)
CREATE TABLE privacy_sessions (
    session_id TEXT PRIMARY KEY,
    user_hash TEXT NOT NULL REFERENCES privacy_users(hashed_uuid) ON DELETE CASCADE,
    encrypted_session_data TEXT NOT NULL,
    session_encryption_salt TEXT NOT NULL UNIQUE, -- Unique salt for EACH session encryption
    session_encryption_iv TEXT NOT NULL UNIQUE, -- Unique IV for EACH session encryption
    key_derivation_salt TEXT NOT NULL UNIQUE, -- Unique salt for session key derivation
    key_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_used TIMESTAMP WITH TIME ZONE,
    last_rotation TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    anonymity_level INTEGER NOT NULL DEFAULT 95,
    metadata_protection BOOLEAN NOT NULL DEFAULT true,
    forward_secrecy BOOLEAN NOT NULL DEFAULT true,
    is_valid BOOLEAN NOT NULL DEFAULT true,
    revoked_at TIMESTAMP WITH TIME ZONE
);

-- Family federation memberships (privacy-first RBAC)
CREATE TABLE family_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_hash TEXT NOT NULL REFERENCES privacy_users(hashed_uuid) ON DELETE CASCADE,
    federation_hash TEXT NOT NULL,
    federation_hash_salt TEXT NOT NULL UNIQUE, -- Unique salt for federation hashing
    member_role TEXT NOT NULL,
    encrypted_permissions TEXT DEFAULT NULL,
    permissions_encryption_salt TEXT UNIQUE, -- Unique salt for permissions encryption (nullable)
    permissions_encryption_iv TEXT UNIQUE, -- Unique IV for permissions encryption (nullable) 
    voting_power INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT true,
    invited_at TIMESTAMP WITH TIME ZONE,
    joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT check_member_role CHECK (member_role IN ('parent', 'child', 'guardian')),
    UNIQUE(member_hash, federation_hash)
);

-- Encryption key rotation log (for forward secrecy)
CREATE TABLE encryption_key_rotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_hash TEXT NOT NULL REFERENCES privacy_users(hashed_uuid) ON DELETE CASCADE,
    old_key_hash TEXT NOT NULL,
    new_key_hash TEXT NOT NULL,
    rotation_salt TEXT NOT NULL UNIQUE, -- Unique salt for rotation process
    rotation_reason VARCHAR(50) NOT NULL DEFAULT 'scheduled',
    rotated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT check_rotation_reason CHECK (rotation_reason IN ('scheduled', 'compromised', 'manual', 'logout'))
);

-- Create indexes for performance
CREATE INDEX idx_privacy_users_role ON privacy_users(federation_role);
CREATE INDEX idx_privacy_users_whitelisted ON privacy_users(is_whitelisted);
CREATE INDEX idx_privacy_users_auth_method ON privacy_users(auth_method);
CREATE INDEX idx_privacy_users_session ON privacy_users(session_hash);
CREATE INDEX idx_privacy_users_last_auth ON privacy_users(last_auth_at);

CREATE INDEX idx_messages_recipient ON private_messages(recipient_hash);
CREATE INDEX idx_messages_sender ON private_messages(sender_hash);
CREATE INDEX idx_messages_scheduled ON private_messages(scheduled_delivery);
CREATE INDEX idx_messages_privacy ON private_messages(message_privacy_level);
CREATE INDEX idx_messages_created ON private_messages(created_at);

CREATE INDEX idx_contacts_owner ON encrypted_contacts(owner_hash);
CREATE INDEX idx_contacts_hash ON encrypted_contacts(contact_hash);
CREATE INDEX idx_contacts_share_level ON encrypted_contacts(share_level);
CREATE INDEX idx_contacts_created ON encrypted_contacts(created_at);

CREATE INDEX idx_sessions_user ON privacy_sessions(user_hash);
CREATE INDEX idx_sessions_expires ON privacy_sessions(expires_at);
CREATE INDEX idx_sessions_valid ON privacy_sessions(is_valid);
CREATE INDEX idx_sessions_last_used ON privacy_sessions(last_used);

CREATE INDEX idx_memberships_member ON family_memberships(member_hash);
CREATE INDEX idx_memberships_federation ON family_memberships(federation_hash);
CREATE INDEX idx_memberships_role ON family_memberships(member_role);
CREATE INDEX idx_memberships_active ON family_memberships(is_active);

CREATE INDEX idx_key_rotations_user ON encryption_key_rotations(user_hash);
CREATE INDEX idx_key_rotations_date ON encryption_key_rotations(rotated_at);

-- Enable Row Level Security
ALTER TABLE privacy_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE private_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE encrypted_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE encryption_key_rotations ENABLE ROW LEVEL SECURITY;

-- Row Level Security Policies
CREATE POLICY privacy_users_policy ON privacy_users
    FOR ALL
    USING (hashed_uuid = current_setting('app.current_user_hash', true));

CREATE POLICY private_messages_policy ON private_messages
    FOR ALL
    USING (
        sender_hash = current_setting('app.current_user_hash', true) OR 
        recipient_hash = current_setting('app.current_user_hash', true)
    );

CREATE POLICY encrypted_contacts_policy ON encrypted_contacts
    FOR ALL
    USING (owner_hash = current_setting('app.current_user_hash', true));

CREATE POLICY privacy_sessions_policy ON privacy_sessions
    FOR ALL
    USING (user_hash = current_setting('app.current_user_hash', true));

CREATE POLICY family_memberships_policy ON family_memberships
    FOR ALL
    USING (member_hash = current_setting('app.current_user_hash', true));

CREATE POLICY encryption_key_rotations_policy ON encryption_key_rotations
    FOR ALL
    USING (user_hash = current_setting('app.current_user_hash', true));

-- Security functions for salt generation
CREATE OR REPLACE FUNCTION generate_unique_salt()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Generate cryptographically secure unique salt: timestamp + random + entropy
    RETURN encode(
        digest(
            extract(epoch from now())::text || 
            gen_random_uuid()::text || 
            random()::text ||
            pg_backend_pid()::text,
            'sha256'
        ),
        'hex'
    );
END;
$$;

CREATE OR REPLACE FUNCTION generate_unique_iv()
RETURNS TEXT  
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Generate cryptographically secure unique IV (16 bytes for AES)
    RETURN encode(gen_random_bytes(16), 'hex');
END;
$$;

-- Function to set current user context
CREATE OR REPLACE FUNCTION set_current_user_hash(user_hash TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    PERFORM set_config('app.current_user_hash', user_hash, true);
END;
$$;

-- Trigger function to auto-generate unique salts and IVs
CREATE OR REPLACE FUNCTION auto_generate_encryption_params()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Auto-generate unique salts and IVs for any table with these columns
    IF TG_TABLE_NAME = 'privacy_users' THEN
        IF NEW.user_identity_salt IS NULL THEN
            NEW.user_identity_salt := generate_unique_salt();
        END IF;
        IF NEW.auth_encryption_salt IS NULL THEN
            NEW.auth_encryption_salt := generate_unique_salt();
        END IF;
    END IF;
    
    IF TG_TABLE_NAME = 'private_messages' THEN
        IF NEW.content_encryption_salt IS NULL THEN
            NEW.content_encryption_salt := generate_unique_salt();
        END IF;
        IF NEW.content_encryption_iv IS NULL THEN
            NEW.content_encryption_iv := generate_unique_iv();
        END IF;
        IF NEW.key_derivation_salt IS NULL THEN
            NEW.key_derivation_salt := generate_unique_salt();
        END IF;
    END IF;
    
    IF TG_TABLE_NAME = 'encrypted_contacts' THEN
        IF NEW.contact_encryption_salt IS NULL THEN
            NEW.contact_encryption_salt := generate_unique_salt();
        END IF;
        IF NEW.contact_encryption_iv IS NULL THEN
            NEW.contact_encryption_iv := generate_unique_iv();
        END IF;
        IF NEW.contact_hash_salt IS NULL THEN
            NEW.contact_hash_salt := generate_unique_salt();
        END IF;
    END IF;
    
    IF TG_TABLE_NAME = 'privacy_sessions' THEN
        IF NEW.session_encryption_salt IS NULL THEN
            NEW.session_encryption_salt := generate_unique_salt();
        END IF;
        IF NEW.session_encryption_iv IS NULL THEN
            NEW.session_encryption_iv := generate_unique_iv();
        END IF;
        IF NEW.key_derivation_salt IS NULL THEN
            NEW.key_derivation_salt := generate_unique_salt();
        END IF;
    END IF;
    
    IF TG_TABLE_NAME = 'family_memberships' THEN
        IF NEW.federation_hash_salt IS NULL THEN
            NEW.federation_hash_salt := generate_unique_salt();
        END IF;
        IF NEW.encrypted_permissions IS NOT NULL AND NEW.permissions_encryption_salt IS NULL THEN
            NEW.permissions_encryption_salt := generate_unique_salt();
        END IF;
        IF NEW.encrypted_permissions IS NOT NULL AND NEW.permissions_encryption_iv IS NULL THEN
            NEW.permissions_encryption_iv := generate_unique_iv();
        END IF;
    END IF;
    
    IF TG_TABLE_NAME = 'encryption_key_rotations' THEN
        IF NEW.rotation_salt IS NULL THEN
            NEW.rotation_salt := generate_unique_salt();
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create triggers for auto-generation
CREATE TRIGGER auto_generate_user_encryption_params
    BEFORE INSERT ON privacy_users
    FOR EACH ROW
    EXECUTE FUNCTION auto_generate_encryption_params();

CREATE TRIGGER auto_generate_message_encryption_params
    BEFORE INSERT ON private_messages
    FOR EACH ROW
    EXECUTE FUNCTION auto_generate_encryption_params();

CREATE TRIGGER auto_generate_contact_encryption_params
    BEFORE INSERT ON encrypted_contacts
    FOR EACH ROW
    EXECUTE FUNCTION auto_generate_encryption_params();

CREATE TRIGGER auto_generate_session_encryption_params
    BEFORE INSERT ON privacy_sessions
    FOR EACH ROW
    EXECUTE FUNCTION auto_generate_encryption_params();

CREATE TRIGGER auto_generate_membership_encryption_params
    BEFORE INSERT ON family_memberships
    FOR EACH ROW
    EXECUTE FUNCTION auto_generate_encryption_params();

CREATE TRIGGER auto_generate_rotation_encryption_params
    BEFORE INSERT ON encryption_key_rotations
    FOR EACH ROW
    EXECUTE FUNCTION auto_generate_encryption_params();