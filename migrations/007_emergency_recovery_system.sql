-- Emergency Recovery System Migration
-- Creates tables for emergency recovery requests, guardian approvals, and audit logs

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Emergency Recovery Requests Table
CREATE TABLE IF NOT EXISTS emergency_recovery_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(255) NOT NULL,
    user_npub VARCHAR(255) NOT NULL,
    user_role VARCHAR(50) NOT NULL,
    family_id VARCHAR(255),
    request_type VARCHAR(50) NOT NULL CHECK (request_type IN ('nsec_recovery', 'ecash_recovery', 'emergency_liquidity', 'account_restoration')),
    reason VARCHAR(50) NOT NULL CHECK (reason IN ('lost_key', 'compromised_key', 'emergency_funds', 'account_lockout', 'guardian_request')),
    urgency VARCHAR(20) NOT NULL CHECK (urgency IN ('low', 'medium', 'high', 'critical')),
    description TEXT NOT NULL,
    requested_amount BIGINT,
    recovery_method VARCHAR(50) NOT NULL CHECK (recovery_method IN ('password', 'multisig', 'shamir', 'guardian_consensus')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'expired')),
    required_approvals INTEGER NOT NULL DEFAULT 1,
    current_approvals INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    executed_at TIMESTAMP WITH TIME ZONE,
    executor_npub VARCHAR(255),
    executor_role VARCHAR(50),
    recovery_result JSONB,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Guardian Approvals Table
CREATE TABLE IF NOT EXISTS emergency_recovery_approvals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recovery_request_id UUID NOT NULL REFERENCES emergency_recovery_requests(id) ON DELETE CASCADE,
    guardian_npub VARCHAR(255) NOT NULL,
    guardian_role VARCHAR(50) NOT NULL,
    approval VARCHAR(20) NOT NULL CHECK (approval IN ('approved', 'rejected', 'abstained')),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Emergency Recovery Audit Logs Table
CREATE TABLE IF NOT EXISTS emergency_recovery_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recovery_request_id UUID REFERENCES emergency_recovery_requests(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    actor_npub VARCHAR(255) NOT NULL,
    actor_role VARCHAR(50) NOT NULL,
    details TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Recovery Backup Data Table (for storing encrypted recovery data)
CREATE TABLE IF NOT EXISTS emergency_recovery_backups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(255) NOT NULL,
    family_id VARCHAR(255),
    backup_type VARCHAR(50) NOT NULL CHECK (backup_type IN ('nsec_shares', 'ecash_proofs', 'multisig_keys', 'shamir_shares')),
    encrypted_data TEXT NOT NULL,
    encryption_method VARCHAR(50) NOT NULL DEFAULT 'aes-256-gcm',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Guardian Recovery Sessions Table (for tracking active guardian sessions)
CREATE TABLE IF NOT EXISTS guardian_recovery_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recovery_request_id UUID NOT NULL REFERENCES emergency_recovery_requests(id) ON DELETE CASCADE,
    guardian_npub VARCHAR(255) NOT NULL,
    session_token VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_emergency_recovery_requests_user_id ON emergency_recovery_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_emergency_recovery_requests_family_id ON emergency_recovery_requests(family_id);
CREATE INDEX IF NOT EXISTS idx_emergency_recovery_requests_status ON emergency_recovery_requests(status);
CREATE INDEX IF NOT EXISTS idx_emergency_recovery_requests_created_at ON emergency_recovery_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_emergency_recovery_requests_expires_at ON emergency_recovery_requests(expires_at);

CREATE INDEX IF NOT EXISTS idx_emergency_recovery_approvals_request_id ON emergency_recovery_approvals(recovery_request_id);
CREATE INDEX IF NOT EXISTS idx_emergency_recovery_approvals_guardian_npub ON emergency_recovery_approvals(guardian_npub);
CREATE INDEX IF NOT EXISTS idx_emergency_recovery_approvals_timestamp ON emergency_recovery_approvals(timestamp);

CREATE INDEX IF NOT EXISTS idx_emergency_recovery_logs_request_id ON emergency_recovery_logs(recovery_request_id);
CREATE INDEX IF NOT EXISTS idx_emergency_recovery_logs_actor_npub ON emergency_recovery_logs(actor_npub);
CREATE INDEX IF NOT EXISTS idx_emergency_recovery_logs_timestamp ON emergency_recovery_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_emergency_recovery_logs_action ON emergency_recovery_logs(action);

CREATE INDEX IF NOT EXISTS idx_emergency_recovery_backups_user_id ON emergency_recovery_backups(user_id);
CREATE INDEX IF NOT EXISTS idx_emergency_recovery_backups_family_id ON emergency_recovery_backups(family_id);
CREATE INDEX IF NOT EXISTS idx_emergency_recovery_backups_type ON emergency_recovery_backups(backup_type);
CREATE INDEX IF NOT EXISTS idx_emergency_recovery_backups_active ON emergency_recovery_backups(is_active);

CREATE INDEX IF NOT EXISTS idx_guardian_recovery_sessions_request_id ON guardian_recovery_sessions(recovery_request_id);
CREATE INDEX IF NOT EXISTS idx_guardian_recovery_sessions_guardian_npub ON guardian_recovery_sessions(guardian_npub);
CREATE INDEX IF NOT EXISTS idx_guardian_recovery_sessions_token ON guardian_recovery_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_guardian_recovery_sessions_active ON guardian_recovery_sessions(is_active);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for updated_at
CREATE TRIGGER update_emergency_recovery_requests_updated_at 
    BEFORE UPDATE ON emergency_recovery_requests 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to clean up expired recovery requests
CREATE OR REPLACE FUNCTION cleanup_expired_recovery_requests()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    UPDATE emergency_recovery_requests 
    SET status = 'expired' 
    WHERE status = 'pending' AND expires_at < NOW();
    
    GET DIAGNOSTICS expired_count = ROW_COUNT;
    
    -- Log cleanup action
    INSERT INTO emergency_recovery_logs (action, actor_npub, actor_role, details)
    VALUES ('system_cleanup', 'system', 'system', 'Expired ' || expired_count || ' recovery requests');
    
    RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- Create function to get guardian consensus status
CREATE OR REPLACE FUNCTION get_recovery_consensus_status(request_id UUID)
RETURNS TABLE(
    request_id UUID,
    total_guardians INTEGER,
    required_approvals INTEGER,
    current_approvals INTEGER,
    approval_percentage NUMERIC,
    status VARCHAR(20)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.id as request_id,
        COUNT(DISTINCT gm.npub) as total_guardians,
        r.required_approvals,
        r.current_approvals,
        CASE 
            WHEN COUNT(DISTINCT gm.npub) > 0 
            THEN ROUND((r.current_approvals::NUMERIC / COUNT(DISTINCT gm.npub)) * 100, 2)
            ELSE 0 
        END as approval_percentage,
        r.status
    FROM emergency_recovery_requests r
    LEFT JOIN family_members gm ON gm.family_id = r.family_id 
        AND gm.role IN ('guardian', 'steward') 
        AND gm.is_active = true
    WHERE r.id = request_id
    GROUP BY r.id, r.required_approvals, r.current_approvals, r.status;
END;
$$ LANGUAGE plpgsql;

-- Create function to validate recovery request permissions
CREATE OR REPLACE FUNCTION validate_recovery_permissions(
    p_user_id VARCHAR(255),
    p_family_id VARCHAR(255),
    p_user_role VARCHAR(50)
)
RETURNS BOOLEAN AS $$
DECLARE
    user_family_id VARCHAR(255);
    user_role VARCHAR(50);
BEGIN
    -- Get user's family and role
    SELECT fm.family_id, fm.role INTO user_family_id, user_role
    FROM family_members fm
    WHERE fm.user_id = p_user_id AND fm.is_active = true
    LIMIT 1;
    
    -- Check if user belongs to the family
    IF user_family_id != p_family_id THEN
        RETURN FALSE;
    END IF;
    
    -- Check role permissions
    IF p_user_role IN ('guardian', 'steward') THEN
        RETURN TRUE;
    ELSIF p_user_role = 'adult' AND user_role IN ('adult', 'guardian', 'steward') THEN
        RETURN TRUE;
    ELSIF p_user_role = 'child' AND user_role IN ('child', 'adult', 'guardian', 'steward') THEN
        RETURN TRUE;
    END IF;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Create RLS policies for emergency_recovery_requests
ALTER TABLE emergency_recovery_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own recovery requests" ON emergency_recovery_requests
    FOR SELECT USING (user_id = current_setting('app.current_user_id', true));

CREATE POLICY "Users can create their own recovery requests" ON emergency_recovery_requests
    FOR INSERT WITH CHECK (user_id = current_setting('app.current_user_id', true));

CREATE POLICY "Guardians can view family recovery requests" ON emergency_recovery_requests
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM family_members fm 
            WHERE fm.family_id = emergency_recovery_requests.family_id 
            AND fm.npub = current_setting('app.current_user_npub', true)
            AND fm.role IN ('guardian', 'steward')
            AND fm.is_active = true
        )
    );

CREATE POLICY "System can update recovery requests" ON emergency_recovery_requests
    FOR UPDATE USING (current_setting('app.current_user_role', true) = 'system');

-- Create RLS policies for emergency_recovery_approvals
ALTER TABLE emergency_recovery_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Guardians can view approvals for their family" ON emergency_recovery_approvals
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM emergency_recovery_requests r
            JOIN family_members fm ON fm.family_id = r.family_id
            WHERE r.id = emergency_recovery_approvals.recovery_request_id
            AND fm.npub = current_setting('app.current_user_npub', true)
            AND fm.role IN ('guardian', 'steward')
            AND fm.is_active = true
        )
    );

CREATE POLICY "Guardians can create approvals" ON emergency_recovery_approvals
    FOR INSERT WITH CHECK (
        guardian_npub = current_setting('app.current_user_npub', true)
        AND EXISTS (
            SELECT 1 FROM family_members fm 
            WHERE fm.npub = current_setting('app.current_user_npub', true)
            AND fm.role IN ('guardian', 'steward')
            AND fm.is_active = true
        )
    );

-- Create RLS policies for emergency_recovery_logs
ALTER TABLE emergency_recovery_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view logs for their requests" ON emergency_recovery_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM emergency_recovery_requests r
            WHERE r.id = emergency_recovery_logs.recovery_request_id
            AND r.user_id = current_setting('app.current_user_id', true)
        )
    );

CREATE POLICY "Guardians can view family logs" ON emergency_recovery_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM emergency_recovery_requests r
            JOIN family_members fm ON fm.family_id = r.family_id
            WHERE r.id = emergency_recovery_logs.recovery_request_id
            AND fm.npub = current_setting('app.current_user_npub', true)
            AND fm.role IN ('guardian', 'steward')
            AND fm.is_active = true
        )
    );

CREATE POLICY "System can create logs" ON emergency_recovery_logs
    FOR INSERT WITH CHECK (current_setting('app.current_user_role', true) = 'system');

-- Create RLS policies for emergency_recovery_backups
ALTER TABLE emergency_recovery_backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own backups" ON emergency_recovery_backups
    FOR SELECT USING (user_id = current_setting('app.current_user_id', true));

CREATE POLICY "Users can create their own backups" ON emergency_recovery_backups
    FOR INSERT WITH CHECK (user_id = current_setting('app.current_user_id', true));

CREATE POLICY "Guardians can view family backups" ON emergency_recovery_backups
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM family_members fm 
            WHERE fm.family_id = emergency_recovery_backups.family_id 
            AND fm.npub = current_setting('app.current_user_npub', true)
            AND fm.role IN ('guardian', 'steward')
            AND fm.is_active = true
        )
    );

-- Create RLS policies for guardian_recovery_sessions
ALTER TABLE guardian_recovery_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Guardians can view their own sessions" ON guardian_recovery_sessions
    FOR SELECT USING (guardian_npub = current_setting('app.current_user_npub', true));

CREATE POLICY "Guardians can create their own sessions" ON guardian_recovery_sessions
    FOR INSERT WITH CHECK (guardian_npub = current_setting('app.current_user_npub', true));

CREATE POLICY "Guardians can update their own sessions" ON guardian_recovery_sessions
    FOR UPDATE USING (guardian_npub = current_setting('app.current_user_npub', true));

-- Create scheduled job to clean up expired requests (if using pg_cron)
-- SELECT cron.schedule('cleanup-expired-recovery-requests', '0 */6 * * *', 'SELECT cleanup_expired_recovery_requests();');

-- Insert initial audit log entry
INSERT INTO emergency_recovery_logs (action, actor_npub, actor_role, details)
VALUES ('system_initialization', 'system', 'system', 'Emergency recovery system initialized');

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE ON emergency_recovery_requests TO authenticated;
GRANT SELECT, INSERT ON emergency_recovery_approvals TO authenticated;
GRANT SELECT ON emergency_recovery_logs TO authenticated;
GRANT SELECT, INSERT ON emergency_recovery_backups TO authenticated;
GRANT SELECT, INSERT, UPDATE ON guardian_recovery_sessions TO authenticated;

-- Grant usage on sequences
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated; 