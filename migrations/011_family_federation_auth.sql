-- migrations/011_family_federation_auth.sql
-- Family Federation Authentication and Whitelist System

-- Family Federation whitelist table
CREATE TABLE IF NOT EXISTS family_federation_whitelist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nip05_address TEXT UNIQUE NOT NULL,
  federation_id TEXT NOT NULL DEFAULT 'fed_nakamoto_family_2024',
  family_role TEXT CHECK (family_role IN ('parent', 'child', 'guardian')) NOT NULL,
  guardian_approved BOOLEAN DEFAULT false,
  approved_by UUID REFERENCES profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  
  -- Additional metadata
  voting_power INTEGER DEFAULT 1,
  emergency_contacts TEXT[] DEFAULT '{}',
  last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Authentication sessions table
CREATE TABLE IF NOT EXISTS family_auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  npub TEXT NOT NULL,
  nip05_address TEXT NOT NULL,
  session_token TEXT UNIQUE NOT NULL,
  auth_method TEXT CHECK (auth_method IN ('nwc', 'otp')) NOT NULL,
  federation_role TEXT CHECK (federation_role IN ('parent', 'child', 'guardian')),
  is_whitelisted BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '24 hours'),
  last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  
  -- NWC specific fields
  nwc_pubkey TEXT,
  nwc_relay TEXT,
  
  -- OTP specific fields
  otp_verified BOOLEAN DEFAULT false,
  otp_attempts INTEGER DEFAULT 0
);

-- NWC connection attempts log (for security monitoring)
CREATE TABLE IF NOT EXISTS nwc_connection_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  npub TEXT NOT NULL,
  nwc_pubkey TEXT NOT NULL,
  relay_url TEXT NOT NULL,
  success BOOLEAN DEFAULT false,
  error_message TEXT,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- OTP verification attempts log (for security monitoring)
CREATE TABLE IF NOT EXISTS otp_verification_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  npub TEXT NOT NULL,
  nip05_address TEXT,
  otp_code TEXT NOT NULL,
  success BOOLEAN DEFAULT false,
  error_message TEXT,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_family_federation_whitelist_nip05 ON family_federation_whitelist(nip05_address);
CREATE INDEX IF NOT EXISTS idx_family_federation_whitelist_federation_id ON family_federation_whitelist(federation_id);
CREATE INDEX IF NOT EXISTS idx_family_federation_whitelist_active ON family_federation_whitelist(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_family_auth_sessions_npub ON family_auth_sessions(npub);
CREATE INDEX IF NOT EXISTS idx_family_auth_sessions_token ON family_auth_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_family_auth_sessions_active ON family_auth_sessions(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_family_auth_sessions_expires ON family_auth_sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_nwc_connection_attempts_npub ON nwc_connection_attempts(npub);
CREATE INDEX IF NOT EXISTS idx_nwc_connection_attempts_created ON nwc_connection_attempts(created_at);

CREATE INDEX IF NOT EXISTS idx_otp_verification_attempts_npub ON otp_verification_attempts(npub);
CREATE INDEX IF NOT EXISTS idx_otp_verification_attempts_created ON otp_verification_attempts(created_at);

-- Row Level Security policies
ALTER TABLE family_federation_whitelist ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE nwc_connection_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_verification_attempts ENABLE ROW LEVEL SECURITY;

-- Whitelist access policy - users can view their own whitelist status
CREATE POLICY "Users can view their own whitelist status" ON family_federation_whitelist
  FOR SELECT USING (
    nip05_address = COALESCE(
      current_setting('app.current_nip05', true),
      auth.jwt() ->> 'nip05'
    )
  );

-- Guardians can manage whitelist entries
CREATE POLICY "Guardians can manage whitelist" ON family_federation_whitelist
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM family_federation_whitelist w
      WHERE w.nip05_address = COALESCE(
        current_setting('app.current_nip05', true),
        auth.jwt() ->> 'nip05'
      )
      AND w.family_role IN ('parent', 'guardian')
      AND w.is_active = true
      AND w.guardian_approved = true
    )
  );

-- Session management policy - users can manage their own sessions
CREATE POLICY "Users can manage their own sessions" ON family_auth_sessions
  FOR ALL USING (
    npub = COALESCE(
      current_setting('app.current_npub', true),
      auth.jwt() ->> 'npub'
    )
  );

-- Connection attempts - users can view their own attempts
CREATE POLICY "Users can view their own connection attempts" ON nwc_connection_attempts
  FOR SELECT USING (
    npub = COALESCE(
      current_setting('app.current_npub', true),
      auth.jwt() ->> 'npub'
    )
  );

-- OTP attempts - users can view their own attempts
CREATE POLICY "Users can view their own OTP attempts" ON otp_verification_attempts
  FOR SELECT USING (
    npub = COALESCE(
      current_setting('app.current_npub', true),
      auth.jwt() ->> 'npub'
    )
  );

-- Functions for federation whitelist management

-- Function to check if a NIP-05 is whitelisted
CREATE OR REPLACE FUNCTION check_federation_whitelist(
  p_nip05_address TEXT
)
RETURNS TABLE(
  is_whitelisted BOOLEAN,
  family_role TEXT,
  guardian_approved BOOLEAN,
  voting_power INTEGER,
  federation_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    w.is_active as is_whitelisted,
    w.family_role,
    w.guardian_approved,
    w.voting_power,
    w.federation_id
  FROM family_federation_whitelist w
  WHERE w.nip05_address = p_nip05_address
    AND w.is_active = true
    AND (w.expires_at IS NULL OR w.expires_at > NOW());
    
  -- If no record found, return default values
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::TEXT, false, 0, NULL::TEXT;
  END IF;
END;
$$;

-- Function to create or update session
CREATE OR REPLACE FUNCTION create_auth_session(
  p_npub TEXT,
  p_nip05_address TEXT,
  p_session_token TEXT,
  p_auth_method TEXT,
  p_federation_role TEXT DEFAULT NULL,
  p_is_whitelisted BOOLEAN DEFAULT false,
  p_nwc_pubkey TEXT DEFAULT NULL,
  p_nwc_relay TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session_id UUID;
BEGIN
  -- Deactivate any existing sessions for this npub
  UPDATE family_auth_sessions 
  SET is_active = false, last_accessed = NOW()
  WHERE npub = p_npub AND is_active = true;
  
  -- Create new session
  INSERT INTO family_auth_sessions (
    npub,
    nip05_address,
    session_token,
    auth_method,
    federation_role,
    is_whitelisted,
    nwc_pubkey,
    nwc_relay,
    otp_verified
  ) VALUES (
    p_npub,
    p_nip05_address,
    p_session_token,
    p_auth_method,
    p_federation_role,
    p_is_whitelisted,
    p_nwc_pubkey,
    p_nwc_relay,
    CASE WHEN p_auth_method = 'otp' THEN true ELSE false END
  )
  RETURNING id INTO v_session_id;
  
  RETURN v_session_id;
END;
$$;

-- Function to validate session token
CREATE OR REPLACE FUNCTION validate_session_token(
  p_session_token TEXT
)
RETURNS TABLE(
  is_valid BOOLEAN,
  npub TEXT,
  nip05_address TEXT,
  auth_method TEXT,
  federation_role TEXT,
  is_whitelisted BOOLEAN,
  expires_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update last_accessed and return session info
  UPDATE family_auth_sessions 
  SET last_accessed = NOW()
  WHERE session_token = p_session_token
    AND is_active = true
    AND expires_at > NOW();
    
  RETURN QUERY
  SELECT 
    true as is_valid,
    s.npub,
    s.nip05_address,
    s.auth_method,
    s.federation_role,
    s.is_whitelisted,
    s.expires_at
  FROM family_auth_sessions s
  WHERE s.session_token = p_session_token
    AND s.is_active = true
    AND s.expires_at > NOW();
    
  -- If no valid session found
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, false, NULL::TIMESTAMP WITH TIME ZONE;
  END IF;
END;
$$;

-- Function to log NWC connection attempt
CREATE OR REPLACE FUNCTION log_nwc_connection_attempt(
  p_npub TEXT,
  p_nwc_pubkey TEXT,
  p_relay_url TEXT,
  p_success BOOLEAN,
  p_error_message TEXT DEFAULT NULL,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_attempt_id UUID;
BEGIN
  INSERT INTO nwc_connection_attempts (
    npub,
    nwc_pubkey,
    relay_url,
    success,
    error_message,
    ip_address,
    user_agent
  ) VALUES (
    p_npub,
    p_nwc_pubkey,
    p_relay_url,
    p_success,
    p_error_message,
    p_ip_address,
    p_user_agent
  )
  RETURNING id INTO v_attempt_id;
  
  RETURN v_attempt_id;
END;
$$;

-- Function to log OTP verification attempt
CREATE OR REPLACE FUNCTION log_otp_verification_attempt(
  p_npub TEXT,
  p_nip05_address TEXT,
  p_otp_code TEXT,
  p_success BOOLEAN,
  p_error_message TEXT DEFAULT NULL,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_attempt_id UUID;
BEGIN
  INSERT INTO otp_verification_attempts (
    npub,
    nip05_address,
    otp_code,
    success,
    error_message,
    ip_address,
    user_agent
  ) VALUES (
    p_npub,
    p_nip05_address,
    p_otp_code,
    p_success,
    p_error_message,
    p_ip_address,
    p_user_agent
  )
  RETURNING id INTO v_attempt_id;
  
  RETURN v_attempt_id;
END;
$$;

-- Function to cleanup expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cleaned_count INTEGER;
BEGIN
  UPDATE family_auth_sessions 
  SET is_active = false
  WHERE expires_at < NOW() AND is_active = true;
  
  GET DIAGNOSTICS v_cleaned_count = ROW_COUNT;
  
  RETURN v_cleaned_count;
END;
$$;

-- Note: This migration includes sample data for demonstration purposes.
-- In production, remove the following INSERT statements and use the
-- family federation setup API or admin interface to configure whitelist entries.

-- Sample family federation entries (remove in production)
DO $$
BEGIN
  IF current_setting('app.environment', true) = 'development' THEN
    INSERT INTO family_federation_whitelist (nip05_address, federation_id, family_role, guardian_approved, voting_power, emergency_contacts) VALUES
      ('satoshi@satnam.pub', 'fed_nakamoto_family_2024', 'parent', true, 2, ARRAY['hal@satnam.pub', '+1-555-0123']),
      ('hal@satnam.pub', 'fed_nakamoto_family_2024', 'parent', true, 2, ARRAY['satoshi@satnam.pub', '+1-555-0124']),
      ('alice@satnam.pub', 'fed_nakamoto_family_2024', 'child', true, 1, ARRAY['satoshi@satnam.pub', 'hal@satnam.pub']),
      ('bob@satnam.pub', 'fed_nakamoto_family_2024', 'child', true, 1, ARRAY['satoshi@satnam.pub', 'hal@satnam.pub']),
      ('nick@satnam.pub', 'fed_nakamoto_family_2024', 'guardian', true, 1, ARRAY['satoshi@satnam.pub', 'hal@satnam.pub'])
    ON CONFLICT (nip05_address) DO UPDATE SET
      guardian_approved = EXCLUDED.guardian_approved,
      voting_power = EXCLUDED.voting_power,
      emergency_contacts = EXCLUDED.emergency_contacts,
      last_activity = NOW();
  END IF;
END
$$;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION check_federation_whitelist(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_auth_session(TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION validate_session_token(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION log_nwc_connection_attempt(TEXT, TEXT, TEXT, BOOLEAN, TEXT, INET, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION log_otp_verification_attempt(TEXT, TEXT, TEXT, BOOLEAN, TEXT, INET, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_expired_sessions() TO authenticated;

-- Create a scheduled job to cleanup expired sessions (if pg_cron is available)
-- This would typically be set up separately in production
-- SELECT cron.schedule('cleanup-expired-sessions', '0 */6 * * *', 'SELECT cleanup_expired_sessions();');