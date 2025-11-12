-- migrations/006_atomic_lightning_setup_privacy_first.sql
-- PRIVACY-FIRST ATOMIC LIGHTNING SETUP 
-- Updated to work with user_identities table and encrypted storage
-- 
-- SECURITY FEATURES:
-- 🔒 Atomic transaction with automatic rollback on failure
-- 🔒 Encrypted storage in privacy_settings JSONB field
-- 🔒 Encrypted Lightning addresses in user_identities table
-- 🔒 Zero plaintext storage of sensitive data
-- 🔒 Audit trail for all Lightning setup operations

-- Create privacy-first Lightning setup function
CREATE OR REPLACE FUNCTION setup_lightning_atomic_privacy_first(
  p_user_duid TEXT,
  p_encrypted_lightning_address TEXT,
  p_encrypted_lightning_address_iv TEXT,
  p_encrypted_lightning_address_tag TEXT,
  p_encrypted_config JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE(
  success BOOLEAN,
  message TEXT,
  user_duid TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_exists BOOLEAN;
  v_current_settings JSONB;
  v_new_settings JSONB;
BEGIN
  -- Validate input parameters
  IF p_user_duid IS NULL OR p_user_duid = '' THEN
    RETURN QUERY SELECT false, 'Invalid user DUID provided'::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  IF p_encrypted_lightning_address IS NULL OR p_encrypted_lightning_address = '' OR
     p_encrypted_lightning_address_iv IS NULL OR p_encrypted_lightning_address_iv = '' OR
     p_encrypted_lightning_address_tag IS NULL OR p_encrypted_lightning_address_tag = '' THEN
    RETURN QUERY SELECT false, 'Invalid encrypted Lightning address payload provided'::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  -- Start atomic transaction
  BEGIN
    -- Check if user exists
    SELECT EXISTS(SELECT 1 FROM user_identities WHERE id = p_user_duid) INTO v_user_exists;
    
    IF NOT v_user_exists THEN
      RETURN QUERY SELECT false, 'User not found'::TEXT, NULL::TEXT;
      RETURN;
    END IF;

    -- Get current privacy settings
    SELECT privacy_settings INTO v_current_settings 
    FROM user_identities 
    WHERE id = p_user_duid;

    -- If privacy_settings is NULL, initialize it
    IF v_current_settings IS NULL THEN
      v_current_settings := '{
        "privacy_level": "maximum",
        "zero_knowledge_enabled": true,
        "over_encryption": true,
        "is_imported_account": false
      }'::jsonb;
    END IF;

    -- Add Lightning configuration to privacy settings
    v_new_settings := v_current_settings || jsonb_build_object(
      'lightning_config', p_encrypted_config,
      'lightning_setup_at', EXTRACT(EPOCH FROM NOW())::bigint,
      'lightning_address_updated_at', EXTRACT(EPOCH FROM NOW())::bigint
    );

    -- Update user_identities with encrypted Lightning address and encrypted config
    UPDATE user_identities SET
      encrypted_lightning_address = p_encrypted_lightning_address,
      encrypted_lightning_address_iv = p_encrypted_lightning_address_iv,
      encrypted_lightning_address_tag = p_encrypted_lightning_address_tag,
      privacy_settings = v_new_settings,
      updated_at = NOW()
    WHERE id = p_user_duid;

    -- Log successful setup (without exposing sensitive data)
    INSERT INTO audit_log (
      user_duid,
      action_type,
      resource_type,
      details,
      created_at
    ) VALUES (
      p_user_duid,
      'lightning_setup',
      'user_identity',
      jsonb_build_object(
        'encrypted_address_length', length(p_encrypted_lightning_address),
        'config_keys_count', jsonb_array_length(jsonb_object_keys(p_encrypted_config)),
        'setup_timestamp', EXTRACT(EPOCH FROM NOW())::bigint
      ),
      NOW()
    );

    RETURN QUERY SELECT true, 'Lightning setup completed successfully'::TEXT, p_user_duid;

  EXCEPTION WHEN OTHERS THEN
    -- Log error (without exposing sensitive data)
    INSERT INTO audit_log (
      user_duid,
      action_type,
      resource_type,
      details,
      created_at
    ) VALUES (
      p_user_duid,
      'lightning_setup_error',
      'user_identity',
      jsonb_build_object(
        'error_code', SQLSTATE,
        'error_hint', SQLERRM,
        'timestamp', EXTRACT(EPOCH FROM NOW())::bigint
      ),
      NOW()
    );
    
    RETURN QUERY SELECT false, 'Lightning setup failed: ' || SQLERRM, NULL::TEXT;
END;
END;
$$;

-- Create audit log table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_log' AND table_schema = 'public') THEN
    CREATE TABLE audit_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_duid TEXT NOT NULL, -- References user_identities.id
      action_type TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      details JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    
    -- Create index for efficient queries
    CREATE INDEX idx_audit_log_user_duid ON audit_log(user_duid);
    CREATE INDEX idx_audit_log_action_type ON audit_log(action_type);
    CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);
  END IF;
END $$;

-- Create function to retrieve Lightning config (encrypted)
CREATE OR REPLACE FUNCTION get_lightning_config_privacy_first(p_user_duid TEXT)
RETURNS TABLE(
  user_duid TEXT,
  encrypted_lightning_address TEXT,
  encrypted_lightning_address_iv TEXT,
  encrypted_lightning_address_tag TEXT,
  encrypted_config JSONB,
  setup_timestamp BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ui.id as user_duid,
    ui.encrypted_lightning_address,
    ui.encrypted_lightning_address_iv,
    ui.encrypted_lightning_address_tag,
    (ui.privacy_settings->>'lightning_config')::jsonb as encrypted_config,
    (ui.privacy_settings->>'lightning_setup_at')::bigint as setup_timestamp
  FROM user_identities ui
  WHERE ui.id = p_user_duid
    AND ui.encrypted_lightning_address IS NOT NULL;
END;
$$;

-- Create function to update Lightning configuration
CREATE OR REPLACE FUNCTION update_lightning_config_privacy_first(
  p_user_duid TEXT,
  p_new_encrypted_config JSONB
)
RETURNS TABLE(
  success BOOLEAN,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_settings JSONB;
  v_new_settings JSONB;
BEGIN
  -- Get current privacy settings
  SELECT privacy_settings INTO v_current_settings 
  FROM user_identities 
  WHERE id = p_user_duid;

  IF v_current_settings IS NULL THEN
    RETURN QUERY SELECT false, 'User not found or no privacy settings'::TEXT;
    RETURN;
  END IF;

  -- Update Lightning configuration in privacy settings
  v_new_settings := v_current_settings || jsonb_build_object(
    'lightning_config', p_new_encrypted_config,
    'lightning_config_updated_at', EXTRACT(EPOCH FROM NOW())::bigint
  );

  -- Update user_identities
  UPDATE user_identities SET
    privacy_settings = v_new_settings,
    updated_at = NOW()
  WHERE id = p_user_duid;

  -- Log update
  INSERT INTO audit_log (
    user_duid,
    action_type,
    resource_type,
    details,
    created_at
  ) VALUES (
    p_user_duid,
    'lightning_config_update',
    'user_identity',
    jsonb_build_object(
      'config_keys_count', jsonb_array_length(jsonb_object_keys(p_new_encrypted_config)),
      'update_timestamp', EXTRACT(EPOCH FROM NOW())::bigint
    ),
    NOW()
  );

  RETURN QUERY SELECT true, 'Lightning configuration updated successfully'::TEXT;
END;
$$;

-- Success message
SELECT '🎉 PRIVACY-FIRST LIGHTNING SETUP MIGRATION COMPLETED' as result;