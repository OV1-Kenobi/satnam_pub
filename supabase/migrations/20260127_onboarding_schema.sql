-- ============================================================================
-- High-Volume Physical Peer Onboarding Schema
-- ============================================================================
-- 
-- This migration creates tables and policies for the physical peer onboarding
-- system, supporting coordinator-led onboarding of 1-100+ participants.
--
-- Features:
-- - Session management (single/batch modes)
-- - Participant tracking with step progression
-- - NFC card registration (NTAG424/Boltcard/Tapsigner)
-- - Lightning wallet integration
-- - Nostr account migration tracking
-- - Privacy-first architecture with RLS policies
--
-- SECURITY WARNINGS:
-- - Never store plaintext passwords, PINs, nsec, or Keet seeds
-- - All sensitive data must be encrypted or hashed
-- - RLS policies enforce user sovereignty (full CRUD for own data)
--
-- ============================================================================

-- Idempotent: Drop tables if they exist (for development/testing)
-- CAUTION: Remove these DROP statements in production migrations
DROP TABLE IF EXISTS nostr_migrations CASCADE;
DROP TABLE IF EXISTS lightning_links CASCADE;
DROP TABLE IF EXISTS nfc_cards CASCADE;
DROP TABLE IF EXISTS onboarded_identities CASCADE;
DROP TABLE IF EXISTS onboarding_sessions CASCADE;

-- ============================================================================
-- Table: onboarding_sessions
-- ============================================================================
-- Tracks coordinator-led onboarding sessions (single or batch mode)

CREATE TABLE onboarding_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coordinator_user_id TEXT NOT NULL REFERENCES user_identities(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('single', 'batch')),
  status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
  participant_count INTEGER DEFAULT 0,
  completed_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb
);

COMMENT ON TABLE onboarding_sessions IS 'Coordinator-led onboarding sessions for physical peer onboarding';
COMMENT ON COLUMN onboarding_sessions.mode IS 'single: one participant, batch: multiple participants';
COMMENT ON COLUMN onboarding_sessions.expires_at IS 'Session expiry time (configurable, default 2 hours)';

-- ============================================================================
-- Table: onboarded_identities
-- ============================================================================
-- Tracks individual participants through the onboarding process

CREATE TABLE onboarded_identities (
  participant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES onboarding_sessions(session_id) ON DELETE SET NULL,
  user_id TEXT REFERENCES user_identities(id) ON DELETE CASCADE,
  true_name TEXT NOT NULL,
  display_name TEXT,
  language TEXT DEFAULT 'en',
  npub TEXT NOT NULL,
  nip05 TEXT,
  migration_flag BOOLEAN DEFAULT FALSE,
  old_npub TEXT,
  federation_id TEXT REFERENCES family_federations(federation_duid) ON DELETE SET NULL,
  referral_id UUID,
  technical_comfort TEXT CHECK (technical_comfort IN ('low', 'medium', 'high')),
  current_step TEXT,
  completed_steps TEXT[] DEFAULT ARRAY[]::TEXT[],
  status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE onboarded_identities IS 'Participant records for physical peer onboarding';
COMMENT ON COLUMN onboarded_identities.migration_flag IS 'true if migrating from existing Nostr account';
COMMENT ON COLUMN onboarded_identities.old_npub IS 'Previous npub if migrating account';
COMMENT ON COLUMN onboarded_identities.current_step IS 'Current onboarding step (intake, identity, password, etc.)';
COMMENT ON COLUMN onboarded_identities.completed_steps IS 'Array of completed step names';

-- ============================================================================
-- Table: nfc_cards
-- ============================================================================
-- Tracks NFC cards programmed during onboarding (NTAG424/Boltcard/Tapsigner)

CREATE TABLE nfc_cards (
  card_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID REFERENCES onboarded_identities(participant_id) ON DELETE CASCADE,
  user_id TEXT REFERENCES user_identities(id) ON DELETE CASCADE,
  card_uid TEXT NOT NULL UNIQUE,
  card_type TEXT NOT NULL CHECK (card_type IN ('ntag424', 'boltcard', 'tapsigner')),
  lnbits_card_id TEXT,
  mfa_factor_id UUID,
  pin_hash TEXT,
  pin_salt TEXT,
  programmed_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  status TEXT CHECK (status IN ('pending', 'programmed', 'verified', 'failed')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE nfc_cards IS 'NFC cards programmed during onboarding';
COMMENT ON COLUMN nfc_cards.card_uid IS 'Unique card identifier (UID)';
COMMENT ON COLUMN nfc_cards.lnbits_card_id IS 'LNbits Boltcard ID (for Boltcard type)';
COMMENT ON COLUMN nfc_cards.pin_hash IS 'PBKDF2/SHA-512 hashed PIN (NEVER plaintext)';
COMMENT ON COLUMN nfc_cards.pin_salt IS 'Unique salt for PIN hashing';

-- ============================================================================
-- Table: lightning_links
-- ============================================================================
-- Tracks Lightning wallet associations for onboarded participants

CREATE TABLE lightning_links (
  link_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID REFERENCES onboarded_identities(participant_id) ON DELETE CASCADE,
  user_id TEXT REFERENCES user_identities(id) ON DELETE CASCADE,
  lightning_address TEXT,
  external_lightning_address TEXT,
  lnbits_wallet_id TEXT,
  lnbits_admin_key_encrypted TEXT,
  nwc_connection_string_encrypted TEXT,
  nwc_permissions TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE lightning_links IS 'Lightning wallet associations for onboarded participants';
COMMENT ON COLUMN lightning_links.lightning_address IS 'Provisioned Lightning Address (username@satnam.pub)';
COMMENT ON COLUMN lightning_links.external_lightning_address IS 'External Lightning Address for Scrub forwarding';
COMMENT ON COLUMN lightning_links.lnbits_admin_key_encrypted IS 'Encrypted LNbits admin key (AES-256-GCM)';
COMMENT ON COLUMN lightning_links.nwc_connection_string_encrypted IS 'Encrypted NWC connection URI';

-- ============================================================================
-- Table: nostr_migrations
-- ============================================================================
-- Tracks Nostr account migrations via OTP

CREATE TABLE nostr_migrations (
  migration_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID REFERENCES onboarded_identities(participant_id) ON DELETE CASCADE,
  old_npub TEXT NOT NULL,
  new_npub TEXT NOT NULL,
  migration_method TEXT DEFAULT 'otp',
  otp_session_id UUID,
  status TEXT CHECK (status IN ('pending', 'otp_sent', 'verified', 'completed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

COMMENT ON TABLE nostr_migrations IS 'Nostr account migration tracking (OTP-based)';
COMMENT ON COLUMN nostr_migrations.migration_method IS 'Migration method (otp or manual)';
COMMENT ON COLUMN nostr_migrations.otp_session_id IS 'Link to OTP session for verification';

-- ============================================================================
-- Row-Level Security (RLS) Policies
-- ============================================================================
-- Enforce user sovereignty: users have full CRUD access to their own data

-- onboarding_sessions: Coordinator owns their sessions
ALTER TABLE onboarding_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY onboarding_sessions_user_policy ON onboarding_sessions
  FOR ALL
  USING (coordinator_user_id = auth.uid()::TEXT);

-- onboarded_identities: Users own their participant records
ALTER TABLE onboarded_identities ENABLE ROW LEVEL SECURITY;

CREATE POLICY onboarded_identities_user_policy ON onboarded_identities
  FOR ALL
  USING (user_id = auth.uid()::TEXT);

-- nfc_cards: Users own their NFC cards
ALTER TABLE nfc_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY nfc_cards_user_policy ON nfc_cards
  FOR ALL
  USING (user_id = auth.uid()::TEXT);

-- lightning_links: Users own their Lightning associations
ALTER TABLE lightning_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY lightning_links_user_policy ON lightning_links
  FOR ALL
  USING (user_id = auth.uid()::TEXT);

-- nostr_migrations: Users own their migration records
ALTER TABLE nostr_migrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY nostr_migrations_user_policy ON nostr_migrations
  FOR ALL
  USING (
    participant_id IN (
      SELECT participant_id FROM onboarded_identities WHERE user_id = auth.uid()::TEXT
    )
  );

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

CREATE INDEX idx_onboarding_sessions_coordinator
  ON onboarding_sessions(coordinator_user_id);

CREATE INDEX idx_onboarding_sessions_status
  ON onboarding_sessions(status)
  WHERE status IN ('active', 'paused');

CREATE INDEX idx_onboarded_identities_user
  ON onboarded_identities(user_id);

CREATE INDEX idx_onboarded_identities_session
  ON onboarded_identities(session_id);

CREATE INDEX idx_onboarded_identities_status
  ON onboarded_identities(status)
  WHERE status IN ('pending', 'in_progress');

CREATE INDEX idx_nfc_cards_user
  ON nfc_cards(user_id);

CREATE INDEX idx_nfc_cards_uid
  ON nfc_cards(card_uid);

CREATE INDEX idx_nfc_cards_participant
  ON nfc_cards(participant_id);

CREATE INDEX idx_lightning_links_user
  ON lightning_links(user_id);

CREATE INDEX idx_lightning_links_participant
  ON lightning_links(participant_id);

CREATE INDEX idx_nostr_migrations_participant
  ON nostr_migrations(participant_id);

CREATE INDEX idx_nostr_migrations_status
  ON nostr_migrations(status)
  WHERE status IN ('pending', 'otp_sent', 'verified');

-- ============================================================================
-- Triggers for updated_at Timestamps
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables with updated_at columns
CREATE TRIGGER update_onboarding_sessions_updated_at
  BEFORE UPDATE ON onboarding_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_onboarded_identities_updated_at
  BEFORE UPDATE ON onboarded_identities
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lightning_links_updated_at
  BEFORE UPDATE ON lightning_links
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Migration Complete
-- ============================================================================

-- Verify tables were created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM information_schema.tables
          WHERE table_name IN (
            'onboarding_sessions',
            'onboarded_identities',
            'nfc_cards',
            'lightning_links',
            'nostr_migrations'
          )) = 5, 'Not all onboarding tables were created';

  RAISE NOTICE 'High-Volume Physical Peer Onboarding schema migration completed successfully';
END $$;

