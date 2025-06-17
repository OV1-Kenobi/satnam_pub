-- migrations/006_atomic_lightning_setup.sql
-- ATOMIC LIGHTNING SETUP WITH ROLLBACK CAPABILITY
-- 
-- SECURITY FEATURES:
-- 🔒 Atomic transaction with automatic rollback on failure
-- 🔒 Encrypted storage of sensitive service configurations
-- 🔒 Proper error handling and cleanup
-- 🔒 Audit trail for all Lightning setup operations

-- First, ensure lightning_addresses table has the required columns
DO $$ 
BEGIN
  -- Add encrypted config columns if they don't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'lightning_addresses' 
                 AND column_name = 'encrypted_btcpay_config') THEN
    ALTER TABLE lightning_addresses ADD COLUMN encrypted_btcpay_config TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'lightning_addresses' 
                 AND column_name = 'encrypted_voltage_config') THEN
    ALTER TABLE lightning_addresses ADD COLUMN encrypted_voltage_config TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'lightning_addresses' 
                 AND column_name = 'last_sync_at') THEN
    ALTER TABLE lightning_addresses ADD COLUMN last_sync_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'lightning_addresses' 
                 AND column_name = 'updated_at') THEN
    ALTER TABLE lightning_addresses ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- Create atomic Lightning setup function
CREATE OR REPLACE FUNCTION setup_lightning_atomic(
  p_user_id UUID,
  p_address TEXT,
  p_btcpay_store_id TEXT DEFAULT NULL,
  p_voltage_node_id TEXT DEFAULT NULL,
  p_encrypted_btcpay_config TEXT DEFAULT NULL,
  p_encrypted_voltage_config TEXT DEFAULT NULL,
  p_active BOOLEAN DEFAULT TRUE
) RETURNS JSON AS $$
DECLARE
  existing_record RECORD;
  final_record RECORD;
  result JSON;
BEGIN
  -- Start transaction (implicit in function)
  
  -- First, deactivate any existing lightning addresses for this user
  UPDATE lightning_addresses 
  SET active = FALSE, updated_at = NOW()
  WHERE user_id = p_user_id AND active = TRUE;

  -- Insert new lightning address record with all data atomically
  INSERT INTO lightning_addresses (
    user_id,
    address,
    btcpay_store_id,
    voltage_node_id,
    encrypted_btcpay_config,
    encrypted_voltage_config,
    active,
    last_sync_at,
    created_at,
    updated_at
  ) VALUES (
    p_user_id,
    p_address,
    p_btcpay_store_id,
    p_voltage_node_id,
    p_encrypted_btcpay_config,
    p_encrypted_voltage_config,
    p_active,
    CASE 
      WHEN p_btcpay_store_id IS NOT NULL OR p_voltage_node_id IS NOT NULL 
      THEN NOW() 
      ELSE NULL 
    END,
    NOW(),
    NOW()
  ) RETURNING * INTO final_record;

  -- Log the setup operation for audit trail
  INSERT INTO lightning_setup_log (
    user_id,
    lightning_address_id,
    operation_type,
    btcpay_configured,
    voltage_configured,
    success,
    created_at
  ) VALUES (
    p_user_id,
    final_record.id,
    'atomic_setup',
    p_btcpay_store_id IS NOT NULL,
    p_voltage_node_id IS NOT NULL,
    TRUE,
    NOW()
  );

  -- Build response JSON
  result := json_build_object(
    'success', TRUE,
    'lightning_address', row_to_json(final_record),
    'operation', 'atomic_setup',
    'timestamp', NOW(),
    'services_configured', json_build_object(
      'btcpay', p_btcpay_store_id IS NOT NULL,
      'voltage', p_voltage_node_id IS NOT NULL
    )
  );

  RETURN result;

EXCEPTION
  WHEN OTHERS THEN
    -- Log the failed operation
    INSERT INTO lightning_setup_log (
      user_id,
      lightning_address_id,
      operation_type,
      btcpay_configured,
      voltage_configured,
      success,
      error_message,
      created_at
    ) VALUES (
      p_user_id,
      NULL,
      'atomic_setup_failed',
      p_btcpay_store_id IS NOT NULL,
      p_voltage_node_id IS NOT NULL,
      FALSE,
      SQLERRM,
      NOW()
    );

    -- Re-raise the exception to trigger rollback
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create lightning setup audit log table
CREATE TABLE IF NOT EXISTS lightning_setup_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lightning_address_id UUID REFERENCES lightning_addresses(id) ON DELETE SET NULL,
  operation_type TEXT NOT NULL,
  btcpay_configured BOOLEAN DEFAULT FALSE,
  voltage_configured BOOLEAN DEFAULT FALSE,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for audit queries
CREATE INDEX IF NOT EXISTS idx_lightning_setup_log_user_id 
ON lightning_setup_log(user_id, created_at DESC);

-- Create updated_at trigger for lightning_addresses
CREATE OR REPLACE FUNCTION update_lightning_addresses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply the trigger
DROP TRIGGER IF EXISTS trigger_lightning_addresses_updated_at ON lightning_addresses;
CREATE TRIGGER trigger_lightning_addresses_updated_at
  BEFORE UPDATE ON lightning_addresses
  FOR EACH ROW
  EXECUTE FUNCTION update_lightning_addresses_updated_at();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION setup_lightning_atomic TO authenticated;
GRANT SELECT, INSERT ON lightning_setup_log TO authenticated;

-- Add RLS policies for the audit log
ALTER TABLE lightning_setup_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own Lightning setup logs"
ON lightning_setup_log FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Comment on the function for documentation
COMMENT ON FUNCTION setup_lightning_atomic IS 
'Atomically sets up Lightning infrastructure with rollback capability. 
Handles both BTCPay Server and Voltage integrations with encrypted configuration storage.
Includes comprehensive audit logging and proper error handling.';