-- Privacy-First Contacts Management System Migration
-- This migration creates tables to support encrypted contact management
-- while maintaining privacy-first principles and data minimization

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create encrypted_contacts table for storing contact information
CREATE TABLE IF NOT EXISTS encrypted_contacts (
    id TEXT PRIMARY KEY,
    owner_hash TEXT NOT NULL,
    encrypted_npub TEXT NOT NULL,
    nip05_hash TEXT,
    display_name_hash TEXT NOT NULL,
    family_role TEXT CHECK (family_role IN ('parent', 'child', 'guardian', 'advisor', 'friend')),
    trust_level TEXT NOT NULL CHECK (trust_level IN ('family', 'trusted', 'known', 'unverified')),
    supports_gift_wrap BOOLEAN DEFAULT FALSE,
    preferred_encryption TEXT NOT NULL CHECK (preferred_encryption IN ('gift-wrap', 'nip04', 'auto')),
    tags_hash TEXT[],
    notes_encrypted TEXT, -- Encrypted notes using session key
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_contact_at TIMESTAMPTZ,
    contact_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient querying while preserving privacy
CREATE INDEX IF NOT EXISTS idx_encrypted_contacts_owner_hash 
    ON encrypted_contacts(owner_hash);
CREATE INDEX IF NOT EXISTS idx_encrypted_contacts_trust_level 
    ON encrypted_contacts(owner_hash, trust_level);
CREATE INDEX IF NOT EXISTS idx_encrypted_contacts_family_role 
    ON encrypted_contacts(owner_hash, family_role);
CREATE INDEX IF NOT EXISTS idx_encrypted_contacts_added_at 
    ON encrypted_contacts(owner_hash, added_at DESC);
CREATE INDEX IF NOT EXISTS idx_encrypted_contacts_supports_gift_wrap 
    ON encrypted_contacts(owner_hash, supports_gift_wrap);

-- Create contact_interaction_log for tracking contact interactions (privacy-safe)
CREATE TABLE IF NOT EXISTS contact_interaction_log (
    id SERIAL PRIMARY KEY,
    contact_id TEXT NOT NULL REFERENCES encrypted_contacts(id) ON DELETE CASCADE,
    owner_hash TEXT NOT NULL,
    interaction_type TEXT NOT NULL CHECK (
        interaction_type IN ('message_sent', 'message_received', 'gift_wrap_detected', 'nip05_verified', 'contact_updated')
    ),
    interaction_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    session_hash TEXT, -- Hash of session ID for correlation without exposing actual session
    encrypted_metadata JSONB DEFAULT '{}', -- Any interaction-specific data, encrypted
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for interaction log
CREATE INDEX IF NOT EXISTS idx_contact_interaction_log_contact_id 
    ON contact_interaction_log(contact_id, interaction_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_contact_interaction_log_owner_hash 
    ON contact_interaction_log(owner_hash, interaction_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_contact_interaction_log_type 
    ON contact_interaction_log(owner_hash, interaction_type, interaction_timestamp DESC);

-- Create contact_trust_metrics for tracking trust-related metrics (privacy-safe)
CREATE TABLE IF NOT EXISTS contact_trust_metrics (
    id SERIAL PRIMARY KEY,
    contact_id TEXT NOT NULL REFERENCES encrypted_contacts(id) ON DELETE CASCADE,
    owner_hash TEXT NOT NULL,
    trust_score_encrypted TEXT, -- Encrypted trust score calculation
    gift_wrap_success_rate DECIMAL(5,2) DEFAULT 0.00,
    message_reliability_score DECIMAL(5,2) DEFAULT 0.00,
    last_trust_calculation TIMESTAMPTZ DEFAULT NOW(),
    calculation_metadata_encrypted TEXT, -- Encrypted details about trust calculation
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(contact_id, owner_hash)
);

-- Create indexes for trust metrics
CREATE INDEX IF NOT EXISTS idx_contact_trust_metrics_contact_id 
    ON contact_trust_metrics(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_trust_metrics_owner_hash 
    ON contact_trust_metrics(owner_hash, last_trust_calculation DESC);

-- Create contact_groups table for organizing contacts into privacy-aware groups
CREATE TABLE IF NOT EXISTS contact_groups (
    id TEXT PRIMARY KEY,
    owner_hash TEXT NOT NULL,
    group_name_hash TEXT NOT NULL, -- Hashed group name for privacy
    group_type TEXT NOT NULL CHECK (group_type IN ('family', 'work', 'friends', 'custom')),
    privacy_level TEXT NOT NULL CHECK (privacy_level IN ('high', 'medium', 'low')),
    encrypted_description TEXT, -- Encrypted group description
    member_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for contact groups
CREATE INDEX IF NOT EXISTS idx_contact_groups_owner_hash 
    ON contact_groups(owner_hash);
CREATE INDEX IF NOT EXISTS idx_contact_groups_type 
    ON contact_groups(owner_hash, group_type);

-- Create contact_group_memberships junction table
CREATE TABLE IF NOT EXISTS contact_group_memberships (
    id SERIAL PRIMARY KEY,
    contact_id TEXT NOT NULL REFERENCES encrypted_contacts(id) ON DELETE CASCADE,
    group_id TEXT NOT NULL REFERENCES contact_groups(id) ON DELETE CASCADE,
    owner_hash TEXT NOT NULL,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    role_in_group TEXT CHECK (role_in_group IN ('member', 'admin', 'moderator')),
    UNIQUE(contact_id, group_id)
);

-- Create indexes for group memberships
CREATE INDEX IF NOT EXISTS idx_contact_group_memberships_contact_id 
    ON contact_group_memberships(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_group_memberships_group_id 
    ON contact_group_memberships(group_id);
CREATE INDEX IF NOT EXISTS idx_contact_group_memberships_owner_hash 
    ON contact_group_memberships(owner_hash);

-- Create contact_privacy_preferences for per-contact privacy settings
CREATE TABLE IF NOT EXISTS contact_privacy_preferences (
    id SERIAL PRIMARY KEY,
    contact_id TEXT NOT NULL REFERENCES encrypted_contacts(id) ON DELETE CASCADE,
    owner_hash TEXT NOT NULL,
    allow_identity_disclosure BOOLEAN DEFAULT FALSE,
    require_gift_wrap BOOLEAN DEFAULT TRUE,
    block_plain_text BOOLEAN DEFAULT TRUE,
    auto_accept_gift_wrap BOOLEAN DEFAULT TRUE,
    privacy_warning_shown BOOLEAN DEFAULT FALSE,
    privacy_consent_given BOOLEAN DEFAULT FALSE,
    consent_timestamp TIMESTAMPTZ,
    privacy_settings_encrypted TEXT, -- Encrypted additional privacy settings
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(contact_id, owner_hash)
);

-- Create indexes for privacy preferences
CREATE INDEX IF NOT EXISTS idx_contact_privacy_preferences_contact_id 
    ON contact_privacy_preferences(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_privacy_preferences_owner_hash 
    ON contact_privacy_preferences(owner_hash);
CREATE INDEX IF NOT EXISTS idx_contact_privacy_preferences_disclosure 
    ON contact_privacy_preferences(owner_hash, allow_identity_disclosure);

-- Create contact_verification_status for tracking verification of contacts
CREATE TABLE IF NOT EXISTS contact_verification_status (
    id SERIAL PRIMARY KEY,
    contact_id TEXT NOT NULL REFERENCES encrypted_contacts(id) ON DELETE CASCADE,
    owner_hash TEXT NOT NULL,
    nip05_verified BOOLEAN DEFAULT FALSE,
    nip05_verification_date TIMESTAMPTZ,
    pubkey_verified BOOLEAN DEFAULT FALSE,
    pubkey_verification_date TIMESTAMPTZ,
    gift_wrap_capability_verified BOOLEAN DEFAULT FALSE,
    gift_wrap_verification_date TIMESTAMPTZ,
    verification_proofs_encrypted TEXT, -- Encrypted verification proofs
    last_verification_attempt TIMESTAMPTZ,
    verification_failure_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(contact_id, owner_hash)
);

-- Create indexes for verification status
CREATE INDEX IF NOT EXISTS idx_contact_verification_status_contact_id 
    ON contact_verification_status(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_verification_status_owner_hash 
    ON contact_verification_status(owner_hash);
CREATE INDEX IF NOT EXISTS idx_contact_verification_status_nip05 
    ON contact_verification_status(owner_hash, nip05_verified);

-- Create function to automatically update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at columns
CREATE TRIGGER update_encrypted_contacts_updated_at 
    BEFORE UPDATE ON encrypted_contacts 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contact_trust_metrics_updated_at 
    BEFORE UPDATE ON contact_trust_metrics 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contact_groups_updated_at 
    BEFORE UPDATE ON contact_groups 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contact_privacy_preferences_updated_at 
    BEFORE UPDATE ON contact_privacy_preferences 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contact_verification_status_updated_at 
    BEFORE UPDATE ON contact_verification_status 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to update member counts in contact_groups
CREATE OR REPLACE FUNCTION update_group_member_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE contact_groups 
        SET member_count = member_count + 1 
        WHERE id = NEW.group_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE contact_groups 
        SET member_count = member_count - 1 
        WHERE id = OLD.group_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ language 'plpgsql';

-- Create triggers for group member count
CREATE TRIGGER update_group_member_count_insert
    AFTER INSERT ON contact_group_memberships
    FOR EACH ROW EXECUTE FUNCTION update_group_member_count();

CREATE TRIGGER update_group_member_count_delete
    AFTER DELETE ON contact_group_memberships
    FOR EACH ROW EXECUTE FUNCTION update_group_member_count();

-- Create function to log contact interactions
CREATE OR REPLACE FUNCTION log_contact_interaction(
    p_contact_id TEXT,
    p_owner_hash TEXT,
    p_interaction_type TEXT,
    p_session_hash TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO contact_interaction_log (
        contact_id,
        owner_hash,
        interaction_type,
        session_hash,
        encrypted_metadata
    ) VALUES (
        p_contact_id,
        p_owner_hash,
        p_interaction_type,
        p_session_hash,
        p_metadata
    );
    
    -- Update last_contact_at in the contacts table
    UPDATE encrypted_contacts 
    SET 
        last_contact_at = NOW(),
        contact_count = contact_count + 1
    WHERE id = p_contact_id AND owner_hash = p_owner_hash;
END;
$$ language 'plpgsql';

-- Create view for contact summary (privacy-safe aggregations)
CREATE OR REPLACE VIEW contact_summary AS
SELECT 
    ec.id,
    ec.owner_hash,
    ec.display_name_hash,
    ec.family_role,
    ec.trust_level,
    ec.supports_gift_wrap,
    ec.preferred_encryption,
    ec.added_at,
    ec.last_contact_at,
    ec.contact_count,
    cv.nip05_verified,
    cv.pubkey_verified,
    cv.gift_wrap_capability_verified,
    tm.gift_wrap_success_rate,
    tm.message_reliability_score,
    COUNT(cgm.group_id) as group_membership_count
FROM encrypted_contacts ec
LEFT JOIN contact_verification_status cv ON ec.id = cv.contact_id
LEFT JOIN contact_trust_metrics tm ON ec.id = tm.contact_id
LEFT JOIN contact_group_memberships cgm ON ec.id = cgm.contact_id
GROUP BY 
    ec.id, ec.owner_hash, ec.display_name_hash, ec.family_role, ec.trust_level,
    ec.supports_gift_wrap, ec.preferred_encryption, ec.added_at, ec.last_contact_at,
    ec.contact_count, cv.nip05_verified, cv.pubkey_verified, cv.gift_wrap_capability_verified,
    tm.gift_wrap_success_rate, tm.message_reliability_score;

-- Create RLS (Row Level Security) policies for privacy protection
ALTER TABLE encrypted_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_interaction_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_trust_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_group_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_privacy_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_verification_status ENABLE ROW LEVEL SECURITY;

-- Create policies to ensure users can only access their own data
CREATE POLICY "Users can only access their own contacts" ON encrypted_contacts
    FOR ALL USING (owner_hash = current_setting('app.current_user_hash', true));

CREATE POLICY "Users can only access their own interaction logs" ON contact_interaction_log
    FOR ALL USING (owner_hash = current_setting('app.current_user_hash', true));

CREATE POLICY "Users can only access their own trust metrics" ON contact_trust_metrics
    FOR ALL USING (owner_hash = current_setting('app.current_user_hash', true));

CREATE POLICY "Users can only access their own groups" ON contact_groups
    FOR ALL USING (owner_hash = current_setting('app.current_user_hash', true));

CREATE POLICY "Users can only access their own group memberships" ON contact_group_memberships
    FOR ALL USING (owner_hash = current_setting('app.current_user_hash', true));

CREATE POLICY "Users can only access their own privacy preferences" ON contact_privacy_preferences
    FOR ALL USING (owner_hash = current_setting('app.current_user_hash', true));

CREATE POLICY "Users can only access their own verification status" ON contact_verification_status
    FOR ALL USING (owner_hash = current_setting('app.current_user_hash', true));

-- Create function to clean up old interaction logs (data retention)
CREATE OR REPLACE FUNCTION cleanup_old_interaction_logs()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete interaction logs older than 90 days
    DELETE FROM contact_interaction_log 
    WHERE interaction_timestamp < NOW() - INTERVAL '90 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ language 'plpgsql';

-- Create function to anonymize contacts (for GDPR compliance)
CREATE OR REPLACE FUNCTION anonymize_contact(p_contact_id TEXT, p_owner_hash TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    -- Anonymize the contact by removing personal data but keeping aggregated metrics
    UPDATE encrypted_contacts 
    SET 
        encrypted_npub = 'ANONYMIZED',
        nip05_hash = NULL,
        display_name_hash = 'ANONYMIZED_USER',
        notes_encrypted = NULL,
        tags_hash = ARRAY[]::TEXT[],
        metadata = '{}'::JSONB
    WHERE id = p_contact_id AND owner_hash = p_owner_hash;
    
    -- Mark as anonymized in verification status
    UPDATE contact_verification_status 
    SET verification_proofs_encrypted = 'ANONYMIZED'
    WHERE contact_id = p_contact_id AND owner_hash = p_owner_hash;
    
    -- Clear privacy preferences
    DELETE FROM contact_privacy_preferences 
    WHERE contact_id = p_contact_id AND owner_hash = p_owner_hash;
    
    RETURN FOUND;
END;
$$ language 'plpgsql';

-- Create indexes for performance optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contact_interaction_log_timestamp 
    ON contact_interaction_log USING BRIN (interaction_timestamp);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_encrypted_contacts_composite 
    ON encrypted_contacts(owner_hash, trust_level, supports_gift_wrap, added_at DESC);

-- Add comments for documentation
COMMENT ON TABLE encrypted_contacts IS 'Stores encrypted contact information with privacy-first principles';
COMMENT ON TABLE contact_interaction_log IS 'Privacy-safe log of contact interactions for metrics';
COMMENT ON TABLE contact_trust_metrics IS 'Encrypted trust scoring and reliability metrics';
COMMENT ON TABLE contact_groups IS 'Privacy-aware contact grouping system';
COMMENT ON TABLE contact_privacy_preferences IS 'Per-contact privacy settings and consent';
COMMENT ON TABLE contact_verification_status IS 'Contact verification status and proofs';

COMMENT ON FUNCTION log_contact_interaction IS 'Safely logs contact interactions while preserving privacy';
COMMENT ON FUNCTION cleanup_old_interaction_logs IS 'Automated cleanup for data retention compliance';
COMMENT ON FUNCTION anonymize_contact IS 'GDPR-compliant contact anonymization';

-- Grant necessary permissions (adjust based on your app's role structure)
-- GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
-- GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;