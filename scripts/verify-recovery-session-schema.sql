-- Recovery Session Integration Schema Verification
-- Verifies that all required tables and columns exist for recovery-based session creation

-- Check if user_identities table has required columns for Individual recovery
DO $$
BEGIN
    -- Check if user_identities table exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_identities' AND table_schema = 'public') THEN
        RAISE EXCEPTION 'user_identities table does not exist. Please run privacy-first-identity-system-migration.sql first.';
    END IF;

    -- Check required columns for Individual recovery
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_identities' AND column_name = 'hashed_encrypted_nsec' AND table_schema = 'public') THEN
        RAISE EXCEPTION 'user_identities.hashed_encrypted_nsec column missing. Required for nsec decryption.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_identities' AND column_name = 'user_salt' AND table_schema = 'public') THEN
        RAISE EXCEPTION 'user_identities.user_salt column missing. Required for nsec decryption.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_identities' AND column_name = 'password_hash' AND table_schema = 'public') THEN
        RAISE EXCEPTION 'user_identities.password_hash column missing. Required for authentication.';
    END IF;

    RAISE NOTICE '✓ user_identities table has all required columns for Individual recovery';
END $$;

-- Check if emergency recovery tables exist (optional but recommended)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'emergency_recovery_requests' AND table_schema = 'public') THEN
        RAISE NOTICE '✓ emergency_recovery_requests table exists (enhanced recovery features available)';
    ELSE
        RAISE NOTICE '⚠ emergency_recovery_requests table missing (basic recovery only)';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'emergency_recovery_backups' AND table_schema = 'public') THEN
        RAISE NOTICE '✓ emergency_recovery_backups table exists (backup recovery available)';
    ELSE
        RAISE NOTICE '⚠ emergency_recovery_backups table missing (no backup recovery)';
    END IF;
END $$;

-- Verify RLS policies for user_identities
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'user_identities' 
        AND policyname LIKE '%read%own%' 
        AND schemaname = 'public'
    ) THEN
        RAISE NOTICE '✓ user_identities has user-specific RLS policies';
    ELSE
        RAISE NOTICE '⚠ user_identities may be missing proper RLS policies';
    END IF;
END $$;

-- Test query to verify data structure (without exposing sensitive data)
DO $$
DECLARE
    user_count INTEGER;
    users_with_nsec INTEGER;
BEGIN
    SELECT COUNT(*) INTO user_count FROM user_identities;
    SELECT COUNT(*) INTO users_with_nsec FROM user_identities WHERE hashed_encrypted_nsec IS NOT NULL;
    
    RAISE NOTICE '📊 Database Status:';
    RAISE NOTICE '   - Total users: %', user_count;
    RAISE NOTICE '   - Users with encrypted nsec: %', users_with_nsec;
    RAISE NOTICE '   - Users eligible for recovery sessions: %', users_with_nsec;
END $$;

-- Summary
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🔐 Recovery Session Integration Status:';
    RAISE NOTICE '   ✓ Schema verification complete';
    RAISE NOTICE '   ✓ Individual user recovery supported';
    RAISE NOTICE '   ✓ Ready for recovery-based session creation';
    RAISE NOTICE '';
    RAISE NOTICE '📝 Next Steps:';
    RAISE NOTICE '   1. Test recovery session creation in the UI';
    RAISE NOTICE '   2. Verify hybrid message signing works';
    RAISE NOTICE '   3. Check session expiration and cleanup';
END $$;
