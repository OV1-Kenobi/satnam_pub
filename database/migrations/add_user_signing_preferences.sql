-- Add User Signing Preferences Table
-- This migration adds support for storing user message signing preferences
-- to enable seamless UX without unexpected browser extension prompts and session lifetime mode
-- (timed cleanup vs browser session lifecycle) for secure session management.

-- Create user_signing_preferences table
CREATE TABLE IF NOT EXISTS user_signing_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_duid TEXT NOT NULL REFERENCES user_identities(id) ON DELETE CASCADE,

  -- Signing method preferences (in priority order)
  preferred_method TEXT NOT NULL DEFAULT 'session' CHECK (preferred_method IN ('session', 'nip07', 'nfc')),
  fallback_method TEXT CHECK (fallback_method IN ('session', 'nip07', 'nfc')),
  
  -- User experience preferences
  auto_fallback BOOLEAN NOT NULL DEFAULT true, -- Allow automatic fallback to next method
  show_security_warnings BOOLEAN NOT NULL DEFAULT true, -- Show security level warnings
  remember_choice BOOLEAN NOT NULL DEFAULT true, -- Remember user's method choice
  
  -- Session-based signing preferences
  session_duration_minutes INTEGER NOT NULL DEFAULT 15 CHECK (session_duration_minutes BETWEEN 5 AND 60),
  max_operations_per_session INTEGER NOT NULL DEFAULT 50 CHECK (max_operations_per_session BETWEEN 10 AND 200),
  session_lifetime_mode TEXT NOT NULL DEFAULT 'timed' CHECK (session_lifetime_mode IN ('timed','browser_session')),
  
  -- NIP-07 preferences
  nip07_auto_approve BOOLEAN NOT NULL DEFAULT false, -- Auto-approve NIP-07 requests (advanced users)
  
  -- NFC Physical MFA preferences (future)
  nfc_pin_timeout_seconds INTEGER NOT NULL DEFAULT 30 CHECK (nfc_pin_timeout_seconds BETWEEN 10 AND 120),
  nfc_require_confirmation BOOLEAN NOT NULL DEFAULT true, -- Require physical confirmation for each operation
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_method TEXT, -- Track which method was last successfully used
  last_used_at TIMESTAMPTZ,
  
  -- Ensure one preference record per user
  UNIQUE(user_duid)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_signing_preferences_user_duid ON user_signing_preferences(user_duid);
CREATE INDEX IF NOT EXISTS idx_user_signing_preferences_preferred_method ON user_signing_preferences(preferred_method);
CREATE INDEX IF NOT EXISTS idx_user_signing_preferences_last_used ON user_signing_preferences(last_used_at DESC);

-- Enable RLS (Row Level Security)
ALTER TABLE user_signing_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user sovereignty
-- Users can only access their own signing preferences
CREATE POLICY "Users can view own signing preferences" ON user_signing_preferences
  FOR SELECT USING (
    auth.uid()::text = (
      SELECT ui.id::text
      FROM user_identities ui
      WHERE ui.id = user_signing_preferences.user_duid
    )
  );

CREATE POLICY "Users can insert own signing preferences" ON user_signing_preferences
  FOR INSERT WITH CHECK (
    auth.uid()::text = (
      SELECT ui.id::text
      FROM user_identities ui
      WHERE ui.id = user_signing_preferences.user_duid
    )
  );

CREATE POLICY "Users can update own signing preferences" ON user_signing_preferences
  FOR UPDATE USING (
    auth.uid()::text = (
      SELECT ui.id::text
      FROM user_identities ui
      WHERE ui.id = user_signing_preferences.user_duid
    )
  );

CREATE POLICY "Users can delete own signing preferences" ON user_signing_preferences
  FOR DELETE USING (
    auth.uid()::text = (
      SELECT ui.id::text
      FROM user_identities ui
      WHERE ui.id = user_signing_preferences.user_duid
    )
  );

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_signing_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER trigger_update_user_signing_preferences_updated_at
  BEFORE UPDATE ON user_signing_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_user_signing_preferences_updated_at();

-- Insert default preferences for existing users
INSERT INTO user_signing_preferences (user_duid, preferred_method, fallback_method)
SELECT 
  ui.id,
  'session' as preferred_method,
  'nip07' as fallback_method
FROM user_identities ui
WHERE NOT EXISTS (
  SELECT 1 FROM user_signing_preferences usp
  WHERE usp.user_duid = ui.id
)
ON CONFLICT (user_duid) DO NOTHING;

-- Add helpful comments
COMMENT ON TABLE user_signing_preferences IS 'Stores user preferences for message signing methods to provide seamless UX';
COMMENT ON COLUMN user_signing_preferences.preferred_method IS 'Primary signing method: session (convenient), nip07 (balanced), nfc (most secure)';
COMMENT ON COLUMN user_signing_preferences.auto_fallback IS 'Allow automatic fallback to secondary method if primary fails';
COMMENT ON COLUMN user_signing_preferences.session_duration_minutes IS 'How long NSEC sessions should remain active';
COMMENT ON COLUMN user_signing_preferences.session_lifetime_mode IS 'timed = auto-cleanup timer; browser_session = rely on browser lifecycle (no cleanup timer)';
COMMENT ON COLUMN user_signing_preferences.nfc_require_confirmation IS 'Require physical NFC device confirmation for each signing operation';
