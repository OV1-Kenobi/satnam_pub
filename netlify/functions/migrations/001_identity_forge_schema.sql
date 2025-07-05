-- Supabase schema for identity forge
-- Enable Row Level Security for privacy
-- Migration: 001_identity_forge_schema.sql

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Family Management (created first as it's referenced by profiles)
CREATE TABLE IF NOT EXISTS families (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_name VARCHAR(100) NOT NULL,
    domain VARCHAR(255),
    relay_url VARCHAR(255),
    federation_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Users and Identity Management
-- Note: auth.users table is managed by Supabase Auth
-- We create profiles that reference it
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY, -- This will be the user ID from auth.users
    username VARCHAR(50) UNIQUE NOT NULL,
    npub VARCHAR(63) NOT NULL,
    nip05 VARCHAR(255),
    lightning_address VARCHAR(255),
    family_id UUID REFERENCES families(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Encrypted Backup References (points to Citadel Relay)
CREATE TABLE IF NOT EXISTS nostr_backups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id),
    event_id VARCHAR(64) NOT NULL,
    relay_url VARCHAR(255) DEFAULT 'wss://relay.citadel.academy',
    backup_hash VARCHAR(64),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Lightning/Payment Tracking
CREATE TABLE IF NOT EXISTS lightning_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id),
    address VARCHAR(255) UNIQUE NOT NULL,
    btcpay_store_id VARCHAR(255),
    voltage_node_id VARCHAR(255),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_npub ON profiles(npub);
CREATE INDEX IF NOT EXISTS idx_profiles_family_id ON profiles(family_id);
CREATE INDEX IF NOT EXISTS idx_families_family_name ON families(family_name);
CREATE INDEX IF NOT EXISTS idx_nostr_backups_user_id ON nostr_backups(user_id);
CREATE INDEX IF NOT EXISTS idx_lightning_addresses_user_id ON lightning_addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_lightning_addresses_address ON lightning_addresses(address);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE families ENABLE ROW LEVEL SECURITY;
ALTER TABLE nostr_backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE lightning_addresses ENABLE ROW LEVEL SECURITY;

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for profiles updated_at
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Basic RLS policies (you can customize these based on your needs)
-- Allow users to read their own profile
CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);

-- Allow users to update their own profile
CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);

-- Allow users to insert their own profile
CREATE POLICY "Users can insert own profile" ON profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Family policies - members can view their family
CREATE POLICY "Family members can view family" ON families
    FOR SELECT USING (
        id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
    );

-- Lightning addresses - users can manage their own
CREATE POLICY "Users can manage own lightning addresses" ON lightning_addresses
    FOR ALL USING (user_id = auth.uid());

-- Nostr backups - users can manage their own
CREATE POLICY "Users can manage own nostr backups" ON nostr_backups
    FOR ALL USING (user_id = auth.uid());