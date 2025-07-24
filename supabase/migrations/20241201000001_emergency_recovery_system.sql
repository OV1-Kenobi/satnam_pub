-- Emergency Recovery System Database Schema
-- CRITICAL: This table stores emergency recovery requests for private users and family federations
-- MASTER CONTEXT COMPLIANCE: Privacy-first architecture with hashed identifiers

-- Emergency Recovery Requests Table
CREATE TABLE IF NOT EXISTS public.emergency_recovery_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_npub TEXT NOT NULL,
    user_role TEXT NOT NULL CHECK (user_role IN ('private', 'offspring', 'adult', 'steward', 'guardian')),
    family_id TEXT, -- Optional for private users
    request_type TEXT NOT NULL CHECK (request_type IN ('nsec_recovery', 'account_restoration', 'emergency_liquidity', 'ecash_recovery')),
    reason TEXT NOT NULL CHECK (reason IN ('lost_key', 'account_lockout', 'emergency_funds', 'device_compromise', 'other')),
    urgency TEXT NOT NULL CHECK (urgency IN ('low', 'medium', 'high', 'critical')),
    description TEXT NOT NULL,
    requested_amount BIGINT, -- For emergency liquidity requests
    recovery_method TEXT NOT NULL CHECK (recovery_method IN ('password', 'shamir', 'multisig', 'guardian_consensus')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'expired')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    required_approvals INTEGER NOT NULL DEFAULT 0,
    current_approvals INTEGER NOT NULL DEFAULT 0,
    guardian_signatures JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- Emergency Recovery Events Log Table
CREATE TABLE IF NOT EXISTS public.emergency_recovery_events (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL CHECK (event_type IN ('recovery_requested', 'guardian_approved', 'guardian_rejected', 'recovery_completed', 'recovery_expired')),
    user_id TEXT NOT NULL,
    user_npub TEXT NOT NULL,
    user_role TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical'))
);

-- Emergency Recovery Attempts Tracking Table
CREATE TABLE IF NOT EXISTS public.emergency_recovery_attempts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    attempt_date DATE NOT NULL DEFAULT CURRENT_DATE,
    attempt_count INTEGER NOT NULL DEFAULT 1,
    last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, attempt_date)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_emergency_recovery_requests_user_id ON public.emergency_recovery_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_emergency_recovery_requests_family_id ON public.emergency_recovery_requests(family_id);
CREATE INDEX IF NOT EXISTS idx_emergency_recovery_requests_status ON public.emergency_recovery_requests(status);
CREATE INDEX IF NOT EXISTS idx_emergency_recovery_requests_created_at ON public.emergency_recovery_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_emergency_recovery_requests_expires_at ON public.emergency_recovery_requests(expires_at);

CREATE INDEX IF NOT EXISTS idx_emergency_recovery_events_user_id ON public.emergency_recovery_events(user_id);
CREATE INDEX IF NOT EXISTS idx_emergency_recovery_events_timestamp ON public.emergency_recovery_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_emergency_recovery_events_event_type ON public.emergency_recovery_events(event_type);

CREATE INDEX IF NOT EXISTS idx_emergency_recovery_attempts_user_id ON public.emergency_recovery_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_emergency_recovery_attempts_date ON public.emergency_recovery_attempts(attempt_date);

-- Row Level Security (RLS) Policies
ALTER TABLE public.emergency_recovery_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_recovery_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_recovery_attempts ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access their own recovery requests
CREATE POLICY "Users can access own recovery requests" ON public.emergency_recovery_requests
    FOR ALL USING (auth.uid()::text = user_id);

-- RLS Policy: Family guardians can access family recovery requests
CREATE POLICY "Family guardians can access family recovery requests" ON public.emergency_recovery_requests
    FOR SELECT USING (
        family_id IS NOT NULL AND 
        EXISTS (
            SELECT 1 FROM public.family_members fm 
            WHERE fm.family_id = emergency_recovery_requests.family_id 
            AND fm.user_id = auth.uid()::text 
            AND fm.role IN ('guardian', 'steward')
        )
    );

-- RLS Policy: Users can access their own recovery events
CREATE POLICY "Users can access own recovery events" ON public.emergency_recovery_events
    FOR ALL USING (auth.uid()::text = user_id);

-- RLS Policy: Users can access their own recovery attempts
CREATE POLICY "Users can access own recovery attempts" ON public.emergency_recovery_attempts
    FOR ALL USING (auth.uid()::text = user_id);

-- Function to automatically clean up expired recovery requests
CREATE OR REPLACE FUNCTION cleanup_expired_recovery_requests()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.emergency_recovery_requests 
    SET status = 'expired' 
    WHERE status = 'pending' 
    AND expires_at < NOW();
END;
$$;

-- Function to increment daily recovery attempts
CREATE OR REPLACE FUNCTION increment_recovery_attempts(p_user_id TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_attempts INTEGER;
BEGIN
    INSERT INTO public.emergency_recovery_attempts (id, user_id, attempt_count)
    VALUES (gen_random_uuid()::text, p_user_id, 1)
    ON CONFLICT (user_id, attempt_date)
    DO UPDATE SET 
        attempt_count = emergency_recovery_attempts.attempt_count + 1,
        last_attempt_at = NOW();
    
    SELECT attempt_count INTO current_attempts
    FROM public.emergency_recovery_attempts
    WHERE user_id = p_user_id AND attempt_date = CURRENT_DATE;
    
    RETURN current_attempts;
END;
$$;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON public.emergency_recovery_requests TO authenticated;
GRANT ALL ON public.emergency_recovery_events TO authenticated;
GRANT ALL ON public.emergency_recovery_attempts TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_expired_recovery_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION increment_recovery_attempts(TEXT) TO authenticated;

-- Comments for documentation
COMMENT ON TABLE public.emergency_recovery_requests IS 'Stores emergency recovery requests for private users and family federations';
COMMENT ON TABLE public.emergency_recovery_events IS 'Audit log for emergency recovery system events';
COMMENT ON TABLE public.emergency_recovery_attempts IS 'Tracks daily recovery attempts per user for rate limiting';
COMMENT ON FUNCTION cleanup_expired_recovery_requests() IS 'Automatically marks expired recovery requests as expired';
COMMENT ON FUNCTION increment_recovery_attempts(TEXT) IS 'Increments and returns daily recovery attempt count for a user';
