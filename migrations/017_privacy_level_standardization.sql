-- Privacy Level Standardization Migration
-- Migrates from old privacy patterns to new PrivacyLevel enum
-- File: migrations/017_privacy_level_standardization.sql

-- Create privacy_level enum type
CREATE TYPE privacy_level AS ENUM ('giftwrapped', 'encrypted', 'minimal');

-- Add privacy_level columns to existing tables
ALTER TABLE private_messages 
  ADD COLUMN new_privacy_level privacy_level DEFAULT 'giftwrapped';

-- Migrate existing data from old privacy levels
UPDATE private_messages 
SET new_privacy_level = CASE 
  WHEN message_privacy_level = 'maximum' THEN 'giftwrapped'::privacy_level
  WHEN message_privacy_level = 'enhanced' THEN 'encrypted'::privacy_level
  WHEN message_privacy_level = 'standard' THEN 'minimal'::privacy_level
  ELSE 'giftwrapped'::privacy_level
END;

-- Add privacy columns to transactions table
ALTER TABLE transactions 
  ADD COLUMN privacy_level privacy_level DEFAULT 'giftwrapped',
  ADD COLUMN privacy_routing_used BOOLEAN DEFAULT false,
  ADD COLUMN metadata_protection_level INTEGER DEFAULT 100;

-- Add privacy columns to family_members table
ALTER TABLE family_members 
  ADD COLUMN default_privacy_level privacy_level DEFAULT 'giftwrapped',
  ADD COLUMN guardian_approval_required BOOLEAN DEFAULT true,
  ADD COLUMN privacy_preferences JSONB DEFAULT '{}';

-- Add privacy columns to individual_wallets table
ALTER TABLE individual_wallets 
  ADD COLUMN privacy_settings JSONB DEFAULT '{
    "defaultPrivacyLevel": "giftwrapped",
    "allowMinimalPrivacy": false,
    "lnproxyEnabled": true,
    "cashuPreferred": true
  }';

-- Add privacy columns to lightning_payments table
ALTER TABLE lightning_payments 
  ADD COLUMN privacy_level privacy_level DEFAULT 'giftwrapped',
  ADD COLUMN routing_privacy JSONB DEFAULT '{}',
  ADD COLUMN lnproxy_used BOOLEAN DEFAULT false;

-- Add privacy columns to fedimint_operations table
ALTER TABLE fedimint_operations 
  ADD COLUMN privacy_level privacy_level DEFAULT 'giftwrapped',
  ADD COLUMN guardian_privacy_approval JSONB DEFAULT '{}';

-- Create privacy_audit_log table
CREATE TABLE privacy_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_hash TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  privacy_level privacy_level NOT NULL,
  metadata_protection INTEGER NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  operation_details JSONB DEFAULT '{}',
  INDEX idx_privacy_audit_user (user_hash),
  INDEX idx_privacy_audit_timestamp (timestamp)
);

-- Create guardian_privacy_approvals table
CREATE TABLE guardian_privacy_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id TEXT NOT NULL,
  member_hash TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  requested_privacy_level privacy_level NOT NULL,
  guardian_signatures JSONB DEFAULT '[]',
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  approved_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '24 hours',
  CONSTRAINT check_approval_status CHECK (status IN ('pending', 'approved', 'rejected', 'expired'))
);

-- Drop old privacy level column after migration
ALTER TABLE private_messages DROP COLUMN message_privacy_level;

-- Add constraints and indexes
CREATE INDEX idx_transactions_privacy_level ON transactions(privacy_level);
CREATE INDEX idx_messages_privacy_level ON private_messages(new_privacy_level);
CREATE INDEX idx_guardian_approvals_status ON guardian_privacy_approvals(status, expires_at);

-- Rename new_privacy_level to privacy_level
ALTER TABLE private_messages RENAME COLUMN new_privacy_level TO privacy_level;

-- Add RLS policies for privacy protection
ALTER TABLE privacy_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardian_privacy_approvals ENABLE ROW LEVEL SECURITY;

-- Create privacy audit function
CREATE OR REPLACE FUNCTION log_privacy_operation(
  p_user_hash TEXT,
  p_operation_type TEXT,
  p_privacy_level privacy_level,
  p_metadata_protection INTEGER DEFAULT 100,
  p_operation_details JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
  audit_id UUID;
BEGIN
  INSERT INTO privacy_audit_log (
    user_hash,
    operation_type,
    privacy_level,
    metadata_protection,
    operation_details
  ) VALUES (
    p_user_hash,
    p_operation_type,
    p_privacy_level,
    p_metadata_protection,
    p_operation_details
  ) RETURNING id INTO audit_id;
  
  RETURN audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON MIGRATION IS 'Standardizes privacy levels across all tables and adds privacy audit logging';