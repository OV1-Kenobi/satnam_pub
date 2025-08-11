-- Nostr Key Recovery and Rotation System Migration
--
-- Creates tables and functions for comprehensive key recovery and rotation
-- Supports both Family Federation and Private Individual users
--
-- IMPORTANT: Data Type Compatibility
-- The existing user_identities table uses TEXT for the id column (hashed UUIDs for privacy)
-- All foreign key references must use TEXT, not UUID, to maintain compatibility

-- Recovery Requests Table
CREATE TABLE IF NOT EXISTS public.recovery_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES public.user_identities(id) ON DELETE CASCADE,
    user_role TEXT NOT NULL CHECK (user_role IN ('private', 'offspring', 'adult', 'steward', 'guardian')),
    recovery_type TEXT NOT NULL CHECK (recovery_type IN ('nsec-recovery', 'key-rotation', 'account-recovery')),
    recovery_method TEXT NOT NULL CHECK (recovery_method IN ('nip05-password', 'nip07-password', 'family-consensus')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'expired')),

    -- Request timing
    requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,

    -- Authentication credentials (encrypted)
    credentials JSONB,

    -- Family consensus data
    family_consensus JSONB,

    -- Recovery result (temporarily stored)
    recovered_data JSONB,

    -- Audit trail
    audit_log JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Key Rotations Table
CREATE TABLE IF NOT EXISTS public.key_rotations (
    rotation_id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES public.user_identities(id) ON DELETE CASCADE,

    -- Key data
    old_npub TEXT NOT NULL,
    new_npub TEXT NOT NULL,

    -- Identity preservation
    preserve_identity JSONB NOT NULL,

    -- Rotation metadata
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),

    -- Timing
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,

    -- Audit
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Profile Migration Notices Table
-- Note: id uses UUID here as it's an internal table ID, not a user reference
CREATE TABLE IF NOT EXISTS public.profile_migration_notices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rotation_id TEXT REFERENCES public.key_rotations(rotation_id) ON DELETE CASCADE,
    npub TEXT NOT NULL,
    notice_type TEXT NOT NULL CHECK (notice_type IN ('new_profile', 'deprecated_profile')),
    notice_content TEXT NOT NULL,
    applied BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Recovery Audit Log Table
-- Note: id uses UUID here as it's an internal audit log ID, not a user reference
CREATE TABLE IF NOT EXISTS public.recovery_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id TEXT REFERENCES public.recovery_requests(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    details TEXT,
    ip_address TEXT,
    user_agent TEXT,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_recovery_requests_user_id ON public.recovery_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_recovery_requests_status ON public.recovery_requests(status);
CREATE INDEX IF NOT EXISTS idx_recovery_requests_expires_at ON public.recovery_requests(expires_at);

CREATE INDEX IF NOT EXISTS idx_key_rotations_user_id ON public.key_rotations(user_id);
CREATE INDEX IF NOT EXISTS idx_key_rotations_status ON public.key_rotations(status);
CREATE INDEX IF NOT EXISTS idx_key_rotations_old_npub ON public.key_rotations(old_npub);
CREATE INDEX IF NOT EXISTS idx_key_rotations_new_npub ON public.key_rotations(new_npub);

CREATE INDEX IF NOT EXISTS idx_profile_migration_notices_rotation_id ON public.profile_migration_notices(rotation_id);
CREATE INDEX IF NOT EXISTS idx_profile_migration_notices_npub ON public.profile_migration_notices(npub);

CREATE INDEX IF NOT EXISTS idx_recovery_audit_log_request_id ON public.recovery_audit_log(request_id);
CREATE INDEX IF NOT EXISTS idx_recovery_audit_log_timestamp ON public.recovery_audit_log(timestamp);

-- Row Level Security (RLS) Policies

-- Recovery Requests RLS
ALTER TABLE public.recovery_requests ENABLE ROW LEVEL SECURITY;

-- Users can only access their own recovery requests
-- Note: auth.uid() returns UUID, but user_id is TEXT (hashed UUID for privacy)
-- We need to match against the authenticated user's hashed ID
CREATE POLICY "Users can access own recovery requests" ON public.recovery_requests
    FOR ALL USING (
        user_id IN (
            SELECT id FROM public.user_identities WHERE id = auth.uid()::text
        )
    );

-- Key Rotations RLS
ALTER TABLE public.key_rotations ENABLE ROW LEVEL SECURITY;

-- Users can only access their own key rotations
-- Note: auth.uid() returns UUID, but user_id is TEXT (hashed UUID for privacy)
CREATE POLICY "Users can access own key rotations" ON public.key_rotations
    FOR ALL USING (
        user_id IN (
            SELECT id FROM public.user_identities WHERE id = auth.uid()::text
        )
    );

-- Profile Migration Notices RLS
ALTER TABLE public.profile_migration_notices ENABLE ROW LEVEL SECURITY;

-- Users can access notices for their rotations
CREATE POLICY "Users can access own migration notices" ON public.profile_migration_notices
    FOR ALL USING (
        rotation_id IN (
            SELECT rotation_id FROM public.key_rotations
            WHERE user_id IN (
                SELECT id FROM public.user_identities WHERE id = auth.uid()::text
            )
        )
    );

-- Recovery Audit Log RLS
ALTER TABLE public.recovery_audit_log ENABLE ROW LEVEL SECURITY;

-- Users can access audit logs for their recovery requests
CREATE POLICY "Users can access own recovery audit logs" ON public.recovery_audit_log
    FOR ALL USING (
        request_id IN (
            SELECT id FROM public.recovery_requests
            WHERE user_id IN (
                SELECT id FROM public.user_identities WHERE id = auth.uid()::text
            )
        )
    );

-- Functions for automatic cleanup

-- Function to expire old recovery requests
CREATE OR REPLACE FUNCTION expire_old_recovery_requests()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.recovery_requests 
    SET status = 'expired', updated_at = NOW()
    WHERE status = 'pending' 
    AND expires_at < NOW();
END;
$$;

-- Function to clean up completed recovery requests (remove sensitive data)
CREATE OR REPLACE FUNCTION cleanup_completed_recovery_requests()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.recovery_requests 
    SET 
        credentials = NULL,
        recovered_data = NULL,
        updated_at = NOW()
    WHERE status IN ('completed', 'expired', 'rejected')
    AND completed_at < NOW() - INTERVAL '24 hours';
END;
$$;

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_recovery_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Triggers for automatic timestamp updates
CREATE TRIGGER update_recovery_requests_timestamp
    BEFORE UPDATE ON public.recovery_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_recovery_timestamp();

CREATE TRIGGER update_key_rotations_timestamp
    BEFORE UPDATE ON public.key_rotations
    FOR EACH ROW
    EXECUTE FUNCTION update_recovery_timestamp();

-- Grant permissions
GRANT ALL ON public.recovery_requests TO authenticated;
GRANT ALL ON public.key_rotations TO authenticated;
GRANT ALL ON public.profile_migration_notices TO authenticated;
GRANT ALL ON public.recovery_audit_log TO authenticated;

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION expire_old_recovery_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_completed_recovery_requests() TO authenticated;

-- Comments for documentation
COMMENT ON TABLE public.recovery_requests IS 'Stores Nostr key recovery requests with audit trail';
COMMENT ON TABLE public.key_rotations IS 'Tracks key rotation processes with identity preservation';
COMMENT ON TABLE public.profile_migration_notices IS 'Stores deprecation notices for key rotations';
COMMENT ON TABLE public.recovery_audit_log IS 'Audit trail for all recovery operations';

COMMENT ON FUNCTION expire_old_recovery_requests() IS 'Automatically expires old recovery requests';
COMMENT ON FUNCTION cleanup_completed_recovery_requests() IS 'Cleans up sensitive data from completed requests';

-- Initial data cleanup (run once)
SELECT expire_old_recovery_requests();
SELECT cleanup_completed_recovery_requests();
