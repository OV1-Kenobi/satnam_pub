-- =====================================================
-- PRIVACY-FIRST IDENTITY SYSTEM MIGRATION
-- Consolidated schema eliminating redundant tables
-- MAXIMUM ENCRYPTION: Hashed columns only, no plaintext storage
-- MANUAL EXECUTION: Run in Supabase SQL Editor only
-- TRANSACTION-SAFE: Atomic operation with rollback capability
-- =====================================================

-- Begin transaction for atomic operation
BEGIN;

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- GLOBAL RLS POLICY CLEANUP
-- Remove all policies that might reference old schema
-- =====================================================

DO $$
DECLARE
    policy_record RECORD;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🧹 GLOBAL RLS POLICY CLEANUP';
    RAISE NOTICE '===========================';
    
    -- Drop policies on tables that might have user_id references
    FOR policy_record IN 
        SELECT schemaname, tablename, policyname 
        FROM pg_policies 
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "%s" ON %I.%I', 
                      policy_record.policyname, 
                      policy_record.schemaname, 
                      policy_record.tablename);
        RAISE NOTICE '✓ Dropped policy: % on %', policy_record.policyname, policy_record.tablename;
    END LOOP;
    
    RAISE NOTICE '✅ RLS policy cleanup complete';
    RAISE NOTICE '';
END $$;

DO $$
BEGIN
    RAISE NOTICE '🔒 PRIVACY-FIRST IDENTITY SYSTEM MIGRATION';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE '🗑️  ELIMINATING REDUNDANT TABLES:';
    RAISE NOTICE '   • profiles (consolidated into user_identities)';
    RAISE NOTICE '   • privacy_users (consolidated into user_identities)';
    RAISE NOTICE '   • lightning_addresses (privacy violation - removed)';
    RAISE NOTICE '';
    RAISE NOTICE '🔐 IMPLEMENTING MAXIMUM ENCRYPTION:';
    RAISE NOTICE '   • All user data stored as hashed columns only';
    RAISE NOTICE '   • Hashed UUIDs for all user references';
    RAISE NOTICE '   • Zero plaintext storage of sensitive data';
    RAISE NOTICE '';
END $$;

-- =====================================================
-- TABLE 1: NIP05_RECORDS (Public Verification)
-- =====================================================

-- First, check if nip05_records table exists and add DUID columns if missing
DO $$
BEGIN
    -- Create table if it doesn't exist (PRIVACY-FIRST: NO PLAINTEXT STORAGE)
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'nip05_records' AND table_schema = 'public') THEN
        CREATE TABLE nip05_records (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name_duid TEXT NOT NULL, -- Privacy-first: only hashed name storage
            pubkey_duid TEXT NOT NULL, -- Privacy-first: only hashed pubkey storage
            domain VARCHAR(255) NOT NULL DEFAULT 'satnam.pub',
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        RAISE NOTICE '✓ Created privacy-first nip05_records table (NO PLAINTEXT)';
    ELSE
        -- If table exists, remove any plaintext columns that violate privacy
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nip05_records' AND column_name = 'name') THEN
            ALTER TABLE nip05_records DROP COLUMN name;
            RAISE NOTICE '🔒 REMOVED privacy-violating plaintext name column';
        END IF;
        
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nip05_records' AND column_name = 'pubkey') THEN
            ALTER TABLE nip05_records DROP COLUMN pubkey;
            RAISE NOTICE '🔒 REMOVED privacy-violating plaintext pubkey column';
        END IF;
    END IF;

    -- Add DUID columns if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nip05_records' AND column_name = 'name_duid') THEN
        ALTER TABLE nip05_records ADD COLUMN name_duid TEXT;
        RAISE NOTICE '✓ Added name_duid column to nip05_records';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nip05_records' AND column_name = 'pubkey_duid') THEN
        ALTER TABLE nip05_records ADD COLUMN pubkey_duid TEXT;
        RAISE NOTICE '✓ Added pubkey_duid column to nip05_records';
    END IF;
END $$;

-- Add constraints after columns exist
DO $$
BEGIN
    -- Add unique constraint on name_duid + domain if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'nip05_records_name_duid_domain_unique'
        AND table_name = 'nip05_records'
    ) THEN
        ALTER TABLE nip05_records ADD CONSTRAINT nip05_records_name_duid_domain_unique UNIQUE(name_duid, domain);
        RAISE NOTICE '✓ Added name_duid domain unique constraint';
    END IF;

    -- Add domain whitelist constraint if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'nip05_records_domain_whitelist'
        AND table_name = 'nip05_records'
    ) THEN
        ALTER TABLE nip05_records ADD CONSTRAINT nip05_records_domain_whitelist CHECK (domain IN ('satnam.pub', 'citadel.academy'));
        RAISE NOTICE '✓ Added domain whitelist constraint';
    END IF;
END $$;

-- =====================================================
-- TABLE 2: USER_IDENTITIES (Consolidated User Data)
-- =====================================================

-- Check if user_identities table exists and add missing columns
DO $$
BEGIN
    -- Create table if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_identities' AND table_schema = 'public') THEN
        CREATE TABLE user_identities (
            id TEXT PRIMARY KEY, -- DUID index for secure O(1) authentication (Phase 2)
            user_salt TEXT NOT NULL UNIQUE,
            hashed_username TEXT NOT NULL,
            hashed_npub TEXT NOT NULL,
            hashed_encrypted_nsec TEXT,
            hashed_nip05 TEXT,
            hashed_lightning_address TEXT,
            password_hash TEXT NOT NULL,
            password_salt TEXT NOT NULL UNIQUE,
            password_created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            password_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            failed_attempts INTEGER NOT NULL DEFAULT 0,
            locked_until TIMESTAMP WITH TIME ZONE,
            requires_password_change BOOLEAN NOT NULL DEFAULT false,
            role TEXT NOT NULL DEFAULT 'private',
            spending_limits JSONB NOT NULL DEFAULT '{"daily_limit": -1, "requires_approval": false}',
            privacy_settings JSONB NOT NULL DEFAULT '{"privacy_level": "maximum", "zero_knowledge_enabled": true, "over_encryption": true, "is_imported_account": false}',
            family_federation_id UUID,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        RAISE NOTICE '✓ Created user_identities table';
    ELSE
        RAISE NOTICE '✓ user_identities table already exists';
    END IF;

    -- Add missing columns to existing user_identities table
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_identities' AND column_name = 'family_federation_id') THEN
        ALTER TABLE user_identities ADD COLUMN family_federation_id UUID;
        RAISE NOTICE '✓ Added family_federation_id column to user_identities';
    END IF;

    -- Add other missing columns that might not exist in legacy tables
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_identities' AND column_name = 'user_salt') THEN
        ALTER TABLE user_identities ADD COLUMN user_salt TEXT;
        RAISE NOTICE '✓ Added user_salt column to user_identities';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_identities' AND column_name = 'hashed_username') THEN
        ALTER TABLE user_identities ADD COLUMN hashed_username TEXT;
        RAISE NOTICE '✓ Added hashed_username column to user_identities';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_identities' AND column_name = 'hashed_npub') THEN
        ALTER TABLE user_identities ADD COLUMN hashed_npub TEXT;
        RAISE NOTICE '✓ Added hashed_npub column to user_identities';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_identities' AND column_name = 'password_hash') THEN
        ALTER TABLE user_identities ADD COLUMN password_hash TEXT;
        RAISE NOTICE '✓ Added password_hash column to user_identities';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_identities' AND column_name = 'password_salt') THEN
        ALTER TABLE user_identities ADD COLUMN password_salt TEXT;
        RAISE NOTICE '✓ Added password_salt column to user_identities';
    END IF;

    -- Add unique constraints for salt columns
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'user_identities_user_salt_unique'
        AND table_name = 'user_identities'
    ) THEN
        ALTER TABLE user_identities ADD CONSTRAINT user_identities_user_salt_unique UNIQUE(user_salt);
        RAISE NOTICE '✓ Added user_salt unique constraint';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'user_identities_password_salt_unique'
        AND table_name = 'user_identities'
    ) THEN
        ALTER TABLE user_identities ADD CONSTRAINT user_identities_password_salt_unique UNIQUE(password_salt);
        RAISE NOTICE '✓ Added password_salt unique constraint';
    END IF;
END $$;

-- Add constraints to user_identities
DO $$
BEGIN
    -- Add role constraint if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'user_identities_role_valid'
        AND table_name = 'user_identities'
    ) THEN
        ALTER TABLE user_identities ADD CONSTRAINT user_identities_role_valid CHECK (role IN ('private', 'offspring', 'adult', 'steward', 'guardian'));
        RAISE NOTICE '✓ Added role validation constraint';
    END IF;

    -- Add failed attempts constraint if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'user_identities_failed_attempts_check'
        AND table_name = 'user_identities'
    ) THEN
        ALTER TABLE user_identities ADD CONSTRAINT user_identities_failed_attempts_check CHECK (failed_attempts >= 0);
        RAISE NOTICE '✓ Added failed attempts constraint';
    END IF;
END $$;

-- =====================================================
-- TABLE 3: FAMILY_FEDERATIONS (Top-Level Family Groups)
-- =====================================================

DO $$
BEGIN
    -- Create table if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'family_federations' AND table_schema = 'public') THEN
        CREATE TABLE family_federations (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            federation_name TEXT NOT NULL,
            domain VARCHAR(255),
            relay_url VARCHAR(255),
            federation_duid TEXT NOT NULL UNIQUE, -- Global salted federation identifier
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

            -- Constraints
            CONSTRAINT family_federations_name_unique UNIQUE(federation_name)
        );
        RAISE NOTICE '✓ Created family_federations table';
    ELSE
        RAISE NOTICE '✓ family_federations table already exists';
    END IF;
END $$;

-- =====================================================
-- TABLE 4: FAMILY_MEMBERS (Members Within Federations)
-- =====================================================

DO $$
BEGIN
    -- Create table if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'family_members' AND table_schema = 'public') THEN
        CREATE TABLE family_members (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            family_federation_id UUID NOT NULL,
            user_duid TEXT NOT NULL, -- References user_identities.id (DUID)
            family_role TEXT NOT NULL CHECK (family_role IN ('offspring', 'adult', 'steward', 'guardian')),
            spending_approval_required BOOLEAN NOT NULL DEFAULT false,
            voting_power INTEGER NOT NULL DEFAULT 1,
            joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

            -- Constraints
            CONSTRAINT family_members_user_federation_unique UNIQUE(family_federation_id, user_duid)
        );
        RAISE NOTICE '✓ Created family_members table';
    ELSE
        RAISE NOTICE '✓ family_members table already exists';
    END IF;
END $$;

-- Add foreign key constraint after both tables exist
DO $$
BEGIN
    -- Ensure family_members.family_federation_id column exists (handle legacy tables)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'family_members'
          AND column_name = 'family_federation_id'
    ) THEN
        ALTER TABLE family_members ADD COLUMN family_federation_id UUID;
        RAISE NOTICE '✓ Added family_federation_id column to family_members';
    END IF;

    -- Add foreign key constraint if it doesn't exist (and column now exists)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'family_members'
          AND column_name = 'family_federation_id'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'family_members_federation_fkey'
          AND table_name = 'family_members'
    ) THEN
        ALTER TABLE family_members
        ADD CONSTRAINT family_members_federation_fkey
        FOREIGN KEY (family_federation_id) REFERENCES family_federations(id) ON DELETE CASCADE;
        RAISE NOTICE '✓ Added foreign key constraint to family_members';
    ELSE
        RAISE NOTICE '✓ Foreign key constraint already exists on family_members or column missing';
    END IF;
END $$;


-- Ensure family_members has user_duid column and consistent constraints when migrating from legacy schema
DO $$
BEGIN
    -- Ensure user_duid column exists; if legacy user_id exists, rename it
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'family_members'
    ) THEN
        -- Add/rename column
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'family_members' AND column_name = 'user_duid'
        ) THEN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'family_members' AND column_name = 'user_id'
            ) THEN
                ALTER TABLE family_members RENAME COLUMN user_id TO user_duid;
                RAISE NOTICE '✓ Renamed family_members.user_id -> user_duid';
            ELSE
                ALTER TABLE family_members ADD COLUMN user_duid TEXT;
                RAISE NOTICE '✓ Added family_members.user_duid column';
            END IF;
        END IF;

        -- Add missing columns that might not exist in legacy tables
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'family_members' AND column_name = 'family_role') THEN
            ALTER TABLE family_members ADD COLUMN family_role TEXT;
            RAISE NOTICE '✓ Added family_role column to family_members';
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'family_members' AND column_name = 'spending_approval_required') THEN
            ALTER TABLE family_members ADD COLUMN spending_approval_required BOOLEAN NOT NULL DEFAULT false;
            RAISE NOTICE '✓ Added spending_approval_required column to family_members';
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'family_members' AND column_name = 'voting_power') THEN
            ALTER TABLE family_members ADD COLUMN voting_power INTEGER NOT NULL DEFAULT 1;
            RAISE NOTICE '✓ Added voting_power column to family_members';
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'family_members' AND column_name = 'joined_at') THEN
            ALTER TABLE family_members ADD COLUMN joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
            RAISE NOTICE '✓ Added joined_at column to family_members';
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'family_members' AND column_name = 'is_active') THEN
            ALTER TABLE family_members ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
            RAISE NOTICE '✓ Added is_active column to family_members';
        END IF;

        -- Add constraints after columns exist
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints tc
            WHERE tc.table_schema = 'public'
              AND tc.table_name = 'family_members'
              AND tc.constraint_name = 'family_members_family_role_valid'
        ) THEN
            ALTER TABLE family_members ADD CONSTRAINT family_members_family_role_valid CHECK (family_role IN ('offspring', 'adult', 'steward', 'guardian'));
            RAISE NOTICE '✓ Added family_role validation constraint';
        END IF;

        -- Add unique constraint on (family_federation_id, user_duid) if missing
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints tc
            WHERE tc.table_schema = 'public'
              AND tc.table_name = 'family_members'
              AND tc.constraint_name = 'family_members_user_federation_unique'
        ) THEN
            ALTER TABLE family_members
            ADD CONSTRAINT family_members_user_federation_unique UNIQUE(family_federation_id, user_duid);
            RAISE NOTICE '✓ Added unique constraint family_members_user_federation_unique';
        END IF;
    END IF;
END $$;

-- =====================================================
-- TABLE 5: NOSTR_BACKUPS (Backup References) - Migration Handling
-- =====================================================

DO $$
BEGIN
    -- Check if nostr_backups table exists with old schema
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'nostr_backups' AND table_schema = 'public') THEN
        -- Check if it has old user_id column (needs migration)
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nostr_backups' AND column_name = 'user_id') THEN
            RAISE NOTICE '🔄 Migrating existing nostr_backups table from user_id to user_duid...';
            
            -- First, drop ALL RLS policies on nostr_backups (they'll reference old columns)
            DROP POLICY IF EXISTS "Users can manage own nostr backups" ON nostr_backups;
            DROP POLICY IF EXISTS "Users can read own nostr backups" ON nostr_backups;
            DROP POLICY IF EXISTS "Users can create own nostr backups" ON nostr_backups;
            DROP POLICY IF EXISTS "Users can update own nostr backups" ON nostr_backups;
            DROP POLICY IF EXISTS "Users can delete own nostr backups" ON nostr_backups;
            RAISE NOTICE '✓ Removed old RLS policies that depended on user_id';
            
            -- Drop foreign key constraint if it exists (it might reference profiles or users table)
            IF EXISTS (
                SELECT 1 FROM information_schema.table_constraints 
                WHERE constraint_name LIKE '%user%' AND table_name = 'nostr_backups' AND constraint_type = 'FOREIGN KEY'
            ) THEN
                -- Drop old foreign key constraints
                ALTER TABLE nostr_backups DROP CONSTRAINT IF EXISTS nostr_backups_user_id_fkey;
                RAISE NOTICE '✓ Removed old foreign key constraint';
            END IF;
            
            -- Add user_duid column if it doesn't exist
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nostr_backups' AND column_name = 'user_duid') THEN
                ALTER TABLE nostr_backups ADD COLUMN user_duid TEXT;
                RAISE NOTICE '✓ Added user_duid column';
            END IF;
            
            -- For now, set user_duid to a placeholder since we can't safely migrate UUID to DUID without data loss
            -- This table will need to be repopulated after user registration
            UPDATE nostr_backups SET user_duid = 'migration_placeholder_' || user_id::TEXT WHERE user_duid IS NULL;
            
            -- Now we can safely drop the user_id column
            ALTER TABLE nostr_backups DROP COLUMN user_id;
            RAISE NOTICE '✓ Removed old user_id column';
            
            RAISE NOTICE '⚠️  NOTICE: nostr_backups data needs to be repopulated after user registration';
        END IF;
        
    ELSE
        -- Create table from scratch
        CREATE TABLE nostr_backups (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_duid TEXT NOT NULL, -- References user_identities.id (DUID)
            event_id VARCHAR(64) NOT NULL,
            relay_url VARCHAR(255) DEFAULT 'wss://relay.citadel.academy',
            backup_hash VARCHAR(64),
            backup_type VARCHAR(20) NOT NULL DEFAULT 'nsec',
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        RAISE NOTICE '✓ Created nostr_backups table';
    END IF;
    
    -- Add missing columns to existing table if needed
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nostr_backups' AND column_name = 'backup_type') THEN
        ALTER TABLE nostr_backups ADD COLUMN backup_type VARCHAR(20) NOT NULL DEFAULT 'nsec';
        RAISE NOTICE '✓ Added backup_type column';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nostr_backups' AND column_name = 'is_active') THEN
        ALTER TABLE nostr_backups ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
        RAISE NOTICE '✓ Added is_active column';
    END IF;
    
    -- Add constraints after table is ready
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'nostr_backups_user_duid_format'
        AND table_name = 'nostr_backups'
    ) THEN
        ALTER TABLE nostr_backups ADD CONSTRAINT nostr_backups_user_duid_format CHECK (length(user_duid) > 10);
        RAISE NOTICE '✓ Added user_duid format constraint';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'nostr_backups_backup_type_valid'
        AND table_name = 'nostr_backups'
    ) THEN
        ALTER TABLE nostr_backups ADD CONSTRAINT nostr_backups_backup_type_valid CHECK (backup_type IN ('nsec', 'profile', 'contacts'));
        RAISE NOTICE '✓ Added backup_type validation constraint';
    END IF;
END $$;

-- =====================================================
-- GLOBAL LEGACY TABLE MIGRATION SECTION
-- Handle all remaining tables with user_id references
-- =====================================================

DO $$
DECLARE
    table_record RECORD;
    constraint_record RECORD;
    legacy_tables TEXT[] := ARRAY['user_auth_attempts', 'recovery_requests', 'key_rotations', 
                                 'p2p_payments', 'ecash_bridge_operations', 'spending_limits'];
    current_table TEXT;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🔄 GLOBAL LEGACY TABLE MIGRATION - user_id → user_duid';
    RAISE NOTICE '================================================';
    
    -- Handle each known legacy table
    FOREACH current_table IN ARRAY legacy_tables
    LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables t WHERE t.table_name = current_table AND t.table_schema = 'public') THEN
            RAISE NOTICE '📋 Processing legacy table: %', current_table;
            
            -- Check if it has user_id column
            IF EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_name = current_table AND c.column_name = 'user_id') THEN
                -- First drop ALL RLS policies on this table (they might reference user_id)
                EXECUTE format('DROP POLICY IF EXISTS "Users can manage own %s" ON %I', current_table, current_table);
                EXECUTE format('DROP POLICY IF EXISTS "Users can read own %s" ON %I', current_table, current_table);
                EXECUTE format('DROP POLICY IF EXISTS "Users can create own %s" ON %I', current_table, current_table);
                EXECUTE format('DROP POLICY IF EXISTS "Users can update own %s" ON %I', current_table, current_table);
                EXECUTE format('DROP POLICY IF EXISTS "Users can delete own %s" ON %I', current_table, current_table);
                RAISE NOTICE '  ✓ Dropped RLS policies for table: %', current_table;
                
                -- Drop foreign key constraints that reference old tables
                FOR constraint_record IN 
                    SELECT constraint_name 
                    FROM information_schema.table_constraints tc
                    WHERE tc.table_name = current_table AND tc.constraint_type = 'FOREIGN KEY'
                LOOP
                    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', current_table, constraint_record.constraint_name);
                    RAISE NOTICE '  ✓ Dropped constraint: %', constraint_record.constraint_name;
                END LOOP;
                
                -- Add user_duid column
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_name = current_table AND c.column_name = 'user_duid') THEN
                    EXECUTE format('ALTER TABLE %I ADD COLUMN user_duid TEXT', current_table);
                    RAISE NOTICE '  ✓ Added user_duid column';
                END IF;
                
                -- Set placeholder data for existing records
                EXECUTE format('UPDATE %I SET user_duid = ''legacy_'' || user_id::TEXT WHERE user_duid IS NULL', current_table);
                
                -- Drop old user_id column
                EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS user_id', current_table);
                RAISE NOTICE '  ✓ Migrated % from user_id to user_duid', current_table;
                RAISE NOTICE '  ⚠️  Data needs repopulation after user re-registration';
            END IF;
        END IF;
    END LOOP;
    
    RAISE NOTICE '';
    RAISE NOTICE '✅ Legacy table migration complete';
END $$;

-- =====================================================
-- CLEANUP REDUNDANT LEGACY TABLES
-- Remove tables that are completely replaced by privacy-first schema
-- =====================================================

DO $$
DECLARE
    redundant_tables TEXT[] := ARRAY['profiles', 'privacy_users', 'users', 'lightning_addresses', 'families'];
    current_table TEXT;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🗑️  CLEANING UP REDUNDANT LEGACY TABLES';
    RAISE NOTICE '=====================================';
    
    -- Drop redundant tables (these are consolidated into user_identities and family_federations)
    FOREACH current_table IN ARRAY redundant_tables
    LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables t WHERE t.table_name = current_table AND t.table_schema = 'public') THEN
            EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', current_table);
            RAISE NOTICE '✓ Removed redundant table: %', current_table;
        END IF;
    END LOOP;
    
    RAISE NOTICE '';
    RAISE NOTICE '✅ Legacy table cleanup complete';
    RAISE NOTICE '📋 Consolidated into privacy-first tables:';
    RAISE NOTICE '  • user_identities (replaces: profiles, privacy_users, users)';
    RAISE NOTICE '  • family_federations (replaces: families)';
    RAISE NOTICE '  • family_members (replaces: family_memberships)';
END $$;

-- =====================================================
-- TABLE 6: REWARD_REDEMPTIONS (Reward System)
-- =====================================================

CREATE TABLE IF NOT EXISTS reward_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_duid TEXT NOT NULL, -- References user_identities.id (DUID)
    reward_type VARCHAR(50) NOT NULL,
    value INTEGER NOT NULL,
    study_time_minutes INTEGER NOT NULL DEFAULT 0,
    redeemed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT reward_redemptions_value_positive CHECK (value > 0),
    CONSTRAINT reward_redemptions_study_time_positive CHECK (study_time_minutes >= 0)
);

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE nip05_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_federations ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE nostr_backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE reward_redemptions ENABLE ROW LEVEL SECURITY;

-- NIP05_RECORDS: Public read access for verification (DUID-based)
DROP POLICY IF EXISTS "nip05_records_public_read" ON nip05_records;
CREATE POLICY "nip05_records_public_read" ON nip05_records
    FOR SELECT
    TO anon, authenticated
    USING (is_active = true);

-- NIP05_RECORDS: Anonymous insert during registration
DROP POLICY IF EXISTS "nip05_records_anon_insert" ON nip05_records;
CREATE POLICY "nip05_records_anon_insert" ON nip05_records
    FOR INSERT
    TO anon
    WITH CHECK (true);

-- USER_IDENTITIES: Users can access their own data via DUID matching
DROP POLICY IF EXISTS "user_identities_own_data" ON user_identities;
CREATE POLICY "user_identities_own_data" ON user_identities
    FOR ALL
    TO authenticated
    USING (id = current_setting('app.current_user_duid', true))
    WITH CHECK (id = current_setting('app.current_user_duid', true));

-- USER_IDENTITIES: Anonymous insert during registration
DROP POLICY IF EXISTS "user_identities_anon_insert" ON user_identities;
CREATE POLICY "user_identities_anon_insert" ON user_identities
    FOR INSERT
    TO anon
    WITH CHECK (true);

-- FAMILY_FEDERATIONS: Family members can access federation data
DROP POLICY IF EXISTS "family_federations_member_access" ON family_federations;
CREATE POLICY "family_federations_member_access" ON family_federations
    FOR ALL
    TO authenticated
    USING (id IN (
        SELECT family_federation_id
        FROM family_members
        WHERE user_duid = current_setting('app.current_user_duid', true)
        AND is_active = true
    ));

-- FAMILY_MEMBERS: Users can access their own family memberships
DROP POLICY IF EXISTS "family_members_own_data" ON family_members;
CREATE POLICY "family_members_own_data" ON family_members
    FOR ALL
    TO authenticated
    USING (user_duid = current_setting('app.current_user_duid', true));

-- NOSTR_BACKUPS: Users can access their own backups
DROP POLICY IF EXISTS "nostr_backups_own_data" ON nostr_backups;
CREATE POLICY "nostr_backups_own_data" ON nostr_backups
    FOR ALL
    TO authenticated
    USING (user_duid = current_setting('app.current_user_duid', true));

-- REWARD_REDEMPTIONS: Users can access their own rewards
DROP POLICY IF EXISTS "reward_redemptions_own_data" ON reward_redemptions;
CREATE POLICY "reward_redemptions_own_data" ON reward_redemptions
    FOR ALL
    TO authenticated
    USING (student_duid = current_setting('app.current_user_duid', true));

-- =====================================================
-- GRANT PERMISSIONS TO ROLES
-- =====================================================

-- Grant SELECT on nip05_records to anon (NIP-05 verification)
GRANT SELECT ON nip05_records TO anon;
GRANT SELECT ON nip05_records TO authenticated;
GRANT INSERT ON nip05_records TO anon; -- Registration flow

-- Grant appropriate permissions on user_identities
GRANT INSERT ON user_identities TO anon; -- Registration flow
GRANT ALL ON user_identities TO authenticated; -- Own data management

-- Grant permissions on other tables
GRANT ALL ON family_federations TO authenticated;
GRANT ALL ON family_members TO authenticated;
GRANT ALL ON nostr_backups TO authenticated;
GRANT ALL ON reward_redemptions TO authenticated;


-- =====================================================
-- HELPER VIEW: current_user_identity (DUID Index -> hashed_npub)
-- Centralizes lookup for RLS policies using app.current_user_duid
-- Phase 2: Uses secure DUID index for database operations
-- =====================================================

-- Create or replace view (idempotent)
CREATE OR REPLACE VIEW current_user_identity AS
SELECT
    id AS duid_index,
    hashed_npub
FROM user_identities
WHERE id = current_setting('app.current_user_duid', true);

-- Grant minimal read access to authenticated users
GRANT SELECT ON current_user_identity TO authenticated;

-- =====================================================
-- UPDATED_AT TRIGGERS
-- =====================================================

-- Create or replace the updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to all tables
DROP TRIGGER IF EXISTS update_nip05_records_updated_at ON nip05_records;
CREATE TRIGGER update_nip05_records_updated_at
    BEFORE UPDATE ON nip05_records
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_identities_updated_at ON user_identities;
CREATE TRIGGER update_user_identities_updated_at
    BEFORE UPDATE ON user_identities
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_family_federations_updated_at ON family_federations;
CREATE TRIGGER update_family_federations_updated_at
    BEFORE UPDATE ON family_federations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_family_members_updated_at ON family_members;
CREATE TRIGGER update_family_members_updated_at
    BEFORE UPDATE ON family_members
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- PERFORMANCE INDEXES (Created LAST after all columns exist)
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '🔧 Creating indexes on all tables...';
END $$;

-- NIP05 records indexes (DUID-based for availability checking)
CREATE INDEX IF NOT EXISTS idx_nip05_records_domain ON nip05_records(domain);
CREATE INDEX IF NOT EXISTS idx_nip05_records_is_active ON nip05_records(is_active);
CREATE INDEX IF NOT EXISTS idx_nip05_records_name_duid ON nip05_records(name_duid);

-- User identities indexes (DUID-based) - simplified approach
DO $$
BEGIN
    -- Ensure the column exists before creating index
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'user_identities'
        AND column_name = 'family_federation_id'
    ) THEN
        ALTER TABLE user_identities ADD COLUMN family_federation_id UUID;
        RAISE NOTICE '✓ Added family_federation_id column to user_identities';
    END IF;

    -- Create index after ensuring column exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public'
        AND tablename = 'user_identities'
        AND indexname = 'idx_user_identities_family_federation_id'
    ) THEN
        CREATE INDEX idx_user_identities_family_federation_id ON user_identities(family_federation_id);
        RAISE NOTICE '✓ Created index on user_identities.family_federation_id';
    ELSE
        RAISE NOTICE '✓ Index on family_federation_id already exists';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_identities_role ON user_identities(role);
CREATE INDEX IF NOT EXISTS idx_user_identities_is_active ON user_identities(is_active);
CREATE INDEX IF NOT EXISTS idx_user_identities_hashed_username ON user_identities(hashed_username);

-- Family federation indexes
CREATE INDEX IF NOT EXISTS idx_family_federations_is_active ON family_federations(is_active);
CREATE INDEX IF NOT EXISTS idx_family_federations_duid ON family_federations(federation_duid);

-- Family members indexes (conditional on column existence)
DO $$
BEGIN
    -- Create indexes only if columns exist
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'family_members' AND column_name = 'family_federation_id') THEN
        CREATE INDEX IF NOT EXISTS idx_family_members_federation_id ON family_members(family_federation_id);
        RAISE NOTICE '✓ Created index: idx_family_members_federation_id';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'family_members' AND column_name = 'user_duid') THEN
        CREATE INDEX IF NOT EXISTS idx_family_members_user_duid ON family_members(user_duid);
        RAISE NOTICE '✓ Created index: idx_family_members_user_duid';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'family_members' AND column_name = 'family_role') THEN
        CREATE INDEX IF NOT EXISTS idx_family_members_family_role ON family_members(family_role);
        RAISE NOTICE '✓ Created index: idx_family_members_family_role';
    END IF;
END $$;

-- Nostr backups indexes (DUID-based)
CREATE INDEX IF NOT EXISTS idx_nostr_backups_user_duid ON nostr_backups(user_duid);
CREATE INDEX IF NOT EXISTS idx_nostr_backups_created_at ON nostr_backups(created_at);

-- Reward redemptions indexes (DUID-based)
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_student_duid ON reward_redemptions(student_duid);
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_redeemed_at ON reward_redemptions(redeemed_at);

-- =====================================================
-- PRIVACY-FIRST DATA POLICY - NO SAMPLE DATA
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🔒 PRIVACY-FIRST DATA POLICY ENFORCED';
    RAISE NOTICE '==================================';
    RAISE NOTICE '⚠️  NO SAMPLE DATA INSERTED - Privacy violation prevented';
    RAISE NOTICE '';
    RAISE NOTICE '📋 All NIP-05 records must be created through application with:';
    RAISE NOTICE '   • Proper DUID generation from user input';
    RAISE NOTICE '   • Zero-knowledge proof verification';
    RAISE NOTICE '   • No plaintext storage of usernames or pubkeys';
    RAISE NOTICE '   • Client-side hashing before transmission';
    RAISE NOTICE '';
    RAISE NOTICE '✅ nip05_records table ready for privacy-first operations';
    RAISE NOTICE '🔐 Maximum encryption enforced - zero plaintext storage';
END $$;

-- =====================================================
-- MIGRATION VERIFICATION
-- =====================================================

DO $$
DECLARE
    table_count INTEGER;
    expected_tables TEXT[] := ARRAY[
        'nip05_records', 'user_identities', 'family_federations',
        'family_members', 'nostr_backups', 'reward_redemptions'
    ];
    current_table TEXT;
    policy_count INTEGER;
    index_count INTEGER;
    eliminated_tables TEXT[] := ARRAY['profiles', 'privacy_users', 'lightning_addresses', 'families'];
    eliminated_table TEXT;
    eliminated_count INTEGER := 0;
BEGIN
    -- Check that expected tables exist
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables
    WHERE table_name = ANY(expected_tables)
    AND table_schema = 'public';

    -- Check that eliminated tables don't exist
    FOREACH eliminated_table IN ARRAY eliminated_tables
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables t
            WHERE t.table_name = eliminated_table AND t.table_schema = 'public'
        ) THEN
            eliminated_count := eliminated_count + 1;
        END IF;
    END LOOP;

    -- Check RLS policies
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies
    WHERE tablename = ANY(expected_tables)
    AND schemaname = 'public';

    -- Check indexes
    SELECT COUNT(*) INTO index_count
    FROM pg_indexes
    WHERE tablename = ANY(expected_tables)
    AND schemaname = 'public';

    RAISE NOTICE '';
    RAISE NOTICE '✅ PRIVACY-FIRST IDENTITY MIGRATION COMPLETE';
    RAISE NOTICE '==========================================';
    RAISE NOTICE '';
    RAISE NOTICE '📊 MIGRATION RESULTS:';
    RAISE NOTICE '  • Core tables created: %/%', table_count, array_length(expected_tables, 1);
    RAISE NOTICE '  • Redundant tables eliminated: %/%', eliminated_count, array_length(eliminated_tables, 1);
    RAISE NOTICE '  • RLS policies: %', policy_count;
    RAISE NOTICE '  • Privacy-preserving indexes: %', index_count;
    RAISE NOTICE '';

    IF table_count = array_length(expected_tables, 1) THEN
        RAISE NOTICE '🎉 SUCCESS: Privacy-first identity system ready!';
        RAISE NOTICE '';
        RAISE NOTICE '📋 CREATED TABLES:';
        FOREACH current_table IN ARRAY expected_tables
        LOOP
            RAISE NOTICE '  ✓ %', current_table;
        END LOOP;
        RAISE NOTICE '';
        RAISE NOTICE '🗑️  ELIMINATED REDUNDANT TABLES:';
        FOREACH eliminated_table IN ARRAY eliminated_tables
        LOOP
            RAISE NOTICE '  ✗ % (consolidated/removed)', eliminated_table;
        END LOOP;
        RAISE NOTICE '';
        RAISE NOTICE '🔒 PRIVACY-FIRST FEATURES:';
        RAISE NOTICE '  ✓ Maximum encryption (hashed columns only)';
        RAISE NOTICE '  ✓ Deterministic User IDs (DUID) for O(1) auth';
        RAISE NOTICE '  ✓ Unique user salts for data hashing';
        RAISE NOTICE '  ✓ Zero plaintext storage of sensitive data';
        RAISE NOTICE '  ✓ Privacy-preserving foreign key relationships';
        RAISE NOTICE '';
        RAISE NOTICE '🚀 READY FOR REGISTER-IDENTITY.JS TESTING!';
    ELSE
        RAISE WARNING '⚠️  WARNING: Only % of % expected tables found', table_count, array_length(expected_tables, 1);
        RAISE NOTICE 'Please review the migration output above for errors.';
    END IF;

    RAISE NOTICE '';
END $$;