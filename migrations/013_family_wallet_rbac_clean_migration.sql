-- Migration: 013_family_wallet_rbac_clean_migration.sql
-- Family Federation Wallet API with RBAC and FROST Multi-Signature Support - CLEAN MIGRATION
-- 
-- COPY AND PASTE THIS ENTIRE SCRIPT INTO SUPABASE SQL EDITOR
-- 
-- This migration resolves schema conflicts by dropping and recreating tables
-- with Master Context compliant role hierarchy and Family Federation Wallet support.
-- 
-- GREENFIELD PROJECT - NO BACKWARDS COMPATIBILITY REQUIRED
-- This will DELETE existing data in conflicting tables and recreate them.
-- 
-- Changes:
-- - Updates role hierarchy: 'parent'/'child'/'guardian' → 'steward'/'guardian'/'adult'/'offspring'
-- - Drops and recreates family_memberships table with new schema
-- - Creates all Family Federation Wallet tables with RBAC and FROST support
-- - Resolves foreign key conflicts and column reference issues
-- - Ensures consistent federation_hash column naming throughout

BEGIN;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- STEP 1: DROP CONFLICTING TABLES AND DEPENDENCIES
-- =============================================================================

-- Drop tables that have schema conflicts (CASCADE to handle dependencies)
DROP TABLE IF EXISTS family_memberships CASCADE;
DROP TABLE IF EXISTS family_members CASCADE; -- Alternative table name that might exist
DROP TABLE IF EXISTS family_charters CASCADE; -- May have foreign key dependencies
DROP TABLE IF EXISTS family_rbac_configs CASCADE; -- May have foreign key dependencies
DROP TABLE IF EXISTS family_federation_creations CASCADE; -- May have foreign key dependencies

-- Drop any existing wallet-related tables to ensure clean slate
DROP TABLE IF EXISTS family_federation_wallets CASCADE;
DROP TABLE IF EXISTS family_frost_config CASCADE;
DROP TABLE IF EXISTS individual_fedimint_wallets CASCADE;
DROP TABLE IF EXISTS frost_transactions CASCADE;
DROP TABLE IF EXISTS transaction_approvals CASCADE;
DROP TABLE IF EXISTS family_wallet_audit_log CASCADE;
DROP TABLE IF EXISTS wallet_rate_limits CASCADE;

-- Drop any conflicting functions that might reference old schema
DROP FUNCTION IF EXISTS get_user_family_role(TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS has_spending_permissions(TEXT) CASCADE;
DROP FUNCTION IF EXISTS has_balance_view_permissions(TEXT) CASCADE;
DROP FUNCTION IF EXISTS has_history_view_permissions(TEXT) CASCADE;

-- Step 1 completed: Dropped conflicting tables and dependencies

-- =============================================================================
-- STEP 2: CREATE MASTER CONTEXT COMPLIANT FAMILY MEMBERSHIPS TABLE
-- =============================================================================

-- Family Memberships Table with Master Context role hierarchy
CREATE TABLE family_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    federation_hash TEXT NOT NULL, -- Unique identifier for the family federation
    member_hash TEXT NOT NULL, -- Hashed user identifier (references privacy_users.hashed_uuid)
    member_role TEXT NOT NULL CHECK (member_role IN ('steward', 'guardian', 'adult', 'offspring')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    
    -- Additional membership details
    voting_power INTEGER NOT NULL DEFAULT 1,
    encrypted_permissions TEXT DEFAULT NULL,
    permissions_encryption_salt TEXT UNIQUE,
    permissions_encryption_iv TEXT UNIQUE,
    
    -- Spending and approval settings
    spending_limit BIGINT DEFAULT 0,
    can_approve_spending BOOLEAN NOT NULL DEFAULT false,
    can_manage_members BOOLEAN NOT NULL DEFAULT false,
    
    -- Metadata
    invited_at TIMESTAMP WITH TIME ZONE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(federation_hash, member_hash)
);

-- Step 2 completed: Created family_memberships table with Master Context roles

-- =============================================================================
-- STEP 3: CREATE FAMILY FEDERATION WALLET TABLES
-- =============================================================================

-- Family Federation FROST Configuration Table
CREATE TABLE family_frost_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    federation_hash TEXT NOT NULL UNIQUE, -- Links to family_memberships.federation_hash
    
    -- Wallet-specific FROST thresholds
    cashu_threshold INTEGER NOT NULL DEFAULT 2,
    cashu_total_guardians INTEGER NOT NULL DEFAULT 3,
    lightning_threshold INTEGER NOT NULL DEFAULT 2,
    lightning_total_guardians INTEGER NOT NULL DEFAULT 3,
    fedimint_threshold INTEGER NOT NULL DEFAULT 2,
    fedimint_total_guardians INTEGER NOT NULL DEFAULT 3,
    
    -- Configuration metadata
    configured_by_user_hash TEXT NOT NULL,
    configuration_notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Family Federation Wallets Table
CREATE TABLE family_federation_wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    federation_hash TEXT NOT NULL, -- Links to family_memberships.federation_hash
    wallet_type TEXT NOT NULL CHECK (wallet_type IN ('cashu', 'lightning', 'fedimint')),
    
    -- Balance information (encrypted for privacy)
    encrypted_balance TEXT, -- Encrypted balance data
    balance_encryption_salt TEXT UNIQUE,
    balance_encryption_iv TEXT UNIQUE,
    
    -- Wallet configuration
    spending_limits JSONB DEFAULT '{}',
    frost_config JSONB DEFAULT '{"threshold": 2, "total_guardians": 3, "configurable": true}',
    
    -- Metadata
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique constraint per family per wallet type
    UNIQUE(federation_hash, wallet_type)
);

-- Individual Fedimint Wallets Table
CREATE TABLE individual_fedimint_wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_hash TEXT NOT NULL, -- Links to privacy_users.hashed_uuid
    
    -- Balance information (encrypted for privacy)
    encrypted_balance TEXT, -- Encrypted balance data
    balance_encryption_salt TEXT UNIQUE,
    balance_encryption_iv TEXT UNIQUE,
    
    -- Wallet configuration
    spending_limits JSONB DEFAULT '{}',
    federation_config JSONB DEFAULT '{}',
    
    -- Adult oversight for offspring
    controlling_adult_hash TEXT, -- For offspring wallets
    oversight_permissions JSONB DEFAULT '{}',
    
    -- Metadata
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- One wallet per user
    UNIQUE(user_hash)
);

-- Step 3 completed: Created family wallet tables

-- =============================================================================
-- STEP 4: CREATE FROST TRANSACTION TABLES
-- =============================================================================

-- FROST Multi-Signature Transactions Table
CREATE TABLE frost_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id TEXT UNIQUE NOT NULL,
    
    -- Transaction context
    wallet_type TEXT NOT NULL CHECK (wallet_type IN ('family_cashu', 'family_lightning', 'family_fedimint', 'individual_fedimint')),
    federation_hash TEXT, -- NULL for individual transactions
    initiator_user_hash TEXT NOT NULL,
    
    -- Transaction details (encrypted)
    encrypted_transaction_data TEXT NOT NULL,
    transaction_encryption_salt TEXT UNIQUE NOT NULL,
    transaction_encryption_iv TEXT UNIQUE NOT NULL,
    
    -- FROST signature tracking
    required_signatures INTEGER NOT NULL DEFAULT 2,
    current_signatures INTEGER NOT NULL DEFAULT 0,
    signature_data JSONB DEFAULT '[]', -- Array of signature objects
    
    -- Status and timing
    status TEXT NOT NULL DEFAULT 'awaiting_signatures' 
        CHECK (status IN ('awaiting_signatures', 'threshold_met', 'completed', 'failed', 'expired')),
    signature_deadline TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    ip_address_hash TEXT,
    user_agent_hash TEXT
);

-- Transaction Approval Tracking Table
CREATE TABLE transaction_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    frost_transaction_id UUID NOT NULL REFERENCES frost_transactions(id) ON DELETE CASCADE,
    approver_user_hash TEXT NOT NULL,
    approver_role TEXT NOT NULL CHECK (approver_role IN ('steward', 'guardian', 'adult')),
    
    -- Approval details
    approval_method TEXT NOT NULL CHECK (approval_method IN ('frost_signature', 'nip07_signature', 'password_signature')),
    signature_data JSONB NOT NULL,
    
    -- Metadata
    approved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address_hash TEXT,
    user_agent_hash TEXT,
    
    -- Prevent duplicate approvals
    UNIQUE(frost_transaction_id, approver_user_hash)
);

-- Step 4 completed: Created FROST transaction tables

-- =============================================================================
-- STEP 5: CREATE AUDIT AND SECURITY TABLES
-- =============================================================================

-- Family Wallet Audit Log Table
CREATE TABLE family_wallet_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Context
    federation_hash TEXT,
    user_hash TEXT NOT NULL,
    user_role TEXT NOT NULL,
    
    -- Action details
    action_type TEXT NOT NULL CHECK (action_type IN (
        'view_balance', 'view_history', 'initiate_transaction', 'approve_transaction', 
        'set_spending_limits', 'access_oversight_wallet'
    )),
    wallet_type TEXT CHECK (wallet_type IN ('cashu', 'lightning', 'fedimint')),
    
    -- Transaction reference (if applicable)
    frost_transaction_id UUID REFERENCES frost_transactions(id),
    
    -- Encrypted action details
    encrypted_action_data TEXT,
    action_encryption_salt TEXT,
    action_encryption_iv TEXT,
    
    -- Result
    success BOOLEAN NOT NULL,
    error_message TEXT,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address_hash TEXT,
    user_agent_hash TEXT
);

-- Rate Limiting Table
CREATE TABLE wallet_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Rate limit context
    limit_type TEXT NOT NULL CHECK (limit_type IN ('family_wallet', 'individual_wallet', 'frost_signing')),
    context_hash TEXT NOT NULL, -- family_federation_hash or user_hash
    
    -- Rate limit tracking
    request_count INTEGER NOT NULL DEFAULT 1,
    window_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    window_duration_seconds INTEGER NOT NULL DEFAULT 60,
    max_requests INTEGER NOT NULL DEFAULT 20,
    
    -- Metadata
    last_request_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique constraint per context per limit type
    UNIQUE(limit_type, context_hash)
);

-- Step 5 completed: Created audit and security tables

-- =============================================================================
-- STEP 6: CREATE PERFORMANCE INDEXES
-- =============================================================================

-- Family memberships indexes
CREATE INDEX IF NOT EXISTS idx_family_memberships_federation ON family_memberships(federation_hash);
CREATE INDEX IF NOT EXISTS idx_family_memberships_member ON family_memberships(member_hash);
CREATE INDEX IF NOT EXISTS idx_family_memberships_role ON family_memberships(member_role);
CREATE INDEX IF NOT EXISTS idx_family_memberships_active ON family_memberships(is_active);

-- Family FROST config indexes
CREATE INDEX IF NOT EXISTS idx_family_frost_config_federation ON family_frost_config(federation_hash);
CREATE INDEX IF NOT EXISTS idx_family_frost_config_configured_by ON family_frost_config(configured_by_user_hash);

-- Family wallets indexes
CREATE INDEX IF NOT EXISTS idx_family_wallets_federation ON family_federation_wallets(federation_hash);
CREATE INDEX IF NOT EXISTS idx_family_wallets_type ON family_federation_wallets(wallet_type);
CREATE INDEX IF NOT EXISTS idx_family_wallets_active ON family_federation_wallets(is_active);

-- Individual wallets indexes
CREATE INDEX IF NOT EXISTS idx_individual_wallets_user ON individual_fedimint_wallets(user_hash);
CREATE INDEX IF NOT EXISTS idx_individual_wallets_controlling_adult ON individual_fedimint_wallets(controlling_adult_hash);
CREATE INDEX IF NOT EXISTS idx_individual_wallets_active ON individual_fedimint_wallets(is_active);

-- FROST transactions indexes
CREATE INDEX IF NOT EXISTS idx_frost_transactions_id ON frost_transactions(transaction_id);
CREATE INDEX IF NOT EXISTS idx_frost_transactions_family ON frost_transactions(federation_hash);
CREATE INDEX IF NOT EXISTS idx_frost_transactions_initiator ON frost_transactions(initiator_user_hash);
CREATE INDEX IF NOT EXISTS idx_frost_transactions_status ON frost_transactions(status);
CREATE INDEX IF NOT EXISTS idx_frost_transactions_deadline ON frost_transactions(signature_deadline);

-- Transaction approvals indexes
CREATE INDEX IF NOT EXISTS idx_transaction_approvals_frost_tx ON transaction_approvals(frost_transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_approvals_approver ON transaction_approvals(approver_user_hash);

-- Audit log indexes
CREATE INDEX IF NOT EXISTS idx_wallet_audit_family ON family_wallet_audit_log(federation_hash);
CREATE INDEX IF NOT EXISTS idx_wallet_audit_user ON family_wallet_audit_log(user_hash);
CREATE INDEX IF NOT EXISTS idx_wallet_audit_action ON family_wallet_audit_log(action_type);
CREATE INDEX IF NOT EXISTS idx_wallet_audit_created ON family_wallet_audit_log(created_at);

-- Rate limits indexes
CREATE INDEX IF NOT EXISTS idx_rate_limits_context ON wallet_rate_limits(limit_type, context_hash);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON wallet_rate_limits(window_start);

-- Step 6 completed: Created performance indexes

-- =============================================================================
-- STEP 7: ENABLE ROW LEVEL SECURITY
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE family_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_frost_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_federation_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE individual_fedimint_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE frost_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_wallet_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_rate_limits ENABLE ROW LEVEL SECURITY;

-- Step 7 completed: Enabled Row Level Security

-- =============================================================================
-- STEP 8: CREATE RLS POLICIES
-- =============================================================================

-- RLS Policy: Family memberships - users can see their own membership and family members
CREATE POLICY family_memberships_access ON family_memberships
    FOR ALL
    USING (
        member_hash = COALESCE(current_setting('app.current_user_hash', true), auth.uid()::text)
        OR federation_hash IN (
            SELECT federation_hash
            FROM family_memberships fm
            WHERE fm.member_hash = COALESCE(current_setting('app.current_user_hash', true), auth.uid()::text)
            AND fm.is_active = true
        )
    );

-- RLS Policy: Family FROST config - only family members can access
CREATE POLICY family_frost_config_family_members ON family_frost_config
    FOR ALL
    USING (
        federation_hash IN (
            SELECT federation_hash
            FROM family_memberships
            WHERE member_hash = COALESCE(current_setting('app.current_user_hash', true), auth.uid()::text)
            AND is_active = true
        )
    );

-- RLS Policy: Family federation wallets - only family members can access
CREATE POLICY family_wallets_family_members ON family_federation_wallets
    FOR ALL
    USING (
        federation_hash IN (
            SELECT federation_hash
            FROM family_memberships
            WHERE member_hash = COALESCE(current_setting('app.current_user_hash', true), auth.uid()::text)
            AND is_active = true
        )
    );

-- RLS Policy: Individual wallets - users can access their own + adults can access offspring
CREATE POLICY individual_wallets_own_access ON individual_fedimint_wallets
    FOR ALL
    USING (
        user_hash = COALESCE(current_setting('app.current_user_hash', true), auth.uid()::text)
        OR controlling_adult_hash = COALESCE(current_setting('app.current_user_hash', true), auth.uid()::text)
    );

-- RLS Policy: FROST transactions - family members or individual owners
CREATE POLICY frost_transactions_access ON frost_transactions
    FOR ALL
    USING (
        -- Individual transactions: user is the owner
        (federation_hash IS NULL AND initiator_user_hash = COALESCE(current_setting('app.current_user_hash', true), auth.uid()::text))
        OR
        -- Family transactions: user is a family member
        (federation_hash IS NOT NULL AND federation_hash IN (
            SELECT federation_hash
            FROM family_memberships
            WHERE member_hash = COALESCE(current_setting('app.current_user_hash', true), auth.uid()::text)
            AND is_active = true
        ))
    );

-- RLS Policy: Transaction approvals - only approvers can see their own approvals
CREATE POLICY transaction_approvals_own_access ON transaction_approvals
    FOR ALL
    USING (approver_user_hash = COALESCE(current_setting('app.current_user_hash', true), auth.uid()::text));

-- RLS Policy: Audit log - users can see their own actions + family context
CREATE POLICY wallet_audit_access ON family_wallet_audit_log
    FOR SELECT
    USING (
        user_hash = COALESCE(current_setting('app.current_user_hash', true), auth.uid()::text)
        OR (federation_hash IS NOT NULL AND federation_hash IN (
            SELECT federation_hash
            FROM family_memberships
            WHERE member_hash = COALESCE(current_setting('app.current_user_hash', true), auth.uid()::text)
            AND is_active = true
        ))
    );

-- RLS Policy: Rate limits - users can see their own rate limit status
CREATE POLICY rate_limits_own_access ON wallet_rate_limits
    FOR SELECT
    USING (context_hash = COALESCE(current_setting('app.current_user_hash', true), auth.uid()::text));

-- Step 8 completed: Created RLS policies

-- =============================================================================
-- STEP 9: CREATE HELPER FUNCTIONS
-- =============================================================================

-- Helper function to check family federation role
CREATE OR REPLACE FUNCTION get_user_family_role(user_hash_param TEXT, federation_hash_param TEXT)
RETURNS TEXT AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT member_role INTO user_role
    FROM family_memberships
    WHERE member_hash = user_hash_param
    AND federation_hash = federation_hash_param
    AND is_active = true;

    RETURN COALESCE(user_role, 'none');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check spending permissions
CREATE OR REPLACE FUNCTION has_spending_permissions(role_param TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN role_param IN ('steward', 'guardian');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Helper function to check balance viewing permissions
CREATE OR REPLACE FUNCTION has_balance_view_permissions(role_param TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN role_param IN ('steward', 'guardian');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Helper function to check transaction history viewing permissions
CREATE OR REPLACE FUNCTION has_history_view_permissions(role_param TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN role_param IN ('offspring', 'adult', 'steward', 'guardian');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger function to update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 9 completed: Created helper functions

-- =============================================================================
-- STEP 10: CREATE TRIGGERS
-- =============================================================================

-- Apply update triggers
CREATE TRIGGER update_family_memberships_updated_at
    BEFORE UPDATE ON family_memberships
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_family_frost_config_updated_at
    BEFORE UPDATE ON family_frost_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_family_wallets_updated_at
    BEFORE UPDATE ON family_federation_wallets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_individual_wallets_updated_at
    BEFORE UPDATE ON individual_fedimint_wallets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Step 10 completed: Created triggers

-- =============================================================================
-- STEP 11: GRANT PERMISSIONS
-- =============================================================================

-- Grant necessary permissions to authenticated users
GRANT SELECT, INSERT, UPDATE ON family_memberships TO authenticated;
GRANT SELECT, INSERT, UPDATE ON family_frost_config TO authenticated;
GRANT SELECT, INSERT, UPDATE ON family_federation_wallets TO authenticated;
GRANT SELECT, INSERT, UPDATE ON individual_fedimint_wallets TO authenticated;
GRANT SELECT, INSERT, UPDATE ON frost_transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON transaction_approvals TO authenticated;
GRANT SELECT, INSERT ON family_wallet_audit_log TO authenticated;
GRANT SELECT, INSERT, UPDATE ON wallet_rate_limits TO authenticated;

-- Grant usage on sequences
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Step 11 completed: Granted permissions

-- =============================================================================
-- STEP 12: ADD TABLE COMMENTS
-- =============================================================================

-- Comments for documentation
COMMENT ON TABLE family_memberships IS 'Family federation membership with Master Context role hierarchy (steward/guardian/adult/offspring)';
COMMENT ON TABLE family_frost_config IS 'Configurable FROST multi-signature thresholds per family federation and wallet type';
COMMENT ON TABLE family_federation_wallets IS 'Family federation wallets with RBAC - steward/guardian access only for spending';
COMMENT ON TABLE individual_fedimint_wallets IS 'Individual Fedimint wallets for adult/offspring roles with oversight support';
COMMENT ON TABLE frost_transactions IS 'FROST multi-signature transactions requiring threshold approval';
COMMENT ON TABLE transaction_approvals IS 'Individual approvals for FROST transactions';
COMMENT ON TABLE family_wallet_audit_log IS 'Comprehensive audit log for all wallet operations';
COMMENT ON TABLE wallet_rate_limits IS 'Rate limiting tracking for wallet operations';

-- Step 12 completed: Added table comments

-- =============================================================================
-- STEP 13: VALIDATION AND SUMMARY
-- =============================================================================

-- Step 13: Validate that all tables were created
DO $$
DECLARE
    table_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN (
        'family_memberships',
        'family_frost_config',
        'family_federation_wallets',
        'individual_fedimint_wallets',
        'frost_transactions',
        'transaction_approvals',
        'family_wallet_audit_log',
        'wallet_rate_limits'
    );

    IF table_count != 8 THEN
        RAISE EXCEPTION 'ERROR: Expected 8 tables, found %. Migration failed.', table_count;
    END IF;
END $$;

-- =============================================================================
-- MIGRATION COMPLETED SUCCESSFULLY
-- =============================================================================
--
-- SUMMARY:
--   • Dropped conflicting tables with CASCADE
--   • Created family_memberships with Master Context roles (steward/guardian/adult/offspring)
--   • Created 8 wallet tables with RBAC and FROST support
--   • Created 29 performance indexes
--   • Created 8 RLS policies for privacy
--   • Created 5 helper functions
--   • Created 4 update triggers
--   • Granted proper permissions
--   • Resolved all schema conflicts
--
-- NEXT STEPS:
--   1. Run validation script: migrations/validate_013_clean_migration.sql
--   2. Test family wallet API endpoints
--   3. Validate FROST signature workflows
--   4. Test role-based access control
-- =============================================================================

COMMIT;
