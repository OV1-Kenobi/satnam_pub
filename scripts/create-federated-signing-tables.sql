-- Federated Family Nostr Signing Tables
-- These tables support multi-signature Nostr events for family coordination

-- Table for storing federated events requiring multiple signatures
CREATE TABLE IF NOT EXISTS federated_events (
    id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('family_announcement', 'payment_request', 'member_update', 'coordination')),
    content TEXT NOT NULL,
    author_id TEXT NOT NULL,
    author_pubkey TEXT NOT NULL,
    signatures_required INTEGER NOT NULL DEFAULT 1,
    signatures_received INTEGER NOT NULL DEFAULT 0,
    member_signatures JSONB NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'signed', 'broadcast', 'expired')),
    nostr_event_id TEXT,
    broadcast_timestamp TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table for managing active signing sessions
CREATE TABLE IF NOT EXISTS federated_signing_sessions (
    session_id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES federated_events(id) ON DELETE CASCADE,
    family_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    initiator TEXT NOT NULL,
    initiator_pubkey TEXT NOT NULL,
    required_signers TEXT[] NOT NULL,
    completed_signers TEXT[] NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'expired', 'cancelled')),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(event_id) -- One session per event
);

-- Table for family signing rules and policies
CREATE TABLE IF NOT EXISTS family_signing_rules (
    id SERIAL PRIMARY KEY,
    family_id TEXT NOT NULL,
    rules JSONB NOT NULL DEFAULT '{}',
    default_expiration INTEGER NOT NULL DEFAULT 24, -- hours
    parent_override BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(family_id)
);

-- Table for family nostr key protection using Fedimint sharding
CREATE TABLE IF NOT EXISTS family_nostr_protection (
    id SERIAL PRIMARY KEY,
    family_member_id TEXT NOT NULL,
    user_id TEXT NOT NULL, -- Link to authenticated user
    federation_id TEXT NOT NULL,
    guardian_count INTEGER NOT NULL,
    threshold_required INTEGER NOT NULL,
    protection_active BOOLEAN NOT NULL DEFAULT true,
    nsec_shards_stored BOOLEAN NOT NULL DEFAULT false,
    last_recovery_at TIMESTAMP WITH TIME ZONE,
    recovery_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(family_member_id, user_id)
);

-- Table for storing guardian information
CREATE TABLE IF NOT EXISTS family_guardians (
    id SERIAL PRIMARY KEY,
    guardian_id TEXT NOT NULL,
    family_id TEXT NOT NULL,
    public_key TEXT NOT NULL,
    email TEXT,
    nostr_pubkey TEXT,
    role TEXT NOT NULL CHECK (role IN ('adult', 'trusted_contact', 'family_friend')),
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(guardian_id, family_id)
);

-- Table for storing encrypted guardian shards
CREATE TABLE IF NOT EXISTS guardian_shards (
    id SERIAL PRIMARY KEY,
    guardian_id TEXT NOT NULL,
    federation_id TEXT NOT NULL,
    shard_data TEXT NOT NULL, -- Base64 encoded shard
    shard_index INTEGER NOT NULL,
    threshold_required INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(guardian_id, federation_id, shard_index)
);

-- Table for guardian notifications
CREATE TABLE IF NOT EXISTS guardian_notifications (
    id SERIAL PRIMARY KEY,
    guardian_id TEXT NOT NULL,
    family_member_id TEXT,
    protection_id INTEGER REFERENCES family_nostr_protection(id) ON DELETE CASCADE,
    notification_type TEXT NOT NULL CHECK (notification_type IN ('protection_setup', 'recovery_request', 'threshold_change')),
    message TEXT NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'acknowledged')),
    acknowledged_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_federated_events_family_status ON federated_events(family_id, status);
CREATE INDEX IF NOT EXISTS idx_federated_events_expires_at ON federated_events(expires_at);
CREATE INDEX IF NOT EXISTS idx_federated_events_author ON federated_events(author_id);

CREATE INDEX IF NOT EXISTS idx_signing_sessions_family ON federated_signing_sessions(family_id);
CREATE INDEX IF NOT EXISTS idx_signing_sessions_status ON federated_signing_sessions(status);
CREATE INDEX IF NOT EXISTS idx_signing_sessions_expires_at ON federated_signing_sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_family_signing_rules_family ON family_signing_rules(family_id);

CREATE INDEX IF NOT EXISTS idx_nostr_protection_family_member ON family_nostr_protection(family_member_id);
CREATE INDEX IF NOT EXISTS idx_nostr_protection_user ON family_nostr_protection(user_id);
CREATE INDEX IF NOT EXISTS idx_nostr_protection_federation ON family_nostr_protection(federation_id);

CREATE INDEX IF NOT EXISTS idx_guardians_family ON family_guardians(family_id);
CREATE INDEX IF NOT EXISTS idx_guardians_active ON family_guardians(active);

CREATE INDEX IF NOT EXISTS idx_guardian_shards_guardian ON guardian_shards(guardian_id);
CREATE INDEX IF NOT EXISTS idx_guardian_shards_federation ON guardian_shards(federation_id);

CREATE INDEX IF NOT EXISTS idx_guardian_notifications_guardian ON guardian_notifications(guardian_id);
CREATE INDEX IF NOT EXISTS idx_guardian_notifications_status ON guardian_notifications(status);

-- Triggers for updating timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$ LANGUAGE plpgsql;

CREATE TRIGGER update_federated_events_updated_at
    BEFORE UPDATE ON federated_events
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_family_signing_rules_updated_at
    BEFORE UPDATE ON family_signing_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_family_nostr_protection_updated_at
    BEFORE UPDATE ON family_nostr_protection
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insert default family signing rules template
INSERT INTO family_signing_rules (family_id, rules, default_expiration, parent_override)
VALUES ('default', '{
    "family_announcement": {
        "signaturesRequired": 2,
        "allowedSigners": []
    },
    "payment_request": {
        "signaturesRequired": 2,
        "allowedSigners": [],
        "amountThreshold": 10000
    },
    "member_update": {
        "signaturesRequired": 1,
        "allowedSigners": []
    },
    "coordination": {
        "signaturesRequired": 2,
        "allowedSigners": []
    }
}', 24, true)
ON CONFLICT (family_id) DO NOTHING;

-- Add comments for documentation
COMMENT ON TABLE federated_events IS 'Stores family Nostr events requiring multiple signatures';
COMMENT ON TABLE federated_signing_sessions IS 'Manages active multi-signature signing sessions';
COMMENT ON TABLE family_signing_rules IS 'Defines signing rules and policies for each family';
COMMENT ON TABLE family_nostr_protection IS 'Tracks nsec key protection status for family members';
COMMENT ON TABLE family_guardians IS 'Stores guardian information for key recovery';
COMMENT ON TABLE guardian_shards IS 'Stores encrypted key shards for guardians';
COMMENT ON TABLE guardian_notifications IS 'Manages notifications to guardians';

COMMENT ON COLUMN federated_events.member_signatures IS 'JSONB object containing member signature status and data';
COMMENT ON COLUMN family_signing_rules.rules IS 'JSONB object defining signing requirements for different event types';
COMMENT ON COLUMN guardian_shards.shard_data IS 'Base64 encoded encrypted shard data';