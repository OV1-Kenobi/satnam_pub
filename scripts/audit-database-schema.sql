-- COMPREHENSIVE DATABASE SCHEMA AUDIT
-- Execute this in Supabase SQL Editor to get current database state
-- Author: Security Audit
-- Date: 2025-01-09

-- =====================================================
-- SECTION 1: CURRENT TABLES AND COLUMNS
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🔍 COMPREHENSIVE DATABASE SCHEMA AUDIT';
    RAISE NOTICE '==========================================';
    RAISE NOTICE '';
END $$;

-- List all tables in public schema
SELECT 
    'TABLE_INVENTORY' as audit_section,
    table_name,
    table_type,
    is_insertable_into,
    is_typed
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- List all columns for each table
SELECT 
    'COLUMN_INVENTORY' as audit_section,
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default,
    character_maximum_length,
    numeric_precision
FROM information_schema.columns 
WHERE table_schema = 'public' 
ORDER BY table_name, ordinal_position;

-- =====================================================
-- SECTION 2: CONSTRAINTS AND INDEXES
-- =====================================================

-- List all constraints
SELECT 
    'CONSTRAINT_INVENTORY' as audit_section,
    tc.table_name,
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
LEFT JOIN information_schema.constraint_column_usage ccu 
    ON tc.constraint_name = ccu.constraint_name
WHERE tc.table_schema = 'public'
ORDER BY tc.table_name, tc.constraint_type;

-- List all indexes
SELECT 
    'INDEX_INVENTORY' as audit_section,
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- =====================================================
-- SECTION 3: RLS POLICIES
-- =====================================================

-- List all RLS policies
SELECT 
    'RLS_POLICY_INVENTORY' as audit_section,
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Check RLS status for each table
SELECT 
    'RLS_STATUS' as audit_section,
    c.relname as table_name,
    c.relrowsecurity as rls_enabled,
    c.relforcerowsecurity as rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' 
AND c.relkind = 'r'
ORDER BY c.relname;

-- =====================================================
-- SECTION 4: FUNCTIONS AND PROCEDURES
-- =====================================================

-- List all functions/procedures
SELECT 
    'FUNCTION_INVENTORY' as audit_section,
    routine_name,
    routine_type,
    data_type as return_type,
    security_type,
    is_deterministic
FROM information_schema.routines 
WHERE routine_schema = 'public'
ORDER BY routine_name;

-- =====================================================
-- SECTION 5: VIEWS
-- =====================================================

-- List all views
SELECT 
    'VIEW_INVENTORY' as audit_section,
    table_name as view_name,
    view_definition
FROM information_schema.views 
WHERE table_schema = 'public'
ORDER BY table_name;

-- =====================================================
-- SECTION 6: GRANTS AND PERMISSIONS
-- =====================================================

-- List table permissions
SELECT 
    'PERMISSION_INVENTORY' as audit_section,
    table_name,
    grantee,
    privilege_type,
    is_grantable
FROM information_schema.table_privileges 
WHERE table_schema = 'public'
AND grantee IN ('anon', 'authenticated', 'service_role')
ORDER BY table_name, grantee, privilege_type;

-- =====================================================
-- SECTION 7: CRITICAL TABLE DATA SAMPLES
-- =====================================================

-- Check if critical tables have data
DO $$
DECLARE
    table_record RECORD;
    row_count INTEGER;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '📊 TABLE DATA SUMMARY:';
    RAISE NOTICE '';
    
    FOR table_record IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        ORDER BY table_name
    LOOP
        EXECUTE format('SELECT COUNT(*) FROM %I', table_record.table_name) INTO row_count;
        RAISE NOTICE '  • %: % rows', table_record.table_name, row_count;
    END LOOP;
    
    RAISE NOTICE '';
END $$;

-- =====================================================
-- SECTION 8: SECURITY ANALYSIS
-- =====================================================

DO $$
DECLARE
    security_definer_count INTEGER;
    unprotected_table_count INTEGER;
BEGIN
    -- Check for SECURITY DEFINER functions (potential security risk)
    SELECT COUNT(*) INTO security_definer_count
    FROM information_schema.routines 
    WHERE routine_schema = 'public'
    AND security_type = 'DEFINER';
    
    -- Check for tables without RLS
    SELECT COUNT(*) INTO unprotected_table_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' 
    AND c.relkind = 'r'
    AND NOT c.relrowsecurity;
    
    RAISE NOTICE '';
    RAISE NOTICE '🔒 SECURITY ANALYSIS:';
    RAISE NOTICE '  • SECURITY DEFINER functions: %', security_definer_count;
    RAISE NOTICE '  • Tables without RLS: %', unprotected_table_count;
    
    IF security_definer_count > 0 THEN
        RAISE NOTICE '  ⚠️  SECURITY DEFINER functions detected - review required';
    END IF;
    
    IF unprotected_table_count > 0 THEN
        RAISE NOTICE '  ⚠️  Tables without RLS detected - security risk';
    END IF;
    
    RAISE NOTICE '';
END $$;

-- =====================================================
-- SECTION 9: AUDIT COMPLETION
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '✅ DATABASE SCHEMA AUDIT COMPLETE';
    RAISE NOTICE '';
    RAISE NOTICE '📋 NEXT STEPS:';
    RAISE NOTICE '  1. Review the audit results above';
    RAISE NOTICE '  2. Compare against codebase expectations';
    RAISE NOTICE '  3. Identify missing tables/policies';
    RAISE NOTICE '  4. Execute required migrations manually';
    RAISE NOTICE '';
END $$;
