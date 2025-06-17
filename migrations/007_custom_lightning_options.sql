-- migrations/007_custom_lightning_options.sql
-- ADVANCED LIGHTNING SETUP OPTIONS (Independent Choices)
-- 
-- THREE INDEPENDENT OPTIONS THAT CAN BE COMBINED:
-- 1. 🏠 Self-custodial node (vs hosted Lightning)
-- 2. 🌐 Custom domain (vs @satnam.pub)
-- 3. 🏠🌐 Both combined (full advanced setup)
-- 
-- RESULTING IN FOUR POSSIBLE COMBINATIONS:
-- • Hosted + @satnam.pub (default)
-- • Hosted + custom domain  
-- • Self-custodial + @satnam.pub
-- • Self-custodial + custom domain (full advanced)

-- Add custom Lightning configuration columns
DO $$ 
BEGIN
  -- Node configuration columns
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'lightning_addresses' 
                 AND column_name = 'node_type') THEN
    ALTER TABLE lightning_addresses ADD COLUMN node_type TEXT DEFAULT 'hosted_default';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'lightning_addresses' 
                 AND column_name = 'is_custom_node') THEN
    ALTER TABLE lightning_addresses ADD COLUMN is_custom_node BOOLEAN DEFAULT FALSE;
  END IF;

  -- Domain configuration columns
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'lightning_addresses' 
                 AND column_name = 'custom_domain') THEN
    ALTER TABLE lightning_addresses ADD COLUMN custom_domain TEXT;
  END IF;

  -- Technical configuration columns
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'lightning_addresses' 
                 AND column_name = 'connection_url') THEN
    ALTER TABLE lightning_addresses ADD COLUMN connection_url TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'lightning_addresses' 
                 AND column_name = 'encrypted_node_credentials') THEN
    ALTER TABLE lightning_addresses ADD COLUMN encrypted_node_credentials TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'lightning_addresses' 
                 AND column_name = 'auth_method') THEN
    ALTER TABLE lightning_addresses ADD COLUMN auth_method TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'lightning_addresses' 
                 AND column_name = 'is_testnet') THEN
    ALTER TABLE lightning_addresses ADD COLUMN is_testnet BOOLEAN DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'lightning_addresses' 
                 AND column_name = 'node_status') THEN
    ALTER TABLE lightning_addresses ADD COLUMN node_status TEXT DEFAULT 'pending';
  END IF;
END $$;

-- Enhanced atomic Lightning setup function supporting all combinations
CREATE OR REPLACE FUNCTION setup_lightning_atomic(
  p_user_id UUID,
  p_address TEXT,
  p_btcpay_store_id TEXT DEFAULT NULL,
  p_voltage_node_id TEXT DEFAULT NULL,
  p_encrypted_btcpay_config TEXT DEFAULT NULL,
  p_encrypted_voltage_config TEXT DEFAULT NULL,
  p_active BOOLEAN DEFAULT TRUE,
  -- Independent option parameters
  p_node_type TEXT DEFAULT 'hosted_default',
  p_is_custom_node BOOLEAN DEFAULT FALSE,
  p_custom_domain TEXT DEFAULT NULL,
  p_connection_url TEXT DEFAULT NULL,
  p_encrypted_node_credentials TEXT DEFAULT NULL,
  p_auth_method TEXT DEFAULT NULL,
  p_is_testnet BOOLEAN DEFAULT FALSE
) RETURNS JSON AS $$
DECLARE
  existing_record RECORD;
  final_record RECORD;
  setup_type TEXT;
  result JSON;
BEGIN
  -- Determine setup type from parameters
  IF p_is_custom_node AND p_custom_domain IS NOT NULL THEN
    setup_type := 'custom_node_custom_domain';
  ELSIF p_is_custom_node THEN
    setup_type := 'custom_node_hosted_domain';
  ELSIF p_custom_domain IS NOT NULL THEN
    setup_type := 'hosted_node_custom_domain';
  ELSE
    setup_type := 'hosted_default';
  END IF;

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
    node_type,
    is_custom_node,
    custom_domain,
    connection_url,
    encrypted_node_credentials,
    auth_method,
    is_testnet,
    node_status,
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
    p_node_type,
    p_is_custom_node,
    p_custom_domain,
    p_connection_url,
    p_encrypted_node_credentials,
    p_auth_method,
    p_is_testnet,
    CASE 
      WHEN p_is_custom_node THEN 'pending_verification'
      ELSE 'active'
    END,
    CASE 
      WHEN p_btcpay_store_id IS NOT NULL OR p_voltage_node_id IS NOT NULL OR p_is_custom_node
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
    setup_type,
    p_btcpay_store_id IS NOT NULL,
    p_voltage_node_id IS NOT NULL,
    TRUE,
    NOW()
  );

  -- Build response JSON
  result := json_build_object(
    'success', TRUE,
    'lightning_address', row_to_json(final_record),
    'setup_type', setup_type,
    'timestamp', NOW(),
    'configuration', json_build_object(
      'is_custom_node', p_is_custom_node,
      'has_custom_domain', p_custom_domain IS NOT NULL,
      'node_type', p_node_type,
      'domain', COALESCE(p_custom_domain, 'satnam.pub')
    ),
    'services_configured', json_build_object(
      'btcpay', p_btcpay_store_id IS NOT NULL,
      'voltage', p_voltage_node_id IS NOT NULL,
      'custom_node', p_is_custom_node,
      'custom_domain', p_custom_domain IS NOT NULL
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
      setup_type || '_failed',
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

-- Create custom node verification log table
CREATE TABLE IF NOT EXISTS custom_node_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lightning_address_id UUID REFERENCES lightning_addresses(id) ON DELETE CASCADE,
  node_type TEXT NOT NULL,
  connection_url TEXT NOT NULL,
  verification_status TEXT NOT NULL, -- 'pending', 'success', 'failed'
  verification_details JSONB,
  error_message TEXT,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_custom_node_verifications_user_id 
ON custom_node_verifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lightning_addresses_setup_type 
ON lightning_addresses(user_id, is_custom_node, custom_domain) WHERE active = TRUE;

CREATE INDEX IF NOT EXISTS idx_lightning_addresses_custom_domain
ON lightning_addresses(custom_domain) WHERE custom_domain IS NOT NULL AND active = TRUE;

CREATE INDEX IF NOT EXISTS idx_lightning_addresses_node_type
ON lightning_addresses(node_type, node_status) WHERE active = TRUE;

-- Add RLS policies for custom node data
ALTER TABLE custom_node_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own node verifications"
ON custom_node_verifications FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own node verifications"
ON custom_node_verifications FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Grant necessary permissions
GRANT SELECT, INSERT ON custom_node_verifications TO authenticated;

-- Create a view for easy querying of Lightning setup combinations
CREATE OR REPLACE VIEW lightning_setup_combinations AS
SELECT 
  user_id,
  address,
  CASE 
    WHEN is_custom_node AND custom_domain IS NOT NULL THEN 'custom_node_custom_domain'
    WHEN is_custom_node THEN 'custom_node_hosted_domain'
    WHEN custom_domain IS NOT NULL THEN 'hosted_node_custom_domain'
    ELSE 'hosted_default'
  END as setup_type,
  node_type,
  custom_domain,
  COALESCE(custom_domain, 'satnam.pub') as effective_domain,
  is_custom_node,
  node_status,
  active,
  created_at,
  updated_at
FROM lightning_addresses
WHERE active = TRUE;

-- Add helpful comments for documentation
COMMENT ON TABLE custom_node_verifications IS 
'Tracks verification status of custom Lightning nodes configured by advanced users.
Supports independent choices: custom nodes, custom domains, or both combined.';

COMMENT ON COLUMN lightning_addresses.is_custom_node IS 
'TRUE when user connects their own Lightning node (vs hosted infrastructure)';

COMMENT ON COLUMN lightning_addresses.custom_domain IS 
'Custom domain for Lightning address (vs @satnam.pub). Can be used with hosted or custom nodes';

COMMENT ON COLUMN lightning_addresses.node_type IS 
'Lightning node implementation: hosted_default, lnd, cln, eclair, lnbits, btcpay_hosted';

COMMENT ON VIEW lightning_setup_combinations IS 
'Easy view of all Lightning setup combinations:
- hosted_default: Hosted Lightning + @satnam.pub  
- hosted_node_custom_domain: Hosted Lightning + custom domain
- custom_node_hosted_domain: Custom node + @satnam.pub
- custom_node_custom_domain: Custom node + custom domain (full advanced)';

-- Create a function to get setup statistics
CREATE OR REPLACE FUNCTION get_lightning_setup_stats()
RETURNS TABLE(
  setup_type TEXT,
  count BIGINT,
  percentage NUMERIC(5,2)
) AS $$
BEGIN
  RETURN QUERY
  WITH stats AS (
    SELECT 
      CASE 
        WHEN is_custom_node AND custom_domain IS NOT NULL THEN 'custom_node_custom_domain'
        WHEN is_custom_node THEN 'custom_node_hosted_domain'
        WHEN custom_domain IS NOT NULL THEN 'hosted_node_custom_domain'
        ELSE 'hosted_default'
      END as setup_type,
      COUNT(*) as count
    FROM lightning_addresses
    WHERE active = TRUE
    GROUP BY 1
  ),
  total AS (
    SELECT SUM(count) as total_count FROM stats
  )
  SELECT 
    s.setup_type,
    s.count,
    ROUND((s.count::NUMERIC / t.total_count::NUMERIC) * 100, 2) as percentage
  FROM stats s
  CROSS JOIN total t
  ORDER BY s.count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;