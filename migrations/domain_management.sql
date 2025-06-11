-- Domain Management Migration
-- This migration adds tables for comprehensive domain management

-- Domain members table for multi-member domain management
CREATE TABLE IF NOT EXISTS domain_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_record_id UUID REFERENCES domain_records(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  role VARCHAR(20) NOT NULL DEFAULT 'member', -- 'owner', 'admin', 'member'
  permissions JSONB DEFAULT '[]'::jsonb, -- Array of permission strings
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(domain_record_id, user_id)
);

-- Domain transfer requests for tracking domain migrations
CREATE TABLE IF NOT EXISTS domain_transfer_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_record_id UUID REFERENCES domain_records(id) ON DELETE CASCADE,
  source_provider VARCHAR(50) NOT NULL,
  target_provider VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'completed', 'failed', 'cancelled'
  transfer_data JSONB, -- Provider-specific transfer data
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Domain inheritance for succession planning
CREATE TABLE IF NOT EXISTS domain_inheritance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_record_id UUID REFERENCES domain_records(id) ON DELETE CASCADE,
  heir_user_id UUID REFERENCES users(id),
  activation_conditions JSONB, -- Conditions for inheritance activation
  activated_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(domain_record_id)
);

-- Domain federation for family domain networks
CREATE TABLE IF NOT EXISTS domain_federation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID REFERENCES families(id),
  domain_record_id UUID REFERENCES domain_records(id) ON DELETE CASCADE,
  federation_data JSONB, -- Federation configuration and metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(domain_record_id)
);

-- Domain audit log for tracking changes
CREATE TABLE IF NOT EXISTS domain_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_record_id UUID REFERENCES domain_records(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  action VARCHAR(50) NOT NULL, -- 'create', 'update', 'delete', 'transfer', etc.
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_domain_members_domain_record_id ON domain_members(domain_record_id);
CREATE INDEX IF NOT EXISTS idx_domain_members_user_id ON domain_members(user_id);
CREATE INDEX IF NOT EXISTS idx_domain_transfer_requests_domain_record_id ON domain_transfer_requests(domain_record_id);
CREATE INDEX IF NOT EXISTS idx_domain_transfer_requests_status ON domain_transfer_requests(status);
CREATE INDEX IF NOT EXISTS idx_domain_inheritance_domain_record_id ON domain_inheritance(domain_record_id);
CREATE INDEX IF NOT EXISTS idx_domain_inheritance_heir_user_id ON domain_inheritance(heir_user_id);
CREATE INDEX IF NOT EXISTS idx_domain_federation_family_id ON domain_federation(family_id);
CREATE INDEX IF NOT EXISTS idx_domain_federation_domain_record_id ON domain_federation(domain_record_id);
CREATE INDEX IF NOT EXISTS idx_domain_audit_log_domain_record_id ON domain_audit_log(domain_record_id);
CREATE INDEX IF NOT EXISTS idx_domain_audit_log_user_id ON domain_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_domain_audit_log_action ON domain_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_domain_audit_log_created_at ON domain_audit_log(created_at);

-- Add domain sovereignty score column to domain_records
ALTER TABLE domain_records ADD COLUMN IF NOT EXISTS sovereignty_score INTEGER;
ALTER TABLE domain_records ADD COLUMN IF NOT EXISTS sovereignty_details JSONB;

-- Add domain provider configuration to domain_records
ALTER TABLE domain_records ADD COLUMN IF NOT EXISTS provider_config JSONB;

-- Add domain status column to domain_records
ALTER TABLE domain_records ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';