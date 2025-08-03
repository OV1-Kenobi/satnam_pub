-- =====================================================
-- COLUMN NAMING CONSISTENCY FIX
-- Rename hashed_pubkey to hashed_npub in nip05_records table
-- Execute this directly in Supabase SQL Editor
-- =====================================================

-- Step 1: Verify current column exists before rename
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'nip05_records' 
      AND column_name = 'hashed_pubkey'
  ) THEN
    RAISE NOTICE '✅ Found hashed_pubkey column in nip05_records table';
  ELSE
    RAISE NOTICE '❌ hashed_pubkey column not found in nip05_records table';
    RAISE EXCEPTION 'Column hashed_pubkey does not exist in nip05_records table';
  END IF;
END $$;

-- Step 2: Check if target column name already exists (safety check)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'nip05_records' 
      AND column_name = 'hashed_npub'
  ) THEN
    RAISE NOTICE '⚠️ hashed_npub column already exists in nip05_records table';
    RAISE EXCEPTION 'Target column hashed_npub already exists - manual intervention required';
  ELSE
    RAISE NOTICE '✅ Target column name hashed_npub is available';
  END IF;
END $$;

-- Step 3: Rename the column for consistency
ALTER TABLE nip05_records 
RENAME COLUMN hashed_pubkey TO hashed_npub;

-- Step 4: Verify the rename was successful
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'nip05_records' 
      AND column_name = 'hashed_npub'
  ) THEN
    RAISE NOTICE '✅ Successfully renamed hashed_pubkey to hashed_npub';
  ELSE
    RAISE EXCEPTION '❌ Column rename failed - hashed_npub not found';
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'nip05_records' 
      AND column_name = 'hashed_pubkey'
  ) THEN
    RAISE EXCEPTION '❌ Old column hashed_pubkey still exists after rename';
  ELSE
    RAISE NOTICE '✅ Old column hashed_pubkey successfully removed';
  END IF;
END $$;

-- Step 5: Verification query - show consistent column naming across all tables
SELECT 
  '📊 COLUMN NAMING VERIFICATION' as verification_type,
  table_name,
  column_name,
  data_type,
  '✅ CONSISTENT' as status
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name IN ('user_identities', 'profiles', 'nip05_records')
  AND column_name = 'hashed_npub'
ORDER BY table_name;

-- Step 6: Show all privacy hashing columns for final verification
SELECT 
  '🔒 ALL PRIVACY COLUMNS VERIFICATION' as verification_type,
  table_name,
  column_name,
  data_type
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name IN ('user_identities', 'profiles', 'nip05_records')
  AND column_name IN ('user_salt', 'hashed_npub', 'hashed_nip05', 'hashed_encrypted_nsec')
ORDER BY table_name, column_name;

-- Step 7: Test that we can query the renamed column (should not fail)
SELECT 
  '🧪 COLUMN ACCESS TEST' as test_type,
  COUNT(*) as total_records,
  COUNT(hashed_npub) as records_with_hashed_npub,
  COUNT(user_salt) as records_with_salt
FROM nip05_records;

-- Success message
SELECT '🎉 COLUMN NAMING CONSISTENCY FIX COMPLETED SUCCESSFULLY' as result;
