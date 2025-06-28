-- Rate Limiting Functions for Supabase
-- Copy and paste this into your Supabase SQL Editor

-- Create the main rate limiting function
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

-- Create the cleanup function
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

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION check_and_update_rate_limit TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION cleanup_expired_rate_limits TO service_role;