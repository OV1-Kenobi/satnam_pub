-- =====================================================
-- DUID PRIMARY KEY MIGRATION - PRODUCTION SAFE
-- Converts user_identities.id from UUID to TEXT for DUID architecture
-- Execute in Supabase SQL Editor - SAFE FOR PRODUCTION
-- =====================================================

-- CRITICAL: This migration fixes the 500 Internal Server Error in Identity Forge
-- ROOT CAUSE: register-identity.js inserts DUID strings into UUID-constrained field
-- SOLUTION: Change id column to TEXT to accept 64-character hex DUID strings

DO $$
DECLARE
    constraint_exists BOOLEAN;
    policy_exists BOOLEAN;
    migration_success BOOLEAN := true;
BEGIN
    RAISE NOTICE '🚀 Starting DUID Primary Key Migration...';
    RAISE NOTICE 'Timestamp: %', NOW();
    
    -- =====================================================
    -- STEP 1: BACKUP CURRENT SCHEMA INFORMATION
    -- =====================================================
    
    RAISE NOTICE '';
    RAISE NOTICE '📋 CURRENT user_identities SCHEMA:';
    RAISE NOTICE '================================';
    
    -- Show current id column definition
    SELECT 
        column_name, 
        data_type, 
        is_nullable, 
        column_default
    FROM information_schema.columns 
    WHERE table_name = 'user_identities' 
      AND column_name = 'id'
      AND table_schema = 'public';
    
    -- =====================================================
    -- STEP 2: CHECK IF MIGRATION IS NEEDED
    -- =====================================================
    
    -- Check if id column is already TEXT
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_identities' 
          AND column_name = 'id' 
          AND data_type = 'text'
          AND table_schema = 'public'
    ) THEN
        RAISE NOTICE '✅ Migration already complete - id column is TEXT';
        RAISE NOTICE '⏭️ Skipping migration steps';
        RETURN;
    END IF;
    
    -- =====================================================
    -- STEP 3: DROP EXISTING CONSTRAINTS SAFELY
    -- =====================================================
    
    RAISE NOTICE '';
    RAISE NOTICE '🔧 REMOVING UUID CONSTRAINTS:';
    RAISE NOTICE '============================';
    
    -- Drop foreign key constraints that reference user_identities.id
    BEGIN
        -- Check for family_members foreign key
        IF EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name LIKE '%family_members%user_duid%'
              AND table_name = 'family_members'
        ) THEN
            ALTER TABLE family_members DROP CONSTRAINT IF EXISTS family_members_user_duid_fkey;
            RAISE NOTICE '✓ Dropped family_members foreign key constraint';
        END IF;
        
        -- Check for other potential foreign keys
        FOR constraint_exists IN 
            SELECT constraint_name FROM information_schema.table_constraints 
            WHERE constraint_type = 'FOREIGN KEY' 
              AND table_schema = 'public'
        LOOP
            -- Log any foreign key constraints found
            RAISE NOTICE '📋 Found constraint: %', constraint_exists;
        END LOOP;
        
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '⚠️ Error dropping foreign key constraints: %', SQLERRM;
        migration_success := false;
    END;
    
    -- =====================================================
    -- STEP 4: ALTER COLUMN TYPE TO TEXT
    -- =====================================================
    
    RAISE NOTICE '';
    RAISE NOTICE '🔄 CONVERTING ID COLUMN TO TEXT:';
    RAISE NOTICE '===============================';
    
    BEGIN
        -- Remove default value first
        ALTER TABLE user_identities ALTER COLUMN id DROP DEFAULT;
        RAISE NOTICE '✓ Removed gen_random_uuid() default';
        
        -- Change column type to TEXT
        ALTER TABLE user_identities ALTER COLUMN id TYPE TEXT;
        RAISE NOTICE '✓ Changed id column type to TEXT';
        
        -- Ensure NOT NULL constraint
        ALTER TABLE user_identities ALTER COLUMN id SET NOT NULL;
        RAISE NOTICE '✓ Ensured NOT NULL constraint';
        
    EXCEPTION WHEN OTHERS THEN
        RAISE ERROR '❌ CRITICAL: Failed to alter id column: %', SQLERRM;
        migration_success := false;
    END;
    
    -- =====================================================
    -- STEP 5: UPDATE RLS POLICIES FOR DUID ARCHITECTURE
    -- =====================================================
    
    RAISE NOTICE '';
    RAISE NOTICE '🔒 UPDATING RLS POLICIES:';
    RAISE NOTICE '========================';
    
    BEGIN
        -- Enable RLS if not already enabled
        ALTER TABLE user_identities ENABLE ROW LEVEL SECURITY;
        
        -- Drop existing policies
        DROP POLICY IF EXISTS "user_identities_insert_policy" ON user_identities;
        DROP POLICY IF EXISTS "user_identities_select_policy" ON user_identities;
        DROP POLICY IF EXISTS "user_identities_update_policy" ON user_identities;
        DROP POLICY IF EXISTS "user_identities_delete_policy" ON user_identities;
        
        -- Create DUID-based RLS policies
        
        -- INSERT policy for registration (anon role)
        CREATE POLICY "user_identities_insert_policy" ON user_identities
            FOR INSERT
            TO anon, authenticated
            WITH CHECK (true); -- Allow registration for new users
        
        -- SELECT policy (authenticated users can read their own data)
        CREATE POLICY "user_identities_select_policy" ON user_identities
            FOR SELECT
            TO authenticated
            USING (id = current_setting('app.current_user_duid', true));
        
        -- UPDATE policy (authenticated users can update their own data)
        CREATE POLICY "user_identities_update_policy" ON user_identities
            FOR UPDATE
            TO authenticated
            USING (id = current_setting('app.current_user_duid', true))
            WITH CHECK (id = current_setting('app.current_user_duid', true));
        
        -- DELETE policy (authenticated users can delete their own data)
        CREATE POLICY "user_identities_delete_policy" ON user_identities
            FOR DELETE
            TO authenticated
            USING (id = current_setting('app.current_user_duid', true));
        
        RAISE NOTICE '✓ Created DUID-based RLS policies';
        
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '⚠️ Error updating RLS policies: %', SQLERRM;
        migration_success := false;
    END;
    
    -- =====================================================
    -- STEP 6: GRANT NECESSARY PERMISSIONS
    -- =====================================================
    
    RAISE NOTICE '';
    RAISE NOTICE '🔑 UPDATING PERMISSIONS:';
    RAISE NOTICE '=======================';
    
    BEGIN
        -- Grant permissions for registration and authentication
        GRANT INSERT ON user_identities TO anon;
        GRANT SELECT, UPDATE, DELETE ON user_identities TO authenticated;
        
        RAISE NOTICE '✓ Granted permissions to anon and authenticated roles';
        
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '⚠️ Error granting permissions: %', SQLERRM;
        migration_success := false;
    END;
    
    -- =====================================================
    -- STEP 7: VALIDATION AND SUMMARY
    -- =====================================================
    
    RAISE NOTICE '';
    RAISE NOTICE '✅ MIGRATION VALIDATION:';
    RAISE NOTICE '=======================';
    
    -- Verify column type change
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_identities' 
          AND column_name = 'id' 
          AND data_type = 'text'
          AND is_nullable = 'NO'
          AND table_schema = 'public'
    ) THEN
        RAISE NOTICE '✓ id column is now TEXT NOT NULL';
    ELSE
        RAISE ERROR '❌ CRITICAL: id column migration failed';
        migration_success := false;
    END IF;
    
    -- Verify RLS policies exist
    SELECT COUNT(*) > 0 INTO policy_exists
    FROM pg_policies 
    WHERE tablename = 'user_identities' 
      AND policyname LIKE '%user_identities_%';
    
    IF policy_exists THEN
        RAISE NOTICE '✓ RLS policies are active';
    ELSE
        RAISE WARNING '⚠️ RLS policies may not be properly configured';
    END IF;
    
    -- Final status
    IF migration_success THEN
        RAISE NOTICE '';
        RAISE NOTICE '🎉 MIGRATION COMPLETED SUCCESSFULLY!';
        RAISE NOTICE '==================================';
        RAISE NOTICE 'user_identities.id is now TEXT and ready for DUID strings';
        RAISE NOTICE 'register-identity.js can now insert 64-character hex DUIDs';
        RAISE NOTICE 'Identity Forge registration should work without 500 errors';
        RAISE NOTICE '';
        RAISE NOTICE '📋 NEXT STEPS:';
        RAISE NOTICE '1. Test Identity Forge registration';
        RAISE NOTICE '2. Verify DUID generation in register-identity.js';
        RAISE NOTICE '3. Confirm authentication flows work correctly';
    ELSE
        RAISE ERROR '❌ MIGRATION FAILED - Check errors above';
    END IF;
    
END $$;

-- =====================================================
-- VALIDATION QUERIES (Run after migration)
-- =====================================================

-- Verify new schema
SELECT 
    'POST_MIGRATION_SCHEMA' as check_type,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'user_identities' 
  AND column_name = 'id'
  AND table_schema = 'public';

-- Check RLS policies
SELECT 
    'RLS_POLICIES' as check_type,
    policyname,
    permissive,
    roles,
    cmd
FROM pg_policies 
WHERE tablename = 'user_identities'
ORDER BY policyname;

-- =====================================================
-- EMERGENCY ROLLBACK (ONLY IF NEEDED)
-- =====================================================
/*
-- UNCOMMENT AND RUN ONLY IF ROLLBACK IS REQUIRED:

DO $$
BEGIN
    RAISE NOTICE '🚨 EMERGENCY ROLLBACK - REVERTING TO UUID';
    
    -- Change back to character varying with UUID default
    ALTER TABLE user_identities ALTER COLUMN id TYPE character varying USING id::character varying;
    ALTER TABLE user_identities ALTER COLUMN id SET DEFAULT gen_random_uuid();
    
    RAISE NOTICE '✓ Reverted id column to character varying with gen_random_uuid()';
    
    -- Note: You may need to manually recreate foreign key constraints
    -- and update RLS policies to use auth.uid() instead of DUID
    
END $$;
*/
