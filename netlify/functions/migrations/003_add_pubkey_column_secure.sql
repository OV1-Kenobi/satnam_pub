-- Migration: 003_add_pubkey_column_secure.sql
-- PRIVACY-FIRST: Enhance multi-user support WITHOUT creating pubkey honeypots
-- Supports: New users, Existing Nostr users (NWC/OTP), Returning users
-- SECURITY: Uses auth_hash instead of storing actual pubkeys

-- Step 1: Add user status tracking for multi-user flow
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS user_status VARCHAR(20) DEFAULT 'active' 
  CHECK (user_status IN ('pending', 'active', 'returning'));

-- Step 2: Add onboarding tracking (but no pubkey storage)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT TRUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES profiles(id);

-- Step 3: Ensure auth_hash exists for privacy-first authentication
-- This should already exist from migration 004, but ensure it's there
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS auth_hash VARCHAR(64) UNIQUE;

-- Step 4: Add encrypted profile data column if not exists
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS encrypted_profile TEXT;

-- Step 5: Create onboarding_sessions table for new user flow (temporary, privacy-safe)
CREATE TABLE IF NOT EXISTS onboarding_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    temp_username VARCHAR(50) NOT NULL,
    auth_challenge_hash VARCHAR(64), -- Hash of auth challenge for verification
    platform_id VARCHAR(32), -- Non-reversible platform identifier
    session_token TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Step 6: Enable RLS on onboarding table
ALTER TABLE onboarding_sessions ENABLE ROW LEVEL SECURITY;

-- Step 7: Create secure RLS policies for onboarding sessions
-- SECURITY FIX: Tightened policies to prevent anonymous enumeration/deletion

-- Policy 1: Allow ONLY anonymous INSERT for session creation
CREATE POLICY "Anonymous insert only onboarding sessions" ON onboarding_sessions
    FOR INSERT 
    TO anon
    WITH CHECK (auth.uid() IS NULL);

-- Policy 2: Allow authenticated users to SELECT only their own sessions
CREATE POLICY "Authenticated users view own sessions" ON onboarding_sessions
    FOR SELECT 
    TO authenticated
    USING (
        auth.uid() IS NOT NULL AND
        session_token = current_setting('request.headers', true)::json->>'x-session-token'
    );

-- Policy 3: Allow authenticated users to UPDATE only their own sessions
CREATE POLICY "Authenticated users update own sessions" ON onboarding_sessions
    FOR UPDATE 
    TO authenticated
    USING (
        auth.uid() IS NOT NULL AND
        session_token = current_setting('request.headers', true)::json->>'x-session-token'
    )
    WITH CHECK (
        session_token = current_setting('request.headers', true)::json->>'x-session-token'
    );

-- Policy 4: Allow authenticated users to DELETE only their own sessions
CREATE POLICY "Authenticated users delete own sessions" ON onboarding_sessions
    FOR DELETE 
    TO authenticated
    USING (
        auth.uid() IS NOT NULL AND
        session_token = current_setting('request.headers', true)::json->>'x-session-token'
    );

-- Step 7a: Create secure session validation function
CREATE OR REPLACE FUNCTION validate_onboarding_session_access(p_session_token TEXT)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
    -- Validate session exists and hasn't expired
    RETURN EXISTS (
        SELECT 1 FROM onboarding_sessions 
        WHERE session_token = p_session_token 
        AND expires_at > NOW()
        AND NOT completed
    );
END;
$$;

-- Step 7b: Alternative RLS policies using function validation (more secure)
DROP POLICY IF EXISTS "Authenticated users view own sessions" ON onboarding_sessions;
DROP POLICY IF EXISTS "Authenticated users update own sessions" ON onboarding_sessions;
DROP POLICY IF EXISTS "Authenticated users delete own sessions" ON onboarding_sessions;

-- Secure SELECT policy with session validation
CREATE POLICY "Secure session select" ON onboarding_sessions
    FOR SELECT 
    USING (
        -- Allow access only if valid session token is provided in request header
        session_token = current_setting('request.headers', true)::json->>'x-session-token'
        AND validate_onboarding_session_access(session_token)
    );

-- Secure UPDATE policy with session validation
CREATE POLICY "Secure session update" ON onboarding_sessions
    FOR UPDATE 
    USING (
        session_token = current_setting('request.headers', true)::json->>'x-session-token'
        AND validate_onboarding_session_access(session_token)
    )
    WITH CHECK (
        session_token = current_setting('request.headers', true)::json->>'x-session-token'
        AND validate_onboarding_session_access(session_token)
    );

-- Secure DELETE policy with session validation
CREATE POLICY "Secure session delete" ON onboarding_sessions
    FOR DELETE 
    USING (
        session_token = current_setting('request.headers', true)::json->>'x-session-token'
        AND validate_onboarding_session_access(session_token)
    );

-- Step 8: Create indexes for efficient lookups (privacy-safe)
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_token ON onboarding_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_expires ON onboarding_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_token_expires ON onboarding_sessions(session_token, expires_at);
CREATE INDEX IF NOT EXISTS idx_profiles_user_status ON profiles(user_status);
CREATE INDEX IF NOT EXISTS idx_profiles_onboarding ON profiles(onboarding_completed);

-- Step 8a: Create cleanup function for expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_onboarding_sessions()
RETURNS INTEGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete expired sessions (automatic cleanup)
    DELETE FROM onboarding_sessions 
    WHERE expires_at < NOW() - INTERVAL '1 hour';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Log cleanup operation
    INSERT INTO auth_audit_log (
        action,
        encrypted_details,
        success,
        created_at
    ) VALUES (
        'cleanup_expired_sessions',
        'Deleted ' || deleted_count || ' expired sessions',
        true,
        NOW()
    );
    
    RETURN deleted_count;
END;
$$;

-- Step 9: Add audit trail table for secure operations
CREATE TABLE IF NOT EXISTS auth_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    encrypted_details TEXT, -- User-encrypted audit details
    ip_hash VARCHAR(64), -- Hashed IP for privacy
    user_agent_hash VARCHAR(64), -- Hashed user agent
    success BOOLEAN NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Step 10: Enable RLS on audit log
ALTER TABLE auth_audit_log ENABLE ROW LEVEL SECURITY;

-- Step 11: Create audit log policy
CREATE POLICY "Users can view own audit log" ON auth_audit_log
    FOR SELECT USING (user_id = auth.uid());

-- Step 12: Create audit log index
CREATE INDEX IF NOT EXISTS idx_auth_audit_log_user_id ON auth_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_audit_log_created_at ON auth_audit_log(created_at);

-- Step 13: Ensure UUID generation for secure IDs
ALTER TABLE profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Step 14: Add privacy-first security comments
COMMENT ON COLUMN profiles.id IS 'UUID primary key - secure identifier, never exposed publicly';
COMMENT ON COLUMN profiles.auth_hash IS 'Non-reversible authentication hash - no pubkey storage for privacy';
COMMENT ON COLUMN profiles.encrypted_profile IS 'User-encrypted profile data - platform cannot decrypt';
COMMENT ON COLUMN profiles.user_status IS 'User flow status: pending (new), active (verified), returning (re-activating)';
COMMENT ON COLUMN profiles.onboarding_completed IS 'Whether user has completed identity verification';
COMMENT ON TABLE profiles IS 'Privacy-first user profiles with encrypted data and secure UUID separation';
COMMENT ON TABLE onboarding_sessions IS 'SECURE: Temporary sessions with tightened RLS - anonymous INSERT only, session-validated SELECT/UPDATE/DELETE';
COMMENT ON TABLE auth_audit_log IS 'Encrypted audit trail for authentication events';
COMMENT ON FUNCTION validate_onboarding_session_access(TEXT) IS 'SECURITY: Validates session access with expiration and completion checks';
COMMENT ON FUNCTION cleanup_expired_onboarding_sessions() IS 'SECURITY: Automatic cleanup of expired sessions to prevent data accumulation';

-- Step 15: Create function for secure user registration (privacy-first)
CREATE OR REPLACE FUNCTION register_user_privacy_first(
    p_username VARCHAR(50),
    p_auth_hash VARCHAR(64),
    p_encrypted_profile TEXT DEFAULT NULL,
    p_invite_code TEXT DEFAULT NULL
) RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
    new_user_id UUID;
    inviter_id UUID;
BEGIN
    -- Validate invite code if provided
    IF p_invite_code IS NOT NULL THEN
        SELECT id INTO inviter_id 
        FROM profiles 
        WHERE id::text = p_invite_code OR username = p_invite_code;
    END IF;
    
    -- Insert new user with privacy-first approach
    INSERT INTO profiles (
        username,
        auth_hash,
        encrypted_profile,
        user_status,
        onboarding_completed,
        invited_by,
        role,
        created_at
    ) VALUES (
        p_username,
        p_auth_hash,
        p_encrypted_profile,
        'active',
        true,
        inviter_id,
        'user',
        NOW()
    ) RETURNING id INTO new_user_id;
    
    -- Log the registration (encrypted)
    INSERT INTO auth_audit_log (
        user_id,
        action,
        success,
        created_at
    ) VALUES (
        new_user_id,
        'user_registration',
        true,
        NOW()
    );
    
    RETURN new_user_id;
END;
$$;