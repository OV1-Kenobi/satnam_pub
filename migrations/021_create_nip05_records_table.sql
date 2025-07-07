-- Migration: Create NIP-05 Records Table
-- Creates the nip05_records table for storing NIP-05 verification data
-- Author: Zencoder
-- Date: 2025-01-XX

-- Create the nip05_records table
CREATE TABLE IF NOT EXISTS nip05_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(64) NOT NULL UNIQUE,
    pubkey VARCHAR(64) NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_nip05_records_name ON nip05_records(name);
CREATE INDEX IF NOT EXISTS idx_nip05_records_pubkey ON nip05_records(pubkey);
CREATE INDEX IF NOT EXISTS idx_nip05_records_user_id ON nip05_records(user_id);
CREATE INDEX IF NOT EXISTS idx_nip05_records_created_at ON nip05_records(created_at);

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_nip05_records_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER trigger_update_nip05_records_updated_at
    BEFORE UPDATE ON nip05_records
    FOR EACH ROW
    EXECUTE FUNCTION update_nip05_records_updated_at();

-- Add RLS (Row Level Security) policies
ALTER TABLE nip05_records ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own NIP-05 records
CREATE POLICY "Users can view own nip05 records" ON nip05_records
    FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can insert their own NIP-05 records
CREATE POLICY "Users can insert own nip05 records" ON nip05_records
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own NIP-05 records
CREATE POLICY "Users can update own nip05 records" ON nip05_records
    FOR UPDATE USING (auth.uid() = user_id);

-- Policy: Users can delete their own NIP-05 records
CREATE POLICY "Users can delete own nip05 records" ON nip05_records
    FOR DELETE USING (auth.uid() = user_id);

-- Policy: Public read access for NIP-05 verification (no auth required)
CREATE POLICY "Public can read nip05 records for verification" ON nip05_records
    FOR SELECT USING (true);

-- Insert some example records for testing (optional)
-- These can be removed in production
INSERT INTO nip05_records (name, pubkey, user_id) VALUES
    ('admin', 'npub1satnamadmin123456789abcdef', '00000000-0000-0000-0000-000000000000'),
    ('bitcoin_mentor', 'npub1mentorbitcoinexample123456789abcdef', '00000000-0000-0000-0000-000000000000'),
    ('lightning_mentor', 'npub1mentorligthningexample123456789abcdef', '00000000-0000-0000-0000-000000000000'),
    ('family_mentor', 'npub1mentorfamilyexample123456789abcdef', '00000000-0000-0000-0000-000000000000'),
    ('support', 'npub1satnamsupport123456789abcdef', '00000000-0000-0000-0000-000000000000'),
    ('info', 'npub1satnaminfo123456789abcdef', '00000000-0000-0000-0000-000000000000')
ON CONFLICT (name) DO NOTHING;

-- Create a view for easy querying of NIP-05 data
CREATE OR REPLACE VIEW nip05_verification_data AS
SELECT 
    name,
    pubkey,
    created_at,
    updated_at
FROM nip05_records
WHERE name IS NOT NULL AND pubkey IS NOT NULL;

-- Grant permissions
GRANT SELECT ON nip05_records TO anon;
GRANT SELECT ON nip05_records TO authenticated;
GRANT ALL ON nip05_records TO service_role;

GRANT SELECT ON nip05_verification_data TO anon;
GRANT SELECT ON nip05_verification_data TO authenticated; 