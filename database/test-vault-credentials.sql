-- Minimal Test Script to Isolate vault_credentials Column Reference Error
-- Execute this in Supabase SQL Editor to identify the exact problem

BEGIN;

-- Step 1: Check if vault_credentials table already exists
SELECT 
    table_name, 
    table_schema,
    table_type
FROM information_schema.tables 
WHERE table_name = 'vault_credentials';

-- Step 2: Check if there are any columns in existing vault_credentials table
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'vault_credentials' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Step 3: Drop existing table if it exists (for testing)
DROP TABLE IF EXISTS public.vault_credentials CASCADE;

-- Step 4: Create vault_credentials table with explicit column definition
CREATE TABLE public.vault_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credential_hash VARCHAR(64) NOT NULL,
    credential_salt VARCHAR(32) NOT NULL,
    owner_hash VARCHAR(50),
    encrypted_value TEXT NOT NULL,
    encryption_salt VARCHAR(32) NOT NULL,
    key_derivation_rounds INTEGER NOT NULL DEFAULT 100000,
    credential_type VARCHAR(30) NOT NULL CHECK (credential_type IN (
        'auth_salt', 'jwt_secret', 'api_key', 'database_key', 
        'lightning_macaroon', 'nostr_nsec', 'federation_key'
    )),
    required_role VARCHAR(20) NOT NULL DEFAULT 'guardian' CHECK (required_role IN ('private', 'offspring', 'adult', 'steward', 'guardian')),
    guardian_approval_required BOOLEAN NOT NULL DEFAULT true,
    is_active BOOLEAN NOT NULL DEFAULT true,
    expires_at BIGINT,
    rotation_required BOOLEAN NOT NULL DEFAULT false,
    last_rotated BIGINT,
    created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
    updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()),
    last_accessed BIGINT,
    access_count INTEGER NOT NULL DEFAULT 0,
    
    UNIQUE(credential_hash),
    UNIQUE(credential_salt),
    UNIQUE(encryption_salt)
);

-- Step 5: Verify table was created successfully
SELECT 
    table_name, 
    table_schema
FROM information_schema.tables 
WHERE table_name = 'vault_credentials' 
AND table_schema = 'public';

-- Step 6: Verify credential_hash column exists
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'vault_credentials' 
AND table_schema = 'public'
AND column_name = 'credential_hash';

-- Step 7: Test index creation on credential_hash column
CREATE INDEX IF NOT EXISTS test_idx_vault_credentials_hash ON public.vault_credentials(credential_hash);

-- Step 8: Verify index was created
SELECT 
    indexname,
    tablename,
    indexdef
FROM pg_indexes 
WHERE tablename = 'vault_credentials' 
AND indexname = 'test_idx_vault_credentials_hash';

-- Step 9: Test a simple query referencing credential_hash
SELECT COUNT(*) as table_exists_and_accessible
FROM public.vault_credentials 
WHERE credential_hash IS NOT NULL OR credential_hash IS NULL;

-- Step 10: Clean up test objects
DROP INDEX IF EXISTS test_idx_vault_credentials_hash;
DROP TABLE IF EXISTS public.vault_credentials CASCADE;

ROLLBACK; -- Rollback all changes since this is just a test

-- RESULTS INTERPRETATION:
-- If Step 4 fails: There's a syntax error in the CREATE TABLE statement
-- If Step 7 fails: There's a column reference issue after table creation
-- If Step 9 fails: There's a permissions or RLS issue
-- If all steps succeed: The problem is in the main migration script's transaction handling

-- ADDITIONAL TEST: Simulate the exact scenario from the migration script
BEGIN;

-- Test the DO block approach used in the fixed migration script
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vault_credentials' AND table_schema = 'public') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vault_credentials' AND column_name = 'credential_hash' AND table_schema = 'public') THEN
            DROP TABLE public.vault_credentials CASCADE;
        ELSE
            RAISE NOTICE 'vault_credentials table already exists with required columns, skipping creation';
            RETURN;
        END IF;
    END IF;

    CREATE TABLE public.vault_credentials (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        credential_hash VARCHAR(64) NOT NULL,
        credential_salt VARCHAR(32) NOT NULL,
        UNIQUE(credential_hash)
    );

    RAISE NOTICE 'vault_credentials table created successfully';
END $$;

-- Test index creation immediately after
CREATE INDEX IF NOT EXISTS test_idx_vault_credentials_hash ON public.vault_credentials(credential_hash);

-- Verify it worked
SELECT 'SUCCESS: credential_hash column accessible' as result
FROM public.vault_credentials
WHERE credential_hash IS NOT NULL OR credential_hash IS NULL
LIMIT 0;

ROLLBACK;
