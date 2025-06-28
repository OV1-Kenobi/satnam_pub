-- Privacy-First Peer Invitations System
-- Version: 014
-- Description: Create privacy-first peer invitations system using hashed UUIDs for authenticated users

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_cron";

-- Simplified Authenticated User Invitations (NO verification required)
CREATE TABLE authenticated_peer_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_token TEXT UNIQUE NOT NULL,
  hashed_invite_id TEXT UNIQUE NOT NULL, -- Hashed UUID
  hashed_inviter_id TEXT NOT NULL, -- Hashed UUID of authenticated user, NO npub
  invitation_data JSONB NOT NULL,
  course_credits INTEGER DEFAULT 1 CHECK (course_credits BETWEEN 1 AND 5),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  hashed_used_by_id TEXT, -- Hashed UUID of accepter, NO npub
  used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  CHECK (expires_at > created_at),
  CHECK (jsonb_typeof(invitation_data) = 'object')
);

-- Course Credits for Authenticated User Referrals
CREATE TABLE authenticated_referral_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hashed_inviter_id TEXT NOT NULL, -- Hashed UUID, NO npub
  hashed_invitee_id TEXT NOT NULL, -- Hashed UUID, NO npub
  credits_amount INTEGER NOT NULL CHECK (credits_amount > 0),
  invite_token TEXT NOT NULL,
  event_type TEXT DEFAULT 'authenticated_referral' CHECK (event_type IN ('authenticated_referral', 'bonus_award')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User credit balances (privacy-preserving)
CREATE TABLE authenticated_user_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hashed_user_id TEXT UNIQUE NOT NULL, -- Hashed UUID, NO npub
  total_credits INTEGER NOT NULL DEFAULT 0 CHECK (total_credits >= 0),
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_auth_invitations_token ON authenticated_peer_invitations(invite_token);
CREATE INDEX idx_auth_invitations_hashed_inviter ON authenticated_peer_invitations(hashed_inviter_id);
CREATE INDEX idx_auth_invitations_expires_at ON authenticated_peer_invitations(expires_at);
CREATE INDEX idx_auth_invitations_used ON authenticated_peer_invitations(used, expires_at);
CREATE INDEX idx_auth_referral_events_inviter ON authenticated_referral_events(hashed_inviter_id);
CREATE INDEX idx_auth_referral_events_invitee ON authenticated_referral_events(hashed_invitee_id);
CREATE INDEX idx_auth_user_credits_hashed_id ON authenticated_user_credits(hashed_user_id);

-- Row Level Security
ALTER TABLE authenticated_peer_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE authenticated_referral_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE authenticated_user_credits ENABLE ROW LEVEL SECURITY;

-- Privacy-preserving functions
CREATE OR REPLACE FUNCTION generate_privacy_hash(input_text TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    salt TEXT := COALESCE(current_setting('app.privacy_salt', true), 'default_salt');
BEGIN
    RETURN encode(digest(salt || input_text || salt, 'sha256'), 'hex');
END;
$$;

-- Function to get user credits (privacy-preserving)
CREATE OR REPLACE FUNCTION get_user_credits_private(user_session_id TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    hashed_id TEXT;
    user_credits INTEGER := 0;
BEGIN
    hashed_id := generate_privacy_hash(user_session_id);
    
    SELECT total_credits INTO user_credits
    FROM authenticated_user_credits
    WHERE hashed_user_id = hashed_id;
    
    -- Initialize if not exists
    IF user_credits IS NULL THEN
        INSERT INTO authenticated_user_credits (hashed_user_id, total_credits)
        VALUES (hashed_id, 0)
        ON CONFLICT (hashed_user_id) DO NOTHING;
        user_credits := 0;
    END IF;
    
    RETURN user_credits;
END;
$$;

-- Function to add credits (privacy-preserving)
CREATE OR REPLACE FUNCTION add_user_credits_private(
    user_session_id TEXT,
    credits_to_add INTEGER,
    invite_token TEXT DEFAULT NULL,
    event_metadata JSONB DEFAULT '{}'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    hashed_id TEXT;
    new_total INTEGER;
BEGIN
    hashed_id := generate_privacy_hash(user_session_id);
    
    -- Update or insert credits
    INSERT INTO authenticated_user_credits (hashed_user_id, total_credits, last_updated)
    VALUES (hashed_id, credits_to_add, NOW())
    ON CONFLICT (hashed_user_id) 
    DO UPDATE SET 
        total_credits = authenticated_user_credits.total_credits + credits_to_add,
        last_updated = NOW()
    RETURNING total_credits INTO new_total;
    
    RETURN new_total;
END;
$$;

-- Function to process invitation acceptance
CREATE OR REPLACE FUNCTION process_invitation_private(
    invite_token_param TEXT,
    accepter_session_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    invitation_record RECORD;
    hashed_accepter_id TEXT;
    credits_awarded INTEGER;
    result JSONB;
BEGIN
    hashed_accepter_id := generate_privacy_hash(accepter_session_id);
    
    -- Get and lock the invitation
    SELECT * INTO invitation_record
    FROM authenticated_peer_invitations
    WHERE invite_token = invite_token_param
    AND used = FALSE
    AND expires_at > NOW()
    FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid or expired invitation'
        );
    END IF;
    
    -- Check if already used by this user
    IF invitation_record.hashed_used_by_id = hashed_accepter_id THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invitation already used by this user'
        );
    END IF;
    
    -- Mark invitation as used
    UPDATE authenticated_peer_invitations
    SET used = TRUE,
        hashed_used_by_id = hashed_accepter_id,
        used_at = NOW()
    WHERE invite_token = invite_token_param;
    
    credits_awarded := invitation_record.course_credits;
    
    -- Award credits to both users
    PERFORM add_user_credits_private(
        accepter_session_id,
        credits_awarded,
        invite_token_param,
        jsonb_build_object('type', 'invitation_accepted')
    );
    
    -- Award credits to inviter (extract session ID from hashed ID securely)
    INSERT INTO authenticated_referral_events (
        hashed_inviter_id,
        hashed_invitee_id,
        credits_amount,
        invite_token,
        event_type,
        metadata
    ) VALUES (
        invitation_record.hashed_inviter_id,
        hashed_accepter_id,
        credits_awarded * 2, -- Both users get credits
        invite_token_param,
        'authenticated_referral',
        jsonb_build_object(
            'credits_per_user', credits_awarded,
            'processed_at', NOW()
        )
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'credits_awarded', credits_awarded,
        'invitation_data', invitation_record.invitation_data,
        'message', 'Invitation processed successfully'
    );
END;
$$;

-- Cleanup expired invitations
CREATE OR REPLACE FUNCTION cleanup_expired_auth_invitations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM authenticated_peer_invitations 
    WHERE expires_at < NOW() - INTERVAL '7 days'
    AND used = FALSE;
    
    -- Also cleanup old referral events (older than 1 year)
    DELETE FROM authenticated_referral_events
    WHERE created_at < NOW() - INTERVAL '1 year';
END;
$$;

-- Schedule cleanup (if pg_cron is available)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.schedule('cleanup-expired-auth-invitations', '0 4 * * *', 'SELECT cleanup_expired_auth_invitations();');
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- pg_cron not available, skip scheduling
    NULL;
END;
$$;

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add trigger for credits table
CREATE TRIGGER update_auth_user_credits_updated_at
    BEFORE UPDATE ON authenticated_user_credits
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions (adjust based on your roles)
-- These would be uncommented and adjusted for your specific role setup
-- GRANT SELECT, INSERT ON authenticated_peer_invitations TO authenticated_role;
-- GRANT SELECT, INSERT ON authenticated_referral_events TO authenticated_role;
-- GRANT SELECT, INSERT, UPDATE ON authenticated_user_credits TO authenticated_role;
-- GRANT EXECUTE ON FUNCTION get_user_credits_private(TEXT) TO authenticated_role;
-- GRANT EXECUTE ON FUNCTION add_user_credits_private(TEXT, INTEGER, TEXT, JSONB) TO authenticated_role;
-- GRANT EXECUTE ON FUNCTION process_invitation_private(TEXT, TEXT) TO authenticated_role;

-- Comments for documentation
COMMENT ON TABLE authenticated_peer_invitations IS 'Privacy-first peer invitations using hashed UUIDs';
COMMENT ON TABLE authenticated_referral_events IS 'Referral events tracking with privacy protection';
COMMENT ON TABLE authenticated_user_credits IS 'User credit balances with hashed identifiers';
COMMENT ON FUNCTION generate_privacy_hash(TEXT) IS 'Generate privacy-preserving hash for user identification';
COMMENT ON FUNCTION get_user_credits_private(TEXT) IS 'Get user credits using session-based privacy hash';
COMMENT ON FUNCTION add_user_credits_private(TEXT, INTEGER, TEXT, JSONB) IS 'Add credits to user with privacy protection';
COMMENT ON FUNCTION process_invitation_private(TEXT, TEXT) IS 'Process invitation acceptance with privacy safeguards';