-- =====================================================
-- PRODUCTION DATABASE SCHEMA VERIFICATION
-- Run each query separately in Supabase SQL Editor
-- =====================================================

-- QUERY 1: ACTUAL CURRENT COLUMNS in user_identities table
SELECT
  'USER_IDENTITIES_COLUMNS' as query_type,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'user_identities'
ORDER BY ordinal_position;

-- QUERY 2: MISSING COLUMNS that register-identity.js needs
SELECT
  'MISSING_COLUMNS' as query_type,
  col.column_name as missing_column
FROM (
  VALUES
    ('user_salt'),
    ('hashed_username'),
    ('hashed_npub'),
    ('hashed_nip05'),
    ('hashed_lightning_address'),
    ('hashed_encrypted_nsec'),
    ('password_hash'),
    ('password_salt'),
    ('spending_limits'),
    ('privacy_settings'),
    ('role'),
    ('is_active')
) AS col(column_name)
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'user_identities'
    AND column_name = col.column_name
);

-- QUERY 3: CURRENT nip05_records table columns
SELECT
  'NIP05_RECORDS_COLUMNS' as query_type,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'nip05_records'
ORDER BY ordinal_position;

-- QUERY 4: ALL TABLES in database
SELECT
  'ALL_TABLES' as query_type,
  table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
