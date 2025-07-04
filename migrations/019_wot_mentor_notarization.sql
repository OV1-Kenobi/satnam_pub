-- Migration: Web of Trust Mentor Notarization System
-- Replaces Achievement NFTs with WoT mentor verification
-- Author: Zencoder
-- Date: 2025-07-03

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Drop the old achievement_nfts table if it exists
DROP TABLE IF EXISTS achievement_nfts CASCADE;

-- Create mentor registrations table
CREATE TABLE mentor_registrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mentor_pubkey VARCHAR(64) UNIQUE NOT NULL,
    nip05_identifier VARCHAR(255) UNIQUE NOT NULL,
    nip05_verified BOOLEAN NOT NULL DEFAULT false,
    nip05_verification_date TIMESTAMP WITH TIME ZONE,
    competency_areas TEXT[] NOT NULL,
    verification_level VARCHAR(20) NOT NULL DEFAULT 'basic' CHECK (verification_level IN ('basic', 'intermediate', 'advanced')),
    bio TEXT,
    institution_affiliation VARCHAR(255),
    years_experience INTEGER,
    active BOOLEAN NOT NULL DEFAULT true,
    verified_by_institution BOOLEAN NOT NULL DEFAULT false,
    institution_signature TEXT,
    approval_date TIMESTAMP WITH TIME ZONE,
    approved_by_pubkey VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for mentor_registrations
CREATE INDEX idx_mentor_registrations_pubkey ON mentor_registrations(mentor_pubkey);
CREATE INDEX idx_mentor_registrations_nip05 ON mentor_registrations(nip05_identifier);
CREATE INDEX idx_mentor_registrations_active ON mentor_registrations(active);
CREATE INDEX idx_mentor_registrations_verification_level ON mentor_registrations(verification_level);

-- Create WoT mentor notarizations table
CREATE TABLE wot_mentor_notarizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    redemption_id UUID NOT NULL REFERENCES reward_redemptions(id) ON DELETE CASCADE,
    badge_id VARCHAR(255) NOT NULL,
    student_pubkey_hash VARCHAR(255) NOT NULL,
    mentor_pubkey VARCHAR(64) NOT NULL,
    mentor_nip05 VARCHAR(255) NOT NULL,
    mentor_signature TEXT NOT NULL,
    verification_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    verification_notes TEXT,
    verification_level VARCHAR(20) NOT NULL DEFAULT 'basic' CHECK (verification_level IN ('basic', 'intermediate', 'advanced')),
    competency_verified TEXT[], -- Specific competencies verified
    vice_principal_pubkey VARCHAR(64),
    vice_principal_signature TEXT,
    institutional_verification BOOLEAN NOT NULL DEFAULT false,
    institutional_verification_date TIMESTAMP WITH TIME ZONE,
    block_timestamp BIGINT, -- Bitcoin block timestamp
    block_hash VARCHAR(64), -- Bitcoin block hash for anchoring
    verification_hash VARCHAR(64) NOT NULL,
    privacy_level VARCHAR(20) NOT NULL DEFAULT 'public' CHECK (privacy_level IN ('public', 'family', 'private')),
    transferable BOOLEAN NOT NULL DEFAULT false,
    revoked BOOLEAN NOT NULL DEFAULT false,
    revocation_reason TEXT,
    revocation_date TIMESTAMP WITH TIME ZONE,
    nostr_event_id VARCHAR(64),
    nostr_relay_published TEXT[], -- Relays where published
    encrypted_metadata TEXT, -- Encrypted additional data
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for wot_mentor_notarizations
CREATE INDEX idx_wot_notarizations_redemption ON wot_mentor_notarizations(redemption_id);
CREATE INDEX idx_wot_notarizations_badge ON wot_mentor_notarizations(badge_id);
CREATE INDEX idx_wot_notarizations_student ON wot_mentor_notarizations(student_pubkey_hash);
CREATE INDEX idx_wot_notarizations_mentor ON wot_mentor_notarizations(mentor_pubkey);
CREATE INDEX idx_wot_notarizations_verification_hash ON wot_mentor_notarizations(verification_hash);
CREATE INDEX idx_wot_notarizations_privacy ON wot_mentor_notarizations(privacy_level);
CREATE INDEX idx_wot_notarizations_active ON wot_mentor_notarizations(revoked);

-- Create NFC badge integrations table for future use
CREATE TABLE nfc_badge_integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    notarization_id UUID NOT NULL REFERENCES wot_mentor_notarizations(id) ON DELETE CASCADE,
    nfc_chip_id VARCHAR(255) UNIQUE NOT NULL,
    lightning_wallet_pubkey VARCHAR(64),
    pin_protection BOOLEAN NOT NULL DEFAULT false,
    scratch_off_protection BOOLEAN NOT NULL DEFAULT false,
    bearer_note_format VARCHAR(20) NOT NULL DEFAULT 'protected' CHECK (bearer_note_format IN ('protected', 'unprotected', 'pin_protected', 'scratch_off')),
    physical_badge_metadata JSONB NOT NULL,
    manufacturing_date TIMESTAMP WITH TIME ZONE,
    activation_date TIMESTAMP WITH TIME ZONE,
    expiry_date TIMESTAMP WITH TIME ZONE,
    last_access_date TIMESTAMP WITH TIME ZONE,
    access_count INTEGER NOT NULL DEFAULT 0,
    max_access_count INTEGER,
    active BOOLEAN NOT NULL DEFAULT true,
    battery_level INTEGER, -- For active NFC chips
    tamper_evident BOOLEAN NOT NULL DEFAULT false,
    tamper_detected BOOLEAN NOT NULL DEFAULT false,
    tamper_detection_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for nfc_badge_integrations
CREATE INDEX idx_nfc_badges_notarization ON nfc_badge_integrations(notarization_id);
CREATE INDEX idx_nfc_badges_chip_id ON nfc_badge_integrations(nfc_chip_id);
CREATE INDEX idx_nfc_badges_active ON nfc_badge_integrations(active);
CREATE INDEX idx_nfc_badges_wallet ON nfc_badge_integrations(lightning_wallet_pubkey);

-- Create mentor verification history table
CREATE TABLE mentor_verification_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mentor_pubkey VARCHAR(64) NOT NULL,
    student_pubkey_hash VARCHAR(255) NOT NULL,
    badge_id VARCHAR(255) NOT NULL,
    verification_outcome VARCHAR(20) NOT NULL CHECK (verification_outcome IN ('approved', 'rejected', 'pending', 'revised')),
    verification_notes TEXT,
    verification_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    revision_requested BOOLEAN NOT NULL DEFAULT false,
    revision_notes TEXT,
    quality_score INTEGER CHECK (quality_score >= 1 AND quality_score <= 10),
    time_spent_minutes INTEGER,
    verification_artifacts TEXT[], -- Links to supporting materials
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for mentor_verification_history
CREATE INDEX idx_mentor_history_mentor ON mentor_verification_history(mentor_pubkey);
CREATE INDEX idx_mentor_history_student ON mentor_verification_history(student_pubkey_hash);
CREATE INDEX idx_mentor_history_outcome ON mentor_verification_history(verification_outcome);
CREATE INDEX idx_mentor_history_timestamp ON mentor_verification_history(verification_timestamp);

-- Add WoT columns to existing badge_awards table
ALTER TABLE badge_awards ADD COLUMN IF NOT EXISTS mentor_verification_id UUID REFERENCES wot_mentor_notarizations(id);
ALTER TABLE badge_awards ADD COLUMN IF NOT EXISTS wot_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE badge_awards ADD COLUMN IF NOT EXISTS verification_level VARCHAR(20) DEFAULT 'basic' CHECK (verification_level IN ('basic', 'intermediate', 'advanced'));
ALTER TABLE badge_awards ADD COLUMN IF NOT EXISTS mentor_pubkey VARCHAR(64);
ALTER TABLE badge_awards ADD COLUMN IF NOT EXISTS institutional_cosigned BOOLEAN NOT NULL DEFAULT false;

-- Add WoT columns to existing badge_definitions table
ALTER TABLE badge_definitions ADD COLUMN IF NOT EXISTS wot_required BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE badge_definitions ADD COLUMN IF NOT EXISTS min_mentor_level VARCHAR(20) DEFAULT 'basic' CHECK (min_mentor_level IN ('basic', 'intermediate', 'advanced'));
ALTER TABLE badge_definitions ADD COLUMN IF NOT EXISTS required_competencies TEXT[];
ALTER TABLE badge_definitions ADD COLUMN IF NOT EXISTS institutional_cosigning_required BOOLEAN NOT NULL DEFAULT false;

-- Update reward_redemptions table to support WoT notarization
ALTER TABLE reward_redemptions ADD COLUMN IF NOT EXISTS mentor_verification_required BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE reward_redemptions ADD COLUMN IF NOT EXISTS mentor_pubkey VARCHAR(64);
ALTER TABLE reward_redemptions ADD COLUMN IF NOT EXISTS mentor_approval_signature TEXT;
ALTER TABLE reward_redemptions ADD COLUMN IF NOT EXISTS institutional_approval_required BOOLEAN NOT NULL DEFAULT false;

-- Create triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_mentor_registrations_updated_at 
    BEFORE UPDATE ON mentor_registrations 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_wot_mentor_notarizations_updated_at 
    BEFORE UPDATE ON wot_mentor_notarizations 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_nfc_badge_integrations_updated_at 
    BEFORE UPDATE ON nfc_badge_integrations 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE mentor_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE wot_mentor_notarizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE nfc_badge_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE mentor_verification_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for mentor_registrations
CREATE POLICY "Mentor registrations are viewable by everyone" ON mentor_registrations
    FOR SELECT USING (active = true);

CREATE POLICY "Users can register as mentors" ON mentor_registrations
    FOR INSERT WITH CHECK (mentor_pubkey = auth.jwt() ->> 'npub');

CREATE POLICY "Mentors can update their own registration" ON mentor_registrations
    FOR UPDATE USING (mentor_pubkey = auth.jwt() ->> 'npub');

-- RLS Policies for wot_mentor_notarizations
CREATE POLICY "Users can view their own notarizations" ON wot_mentor_notarizations
    FOR SELECT USING (
        student_pubkey_hash = encode(digest(auth.jwt() ->> 'npub', 'sha256'), 'base64')
        OR mentor_pubkey = auth.jwt() ->> 'npub'
        OR privacy_level = 'public'
    );

CREATE POLICY "Mentors can create notarizations" ON wot_mentor_notarizations
    FOR INSERT WITH CHECK (
        mentor_pubkey = auth.jwt() ->> 'npub'
        AND EXISTS (
            SELECT 1 FROM mentor_registrations 
            WHERE mentor_pubkey = auth.jwt() ->> 'npub' 
            AND active = true 
            AND verified_by_institution = true
        )
    );

CREATE POLICY "Mentors can update their own notarizations" ON wot_mentor_notarizations
    FOR UPDATE USING (mentor_pubkey = auth.jwt() ->> 'npub');

-- RLS Policies for nfc_badge_integrations
CREATE POLICY "Users can view their own NFC badges" ON nfc_badge_integrations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM wot_mentor_notarizations 
            WHERE id = nfc_badge_integrations.notarization_id 
            AND student_pubkey_hash = encode(digest(auth.jwt() ->> 'npub', 'sha256'), 'base64')
        )
    );

-- RLS Policies for mentor_verification_history
CREATE POLICY "Mentors can view their own verification history" ON mentor_verification_history
    FOR SELECT USING (mentor_pubkey = auth.jwt() ->> 'npub');

CREATE POLICY "Mentors can create verification history" ON mentor_verification_history
    FOR INSERT WITH CHECK (mentor_pubkey = auth.jwt() ->> 'npub');

-- Functions for WoT system operations

-- Function to verify mentor NIP-05
CREATE OR REPLACE FUNCTION verify_mentor_nip05(
    mentor_pubkey_param TEXT,
    nip05_identifier_param TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    verification_result BOOLEAN := false;
BEGIN
    -- This would integrate with actual NIP-05 verification
    -- For now, we'll mark as verified if properly formatted
    IF nip05_identifier_param ~ '^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$' THEN
        UPDATE mentor_registrations 
        SET nip05_verified = true, nip05_verification_date = NOW()
        WHERE mentor_pubkey = mentor_pubkey_param;
        verification_result := true;
    END IF;
    
    RETURN verification_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate mentor reputation
CREATE OR REPLACE FUNCTION calculate_mentor_reputation(mentor_pubkey_param TEXT)
RETURNS JSONB AS $$
DECLARE
    total_verifications INTEGER;
    approved_verifications INTEGER;
    average_quality_score DECIMAL(3,2);
    reputation_score INTEGER;
    reputation_data JSONB;
BEGIN
    -- Calculate verification statistics
    SELECT 
        COUNT(*),
        COUNT(CASE WHEN verification_outcome = 'approved' THEN 1 END),
        AVG(quality_score)
    INTO total_verifications, approved_verifications, average_quality_score
    FROM mentor_verification_history
    WHERE mentor_pubkey = mentor_pubkey_param;
    
    -- Calculate reputation score (0-100)
    IF total_verifications > 0 THEN
        reputation_score := LEAST(100, 
            (approved_verifications * 100 / total_verifications) * 
            (COALESCE(average_quality_score, 5) / 10)
        );
    ELSE
        reputation_score := 0;
    END IF;
    
    -- Build reputation data
    reputation_data := jsonb_build_object(
        'total_verifications', total_verifications,
        'approved_verifications', approved_verifications,
        'approval_rate', CASE WHEN total_verifications > 0 THEN approved_verifications::DECIMAL / total_verifications ELSE 0 END,
        'average_quality_score', COALESCE(average_quality_score, 0),
        'reputation_score', reputation_score
    );
    
    RETURN reputation_data;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to generate verification hash
CREATE OR REPLACE FUNCTION generate_verification_hash(
    badge_id_param TEXT,
    student_pubkey_hash_param TEXT,
    mentor_pubkey_param TEXT,
    verification_timestamp_param TIMESTAMP WITH TIME ZONE
)
RETURNS TEXT AS $$
BEGIN
    RETURN encode(
        digest(
            badge_id_param || student_pubkey_hash_param || mentor_pubkey_param || 
            extract(epoch from verification_timestamp_param)::TEXT,
            'sha256'
        ),
        'hex'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check mentor competency
CREATE OR REPLACE FUNCTION check_mentor_competency(
    mentor_pubkey_param TEXT,
    required_competencies_param TEXT[]
)
RETURNS BOOLEAN AS $$
DECLARE
    mentor_competencies TEXT[];
    required_competency TEXT;
BEGIN
    -- Get mentor's competency areas
    SELECT competency_areas INTO mentor_competencies
    FROM mentor_registrations
    WHERE mentor_pubkey = mentor_pubkey_param AND active = true;
    
    -- Check if mentor has all required competencies
    FOREACH required_competency IN ARRAY required_competencies_param
    LOOP
        IF NOT (required_competency = ANY(mentor_competencies)) THEN
            RETURN false;
        END IF;
    END LOOP;
    
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Insert default mentor registrations (for testing/development)
INSERT INTO mentor_registrations (
    mentor_pubkey, nip05_identifier, nip05_verified, competency_areas, 
    verification_level, bio, verified_by_institution, institution_signature
) VALUES 
(
    'npub1mentorbitcoinexample123456789abcdef',
    'bitcoin_mentor@citadel.academy',
    true,
    ARRAY['bitcoin-fundamentals', 'self-custody', 'security-ops'],
    'advanced',
    'Bitcoin educator with 5+ years experience in self-custody and security',
    true,
    'institution_signature_placeholder'
),
(
    'npub1mentorligthningexample123456789abcdef',
    'lightning_mentor@citadel.academy',
    true,
    ARRAY['lightning-network', 'bitcoin-fundamentals', 'practical'],
    'intermediate',
    'Lightning Network specialist and practical Bitcoin educator',
    true,
    'institution_signature_placeholder'
),
(
    'npub1mentorfamilyexample123456789abcdef',
    'family_mentor@citadel.academy',
    true,
    ARRAY['family-treasury', 'privacy-sovereignty', 'leadership'],
    'advanced',
    'Family coordination and multi-generational Bitcoin education specialist',
    true,
    'institution_signature_placeholder'
);

-- Update existing badge definitions to include WoT requirements
UPDATE badge_definitions 
SET 
    wot_required = true,
    min_mentor_level = 'basic',
    required_competencies = ARRAY[subject],
    institutional_cosigning_required = CASE WHEN level IN ('master', 'guardian', 'sage') THEN true ELSE false END
WHERE level IN ('apprentice', 'journeyman', 'craftsman', 'master', 'guardian', 'sage');

-- Create views for easy querying

-- View for mentor dashboard
CREATE VIEW mentor_dashboard AS
SELECT 
    mr.mentor_pubkey,
    mr.nip05_identifier,
    mr.competency_areas,
    mr.verification_level,
    mr.active,
    COUNT(wmn.id) as total_notarizations,
    COUNT(CASE WHEN wmn.institutional_verification = true THEN 1 END) as institutional_verified,
    calculate_mentor_reputation(mr.mentor_pubkey) as reputation_data
FROM mentor_registrations mr
LEFT JOIN wot_mentor_notarizations wmn ON mr.mentor_pubkey = wmn.mentor_pubkey
WHERE mr.active = true
GROUP BY mr.mentor_pubkey, mr.nip05_identifier, mr.competency_areas, mr.verification_level, mr.active;

-- View for student WoT achievements
CREATE VIEW student_wot_achievements AS
SELECT 
    wmn.student_pubkey_hash,
    wmn.badge_id,
    wmn.mentor_pubkey,
    mr.nip05_identifier as mentor_nip05,
    wmn.verification_level,
    wmn.institutional_verification,
    wmn.verification_timestamp,
    wmn.privacy_level,
    wmn.transferable,
    wmn.revoked,
    bd.name as badge_name,
    bd.description as badge_description,
    bd.level as badge_level,
    bd.category as badge_category
FROM wot_mentor_notarizations wmn
JOIN mentor_registrations mr ON wmn.mentor_pubkey = mr.mentor_pubkey
JOIN badge_definitions bd ON wmn.badge_id = bd.badge_id
WHERE wmn.revoked = false;

-- Grant permissions
GRANT SELECT ON mentor_registrations TO authenticated;
GRANT SELECT ON wot_mentor_notarizations TO authenticated;
GRANT SELECT ON nfc_badge_integrations TO authenticated;
GRANT SELECT ON mentor_verification_history TO authenticated;
GRANT SELECT ON mentor_dashboard TO authenticated;
GRANT SELECT ON student_wot_achievements TO authenticated;

-- Commit the migration
COMMIT;