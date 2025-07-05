-- Migration: Family Foundry Tables
-- Description: Creates tables for storing family charter definitions, RBAC configurations, and federation creation data
-- Date: 2025-07-05
-- Compliance: Master Context - NIP-59 Gift Wrapped messaging, privacy-first, no email storage
-- Note: Invitations use existing PostAuthInvitationModal system (/api/authenticated/generate-peer-invite)

-- Enable RLS
ALTER TABLE IF EXISTS family_charters ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS family_rbac_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS family_federation_creations ENABLE ROW LEVEL SECURITY;

-- Family Charter Definitions
CREATE TABLE IF NOT EXISTS family_charters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_name VARCHAR(255) NOT NULL,
    family_motto TEXT,
    founding_date DATE NOT NULL,
    mission_statement TEXT,
    core_values JSONB DEFAULT '[]',
    created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Metadata (encrypted)
    metadata JSONB DEFAULT '{}',
    
    -- Constraints
    CONSTRAINT family_charters_name_length CHECK (char_length(family_name) >= 2),
    CONSTRAINT family_charters_founding_date_valid CHECK (founding_date <= CURRENT_DATE)
);

-- Family RBAC Configurations
CREATE TABLE IF NOT EXISTS family_rbac_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    charter_id UUID REFERENCES family_charters(id) ON DELETE CASCADE,
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
CREATE TABLE IF NOT EXISTS family_federation_creations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    charter_id UUID REFERENCES family_charters(id) ON DELETE CASCADE,
    federation_name VARCHAR(255) NOT NULL,
    federation_id VARCHAR(255) UNIQUE,
    status VARCHAR(50) DEFAULT 'creating' CHECK (status IN ('creating', 'active', 'failed', 'suspended')),
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_family_charters_active ON family_charters(is_active);
CREATE INDEX IF NOT EXISTS idx_family_rbac_configs_charter_id ON family_rbac_configs(charter_id);
CREATE INDEX IF NOT EXISTS idx_family_rbac_configs_role_id ON family_rbac_configs(role_id);
CREATE INDEX IF NOT EXISTS idx_family_federation_creations_charter_id ON family_federation_creations(charter_id);
CREATE INDEX IF NOT EXISTS idx_family_federation_creations_status ON family_federation_creations(status);
CREATE INDEX IF NOT EXISTS idx_family_federation_creations_federation_id ON family_federation_creations(federation_id);

-- RLS Policies for Family Charters
CREATE POLICY "Users can view their own family charters" ON family_charters
    FOR SELECT USING (auth.uid() = created_by);

CREATE POLICY "Users can create their own family charters" ON family_charters
    FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own family charters" ON family_charters
    FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own family charters" ON family_charters
    FOR DELETE USING (auth.uid() = created_by);

-- RLS Policies for Family RBAC Configs
CREATE POLICY "Users can view RBAC configs for their charters" ON family_rbac_configs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM family_charters 
            WHERE family_charters.id = family_rbac_configs.charter_id 
            AND family_charters.created_by = auth.uid()
        )
    );

CREATE POLICY "Users can manage RBAC configs for their charters" ON family_rbac_configs
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM family_charters 
            WHERE family_charters.id = family_rbac_configs.charter_id 
            AND family_charters.created_by = auth.uid()
        )
    );

-- RLS Policies for Family Federation Creations
CREATE POLICY "Users can view their federation creations" ON family_federation_creations
    FOR SELECT USING (auth.uid() = created_by);

CREATE POLICY "Users can manage their federation creations" ON family_federation_creations
    FOR ALL USING (auth.uid() = created_by);

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

-- Triggers for automatic updates
CREATE TRIGGER trigger_family_charters_updated_at
    BEFORE UPDATE ON family_charters
    FOR EACH ROW
    EXECUTE FUNCTION update_family_charters_updated_at();

CREATE TRIGGER trigger_family_rbac_configs_updated_at
    BEFORE UPDATE ON family_rbac_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_family_rbac_configs_updated_at();

CREATE TRIGGER trigger_family_federation_creations_updated_at
    BEFORE UPDATE ON family_federation_creations
    FOR EACH ROW
    EXECUTE FUNCTION update_family_federation_creations_updated_at();

-- Function to create a complete family foundry setup (integrated with existing invitation system)
CREATE OR REPLACE FUNCTION create_family_foundry(
    p_family_name VARCHAR(255),
    p_family_motto TEXT,
    p_founding_date DATE,
    p_mission_statement TEXT,
    p_core_values JSONB,
    p_rbac_configs JSONB
)
RETURNS UUID AS $$
DECLARE
    v_charter_id UUID;
    v_rbac_config JSONB;
BEGIN
    -- Create family charter
    INSERT INTO family_charters (
        family_name,
        family_motto,
        founding_date,
        mission_statement,
        core_values,
        created_by
    ) VALUES (
        p_family_name,
        p_family_motto,
        p_founding_date,
        p_mission_statement,
        p_core_values,
        auth.uid()
    ) RETURNING id INTO v_charter_id;

    -- Create RBAC configurations
    FOR v_rbac_config IN SELECT * FROM jsonb_array_elements(p_rbac_configs)
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
            v_charter_id,
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

    RETURN v_charter_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments
COMMENT ON TABLE family_charters IS 'Stores family charter definitions for the Family Foundry wizard - Privacy-first, no external logging';
COMMENT ON TABLE family_rbac_configs IS 'Stores RBAC configurations for family federations - Sovereign user control';
COMMENT ON TABLE family_federation_creations IS 'Tracks the creation and status of family federations - Bitcoin-only architecture';

COMMENT ON FUNCTION create_family_foundry IS 'Creates a complete family foundry setup with charter and RBAC configs - Invitations use existing PostAuthInvitationModal system'; 