-- Migration: Family Foundry Tables
-- Description: Creates tables for storing family charter definitions, RBAC configurations, and federation creation data
-- Date: 2025-07-05
-- Updated: 2025-12-07 - Aligned schema with API implementation (privacy-first TEXT IDs, inline RBAC, status column)
-- Compliance: Master Context - NIP-59 Gift Wrapped messaging, privacy-first, no email storage
-- Note: Invitations use existing PostAuthInvitationModal system (/api/authenticated/generate-peer-invite)
-- IMPORTANT: This migration is idempotent - safe to run multiple times
--
-- EXECUTION ORDER:
-- 1. CREATE TABLES first (for fresh databases)
-- 2. ALTER TABLES second (for upgrading existing databases from UUID to TEXT schema)
-- This ensures the migration works on both fresh and existing databases.

-- ============================================================================
-- STEP 1: CREATE TABLES (if they don't exist - for fresh databases)
-- ============================================================================

-- Family Charter Definitions
-- Privacy-first design: Uses TEXT id (16-char hex from generateFamilyIdentifier) and TEXT user_duid
CREATE TABLE IF NOT EXISTS family_charters (
    id TEXT PRIMARY KEY,  -- Privacy-preserving 16-char hex identifier from API
    family_name VARCHAR(255) NOT NULL,
    family_motto TEXT,
    founding_date DATE NOT NULL,
    mission_statement TEXT,
    core_values JSONB DEFAULT '[]',
    rbac_configuration JSONB DEFAULT '[]',  -- Inline RBAC roles storage for API compatibility
    created_by TEXT NOT NULL,  -- user_duid from user_identities (privacy-first, not auth.users UUID)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),  -- TEXT status for API compatibility

    -- Metadata (encrypted)
    metadata JSONB DEFAULT '{}',

    -- Constraints
    CONSTRAINT family_charters_name_length CHECK (char_length(family_name) >= 2),
    CONSTRAINT family_charters_founding_date_valid CHECK (founding_date <= CURRENT_DATE)
);

-- Family RBAC Configurations (kept for future granular RBAC management)
-- Note: API currently uses inline rbac_configuration JSONB in family_charters
CREATE TABLE IF NOT EXISTS family_rbac_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    charter_id TEXT REFERENCES family_charters(id) ON DELETE CASCADE,  -- TEXT to match family_charters.id
    role_id VARCHAR(50) NOT NULL CHECK (role_id IN ('guardian', 'steward', 'adult', 'offspring')),
    role_name VARCHAR(100) NOT NULL,
    description TEXT,
    rights JSONB DEFAULT '[]',
    responsibilities JSONB DEFAULT '[]',
    rewards JSONB DEFAULT '[]',
    hierarchy_level INTEGER NOT NULL CHECK (hierarchy_level >= 1 AND hierarchy_level <= 4),
    daily_spending_limit INTEGER DEFAULT 0,
    requires_approval_for JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT family_rbac_configs_unique_role_per_charter UNIQUE (charter_id, role_id)
);

-- Family Federation Creations
-- Privacy-first design: Uses TEXT references for charter_id and user_duid
CREATE TABLE IF NOT EXISTS family_federation_creations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    charter_id TEXT REFERENCES family_charters(id) ON DELETE CASCADE,  -- TEXT to match family_charters.id
    federation_name VARCHAR(255) NOT NULL,
    federation_id VARCHAR(255) UNIQUE,
    status VARCHAR(50) DEFAULT 'creating' CHECK (status IN ('creating', 'active', 'failed', 'suspended')),
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    created_by TEXT NOT NULL,  -- user_duid from user_identities (privacy-first)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    activated_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Federation configuration (encrypted)
    config JSONB DEFAULT '{}',

    -- Error tracking (no sensitive data)
    error_message TEXT,
    error_details JSONB DEFAULT '{}',

    -- Metadata (encrypted)
    metadata JSONB DEFAULT '{}'
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_family_charters_created_by ON family_charters(created_by);
CREATE INDEX IF NOT EXISTS idx_family_charters_status ON family_charters(status);  -- Changed from is_active to status
CREATE INDEX IF NOT EXISTS idx_family_rbac_configs_charter_id ON family_rbac_configs(charter_id);
CREATE INDEX IF NOT EXISTS idx_family_rbac_configs_role_id ON family_rbac_configs(role_id);
CREATE INDEX IF NOT EXISTS idx_family_federation_creations_charter_id ON family_federation_creations(charter_id);
CREATE INDEX IF NOT EXISTS idx_family_federation_creations_status ON family_federation_creations(status);
CREATE INDEX IF NOT EXISTS idx_family_federation_creations_federation_id ON family_federation_creations(federation_id);

-- ============================================================================
-- STEP 2: IDEMPOTENT SCHEMA MIGRATION (for upgrading existing databases)
-- ============================================================================
-- This section handles upgrading from the old UUID-based schema to the new
-- privacy-first TEXT-based schema. Safe to run multiple times.
-- Only executes if tables exist with old schema (UUID columns).

-- Enable RLS (idempotent - tables now exist)
ALTER TABLE family_charters ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_rbac_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_federation_creations ENABLE ROW LEVEL SECURITY;

-- Drop old index on is_active if it exists (from old schema)
DROP INDEX IF EXISTS idx_family_charters_active;

-- Drop old constraints and foreign keys before modifying column types
DO $$
BEGIN
    -- Only proceed if tables exist (should always be true at this point)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'family_charters') THEN
        -- Drop foreign keys on family_rbac_configs.charter_id if they exist
        IF EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'family_rbac_configs_charter_id_fkey'
            AND table_name = 'family_rbac_configs'
        ) THEN
            ALTER TABLE family_rbac_configs DROP CONSTRAINT family_rbac_configs_charter_id_fkey;
        END IF;

        -- Drop foreign keys on family_federation_creations.charter_id if they exist
        IF EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'family_federation_creations_charter_id_fkey'
            AND table_name = 'family_federation_creations'
        ) THEN
            ALTER TABLE family_federation_creations DROP CONSTRAINT family_federation_creations_charter_id_fkey;
        END IF;
    END IF;
END $$;

-- Modify family_charters table if it exists with old schema
DO $$
BEGIN
    -- Check if table exists and has UUID id column (old schema)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'family_charters' AND column_name = 'id' AND data_type = 'uuid'
    ) THEN
        -- Drop existing data (migration cannot convert UUID to TEXT IDs)
        TRUNCATE TABLE family_charters CASCADE;
        -- Alter id column from UUID to TEXT
        ALTER TABLE family_charters ALTER COLUMN id TYPE TEXT;
        ALTER TABLE family_charters ALTER COLUMN id DROP DEFAULT;
        RAISE NOTICE 'family_charters.id converted from UUID to TEXT';
    END IF;

    -- Check if created_by column has UUID type (old schema)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'family_charters' AND column_name = 'created_by' AND data_type = 'uuid'
    ) THEN
        -- Drop the foreign key constraint if it exists
        IF EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'family_charters_created_by_fkey'
            AND table_name = 'family_charters'
        ) THEN
            ALTER TABLE family_charters DROP CONSTRAINT family_charters_created_by_fkey;
        END IF;
        -- Alter created_by column from UUID to TEXT
        ALTER TABLE family_charters ALTER COLUMN created_by TYPE TEXT;
        ALTER TABLE family_charters ALTER COLUMN created_by SET NOT NULL;
        RAISE NOTICE 'family_charters.created_by converted from UUID to TEXT';
    END IF;

    -- Add rbac_configuration column if it doesn't exist (for tables created before this migration)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'family_charters') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'family_charters' AND column_name = 'rbac_configuration'
        ) THEN
            ALTER TABLE family_charters ADD COLUMN rbac_configuration JSONB DEFAULT '[]';
            RAISE NOTICE 'family_charters.rbac_configuration column added';
        END IF;
    END IF;

    -- Replace is_active with status if old column exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'family_charters' AND column_name = 'is_active'
    ) THEN
        -- Add status column if it doesn't exist
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'family_charters' AND column_name = 'status'
        ) THEN
            ALTER TABLE family_charters ADD COLUMN status TEXT DEFAULT 'active';
            -- Add constraint if it doesn't exist
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE constraint_name = 'family_charters_status_check'
                AND table_name = 'family_charters'
            ) THEN
                ALTER TABLE family_charters ADD CONSTRAINT family_charters_status_check
                    CHECK (status IN ('active', 'suspended', 'archived'));
            END IF;
            -- Migrate data from is_active to status
            UPDATE family_charters SET status = CASE WHEN is_active THEN 'active' ELSE 'suspended' END;
        END IF;
        -- Drop old column
        ALTER TABLE family_charters DROP COLUMN is_active;
        RAISE NOTICE 'family_charters.is_active replaced with status';
    END IF;
END $$;

-- Modify family_rbac_configs.charter_id if it exists with UUID type
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'family_rbac_configs' AND column_name = 'charter_id' AND data_type = 'uuid'
    ) THEN
        TRUNCATE TABLE family_rbac_configs;
        ALTER TABLE family_rbac_configs ALTER COLUMN charter_id TYPE TEXT;
        RAISE NOTICE 'family_rbac_configs.charter_id converted from UUID to TEXT';
    END IF;
END $$;

-- Modify family_federation_creations columns if they exist with old types
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'family_federation_creations' AND column_name = 'charter_id' AND data_type = 'uuid'
    ) THEN
        TRUNCATE TABLE family_federation_creations;
        ALTER TABLE family_federation_creations ALTER COLUMN charter_id TYPE TEXT;
        RAISE NOTICE 'family_federation_creations.charter_id converted from UUID to TEXT';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'family_federation_creations' AND column_name = 'created_by' AND data_type = 'uuid'
    ) THEN
        -- Drop foreign key if exists
        IF EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'family_federation_creations_created_by_fkey'
            AND table_name = 'family_federation_creations'
        ) THEN
            ALTER TABLE family_federation_creations DROP CONSTRAINT family_federation_creations_created_by_fkey;
        END IF;
        ALTER TABLE family_federation_creations ALTER COLUMN created_by TYPE TEXT;
        ALTER TABLE family_federation_creations ALTER COLUMN created_by SET NOT NULL;
        RAISE NOTICE 'family_federation_creations.created_by converted from UUID to TEXT';
    END IF;
END $$;

-- Re-add foreign key constraints after schema migration (idempotent)
DO $$
BEGIN
    -- Add FK on family_rbac_configs.charter_id -> family_charters.id
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'family_rbac_configs_charter_id_fkey'
        AND table_name = 'family_rbac_configs'
    ) THEN
        ALTER TABLE family_rbac_configs
            ADD CONSTRAINT family_rbac_configs_charter_id_fkey
            FOREIGN KEY (charter_id) REFERENCES family_charters(id) ON DELETE CASCADE;
    END IF;

    -- Add FK on family_federation_creations.charter_id -> family_charters.id
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'family_federation_creations_charter_id_fkey'
        AND table_name = 'family_federation_creations'
    ) THEN
        ALTER TABLE family_federation_creations
            ADD CONSTRAINT family_federation_creations_charter_id_fkey
            FOREIGN KEY (charter_id) REFERENCES family_charters(id) ON DELETE CASCADE;
    END IF;
END $$;

-- ============================================================================
-- STEP 3: RLS POLICIES, TRIGGERS, AND FUNCTIONS
-- ============================================================================

-- RLS Policies for Family Charters
-- NOTE: API uses custom JWT authentication (SecureSessionManager), not Supabase auth.
-- RLS validates that user is authenticated; app-level validation ensures proper ownership.
-- For stricter RLS, use auth.uid()::text = created_by if Supabase auth is configured.
DROP POLICY IF EXISTS "Users can view their own family charters" ON family_charters;
CREATE POLICY "Users can view their own family charters" ON family_charters
    FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can create their own family charters" ON family_charters;
CREATE POLICY "Users can create their own family charters" ON family_charters
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can update their own family charters" ON family_charters;
CREATE POLICY "Users can update their own family charters" ON family_charters
    FOR UPDATE USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can delete their own family charters" ON family_charters;
CREATE POLICY "Users can delete their own family charters" ON family_charters
    FOR DELETE USING (auth.uid() IS NOT NULL);

-- RLS Policies for Family RBAC Configs
DROP POLICY IF EXISTS "Users can view RBAC configs for their charters" ON family_rbac_configs;
CREATE POLICY "Users can view RBAC configs for their charters" ON family_rbac_configs
    FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can manage RBAC configs for their charters" ON family_rbac_configs;
CREATE POLICY "Users can manage RBAC configs for their charters" ON family_rbac_configs
    FOR ALL USING (auth.uid() IS NOT NULL);

-- RLS Policies for Family Federation Creations
DROP POLICY IF EXISTS "Users can view their federation creations" ON family_federation_creations;
CREATE POLICY "Users can view their federation creations" ON family_federation_creations
    FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can manage their federation creations" ON family_federation_creations;
CREATE POLICY "Users can manage their federation creations" ON family_federation_creations
    FOR ALL USING (auth.uid() IS NOT NULL);

-- Functions for automatic updates
CREATE OR REPLACE FUNCTION update_family_charters_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_family_rbac_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_family_federation_creations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for automatic updates (idempotent - drop and recreate)
DROP TRIGGER IF EXISTS trigger_family_charters_updated_at ON family_charters;
CREATE TRIGGER trigger_family_charters_updated_at
    BEFORE UPDATE ON family_charters
    FOR EACH ROW
    EXECUTE FUNCTION update_family_charters_updated_at();

DROP TRIGGER IF EXISTS trigger_family_rbac_configs_updated_at ON family_rbac_configs;
CREATE TRIGGER trigger_family_rbac_configs_updated_at
    BEFORE UPDATE ON family_rbac_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_family_rbac_configs_updated_at();

DROP TRIGGER IF EXISTS trigger_family_federation_creations_updated_at ON family_federation_creations;
CREATE TRIGGER trigger_family_federation_creations_updated_at
    BEFORE UPDATE ON family_federation_creations
    FOR EACH ROW
    EXECUTE FUNCTION update_family_federation_creations_updated_at();

-- Function to create a complete family foundry setup (integrated with existing invitation system)
-- Updated for privacy-first architecture: accepts TEXT charter_id and user_duid
DROP FUNCTION IF EXISTS create_family_foundry(VARCHAR, TEXT, DATE, TEXT, JSONB, JSONB);
CREATE OR REPLACE FUNCTION create_family_foundry(
    p_charter_id TEXT,           -- Privacy-preserving 16-char hex identifier from API
    p_family_name VARCHAR(255),
    p_family_motto TEXT,
    p_founding_date DATE,
    p_mission_statement TEXT,
    p_core_values JSONB,
    p_rbac_configuration JSONB,  -- Inline RBAC roles storage
    p_user_duid TEXT             -- Privacy-first user identifier (not auth.uid())
)
RETURNS TEXT AS $$
DECLARE
    v_rbac_config JSONB;
BEGIN
    -- Create family charter with inline RBAC configuration
    INSERT INTO family_charters (
        id,
        family_name,
        family_motto,
        founding_date,
        mission_statement,
        core_values,
        rbac_configuration,
        created_by,
        status
    ) VALUES (
        p_charter_id,
        p_family_name,
        p_family_motto,
        p_founding_date,
        p_mission_statement,
        p_core_values,
        p_rbac_configuration,
        p_user_duid,
        'active'
    );

    -- Optionally also create RBAC configurations in separate table (for future granular management)
    FOR v_rbac_config IN SELECT * FROM jsonb_array_elements(p_rbac_configuration)
    LOOP
        INSERT INTO family_rbac_configs (
            charter_id,
            role_id,
            role_name,
            description,
            rights,
            responsibilities,
            rewards,
            hierarchy_level,
            daily_spending_limit,
            requires_approval_for
        ) VALUES (
            p_charter_id,
            (v_rbac_config->>'id')::VARCHAR(50),
            v_rbac_config->>'name',
            v_rbac_config->>'description',
            v_rbac_config->'rights',
            v_rbac_config->'responsibilities',
            v_rbac_config->'rewards',
            (v_rbac_config->>'hierarchyLevel')::INTEGER,
            COALESCE((v_rbac_config->>'dailySpendingLimit')::INTEGER, 0),
            COALESCE(v_rbac_config->'requiresApprovalFor', '[]'::jsonb)
        );
    END LOOP;

    RETURN p_charter_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments
COMMENT ON TABLE family_charters IS 'Stores family charter definitions for the Family Foundry wizard - Privacy-first, no external logging';
COMMENT ON TABLE family_rbac_configs IS 'Stores RBAC configurations for family federations - Sovereign user control';
COMMENT ON TABLE family_federation_creations IS 'Tracks the creation and status of family federations - Bitcoin-only architecture';

COMMENT ON FUNCTION create_family_foundry IS 'Creates a complete family foundry setup with charter and RBAC configs - Invitations use existing PostAuthInvitationModal system'; 