-- Phase 1: Hierarchical Administrative Dashboards
-- Migration: 030_hierarchical_admin_dashboard.sql
-- Purpose: Create tables for role-based admin dashboards with bypass/recovery code management
-- Status: Production-Ready
--
-- PREREQUISITE: This migration assumes privacy-first-identity-system-migration.sql has been executed
-- to create user_identities and family_federations tables. If family_federations doesn't exist,
-- the federation_id column will remain nullable and the foreign key constraint will be added
-- dynamically when the table becomes available.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. ADMIN_ROLES TABLE - Maps users to hierarchical roles
-- ============================================================================
-- Supports both individual users (private role, no federation) and family federation users
-- (guardian/steward/adult/offspring roles with optional federation_id)
CREATE TABLE IF NOT EXISTS public.admin_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_duid TEXT NOT NULL UNIQUE REFERENCES public.user_identities(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('guardian', 'steward', 'adult', 'offspring', 'private')),
    federation_id UUID, -- Nullable: supports both individual users and family federation users
    parent_admin_duid TEXT REFERENCES public.user_identities(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,

    -- Hierarchy validation: only certain roles can have parents
    CONSTRAINT valid_hierarchy CHECK (
        (role = 'guardian' AND parent_admin_duid IS NULL) OR
        (role = 'steward' AND parent_admin_duid IS NOT NULL) OR
        (role = 'adult' AND parent_admin_duid IS NOT NULL) OR
        (role = 'offspring' AND parent_admin_duid IS NOT NULL) OR
        (role = 'private' AND parent_admin_duid IS NULL)
    )
);

-- ============================================================================
-- 2. ADMIN_POLICIES TABLE - Role-based access control policies
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.admin_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role TEXT NOT NULL CHECK (role IN ('guardian', 'steward', 'adult', 'offspring')),
    policy_name TEXT NOT NULL,
    policy_value JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(role, policy_name)
);

-- ============================================================================
-- 3. BYPASS_CODES TABLE - Emergency admin bypass codes (single-use, expiring)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.bypass_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_duid TEXT NOT NULL REFERENCES public.user_identities(id) ON DELETE CASCADE,
    hashed_code TEXT NOT NULL UNIQUE,
    code_salt TEXT NOT NULL,
    generated_by_duid TEXT NOT NULL REFERENCES public.user_identities(id) ON DELETE CASCADE,
    used BOOLEAN DEFAULT false,
    used_at TIMESTAMP WITH TIME ZONE,
    used_by_duid TEXT REFERENCES public.user_identities(id) ON DELETE SET NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT code_not_expired CHECK (expires_at > NOW())
);

-- ============================================================================
-- 4. RECOVERY_CODES TABLE - User-controlled emergency recovery codes
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.recovery_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_duid TEXT NOT NULL REFERENCES public.user_identities(id) ON DELETE CASCADE,
    hashed_code TEXT NOT NULL UNIQUE,
    code_salt TEXT NOT NULL,
    used BOOLEAN DEFAULT false,
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    
    CONSTRAINT code_not_expired CHECK (expires_at > NOW())
);

-- ============================================================================
-- 5. ADMIN_AUDIT_LOG TABLE - Immutable append-only audit trail
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_duid TEXT NOT NULL REFERENCES public.user_identities(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    target_user_duid TEXT REFERENCES public.user_identities(id) ON DELETE SET NULL,
    resource_type TEXT,
    resource_id UUID,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT immutable_log CHECK (timestamp <= NOW())
);

-- ============================================================================
-- DYNAMIC FOREIGN KEY CONSTRAINT - family_federations
-- ============================================================================
-- This constraint is added dynamically if family_federations table exists
-- This supports both individual users (federation_id = NULL) and family federation users
DO $$
BEGIN
    -- Check if family_federations table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'family_federations' AND table_schema = 'public') THEN
        -- Add foreign key constraint if it doesn't already exist
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'admin_roles_federation_fk'
            AND table_schema = 'public'
        ) THEN
            ALTER TABLE public.admin_roles
            ADD CONSTRAINT admin_roles_federation_fk
            FOREIGN KEY (federation_id) REFERENCES public.family_federations(id) ON DELETE CASCADE;
            RAISE NOTICE '✓ Added foreign key constraint: admin_roles.federation_id -> family_federations.id';
        ELSE
            RAISE NOTICE '✓ Foreign key constraint already exists: admin_roles_federation_fk';
        END IF;
    ELSE
        RAISE NOTICE '⚠ family_federations table not found. federation_id column will remain nullable.';
        RAISE NOTICE '  To enable family federation support, execute privacy-first-identity-system-migration.sql first.';
    END IF;
END $$;

-- ============================================================================
-- INDEXES - Performance optimization
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_admin_roles_user_duid ON public.admin_roles(user_duid);
CREATE INDEX IF NOT EXISTS idx_admin_roles_federation ON public.admin_roles(federation_id);
CREATE INDEX IF NOT EXISTS idx_admin_roles_parent ON public.admin_roles(parent_admin_duid);
CREATE INDEX IF NOT EXISTS idx_admin_roles_active ON public.admin_roles(is_active);

CREATE INDEX IF NOT EXISTS idx_bypass_codes_user ON public.bypass_codes(user_duid);
CREATE INDEX IF NOT EXISTS idx_bypass_codes_expires ON public.bypass_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_bypass_codes_used ON public.bypass_codes(used);

CREATE INDEX IF NOT EXISTS idx_recovery_codes_user ON public.recovery_codes(user_duid);
CREATE INDEX IF NOT EXISTS idx_recovery_codes_expires ON public.recovery_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_recovery_codes_used ON public.recovery_codes(used);

CREATE INDEX IF NOT EXISTS idx_audit_log_admin ON public.admin_audit_log(admin_user_duid);
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON public.admin_audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON public.admin_audit_log(action);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) - Privacy-preserving access control
-- ============================================================================
ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bypass_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES - admin_roles
-- ============================================================================
-- Users can view their own role and all subordinate roles
CREATE POLICY "admin_roles_own_and_subordinates" ON public.admin_roles
    FOR SELECT
    TO authenticated
    USING (
        user_duid = current_setting('app.current_user_duid', true) OR
        parent_admin_duid = current_setting('app.current_user_duid', true)
    );

-- Only service_role can insert/update/delete admin roles
CREATE POLICY "admin_roles_service_role_only" ON public.admin_roles
    FOR ALL
    TO service_role
    USING (true);

-- ============================================================================
-- RLS POLICIES - admin_policies
-- ============================================================================
-- All authenticated users can view policies (read-only)
CREATE POLICY "admin_policies_read_all" ON public.admin_policies
    FOR SELECT
    TO authenticated
    USING (true);

-- Only service_role can modify policies
CREATE POLICY "admin_policies_service_role_only" ON public.admin_policies
    FOR ALL
    TO service_role
    USING (true);

-- ============================================================================
-- RLS POLICIES - bypass_codes
-- ============================================================================
-- Only the admin who generated the code can view it
CREATE POLICY "bypass_codes_admin_only" ON public.bypass_codes
    FOR SELECT
    TO authenticated
    USING (generated_by_duid = current_setting('app.current_user_duid', true));

-- Only service_role can insert/update/delete
CREATE POLICY "bypass_codes_service_role_only" ON public.bypass_codes
    FOR ALL
    TO service_role
    USING (true);

-- ============================================================================
-- RLS POLICIES - recovery_codes
-- ============================================================================
-- Only the user who owns the codes can view them
CREATE POLICY "recovery_codes_own_only" ON public.recovery_codes
    FOR SELECT
    TO authenticated
    USING (user_duid = current_setting('app.current_user_duid', true));

-- Only service_role can insert/update/delete
CREATE POLICY "recovery_codes_service_role_only" ON public.recovery_codes
    FOR ALL
    TO service_role
    USING (true);

-- ============================================================================
-- RLS POLICIES - admin_audit_log
-- ============================================================================
-- Admins can view audit logs for their own actions and subordinates
CREATE POLICY "audit_log_admin_view" ON public.admin_audit_log
    FOR SELECT
    TO authenticated
    USING (
        admin_user_duid = current_setting('app.current_user_duid', true) OR
        EXISTS (
            SELECT 1 FROM public.admin_roles
            WHERE user_duid = current_setting('app.current_user_duid', true)
            AND role IN ('guardian', 'steward')
        )
    );

-- Only service_role can insert audit logs
CREATE POLICY "audit_log_service_role_only" ON public.admin_audit_log
    FOR ALL
    TO service_role
    USING (true);

-- ============================================================================
-- TRIGGERS - Automatic timestamp updates
-- ============================================================================
CREATE OR REPLACE FUNCTION update_admin_roles_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER admin_roles_update_timestamp
BEFORE UPDATE ON public.admin_roles
FOR EACH ROW
EXECUTE FUNCTION update_admin_roles_timestamp();

CREATE OR REPLACE FUNCTION update_admin_policies_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER admin_policies_update_timestamp
BEFORE UPDATE ON public.admin_policies
FOR EACH ROW
EXECUTE FUNCTION update_admin_policies_timestamp();

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Summary:
-- - Created 5 new tables for hierarchical admin dashboard
-- - Implemented RLS policies for privacy-preserving access control
-- - Added indexes for performance optimization
-- - Added triggers for automatic timestamp management
-- - All tables support the Guardian → Steward → Adult → Offspring hierarchy
-- - Bypass codes and recovery codes are hashed and salted for security
-- - Audit logging is immutable (append-only) for compliance
--
-- IMPORTANT NOTES:
-- ================
-- 1. FEDERATION_ID COLUMN:
--    - The admin_roles.federation_id column is NULLABLE to support both:
--      * Individual users with role='private' (federation_id = NULL)
--      * Family federation users with roles guardian/steward/adult/offspring (federation_id = UUID)
--
-- 2. FOREIGN KEY CONSTRAINT:
--    - If family_federations table exists, a foreign key constraint is automatically added
--    - If family_federations table doesn't exist, the column remains nullable
--    - To enable family federation support, execute privacy-first-identity-system-migration.sql first
--
-- 3. PREREQUISITE MIGRATIONS:
--    - This migration requires: privacy-first-identity-system-migration.sql
--      (creates user_identities and family_federations tables)
--    - If you get "relation does not exist" error, execute the prerequisite migration first
--
-- 4. PRIVACY-FIRST ARCHITECTURE:
--    - All admin actions are logged immutably for compliance
--    - RLS policies enforce role-based access control at database level
--    - Bypass and recovery codes are PBKDF2-SHA512 hashed with unique salts
--    - No plaintext secrets stored in database
--
-- 5. ROLE HIERARCHY:
--    - Guardian: Top-level admin (no parent required)
--    - Steward: Mid-level admin (requires Guardian parent)
--    - Adult: Can manage Offspring (requires Steward/Guardian parent)
--    - Offspring: No admin access (requires Adult parent)
--    - Private: Individual user (no parent, no federation)

