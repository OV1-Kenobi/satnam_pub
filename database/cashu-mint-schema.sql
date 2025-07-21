-- Cashu Mint Database Schema for Master Context Compliance
-- This schema supports Individual Wallet Sovereignty and privacy-first architecture

-- Enable Row Level Security for all tables
ALTER DATABASE postgres SET row_security = on;

-- Cashu Keysets table (NUTS-01, NUTS-02)
CREATE TABLE cashu_keysets (
    id TEXT PRIMARY KEY,
    unit TEXT NOT NULL DEFAULT 'sat',
    active BOOLEAN NOT NULL DEFAULT true,
    valid_from TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    valid_to TIMESTAMP WITH TIME ZONE,
    public_keys JSONB NOT NULL, -- Map of amount -> public key
    private_keys_encrypted TEXT, -- Vault-encrypted private keys
    fee_structure JSONB, -- Fee configuration per amount
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Mint quotes for Lightning payments (NUTS-04)
CREATE TABLE cashu_mint_quotes (
    quote TEXT PRIMARY KEY,
    method TEXT NOT NULL DEFAULT 'bolt11',
    request TEXT NOT NULL, -- Lightning invoice
    checking_id TEXT NOT NULL, -- Lightning payment hash
    unit TEXT NOT NULL DEFAULT 'sat',
    amount INTEGER NOT NULL,
    fee_paid INTEGER DEFAULT 0,
    paid BOOLEAN NOT NULL DEFAULT false,
    issued BOOLEAN NOT NULL DEFAULT false,
    user_id TEXT, -- Privacy-preserving user identifier
    user_role TEXT CHECK (user_role IN ('private', 'offspring', 'adult', 'steward', 'guardian')),
    sovereignty_validated BOOLEAN NOT NULL DEFAULT false,
    requires_approval BOOLEAN NOT NULL DEFAULT false,
    guardian_approved BOOLEAN DEFAULT false,
    guardian_id TEXT, -- For offspring approval workflows
    created_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    paid_time TIMESTAMP WITH TIME ZONE,
    issued_time TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes')
);

-- Melt quotes for Lightning payments (NUTS-05)
CREATE TABLE cashu_melt_quotes (
    quote TEXT PRIMARY KEY,
    method TEXT NOT NULL DEFAULT 'bolt11',
    request TEXT NOT NULL, -- Lightning payment request
    checking_id TEXT NOT NULL, -- Lightning payment hash
    unit TEXT NOT NULL DEFAULT 'sat',
    amount INTEGER NOT NULL,
    fee_reserve INTEGER NOT NULL,
    fee_paid INTEGER DEFAULT 0,
    paid BOOLEAN NOT NULL DEFAULT false,
    user_id TEXT, -- Privacy-preserving user identifier
    user_role TEXT CHECK (user_role IN ('private', 'offspring', 'adult', 'steward', 'guardian')),
    sovereignty_validated BOOLEAN NOT NULL DEFAULT false,
    requires_approval BOOLEAN NOT NULL DEFAULT false,
    guardian_approved BOOLEAN DEFAULT false,
    guardian_id TEXT, -- For offspring approval workflows
    created_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    paid_time TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes')
);

-- Cashu proofs/tokens (NUTS-00, NUTS-07)
CREATE TABLE cashu_proofs (
    id SERIAL PRIMARY KEY,
    amount INTEGER NOT NULL,
    keyset_id TEXT NOT NULL REFERENCES cashu_keysets(id),
    secret TEXT NOT NULL, -- Hashed for privacy
    c_point TEXT NOT NULL, -- Commitment point (public)
    witness TEXT, -- For spending conditions (NUTS-10, NUTS-11)
    y_point TEXT, -- For P2PK conditions (NUTS-11)
    dleq_proof JSONB, -- DLEQ proof for verification (NUTS-12)
    reserved BOOLEAN NOT NULL DEFAULT false,
    reserved_until TIMESTAMP WITH TIME ZONE,
    spent BOOLEAN NOT NULL DEFAULT false,
    user_id TEXT, -- Privacy-preserving user identifier
    user_role TEXT CHECK (user_role IN ('private', 'offspring', 'adult', 'steward', 'guardian')),
    mint_quote_id TEXT REFERENCES cashu_mint_quotes(quote),
    bearer_instrument_id TEXT, -- Link to bearer instruments
    created_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    spent_date TIMESTAMP WITH TIME ZONE,
    
    -- Ensure no double spending
    UNIQUE(secret, keyset_id),
    
    -- Index for performance
    INDEX idx_cashu_proofs_secret (secret),
    INDEX idx_cashu_proofs_spent (spent),
    INDEX idx_cashu_proofs_user (user_id),
    INDEX idx_cashu_proofs_keyset (keyset_id)
);

-- Bearer instruments with Cashu integration
CREATE TABLE cashu_bearer_instruments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL, -- Privacy-preserving user identifier
    user_role TEXT NOT NULL CHECK (user_role IN ('private', 'offspring', 'adult', 'steward', 'guardian')),
    amount INTEGER NOT NULL,
    form_factor TEXT NOT NULL CHECK (form_factor IN ('qr', 'nfc', 'dm', 'physical')),
    cashu_tokens JSONB NOT NULL, -- Array of Cashu proof objects
    token_secrets TEXT[], -- Array of token secrets for redemption
    qr_code_data TEXT, -- QR code for tokens
    nfc_data JSONB, -- NFC tag data
    dm_message_id TEXT, -- Gift-wrapped message ID for DM delivery
    dm_recipient_npub TEXT, -- Recipient npub (hashed for privacy)
    redeemed BOOLEAN NOT NULL DEFAULT false,
    redeemed_by TEXT, -- Privacy-preserving redeemer identifier
    sovereignty_validated BOOLEAN NOT NULL DEFAULT false,
    requires_approval BOOLEAN NOT NULL DEFAULT false,
    guardian_approved BOOLEAN DEFAULT false,
    guardian_id TEXT, -- For offspring approval workflows
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    redeemed_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '30 days'),
    
    -- Index for performance
    INDEX idx_bearer_user (user_id),
    INDEX idx_bearer_redeemed (redeemed),
    INDEX idx_bearer_form_factor (form_factor)
);

-- Swap operations (NUTS-03)
CREATE TABLE cashu_swaps (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_role TEXT NOT NULL CHECK (user_role IN ('private', 'offspring', 'adult', 'steward', 'guardian')),
    input_proofs JSONB NOT NULL, -- Array of input proof objects
    output_proofs JSONB NOT NULL, -- Array of output proof objects
    fee_paid INTEGER DEFAULT 0,
    completed BOOLEAN NOT NULL DEFAULT false,
    sovereignty_validated BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Index for performance
    INDEX idx_swaps_user (user_id),
    INDEX idx_swaps_completed (completed)
);

-- Cross-mint operations for atomic swaps
CREATE TABLE cashu_cross_mint_swaps (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_role TEXT NOT NULL CHECK (user_role IN ('private', 'offspring', 'adult', 'steward', 'guardian')),
    source_mint_url TEXT NOT NULL,
    target_mint_url TEXT NOT NULL,
    source_tokens JSONB NOT NULL,
    target_tokens JSONB,
    amount INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'expired')),
    atomic_swap_id TEXT, -- Link to atomic swap bridge
    sovereignty_validated BOOLEAN NOT NULL DEFAULT false,
    requires_approval BOOLEAN NOT NULL DEFAULT false,
    guardian_approved BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '1 hour'),
    
    -- Index for performance
    INDEX idx_cross_mint_user (user_id),
    INDEX idx_cross_mint_status (status)
);

-- Audit log for sovereignty compliance
CREATE TABLE cashu_audit_log (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_role TEXT NOT NULL,
    operation TEXT NOT NULL, -- mint, melt, swap, bearer_create, etc.
    amount INTEGER,
    sovereignty_status JSONB NOT NULL, -- Full sovereignty validation result
    guardian_approval_required BOOLEAN NOT NULL DEFAULT false,
    guardian_id TEXT,
    guardian_approved_at TIMESTAMP WITH TIME ZONE,
    operation_data_hash TEXT, -- Privacy-preserving operation hash
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Index for auditing
    INDEX idx_audit_user (user_id),
    INDEX idx_audit_operation (operation),
    INDEX idx_audit_created (created_at)
);

-- Row Level Security Policies for privacy and sovereignty

-- Keysets: Only mint operators can access
ALTER TABLE cashu_keysets ENABLE ROW LEVEL SECURITY;
CREATE POLICY cashu_keysets_policy ON cashu_keysets
    FOR ALL TO authenticated
    USING (auth.jwt() ->> 'role' = 'mint_operator');

-- Mint quotes: Users can only see their own quotes
ALTER TABLE cashu_mint_quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY cashu_mint_quotes_policy ON cashu_mint_quotes
    FOR ALL TO authenticated
    USING (user_id = auth.jwt() ->> 'user_id');

-- Melt quotes: Users can only see their own quotes
ALTER TABLE cashu_melt_quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY cashu_melt_quotes_policy ON cashu_melt_quotes
    FOR ALL TO authenticated
    USING (user_id = auth.jwt() ->> 'user_id');

-- Proofs: Users can only see their own proofs
ALTER TABLE cashu_proofs ENABLE ROW LEVEL SECURITY;
CREATE POLICY cashu_proofs_policy ON cashu_proofs
    FOR ALL TO authenticated
    USING (user_id = auth.jwt() ->> 'user_id');

-- Bearer instruments: Users can only see their own instruments
ALTER TABLE cashu_bearer_instruments ENABLE ROW LEVEL SECURITY;
CREATE POLICY cashu_bearer_policy ON cashu_bearer_instruments
    FOR ALL TO authenticated
    USING (user_id = auth.jwt() ->> 'user_id');

-- Functions for sovereignty validation
CREATE OR REPLACE FUNCTION validate_cashu_sovereignty(
    p_user_role TEXT,
    p_operation TEXT,
    p_amount INTEGER
) RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    -- Individual Wallet Sovereignty validation
    IF p_user_role IN ('private', 'adult', 'steward', 'guardian') THEN
        result := jsonb_build_object(
            'authorized', true,
            'spending_limit', -1,
            'has_unlimited_access', true,
            'requires_approval', false,
            'message', 'Sovereign role with unlimited Cashu authority'
        );
    ELSIF p_user_role = 'offspring' THEN
        result := jsonb_build_object(
            'authorized', p_amount <= 25000,
            'spending_limit', 25000,
            'has_unlimited_access', false,
            'requires_approval', p_amount > 10000,
            'message', CASE 
                WHEN p_amount > 10000 THEN 'Cashu operation requires guardian approval'
                ELSE 'Cashu operation authorized within limits'
            END
        );
    ELSE
        result := jsonb_build_object(
            'authorized', false,
            'spending_limit', 0,
            'has_unlimited_access', false,
            'requires_approval', true,
            'message', 'Unknown role - Cashu operation not authorized'
        );
    END IF;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
