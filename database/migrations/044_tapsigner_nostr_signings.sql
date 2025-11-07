-- Migration: 044_tapsigner_nostr_signings.sql
-- Purpose: Create audit trail table for Nostr event signings via Tapsigner
-- Date: November 6, 2025
-- Status: Ready for execution in Supabase SQL Editor

-- Create table for Nostr event signing audit trail
CREATE TABLE IF NOT EXISTS public.tapsigner_nostr_signings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_hash TEXT NOT NULL,
  card_id_hash TEXT NOT NULL,
  event_kind INTEGER NOT NULL,
  event_content_hash TEXT NOT NULL,
  event_id TEXT,
  signature_hex TEXT NOT NULL,
  signed_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT fk_nostr_owner FOREIGN KEY (owner_hash)
    REFERENCES privacy_users(hashed_uuid) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tapsigner_nostr_owner 
  ON tapsigner_nostr_signings(owner_hash);
CREATE INDEX IF NOT EXISTS idx_tapsigner_nostr_event_id 
  ON tapsigner_nostr_signings(event_id);
CREATE INDEX IF NOT EXISTS idx_tapsigner_nostr_signed_at 
  ON tapsigner_nostr_signings(signed_at DESC);

-- Enable Row Level Security
ALTER TABLE tapsigner_nostr_signings ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own signings
CREATE POLICY select_own_nostr_signings ON tapsigner_nostr_signings
  FOR SELECT USING (owner_hash = current_setting('app.current_user_hash'));

-- RLS Policy: Users can only insert their own signings
CREATE POLICY insert_own_nostr_signings ON tapsigner_nostr_signings
  FOR INSERT WITH CHECK (owner_hash = current_setting('app.current_user_hash'));

-- Grant permissions
GRANT SELECT, INSERT ON tapsigner_nostr_signings TO authenticated;
GRANT SELECT, INSERT ON tapsigner_nostr_signings TO service_role;

