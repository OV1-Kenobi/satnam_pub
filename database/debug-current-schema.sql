-- =====================================================
-- DATABASE SCHEMA DIAGNOSTIC QUERIES
-- Run these queries FIRST to understand your current database state
-- =====================================================

-- 1. Check if privacy_users table exists
SELECT 
    'privacy_users table check' as check_name,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_name = 'privacy_users' 
            AND table_schema = 'public'
        ) THEN 'EXISTS ✓'
        ELSE 'MISSING ✗'
    END as status;

-- 2. List ALL existing tables in your database
SELECT 
    table_name,
    table_type,
    'Current table' as status
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;

-- 3. If privacy_users exists, check its columns
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'privacy_users' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- 4. Check if any of our target tables already exist
SELECT 
    table_name,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_name = t.table_name 
            AND table_schema = 'public'
        ) THEN 'EXISTS ✓'
        ELSE 'MISSING ✗'
    END as status
FROM (VALUES 
    ('nip05_records'),
    ('profiles'),
    ('families'),
    ('nostr_backups'),
    ('lightning_addresses'),
    ('reward_redemptions'),
    ('user_identities'),
    ('vault_credentials')
) AS t(table_name)
ORDER BY table_name;

-- 5. Check for any existing RLS policies that might conflict
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 6. Check current database extensions
SELECT 
    extname as extension_name,
    extversion as version
FROM pg_extension
WHERE extname IN ('uuid-ossp', 'pgcrypto')
ORDER BY extname;

-- 7. Check if there are any existing constraints that might conflict
SELECT 
    tc.table_name,
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_schema = 'public'
AND tc.table_name IN (
    'privacy_users', 'nip05_records', 'profiles', 'families', 
    'nostr_backups', 'lightning_addresses', 'reward_redemptions', 
    'user_identities', 'vault_credentials'
)
ORDER BY tc.table_name, tc.constraint_name;

-- 8. Final summary
SELECT 
    '=== DIAGNOSTIC SUMMARY ===' as summary,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_name = 'privacy_users' 
            AND table_schema = 'public'
        ) THEN 'privacy_users table EXISTS - Safe to run ALTER TABLE commands'
        ELSE 'privacy_users table MISSING - Need to create it first or skip ALTER TABLE commands'
    END as privacy_users_status,
    (
        SELECT COUNT(*) 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
    ) as total_existing_tables;
