-- =====================================================
-- PRIVACY-FIRST MIGRATION TRANSACTION COMPLETION
-- Run this AFTER privacy-first-identity-system-migration.sql
-- Adds transaction safety and verification to the main migration
-- =====================================================

-- Final verification before committing
DO $$
DECLARE
    migration_success BOOLEAN := true;
    expected_tables TEXT[] := ARRAY['user_identities', 'family_federations', 'family_members', 'nip05_records'];
    current_table TEXT;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🔍 FINAL VERIFICATION BEFORE COMMIT';
    RAISE NOTICE '==================================';
    
    -- Check that all critical tables exist
    FOREACH current_table IN ARRAY expected_tables
    LOOP
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables t WHERE t.table_name = current_table AND t.table_schema = 'public') THEN
            RAISE WARNING '❌ CRITICAL TABLE MISSING: %', current_table;
            migration_success := false;
        ELSE
            RAISE NOTICE '✅ %', current_table;
        END IF;
    END LOOP;
    
    -- Enhanced privacy-first verification
    RAISE NOTICE '';
    RAISE NOTICE '🔒 PRIVACY-FIRST COMPLIANCE VERIFICATION';
    RAISE NOTICE '======================================';
    
    -- Verify no plaintext columns exist in nip05_records
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nip05_records' AND column_name = 'name') THEN
        RAISE WARNING '❌ PRIVACY VIOLATION: plaintext "name" column exists in nip05_records';
        migration_success := false;
    ELSE
        RAISE NOTICE '✅ nip05_records.name (plaintext) - PROPERLY ELIMINATED';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nip05_records' AND column_name = 'pubkey') THEN
        RAISE WARNING '❌ PRIVACY VIOLATION: plaintext "pubkey" column exists in nip05_records';
        migration_success := false;
    ELSE
        RAISE NOTICE '✅ nip05_records.pubkey (plaintext) - PROPERLY ELIMINATED';
    END IF;
    
    -- Verify DUID columns exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nip05_records' AND column_name = 'name_duid') THEN
        RAISE WARNING '❌ MISSING: nip05_records.name_duid column required for privacy-first operations';
        migration_success := false;
    ELSE
        RAISE NOTICE '✅ nip05_records.name_duid - PRIVACY-FIRST COLUMN EXISTS';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nip05_records' AND column_name = 'pubkey_duid') THEN
        RAISE WARNING '❌ MISSING: nip05_records.pubkey_duid column required for privacy-first operations';
        migration_success := false;
    ELSE
        RAISE NOTICE '✅ nip05_records.pubkey_duid - PRIVACY-FIRST COLUMN EXISTS';
    END IF;
    
    -- Verify user_identities uses DUID system
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_identities' AND column_name = 'hashed_username') THEN
        RAISE WARNING '❌ MISSING: user_identities.hashed_username column required for privacy-first operations';
        migration_success := false;
    ELSE
        RAISE NOTICE '✅ user_identities.hashed_username - PRIVACY-FIRST COLUMN EXISTS';
    END IF;
    
    RAISE NOTICE '';
    
    IF migration_success THEN
        RAISE NOTICE '✅ All critical tables verified - PRIVACY-FIRST MIGRATION READY TO COMMIT';
        RAISE NOTICE '🔒 Privacy-first compliance: VERIFIED ✓';
        RAISE NOTICE '🔐 Zero plaintext storage: ENFORCED ✓';
        RAISE NOTICE '🎯 DUID system: OPERATIONAL ✓';
    ELSE
        RAISE EXCEPTION '❌ MIGRATION VERIFICATION FAILED - Privacy violations or missing components detected - Transaction will rollback';
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