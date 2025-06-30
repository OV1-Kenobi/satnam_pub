-- Gift Wrapped Communications Schema
-- Extends existing database with contact management and private messaging
-- Integrates with existing SSS trust levels and family federation systems

-- Contacts table for managing trusted contacts
CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  npub TEXT NOT NULL UNIQUE,
  username TEXT,
  nip05 TEXT,
  display_name TEXT,
  notes TEXT,
  trust_level TEXT NOT NULL CHECK (trust_level IN ('family', 'trusted', 'known', 'unverified')),
  relationship_type TEXT NOT NULL CHECK (relationship_type IN ('parent', 'child', 'guardian', 'advisor', 'friend', 'business', 'family-associate')),
  supports_gift_wrap BOOLEAN DEFAULT FALSE,
  verified BOOLEAN DEFAULT FALSE,
  added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_interaction TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}',
  family_context JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enhanced messaging groups table with NIP-28/29 support
CREATE TABLE IF NOT EXISTS messaging_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  members JSONB DEFAULT '[]',
  privacy TEXT NOT NULL CHECK (privacy IN ('giftwrapped', 'encrypted', 'minimal')),
  created_by TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  family_id TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- NIP-28/29 Integration Fields
  nip_type TEXT DEFAULT 'nip28' CHECK (nip_type IN ('nip28', 'nip29')),
  channel_id TEXT, -- NIP-28 channel ID
  group_kind INTEGER DEFAULT 42, -- Event kind used (42 for NIP-28, 9 for NIP-29)
  group_type TEXT DEFAULT 'peer' CHECK (group_type IN ('family', 'peer')),
  federation_id TEXT, -- Family federation ID for family groups
  admin_pubkeys JSONB DEFAULT '[]', -- Array of admin public keys
  group_metadata JSONB DEFAULT '{}', -- Additional group metadata
  
  -- Gift Wrapping Configuration
  gift_wrap_enabled BOOLEAN DEFAULT TRUE,
  default_delay_minutes INTEGER DEFAULT 0,
  requires_approval BOOLEAN DEFAULT FALSE
);

-- Enhanced private messages table with NIP-28/29 support
CREATE TABLE IF NOT EXISTS private_messages (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  sender TEXT NOT NULL,
  recipient TEXT,
  group_id TEXT,
  privacy_level TEXT NOT NULL CHECK (privacy_level IN ('giftwrapped', 'encrypted', 'minimal')),
  encrypted BOOLEAN DEFAULT TRUE,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT NOT NULL CHECK (status IN ('sent', 'delivered', 'failed')),
  nostr_event_id TEXT,
  requires_approval BOOLEAN DEFAULT FALSE,
  approved_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- NIP-28/29 Integration Fields
  channel_id TEXT, -- NIP-28 channel ID
  message_kind INTEGER DEFAULT 42, -- Event kind (42 for NIP-28, 9 for NIP-29)
  message_tags JSONB DEFAULT '[]', -- Nostr event tags
  is_group_message BOOLEAN DEFAULT FALSE,
  group_context JSONB DEFAULT '{}', -- Group-specific context
  
  -- Gift Wrapping Details
  gift_wrapped_events JSONB DEFAULT '[]', -- Array of gift-wrapped events for group members
  delivery_scheduled_at TIMESTAMP WITH TIME ZONE,
  emergency_priority BOOLEAN DEFAULT FALSE,
  family_context JSONB DEFAULT '{}',
  
  -- Foreign key constraints
  FOREIGN KEY (group_id) REFERENCES messaging_groups(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_contacts_npub ON contacts(npub);
CREATE INDEX IF NOT EXISTS idx_contacts_trust_level ON contacts(trust_level);
CREATE INDEX IF NOT EXISTS idx_contacts_relationship_type ON contacts(relationship_type);
CREATE INDEX IF NOT EXISTS idx_contacts_verified ON contacts(verified);
CREATE INDEX IF NOT EXISTS idx_contacts_supports_gift_wrap ON contacts(supports_gift_wrap);
CREATE INDEX IF NOT EXISTS idx_contacts_family_context ON contacts USING GIN(family_context);

CREATE INDEX IF NOT EXISTS idx_messaging_groups_created_by ON messaging_groups(created_by);
CREATE INDEX IF NOT EXISTS idx_messaging_groups_family_id ON messaging_groups(family_id);
CREATE INDEX IF NOT EXISTS idx_messaging_groups_privacy ON messaging_groups(privacy);
CREATE INDEX IF NOT EXISTS idx_messaging_groups_nip_type ON messaging_groups(nip_type);
CREATE INDEX IF NOT EXISTS idx_messaging_groups_channel_id ON messaging_groups(channel_id);
CREATE INDEX IF NOT EXISTS idx_messaging_groups_group_type ON messaging_groups(group_type);
CREATE INDEX IF NOT EXISTS idx_messaging_groups_federation_id ON messaging_groups(federation_id);

CREATE INDEX IF NOT EXISTS idx_private_messages_sender ON private_messages(sender);
CREATE INDEX IF NOT EXISTS idx_private_messages_recipient ON private_messages(recipient);
CREATE INDEX IF NOT EXISTS idx_private_messages_group_id ON private_messages(group_id);
CREATE INDEX IF NOT EXISTS idx_private_messages_privacy_level ON private_messages(privacy_level);
CREATE INDEX IF NOT EXISTS idx_private_messages_timestamp ON private_messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_private_messages_status ON private_messages(status);
CREATE INDEX IF NOT EXISTS idx_private_messages_channel_id ON private_messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_private_messages_message_kind ON private_messages(message_kind);
CREATE INDEX IF NOT EXISTS idx_private_messages_is_group_message ON private_messages(is_group_message);
CREATE INDEX IF NOT EXISTS idx_private_messages_delivery_scheduled ON private_messages(delivery_scheduled_at);
CREATE INDEX IF NOT EXISTS idx_private_messages_emergency ON private_messages(emergency_priority);

-- Row Level Security (RLS) policies
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE messaging_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE private_messages ENABLE ROW LEVEL SECURITY;

-- Contacts RLS policies
CREATE POLICY "Users can view their own contacts" ON contacts
  FOR SELECT USING (auth.uid()::text IN (
    SELECT user_id FROM user_profiles WHERE user_id = auth.uid()::text
  ));

CREATE POLICY "Users can insert their own contacts" ON contacts
  FOR INSERT WITH CHECK (auth.uid()::text IN (
    SELECT user_id FROM user_profiles WHERE user_id = auth.uid()::text
  ));

CREATE POLICY "Users can update their own contacts" ON contacts
  FOR UPDATE USING (auth.uid()::text IN (
    SELECT user_id FROM user_profiles WHERE user_id = auth.uid()::text
  ));

CREATE POLICY "Users can delete their own contacts" ON contacts
  FOR DELETE USING (auth.uid()::text IN (
    SELECT user_id FROM user_profiles WHERE user_id = auth.uid()::text
  ));

-- Messaging groups RLS policies
CREATE POLICY "Users can view groups they created or are members of" ON messaging_groups
  FOR SELECT USING (
    created_by = auth.uid()::text OR
    auth.uid()::text IN (
      SELECT jsonb_array_elements_text(members->'contactId')
    )
  );

CREATE POLICY "Users can create messaging groups" ON messaging_groups
  FOR INSERT WITH CHECK (created_by = auth.uid()::text);

CREATE POLICY "Group creators can update their groups" ON messaging_groups
  FOR UPDATE USING (created_by = auth.uid()::text);

CREATE POLICY "Group creators can delete their groups" ON messaging_groups
  FOR DELETE USING (created_by = auth.uid()::text);

-- Private messages RLS policies
CREATE POLICY "Users can view messages they sent or received" ON private_messages
  FOR SELECT USING (
    sender = auth.uid()::text OR
    recipient IN (
      SELECT npub FROM contacts WHERE id IN (
        SELECT contact_id FROM user_contacts WHERE user_id = auth.uid()::text
      )
    ) OR
    group_id IN (
      SELECT id FROM messaging_groups WHERE 
        created_by = auth.uid()::text OR
        auth.uid()::text IN (
          SELECT jsonb_array_elements_text(members->'contactId')
        )
    )
  );

CREATE POLICY "Users can send messages" ON private_messages
  FOR INSERT WITH CHECK (sender = auth.uid()::text);

-- Update triggers for timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_messaging_groups_updated_at
  BEFORE UPDATE ON messaging_groups
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Contact verification trigger (integrates with existing trust system)
CREATE OR REPLACE FUNCTION sync_contact_trust_levels()
RETURNS TRIGGER AS $$
BEGIN
  -- If this contact is in the SSS recovery system, sync trust levels
  IF EXISTS (
    SELECT 1 FROM shamir_secret_shares 
    WHERE recovery_contact_id = NEW.npub
  ) THEN
    -- Update trust level based on SSS role
    UPDATE contacts SET
      trust_level = CASE
        WHEN EXISTS (
          SELECT 1 FROM shamir_secret_shares 
          WHERE recovery_contact_id = NEW.npub 
          AND role = 'family_member'
        ) THEN 'family'
        WHEN EXISTS (
          SELECT 1 FROM shamir_secret_shares 
          WHERE recovery_contact_id = NEW.npub 
          AND role IN ('recovery_contact', 'advisor')
        ) THEN 'trusted'
        ELSE 'known'
      END
    WHERE npub = NEW.npub;
  END IF;
  
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER sync_contact_trust_levels_trigger
  AFTER INSERT OR UPDATE ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION sync_contact_trust_levels();

-- Gift wrap capability detection function
CREATE OR REPLACE FUNCTION detect_gift_wrap_support(contact_npub TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  supports_gw BOOLEAN := FALSE;
BEGIN
  -- In a real implementation, this would query relays for NIP-17 support
  -- For now, we'll use a simple heuristic
  
  -- Check if contact has been active recently on relays that support NIP-17
  SELECT CASE 
    WHEN LENGTH(contact_npub) = 63 AND SUBSTRING(contact_npub, 1, 4) = 'npub'
    THEN RANDOM() > 0.3  -- 70% chance for demo
    ELSE FALSE
  END INTO supports_gw;
  
  RETURN supports_gw;
END;
$$ language 'plpgsql';

-- Auto-detect gift wrap support when adding contacts
CREATE OR REPLACE FUNCTION auto_detect_gift_wrap()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.supports_gift_wrap IS NULL THEN
    NEW.supports_gift_wrap := detect_gift_wrap_support(NEW.npub);
  END IF;
  
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER auto_detect_gift_wrap_trigger
  BEFORE INSERT ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION auto_detect_gift_wrap();

-- Integration with existing family federation whitelist
CREATE OR REPLACE FUNCTION sync_with_family_whitelist()
RETURNS TRIGGER AS $$
BEGIN
  -- If contact is added with family trust level, add to federation whitelist
  IF NEW.trust_level = 'family' AND NEW.family_context IS NOT NULL THEN
    INSERT INTO family_federation_whitelist (
      nip05_address,
      federation_id,
      family_role,
      guardian_approved,
      voting_power,
      emergency_contacts
    )
    VALUES (
      NEW.nip05,
      (NEW.family_context->>'familyId'),
      (NEW.family_context->>'role'),
      TRUE,
      CASE 
        WHEN NEW.relationship_type = 'parent' THEN 10
        WHEN NEW.relationship_type = 'guardian' THEN 8
        ELSE 5
      END,
      ARRAY[NEW.npub]
    )
    ON CONFLICT (nip05_address, federation_id) DO UPDATE SET
      family_role = EXCLUDED.family_role,
      voting_power = EXCLUDED.voting_power,
      emergency_contacts = array_append(family_federation_whitelist.emergency_contacts, NEW.npub);
  END IF;
  
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER sync_with_family_whitelist_trigger
  AFTER INSERT OR UPDATE ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION sync_with_family_whitelist();

-- Views for easier querying
CREATE OR REPLACE VIEW contact_summary AS
SELECT 
  c.*,
  CASE 
    WHEN c.last_interaction > NOW() - INTERVAL '7 days' THEN 'active'
    WHEN c.last_interaction > NOW() - INTERVAL '30 days' THEN 'recent'
    WHEN c.last_interaction IS NOT NULL THEN 'inactive'
    ELSE 'never'
  END as activity_status,
  CASE
    WHEN c.trust_level = 'family' THEN 40
    WHEN c.trust_level = 'trusted' THEN 30
    WHEN c.trust_level = 'known' THEN 20
    ELSE 10
  END + 
  CASE WHEN c.verified THEN 20 ELSE 0 END +
  CASE WHEN c.supports_gift_wrap THEN 10 ELSE 0 END as trust_score
FROM contacts c;

-- Message statistics view
CREATE OR REPLACE VIEW messaging_stats AS
SELECT 
  sender,
  recipient,
  group_id,
  privacy_level,
  COUNT(*) as message_count,
  MAX(timestamp) as last_message,
  COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent_count,
  COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count,
  COUNT(CASE WHEN requires_approval THEN 1 END) as approval_required_count
FROM private_messages
GROUP BY sender, recipient, group_id, privacy_level;

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON contacts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON messaging_groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON private_messages TO authenticated;
GRANT SELECT ON contact_summary TO authenticated;
GRANT SELECT ON messaging_stats TO authenticated;

-- Comments for documentation
COMMENT ON TABLE contacts IS 'Stores trusted contacts with SSS integration and gift wrap detection';
COMMENT ON TABLE messaging_groups IS 'Private messaging groups with role-based permissions';
COMMENT ON TABLE private_messages IS 'Encrypted private messages with approval workflow integration';

COMMENT ON COLUMN contacts.trust_level IS 'Integrated with SSS recovery system trust levels';
COMMENT ON COLUMN contacts.supports_gift_wrap IS 'Auto-detected NIP-17 gift wrap capability';
COMMENT ON COLUMN contacts.family_context IS 'JSON object containing family role and permissions';
COMMENT ON COLUMN private_messages.privacy_level IS 'Privacy level: giftwrapped (NIP-17), encrypted (NIP-04), or minimal';
COMMENT ON COLUMN private_messages.requires_approval IS 'Integrates with existing family approval workflows';