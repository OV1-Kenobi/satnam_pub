-- Migration: 020_emergency_recovery_system.sql
-- Emergency Recovery System for Satnam.pub
-- Implements multi-sig based, password, and Shamir Secret Sharing (SSS) 
-- account recovery and emergency liquidity protocols

-- Emergency Recovery Requests
CREATE TABLE IF NOT EXISTS emergency_recovery_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    user_npub TEXT NOT NULL,
    user_role VARCHAR(20) NOT NULL CHECK (user_role IN ('private', 'offspring', 'adult', 'steward', 'guardian')),
    request_type VARCHAR(50) NOT NULL CHECK (request_type IN ('nsec_recovery', 'ecash_recovery', 'emergency_liquidity', 'account_restoration')),
    reason VARCHAR(50) NOT NULL CHECK (reason IN ('lost_key', 'compromised_key', 'emergency_funds', 'account_lockout', 'guardian_request')),
    urgency VARCHAR(20) NOT NULL CHECK (urgency IN ('low', 'medium', 'high', 'critical')),
    description TEXT NOT NULL,
    requested_amount INTEGER, -- For emergency liquidity (in sats)
    recovery_method VARCHAR(50) NOT NULL CHECK (recovery_method IN ('password', 'multisig', 'shamir', 'guardian_consensus')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'expired')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    approved_by TEXT[] DEFAULT '{}', -- Array of guardian npubs
    rejected_by TEXT[] DEFAULT '{}', -- Array of guardian npubs
    consensus_threshold INTEGER NOT NULL DEFAULT 2,
    required_approvals INTEGER NOT NULL DEFAULT 2,
    current_approvals INTEGER NOT NULL DEFAULT 0,
    current_rejections INTEGER NOT NULL DEFAULT 0,
    
    -- Metadata for audit trail
    family_id TEXT,
    federation_hash VARCHAR(32),
    metadata JSONB DEFAULT '{}',
    
    -- Constraints
    CONSTRAINT emergency_recovery_requests_valid_amount CHECK (
        (request_type = 'emergency_liquidity' AND requested_amount IS NOT NULL AND requested_amount > 0) OR
        (request_type != 'emergency_liquidity' AND requested_amount IS NULL)
    ),
    CONSTRAINT emergency_recovery_requests_valid_expiry CHECK (expires_at > created_at),
    CONSTRAINT emergency_recovery_requests_valid_approvals CHECK (
        current_approvals >= 0 AND 
        current_rejections >= 0 AND 
        (current_approvals + current_rejections) <= required_approvals
    )
);

-- Guardian Approvals
CREATE TABLE IF NOT EXISTS guardian_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recovery_request_id UUID NOT NULL REFERENCES emergency_recovery_requests(id) ON DELETE CASCADE,
    guardian_npub TEXT NOT NULL,
    guardian_role VARCHAR(20) NOT NULL CHECK (guardian_role IN ('steward', 'guardian')),
    approval VARCHAR(20) NOT NULL CHECK (approval IN ('approved', 'rejected', 'abstained')),
    reason TEXT,
    signature TEXT NOT NULL, -- Cryptographic signature of approval
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    ip_address INET, -- For audit trail
    user_agent TEXT, -- For audit trail
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Constraints
    CONSTRAINT guardian_approvals_unique_per_request UNIQUE (recovery_request_id, guardian_npub)
);

-- Recovery Actions (executed recoveries)
CREATE TABLE IF NOT EXISTS recovery_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recovery_request_id UUID NOT NULL REFERENCES emergency_recovery_requests(id) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL CHECK (action_type IN ('nsec_restored', 'ecash_restored', 'liquidity_released', 'account_restored')),
    performed_by TEXT NOT NULL, -- Guardian npub who performed the action
    details JSONB NOT NULL DEFAULT '{}',
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    success BOOLEAN NOT NULL DEFAULT true,
    error_message TEXT,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'
);

-- Emergency Logs (audit trail)
CREATE TABLE IF NOT EXISTS emergency_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN (
        'recovery_requested', 'guardian_approved', 'guardian_rejected', 
        'recovery_completed', 'recovery_failed', 'consensus_reached',
        'request_expired', 'guardian_notified', 'recovery_initiated'
    )),
    user_id TEXT NOT NULL,
    user_npub TEXT NOT NULL,
    user_role VARCHAR(20) NOT NULL CHECK (user_role IN ('private', 'offspring', 'adult', 'steward', 'guardian')),
    guardian_npub TEXT, -- Optional, for guardian actions
    guardian_role VARCHAR(20) CHECK (guardian_role IN ('steward', 'guardian')),
    details JSONB NOT NULL DEFAULT '{}',
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    severity VARCHAR(20) NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
    
    -- Metadata
    metadata JSONB DEFAULT '{}'
);

-- Recovery Configurations (per family)
CREATE TABLE IF NOT EXISTS recovery_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id TEXT NOT NULL UNIQUE,
    federation_hash VARCHAR(32) NOT NULL,
    total_guardians INTEGER NOT NULL DEFAULT 3,
    consensus_threshold INTEGER NOT NULL DEFAULT 2,
    emergency_threshold INTEGER NOT NULL DEFAULT 1,
    recovery_timeout_hours INTEGER NOT NULL DEFAULT 24,
    max_recovery_attempts INTEGER NOT NULL DEFAULT 3,
    current_attempts INTEGER NOT NULL DEFAULT 0,
    last_recovery_attempt TIMESTAMP WITH TIME ZONE,
    emergency_liquidity_limit INTEGER NOT NULL DEFAULT 1000000, -- 1M sats
    require_guardian_consensus BOOLEAN NOT NULL DEFAULT true,
    allow_password_recovery BOOLEAN NOT NULL DEFAULT true,
    allow_multisig_recovery BOOLEAN NOT NULL DEFAULT true,
    allow_shamir_recovery BOOLEAN NOT NULL DEFAULT true,
    auto_expire_requests BOOLEAN NOT NULL DEFAULT true,
    log_all_actions BOOLEAN NOT NULL DEFAULT true,
    
    -- Guardian configuration
    guardian_npubs TEXT[] NOT NULL DEFAULT '{}',
    steward_npubs TEXT[] NOT NULL DEFAULT '{}',
    
    -- Created/Updated
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT recovery_configurations_valid_thresholds CHECK (
        consensus_threshold > 0 AND 
        consensus_threshold <= total_guardians AND
        emergency_threshold > 0 AND 
        emergency_threshold <= consensus_threshold
    ),
    CONSTRAINT recovery_configurations_valid_limits CHECK (
        recovery_timeout_hours > 0 AND 
        max_recovery_attempts > 0 AND 
        emergency_liquidity_limit > 0
    )
);

-- Shamir Secret Shares (for SSS recovery)
CREATE TABLE IF NOT EXISTS shamir_secret_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recovery_request_id UUID NOT NULL REFERENCES emergency_recovery_requests(id) ON DELETE CASCADE,
    share_index INTEGER NOT NULL,
    guardian_npub TEXT NOT NULL,
    encrypted_share TEXT NOT NULL, -- Encrypted with guardian's public key
    share_hash TEXT NOT NULL, -- Hash for verification
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    used_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Constraints
    CONSTRAINT shamir_shares_unique_per_request UNIQUE (recovery_request_id, share_index),
    CONSTRAINT shamir_shares_valid_index CHECK (share_index > 0)
);

-- Multi-sig Recovery Sessions
CREATE TABLE IF NOT EXISTS multisig_recovery_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recovery_request_id UUID NOT NULL REFERENCES emergency_recovery_requests(id) ON DELETE CASCADE,
    session_key TEXT NOT NULL UNIQUE, -- Unique session identifier
    required_signatures INTEGER NOT NULL DEFAULT 2,
    current_signatures INTEGER NOT NULL DEFAULT 0,
    guardian_signatures JSONB NOT NULL DEFAULT '{}', -- Map of guardian_npub -> signature
    session_data JSONB NOT NULL DEFAULT '{}', -- Encrypted session data
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'expired', 'failed')),
    
    -- Constraints
    CONSTRAINT multisig_sessions_valid_signatures CHECK (
        current_signatures >= 0 AND 
        current_signatures <= required_signatures
    ),
    CONSTRAINT multisig_sessions_valid_expiry CHECK (expires_at > created_at)
);

-- Password Recovery Attempts (rate limiting)
CREATE TABLE IF NOT EXISTS password_recovery_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    user_npub TEXT NOT NULL,
    attempt_hash TEXT NOT NULL, -- Hash of the password attempt
    success BOOLEAN NOT NULL DEFAULT false,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Metadata
    metadata JSONB DEFAULT '{}'
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_emergency_recovery_requests_user_id ON emergency_recovery_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_emergency_recovery_requests_status ON emergency_recovery_requests(status);
CREATE INDEX IF NOT EXISTS idx_emergency_recovery_requests_created_at ON emergency_recovery_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_emergency_recovery_requests_expires_at ON emergency_recovery_requests(expires_at);
CREATE INDEX IF NOT EXISTS idx_emergency_recovery_requests_user_role ON emergency_recovery_requests(user_role);
CREATE INDEX IF NOT EXISTS idx_emergency_recovery_requests_request_type ON emergency_recovery_requests(request_type);

CREATE INDEX IF NOT EXISTS idx_guardian_approvals_recovery_request_id ON guardian_approvals(recovery_request_id);
CREATE INDEX IF NOT EXISTS idx_guardian_approvals_guardian_npub ON guardian_approvals(guardian_npub);
CREATE INDEX IF NOT EXISTS idx_guardian_approvals_timestamp ON guardian_approvals(timestamp);

CREATE INDEX IF NOT EXISTS idx_recovery_actions_recovery_request_id ON recovery_actions(recovery_request_id);
CREATE INDEX IF NOT EXISTS idx_recovery_actions_performed_by ON recovery_actions(performed_by);
CREATE INDEX IF NOT EXISTS idx_recovery_actions_timestamp ON recovery_actions(timestamp);

CREATE INDEX IF NOT EXISTS idx_emergency_logs_user_id ON emergency_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_emergency_logs_event_type ON emergency_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_emergency_logs_timestamp ON emergency_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_emergency_logs_severity ON emergency_logs(severity);
CREATE INDEX IF NOT EXISTS idx_emergency_logs_guardian_npub ON emergency_logs(guardian_npub);

CREATE INDEX IF NOT EXISTS idx_recovery_configurations_family_id ON recovery_configurations(family_id);
CREATE INDEX IF NOT EXISTS idx_recovery_configurations_federation_hash ON recovery_configurations(federation_hash);

CREATE INDEX IF NOT EXISTS idx_shamir_secret_shares_recovery_request_id ON shamir_secret_shares(recovery_request_id);
CREATE INDEX IF NOT EXISTS idx_shamir_secret_shares_guardian_npub ON shamir_secret_shares(guardian_npub);

CREATE INDEX IF NOT EXISTS idx_multisig_recovery_sessions_recovery_request_id ON multisig_recovery_sessions(recovery_request_id);
CREATE INDEX IF NOT EXISTS idx_multisig_recovery_sessions_session_key ON multisig_recovery_sessions(session_key);
CREATE INDEX IF NOT EXISTS idx_multisig_recovery_sessions_status ON multisig_recovery_sessions(status);

CREATE INDEX IF NOT EXISTS idx_password_recovery_attempts_user_id ON password_recovery_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_password_recovery_attempts_timestamp ON password_recovery_attempts(timestamp);

-- Row Level Security (RLS) Policies

-- Emergency Recovery Requests RLS
ALTER TABLE emergency_recovery_requests ENABLE ROW LEVEL SECURITY;

-- Users can view their own recovery requests
CREATE POLICY "Users can view own recovery requests" ON emergency_recovery_requests
    FOR SELECT USING (auth.uid()::text = user_id);

-- Guardians can view all recovery requests in their family
CREATE POLICY "Guardians can view family recovery requests" ON emergency_recovery_requests
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM recovery_configurations rc
            WHERE rc.family_id = emergency_recovery_requests.family_id
            AND (
                emergency_recovery_requests.user_npub = ANY(rc.guardian_npubs) OR
                emergency_recovery_requests.user_npub = ANY(rc.steward_npubs)
            )
        )
    );

-- Users can create their own recovery requests
CREATE POLICY "Users can create own recovery requests" ON emergency_recovery_requests
    FOR INSERT WITH CHECK (auth.uid()::text = user_id);

-- Guardians can update recovery requests they're involved with
CREATE POLICY "Guardians can update recovery requests" ON emergency_recovery_requests
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM recovery_configurations rc
            WHERE rc.family_id = emergency_recovery_requests.family_id
            AND (
                emergency_recovery_requests.user_npub = ANY(rc.guardian_npubs) OR
                emergency_recovery_requests.user_npub = ANY(rc.steward_npubs)
            )
        )
    );

-- Guardian Approvals RLS
ALTER TABLE guardian_approvals ENABLE ROW LEVEL SECURITY;

-- Guardians can view their own approvals
CREATE POLICY "Guardians can view own approvals" ON guardian_approvals
    FOR SELECT USING (guardian_npub = (
        SELECT npub FROM profiles WHERE id = auth.uid()::text
    ));

-- Guardians can create their own approvals
CREATE POLICY "Guardians can create own approvals" ON guardian_approvals
    FOR INSERT WITH CHECK (guardian_npub = (
        SELECT npub FROM profiles WHERE id = auth.uid()::text
    ));

-- Recovery Actions RLS
ALTER TABLE recovery_actions ENABLE ROW LEVEL SECURITY;

-- Guardians can view recovery actions they performed
CREATE POLICY "Guardians can view own recovery actions" ON recovery_actions
    FOR SELECT USING (performed_by = (
        SELECT npub FROM profiles WHERE id = auth.uid()::text
    ));

-- Guardians can create recovery actions
CREATE POLICY "Guardians can create recovery actions" ON recovery_actions
    FOR INSERT WITH CHECK (performed_by = (
        SELECT npub FROM profiles WHERE id = auth.uid()::text
    ));

-- Emergency Logs RLS
ALTER TABLE emergency_logs ENABLE ROW LEVEL SECURITY;

-- Users can view logs related to their actions
CREATE POLICY "Users can view own emergency logs" ON emergency_logs
    FOR SELECT USING (user_id = auth.uid()::text);

-- Guardians can view all logs in their family
CREATE POLICY "Guardians can view family emergency logs" ON emergency_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM recovery_configurations rc
            WHERE rc.family_id = (
                SELECT family_id FROM emergency_recovery_requests 
                WHERE id::text = emergency_logs.details->>'recoveryRequestId'
            )
            AND (
                emergency_logs.user_npub = ANY(rc.guardian_npubs) OR
                emergency_logs.user_npub = ANY(rc.steward_npubs)
            )
        )
    );

-- System can create emergency logs
CREATE POLICY "System can create emergency logs" ON emergency_logs
    FOR INSERT WITH CHECK (true);

-- Recovery Configurations RLS
ALTER TABLE recovery_configurations ENABLE ROW LEVEL SECURITY;

-- Family members can view their family's recovery configuration
CREATE POLICY "Family members can view recovery configuration" ON recovery_configurations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.family_id = recovery_configurations.family_id
            AND p.id = auth.uid()::text
        )
    );

-- Guardians can update their family's recovery configuration
CREATE POLICY "Guardians can update recovery configuration" ON recovery_configurations
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.family_id = recovery_configurations.family_id
            AND p.id = auth.uid()::text
            AND p.federation_role IN ('steward', 'guardian')
        )
    );

-- Shamir Secret Shares RLS
ALTER TABLE shamir_secret_shares ENABLE ROW LEVEL SECURITY;

-- Guardians can view their own shares
CREATE POLICY "Guardians can view own shamir shares" ON shamir_secret_shares
    FOR SELECT USING (guardian_npub = (
        SELECT npub FROM profiles WHERE id = auth.uid()::text
    ));

-- System can create shamir shares
CREATE POLICY "System can create shamir shares" ON shamir_secret_shares
    FOR INSERT WITH CHECK (true);

-- Multi-sig Recovery Sessions RLS
ALTER TABLE multisig_recovery_sessions ENABLE ROW LEVEL SECURITY;

-- Guardians can view sessions they're involved with
CREATE POLICY "Guardians can view multisig sessions" ON multisig_recovery_sessions
    FOR SELECT USING (
        guardian_signatures ? (
            SELECT npub FROM profiles WHERE id = auth.uid()::text
        )
    );

-- System can create and update multisig sessions
CREATE POLICY "System can manage multisig sessions" ON multisig_recovery_sessions
    FOR ALL USING (true);

-- Password Recovery Attempts RLS
ALTER TABLE password_recovery_attempts ENABLE ROW LEVEL SECURITY;

-- Users can view their own recovery attempts
CREATE POLICY "Users can view own password recovery attempts" ON password_recovery_attempts
    FOR SELECT USING (user_id = auth.uid()::text);

-- System can create password recovery attempts
CREATE POLICY "System can create password recovery attempts" ON password_recovery_attempts
    FOR INSERT WITH CHECK (true);

-- Functions for emergency recovery operations

-- Function to create a new recovery configuration
CREATE OR REPLACE FUNCTION create_recovery_configuration(
    p_family_id TEXT,
    p_federation_hash VARCHAR(32),
    p_total_guardians INTEGER DEFAULT 3,
    p_consensus_threshold INTEGER DEFAULT 2,
    p_emergency_threshold INTEGER DEFAULT 1,
    p_guardian_npubs TEXT[] DEFAULT '{}',
    p_steward_npubs TEXT[] DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    config_id UUID;
BEGIN
    INSERT INTO recovery_configurations (
        family_id,
        federation_hash,
        total_guardians,
        consensus_threshold,
        emergency_threshold,
        guardian_npubs,
        steward_npubs
    ) VALUES (
        p_family_id,
        p_federation_hash,
        p_total_guardians,
        p_consensus_threshold,
        p_emergency_threshold,
        p_guardian_npubs,
        p_steward_npubs
    ) RETURNING id INTO config_id;
    
    RETURN config_id;
END;
$$;

-- Function to check if user can initiate recovery
CREATE OR REPLACE FUNCTION can_initiate_recovery(
    p_user_id TEXT,
    p_request_type TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_role VARCHAR(20);
BEGIN
    SELECT federation_role INTO user_role
    FROM profiles
    WHERE id = p_user_id;
    
    -- Guardians and stewards can initiate any recovery
    IF user_role IN ('guardian', 'steward') THEN
        RETURN true;
    END IF;
    
    -- Adults can initiate most recoveries except emergency liquidity
    IF user_role = 'adult' AND p_request_type != 'emergency_liquidity' THEN
        RETURN true;
    END IF;
    
    -- Offspring can initiate basic recoveries
    IF user_role = 'offspring' AND p_request_type IN ('nsec_recovery', 'ecash_recovery', 'account_restoration') THEN
        RETURN true;
    END IF;
    
    RETURN false;
END;
$$;

-- Function to calculate required approvals
CREATE OR REPLACE FUNCTION calculate_required_approvals(
    p_user_role VARCHAR(20),
    p_urgency TEXT,
    p_family_id TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    base_threshold INTEGER;
    required_approvals INTEGER;
BEGIN
    -- Get family configuration
    SELECT consensus_threshold INTO base_threshold
    FROM recovery_configurations
    WHERE family_id = p_family_id;
    
    -- Adjust based on user role
    CASE p_user_role
        WHEN 'guardian' THEN
            base_threshold := CEIL(base_threshold * 0.5);
        WHEN 'steward' THEN
            base_threshold := CEIL(base_threshold * 0.75);
        WHEN 'adult' THEN
            base_threshold := CEIL(base_threshold * 0.9);
        WHEN 'offspring' THEN
            base_threshold := base_threshold; -- Full threshold
        ELSE
            base_threshold := base_threshold;
    END CASE;
    
    -- Adjust based on urgency
    CASE p_urgency
        WHEN 'critical' THEN
            base_threshold := CEIL(base_threshold * 0.8);
        WHEN 'high' THEN
            base_threshold := CEIL(base_threshold * 0.9);
        WHEN 'low' THEN
            base_threshold := CEIL(base_threshold * 1.1);
        ELSE
            -- No adjustment for medium
            NULL;
    END CASE;
    
    -- Ensure minimum of 2 and maximum of total guardians
    SELECT GREATEST(2, LEAST(base_threshold, total_guardians)) INTO required_approvals
    FROM recovery_configurations
    WHERE family_id = p_family_id;
    
    RETURN required_approvals;
END;
$$;

-- Function to check recovery attempt limits
CREATE OR REPLACE FUNCTION check_recovery_attempts(
    p_user_id TEXT,
    p_hours_back INTEGER DEFAULT 24
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    attempt_count INTEGER;
    max_attempts INTEGER;
BEGIN
    -- Get user's recent recovery attempts
    SELECT COUNT(*) INTO attempt_count
    FROM emergency_recovery_requests
    WHERE user_id = p_user_id
    AND created_at >= NOW() - INTERVAL '1 hour' * p_hours_back;
    
    -- Get max attempts from family configuration
    SELECT COALESCE(rc.max_recovery_attempts, 3) INTO max_attempts
    FROM profiles p
    LEFT JOIN recovery_configurations rc ON p.family_id = rc.family_id
    WHERE p.id = p_user_id;
    
    RETURN attempt_count < max_attempts;
END;
$$;

-- Function to expire old recovery requests
CREATE OR REPLACE FUNCTION expire_old_recovery_requests()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    UPDATE emergency_recovery_requests
    SET status = 'expired'
    WHERE status = 'pending'
    AND expires_at < NOW();
    
    GET DIAGNOSTICS expired_count = ROW_COUNT;
    
    -- Log expired requests
    INSERT INTO emergency_logs (event_type, user_id, user_npub, user_role, details, severity)
    SELECT 
        'request_expired',
        user_id,
        user_npub,
        user_role,
        jsonb_build_object('requestId', id, 'expiredAt', expires_at),
        'warning'
    FROM emergency_recovery_requests
    WHERE status = 'expired'
    AND expires_at < NOW();
    
    RETURN expired_count;
END;
$$;

-- Function to get recovery statistics
CREATE OR REPLACE FUNCTION get_recovery_statistics(
    p_family_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    stats JSONB;
BEGIN
    SELECT jsonb_build_object(
        'total_requests', COUNT(*),
        'pending_requests', COUNT(*) FILTER (WHERE status = 'pending'),
        'approved_requests', COUNT(*) FILTER (WHERE status = 'approved'),
        'completed_requests', COUNT(*) FILTER (WHERE status = 'completed'),
        'rejected_requests', COUNT(*) FILTER (WHERE status = 'rejected'),
        'expired_requests', COUNT(*) FILTER (WHERE status = 'expired'),
        'requests_by_type', jsonb_object_agg(
            request_type, 
            COUNT(*) FILTER (WHERE request_type = request_type)
        ),
        'requests_by_urgency', jsonb_object_agg(
            urgency, 
            COUNT(*) FILTER (WHERE urgency = urgency)
        ),
        'average_approval_time', AVG(
            EXTRACT(EPOCH FROM (completed_at - created_at)) / 3600
        ) FILTER (WHERE status = 'completed'),
        'success_rate', (
            COUNT(*) FILTER (WHERE status = 'completed')::FLOAT / 
            NULLIF(COUNT(*) FILTER (WHERE status IN ('completed', 'rejected')), 0)
        ) * 100
    ) INTO stats
    FROM emergency_recovery_requests
    WHERE (p_family_id IS NULL OR family_id = p_family_id);
    
    RETURN stats;
END;
$$;

-- Create a scheduled job to expire old requests (if using pg_cron)
-- SELECT cron.schedule('expire-recovery-requests', '0 * * * *', 'SELECT expire_old_recovery_requests();');

-- Comments for documentation
COMMENT ON TABLE emergency_recovery_requests IS 'Stores emergency recovery requests with RBAC-based approval workflow';
COMMENT ON TABLE guardian_approvals IS 'Stores guardian approvals/rejections of recovery requests with cryptographic signatures';
COMMENT ON TABLE recovery_actions IS 'Audit trail of executed recovery actions';
COMMENT ON TABLE emergency_logs IS 'Comprehensive audit trail of all emergency recovery events';
COMMENT ON TABLE recovery_configurations IS 'Family-specific recovery configuration and guardian management';
COMMENT ON TABLE shamir_secret_shares IS 'Shamir Secret Sharing shares for distributed key recovery';
COMMENT ON TABLE multisig_recovery_sessions IS 'Multi-signature recovery sessions for collaborative key recovery';
COMMENT ON TABLE password_recovery_attempts IS 'Rate limiting and audit trail for password-based recovery attempts';

COMMENT ON FUNCTION create_recovery_configuration IS 'Creates a new recovery configuration for a family federation';
COMMENT ON FUNCTION can_initiate_recovery IS 'Checks if a user can initiate a specific type of recovery based on their role';
COMMENT ON FUNCTION calculate_required_approvals IS 'Calculates required guardian approvals based on user role and urgency';
COMMENT ON FUNCTION check_recovery_attempts IS 'Checks if user has exceeded recovery attempt limits';
COMMENT ON FUNCTION expire_old_recovery_requests IS 'Expires old recovery requests and logs the expiration';
COMMENT ON FUNCTION get_recovery_statistics IS 'Returns comprehensive recovery statistics for monitoring and analysis'; 