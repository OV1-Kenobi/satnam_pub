-- Verify Registration Flow After Database Reset
-- Tests that new user registrations will properly populate required fields

BEGIN;

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🧪 REGISTRATION FLOW VERIFICATION';
    RAISE NOTICE '=================================';
END $$;

-- =============================================================================
-- STEP 1: VERIFY TABLE SCHEMA IS READY
-- =============================================================================

DO $$
DECLARE
    has_user_salt BOOLEAN := FALSE;
    has_encrypted_nsec BOOLEAN := FALSE;
    has_encrypted_nsec_iv BOOLEAN := FALSE;
    has_deprecated_hashed BOOLEAN := FALSE;
    constraint_exists BOOLEAN := FALSE;
BEGIN
    RAISE NOTICE '🔍 Checking table schema...';
    
    -- Check for required columns
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema='public' AND table_name='user_identities' AND column_name='user_salt'
    ) INTO has_user_salt;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema='public' AND table_name='user_identities' AND column_name='encrypted_nsec'
    ) INTO has_encrypted_nsec;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema='public' AND table_name='user_identities' AND column_name='encrypted_nsec_iv'
    ) INTO has_encrypted_nsec_iv;
    
    -- Check for deprecated column
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema='public' AND table_name='user_identities' AND column_name='hashed_encrypted_nsec'
    ) INTO has_deprecated_hashed;
    
    -- Check for salt constraint
    SELECT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'check_active_users_have_salt' 
          AND table_schema = 'public' 
          AND table_name = 'user_identities'
    ) INTO constraint_exists;
    
    -- Report schema status
    IF has_user_salt AND has_encrypted_nsec AND has_encrypted_nsec_iv AND NOT has_deprecated_hashed AND constraint_exists THEN
        RAISE NOTICE '✅ Schema is ready for registration flow';
        RAISE NOTICE '  • user_salt: ✅';
        RAISE NOTICE '  • encrypted_nsec: ✅';
        RAISE NOTICE '  • encrypted_nsec_iv: ✅';
        RAISE NOTICE '  • hashed_encrypted_nsec (deprecated): ✅ REMOVED';
        RAISE NOTICE '  • salt constraint: ✅';
    ELSE
        RAISE WARNING '❌ Schema issues detected:';
        IF NOT has_user_salt THEN RAISE WARNING '  • Missing user_salt column'; END IF;
        IF NOT has_encrypted_nsec THEN RAISE WARNING '  • Missing encrypted_nsec column'; END IF;
        IF NOT has_encrypted_nsec_iv THEN RAISE WARNING '  • Missing encrypted_nsec_iv column'; END IF;
        IF has_deprecated_hashed THEN RAISE WARNING '  • Deprecated hashed_encrypted_nsec still exists'; END IF;
        IF NOT constraint_exists THEN RAISE WARNING '  • Missing salt constraint'; END IF;
    END IF;
END $$;

-- =============================================================================
-- STEP 2: SIMULATE REGISTRATION DATA INSERTION
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🧪 Testing registration data insertion...';
END $$;

-- Create a test user record to verify the flow
DO $$
DECLARE
    test_user_id TEXT := 'test_user_' || extract(epoch from now())::text;
    test_salt TEXT := 'test_salt_' || extract(epoch from now())::text;
    test_encrypted_nsec TEXT := 'test_encrypted_nsec_data_' || extract(epoch from now())::text;
    insertion_success BOOLEAN := FALSE;
BEGIN
    -- Attempt to insert test user
    BEGIN
        INSERT INTO user_identities (
            id,
            user_salt,
            encrypted_nsec,
            encrypted_nsec_iv,
            hashed_username,
            hashed_npub,
            hashed_nip05,
            password_hash,
            password_salt,
            role,
            is_active,
            created_at,
            updated_at
        ) VALUES (
            test_user_id,
            test_salt,
            test_encrypted_nsec,
            NULL, -- IV included in encrypted_nsec for current format
            'hashed_test_username',
            'hashed_test_npub',
            'hashed_test_nip05',
            'test_password_hash',
            'test_password_salt',
            'private',
            true,
            now(),
            now()
        );
        
        insertion_success := TRUE;
        RAISE NOTICE '✅ Test user insertion successful';
        
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '❌ Test user insertion failed: %', SQLERRM;
        insertion_success := FALSE;
    END;
    
    -- Verify the inserted data
    IF insertion_success THEN
        DECLARE
            retrieved_user RECORD;
        BEGIN
            SELECT 
                id,
                user_salt,
                encrypted_nsec,
                encrypted_nsec_iv,
                is_active,
                role
            INTO retrieved_user
            FROM user_identities 
            WHERE id = test_user_id;
            
            IF FOUND THEN
                RAISE NOTICE '✅ Test user data verification:';
                RAISE NOTICE '  • ID: %', retrieved_user.id;
                RAISE NOTICE '  • Has user_salt: %', (retrieved_user.user_salt IS NOT NULL);
                RAISE NOTICE '  • Has encrypted_nsec: %', (retrieved_user.encrypted_nsec IS NOT NULL);
                RAISE NOTICE '  • Is active: %', retrieved_user.is_active;
                RAISE NOTICE '  • Role: %', retrieved_user.role;
                
                -- Check if this user would pass authentication requirements
                IF retrieved_user.user_salt IS NOT NULL AND retrieved_user.encrypted_nsec IS NOT NULL THEN
                    RAISE NOTICE '✅ User would pass authentication requirements';
                ELSE
                    RAISE WARNING '❌ User missing required authentication fields';
                END IF;
            ELSE
                RAISE WARNING '❌ Could not retrieve inserted test user';
            END IF;
        END;
        
        -- Clean up test user
        DELETE FROM user_identities WHERE id = test_user_id;
        RAISE NOTICE '🧹 Test user cleaned up';
    END IF;
END $$;

-- =============================================================================
-- STEP 3: VERIFY CONSTRAINT ENFORCEMENT
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🔒 Testing constraint enforcement...';
END $$;

-- Test that active users must have salt
DO $$
DECLARE
    constraint_working BOOLEAN := FALSE;
    test_user_id TEXT := 'constraint_test_' || extract(epoch from now())::text;
BEGIN
    -- Try to insert active user without salt (should fail)
    BEGIN
        INSERT INTO user_identities (
            id,
            user_salt,
            encrypted_nsec,
            hashed_username,
            hashed_npub,
            hashed_nip05,
            password_hash,
            password_salt,
            role,
            is_active,
            created_at,
            updated_at
        ) VALUES (
            test_user_id,
            NULL, -- This should trigger constraint violation
            'test_encrypted_nsec',
            'hashed_test_username',
            'hashed_test_npub',
            'hashed_test_nip05',
            'test_password_hash',
            'test_password_salt',
            'private',
            true, -- Active user without salt should fail
            now(),
            now()
        );
        
        -- If we get here, constraint is not working
        DELETE FROM user_identities WHERE id = test_user_id;
        RAISE WARNING '❌ Salt constraint is not enforcing (active user without salt was allowed)';
        
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE '✅ Salt constraint is working (correctly rejected active user without salt)';
        constraint_working := TRUE;
    WHEN OTHERS THEN
        RAISE WARNING '⚠️  Unexpected error testing constraint: %', SQLERRM;
    END;
END $$;

-- =============================================================================
-- STEP 4: FINAL VERIFICATION SUMMARY
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '📋 FINAL VERIFICATION SUMMARY';
    RAISE NOTICE '=============================';
END $$;

DO $$
DECLARE
    total_users INTEGER;
    schema_ready BOOLEAN := TRUE;
BEGIN
    -- Count current users
    SELECT COUNT(*) INTO total_users FROM user_identities;
    
    -- Check schema readiness
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema='public' AND table_name='user_identities' 
          AND column_name IN ('user_salt', 'encrypted_nsec', 'encrypted_nsec_iv')
        HAVING COUNT(*) = 3
    ) THEN
        schema_ready := FALSE;
    END IF;
    
    RAISE NOTICE 'Database Status:';
    RAISE NOTICE '  • Total users: %', total_users;
    RAISE NOTICE '  • Schema ready: %', CASE WHEN schema_ready THEN '✅ YES' ELSE '❌ NO' END;
    
    IF total_users = 0 AND schema_ready THEN
        RAISE NOTICE '';
        RAISE NOTICE '🎉 DATABASE IS READY FOR NEW REGISTRATIONS';
        RAISE NOTICE '==========================================';
        RAISE NOTICE 'New users will be created with:';
        RAISE NOTICE '  • user_salt (for decryption)';
        RAISE NOTICE '  • encrypted_nsec (decryptable ciphertext)';
        RAISE NOTICE '  • encrypted_nsec_iv (optional, for future use)';
        RAISE NOTICE '';
        RAISE NOTICE 'Authentication flow will work because:';
        RAISE NOTICE '  • RecoverySessionBridge expects encrypted_nsec + user_salt';
        RAISE NOTICE '  • Registration endpoint now stores encrypted_nsec';
        RAISE NOTICE '  • Session-user endpoints return encrypted_nsec';
        RAISE NOTICE '';
    ELSE
        RAISE WARNING '⚠️  Issues detected - registration may not work properly';
    END IF;
END $$;

COMMIT;

-- Final success message
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ REGISTRATION FLOW VERIFICATION COMPLETE';
    RAISE NOTICE 'Check the notices above for any issues';
    RAISE NOTICE '';
    RAISE NOTICE 'If all checks passed, your database is ready for the authentication flow!';
END $$;
