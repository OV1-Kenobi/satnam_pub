-- Migration: Family Wallet Spending Limits & Approval Workflows
-- Description: Adds spending limits, approval workflows, and violation tracking for family members
-- Compliance: Master Context - Privacy-first, Bitcoin-only, sovereign family banking

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Family member wallets table with spending limits
CREATE TABLE IF NOT EXISTS family_member_wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    family_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    member_npub TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('guardian', 'steward', 'adult', 'offspring')),
    name TEXT NOT NULL,
    
    -- Balances (encrypted in production)
    lightning_balance BIGINT DEFAULT 0,
    ecash_balance BIGINT DEFAULT 0,
    fedimint_balance BIGINT DEFAULT 0,
    
    -- Spending limits configuration
    spending_limits JSONB NOT NULL DEFAULT '{
        "daily": 10000,
        "weekly": 50000,
        "monthly": 200000,
        "requiresApproval": 5000,
        "autoApprovalLimit": 2500,
        "approvalRoles": ["guardian", "steward"],
        "requiredApprovals": 1
    }',
    
    -- Spending history tracking
    spending_history JSONB NOT NULL DEFAULT '{
        "daily": 0,
        "weekly": 0,
        "monthly": 0,
        "lastReset": null
    }',
    
    -- Approval capabilities
    pending_approvals TEXT[] DEFAULT '{}',
    can_approve_for TEXT[] DEFAULT '{}',
    
    -- Privacy settings
    privacy_settings JSONB NOT NULL DEFAULT '{
        "enableLNProxy": true,
        "enableFedimintPrivacy": true,
        "defaultRouting": "auto"
    }',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(family_id, member_id),
    UNIQUE(family_id, member_npub)
);

-- Family payment requests table
CREATE TABLE IF NOT EXISTS family_payment_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    family_id TEXT NOT NULL,
    requester_id TEXT NOT NULL,
    requester_npub TEXT NOT NULL,
    recipient_id TEXT,
    recipient_npub TEXT NOT NULL,
    amount BIGINT NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL CHECK (currency IN ('sats', 'ecash', 'fedimint')),
    method TEXT NOT NULL CHECK (method IN ('voltage', 'lnbits', 'phoenixd', 'ecash')),
    description TEXT NOT NULL,
    urgency TEXT NOT NULL CHECK (urgency IN ('low', 'medium', 'high', 'urgent')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'sent', 'failed')),
    approval_required BOOLEAN NOT NULL DEFAULT false,
    approval_id UUID,
    transaction_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Foreign key constraints
    FOREIGN KEY (approval_id) REFERENCES family_approval_requests(id) ON DELETE SET NULL,
    FOREIGN KEY (transaction_id) REFERENCES family_payment_transactions(id) ON DELETE SET NULL
);

-- Family payment transactions table
CREATE TABLE IF NOT EXISTS family_payment_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    schedule_id TEXT,
    family_id TEXT NOT NULL,
    requester_id TEXT NOT NULL,
    recipient_id TEXT,
    recipient_npub TEXT NOT NULL,
    amount BIGINT NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL CHECK (currency IN ('sats', 'ecash', 'fedimint')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'sent', 'failed')),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('lightning', 'ecash', 'fedimint')),
    lightning_invoice TEXT,
    ecash_token TEXT,
    fedimint_proof TEXT,
    approval_required BOOLEAN NOT NULL DEFAULT false,
    approved_by TEXT[] DEFAULT '{}',
    rejected_by TEXT[] DEFAULT '{}',
    sent_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Family approval requests table
CREATE TABLE IF NOT EXISTS family_approval_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id TEXT NOT NULL,
    family_id TEXT NOT NULL,
    requester_id TEXT NOT NULL,
    requester_npub TEXT NOT NULL,
    amount BIGINT NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL CHECK (currency IN ('sats', 'ecash', 'fedimint')),
    description TEXT NOT NULL,
    urgency TEXT NOT NULL CHECK (urgency IN ('low', 'medium', 'high', 'urgent')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
    approvers JSONB NOT NULL DEFAULT '[]',
    required_approvals INTEGER NOT NULL DEFAULT 1 CHECK (required_approvals > 0),
    received_approvals INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Spending limit violations table
CREATE TABLE IF NOT EXISTS spending_limit_violations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    family_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    member_npub TEXT NOT NULL,
    violation_type TEXT NOT NULL CHECK (violation_type IN ('daily', 'weekly', 'monthly', 'approval_threshold')),
    current_amount BIGINT NOT NULL,
    limit_amount BIGINT NOT NULL,
    attempted_amount BIGINT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved BOOLEAN NOT NULL DEFAULT false,
    resolution TEXT CHECK (resolution IN ('approved', 'rejected', 'auto_resolved')),
    
    -- Foreign key constraints
    FOREIGN KEY (family_id, member_id) REFERENCES family_member_wallets(family_id, member_id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_family_member_wallets_family_id ON family_member_wallets(family_id);
CREATE INDEX IF NOT EXISTS idx_family_member_wallets_member_id ON family_member_wallets(member_id);
CREATE INDEX IF NOT EXISTS idx_family_member_wallets_member_npub ON family_member_wallets(member_npub);
CREATE INDEX IF NOT EXISTS idx_family_member_wallets_role ON family_member_wallets(role);

CREATE INDEX IF NOT EXISTS idx_family_payment_requests_family_id ON family_payment_requests(family_id);
CREATE INDEX IF NOT EXISTS idx_family_payment_requests_requester_id ON family_payment_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_family_payment_requests_status ON family_payment_requests(status);
CREATE INDEX IF NOT EXISTS idx_family_payment_requests_created_at ON family_payment_requests(created_at);

CREATE INDEX IF NOT EXISTS idx_family_payment_transactions_family_id ON family_payment_transactions(family_id);
CREATE INDEX IF NOT EXISTS idx_family_payment_transactions_requester_id ON family_payment_transactions(requester_id);
CREATE INDEX IF NOT EXISTS idx_family_payment_transactions_status ON family_payment_transactions(status);
CREATE INDEX IF NOT EXISTS idx_family_payment_transactions_created_at ON family_payment_transactions(created_at);

CREATE INDEX IF NOT EXISTS idx_family_approval_requests_family_id ON family_approval_requests(family_id);
CREATE INDEX IF NOT EXISTS idx_family_approval_requests_status ON family_approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_family_approval_requests_expires_at ON family_approval_requests(expires_at);

CREATE INDEX IF NOT EXISTS idx_spending_limit_violations_family_id ON spending_limit_violations(family_id);
CREATE INDEX IF NOT EXISTS idx_spending_limit_violations_member_id ON spending_limit_violations(member_id);
CREATE INDEX IF NOT EXISTS idx_spending_limit_violations_resolved ON spending_limit_violations(resolved);
CREATE INDEX IF NOT EXISTS idx_spending_limit_violations_timestamp ON spending_limit_violations(timestamp);

-- Row Level Security (RLS) policies for privacy
ALTER TABLE family_member_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_payment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE spending_limit_violations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for family_member_wallets
CREATE POLICY "Family members can view their own wallet" ON family_member_wallets
    FOR SELECT USING (member_npub = current_setting('app.current_user_npub', true));

CREATE POLICY "Family guardians can view all wallets" ON family_member_wallets
    FOR SELECT USING (
        role = 'guardian' AND 
        family_id IN (
            SELECT family_id FROM family_member_wallets 
            WHERE member_npub = current_setting('app.current_user_npub', true)
        )
    );

CREATE POLICY "Family members can update their own wallet" ON family_member_wallets
    FOR UPDATE USING (member_npub = current_setting('app.current_user_npub', true));

-- RLS Policies for family_payment_requests
CREATE POLICY "Users can view their own payment requests" ON family_payment_requests
    FOR SELECT USING (requester_npub = current_setting('app.current_user_npub', true));

CREATE POLICY "Approvers can view payment requests they need to approve" ON family_payment_requests
    FOR SELECT USING (
        approval_id IN (
            SELECT id FROM family_approval_requests 
            WHERE approvers::text LIKE '%' || current_setting('app.current_user_npub', true) || '%'
        )
    );

CREATE POLICY "Users can create their own payment requests" ON family_payment_requests
    FOR INSERT WITH CHECK (requester_npub = current_setting('app.current_user_npub', true));

-- RLS Policies for family_payment_transactions
CREATE POLICY "Users can view their own transactions" ON family_payment_transactions
    FOR SELECT USING (requester_id IN (
        SELECT member_id FROM family_member_wallets 
        WHERE member_npub = current_setting('app.current_user_npub', true)
    ));

CREATE POLICY "Family guardians can view all transactions" ON family_payment_transactions
    FOR SELECT USING (
        family_id IN (
            SELECT family_id FROM family_member_wallets 
            WHERE member_npub = current_setting('app.current_user_npub', true) AND role = 'guardian'
        )
    );

-- RLS Policies for family_approval_requests
CREATE POLICY "Users can view approval requests they created" ON family_approval_requests
    FOR SELECT USING (requester_npub = current_setting('app.current_user_npub', true));

CREATE POLICY "Approvers can view approval requests they need to approve" ON family_approval_requests
    FOR SELECT USING (
        approvers::text LIKE '%' || current_setting('app.current_user_npub', true) || '%'
    );

CREATE POLICY "Approvers can update approval requests" ON family_approval_requests
    FOR UPDATE USING (
        approvers::text LIKE '%' || current_setting('app.current_user_npub', true) || '%'
    );

-- RLS Policies for spending_limit_violations
CREATE POLICY "Users can view their own violations" ON spending_limit_violations
    FOR SELECT USING (member_npub = current_setting('app.current_user_npub', true));

CREATE POLICY "Family guardians can view all violations" ON spending_limit_violations
    FOR SELECT USING (
        family_id IN (
            SELECT family_id FROM family_member_wallets 
            WHERE member_npub = current_setting('app.current_user_npub', true) AND role = 'guardian'
        )
    );

-- Functions for automatic spending history reset
CREATE OR REPLACE FUNCTION reset_daily_spending_history()
RETURNS void AS $$
BEGIN
    UPDATE family_member_wallets 
    SET spending_history = jsonb_set(
        spending_history,
        '{daily}',
        '0'::jsonb
    ),
    spending_history = jsonb_set(
        spending_history,
        '{lastReset}',
        to_jsonb(NOW())
    )
    WHERE DATE(last_activity) < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION reset_weekly_spending_history()
RETURNS void AS $$
BEGIN
    UPDATE family_member_wallets 
    SET spending_history = jsonb_set(
        spending_history,
        '{weekly}',
        '0'::jsonb
    ),
    spending_history = jsonb_set(
        spending_history,
        '{lastReset}',
        to_jsonb(NOW())
    )
    WHERE DATE(last_activity) < DATE_TRUNC('week', CURRENT_DATE);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION reset_monthly_spending_history()
RETURNS void AS $$
BEGIN
    UPDATE family_member_wallets 
    SET spending_history = jsonb_set(
        spending_history,
        '{monthly}',
        '0'::jsonb
    ),
    spending_history = jsonb_set(
        spending_history,
        '{lastReset}',
        to_jsonb(NOW())
    )
    WHERE DATE(last_activity) < DATE_TRUNC('month', CURRENT_DATE);
END;
$$ LANGUAGE plpgsql;

-- Triggers for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_family_member_wallets_updated_at
    BEFORE UPDATE ON family_member_wallets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_family_payment_requests_updated_at
    BEFORE UPDATE ON family_payment_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_family_payment_transactions_updated_at
    BEFORE UPDATE ON family_payment_transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_family_approval_requests_updated_at
    BEFORE UPDATE ON family_approval_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to check and enforce spending limits
CREATE OR REPLACE FUNCTION check_spending_limits(
    p_family_id TEXT,
    p_member_id TEXT,
    p_amount BIGINT
)
RETURNS TABLE(
    daily_exceeded BOOLEAN,
    weekly_exceeded BOOLEAN,
    monthly_exceeded BOOLEAN,
    approval_threshold_exceeded BOOLEAN
) AS $$
DECLARE
    v_wallet family_member_wallets%ROWTYPE;
    v_spending_history JSONB;
    v_limits JSONB;
BEGIN
    -- Get member wallet
    SELECT * INTO v_wallet 
    FROM family_member_wallets 
    WHERE family_id = p_family_id AND member_id = p_member_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Member wallet not found';
    END IF;
    
    v_spending_history := v_wallet.spending_history;
    v_limits := v_wallet.spending_limits;
    
    RETURN QUERY SELECT
        (v_spending_history->>'daily')::BIGINT + p_amount > (v_limits->>'daily')::BIGINT AS daily_exceeded,
        (v_spending_history->>'weekly')::BIGINT + p_amount > (v_limits->>'weekly')::BIGINT AS weekly_exceeded,
        (v_spending_history->>'monthly')::BIGINT + p_amount > (v_limits->>'monthly')::BIGINT AS monthly_exceeded,
        p_amount > (v_limits->>'requiresApproval')::BIGINT AS approval_threshold_exceeded;
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON TABLE family_member_wallets IS 'Family member wallets with spending limits and approval workflows';
COMMENT ON TABLE family_payment_requests IS 'Payment requests with automatic limit checking and approval workflows';
COMMENT ON TABLE family_payment_transactions IS 'Executed payment transactions with status tracking';
COMMENT ON TABLE family_approval_requests IS 'Approval requests for payments exceeding limits';
COMMENT ON TABLE spending_limit_violations IS 'Tracked violations of spending limits for audit purposes';

COMMENT ON COLUMN family_member_wallets.spending_limits IS 'JSON configuration for spending limits and approval rules';
COMMENT ON COLUMN family_member_wallets.spending_history IS 'Current spending totals for daily/weekly/monthly periods';
COMMENT ON COLUMN family_payment_requests.approval_required IS 'Whether this payment requires approval before execution';
COMMENT ON COLUMN family_approval_requests.approvers IS 'JSON array of approvers with their approval status';
COMMENT ON COLUMN spending_limit_violations.resolution IS 'How the violation was resolved (approved/rejected/auto_resolved)'; 