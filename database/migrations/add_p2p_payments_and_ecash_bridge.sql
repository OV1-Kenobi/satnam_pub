-- Migration: Add P2P Payments and eCash Bridge Support
-- Description: Database schema for comprehensive P2P Lightning payments and eCash bridge operations
-- Version: 1.0.0
-- Date: 2025-01-17

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- P2P Lightning Payments Table
CREATE TABLE IF NOT EXISTS p2p_lightning_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_type VARCHAR(50) NOT NULL CHECK (payment_type IN (
        'P2P_INTERNAL_LIGHTNING',
        'P2P_EXTERNAL_LIGHTNING',
        'LEGACY_FAMILY_PAYMENT'
    )),
    
    -- User information (encrypted UUIDs)
    from_user_id UUID NOT NULL,
    to_user_identifier TEXT NOT NULL, -- Can be user UUID or Lightning address
    
    -- Payment details
    amount_sats BIGINT NOT NULL CHECK (amount_sats > 0),
    memo TEXT,
    user_role VARCHAR(20) NOT NULL CHECK (user_role IN (
        'private', 'offspring', 'adult', 'steward', 'guardian'
    )),
    
    -- Lightning Network details
    payment_hash VARCHAR(64) NOT NULL,
    preimage VARCHAR(64),
    lightning_node_type VARCHAR(20) NOT NULL CHECK (lightning_node_type IN (
        'voltage', 'phoenixd', 'breez', 'nwc', 'self-hosted'
    )),
    
    -- Privacy information
    privacy_enabled BOOLEAN DEFAULT FALSE,
    privacy_service_url TEXT,
    privacy_routing_budget INTEGER,
    
    -- Status and timing
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'paid', 'failed', 'cancelled'
    )),
    fee_sats INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Security and audit
    security_validated BOOLEAN DEFAULT FALSE,
    environment VARCHAR(20) DEFAULT 'development',
    
    CONSTRAINT fk_from_user FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- eCash Bridge Operations Table
CREATE TABLE IF NOT EXISTS ecash_bridge_operations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    operation_type VARCHAR(50) NOT NULL CHECK (operation_type IN (
        'ECASH_FEDIMINT_TO_CASHU',
        'ECASH_CASHU_TO_FEDIMINT',
        'ECASH_FEDIMINT_TO_FEDIMINT',
        'ECASH_CASHU_EXTERNAL_SWAP'
    )),
    
    -- User information
    user_id UUID NOT NULL,
    user_role VARCHAR(20) NOT NULL CHECK (user_role IN (
        'private', 'offspring', 'adult', 'steward', 'guardian'
    )),
    
    -- Token information (encrypted storage)
    source_token_hash VARCHAR(64) NOT NULL, -- SHA-256 hash of source token
    target_destination TEXT NOT NULL,
    amount_sats BIGINT NOT NULL CHECK (amount_sats > 0),
    
    -- Conversion details
    conversion_id VARCHAR(64) NOT NULL UNIQUE,
    conversion_fee_sats INTEGER DEFAULT 0,
    lightning_node_type VARCHAR(20) NOT NULL CHECK (lightning_node_type IN (
        'voltage', 'phoenixd', 'breez', 'nwc', 'self-hosted'
    )),
    
    -- Result information (encrypted)
    result_token_hash VARCHAR(64), -- SHA-256 hash of result token
    
    -- Privacy and security
    privacy_enabled BOOLEAN DEFAULT FALSE,
    is_multi_nut BOOLEAN DEFAULT FALSE,
    
    -- Status and timing
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'completed', 'failed', 'expired'
    )),
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Security and audit
    security_validated BOOLEAN DEFAULT FALSE,
    environment VARCHAR(20) DEFAULT 'development',
    
    CONSTRAINT fk_bridge_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Spending Limits Tracking Table
CREATE TABLE IF NOT EXISTS user_spending_limits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    user_role VARCHAR(20) NOT NULL CHECK (user_role IN (
        'private', 'offspring', 'adult', 'steward', 'guardian'
    )),
    
    -- Spending limits configuration
    daily_limit_sats BIGINT DEFAULT NULL, -- NULL means no limit
    requires_adult_approval BOOLEAN DEFAULT FALSE,

    -- Current spending tracking
    current_daily_spending_sats BIGINT DEFAULT 0,
    spending_reset_date DATE DEFAULT CURRENT_DATE,

    -- Adult approval settings (adults handle offspring approval)
    adult_user_id UUID,
    approval_threshold_sats BIGINT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT fk_spending_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_adult_user FOREIGN KEY (adult_user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT unique_user_spending_limit UNIQUE (user_id)
);

-- Lightning Node Health Status Table
CREATE TABLE IF NOT EXISTS lightning_node_health (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    node_type VARCHAR(20) NOT NULL CHECK (node_type IN (
        'voltage', 'phoenixd', 'breez', 'nwc', 'self-hosted'
    )),
    
    -- Health status
    connected BOOLEAN DEFAULT FALSE,
    latency_ms INTEGER,
    block_height BIGINT,
    channels_count INTEGER,
    balance_sats BIGINT,
    
    -- Error information
    error_message TEXT,
    last_error_at TIMESTAMP WITH TIME ZONE,
    
    -- Timestamps
    last_checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_node_type UNIQUE (node_type)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_p2p_payments_from_user ON p2p_lightning_payments(from_user_id);
CREATE INDEX IF NOT EXISTS idx_p2p_payments_status ON p2p_lightning_payments(status);
CREATE INDEX IF NOT EXISTS idx_p2p_payments_created_at ON p2p_lightning_payments(created_at);
CREATE INDEX IF NOT EXISTS idx_p2p_payments_type ON p2p_lightning_payments(payment_type);

CREATE INDEX IF NOT EXISTS idx_ecash_bridge_user ON ecash_bridge_operations(user_id);
CREATE INDEX IF NOT EXISTS idx_ecash_bridge_status ON ecash_bridge_operations(status);
CREATE INDEX IF NOT EXISTS idx_ecash_bridge_created_at ON ecash_bridge_operations(created_at);
CREATE INDEX IF NOT EXISTS idx_ecash_bridge_type ON ecash_bridge_operations(operation_type);
CREATE INDEX IF NOT EXISTS idx_ecash_bridge_conversion_id ON ecash_bridge_operations(conversion_id);

CREATE INDEX IF NOT EXISTS idx_spending_limits_user ON user_spending_limits(user_id);
CREATE INDEX IF NOT EXISTS idx_spending_limits_reset_date ON user_spending_limits(spending_reset_date);

CREATE INDEX IF NOT EXISTS idx_node_health_type ON lightning_node_health(node_type);
CREATE INDEX IF NOT EXISTS idx_node_health_last_checked ON lightning_node_health(last_checked_at);

-- Row Level Security (RLS) Policies
ALTER TABLE p2p_lightning_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ecash_bridge_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_spending_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE lightning_node_health ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access their own payment records
CREATE POLICY p2p_payments_user_access ON p2p_lightning_payments
    FOR ALL USING (from_user_id = auth.uid());

-- RLS Policy: Users can only access their own eCash bridge operations
CREATE POLICY ecash_bridge_user_access ON ecash_bridge_operations
    FOR ALL USING (user_id = auth.uid());

-- RLS Policy: Users can only access their own spending limits
CREATE POLICY spending_limits_user_access ON user_spending_limits
    FOR ALL USING (user_id = auth.uid());

-- RLS Policy: Lightning node health is read-only for authenticated users
CREATE POLICY node_health_read_access ON lightning_node_health
    FOR SELECT USING (auth.role() = 'authenticated');

-- Functions for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for automatic timestamp updates
CREATE TRIGGER update_p2p_payments_updated_at 
    BEFORE UPDATE ON p2p_lightning_payments 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ecash_bridge_updated_at 
    BEFORE UPDATE ON ecash_bridge_operations 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_spending_limits_updated_at 
    BEFORE UPDATE ON user_spending_limits 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to reset daily spending limits
CREATE OR REPLACE FUNCTION reset_daily_spending_limits()
RETURNS void AS $$
BEGIN
    UPDATE user_spending_limits 
    SET 
        current_daily_spending_sats = 0,
        spending_reset_date = CURRENT_DATE,
        updated_at = NOW()
    WHERE spending_reset_date < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON TABLE p2p_lightning_payments IS 'Stores P2P Lightning payment records with privacy and security tracking';
COMMENT ON TABLE ecash_bridge_operations IS 'Stores eCash bridge conversion operations between Fedimint and Cashu systems';
COMMENT ON TABLE user_spending_limits IS 'Manages role-based spending limits and guardian approval requirements';
COMMENT ON TABLE lightning_node_health IS 'Tracks health status of all Lightning Network nodes';

COMMENT ON COLUMN p2p_lightning_payments.privacy_enabled IS 'Whether LNProxy privacy protection was used for this payment';
COMMENT ON COLUMN ecash_bridge_operations.source_token_hash IS 'SHA-256 hash of source eCash token for privacy compliance';
COMMENT ON COLUMN user_spending_limits.daily_limit_sats IS 'Daily spending limit in satoshis, NULL means no limit';
COMMENT ON COLUMN lightning_node_health.connected IS 'Current connection status of the Lightning node';
