-- =====================================================
-- POST-MIGRATION VERIFICATION SCRIPT
-- Run this after the complete-identity-system-migration-fixed.sql
-- to verify everything was created successfully
-- =====================================================

-- Check if all required tables exist
SELECT 
    'Tables Check' as check_type,
    CASE 
        WHEN COUNT(*) = 7 THEN 'PASS ✓'
        ELSE 'FAIL ✗ - Missing tables'
    END as status,
    COUNT(*) as found_tables,
    7 as expected_tables
FROM information_schema.tables 
WHERE table_name IN (
    'nip05_records', 'profiles', 'families', 'nostr_backups', 
    'lightning_addresses', 'reward_redemptions', 'user_identities'
) 
AND table_schema = 'public';

-- Check if privacy_users has required columns
SELECT 
    'Privacy Users Columns' as check_type,
    CASE 
        WHEN COUNT(*) = 2 THEN 'PASS ✓'
        ELSE 'FAIL ✗ - Missing columns'
    END as status,
    COUNT(*) as found_columns,
    2 as expected_columns
FROM information_schema.columns 
WHERE table_name = 'privacy_users' 
AND column_name IN ('privacy_level', 'zero_knowledge_enabled');

-- Check if nip05_records has domain column
SELECT 
    'NIP05 Domain Column' as check_type,
    CASE 
        WHEN COUNT(*) = 1 THEN 'PASS ✓'
        ELSE 'FAIL ✗ - Domain column missing'
    END as status,
    COUNT(*) as found_columns,
    1 as expected_columns
FROM information_schema.columns 
WHERE table_name = 'nip05_records' 
AND column_name = 'domain';

-- Check if initial data was inserted
SELECT 
    'Initial NIP05 Data' as check_type,
    CASE 
        WHEN COUNT(*) >= 5 THEN 'PASS ✓'
        ELSE 'FAIL ✗ - Missing initial data'
    END as status,
    COUNT(*) as found_records,
    'At least 5' as expected_records
FROM nip05_records;

-- Check if families table has initial data
SELECT 
    'Initial Family Data' as check_type,
    CASE 
        WHEN COUNT(*) >= 1 THEN 'PASS ✓'
        ELSE 'FAIL ✗ - Missing family data'
    END as status,
    COUNT(*) as found_records,
    'At least 1' as expected_records
FROM families;

-- Check RLS is enabled on all tables
SELECT 
    'RLS Enabled Check' as check_type,
    CASE 
        WHEN COUNT(*) = 7 THEN 'PASS ✓'
        ELSE 'FAIL ✗ - RLS not enabled on all tables'
    END as status,
    COUNT(*) as tables_with_rls,
    7 as expected_tables
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relname IN (
    'nip05_records', 'profiles', 'families', 'nostr_backups', 
    'lightning_addresses', 'reward_redemptions', 'user_identities'
)
AND n.nspname = 'public'
AND c.relrowsecurity = true;

-- List all created tables with their column counts
SELECT 
    t.table_name,
    COUNT(c.column_name) as column_count,
    'Created successfully' as status
FROM information_schema.tables t
LEFT JOIN information_schema.columns c ON t.table_name = c.table_name
WHERE t.table_name IN (
    'nip05_records', 'profiles', 'families', 'nostr_backups', 
    'lightning_addresses', 'reward_redemptions', 'user_identities'
) 
AND t.table_schema = 'public'
GROUP BY t.table_name
ORDER BY t.table_name;

-- Check foreign key constraints
SELECT 
    'Foreign Key Constraints' as check_type,
    CASE 
        WHEN COUNT(*) >= 1 THEN 'PASS ✓'
        ELSE 'FAIL ✗ - Missing foreign keys'
    END as status,
    COUNT(*) as found_constraints,
    'At least 1' as expected_constraints
FROM information_schema.table_constraints 
WHERE constraint_type = 'FOREIGN KEY'
AND table_name IN (
    'nip05_records', 'profiles', 'families', 'nostr_backups', 
    'lightning_addresses', 'reward_redemptions', 'user_identities'
);

-- Final summary
SELECT 
    '=== MIGRATION VERIFICATION COMPLETE ===' as summary,
    CASE 
        WHEN (
            SELECT COUNT(*) FROM information_schema.tables 
            WHERE table_name IN (
                'nip05_records', 'profiles', 'families', 'nostr_backups', 
                'lightning_addresses', 'reward_redemptions', 'user_identities'
            ) AND table_schema = 'public'
        ) = 7 
        AND (
            SELECT COUNT(*) FROM information_schema.columns 
            WHERE table_name = 'privacy_users' 
            AND column_name IN ('privacy_level', 'zero_knowledge_enabled')
        ) = 2
        AND (
            SELECT COUNT(*) FROM nip05_records
        ) >= 5
        THEN '🎉 ALL CHECKS PASSED - READY FOR REGISTER-IDENTITY TESTING!'
        ELSE '⚠️ SOME CHECKS FAILED - REVIEW RESULTS ABOVE'
    END as result;
