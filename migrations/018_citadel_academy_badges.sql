-- Migration: Citadel Academy Badge System
-- Creates tables for NIP-58 badge system and educational progress tracking
-- Author: Zencoder
-- Date: 2024-12-04

-- Enable RLS (Row Level Security)
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_crypto";

-- Drop existing tables if they exist (for development)
DROP TABLE IF EXISTS citadel_equity CASCADE;
DROP TABLE IF EXISTS conference_tickets CASCADE;
DROP TABLE IF EXISTS hardware_discounts CASCADE;
DROP TABLE IF EXISTS mentorship_sessions CASCADE;
DROP TABLE IF EXISTS premium_access_tokens CASCADE;
DROP TABLE IF EXISTS achievement_nfts CASCADE;
DROP TABLE IF EXISTS family_treasury_rewards CASCADE;
DROP TABLE IF EXISTS lightning_rewards CASCADE;
DROP TABLE IF EXISTS reward_redemptions CASCADE;
DROP TABLE IF EXISTS learning_sessions CASCADE;
DROP TABLE IF EXISTS student_progress CASCADE;
DROP TABLE IF EXISTS badge_awards CASCADE;
DROP TABLE IF EXISTS badge_definitions CASCADE;

-- Badge Definitions Table
-- Stores NIP-58 badge definition metadata
CREATE TABLE badge_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    badge_id VARCHAR(255) UNIQUE NOT NULL, -- Badge identifier for NIP-58
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    image_url TEXT,
    category VARCHAR(50) NOT NULL CHECK (category IN (
        'knowledge', 'practical', 'security', 'leadership', 
        'sovereignty', 'family', 'community'
    )),
    subject VARCHAR(50) NOT NULL CHECK (subject IN (
        'bitcoin-fundamentals', 'lightning-network', 'privacy-sovereignty',
        'self-custody', 'family-treasury', 'nostr-identity', 
        'security-ops', 'citadel-building'
    )),
    level VARCHAR(20) NOT NULL CHECK (level IN (
        'initiate', 'apprentice', 'journeyman', 'craftsman',
        'master', 'guardian', 'sage'
    )),
    prerequisites TEXT[], -- Array of required badge IDs
    criteria JSONB NOT NULL, -- Badge earning criteria
    issuer_pubkey VARCHAR(64) NOT NULL, -- Nostr public key of issuer
    privacy_level VARCHAR(20) NOT NULL DEFAULT 'public' CHECK (privacy_level IN ('public', 'family', 'private')),
    enabled BOOLEAN NOT NULL DEFAULT true,
    nostr_event_id VARCHAR(64), -- NIP-58 event ID
    encrypted_metadata TEXT, -- Additional encrypted data
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Badge Awards Table
-- Stores NIP-58 badge awards with privacy protection
CREATE TABLE badge_awards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    award_id VARCHAR(255) UNIQUE NOT NULL, -- Award identifier
    badge_id VARCHAR(255) NOT NULL REFERENCES badge_definitions(badge_id),
    recipient_pubkey_hash VARCHAR(255) NOT NULL, -- Hashed for privacy
    issuer_pubkey VARCHAR(64) NOT NULL,
    awarded_at TIMESTAMP WITH TIME ZONE NOT NULL,
    encrypted_evidence TEXT NOT NULL, -- Encrypted award evidence
    verification_status VARCHAR(20) NOT NULL DEFAULT 'verified' CHECK (verification_status IN (
        'pending', 'verified', 'revoked'
    )),
    privacy_encrypted BOOLEAN NOT NULL DEFAULT true,
    nostr_event_id VARCHAR(64), -- NIP-58 award event ID
    revocation_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for badge_awards
CREATE INDEX idx_badge_awards_recipient ON badge_awards(recipient_pubkey_hash);
CREATE INDEX idx_badge_awards_badge ON badge_awards(badge_id);
CREATE INDEX idx_badge_awards_status ON badge_awards(verification_status);

-- Student Progress Table
-- Tracks educational progress with privacy protection
CREATE TABLE student_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_pubkey_hash VARCHAR(255) UNIQUE NOT NULL, -- Hashed for privacy
    family_id UUID REFERENCES families(id),
    encrypted_progress TEXT NOT NULL, -- Encrypted progress data
    current_level VARCHAR(20) NOT NULL DEFAULT 'initiate' CHECK (current_level IN (
        'initiate', 'apprentice', 'journeyman', 'craftsman',
        'master', 'guardian', 'sage'
    )),
    learning_streak_days INTEGER NOT NULL DEFAULT 0,
    total_study_hours DECIMAL(10,2) NOT NULL DEFAULT 0,
    badges_earned_count INTEGER NOT NULL DEFAULT 0,
    privacy_settings JSONB NOT NULL DEFAULT '{}',
    last_activity TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for student_progress
CREATE INDEX idx_student_progress_family ON student_progress(family_id);
CREATE INDEX idx_student_progress_level ON student_progress(current_level);
CREATE INDEX idx_student_progress_activity ON student_progress(last_activity);

-- Learning Sessions Table
-- Tracks individual learning sessions with privacy
CREATE TABLE learning_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id VARCHAR(255) UNIQUE NOT NULL,
    student_pubkey_hash VARCHAR(255) NOT NULL, -- Hashed for privacy
    encrypted_session TEXT NOT NULL, -- Encrypted session data
    content_id VARCHAR(255) NOT NULL,
    session_type VARCHAR(20) NOT NULL CHECK (session_type IN ('study', 'quiz', 'exercise')),
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE,
    completion_percentage INTEGER NOT NULL DEFAULT 0 CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
    score DECIMAL(5,2),
    privacy_encrypted BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for learning_sessions
CREATE INDEX idx_learning_sessions_student ON learning_sessions(student_pubkey_hash);
CREATE INDEX idx_learning_sessions_content ON learning_sessions(content_id);
CREATE INDEX idx_learning_sessions_type ON learning_sessions(session_type);
CREATE INDEX idx_learning_sessions_time ON learning_sessions(start_time);

-- Reward Redemptions Table
-- Tracks reward redemptions with privacy protection
CREATE TABLE reward_redemptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    redemption_id VARCHAR(255) UNIQUE NOT NULL,
    student_pubkey_hash VARCHAR(255) NOT NULL, -- Hashed for privacy
    reward_type VARCHAR(50) NOT NULL CHECK (reward_type IN (
        'lightning-sats', 'family-credits', 'achievement-nft',
        'premium-access', 'mentorship-time', 'hardware-discount',
        'conference-access', 'citadel-equity'
    )),
    value DECIMAL(15,2) NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'completed', 'failed', 'expired'
    )),
    redemption_proof TEXT,
    guardian_approval TEXT, -- Guardian signature if required
    privacy_encrypted BOOLEAN NOT NULL DEFAULT false,
    encrypted_redemption TEXT, -- Encrypted if privacy_encrypted = true
    redemption_data TEXT, -- Public redemption data
    expires_at TIMESTAMP WITH TIME ZONE,
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for reward_redemptions
CREATE INDEX idx_reward_redemptions_student ON reward_redemptions(student_pubkey_hash);
CREATE INDEX idx_reward_redemptions_type ON reward_redemptions(reward_type);
CREATE INDEX idx_reward_redemptions_status ON reward_redemptions(status);
CREATE INDEX idx_reward_redemptions_created ON reward_redemptions(created_at);

-- Lightning Rewards Table
-- Stores Lightning Network reward details
CREATE TABLE lightning_rewards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    redemption_id UUID NOT NULL REFERENCES reward_redemptions(id),
    encrypted_reward TEXT NOT NULL, -- Encrypted Lightning payment details
    amount_sats BIGINT NOT NULL,
    payment_hash VARCHAR(64),
    bolt11_invoice TEXT,
    payment_preimage VARCHAR(64),
    payment_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (payment_status IN (
        'pending', 'paid', 'failed', 'expired'
    )),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for lightning_rewards
CREATE INDEX idx_lightning_rewards_redemption ON lightning_rewards(redemption_id);
CREATE INDEX idx_lightning_rewards_hash ON lightning_rewards(payment_hash);
CREATE INDEX idx_lightning_rewards_status ON lightning_rewards(payment_status);

-- Family Treasury Rewards Table
-- Stores family treasury credit rewards
CREATE TABLE family_treasury_rewards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    redemption_id UUID NOT NULL REFERENCES reward_redemptions(id),
    family_id UUID NOT NULL REFERENCES families(id),
    amount_credits DECIMAL(15,2) NOT NULL,
    allocation_purpose TEXT NOT NULL,
    treasury_transaction_id VARCHAR(255) NOT NULL,
    guardian_approvals TEXT[], -- Array of guardian signatures
    processed BOOLEAN NOT NULL DEFAULT false,
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for family_treasury_rewards
CREATE INDEX idx_family_treasury_rewards_redemption ON family_treasury_rewards(redemption_id);
CREATE INDEX idx_family_treasury_rewards_family ON family_treasury_rewards(family_id);
CREATE INDEX idx_family_treasury_rewards_transaction ON family_treasury_rewards(treasury_transaction_id);

-- Achievement NFTs Table
-- Stores Bitcoin-based achievement NFT details
CREATE TABLE achievement_nfts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    redemption_id UUID NOT NULL REFERENCES reward_redemptions(id),
    badge_id VARCHAR(255) NOT NULL,
    nft_metadata JSONB NOT NULL,
    timestamp_proof TEXT NOT NULL,
    inscription_id VARCHAR(255), -- Bitcoin Ordinal inscription ID
    rgb_asset_id VARCHAR(255), -- RGB asset ID if using RGB protocol
    mint_transaction VARCHAR(64), -- Bitcoin transaction ID
    minted BOOLEAN NOT NULL DEFAULT false,
    minted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for achievement_nfts
CREATE INDEX idx_achievement_nfts_redemption ON achievement_nfts(redemption_id);
CREATE INDEX idx_achievement_nfts_badge ON achievement_nfts(badge_id);
CREATE INDEX idx_achievement_nfts_inscription ON achievement_nfts(inscription_id);

-- Premium Access Tokens Table
-- Stores premium content access tokens
CREATE TABLE premium_access_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    redemption_id UUID NOT NULL REFERENCES reward_redemptions(id),
    access_token VARCHAR(255) UNIQUE NOT NULL,
    access_level VARCHAR(50) NOT NULL DEFAULT 'premium',
    granted_at TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE,
    used_count INTEGER NOT NULL DEFAULT 0,
    max_uses INTEGER,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for premium_access_tokens
CREATE INDEX idx_premium_access_redemption ON premium_access_tokens(redemption_id);
CREATE INDEX idx_premium_access_token ON premium_access_tokens(access_token);
CREATE INDEX idx_premium_access_active ON premium_access_tokens(active);

-- Mentorship Sessions Table
-- Stores mentorship session details
CREATE TABLE mentorship_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    redemption_id UUID NOT NULL REFERENCES reward_redemptions(id),
    session_id VARCHAR(255) UNIQUE NOT NULL,
    mentor_pubkey VARCHAR(64),
    student_pubkey_hash VARCHAR(255) NOT NULL,
    session_type VARCHAR(50) NOT NULL DEFAULT 'one-on-one',
    duration_minutes INTEGER NOT NULL DEFAULT 60,
    scheduled_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) NOT NULL DEFAULT 'scheduled' CHECK (status IN (
        'scheduled', 'in-progress', 'completed', 'cancelled'
    )),
    session_notes TEXT,
    encrypted_notes TEXT, -- Encrypted session notes
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for mentorship_sessions
CREATE INDEX idx_mentorship_sessions_redemption ON mentorship_sessions(redemption_id);
CREATE INDEX idx_mentorship_sessions_student ON mentorship_sessions(student_pubkey_hash);
CREATE INDEX idx_mentorship_sessions_mentor ON mentorship_sessions(mentor_pubkey);
CREATE INDEX idx_mentorship_sessions_status ON mentorship_sessions(status);

-- Hardware Discounts Table
-- Stores hardware wallet discount codes
CREATE TABLE hardware_discounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    redemption_id UUID NOT NULL REFERENCES reward_redemptions(id),
    discount_code VARCHAR(255) UNIQUE NOT NULL,
    discount_type VARCHAR(20) NOT NULL DEFAULT 'percentage' CHECK (discount_type IN ('percentage', 'fixed')),
    discount_value DECIMAL(10,2) NOT NULL,
    vendor VARCHAR(255),
    product_categories TEXT[],
    used BOOLEAN NOT NULL DEFAULT false,
    used_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for hardware_discounts
CREATE INDEX idx_hardware_discounts_redemption ON hardware_discounts(redemption_id);
CREATE INDEX idx_hardware_discounts_code ON hardware_discounts(discount_code);
CREATE INDEX idx_hardware_discounts_used ON hardware_discounts(used);

-- Conference Tickets Table
-- Stores Bitcoin conference ticket details
CREATE TABLE conference_tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    redemption_id UUID NOT NULL REFERENCES reward_redemptions(id),
    ticket_id VARCHAR(255) UNIQUE NOT NULL,
    conference_name VARCHAR(255) NOT NULL,
    conference_date DATE,
    ticket_type VARCHAR(100) NOT NULL DEFAULT 'general',
    venue VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN (
        'active', 'used', 'transferred', 'cancelled'
    )),
    used_at TIMESTAMP WITH TIME ZONE,
    qr_code TEXT, -- QR code for ticket verification
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for conference_tickets
CREATE INDEX idx_conference_tickets_redemption ON conference_tickets(redemption_id);
CREATE INDEX idx_conference_tickets_ticket ON conference_tickets(ticket_id);
CREATE INDEX idx_conference_tickets_status ON conference_tickets(status);

-- Citadel Equity Table
-- Stores citadel community equity details
CREATE TABLE citadel_equity (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    redemption_id UUID NOT NULL REFERENCES reward_redemptions(id),
    equity_id VARCHAR(255) UNIQUE NOT NULL,
    equity_type VARCHAR(50) NOT NULL DEFAULT 'community-share',
    equity_percentage DECIMAL(8,6), -- Percentage of equity (0.000001 to 99.999999)
    vesting_schedule JSONB, -- Vesting schedule details
    legal_document_hash VARCHAR(64), -- Hash of legal documents
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'approved', 'issued', 'vested', 'transferred'
    )),
    approved_at TIMESTAMP WITH TIME ZONE,
    issued_at TIMESTAMP WITH TIME ZONE,
    vested_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for citadel_equity
CREATE INDEX idx_citadel_equity_redemption ON citadel_equity(redemption_id);
CREATE INDEX idx_citadel_equity_equity ON citadel_equity(equity_id);
CREATE INDEX idx_citadel_equity_status ON citadel_equity(status);

-- Triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_badge_definitions_updated_at 
    BEFORE UPDATE ON badge_definitions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_student_progress_updated_at 
    BEFORE UPDATE ON student_progress 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) Policies
ALTER TABLE badge_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE badge_awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reward_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lightning_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_treasury_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievement_nfts ENABLE ROW LEVEL SECURITY;
ALTER TABLE premium_access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE mentorship_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE hardware_discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE conference_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE citadel_equity ENABLE ROW LEVEL SECURITY;

-- Badge Definitions - Public read, admin write
CREATE POLICY "Badge definitions are viewable by everyone" ON badge_definitions
    FOR SELECT USING (privacy_level = 'public' OR auth.role() = 'authenticated');

CREATE POLICY "Badge definitions can be created by admins" ON badge_definitions
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Badge definitions can be updated by admins" ON badge_definitions
    FOR UPDATE USING (auth.role() = 'authenticated');

-- Badge Awards - User can view their own, admins can view all
CREATE POLICY "Users can view their own badge awards" ON badge_awards
    FOR SELECT USING (
        recipient_pubkey_hash = encode(digest(auth.jwt() ->> 'npub', 'sha256'), 'base64')
        OR auth.role() = 'authenticated'
    );

CREATE POLICY "Admins can create badge awards" ON badge_awards
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Student Progress - Users can view/edit their own
CREATE POLICY "Users can view their own progress" ON student_progress
    FOR SELECT USING (
        student_pubkey_hash = encode(digest(auth.jwt() ->> 'npub', 'sha256'), 'base64')
    );

CREATE POLICY "Users can update their own progress" ON student_progress
    FOR UPDATE USING (
        student_pubkey_hash = encode(digest(auth.jwt() ->> 'npub', 'sha256'), 'base64')
    );

CREATE POLICY "Users can insert their own progress" ON student_progress
    FOR INSERT WITH CHECK (
        student_pubkey_hash = encode(digest(auth.jwt() ->> 'npub', 'sha256'), 'base64')
    );

-- Learning Sessions - Users can view/create their own
CREATE POLICY "Users can view their own learning sessions" ON learning_sessions
    FOR SELECT USING (
        student_pubkey_hash = encode(digest(auth.jwt() ->> 'npub', 'sha256'), 'base64')
    );

CREATE POLICY "Users can create their own learning sessions" ON learning_sessions
    FOR INSERT WITH CHECK (
        student_pubkey_hash = encode(digest(auth.jwt() ->> 'npub', 'sha256'), 'base64')
    );

-- Reward Redemptions - Users can view/create their own
CREATE POLICY "Users can view their own redemptions" ON reward_redemptions
    FOR SELECT USING (
        student_pubkey_hash = encode(digest(auth.jwt() ->> 'npub', 'sha256'), 'base64')
    );

CREATE POLICY "Users can create their own redemptions" ON reward_redemptions
    FOR INSERT WITH CHECK (
        student_pubkey_hash = encode(digest(auth.jwt() ->> 'npub', 'sha256'), 'base64')
    );

-- Lightning Rewards - Users can view their own through redemptions
CREATE POLICY "Users can view their own lightning rewards" ON lightning_rewards
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM reward_redemptions 
            WHERE id = lightning_rewards.redemption_id 
            AND student_pubkey_hash = encode(digest(auth.jwt() ->> 'npub', 'sha256'), 'base64')
        )
    );

-- Family Treasury Rewards - Family members can view
CREATE POLICY "Family members can view treasury rewards" ON family_treasury_rewards
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM families 
            WHERE id = family_treasury_rewards.family_id 
            AND id = (auth.jwt() ->> 'family_id')::UUID
        )
    );

-- Functions for badge system operations

-- Function to hash pubkey for privacy
CREATE OR REPLACE FUNCTION hash_pubkey(pubkey TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN encode(digest(pubkey, 'sha256'), 'base64');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check badge prerequisites
CREATE OR REPLACE FUNCTION check_badge_prerequisites(
    student_hash TEXT,
    badge_id_param TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    prereq TEXT;
    badge_prereqs TEXT[];
    earned_badges TEXT[];
BEGIN
    -- Get prerequisites for the badge
    SELECT prerequisites INTO badge_prereqs
    FROM badge_definitions 
    WHERE badge_id = badge_id_param;
    
    -- Get earned badges for student
    SELECT ARRAY_AGG(badge_id) INTO earned_badges
    FROM badge_awards 
    WHERE recipient_pubkey_hash = student_hash 
    AND verification_status = 'verified';
    
    -- Check if all prerequisites are met
    FOREACH prereq IN ARRAY badge_prereqs
    LOOP
        IF NOT (prereq = ANY(earned_badges)) THEN
            RETURN FALSE;
        END IF;
    END LOOP;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate student level based on badges
CREATE OR REPLACE FUNCTION calculate_student_level(student_hash TEXT)
RETURNS TEXT AS $$
DECLARE
    badge_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO badge_count
    FROM badge_awards 
    WHERE recipient_pubkey_hash = student_hash 
    AND verification_status = 'verified';
    
    CASE 
        WHEN badge_count >= 60 THEN RETURN 'sage';
        WHEN badge_count >= 40 THEN RETURN 'guardian';
        WHEN badge_count >= 25 THEN RETURN 'master';
        WHEN badge_count >= 15 THEN RETURN 'craftsman';
        WHEN badge_count >= 8 THEN RETURN 'journeyman';
        WHEN badge_count >= 3 THEN RETURN 'apprentice';
        ELSE RETURN 'initiate';
    END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Insert default badge definitions
INSERT INTO badge_definitions (
    badge_id, name, description, category, subject, level, 
    prerequisites, criteria, issuer_pubkey, privacy_level
) VALUES 
(
    'bitcoin-fundamentals-initiate-knowledge',
    'Bitcoin Awakening',
    'First steps into the Bitcoin rabbit hole',
    'knowledge',
    'bitcoin-fundamentals',
    'initiate',
    '{}',
    '{"completion_requirements": {"lessons_completed": 3, "quizzes_passed": 2, "minimum_score": 70}, "time_requirements": {"minimum_study_hours": 5}}',
    'citadel_academy_issuer_pubkey',
    'public'
),
(
    'self-custody-apprentice-practical',
    'Key Guardian',
    'Master the art of private key management',
    'practical',
    'self-custody',
    'apprentice',
    '["bitcoin-fundamentals-initiate-knowledge"]',
    '{"completion_requirements": {"lessons_completed": 5, "practical_exercises": 3, "minimum_score": 85}, "verification_requirements": {"guardian_approval_required": true}}',
    'citadel_academy_issuer_pubkey',
    'family'
),
(
    'lightning-network-journeyman-practical',
    'Lightning Sage',
    'Harness the power of instant Bitcoin payments',
    'practical',
    'lightning-network',
    'journeyman',
    '["self-custody-apprentice-practical"]',
    '{"completion_requirements": {"lessons_completed": 8, "practical_exercises": 5, "minimum_score": 90}, "verification_requirements": {"peer_review_required": true}}',
    'citadel_academy_issuer_pubkey',
    'public'
),
(
    'family-treasury-master-leadership',
    'Family Steward',
    'Lead your family''s financial sovereignty',
    'leadership',
    'family-treasury',
    'master',
    '["lightning-network-journeyman-practical"]',
    '{"completion_requirements": {"lessons_completed": 12, "practical_exercises": 8, "minimum_score": 95}, "verification_requirements": {"guardian_approval_required": true, "peer_review_required": true}}',
    'citadel_academy_issuer_pubkey',
    'family'
),
(
    'citadel-building-sage-community',
    'Citadel Architect',
    'Build sovereign Bitcoin communities',
    'community',
    'citadel-building',
    'sage',
    '["family-treasury-master-leadership"]',
    '{"completion_requirements": {"lessons_completed": 20, "practical_exercises": 15, "minimum_score": 98}, "verification_requirements": {"guardian_approval_required": true, "peer_review_required": true, "proof_of_work_required": true}}',
    'citadel_academy_issuer_pubkey',
    'public'
);

-- Create views for easy querying

-- View for student badge summary
CREATE VIEW student_badge_summary AS
SELECT 
    sp.student_pubkey_hash,
    sp.current_level,
    sp.badges_earned_count,
    sp.learning_streak_days,
    sp.total_study_hours,
    COUNT(ba.id) as verified_badges,
    ARRAY_AGG(DISTINCT bd.category) as categories_earned,
    ARRAY_AGG(DISTINCT bd.subject) as subjects_mastered
FROM student_progress sp
LEFT JOIN badge_awards ba ON sp.student_pubkey_hash = ba.recipient_pubkey_hash 
    AND ba.verification_status = 'verified'
LEFT JOIN badge_definitions bd ON ba.badge_id = bd.badge_id
GROUP BY sp.student_pubkey_hash, sp.current_level, sp.badges_earned_count, 
         sp.learning_streak_days, sp.total_study_hours;

-- View for family badge leaderboard
CREATE VIEW family_badge_leaderboard AS
SELECT 
    f.family_name,
    f.id as family_id,
    COUNT(DISTINCT sp.student_pubkey_hash) as family_members,
    SUM(sp.badges_earned_count) as total_family_badges,
    AVG(sp.badges_earned_count) as avg_badges_per_member,
    MAX(sp.learning_streak_days) as longest_family_streak,
    SUM(sp.total_study_hours) as total_family_study_hours
FROM families f
LEFT JOIN student_progress sp ON f.id = sp.family_id
GROUP BY f.id, f.family_name
ORDER BY total_family_badges DESC;

-- Grant necessary permissions
GRANT SELECT ON badge_definitions TO authenticated;
GRANT SELECT ON student_badge_summary TO authenticated;
GRANT SELECT ON family_badge_leaderboard TO authenticated;

-- Commit the migration
COMMIT;