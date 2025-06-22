-- Migration: Rebuilding Camelot OTP System
-- File: migrations/012_rebuilding_camelot_otp_system.sql

-- Store Rebuilding Camelot nsec in Supabase Vault
-- Note: Replace 'nsec1rebuilding_camelot_private_key_here' with actual nsec
SELECT vault.create_secret(
  'nsec1rebuilding_camelot_private_key_here',
  'rebuilding_camelot_nsec',
  'Rebuilding Camelot Nostr private key for OTP DM authentication'
);

-- Store associated metadata securely
-- Note: Replace 'npub1rebuilding_camelot_public_key_here' with actual npub
SELECT vault.create_secret(
  'npub1rebuilding_camelot_public_key_here',
  'rebuilding_camelot_npub',
  'Rebuilding Camelot Nostr public key for verification'
);

-- Store NIP-05 verification data
SELECT vault.create_secret(
  'RebuildingCamelot@satnam.pub',
  'rebuilding_camelot_nip05',
  'Rebuilding Camelot NIP-05 address for user verification'
);

-- Clean up any existing expired OTP records before creating constraints
-- This prevents migration failures due to existing expired data
DELETE FROM family_otp_verification 
WHERE expires_at < NOW() AND EXISTS (
  SELECT 1 FROM information_schema.tables 
  WHERE table_name = 'family_otp_verification'
);

-- OTP verification tracking table
CREATE TABLE IF NOT EXISTS family_otp_verification (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_npub TEXT NOT NULL,
  otp_hash TEXT NOT NULL, -- SHA-256 hash of OTP + salt
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Security constraints
  -- Only check that expiry is after creation time to avoid migration issues
  CONSTRAINT valid_expiry CHECK (expires_at > created_at)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_otp_verification_npub ON family_otp_verification(recipient_npub);
CREATE INDEX IF NOT EXISTS idx_otp_verification_hash ON family_otp_verification(otp_hash);
CREATE INDEX IF NOT EXISTS idx_otp_verification_expires ON family_otp_verification(expires_at);
CREATE INDEX IF NOT EXISTS idx_otp_verification_used ON family_otp_verification(used) WHERE used = false;

-- Row Level Security
ALTER TABLE family_otp_verification ENABLE ROW LEVEL SECURITY;

-- Policy for service role access only
CREATE POLICY "Service role OTP access" ON family_otp_verification
  FOR ALL USING (auth.role() = 'service_role');

-- Secure function to retrieve nsec for OTP operations
CREATE OR REPLACE FUNCTION get_rebuilding_camelot_nsec()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  nsec_value TEXT;
BEGIN
  -- Verify service role authentication
  IF auth.role() != 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized access to Rebuilding Camelot credentials';
  END IF;
  
  -- Retrieve nsec from vault
  SELECT decrypted_secret INTO nsec_value
  FROM vault.decrypted_secrets
  WHERE name = 'rebuilding_camelot_nsec';
  
  IF nsec_value IS NULL THEN
    RAISE EXCEPTION 'Rebuilding Camelot nsec not found in vault';
  END IF;
  
  RETURN nsec_value;
END;
$$;

-- Function to get NIP-05 address for user messaging
CREATE OR REPLACE FUNCTION get_rebuilding_camelot_nip05()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  nip05_value TEXT;
BEGIN
  -- Verify service role authentication
  IF auth.role() != 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized access to Rebuilding Camelot credentials';
  END IF;
  
  SELECT decrypted_secret INTO nip05_value
  FROM vault.decrypted_secrets
  WHERE name = 'rebuilding_camelot_nip05';
  
  RETURN nip05_value;
END;
$$;

-- Function to get npub for verification
CREATE OR REPLACE FUNCTION get_rebuilding_camelot_npub()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  npub_value TEXT;
BEGIN
  -- Verify service role authentication
  IF auth.role() != 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized access to Rebuilding Camelot credentials';
  END IF;
  
  SELECT decrypted_secret INTO npub_value
  FROM vault.decrypted_secrets
  WHERE name = 'rebuilding_camelot_npub';
  
  RETURN npub_value;
END;
$$;

-- Automatic cleanup of expired OTPs
CREATE OR REPLACE FUNCTION cleanup_expired_otps()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM family_otp_verification 
  WHERE expires_at < NOW() - INTERVAL '1 hour';
END;
$$;

-- Grant execute permissions to service role
GRANT EXECUTE ON FUNCTION get_rebuilding_camelot_nsec() TO service_role;
GRANT EXECUTE ON FUNCTION get_rebuilding_camelot_nip05() TO service_role;
GRANT EXECUTE ON FUNCTION get_rebuilding_camelot_npub() TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_expired_otps() TO service_role;

-- Schedule cleanup every hour (requires pg_cron extension)
-- Note: This will only work if pg_cron is enabled in your Supabase instance
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('cleanup-expired-otps', '0 * * * *', 'SELECT cleanup_expired_otps();');
  END IF;
END $$;

-- Add comment for documentation
COMMENT ON TABLE family_otp_verification IS 'Stores hashed OTP codes for Nostr-based authentication via Rebuilding Camelot account';
COMMENT ON FUNCTION get_rebuilding_camelot_nsec() IS 'Securely retrieves Rebuilding Camelot private key from vault for OTP DM sending';
COMMENT ON FUNCTION get_rebuilding_camelot_nip05() IS 'Retrieves Rebuilding Camelot NIP-05 address for user verification';
COMMENT ON FUNCTION cleanup_expired_otps() IS 'Removes expired OTP verification records to maintain database hygiene';