-- Migration: 004_privacy_first_schema.sql
-- Privacy-first schema: No pubkey honeypot, encrypted user data

-- Remove honeypot indexes first (before dropping columns they reference)
DROP INDEX IF EXISTS idx_profiles_pubkey;

-- Drop the pubkey column that creates a honeypot
ALTER TABLE profiles DROP COLUMN IF EXISTS pubkey;
ALTER TABLE profiles DROP COLUMN IF EXISTS npub;
ALTER TABLE profiles DROP COLUMN IF EXISTS nip05;

-- Add privacy-focused columns (staged approach for auth_hash)
-- Step 1: Add auth_hash as nullable
ALTER TABLE profiles ADD COLUMN auth_hash VARCHAR(64); -- Hash for auth verification (not reversible)

-- Step 2: Backfill existing rows with generated hashes
UPDATE profiles SET auth_hash = encode(gen_random_bytes(32), 'hex') 
WHERE auth_hash IS NULL;

-- Step 3: Add NOT NULL constraint and UNIQUE constraint
ALTER TABLE profiles ALTER COLUMN auth_hash SET NOT NULL;
ALTER TABLE profiles ADD CONSTRAINT profiles_auth_hash_unique UNIQUE (auth_hash);

-- Add other columns
ALTER TABLE profiles ADD COLUMN encrypted_profile TEXT; -- User-encrypted optional data
ALTER TABLE profiles ADD COLUMN is_discoverable BOOLEAN DEFAULT FALSE; -- Opt-in discoverability
ALTER TABLE profiles ADD COLUMN encryption_hint VARCHAR(255); -- Hint for user's encryption method (not the key)
ALTER TABLE profiles ADD COLUMN last_login TIMESTAMP; -- Track last login time
ALTER TABLE profiles ADD COLUMN user_status VARCHAR(20) DEFAULT 'active' CHECK (user_status IN ('active', 'inactive', 'suspended')); -- User account status

-- Create separate opt-in discoverability table
CREATE TABLE IF NOT EXISTS discoverable_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    encrypted_display_data TEXT, -- User-encrypted discoverable info
    visibility_level VARCHAR(20) DEFAULT 'users_only', -- 'users_only', 'public'
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Add constraint to enforce allowed visibility levels
ALTER TABLE discoverable_profiles ADD CONSTRAINT chk_visibility_level CHECK (visibility_level IN ('users_only', 'public'));

-- Create indexes for performance
CREATE INDEX idx_profiles_auth_hash ON profiles(auth_hash);
CREATE INDEX idx_discoverable_profiles_user_id ON discoverable_profiles(user_id);
CREATE INDEX idx_discoverable_profiles_visibility ON discoverable_profiles(visibility_level);

-- Ensure updated_at column exists and has proper trigger
-- (This should already exist from 001_identity_forge_schema.sql, but adding as safeguard)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'profiles' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE profiles ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
    END IF;
    
    -- Ensure last_login column exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'profiles' AND column_name = 'last_login'
    ) THEN
        ALTER TABLE profiles ADD COLUMN last_login TIMESTAMP;
    END IF;
    
    -- Ensure user_status column exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'profiles' AND column_name = 'user_status'
    ) THEN
        ALTER TABLE profiles ADD COLUMN user_status VARCHAR(20) DEFAULT 'active' CHECK (user_status IN ('active', 'inactive', 'suspended'));
    END IF;
END $$;

-- Ensure updated_at trigger exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Recreate trigger for profiles updated_at (safe with IF EXISTS)
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add security comments
COMMENT ON COLUMN profiles.auth_hash IS 'Non-reversible hash for authentication - no identity exposure';
COMMENT ON COLUMN profiles.encrypted_profile IS 'User-encrypted data - platform cannot decrypt';
COMMENT ON COLUMN profiles.is_discoverable IS 'User opt-in flag for discoverability';
COMMENT ON TABLE discoverable_profiles IS 'Opt-in table for users who choose to be discoverable';

