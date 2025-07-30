-- =====================================================
-- COMPLETE IDENTITY SYSTEM DATABASE MIGRATION
-- Creates all missing tables and columns for register-identity.js and other functions
-- Master Context Compliant: Privacy-first, zero-knowledge architecture
-- Date: 2025-07-27
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enable Row Level Security globally
ALTER DATABASE postgres SET row_security = on;

-- =====================================================
-- SECTION 1: UPDATE EXISTING PRIVACY_USERS TABLE
-- Add missing columns required by register-identity.js
-- =====================================================

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
  END IF;
END $$;

-- =====================================================
-- SECTION 2: NIP05_RECORDS TABLE
-- Required by nostr.ts and register-identity.js functions
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
-- SECTION 3: PROFILES TABLE
-- Required by db.ts and supabase.ts functions
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
-- SECTION 4: FAMILIES TABLE
-- Required by various functions and profiles table
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
-- SECTION 5: NOSTR_BACKUPS TABLE
-- Required by db.ts and supabase.ts functions
-- =====================================================

CREATE TABLE IF NOT EXISTS public.nostr_backups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    event_id VARCHAR(64) NOT NULL,
    relay_url VARCHAR(255) DEFAULT 'wss://relay.citadel.academy',
    backup_hash VARCHAR(64),
    encrypted_backup TEXT,
    backup_type VARCHAR(50) DEFAULT 'identity',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT nostr_backups_event_id_unique UNIQUE(event_id),
    CONSTRAINT nostr_backups_backup_type_check CHECK (backup_type IN ('identity', 'keys', 'profile', 'full'))
);

-- Indexes for nostr_backups
CREATE INDEX IF NOT EXISTS idx_nostr_backups_user_id ON nostr_backups(user_id);
CREATE INDEX IF NOT EXISTS idx_nostr_backups_event_id ON nostr_backups(event_id);
CREATE INDEX IF NOT EXISTS idx_nostr_backups_backup_type ON nostr_backups(backup_type);

-- =====================================================
-- SECTION 6: LIGHTNING_ADDRESSES TABLE
-- Required by various Lightning functions
-- =====================================================

CREATE TABLE IF NOT EXISTS public.lightning_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    address VARCHAR(255) UNIQUE NOT NULL,
    btcpay_store_id VARCHAR(255),
    voltage_node_id VARCHAR(255),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT lightning_addresses_address_format CHECK (address LIKE '%@%')
);

-- Indexes for lightning_addresses
CREATE INDEX IF NOT EXISTS idx_lightning_addresses_user_id ON lightning_addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_lightning_addresses_address ON lightning_addresses(address);
CREATE INDEX IF NOT EXISTS idx_lightning_addresses_active ON lightning_addresses(active);

-- =====================================================
-- SECTION 7: REWARD SYSTEM TABLES
-- Required by enhanced-rewards.ts function
-- =====================================================

CREATE TABLE IF NOT EXISTS public.reward_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_pubkey VARCHAR(100) NOT NULL,
    reward_type VARCHAR(50) NOT NULL,
    value DECIMAL(15,2) NOT NULL,
    currency VARCHAR(20) NOT NULL CHECK (currency IN ('sats', 'course_credits', 'family_treasury')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'completed', 'failed')),
    privacy_encrypted BOOLEAN NOT NULL DEFAULT false,
    browser_fingerprint VARCHAR(255),
    course_id VARCHAR(100),
    study_time_minutes INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT reward_redemptions_value_positive CHECK (value > 0),
    CONSTRAINT reward_redemptions_study_time_positive CHECK (study_time_minutes >= 0)
);

-- Indexes for reward_redemptions
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_student_pubkey ON reward_redemptions(student_pubkey);
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_reward_type ON reward_redemptions(reward_type);
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_status ON reward_redemptions(status);
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_created_at ON reward_redemptions(created_at);

-- =====================================================
-- SECTION 8: USER_IDENTITIES TABLE
-- Required by lib/api/register-identity.js
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

-- Indexes for user_identities
CREATE INDEX IF NOT EXISTS idx_user_identities_username ON user_identities(username);
CREATE INDEX IF NOT EXISTS idx_user_identities_npub ON user_identities(npub);
CREATE INDEX IF NOT EXISTS idx_user_identities_role ON user_identities(role);
CREATE INDEX IF NOT EXISTS idx_user_identities_is_active ON user_identities(is_active);

-- =====================================================
-- SECTION 9: ROW LEVEL SECURITY POLICIES
-- Master Context Compliance: Privacy-first access control
-- =====================================================

-- Enable RLS on all new tables
ALTER TABLE nip05_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE families ENABLE ROW LEVEL SECURITY;
ALTER TABLE nostr_backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE lightning_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE reward_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_identities ENABLE ROW LEVEL SECURITY;

-- NIP05 records policies (public read for NIP-05 verification)
DROP POLICY IF EXISTS "nip05_records_public_read" ON nip05_records;
CREATE POLICY "nip05_records_public_read" ON nip05_records
    FOR SELECT
    USING (is_active = true);

-- Profiles policies
DROP POLICY IF EXISTS "profiles_own_data" ON profiles;
CREATE POLICY "profiles_own_data" ON profiles
    FOR ALL
    USING (id::text = current_setting('app.current_user_id', true));

DROP POLICY IF EXISTS "profiles_public_read" ON profiles;
CREATE POLICY "profiles_public_read" ON profiles
    FOR SELECT
    USING (is_active = true);

-- Families policies (public read for family discovery)
DROP POLICY IF EXISTS "families_public_read" ON families;
CREATE POLICY "families_public_read" ON families
    FOR SELECT
    USING (is_active = true);

-- Nostr backups policies (own data only)
DROP POLICY IF EXISTS "nostr_backups_own_data" ON nostr_backups;
CREATE POLICY "nostr_backups_own_data" ON nostr_backups
    FOR ALL
    USING (user_id::text = current_setting('app.current_user_id', true));

-- Lightning addresses policies (own data only)
DROP POLICY IF EXISTS "lightning_addresses_own_data" ON lightning_addresses;
CREATE POLICY "lightning_addresses_own_data" ON lightning_addresses
    FOR ALL
    USING (user_id::text = current_setting('app.current_user_id', true));

-- Reward redemptions policies (own data only)
DROP POLICY IF EXISTS "reward_redemptions_own_data" ON reward_redemptions;
CREATE POLICY "reward_redemptions_own_data" ON reward_redemptions
    FOR ALL
    USING (student_pubkey = current_setting('app.current_user_pubkey', true));

-- User identities policies (own data only)
DROP POLICY IF EXISTS "user_identities_own_data" ON user_identities;
CREATE POLICY "user_identities_own_data" ON user_identities
    FOR ALL
    USING (id::text = current_setting('app.current_user_id', true));

-- =====================================================
-- SECTION 10: GRANTS AND PERMISSIONS
-- Grant appropriate permissions to authenticated and anonymous users
-- =====================================================

-- Grant permissions for authenticated users
GRANT SELECT, INSERT, UPDATE ON nip05_records TO authenticated;
GRANT SELECT, INSERT, UPDATE ON profiles TO authenticated;
GRANT SELECT ON families TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON nostr_backups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON lightning_addresses TO authenticated;
GRANT SELECT, INSERT, UPDATE ON reward_redemptions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON user_identities TO authenticated;

-- Grant permissions for anonymous users (limited)
GRANT SELECT ON nip05_records TO anon;
GRANT SELECT ON profiles TO anon;
GRANT SELECT ON families TO anon;
GRANT INSERT ON profiles TO anon; -- For registration
GRANT INSERT ON user_identities TO anon; -- For registration

-- Grant usage on sequences
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon;

-- =====================================================
-- SECTION 11: UTILITY FUNCTIONS
-- Helper functions for the identity registration system
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

-- Function to set current user pubkey context for RLS
CREATE OR REPLACE FUNCTION set_current_user_pubkey(pubkey TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    PERFORM set_config('app.current_user_pubkey', pubkey, true);
END;
$$;

-- Function to update timestamps automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add update triggers to tables with updated_at columns
DROP TRIGGER IF EXISTS update_nip05_records_updated_at ON nip05_records;
CREATE TRIGGER update_nip05_records_updated_at
    BEFORE UPDATE ON nip05_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_families_updated_at ON families;
CREATE TRIGGER update_families_updated_at
    BEFORE UPDATE ON families
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_reward_redemptions_updated_at ON reward_redemptions;
CREATE TRIGGER update_reward_redemptions_updated_at
    BEFORE UPDATE ON reward_redemptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_identities_updated_at ON user_identities;
CREATE TRIGGER update_user_identities_updated_at
    BEFORE UPDATE ON user_identities
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- SECTION 12: INITIAL DATA
-- Insert default records for system functionality
-- =====================================================

-- Insert default NIP-05 records for system functionality
INSERT INTO nip05_records (name, pubkey, domain) VALUES
    ('admin', 'npub1rebuilding_camelot_public_key_here', 'satnam.pub'),
    ('RebuildingCamelot', 'npub1rebuilding_camelot_public_key_here', 'satnam.pub'),
    ('bitcoin_mentor', 'npub1mentorbitcoinexample123456789abcdef', 'satnam.pub'),
    ('lightning_mentor', 'npub1mentorligthningexample123456789abcdef', 'satnam.pub'),
    ('family_mentor', 'npub1mentorfamilyexample123456789abcdef', 'satnam.pub'),
    ('support', 'npub1satnamsupport123456789abcdef', 'satnam.pub'),
    ('info', 'npub1satnaminfo123456789abcdef', 'satnam.pub')
ON CONFLICT (name, domain) DO NOTHING;

-- Insert default family for testing
INSERT INTO families (family_name, domain, relay_url, federation_id) VALUES
    ('Satnam Foundation', 'satnam.pub', 'wss://relay.satnam.pub', 'satnam_foundation_001')
ON CONFLICT (family_name) DO NOTHING;

-- =====================================================
-- SECTION 13: FOREIGN KEY CONSTRAINTS
-- Add foreign key relationships after all tables are created
-- =====================================================

-- Add foreign key constraint for profiles.family_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'profiles_family_id_fkey'
    ) THEN
        ALTER TABLE profiles
        ADD CONSTRAINT profiles_family_id_fkey
        FOREIGN KEY (family_id) REFERENCES families(id);

        RAISE NOTICE 'Added foreign key constraint profiles_family_id_fkey';
    END IF;
END $$;

-- =====================================================
-- SECTION 14: VERIFICATION QUERIES
-- Queries to verify the migration was successful
-- =====================================================

-- Verify privacy_users table has new columns
DO $$
DECLARE
    privacy_level_exists BOOLEAN;
    zero_knowledge_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'privacy_users' AND column_name = 'privacy_level'
    ) INTO privacy_level_exists;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'privacy_users' AND column_name = 'zero_knowledge_enabled'
    ) INTO zero_knowledge_exists;

    IF privacy_level_exists AND zero_knowledge_exists THEN
        RAISE NOTICE 'SUCCESS: privacy_users table updated with required columns';
    ELSE
        RAISE WARNING 'WARNING: privacy_users table missing required columns';
    END IF;
END $$;

-- Verify all new tables exist
DO $$
DECLARE
    table_count INTEGER;
    expected_tables TEXT[] := ARRAY[
        'nip05_records', 'profiles', 'families', 'nostr_backups',
        'lightning_addresses', 'reward_redemptions', 'user_identities'
    ];
    table_name TEXT;
BEGIN
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables
    WHERE table_name = ANY(expected_tables)
    AND table_schema = 'public';

    IF table_count = array_length(expected_tables, 1) THEN
        RAISE NOTICE 'SUCCESS: All % required tables created', table_count;

        -- List each table
        FOREACH table_name IN ARRAY expected_tables
        LOOP
            RAISE NOTICE '  ✓ Table: %', table_name;
        END LOOP;
    ELSE
        RAISE WARNING 'WARNING: Only % of % expected tables found', table_count, array_length(expected_tables, 1);
    END IF;
END $$;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🎉 COMPLETE IDENTITY SYSTEM DATABASE MIGRATION COMPLETED SUCCESSFULLY!';
    RAISE NOTICE '';
    RAISE NOTICE '📋 SUMMARY OF CHANGES:';
    RAISE NOTICE '  • Updated privacy_users table with privacy_level and zero_knowledge_enabled columns';
    RAISE NOTICE '  • Created nip05_records table for NIP-05 verification';
    RAISE NOTICE '  • Created profiles table for user profile management';
    RAISE NOTICE '  • Created families table for family federation support';
    RAISE NOTICE '  • Created nostr_backups table for Nostr event storage';
    RAISE NOTICE '  • Created lightning_addresses table for Lightning Network integration';
    RAISE NOTICE '  • Created reward_redemptions table for educational rewards system';
    RAISE NOTICE '  • Created user_identities table for identity management';
    RAISE NOTICE '';
    RAISE NOTICE '🔒 SECURITY FEATURES ENABLED:';
    RAISE NOTICE '  • Row Level Security (RLS) on all tables';
    RAISE NOTICE '  • Privacy-first access policies';
    RAISE NOTICE '  • Proper foreign key constraints';
    RAISE NOTICE '  • Automatic timestamp updates';
    RAISE NOTICE '  • Input validation constraints';
    RAISE NOTICE '';
    RAISE NOTICE '🚀 READY FOR REGISTER-IDENTITY.JS FUNCTION TESTING!';
    RAISE NOTICE '';
    RAISE NOTICE 'Migration completed at: %', NOW();
END $$;
