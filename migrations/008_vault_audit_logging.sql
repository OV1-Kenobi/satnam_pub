-- Migration: 008_vault_audit_logging.sql
-- Description: Add Vault audit logging for secret rotations and guardian approvals
-- Date: 2024-12-01

-- Enable Vault extension if not already enabled
CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- Create Vault audit logging table
CREATE TABLE IF NOT EXISTS vault_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    secret_name TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('creation', 'rotation', 'deletion', 'access')),
    guardian_approved BOOLEAN DEFAULT FALSE,
    guardian_npub TEXT, -- Guardian's Nostr public key who approved the action
    requester_npub TEXT, -- Person who requested the action
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb, -- Additional context about the action
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_vault_audit_secret_name ON vault_audit_log(secret_name);
CREATE INDEX IF NOT EXISTS idx_vault_audit_action ON vault_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_vault_audit_timestamp ON vault_audit_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_vault_audit_guardian ON vault_audit_log(guardian_npub);

-- Create guardian approval workflow table
CREATE TABLE IF NOT EXISTS vault_guardian_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    secret_name TEXT NOT NULL,
    requested_action TEXT NOT NULL CHECK (requested_action IN ('rotation', 'deletion')),
    new_value TEXT, -- Encrypted new value (if rotation)
    requester_npub TEXT NOT NULL,
    guardian_npub TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    approval_timestamp TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours') -- Approvals expire after 24 hours
);

-- Create indexes for guardian approvals
CREATE INDEX IF NOT EXISTS idx_vault_guardian_approvals_secret ON vault_guardian_approvals(secret_name);
CREATE INDEX IF NOT EXISTS idx_vault_guardian_approvals_status ON vault_guardian_approvals(status);
CREATE INDEX IF NOT EXISTS idx_vault_guardian_approvals_expires ON vault_guardian_approvals(expires_at);

-- Create secret rotation schedule table
CREATE TABLE IF NOT EXISTS vault_rotation_schedule (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    secret_name TEXT NOT NULL UNIQUE,
    rotation_interval_days INTEGER NOT NULL DEFAULT 90,
    last_rotated TIMESTAMPTZ,
    next_rotation_due TIMESTAMPTZ,
    guardian_approval_required BOOLEAN DEFAULT TRUE,
    auto_rotation_enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for rotation schedule
CREATE INDEX IF NOT EXISTS idx_vault_rotation_schedule_due ON vault_rotation_schedule(next_rotation_due);
CREATE INDEX IF NOT EXISTS idx_vault_rotation_schedule_enabled ON vault_rotation_schedule(auto_rotation_enabled);

-- Create RLS policies for vault_audit_log
ALTER TABLE vault_audit_log ENABLE ROW LEVEL SECURITY;

-- Only service role can insert audit logs
CREATE POLICY "Service role can insert audit logs" ON vault_audit_log
    FOR INSERT TO service_role
    WITH CHECK (true);

-- Only service role can read audit logs
CREATE POLICY "Service role can read audit logs" ON vault_audit_log
    FOR SELECT TO service_role
    USING (true);

-- Create RLS policies for vault_guardian_approvals
ALTER TABLE vault_guardian_approvals ENABLE ROW LEVEL SECURITY;

-- Service role can manage guardian approvals
CREATE POLICY "Service role can manage guardian approvals" ON vault_guardian_approvals
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- Guardians can view their own approvals
CREATE POLICY "Guardians can view their approvals" ON vault_guardian_approvals
    FOR SELECT TO authenticated
    USING (guardian_npub = auth.jwt() ->> 'npub');

-- Create RLS policies for vault_rotation_schedule
ALTER TABLE vault_rotation_schedule ENABLE ROW LEVEL SECURITY;

-- Only service role can manage rotation schedule
CREATE POLICY "Service role can manage rotation schedule" ON vault_rotation_schedule
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- Function to log secret access
CREATE OR REPLACE FUNCTION log_vault_access(
    p_secret_name TEXT,
    p_action TEXT DEFAULT 'access',
    p_guardian_approved BOOLEAN DEFAULT FALSE,
    p_guardian_npub TEXT DEFAULT NULL,
    p_requester_npub TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    log_id UUID;
BEGIN
    INSERT INTO vault_audit_log (
        secret_name,
        action,
        guardian_approved,
        guardian_npub,
        requester_npub,
        metadata
    ) VALUES (
        p_secret_name,
        p_action,
        p_guardian_approved,
        p_guardian_npub,
        p_requester_npub,
        p_metadata
    ) RETURNING id INTO log_id;
    
    RETURN log_id;
END;
$$;

-- Function to create guardian approval request
CREATE OR REPLACE FUNCTION create_guardian_approval(
    p_secret_name TEXT,
    p_requested_action TEXT,
    p_new_value TEXT DEFAULT NULL,
    p_requester_npub TEXT,
    p_guardian_npub TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    approval_id UUID;
BEGIN
    INSERT INTO vault_guardian_approvals (
        secret_name,
        requested_action,
        new_value,
        requester_npub,
        guardian_npub
    ) VALUES (
        p_secret_name,
        p_requested_action,
        p_new_value,
        p_requester_npub,
        p_guardian_npub
    ) RETURNING id INTO approval_id;
    
    RETURN approval_id;
END;
$$;

-- Function to approve guardian request
CREATE OR REPLACE FUNCTION approve_guardian_request(
    p_approval_id UUID,
    p_guardian_npub TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    approval_record RECORD;
BEGIN
    -- Get the approval request
    SELECT * INTO approval_record
    FROM vault_guardian_approvals
    WHERE id = p_approval_id
    AND guardian_npub = p_guardian_npub
    AND status = 'pending'
    AND expires_at > NOW();
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    -- Update approval status
    UPDATE vault_guardian_approvals
    SET status = 'approved',
        approval_timestamp = NOW()
    WHERE id = p_approval_id;
    
    -- Log the approval
    PERFORM log_vault_access(
        approval_record.secret_name,
        'rotation',
        TRUE,
        p_guardian_npub,
        approval_record.requester_npub,
        jsonb_build_object('approval_id', p_approval_id)
    );
    
    RETURN TRUE;
END;
$$;

-- Function to reject guardian request
CREATE OR REPLACE FUNCTION reject_guardian_request(
    p_approval_id UUID,
    p_guardian_npub TEXT,
    p_rejection_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    approval_record RECORD;
BEGIN
    -- Get the approval request
    SELECT * INTO approval_record
    FROM vault_guardian_approvals
    WHERE id = p_approval_id
    AND guardian_npub = p_guardian_npub
    AND status = 'pending'
    AND expires_at > NOW();
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    -- Update approval status
    UPDATE vault_guardian_approvals
    SET status = 'rejected',
        rejection_reason = p_rejection_reason
    WHERE id = p_approval_id;
    
    -- Log the rejection
    PERFORM log_vault_access(
        approval_record.secret_name,
        'rotation',
        FALSE,
        p_guardian_npub,
        approval_record.requester_npub,
        jsonb_build_object(
            'approval_id', p_approval_id,
            'rejection_reason', p_rejection_reason
        )
    );
    
    RETURN TRUE;
END;
$$;

-- Function to schedule secret rotation
CREATE OR REPLACE FUNCTION schedule_secret_rotation(
    p_secret_name TEXT,
    p_rotation_interval_days INTEGER DEFAULT 90,
    p_guardian_approval_required BOOLEAN DEFAULT TRUE,
    p_auto_rotation_enabled BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    schedule_id UUID;
BEGIN
    INSERT INTO vault_rotation_schedule (
        secret_name,
        rotation_interval_days,
        guardian_approval_required,
        auto_rotation_enabled,
        next_rotation_due
    ) VALUES (
        p_secret_name,
        p_rotation_interval_days,
        p_guardian_approval_required,
        p_auto_rotation_enabled,
        NOW() + (p_rotation_interval_days || ' days')::INTERVAL
    ) ON CONFLICT (secret_name) DO UPDATE SET
        rotation_interval_days = EXCLUDED.rotation_interval_days,
        guardian_approval_required = EXCLUDED.guardian_approval_required,
        auto_rotation_enabled = EXCLUDED.auto_rotation_enabled,
        updated_at = NOW()
    RETURNING id INTO schedule_id;
    
    RETURN schedule_id;
END;
$$;

-- Function to get secrets due for rotation
CREATE OR REPLACE FUNCTION get_secrets_due_for_rotation()
RETURNS TABLE (
    secret_name TEXT,
    days_overdue INTEGER,
    guardian_approval_required BOOLEAN,
    auto_rotation_enabled BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        vrs.secret_name,
        EXTRACT(DAY FROM (NOW() - vrs.next_rotation_due))::INTEGER as days_overdue,
        vrs.guardian_approval_required,
        vrs.auto_rotation_enabled
    FROM vault_rotation_schedule vrs
    WHERE vrs.next_rotation_due < NOW()
    ORDER BY vrs.next_rotation_due ASC;
END;
$$;

-- Insert default rotation schedules for critical secrets
INSERT INTO vault_rotation_schedule (secret_name, rotation_interval_days, guardian_approval_required, auto_rotation_enabled)
VALUES 
    ('jwt_secret', 90, TRUE, FALSE),
    ('privacy_master_key', 180, TRUE, FALSE),
    ('master_encryption_key', 180, TRUE, FALSE),
    ('phoenixd_api_token', 90, TRUE, FALSE),
    ('voltage_api_key', 90, TRUE, FALSE),
    ('lnbits_admin_key', 90, TRUE, FALSE),
    ('fedimint_guardian_private_key', 365, TRUE, FALSE)
ON CONFLICT (secret_name) DO NOTHING;

-- Create view for vault health monitoring
CREATE OR REPLACE VIEW vault_health_status AS
SELECT 
    'audit_log' as component,
    COUNT(*) as record_count,
    MAX(timestamp) as last_activity
FROM vault_audit_log
UNION ALL
SELECT 
    'guardian_approvals' as component,
    COUNT(*) as record_count,
    MAX(created_at) as last_activity
FROM vault_guardian_approvals
UNION ALL
SELECT 
    'rotation_schedule' as component,
    COUNT(*) as record_count,
    MAX(updated_at) as last_activity
FROM vault_rotation_schedule;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON vault_audit_log TO service_role;
GRANT ALL ON vault_guardian_approvals TO service_role;
GRANT ALL ON vault_rotation_schedule TO service_role;
GRANT SELECT ON vault_health_status TO service_role;

-- Grant function execution permissions
GRANT EXECUTE ON FUNCTION log_vault_access TO service_role;
GRANT EXECUTE ON FUNCTION create_guardian_approval TO service_role;
GRANT EXECUTE ON FUNCTION approve_guardian_request TO service_role;
GRANT EXECUTE ON FUNCTION reject_guardian_request TO service_role;
GRANT EXECUTE ON FUNCTION schedule_secret_rotation TO service_role;
GRANT EXECUTE ON FUNCTION get_secrets_due_for_rotation TO service_role; 