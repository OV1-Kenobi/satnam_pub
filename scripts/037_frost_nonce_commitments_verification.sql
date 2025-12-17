-- =====================================================
-- FROST NONCE COMMITMENTS VERIFICATION MIGRATION
-- =====================================================
-- Idempotent migration to verify frost_nonce_commitments table exists
-- with proper UNIQUE constraints for FROST Phase 3 integration.
--
-- This is a safety migration that can be run multiple times.
-- It will only create missing components.
--
-- Version: 1.0.0
-- Date: 2025-12-17
-- Task: 7 - Fix FROST Persistence (Phase 3 Pre-Implementation)
-- =====================================================

-- Ensure required extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================
-- TABLE: FROST NONCE COMMITMENTS (IF NOT EXISTS)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.frost_nonce_commitments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL,
    participant_id TEXT NOT NULL,
    nonce_commitment TEXT NOT NULL,
    nonce_used BOOLEAN NOT NULL DEFAULT false,
    created_at BIGINT NOT NULL,
    used_at BIGINT
);

-- =====================================================
-- ADD FOREIGN KEY IF NOT EXISTS
-- =====================================================

DO $$
BEGIN
    -- Add FK constraint if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'frost_nonce_commitments_session_id_fkey'
        AND table_name = 'frost_nonce_commitments'
    ) THEN
        -- First check if frost_signing_sessions exists
        IF EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = 'frost_signing_sessions'
        ) THEN
            ALTER TABLE public.frost_nonce_commitments 
            ADD CONSTRAINT frost_nonce_commitments_session_id_fkey 
            FOREIGN KEY (session_id) REFERENCES public.frost_signing_sessions(session_id) ON DELETE CASCADE;
            RAISE NOTICE '✅ Added FK constraint frost_nonce_commitments_session_id_fkey';
        ELSE
            RAISE WARNING '⚠️  frost_signing_sessions table not found - FK not added';
        END IF;
    END IF;
END $$;

-- =====================================================
-- UNIQUE CONSTRAINTS (CRITICAL SECURITY)
-- =====================================================

DO $$
BEGIN
    -- Add UNIQUE constraint on nonce_commitment (prevents reuse attacks)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'unique_nonce_commitment'
        AND table_name = 'frost_nonce_commitments'
    ) THEN
        ALTER TABLE public.frost_nonce_commitments 
        ADD CONSTRAINT unique_nonce_commitment UNIQUE (nonce_commitment);
        RAISE NOTICE '✅ Added UNIQUE constraint unique_nonce_commitment';
    END IF;
    
    -- Add UNIQUE constraint on session_id + participant_id
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'unique_participant_session'
        AND table_name = 'frost_nonce_commitments'
    ) THEN
        ALTER TABLE public.frost_nonce_commitments 
        ADD CONSTRAINT unique_participant_session UNIQUE (session_id, participant_id);
        RAISE NOTICE '✅ Added UNIQUE constraint unique_participant_session';
    END IF;
    
    -- Add CHECK constraint for valid_nonce_usage
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'valid_nonce_usage'
        AND table_name = 'frost_nonce_commitments'
    ) THEN
        ALTER TABLE public.frost_nonce_commitments 
        ADD CONSTRAINT valid_nonce_usage CHECK (
            (nonce_used = true AND used_at IS NOT NULL) OR
            (nonce_used = false AND used_at IS NULL)
        );
        RAISE NOTICE '✅ Added CHECK constraint valid_nonce_usage';
    END IF;
END $$;

-- =====================================================
-- INDEXES (IF NOT EXISTS)
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_frost_nonce_commitments_session_id
    ON public.frost_nonce_commitments(session_id);

CREATE INDEX IF NOT EXISTS idx_frost_nonce_commitments_participant_id
    ON public.frost_nonce_commitments(participant_id);

CREATE INDEX IF NOT EXISTS idx_frost_nonce_commitments_nonce_commitment
    ON public.frost_nonce_commitments(nonce_commitment);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.frost_nonce_commitments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can view their nonce commitments" ON public.frost_nonce_commitments;
DROP POLICY IF EXISTS "Users can create nonce commitments" ON public.frost_nonce_commitments;
DROP POLICY IF EXISTS "Service role has full access to nonce commitments" ON public.frost_nonce_commitments;

-- RLS Policy: Users can view their own nonce commitments
CREATE POLICY "Users can view their nonce commitments"
    ON public.frost_nonce_commitments FOR SELECT
    USING (
        participant_id = current_setting('app.current_user_pubkey', true)
        OR session_id IN (
            SELECT session_id FROM public.frost_signing_sessions
            WHERE created_by = current_setting('app.current_user_pubkey', true)
        )
    );

-- RLS Policy: Users can create their own nonce commitments
CREATE POLICY "Users can create nonce commitments"
    ON public.frost_nonce_commitments FOR INSERT
    WITH CHECK (participant_id = current_setting('app.current_user_pubkey', true));

-- RLS Policy: Service role has full access
CREATE POLICY "Service role has full access to nonce commitments"
    ON public.frost_nonce_commitments FOR ALL
    USING (current_user = 'service_role');

-- =====================================================
-- GRANTS
-- =====================================================

GRANT SELECT, INSERT ON public.frost_nonce_commitments TO authenticated;
GRANT ALL ON public.frost_nonce_commitments TO service_role;

-- =====================================================
-- VERIFICATION
-- =====================================================

DO $$
DECLARE
    constraint_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO constraint_count
    FROM information_schema.table_constraints
    WHERE table_name = 'frost_nonce_commitments'
    AND constraint_type IN ('UNIQUE', 'CHECK', 'FOREIGN KEY');
    
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ FROST NONCE COMMITMENTS VERIFICATION COMPLETE';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Constraints verified: %', constraint_count;
    RAISE NOTICE 'Required constraints:';
    RAISE NOTICE '  • unique_nonce_commitment (UNIQUE)';
    RAISE NOTICE '  • unique_participant_session (UNIQUE)';
    RAISE NOTICE '  • valid_nonce_usage (CHECK)';
    RAISE NOTICE '========================================';
END $$;

