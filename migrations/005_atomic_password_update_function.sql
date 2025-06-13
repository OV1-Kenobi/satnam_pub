-- Migration: Add atomic password update function
-- This function ensures transactional consistency when updating passwords

CREATE OR REPLACE FUNCTION update_password_and_reencrypt(
    p_user_id UUID,
    p_old_password TEXT,
    p_new_password TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    current_encrypted_nsec TEXT;
    decrypted_nsec TEXT;
    new_encrypted_nsec TEXT;
    update_count INTEGER;
BEGIN
    -- Start transaction (implicit in function)
    
    -- Get current encrypted data with row lock to prevent concurrent modifications
    SELECT encrypted_nsec INTO current_encrypted_nsec
    FROM encrypted_keys 
    WHERE user_id = p_user_id
    FOR UPDATE;
    
    -- Check if record exists
    IF current_encrypted_nsec IS NULL THEN
        RAISE NOTICE 'No encrypted key found for user %', p_user_id;
        RETURN FALSE;
    END IF;
    
    -- Note: Actual decryption/encryption would need to be done in the application layer
    -- since PostgreSQL doesn't have access to the crypto functions
    -- This function serves as a template for when crypto functions are available in DB
    
    -- For now, we'll return FALSE to indicate this function needs crypto implementation
    -- The TypeScript fallback method should be used instead
    RAISE NOTICE 'Database-level crypto functions not implemented. Use fallback method.';
    RETURN FALSE;
    
    -- Future implementation would include:
    -- 1. Decrypt current_encrypted_nsec with p_old_password
    -- 2. Re-encrypt with p_new_password  
    -- 3. Update the record atomically
    -- 4. Return TRUE on success
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_password_and_reencrypt(UUID, TEXT, TEXT) TO authenticated;

-- Add comment explaining the function
COMMENT ON FUNCTION update_password_and_reencrypt IS 
'Atomically updates user password by re-encrypting their private key. Currently requires application-level crypto.';