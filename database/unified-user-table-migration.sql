-- =====================================================
-- USER_IDENTITIES TABLE ENHANCEMENT MIGRATION
-- Enhances existing user_identities table with missing columns for comprehensive user data
-- =====================================================
--
-- PURPOSE: Enhance existing user_identities table to serve as single comprehensive user table
-- ISSUE: user_identities table may be missing some columns needed for full user sovereignty
-- SOLUTION: Add missing columns to existing user_identities table (password infrastructure, etc.)
--
-- USER_IDENTITIES TABLE ENHANCEMENTS:
-- - password_hash, password_salt - Authentication infrastructure (if missing)
-- - Ensure all sovereignty columns exist (role, spending_limits, privacy_settings)
-- - Verify is_active column exists for access control
-- - All timestamp fields for proper audit trail
--
-- MIGRATION STRATEGY:
-- 1. Check existing user_identities table structure
-- 2. Add missing columns safely (if they don't exist)
-- 3. Migrate any data from profiles/privacy_users tables if they exist
-- 4. Ensure user_identities serves as single source of truth
--
-- =====================================================

-- Start transaction for atomic operation
BEGIN;

-- Function to check if table exists
CREATE OR REPLACE FUNCTION table_exists(tbl_name TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = tbl_name
    );
END;
$$ LANGUAGE plpgsql;

-- Function to check if column exists
CREATE OR REPLACE FUNCTION column_exists(tbl_name TEXT, col_name TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = tbl_name
        AND column_name = col_name
    );
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- SECTION 1: ENHANCE EXISTING USER_IDENTITIES TABLE
-- Add missing columns for comprehensive user data
-- =====================================================

DO $$
BEGIN
    IF table_exists('user_identities') THEN
        RAISE NOTICE '✅ Table user_identities found - enhancing with missing columns...';

        -- Add password infrastructure if missing
        IF NOT column_exists('user_identities', 'password_hash') THEN
            ALTER TABLE user_identities ADD COLUMN password_hash TEXT;
            RAISE NOTICE '  ✅ Added password_hash column to user_identities';
        ELSE
            RAISE NOTICE '  ⏭️ password_hash column already exists in user_identities';
        END IF;

        IF NOT column_exists('user_identities', 'password_salt') THEN
            ALTER TABLE user_identities ADD COLUMN password_salt VARCHAR(32);
            RAISE NOTICE '  ✅ Added password_salt column to user_identities';
        ELSE
            RAISE NOTICE '  ⏭️ password_salt column already exists in user_identities';
        END IF;

        -- Verify core sovereignty columns exist (these should already be there)
        IF column_exists('user_identities', 'role') AND
           column_exists('user_identities', 'spending_limits') AND
           column_exists('user_identities', 'privacy_settings') AND
           column_exists('user_identities', 'is_active') THEN
            RAISE NOTICE '  ✅ Core sovereignty columns verified (role, spending_limits, privacy_settings, is_active)';
        ELSE
            RAISE NOTICE '  ⚠️ Some core sovereignty columns may be missing - check table schema';
        END IF;

        RAISE NOTICE '🎉 user_identities table enhancement completed!';
    ELSE
        RAISE NOTICE '⚠️ Table user_identities not found - creating comprehensive user_identities table...';

        -- Create the user_identities table with all required columns
        CREATE TABLE public.user_identities (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            username VARCHAR(50) NOT NULL,
            npub VARCHAR(100) NOT NULL,
            encrypted_nsec TEXT,
            nip05 VARCHAR(255),
            lightning_address VARCHAR(255),
            role VARCHAR(20) NOT NULL DEFAULT 'private' CHECK (role IN ('private', 'offspring', 'adult', 'steward', 'guardian')),
            spending_limits JSONB DEFAULT '{"daily_limit": -1, "requires_approval": false}',
            privacy_settings JSONB DEFAULT '{"privacy_level": "enhanced", "zero_knowledge_enabled": true}',
            is_active BOOLEAN NOT NULL DEFAULT true,

            -- Password infrastructure
            password_hash TEXT,
            password_salt VARCHAR(32),

            -- Timestamps
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

            -- Constraints
            CONSTRAINT user_identities_username_unique UNIQUE(username),
            CONSTRAINT user_identities_npub_unique UNIQUE(npub),
            CONSTRAINT user_identities_username_length CHECK (length(username) >= 3 AND length(username) <= 50),
            CONSTRAINT user_identities_npub_format CHECK (npub LIKE 'npub1%')
        );

        RAISE NOTICE '✅ Created comprehensive user_identities table with all sovereignty features';
    END IF;
END $$;

-- Create updated_at trigger function (must be outside DO block)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create indexes for performance on user_identities table
DO $$
BEGIN
    IF table_exists('user_identities') THEN
        -- Create indexes if they don't exist
        CREATE INDEX IF NOT EXISTS idx_user_identities_username ON user_identities(username);
        CREATE INDEX IF NOT EXISTS idx_user_identities_npub ON user_identities(npub);
        CREATE INDEX IF NOT EXISTS idx_user_identities_nip05 ON user_identities(nip05);
        CREATE INDEX IF NOT EXISTS idx_user_identities_is_active ON user_identities(is_active);
        CREATE INDEX IF NOT EXISTS idx_user_identities_role ON user_identities(role);

        RAISE NOTICE '✅ Created performance indexes on user_identities table';

        -- Create updated_at trigger
        DROP TRIGGER IF EXISTS update_user_identities_updated_at ON user_identities;
        CREATE TRIGGER update_user_identities_updated_at
            BEFORE UPDATE ON user_identities
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

        RAISE NOTICE '✅ Created updated_at trigger on user_identities table';
    END IF;
END $$;

-- =====================================================
-- SECTION 2: DATA MIGRATION (if other tables exist)
-- Migrate data from profiles table to user_identities if needed
-- =====================================================

DO $$
DECLARE
    migration_count INTEGER := 0;
    profiles_count INTEGER := 0;
    user_identities_count INTEGER := 0;
BEGIN
    -- Check if we need to migrate data from profiles to user_identities
    IF table_exists('profiles') THEN
        SELECT COUNT(*) INTO profiles_count FROM profiles;
        SELECT COUNT(*) INTO user_identities_count FROM user_identities;

        RAISE NOTICE 'Found % records in profiles table', profiles_count;
        RAISE NOTICE 'Found % records in user_identities table', user_identities_count;

        -- Only migrate if user_identities is empty or has fewer records than profiles
        IF profiles_count > 0 AND user_identities_count < profiles_count THEN
            RAISE NOTICE 'Migrating missing data from profiles to user_identities...';

            INSERT INTO user_identities (
                id, username, npub, nip05, lightning_address,
                is_active, created_at, updated_at,
                role, spending_limits, privacy_settings
            )
            SELECT
                p.id,
                p.username,
                p.npub,
                p.nip05,
                p.lightning_address,
                COALESCE(p.is_active, true),
                p.created_at,
                p.updated_at,
                'private', -- Default role
                '{"daily_limit": -1, "requires_approval": false}'::jsonb, -- Default spending limits
                '{"privacy_level": "enhanced", "zero_knowledge_enabled": true}'::jsonb -- Default privacy settings
            FROM profiles p
            WHERE NOT EXISTS (
                SELECT 1 FROM user_identities ui WHERE ui.id = p.id
            );

            GET DIAGNOSTICS migration_count = ROW_COUNT;
            RAISE NOTICE '✅ Migrated % new records from profiles to user_identities', migration_count;
        ELSE
            RAISE NOTICE '⏭️ No migration needed - user_identities table appears complete';
        END IF;
    ELSE
        RAISE NOTICE '⏭️ No profiles table found - no migration needed';
    END IF;

    -- Note: privacy_users table is separate and not migrated to user_identities
    -- as it serves a different privacy-first purpose
    IF table_exists('privacy_users') THEN
        RAISE NOTICE '📋 privacy_users table exists separately (privacy-first architecture maintained)';
    END IF;
END $$;

-- =====================================================
-- SECTION 3: NOTE ABOUT RLS POLICIES
-- RLS policies should be applied using separate script
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '📋 RLS POLICIES NOTE:';
    RAISE NOTICE '   RLS policies for user_identities table should be applied using:';
    RAISE NOTICE '   database/unified-user-rls-policies.sql';
    RAISE NOTICE '';
    RAISE NOTICE '   This separation allows for:';
    RAISE NOTICE '   1. ✅ Table structure changes (this script)';
    RAISE NOTICE '   2. ✅ Security policies (separate RLS script)';
    RAISE NOTICE '   3. ✅ Independent testing and rollback';
    RAISE NOTICE '';
END $$;

-- Commit the transaction
COMMIT;

-- Final success message
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🎉 USER_IDENTITIES TABLE ENHANCEMENT COMPLETED SUCCESSFULLY!';
    RAISE NOTICE '';
    RAISE NOTICE '📝 ARCHITECTURAL IMPROVEMENTS:';
    RAISE NOTICE '   1. ✅ Enhanced user_identities table serves as single comprehensive user table';
    RAISE NOTICE '   2. ✅ Added password infrastructure (password_hash, password_salt) if missing';
    RAISE NOTICE '   3. ✅ Verified core sovereignty columns (role, spending_limits, privacy_settings)';
    RAISE NOTICE '   4. ✅ Migrated data from profiles table if needed';
    RAISE NOTICE '   5. ✅ Maintained existing UUID primary key structure';
    RAISE NOTICE '   6. ✅ Preserved compatibility with existing auth system';
    RAISE NOTICE '';
    RAISE NOTICE '🔄 NEXT STEPS:';
    RAISE NOTICE '   1. ✅ Run database/unified-user-rls-policies.sql for user sovereignty policies';
    RAISE NOTICE '   2. ✅ Test identity registration with enhanced user_identities table';
    RAISE NOTICE '   3. ✅ Verify user sovereignty features (lightning, privacy settings)';
    RAISE NOTICE '   4. ✅ Test password management if implemented';
    RAISE NOTICE '';
END $$;
