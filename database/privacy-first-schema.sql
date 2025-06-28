-- Privacy-First Database Schema
-- This schema NEVER stores npubs, nip05, or any PII directly
-- Only hashed UUIDs with per-user salts for maximum privacy

-- Enable Row Level Security
ALTER DATABASE postgres SET row_security = on;

-- Create privacy_users table (NO PII stored)
CREATE TABLE IF NOT EXISTS public.privacy_users (
    -- Core Privacy Fields
    hashedUUID VARCHAR(50) PRIMARY KEY,        -- Dynamically hashed user identifier
    userSalt VARCHAR(32) NOT NULL,             -- Per-user salt for hashing
    
    -- Federation RBAC
    federationRole VARCHAR(20) NOT NULL DEFAULT 'child' CHECK (federationRole IN ('parent', 'child', 'guardian')),
    isWhitelisted BOOLEAN NOT NULL DEFAULT false,
    votingPower INTEGER NOT NULL DEFAULT 1,
    guardianApproved BOOLEAN NOT NULL DEFAULT false,
    
    -- Authentication Method (NO credentials stored)
    authMethod VARCHAR(10) NOT NULL CHECK (authMethod IN ('nwc', 'otp', 'nip07')),
    
    -- Privacy Settings
    privacyLevel VARCHAR(10) NOT NULL DEFAULT 'enhanced' CHECK (privacyLevel IN ('standard', 'enhanced', 'maximum')),
    
    -- Session Management
    sessionHash VARCHAR(50),                   -- Current session identifier
    lastAuthAt BIGINT NOT NULL,               -- Unix timestamp
    
    -- Audit Trail
    createdAt BIGINT NOT NULL,                -- Unix timestamp
    updatedAt BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()),
    
    -- Constraints
    UNIQUE(hashedUUID),
    UNIQUE(userSalt)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_privacy_users_role ON privacy_users(federationRole);
CREATE INDEX IF NOT EXISTS idx_privacy_users_whitelisted ON privacy_users(isWhitelisted);
CREATE INDEX IF NOT EXISTS idx_privacy_users_auth_method ON privacy_users(authMethod);
CREATE INDEX IF NOT EXISTS idx_privacy_users_session ON privacy_users(sessionHash);
CREATE INDEX IF NOT EXISTS idx_privacy_users_last_auth ON privacy_users(lastAuthAt);

-- Privacy-first messaging table (encrypted content only)
CREATE TABLE IF NOT EXISTS public.private_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Sender/Recipient (hashed UUIDs only)
    senderHash VARCHAR(50) NOT NULL,
    recipientHash VARCHAR(50) NOT NULL,
    
    -- Encrypted Content (PFS)
    encryptedContent TEXT NOT NULL,           -- Gift-wrapped encrypted message
    encryptionVersion INTEGER NOT NULL DEFAULT 1, -- For key rotation
    
    -- Privacy Metadata
    privacyLevel VARCHAR(10) NOT NULL DEFAULT 'enhanced',
    anonymityLevel INTEGER NOT NULL DEFAULT 70, -- 0-100
    
    -- Timing Obfuscation
    scheduledDelivery BIGINT,                 -- Unix timestamp for delayed delivery
    actualDelivery BIGINT,                    -- When actually delivered
    
    -- Forward Secrecy
    keyHash VARCHAR(32) NOT NULL,             -- Hash of encryption key used
    forwardSecure BOOLEAN NOT NULL DEFAULT true,
    
    -- Audit
    createdAt BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
    deliveredAt BIGINT,
    readAt BIGINT,
    
    -- Foreign Keys
    FOREIGN KEY (senderHash) REFERENCES privacy_users(hashedUUID) ON DELETE CASCADE,
    FOREIGN KEY (recipientHash) REFERENCES privacy_users(hashedUUID) ON DELETE CASCADE
);

-- Indexes for private messages
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON private_messages(recipientHash);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON private_messages(senderHash);
CREATE INDEX IF NOT EXISTS idx_messages_scheduled ON private_messages(scheduledDelivery);
CREATE INDEX IF NOT EXISTS idx_messages_privacy ON private_messages(privacyLevel);

-- Encrypted contacts table (zero-knowledge)
CREATE TABLE IF NOT EXISTS public.encrypted_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Owner (hashed UUID only)
    ownerHash VARCHAR(50) NOT NULL,
    
    -- Encrypted Contact Data
    encryptedContact TEXT NOT NULL,           -- AES encrypted contact info
    contactHash VARCHAR(32) NOT NULL,         -- Hash for deduplication
    
    -- Privacy Settings
    privacyLevel VARCHAR(10) NOT NULL DEFAULT 'enhanced',
    shareLevel VARCHAR(10) NOT NULL DEFAULT 'private' CHECK (shareLevel IN ('private', 'family', 'public')),
    
    -- Metadata (minimal)
    contactType VARCHAR(20) DEFAULT 'individual' CHECK (contactType IN ('individual', 'family', 'business')),
    
    -- Audit
    createdAt BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
    updatedAt BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()),
    lastUsed BIGINT,
    
    -- Constraints
    FOREIGN KEY (ownerHash) REFERENCES privacy_users(hashedUUID) ON DELETE CASCADE,
    UNIQUE(ownerHash, contactHash)
);

-- Indexes for contacts
CREATE INDEX IF NOT EXISTS idx_contacts_owner ON encrypted_contacts(ownerHash);
CREATE INDEX IF NOT EXISTS idx_contacts_hash ON encrypted_contacts(contactHash);
CREATE INDEX IF NOT EXISTS idx_contacts_share_level ON encrypted_contacts(shareLevel);

-- Session management table (forward secrecy)
CREATE TABLE IF NOT EXISTS public.privacy_sessions (
    sessionId VARCHAR(50) PRIMARY KEY,
    
    -- User Reference (hashed UUID only)
    userHash VARCHAR(50) NOT NULL,
    
    -- Session Security
    encryptionKey VARCHAR(64) NOT NULL,       -- Rotating encryption key
    keyVersion INTEGER NOT NULL DEFAULT 1,
    
    -- Session Metadata
    createdAt BIGINT NOT NULL,
    expiresAt BIGINT NOT NULL,
    lastUsed BIGINT,
    
    -- Privacy Settings
    anonymityLevel INTEGER NOT NULL DEFAULT 70,
    metadataProtection BOOLEAN NOT NULL DEFAULT true,
    forwardSecrecy BOOLEAN NOT NULL DEFAULT true,
    
    -- Security
    isValid BOOLEAN NOT NULL DEFAULT true,
    revokedAt BIGINT,
    
    -- Constraints
    FOREIGN KEY (userHash) REFERENCES privacy_users(hashedUUID) ON DELETE CASCADE
);

-- Indexes for sessions
CREATE INDEX IF NOT EXISTS idx_sessions_user ON privacy_sessions(userHash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON privacy_sessions(expiresAt);
CREATE INDEX IF NOT EXISTS idx_sessions_valid ON privacy_sessions(isValid);

-- Family federation memberships (privacy-first RBAC)
CREATE TABLE IF NOT EXISTS public.family_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Member (hashed UUID only)
    memberHash VARCHAR(50) NOT NULL,
    
    -- Federation Metadata (minimal)
    federationHash VARCHAR(32) NOT NULL,      -- Hashed federation identifier
    memberRole VARCHAR(20) NOT NULL CHECK (memberRole IN ('parent', 'child', 'guardian')),
    
    -- Permissions
    votingPower INTEGER NOT NULL DEFAULT 1,
    permissions JSONB DEFAULT '{}',           -- Encrypted permissions object
    
    -- Status
    isActive BOOLEAN NOT NULL DEFAULT true,
    invitedAt BIGINT,
    joinedAt BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
    
    -- Audit
    createdAt BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
    updatedAt BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()),
    
    -- Constraints
    FOREIGN KEY (memberHash) REFERENCES privacy_users(hashedUUID) ON DELETE CASCADE,
    UNIQUE(memberHash, federationHash)
);

-- Indexes for family memberships
CREATE INDEX IF NOT EXISTS idx_memberships_member ON family_memberships(memberHash);
CREATE INDEX IF NOT EXISTS idx_memberships_federation ON family_memberships(federationHash);
CREATE INDEX IF NOT EXISTS idx_memberships_role ON family_memberships(memberRole);
CREATE INDEX IF NOT EXISTS idx_memberships_active ON family_memberships(isActive);

-- Row Level Security Policies

-- Privacy Users: Users can only see their own data
ALTER TABLE privacy_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY privacy_users_own_data ON privacy_users
    FOR ALL
    USING (hashedUUID = current_setting('app.current_user_hash', true));

-- Private Messages: Users can only see messages they sent or received
ALTER TABLE private_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY private_messages_access ON private_messages
    FOR ALL
    USING (
        senderHash = current_setting('app.current_user_hash', true) OR 
        recipientHash = current_setting('app.current_user_hash', true)
    );

-- Encrypted Contacts: Users can only see their own contacts
ALTER TABLE encrypted_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY encrypted_contacts_own_data ON encrypted_contacts
    FOR ALL
    USING (ownerHash = current_setting('app.current_user_hash', true));

-- Privacy Sessions: Users can only see their own sessions
ALTER TABLE privacy_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY privacy_sessions_own_data ON privacy_sessions
    FOR ALL
    USING (userHash = current_setting('app.current_user_hash', true));

-- Family Memberships: Users can only see their own memberships
ALTER TABLE family_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY family_memberships_own_data ON family_memberships
    FOR ALL
    USING (memberHash = current_setting('app.current_user_hash', true));

-- Grant permissions to authenticated users
GRANT ALL ON privacy_users TO authenticated;
GRANT ALL ON private_messages TO authenticated;
GRANT ALL ON encrypted_contacts TO authenticated;
GRANT ALL ON privacy_sessions TO authenticated;
GRANT ALL ON family_memberships TO authenticated;

-- Create function to set current user context for RLS
CREATE OR REPLACE FUNCTION set_current_user_hash(user_hash TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    PERFORM set_config('app.current_user_hash', user_hash, true);
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION set_current_user_hash TO authenticated;

-- Comments for documentation
COMMENT ON TABLE privacy_users IS 'Privacy-first user table - NO PII stored, only hashed UUIDs';
COMMENT ON COLUMN privacy_users.hashedUUID IS 'Dynamically generated hashed UUID - cannot be reverse engineered';
COMMENT ON COLUMN privacy_users.userSalt IS 'Per-user unique salt for UUID generation';
COMMENT ON TABLE private_messages IS 'End-to-end encrypted messages with Perfect Forward Secrecy';
COMMENT ON TABLE encrypted_contacts IS 'Zero-knowledge encrypted contact storage';
COMMENT ON TABLE privacy_sessions IS 'Forward secrecy session management with key rotation';