-- Add transaction support functions for secure operations
-- This file should be executed in your Supabase SQL editor

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
  current_encrypted_nsec TEXT;
  decrypted_nsec TEXT;
  new_encrypted_nsec TEXT;
BEGIN
  -- This entire function runs in a single transaction
  
  -- Get current encrypted data with row lock
  SELECT encrypted_nsec INTO current_encrypted_nsec
  FROM encrypted_keys
  WHERE user_id = p_user_id
  FOR UPDATE; -- This locks the row for the duration of the transaction
  
  IF current_encrypted_nsec IS NULL THEN
    RAISE EXCEPTION 'No encrypted key found for user %', p_user_id;
  END IF;
  
  -- Note: In a real implementation, you would need to implement the decrypt/encrypt
  -- functions in PostgreSQL or use a more secure approach where the decryption
  -- happens in the application layer within the transaction context
  
  -- For now, we'll return FALSE to indicate this function needs to be implemented
  -- with proper cryptographic functions or the application should handle the
  -- decryption/encryption within a proper transaction context
  
  RAISE EXCEPTION 'This function requires cryptographic implementation in PostgreSQL or application-level transaction handling';
  
  RETURN FALSE;
END;
$$;

-- Atomic encrypted key storage function
CREATE OR REPLACE FUNCTION store_encrypted_nsec_atomic(
  p_user_id TEXT,
  p_encrypted_nsec TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert encrypted key atomically
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
GRANT EXECUTE ON FUNCTION update_password_and_reencrypt(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION store_encrypted_nsec_atomic(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_encrypted_nsec_atomic(TEXT) TO authenticated;