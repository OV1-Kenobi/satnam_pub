-- =====================================================
-- DEBUG MIGRATION STATE
-- Run this BEFORE the main migration to identify issues
-- =====================================================

DO $$
DECLARE
    table_exists BOOLEAN;
    column_exists BOOLEAN;
    column_count INTEGER;
    column_name_record RECORD;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🔍 DEBUGGING MIGRATION STATE';
    RAISE NOTICE '============================';
    RAISE NOTICE '';
    
    -- Check if user_identities table exists
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'user_identities' 
        AND table_schema = 'public'
    ) INTO table_exists;
    
    IF table_exists THEN
        RAISE NOTICE '✓ user_identities table EXISTS';
        
        -- Count total columns
        SELECT COUNT(*) INTO column_count
        FROM information_schema.columns 
        WHERE table_name = 'user_identities' 
        AND table_schema = 'public';
        
        RAISE NOTICE '📊 user_identities has % columns', column_count;
        
        -- List all columns
        RAISE NOTICE '';
        RAISE NOTICE '📋 EXISTING COLUMNS IN user_identities:';
        FOR column_name_record IN
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'user_identities'
            AND table_schema = 'public'
            ORDER BY ordinal_position
        LOOP
            RAISE NOTICE '  • %', column_name_record.column_name;
        END LOOP;
        
        -- Check specifically for family_federation_id
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'user_identities' 
            AND column_name = 'family_federation_id'
            AND table_schema = 'public'
        ) INTO column_exists;
        
        IF column_exists THEN
            RAISE NOTICE '';
            RAISE NOTICE '✅ family_federation_id column EXISTS';
        ELSE
            RAISE NOTICE '';
            RAISE NOTICE '❌ family_federation_id column MISSING';
        END IF;
        
    ELSE
        RAISE NOTICE '❌ user_identities table DOES NOT EXIST';
    END IF;
    
    RAISE NOTICE '';
    RAISE NOTICE '🔍 OTHER TABLES CHECK:';
    
    -- Check family_federations table
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'family_federations' 
        AND table_schema = 'public'
    ) INTO table_exists;
    
    IF table_exists THEN
        RAISE NOTICE '✓ family_federations table EXISTS';
    ELSE
        RAISE NOTICE '❌ family_federations table MISSING';
    END IF;
    
    -- Check nip05_records table
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'nip05_records' 
        AND table_schema = 'public'
    ) INTO table_exists;
    
    IF table_exists THEN
        RAISE NOTICE '✓ nip05_records table EXISTS';
        
        -- Check for DUID columns
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'nip05_records' 
            AND column_name = 'name_duid'
            AND table_schema = 'public'
        ) INTO column_exists;
        
        IF column_exists THEN
            RAISE NOTICE '  ✓ name_duid column EXISTS';
        ELSE
            RAISE NOTICE '  ❌ name_duid column MISSING';
        END IF;
        
    ELSE
        RAISE NOTICE '❌ nip05_records table MISSING';
    END IF;
    
    RAISE NOTICE '';
    RAISE NOTICE '🎯 RECOMMENDATION:';
    RAISE NOTICE 'Run the main migration now to see exactly where it fails.';
    RAISE NOTICE '';
    
END $$;
