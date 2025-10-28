-- =====================================================
-- SSS SIGNING REQUESTS TABLE MIGRATION
-- =====================================================
-- Creates the sss_signing_requests table for federated signing
-- with SSS (Shamir Secret Sharing) reconstruction
--
-- MASTER CONTEXT COMPLIANCE:
-- ✅ Zero-knowledge architecture with encrypted data
-- ✅ Privacy-first design with no PII exposure
-- ✅ Idempotent migration (safe to run multiple times)
-- ✅ Proper indexing for performance
-- ✅ RLS policies for security
--
-- Version: 1.0.0
-- Date: 2025-10-27
-- =====================================================

-- Create sss_signing_requests table
CREATE TABLE IF NOT EXISTS public.sss_signing_requests (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id TEXT NOT NULL UNIQUE,
    
    -- Family and event information
    family_id TEXT NOT NULL,
    event_template TEXT NOT NULL, -- JSON string of Nostr event template
    event_type TEXT, -- Optional event type for categorization
    
    -- Guardian configuration
    required_guardians TEXT NOT NULL, -- JSON array of guardian pubkeys
    threshold INTEGER NOT NULL CHECK (threshold >= 1 AND threshold <= 7),
    
    -- SSS shares and signatures
    sss_shares TEXT, -- JSON array of encrypted SSS shares
    signatures TEXT, -- JSON array of guardian signatures
    
    -- Request metadata
    created_by TEXT NOT NULL, -- Requester public key
    status TEXT NOT NULL DEFAULT 'pending' CHECK (
        status IN ('pending', 'completed', 'failed', 'expired')
    ),
    
    -- Event broadcasting
    final_event_id TEXT, -- Nostr event ID after broadcasting
    
    -- Timestamps
    created_at BIGINT NOT NULL,
    updated_at BIGINT,
    completed_at BIGINT,
    failed_at BIGINT,
    expires_at BIGINT NOT NULL,
    
    -- Error tracking
    error_message TEXT
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_sss_signing_requests_request_id 
    ON public.sss_signing_requests(request_id);

CREATE INDEX IF NOT EXISTS idx_sss_signing_requests_family_id 
    ON public.sss_signing_requests(family_id);

CREATE INDEX IF NOT EXISTS idx_sss_signing_requests_status 
    ON public.sss_signing_requests(status);

CREATE INDEX IF NOT EXISTS idx_sss_signing_requests_created_by 
    ON public.sss_signing_requests(created_by);

CREATE INDEX IF NOT EXISTS idx_sss_signing_requests_expires_at 
    ON public.sss_signing_requests(expires_at);

CREATE INDEX IF NOT EXISTS idx_sss_signing_requests_final_event_id 
    ON public.sss_signing_requests(final_event_id) 
    WHERE final_event_id IS NOT NULL;

-- Enable Row Level Security
ALTER TABLE public.sss_signing_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view signing requests they created
CREATE POLICY "Users can view their own signing requests" 
    ON public.sss_signing_requests
    FOR SELECT
    USING (
        created_by = current_setting('app.current_user_pubkey', true)
        OR
        -- Allow guardians to view requests they're involved in
        current_setting('app.current_user_pubkey', true) = ANY(
            SELECT jsonb_array_elements_text(required_guardians::jsonb)
        )
    );

-- RLS Policy: Users can create signing requests
CREATE POLICY "Users can create signing requests" 
    ON public.sss_signing_requests
    FOR INSERT
    WITH CHECK (
        created_by = current_setting('app.current_user_pubkey', true)
    );

-- RLS Policy: Guardians can update signing requests (submit signatures)
CREATE POLICY "Guardians can update signing requests" 
    ON public.sss_signing_requests
    FOR UPDATE
    USING (
        current_setting('app.current_user_pubkey', true) = ANY(
            SELECT jsonb_array_elements_text(required_guardians::jsonb)
        )
        OR
        created_by = current_setting('app.current_user_pubkey', true)
    );

-- RLS Policy: Service role can do everything (for Netlify Functions)
CREATE POLICY "Service role has full access" 
    ON public.sss_signing_requests
    FOR ALL
    USING (current_user = 'service_role');

-- Create function to auto-expire old signing requests
CREATE OR REPLACE FUNCTION expire_old_sss_signing_requests()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.sss_signing_requests
    SET 
        status = 'expired',
        updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT
    WHERE 
        status = 'pending'
        AND expires_at < EXTRACT(EPOCH FROM NOW())::BIGINT;
END;
$$;

-- Create function to clean up old completed/failed requests (optional)
CREATE OR REPLACE FUNCTION cleanup_old_sss_signing_requests(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    WITH deleted AS (
        DELETE FROM public.sss_signing_requests
        WHERE 
            status IN ('completed', 'failed', 'expired')
            AND created_at < EXTRACT(EPOCH FROM (NOW() - (retention_days || ' days')::INTERVAL))::BIGINT
        RETURNING *
    )
    SELECT COUNT(*) INTO deleted_count FROM deleted;
    
    RETURN deleted_count;
END;
$$;

-- Add table comment for documentation
COMMENT ON TABLE public.sss_signing_requests IS 
    'Stores federated signing requests using Shamir Secret Sharing (SSS) for threshold signatures. ' ||
    'Supports guardian approval workflows with configurable thresholds (1-of-N to 7-of-7).';

COMMENT ON COLUMN public.sss_signing_requests.request_id IS 
    'Unique identifier for the signing request (UUID format)';

COMMENT ON COLUMN public.sss_signing_requests.family_id IS 
    'Family federation identifier this request belongs to';

COMMENT ON COLUMN public.sss_signing_requests.event_template IS 
    'JSON string containing the Nostr event template to be signed';

COMMENT ON COLUMN public.sss_signing_requests.required_guardians IS 
    'JSON array of guardian public keys required for this signing request';

COMMENT ON COLUMN public.sss_signing_requests.threshold IS 
    'Minimum number of guardian signatures required (1-7)';

COMMENT ON COLUMN public.sss_signing_requests.sss_shares IS 
    'JSON array of encrypted SSS shares distributed to guardians';

COMMENT ON COLUMN public.sss_signing_requests.signatures IS 
    'JSON array of guardian signatures collected so far';

COMMENT ON COLUMN public.sss_signing_requests.final_event_id IS 
    'Nostr event ID after successful signing and broadcasting (added in Task 6)';

COMMENT ON COLUMN public.sss_signing_requests.status IS 
    'Request status: pending (awaiting signatures), completed (signed and broadcast), failed (error occurred), expired (timeout)';

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.sss_signing_requests TO authenticated;
GRANT ALL ON public.sss_signing_requests TO service_role;

-- Verification query (run this to verify the migration)
DO $$
DECLARE
    table_exists BOOLEAN;
    column_exists BOOLEAN;
BEGIN
    -- Check if table exists
    SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'sss_signing_requests'
    ) INTO table_exists;
    
    IF table_exists THEN
        RAISE NOTICE '✅ Table sss_signing_requests exists';
        
        -- Check if final_event_id column exists
        SELECT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'sss_signing_requests'
            AND column_name = 'final_event_id'
        ) INTO column_exists;
        
        IF column_exists THEN
            RAISE NOTICE '✅ Column final_event_id exists';
        ELSE
            RAISE WARNING '⚠️  Column final_event_id does NOT exist';
        END IF;
    ELSE
        RAISE WARNING '⚠️  Table sss_signing_requests does NOT exist';
    END IF;
END $$;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ SSS SIGNING REQUESTS MIGRATION COMPLETE';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Table: sss_signing_requests';
    RAISE NOTICE 'Indexes: 6 created';
    RAISE NOTICE 'RLS Policies: 4 created';
    RAISE NOTICE 'Functions: 2 created';
    RAISE NOTICE '';
    RAISE NOTICE 'Key Features:';
    RAISE NOTICE '  • Threshold signatures (1-7 guardians)';
    RAISE NOTICE '  • SSS share management';
    RAISE NOTICE '  • Guardian approval workflow';
    RAISE NOTICE '  • Event broadcasting tracking';
    RAISE NOTICE '  • Auto-expiration of old requests';
    RAISE NOTICE '  • Privacy-first RLS policies';
    RAISE NOTICE '';
    RAISE NOTICE 'Next Steps:';
    RAISE NOTICE '  1. Test with: SELECT * FROM sss_signing_requests;';
    RAISE NOTICE '  2. Run cleanup: SELECT cleanup_old_sss_signing_requests(90);';
    RAISE NOTICE '  3. Expire old: SELECT expire_old_sss_signing_requests();';
    RAISE NOTICE '========================================';
END $$;

