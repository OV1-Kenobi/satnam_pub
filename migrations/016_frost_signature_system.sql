-- Migration: FROST Signature System for Family Federation Multi-Signature Operations
-- Purpose: Create production-ready FROST (Flexible Round-Optimized Schnorr Threshold) signature infrastructure
-- Date: 2024-12-24
-- Version: 016

-- ============================================================================
-- TRANSACTION SAFETY: Wrap entire migration in a transaction
-- ============================================================================

BEGIN;

-- ============================================================================
-- FROST TRANSACTIONS: Core transaction management
-- ============================================================================

-- Main FROST transactions table
CREATE TABLE IF NOT EXISTS frost_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_federation_id UUID NOT NULL,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('lightning_payment', 'fedimint_spend', 'bitcoin_transaction', 'internal_transfer')),
    
    -- Transaction details
    amount BIGINT NOT NULL CHECK (amount > 0),
    recipient_address TEXT,
    description TEXT,
    transaction_data JSONB NOT NULL,
    
    -- FROST signature configuration
    required_signatures INTEGER NOT NULL CHECK (required_signatures > 0),
    signing_context TEXT NOT NULL, -- Cryptographic context for signature generation
    
    -- Status tracking
    status TEXT NOT NULL DEFAULT 'pending_signatures' CHECK (status IN ('pending_signatures', 'threshold_met', 'completed', 'failed', 'expired')),
    transaction_hash TEXT, -- Set when transaction is executed
    error_message TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    
    -- Audit trail
    created_by_duid TEXT NOT NULL,
    
    -- Constraints
    CONSTRAINT valid_completion CHECK (
        (status = 'completed' AND transaction_hash IS NOT NULL AND completed_at IS NOT NULL) OR
        (status != 'completed')
    ),
    CONSTRAINT valid_failure CHECK (
        (status = 'failed' AND error_message IS NOT NULL) OR
        (status != 'failed')
    )
);

-- ============================================================================
-- FROST TRANSACTION PARTICIPANTS: Who needs to sign
-- ============================================================================

CREATE TABLE IF NOT EXISTS frost_transaction_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES frost_transactions(id) ON DELETE CASCADE,
    participant_duid TEXT NOT NULL,
    
    -- Participant role and requirements
    role TEXT NOT NULL CHECK (role IN ('offspring', 'adult', 'steward', 'guardian')),
    signature_required BOOLEAN NOT NULL DEFAULT true,
    
    -- Signature status
    has_signed BOOLEAN NOT NULL DEFAULT false,
    signed_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Unique constraint: one record per participant per transaction
    CONSTRAINT unique_participant_transaction UNIQUE (transaction_id, participant_duid),
    
    -- Validation constraints
    CONSTRAINT valid_signature_time CHECK (
        (has_signed = true AND signed_at IS NOT NULL) OR
        (has_signed = false AND signed_at IS NULL)
    )
);

-- ============================================================================
-- FROST SIGNATURE SHARES: Individual signature contributions
-- ============================================================================

CREATE TABLE IF NOT EXISTS frost_signature_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES frost_transactions(id) ON DELETE CASCADE,
    participant_duid TEXT NOT NULL,
    
    -- Cryptographic signature data
    signature_share TEXT NOT NULL, -- The actual FROST signature share
    nonce TEXT NOT NULL, -- Cryptographic nonce used in signing
    
    -- Status and validation
    status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'validated', 'aggregated', 'invalid')),
    validation_error TEXT,
    
    -- Timestamps
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    validated_at TIMESTAMPTZ,
    
    -- Unique constraint: one signature share per participant per transaction
    CONSTRAINT unique_signature_share UNIQUE (transaction_id, participant_duid),
    
    -- Foreign key to participant
    FOREIGN KEY (transaction_id, participant_duid) 
        REFERENCES frost_transaction_participants(transaction_id, participant_duid) 
        ON DELETE CASCADE
);

-- ============================================================================
-- FROST KEY SHARES: Encrypted user key shares for signature generation
-- ============================================================================

CREATE TABLE IF NOT EXISTS frost_key_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_duid TEXT NOT NULL,
    family_federation_id UUID NOT NULL,
    
    -- Key share data (encrypted)
    encrypted_key_share TEXT NOT NULL, -- Encrypted with user's authentication context
    key_share_index INTEGER NOT NULL, -- Index in the FROST key sharing scheme
    threshold_config JSONB NOT NULL, -- Threshold signature configuration
    
    -- Status and lifecycle
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    
    -- Unique constraint: one active key share per participant per federation
    CONSTRAINT unique_active_key_share UNIQUE (participant_duid, family_federation_id, is_active)
        DEFERRABLE INITIALLY DEFERRED
);

-- ============================================================================
-- PERFORMANCE OPTIMIZATION: Indexes for Fast Lookups
-- ============================================================================

-- FROST transactions indexes
CREATE INDEX idx_frost_transactions_family_status ON frost_transactions (family_federation_id, status);
CREATE INDEX idx_frost_transactions_created_by ON frost_transactions (created_by_duid, created_at DESC);
CREATE INDEX idx_frost_transactions_expires ON frost_transactions (expires_at) WHERE expires_at IS NOT NULL;

-- Participants indexes
CREATE INDEX idx_frost_participants_transaction ON frost_transaction_participants (transaction_id, signature_required);
CREATE INDEX idx_frost_participants_duid ON frost_transaction_participants (participant_duid, has_signed);

-- Signature shares indexes
CREATE INDEX idx_frost_signatures_transaction ON frost_signature_shares (transaction_id, status);
CREATE INDEX idx_frost_signatures_participant ON frost_signature_shares (participant_duid, submitted_at DESC);

-- Key shares indexes
CREATE INDEX idx_frost_key_shares_participant ON frost_key_shares (participant_duid, is_active);
CREATE INDEX idx_frost_key_shares_federation ON frost_key_shares (family_federation_id, is_active);

-- ============================================================================
-- ROW LEVEL SECURITY: Protect FROST signature data
-- ============================================================================

-- Enable RLS on all FROST tables
ALTER TABLE frost_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE frost_transaction_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE frost_signature_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE frost_key_shares ENABLE ROW LEVEL SECURITY;

-- FROST transactions policies
CREATE POLICY "Users can view family FROST transactions" ON frost_transactions
    FOR SELECT TO authenticated
    USING (
        family_federation_id IN (
            SELECT family_federation_id 
            FROM family_members 
            WHERE user_duid = auth.uid()::text
        )
    );

CREATE POLICY "Authorized users can create FROST transactions" ON frost_transactions
    FOR INSERT TO authenticated
    WITH CHECK (
        created_by_duid = auth.uid()::text AND
        family_federation_id IN (
            SELECT family_federation_id 
            FROM family_members 
            WHERE user_duid = auth.uid()::text 
            AND role IN ('steward', 'guardian')
        )
    );

-- Participants policies
CREATE POLICY "Users can view their participation in FROST transactions" ON frost_transaction_participants
    FOR SELECT TO authenticated
    USING (
        participant_duid = auth.uid()::text OR
        transaction_id IN (
            SELECT id FROM frost_transactions 
            WHERE family_federation_id IN (
                SELECT family_federation_id 
                FROM family_members 
                WHERE user_duid = auth.uid()::text
            )
        )
    );

-- Signature shares policies
CREATE POLICY "Users can manage their own signature shares" ON frost_signature_shares
    FOR ALL TO authenticated
    USING (participant_duid = auth.uid()::text)
    WITH CHECK (participant_duid = auth.uid()::text);

-- Key shares policies (most restrictive)
CREATE POLICY "Users can only access their own key shares" ON frost_key_shares
    FOR ALL TO authenticated
    USING (participant_duid = auth.uid()::text)
    WITH CHECK (participant_duid = auth.uid()::text);

-- Service role policies for all tables
CREATE POLICY "Service role full access frost_transactions" ON frost_transactions
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access frost_participants" ON frost_transaction_participants
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access frost_signatures" ON frost_signature_shares
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access frost_key_shares" ON frost_key_shares
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ============================================================================
-- AUTOMATIC CLEANUP: Remove expired transactions
-- ============================================================================

-- Function to clean up expired FROST transactions
CREATE OR REPLACE FUNCTION cleanup_expired_frost_transactions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    -- Update expired transactions
    UPDATE frost_transactions 
    SET status = 'expired'
    WHERE status = 'pending_signatures' 
    AND expires_at IS NOT NULL 
    AND expires_at < NOW();
    
    GET DIAGNOSTICS expired_count = ROW_COUNT;
    
    IF expired_count > 0 THEN
        RAISE NOTICE 'Marked % FROST transactions as expired', expired_count;
    END IF;
    
    RETURN expired_count;
END $$;

-- ============================================================================
-- HELPER FUNCTIONS: FROST transaction management
-- ============================================================================

-- Function to check if FROST transaction threshold is met
CREATE OR REPLACE FUNCTION check_frost_threshold(transaction_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    required_sigs INTEGER;
    current_sigs INTEGER;
BEGIN
    -- Get required signatures
    SELECT required_signatures INTO required_sigs
    FROM frost_transactions
    WHERE id = transaction_uuid;
    
    IF required_sigs IS NULL THEN
        RETURN false;
    END IF;
    
    -- Count current signatures
    SELECT COUNT(*) INTO current_sigs
    FROM frost_transaction_participants
    WHERE transaction_id = transaction_uuid
    AND signature_required = true
    AND has_signed = true;
    
    RETURN current_sigs >= required_sigs;
END $$;

-- ============================================================================
-- DOCUMENTATION: Table and column comments
-- ============================================================================

COMMENT ON TABLE frost_transactions IS 'FROST multi-signature transactions for family federations';
COMMENT ON COLUMN frost_transactions.signing_context IS 'Cryptographic context used for FROST signature generation';
COMMENT ON COLUMN frost_transactions.required_signatures IS 'Minimum number of signatures required to execute transaction';

COMMENT ON TABLE frost_transaction_participants IS 'Family members who can participate in FROST transaction signing';
COMMENT ON COLUMN frost_transaction_participants.signature_required IS 'Whether this participant must sign for transaction to execute';

COMMENT ON TABLE frost_signature_shares IS 'Individual FROST signature shares from participants';
COMMENT ON COLUMN frost_signature_shares.signature_share IS 'Cryptographic signature share generated using FROST protocol';
COMMENT ON COLUMN frost_signature_shares.nonce IS 'Cryptographic nonce used in signature generation';

COMMENT ON TABLE frost_key_shares IS 'Encrypted FROST key shares for signature generation';
COMMENT ON COLUMN frost_key_shares.encrypted_key_share IS 'User key share encrypted with authentication context';
COMMENT ON COLUMN frost_key_shares.threshold_config IS 'FROST threshold signature configuration parameters';

-- ============================================================================
-- MIGRATION COMPLETION LOG
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '=== FROST SIGNATURE SYSTEM MIGRATION COMPLETED ===';
    RAISE NOTICE 'Migration 016: Production-ready FROST multi-signature infrastructure';
    RAISE NOTICE 'Date: %', NOW();
    RAISE NOTICE 'Tables: frost_transactions, frost_transaction_participants, frost_signature_shares, frost_key_shares';
    RAISE NOTICE 'Features: Multi-signature transactions, threshold signatures, encrypted key shares';
    RAISE NOTICE 'Security: Row Level Security, role-based access, audit trails';
    RAISE NOTICE 'Performance: Optimized indexes for fast lookups and queries';
    RAISE NOTICE 'Status: READY FOR PRODUCTION FROST OPERATIONS';
    RAISE NOTICE '====================================================';
END $$;

-- Commit the transaction
COMMIT;
