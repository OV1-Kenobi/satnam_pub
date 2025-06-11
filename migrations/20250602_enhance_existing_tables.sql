-- Migration: Enhance Existing Tables for Pubky Support
-- Description: This migration adds Pubky-related columns to existing tables

-- Add pubky_url column to users table
ALTER TABLE users
ADD COLUMN pubky_url TEXT,
ADD COLUMN pubky_public_key TEXT,
ADD COLUMN pubky_private_key_encrypted TEXT;

-- Add index for efficient Pubky URL lookups in users table
CREATE INDEX idx_users_pubky_url ON users(pubky_url);
CREATE INDEX idx_users_pubky_public_key ON users(pubky_public_key);

-- Add pubky_url column to families table
ALTER TABLE families
ADD COLUMN pubky_url TEXT,
ADD COLUMN pubky_public_key TEXT,
ADD COLUMN pubky_homeserver_url TEXT DEFAULT 'https://homeserver.pubky.org',
ADD COLUMN pubky_relay_url TEXT DEFAULT 'https://relay.pkarr.org',
ADD COLUMN pubky_enabled BOOLEAN DEFAULT FALSE;

-- Add index for efficient Pubky URL lookups in families table
CREATE INDEX idx_families_pubky_url ON families(pubky_url);
CREATE INDEX idx_families_pubky_public_key ON families(pubky_public_key);

-- Add sovereignty_score column to domain_records table
ALTER TABLE domain_records
ADD COLUMN sovereignty_score INTEGER DEFAULT 0 CHECK (sovereignty_score >= 0 AND sovereignty_score <= 100),
ADD COLUMN pubky_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN pubky_homeserver_url TEXT,
ADD COLUMN pubky_relay_url TEXT;

-- Add index for efficient sovereignty score lookups
CREATE INDEX idx_domain_records_sovereignty_score ON domain_records(sovereignty_score);
CREATE INDEX idx_domain_records_pubky_enabled ON domain_records(pubky_enabled);

-- Add pubky_backup_status to federation_guardians table
ALTER TABLE federation_guardians
ADD COLUMN pubky_backup_status VARCHAR(20) DEFAULT 'none',
ADD COLUMN pubky_backup_url TEXT,
ADD COLUMN pubky_backup_last_updated TIMESTAMP;

-- Add index for efficient backup status lookups
CREATE INDEX idx_federation_guardians_pubky_backup_status ON federation_guardians(pubky_backup_status);

-- Add comments for documentation
COMMENT ON COLUMN users.pubky_url IS 'The Pubky URL associated with this user';
COMMENT ON COLUMN users.pubky_public_key IS 'The Pubky public key for this user';
COMMENT ON COLUMN users.pubky_private_key_encrypted IS 'The encrypted Pubky private key for this user';

COMMENT ON COLUMN families.pubky_url IS 'The Pubky URL associated with this family';
COMMENT ON COLUMN families.pubky_public_key IS 'The Pubky public key for this family';
COMMENT ON COLUMN families.pubky_homeserver_url IS 'The Pubky homeserver URL for this family';
COMMENT ON COLUMN families.pubky_relay_url IS 'The Pubky relay URL for this family';
COMMENT ON COLUMN families.pubky_enabled IS 'Whether Pubky is enabled for this family';

COMMENT ON COLUMN domain_records.sovereignty_score IS 'The sovereignty score for this domain (0-100)';
COMMENT ON COLUMN domain_records.pubky_enabled IS 'Whether Pubky is enabled for this domain';
COMMENT ON COLUMN domain_records.pubky_homeserver_url IS 'The Pubky homeserver URL for this domain';
COMMENT ON COLUMN domain_records.pubky_relay_url IS 'The Pubky relay URL for this domain';

COMMENT ON COLUMN federation_guardians.pubky_backup_status IS 'The status of Pubky backups for this guardian';
COMMENT ON COLUMN federation_guardians.pubky_backup_url IS 'The Pubky URL where backups are stored';
COMMENT ON COLUMN federation_guardians.pubky_backup_last_updated IS 'When the Pubky backup was last updated';