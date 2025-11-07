-- Migration: 045_tapsigner_action_contexts.sql
-- Purpose: Create action context table for multi-purpose device routing (5-minute TTL)
-- Date: November 6, 2025
-- Status: Ready for execution in Supabase SQL Editor

-- Create table for action context (multi-purpose device routing)
CREATE TABLE IF NOT EXISTS public.tapsigner_action_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_hash TEXT NOT NULL,
  card_id_hash TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('payment', 'event', 'login')),
  context_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  
  CONSTRAINT fk_action_owner FOREIGN KEY (owner_hash)
    REFERENCES privacy_users(hashed_uuid) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tapsigner_action_owner 
  ON tapsigner_action_contexts(owner_hash);
CREATE INDEX IF NOT EXISTS idx_tapsigner_action_type 
  ON tapsigner_action_contexts(action_type);
CREATE INDEX IF NOT EXISTS idx_tapsigner_action_expires 
  ON tapsigner_action_contexts(expires_at);

-- Enable Row Level Security
ALTER TABLE tapsigner_action_contexts ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own action contexts
CREATE POLICY select_own_action_contexts ON tapsigner_action_contexts
  FOR SELECT USING (owner_hash = current_setting('app.current_user_hash'));

-- RLS Policy: Users can only insert their own action contexts
CREATE POLICY insert_own_action_contexts ON tapsigner_action_contexts
  FOR INSERT WITH CHECK (owner_hash = current_setting('app.current_user_hash'));

-- RLS Policy: Users can only delete their own action contexts
CREATE POLICY delete_own_action_contexts ON tapsigner_action_contexts
  FOR DELETE USING (owner_hash = current_setting('app.current_user_hash'));

-- Grant permissions
GRANT SELECT, INSERT, DELETE ON tapsigner_action_contexts TO authenticated;
GRANT SELECT, INSERT, DELETE ON tapsigner_action_contexts TO service_role;

