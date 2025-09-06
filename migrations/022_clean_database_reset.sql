-- Clean Database Reset for Test Environment
-- Removes all test user data and verifies schema for authentication flow

BEGIN;

-- =============================================================================
-- STEP 1: SAFE DELETION OF ALL TEST USER DATA
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🧹 STARTING CLEAN DATABASE RESET';
    RAISE NOTICE '================================';
END $$;

-- Count records before deletion (only from tables that exist)
DO $$
DECLARE
    user_count INTEGER := 0;
    contact_count INTEGER := 0;
    group_count INTEGER := 0;
    message_count INTEGER := 0;
BEGIN
    -- Count only from tables that exist
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_identities') THEN
        SELECT COUNT(*) INTO user_count FROM user_identities;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='encrypted_contacts') THEN
        SELECT COUNT(*) INTO contact_count FROM encrypted_contacts;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='encrypted_groups') THEN
        SELECT COUNT(*) INTO group_count FROM encrypted_groups;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='gift_wrapped_messages') THEN
        SELECT COUNT(*) INTO message_count FROM gift_wrapped_messages;
    END IF;

    RAISE NOTICE 'Records before cleanup:';
    RAISE NOTICE '  • user_identities: %', user_count;
    RAISE NOTICE '  • encrypted_contacts: %', contact_count;
    RAISE NOTICE '  • encrypted_groups: %', group_count;
    RAISE NOTICE '  • gift_wrapped_messages: %', message_count;
    RAISE NOTICE '';
END $$;

-- Delete user-related data in dependency order
DO $$
BEGIN
    RAISE NOTICE '🗑️  Deleting user-related data...';
END $$;

-- Delete data from tables that exist (conditional deletion)
DO $$
BEGIN
    -- Delete messaging data
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='gift_wrapped_messages') THEN
        DELETE FROM gift_wrapped_messages;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='encrypted_contacts') THEN
        DELETE FROM encrypted_contacts;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='encrypted_groups') THEN
        DELETE FROM encrypted_groups;
    END IF;

    -- Delete family/federation data
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='family_members') THEN
        DELETE FROM family_members;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='family_federations') THEN
        DELETE FROM family_federations;
    END IF;

    -- Delete authentication and session data
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_auth_attempts') THEN
        DELETE FROM user_auth_attempts;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_signing_preferences') THEN
        DELETE FROM user_signing_preferences;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_privacy_metrics') THEN
        DELETE FROM user_privacy_metrics;
    END IF;

    -- Delete vault and security data
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='vault_access_log') THEN
        DELETE FROM vault_access_log;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='vault_credentials') THEN
        DELETE FROM vault_credentials;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='vault_secrets') THEN
        DELETE FROM vault_secrets;
    END IF;

    -- Delete emergency recovery data
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='emergency_recovery_attempts') THEN
        DELETE FROM emergency_recovery_attempts;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='emergency_recovery_events') THEN
        DELETE FROM emergency_recovery_events;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='emergency_recovery_requests') THEN
        DELETE FROM emergency_recovery_requests;
    END IF;

    -- Delete financial/payment data
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='cashu_tokens') THEN
        DELETE FROM cashu_tokens;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='cross_mint_payment_tracking') THEN
        DELETE FROM cross_mint_payment_tracking;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='threshold_payments') THEN
        DELETE FROM threshold_payments;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='transaction_approvals') THEN
        DELETE FROM transaction_approvals;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='wallet_rate_limits') THEN
        DELETE FROM wallet_rate_limits;
    END IF;

    -- Delete educational data
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='badge_awards') THEN
        DELETE FROM badge_awards;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='reward_redemptions') THEN
        DELETE FROM reward_redemptions;
    END IF;

    -- Finally, delete all user identities (this table should always exist)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_identities') THEN
        DELETE FROM user_identities;
    END IF;
END $$;

DO $$
BEGIN
    RAISE NOTICE '✅ All test user data deleted successfully';
END $$;

-- =============================================================================
-- STEP 2: VERIFY AND FIX TABLE SCHEMA
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🔍 VERIFYING TABLE SCHEMA';
    RAISE NOTICE '========================';
END $$;

-- Check user_identities table structure
DO $$
DECLARE
    has_user_salt BOOLEAN := FALSE;
    has_encrypted_nsec BOOLEAN := FALSE;
    has_encrypted_nsec_iv BOOLEAN := FALSE;
    has_deprecated_hashed BOOLEAN := FALSE;
BEGIN
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
    
    -- Report findings
    RAISE NOTICE 'Schema verification:';
    RAISE NOTICE '  • user_salt: %', CASE WHEN has_user_salt THEN '✅ EXISTS' ELSE '❌ MISSING' END;
    RAISE NOTICE '  • encrypted_nsec: %', CASE WHEN has_encrypted_nsec THEN '✅ EXISTS' ELSE '❌ MISSING' END;
    RAISE NOTICE '  • encrypted_nsec_iv: %', CASE WHEN has_encrypted_nsec_iv THEN '✅ EXISTS' ELSE '❌ MISSING' END;
    RAISE NOTICE '  • hashed_encrypted_nsec (deprecated): %', CASE WHEN has_deprecated_hashed THEN '⚠️  STILL EXISTS' ELSE '✅ REMOVED' END;
    
    -- Add missing columns
    IF NOT has_user_salt THEN
        ALTER TABLE user_identities ADD COLUMN user_salt TEXT;
        RAISE NOTICE '➕ Added user_salt column';
    END IF;
    
    IF NOT has_encrypted_nsec THEN
        ALTER TABLE user_identities ADD COLUMN encrypted_nsec TEXT;
        RAISE NOTICE '➕ Added encrypted_nsec column';
    END IF;
    
    IF NOT has_encrypted_nsec_iv THEN
        ALTER TABLE user_identities ADD COLUMN encrypted_nsec_iv TEXT;
        RAISE NOTICE '➕ Added encrypted_nsec_iv column';
    END IF;
    
    -- Remove deprecated column if it still exists
    IF has_deprecated_hashed THEN
        ALTER TABLE user_identities DROP COLUMN hashed_encrypted_nsec;
        RAISE NOTICE '🗑️  Removed deprecated hashed_encrypted_nsec column';
    END IF;
END $$;

-- =============================================================================
-- STEP 3: VERIFY CONSTRAINTS AND INDEXES
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🔧 VERIFYING CONSTRAINTS AND INDEXES';
    RAISE NOTICE '====================================';
END $$;

-- Ensure required constraints exist
DO $$
BEGIN
    -- Check if salt constraint exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'check_active_users_have_salt' 
          AND table_schema = 'public' 
          AND table_name = 'user_identities'
    ) THEN
        ALTER TABLE user_identities 
        ADD CONSTRAINT check_active_users_have_salt 
        CHECK (NOT is_active OR (user_salt IS NOT NULL AND user_salt != ''));
        RAISE NOTICE '➕ Added salt constraint for active users';
    ELSE
        RAISE NOTICE '✅ Salt constraint already exists';
    END IF;
END $$;

-- Verify essential indexes exist
DO $$
BEGIN
    -- Check for primary key index
    IF EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE schemaname = 'public' 
          AND tablename = 'user_identities' 
          AND indexname LIKE '%pkey'
    ) THEN
        RAISE NOTICE '✅ Primary key index exists';
    ELSE
        RAISE WARNING '⚠️  Primary key index missing';
    END IF;
    
    -- Check for user_salt index (for performance)
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE schemaname = 'public' 
          AND tablename = 'user_identities' 
          AND indexname = 'idx_user_identities_user_salt'
    ) THEN
        CREATE INDEX idx_user_identities_user_salt ON user_identities(user_salt) WHERE user_salt IS NOT NULL;
        RAISE NOTICE '➕ Added user_salt index for performance';
    ELSE
        RAISE NOTICE '✅ User salt index already exists';
    END IF;
END $$;

-- =============================================================================
-- STEP 4: FINAL VERIFICATION
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ FINAL VERIFICATION';
    RAISE NOTICE '====================';
END $$;

-- Count records after cleanup
DO $$
DECLARE
    user_count INTEGER := 0;
    total_records INTEGER := 0;
    temp_count INTEGER := 0;
BEGIN
    -- Count user_identities if it exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_identities') THEN
        SELECT COUNT(*) INTO user_count FROM user_identities;
        total_records := total_records + user_count;
    END IF;

    -- Count all user-related tables that exist
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='encrypted_contacts') THEN
        SELECT COUNT(*) INTO temp_count FROM encrypted_contacts;
        total_records := total_records + temp_count;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='encrypted_groups') THEN
        SELECT COUNT(*) INTO temp_count FROM encrypted_groups;
        total_records := total_records + temp_count;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='gift_wrapped_messages') THEN
        SELECT COUNT(*) INTO temp_count FROM gift_wrapped_messages;
        total_records := total_records + temp_count;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='family_members') THEN
        SELECT COUNT(*) INTO temp_count FROM family_members;
        total_records := total_records + temp_count;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='family_federations') THEN
        SELECT COUNT(*) INTO temp_count FROM family_federations;
        total_records := total_records + temp_count;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_auth_attempts') THEN
        SELECT COUNT(*) INTO temp_count FROM user_auth_attempts;
        total_records := total_records + temp_count;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_signing_preferences') THEN
        SELECT COUNT(*) INTO temp_count FROM user_signing_preferences;
        total_records := total_records + temp_count;
    END IF;
    
    RAISE NOTICE 'Database state after cleanup:';
    RAISE NOTICE '  • user_identities: % records', user_count;
    RAISE NOTICE '  • Total user-related records: %', total_records;
    
    IF total_records = 0 THEN
        RAISE NOTICE '✅ Database successfully reset to clean state';
    ELSE
        RAISE WARNING '⚠️  Some records may remain: % total', total_records;
    END IF;
END $$;

-- Show final table structure
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '📋 FINAL TABLE STRUCTURE:';
END $$;
SELECT 
    column_name,
    data_type,
    is_nullable,
    COALESCE(column_default, 'NULL') as default_value
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'user_identities'
  AND column_name IN ('id', 'user_salt', 'encrypted_nsec', 'encrypted_nsec_iv', 'is_active', 'role')
ORDER BY 
    CASE column_name 
        WHEN 'id' THEN 1
        WHEN 'user_salt' THEN 2
        WHEN 'encrypted_nsec' THEN 3
        WHEN 'encrypted_nsec_iv' THEN 4
        WHEN 'is_active' THEN 5
        WHEN 'role' THEN 6
        ELSE 99
    END;

COMMIT;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🎉 DATABASE RESET COMPLETE';
    RAISE NOTICE 'Ready for new user registrations with proper authentication flow';
    RAISE NOTICE '';
    RAISE NOTICE '✅ Next steps:';
    RAISE NOTICE '  1. Test new user registration through your UI';
    RAISE NOTICE '  2. Verify NIP-05/password sign-in works';
    RAISE NOTICE '  3. Confirm message sending works from Communications page';
    RAISE NOTICE '  4. Check browser console for authentication errors';
END $$;
