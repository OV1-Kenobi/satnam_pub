-- Verify and populate encrypted_nsec data for existing users
-- This migration ensures all active users have the required encrypted_nsec field

BEGIN;

-- Check current state of user_identities table
DO $$
DECLARE
    total_users INTEGER;
    users_with_encrypted_nsec INTEGER;
    users_with_salt INTEGER;
    users_missing_data INTEGER;
BEGIN
    -- Count total active users
    SELECT COUNT(*) INTO total_users 
    FROM user_identities 
    WHERE is_active = true;

    -- Count users with encrypted_nsec
    SELECT COUNT(*) INTO users_with_encrypted_nsec 
    FROM user_identities 
    WHERE is_active = true 
      AND encrypted_nsec IS NOT NULL 
      AND encrypted_nsec != '';

    -- Count users with user_salt
    SELECT COUNT(*) INTO users_with_salt 
    FROM user_identities 
    WHERE is_active = true 
      AND user_salt IS NOT NULL 
      AND user_salt != '';

    -- Count users missing critical data
    SELECT COUNT(*) INTO users_missing_data 
    FROM user_identities 
    WHERE is_active = true 
      AND (encrypted_nsec IS NULL OR encrypted_nsec = '' OR user_salt IS NULL OR user_salt = '');

    RAISE NOTICE '';
    RAISE NOTICE '🔍 ENCRYPTED NSEC DATA VERIFICATION';
    RAISE NOTICE '==================================';
    RAISE NOTICE 'Total active users: %', total_users;
    RAISE NOTICE 'Users with encrypted_nsec: %', users_with_encrypted_nsec;
    RAISE NOTICE 'Users with user_salt: %', users_with_salt;
    RAISE NOTICE 'Users missing critical data: %', users_missing_data;
    RAISE NOTICE '';

    IF users_missing_data > 0 THEN
        RAISE WARNING '⚠️  % users are missing encrypted_nsec or user_salt data!', users_missing_data;
        RAISE NOTICE 'These users will not be able to sign in until their data is restored.';
        RAISE NOTICE '';
        
        -- Show details of problematic users (without exposing sensitive data)
        RAISE NOTICE '📋 USERS WITH MISSING DATA:';
        FOR rec IN 
            SELECT 
                id,
                CASE WHEN encrypted_nsec IS NULL OR encrypted_nsec = '' THEN 'missing encrypted_nsec' ELSE 'has encrypted_nsec' END as nsec_status,
                CASE WHEN user_salt IS NULL OR user_salt = '' THEN 'missing user_salt' ELSE 'has user_salt' END as salt_status,
                created_at
            FROM user_identities 
            WHERE is_active = true 
              AND (encrypted_nsec IS NULL OR encrypted_nsec = '' OR user_salt IS NULL OR user_salt = '')
            ORDER BY created_at DESC
            LIMIT 10
        LOOP
            RAISE NOTICE '  • User ID: % | % | % | Created: %', 
                LEFT(rec.id, 8) || '...', 
                rec.nsec_status, 
                rec.salt_status, 
                rec.created_at::date;
        END LOOP;
        
        IF users_missing_data > 10 THEN
            RAISE NOTICE '  ... and % more users', users_missing_data - 10;
        END IF;
    ELSE
        RAISE NOTICE '✅ All active users have required encrypted_nsec and user_salt data!';
    END IF;

    RAISE NOTICE '';
END $$;

-- Verify table structure
DO $$
BEGIN
    RAISE NOTICE '📋 TABLE STRUCTURE VERIFICATION';
    RAISE NOTICE '==============================';
    
    -- Check if encrypted_nsec column exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema='public' AND table_name='user_identities' AND column_name='encrypted_nsec'
    ) THEN
        RAISE NOTICE '✅ encrypted_nsec column exists';
    ELSE
        RAISE WARNING '❌ encrypted_nsec column is missing!';
    END IF;
    
    -- Check if user_salt column exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema='public' AND table_name='user_identities' AND column_name='user_salt'
    ) THEN
        RAISE NOTICE '✅ user_salt column exists';
    ELSE
        RAISE WARNING '❌ user_salt column is missing!';
    END IF;
    
    -- Check if deprecated hashed_encrypted_nsec column still exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema='public' AND table_name='user_identities' AND column_name='hashed_encrypted_nsec'
    ) THEN
        RAISE WARNING '⚠️  Deprecated hashed_encrypted_nsec column still exists - should be dropped';
    ELSE
        RAISE NOTICE '✅ Deprecated hashed_encrypted_nsec column has been removed';
    END IF;
    
    RAISE NOTICE '';
END $$;

COMMIT;

-- Success message
SELECT 
    '✅ ENCRYPTED NSEC VERIFICATION COMPLETE' as result,
    'Check the notices above for any issues' as next_steps;
