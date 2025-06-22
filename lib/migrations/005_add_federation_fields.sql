-- Migration: 005_add_federation_fields.sql
-- Add federation-specific fields to support session management
-- Privacy-compliant: Uses hashed identifiers instead of raw npub

-- Add federation-specific columns to profiles table
-- Note: We use npub_hash instead of raw npub for privacy
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS npub_hash VARCHAR(64); -- Hash of npub for lookup
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nip05_hash VARCHAR(64); -- Hash of nip05 for lookup (optional)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS federation_role VARCHAR(20) DEFAULT 'child' CHECK (federation_role IN ('parent', 'child', 'guardian'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS auth_method VARCHAR(10) DEFAULT 'otp' CHECK (auth_method IN ('otp', 'nwc'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_whitelisted BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS voting_power INTEGER DEFAULT 1;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS guardian_approved BOOLEAN DEFAULT FALSE;

-- Create indexes for better performance (on hashed values for privacy)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_npub_hash ON profiles(npub_hash);
CREATE INDEX IF NOT EXISTS idx_profiles_nip05_hash ON profiles(nip05_hash);
CREATE INDEX IF NOT EXISTS idx_profiles_federation_role ON profiles(federation_role);
CREATE INDEX IF NOT EXISTS idx_profiles_is_whitelisted ON profiles(is_whitelisted);

-- Add comments for documentation
COMMENT ON COLUMN profiles.npub_hash IS 'Hashed Nostr public key for privacy-preserving lookup';
COMMENT ON COLUMN profiles.nip05_hash IS 'Hashed NIP-05 identifier for privacy-preserving lookup';
COMMENT ON COLUMN profiles.federation_role IS 'Role within the family federation';
COMMENT ON COLUMN profiles.auth_method IS 'Authentication method used by the user';
COMMENT ON COLUMN profiles.is_whitelisted IS 'Whether user is whitelisted for special privileges';
COMMENT ON COLUMN profiles.voting_power IS 'Voting power within the federation';
COMMENT ON COLUMN profiles.guardian_approved IS 'Whether user has been approved by a guardian';