-- Register Identity Tables Migration
-- Creates missing tables required for the register-identity.js function
-- Master Context Compliant: Privacy-first, zero-knowledge architecture
-- Date: 2025-07-27

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable Row Level Security
ALTER DATABASE postgres SET row_security = on;

-- =====================================================
-- SECURE_VAULT TABLE
-- Stores encrypted nsec data with zero-knowledge compliance
-- =====================================================
CREATE TABLE IF NOT EXISTS public.secure_vault (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    encrypted_nsec TEXT NOT NULL,
    encryption_method VARCHAR(50) NOT NULL DEFAULT 'AES-256-GCM',
    salt VARCHAR(64),
    iv VARCHAR(32),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Privacy and security constraints
    CONSTRAINT secure_vault_user_id_unique UNIQUE(user_id),
    CONSTRAINT secure_vault_encrypted_nsec_not_empty CHECK (length(encrypted_nsec) > 0)
);

-- Indexes for secure_vault
CREATE INDEX IF NOT EXISTS idx_secure_vault_user_id ON secure_vault(user_id);
CREATE INDEX IF NOT EXISTS idx_secure_vault_created_at ON secure_vault(created_at);

-- =====================================================
-- USERS TABLE
-- Stores user profile data (non-sensitive information only)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) NOT NULL,
    npub VARCHAR(100) NOT NULL,
    nip05 VARCHAR(255),
    lightning_address VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Privacy and uniqueness constraints
    CONSTRAINT users_username_unique UNIQUE(username),
    CONSTRAINT users_npub_unique UNIQUE(npub),
    CONSTRAINT users_nip05_unique UNIQUE(nip05),
    CONSTRAINT users_lightning_address_unique UNIQUE(lightning_address),
    CONSTRAINT users_username_length CHECK (length(username) >= 3 AND length(username) <= 50),
    CONSTRAINT users_npub_format CHECK (npub LIKE 'npub1%')
);

-- Indexes for users
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_npub ON users(npub);
CREATE INDEX IF NOT EXISTS idx_users_nip05 ON users(nip05);
CREATE INDEX IF NOT EXISTS idx_users_lightning_address ON users(lightning_address);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

-- =====================================================
-- NIP05_RECORDS TABLE (if not exists)
-- Required by nostr.ts function
-- =====================================================
CREATE TABLE IF NOT EXISTS public.nip05_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL,
    pubkey VARCHAR(100) NOT NULL,
    domain VARCHAR(255) NOT NULL DEFAULT 'satnam.pub',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT nip05_records_name_domain_unique UNIQUE(name, domain),
    CONSTRAINT nip05_records_pubkey_format CHECK (pubkey LIKE 'npub1%')
);

-- Indexes for nip05_records
CREATE INDEX IF NOT EXISTS idx_nip05_records_name ON nip05_records(name);
CREATE INDEX IF NOT EXISTS idx_nip05_records_pubkey ON nip05_records(pubkey);
CREATE INDEX IF NOT EXISTS idx_nip05_records_domain ON nip05_records(domain);
CREATE INDEX IF NOT EXISTS idx_nip05_records_is_active ON nip05_records(is_active);

-- =====================================================
-- PROFILES TABLE (if not exists)
-- Required by db.ts function
-- =====================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) NOT NULL,
    npub VARCHAR(100) NOT NULL,
    nip05 VARCHAR(255),
    lightning_address VARCHAR(255),
    family_id UUID,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT profiles_username_unique UNIQUE(username),
    CONSTRAINT profiles_npub_unique UNIQUE(npub),
    CONSTRAINT profiles_username_length CHECK (length(username) >= 3 AND length(username) <= 50),
    CONSTRAINT profiles_npub_format CHECK (npub LIKE 'npub1%')
);

-- Indexes for profiles
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_npub ON profiles(npub);
CREATE INDEX IF NOT EXISTS idx_profiles_family_id ON profiles(family_id);
CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON profiles(is_active);

-- =====================================================
-- FAMILIES TABLE (if not exists)
-- Required by various functions
-- =====================================================
CREATE TABLE IF NOT EXISTS public.families (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_name VARCHAR(100) NOT NULL,
    domain VARCHAR(255),
    relay_url VARCHAR(255),
    federation_id VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT families_family_name_unique UNIQUE(family_name)
);

-- Indexes for families
CREATE INDEX IF NOT EXISTS idx_families_family_name ON families(family_name);
CREATE INDEX IF NOT EXISTS idx_families_domain ON families(domain);
CREATE INDEX IF NOT EXISTS idx_families_is_active ON families(is_active);

-- =====================================================
-- ROW LEVEL SECURITY POLICIES
-- Master Context Compliance: Privacy-first access control
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE secure_vault ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE nip05_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE families ENABLE ROW LEVEL SECURITY;

-- Secure vault policies (most restrictive)
CREATE POLICY secure_vault_own_data ON secure_vault
    FOR ALL
    USING (user_id::text = current_setting('app.current_user_id', true));

-- Users table policies
CREATE POLICY users_own_data ON users
    FOR ALL
    USING (id::text = current_setting('app.current_user_id', true));

CREATE POLICY users_public_read ON users
    FOR SELECT
    USING (is_active = true);

-- NIP05 records policies (public read for NIP-05 verification)
CREATE POLICY nip05_records_public_read ON nip05_records
    FOR SELECT
    USING (is_active = true);

-- Profiles policies
CREATE POLICY profiles_own_data ON profiles
    FOR ALL
    USING (id::text = current_setting('app.current_user_id', true));

CREATE POLICY profiles_public_read ON profiles
    FOR SELECT
    USING (is_active = true);

-- Families policies
CREATE POLICY families_public_read ON families
    FOR SELECT
    USING (is_active = true);

-- =====================================================
-- GRANTS
-- Grant appropriate permissions to authenticated users
-- =====================================================

GRANT SELECT, INSERT, UPDATE ON secure_vault TO authenticated;
GRANT SELECT, INSERT, UPDATE ON users TO authenticated;
GRANT SELECT ON nip05_records TO authenticated;
GRANT SELECT, INSERT, UPDATE ON profiles TO authenticated;
GRANT SELECT ON families TO authenticated;

-- Grant usage on sequences
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- =====================================================
-- FUNCTIONS
-- Utility functions for the register-identity system
-- =====================================================

-- Function to set current user context for RLS
CREATE OR REPLACE FUNCTION set_current_user_id(user_id TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    PERFORM set_config('app.current_user_id', user_id, true);
END;
$$;

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add update triggers
CREATE TRIGGER update_secure_vault_updated_at BEFORE UPDATE ON secure_vault
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_nip05_records_updated_at BEFORE UPDATE ON nip05_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_families_updated_at BEFORE UPDATE ON families
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- INITIAL DATA
-- Insert default NIP-05 records for system functionality
-- =====================================================

INSERT INTO nip05_records (name, pubkey, domain) VALUES
    ('admin', 'npub1rebuilding_camelot_public_key_here', 'satnam.pub'),
    ('RebuildingCamelot', 'npub1rebuilding_camelot_public_key_here', 'satnam.pub'),
    ('bitcoin_mentor', 'npub1mentorbitcoinexample123456789abcdef', 'satnam.pub'),
    ('lightning_mentor', 'npub1mentorligthningexample123456789abcdef', 'satnam.pub'),
    ('family_mentor', 'npub1mentorfamilyexample123456789abcdef', 'satnam.pub'),
    ('support', 'npub1satnamsupport123456789abcdef', 'satnam.pub'),
    ('info', 'npub1satnaminfo123456789abcdef', 'satnam.pub')
ON CONFLICT (name, domain) DO NOTHING;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Register Identity Tables Migration completed successfully at %', NOW();
END $$;
