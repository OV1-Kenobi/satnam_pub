-- =====================================================
-- AUTHENTICATION SYSTEM ALIGNMENT MIGRATION
-- Fixes critical mismatch between Identity Forge registration and NIP-05/Password authentication
-- =====================================================

-- Step 1: Add password storage fields to user_identities table
ALTER TABLE public.user_identities 
ADD COLUMN IF NOT EXISTS password_hash TEXT,
ADD COLUMN IF NOT EXISTS password_salt VARCHAR(32),
ADD COLUMN IF NOT EXISTS password_created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS password_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS failed_attempts INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_successful_auth TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS requires_password_change BOOLEAN NOT NULL DEFAULT FALSE;

-- Step 2: Add unique constraints for security
DO $$
BEGIN
    -- Check if constraint already exists before adding it
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'user_identities_password_salt_unique'
        AND table_name = 'user_identities'
    ) THEN
        ALTER TABLE public.user_identities
        ADD CONSTRAINT user_identities_password_salt_unique UNIQUE(password_salt);
    END IF;
END $$;

-- Step 3: Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_identities_nip05 ON user_identities(nip05);
CREATE INDEX IF NOT EXISTS idx_user_identities_username ON user_identities(username);
CREATE INDEX IF NOT EXISTS idx_user_identities_npub ON user_identities(npub);
CREATE INDEX IF NOT EXISTS idx_user_identities_failed_attempts ON user_identities(failed_attempts);
CREATE INDEX IF NOT EXISTS idx_user_identities_locked_until ON user_identities(locked_until);

-- Step 4: Create authentication attempts log table
CREATE TABLE IF NOT EXISTS public.user_auth_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES user_identities(id) ON DELETE CASCADE,
    nip05 VARCHAR(255),
    username VARCHAR(50),
    
    -- Attempt Details
    attempt_result TEXT NOT NULL CHECK (attempt_result IN (
        'success', 'invalid_nip05', 'invalid_password', 'invalid_username',
        'domain_not_whitelisted', 'rate_limited', 'account_locked'
    )),
    
    -- Security Context (hashed for privacy)
    client_info_hash TEXT,
    ip_address_hash TEXT,
    
    -- Timestamps
    attempted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Step 5: Add indexes for auth attempts
CREATE INDEX IF NOT EXISTS idx_user_auth_attempts_user_id ON user_auth_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_auth_attempts_nip05 ON user_auth_attempts(nip05);
CREATE INDEX IF NOT EXISTS idx_user_auth_attempts_attempted_at ON user_auth_attempts(attempted_at);
CREATE INDEX IF NOT EXISTS idx_user_auth_attempts_result ON user_auth_attempts(attempt_result);

-- Step 6: Enable Row Level Security
ALTER TABLE user_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_auth_attempts ENABLE ROW LEVEL SECURITY;

-- Step 7: Create RLS Policies for user_identities
DO $$
BEGIN
    -- Users can only access their own identity data
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE policyname = 'user_identities_own_data'
        AND tablename = 'user_identities'
    ) THEN
        CREATE POLICY user_identities_own_data ON user_identities
            FOR ALL
            USING (auth.uid()::text = id::text);
    END IF;

    -- Allow anonymous INSERT for registration
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE policyname = 'user_identities_registration'
        AND tablename = 'user_identities'
    ) THEN
        CREATE POLICY user_identities_registration ON user_identities
            FOR INSERT
            WITH CHECK (true);
    END IF;
END $$;

-- Step 8: Create RLS Policies for auth attempts
DO $$
BEGIN
    -- Users can only see their own auth attempts
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE policyname = 'user_auth_attempts_own_data'
        AND tablename = 'user_auth_attempts'
    ) THEN
        CREATE POLICY user_auth_attempts_own_data ON user_auth_attempts
            FOR ALL
            USING (auth.uid()::text = user_id::text);
    END IF;

    -- Allow anonymous INSERT for logging attempts
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE policyname = 'user_auth_attempts_logging'
        AND tablename = 'user_auth_attempts'
    ) THEN
        CREATE POLICY user_auth_attempts_logging ON user_auth_attempts
            FOR INSERT
            WITH CHECK (true);
    END IF;
END $$;

-- Step 9: Create function to clean up expired lockouts and old logs
CREATE OR REPLACE FUNCTION cleanup_user_security_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Clear expired lockouts
    UPDATE user_identities 
    SET locked_until = NULL, failed_attempts = 0
    WHERE locked_until IS NOT NULL AND locked_until < NOW();
    
    -- Clean up old auth attempt logs (keep 30 days)
    DELETE FROM user_auth_attempts 
    WHERE attempted_at < NOW() - INTERVAL '30 days';
    
    -- Log cleanup activity
    RAISE NOTICE 'User security data cleanup completed at %', NOW();
END;
$$;

-- Step 10: Create trigger to update password_updated_at
CREATE OR REPLACE FUNCTION update_user_password_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Only update timestamp if password_hash actually changed
    IF OLD.password_hash IS DISTINCT FROM NEW.password_hash THEN
        NEW.password_updated_at = NOW();
    END IF;
    
    -- Always update the general updated_at timestamp
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Create trigger with conditional check
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.triggers
        WHERE trigger_name = 'user_identities_password_updated'
        AND event_object_table = 'user_identities'
    ) THEN
        CREATE TRIGGER user_identities_password_updated
            BEFORE UPDATE ON user_identities
            FOR EACH ROW
            EXECUTE FUNCTION update_user_password_timestamp();
    END IF;
END $$;

-- Step 11: Create function to safely increment failed attempts
CREATE OR REPLACE FUNCTION increment_failed_attempts(user_nip05 TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    max_attempts INTEGER := 5;
    lockout_minutes INTEGER := 30;
BEGIN
    UPDATE user_identities 
    SET 
        failed_attempts = failed_attempts + 1,
        last_attempt_at = NOW(),
        locked_until = CASE 
            WHEN failed_attempts + 1 >= max_attempts 
            THEN NOW() + INTERVAL '30 minutes'
            ELSE locked_until
        END
    WHERE nip05 = user_nip05;
END;
$$;

-- Step 12: Create function to reset failed attempts on successful auth
CREATE OR REPLACE FUNCTION reset_failed_attempts(user_nip05 TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE user_identities 
    SET 
        failed_attempts = 0,
        locked_until = NULL,
        last_successful_auth = NOW()
    WHERE nip05 = user_nip05;
END;
$$;

-- Step 13: Add comments for documentation
COMMENT ON COLUMN user_identities.password_hash IS 'PBKDF2/SHA-512 hashed password with unique salt';
COMMENT ON COLUMN user_identities.password_salt IS 'Unique cryptographic salt for password hashing';
COMMENT ON COLUMN user_identities.failed_attempts IS 'Number of consecutive failed authentication attempts';
COMMENT ON COLUMN user_identities.locked_until IS 'Account lockout expiration timestamp';
COMMENT ON TABLE user_auth_attempts IS 'Security log for user authentication attempts';

-- Step 14: Grant necessary permissions
GRANT SELECT, INSERT, UPDATE ON user_identities TO authenticated;
GRANT SELECT, INSERT, UPDATE ON user_identities TO anon; -- Allow anonymous registration
GRANT SELECT, INSERT ON user_auth_attempts TO authenticated;
GRANT SELECT, INSERT ON user_auth_attempts TO anon; -- Allow anonymous auth attempts
GRANT EXECUTE ON FUNCTION cleanup_user_security_data() TO authenticated;
GRANT EXECUTE ON FUNCTION increment_failed_attempts(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_failed_attempts(TEXT) TO anon; -- Allow anonymous access
GRANT EXECUTE ON FUNCTION reset_failed_attempts(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION reset_failed_attempts(TEXT) TO anon; -- Allow anonymous access

-- Additional permissions for Supabase RPC access
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;

-- Step 15: Create scheduled cleanup job (if pg_cron is available)
-- This is optional and depends on your PostgreSQL setup
-- SELECT cron.schedule('cleanup-user-security', '0 2 * * *', 'SELECT cleanup_user_security_data();');

-- =====================================================
-- MIGRATION VERIFICATION QUERIES
-- =====================================================

-- Verify the schema changes
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'user_identities' 
    AND column_name IN ('password_hash', 'password_salt', 'failed_attempts', 'locked_until')
ORDER BY column_name;

-- Check indexes
SELECT 
    indexname, 
    indexdef 
FROM pg_indexes 
WHERE tablename = 'user_identities' 
    AND indexname LIKE 'idx_user_identities_%';

-- Verify RLS is enabled
SELECT 
    tablename, 
    rowsecurity 
FROM pg_tables 
WHERE tablename IN ('user_identities', 'user_auth_attempts');

-- Check functions exist
SELECT 
    proname, 
    prosrc 
FROM pg_proc 
WHERE proname IN ('cleanup_user_security_data', 'increment_failed_attempts', 'reset_failed_attempts');

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

SELECT 'Authentication system alignment migration completed successfully!' as status;
