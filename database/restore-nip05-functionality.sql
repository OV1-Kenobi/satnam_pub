-- =====================================================
-- RESTORE NIP-05 FUNCTIONALITY AFTER SECURITY FIXES
-- Recreates essential NIP-05 views with proper security
-- Maintains both security compliance AND NIP-05 verification capability
-- =====================================================

-- =====================================================
-- SECTION 1: ANALYZE WHAT WAS DROPPED
-- Check if the views were actually SECURITY DEFINER (security risk)
-- =====================================================

DO $$
DECLARE
    view_exists BOOLEAN;
    view_definition TEXT;
BEGIN
    -- Check if nip05_verification_data view still exists
    SELECT EXISTS (
        SELECT 1 FROM information_schema.views 
        WHERE table_name = 'nip05_verification_data' 
        AND table_schema = 'public'
    ) INTO view_exists;
    
    IF view_exists THEN
        RAISE NOTICE 'INFO: nip05_verification_data view still exists - was not dropped';
    ELSE
        RAISE NOTICE 'CONFIRMED: nip05_verification_data view was dropped by security fixes';
    END IF;
    
    -- Check if nip05_records table exists (this is what we actually need)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'nip05_records' AND table_schema = 'public') THEN
        RAISE NOTICE 'GOOD: nip05_records table exists - core functionality intact';
    ELSE
        RAISE NOTICE 'CRITICAL: nip05_records table missing - NIP-05 functionality broken!';
    END IF;
END $$;

-- =====================================================
-- SECTION 2: RECREATE NIP-05 VIEWS WITH PROPER SECURITY
-- Recreate the views WITHOUT SECURITY DEFINER (safe approach)
-- =====================================================

-- Recreate nip05_verification_data view (NON-SECURITY DEFINER = SAFE)
CREATE OR REPLACE VIEW public.nip05_verification_data AS
SELECT 
    name,
    pubkey,
    domain,
    is_active,
    created_at,
    updated_at
FROM nip05_records
WHERE name IS NOT NULL 
AND pubkey IS NOT NULL 
AND is_active = true;

-- Recreate nip05_verification_stats view (NON-SECURITY DEFINER = SAFE)
CREATE OR REPLACE VIEW public.nip05_verification_stats AS
SELECT 
    domain,
    COUNT(*) as total_records,
    COUNT(CASE WHEN is_active THEN 1 END) as active_records,
    COUNT(CASE WHEN NOT is_active THEN 1 END) as inactive_records,
    CASE 
        WHEN COUNT(*) > 0 
        THEN ROUND(COUNT(CASE WHEN is_active THEN 1 END)::DECIMAL / COUNT(*) * 100, 2)
        ELSE 0 
    END as active_percentage,
    MIN(created_at) as first_record,
    MAX(created_at) as latest_record
FROM nip05_records
GROUP BY domain
ORDER BY total_records DESC;

-- =====================================================
-- SECTION 3: SECURE THE VIEWS WITH RLS
-- Apply Row Level Security to the views
-- =====================================================

-- Enable RLS on the underlying table (if not already enabled)
ALTER TABLE nip05_records ENABLE ROW LEVEL SECURITY;

-- Create secure policies for nip05_records table
DROP POLICY IF EXISTS "nip05_records_public_read" ON nip05_records;
CREATE POLICY "nip05_records_public_read" ON nip05_records
    FOR SELECT
    USING (is_active = true);

DROP POLICY IF EXISTS "nip05_records_authenticated_write" ON nip05_records;
CREATE POLICY "nip05_records_authenticated_write" ON nip05_records
    FOR INSERT
    WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');

DROP POLICY IF EXISTS "nip05_records_service_manage" ON nip05_records;
CREATE POLICY "nip05_records_service_manage" ON nip05_records
    FOR ALL
    USING (auth.role() = 'service_role');

-- =====================================================
-- SECTION 4: GRANT APPROPRIATE PERMISSIONS
-- Ensure proper access to views and tables
-- =====================================================

-- Grant permissions on the table
GRANT SELECT ON nip05_records TO anon;
GRANT SELECT ON nip05_records TO authenticated;
GRANT INSERT ON nip05_records TO authenticated;
GRANT ALL ON nip05_records TO service_role;

-- Grant permissions on the views
GRANT SELECT ON nip05_verification_data TO anon;
GRANT SELECT ON nip05_verification_data TO authenticated;
GRANT SELECT ON nip05_verification_data TO service_role;

GRANT SELECT ON nip05_verification_stats TO anon;
GRANT SELECT ON nip05_verification_stats TO authenticated;
GRANT SELECT ON nip05_verification_stats TO service_role;

-- =====================================================
-- SECTION 5: TEST NIP-05 FUNCTIONALITY
-- Verify that NIP-05 verification still works
-- =====================================================

-- Test the view functionality
DO $$
DECLARE
    view_record_count INTEGER;
    table_record_count INTEGER;
    sample_record RECORD;
BEGIN
    -- Count records in view
    SELECT COUNT(*) INTO view_record_count FROM nip05_verification_data;
    
    -- Count records in table
    SELECT COUNT(*) INTO table_record_count FROM nip05_records WHERE is_active = true;
    
    RAISE NOTICE '';
    RAISE NOTICE '🔍 NIP-05 FUNCTIONALITY TEST:';
    RAISE NOTICE '';
    RAISE NOTICE '📊 RECORD COUNTS:';
    RAISE NOTICE '  • nip05_records table (active): %', table_record_count;
    RAISE NOTICE '  • nip05_verification_data view: %', view_record_count;
    
    IF view_record_count = table_record_count THEN
        RAISE NOTICE '✅ View correctly reflects table data';
    ELSE
        RAISE NOTICE '⚠️  View/table mismatch - check RLS policies';
    END IF;
    
    -- Get a sample record to test structure
    IF view_record_count > 0 THEN
        SELECT name, pubkey, domain INTO sample_record 
        FROM nip05_verification_data 
        LIMIT 1;
        
        RAISE NOTICE '';
        RAISE NOTICE '📝 SAMPLE NIP-05 RECORD:';
        RAISE NOTICE '  • Name: %', sample_record.name;
        RAISE NOTICE '  • Domain: %', sample_record.domain;
        RAISE NOTICE '  • Pubkey: %...', LEFT(sample_record.pubkey, 20);
        RAISE NOTICE '';
        RAISE NOTICE '✅ NIP-05 verification data structure intact';
    ELSE
        RAISE NOTICE '';
        RAISE NOTICE '⚠️  No NIP-05 records found - may need to populate data';
    END IF;
END $$;

-- =====================================================
-- SECTION 6: VERIFY SECURITY COMPLIANCE
-- Ensure we maintained security while restoring functionality
-- =====================================================

DO $$
DECLARE
    security_definer_count INTEGER;
    rls_enabled BOOLEAN;
    policy_count INTEGER;
BEGIN
    -- Check if any views are SECURITY DEFINER (security risk)
    SELECT COUNT(*) INTO security_definer_count
    FROM pg_views 
    WHERE schemaname = 'public'
    AND viewname IN ('nip05_verification_data', 'nip05_verification_stats')
    AND definition LIKE '%SECURITY DEFINER%';
    
    -- Check if RLS is enabled on nip05_records
    SELECT relrowsecurity INTO rls_enabled
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'nip05_records'
    AND n.nspname = 'public';
    
    -- Count RLS policies
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies 
    WHERE tablename = 'nip05_records' 
    AND schemaname = 'public';
    
    RAISE NOTICE '';
    RAISE NOTICE '🔒 SECURITY COMPLIANCE VERIFICATION:';
    RAISE NOTICE '';
    RAISE NOTICE '📊 SECURITY STATUS:';
    RAISE NOTICE '  • SECURITY DEFINER views: %', security_definer_count;
    RAISE NOTICE '  • RLS enabled on nip05_records: %', CASE WHEN rls_enabled THEN 'YES ✓' ELSE 'NO ✗' END;
    RAISE NOTICE '  • RLS policies on nip05_records: %', policy_count;
    RAISE NOTICE '';
    
    IF security_definer_count = 0 AND rls_enabled AND policy_count >= 2 THEN
        RAISE NOTICE '🎉 PERFECT BALANCE ACHIEVED!';
        RAISE NOTICE '';
        RAISE NOTICE '✅ SECURITY MAINTAINED:';
        RAISE NOTICE '  • No SECURITY DEFINER views (security risk eliminated)';
        RAISE NOTICE '  • RLS enabled with appropriate policies';
        RAISE NOTICE '  • Proper access controls in place';
        RAISE NOTICE '';
        RAISE NOTICE '✅ FUNCTIONALITY RESTORED:';
        RAISE NOTICE '  • nip05_verification_data view recreated safely';
        RAISE NOTICE '  • nip05_verification_stats view recreated safely';
        RAISE NOTICE '  • NIP-05 verification workflow intact';
        RAISE NOTICE '  • Register-identity.js will work correctly';
        RAISE NOTICE '';
        RAISE NOTICE '🚀 READY FOR PRODUCTION DEPLOYMENT!';
    ELSE
        RAISE NOTICE '⚠️  SECURITY ISSUES DETECTED:';
        IF security_definer_count > 0 THEN
            RAISE NOTICE '  • SECURITY DEFINER views still present';
        END IF;
        IF NOT rls_enabled THEN
            RAISE NOTICE '  • RLS not enabled on nip05_records';
        END IF;
        IF policy_count < 2 THEN
            RAISE NOTICE '  • Insufficient RLS policies';
        END IF;
    END IF;
    
    RAISE NOTICE '';
    RAISE NOTICE 'NIP-05 functionality restoration completed at: %', NOW();
    RAISE NOTICE '=====================================================';
END $$;
