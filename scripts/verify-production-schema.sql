-- =====================================================
-- PRODUCTION DATABASE SCHEMA VERIFICATION
-- Check if all required columns exist for maximum encryption architecture
-- Execute this in Supabase SQL Editor to verify production schema
-- =====================================================

-- Step 1: Check if user_identities table exists
SELECT 
  '📊 TABLE EXISTENCE CHECK' as check_type,
  table_name,
  table_type,
  CASE 
    WHEN table_name = 'user_identities' THEN '✅ EXISTS'
    ELSE '❌ MISSING'
  END as status
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name = 'user_identities';

-- Step 2: Check all columns in user_identities table
SELECT 
  '📋 CURRENT SCHEMA - user_identities' as check_type,
  column_name,
  data_type,
  is_nullable,
  column_default,
  ordinal_position
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'user_identities'
ORDER BY ordinal_position;

-- Step 3: Check for required columns from maximum encryption architecture
WITH required_columns AS (
  SELECT unnest(ARRAY[
    'id',
    'role', 
    'is_active',
    'created_at',
    'updated_at',
    'user_salt',
    'hashed_username',
    'hashed_bio',
    'hashed_display_name', 
    'hashed_picture',
    'hashed_npub',
    'hashed_nip05',
    'hashed_lightning_address',
    'hashed_encrypted_nsec',
    'spending_limits',
    'privacy_settings'
  ]) as required_column
),
actual_columns AS (
  SELECT column_name as actual_column
  FROM information_schema.columns 
  WHERE table_schema = 'public' AND table_name = 'user_identities'
)
SELECT 
  '🔍 REQUIRED COLUMNS CHECK' as check_type,
  r.required_column,
  CASE 
    WHEN a.actual_column IS NOT NULL THEN '✅ EXISTS'
    ELSE '❌ MISSING'
  END as status,
  CASE 
    WHEN a.actual_column IS NULL THEN 'CRITICAL: Column missing - will cause registration failure'
    ELSE 'OK'
  END as impact
FROM required_columns r
LEFT JOIN actual_columns a ON r.required_column = a.actual_column
ORDER BY 
  CASE WHEN a.actual_column IS NULL THEN 1 ELSE 2 END,
  r.required_column;

-- Step 4: Check nip05_records table schema
SELECT 
  '📋 CURRENT SCHEMA - nip05_records' as check_type,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'nip05_records'
ORDER BY ordinal_position;

-- Step 5: Check for required nip05_records columns
WITH required_nip05_columns AS (
  SELECT unnest(ARRAY[
    'domain',
    'is_active',
    'created_at',
    'updated_at',
    'user_salt',
    'hashed_name',
    'hashed_npub'
  ]) as required_column
),
actual_nip05_columns AS (
  SELECT column_name as actual_column
  FROM information_schema.columns 
  WHERE table_schema = 'public' AND table_name = 'nip05_records'
)
SELECT 
  '🔍 REQUIRED NIP05 COLUMNS CHECK' as check_type,
  r.required_column,
  CASE 
    WHEN a.actual_column IS NOT NULL THEN '✅ EXISTS'
    ELSE '❌ MISSING'
  END as status
FROM required_nip05_columns r
LEFT JOIN actual_nip05_columns a ON r.required_column = a.actual_column
ORDER BY 
  CASE WHEN a.actual_column IS NULL THEN 1 ELSE 2 END,
  r.required_column;

-- Step 6: Check for any legacy tables that should be removed
SELECT 
  '🗑️ LEGACY TABLES CHECK' as check_type,
  table_name,
  CASE 
    WHEN table_name IN ('profiles', 'privacy_users') THEN '⚠️ SHOULD BE REMOVED'
    ELSE '📋 OTHER TABLE'
  END as status
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
  AND table_name NOT IN ('user_identities', 'nip05_records')
ORDER BY table_name;

-- Step 7: Check RLS policies
SELECT 
  '🔒 RLS POLICIES CHECK' as check_type,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies 
WHERE tablename IN ('user_identities', 'nip05_records')
ORDER BY tablename, policyname;

-- Step 8: Summary report
SELECT 
  '📊 SCHEMA VERIFICATION SUMMARY' as report_type,
  'Run this script to identify missing columns causing registration failures' as description,
  'Check the results above for ❌ MISSING columns that need to be added' as action_required;
