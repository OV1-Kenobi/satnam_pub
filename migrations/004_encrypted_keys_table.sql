-- migrations/004_encrypted_keys_table.sql
-- Table for storing encrypted nsec keys for newly created accounts

CREATE TABLE IF NOT EXISTS encrypted_keys (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    encrypted_nsec TEXT NOT NULL,
    salt VARCHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure one encrypted key per user
    UNIQUE(user_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_encrypted_keys_user_id ON encrypted_keys(user_id);

-- RLS (Row Level Security) policies
ALTER TABLE encrypted_keys ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own encrypted keys
CREATE POLICY "Users can access own encrypted keys" ON encrypted_keys
    FOR ALL USING (auth.uid()::UUID = user_id)
    WITH CHECK (auth.uid()::UUID = user_id);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_encrypted_keys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_encrypted_keys_updated_at_trigger ON encrypted_keys;
CREATE TRIGGER update_encrypted_keys_updated_at_trigger
    BEFORE UPDATE ON encrypted_keys
    FOR EACH ROW
    EXECUTE FUNCTION update_encrypted_keys_updated_at();