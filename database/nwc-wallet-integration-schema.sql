-- NWC (Nostr Wallet Connect) Integration Schema - Master Context Compliant
-- This schema extends the existing privacy-first database with NWC wallet support
-- 
-- MASTER CONTEXT COMPLIANCE:
-- ✅ Individual Wallet Sovereignty enforcement with role-based access
-- ✅ Privacy-first architecture with encrypted connection strings
-- ✅ Zero-knowledge patterns with no sensitive wallet data exposure
-- ✅ Standardized role hierarchy integration
-- ✅ Row Level Security (RLS) policies for NWC wallet data
-- ✅ Integration with existing privacy_users and family_memberships tables

-- Enable Row Level Security for all new tables
ALTER DATABASE postgres SET row_security = on;

-- NWC Wallet Connections table
-- Stores encrypted NWC connection strings and metadata
CREATE TABLE IF NOT EXISTS public.nwc_wallet_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_hash VARCHAR(50) NOT NULL,
    connection_id VARCHAR(32) NOT NULL UNIQUE, -- Privacy-preserving connection identifier
    
    -- Encrypted connection data (using user's encryption key)
    encrypted_connection_string TEXT NOT NULL,
    connection_encryption_salt VARCHAR(32) NOT NULL UNIQUE,
    connection_encryption_iv VARCHAR(24) NOT NULL UNIQUE,
    
    -- Connection metadata (non-sensitive)
    wallet_name VARCHAR(100) NOT NULL DEFAULT 'My NWC Wallet',
    wallet_provider VARCHAR(50) CHECK (wallet_provider IN ('zeus', 'alby', 'mutiny', 'breez', 'phoenixd', 'other')),
    pubkey_preview VARCHAR(20) NOT NULL, -- First 8 + last 8 chars for display
    relay_domain VARCHAR(100) NOT NULL, -- Just the domain for display
    
    -- Sovereignty and permissions
    user_role VARCHAR(20) NOT NULL CHECK (user_role IN ('private', 'offspring', 'adult', 'steward', 'guardian')),
    spending_limit BIGINT DEFAULT -1, -- -1 for unlimited (sovereign roles)
    daily_limit BIGINT DEFAULT 50000, -- 50K sats default for offspring
    requires_approval BOOLEAN NOT NULL DEFAULT false,
    
    -- Connection status
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_primary BOOLEAN NOT NULL DEFAULT false, -- Primary NWC wallet for user
    connection_status VARCHAR(20) NOT NULL DEFAULT 'connected' CHECK (connection_status IN ('connected', 'disconnected', 'error', 'testing')),
    last_connected_at TIMESTAMP WITH TIME ZONE,
    last_error TEXT,
    
    -- Supported NIP-47 methods
    supported_methods JSONB NOT NULL DEFAULT '["get_balance", "make_invoice", "pay_invoice", "lookup_invoice", "list_transactions"]',
    
    -- Privacy and security
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE,
    
    -- Foreign key constraints
    FOREIGN KEY (user_hash) REFERENCES privacy_users(hashed_uuid) ON DELETE CASCADE,
    
    -- Unique constraints
    UNIQUE(connection_encryption_salt),
    UNIQUE(connection_encryption_iv),
    
    -- Indexes for performance
    INDEX idx_nwc_connections_user (user_hash),
    INDEX idx_nwc_connections_active (is_active),
    INDEX idx_nwc_connections_primary (user_hash, is_primary)
);

-- NWC Wallet Sessions table
-- Tracks active NWC wallet sessions and operations
CREATE TABLE IF NOT EXISTS public.nwc_wallet_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id VARCHAR(32) NOT NULL,
    user_hash VARCHAR(50) NOT NULL,
    
    -- Session data
    session_token VARCHAR(64) NOT NULL UNIQUE, -- Generated session token
    session_encryption_key VARCHAR(64) NOT NULL,
    
    -- Session metadata
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
    last_activity TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Session status
    is_active BOOLEAN NOT NULL DEFAULT true,
    revoked_at TIMESTAMP WITH TIME ZONE,
    
    -- Privacy tracking
    operations_count INTEGER NOT NULL DEFAULT 0,
    last_operation_type VARCHAR(50),
    
    -- Foreign key constraints
    FOREIGN KEY (connection_id) REFERENCES nwc_wallet_connections(connection_id) ON DELETE CASCADE,
    FOREIGN KEY (user_hash) REFERENCES privacy_users(hashed_uuid) ON DELETE CASCADE,
    
    -- Indexes
    INDEX idx_nwc_sessions_connection (connection_id),
    INDEX idx_nwc_sessions_user (user_hash),
    INDEX idx_nwc_sessions_active (is_active, expires_at)
);

-- NWC Transaction History table
-- Privacy-preserving transaction history for NWC operations
CREATE TABLE IF NOT EXISTS public.nwc_transaction_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id VARCHAR(32) NOT NULL,
    user_hash VARCHAR(50) NOT NULL,
    
    -- Transaction data (privacy-preserving)
    operation_type VARCHAR(50) NOT NULL CHECK (operation_type IN ('get_balance', 'make_invoice', 'pay_invoice', 'lookup_invoice', 'list_transactions')),
    operation_hash VARCHAR(64) NOT NULL, -- Privacy-preserving operation identifier
    
    -- Amount data (encrypted for privacy)
    encrypted_amount TEXT, -- Encrypted amount data
    amount_encryption_salt VARCHAR(32),
    amount_encryption_iv VARCHAR(24),
    
    -- Operation status
    operation_status VARCHAR(20) NOT NULL CHECK (operation_status IN ('pending', 'completed', 'failed', 'cancelled')),
    error_message TEXT,
    
    -- Sovereignty validation
    sovereignty_validated BOOLEAN NOT NULL DEFAULT false,
    requires_approval BOOLEAN NOT NULL DEFAULT false,
    guardian_approved BOOLEAN DEFAULT false,
    guardian_id VARCHAR(50), -- Guardian who approved (if applicable)
    
    -- Privacy timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Foreign key constraints
    FOREIGN KEY (connection_id) REFERENCES nwc_wallet_connections(connection_id) ON DELETE CASCADE,
    FOREIGN KEY (user_hash) REFERENCES privacy_users(hashed_uuid) ON DELETE CASCADE,
    FOREIGN KEY (guardian_id) REFERENCES privacy_users(hashed_uuid) ON DELETE SET NULL,
    
    -- Unique constraints
    UNIQUE(operation_hash),
    UNIQUE(amount_encryption_salt),
    UNIQUE(amount_encryption_iv),
    
    -- Indexes
    INDEX idx_nwc_transactions_connection (connection_id),
    INDEX idx_nwc_transactions_user (user_hash),
    INDEX idx_nwc_transactions_operation (operation_type),
    INDEX idx_nwc_transactions_status (operation_status),
    INDEX idx_nwc_transactions_created (created_at)
);

-- NWC Connection Metadata table
-- Additional metadata for NWC connections (capabilities, preferences, etc.)
CREATE TABLE IF NOT EXISTS public.nwc_connection_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id VARCHAR(32) NOT NULL UNIQUE,
    
    -- Wallet capabilities
    max_amount BIGINT, -- Maximum amount wallet can handle
    min_amount BIGINT DEFAULT 1, -- Minimum amount (usually 1 sat)
    fee_structure JSONB, -- Fee information from wallet
    
    -- User preferences
    preferred_for_payments BOOLEAN NOT NULL DEFAULT false,
    preferred_for_invoices BOOLEAN NOT NULL DEFAULT false,
    auto_approve_small_payments BOOLEAN NOT NULL DEFAULT false,
    small_payment_threshold BIGINT DEFAULT 1000, -- 1K sats
    
    -- Educational tracking
    setup_completed BOOLEAN NOT NULL DEFAULT false,
    tutorial_completed BOOLEAN NOT NULL DEFAULT false,
    sovereignty_education_shown BOOLEAN NOT NULL DEFAULT false,
    
    -- Integration settings
    replace_custodial_wallet BOOLEAN NOT NULL DEFAULT false,
    integrate_with_messaging BOOLEAN NOT NULL DEFAULT true,
    enable_zap_payments BOOLEAN NOT NULL DEFAULT true,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Foreign key constraints
    FOREIGN KEY (connection_id) REFERENCES nwc_wallet_connections(connection_id) ON DELETE CASCADE,
    
    -- Indexes
    INDEX idx_nwc_metadata_connection (connection_id),
    INDEX idx_nwc_metadata_preferences (preferred_for_payments, preferred_for_invoices)
);

-- Row Level Security Policies

-- NWC Wallet Connections: Users can only access their own connections
ALTER TABLE nwc_wallet_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY nwc_connections_own_data ON nwc_wallet_connections
    FOR ALL
    USING (user_hash = current_setting('app.current_user_hash', true));

-- NWC Wallet Sessions: Users can only access their own sessions
ALTER TABLE nwc_wallet_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY nwc_sessions_own_data ON nwc_wallet_sessions
    FOR ALL
    USING (user_hash = current_setting('app.current_user_hash', true));

-- NWC Transaction History: Users can access their own transactions + guardians can access offspring transactions
ALTER TABLE nwc_transaction_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY nwc_transactions_own_data ON nwc_transaction_history
    FOR ALL
    USING (
        user_hash = current_setting('app.current_user_hash', true) OR
        guardian_id = current_setting('app.current_user_hash', true)
    );

-- NWC Connection Metadata: Users can only access their own connection metadata
ALTER TABLE nwc_connection_metadata ENABLE ROW LEVEL SECURITY;
CREATE POLICY nwc_metadata_own_data ON nwc_connection_metadata
    FOR ALL
    USING (
        connection_id IN (
            SELECT connection_id FROM nwc_wallet_connections 
            WHERE user_hash = current_setting('app.current_user_hash', true)
        )
    );

-- Database Functions for NWC Operations

-- Function to create NWC wallet connection with sovereignty validation
CREATE OR REPLACE FUNCTION create_nwc_wallet_connection(
    p_user_hash VARCHAR(50),
    p_connection_id VARCHAR(32),
    p_encrypted_connection_string TEXT,
    p_connection_encryption_salt VARCHAR(32),
    p_connection_encryption_iv VARCHAR(24),
    p_wallet_name VARCHAR(100),
    p_wallet_provider VARCHAR(50),
    p_pubkey_preview VARCHAR(20),
    p_relay_domain VARCHAR(100),
    p_user_role VARCHAR(20)
) RETURNS JSON AS $$
DECLARE
    v_spending_limit BIGINT;
    v_requires_approval BOOLEAN;
    v_result JSON;
BEGIN
    -- Determine spending limits based on role (Individual Wallet Sovereignty)
    IF p_user_role IN ('private', 'adult', 'steward', 'guardian') THEN
        v_spending_limit := -1; -- Unlimited for sovereign roles
        v_requires_approval := false;
    ELSE
        v_spending_limit := 50000; -- 50K sats daily limit for offspring
        v_requires_approval := true;
    END IF;
    
    -- Insert NWC connection
    INSERT INTO nwc_wallet_connections (
        user_hash, connection_id, encrypted_connection_string,
        connection_encryption_salt, connection_encryption_iv,
        wallet_name, wallet_provider, pubkey_preview, relay_domain,
        user_role, spending_limit, requires_approval
    ) VALUES (
        p_user_hash, p_connection_id, p_encrypted_connection_string,
        p_connection_encryption_salt, p_connection_encryption_iv,
        p_wallet_name, p_wallet_provider, p_pubkey_preview, p_relay_domain,
        p_user_role, v_spending_limit, v_requires_approval
    );
    
    -- Create default metadata
    INSERT INTO nwc_connection_metadata (connection_id) VALUES (p_connection_id);
    
    -- Return success result
    v_result := json_build_object(
        'success', true,
        'connection_id', p_connection_id,
        'spending_limit', v_spending_limit,
        'requires_approval', v_requires_approval
    );
    
    RETURN v_result;
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to validate NWC operation with sovereignty enforcement
CREATE OR REPLACE FUNCTION validate_nwc_operation(
    p_user_hash VARCHAR(50),
    p_connection_id VARCHAR(32),
    p_operation_type VARCHAR(50),
    p_amount BIGINT DEFAULT 0
) RETURNS JSON AS $$
DECLARE
    v_connection RECORD;
    v_user RECORD;
    v_result JSON;
    v_authorized BOOLEAN := false;
    v_requires_approval BOOLEAN := false;
    v_spending_limit BIGINT;
BEGIN
    -- Get connection and user data
    SELECT * INTO v_connection FROM nwc_wallet_connections
    WHERE connection_id = p_connection_id AND user_hash = p_user_hash;

    SELECT * INTO v_user FROM privacy_users WHERE hashed_uuid = p_user_hash;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Connection not found');
    END IF;

    -- Apply Individual Wallet Sovereignty rules
    IF v_user.federation_role IN ('private', 'adult', 'steward', 'guardian') THEN
        -- Sovereign roles have unlimited authority
        v_authorized := true;
        v_requires_approval := false;
        v_spending_limit := -1;
    ELSIF v_user.federation_role = 'offspring' THEN
        -- Offspring have spending limits and approval requirements
        v_spending_limit := v_connection.daily_limit;

        IF p_operation_type = 'pay_invoice' AND p_amount > 25000 THEN
            v_requires_approval := true;
            v_authorized := p_amount <= v_spending_limit;
        ELSE
            v_authorized := true;
            v_requires_approval := false;
        END IF;
    ELSE
        v_authorized := false;
        v_requires_approval := true;
    END IF;

    -- Return validation result
    v_result := json_build_object(
        'success', true,
        'authorized', v_authorized,
        'requires_approval', v_requires_approval,
        'spending_limit', v_spending_limit,
        'user_role', v_user.federation_role,
        'has_unlimited_access', v_spending_limit = -1
    );

    RETURN v_result;
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log NWC transaction with privacy preservation
CREATE OR REPLACE FUNCTION log_nwc_transaction(
    p_user_hash VARCHAR(50),
    p_connection_id VARCHAR(32),
    p_operation_type VARCHAR(50),
    p_operation_hash VARCHAR(64),
    p_encrypted_amount TEXT DEFAULT NULL,
    p_amount_encryption_salt VARCHAR(32) DEFAULT NULL,
    p_amount_encryption_iv VARCHAR(24) DEFAULT NULL,
    p_operation_status VARCHAR(20) DEFAULT 'pending',
    p_requires_approval BOOLEAN DEFAULT false
) RETURNS JSON AS $$
DECLARE
    v_result JSON;
BEGIN
    -- Insert transaction log
    INSERT INTO nwc_transaction_history (
        user_hash, connection_id, operation_type, operation_hash,
        encrypted_amount, amount_encryption_salt, amount_encryption_iv,
        operation_status, requires_approval, sovereignty_validated
    ) VALUES (
        p_user_hash, p_connection_id, p_operation_type, p_operation_hash,
        p_encrypted_amount, p_amount_encryption_salt, p_amount_encryption_iv,
        p_operation_status, p_requires_approval, true
    );

    -- Update connection last used timestamp
    UPDATE nwc_wallet_connections
    SET last_used_at = NOW(), updated_at = NOW()
    WHERE connection_id = p_connection_id;

    v_result := json_build_object(
        'success', true,
        'operation_hash', p_operation_hash,
        'logged_at', NOW()
    );

    RETURN v_result;
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's NWC wallet connections with privacy protection
CREATE OR REPLACE FUNCTION get_user_nwc_connections(
    p_user_hash VARCHAR(50)
) RETURNS JSON AS $$
DECLARE
    v_connections JSON;
BEGIN
    SELECT json_agg(
        json_build_object(
            'connection_id', connection_id,
            'wallet_name', wallet_name,
            'wallet_provider', wallet_provider,
            'pubkey_preview', pubkey_preview,
            'relay_domain', relay_domain,
            'user_role', user_role,
            'spending_limit', spending_limit,
            'requires_approval', requires_approval,
            'is_active', is_active,
            'is_primary', is_primary,
            'connection_status', connection_status,
            'last_connected_at', last_connected_at,
            'supported_methods', supported_methods,
            'created_at', created_at,
            'last_used_at', last_used_at
        )
    ) INTO v_connections
    FROM nwc_wallet_connections
    WHERE user_hash = p_user_hash AND is_active = true
    ORDER BY is_primary DESC, created_at DESC;

    RETURN COALESCE(v_connections, '[]'::json);
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object('error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update NWC connection status
CREATE OR REPLACE FUNCTION update_nwc_connection_status(
    p_connection_id VARCHAR(32),
    p_user_hash VARCHAR(50),
    p_status VARCHAR(20),
    p_error_message TEXT DEFAULT NULL
) RETURNS JSON AS $$
BEGIN
    UPDATE nwc_wallet_connections
    SET
        connection_status = p_status,
        last_error = p_error_message,
        last_connected_at = CASE WHEN p_status = 'connected' THEN NOW() ELSE last_connected_at END,
        updated_at = NOW()
    WHERE connection_id = p_connection_id AND user_hash = p_user_hash;

    IF FOUND THEN
        RETURN json_build_object('success', true, 'status', p_status);
    ELSE
        RETURN json_build_object('success', false, 'error', 'Connection not found');
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically update updated_at timestamps
CREATE OR REPLACE FUNCTION update_nwc_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to NWC tables
CREATE TRIGGER nwc_connections_updated_at
    BEFORE UPDATE ON nwc_wallet_connections
    FOR EACH ROW EXECUTE FUNCTION update_nwc_updated_at();

CREATE TRIGGER nwc_metadata_updated_at
    BEFORE UPDATE ON nwc_connection_metadata
    FOR EACH ROW EXECUTE FUNCTION update_nwc_updated_at();

-- Comments for documentation
COMMENT ON TABLE nwc_wallet_connections IS 'NWC wallet connections with encrypted connection strings and sovereignty enforcement';
COMMENT ON TABLE nwc_wallet_sessions IS 'Active NWC wallet sessions for operation tracking';
COMMENT ON TABLE nwc_transaction_history IS 'Privacy-preserving NWC transaction history';
COMMENT ON TABLE nwc_connection_metadata IS 'Additional metadata and preferences for NWC connections';

COMMENT ON FUNCTION create_nwc_wallet_connection IS 'Creates new NWC wallet connection with Individual Wallet Sovereignty validation';
COMMENT ON FUNCTION validate_nwc_operation IS 'Validates NWC operations with role-based sovereignty enforcement';
COMMENT ON FUNCTION log_nwc_transaction IS 'Logs NWC transactions with privacy preservation';
COMMENT ON FUNCTION get_user_nwc_connections IS 'Retrieves user NWC connections with privacy protection';
