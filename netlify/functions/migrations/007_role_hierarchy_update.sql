-- Migration: 007_role_hierarchy_update.sql
-- Update role hierarchy to implement proper RBAC for Family Federations
-- Hierarchy: Guardian > Steward > Adult > Offspring

-- First, update the federation_role constraint in profiles table
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS check_federation_role;
ALTER TABLE profiles ADD CONSTRAINT check_federation_role 
    CHECK (federation_role IN ('private', 'offspring', 'adult', 'steward', 'guardian'));

-- Update the member_role constraint in family_memberships table  
ALTER TABLE family_memberships DROP CONSTRAINT IF EXISTS check_member_role;
ALTER TABLE family_memberships ADD CONSTRAINT check_member_role 
    CHECK (member_role IN ('offspring', 'adult', 'steward', 'guardian'));
    -- Note: Private users are not in family_memberships table

-- Update the federation_role constraint in privacy_users table
ALTER TABLE privacy_users DROP CONSTRAINT IF EXISTS check_federation_role;
ALTER TABLE privacy_users ADD CONSTRAINT check_federation_role 
    CHECK (federation_role IN ('private', 'offspring', 'adult', 'steward', 'guardian'));

-- Add new columns for role hierarchy management
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS created_by VARCHAR(64); -- Hash of creator's npub
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS steward_approved BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS guardian_approved BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role_permissions JSONB DEFAULT '{}';

-- Add role hierarchy management table
CREATE TABLE IF NOT EXISTS role_hierarchy (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    federation_hash VARCHAR(32) NOT NULL,
    member_hash VARCHAR(64) NOT NULL,
    current_role VARCHAR(20) NOT NULL CHECK (current_role IN ('offspring', 'adult', 'steward', 'guardian')),
    previous_role VARCHAR(20),
    promoted_by VARCHAR(64), -- Hash of promoter's npub
    demoted_by VARCHAR(64), -- Hash of demoter's npub
    reason TEXT,
    effective_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT check_previous_role CHECK (previous_role IN ('offspring', 'adult', 'steward', 'guardian')),
    UNIQUE(federation_hash, member_hash, effective_at)
);
-- Note: Private users are not tracked in role_hierarchy as they have no RBAC

-- Add role permission definitions table
CREATE TABLE IF NOT EXISTS role_permissions (
    role VARCHAR(20) PRIMARY KEY CHECK (role IN ('private', 'offspring', 'adult', 'steward', 'guardian')),
    permissions JSONB NOT NULL DEFAULT '{}',
    can_promote_to JSONB NOT NULL DEFAULT '[]', -- Array of roles this role can promote to
    can_demote_from JSONB NOT NULL DEFAULT '[]', -- Array of roles this role can demote from
    can_remove BOOLEAN NOT NULL DEFAULT false,
    daily_spending_limit INTEGER NOT NULL DEFAULT 0,
    requires_approval_for JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default role permissions
INSERT INTO role_permissions (role, permissions, can_promote_to, can_demote_from, can_remove, daily_spending_limit, requires_approval_for) VALUES
-- Private: Complete autonomy, no RBAC restrictions
('private', 
 '{"can_view_own_balance": true, "can_make_small_payments": true, "can_manage_own_funds": true, "can_set_own_spending_limits": true, "can_manage_own_custody": true, "no_rbac_restrictions": true}', 
 '[]', '[]', false, 0, 
 '[]'),

-- Offspring: Limited permissions, controlled by Adults
('offspring', 
 '{"can_view_own_balance": true, "can_make_small_payments": true, "can_view_family_events": true}', 
 '[]', '[]', false, 10000, 
 '{"large_payments": true, "role_changes": true, "federation_settings": true}'),

-- Adult: Can manage Offspring, moderate permissions
('adult', 
 '{"can_view_family_balances": true, "can_approve_offspring_payments": true, "can_create_offspring": true, "can_manage_offspring": true, "can_view_family_events": true}', 
 '["offspring"]', '["offspring"]', false, 100000, 
 '{"large_payments": true, "role_changes": true, "federation_settings": true}'),

-- Steward: Can manage Adults and Offspring, high permissions
('steward', 
 '{"can_view_all_balances": true, "can_approve_adult_payments": true, "can_create_adults": true, "can_manage_adults": true, "can_manage_offspring": true, "can_view_federation_settings": true, "can_propose_changes": true}', 
 '["offspring", "adult"]', '["offspring", "adult"]', false, 500000, 
 '{"federation_settings": true, "guardian_actions": true}'),

-- Guardian: Highest authority, can remove Stewards
('guardian', 
 '{"can_view_all_balances": true, "can_approve_all_payments": true, "can_create_any_role": true, "can_manage_all_roles": true, "can_remove_stewards": true, "can_manage_federation": true, "can_emergency_override": true}', 
 '["offspring", "adult", "steward"]', '["offspring", "adult", "steward"]', true, 1000000, 
 '[]')
ON CONFLICT (role) DO UPDATE SET
    permissions = EXCLUDED.permissions,
    can_promote_to = EXCLUDED.can_promote_to,
    can_demote_from = EXCLUDED.can_demote_from,
    can_remove = EXCLUDED.can_remove,
    daily_spending_limit = EXCLUDED.daily_spending_limit,
    requires_approval_for = EXCLUDED.requires_approval_for,
    updated_at = NOW();

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_role_hierarchy_federation ON role_hierarchy(federation_hash);
CREATE INDEX IF NOT EXISTS idx_role_hierarchy_member ON role_hierarchy(member_hash);
CREATE INDEX IF NOT EXISTS idx_role_hierarchy_current_role ON role_hierarchy(current_role);
CREATE INDEX IF NOT EXISTS idx_role_hierarchy_active ON role_hierarchy(is_active);
CREATE INDEX IF NOT EXISTS idx_role_hierarchy_effective ON role_hierarchy(effective_at);

-- Add comments for documentation
COMMENT ON TABLE role_hierarchy IS 'Tracks role changes and hierarchy management in family federations';
COMMENT ON TABLE role_permissions IS 'Defines permissions and capabilities for each role in the hierarchy';
COMMENT ON COLUMN profiles.created_by IS 'Hash of the npub of the user who created this profile';
COMMENT ON COLUMN profiles.steward_approved IS 'Whether user has been approved by a steward';
COMMENT ON COLUMN profiles.guardian_approved IS 'Whether user has been approved by a guardian';
COMMENT ON COLUMN profiles.role_permissions IS 'JSON object containing role-specific permissions';

-- Update existing data to use new role names
-- Note: This is a safe migration that preserves existing functionality
UPDATE profiles SET federation_role = 'adult' WHERE federation_role = 'parent';
UPDATE profiles SET federation_role = 'offspring' WHERE federation_role = 'child';
UPDATE family_memberships SET member_role = 'adult' WHERE member_role = 'parent';
UPDATE family_memberships SET member_role = 'offspring' WHERE member_role = 'child';
UPDATE privacy_users SET federation_role = 'adult' WHERE federation_role = 'parent';
UPDATE privacy_users SET federation_role = 'offspring' WHERE federation_role = 'child'; 