-- Part 2: Add triggers and Row Level Security policies
-- Migration: 002_add_triggers_and_policies.sql
-- Run this AFTER the tables have been created successfully

-- Enable Row Level Security on all tables
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

-- Create trigger for profiles updated_at (safe - no DROP needed for initial setup)
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies for secure access control
-- Users can view and manage their own profile
CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);

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