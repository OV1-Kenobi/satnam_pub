-- =====================================================
-- DATABASE STATE DIAGNOSTIC SCRIPT
-- Check what tables and columns currently exist
-- Returns actual result sets instead of NOTICE messages
-- =====================================================

-- 1. Check what tables exist in the public schema
SELECT
    '🔍 CURRENT TABLES IN PUBLIC SCHEMA' as diagnostic_section,
    table_name,
    table_type,
    'EXISTS' as status
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- 2. Check specific expected tables
SELECT
    '🎯 EXPECTED TABLES STATUS' as diagnostic_section,
    expected_table,
    CASE
        WHEN EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = expected_table
        ) THEN '✅ EXISTS'
        ELSE '❌ MISSING'
    END as status
FROM (
    VALUES
        ('user_identities'),
        ('profiles'),
        ('privacy_users'),
        ('nip05_records')
) AS t(expected_table)
ORDER BY expected_table;

-- 3. Check user_identities table structure (if it exists)
SELECT
    '📋 USER_IDENTITIES TABLE STRUCTURE' as diagnostic_section,
    column_name,
    data_type,
    is_nullable,
    COALESCE(column_default, 'none') as column_default,
    ordinal_position
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'user_identities'
ORDER BY ordinal_position;

-- 4. Check profiles table structure (if it exists)
SELECT
    '📋 PROFILES TABLE STRUCTURE' as diagnostic_section,
    column_name,
    data_type,
    is_nullable,
    ordinal_position
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'profiles'
ORDER BY ordinal_position;

-- 5. Check privacy_users table structure (if it exists)
SELECT
    '📋 PRIVACY_USERS TABLE STRUCTURE' as diagnostic_section,
    column_name,
    data_type,
    is_nullable,
    ordinal_position
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'privacy_users'
ORDER BY ordinal_position;

-- 6. Summary and recommendations
SELECT
    '🎯 SUMMARY AND RECOMMENDATIONS' as diagnostic_section,
    'user_identities' as table_name,
    CASE
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_identities')
        THEN '✅ EXISTS - Run unified-user-table-migration.sql to enhance'
        ELSE '❌ MISSING - Run unified-user-table-migration.sql to create'
    END as recommendation

UNION ALL

SELECT
    '📋 NEXT STEPS' as diagnostic_section,
    'Step 1' as table_name,
    'Run database/unified-user-table-migration.sql' as recommendation

UNION ALL

SELECT
    '📋 NEXT STEPS' as diagnostic_section,
    'Step 2' as table_name,
    'Run database/unified-user-rls-policies.sql' as recommendation

UNION ALL

SELECT
    '📋 NEXT STEPS' as diagnostic_section,
    'Step 3' as table_name,
    'Test identity registration' as recommendation;
