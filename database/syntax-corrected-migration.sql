-- =====================================================
-- SYNTAX-CORRECTED TRANSACTION-SAFE MIGRATION
-- Fixes all RAISE NOTICE syntax errors for Supabase PostgreSQL
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- TRANSACTION 1: UPDATE PRIVACY_USERS TABLE
-- =====================================================

BEGIN;

-- Add missing privacy_level column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'privacy_users' 
    AND column_name = 'privacy_level'
  ) THEN
    ALTER TABLE privacy_users 
    ADD COLUMN privacy_level VARCHAR(10) NOT NULL DEFAULT 'enhanced' 
    CHECK (privacy_level IN ('standard', 'enhanced', 'maximum'));
    
    RAISE NOTICE 'Added privacy_level column to privacy_users table';
  ELSE
    RAISE NOTICE 'privacy_level column already exists in privacy_users table';
  END IF;
END $$;

-- Add missing zero_knowledge_enabled column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'privacy_users' 
    AND column_name = 'zero_knowledge_enabled'
  ) THEN
    ALTER TABLE privacy_users 
    ADD COLUMN zero_knowledge_enabled BOOLEAN NOT NULL DEFAULT true;
    
    RAISE NOTICE 'Added zero_knowledge_enabled column to privacy_users table';
  ELSE
    RAISE NOTICE 'zero_knowledge_enabled column already exists in privacy_users table';
  END IF;
END $$;

COMMIT;

-- =====================================================
-- TRANSACTION 2: CREATE NIP05_RECORDS TABLE
-- =====================================================

BEGIN;

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

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_nip05_records_name ON nip05_records(name);
CREATE INDEX IF NOT EXISTS idx_nip05_records_pubkey ON nip05_records(pubkey);
CREATE INDEX IF NOT EXISTS idx_nip05_records_domain ON nip05_records(domain);
CREATE INDEX IF NOT EXISTS idx_nip05_records_is_active ON nip05_records(is_active);

COMMIT;

-- Success notification for Transaction 2
DO $$
BEGIN
    RAISE NOTICE 'SUCCESS: nip05_records table created with domain column';
END $$;

-- =====================================================
-- TRANSACTION 3: INSERT DATA INTO NIP05_RECORDS
-- Separate transaction ensures table is fully committed before data insertion
-- =====================================================

BEGIN;

-- Insert default NIP-05 records
INSERT INTO nip05_records (name, pubkey, domain) VALUES
    ('admin', 'npub1rebuilding_camelot_public_key_here', 'satnam.pub'),
    ('RebuildingCamelot', 'npub1rebuilding_camelot_public_key_here', 'satnam.pub'),
    ('bitcoin_mentor', 'npub1mentorbitcoinexample123456789abcdef', 'satnam.pub'),
    ('lightning_mentor', 'npub1mentorligthningexample123456789abcdef', 'satnam.pub'),
    ('family_mentor', 'npub1mentorfamilyexample123456789abcdef', 'satnam.pub'),
    ('support', 'npub1satnamsupport123456789abcdef', 'satnam.pub'),
    ('info', 'npub1satnaminfo123456789abcdef', 'satnam.pub')
ON CONFLICT (name, domain) DO NOTHING;

COMMIT;

-- Success notification for Transaction 3
DO $$
BEGIN
    RAISE NOTICE 'SUCCESS: Inserted default NIP-05 records with domain column';
END $$;

-- =====================================================
-- TRANSACTION 4: CREATE OTHER ESSENTIAL TABLES
-- =====================================================

BEGIN;

-- PROFILES TABLE
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

-- USER_IDENTITIES TABLE
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

-- FAMILIES TABLE
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

-- Add indexes for all tables
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_npub ON profiles(npub);
CREATE INDEX IF NOT EXISTS idx_profiles_family_id ON profiles(family_id);
CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON profiles(is_active);

CREATE INDEX IF NOT EXISTS idx_user_identities_username ON user_identities(username);
CREATE INDEX IF NOT EXISTS idx_user_identities_npub ON user_identities(npub);
CREATE INDEX IF NOT EXISTS idx_user_identities_role ON user_identities(role);
CREATE INDEX IF NOT EXISTS idx_user_identities_is_active ON user_identities(is_active);

CREATE INDEX IF NOT EXISTS idx_families_family_name ON families(family_name);
CREATE INDEX IF NOT EXISTS idx_families_domain ON families(domain);
CREATE INDEX IF NOT EXISTS idx_families_is_active ON families(is_active);

COMMIT;

-- Success notification for Transaction 4
DO $$
BEGIN
    RAISE NOTICE 'SUCCESS: Created profiles, user_identities, and families tables';
END $$;

-- =====================================================
-- TRANSACTION 5: SETUP RLS AND PERMISSIONS
-- =====================================================

BEGIN;

-- Enable RLS on all tables
ALTER TABLE nip05_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE families ENABLE ROW LEVEL SECURITY;

-- Create permissive policies for registration
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

DROP POLICY IF EXISTS "allow_registration_families" ON families;
CREATE POLICY "allow_registration_families" ON families
    FOR SELECT
    USING (is_active = true);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON nip05_records TO authenticated;
GRANT SELECT, INSERT, UPDATE ON profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON user_identities TO authenticated;
GRANT SELECT ON families TO authenticated;

GRANT INSERT ON nip05_records TO anon;
GRANT INSERT ON profiles TO anon;
GRANT INSERT ON user_identities TO anon;
GRANT SELECT ON nip05_records TO anon;
GRANT SELECT ON families TO anon;

GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon;

COMMIT;

-- Success notification for Transaction 5
DO $$
BEGIN
    RAISE NOTICE 'SUCCESS: RLS policies and permissions configured';
END $$;

-- =====================================================
-- FINAL VERIFICATION
-- =====================================================

DO $$
DECLARE
    table_count INTEGER;
    nip05_records_count INTEGER;
    privacy_level_exists BOOLEAN;
    zero_knowledge_exists BOOLEAN;
    domain_column_exists BOOLEAN;
BEGIN
    -- Check if essential tables exist
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables
    WHERE table_name IN ('privacy_users', 'nip05_records', 'profiles', 'user_identities', 'families')
    AND table_schema = 'public';

    -- Check if data was inserted
    SELECT COUNT(*) INTO nip05_records_count FROM nip05_records;

    -- Check if privacy_users columns exist
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'privacy_users' AND column_name = 'privacy_level'
    ) INTO privacy_level_exists;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'privacy_users' AND column_name = 'zero_knowledge_enabled'
    ) INTO zero_knowledge_exists;

    -- Check if nip05_records has domain column
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'nip05_records' AND column_name = 'domain'
    ) INTO domain_column_exists;

    RAISE NOTICE '';
    RAISE NOTICE '🎉 SYNTAX-CORRECTED MIGRATION COMPLETED!';
    RAISE NOTICE '';
    RAISE NOTICE '📋 VERIFICATION RESULTS:';
    RAISE NOTICE '  • Essential tables created: % of 5', table_count;
    RAISE NOTICE '  • NIP-05 records inserted: %', nip05_records_count;
    RAISE NOTICE '  • privacy_level column: %', CASE WHEN privacy_level_exists THEN 'EXISTS ✓' ELSE 'MISSING ✗' END;
    RAISE NOTICE '  • zero_knowledge_enabled column: %', CASE WHEN zero_knowledge_exists THEN 'EXISTS ✓' ELSE 'MISSING ✗' END;
    RAISE NOTICE '  • nip05_records domain column: %', CASE WHEN domain_column_exists THEN 'EXISTS ✓' ELSE 'MISSING ✗' END;
    RAISE NOTICE '';

    IF table_count = 5 AND nip05_records_count >= 5 AND privacy_level_exists AND zero_knowledge_exists AND domain_column_exists THEN
        RAISE NOTICE '🚀 COMPLETE SUCCESS!';
        RAISE NOTICE '  ✅ The "domain column does not exist" error has been RESOLVED!';
        RAISE NOTICE '  ✅ The "RAISE NOTICE syntax error" has been FIXED!';
        RAISE NOTICE '  ✅ All required tables and columns are now available';
        RAISE NOTICE '  ✅ Ready for register-identity.js function testing!';
        RAISE NOTICE '';
        RAISE NOTICE '🔧 NEXT STEPS:';
        RAISE NOTICE '  1. Test the register-identity endpoint';
        RAISE NOTICE '  2. Verify user registration works end-to-end';
        RAISE NOTICE '  3. Check that all database operations succeed';
    ELSE
        RAISE NOTICE '⚠️  PARTIAL SUCCESS: Some components missing - check results above';
        RAISE NOTICE '  • If tables are missing, check for transaction rollbacks';
        RAISE NOTICE '  • If data is missing, check for RLS policy conflicts';
        RAISE NOTICE '  • If columns are missing, check for ALTER TABLE failures';
    END IF;

    RAISE NOTICE '';
    RAISE NOTICE 'Migration completed at: %', NOW();
    RAISE NOTICE '=====================================================';
END $$;
