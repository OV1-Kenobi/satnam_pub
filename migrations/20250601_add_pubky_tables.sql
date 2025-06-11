-- Migration: Add Pubky Domain Management Tables
-- Description: This migration adds tables for Pubky domain management and family sovereignty tracking

-- Create pubky_domains table for storing Pubky domain registrations
CREATE TABLE IF NOT EXISTS pubky_domains (
  id UUID PRIMARY KEY,
  domain_record_id UUID NOT NULL REFERENCES domain_records(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL,
  private_key_encrypted TEXT NOT NULL,
  homeserver_url TEXT,
  pkarr_relay_url TEXT,
  registration_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  last_verified_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_domain_record UNIQUE (domain_record_id),
  CONSTRAINT unique_public_key UNIQUE (public_key)
);

-- Create pubky_keypairs table for family Pubky key management
CREATE TABLE IF NOT EXISTS pubky_keypairs (
  id UUID PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  public_key TEXT NOT NULL,
  private_key_encrypted TEXT NOT NULL,
  key_type VARCHAR(20) NOT NULL DEFAULT 'ed25519',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_family_keypair_name UNIQUE (family_id, name),
  CONSTRAINT unique_family_public_key UNIQUE (family_id, public_key)
);

-- Create domain_migrations table for tracking DNS to Pubky migrations
CREATE TABLE IF NOT EXISTS domain_migrations (
  id UUID PRIMARY KEY,
  domain_record_id UUID NOT NULL REFERENCES domain_records(id) ON DELETE CASCADE,
  source_provider VARCHAR(50) NOT NULL,
  target_provider VARCHAR(50) NOT NULL,
  migration_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  error_message TEXT,
  migration_data JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_active_migration UNIQUE (domain_record_id, migration_status) 
    WHERE migration_status IN ('pending', 'in_progress')
);

-- Create pkarr_records table for PKARR relay publish status
CREATE TABLE IF NOT EXISTS pkarr_records (
  id UUID PRIMARY KEY,
  pubky_domain_id UUID NOT NULL REFERENCES pubky_domains(id) ON DELETE CASCADE,
  record_type VARCHAR(10) NOT NULL,
  record_name VARCHAR(255) NOT NULL,
  record_value TEXT NOT NULL,
  ttl INTEGER NOT NULL DEFAULT 3600,
  last_published_at TIMESTAMP,
  publish_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_pkarr_record UNIQUE (pubky_domain_id, record_type, record_name)
);

-- Create sovereignty_scores table for tracking domain independence levels
CREATE TABLE IF NOT EXISTS sovereignty_scores (
  id UUID PRIMARY KEY,
  domain_record_id UUID NOT NULL REFERENCES domain_records(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  score_breakdown JSONB NOT NULL,
  calculated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_domain_score UNIQUE (domain_record_id)
);

-- Add indexes for efficient lookups
CREATE INDEX idx_pubky_domains_public_key ON pubky_domains(public_key);
CREATE INDEX idx_pubky_domains_registration_status ON pubky_domains(registration_status);
CREATE INDEX idx_domain_migrations_status ON domain_migrations(migration_status);
CREATE INDEX idx_pkarr_records_publish_status ON pkarr_records(publish_status);
CREATE INDEX idx_sovereignty_scores_score ON sovereignty_scores(score);

-- Ensure only one default keypair per family
CREATE UNIQUE INDEX idx_pubky_keypairs_default_per_family ON pubky_keypairs(family_id) WHERE is_default = TRUE;

-- Add comments for documentation
COMMENT ON TABLE pubky_domains IS 'Stores Pubky domain registrations and their associated keys';
COMMENT ON TABLE pubky_keypairs IS 'Stores family keypairs for Pubky domain management';
COMMENT ON TABLE domain_migrations IS 'Tracks migrations between domain providers (e.g., traditional DNS to Pubky)';
COMMENT ON TABLE pkarr_records IS 'Tracks PKARR records published to relays';
COMMENT ON TABLE sovereignty_scores IS 'Stores domain sovereignty scores and their calculation breakdown';