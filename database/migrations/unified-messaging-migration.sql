-- =====================================================================================
-- UNIFIED MESSAGING SERVICE DATABASE MIGRATION
-- MASTER CONTEXT COMPLIANCE: Privacy-first architecture with zero-knowledge Nsec management
-- =====================================================================================

-- Enable Row Level Security
ALTER DATABASE postgres SET row_security = on;

-- =====================================================================================
-- 1. MESSAGING SESSIONS TABLE
-- MASTER CONTEXT COMPLIANCE: Zero-knowledge Nsec management with session-based encryption
-- =====================================================================================

CREATE TABLE IF NOT EXISTS messaging_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL UNIQUE,
    user_hash TEXT NOT NULL,
    session_key TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT messaging_sessions_session_id_check CHECK (length(session_id) >= 32),
    CONSTRAINT messaging_sessions_user_hash_check CHECK (length(user_hash) >= 32),
    CONSTRAINT messaging_sessions_session_key_check CHECK (length(session_key) >= 32),
    CONSTRAINT messaging_sessions_expires_at_check CHECK (expires_at > created_at)
);

-- Backward compatibility: drop columns if exist in idempotent manner
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='messaging_sessions' AND column_name='encrypted_nsec'
  ) THEN
    EXECUTE 'ALTER TABLE messaging_sessions DROP COLUMN IF EXISTS encrypted_nsec';
  END IF;
END $$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_messaging_sessions_user_hash ON messaging_sessions(user_hash);
CREATE INDEX IF NOT EXISTS idx_messaging_sessions_expires_at ON messaging_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_messaging_sessions_created_at ON messaging_sessions(created_at);




-- =====================================================================================
-- 2. PRIVACY CONTACTS TABLE
-- MASTER CONTEXT COMPLIANCE: Privacy-first contact management with role hierarchy
-- =====================================================================================

CREATE TABLE IF NOT EXISTS privacy_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL,
    encrypted_npub TEXT NOT NULL,
    nip05_hash TEXT,
    display_name_hash TEXT NOT NULL,
    family_role TEXT CHECK (family_role IN ('private', 'offspring', 'adult', 'steward', 'guardian')),
    trust_level TEXT NOT NULL CHECK (trust_level IN ('family', 'trusted', 'known', 'unverified')),
    supports_gift_wrap BOOLEAN NOT NULL DEFAULT true,
    preferred_encryption TEXT NOT NULL DEFAULT 'gift-wrap' CHECK (preferred_encryption IN ('gift-wrap', 'nip04', 'auto')),
    last_seen_hash TEXT,
    tags_hash TEXT[] DEFAULT '{}',
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    added_by_hash TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Foreign key to messaging sessions
    CONSTRAINT fk_privacy_contacts_session FOREIGN KEY (session_id) REFERENCES messaging_sessions(session_id) ON DELETE CASCADE,

    -- Constraints
    CONSTRAINT privacy_contacts_session_id_check CHECK (length(session_id) >= 32),
    CONSTRAINT privacy_contacts_encrypted_npub_check CHECK (length(encrypted_npub) >= 32),
    CONSTRAINT privacy_contacts_display_name_hash_check CHECK (length(display_name_hash) >= 32),
    CONSTRAINT privacy_contacts_added_by_hash_check CHECK (length(added_by_hash) >= 32),

    -- Unique constraint for session + contact combination
    UNIQUE(session_id, display_name_hash)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_privacy_contacts_session_id ON privacy_contacts(session_id);
CREATE INDEX IF NOT EXISTS idx_privacy_contacts_family_role ON privacy_contacts(family_role);
CREATE INDEX IF NOT EXISTS idx_privacy_contacts_trust_level ON privacy_contacts(trust_level);
CREATE INDEX IF NOT EXISTS idx_privacy_contacts_added_at ON privacy_contacts(added_at);

-- =====================================================================================
-- 3. PRIVACY GROUPS TABLE
-- MASTER CONTEXT COMPLIANCE: Privacy-first group management with encryption support
-- =====================================================================================

CREATE TABLE IF NOT EXISTS privacy_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL UNIQUE,
    name_hash TEXT NOT NULL,
    description_hash TEXT,
    group_type TEXT NOT NULL CHECK (group_type IN ('family', 'business', 'friends', 'advisors')),
    member_count INTEGER NOT NULL DEFAULT 1 CHECK (member_count >= 1),
    admin_hashes TEXT[] NOT NULL DEFAULT '{}',
    encryption_type TEXT NOT NULL DEFAULT 'gift-wrap' CHECK (encryption_type IN ('gift-wrap', 'nip04')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_hash TEXT NOT NULL,
    last_activity_hash TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT privacy_groups_session_id_check CHECK (length(session_id) >= 32),
    CONSTRAINT privacy_groups_name_hash_check CHECK (length(name_hash) >= 32),
    CONSTRAINT privacy_groups_created_by_hash_check CHECK (length(created_by_hash) >= 32),
    CONSTRAINT privacy_groups_admin_hashes_check CHECK (array_length(admin_hashes, 1) >= 1),

    -- Unique constraint for session + group name combination
    UNIQUE(session_id, name_hash)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_privacy_groups_session_id ON privacy_groups(session_id);
CREATE INDEX IF NOT EXISTS idx_privacy_groups_group_type ON privacy_groups(group_type);
CREATE INDEX IF NOT EXISTS idx_privacy_groups_created_by_hash ON privacy_groups(created_by_hash);
CREATE INDEX IF NOT EXISTS idx_privacy_groups_created_at ON privacy_groups(created_at);




-- =====================================================================================
-- 4. PRIVACY GROUP MEMBERS TABLE
-- MASTER CONTEXT COMPLIANCE: Group membership with role-based access control
-- =====================================================================================

CREATE TABLE IF NOT EXISTS privacy_group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_session_id TEXT NOT NULL,
    member_hash TEXT NOT NULL,
    display_name_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member', 'viewer')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    invited_by_hash TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Foreign key to privacy groups
    CONSTRAINT fk_privacy_group_members_group FOREIGN KEY (group_session_id) REFERENCES privacy_groups(session_id) ON DELETE CASCADE,

    -- Constraints
    CONSTRAINT privacy_group_members_group_session_id_check CHECK (length(group_session_id) >= 32),
    CONSTRAINT privacy_group_members_member_hash_check CHECK (length(member_hash) >= 32),
    CONSTRAINT privacy_group_members_display_name_hash_check CHECK (length(display_name_hash) >= 32),
    CONSTRAINT privacy_group_members_invited_by_hash_check CHECK (length(invited_by_hash) >= 32),

    -- Unique constraint for group + member combination
    UNIQUE(group_session_id, member_hash)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_privacy_group_members_group_session_id ON privacy_group_members(group_session_id);
CREATE INDEX IF NOT EXISTS idx_privacy_group_members_member_hash ON privacy_group_members(member_hash);
CREATE INDEX IF NOT EXISTS idx_privacy_group_members_role ON privacy_group_members(role);
CREATE INDEX IF NOT EXISTS idx_privacy_group_members_joined_at ON privacy_group_members(joined_at);

-- =====================================================================================
-- 5. PRIVACY GROUP MESSAGES TABLE
-- MASTER CONTEXT COMPLIANCE: Privacy-first group messaging with metadata protection
-- =====================================================================================

CREATE TABLE IF NOT EXISTS privacy_group_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_session_id TEXT NOT NULL,
    group_session_id TEXT NOT NULL,
    sender_hash TEXT NOT NULL,
    encrypted_content TEXT NOT NULL,
    message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'announcement', 'poll', 'file', 'payment-request')),
    metadata_hash TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    edited_hash TEXT,
    reply_to_hash TEXT,
    guardian_approved BOOLEAN DEFAULT false,
    guardian_pubkey TEXT,
    approval_timestamp TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Foreign key to privacy groups
    CONSTRAINT fk_privacy_group_messages_group FOREIGN KEY (group_session_id) REFERENCES privacy_groups(session_id) ON DELETE CASCADE,

    -- Constraints
    CONSTRAINT privacy_group_messages_message_session_id_check CHECK (length(message_session_id) >= 32),
    CONSTRAINT privacy_group_messages_group_session_id_check CHECK (length(group_session_id) >= 32),
    CONSTRAINT privacy_group_messages_sender_hash_check CHECK (length(sender_hash) >= 32),
    CONSTRAINT privacy_group_messages_encrypted_content_check CHECK (length(encrypted_content) >= 1),
    CONSTRAINT privacy_group_messages_approval_check CHECK (
        (guardian_approved = false) OR
        (guardian_approved = true AND guardian_pubkey IS NOT NULL AND approval_timestamp IS NOT NULL)
    )
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_privacy_group_messages_group_session_id ON privacy_group_messages(group_session_id);
CREATE INDEX IF NOT EXISTS idx_privacy_group_messages_sender_hash ON privacy_group_messages(sender_hash);
CREATE INDEX IF NOT EXISTS idx_privacy_group_messages_timestamp ON privacy_group_messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_privacy_group_messages_message_type ON privacy_group_messages(message_type);
CREATE INDEX IF NOT EXISTS idx_privacy_group_messages_guardian_approved ON privacy_group_messages(guardian_approved);

-- =====================================================================================
-- 6. PRIVACY DIRECT MESSAGES TABLE
-- MASTER CONTEXT COMPLIANCE: Privacy-first direct messaging with NIP-59/NIP-04 support
-- =====================================================================================

CREATE TABLE IF NOT EXISTS privacy_direct_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_session_id TEXT NOT NULL,
    sender_session_id TEXT NOT NULL,
    recipient_session_id TEXT NOT NULL,
    encrypted_content TEXT NOT NULL,
    message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'file', 'payment', 'credential', 'sensitive')),
    encryption_method TEXT NOT NULL DEFAULT 'gift-wrap' CHECK (encryption_method IN ('gift-wrap', 'nip04')),
    metadata_hash TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at TIMESTAMPTZ,
    guardian_approved BOOLEAN DEFAULT false,
    guardian_pubkey TEXT,
    approval_timestamp TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Foreign key to messaging sessions
    CONSTRAINT fk_privacy_direct_messages_sender FOREIGN KEY (sender_session_id) REFERENCES messaging_sessions(session_id) ON DELETE CASCADE,
    CONSTRAINT fk_privacy_direct_messages_recipient FOREIGN KEY (recipient_session_id) REFERENCES messaging_sessions(session_id) ON DELETE CASCADE,

    -- Constraints
    CONSTRAINT privacy_direct_messages_message_session_id_check CHECK (length(message_session_id) >= 32),
    CONSTRAINT privacy_direct_messages_sender_session_id_check CHECK (length(sender_session_id) >= 32),
    CONSTRAINT privacy_direct_messages_recipient_session_id_check CHECK (length(recipient_session_id) >= 32),
    CONSTRAINT privacy_direct_messages_encrypted_content_check CHECK (length(encrypted_content) >= 1),
    CONSTRAINT privacy_direct_messages_different_users_check CHECK (sender_session_id != recipient_session_id),
    CONSTRAINT privacy_direct_messages_approval_check CHECK (
        (guardian_approved = false) OR
        (guardian_approved = true AND guardian_pubkey IS NOT NULL AND approval_timestamp IS NOT NULL)
    )
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_privacy_direct_messages_sender_session_id ON privacy_direct_messages(sender_session_id);
CREATE INDEX IF NOT EXISTS idx_privacy_direct_messages_recipient_session_id ON privacy_direct_messages(recipient_session_id);
CREATE INDEX IF NOT EXISTS idx_privacy_direct_messages_timestamp ON privacy_direct_messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_privacy_direct_messages_message_type ON privacy_direct_messages(message_type);
CREATE INDEX IF NOT EXISTS idx_privacy_direct_messages_encryption_method ON privacy_direct_messages(encryption_method);

-- =====================================================================================
-- 7. GUARDIAN APPROVAL REQUESTS TABLE
-- MASTER CONTEXT COMPLIANCE: Guardian approval workflows for sensitive operations
-- =====================================================================================

CREATE TABLE IF NOT EXISTS guardian_approval_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    approval_id TEXT NOT NULL UNIQUE,
    group_id TEXT,
    message_id TEXT,
    requester_pubkey TEXT NOT NULL,
    guardian_pubkey TEXT NOT NULL,
    message_content TEXT NOT NULL,
    message_type TEXT NOT NULL CHECK (message_type IN ('sensitive', 'credential', 'payment')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    approval_reason TEXT,
    rejection_reason TEXT,
    processed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT guardian_approval_requests_approval_id_check CHECK (length(approval_id) >= 32),
    CONSTRAINT guardian_approval_requests_requester_pubkey_check CHECK (length(requester_pubkey) >= 32),
    CONSTRAINT guardian_approval_requests_guardian_pubkey_check CHECK (length(guardian_pubkey) >= 32),
    CONSTRAINT guardian_approval_requests_expires_at_check CHECK (expires_at > created_at),
    CONSTRAINT guardian_approval_requests_processed_check CHECK (
        (status = 'pending' AND processed_at IS NULL) OR
        (status IN ('approved', 'rejected') AND processed_at IS NOT NULL)
    )
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_guardian_approval_requests_requester_pubkey ON guardian_approval_requests(requester_pubkey);
CREATE INDEX IF NOT EXISTS idx_guardian_approval_requests_guardian_pubkey ON guardian_approval_requests(guardian_pubkey);
CREATE INDEX IF NOT EXISTS idx_guardian_approval_requests_status ON guardian_approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_guardian_approval_requests_created_at ON guardian_approval_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_guardian_approval_requests_expires_at ON guardian_approval_requests(expires_at);

-- =====================================================================================
-- 8. IDENTITY DISCLOSURE PREFERENCES TABLE
-- MASTER CONTEXT COMPLIANCE: NIP-05 identity disclosure with privacy controls
-- =====================================================================================

CREATE TABLE IF NOT EXISTS identity_disclosure_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL,
    user_hash TEXT NOT NULL,
    allow_nip05_in_direct_messages BOOLEAN NOT NULL DEFAULT false,
    allow_nip05_in_group_messages BOOLEAN NOT NULL DEFAULT false,
    allow_nip05_in_specific_groups TEXT[] DEFAULT '{}',
    encrypted_nip05 TEXT,
    consent_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    privacy_warning_acknowledged BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Foreign key to messaging sessions
    CONSTRAINT fk_identity_disclosure_preferences_session FOREIGN KEY (session_id) REFERENCES messaging_sessions(session_id) ON DELETE CASCADE,

    -- Constraints
    CONSTRAINT identity_disclosure_preferences_session_id_check CHECK (length(session_id) >= 32),
    CONSTRAINT identity_disclosure_preferences_user_hash_check CHECK (length(user_hash) >= 32),

    -- Unique constraint for session
    UNIQUE(session_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_identity_disclosure_preferences_session_id ON identity_disclosure_preferences(session_id);
CREATE INDEX IF NOT EXISTS idx_identity_disclosure_preferences_user_hash ON identity_disclosure_preferences(user_hash);

-- =====================================================================================
-- 9. PRIVACY AUDIT LOG TABLE
-- MASTER CONTEXT COMPLIANCE: Privacy-first audit logging for security monitoring
-- =====================================================================================

CREATE TABLE IF NOT EXISTS privacy_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT,
    user_hash TEXT,
    action_type TEXT NOT NULL CHECK (action_type IN (
        'session_created', 'session_destroyed', 'group_created', 'group_joined', 'group_left',
        'contact_added', 'contact_removed', 'message_sent', 'message_received',
        'guardian_approval_requested', 'guardian_approval_granted', 'guardian_approval_denied',
        'identity_disclosure_enabled', 'identity_disclosure_disabled'
    )),
    resource_type TEXT CHECK (resource_type IN ('session', 'group', 'contact', 'message', 'approval', 'identity')),
    resource_hash TEXT,
    metadata_hash TEXT,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT privacy_audit_log_resource_hash_check CHECK (
        (resource_hash IS NULL) OR (length(resource_hash) >= 32)
    )
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_privacy_audit_log_session_id ON privacy_audit_log(session_id);
CREATE INDEX IF NOT EXISTS idx_privacy_audit_log_user_hash ON privacy_audit_log(user_hash);
CREATE INDEX IF NOT EXISTS idx_privacy_audit_log_action_type ON privacy_audit_log(action_type);
CREATE INDEX IF NOT EXISTS idx_privacy_audit_log_timestamp ON privacy_audit_log(timestamp);

-- =====================================================================================
-- 10. ROW LEVEL SECURITY POLICIES
-- MASTER CONTEXT COMPLIANCE: Privacy-first access control with role hierarchy support
-- =====================================================================================

-- Enable RLS on all tables
ALTER TABLE messaging_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_group_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_direct_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardian_approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_disclosure_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_audit_log ENABLE ROW LEVEL SECURITY;

-- Messaging Sessions Policies
CREATE POLICY "Users can only access their own sessions" ON messaging_sessions
    FOR ALL USING (user_hash = current_setting('app.current_user_hash', true));

-- Privacy Contacts Policies
CREATE POLICY "Users can only access their own contacts" ON privacy_contacts
    FOR ALL USING (
        session_id IN (
            SELECT session_id FROM messaging_sessions
            WHERE user_hash = current_setting('app.current_user_hash', true)
        )
    );

-- Privacy Groups Policies
CREATE POLICY "Users can access groups they created or are members of" ON privacy_groups
    FOR ALL USING (
        created_by_hash = current_setting('app.current_user_hash', true) OR
        session_id IN (
            SELECT group_session_id FROM privacy_group_members
            WHERE member_hash = current_setting('app.current_user_hash', true)
        )
    );

-- Privacy Group Members Policies
CREATE POLICY "Users can access members of groups they belong to" ON privacy_group_members
    FOR ALL USING (
        group_session_id IN (
            SELECT session_id FROM privacy_groups
            WHERE created_by_hash = current_setting('app.current_user_hash', true)
        ) OR
        group_session_id IN (
            SELECT group_session_id FROM privacy_group_members
            WHERE member_hash = current_setting('app.current_user_hash', true)
        )
    );

-- Privacy Group Messages Policies
CREATE POLICY "Users can access messages from groups they belong to" ON privacy_group_messages
    FOR ALL USING (
        group_session_id IN (
            SELECT group_session_id FROM privacy_group_members
            WHERE member_hash = current_setting('app.current_user_hash', true)
        ) OR
        sender_hash = current_setting('app.current_user_hash', true)
    );

-- Privacy Direct Messages Policies
CREATE POLICY "Users can access their own direct messages" ON privacy_direct_messages
    FOR ALL USING (
        sender_session_id IN (
            SELECT session_id FROM messaging_sessions
            WHERE user_hash = current_setting('app.current_user_hash', true)
        ) OR
        recipient_session_id IN (
            SELECT session_id FROM messaging_sessions
            WHERE user_hash = current_setting('app.current_user_hash', true)
        )
    );

-- Guardian Approval Requests Policies
CREATE POLICY "Users can access approval requests they created or are guardians for" ON guardian_approval_requests
    FOR ALL USING (
        requester_pubkey = current_setting('app.current_user_pubkey', true) OR
        guardian_pubkey = current_setting('app.current_user_pubkey', true)
    );

-- Identity Disclosure Preferences Policies
CREATE POLICY "Users can only access their own identity preferences" ON identity_disclosure_preferences
    FOR ALL USING (
        user_hash = current_setting('app.current_user_hash', true)
    );

-- Privacy Audit Log Policies
CREATE POLICY "Users can only access their own audit logs" ON privacy_audit_log
    FOR SELECT USING (
        user_hash = current_setting('app.current_user_hash', true)
    );

-- =====================================================================================
-- 11. FUNCTIONS AND TRIGGERS
-- MASTER CONTEXT COMPLIANCE: Automated privacy-first data management
-- =====================================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at columns
CREATE TRIGGER update_messaging_sessions_updated_at BEFORE UPDATE ON messaging_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_privacy_contacts_updated_at BEFORE UPDATE ON privacy_contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_privacy_groups_updated_at BEFORE UPDATE ON privacy_groups FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_privacy_group_members_updated_at BEFORE UPDATE ON privacy_group_members FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_guardian_approval_requests_updated_at BEFORE UPDATE ON guardian_approval_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_identity_disclosure_preferences_updated_at BEFORE UPDATE ON identity_disclosure_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to clean up expired sessions
-- Drop existing function to avoid return type conflicts
DROP FUNCTION IF EXISTS cleanup_expired_sessions();

CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
    DELETE FROM messaging_sessions WHERE expires_at < NOW();
END;
$$ language 'plpgsql';

-- Function to clean up expired approval requests
-- Drop existing function to avoid return type conflicts
DROP FUNCTION IF EXISTS cleanup_expired_approvals();
CREATE OR REPLACE FUNCTION cleanup_expired_approvals()
RETURNS void AS $$
BEGIN
    UPDATE guardian_approval_requests
    SET status = 'rejected',
        rejection_reason = 'Request expired',
        processed_at = NOW()
    WHERE expires_at < NOW() AND status = 'pending';
END;
$$ language 'plpgsql';

-- =====================================================================================
-- MIGRATION COMPLETE
-- =====================================================================================

-- Grant necessary permissions (adjust as needed for your setup)
-- GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
-- GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Create indexes for foreign key constraints to improve performance
CREATE INDEX IF NOT EXISTS idx_privacy_contacts_session_id_fk ON privacy_contacts(session_id);
CREATE INDEX IF NOT EXISTS idx_privacy_group_members_group_session_id_fk ON privacy_group_members(group_session_id);
CREATE INDEX IF NOT EXISTS idx_privacy_group_messages_group_session_id_fk ON privacy_group_messages(group_session_id);
-- Helper function for setting RLS context (used by tests and applications)
CREATE OR REPLACE FUNCTION set_config(setting_name TEXT, setting_value TEXT, is_local BOOLEAN DEFAULT true)
RETURNS TEXT AS $$
BEGIN
  PERFORM set_config(setting_name, setting_value, is_local);
  RETURN setting_value;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE INDEX IF NOT EXISTS idx_privacy_direct_messages_sender_session_id_fk ON privacy_direct_messages(sender_session_id);
CREATE INDEX IF NOT EXISTS idx_privacy_direct_messages_recipient_session_id_fk ON privacy_direct_messages(recipient_session_id);
CREATE INDEX IF NOT EXISTS idx_identity_disclosure_preferences_session_id_fk ON identity_disclosure_preferences(session_id);

COMMIT;
