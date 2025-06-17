-- Control Board Schema Migration
-- Adds tables and views for comprehensive Nostr and Lightning Network management

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Transactions table for Lightning Network activity tracking
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('sent', 'received', 'internal')),
    amount BIGINT NOT NULL CHECK (amount > 0),
    from_address VARCHAR(255) NOT NULL,
    to_address VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed')),
    privacy_enabled BOOLEAN NOT NULL DEFAULT false,
    privacy_fee DECIMAL(5,2) DEFAULT 0.0,
    payment_hash VARCHAR(64),
    preimage VARCHAR(64),
    nostr_event_id VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    
    -- Indexes for performance
    INDEX idx_transactions_family_id (family_id),
    INDEX idx_transactions_user_id (user_id),
    INDEX idx_transactions_created_at (created_at DESC),
    INDEX idx_transactions_status (status),
    INDEX idx_transactions_payment_hash (payment_hash)
);

-- Nostr relays table for relay management
CREATE TABLE IF NOT EXISTS nostr_relays (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    url VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'connecting', 'disconnected', 'error')),
    read_access BOOLEAN NOT NULL DEFAULT true,
    write_access BOOLEAN NOT NULL DEFAULT true,
    message_count INTEGER DEFAULT 0,
    last_connected TIMESTAMP WITH TIME ZONE,
    last_error TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure unique relay URLs per family
    CONSTRAINT unique_family_relay UNIQUE (family_id, url),
    
    -- Indexes
    INDEX idx_nostr_relays_family_id (family_id),
    INDEX idx_nostr_relays_status (status),
    INDEX idx_nostr_relays_url (url)
);

-- Nostr events table for event tracking and coordination
CREATE TABLE IF NOT EXISTS nostr_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    event_id VARCHAR(64) NOT NULL, -- Nostr event ID
    kind INTEGER NOT NULL,
    pubkey VARCHAR(64) NOT NULL,
    content TEXT,
    tags JSONB DEFAULT '[]',
    sig VARCHAR(128),
    created_at_nostr INTEGER NOT NULL, -- Nostr timestamp
    relays TEXT[] DEFAULT '{}',
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'signed', 'published', 'failed')),
    encrypted BOOLEAN NOT NULL DEFAULT false,
    signatures_required INTEGER DEFAULT 1,
    signatures_received INTEGER DEFAULT 0,
    member_signatures JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Indexes
    INDEX idx_nostr_events_family_id (family_id),
    INDEX idx_nostr_events_user_id (user_id),
    INDEX idx_nostr_events_event_id (event_id),
    INDEX idx_nostr_events_kind (kind),
    INDEX idx_nostr_events_status (status),
    INDEX idx_nostr_events_created_at (created_at DESC)
);

-- Lightning nodes table for node management
CREATE TABLE IF NOT EXISTS lightning_nodes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    pubkey VARCHAR(66) NOT NULL, -- Lightning node public key
    provider VARCHAR(50) NOT NULL CHECK (provider IN ('voltage', 'lnbits', 'umbrel', 'own')),
    status VARCHAR(20) NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'syncing')),
    balance BIGINT DEFAULT 0,
    channel_count INTEGER DEFAULT 0,
    capacity BIGINT DEFAULT 0,
    api_endpoint VARCHAR(255),
    api_key_encrypted TEXT, -- Encrypted API key
    configuration JSONB DEFAULT '{}',
    last_sync TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Indexes
    INDEX idx_lightning_nodes_family_id (family_id),
    INDEX idx_lightning_nodes_pubkey (pubkey),
    INDEX idx_lightning_nodes_status (status)
);

-- Family privacy settings table
CREATE TABLE IF NOT EXISTS family_privacy_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    mode VARCHAR(20) NOT NULL DEFAULT 'standard' CHECK (mode IN ('standard', 'enhanced', 'stealth')),
    enable_lnproxy BOOLEAN NOT NULL DEFAULT false,
    enable_tor_routing BOOLEAN NOT NULL DEFAULT false,
    enable_event_encryption BOOLEAN NOT NULL DEFAULT false,
    relay_rotation BOOLEAN NOT NULL DEFAULT false,
    auto_privacy_fees BOOLEAN NOT NULL DEFAULT false,
    max_privacy_fee_percent DECIMAL(4,2) DEFAULT 5.0 CHECK (max_privacy_fee_percent >= 0 AND max_privacy_fee_percent <= 100),
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure one settings record per family
    CONSTRAINT unique_family_privacy_settings UNIQUE (family_id),
    
    -- Index
    INDEX idx_family_privacy_settings_family_id (family_id)
);

-- Privacy operations log for audit and metrics
CREATE TABLE IF NOT EXISTS privacy_operations_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    family_id UUID REFERENCES families(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    operation VARCHAR(100) NOT NULL,
    details JSONB DEFAULT '{}',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT,
    
    -- Indexes for analytics
    INDEX idx_privacy_operations_family_id (family_id),
    INDEX idx_privacy_operations_user_id (user_id),
    INDEX idx_privacy_operations_operation (operation),
    INDEX idx_privacy_operations_timestamp (timestamp DESC)
);

-- Add privacy columns to existing profiles table if they don't exist
DO $$ 
BEGIN
    -- Add privacy_level column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'profiles' AND column_name = 'privacy_level'
    ) THEN
        ALTER TABLE profiles ADD COLUMN privacy_level VARCHAR(20) DEFAULT 'standard' CHECK (privacy_level IN ('standard', 'enhanced', 'maximum'));
    END IF;
    
    -- Add last_activity column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'profiles' AND column_name = 'last_activity'
    ) THEN
        ALTER TABLE profiles ADD COLUMN last_activity TIMESTAMP WITH TIME ZONE;
    END IF;
    
    -- Add status column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'profiles' AND column_name = 'status'
    ) THEN
        ALTER TABLE profiles ADD COLUMN status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended'));
    END IF;
    
    -- Add balance column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'profiles' AND column_name = 'balance'
    ) THEN
        ALTER TABLE profiles ADD COLUMN balance BIGINT DEFAULT 0;
    END IF;
    
    -- Add daily_limit column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'profiles' AND column_name = 'daily_limit'
    ) THEN
        ALTER TABLE profiles ADD COLUMN daily_limit BIGINT DEFAULT 100000; -- 100k sats default
    END IF;
END $$;

-- Create views for analytics and dashboards

-- Control board overview view
CREATE OR REPLACE VIEW control_board_overview AS
SELECT 
    f.id as family_id,
    f.family_name,
    -- Family member stats
    COUNT(p.id) as total_members,
    COUNT(CASE WHEN p.last_activity > NOW() - INTERVAL '24 hours' THEN 1 END) as active_members,
    COUNT(CASE WHEN p.npub IS NOT NULL THEN 1 END) as verified_members,
    COUNT(CASE WHEN p.privacy_level != 'standard' THEN 1 END) as privacy_enabled_members,
    -- Lightning stats
    COALESCE(SUM(p.balance), 0) as total_balance,
    COUNT(ln.id) as lightning_nodes,
    COUNT(CASE WHEN ln.status = 'online' THEN 1 END) as online_nodes,
    -- Nostr stats
    COUNT(nr.id) as total_relays,
    COUNT(CASE WHEN nr.status = 'connected' THEN 1 END) as connected_relays,
    -- Transaction stats (last 30 days)
    COALESCE(tx_stats.total_transactions, 0) as recent_transactions,
    COALESCE(tx_stats.privacy_transactions, 0) as privacy_transactions,
    COALESCE(tx_stats.total_volume, 0) as recent_volume
FROM families f
LEFT JOIN profiles p ON f.id = p.family_id
LEFT JOIN lightning_nodes ln ON f.id = ln.family_id
LEFT JOIN nostr_relays nr ON f.id = nr.family_id
LEFT JOIN (
    SELECT 
        family_id,
        COUNT(*) as total_transactions,
        COUNT(CASE WHEN privacy_enabled THEN 1 END) as privacy_transactions,
        COALESCE(SUM(amount), 0) as total_volume
    FROM transactions 
    WHERE created_at > NOW() - INTERVAL '30 days'
    GROUP BY family_id
) tx_stats ON f.id = tx_stats.family_id
GROUP BY f.id, f.family_name, tx_stats.total_transactions, tx_stats.privacy_transactions, tx_stats.total_volume;

-- Privacy metrics view
CREATE OR REPLACE VIEW privacy_metrics AS
SELECT 
    family_id,
    COUNT(*) as total_transactions,
    COUNT(CASE WHEN privacy_enabled THEN 1 END) as privacy_transactions,
    ROUND(
        CASE 
            WHEN COUNT(*) > 0 THEN (COUNT(CASE WHEN privacy_enabled THEN 1 END)::DECIMAL / COUNT(*)) * 100 
            ELSE 0 
        END, 2
    ) as privacy_rate,
    COALESCE(AVG(CASE WHEN privacy_enabled THEN privacy_fee END), 0) as avg_privacy_fee,
    COALESCE(SUM(CASE WHEN privacy_enabled THEN amount END), 0) as privacy_volume
FROM transactions
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY family_id;

-- Recent activity view
CREATE OR REPLACE VIEW recent_activity AS
SELECT 
    'transaction' as activity_type,
    t.family_id,
    t.id as activity_id,
    t.type as activity_subtype,
    t.amount,
    t.from_address,
    t.to_address,
    t.description,
    t.privacy_enabled,
    t.created_at,
    p.username as user_username
FROM transactions t
LEFT JOIN profiles p ON t.user_id = p.id
WHERE t.created_at > NOW() - INTERVAL '7 days'

UNION ALL

SELECT 
    'nostr_event' as activity_type,
    ne.family_id,
    ne.id as activity_id,
    ne.kind::VARCHAR as activity_subtype,
    NULL as amount,
    ne.pubkey as from_address,
    NULL as to_address,
    LEFT(ne.content, 100) as description,
    ne.encrypted as privacy_enabled,
    ne.created_at,
    p.username as user_username
FROM nostr_events ne
LEFT JOIN profiles p ON ne.user_id = p.id
WHERE ne.created_at > NOW() - INTERVAL '7 days'

ORDER BY created_at DESC;

-- Create update triggers for updated_at fields
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to all tables with updated_at
DO $$
DECLARE
    table_name TEXT;
BEGIN
    FOR table_name IN 
        SELECT t.table_name 
        FROM information_schema.tables t
        INNER JOIN information_schema.columns c ON t.table_name = c.table_name
        WHERE t.table_schema = 'public' 
        AND c.column_name = 'updated_at'
        AND t.table_type = 'BASE TABLE'
        AND t.table_name IN ('transactions', 'nostr_relays', 'nostr_events', 'lightning_nodes', 'family_privacy_settings')
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS update_%s_updated_at ON %s;
            CREATE TRIGGER update_%s_updated_at 
                BEFORE UPDATE ON %s 
                FOR EACH ROW 
                EXECUTE FUNCTION update_updated_at_column();
        ', table_name, table_name, table_name, table_name);
    END LOOP;
END $$;

-- Row Level Security (RLS) policies

-- Enable RLS on all new tables
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE nostr_relays ENABLE ROW LEVEL SECURITY;
ALTER TABLE nostr_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE lightning_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_privacy_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_operations_log ENABLE ROW LEVEL SECURITY;

-- Transactions policies
CREATE POLICY "Users can view their family's transactions" ON transactions
    FOR SELECT USING (
        family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
    );

CREATE POLICY "Users can insert transactions for their family" ON transactions
    FOR INSERT WITH CHECK (
        family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
    );

CREATE POLICY "Users can update their family's transactions" ON transactions
    FOR UPDATE USING (
        family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
    );

-- Nostr relays policies
CREATE POLICY "Users can manage their family's relays" ON nostr_relays
    FOR ALL USING (
        family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
    );

-- Nostr events policies
CREATE POLICY "Users can manage their family's events" ON nostr_events
    FOR ALL USING (
        family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
    );

-- Lightning nodes policies
CREATE POLICY "Users can manage their family's nodes" ON lightning_nodes
    FOR ALL USING (
        family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
    );

-- Privacy settings policies
CREATE POLICY "Users can manage their family's privacy settings" ON family_privacy_settings
    FOR ALL USING (
        family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
    );

-- Privacy operations log policies
CREATE POLICY "Users can view their family's privacy operations" ON privacy_operations_log
    FOR SELECT USING (
        family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
    );

CREATE POLICY "System can insert privacy operations" ON privacy_operations_log
    FOR INSERT WITH CHECK (true);

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON nostr_relays TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON nostr_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON lightning_nodes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON family_privacy_settings TO authenticated;
GRANT SELECT, INSERT ON privacy_operations_log TO authenticated;

-- Grant access to views
GRANT SELECT ON control_board_overview TO authenticated;
GRANT SELECT ON privacy_metrics TO authenticated;
GRANT SELECT ON recent_activity TO authenticated;

-- Create indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_profiles_family_id_active ON profiles(family_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_profiles_last_activity ON profiles(last_activity) WHERE last_activity IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_family_created ON transactions(family_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_privacy_enabled ON transactions(privacy_enabled) WHERE privacy_enabled = true;

-- Insert default privacy settings for existing families
INSERT INTO family_privacy_settings (family_id, mode, enable_lnproxy, enable_tor_routing, enable_event_encryption, relay_rotation, auto_privacy_fees, max_privacy_fee_percent)
SELECT 
    f.id,
    'standard',
    false,
    false,
    false,
    false,
    false,
    5.0
FROM families f
WHERE NOT EXISTS (
    SELECT 1 FROM family_privacy_settings fps WHERE fps.family_id = f.id
);

-- Insert default relays for existing families
INSERT INTO nostr_relays (family_id, url, status, read_access, write_access)
SELECT DISTINCT
    f.id,
    relay_url,
    'disconnected',
    true,
    true
FROM families f
CROSS JOIN (VALUES 
    ('wss://relay.damus.io'),
    ('wss://nos.lol'),
    ('wss://relay.snort.social')
) AS default_relays(relay_url)
WHERE NOT EXISTS (
    SELECT 1 FROM nostr_relays nr 
    WHERE nr.family_id = f.id AND nr.url = default_relays.relay_url
);

COMMENT ON TABLE transactions IS 'Lightning Network transaction tracking for families';
COMMENT ON TABLE nostr_relays IS 'Nostr relay management for families';
COMMENT ON TABLE nostr_events IS 'Nostr event coordination and signing for families';
COMMENT ON TABLE lightning_nodes IS 'Lightning Network node management for families';
COMMENT ON TABLE family_privacy_settings IS 'Privacy configuration for families';
COMMENT ON TABLE privacy_operations_log IS 'Privacy operation audit log';
COMMENT ON VIEW control_board_overview IS 'Comprehensive family dashboard statistics';
COMMENT ON VIEW privacy_metrics IS 'Privacy usage analytics for families';
COMMENT ON VIEW recent_activity IS 'Recent family activity across all systems';