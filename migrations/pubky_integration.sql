-- Pubky Integration Migration
-- This migration adds tables for Pubky homeserver integration and encrypted family messages

-- Table for storing Pubky homeserver information
CREATE TABLE IF NOT EXISTS pubky_homeservers (
  id UUID PRIMARY KEY,
  family_id UUID REFERENCES families(id),
  homeserver_url TEXT NOT NULL,
  public_key TEXT NOT NULL,
  encrypted_private_key TEXT NOT NULL
);

-- Table for storing encrypted family messages
CREATE TABLE IF NOT EXISTS encrypted_family_messages (
  id UUID PRIMARY KEY,
  sender_npub TEXT NOT NULL,
  recipient_npub TEXT NOT NULL,
  encrypted_content TEXT NOT NULL,
  pubky_signature TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_pubky_homeservers_family_id ON pubky_homeservers(family_id);
CREATE INDEX IF NOT EXISTS idx_encrypted_family_messages_sender ON encrypted_family_messages(sender_npub);
CREATE INDEX IF NOT EXISTS idx_encrypted_family_messages_recipient ON encrypted_family_messages(recipient_npub);
CREATE INDEX IF NOT EXISTS idx_encrypted_family_messages_created_at ON encrypted_family_messages(created_at);

-- Extend existing identity tables to support decentralized domains
ALTER TABLE users ADD COLUMN IF NOT EXISTS domain_type VARCHAR(20) DEFAULT 'traditional';
ALTER TABLE users ADD COLUMN IF NOT EXISTS pubky_domain VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS domain_keypair JSONB; -- For domain signing

-- New table for domain management
CREATE TABLE IF NOT EXISTS domain_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID REFERENCES families(id),
  domain_name VARCHAR(255) NOT NULL,
  domain_type VARCHAR(20) NOT NULL, -- 'traditional', 'pubky', 'handshake'
  pubky_public_key TEXT,
  dns_records JSONB, -- Flexible DNS record storage
  signed_zone_data TEXT, -- Cryptographically signed zone
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Domain verification for both systems
CREATE TABLE IF NOT EXISTS domain_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_record_id UUID REFERENCES domain_records(id),
  verification_type VARCHAR(50), -- 'txt_record', 'pubky_signature'
  verification_data TEXT,
  verified_at TIMESTAMP,
  expires_at TIMESTAMP
);

-- Add indexes for domain tables
CREATE INDEX IF NOT EXISTS idx_domain_records_family_id ON domain_records(family_id);
CREATE INDEX IF NOT EXISTS idx_domain_records_domain_name ON domain_records(domain_name);
CREATE INDEX IF NOT EXISTS idx_domain_verifications_domain_record_id ON domain_verifications(domain_record_id);