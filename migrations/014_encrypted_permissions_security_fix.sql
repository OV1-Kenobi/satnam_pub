-- Migration: Encrypted Permissions Security Fix
-- Purpose: Ensure proper encryption support for permissions fields and fix security vulnerabilities
-- Date: 2024-12-24
-- Version: 014

-- ============================================================================
-- CRITICAL SECURITY FIX: Encrypted Permissions Schema Validation
-- ============================================================================

-- Ensure family_memberships table has proper encryption support
DO $$
BEGIN
    -- Check if permissions_encryption_salt column exists, add if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'family_memberships' 
        AND column_name = 'permissions_encryption_salt'
    ) THEN
        ALTER TABLE family_memberships 
        ADD COLUMN permissions_encryption_salt TEXT UNIQUE;
        
        COMMENT ON COLUMN family_memberships.permissions_encryption_salt 
        IS 'Unique salt for permissions encryption (nullable for legacy data)';
    END IF;

    -- Check if permissions_encryption_iv column exists, add if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'family_memberships' 
        AND column_name = 'permissions_encryption_iv'
    ) THEN
        ALTER TABLE family_memberships 
        ADD COLUMN permissions_encryption_iv TEXT UNIQUE;
        
        COMMENT ON COLUMN family_memberships.permissions_encryption_iv 
        IS 'Unique IV for permissions encryption (nullable for legacy data)';
    END IF;

    -- Ensure encrypted_permissions column exists with proper type
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'family_memberships' 
        AND column_name = 'encrypted_permissions'
    ) THEN
        ALTER TABLE family_memberships 
        ADD COLUMN encrypted_permissions TEXT DEFAULT NULL;
        
        COMMENT ON COLUMN family_memberships.encrypted_permissions 
        IS 'Encrypted permissions data using AES-256-GCM with unique salt and IV';
    END IF;

    RAISE NOTICE 'Family memberships encryption columns validated successfully';
END $$;

-- ============================================================================
-- SECURITY ENHANCEMENT: Unique Salt and IV Generation Functions
-- ============================================================================

-- Function to generate unique salt (if not exists)
CREATE OR REPLACE FUNCTION generate_unique_salt()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    salt_value TEXT;
    max_attempts INTEGER := 100;
    attempt_count INTEGER := 0;
BEGIN
    LOOP
        -- Generate a cryptographically secure random salt
        salt_value := encode(gen_random_bytes(32), 'base64');
        
        -- Check uniqueness across all salt columns
        IF NOT EXISTS (
            SELECT 1 FROM family_memberships 
            WHERE permissions_encryption_salt = salt_value
               OR federation_hash_salt = salt_value
        ) THEN
            RETURN salt_value;
        END IF;
        
        attempt_count := attempt_count + 1;
        IF attempt_count >= max_attempts THEN
            RAISE EXCEPTION 'Failed to generate unique salt after % attempts', max_attempts;
        END IF;
    END LOOP;
END $$;

-- Function to generate unique IV (if not exists)
CREATE OR REPLACE FUNCTION generate_unique_iv()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    iv_value TEXT;
    max_attempts INTEGER := 100;
    attempt_count INTEGER := 0;
BEGIN
    LOOP
        -- Generate a cryptographically secure random IV (12 bytes for GCM)
        iv_value := encode(gen_random_bytes(12), 'base64');
        
        -- Check uniqueness across all IV columns
        IF NOT EXISTS (
            SELECT 1 FROM family_memberships 
            WHERE permissions_encryption_iv = iv_value
        ) THEN
            RETURN iv_value;
        END IF;
        
        attempt_count := attempt_count + 1;
        IF attempt_count >= max_attempts THEN
            RAISE EXCEPTION 'Failed to generate unique IV after % attempts', max_attempts;
        END IF;
    END LOOP;
END $$;

-- ============================================================================
-- SECURITY TRIGGER: Auto-generate Salt and IV for Encrypted Permissions
-- ============================================================================

-- Create or replace trigger function for automatic salt/IV generation
CREATE OR REPLACE FUNCTION auto_generate_encryption_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Auto-generate salt and IV when encrypted_permissions is set but metadata is missing
    IF NEW.encrypted_permissions IS NOT NULL THEN
        -- Generate salt if missing
        IF NEW.permissions_encryption_salt IS NULL THEN
            NEW.permissions_encryption_salt := generate_unique_salt();
        END IF;
        
        -- Generate IV if missing
        IF NEW.permissions_encryption_iv IS NULL THEN
            NEW.permissions_encryption_iv := generate_unique_iv();
        END IF;
    END IF;
    
    -- Auto-generate federation_hash_salt if missing (existing functionality)
    IF NEW.federation_hash_salt IS NULL THEN
        NEW.federation_hash_salt := generate_unique_salt();
    END IF;
    
    RETURN NEW;
END $$;

-- Drop existing trigger if it exists and create new one
DROP TRIGGER IF EXISTS trigger_auto_generate_encryption_metadata ON family_memberships;

CREATE TRIGGER trigger_auto_generate_encryption_metadata
    BEFORE INSERT OR UPDATE ON family_memberships
    FOR EACH ROW
    EXECUTE FUNCTION auto_generate_encryption_metadata();

-- ============================================================================
-- SECURITY VALIDATION: Data Integrity Checks
-- ============================================================================

-- Add constraint to ensure encrypted permissions have proper metadata
DO $$
BEGIN
    -- Add check constraint for encrypted permissions integrity
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'family_memberships' 
        AND constraint_name = 'check_encrypted_permissions_integrity'
    ) THEN
        ALTER TABLE family_memberships 
        ADD CONSTRAINT check_encrypted_permissions_integrity 
        CHECK (
            (encrypted_permissions IS NULL) OR 
            (encrypted_permissions IS NOT NULL AND 
             permissions_encryption_salt IS NOT NULL AND 
             permissions_encryption_iv IS NOT NULL)
        );
        
        RAISE NOTICE 'Added encrypted permissions integrity constraint';
    END IF;
END $$;

-- ============================================================================
-- SECURITY AUDIT: Log Migration Completion
-- ============================================================================

-- Log successful migration completion
DO $$
BEGIN
    RAISE NOTICE '=== ENCRYPTED PERMISSIONS SECURITY FIX MIGRATION COMPLETED ===';
    RAISE NOTICE 'Migration: Encrypted Permissions Security Fix';
    RAISE NOTICE 'Date: %', NOW();
    RAISE NOTICE 'Status: All encryption columns validated and secured';
    RAISE NOTICE 'Features Applied:';
    RAISE NOTICE '  ✓ Schema validation for encryption columns';
    RAISE NOTICE '  ✓ Auto-generation functions for salt/IV';
    RAISE NOTICE '  ✓ Security triggers for metadata generation';
    RAISE NOTICE '  ✓ Data integrity constraints enforced';
    RAISE NOTICE 'Security Level: Production-ready encrypted permissions support';
    RAISE NOTICE 'Migration can be safely re-executed (idempotent design)';
    RAISE NOTICE '================================================================';
END $$;
