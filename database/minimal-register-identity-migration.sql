-- =====================================================
-- MINIMAL REGISTER-IDENTITY MIGRATION
-- Creates only the essential tables needed for register-identity.js
-- Conservative approach - execute each section separately if needed
-- =====================================================

-- Enable required extensions (safe to run multiple times)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- SECTION 1: CREATE PRIVACY_USERS TABLE (if it doesn't exist)
-- This is likely the missing table causing the ALTER TABLE failures
-- =====================================================

CREATE TABLE IF NOT EXISTS public.privacy_users (
    hashed_uuid VARCHAR(50) PRIMARY KEY,
    user_salt VARCHAR(32) NOT NULL,
    federation_role VARCHAR(20) NOT NULL DEFAULT 'private' CHECK (federation_role IN ('private', 'offspring', 'adult', 'steward', 'guardian')),
    is_whitelisted BOOLEAN NOT NULL DEFAULT false,
    voting_power INTEGER NOT NULL DEFAULT 1,
    guardian_approved BOOLEAN NOT NULL DEFAULT false,
    auth_method VARCHAR(20) NOT NULL DEFAULT 'nip07' CHECK (auth_method IN ('nip07', 'nsec', 'otp')),
    privacy_level VARCHAR(10) NOT NULL DEFAULT 'enhanced' CHECK (privacy_level IN ('standard', 'enhanced', 'maximum')),
    zero_knowledge_enabled BOOLEAN NOT NULL DEFAULT true,
    last_auth_at BIGINT NOT NULL DEFAULT extract(epoch from now()),
    auth_failure_count INTEGER NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL DEFAULT extract(epoch from now()),
    updated_at BIGINT NOT NULL DEFAULT extract(epoch from now()),
    data_retention_days INTEGER NOT NULL DEFAULT 2555
);

-- Add indexes for privacy_users
CREATE INDEX IF NOT EXISTS idx_privacy_users_federation_role ON privacy_users(federation_role);
CREATE INDEX IF NOT EXISTS idx_privacy_users_auth_method ON privacy_users(auth_method);
CREATE INDEX IF NOT EXISTS idx_privacy_users_last_auth ON privacy_users(last_auth_at);

-- =====================================================
-- SECTION 2: CREATE NIP05_RECORDS TABLE
-- Essential for NIP-05 verification
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

-- Add indexes for nip05_records
CREATE INDEX IF NOT EXISTS idx_nip05_records_name ON nip05_records(name);
CREATE INDEX IF NOT EXISTS idx_nip05_records_pubkey ON nip05_records(pubkey);
CREATE INDEX IF NOT EXISTS idx_nip05_records_domain ON nip05_records(domain);
CREATE INDEX IF NOT EXISTS idx_nip05_records_is_active ON nip05_records(is_active);

-- =====================================================
-- SECTION 3: CREATE PROFILES TABLE
-- For user profile management
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

-- Add indexes for profiles
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_npub ON profiles(npub);
CREATE INDEX IF NOT EXISTS idx_profiles_family_id ON profiles(family_id);
CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON profiles(is_active);

-- =====================================================
-- SECTION 4: CREATE USER_IDENTITIES TABLE
-- For comprehensive identity management
-- =====================================================

CREATE TABLE IF NOT EXISTS public.user_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) NOT NULL,
    npub VARCHAR(100) NOT NULL,
    encrypted_nsec TEXT,
    nip05 VARCHAR(255),
    lightning_address VARCHAR(255),
    role VARCHAR(20) NOT NULL DEFAULT 'private' CHECK (role IN ('private', 'offspring', 'adult', 'steward', 'guardian')),
    spending_limits JSONB DEFAULT '{}',
    privacy_settings JSONB DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT user_identities_username_unique UNIQUE(username),
    CONSTRAINT user_identities_npub_unique UNIQUE(npub),
    CONSTRAINT user_identities_username_length CHECK (length(username) >= 3 AND length(username) <= 50),
    CONSTRAINT user_identities_npub_format CHECK (npub LIKE 'npub1%')
);

-- Add indexes for user_identities
CREATE INDEX IF NOT EXISTS idx_user_identities_username ON user_identities(username);
CREATE INDEX IF NOT EXISTS idx_user_identities_npub ON user_identities(npub);
CREATE INDEX IF NOT EXISTS idx_user_identities_role ON user_identities(role);
CREATE INDEX IF NOT EXISTS idx_user_identities_is_active ON user_identities(is_active);

-- =====================================================
-- SECTION 5: INSERT MINIMAL INITIAL DATA
-- Add essential NIP-05 records
-- =====================================================

-- Insert default NIP-05 records (with existence check)
DO $$
BEGIN
    -- Only insert if the table exists and has the domain column
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'nip05_records' 
        AND column_name = 'domain'
        AND table_schema = 'public'
    ) THEN
        INSERT INTO nip05_records (name, pubkey, domain) VALUES
            ('admin', 'npub1rebuilding_camelot_public_key_here', 'satnam.pub'),
            ('support', 'npub1satnamsupport123456789abcdef', 'satnam.pub'),
            ('info', 'npub1satnaminfo123456789abcdef', 'satnam.pub')
        ON CONFLICT (name, domain) DO NOTHING;
        
        RAISE NOTICE 'SUCCESS: Inserted default NIP-05 records';
    ELSE
        RAISE WARNING 'WARNING: nip05_records table or domain column not found';
    END IF;
END $$;

-- =====================================================
-- SECTION 6: BASIC RLS SETUP
-- Enable RLS with permissive policies for registration
-- =====================================================

-- Enable RLS on essential tables
ALTER TABLE privacy_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE nip05_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_identities ENABLE ROW LEVEL SECURITY;

-- Create permissive policies for registration (can be tightened later)
DROP POLICY IF EXISTS "allow_registration_privacy_users" ON privacy_users;
CREATE POLICY "allow_registration_privacy_users" ON privacy_users
    FOR ALL
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "allow_registration_nip05_records" ON nip05_records;
CREATE POLICY "allow_registration_nip05_records" ON nip05_records
    FOR ALL
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "allow_registration_profiles" ON profiles;
CREATE POLICY "allow_registration_profiles" ON profiles
    FOR ALL
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "allow_registration_user_identities" ON user_identities;
CREATE POLICY "allow_registration_user_identities" ON user_identities
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- =====================================================
-- SECTION 7: GRANT PERMISSIONS
-- Grant necessary permissions for registration
-- =====================================================

-- Grant permissions for authenticated users
GRANT SELECT, INSERT, UPDATE ON privacy_users TO authenticated;
GRANT SELECT, INSERT, UPDATE ON nip05_records TO authenticated;
GRANT SELECT, INSERT, UPDATE ON profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON user_identities TO authenticated;

-- Grant permissions for anonymous users (for registration)
GRANT INSERT ON privacy_users TO anon;
GRANT INSERT ON nip05_records TO anon;
GRANT INSERT ON profiles TO anon;
GRANT INSERT ON user_identities TO anon;
GRANT SELECT ON nip05_records TO anon;

-- Grant usage on sequences
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon;

-- =====================================================
-- SECTION 8: VERIFICATION
-- Verify the minimal migration was successful
-- =====================================================

DO $$
DECLARE
    table_count INTEGER;
    privacy_users_exists BOOLEAN;
    nip05_domain_exists BOOLEAN;
BEGIN
    -- Check if essential tables exist
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables 
    WHERE table_name IN ('privacy_users', 'nip05_records', 'profiles', 'user_identities')
    AND table_schema = 'public';
    
    -- Check if privacy_users exists
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'privacy_users' 
        AND table_schema = 'public'
    ) INTO privacy_users_exists;
    
    -- Check if nip05_records has domain column
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'nip05_records' 
        AND column_name = 'domain'
        AND table_schema = 'public'
    ) INTO nip05_domain_exists;
    
    RAISE NOTICE '';
    RAISE NOTICE '🎉 MINIMAL REGISTER-IDENTITY MIGRATION RESULTS:';
    RAISE NOTICE '  • Essential tables created: % of 4', table_count;
    RAISE NOTICE '  • privacy_users table: %', CASE WHEN privacy_users_exists THEN 'EXISTS ✓' ELSE 'MISSING ✗' END;
    RAISE NOTICE '  • nip05_records domain column: %', CASE WHEN nip05_domain_exists THEN 'EXISTS ✓' ELSE 'MISSING ✗' END;
    RAISE NOTICE '';
    
    IF table_count = 4 AND privacy_users_exists AND nip05_domain_exists THEN
        RAISE NOTICE '🚀 SUCCESS: Ready for register-identity.js testing!';
    ELSE
        RAISE NOTICE '⚠️  WARNING: Some components missing - check results above';
    END IF;
    
    RAISE NOTICE '';
    RAISE NOTICE 'Migration completed at: %', NOW();
END $$;
