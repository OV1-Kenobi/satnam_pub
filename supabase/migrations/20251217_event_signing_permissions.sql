-- ============================================================================
-- GRANULAR NOSTR EVENT SIGNING PERMISSIONS
-- Migration: 20251217_event_signing_permissions.sql
--
-- This migration implements the complete permission system for Federation
-- members to sign Nostr events using FROST threshold signatures.
--
-- Tables Created:
--   1. event_signing_permissions - Role-based permissions per federation
--   2. member_signing_overrides - Individual member permission overrides
--   3. signing_audit_log - Comprehensive audit trail
--   4. permission_time_windows - Time-based permission restrictions
--   5. federation_permission_delegations - Cross-federation delegation
--   6. federation_alliances - Multi-federation permission sharing
--   7. default_permission_templates - Template for seeding new federations
--
-- Tables Modified:
--   - frost_signing_sessions - Add permission tracking columns
--   - family_members - Add permission override tracking
--   - family_federations - Add offspring spending limits
--
-- SECURITY: All tables have RLS enabled with role-based policies
-- ============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- SECTION 1: CORE TABLES
-- ============================================================================

-- 1.1 Event Signing Permissions (Role-based, per federation)
CREATE TABLE IF NOT EXISTS event_signing_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    federation_id TEXT NOT NULL REFERENCES family_federations(federation_duid) ON DELETE CASCADE,

    -- Role and event type
    role TEXT NOT NULL CHECK (role IN ('private', 'offspring', 'adult', 'steward', 'guardian')),
    event_type TEXT NOT NULL,
    nostr_kind INTEGER,
    permission_category TEXT NOT NULL CHECK (permission_category IN (
        'content_posting', 'messaging', 'media_content', 'identity_management',
        'contact_management', 'privacy_settings', 'content_moderation',
        'key_management', 'financial_operations', 'member_management',
        'governance', 'engagement'
    )),

    -- Permission flags
    can_sign BOOLEAN NOT NULL DEFAULT false,
    requires_approval BOOLEAN NOT NULL DEFAULT true,
    approval_threshold INTEGER DEFAULT 1 CHECK (approval_threshold >= 1),
    approved_by_roles JSONB DEFAULT '["guardian"]'::jsonb,

    -- Constraints
    max_daily_count INTEGER CHECK (max_daily_count IS NULL OR max_daily_count > 0),
    content_restrictions JSONB DEFAULT '[]'::jsonb,
    allowed_tags JSONB DEFAULT '[]'::jsonb,

    -- Delegation
    can_delegate BOOLEAN NOT NULL DEFAULT false,
    delegatable_to_roles JSONB DEFAULT '[]'::jsonb,

    -- Audit
    created_by TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    UNIQUE(federation_id, role, event_type)
);

-- Add comment for documentation
COMMENT ON TABLE event_signing_permissions IS
'Stores role-based Nostr event signing permissions per federation. Each row defines what a specific role can sign and under what conditions.';

-- 1.2 Member Signing Overrides (Individual overrides on top of role permissions)
CREATE TABLE IF NOT EXISTS member_signing_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    federation_id TEXT NOT NULL REFERENCES family_federations(federation_duid) ON DELETE CASCADE,
    member_duid TEXT NOT NULL,

    -- Permission override
    event_type TEXT NOT NULL,
    can_sign BOOLEAN,              -- null = use role default
    requires_approval BOOLEAN,     -- null = use role default
    max_daily_count INTEGER,       -- null = use role default
    custom_approved_by_roles JSONB, -- null = use role default

    -- Validity period
    valid_from TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    valid_until TIMESTAMP WITH TIME ZONE,

    -- Audit
    granted_by TEXT NOT NULL,
    grant_reason TEXT,
    revoked_by TEXT,
    revoked_at TIMESTAMP WITH TIME ZONE,
    revoke_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    UNIQUE(federation_id, member_duid, event_type),
    CHECK (valid_until IS NULL OR valid_until > valid_from)
);

COMMENT ON TABLE member_signing_overrides IS
'Stores individual member permission overrides that take precedence over role-based permissions. Supports time-limited grants and revocation tracking.';

-- 1.3 Signing Audit Log (Comprehensive audit trail)
CREATE TABLE IF NOT EXISTS signing_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    federation_id TEXT NOT NULL,
    session_id TEXT, -- References frost_signing_sessions if applicable

    -- Actor
    member_duid TEXT NOT NULL,
    member_role TEXT NOT NULL,

    -- Event details
    event_type TEXT NOT NULL,
    nostr_kind INTEGER,
    event_hash TEXT,
    event_content_preview TEXT, -- First 100 chars for audit visibility

    -- Authorization
    permission_id UUID REFERENCES event_signing_permissions(id) ON DELETE SET NULL,
    override_id UUID REFERENCES member_signing_overrides(id) ON DELETE SET NULL,
    approval_required BOOLEAN NOT NULL DEFAULT false,
    approved_by JSONB DEFAULT '[]'::jsonb,
    delegation_id UUID REFERENCES federation_permission_delegations(id) ON DELETE SET NULL, -- If signed via cross-federation delegation

    -- Result
    status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'signed', 'failed', 'expired')),
    error_message TEXT,

    -- Timestamps
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,

    -- Indexing helper
    created_date DATE GENERATED ALWAYS AS (DATE(requested_at)) STORED
);

COMMENT ON TABLE signing_audit_log IS
'Immutable audit log of all signing operations. Records permission checks, approvals, and outcomes for security compliance.';



-- ============================================================================
-- SECTION 2: TIME-BASED AND ADVANCED PERMISSION TABLES
-- ============================================================================

-- 2.1 Permission Time Windows (Scheduled/Temporary permission restrictions)
CREATE TABLE IF NOT EXISTS permission_time_windows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    permission_id UUID REFERENCES event_signing_permissions(id) ON DELETE CASCADE,
    override_id UUID REFERENCES member_signing_overrides(id) ON DELETE CASCADE,

    -- Time window definition
    window_type TEXT NOT NULL CHECK (window_type IN ('scheduled', 'temporary_elevation', 'cooldown')),

    -- For scheduled windows (e.g., business hours)
    days_of_week INTEGER[] DEFAULT '{1,2,3,4,5}'::integer[],  -- 0=Sunday, 1=Monday, etc.
    start_time TIME,                                          -- e.g., '09:00:00'
    end_time TIME,                                            -- e.g., '17:00:00'
    timezone TEXT DEFAULT 'UTC',

    -- For temporary elevations
    elevation_start TIMESTAMP WITH TIME ZONE,
    elevation_end TIMESTAMP WITH TIME ZONE,
    elevated_permissions JSONB,  -- Override permissions during window

    -- For cooldown periods
    cooldown_minutes INTEGER CHECK (cooldown_minutes IS NULL OR cooldown_minutes > 0),
    last_used_at TIMESTAMP WITH TIME ZONE,

    -- Metadata
    description TEXT,
    created_by TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Ensure at least one FK is set
    CHECK (permission_id IS NOT NULL OR override_id IS NOT NULL),
    -- Validate time window consistency
    CHECK (
        (window_type = 'scheduled' AND start_time IS NOT NULL AND end_time IS NOT NULL) OR
        (window_type = 'temporary_elevation' AND elevation_start IS NOT NULL AND elevation_end IS NOT NULL) OR
        (window_type = 'cooldown' AND cooldown_minutes IS NOT NULL)
    )
);

COMMENT ON TABLE permission_time_windows IS
'Defines time-based restrictions on permissions: scheduled hours, temporary elevations, or cooldown periods between operations.';

-- 2.2 Federation Permission Delegations (Cross-federation permissions)
CREATE TABLE IF NOT EXISTS federation_permission_delegations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Source federation (grantor)
    source_federation_id TEXT NOT NULL REFERENCES family_federations(federation_duid) ON DELETE CASCADE,
    source_role TEXT NOT NULL CHECK (source_role IN ('steward', 'guardian')),

    -- Target federation (grantee) - for alliances
    target_federation_id TEXT REFERENCES family_federations(federation_duid) ON DELETE CASCADE,
    -- OR specific member in target federation
    target_member_duid TEXT,

    -- Delegated permissions
    delegated_event_types TEXT[] NOT NULL,
    can_sub_delegate BOOLEAN DEFAULT false,

    -- Constraints
    max_daily_uses INTEGER CHECK (max_daily_uses IS NULL OR max_daily_uses > 0),
    current_daily_uses INTEGER DEFAULT 0,
    uses_reset_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_DATE + INTERVAL '1 day'),
    requires_source_approval BOOLEAN DEFAULT true,

    -- Validity
    valid_from TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    valid_until TIMESTAMP WITH TIME ZONE,
    revoked_at TIMESTAMP WITH TIME ZONE,
    revoke_reason TEXT,

    -- Audit
    created_by TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- At least one target must be set
    CHECK (target_federation_id IS NOT NULL OR target_member_duid IS NOT NULL)
);

COMMENT ON TABLE federation_permission_delegations IS
'Enables cross-federation permission delegation. A guardian can delegate specific signing permissions to another federation or member.';

-- 2.3 Federation Alliances (Multi-federation permission sharing)
CREATE TABLE IF NOT EXISTS federation_alliances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alliance_name TEXT NOT NULL,
    alliance_description TEXT,

    -- Member federations (JSONB array of federation_duids)
    member_federations JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Shared permission categories
    shared_categories TEXT[] DEFAULT '{}'::text[],

    -- Governance
    requires_unanimous_approval BOOLEAN DEFAULT true,
    minimum_approval_count INTEGER DEFAULT 2 CHECK (minimum_approval_count >= 1),

    -- Inheritance settings
    inherits_permissions_from TEXT REFERENCES family_federations(federation_duid) ON DELETE SET NULL,
    inheritance_depth INTEGER DEFAULT 1 CHECK (inheritance_depth >= 0 AND inheritance_depth <= 3),

    -- Status
    status TEXT DEFAULT 'active' CHECK (status IN ('pending', 'active', 'suspended', 'dissolved')),

    -- Audit
    created_by TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE federation_alliances IS
'Defines alliances between federations for shared permission inheritance and collaborative governance.';

-- 2.4 Default Permission Templates (Used to seed new federations)
CREATE TABLE IF NOT EXISTS default_permission_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role TEXT NOT NULL CHECK (role IN ('private', 'offspring', 'adult', 'steward', 'guardian')),
    event_type TEXT NOT NULL,
    nostr_kind INTEGER,
    permission_category TEXT NOT NULL,
    can_sign BOOLEAN NOT NULL DEFAULT false,
    requires_approval BOOLEAN NOT NULL DEFAULT true,
    approved_by_roles JSONB DEFAULT '["guardian"]'::jsonb,
    max_daily_count INTEGER,
    can_delegate BOOLEAN NOT NULL DEFAULT false,

    UNIQUE(role, event_type)
);

COMMENT ON TABLE default_permission_templates IS
'Template permissions used to seed new federations. Guardians can customize after creation.';

-- ============================================================================
-- SECTION 3: MODIFICATIONS TO EXISTING TABLES
-- ============================================================================

-- 3.1 Add permission tracking to frost_signing_sessions
DO $$
BEGIN
    -- Add required_permissions column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'frost_signing_sessions' AND column_name = 'required_permissions'
    ) THEN
        ALTER TABLE frost_signing_sessions ADD COLUMN required_permissions JSONB DEFAULT '[]'::jsonb;
    END IF;

    -- Add permission_check_status column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'frost_signing_sessions' AND column_name = 'permission_check_status'
    ) THEN
        ALTER TABLE frost_signing_sessions ADD COLUMN permission_check_status TEXT DEFAULT 'pending';
    END IF;

    -- Add constraint if not exists (separate check to handle partial previous runs)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'frost_signing_sessions' AND constraint_name = 'chk_permission_status'
    ) THEN
        ALTER TABLE frost_signing_sessions ADD CONSTRAINT chk_permission_status
            CHECK (permission_check_status IN ('pending', 'approved', 'denied'));
    END IF;

    -- Add cross_federation_delegation_id column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'frost_signing_sessions' AND column_name = 'cross_federation_delegation_id'
    ) THEN
        ALTER TABLE frost_signing_sessions ADD COLUMN cross_federation_delegation_id UUID
            REFERENCES federation_permission_delegations(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 3.2 Add permission override tracking and parent-child relationship to family_members
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'family_members' AND column_name = 'signing_permissions_override'
    ) THEN
        ALTER TABLE family_members ADD COLUMN signing_permissions_override JSONB DEFAULT NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'family_members' AND column_name = 'permissions_last_updated'
    ) THEN
        ALTER TABLE family_members ADD COLUMN permissions_last_updated TIMESTAMP WITH TIME ZONE;
    END IF;

    -- Add parent-child relationship tracking for offspring members
    -- This column stores the user_duid of the parent/guardian responsible for this offspring
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'family_members' AND column_name = 'parent_member_duid'
    ) THEN
        ALTER TABLE family_members ADD COLUMN parent_member_duid TEXT DEFAULT NULL;
        -- Add comment for documentation
        COMMENT ON COLUMN family_members.parent_member_duid IS
            'For offspring role: the user_duid of the parent/guardian responsible for this member. Used for permission override authorization.';
    END IF;
END $$;

-- 3.3 Add offspring spending limits to family_federations
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'family_federations' AND column_name = 'offspring_spending_limits'
    ) THEN
        ALTER TABLE family_federations ADD COLUMN offspring_spending_limits JSONB DEFAULT '{
            "daily_limit_sats": 10000,
            "weekly_limit_sats": 50000,
            "monthly_limit_sats": 150000,
            "require_approval_above_sats": 5000,
            "allowed_payment_types": ["lightning", "ecash"]
        }'::jsonb;
    END IF;
END $$;


-- ============================================================================
-- SECTION 4: PERFORMANCE INDEXES
-- ============================================================================

-- Core permission lookups
CREATE INDEX IF NOT EXISTS idx_esp_federation_role ON event_signing_permissions(federation_id, role);
CREATE INDEX IF NOT EXISTS idx_esp_federation_event ON event_signing_permissions(federation_id, event_type);
CREATE INDEX IF NOT EXISTS idx_esp_category ON event_signing_permissions(permission_category);

-- Member override lookups
CREATE INDEX IF NOT EXISTS idx_mso_member ON member_signing_overrides(federation_id, member_duid);
CREATE INDEX IF NOT EXISTS idx_mso_event ON member_signing_overrides(event_type);
CREATE INDEX IF NOT EXISTS idx_mso_validity ON member_signing_overrides(valid_from, valid_until)
    WHERE revoked_at IS NULL;

-- Audit log queries (frequently filtered)
CREATE INDEX IF NOT EXISTS idx_sal_federation ON signing_audit_log(federation_id);
CREATE INDEX IF NOT EXISTS idx_sal_member ON signing_audit_log(member_duid);
CREATE INDEX IF NOT EXISTS idx_sal_status ON signing_audit_log(status);
CREATE INDEX IF NOT EXISTS idx_sal_date ON signing_audit_log(created_date);
CREATE INDEX IF NOT EXISTS idx_sal_pending ON signing_audit_log(federation_id, status)
    WHERE status = 'pending';

-- Time window lookups
CREATE INDEX IF NOT EXISTS idx_ptw_permission ON permission_time_windows(permission_id)
    WHERE permission_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ptw_override ON permission_time_windows(override_id)
    WHERE override_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ptw_type ON permission_time_windows(window_type);

-- Cross-federation delegation lookups
CREATE INDEX IF NOT EXISTS idx_fpd_source ON federation_permission_delegations(source_federation_id);
CREATE INDEX IF NOT EXISTS idx_fpd_target_fed ON federation_permission_delegations(target_federation_id)
    WHERE target_federation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fpd_target_member ON federation_permission_delegations(target_member_duid)
    WHERE target_member_duid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fpd_valid ON federation_permission_delegations(valid_from, valid_until)
    WHERE revoked_at IS NULL;

-- Alliance lookups
CREATE INDEX IF NOT EXISTS idx_fa_status ON federation_alliances(status);
CREATE INDEX IF NOT EXISTS idx_fa_inherits ON federation_alliances(inherits_permissions_from)
    WHERE inherits_permissions_from IS NOT NULL;


-- ============================================================================
-- SECTION 5: ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE event_signing_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_signing_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE signing_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE permission_time_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE federation_permission_delegations ENABLE ROW LEVEL SECURITY;
ALTER TABLE federation_alliances ENABLE ROW LEVEL SECURITY;
ALTER TABLE default_permission_templates ENABLE ROW LEVEL SECURITY;

-- ============================================
-- EVENT SIGNING PERMISSIONS TABLE POLICIES
-- ============================================

-- Members can read their own role's permissions in their federation
CREATE POLICY "esp_members_read_own" ON event_signing_permissions
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM family_members fm
        JOIN family_federations ff ON ff.id = fm.family_federation_id
        WHERE ff.federation_duid = event_signing_permissions.federation_id
        AND fm.user_duid = auth.uid()::text
        AND fm.family_role = event_signing_permissions.role
    )
);

-- Guardians can manage all permissions in their federation
CREATE POLICY "esp_guardians_manage" ON event_signing_permissions
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM family_members fm
        JOIN family_federations ff ON ff.id = fm.family_federation_id
        WHERE ff.federation_duid = event_signing_permissions.federation_id
        AND fm.user_duid = auth.uid()::text
        AND fm.family_role = 'guardian'
    )
);

-- Stewards can manage permissions for lower roles (offspring, adult)
CREATE POLICY "esp_stewards_manage_lower" ON event_signing_permissions
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM family_members fm
        JOIN family_federations ff ON ff.id = fm.family_federation_id
        WHERE ff.federation_duid = event_signing_permissions.federation_id
        AND fm.user_duid = auth.uid()::text
        AND fm.family_role = 'steward'
        AND event_signing_permissions.role IN ('private', 'offspring', 'adult')
    )
);

-- ============================================
-- MEMBER SIGNING OVERRIDES TABLE POLICIES
-- ============================================

-- Members can read their own overrides
CREATE POLICY "mso_members_read_own" ON member_signing_overrides
FOR SELECT USING (
    member_duid = auth.uid()::text
);

-- Guardians can manage all overrides in their federation
CREATE POLICY "mso_guardians_manage" ON member_signing_overrides
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM family_members fm
        JOIN family_federations ff ON ff.id = fm.family_federation_id
        WHERE ff.federation_duid = member_signing_overrides.federation_id
        AND fm.user_duid = auth.uid()::text
        AND fm.family_role = 'guardian'
    )
);

-- Stewards can manage overrides for lower-role members
CREATE POLICY "mso_stewards_manage_lower" ON member_signing_overrides
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM family_members fm
        JOIN family_federations ff ON ff.id = fm.family_federation_id
        JOIN family_members target_fm ON target_fm.user_duid = member_signing_overrides.member_duid
        WHERE ff.federation_duid = member_signing_overrides.federation_id
        AND fm.user_duid = auth.uid()::text
        AND fm.family_role = 'steward'
        AND target_fm.family_role IN ('private', 'offspring', 'adult')
    )
);

-- Adults can manage overrides for their offspring (parental control)
-- SECURITY: Requires verified parent-child relationship via parent_member_duid column
CREATE POLICY "mso_adults_manage_offspring" ON member_signing_overrides
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM family_members fm
        JOIN family_federations ff ON ff.id = fm.family_federation_id
        JOIN family_members child_fm ON child_fm.user_duid = member_signing_overrides.member_duid
        WHERE ff.federation_duid = member_signing_overrides.federation_id
        AND fm.user_duid = auth.uid()::text
        AND fm.family_role IN ('adult', 'steward', 'guardian')
        AND child_fm.family_role = 'offspring'
        -- Parent-child relationship verification: the offspring's parent_member_duid must match the current user
        AND (
            child_fm.parent_member_duid = auth.uid()::text
            -- Guardians and stewards can manage all offspring in the federation as fallback
            OR fm.family_role IN ('guardian', 'steward')
        )
    )
);

-- ============================================
-- SIGNING AUDIT LOG TABLE POLICIES
-- ============================================

-- Members can read their own audit logs
CREATE POLICY "sal_members_read_own" ON signing_audit_log
FOR SELECT USING (
    member_duid = auth.uid()::text
);

-- Stewards and Guardians can read all audit logs in their federation
CREATE POLICY "sal_managers_read_all" ON signing_audit_log
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM family_members fm
        JOIN family_federations ff ON ff.id = fm.family_federation_id
        WHERE ff.federation_duid = signing_audit_log.federation_id
        AND fm.user_duid = auth.uid()::text
        AND fm.family_role IN ('steward', 'guardian')
    )
);

-- System/service role can insert audit logs (no direct user inserts for integrity)
CREATE POLICY "sal_system_insert" ON signing_audit_log
FOR INSERT WITH CHECK (
    -- Only service role can insert audit logs to ensure integrity
    current_setting('role') = 'service_role'
);

-- Audit logs are immutable - no updates or deletes
-- (No UPDATE or DELETE policies = blocked)

-- ============================================
-- PERMISSION TIME WINDOWS TABLE POLICIES
-- ============================================

-- Members can read time windows for their permissions
CREATE POLICY "ptw_members_read" ON permission_time_windows
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM event_signing_permissions esp
        JOIN family_federations ff ON ff.federation_duid = esp.federation_id
        JOIN family_members fm ON fm.family_federation_id = ff.id
        WHERE esp.id = permission_time_windows.permission_id
        AND fm.user_duid = auth.uid()::text
        AND fm.family_role = esp.role
    )
    OR EXISTS (
        SELECT 1 FROM member_signing_overrides mso
        WHERE mso.id = permission_time_windows.override_id
        AND mso.member_duid = auth.uid()::text
    )
);

-- Guardians/Stewards can manage time windows for permissions they control
CREATE POLICY "ptw_managers_manage" ON permission_time_windows
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM event_signing_permissions esp
        JOIN family_federations ff ON ff.federation_duid = esp.federation_id
        JOIN family_members fm ON fm.family_federation_id = ff.id
        WHERE esp.id = permission_time_windows.permission_id
        AND fm.user_duid = auth.uid()::text
        AND fm.family_role IN ('guardian', 'steward')
    )
    OR EXISTS (
        SELECT 1 FROM member_signing_overrides mso
        JOIN family_federations ff ON ff.federation_duid = mso.federation_id
        JOIN family_members fm ON fm.family_federation_id = ff.id
        WHERE mso.id = permission_time_windows.override_id
        AND fm.user_duid = auth.uid()::text
        AND fm.family_role IN ('guardian', 'steward')
    )
);

-- ============================================
-- FEDERATION DELEGATIONS TABLE POLICIES
-- ============================================

-- Source federation guardians can manage delegations
CREATE POLICY "fpd_source_guardians_manage" ON federation_permission_delegations
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM family_members fm
        JOIN family_federations ff ON ff.id = fm.family_federation_id
        WHERE ff.federation_duid = federation_permission_delegations.source_federation_id
        AND fm.user_duid = auth.uid()::text
        AND fm.family_role = 'guardian'
    )
);

-- Target federation members can read delegations granted to them
CREATE POLICY "fpd_target_members_read" ON federation_permission_delegations
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM family_members fm
        JOIN family_federations ff ON ff.id = fm.family_federation_id
        WHERE ff.federation_duid = federation_permission_delegations.target_federation_id
        AND fm.user_duid = auth.uid()::text
    )
    OR federation_permission_delegations.target_member_duid = auth.uid()::text
);

-- ============================================
-- FEDERATION ALLIANCES TABLE POLICIES
-- ============================================

-- Alliance member federation guardians can read alliance details
CREATE POLICY "fa_members_read" ON federation_alliances
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM family_members fm
        JOIN family_federations ff ON ff.id = fm.family_federation_id
        WHERE fm.user_duid = auth.uid()::text
        AND fm.family_role = 'guardian'
        AND ff.federation_duid = ANY(
            SELECT jsonb_array_elements_text(federation_alliances.member_federations)
        )
    )
);

-- Only guardians of member federations can modify alliances
CREATE POLICY "fa_guardians_manage" ON federation_alliances
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM family_members fm
        JOIN family_federations ff ON ff.id = fm.family_federation_id
        WHERE fm.user_duid = auth.uid()::text
        AND fm.family_role = 'guardian'
        AND ff.federation_duid = ANY(
            SELECT jsonb_array_elements_text(federation_alliances.member_federations)
        )
    )
);

-- ============================================
-- DEFAULT PERMISSION TEMPLATES TABLE POLICIES
-- ============================================

-- All authenticated users can read templates (for UI display)
CREATE POLICY "dpt_authenticated_read" ON default_permission_templates
FOR SELECT USING (
    auth.uid() IS NOT NULL
);

-- Only service role can modify templates
CREATE POLICY "dpt_service_manage" ON default_permission_templates
FOR ALL USING (
    current_setting('role') = 'service_role'
);


-- ============================================================================
-- SECTION 6: TRIGGERS AND FUNCTIONS
-- ============================================================================

-- 6.1 Update timestamp trigger for event_signing_permissions
CREATE OR REPLACE FUNCTION update_esp_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_esp_update_timestamp ON event_signing_permissions;
CREATE TRIGGER trg_esp_update_timestamp
    BEFORE UPDATE ON event_signing_permissions
    FOR EACH ROW
    EXECUTE FUNCTION update_esp_timestamp();

-- 6.2 Update timestamp trigger for federation_alliances
DROP TRIGGER IF EXISTS trg_fa_update_timestamp ON federation_alliances;
CREATE TRIGGER trg_fa_update_timestamp
    BEFORE UPDATE ON federation_alliances
    FOR EACH ROW
    EXECUTE FUNCTION update_esp_timestamp();

-- 6.3 Seed default permissions for new federations
CREATE OR REPLACE FUNCTION seed_federation_permissions()
RETURNS TRIGGER AS $$
BEGIN
    -- Copy all templates to the new federation's permissions
    -- Use 'system' as created_by since family_federations doesn't have a created_by column
    INSERT INTO event_signing_permissions (
        federation_id, role, event_type, nostr_kind, permission_category,
        can_sign, requires_approval, approved_by_roles, max_daily_count, can_delegate,
        created_by
    )
    SELECT
        NEW.federation_duid,
        dpt.role,
        dpt.event_type,
        dpt.nostr_kind,
        dpt.permission_category,
        dpt.can_sign,
        dpt.requires_approval,
        dpt.approved_by_roles,
        dpt.max_daily_count,
        dpt.can_delegate,
        'system'  -- Default system creator for auto-seeded permissions
    FROM default_permission_templates dpt
    ON CONFLICT (federation_id, role, event_type) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on family_federations table
DROP TRIGGER IF EXISTS trg_seed_federation_permissions ON family_federations;
CREATE TRIGGER trg_seed_federation_permissions
    AFTER INSERT ON family_federations
    FOR EACH ROW
    EXECUTE FUNCTION seed_federation_permissions();

-- 6.4 Reset daily delegation uses at midnight
CREATE OR REPLACE FUNCTION reset_delegation_daily_uses()
RETURNS TRIGGER AS $$
BEGIN
    -- Reset if the reset time has passed
    IF NEW.uses_reset_at <= NOW() THEN
        NEW.current_daily_uses = 0;
        NEW.uses_reset_at = (CURRENT_DATE + INTERVAL '1 day')::timestamp with time zone;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reset_delegation_uses ON federation_permission_delegations;
CREATE TRIGGER trg_reset_delegation_uses
    BEFORE UPDATE ON federation_permission_delegations
    FOR EACH ROW
    EXECUTE FUNCTION reset_delegation_daily_uses();

-- 6.4b Function to check and reset daily uses when reading delegations
-- NOTE: The trigger above only fires on UPDATE. This function should be called
-- by the application when reading delegations, or alternatively set up a pg_cron job:
--   SELECT cron.schedule('reset-delegation-daily-uses', '0 0 * * *',
--       $$UPDATE federation_permission_delegations SET current_daily_uses = 0, uses_reset_at = (CURRENT_DATE + INTERVAL '1 day') WHERE uses_reset_at <= NOW()$$);
CREATE OR REPLACE FUNCTION check_and_reset_delegation_uses(p_delegation_id UUID)
RETURNS TABLE (
    current_uses INTEGER,
    max_uses INTEGER,
    was_reset BOOLEAN
) AS $$
DECLARE
    v_was_reset BOOLEAN := FALSE;
BEGIN
    -- Check if reset is needed and perform it
    UPDATE federation_permission_delegations
    SET current_daily_uses = 0,
        uses_reset_at = (CURRENT_DATE + INTERVAL '1 day')::timestamp with time zone
    WHERE id = p_delegation_id
    AND uses_reset_at <= NOW()
    RETURNING TRUE INTO v_was_reset;

    -- Return current state
    RETURN QUERY
    SELECT
        fpd.current_daily_uses::INTEGER,
        fpd.max_daily_uses::INTEGER,
        COALESCE(v_was_reset, FALSE)
    FROM federation_permission_delegations fpd
    WHERE fpd.id = p_delegation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6.5 Audit log immutability enforcement
-- Allow specific field updates (status, approved_by, completed_at, error_message, event_hash)
-- but prevent modification of core audit data (federation_id, member_duid, event_type, etc.)
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
    -- Allow updates to workflow fields only
    IF TG_OP = 'UPDATE' THEN
        -- Check if immutable fields are being modified
        IF OLD.federation_id IS DISTINCT FROM NEW.federation_id OR
           OLD.session_id IS DISTINCT FROM NEW.session_id OR
           OLD.member_duid IS DISTINCT FROM NEW.member_duid OR
           OLD.member_role IS DISTINCT FROM NEW.member_role OR
           OLD.event_type IS DISTINCT FROM NEW.event_type OR
           OLD.nostr_kind IS DISTINCT FROM NEW.nostr_kind OR
           OLD.event_content_preview IS DISTINCT FROM NEW.event_content_preview OR
           OLD.permission_id IS DISTINCT FROM NEW.permission_id OR
           OLD.override_id IS DISTINCT FROM NEW.override_id OR
           OLD.approval_required IS DISTINCT FROM NEW.approval_required OR
           OLD.delegation_id IS DISTINCT FROM NEW.delegation_id OR
           OLD.requested_at IS DISTINCT FROM NEW.requested_at THEN
            RAISE EXCEPTION 'Cannot modify immutable audit log fields';
        END IF;
        -- Allow the update for mutable workflow fields
        RETURN NEW;
    END IF;
    -- Block all deletes
    RAISE EXCEPTION 'Signing audit logs cannot be deleted';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_audit_update ON signing_audit_log;
CREATE TRIGGER trg_prevent_audit_update
    BEFORE UPDATE ON signing_audit_log
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_modification();

DROP TRIGGER IF EXISTS trg_prevent_audit_delete ON signing_audit_log;
CREATE TRIGGER trg_prevent_audit_delete
    BEFORE DELETE ON signing_audit_log
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_modification();

-- 6.6 Atomic approver append function
-- Prevents race conditions when multiple approvers approve concurrently
CREATE OR REPLACE FUNCTION append_audit_approver(
    p_audit_id UUID,
    p_approver TEXT
) RETURNS VOID AS $$
BEGIN
    UPDATE signing_audit_log
    SET approved_by = CASE
        WHEN p_approver = ANY(approved_by) THEN approved_by
        ELSE array_append(COALESCE(approved_by, ARRAY[]::TEXT[]), p_approver)
    END
    WHERE id = p_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION append_audit_approver(UUID, TEXT) TO authenticated;


-- ============================================================================
-- SECTION 7: DEFAULT PERMISSION TEMPLATE SEED DATA
-- Based on Event Type Registry from planning document
-- ============================================================================

-- Only seed if table is empty (preserve customizations made after initial deployment)
-- Uses INSERT ... ON CONFLICT DO NOTHING to be safe if templates already exist
INSERT INTO default_permission_templates (role, event_type, nostr_kind, permission_category, can_sign, requires_approval, approved_by_roles, max_daily_count, can_delegate)
SELECT v.role, v.event_type, v.nostr_kind, v.permission_category, v.can_sign, v.requires_approval, v.approved_by_roles::jsonb, v.max_daily_count, v.can_delegate
FROM (VALUES
-- GUARDIAN permissions (highest access)
-- First row has explicit casts to define column types
('guardian'::TEXT, 'profile_update'::TEXT, 0::INTEGER, 'identity_management'::TEXT, true::BOOLEAN, false::BOOLEAN, '["guardian"]'::TEXT, NULL::INTEGER, true::BOOLEAN),
('guardian', 'short_note', 1, 'content_posting', true, false, '["guardian"]', NULL, true),
('guardian', 'contact_list_update', 3, 'contact_management', true, false, '["guardian"]', NULL, true),
('guardian', 'encrypted_dm', 4, 'messaging', true, false, '["guardian"]', NULL, true),
('guardian', 'event_deletion', 5, 'content_moderation', true, false, '["guardian"]', NULL, true),
('guardian', 'repost', 6, 'engagement', true, false, '["guardian"]', NULL, true),
('guardian', 'reaction', 7, 'engagement', true, false, '["guardian"]', NULL, true),
('guardian', 'mute_list_update', 10, 'privacy_settings', true, false, '["guardian"]', NULL, true),
('guardian', 'gift_wrapped_dm', 1059, 'messaging', true, false, '["guardian"]', NULL, true),
('guardian', 'long_form_article', 30023, 'content_posting', true, false, '["guardian"]', NULL, true),
('guardian', 'whitelist_event', 1776, 'key_management', true, false, '["guardian"]', NULL, false),
('guardian', 'family_transaction', NULL, 'financial_operations', true, false, '["guardian"]', NULL, false),
('guardian', 'member_removal', NULL, 'member_management', true, false, '["guardian"]', NULL, false),
('guardian', 'federation_settings', NULL, 'governance', true, false, '["guardian"]', NULL, false),
('guardian', 'emergency_action', NULL, 'governance', true, false, '["guardian"]', NULL, false),
('guardian', 'cross_fed_delegation', NULL, 'governance', true, true, '["guardian"]', NULL, false),
('guardian', 'alliance_action', NULL, 'governance', true, true, '["guardian"]', NULL, false),

-- STEWARD permissions (second highest)
('steward', 'profile_update', 0, 'identity_management', true, false, '["guardian"]', NULL, false),
('steward', 'short_note', 1, 'content_posting', true, false, '["guardian"]', NULL, false),
('steward', 'contact_list_update', 3, 'contact_management', true, false, '["guardian"]', NULL, false),
('steward', 'encrypted_dm', 4, 'messaging', true, false, '["guardian"]', NULL, false),
('steward', 'event_deletion', 5, 'content_moderation', true, true, '["guardian"]', NULL, false),
('steward', 'repost', 6, 'engagement', true, false, '["guardian"]', NULL, false),
('steward', 'reaction', 7, 'engagement', true, false, '["guardian"]', NULL, false),
('steward', 'mute_list_update', 10, 'privacy_settings', true, false, '["guardian"]', NULL, false),
('steward', 'gift_wrapped_dm', 1059, 'messaging', true, false, '["guardian"]', NULL, false),
('steward', 'long_form_article', 30023, 'content_posting', true, false, '["guardian"]', NULL, false),
('steward', 'financial_report', 30023, 'financial_operations', true, true, '["guardian"]', NULL, false),
('steward', 'role_change', NULL, 'governance', true, true, '["guardian"]', NULL, false),
('steward', 'spending_approval', NULL, 'financial_operations', true, true, '["guardian"]', 10, false),

-- ADULT permissions (standard access)
('adult', 'short_note', 1, 'content_posting', true, true, '["steward", "guardian"]', 50, false),
('adult', 'contact_list_update', 3, 'contact_management', true, false, '["guardian"]', NULL, false),
('adult', 'encrypted_dm', 4, 'messaging', true, false, '["guardian"]', NULL, false),
('adult', 'event_deletion', 5, 'content_moderation', true, true, '["steward", "guardian"]', 10, false),
('adult', 'repost', 6, 'engagement', true, false, '["guardian"]', 100, false),
('adult', 'reaction', 7, 'engagement', true, false, '["guardian"]', 200, false),
('adult', 'mute_list_update', 10, 'privacy_settings', true, false, '["guardian"]', NULL, false),
('adult', 'gift_wrapped_dm', 1059, 'messaging', true, false, '["guardian"]', NULL, false),
('adult', 'long_form_article', 30023, 'content_posting', true, true, '["steward", "guardian"]', 5, false),
('adult', 'member_invitation', NULL, 'member_management', true, true, '["guardian"]', 3, false),

-- OFFSPRING permissions (restricted access, requires parental approval)
('offspring', 'encrypted_dm', 4, 'messaging', true, false, '["adult", "steward", "guardian"]', 50, false),
('offspring', 'gift_wrapped_dm', 1059, 'messaging', true, false, '["adult", "steward", "guardian"]', 50, false),
('offspring', 'reaction', 7, 'engagement', true, false, '["adult", "steward", "guardian"]', 100, false),
('offspring', 'offspring_payment', NULL, 'financial_operations', true, true, '["adult", "steward", "guardian"]', 5, false),
('offspring', 'family_video', NULL, 'media_content', true, true, '["adult", "steward", "guardian"]', 3, false),
('offspring', 'family_audio', NULL, 'media_content', true, true, '["adult", "steward", "guardian"]', 5, false),

-- PRIVATE (solo users without federation) - full self-custody
('private', 'profile_update', 0, 'identity_management', true, false, '[]', NULL, false),
('private', 'short_note', 1, 'content_posting', true, false, '[]', NULL, false),
('private', 'contact_list_update', 3, 'contact_management', true, false, '[]', NULL, false),
('private', 'encrypted_dm', 4, 'messaging', true, false, '[]', NULL, false),
('private', 'event_deletion', 5, 'content_moderation', true, false, '[]', NULL, false),
('private', 'repost', 6, 'engagement', true, false, '[]', NULL, false),
('private', 'reaction', 7, 'engagement', true, false, '[]', NULL, false),
('private', 'mute_list_update', 10, 'privacy_settings', true, false, '[]', NULL, false),
('private', 'gift_wrapped_dm', 1059, 'messaging', true, false, '[]', NULL, false),
('private', 'long_form_article', 30023, 'content_posting', true, false, '[]', NULL, false)
) AS v(role, event_type, nostr_kind, permission_category, can_sign, requires_approval, approved_by_roles, max_daily_count, can_delegate)
WHERE NOT EXISTS (SELECT 1 FROM default_permission_templates LIMIT 1)
ON CONFLICT (role, event_type) DO NOTHING;

-- ============================================================================
-- SECTION 8: FINAL VALIDATION
-- ============================================================================

-- Verify all tables exist
DO $$
DECLARE
    missing_tables TEXT := '';
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'event_signing_permissions') THEN
        missing_tables := missing_tables || 'event_signing_permissions, ';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'member_signing_overrides') THEN
        missing_tables := missing_tables || 'member_signing_overrides, ';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'signing_audit_log') THEN
        missing_tables := missing_tables || 'signing_audit_log, ';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'permission_time_windows') THEN
        missing_tables := missing_tables || 'permission_time_windows, ';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'federation_permission_delegations') THEN
        missing_tables := missing_tables || 'federation_permission_delegations, ';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'federation_alliances') THEN
        missing_tables := missing_tables || 'federation_alliances, ';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'default_permission_templates') THEN
        missing_tables := missing_tables || 'default_permission_templates, ';
    END IF;

    IF missing_tables != '' THEN
        RAISE EXCEPTION 'Missing tables: %', missing_tables;
    END IF;

    RAISE NOTICE 'All event signing permission tables created successfully.';
END $$;

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE '=================================================';
    RAISE NOTICE 'Migration 20251217_event_signing_permissions.sql';
    RAISE NOTICE 'Completed successfully at %', NOW();
    RAISE NOTICE '=================================================';
END $$;
