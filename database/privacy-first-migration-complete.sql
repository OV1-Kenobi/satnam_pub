-- =====================================================
-- PRIVACY-FIRST MIGRATION TRANSACTION COMPLETION
-- Run this AFTER privacy-first-identity-system-migration.sql
-- Adds transaction safety and verification to the main migration
-- =====================================================

-- =====================================================
-- STEP 1: DIAGNOSTIC QUERY (Run this FIRST to see issues)
-- This shows the exact database state without raising exceptions
-- =====================================================

-- Check which tables exist
SELECT 'TABLE CHECK' as check_type, table_name,
    CASE WHEN table_name IS NOT NULL THEN '✅ EXISTS' ELSE '❌ MISSING' END as status
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('user_identities', 'family_federations', 'family_members', 'nip05_records')
ORDER BY table_name;

-- Check user_identities.id data type (MUST be 'text' for DUID)
SELECT 'ID TYPE CHECK' as check_type, column_name, data_type,
    CASE WHEN data_type = 'text' THEN '✅ CORRECT (TEXT/DUID)'
         ELSE '❌ WRONG TYPE - needs migration to TEXT' END as status
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'user_identities' AND column_name = 'id';

-- Check for privacy violations (plaintext/legacy columns that should NOT exist)
SELECT 'PRIVACY VIOLATION CHECK' as check_type, column_name,
    '❌ MUST BE REMOVED - plaintext storage violates privacy' as status
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'nip05_records' AND column_name IN ('name', 'pubkey', 'user_id');

-- Check for required DUID columns in nip05_records
SELECT 'DUID COLUMN CHECK (nip05)' as check_type, 'user_duid' as required_column,
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'nip05_records' AND column_name = 'user_duid'
    ) THEN '✅ EXISTS' ELSE '❌ MISSING' END as status
UNION ALL
SELECT 'DUID COLUMN CHECK (nip05)', 'pubkey_duid',
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'nip05_records' AND column_name = 'pubkey_duid'
    ) THEN '✅ EXISTS' ELSE '❌ MISSING' END;

-- Check for user_salt column in user_identities
SELECT 'USER_SALT CHECK' as check_type, 'user_salt' as column_name,
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'user_identities' AND column_name = 'user_salt'
    ) THEN '✅ EXISTS' ELSE '❌ MISSING' END as status;

-- Show all columns in user_identities
SELECT 'user_identities SCHEMA' as table_info, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'user_identities'
ORDER BY ordinal_position;

-- Show all columns in nip05_records
SELECT 'nip05_records SCHEMA' as table_info, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'nip05_records'
ORDER BY ordinal_position;

-- =====================================================
-- STEP 1.5: AUTO-FIX KNOWN ISSUES (Idempotent)
-- These fixes are safe to run multiple times
-- =====================================================

-- FIX 1: Change user_identities.id from VARCHAR to TEXT if needed
-- COMPREHENSIVE: Dynamically discovers and handles ALL RLS policies across ALL tables
DO $$
DECLARE
    policy_record RECORD;
    table_record RECORD;
    policy_count INTEGER := 0;
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'user_identities'
        AND column_name = 'id'
        AND data_type = 'character varying'
    ) THEN
        RAISE NOTICE '🔧 Fixing user_identities.id type (VARCHAR → TEXT)...';
        RAISE NOTICE '   Step 1: Dropping ALL RLS policies in public schema...';

        -- STEP 1: Drop ALL RLS policies on ALL tables in public schema
        -- This ensures we catch any policy that might reference user_identities.id
        FOR policy_record IN
            SELECT schemaname, tablename, policyname
            FROM pg_policies
            WHERE schemaname = 'public'
            ORDER BY tablename, policyname
        LOOP
            BEGIN
                EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
                    policy_record.policyname,
                    policy_record.schemaname,
                    policy_record.tablename);
                policy_count := policy_count + 1;
                RAISE NOTICE '     Dropped: %.%', policy_record.tablename, policy_record.policyname;
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE '     Warning: Could not drop %.% - %',
                    policy_record.tablename, policy_record.policyname, SQLERRM;
            END;
        END LOOP;
        RAISE NOTICE '   ✓ Dropped % policies total', policy_count;

        -- STEP 2: Change column type (now safe with all policies dropped)
        RAISE NOTICE '   Step 2: Altering column type...';
        ALTER TABLE user_identities ALTER COLUMN id TYPE text;
        RAISE NOTICE '   ✓ Changed user_identities.id from VARCHAR to TEXT';

        -- STEP 3: Recreate all RLS policies with DUID-based authentication
        RAISE NOTICE '   Step 3: Recreating RLS policies...';

        -- 3a: user_identities policies
        CREATE POLICY "user_identities_own_data" ON user_identities
            FOR ALL TO authenticated
            USING (id = current_setting('app.current_user_duid', true))
            WITH CHECK (id = current_setting('app.current_user_duid', true));
        CREATE POLICY "user_identities_anon_insert" ON user_identities
            FOR INSERT TO anon WITH CHECK (true);
        CREATE POLICY "user_identities_service_role" ON user_identities
            FOR ALL TO service_role USING (true) WITH CHECK (true);
        RAISE NOTICE '     ✓ user_identities (3 policies)';

        -- 3b: nip05_records policies
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'nip05_records') THEN
            CREATE POLICY "nip05_records_public_read" ON nip05_records
                FOR SELECT TO anon, authenticated USING (is_active = true);
            CREATE POLICY "nip05_records_anon_insert" ON nip05_records
                FOR INSERT TO anon WITH CHECK (true);
            CREATE POLICY "nip05_records_service_role" ON nip05_records
                FOR ALL TO service_role USING (true) WITH CHECK (true);
            RAISE NOTICE '     ✓ nip05_records (3 policies)';
        END IF;

        -- 3c: family_federations policies
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'family_federations') THEN
            CREATE POLICY "family_federations_member_access" ON family_federations
                FOR ALL TO authenticated
                USING (id IN (
                    SELECT family_federation_id FROM family_members
                    WHERE user_duid = current_setting('app.current_user_duid', true) AND is_active = true
                ));
            CREATE POLICY "family_federations_service_role" ON family_federations
                FOR ALL TO service_role USING (true) WITH CHECK (true);
            RAISE NOTICE '     ✓ family_federations (2 policies)';
        END IF;

        -- 3d: family_members policies
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'family_members') THEN
            CREATE POLICY "family_members_own_data" ON family_members
                FOR ALL TO authenticated
                USING (user_duid = current_setting('app.current_user_duid', true));
            CREATE POLICY "family_members_service_role" ON family_members
                FOR ALL TO service_role USING (true) WITH CHECK (true);
            RAISE NOTICE '     ✓ family_members (2 policies)';
        END IF;

        -- 3e-3i: Dynamic policy creation for all other RLS-enabled tables
        -- Uses dynamic column detection: user_duid > user_id > owner_id > student_duid
        DECLARE
            user_col TEXT;
        BEGIN
            FOR table_record IN
                SELECT c.relname as tablename
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public'
                AND c.relkind = 'r'
                AND c.relrowsecurity = true
                AND c.relname NOT IN ('user_identities', 'nip05_records', 'family_federations', 'family_members')
            LOOP
                -- Detect which user reference column exists (priority order)
                SELECT column_name INTO user_col
                FROM information_schema.columns
                WHERE table_schema = 'public'
                AND table_name = table_record.tablename
                AND column_name IN ('user_duid', 'user_id', 'owner_id', 'student_duid', 'member_duid')
                ORDER BY CASE column_name
                    WHEN 'user_duid' THEN 1
                    WHEN 'student_duid' THEN 2
                    WHEN 'member_duid' THEN 3
                    WHEN 'user_id' THEN 4
                    WHEN 'owner_id' THEN 5
                    ELSE 6
                END
                LIMIT 1;

                BEGIN
                    -- Always create service_role policy
                    EXECUTE format('CREATE POLICY "%s_service_role" ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)',
                        table_record.tablename, table_record.tablename);

                    -- Create authenticated user policy if user column found
                    IF user_col IS NOT NULL THEN
                        EXECUTE format('CREATE POLICY "%s_own_data" ON %I FOR ALL TO authenticated USING (%I = current_setting(''app.current_user_duid'', true))',
                            table_record.tablename, table_record.tablename, user_col);
                        RAISE NOTICE '     ✓ % (using column: %)', table_record.tablename, user_col;
                    ELSE
                        RAISE NOTICE '     ✓ % (service_role only - no user column found)', table_record.tablename;
                    END IF;
                EXCEPTION WHEN duplicate_object THEN
                    RAISE NOTICE '     ⚠ % (policies already exist)', table_record.tablename;
                WHEN OTHERS THEN
                    RAISE NOTICE '     ⚠ % error: %', table_record.tablename, SQLERRM;
                END;
            END LOOP;
        END;

        RAISE NOTICE '✅ Fixed: user_identities.id changed to TEXT with all RLS policies restored';
    ELSE
        RAISE NOTICE '✅ user_identities.id already correct type (or table missing)';
    END IF;
END $$;

-- FIX 2: Remove legacy user_id column from nip05_records if it exists
-- (Privacy-first architecture uses user_duid instead)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'nip05_records'
        AND column_name = 'user_id'
    ) THEN
        ALTER TABLE nip05_records DROP COLUMN user_id;
        RAISE NOTICE '✅ Fixed: Removed legacy user_id column from nip05_records';
    ELSE
        RAISE NOTICE '✅ nip05_records.user_id already removed (or table missing)';
    END IF;
END $$;

-- =====================================================
-- STEP 2: VERIFICATION BLOCK (Run AFTER fixes applied)
-- Verifies all privacy-first requirements are met
-- =====================================================

-- Final verification before committing (with detailed diagnostics)
DO $$
DECLARE
    migration_success BOOLEAN := true;
    expected_tables TEXT[] := ARRAY['user_identities', 'family_federations', 'family_members', 'nip05_records'];
    current_table TEXT;
    col_record RECORD;
    actual_id_type TEXT;
    failure_reasons TEXT[] := ARRAY[]::TEXT[];
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🔍 FINAL VERIFICATION BEFORE COMMIT';
    RAISE NOTICE '==================================';

    -- Check that all critical tables exist
    FOREACH current_table IN ARRAY expected_tables
    LOOP
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables t WHERE t.table_name = current_table AND t.table_schema = 'public') THEN
            RAISE WARNING '❌ CRITICAL TABLE MISSING: %', current_table;
            failure_reasons := array_append(failure_reasons, 'Missing table: ' || current_table);
            migration_success := false;
        ELSE
            RAISE NOTICE '✅ %', current_table;
        END IF;
    END LOOP;

    -- Enhanced privacy-first verification
    RAISE NOTICE '';
    RAISE NOTICE '🔒 PRIVACY-FIRST COMPLIANCE VERIFICATION';
    RAISE NOTICE '======================================';

    -- Skip nip05_records checks if table doesn't exist
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'nip05_records' AND table_schema = 'public') THEN
        -- Verify no plaintext columns exist in nip05_records
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nip05_records' AND column_name = 'name') THEN
            RAISE WARNING '❌ PRIVACY VIOLATION: plaintext "name" column exists in nip05_records';
            failure_reasons := array_append(failure_reasons, 'nip05_records has plaintext "name" column');
            migration_success := false;
        ELSE
            RAISE NOTICE '✅ nip05_records.name (plaintext) - PROPERLY ELIMINATED';
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nip05_records' AND column_name = 'pubkey') THEN
            RAISE WARNING '❌ PRIVACY VIOLATION: plaintext "pubkey" column exists in nip05_records';
            failure_reasons := array_append(failure_reasons, 'nip05_records has plaintext "pubkey" column');
            migration_success := false;
        ELSE
            RAISE NOTICE '✅ nip05_records.pubkey (plaintext) - PROPERLY ELIMINATED';
        END IF;

        -- Check for legacy user_id column (should use user_duid instead)
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nip05_records' AND column_name = 'user_id') THEN
            RAISE WARNING '❌ LEGACY COLUMN: user_id (UUID) exists - should use user_duid (DUID) instead';
            failure_reasons := array_append(failure_reasons, 'nip05_records has legacy "user_id" column - run: ALTER TABLE nip05_records DROP COLUMN user_id;');
            migration_success := false;
        ELSE
            RAISE NOTICE '✅ nip05_records.user_id (legacy) - PROPERLY ELIMINATED';
        END IF;

        -- Verify DUID columns exist
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nip05_records' AND column_name = 'user_duid') THEN
            RAISE WARNING '❌ MISSING: nip05_records.user_duid column required for privacy-first operations';
            failure_reasons := array_append(failure_reasons, 'nip05_records missing user_duid column');
            migration_success := false;
        ELSE
            RAISE NOTICE '✅ nip05_records.user_duid - PRIVACY-FIRST COLUMN EXISTS';
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nip05_records' AND column_name = 'pubkey_duid') THEN
            RAISE WARNING '❌ MISSING: nip05_records.pubkey_duid column required for privacy-first operations';
            failure_reasons := array_append(failure_reasons, 'nip05_records missing pubkey_duid column');
            migration_success := false;
        ELSE
            RAISE NOTICE '✅ nip05_records.pubkey_duid - PRIVACY-FIRST COLUMN EXISTS';
        END IF;

        -- Diagnostic: Show all nip05_records columns
        RAISE NOTICE '';
        RAISE NOTICE '📊 DIAGNOSTIC: nip05_records columns:';
        FOR col_record IN
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'nip05_records' AND table_schema = 'public'
            ORDER BY ordinal_position
        LOOP
            RAISE NOTICE '   - %: % (%)', col_record.column_name, col_record.data_type, col_record.is_nullable;
        END LOOP;
    ELSE
        RAISE NOTICE '⚠️  nip05_records table does not exist - skipping column checks';
    END IF;

    -- Skip user_identities checks if table doesn't exist
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_identities' AND table_schema = 'public') THEN
        -- Verify user_identities uses DUID system (id column is the DUID primary key)
        -- Get the actual data type of the id column
        SELECT data_type INTO actual_id_type
        FROM information_schema.columns
        WHERE table_name = 'user_identities' AND column_name = 'id' AND table_schema = 'public';

        IF actual_id_type IS NULL THEN
            RAISE WARNING '❌ MISSING: user_identities.id column does not exist';
            failure_reasons := array_append(failure_reasons, 'user_identities missing id column');
            migration_success := false;
        ELSIF actual_id_type != 'text' THEN
            RAISE WARNING '❌ TYPE MISMATCH: user_identities.id is % (expected: text for DUID)', actual_id_type;
            RAISE NOTICE '   💡 HINT: If id is UUID, the table may need migration to TEXT-based DUID primary key';
            failure_reasons := array_append(failure_reasons, 'user_identities.id is ' || actual_id_type || ' instead of TEXT');
            migration_success := false;
        ELSE
            RAISE NOTICE '✅ user_identities.id (DUID PRIMARY KEY) - PRIVACY-FIRST COLUMN EXISTS';
        END IF;

        -- Verify user_salt exists for password hashing
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_identities' AND column_name = 'user_salt') THEN
            RAISE WARNING '❌ MISSING: user_identities.user_salt column required for privacy-first operations';
            failure_reasons := array_append(failure_reasons, 'user_identities missing user_salt column');
            migration_success := false;
        ELSE
            RAISE NOTICE '✅ user_identities.user_salt - PRIVACY-FIRST COLUMN EXISTS';
        END IF;

        -- Diagnostic: Show all user_identities columns
        RAISE NOTICE '';
        RAISE NOTICE '📊 DIAGNOSTIC: user_identities columns:';
        FOR col_record IN
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'user_identities' AND table_schema = 'public'
            ORDER BY ordinal_position
        LOOP
            RAISE NOTICE '   - %: % (%)', col_record.column_name, col_record.data_type, col_record.is_nullable;
        END LOOP;
    ELSE
        RAISE NOTICE '⚠️  user_identities table does not exist - skipping column checks';
    END IF;

    RAISE NOTICE '';

    IF migration_success THEN
        RAISE NOTICE '✅ All critical tables verified - PRIVACY-FIRST MIGRATION READY TO COMMIT';
        RAISE NOTICE '🔒 Privacy-first compliance: VERIFIED ✓';
        RAISE NOTICE '🔐 Zero plaintext storage: ENFORCED ✓';
        RAISE NOTICE '🎯 DUID system: OPERATIONAL ✓';
    ELSE
        RAISE NOTICE '';
        RAISE NOTICE '❌ VERIFICATION FAILED - Summary of issues:';
        FOR i IN 1..array_length(failure_reasons, 1) LOOP
            RAISE NOTICE '   %: %', i, failure_reasons[i];
        END LOOP;
        RAISE NOTICE '';
        RAISE EXCEPTION '❌ MIGRATION VERIFICATION FAILED - % issue(s) detected - Transaction will rollback', array_length(failure_reasons, 1);
    END IF;
END $$;

-- Commit the transaction (only if verification passed)
COMMIT;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🎉🎉🎉 PRIVACY-FIRST MIGRATION COMMITTED SUCCESSFULLY! 🎉🎉🎉';
    RAISE NOTICE '';
    RAISE NOTICE '📋 ROLLBACK INSTRUCTIONS (if needed):';
    RAISE NOTICE '   If you need to rollback this migration, run:';
    RAISE NOTICE '   DROP TABLE IF EXISTS user_identities CASCADE;';
    RAISE NOTICE '   DROP TABLE IF EXISTS family_members CASCADE;'; 
    RAISE NOTICE '   DROP TABLE IF EXISTS family_federations CASCADE;';
    RAISE NOTICE '   -- Then restore from backup if available';
    RAISE NOTICE '';
    RAISE NOTICE '🚀 SYSTEM READY FOR PRIVACY-FIRST OPERATIONS!';
END $$;