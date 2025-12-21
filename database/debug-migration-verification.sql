-- =====================================================
-- DEBUG: MIGRATION VERIFICATION DIAGNOSTIC
-- Run this to see exactly what's failing in the migration verification
-- =====================================================

DO $$
DECLARE
    expected_tables TEXT[] := ARRAY['user_identities', 'family_federations', 'family_members', 'nip05_records'];
    current_table TEXT;
    issues_found INTEGER := 0;
    rec RECORD;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🔍 MIGRATION VERIFICATION DIAGNOSTIC';
    RAISE NOTICE '====================================';
    
    -- 1. Check if all expected tables exist
    RAISE NOTICE '';
    RAISE NOTICE '1️⃣ CHECKING REQUIRED TABLES:';
    RAISE NOTICE '----------------------------';
    
    FOREACH current_table IN ARRAY expected_tables
    LOOP
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables t WHERE t.table_name = current_table AND t.table_schema = 'public') THEN
            RAISE WARNING '❌ MISSING TABLE: %', current_table;
            issues_found := issues_found + 1;
        ELSE
            RAISE NOTICE '✅ Table exists: %', current_table;
        END IF;
    END LOOP;
    
    -- 2. Check nip05_records structure
    RAISE NOTICE '';
    RAISE NOTICE '2️⃣ CHECKING NIP05_RECORDS STRUCTURE:';
    RAISE NOTICE '------------------------------------';
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables t WHERE t.table_name = 'nip05_records' AND t.table_schema = 'public') THEN
        RAISE WARNING '❌ nip05_records table does not exist!';
        issues_found := issues_found + 1;
    ELSE
        -- Check for privacy-violating columns
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nip05_records' AND column_name = 'name') THEN
            RAISE WARNING '❌ PRIVACY VIOLATION: plaintext "name" column exists in nip05_records';
            issues_found := issues_found + 1;
        ELSE
            RAISE NOTICE '✅ nip05_records.name (plaintext) - properly eliminated';
        END IF;
        
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nip05_records' AND column_name = 'pubkey') THEN
            RAISE WARNING '❌ PRIVACY VIOLATION: plaintext "pubkey" column exists in nip05_records';
            issues_found := issues_found + 1;
        ELSE
            RAISE NOTICE '✅ nip05_records.pubkey (plaintext) - properly eliminated';
        END IF;
        
        -- Check for required DUID columns
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nip05_records' AND column_name = 'user_duid') THEN
            RAISE WARNING '❌ MISSING: nip05_records.user_duid column required for privacy-first operations';
            issues_found := issues_found + 1;
        ELSE
            RAISE NOTICE '✅ nip05_records.user_duid - privacy-first column exists';
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nip05_records' AND column_name = 'pubkey_duid') THEN
            RAISE WARNING '❌ MISSING: nip05_records.pubkey_duid column required for privacy-first operations';
            issues_found := issues_found + 1;
        ELSE
            RAISE NOTICE '✅ nip05_records.pubkey_duid - privacy-first column exists';
        END IF;
        
        -- Show current nip05_records structure
        RAISE NOTICE '';
        RAISE NOTICE '📋 Current nip05_records columns:';
        FOR rec IN 
            SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'nip05_records' AND table_schema = 'public'
            ORDER BY ordinal_position
        LOOP
            RAISE NOTICE '   • % (%)', rec.column_name, rec.data_type;
        END LOOP;
    END IF;
    
    -- 3. Check user_identities structure
    RAISE NOTICE '';
    RAISE NOTICE '3️⃣ CHECKING USER_IDENTITIES STRUCTURE:';
    RAISE NOTICE '-------------------------------------';
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables t WHERE t.table_name = 'user_identities' AND t.table_schema = 'public') THEN
        RAISE WARNING '❌ user_identities table does not exist!';
        issues_found := issues_found + 1;
    ELSE
        -- Verify id column exists as TEXT (DUID primary key)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_identities' AND column_name = 'id' AND data_type = 'text') THEN
            RAISE WARNING '❌ MISSING: user_identities.id (TEXT) column required as DUID primary key';
            issues_found := issues_found + 1;
        ELSE
            RAISE NOTICE '✅ user_identities.id (DUID PRIMARY KEY) - privacy-first column exists';
        END IF;

        -- Verify user_salt exists
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_identities' AND column_name = 'user_salt') THEN
            RAISE WARNING '❌ MISSING: user_identities.user_salt column required for privacy-first operations';
            issues_found := issues_found + 1;
        ELSE
            RAISE NOTICE '✅ user_identities.user_salt - privacy-first column exists';
        END IF;
        
        -- Show current user_identities structure (first 10 columns)
        RAISE NOTICE '';
        RAISE NOTICE '📋 Current user_identities columns (first 10):';
        FOR rec IN 
            SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'user_identities' AND table_schema = 'public'
            ORDER BY ordinal_position
            LIMIT 10
        LOOP
            RAISE NOTICE '   • % (%)', rec.column_name, rec.data_type;
        END LOOP;
    END IF;
    
    -- 4. Summary
    RAISE NOTICE '';
    RAISE NOTICE '📊 DIAGNOSTIC SUMMARY:';
    RAISE NOTICE '======================';
    RAISE NOTICE 'Total issues found: %', issues_found;
    RAISE NOTICE '';
    
    IF issues_found = 0 THEN
        RAISE NOTICE '🎉 NO ISSUES FOUND - Migration should pass verification!';
    ELSE
        RAISE NOTICE '⚠️  % ISSUES DETECTED - These need to be fixed before running privacy-first-migration-complete.sql', issues_found;
    END IF;
    
    RAISE NOTICE '';
END $$;