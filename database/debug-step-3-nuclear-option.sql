-- =====================================================
-- DEBUG STEP 3: NUCLEAR OPTION - DROP AND RECREATE
-- Use this if there are conflicting objects preventing creation
-- =====================================================

-- Check what currently exists
DO $$
DECLARE
    table_exists BOOLEAN;
    constraint_count INTEGER;
    policy_count INTEGER;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'nip05_records' 
        AND table_schema = 'public'
    ) INTO table_exists;
    
    SELECT COUNT(*) INTO constraint_count
    FROM information_schema.table_constraints 
    WHERE table_name = 'nip05_records' 
    AND table_schema = 'public';
    
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies 
    WHERE tablename = 'nip05_records' 
    AND schemaname = 'public';
    
    RAISE NOTICE 'CURRENT STATE ANALYSIS:';
    RAISE NOTICE '  Table exists: %', CASE WHEN table_exists THEN 'YES' ELSE 'NO' END;
    RAISE NOTICE '  Constraints: %', constraint_count;
    RAISE NOTICE '  RLS Policies: %', policy_count;
    RAISE NOTICE '';
END $$;

-- Drop everything related to nip05_records
DO $$
BEGIN
    RAISE NOTICE 'DROPPING: All nip05_records related objects...';
END $$;

-- Drop policies first
DROP POLICY IF EXISTS "allow_registration_nip05_records" ON nip05_records;
DROP POLICY IF EXISTS "nip05_records_public_read" ON nip05_records;
DROP POLICY IF EXISTS "allow_all_nip05_records" ON nip05_records;

-- Drop indexes
DROP INDEX IF EXISTS idx_nip05_records_name;
DROP INDEX IF EXISTS idx_nip05_records_pubkey;
DROP INDEX IF EXISTS idx_nip05_records_domain;
DROP INDEX IF EXISTS idx_nip05_records_is_active;

-- Drop table
DROP TABLE IF EXISTS nip05_records CASCADE;

DO $$
BEGIN
    RAISE NOTICE 'DROPPED: All nip05_records objects removed';
END $$;

-- Verify everything is gone
DO $$
DECLARE
    table_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'nip05_records' 
        AND table_schema = 'public'
    ) INTO table_exists;
    
    IF table_exists THEN
        RAISE EXCEPTION 'CRITICAL: Table still exists after DROP!';
    ELSE
        RAISE NOTICE 'VERIFIED: Table successfully dropped';
    END IF;
END $$;

-- Recreate table with explicit column definitions
DO $$
BEGIN
    RAISE NOTICE 'CREATING: Fresh nip05_records table...';
END $$;

CREATE TABLE public.nip05_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL,
    pubkey VARCHAR(100) NOT NULL,
    domain VARCHAR(255) NOT NULL DEFAULT 'satnam.pub',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add constraints separately
ALTER TABLE nip05_records 
ADD CONSTRAINT nip05_records_name_domain_unique UNIQUE(name, domain);

ALTER TABLE nip05_records 
ADD CONSTRAINT nip05_records_pubkey_format CHECK (pubkey LIKE 'npub1%');

-- Add indexes
CREATE INDEX idx_nip05_records_name ON nip05_records(name);
CREATE INDEX idx_nip05_records_pubkey ON nip05_records(pubkey);
CREATE INDEX idx_nip05_records_domain ON nip05_records(domain);
CREATE INDEX idx_nip05_records_is_active ON nip05_records(is_active);

-- Verify creation
DO $$
DECLARE
    table_exists BOOLEAN;
    domain_column_exists BOOLEAN;
    column_count INTEGER;
    constraint_count INTEGER;
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
    
    SELECT COUNT(*) INTO column_count
    FROM information_schema.columns 
    WHERE table_name = 'nip05_records' 
    AND table_schema = 'public';
    
    SELECT COUNT(*) INTO constraint_count
    FROM information_schema.table_constraints 
    WHERE table_name = 'nip05_records' 
    AND table_schema = 'public';
    
    RAISE NOTICE '';
    RAISE NOTICE '=== RECREATION VERIFICATION ===';
    RAISE NOTICE 'Table exists: %', CASE WHEN table_exists THEN 'YES ✓' ELSE 'NO ✗' END;
    RAISE NOTICE 'Domain column exists: %', CASE WHEN domain_column_exists THEN 'YES ✓' ELSE 'NO ✗' END;
    RAISE NOTICE 'Total columns: %', column_count;
    RAISE NOTICE 'Total constraints: %', constraint_count;
    
    IF table_exists AND domain_column_exists THEN
        RAISE NOTICE '';
        RAISE NOTICE '🎉 SUCCESS: Table recreated successfully!';
        RAISE NOTICE '✅ Ready to test data insertion';
    ELSE
        RAISE NOTICE '';
        RAISE NOTICE '❌ FAILURE: Recreation failed';
    END IF;
END $$;

-- Test immediate data insertion
INSERT INTO nip05_records (name, pubkey, domain) VALUES
    ('test_nuclear', 'npub1testnuclear123456789abcdef', 'satnam.pub');

DO $$
DECLARE
    test_record_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO test_record_count FROM nip05_records WHERE name = 'test_nuclear';
    
    IF test_record_count = 1 THEN
        RAISE NOTICE '🚀 ULTIMATE SUCCESS: Data insertion works!';
        RAISE NOTICE '✅ The "domain column does not exist" error is RESOLVED!';
    ELSE
        RAISE NOTICE '❌ ULTIMATE FAILURE: Data insertion still fails';
    END IF;
END $$;
