-- Migration: Privacy-First OTP System Enhancement
-- File: migrations/016_privacy_first_otp_enhancement.sql
-- This migration enhances the existing OTP system to support session-based privacy-first architecture

-- Add missing columns to family_otp_verification table (if they don't exist)
DO $$ 
BEGIN
    -- Add salt column for OTP hashing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'family_otp_verification' AND column_name = 'salt') THEN
        ALTER TABLE family_otp_verification ADD COLUMN salt TEXT;
    END IF;
    
    -- Add attempts column for rate limiting
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'family_otp_verification' AND column_name = 'attempts') THEN
        ALTER TABLE family_otp_verification ADD COLUMN attempts INTEGER DEFAULT 0;
    END IF;
    
    -- Add metadata column for privacy-safe analytics
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'family_otp_verification' AND column_name = 'metadata') THEN
        ALTER TABLE family_otp_verification ADD COLUMN metadata JSONB;
    END IF;
    
    -- Add updated_at column for tracking changes
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'family_otp_verification' AND column_name = 'updated_at') THEN
        ALTER TABLE family_otp_verification ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
END $$;

-- Add indexes for the new columns (if they don't exist)
CREATE INDEX IF NOT EXISTS idx_otp_verification_salt ON family_otp_verification(salt);
CREATE INDEX IF NOT EXISTS idx_otp_verification_attempts ON family_otp_verification(attempts);
CREATE INDEX IF NOT EXISTS idx_otp_verification_updated_at ON family_otp_verification(updated_at);
CREATE INDEX IF NOT EXISTS idx_otp_verification_metadata ON family_otp_verification USING GIN(metadata);

-- Add constraints for security (if they don't exist)
DO $$
BEGIN
    -- Valid attempts constraint
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                   WHERE table_name = 'family_otp_verification' AND constraint_name = 'valid_attempts') THEN
        ALTER TABLE family_otp_verification 
        ADD CONSTRAINT valid_attempts CHECK (attempts >= 0 AND attempts <= 10);
    END IF;
    
    -- Valid updated_at constraint
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                   WHERE table_name = 'family_otp_verification' AND constraint_name = 'valid_updated_at') THEN
        ALTER TABLE family_otp_verification 
        ADD CONSTRAINT valid_updated_at CHECK (updated_at >= created_at);
    END IF;
END $$;

-- Create trigger function for updated_at timestamp (if it doesn't exist)
CREATE OR REPLACE FUNCTION update_otp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists and create new one
DROP TRIGGER IF EXISTS update_family_otp_verification_updated_at ON family_otp_verification;

CREATE TRIGGER update_family_otp_verification_updated_at
    BEFORE UPDATE ON family_otp_verification
    FOR EACH ROW
    EXECUTE FUNCTION update_otp_updated_at();

-- Create helper function for OTP session creation (compatible with existing schema)
CREATE OR REPLACE FUNCTION create_privacy_otp_session(
    p_session_id TEXT,
    p_hashed_identifier TEXT,
    p_otp_hash TEXT,
    p_salt TEXT,
    p_expires_at TIMESTAMP WITH TIME ZONE,
    p_metadata JSONB DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_uuid_session_id UUID;
BEGIN
    -- Verify service role authentication
    IF auth.role() != 'service_role' THEN
        RAISE EXCEPTION 'Unauthorized access to OTP creation function';
    END IF;
    
    -- Convert session ID to UUID format (or generate new one if invalid)
    BEGIN
        v_uuid_session_id := p_session_id::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_uuid_session_id := gen_random_uuid();
    END;
    
    -- Insert OTP record
    INSERT INTO family_otp_verification (
        id,
        recipient_npub,
        otp_hash,
        salt,
        expires_at,
        metadata,
        attempts,
        used,
        created_at,
        updated_at
    ) VALUES (
        v_uuid_session_id,
        p_hashed_identifier,
        p_otp_hash,
        p_salt,
        p_expires_at,
        p_metadata,
        0,
        FALSE,
        NOW(),
        NOW()
    );
    
    -- Return the session ID as text for consistency
    RETURN v_uuid_session_id::TEXT;
END;
$$;

-- Create helper function for OTP verification (compatible with existing schema)
CREATE OR REPLACE FUNCTION verify_privacy_otp_session(
    p_session_id TEXT,
    p_provided_otp_hash TEXT
)
RETURNS TABLE(
    success BOOLEAN,
    hashed_identifier TEXT,
    attempts_remaining INTEGER,
    error_message TEXT
) AS $$
DECLARE
    v_otp_record RECORD;
    v_max_attempts INTEGER := 3;
    v_uuid_session_id UUID;
BEGIN
    -- Verify service role authentication
    IF auth.role() != 'service_role' THEN
        RAISE EXCEPTION 'Unauthorized access to OTP verification function';
    END IF;
    
    -- Convert session ID to UUID
    BEGIN
        v_uuid_session_id := p_session_id::UUID;
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT FALSE, NULL::TEXT, 0, 'Invalid session ID format';
        RETURN;
    END;
    
    -- Get OTP record
    SELECT * INTO v_otp_record
    FROM family_otp_verification
    WHERE id = v_uuid_session_id
    AND used = FALSE;
    
    -- Check if record exists
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::TEXT, 0, 'Invalid or expired OTP session';
        RETURN;
    END IF;
    
    -- Check expiration
    IF v_otp_record.expires_at < NOW() THEN
        -- Mark as used to prevent further attempts
        UPDATE family_otp_verification 
        SET used = TRUE, used_at = NOW(), updated_at = NOW()
        WHERE id = v_uuid_session_id;
        
        RETURN QUERY SELECT FALSE, v_otp_record.recipient_npub, 0, 'OTP has expired';
        RETURN;
    END IF;
    
    -- Check max attempts
    IF COALESCE(v_otp_record.attempts, 0) >= v_max_attempts THEN
        -- Mark as used to prevent further attempts
        UPDATE family_otp_verification 
        SET used = TRUE, used_at = NOW(), updated_at = NOW()
        WHERE id = v_uuid_session_id;
        
        RETURN QUERY SELECT FALSE, v_otp_record.recipient_npub, 0, 'Maximum OTP attempts exceeded';
        RETURN;
    END IF;
    
    -- Verify OTP hash
    IF v_otp_record.otp_hash = p_provided_otp_hash THEN
        -- Success - mark as used
        UPDATE family_otp_verification 
        SET used = TRUE, used_at = NOW(), updated_at = NOW()
        WHERE id = v_uuid_session_id;
        
        RETURN QUERY SELECT TRUE, v_otp_record.recipient_npub, 0, NULL::TEXT;
        RETURN;
    ELSE
        -- Failed attempt - increment counter
        UPDATE family_otp_verification 
        SET attempts = COALESCE(attempts, 0) + 1, updated_at = NOW()
        WHERE id = v_uuid_session_id;
        
        RETURN QUERY SELECT 
            FALSE, 
            v_otp_record.recipient_npub, 
            v_max_attempts - (COALESCE(v_otp_record.attempts, 0) + 1),
            'Invalid OTP';
        RETURN;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to service role
GRANT EXECUTE ON FUNCTION create_privacy_otp_session TO service_role;
GRANT EXECUTE ON FUNCTION verify_privacy_otp_session TO service_role;
GRANT EXECUTE ON FUNCTION update_otp_updated_at TO service_role;

-- Add comments for documentation
COMMENT ON COLUMN family_otp_verification.salt IS 'Salt used for OTP hashing to prevent rainbow table attacks';
COMMENT ON COLUMN family_otp_verification.attempts IS 'Number of failed verification attempts for this OTP';
COMMENT ON COLUMN family_otp_verification.metadata IS 'Privacy-safe metadata (IP hash, user agent, etc.)';
COMMENT ON COLUMN family_otp_verification.updated_at IS 'Timestamp of last update to this record';

COMMENT ON FUNCTION create_privacy_otp_session IS 'Creates OTP session with privacy-first session ID approach';
COMMENT ON FUNCTION verify_privacy_otp_session IS 'Verifies OTP using session ID with comprehensive security checks';
COMMENT ON FUNCTION update_otp_updated_at IS 'Trigger function to automatically update updated_at timestamp';

-- Clean up any old expired OTPs as part of the migration
DELETE FROM family_otp_verification 
WHERE expires_at < NOW() - INTERVAL '1 hour';

-- Add migration completion log
INSERT INTO security_audit_log (event_type, details) 
VALUES ('migration_completed', '{"migration": "016_privacy_first_otp_enhancement", "timestamp": "' || NOW()::TEXT || '"}')
ON CONFLICT DO NOTHING;