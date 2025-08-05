-- =====================================================
-- PRODUCTION RATE LIMITING MIGRATION SCRIPT
-- Copy and paste this entire script into your Supabase SQL Editor
-- =====================================================

-- This migration creates production-ready database-backed rate limiting
-- to replace the in-memory implementation that has critical limitations
-- in serverless environments.

-- =====================================================
-- 1. CREATE RATE LIMITING TABLE
-- =====================================================

-- Create the rate limiting table if it doesn't exist
CREATE TABLE IF NOT EXISTS rate_limits (
    id BIGSERIAL PRIMARY KEY,
    hashed_user_id VARCHAR(64) NOT NULL UNIQUE,
    request_count INTEGER NOT NULL DEFAULT 0,
    reset_time TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_rate_limits_hashed_user_id ON rate_limits(hashed_user_id);
CREATE INDEX IF NOT EXISTS idx_rate_limits_reset_time ON rate_limits(reset_time);

-- =====================================================
-- 2. CREATE TRIGGER FUNCTION FOR UPDATED_AT
-- =====================================================

-- Create function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_rate_limits_updated_at ON rate_limits;
CREATE TRIGGER update_rate_limits_updated_at 
    BEFORE UPDATE ON rate_limits 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 3. ENABLE ROW LEVEL SECURITY
-- =====================================================

-- Enable RLS (Row Level Security) for additional security
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Service role can manage rate limits" ON rate_limits;

-- Create policy to allow service role access
CREATE POLICY "Service role can manage rate limits" ON rate_limits
    FOR ALL USING (auth.role() = 'service_role');

-- =====================================================
-- 4. CREATE MAIN RATE LIMITING FUNCTION
-- =====================================================

-- Create the rate limiting check and update function
CREATE OR REPLACE FUNCTION check_and_update_rate_limit(
    user_hash TEXT,
    rate_limit INTEGER,
    window_ms BIGINT
)
RETURNS JSON AS $$
DECLARE
    current_time TIMESTAMPTZ := NOW();
    reset_time TIMESTAMPTZ;
    current_count INTEGER := 0;
    allowed BOOLEAN := FALSE;
    result JSON;
BEGIN
    -- Calculate the reset time based on the window
    reset_time := current_time + INTERVAL '1 millisecond' * window_ms;
    
    -- Try to get existing rate limit record
    SELECT request_count, rate_limits.reset_time INTO current_count, reset_time
    FROM rate_limits 
    WHERE hashed_user_id = user_hash;
    
    IF NOT FOUND THEN
        -- No existing record, create new one
        INSERT INTO rate_limits (hashed_user_id, request_count, reset_time)
        VALUES (user_hash, 1, current_time + INTERVAL '1 millisecond' * window_ms);
        
        allowed := TRUE;
        current_count := 1;
    ELSE
        -- Check if reset time has passed
        IF current_time > reset_time THEN
            -- Reset the counter
            UPDATE rate_limits 
            SET request_count = 1, 
                reset_time = current_time + INTERVAL '1 millisecond' * window_ms
            WHERE hashed_user_id = user_hash;
            
            allowed := TRUE;
            current_count := 1;
        ELSE
            -- Check if under rate limit
            IF current_count < rate_limit THEN
                -- Increment counter
                UPDATE rate_limits 
                SET request_count = request_count + 1
                WHERE hashed_user_id = user_hash;
                
                allowed := TRUE;
                current_count := current_count + 1;
            ELSE
                -- Rate limit exceeded
                allowed := FALSE;
            END IF;
        END IF;
    END IF;
    
    -- Return result as JSON
    result := json_build_object(
        'allowed', allowed,
        'current_count', current_count,
        'rate_limit', rate_limit,
        'reset_time', EXTRACT(EPOCH FROM reset_time) * 1000,
        'window_ms', window_ms
    );
    
    RETURN result;
    
EXCEPTION
    WHEN OTHERS THEN
        -- Log error and return failure
        RAISE LOG 'Error in check_and_update_rate_limit: %', SQLERRM;
        RETURN json_build_object(
            'allowed', FALSE,
            'error', SQLERRM,
            'current_count', 0,
            'rate_limit', rate_limit
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 5. CREATE CLEANUP FUNCTION
-- =====================================================

-- Create a cleanup function to remove old rate limit records
CREATE OR REPLACE FUNCTION cleanup_expired_rate_limits()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM rate_limits 
    WHERE reset_time < NOW() - INTERVAL '24 hours';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RAISE LOG 'Cleaned up % expired rate limit records', deleted_count;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 6. GRANT PERMISSIONS
-- =====================================================

-- Grant execute permission to authenticated and service roles
GRANT EXECUTE ON FUNCTION check_and_update_rate_limit TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION cleanup_expired_rate_limits TO service_role;

-- =====================================================
-- 7. VERIFICATION QUERIES
-- =====================================================

-- Verify table was created
SELECT 
    'rate_limits table' as component,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rate_limits') 
        THEN '✅ EXISTS' 
        ELSE '❌ MISSING' 
    END as status;

-- Verify indexes were created
SELECT 
    'rate_limits indexes' as component,
    CASE 
        WHEN EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'rate_limits' AND indexname = 'idx_rate_limits_hashed_user_id')
        AND EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'rate_limits' AND indexname = 'idx_rate_limits_reset_time')
        THEN '✅ EXISTS' 
        ELSE '❌ MISSING' 
    END as status;

-- Verify functions were created
SELECT 
    'rate_limits functions' as component,
    CASE 
        WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'check_and_update_rate_limit')
        AND EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'cleanup_expired_rate_limits')
        THEN '✅ EXISTS' 
        ELSE '❌ MISSING' 
    END as status;

-- Verify RLS is enabled
SELECT 
    'rate_limits RLS' as component,
    CASE 
        WHEN EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace 
                    WHERE c.relname = 'rate_limits' AND n.nspname = 'public' AND c.relrowsecurity = true)
        THEN '✅ ENABLED' 
        ELSE '❌ DISABLED' 
    END as status;

-- =====================================================
-- 8. TEST THE RATE LIMITING FUNCTION
-- =====================================================

-- Test the rate limiting function with a sample request
SELECT 
    'Rate limiting test' as test_name,
    check_and_update_rate_limit('test_user_hash_123', 5, 60000) as result;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

-- Display success message
DO $$
BEGIN
    RAISE NOTICE '🎉 MIGRATION COMPLETE: Production rate limiting infrastructure created successfully!';
    RAISE NOTICE '📋 Next steps:';
    RAISE NOTICE '   1. Update your application code to use checkRateLimitDB() instead of checkRateLimit()';
    RAISE NOTICE '   2. Set up periodic cleanup job to call cleanup_expired_rate_limits()';
    RAISE NOTICE '   3. Monitor rate limiting performance and adjust as needed';
    RAISE NOTICE '   4. Consider setting up alerts for rate limit violations';
END $$;
