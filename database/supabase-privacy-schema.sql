-- Privacy-First Database Schema for Supabase
-- MAXIMUM PRIVACY BY DEFAULT - NO PII STORED ANYWHERE
-- Only hashed UUIDs with per-user salts

-- Create privacy_users table (ZERO PII stored, MAXIMUM privacy only)
CREATE TABLE privacy_users (
    hashed_uuid TEXT PRIMARY KEY,
    user_salt TEXT NOT NULL UNIQUE,
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
    encryption_version INTEGER NOT NULL DEFAULT 1,
    message_privacy_level TEXT NOT NULL DEFAULT 'maximum',
    anonymity_level INTEGER NOT NULL DEFAULT 95,
    scheduled_delivery TIMESTAMP WITH TIME ZONE,
    actual_delivery TIMESTAMP WITH TIME ZONE,
    key_hash TEXT NOT NULL,
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
    contact_hash TEXT NOT NULL,
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
    encryption_key TEXT NOT NULL,
    key_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_used TIMESTAMP WITH TIME ZONE,
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
    member_role TEXT NOT NULL,
    voting_power INTEGER NOT NULL DEFAULT 1,
    permissions JSONB DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    invited_at TIMESTAMP WITH TIME ZONE,
    joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT check_member_role CHECK (member_role IN ('parent', 'child', 'guardian')),
    UNIQUE(member_hash, federation_hash)
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

CREATE INDEX idx_contacts_owner ON encrypted_contacts(owner_hash);
CREATE INDEX idx_contacts_hash ON encrypted_contacts(contact_hash);
CREATE INDEX idx_contacts_share_level ON encrypted_contacts(share_level);

CREATE INDEX idx_sessions_user ON privacy_sessions(user_hash);
CREATE INDEX idx_sessions_expires ON privacy_sessions(expires_at);
CREATE INDEX idx_sessions_valid ON privacy_sessions(is_valid);

CREATE INDEX idx_memberships_member ON family_memberships(member_hash);
CREATE INDEX idx_memberships_federation ON family_memberships(federation_hash);
CREATE INDEX idx_memberships_role ON family_memberships(member_role);
CREATE INDEX idx_memberships_active ON family_memberships(is_active);

-- Enable Row Level Security
ALTER TABLE privacy_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE private_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE encrypted_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_memberships ENABLE ROW LEVEL SECURITY;

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

-- Create function to set current user context
CREATE OR REPLACE FUNCTION set_current_user_hash(user_hash TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    PERFORM set_config('app.current_user_hash', user_hash, true);
END;
$$;