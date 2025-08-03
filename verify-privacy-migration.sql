-- =====================================================
-- PRIVACY HASHING MIGRATION VERIFICATION SCRIPT
-- Execute this directly in Supabase SQL Editor to check migration status
-- =====================================================

-- Check if privacy hashing columns exist in all required tables
WITH expected_columns AS (
  SELECT 'user_identities' as table_name, 'user_salt' as column_name
  UNION ALL SELECT 'user_identities', 'hashed_npub'
  UNION ALL SELECT 'user_identities', 'hashed_nip05'
  UNION ALL SELECT 'user_identities', 'hashed_encrypted_nsec'
  UNION ALL SELECT 'profiles', 'user_salt'
  UNION ALL SELECT 'profiles', 'hashed_npub'
  UNION ALL SELECT 'profiles', 'hashed_nip05'
  UNION ALL SELECT 'nip05_records', 'user_salt'
  UNION ALL SELECT 'nip05_records', 'hashed_pubkey'
),
existing_columns AS (
  SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
  FROM information_schema.columns 
  WHERE table_schema = 'public' 
    AND table_name IN ('user_identities', 'profiles', 'nip05_records')
    AND column_name IN ('user_salt', 'hashed_npub', 'hashed_nip05', 'hashed_encrypted_nsec', 'hashed_pubkey')
),
migration_status AS (
  SELECT 
    e.table_name,
    e.column_name,
    CASE 
      WHEN ex.column_name IS NOT NULL THEN '✅ EXISTS'
      ELSE '❌ MISSING'
    END as status,
    COALESCE(ex.data_type, 'N/A') as data_type,
    COALESCE(ex.is_nullable, 'N/A') as nullable
  FROM expected_columns e
  LEFT JOIN existing_columns ex ON e.table_name = ex.table_name AND e.column_name = ex.column_name
)

-- Main verification results
SELECT 
  '🔍 PRIVACY HASHING MIGRATION VERIFICATION' as verification_type,
  '' as table_name,
  '' as column_name,
  '' as status,
  '' as data_type,
  '' as nullable
UNION ALL
SELECT 
  '================================================',
  '',
  '',
  '',
  '',
  ''
UNION ALL
SELECT 
  'TABLE: ' || table_name,
  table_name,
  column_name,
  status,
  data_type,
  nullable
FROM migration_status
ORDER BY table_name, column_name;

-- Summary counts
SELECT 
  '📊 MIGRATION SUMMARY' as summary_type,
  COUNT(*) as total_expected_columns,
  SUM(CASE WHEN status = '✅ EXISTS' THEN 1 ELSE 0 END) as columns_found,
  SUM(CASE WHEN status = '❌ MISSING' THEN 1 ELSE 0 END) as columns_missing,
  CASE 
    WHEN SUM(CASE WHEN status = '❌ MISSING' THEN 1 ELSE 0 END) = 0 
    THEN '✅ MIGRATION FULLY APPLIED'
    ELSE '❌ MIGRATION INCOMPLETE'
  END as migration_status
FROM (
  SELECT 
    e.table_name,
    e.column_name,
    CASE 
      WHEN ex.column_name IS NOT NULL THEN '✅ EXISTS'
      ELSE '❌ MISSING'
    END as status
  FROM (
    SELECT 'user_identities' as table_name, 'user_salt' as column_name
    UNION ALL SELECT 'user_identities', 'hashed_npub'
    UNION ALL SELECT 'user_identities', 'hashed_nip05'
    UNION ALL SELECT 'user_identities', 'hashed_encrypted_nsec'
    UNION ALL SELECT 'profiles', 'user_salt'
    UNION ALL SELECT 'profiles', 'hashed_npub'
    UNION ALL SELECT 'profiles', 'hashed_nip05'
    UNION ALL SELECT 'nip05_records', 'user_salt'
    UNION ALL SELECT 'nip05_records', 'hashed_pubkey'
  ) e
  LEFT JOIN information_schema.columns ex 
    ON e.table_name = ex.table_name 
    AND e.column_name = ex.column_name
    AND ex.table_schema = 'public'
) verification_results;

-- Check if hashing functions exist
SELECT 
  '🔧 FUNCTION VERIFICATION' as function_check,
  routine_name,
  routine_type,
  CASE 
    WHEN routine_name IS NOT NULL THEN '✅ EXISTS'
    ELSE '❌ MISSING'
  END as status
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name IN ('generate_user_salt', 'hash_user_data')
UNION ALL
SELECT 
  'Expected Functions:',
  'generate_user_salt',
  'FUNCTION',
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.routines 
      WHERE routine_schema = 'public' AND routine_name = 'generate_user_salt'
    ) THEN '✅ EXISTS' ELSE '❌ MISSING'
  END
UNION ALL
SELECT 
  '',
  'hash_user_data',
  'FUNCTION',
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.routines 
      WHERE routine_schema = 'public' AND routine_name = 'hash_user_data'
    ) THEN '✅ EXISTS' ELSE '❌ MISSING'
  END;

-- Test if we can query the new columns (will fail if columns don't exist)
-- Uncomment the following lines to test actual column access:

/*
-- Test user_identities hashed columns
SELECT 'Testing user_identities columns...' as test_type;
SELECT COUNT(*) as total_rows, 
       COUNT(user_salt) as rows_with_salt,
       COUNT(hashed_npub) as rows_with_hashed_npub
FROM user_identities LIMIT 1;

-- Test profiles hashed columns  
SELECT 'Testing profiles columns...' as test_type;
SELECT COUNT(*) as total_rows,
       COUNT(user_salt) as rows_with_salt,
       COUNT(hashed_npub) as rows_with_hashed_npub
FROM profiles LIMIT 1;

-- Test nip05_records hashed columns
SELECT 'Testing nip05_records columns...' as test_type;
SELECT COUNT(*) as total_rows,
       COUNT(user_salt) as rows_with_salt,
       COUNT(hashed_pubkey) as rows_with_hashed_pubkey
FROM nip05_records LIMIT 1;
*/
