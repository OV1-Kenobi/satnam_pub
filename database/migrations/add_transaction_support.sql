-- Add transaction support functions for secure operations
-- This file should be executed in your Supabase SQL editor

-- Enable pgcrypto extension for cryptographic functions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Helper function to derive encryption key from password using proper PBKDF2
CREATE OR REPLACE FUNCTION derive_key_from_password(
  p_password TEXT,
  p_salt BYTEA,
  p_iterations INTEGER DEFAULT 100000
)
RETURNS BYTEA
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_key BYTEA;
  v_previous BYTEA;
  v_current BYTEA;
  i INTEGER;
BEGIN
  -- PBKDF2 implementation with HMAC-SHA256
  -- Initial iteration: HMAC(password, salt || 0x00000001)
  v_previous := hmac(p_password::BYTEA, p_salt || '\x00000001'::BYTEA, 'sha256');
  v_key := v_previous;
  
  -- Subsequent iterations: HMAC(password, previous_result)
  FOR i IN 2..p_iterations LOOP
    v_current := hmac(p_password::BYTEA, v_previous, 'sha256');
    v_key := v_key # v_current; -- XOR operation
    v_previous := v_current;
  END LOOP;
  
  RETURN v_key;
END;
$$;

-- Helper function to encrypt data with AES-256-CBC
CREATE OR REPLACE FUNCTION encrypt_with_password(
  p_data TEXT,
  p_password TEXT,
  p_salt BYTEA DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_salt BYTEA;
  v_key BYTEA;
  v_iv BYTEA;
  v_encrypted BYTEA;
BEGIN
  -- Generate salt if not provided
  v_salt := COALESCE(p_salt, gen_random_bytes(32));
  
  -- Derive key from password and salt
  v_key := derive_key_from_password(p_password, v_salt);
  
  -- Generate random IV
  v_iv := gen_random_bytes(16);
  
  -- Encrypt the data with the generated IV
  v_encrypted := encrypt_iv(p_data::BYTEA, v_key, v_iv, 'aes-cbc/pad:pkcs');
  
  -- Return encrypted data with salt and IV as JSON
  RETURN jsonb_build_object(
    'encrypted', encode(v_encrypted, 'base64'),
    'salt', encode(v_salt, 'base64'),
    'iv', encode(v_iv, 'base64'),
    'algorithm', 'aes-256-cbc'
  );
END;
$$;

-- Helper function to decrypt data with AES-256-CBC
CREATE OR REPLACE FUNCTION decrypt_with_password(
  p_encrypted_data JSONB,
  p_password TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_salt BYTEA;
  v_iv BYTEA;
  v_encrypted BYTEA;
  v_key BYTEA;
  v_decrypted BYTEA;
BEGIN
  -- Extract components from JSON
  v_salt := decode(p_encrypted_data->>'salt', 'base64');
  v_iv := decode(p_encrypted_data->>'iv', 'base64');
  v_encrypted := decode(p_encrypted_data->>'encrypted', 'base64');
  
  -- Derive key from password and salt
  v_key := derive_key_from_password(p_password, v_salt);
  
  -- Decrypt the data with the stored IV
  v_decrypted := decrypt_iv(v_encrypted, v_key, v_iv, 'aes-cbc/pad:pkcs');
  
  -- Return decrypted text
  RETURN convert_from(v_decrypted, 'UTF8');
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Decryption failed - invalid password or corrupted data';
END;
$$;

-- Function to begin a transaction (placeholder for explicit transaction handling)
CREATE OR REPLACE FUNCTION begin_transaction()
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  -- PostgreSQL auto-starts transactions, so this is mainly for consistency
  -- In practice, each function call is already in a transaction
  RETURN TRUE;
END;
$$;

-- Function to commit a transaction (placeholder for explicit transaction handling)
CREATE OR REPLACE FUNCTION commit_transaction()
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  -- PostgreSQL auto-commits at the end of functions
  -- This is mainly for consistency with the transaction pattern
  RETURN TRUE;
END;
$$;

-- Function to rollback a transaction (placeholder for explicit transaction handling)
CREATE OR REPLACE FUNCTION rollback_transaction()
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  -- Raise an exception to rollback the current transaction
  RAISE EXCEPTION 'Transaction rolled back';
  RETURN FALSE;
END;
$$;

-- Atomic password update function with proper transaction handling
CREATE OR REPLACE FUNCTION update_password_and_reencrypt(
  p_user_id TEXT,
  p_old_password TEXT,
  p_new_password TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_encrypted_data JSONB;
  decrypted_nsec TEXT;
  new_encrypted_data JSONB;
  current_salt TEXT;
BEGIN
  -- This entire function runs in a single transaction
  
  -- Get current encrypted data with row lock
  SELECT encrypted_nsec::JSONB, salt INTO current_encrypted_data, current_salt
  FROM encrypted_keys
  WHERE user_id = p_user_id
  FOR UPDATE; -- This locks the row for the duration of the transaction
  
  IF current_encrypted_data IS NULL THEN
    RAISE EXCEPTION 'No encrypted key found for user %', p_user_id;
  END IF;
  
  -- Try to decrypt with old password
  BEGIN
    decrypted_nsec := decrypt_with_password(current_encrypted_data, p_old_password);
  EXCEPTION
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Invalid old password for user %', p_user_id;
  END;
  
  -- Re-encrypt with new password (reuse the same salt if available)
  IF current_salt IS NOT NULL THEN
    new_encrypted_data := encrypt_with_password(
      decrypted_nsec, 
      p_new_password, 
      decode(current_salt, 'base64')
    );
  ELSE
    new_encrypted_data := encrypt_with_password(decrypted_nsec, p_new_password);
  END IF;
  
  -- Update the encrypted key and salt
  UPDATE encrypted_keys 
  SET 
    encrypted_nsec = new_encrypted_data::TEXT,
    salt = new_encrypted_data->>'salt',
    updated_at = NOW()
  WHERE user_id = p_user_id;
  
  -- Clear sensitive variables from memory
  decrypted_nsec := NULL;
  new_encrypted_data := NULL;
  
  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    -- Clear sensitive variables on error
    decrypted_nsec := NULL;
    new_encrypted_data := NULL;
    RAISE;
END;
$$;

-- Atomic encrypted key storage function (with password-based encryption)
CREATE OR REPLACE FUNCTION store_encrypted_nsec_atomic(
  p_user_id TEXT,
  p_nsec TEXT,
  p_password TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  encrypted_data JSONB;
BEGIN
  -- Encrypt the nsec with the password
  encrypted_data := encrypt_with_password(p_nsec, p_password);
  
  -- Insert encrypted key atomically
  INSERT INTO encrypted_keys (user_id, encrypted_nsec, salt, created_at)
  VALUES (
    p_user_id, 
    encrypted_data::TEXT, 
    encrypted_data->>'salt', 
    NOW()
  );
  
  -- Clear sensitive data from memory
  encrypted_data := NULL;
  
  RETURN TRUE;
EXCEPTION
  WHEN unique_violation THEN
    -- Clear sensitive data on error
    encrypted_data := NULL;
    RAISE EXCEPTION 'Encrypted key already exists for user %', p_user_id;
  WHEN OTHERS THEN
    -- Clear sensitive data on error
    encrypted_data := NULL;
    RAISE EXCEPTION 'Failed to store encrypted key: %', SQLERRM;
END;
$$;

-- Overloaded function to maintain backward compatibility (for pre-encrypted data)
CREATE OR REPLACE FUNCTION store_encrypted_nsec_atomic(
  p_user_id TEXT,
  p_encrypted_nsec TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert pre-encrypted key atomically (legacy format)
  INSERT INTO encrypted_keys (user_id, encrypted_nsec, salt, created_at)
  VALUES (p_user_id, p_encrypted_nsec, NULL, NOW());
  
  RETURN TRUE;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Encrypted key already exists for user %', p_user_id;
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to store encrypted key: %', SQLERRM;
END;
$$;

-- Function to retrieve and decrypt nsec key
CREATE OR REPLACE FUNCTION get_decrypted_nsec(
  p_user_id TEXT,
  p_password TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  encrypted_data JSONB;
  decrypted_nsec TEXT;
BEGIN
  -- Get encrypted data
  SELECT encrypted_nsec::JSONB INTO encrypted_data
  FROM encrypted_keys
  WHERE user_id = p_user_id;
  
  IF encrypted_data IS NULL THEN
    RAISE EXCEPTION 'No encrypted key found for user %', p_user_id;
  END IF;
  
  -- Decrypt and return
  decrypted_nsec := decrypt_with_password(encrypted_data, p_password);
  
  RETURN decrypted_nsec;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to decrypt key for user %: %', p_user_id, SQLERRM;
END;
$$;

-- Atomic encrypted key deletion function
CREATE OR REPLACE FUNCTION delete_encrypted_nsec_atomic(
  p_user_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete encrypted key atomically
  DELETE FROM encrypted_keys WHERE user_id = p_user_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No encrypted key found for user %', p_user_id;
  END IF;
  
  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to delete encrypted key: %', SQLERRM;
END;
$$;

-- Add updated_at column if it doesn't exist (for optimistic locking)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'encrypted_keys' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE encrypted_keys ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
  END IF;
END $$;

-- Create trigger to auto-update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Drop trigger if exists and create new one
DROP TRIGGER IF EXISTS trigger_update_encrypted_keys_updated_at ON encrypted_keys;
CREATE TRIGGER trigger_update_encrypted_keys_updated_at
  BEFORE UPDATE ON encrypted_keys
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION begin_transaction() TO authenticated;
GRANT EXECUTE ON FUNCTION commit_transaction() TO authenticated;
GRANT EXECUTE ON FUNCTION rollback_transaction() TO authenticated;
GRANT EXECUTE ON FUNCTION derive_key_from_password(TEXT, BYTEA, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION encrypt_with_password(TEXT, TEXT, BYTEA) TO authenticated;
GRANT EXECUTE ON FUNCTION decrypt_with_password(JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION update_password_and_reencrypt(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION store_encrypted_nsec_atomic(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION store_encrypted_nsec_atomic(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_decrypted_nsec(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_encrypted_nsec_atomic(TEXT) TO authenticated;