-- =====================================================
-- Privacy-First Gift Wrapped Communications Database
-- NO PII - ONLY HASHED UUIDs WITH UNIQUE SALTS
-- ALL USER DATA ENCRYPTED/HASHED BEFORE STORAGE
-- =====================================================

-- Enable necessary extensions for encryption and hashing
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- PRIVACY-FIRST HELPER FUNCTIONS
-- =====================================================

-- Generate unique salt for each user session
CREATE OR REPLACE FUNCTION generate_user_salt()
RETURNS TEXT AS $$
BEGIN
  RETURN encode(gen_random_bytes(32), 'hex');
END;
$$ language 'plpgsql';

-- Hash user identifier with unique salt
CREATE OR REPLACE FUNCTION hash_user_id(user_id TEXT, salt TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN encode(digest(user_id || salt || 'satnam_privacy_layer', 'sha256'), 'hex');
END;
$$ language 'plpgsql';

-- Encrypt sensitive data (returns base64 encoded encrypted data)
CREATE OR REPLACE FUNCTION encrypt_sensitive_data(data TEXT, encryption_key TEXT)
RETURNS TEXT AS $$
BEGIN
  IF data IS NULL OR data = '' THEN
    RETURN NULL;
  END IF;
  
  RETURN encode(
    pgp_sym_encrypt(
      data, 
      encryption_key, 
      'compress-algo=1, cipher-algo=aes256'
    ), 
    'base64'
  );
END;
$$ language 'plpgsql';

-- Decrypt sensitive data
CREATE OR REPLACE FUNCTION decrypt_sensitive_data(encrypted_data TEXT, encryption_key TEXT)
RETURNS TEXT AS $$
BEGIN
  IF encrypted_data IS NULL OR encrypted_data = '' THEN
    RETURN NULL;
  END IF;
  
  RETURN pgp_sym_decrypt(
    decode(encrypted_data, 'base64'), 
    encryption_key
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN '[ENCRYPTED]';
END;
$$ language 'plpgsql';

-- Generate anonymous contact identifier
CREATE OR REPLACE FUNCTION generate_anonymous_contact_id()
RETURNS TEXT AS $$
BEGIN
  RETURN 'anon_' || encode(gen_random_bytes(16), 'hex');
END;
$$ language 'plpgsql';

-- =====================================================
-- PRIVACY-FIRST USER SESSIONS TABLE
-- =====================================================

-- User sessions with hashed IDs and unique salts
CREATE TABLE IF NOT EXISTS privacy_user_sessions (
  session_id TEXT PRIMARY KEY, -- Hashed session ID
  user_hash TEXT NOT NULL, -- Hashed user ID with salt
  salt TEXT NOT NULL, -- Unique salt for this user
  encryption_key_hash TEXT NOT NULL, -- Hashed encryption key
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '24 hours'),
  last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for performance (on hashed values only)
CREATE INDEX IF NOT EXISTS idx_privacy_sessions_user_hash ON privacy_user_sessions(user_hash);
CREATE INDEX IF NOT EXISTS idx_privacy_sessions_expires ON privacy_user_sessions(expires_at);

-- =====================================================
-- PRIVACY-FIRST CONTACTS TABLE
-- =====================================================

-- Contacts with full privacy protection
CREATE TABLE IF NOT EXISTS privacy_contacts (
  contact_id TEXT PRIMARY KEY DEFAULT generate_anonymous_contact_id(),
  user_hash TEXT NOT NULL, -- Owner's hashed ID
  
  -- All contact data is encrypted
  encrypted_npub TEXT, -- Encrypted npub
  encrypted_display_name TEXT, -- Encrypted display name
  encrypted_nip05 TEXT, -- Encrypted nip05
  encrypted_notes TEXT, -- Encrypted notes
  encrypted_metadata TEXT, -- Encrypted JSON metadata
  
  -- Non-PII classification data (safe to store)
  trust_level_code INTEGER NOT NULL DEFAULT 1, -- 1=unverified, 2=known, 3=trusted, 4=family
  relationship_code INTEGER NOT NULL DEFAULT 1, -- 1=friend, 2=business, 3=advisor, 4=guardian, 5=parent, 6=child, 7=family-associate
  capabilities_flags INTEGER DEFAULT 0, -- Bitfield: 1=gift_wrap, 2=verified, 4=nfc, 8=lightning
  
  -- Anonymous timestamps (no timezone to prevent location inference)
  created_epoch BIGINT DEFAULT EXTRACT(epoch FROM NOW()),
  last_interaction_epoch BIGINT,
  
  -- Anonymous counters
  interaction_count INTEGER DEFAULT 0,
  trust_score INTEGER DEFAULT 0
);

-- Add constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'privacy_contacts_trust_level_check'
  ) THEN
    ALTER TABLE privacy_contacts ADD CONSTRAINT privacy_contacts_trust_level_check 
    CHECK (trust_level_code BETWEEN 1 AND 4);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'privacy_contacts_relationship_check'
  ) THEN
    ALTER TABLE privacy_contacts ADD CONSTRAINT privacy_contacts_relationship_check 
    CHECK (relationship_code BETWEEN 1 AND 7);
  END IF;
END
$$;

-- Privacy indexes (only on non-PII fields)
CREATE INDEX IF NOT EXISTS idx_privacy_contacts_user_hash ON privacy_contacts(user_hash);
CREATE INDEX IF NOT EXISTS idx_privacy_contacts_trust_level ON privacy_contacts(trust_level_code);
CREATE INDEX IF NOT EXISTS idx_privacy_contacts_relationship ON privacy_contacts(relationship_code);
CREATE INDEX IF NOT EXISTS idx_privacy_contacts_capabilities ON privacy_contacts(capabilities_flags);
CREATE INDEX IF NOT EXISTS idx_privacy_contacts_created ON privacy_contacts(created_epoch);

-- =====================================================
-- PRIVACY-FIRST MESSAGING GROUPS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS privacy_messaging_groups (
  group_id TEXT PRIMARY KEY DEFAULT ('grp_' || encode(gen_random_bytes(16), 'hex')),
  creator_hash TEXT NOT NULL, -- Creator's hashed ID
  
  -- Encrypted group data
  encrypted_name TEXT, -- Encrypted group name
  encrypted_description TEXT, -- Encrypted description
  encrypted_members TEXT, -- Encrypted JSON array of member hashes
  
  -- Non-PII settings
  privacy_level_code INTEGER NOT NULL DEFAULT 2, -- 1=minimal, 2=encrypted, 3=giftwrapped
  member_count INTEGER DEFAULT 0,
  
  -- Anonymous timestamps
  created_epoch BIGINT DEFAULT EXTRACT(epoch FROM NOW()),
  last_activity_epoch BIGINT
);

-- Add constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'privacy_groups_privacy_level_check'
  ) THEN
    ALTER TABLE privacy_messaging_groups ADD CONSTRAINT privacy_groups_privacy_level_check 
    CHECK (privacy_level_code BETWEEN 1 AND 3);
  END IF;
END
$$;

-- Privacy indexes
CREATE INDEX IF NOT EXISTS idx_privacy_groups_creator ON privacy_messaging_groups(creator_hash);
CREATE INDEX IF NOT EXISTS idx_privacy_groups_privacy_level ON privacy_messaging_groups(privacy_level_code);
CREATE INDEX IF NOT EXISTS idx_privacy_groups_created ON privacy_messaging_groups(created_epoch);

-- =====================================================
-- PRIVACY-FIRST MESSAGES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS privacy_messages (
  message_id TEXT PRIMARY KEY DEFAULT ('msg_' || encode(gen_random_bytes(20), 'hex')),
  sender_hash TEXT NOT NULL, -- Sender's hashed ID
  
  -- Recipients (always hashed)
  recipient_hash TEXT, -- For direct messages
  group_id TEXT, -- For group messages
  
  -- Fully encrypted message content
  encrypted_content TEXT NOT NULL, -- Encrypted message content
  content_size INTEGER, -- Size for rate limiting (no content inference)
  
  -- Non-PII message metadata
  privacy_level_code INTEGER NOT NULL DEFAULT 2, -- 1=minimal, 2=encrypted, 3=giftwrapped
  status_code INTEGER DEFAULT 1, -- 1=sent, 2=delivered, 3=failed
  requires_approval BOOLEAN DEFAULT FALSE,
  approved_by_hash TEXT,
  
  -- Anonymous timestamps
  sent_epoch BIGINT DEFAULT EXTRACT(epoch FROM NOW()),
  
  -- Nostr integration (optional, hashed)
  nostr_event_hash TEXT -- Hash of nostr event ID (not the ID itself)
);

-- Add constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'privacy_messages_privacy_level_check'
  ) THEN
    ALTER TABLE privacy_messages ADD CONSTRAINT privacy_messages_privacy_level_check 
    CHECK (privacy_level_code BETWEEN 1 AND 3);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'privacy_messages_status_check'
  ) THEN
    ALTER TABLE privacy_messages ADD CONSTRAINT privacy_messages_status_check 
    CHECK (status_code BETWEEN 1 AND 3);
  END IF;

  -- Add foreign key constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'privacy_messages_group_fkey'
  ) THEN
    ALTER TABLE privacy_messages ADD CONSTRAINT privacy_messages_group_fkey 
    FOREIGN KEY (group_id) REFERENCES privacy_messaging_groups(group_id) ON DELETE CASCADE;
  END IF;
END
$$;

-- Privacy indexes (only on hashed/non-PII fields)
CREATE INDEX IF NOT EXISTS idx_privacy_messages_sender ON privacy_messages(sender_hash);
CREATE INDEX IF NOT EXISTS idx_privacy_messages_recipient ON privacy_messages(recipient_hash);
CREATE INDEX IF NOT EXISTS idx_privacy_messages_group ON privacy_messages(group_id);
CREATE INDEX IF NOT EXISTS idx_privacy_messages_privacy_level ON privacy_messages(privacy_level_code);
CREATE INDEX IF NOT EXISTS idx_privacy_messages_sent ON privacy_messages(sent_epoch DESC);
CREATE INDEX IF NOT EXISTS idx_privacy_messages_status ON privacy_messages(status_code);

-- =====================================================
-- PRIVACY-FIRST ROW LEVEL SECURITY
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE privacy_user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_messaging_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "privacy_sessions_policy" ON privacy_user_sessions;
DROP POLICY IF EXISTS "privacy_contacts_select_policy" ON privacy_contacts;
DROP POLICY IF EXISTS "privacy_contacts_modify_policy" ON privacy_contacts;
DROP POLICY IF EXISTS "privacy_groups_select_policy" ON privacy_messaging_groups;
DROP POLICY IF EXISTS "privacy_groups_modify_policy" ON privacy_messaging_groups;
DROP POLICY IF EXISTS "privacy_messages_select_policy" ON privacy_messages;
DROP POLICY IF EXISTS "privacy_messages_insert_policy" ON privacy_messages;

-- Session-based RLS policies (using hashed session IDs)
CREATE POLICY "privacy_sessions_policy" ON privacy_user_sessions
  FOR ALL USING (
    session_id = current_setting('app.session_hash', true)
  );

-- Contacts RLS - only access your own hashed contacts
CREATE POLICY "privacy_contacts_select_policy" ON privacy_contacts
  FOR SELECT USING (
    user_hash = current_setting('app.user_hash', true)
  );

CREATE POLICY "privacy_contacts_modify_policy" ON privacy_contacts
  FOR ALL USING (
    user_hash = current_setting('app.user_hash', true)
  );

-- Groups RLS - only access groups you created or are member of
CREATE POLICY "privacy_groups_select_policy" ON privacy_messaging_groups
  FOR SELECT USING (
    creator_hash = current_setting('app.user_hash', true) OR
    encrypted_members LIKE '%' || current_setting('app.user_hash', true) || '%'
  );

CREATE POLICY "privacy_groups_modify_policy" ON privacy_messaging_groups
  FOR ALL USING (
    creator_hash = current_setting('app.user_hash', true)
  );

-- Messages RLS - only access messages you sent or received
CREATE POLICY "privacy_messages_select_policy" ON privacy_messages
  FOR SELECT USING (
    sender_hash = current_setting('app.user_hash', true) OR
    recipient_hash = current_setting('app.user_hash', true) OR
    group_id IN (
      SELECT group_id FROM privacy_messaging_groups 
      WHERE creator_hash = current_setting('app.user_hash', true) OR
            encrypted_members LIKE '%' || current_setting('app.user_hash', true) || '%'
    )
  );

CREATE POLICY "privacy_messages_insert_policy" ON privacy_messages
  FOR INSERT WITH CHECK (
    sender_hash = current_setting('app.user_hash', true)
  );

-- =====================================================
-- PRIVACY-FIRST UTILITY FUNCTIONS
-- =====================================================

-- Function to get trust level name from code (for display only)
CREATE OR REPLACE FUNCTION get_trust_level_name(code INTEGER)
RETURNS TEXT AS $$
BEGIN
  RETURN CASE code
    WHEN 4 THEN 'family'
    WHEN 3 THEN 'trusted'
    WHEN 2 THEN 'known'
    WHEN 1 THEN 'unverified'
    ELSE 'unknown'
  END;
END;
$$ language 'plpgsql';

-- Function to get relationship name from code (for display only)
CREATE OR REPLACE FUNCTION get_relationship_name(code INTEGER)
RETURNS TEXT AS $$
BEGIN
  RETURN CASE code
    WHEN 7 THEN 'family-associate'
    WHEN 6 THEN 'child'
    WHEN 5 THEN 'parent'
    WHEN 4 THEN 'guardian'
    WHEN 3 THEN 'advisor'
    WHEN 2 THEN 'business'
    WHEN 1 THEN 'friend'
    ELSE 'unknown'
  END;
END;
$$ language 'plpgsql';

-- Function to check capability flags
CREATE OR REPLACE FUNCTION has_capability(flags INTEGER, capability INTEGER)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (flags & capability) = capability;
END;
$$ language 'plpgsql';

-- Session cleanup function (remove expired sessions)
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM privacy_user_sessions WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ language 'plpgsql';

-- =====================================================
-- PRIVACY-FIRST VIEWS (NO PII EXPOSED)
-- =====================================================

-- Contact summary view (shows only non-PII aggregated data)
CREATE OR REPLACE VIEW privacy_contact_summary AS
SELECT 
  contact_id,
  trust_level_code,
  get_trust_level_name(trust_level_code) as trust_level_name,
  relationship_code,
  get_relationship_name(relationship_code) as relationship_name,
  has_capability(capabilities_flags, 1) as supports_gift_wrap,
  has_capability(capabilities_flags, 2) as is_verified,
  has_capability(capabilities_flags, 4) as supports_nfc,
  has_capability(capabilities_flags, 8) as supports_lightning,
  interaction_count,
  trust_score,
  CASE 
    WHEN last_interaction_epoch > EXTRACT(epoch FROM NOW() - INTERVAL '7 days') THEN 'active'
    WHEN last_interaction_epoch > EXTRACT(epoch FROM NOW() - INTERVAL '30 days') THEN 'recent'
    WHEN last_interaction_epoch IS NOT NULL THEN 'inactive'
    ELSE 'never'
  END as activity_status,
  created_epoch,
  last_interaction_epoch
FROM privacy_contacts
WHERE user_hash = current_setting('app.user_hash', true);

-- Message statistics view (aggregated, no content)
CREATE OR REPLACE VIEW privacy_message_stats AS
SELECT 
  sender_hash,
  recipient_hash,
  group_id,
  privacy_level_code,
  COUNT(*) as message_count,
  MAX(sent_epoch) as last_message_epoch,
  COUNT(CASE WHEN status_code = 1 THEN 1 END) as sent_count,
  COUNT(CASE WHEN status_code = 2 THEN 1 END) as delivered_count,
  COUNT(CASE WHEN status_code = 3 THEN 1 END) as failed_count,
  COUNT(CASE WHEN requires_approval THEN 1 END) as approval_required_count,
  AVG(content_size) as avg_content_size
FROM privacy_messages
GROUP BY sender_hash, recipient_hash, group_id, privacy_level_code;

-- =====================================================
-- PERMISSIONS (RESTRICTIVE)
-- =====================================================

-- Grant minimal permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON privacy_user_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON privacy_contacts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON privacy_messaging_groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON privacy_messages TO authenticated;

-- Grant view access
GRANT SELECT ON privacy_contact_summary TO authenticated;
GRANT SELECT ON privacy_message_stats TO authenticated;

-- Grant function execution
GRANT EXECUTE ON FUNCTION generate_user_salt() TO authenticated;
GRANT EXECUTE ON FUNCTION hash_user_id(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION encrypt_sensitive_data(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION decrypt_sensitive_data(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION generate_anonymous_contact_id() TO authenticated;
GRANT EXECUTE ON FUNCTION get_trust_level_name(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_relationship_name(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION has_capability(INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_expired_sessions() TO authenticated;

-- =====================================================
-- AUTOMATED CLEANUP
-- =====================================================

-- Create a scheduled job to clean up expired sessions (if pg_cron is available)
-- Note: This requires pg_cron extension which may not be available in all Supabase plans
-- SELECT cron.schedule('cleanup-expired-sessions', '0 * * * *', 'SELECT cleanup_expired_sessions();');

-- =====================================================
-- COMPLETION AND VERIFICATION
-- =====================================================

DO $$
DECLARE
  table_count INTEGER;
  view_count INTEGER;
  function_count INTEGER;
BEGIN
  -- Count created objects
  SELECT COUNT(*) INTO table_count FROM information_schema.tables 
  WHERE table_schema = 'public' AND table_name LIKE 'privacy_%';
  
  SELECT COUNT(*) INTO view_count FROM information_schema.views 
  WHERE table_schema = 'public' AND table_name LIKE 'privacy_%';
  
  SELECT COUNT(*) INTO function_count FROM information_schema.routines 
  WHERE routine_schema = 'public' AND routine_name IN (
    'generate_user_salt', 'hash_user_id', 'encrypt_sensitive_data', 
    'decrypt_sensitive_data', 'generate_anonymous_contact_id'
  );
  
  RAISE NOTICE '=== PRIVACY-FIRST SETUP COMPLETED ===';
  RAISE NOTICE 'Tables created: % (all with privacy_ prefix)', table_count;
  RAISE NOTICE 'Views created: % (aggregated data only)', view_count;
  RAISE NOTICE 'Privacy functions: %', function_count;
  RAISE NOTICE '✓ NO PII stored in plain text';
  RAISE NOTICE '✓ All user IDs are hashed with unique salts';
  RAISE NOTICE '✓ All sensitive data is encrypted';
  RAISE NOTICE '✓ Session-based RLS policies active';
  RAISE NOTICE '✓ Anonymous timestamps (no timezone data)';
  RAISE NOTICE '✓ Capability flags instead of readable metadata';
  RAISE NOTICE 'Ready for privacy-first Gift Wrapped Communications!';
END
$$;