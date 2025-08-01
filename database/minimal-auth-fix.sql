-- =====================================================
-- MINIMAL AUTHENTICATION FIX
-- Only adds essential password fields to user_identities table
-- =====================================================

-- Add password storage fields to user_identities table
ALTER TABLE public.user_identities 
ADD COLUMN IF NOT EXISTS password_hash TEXT,
ADD COLUMN IF NOT EXISTS password_salt VARCHAR(32),
ADD COLUMN IF NOT EXISTS failed_attempts INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_successful_auth TIMESTAMP WITH TIME ZONE;

-- Add performance index for NIP-05 lookups
CREATE INDEX IF NOT EXISTS idx_user_identities_nip05 ON user_identities(nip05);

-- Create simple auth attempts table (optional - for logging only)
CREATE TABLE IF NOT EXISTS public.user_auth_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nip05 VARCHAR(255),
    attempt_result TEXT NOT NULL,
    attempted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Grant permissions for anonymous authentication
GRANT SELECT, INSERT, UPDATE ON user_identities TO anon;
GRANT SELECT, INSERT ON user_auth_attempts TO anon;

-- Verification query
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'user_identities' 
    AND column_name IN ('password_hash', 'password_salt', 'failed_attempts')
ORDER BY column_name;

SELECT 'Minimal authentication fix completed!' as status;
