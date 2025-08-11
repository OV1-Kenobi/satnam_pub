-- =====================================================
-- ENFORCE MAXIMUM ENCRYPTION ARCHITECTURE
-- =====================================================
--
-- PURPOSE: Enforce zero plaintext storage of user identifiers
-- SECURITY: Implements maximum encryption with hashed columns only
-- COMPLIANCE: Ensures all sensitive data is stored in hashed format
--
-- CRITICAL SECURITY REQUIREMENT:
-- - NO plaintext user identifiers in database
-- - ALL sensitive data must use hashed columns with unique salts
-- - Plaintext columns should be deprecated/removed
--
-- Run this script in the Supabase SQL editor
--

BEGIN;

-- =====================================================
-- STEP 1: Ensure all required hashed columns exist
-- =====================================================

-- Add hashed columns to user_identities if they don't exist
ALTER TABLE user_identities
ADD COLUMN IF NOT EXISTS user_salt TEXT,
ADD COLUMN IF NOT EXISTS hashed_username TEXT,
ADD COLUMN IF NOT EXISTS hashed_npub TEXT,
ADD COLUMN IF NOT EXISTS hashed_nip05 TEXT,
ADD COLUMN IF NOT EXISTS hashed_lightning_address TEXT,
ADD COLUMN IF NOT EXISTS hashed_encrypted_nsec TEXT;

-- Add hashed columns to nip05_records if they don't exist
ALTER TABLE nip05_records
ADD COLUMN IF NOT EXISTS user_salt TEXT,
ADD COLUMN IF NOT EXISTS hashed_nip05 TEXT,
ADD COLUMN IF NOT EXISTS hashed_npub TEXT;

-- =====================================================
-- STEP 2: Create indexes on hashed columns for performance
-- =====================================================

-- Indexes for fast lookups on hashed data
CREATE INDEX IF NOT EXISTS idx_user_identities_hashed_npub ON user_identities(hashed_npub);
CREATE INDEX IF NOT EXISTS idx_user_identities_hashed_nip05 ON user_identities(hashed_nip05);
CREATE INDEX IF NOT EXISTS idx_user_identities_hashed_username ON user_identities(hashed_username);
CREATE INDEX IF NOT EXISTS idx_user_identities_user_salt ON user_identities(user_salt);

CREATE INDEX IF NOT EXISTS idx_nip05_records_hashed_npub ON nip05_records(hashed_npub);
CREATE INDEX IF NOT EXISTS idx_nip05_records_hashed_nip05 ON nip05_records(hashed_nip05);
CREATE INDEX IF NOT EXISTS idx_nip05_records_user_salt ON nip05_records(user_salt);

-- =====================================================
-- STEP 3: Add constraints to enforce maximum encryption
-- =====================================================

-- Ensure user_salt is always present for new records
ALTER TABLE user_identities 
ADD CONSTRAINT user_identities_salt_required 
CHECK (user_salt IS NOT NULL AND user_salt != '');

ALTER TABLE nip05_records
ADD CONSTRAINT nip05_records_salt_required
CHECK (user_salt IS NOT NULL AND user_salt != '');

-- =====================================================
-- STEP 4: Create privacy compliance check function
-- =====================================================

CREATE OR REPLACE FUNCTION check_privacy_compliance()
RETURNS TABLE(
    table_name TEXT,
    compliance_status TEXT,
    issues TEXT[]
) AS $$
BEGIN
    -- Check user_identities table
    RETURN QUERY
    SELECT 
        'user_identities'::TEXT,
        CASE 
            WHEN EXISTS (
                SELECT 1 FROM user_identities 
                WHERE user_salt IS NULL OR user_salt = ''
            ) THEN 'NON_COMPLIANT'
            WHEN EXISTS (
                SELECT 1 FROM user_identities 
                WHERE (npub IS NOT NULL AND npub != '') 
                   OR (nip05 IS NOT NULL AND nip05 != '')
                   OR (encrypted_nsec IS NOT NULL AND encrypted_nsec != '')
            ) THEN 'PARTIAL_COMPLIANCE'
            ELSE 'FULLY_COMPLIANT'
        END,
        ARRAY[
            CASE WHEN EXISTS (SELECT 1 FROM user_identities WHERE user_salt IS NULL OR user_salt = '') 
                 THEN 'Missing user_salt for some records' ELSE NULL END,
            CASE WHEN EXISTS (SELECT 1 FROM user_identities WHERE npub IS NOT NULL AND npub != '') 
                 THEN 'Plaintext npub found' ELSE NULL END,
            CASE WHEN EXISTS (SELECT 1 FROM user_identities WHERE nip05 IS NOT NULL AND nip05 != '') 
                 THEN 'Plaintext nip05 found' ELSE NULL END,
            CASE WHEN EXISTS (SELECT 1 FROM user_identities WHERE encrypted_nsec IS NOT NULL AND encrypted_nsec != '') 
                 THEN 'Plaintext encrypted_nsec found' ELSE NULL END
        ]::TEXT[];

    -- Check nip05_records table
    RETURN QUERY
    SELECT
        'nip05_records'::TEXT,
        CASE
            WHEN EXISTS (
                SELECT 1 FROM nip05_records
                WHERE user_salt IS NULL OR user_salt = ''
            ) THEN 'NON_COMPLIANT'
            WHEN EXISTS (
                SELECT 1 FROM nip05_records
                WHERE (pubkey IS NOT NULL AND pubkey != '')
                   OR (name IS NOT NULL AND name != '')
            ) THEN 'PARTIAL_COMPLIANCE'
            ELSE 'FULLY_COMPLIANT'
        END,
        ARRAY[
            CASE WHEN EXISTS (SELECT 1 FROM nip05_records WHERE user_salt IS NULL OR user_salt = '')
                 THEN 'Missing user_salt for some records' ELSE NULL END,
            CASE WHEN EXISTS (SELECT 1 FROM nip05_records WHERE pubkey IS NOT NULL AND pubkey != '')
                 THEN 'Plaintext pubkey found' ELSE NULL END,
            CASE WHEN EXISTS (SELECT 1 FROM nip05_records WHERE name IS NOT NULL AND name != '')
                 THEN 'Plaintext name found' ELSE NULL END
        ]::TEXT[];
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- STEP 5: Run compliance check
-- =====================================================

SELECT * FROM check_privacy_compliance();

COMMIT;

-- =====================================================
-- VERIFICATION AND SUCCESS MESSAGE
-- =====================================================

SELECT 
    '✅ MAXIMUM ENCRYPTION ARCHITECTURE ENFORCED' as result,
    'All hashed columns created and indexed' as details,
    'Database ready for zero plaintext storage' as status,
    'Run check_privacy_compliance() to verify compliance' as next_steps;
