-- =====================================================
-- NOBLE V2 ENCRYPTION MIGRATION
-- Greenfield Migration: Clear test data and prepare for Noble V2
-- =====================================================

-- WARNING: This will delete ALL existing user data
-- Only run this on development/test environments with no production data

BEGIN;

-- Log migration start
DO $$
BEGIN
    RAISE NOTICE '🚀 Starting Noble V2 Migration - Greenfield Implementation';
    RAISE NOTICE '⚠️  WARNING: This will delete ALL existing user data';
    RAISE NOTICE '📅 Migration Date: %', NOW();
END $$;

-- =====================================================
-- STEP 1: Clear all existing encrypted data (conditionally)
-- =====================================================

DO $$
DECLARE
    tables_cleared TEXT[] := ARRAY[]::TEXT[];
    records_cleared INTEGER := 0;
    table_count INTEGER;
BEGIN
    RAISE NOTICE '🧹 Starting conditional table clearing...';

    -- Clear user_identities (required table with encrypted_nsec)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_identities') THEN
        SELECT COUNT(*) INTO table_count FROM user_identities;
        DELETE FROM user_identities WHERE true;
        tables_cleared := array_append(tables_cleared, 'user_identities');
        records_cleared := records_cleared + table_count;
        RAISE NOTICE '✅ Cleared user_identities table (% records)', table_count;
    ELSE
        RAISE NOTICE '⚠️  Table user_identities does not exist - skipping';
    END IF;

    -- Clear user_signing_preferences (optional)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_signing_preferences') THEN
        SELECT COUNT(*) INTO table_count FROM user_signing_preferences;
        DELETE FROM user_signing_preferences WHERE true;
        tables_cleared := array_append(tables_cleared, 'user_signing_preferences');
        records_cleared := records_cleared + table_count;
        RAISE NOTICE '✅ Cleared user_signing_preferences table (% records)', table_count;
    ELSE
        RAISE NOTICE '⚠️  Table user_signing_preferences does not exist - skipping';
    END IF;

    -- Clear gift_wrapped_messages (optional)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'gift_wrapped_messages') THEN
        SELECT COUNT(*) INTO table_count FROM gift_wrapped_messages;
        DELETE FROM gift_wrapped_messages WHERE true;
        tables_cleared := array_append(tables_cleared, 'gift_wrapped_messages');
        records_cleared := records_cleared + table_count;
        RAISE NOTICE '✅ Cleared gift_wrapped_messages table (% records)', table_count;
    ELSE
        RAISE NOTICE '⚠️  Table gift_wrapped_messages does not exist - skipping';
    END IF;

    -- Clear secure_sessions (optional)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'secure_sessions') THEN
        SELECT COUNT(*) INTO table_count FROM secure_sessions;
        DELETE FROM secure_sessions WHERE true;
        tables_cleared := array_append(tables_cleared, 'secure_sessions');
        records_cleared := records_cleared + table_count;
        RAISE NOTICE '✅ Cleared secure_sessions table (% records)', table_count;
    ELSE
        RAISE NOTICE '⚠️  Table secure_sessions does not exist - skipping';
    END IF;

    -- Clear privacy_users (optional)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'privacy_users') THEN
        SELECT COUNT(*) INTO table_count FROM privacy_users;
        DELETE FROM privacy_users WHERE true;
        tables_cleared := array_append(tables_cleared, 'privacy_users');
        records_cleared := records_cleared + table_count;
        RAISE NOTICE '✅ Cleared privacy_users table (% records)', table_count;
    ELSE
        RAISE NOTICE '⚠️  Table privacy_users does not exist - skipping';
    END IF;

    -- Clear nip05_records (optional)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'nip05_records') THEN
        SELECT COUNT(*) INTO table_count FROM nip05_records;
        DELETE FROM nip05_records WHERE true;
        tables_cleared := array_append(tables_cleared, 'nip05_records');
        records_cleared := records_cleared + table_count;
        RAISE NOTICE '✅ Cleared nip05_records table (% records)', table_count;
    ELSE
        RAISE NOTICE '⚠️  Table nip05_records does not exist - skipping';
    END IF;

    -- Clear family_federations (optional)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'family_federations') THEN
        SELECT COUNT(*) INTO table_count FROM family_federations;
        DELETE FROM family_federations WHERE true;
        tables_cleared := array_append(tables_cleared, 'family_federations');
        records_cleared := records_cleared + table_count;
        RAISE NOTICE '✅ Cleared family_federations table (% records)', table_count;
    ELSE
        RAISE NOTICE '⚠️  Table family_federations does not exist - skipping';
    END IF;

    -- Clear family_members (optional)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'family_members') THEN
        SELECT COUNT(*) INTO table_count FROM family_members;
        DELETE FROM family_members WHERE true;
        tables_cleared := array_append(tables_cleared, 'family_members');
        records_cleared := records_cleared + table_count;
        RAISE NOTICE '✅ Cleared family_members table (% records)', table_count;
    ELSE
        RAISE NOTICE '⚠️  Table family_members does not exist - skipping';
    END IF;

    RAISE NOTICE '📊 Summary: Cleared % tables with % total records', array_length(tables_cleared, 1), records_cleared;
    RAISE NOTICE '📋 Tables cleared: %', array_to_string(tables_cleared, ', ');
END $$;

-- =====================================================
-- STEP 2: Update schema for Noble V2 compatibility
-- =====================================================

-- Add version column to track encryption format
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_identities' 
        AND column_name = 'encryption_version'
    ) THEN
        ALTER TABLE user_identities 
        ADD COLUMN encryption_version TEXT DEFAULT 'noble-v2';
        RAISE NOTICE '✅ Added encryption_version column to user_identities';
    ELSE
        RAISE NOTICE '✅ encryption_version column already exists';
    END IF;
END $$;

-- Update existing records to use Noble V2 (should be none after clearing)
UPDATE user_identities SET encryption_version = 'noble-v2' WHERE encryption_version IS NULL;

-- Add index for encryption version queries
CREATE INDEX IF NOT EXISTS idx_user_identities_encryption_version
ON user_identities(encryption_version);

DO $$
BEGIN
    RAISE NOTICE '✅ Created encryption_version index';
END $$;

-- =====================================================
-- STEP 3: Add Noble V2 validation functions
-- =====================================================

-- Function to validate Noble V2 encrypted nsec format
CREATE OR REPLACE FUNCTION validate_noble_v2_nsec(encrypted_nsec TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    -- Noble V2 format: noble-v2.salt.iv.encrypted (4 parts)
    IF encrypted_nsec IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Check format: should have exactly 3 dots
    IF array_length(string_to_array(encrypted_nsec, '.'), 1) != 4 THEN
        RETURN FALSE;
    END IF;
    
    -- Check version prefix
    IF NOT encrypted_nsec LIKE 'noble-v2.%' THEN
        RETURN FALSE;
    END IF;
    
    RETURN TRUE;
END;
$$;

DO $$
BEGIN
    RAISE NOTICE '✅ Created validate_noble_v2_nsec function';
END $$;

-- =====================================================
-- STEP 4: Add constraints for Noble V2 format
-- =====================================================

-- Add check constraint for encrypted_nsec format
DO $$
BEGIN
    -- Drop existing constraint if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'user_identities' 
        AND constraint_name = 'chk_encrypted_nsec_noble_v2'
    ) THEN
        ALTER TABLE user_identities DROP CONSTRAINT chk_encrypted_nsec_noble_v2;
    END IF;
    
    -- Add new constraint
    ALTER TABLE user_identities 
    ADD CONSTRAINT chk_encrypted_nsec_noble_v2 
    CHECK (encrypted_nsec IS NULL OR validate_noble_v2_nsec(encrypted_nsec));
    
    RAISE NOTICE '✅ Added Noble V2 format constraint';
END $$;

-- =====================================================
-- STEP 5: Update RLS policies for Noble V2
-- =====================================================

-- Ensure RLS policies work with cleared data
-- (Policies should already exist from previous migrations)

-- Enable RLS on existing tables only
DO $$
DECLARE
    rls_tables TEXT[] := ARRAY[]::TEXT[];
BEGIN
    -- Enable RLS on user_identities (required)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_identities') THEN
        ALTER TABLE user_identities ENABLE ROW LEVEL SECURITY;
        rls_tables := array_append(rls_tables, 'user_identities');
    END IF;

    -- Enable RLS on user_signing_preferences (optional)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_signing_preferences') THEN
        ALTER TABLE user_signing_preferences ENABLE ROW LEVEL SECURITY;
        rls_tables := array_append(rls_tables, 'user_signing_preferences');
    END IF;

    -- Enable RLS on gift_wrapped_messages (optional)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'gift_wrapped_messages') THEN
        ALTER TABLE gift_wrapped_messages ENABLE ROW LEVEL SECURITY;
        rls_tables := array_append(rls_tables, 'gift_wrapped_messages');
    END IF;

    -- Enable RLS on privacy_users (optional)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'privacy_users') THEN
        ALTER TABLE privacy_users ENABLE ROW LEVEL SECURITY;
        rls_tables := array_append(rls_tables, 'privacy_users');
    END IF;

    -- Enable RLS on nip05_records (optional)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'nip05_records') THEN
        ALTER TABLE nip05_records ENABLE ROW LEVEL SECURITY;
        rls_tables := array_append(rls_tables, 'nip05_records');
    END IF;

    RAISE NOTICE '✅ Enabled RLS on tables: %', array_to_string(rls_tables, ', ');
    RAISE NOTICE '📊 Total tables with RLS: %', array_length(rls_tables, 1);
END $$;

-- =====================================================
-- STEP 6: Create Noble V2 audit log
-- =====================================================

-- Create audit table for encryption migrations
CREATE TABLE IF NOT EXISTS encryption_audit_log (
    id SERIAL PRIMARY KEY,
    migration_type TEXT NOT NULL,
    encryption_version TEXT NOT NULL,
    records_affected INTEGER DEFAULT 0,
    migration_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    notes TEXT
);

-- Log this migration
INSERT INTO encryption_audit_log (
    migration_type, 
    encryption_version, 
    records_affected, 
    notes
) VALUES (
    'greenfield_migration',
    'noble-v2',
    0,
    'Cleared all test data and prepared database for Noble V2 encryption'
);

DO $$
BEGIN
    RAISE NOTICE '✅ Created encryption audit log';
END $$;

-- =====================================================
-- STEP 7: Verify migration success
-- =====================================================

DO $$
DECLARE
    user_count INTEGER;
    constraint_count INTEGER;
BEGIN
    -- Verify tables are empty
    SELECT COUNT(*) INTO user_count FROM user_identities;
    
    -- Verify constraints exist
    SELECT COUNT(*) INTO constraint_count 
    FROM information_schema.table_constraints 
    WHERE table_name = 'user_identities' 
    AND constraint_name = 'chk_encrypted_nsec_noble_v2';
    
    IF user_count = 0 AND constraint_count = 1 THEN
        RAISE NOTICE '✅ Migration verification successful';
        RAISE NOTICE '   - User identities cleared: %', user_count;
        RAISE NOTICE '   - Noble V2 constraints: %', constraint_count;
    ELSE
        RAISE EXCEPTION 'Migration verification failed: users=%, constraints=%', 
                       user_count, constraint_count;
    END IF;
END $$;

-- =====================================================
-- FINALIZE MIGRATION
-- =====================================================

COMMIT;

-- Final success message
DO $$
BEGIN
    RAISE NOTICE '🎉 Noble V2 Migration Complete!';
    RAISE NOTICE '📋 Summary:';
    RAISE NOTICE '   - All test data cleared';
    RAISE NOTICE '   - Database prepared for Noble V2 encryption';
    RAISE NOTICE '   - Format validation constraints added';
    RAISE NOTICE '   - Audit logging enabled';
    RAISE NOTICE '';
    RAISE NOTICE '🚀 Ready for Noble V2 encrypted user registration!';
END $$;
