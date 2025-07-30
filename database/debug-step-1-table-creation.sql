-- =====================================================
-- DEBUG STEP 1: TEST NIP05_RECORDS TABLE CREATION ONLY
-- Run this first to see if table creation itself fails
-- =====================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Check current state before creation
DO $$
BEGIN
    RAISE NOTICE 'DEBUG: Starting nip05_records table creation test';
    RAISE NOTICE 'DEBUG: Current timestamp: %', NOW();
END $$;

-- Test table creation in isolation
BEGIN;

DO $$
BEGIN
    RAISE NOTICE 'DEBUG: About to create nip05_records table...';
END $$;

CREATE TABLE IF NOT EXISTS public.nip05_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL,
    pubkey VARCHAR(100) NOT NULL,
    domain VARCHAR(255) NOT NULL DEFAULT 'satnam.pub',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT nip05_records_name_domain_unique UNIQUE(name, domain),
    CONSTRAINT nip05_records_pubkey_format CHECK (pubkey LIKE 'npub1%')
);

DO $$
BEGIN
    RAISE NOTICE 'DEBUG: Table creation command executed';
END $$;

-- Test if table exists immediately after creation
DO $$
DECLARE
    table_exists BOOLEAN;
    domain_column_exists BOOLEAN;
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
    
    RAISE NOTICE 'DEBUG: Table exists: %', CASE WHEN table_exists THEN 'YES' ELSE 'NO' END;
    RAISE NOTICE 'DEBUG: Domain column exists: %', CASE WHEN domain_column_exists THEN 'YES' ELSE 'NO' END;
    
    IF NOT table_exists THEN
        RAISE EXCEPTION 'CRITICAL: nip05_records table was not created!';
    END IF;
    
    IF NOT domain_column_exists THEN
        RAISE EXCEPTION 'CRITICAL: domain column was not created!';
    END IF;
    
    RAISE NOTICE 'SUCCESS: Table and domain column created successfully';
END $$;

COMMIT;

-- Final verification after commit
DO $$
DECLARE
    table_exists BOOLEAN;
    domain_column_exists BOOLEAN;
    column_count INTEGER;
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
    
    RAISE NOTICE '';
    RAISE NOTICE '=== FINAL VERIFICATION AFTER COMMIT ===';
    RAISE NOTICE 'Table exists: %', CASE WHEN table_exists THEN 'YES ✓' ELSE 'NO ✗' END;
    RAISE NOTICE 'Domain column exists: %', CASE WHEN domain_column_exists THEN 'YES ✓' ELSE 'NO ✗' END;
    RAISE NOTICE 'Total columns: %', column_count;
    RAISE NOTICE '';
    
    IF table_exists AND domain_column_exists THEN
        RAISE NOTICE '🎉 SUCCESS: Ready to test data insertion';
    ELSE
        RAISE NOTICE '❌ FAILURE: Table creation failed - do not proceed to data insertion';
    END IF;
END $$;
