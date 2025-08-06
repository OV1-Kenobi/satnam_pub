-- NIP-05 Identity Disclosure Configuration Migration
-- This migration adds support for NIP-05 identity disclosure settings
-- Run this script in the Supabase SQL editor

-- Add nip05_disclosure_config column to user_identities table
-- This stores the user's NIP-05 disclosure preferences as JSONB
ALTER TABLE user_identities 
ADD COLUMN IF NOT EXISTS nip05_disclosure_config JSONB DEFAULT NULL;

-- Create index for efficient querying of disclosure configurations
CREATE INDEX IF NOT EXISTS idx_user_identities_nip05_disclosure 
ON user_identities USING GIN (nip05_disclosure_config);

-- Add comment to document the column structure
COMMENT ON COLUMN user_identities.nip05_disclosure_config IS 
'NIP-05 identity disclosure configuration stored as JSONB with structure:
{
  "enabled": boolean,
  "nip05": string (optional),
  "scope": "direct" | "groups" | "specific-groups" (optional),
  "specificGroupIds": string[] (optional),
  "lastUpdated": ISO timestamp (optional),
  "verificationStatus": "pending" | "verified" | "failed" (optional),
  "lastVerified": ISO timestamp (optional)
}';

-- Create function to validate NIP-05 disclosure configuration
CREATE OR REPLACE FUNCTION validate_nip05_disclosure_config(config JSONB)
RETURNS BOOLEAN AS $$
BEGIN
  -- Allow NULL configurations
  IF config IS NULL THEN
    RETURN TRUE;
  END IF;
  
  -- Validate required fields
  IF NOT (config ? 'enabled') THEN
    RETURN FALSE;
  END IF;
  
  -- Validate enabled field is boolean
  IF NOT (jsonb_typeof(config->'enabled') = 'boolean') THEN
    RETURN FALSE;
  END IF;
  
  -- If enabled is true, validate additional fields
  IF (config->>'enabled')::boolean = true THEN
    -- nip05 must be present and be a string
    IF NOT (config ? 'nip05') OR NOT (jsonb_typeof(config->'nip05') = 'string') THEN
      RETURN FALSE;
    END IF;
    
    -- scope must be present and be one of the allowed values
    IF NOT (config ? 'scope') OR 
       NOT (config->>'scope' IN ('direct', 'groups', 'specific-groups')) THEN
      RETURN FALSE;
    END IF;
    
    -- If scope is specific-groups, specificGroupIds must be present and be an array
    IF config->>'scope' = 'specific-groups' THEN
      IF NOT (config ? 'specificGroupIds') OR 
         NOT (jsonb_typeof(config->'specificGroupIds') = 'array') THEN
        RETURN FALSE;
      END IF;
    END IF;
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Add check constraint to ensure valid disclosure configurations
-- Use DO block to check if constraint exists before creating it
DO $$
BEGIN
  -- Check if the constraint already exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'check_valid_nip05_disclosure_config'
    AND table_name = 'user_identities'
  ) THEN
    -- Add the constraint if it doesn't exist
    ALTER TABLE user_identities
    ADD CONSTRAINT check_valid_nip05_disclosure_config
    CHECK (validate_nip05_disclosure_config(nip05_disclosure_config));
  END IF;
END $$;

-- Create function to get users with active NIP-05 disclosure
CREATE OR REPLACE FUNCTION get_users_with_nip05_disclosure()
RETURNS TABLE (
  id UUID,
  npub TEXT,
  nip05 TEXT,
  scope TEXT,
  specific_group_ids JSONB,
  last_updated TIMESTAMP WITH TIME ZONE,
  verification_status TEXT,
  last_verified TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ui.id,
    ui.npub,
    (ui.nip05_disclosure_config->>'nip05')::TEXT as nip05,
    (ui.nip05_disclosure_config->>'scope')::TEXT as scope,
    ui.nip05_disclosure_config->'specificGroupIds' as specific_group_ids,
    (ui.nip05_disclosure_config->>'lastUpdated')::TIMESTAMP WITH TIME ZONE as last_updated,
    (ui.nip05_disclosure_config->>'verificationStatus')::TEXT as verification_status,
    (ui.nip05_disclosure_config->>'lastVerified')::TIMESTAMP WITH TIME ZONE as last_verified
  FROM user_identities ui
  WHERE ui.nip05_disclosure_config IS NOT NULL
    AND (ui.nip05_disclosure_config->>'enabled')::boolean = true;
END;
$$ LANGUAGE plpgsql;

-- Create function to audit NIP-05 disclosure changes
CREATE OR REPLACE FUNCTION audit_nip05_disclosure_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only audit if nip05_disclosure_config has changed
  IF OLD.nip05_disclosure_config IS DISTINCT FROM NEW.nip05_disclosure_config THEN
    INSERT INTO auth_audit_log (
      user_id,
      action,
      encrypted_details,
      ip_hash,
      user_agent_hash,
      success
    ) VALUES (
      NEW.id,
      'nip05_disclosure_config_changed',
      jsonb_build_object(
        'old_config', OLD.nip05_disclosure_config,
        'new_config', NEW.nip05_disclosure_config,
        'timestamp', NOW()
      )::TEXT,
      'system_trigger',
      'database_trigger',
      true
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auditing NIP-05 disclosure changes
DROP TRIGGER IF EXISTS trigger_audit_nip05_disclosure ON user_identities;
CREATE TRIGGER trigger_audit_nip05_disclosure
  AFTER UPDATE ON user_identities
  FOR EACH ROW
  EXECUTE FUNCTION audit_nip05_disclosure_change();

-- Grant necessary permissions for the application to use these functions
-- Note: Adjust role names based on your Supabase setup
GRANT EXECUTE ON FUNCTION validate_nip05_disclosure_config(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION get_users_with_nip05_disclosure() TO authenticated;

-- Create RLS policies for nip05_disclosure_config access
-- Users can only read/write their own disclosure configuration
-- Use DO blocks to check if policies exist before creating them
DO $$
BEGIN
  -- Create SELECT policy if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Users can read own nip05 disclosure config'
    AND tablename = 'user_identities'
  ) THEN
    CREATE POLICY "Users can read own nip05 disclosure config"
    ON user_identities FOR SELECT
    USING (auth.uid() = user_identities.id);
  END IF;
END $$;

DO $$
BEGIN
  -- Create UPDATE policy if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Users can update own nip05 disclosure config'
    AND tablename = 'user_identities'
  ) THEN
    CREATE POLICY "Users can update own nip05 disclosure config"
    ON user_identities FOR UPDATE
    USING (auth.uid() = user_identities.id);
  END IF;
END $$;

-- Add helpful comments for maintenance
COMMENT ON FUNCTION validate_nip05_disclosure_config(JSONB) IS 
'Validates the structure and content of NIP-05 disclosure configuration JSONB';

COMMENT ON FUNCTION get_users_with_nip05_disclosure() IS 
'Returns all users who have active NIP-05 disclosure enabled with their configuration details';

COMMENT ON FUNCTION audit_nip05_disclosure_change() IS 
'Trigger function that logs changes to NIP-05 disclosure configuration for audit purposes';

-- Migration completed successfully
SELECT 'NIP-05 disclosure configuration migration completed successfully' as status;
