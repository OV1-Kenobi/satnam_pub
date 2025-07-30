-- =====================================================
-- DEBUG STEP 2: TEST DATA INSERTION ONLY
-- Run this ONLY after debug-step-1-table-creation.sql succeeds
-- =====================================================

-- Verify table exists before attempting insertion
DO $$
DECLARE
    table_exists BOOLEAN;
    domain_column_exists BOOLEAN;
    column_list TEXT;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'nip05_records' 
        AND table_schema = 'public'
    ) INTO table_exists;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'nip05_records' 
        AND column_name = 'domain'
        AND table_schema = 'public'
    ) INTO domain_column_exists;
    
    -- Get list of all columns
    SELECT string_agg(column_name, ', ' ORDER BY ordinal_position) INTO column_list
    FROM information_schema.columns 
    WHERE table_name = 'nip05_records' 
    AND table_schema = 'public';
    
    RAISE NOTICE 'DEBUG: Pre-insertion verification';
    RAISE NOTICE 'Table exists: %', CASE WHEN table_exists THEN 'YES' ELSE 'NO' END;
    RAISE NOTICE 'Domain column exists: %', CASE WHEN domain_column_exists THEN 'YES' ELSE 'NO' END;
    RAISE NOTICE 'Available columns: %', COALESCE(column_list, 'NONE');
    
    IF NOT table_exists THEN
        RAISE EXCEPTION 'CRITICAL: nip05_records table does not exist! Run debug-step-1 first.';
    END IF;
    
    IF NOT domain_column_exists THEN
        RAISE EXCEPTION 'CRITICAL: domain column does not exist! Table creation failed.';
    END IF;
END $$;

-- Test data insertion
BEGIN;

DO $$
BEGIN
    RAISE NOTICE 'DEBUG: About to insert test data...';
END $$;

-- Insert a single test record first
INSERT INTO nip05_records (name, pubkey, domain) VALUES
    ('test_user', 'npub1test123456789abcdef', 'satnam.pub');

DO $$
BEGIN
    RAISE NOTICE 'DEBUG: Single test record inserted successfully';
END $$;

-- Insert the full set of records
INSERT INTO nip05_records (name, pubkey, domain) VALUES
    ('admin', 'npub1rebuilding_camelot_public_key_here', 'satnam.pub'),
    ('RebuildingCamelot', 'npub1rebuilding_camelot_public_key_here', 'satnam.pub'),
    ('bitcoin_mentor', 'npub1mentorbitcoinexample123456789abcdef', 'satnam.pub'),
    ('lightning_mentor', 'npub1mentorligthningexample123456789abcdef', 'satnam.pub'),
    ('family_mentor', 'npub1mentorfamilyexample123456789abcdef', 'satnam.pub'),
    ('support', 'npub1satnamsupport123456789abcdef', 'satnam.pub'),
    ('info', 'npub1satnaminfo123456789abcdef', 'satnam.pub')
ON CONFLICT (name, domain) DO NOTHING;

DO $$
BEGIN
    RAISE NOTICE 'DEBUG: All records inserted successfully';
END $$;

COMMIT;

-- Verify data was inserted
DO $$
DECLARE
    record_count INTEGER;
    sample_record RECORD;
BEGIN
    SELECT COUNT(*) INTO record_count FROM nip05_records;
    
    RAISE NOTICE '';
    RAISE NOTICE '=== DATA INSERTION VERIFICATION ===';
    RAISE NOTICE 'Total records inserted: %', record_count;
    
    IF record_count > 0 THEN
        -- Get a sample record to verify structure
        SELECT name, pubkey, domain INTO sample_record 
        FROM nip05_records 
        LIMIT 1;
        
        RAISE NOTICE 'Sample record:';
        RAISE NOTICE '  Name: %', sample_record.name;
        RAISE NOTICE '  Pubkey: %', sample_record.pubkey;
        RAISE NOTICE '  Domain: %', sample_record.domain;
        RAISE NOTICE '';
        RAISE NOTICE '🎉 SUCCESS: Data insertion completed successfully!';
        RAISE NOTICE '✅ The "domain column does not exist" error has been resolved!';
    ELSE
        RAISE NOTICE '❌ FAILURE: No records were inserted';
    END IF;
END $$;
