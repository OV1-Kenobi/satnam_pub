-- =====================================================
-- FIX NIP05_RECORDS DOMAIN COLUMN MIGRATION
-- Adds missing domain column to nip05_records table
-- =====================================================
-- 
-- PURPOSE: Fix missing domain column in nip05_records table causing registration failures
-- ISSUE: Identity registration fails with "Could not find the 'domain' column" error
-- SOLUTION: Add domain VARCHAR(255) NOT NULL DEFAULT 'satnam.pub' column safely
--
-- REGISTRATION FAILURE CONTEXT:
-- - user_identities table insertion succeeds ✅
-- - nip05_records table insertion fails ❌ due to missing domain column
-- - register-identity.js expects to write: domain: 'satnam.pub'
-- - This blocks the complete identity registration flow
--
-- USER SOVEREIGNTY CONTEXT:
-- The domain column is critical for NIP-05 domain verification which enables:
-- - Users to control their own Nostr identity verification records
-- - Decentralized identity verification (username@domain format)
-- - User sovereignty over their NIP-05 identity namespace
-- - Public discoverability while maintaining user control
--
-- SAFETY FEATURES:
-- - Idempotent design (safe to run multiple times)
-- - Column existence check before adding
-- - Proper default value matching registration function expectations
-- - Transaction-wrapped for atomicity
-- - Comprehensive logging and verification
--
-- =====================================================

-- Start transaction for atomic operation
BEGIN;

-- Function to check if column exists (using established pattern)
CREATE OR REPLACE FUNCTION column_exists(tbl_name TEXT, col_name TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = tbl_name
        AND column_name = col_name
    );
END;
$$ LANGUAGE plpgsql;

-- Function to check if table exists
CREATE OR REPLACE FUNCTION table_exists(tbl_name TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = tbl_name
    );
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- SECTION 1: VERIFY TABLE EXISTS AND CHECK CURRENT STATE
-- =====================================================

DO $$
DECLARE
    table_found BOOLEAN;
    column_found BOOLEAN;
    current_columns TEXT[];
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🔍 NIP05_RECORDS DOMAIN COLUMN FIX STARTING...';
    RAISE NOTICE '================================================';
    
    -- Check if nip05_records table exists
    SELECT table_exists('nip05_records') INTO table_found;
    
    IF NOT table_found THEN
        RAISE NOTICE '❌ ERROR: nip05_records table does not exist!';
        RAISE NOTICE '   Please run a complete identity system migration script first.';
        RAISE EXCEPTION 'nip05_records table not found - cannot proceed with domain column fix';
    END IF;
    
    RAISE NOTICE '✅ nip05_records table found - proceeding with domain column check...';
    
    -- Get current column list for diagnostic purposes
    SELECT array_agg(column_name ORDER BY ordinal_position) INTO current_columns
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'nip05_records';
    
    RAISE NOTICE '📋 Current nip05_records columns: %', array_to_string(current_columns, ', ');
    
    -- Check if domain column exists
    SELECT column_exists('nip05_records', 'domain') INTO column_found;
    
    IF column_found THEN
        RAISE NOTICE '⏭️ domain column already exists in nip05_records table';
        RAISE NOTICE '   No action needed - registration should work correctly';
    ELSE
        RAISE NOTICE '❌ domain column MISSING from nip05_records table';
        RAISE NOTICE '   This is causing identity registration failures';
        RAISE NOTICE '   Will add domain column with proper specification...';
    END IF;
END $$;

-- =====================================================
-- SECTION 2: ADD MISSING DOMAIN COLUMN
-- =====================================================

DO $$
BEGIN
    -- Add domain column if it doesn't exist
    IF NOT column_exists('nip05_records', 'domain') THEN
        RAISE NOTICE '';
        RAISE NOTICE '🔧 Adding missing domain column to nip05_records table...';
        
        -- Add the domain column with exact specification expected by register-identity.js
        ALTER TABLE nip05_records 
        ADD COLUMN domain VARCHAR(255) NOT NULL DEFAULT 'satnam.pub';
        
        RAISE NOTICE '✅ Successfully added domain column:';
        RAISE NOTICE '   - Type: VARCHAR(255)';
        RAISE NOTICE '   - Constraint: NOT NULL';
        RAISE NOTICE '   - Default: ''satnam.pub''';
        RAISE NOTICE '   - Matches register-identity.js expectations';
        
        -- Verify the column was added correctly
        IF column_exists('nip05_records', 'domain') THEN
            RAISE NOTICE '✅ Domain column addition verified successfully';
        ELSE
            RAISE EXCEPTION 'Failed to add domain column - verification failed';
        END IF;
        
    ELSE
        RAISE NOTICE '';
        RAISE NOTICE '⏭️ Domain column already exists - no changes needed';
    END IF;
END $$;

-- =====================================================
-- SECTION 3: VERIFY COLUMN SPECIFICATIONS
-- =====================================================

DO $$
DECLARE
    col_type TEXT;
    col_nullable TEXT;
    col_default TEXT;
    spec_correct BOOLEAN := true;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🔍 Verifying domain column specifications...';
    
    -- Get column specifications
    SELECT data_type, is_nullable, column_default
    INTO col_type, col_nullable, col_default
    FROM information_schema.columns
    WHERE table_schema = 'public' 
    AND table_name = 'nip05_records' 
    AND column_name = 'domain';
    
    RAISE NOTICE '📋 Domain column specifications:';
    RAISE NOTICE '   - Data type: %', col_type;
    RAISE NOTICE '   - Nullable: %', col_nullable;
    RAISE NOTICE '   - Default: %', COALESCE(col_default, 'none');
    
    -- Verify specifications match requirements
    IF col_type != 'character varying' THEN
        RAISE NOTICE '⚠️ WARNING: Expected VARCHAR, found %', col_type;
        spec_correct := false;
    END IF;
    
    IF col_nullable != 'NO' THEN
        RAISE NOTICE '⚠️ WARNING: Expected NOT NULL, found nullable=%', col_nullable;
        spec_correct := false;
    END IF;
    
    IF col_default IS NULL OR col_default NOT LIKE '%satnam.pub%' THEN
        RAISE NOTICE '⚠️ WARNING: Expected DEFAULT ''satnam.pub'', found %', COALESCE(col_default, 'none');
        spec_correct := false;
    END IF;
    
    IF spec_correct THEN
        RAISE NOTICE '✅ All domain column specifications are correct';
    ELSE
        RAISE NOTICE '⚠️ Some specifications may not match expectations';
        RAISE NOTICE '   Registration should still work, but verify manually if needed';
    END IF;
END $$;

-- =====================================================
-- SECTION 4: FINAL VERIFICATION AND SUMMARY
-- =====================================================

DO $$
DECLARE
    final_columns TEXT[];
    domain_exists BOOLEAN;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🎯 FINAL VERIFICATION AND SUMMARY:';
    RAISE NOTICE '===================================';
    
    -- Final column existence check
    SELECT column_exists('nip05_records', 'domain') INTO domain_exists;
    
    -- Get updated column list
    SELECT array_agg(column_name ORDER BY ordinal_position) INTO final_columns
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'nip05_records';
    
    RAISE NOTICE '📋 Final nip05_records columns: %', array_to_string(final_columns, ', ');
    
    IF domain_exists THEN
        RAISE NOTICE '';
        RAISE NOTICE '✅ SUCCESS: Domain column is now present in nip05_records table';
        RAISE NOTICE '';
        RAISE NOTICE '🎉 IDENTITY REGISTRATION SHOULD NOW WORK:';
        RAISE NOTICE '   1. ✅ user_identities table insertion will succeed';
        RAISE NOTICE '   2. ✅ nip05_records table insertion will succeed';
        RAISE NOTICE '   3. ✅ Complete registration flow will work';
        RAISE NOTICE '';
        RAISE NOTICE '🔒 USER SOVEREIGNTY FEATURES ENABLED:';
        RAISE NOTICE '   - ✅ NIP-05 domain verification (username@satnam.pub)';
        RAISE NOTICE '   - ✅ User control over Nostr identity verification';
        RAISE NOTICE '   - ✅ Decentralized identity namespace sovereignty';
        RAISE NOTICE '   - ✅ Public discoverability with user control';
        RAISE NOTICE '';
        RAISE NOTICE '🧪 NEXT STEPS:';
        RAISE NOTICE '   1. Test identity registration end-to-end';
        RAISE NOTICE '   2. Verify both user_identities and nip05_records are created';
        RAISE NOTICE '   3. Check that domain field contains ''satnam.pub''';
        RAISE NOTICE '   4. Run RLS policies script if not already done';
        
    ELSE
        RAISE NOTICE '';
        RAISE NOTICE '❌ ERROR: Domain column still missing after migration attempt';
        RAISE EXCEPTION 'Domain column fix failed - manual intervention required';
    END IF;
END $$;

-- Commit the transaction
COMMIT;

-- Clean up helper functions (optional - comment out if you want to keep them)
-- DROP FUNCTION IF EXISTS column_exists(TEXT, TEXT);
-- DROP FUNCTION IF EXISTS table_exists(TEXT);

-- Final success message
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🎉 NIP05_RECORDS DOMAIN COLUMN FIX COMPLETED SUCCESSFULLY!';
    RAISE NOTICE '';
    RAISE NOTICE 'The identity registration system should now work without';
    RAISE NOTICE 'the "Could not find the ''domain'' column" error.';
    RAISE NOTICE '';
END $$;
