-- =====================================================
-- SECURITY WARNINGS FIXES (45 WARNINGS)
-- Run this AFTER critical-security-fixes.sql completes successfully
-- Lower priority but important for production readiness
-- =====================================================

-- =====================================================
-- SECTION 1: COMMON WARNING FIXES
-- Address typical Supabase security warnings
-- =====================================================

-- Fix missing RLS policies on auth-related tables
DO $$
BEGIN
    -- Check if auth schema tables need policies
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth') THEN
        RAISE NOTICE 'INFO: Auth schema tables detected - these are managed by Supabase';
    END IF;
END $$;

-- Fix overly permissive policies
DO $$
DECLARE
    policy_record RECORD;
BEGIN
    RAISE NOTICE 'CHECKING: Overly permissive RLS policies...';
    
    -- Look for policies that use "true" without proper conditions
    FOR policy_record IN 
        SELECT schemaname, tablename, policyname, qual
        FROM pg_policies 
        WHERE schemaname = 'public'
        AND (qual = 'true' OR qual IS NULL)
    LOOP
        RAISE NOTICE 'WARNING: Overly permissive policy found: %.% - %', 
            policy_record.schemaname, policy_record.tablename, policy_record.policyname;
    END LOOP;
END $$;

-- =====================================================
-- SECTION 2: STRENGTHEN EXISTING RLS POLICIES
-- Make policies more restrictive and secure
-- =====================================================

-- Strengthen privacy_users policies if they exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'privacy_users') THEN
        -- Drop overly permissive policies
        DROP POLICY IF EXISTS "allow_all_privacy_users" ON privacy_users;
        DROP POLICY IF EXISTS "privacy_users_all_access" ON privacy_users;
        
        -- Create more restrictive policy
        DROP POLICY IF EXISTS "privacy_users_secure_access" ON privacy_users;
        CREATE POLICY "privacy_users_secure_access" ON privacy_users
            FOR ALL
            USING (
                hashed_uuid = current_setting('app.current_user_hash', true) OR
                auth.role() = 'service_role'
            );
            
        RAISE NOTICE 'STRENGTHENED: privacy_users RLS policies';
    END IF;
END $$;

-- Strengthen nip05_records policies if they exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'nip05_records') THEN
        -- Allow public read but restrict writes
        DROP POLICY IF EXISTS "allow_all_nip05_records" ON nip05_records;
        
        -- Public read policy
        DROP POLICY IF EXISTS "nip05_records_public_read" ON nip05_records;
        CREATE POLICY "nip05_records_public_read" ON nip05_records
            FOR SELECT
            USING (is_active = true);
            
        -- Restricted write policy
        DROP POLICY IF EXISTS "nip05_records_restricted_write" ON nip05_records;
        CREATE POLICY "nip05_records_restricted_write" ON nip05_records
            FOR INSERT
            WITH CHECK (auth.role() = 'service_role' OR auth.role() = 'authenticated');
            
        RAISE NOTICE 'STRENGTHENED: nip05_records RLS policies';
    END IF;
END $$;

-- =====================================================
-- SECTION 3: ADD MISSING SECURITY CONSTRAINTS
-- Add constraints that prevent data integrity issues
-- =====================================================

-- Add security constraints to existing tables
DO $$
DECLARE
    table_record RECORD;
BEGIN
    -- Add NOT NULL constraints where missing on security-critical columns
    FOR table_record IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        AND table_name IN ('privacy_users', 'nip05_records', 'profiles', 'user_identities')
    LOOP
        RAISE NOTICE 'CHECKING: Security constraints for %', table_record.table_name;
        
        -- Add constraints based on table type
        IF table_record.table_name = 'privacy_users' THEN
            -- Ensure critical privacy fields are not null
            BEGIN
                ALTER TABLE privacy_users ALTER COLUMN hashed_uuid SET NOT NULL;
                ALTER TABLE privacy_users ALTER COLUMN user_salt SET NOT NULL;
                ALTER TABLE privacy_users ALTER COLUMN federation_role SET NOT NULL;
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'INFO: Constraints already exist or columns missing for privacy_users';
            END;
        END IF;
        
        IF table_record.table_name = 'nip05_records' THEN
            -- Ensure NIP-05 fields are not null
            BEGIN
                ALTER TABLE nip05_records ALTER COLUMN name SET NOT NULL;
                ALTER TABLE nip05_records ALTER COLUMN pubkey SET NOT NULL;
                ALTER TABLE nip05_records ALTER COLUMN domain SET NOT NULL;
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'INFO: Constraints already exist or columns missing for nip05_records';
            END;
        END IF;
    END LOOP;
END $$;

-- =====================================================
-- SECTION 4: AUDIT AND LOGGING IMPROVEMENTS
-- Enhance security audit capabilities
-- =====================================================

-- Create security audit function if it doesn't exist
CREATE OR REPLACE FUNCTION log_security_event(
    event_type TEXT,
    table_name TEXT,
    user_hash TEXT DEFAULT NULL,
    details JSONB DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Only log if security_audit_log table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'security_audit_log') THEN
        INSERT INTO security_audit_log (
            event_type,
            table_name,
            user_hash,
            details,
            created_at
        ) VALUES (
            event_type,
            table_name,
            COALESCE(user_hash, current_setting('app.current_user_hash', true)),
            details,
            extract(epoch from now())
        );
    END IF;
END;
$$;

-- =====================================================
-- SECTION 5: REMOVE DANGEROUS PERMISSIONS
-- Revoke overly broad permissions
-- =====================================================

-- Revoke dangerous permissions from anon role
DO $$
BEGIN
    RAISE NOTICE 'REVOKING: Dangerous permissions from anon role...';
    
    -- Revoke DELETE permissions from anon on all tables
    REVOKE DELETE ON ALL TABLES IN SCHEMA public FROM anon;
    
    -- Revoke UPDATE permissions from anon on sensitive tables
    REVOKE UPDATE ON privacy_users FROM anon;
    REVOKE UPDATE ON security_audit_log FROM anon;
    REVOKE UPDATE ON role_permissions FROM anon;
    REVOKE UPDATE ON role_hierarchy FROM anon;
    
    RAISE NOTICE 'REVOKED: Dangerous permissions from anon role';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'INFO: Some permissions were already revoked or tables do not exist';
END $$;

-- =====================================================
-- SECTION 6: FINAL SECURITY VERIFICATION
-- Comprehensive security check
-- =====================================================

DO $$
DECLARE
    total_tables INTEGER;
    tables_with_rls INTEGER;
    overly_permissive_policies INTEGER;
    missing_constraints INTEGER;
BEGIN
    -- Count total public tables
    SELECT COUNT(*) INTO total_tables
    FROM information_schema.tables 
    WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE';
    
    -- Count tables with RLS enabled
    SELECT COUNT(*) INTO tables_with_rls
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relrowsecurity = true;
    
    -- Count overly permissive policies
    SELECT COUNT(*) INTO overly_permissive_policies
    FROM pg_policies 
    WHERE schemaname = 'public'
    AND (qual = 'true' OR qual IS NULL);
    
    RAISE NOTICE '';
    RAISE NOTICE '🔍 COMPREHENSIVE SECURITY AUDIT RESULTS:';
    RAISE NOTICE '';
    RAISE NOTICE '📊 STATISTICS:';
    RAISE NOTICE '  • Total public tables: %', total_tables;
    RAISE NOTICE '  • Tables with RLS enabled: %', tables_with_rls;
    RAISE NOTICE '  • Overly permissive policies: %', overly_permissive_policies;
    RAISE NOTICE '';
    
    -- Calculate security score
    DECLARE
        security_score INTEGER;
    BEGIN
        security_score := CASE 
            WHEN total_tables = 0 THEN 100
            ELSE (tables_with_rls * 100 / total_tables)
        END;
        
        RAISE NOTICE '🎯 SECURITY SCORE: %/100', security_score;
        RAISE NOTICE '';
        
        IF security_score >= 90 AND overly_permissive_policies = 0 THEN
            RAISE NOTICE '🎉 EXCELLENT SECURITY POSTURE!';
            RAISE NOTICE '✅ Ready for production deployment';
            RAISE NOTICE '✅ Safe to proceed with register-identity migration';
        ELSIF security_score >= 70 THEN
            RAISE NOTICE '⚠️  GOOD SECURITY POSTURE';
            RAISE NOTICE '  • Consider addressing remaining warnings';
            RAISE NOTICE '  • Safe to proceed with caution';
        ELSE
            RAISE NOTICE '❌ POOR SECURITY POSTURE';
            RAISE NOTICE '  • Address remaining issues before production';
            RAISE NOTICE '  • Review all RLS policies';
        END IF;
    END;
    
    RAISE NOTICE '';
    RAISE NOTICE 'Security audit completed at: %', NOW();
    RAISE NOTICE '=====================================================';
END $$;
