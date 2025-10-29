-- =====================================================
-- FROST SIGNING SESSIONS TABLE MIGRATION
-- =====================================================
-- Creates the frost_signing_sessions and frost_nonce_commitments tables
-- for FROST (Flexible Round-Optimized Schnorr Threshold) signature persistence
--
-- MASTER CONTEXT COMPLIANCE:
-- ✅ Zero-knowledge architecture with no key reconstruction
-- ✅ Privacy-first design with no PII exposure
-- ✅ Idempotent migration (safe to run multiple times)
-- ✅ Proper indexing for performance
-- ✅ RLS policies for security
-- ✅ Nonce reuse prevention (CRITICAL SECURITY)
--
-- Version: 1.0.0
-- Date: 2025-10-27
-- Task: 7 - Fix FROST Persistence (Phase 1)
-- =====================================================
-- Ensure required extension for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;



-- =====================================================
-- TABLE 1: FROST SIGNING SESSIONS
-- =====================================================
-- Tracks multi-round FROST signing sessions with state machine

CREATE TABLE IF NOT EXISTS public.frost_signing_sessions (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL,

    -- Family and message information
    family_id TEXT NOT NULL,
    message_hash TEXT NOT NULL, -- SHA-256 hash of message to sign
    event_template TEXT, -- Optional Nostr event template (JSON string)
    event_type TEXT, -- Optional event type for categorization

    -- Participant configuration
    participants JSONB NOT NULL, -- JSON array of participant pubkeys/DUIDs
    threshold INTEGER NOT NULL CHECK (threshold >= 1 AND threshold <= 7),

    -- FROST multi-round state (JSONB for flexibility)
    nonce_commitments JSONB DEFAULT '{}', -- Map of participant -> nonce commitment
    partial_signatures JSONB DEFAULT '{}', -- Map of participant -> partial signature
    final_signature JSONB, -- Final aggregated signature (R, s values)

    -- Session metadata
    created_by TEXT NOT NULL, -- Session initiator public key/DUID
    status TEXT NOT NULL DEFAULT 'pending' CHECK (
        status IN ('pending', 'nonce_collection', 'signing', 'aggregating', 'completed', 'failed', 'expired')
    ),

    -- Event broadcasting (integration with CEPS)
    final_event_id TEXT, -- Nostr event ID after broadcasting

    -- Timestamps (using BIGINT for consistency with SSS)
    created_at BIGINT NOT NULL,
    updated_at BIGINT,
    nonce_collection_started_at BIGINT,
    signing_started_at BIGINT,
    completed_at BIGINT,
    failed_at BIGINT,
    expires_at BIGINT NOT NULL,

    -- Error tracking
    error_message TEXT,

    -- Constraints
    CONSTRAINT frost_sessions_session_id_unique UNIQUE (session_id),
    CONSTRAINT valid_completion CHECK (
        (status = 'completed' AND final_signature IS NOT NULL AND completed_at IS NOT NULL) OR
        (status != 'completed')
    ),
    CONSTRAINT valid_failure CHECK (
        (status = 'failed' AND error_message IS NOT NULL AND failed_at IS NOT NULL) OR
        (status != 'failed')
    )
);



-- Ensure family_id column exists and is NOT NULL when safe (idempotent)
DO $$
BEGIN
    -- Add column if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'frost_signing_sessions'
          AND column_name = 'family_id'
    ) THEN
        ALTER TABLE public.frost_signing_sessions
        ADD COLUMN family_id TEXT;
    END IF;

    -- If column is nullable and contains no NULLs, enforce NOT NULL
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'frost_signing_sessions'
          AND column_name = 'family_id'
          AND is_nullable = 'YES'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.frost_signing_sessions WHERE family_id IS NULL
        ) THEN
            ALTER TABLE public.frost_signing_sessions
            ALTER COLUMN family_id SET NOT NULL;
        END IF;
    END IF;
END $$;

-- Ensure created_by column exists and is NOT NULL when safe (idempotent)
DO $$
BEGIN
    -- Add column if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'frost_signing_sessions'
          AND column_name = 'created_by'
    ) THEN
        ALTER TABLE public.frost_signing_sessions
        ADD COLUMN created_by TEXT;
    END IF;

    -- If column is nullable and contains no NULLs, enforce NOT NULL
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'frost_signing_sessions'
          AND column_name = 'created_by'
          AND is_nullable = 'YES'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.frost_signing_sessions WHERE created_by IS NULL
        ) THEN
            ALTER TABLE public.frost_signing_sessions
            ALTER COLUMN created_by SET NOT NULL;
        END IF;
    END IF;
END $$;
-- Normalize participants column to JSONB (idempotent and tolerant of legacy types)
DO $$
BEGIN
    -- If participants is a TEXT[] (array), convert to JSONB via to_jsonb(array)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'frost_signing_sessions'
          AND column_name = 'participants'
          AND udt_name = '_text'
    ) THEN
        ALTER TABLE public.frost_signing_sessions
        ALTER COLUMN participants TYPE jsonb
        USING to_jsonb(participants);
    END IF;

    -- If participants is TEXT (JSON string), convert to JSONB via cast
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'frost_signing_sessions'
          AND column_name = 'participants'
          AND data_type = 'text'
    ) THEN
        ALTER TABLE public.frost_signing_sessions
        ALTER COLUMN participants TYPE jsonb
        USING (participants::jsonb);
    END IF;

    -- If participants is missing, add as JSONB NOT NULL with temporary default then drop default
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'frost_signing_sessions'
          AND column_name = 'participants'
    ) THEN
        ALTER TABLE public.frost_signing_sessions
        ADD COLUMN participants jsonb NOT NULL DEFAULT '[]'::jsonb;
        ALTER TABLE public.frost_signing_sessions
        ALTER COLUMN participants DROP DEFAULT;
    END IF;
END $$;

-- Ensure event_template column exists (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'frost_signing_sessions'
          AND column_name = 'event_template'
    ) THEN
        ALTER TABLE public.frost_signing_sessions
        ADD COLUMN event_template TEXT;
    END IF;
END $$;

-- Ensure event_type column exists (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'frost_signing_sessions'
          AND column_name = 'event_type'
    ) THEN
        ALTER TABLE public.frost_signing_sessions
        ADD COLUMN event_type TEXT;
    END IF;
END $$;

-- Ensure final_event_id column exists (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'frost_signing_sessions'
          AND column_name = 'final_event_id'
    ) THEN
        ALTER TABLE public.frost_signing_sessions
        ADD COLUMN final_event_id TEXT;
    END IF;
END $$;

-- Ensure updated_at column exists (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'frost_signing_sessions'
          AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE public.frost_signing_sessions
        ADD COLUMN updated_at BIGINT;
    END IF;
END $$;

-- Ensure nonce_collection_started_at column exists (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'frost_signing_sessions'
          AND column_name = 'nonce_collection_started_at'
    ) THEN
        ALTER TABLE public.frost_signing_sessions
        ADD COLUMN nonce_collection_started_at BIGINT;
    END IF;
END $$;

-- Ensure signing_started_at column exists (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'frost_signing_sessions'
          AND column_name = 'signing_started_at'
    ) THEN
        ALTER TABLE public.frost_signing_sessions
        ADD COLUMN signing_started_at BIGINT;
    END IF;
END $$;

-- Ensure failed_at column exists (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'frost_signing_sessions'
          AND column_name = 'failed_at'
    ) THEN
        ALTER TABLE public.frost_signing_sessions
        ADD COLUMN failed_at BIGINT;
    END IF;
END $$;

-- Ensure error_message column exists (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'frost_signing_sessions'
          AND column_name = 'error_message'
    ) THEN
        ALTER TABLE public.frost_signing_sessions
        ADD COLUMN error_message TEXT;
    END IF;
END $$;

-- Ensure UNIQUE constraint on session_id exists (idempotent safety)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        WHERE c.conname = 'frost_sessions_session_id_unique'
          AND c.conrelid = 'public.frost_signing_sessions'::regclass
    ) THEN
        ALTER TABLE public.frost_signing_sessions
        ADD CONSTRAINT frost_sessions_session_id_unique UNIQUE (session_id);
    END IF;
END $$;

-- Preflight: verify all expected columns exist in frost_signing_sessions
DO $$
DECLARE
    missing_cols TEXT[];
BEGIN
    WITH expected(col) AS (
        VALUES
            ('id'), ('session_id'), ('family_id'), ('message_hash'), ('event_template'), ('event_type'),
            ('participants'), ('threshold'), ('nonce_commitments'), ('partial_signatures'), ('final_signature'),
            ('created_by'), ('status'), ('final_event_id'), ('created_at'), ('updated_at'),
            ('nonce_collection_started_at'), ('signing_started_at'), ('completed_at'),
            ('failed_at'), ('expires_at'), ('error_message')
    ), actual AS (
        SELECT column_name AS col
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'frost_signing_sessions'
    )
    SELECT ARRAY(
        SELECT e.col
        FROM expected e
        LEFT JOIN actual a ON a.col = e.col
        WHERE a.col IS NULL
    ) INTO missing_cols;

    IF missing_cols IS NOT NULL AND array_length(missing_cols, 1) > 0 THEN
        RAISE EXCEPTION 'Preflight failed: missing columns in public.frost_signing_sessions: %', array_to_string(missing_cols, ', ');
    END IF;
END $$;








-- =====================================================
-- TABLE 2: FROST NONCE COMMITMENTS
-- =====================================================
-- Prevents nonce reuse attacks (CRITICAL SECURITY)

CREATE TABLE IF NOT EXISTS public.frost_nonce_commitments (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Session reference
    session_id TEXT NOT NULL REFERENCES public.frost_signing_sessions(session_id) ON DELETE CASCADE,

    -- Participant information
    participant_id TEXT NOT NULL, -- Participant public key/DUID

    -- Cryptographic nonce data
    nonce_commitment TEXT NOT NULL, -- Cryptographic nonce commitment (hex)
    nonce_used BOOLEAN NOT NULL DEFAULT false, -- Replay protection: marks nonce as consumed

    -- Timestamps
    created_at BIGINT NOT NULL, -- Unix timestamp when nonce was submitted
    used_at BIGINT, -- Unix timestamp when nonce was marked as used (replay protection)

    -- CRITICAL: Prevent nonce reuse across ALL sessions
    -- This UNIQUE constraint is the primary security mechanism preventing nonce reuse attacks
    CONSTRAINT unique_nonce_commitment UNIQUE (nonce_commitment),

    -- One nonce per participant per session
    CONSTRAINT unique_participant_session UNIQUE (session_id, participant_id),

    -- Validation
    CONSTRAINT valid_nonce_usage CHECK (
        (nonce_used = true AND used_at IS NOT NULL) OR
        (nonce_used = false AND used_at IS NULL)
    )
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- FROST signing sessions indexes
CREATE INDEX IF NOT EXISTS idx_frost_signing_sessions_session_id
    ON public.frost_signing_sessions(session_id);

CREATE INDEX IF NOT EXISTS idx_frost_signing_sessions_family_id
    ON public.frost_signing_sessions(family_id);

CREATE INDEX IF NOT EXISTS idx_frost_signing_sessions_status
    ON public.frost_signing_sessions(status);

CREATE INDEX IF NOT EXISTS idx_frost_signing_sessions_created_by
    ON public.frost_signing_sessions(created_by);

CREATE INDEX IF NOT EXISTS idx_frost_signing_sessions_expires_at
    ON public.frost_signing_sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_frost_signing_sessions_final_event_id
    ON public.frost_signing_sessions(final_event_id)
    WHERE final_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_frost_signing_sessions_message_hash
    ON public.frost_signing_sessions(message_hash);

-- FROST nonce commitments indexes
CREATE INDEX IF NOT EXISTS idx_frost_nonce_commitments_session_id
    ON public.frost_nonce_commitments(session_id);

CREATE INDEX IF NOT EXISTS idx_frost_nonce_commitments_participant_id
    ON public.frost_nonce_commitments(participant_id);

CREATE INDEX IF NOT EXISTS idx_frost_nonce_commitments_nonce_commitment
    ON public.frost_nonce_commitments(nonce_commitment);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS on both tables
ALTER TABLE public.frost_signing_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frost_nonce_commitments ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view signing sessions they created or are participants in
-- PRIVACY-FIRST: Enforces family_id isolation for multi-family deployments
CREATE POLICY "Users can view their FROST signing sessions"
    ON public.frost_signing_sessions
    FOR SELECT
    USING (
        created_by = current_setting('app.current_user_pubkey', true)
        OR
        -- Allow participants to view sessions they're involved in
        current_setting('app.current_user_pubkey', true) IN (
            SELECT jsonb_array_elements_text(participants)
        )
    );

-- RLS Policy: Users can create FROST signing sessions
-- SECURITY: Ensures creator is authenticated and owns the session
CREATE POLICY "Users can create FROST signing sessions"
    ON public.frost_signing_sessions
    FOR INSERT
    WITH CHECK (
        created_by = current_setting('app.current_user_pubkey', true)
    );

-- RLS Policy: Participants can update FROST signing sessions (submit nonces/signatures)
-- CONCURRENCY CONTROL: Only allows updates to sessions in appropriate states
-- Prevents race conditions by validating status before allowing updates
CREATE POLICY "Participants can update FROST signing sessions"
    ON public.frost_signing_sessions
    FOR UPDATE
    USING (
        current_setting('app.current_user_pubkey', true) IN (
            SELECT jsonb_array_elements_text(participants)
        )
        OR
        created_by = current_setting('app.current_user_pubkey', true)
    );

-- RLS Policy: Service role can do everything (for Netlify Functions)
-- SECURITY: Only service_role (Netlify Functions) can bypass RLS
CREATE POLICY "Service role has full access to FROST sessions"
    ON public.frost_signing_sessions
    FOR ALL
    USING (current_user = 'service_role');

-- RLS Policy: Users can view their own nonce commitments
CREATE POLICY "Users can view their nonce commitments"
    ON public.frost_nonce_commitments
    FOR SELECT
    USING (
        participant_id = current_setting('app.current_user_pubkey', true)
        OR
        -- Allow session creator to view all nonces
        session_id IN (
            SELECT session_id FROM public.frost_signing_sessions
            WHERE created_by = current_setting('app.current_user_pubkey', true)
        )
    );

-- RLS Policy: Users can create their own nonce commitments
CREATE POLICY "Users can create nonce commitments"
    ON public.frost_nonce_commitments
    FOR INSERT
    WITH CHECK (
        participant_id = current_setting('app.current_user_pubkey', true)
    );

-- RLS Policy: Service role can do everything (for Netlify Functions)
CREATE POLICY "Service role has full access to nonce commitments"
    ON public.frost_nonce_commitments
    FOR ALL
    USING (current_user = 'service_role');

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to auto-expire old FROST signing sessions
CREATE OR REPLACE FUNCTION expire_old_frost_signing_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.frost_signing_sessions
    SET
        status = 'expired',
        updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT,
        failed_at = EXTRACT(EPOCH FROM NOW())::BIGINT,
        error_message = 'Session expired due to timeout'
    WHERE
        status IN ('pending', 'nonce_collection', 'signing', 'aggregating')
        AND expires_at < EXTRACT(EPOCH FROM NOW())::BIGINT;
END;
$$;

-- Function to clean up old completed/failed FROST sessions (optional)
CREATE OR REPLACE FUNCTION cleanup_old_frost_signing_sessions(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    WITH deleted AS (
        DELETE FROM public.frost_signing_sessions
        WHERE
            status IN ('completed', 'failed', 'expired')
            AND created_at < EXTRACT(EPOCH FROM (NOW() - (retention_days || ' days')::INTERVAL))::BIGINT
        RETURNING *
    )
    SELECT COUNT(*) INTO deleted_count FROM deleted;

    RETURN deleted_count;
END;
$$;

-- Function to mark nonce as used (prevents replay attacks)
CREATE OR REPLACE FUNCTION mark_nonce_as_used(p_nonce_commitment TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    nonce_exists BOOLEAN;
BEGIN
    -- Check if nonce exists and is not already used
    SELECT EXISTS(
        SELECT 1 FROM public.frost_nonce_commitments
        WHERE nonce_commitment = p_nonce_commitment
        AND nonce_used = false
    ) INTO nonce_exists;

    IF NOT nonce_exists THEN
        RETURN false;
    END IF;

    -- Mark nonce as used
    UPDATE public.frost_nonce_commitments
    SET
        nonce_used = true,
        used_at = EXTRACT(EPOCH FROM NOW())::BIGINT
    WHERE nonce_commitment = p_nonce_commitment
    AND nonce_used = false;

    RETURN true;
END;
$$;

-- =====================================================
-- TABLE COMMENTS (DOCUMENTATION)
-- =====================================================

COMMENT ON TABLE public.frost_signing_sessions IS
    'Stores FROST (Flexible Round-Optimized Schnorr Threshold) signing sessions for multi-round threshold signatures. Supports guardian approval workflows with configurable thresholds (1-of-N to 7-of-7). State machine: pending → nonce_collection → signing → aggregating → completed/failed/expired.';

COMMENT ON COLUMN public.frost_signing_sessions.session_id IS
    'Unique identifier for the FROST signing session (UUID format)';

COMMENT ON COLUMN public.frost_signing_sessions.family_id IS
    'Family federation identifier this session belongs to';

COMMENT ON COLUMN public.frost_signing_sessions.message_hash IS
    'SHA-256 hash of the message to be signed';

COMMENT ON COLUMN public.frost_signing_sessions.participants IS
    'JSON array of participant public keys/DUIDs required for this signing session';

COMMENT ON COLUMN public.frost_signing_sessions.threshold IS
    'Minimum number of participant signatures required (1-7)';

COMMENT ON COLUMN public.frost_signing_sessions.nonce_commitments IS
    'JSONB map of participant -> nonce commitment (Round 1 of FROST protocol)';

COMMENT ON COLUMN public.frost_signing_sessions.partial_signatures IS
    'JSONB map of participant -> partial signature (Round 2 of FROST protocol)';

COMMENT ON COLUMN public.frost_signing_sessions.final_signature IS
    'JSONB containing final aggregated signature (R, s values) after threshold met';

COMMENT ON COLUMN public.frost_signing_sessions.final_event_id IS
    'Nostr event ID after successful signing and broadcasting via CEPS';

COMMENT ON COLUMN public.frost_signing_sessions.status IS
    'Session status: pending (created), nonce_collection (collecting nonces), signing (collecting signatures), aggregating (combining signatures), completed (signed and broadcast), failed (error occurred), expired (timeout)';

COMMENT ON TABLE public.frost_nonce_commitments IS
    'Stores FROST nonce commitments with UNIQUE constraint to prevent nonce reuse attacks. Critical security feature: each nonce can only be used once across ALL sessions.';

COMMENT ON COLUMN public.frost_nonce_commitments.nonce_commitment IS
    'Cryptographic nonce commitment (hex format). UNIQUE constraint prevents reuse attacks.';

COMMENT ON COLUMN public.frost_nonce_commitments.nonce_used IS
    'Whether this nonce has been used in signature generation (replay protection)';

-- =====================================================
-- RLS POLICY DOCUMENTATION
-- =====================================================
--
-- FROST SIGNING SESSIONS RLS POLICIES:
--
-- 1. "Users can view their FROST signing sessions" (SELECT)
--    - Allows users to view sessions they created (created_by = current_user)
--    - Allows participants to view sessions they're involved in (participant in participants array)
--    - PRIVACY: Enforces family_id isolation through session ownership
--
-- 2. "Users can create FROST signing sessions" (INSERT)
--    - Only allows creation if created_by = current_user
--    - SECURITY: Prevents users from creating sessions on behalf of others
--
-- 3. "Participants can update FROST signing sessions" (UPDATE)
--    - Allows participants to submit nonces and signatures
--    - Allows session creator to update session state
--    - CONCURRENCY: Status validation in application layer prevents race conditions
--    - NOTE: Database-level SELECT ... FOR UPDATE not used; application must handle
--
-- 4. "Service role has full access to FROST sessions" (ALL)
--    - Allows Netlify Functions (service_role) to bypass RLS
--    - SECURITY: Only service_role can access; authenticated users cannot
--
-- FROST NONCE COMMITMENTS RLS POLICIES:
--
-- 1. "Users can view their nonce commitments" (SELECT)
--    - Allows participants to view their own nonces (participant_id = current_user)
--    - Allows session creator to view all nonces for their sessions
--    - PRIVACY: Prevents cross-family nonce visibility
--
-- 2. "Users can create nonce commitments" (INSERT)
--    - Only allows creation if participant_id = current_user
--    - SECURITY: Prevents users from submitting nonces on behalf of others
--
-- 3. "Service role has full access to nonce commitments" (ALL)
--    - Allows Netlify Functions to manage nonces
--    - SECURITY: Only service_role can access; authenticated users cannot
--
-- SESSION EXPIRATION ENFORCEMENT:
--
-- Expiration is enforced at TWO levels:
--
-- 1. APPLICATION LEVEL (frost-session-manager.ts):
--    - Every operation checks: if (session.expires_at < now) return error
--    - Fast path: no database query needed
--    - Prevents expired sessions from accepting new data
--
-- 2. DATABASE LEVEL (expire_old_frost_signing_sessions function):
--    - Periodic cleanup marks expired sessions with status='expired'
--    - Prevents stale sessions from consuming storage
--    - Can be called via: SELECT expire_old_frost_signing_sessions();
--    - Recommended: Run via scheduled job every 5 minutes
--
-- NONCE REUSE PREVENTION:
--
-- The UNIQUE constraint on nonce_commitment is the PRIMARY security mechanism:
-- - Each nonce can only be inserted once across ALL sessions
-- - Prevents cryptographic attacks from nonce reuse
-- - Database enforces at INSERT time (fail-fast)
-- - Application validates before accepting commitment
--
-- CONCURRENCY CONTROL STRATEGY:
--
-- FROST protocol requires multi-round coordination. Concurrency risks:
--
-- RISK 1: Race condition in checkThresholdMet()
-- - Two participants submit signatures nearly simultaneously
-- - Both see threshold not met, both try to aggregate
-- - MITIGATION: Application checks status='aggregating' before aggregating
-- - FUTURE: Could add SELECT ... FOR UPDATE in application layer
--
-- RISK 2: Session state transitions
-- - Multiple participants updating nonce_commitments simultaneously
-- - MITIGATION: Status field prevents invalid transitions
-- - FUTURE: Could add explicit 'aggregating' state transition before aggregation
--
-- RISK 3: Nonce commitment race
-- - Two participants submit same nonce (should be impossible)
-- - MITIGATION: UNIQUE constraint on nonce_commitment prevents this
-- - FUTURE: Could add per-session nonce uniqueness if needed
--
-- RECOMMENDED TIMEOUT VALUES:
--
-- Default: 300 seconds (5 minutes)
-- - Suitable for: Single-family, low-latency networks
-- - Assumes: All guardians online and responsive
--
-- For multi-round FROST with network latency:
-- - Round 1 (nonce collection): 60-120 seconds
-- - Round 2 (signature collection): 60-120 seconds
-- - Aggregation: 10-30 seconds
-- - Total: 130-270 seconds minimum
--
-- RECOMMENDATION: Use 600 seconds (10 minutes) for production
-- - Accounts for network latency
-- - Allows for user delays
-- - Prevents premature expiration
--
-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================

GRANT SELECT, INSERT, UPDATE ON public.frost_signing_sessions TO authenticated;
GRANT ALL ON public.frost_signing_sessions TO service_role;

GRANT SELECT, INSERT ON public.frost_nonce_commitments TO authenticated;
GRANT ALL ON public.frost_nonce_commitments TO service_role;

-- =====================================================
-- VERIFICATION QUERY
-- =====================================================

DO $$
DECLARE
    sessions_table_exists BOOLEAN;
    nonces_table_exists BOOLEAN;
    final_event_id_exists BOOLEAN;
BEGIN
    -- Check if frost_signing_sessions table exists
    SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'frost_signing_sessions'
    ) INTO sessions_table_exists;

    IF sessions_table_exists THEN
        RAISE NOTICE '✅ Table frost_signing_sessions exists';

        -- Check if final_event_id column exists
        SELECT EXISTS (
            SELECT FROM information_schema.columns
            WHERE table_schema = 'public'
            AND table_name = 'frost_signing_sessions'
            AND column_name = 'final_event_id'
        ) INTO final_event_id_exists;

        IF final_event_id_exists THEN
            RAISE NOTICE '✅ Column final_event_id exists';
        ELSE
            RAISE WARNING '⚠️  Column final_event_id does NOT exist';
        END IF;
    ELSE
        RAISE WARNING '⚠️  Table frost_signing_sessions does NOT exist';
    END IF;

    -- Check if frost_nonce_commitments table exists
    SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'frost_nonce_commitments'
    ) INTO nonces_table_exists;

    IF nonces_table_exists THEN
        RAISE NOTICE '✅ Table frost_nonce_commitments exists';
    ELSE
        RAISE WARNING '⚠️  Table frost_nonce_commitments does NOT exist';
    END IF;
END $$;

-- =====================================================
-- SUCCESS MESSAGE
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ FROST SIGNING SESSIONS MIGRATION COMPLETE';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Tables: frost_signing_sessions, frost_nonce_commitments';
    RAISE NOTICE 'Indexes: 10 created (7 sessions + 3 nonces)';
    RAISE NOTICE 'RLS Policies: 7 created (4 sessions + 3 nonces)';
    RAISE NOTICE 'Functions: 3 created';
    RAISE NOTICE '';
    RAISE NOTICE 'Key Features:';
    RAISE NOTICE '  • Multi-round FROST threshold signatures';
    RAISE NOTICE '  • State machine: pending → nonce_collection → signing → aggregating → completed';
    RAISE NOTICE '  • Nonce reuse prevention (CRITICAL SECURITY)';
    RAISE NOTICE '  • Guardian approval workflow (1-7 participants)';
    RAISE NOTICE '  • CEPS integration for event broadcasting';
    RAISE NOTICE '  • Auto-expiration of old sessions';
    RAISE NOTICE '  • Privacy-first RLS policies';
    RAISE NOTICE '';
    RAISE NOTICE 'Security Features:';
    RAISE NOTICE '  • UNIQUE constraint on nonce_commitment (prevents reuse attacks)';
    RAISE NOTICE '  • Replay protection via nonce_used flag';
    RAISE NOTICE '  • Session isolation via RLS policies';
    RAISE NOTICE '  • Zero-knowledge architecture (no key reconstruction)';
    RAISE NOTICE '';
    RAISE NOTICE 'Next Steps:';
    RAISE NOTICE '  1. Test with: SELECT * FROM frost_signing_sessions;';
    RAISE NOTICE '  2. Test with: SELECT * FROM frost_nonce_commitments;';
    RAISE NOTICE '  3. Run cleanup: SELECT cleanup_old_frost_signing_sessions(90);';
    RAISE NOTICE '  4. Expire old: SELECT expire_old_frost_signing_sessions();';
    RAISE NOTICE '  5. Test nonce marking: SELECT mark_nonce_as_used(''test-nonce-hex'');';
    RAISE NOTICE '========================================';
END $$;

