/**
 * Migration 036: Unified Attestations Table
 *
 * Creates a unified attestations table that serves as the single source of truth
 * for all attestation records, linking to both SimpleProof and Iroh verification tables.
 *
 * Fixes:
 * 1. ID Inconsistency: Client-side temp IDs now match database-generated UUIDs
 * 2. Event Type Data Loss: Actual event_type preserved (not hardcoded)
 *
 * Privacy-First: RLS policies ensure users can only access their own attestations
 * Idempotent: Safe to run multiple times
 *
 * DEPENDENCIES:
 * - multi_method_verification_results (migration 031) - REQUIRED
 * - simpleproof_timestamps (migration 034) - REQUIRED
 * - iroh_node_discovery (migration 035) - REQUIRED
 *
 * IMPORTANT: Ensure migrations 031, 034, and 035 have been run before this migration.
 */

-- Create unified attestations table
CREATE TABLE IF NOT EXISTS public.attestations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Link to verification attempt
    verification_id UUID NOT NULL REFERENCES public.multi_method_verification_results(id) ON DELETE CASCADE,

    -- Event metadata (CRITICAL FIX: stores actual event type, not hardcoded)
    -- Updated to include onboarding event types (Phase 10)
    event_type TEXT NOT NULL CHECK (event_type IN (
        'account_creation',
        'key_rotation',
        'nfc_registration',
        'family_federation',
        'guardian_role_change',
        'physical_peer_onboarding',
        'coordinator_attestation',
        'batch_onboarding_session'
    )),
    metadata JSONB,

    -- Links to verification methods (allows tracking which methods were used)
    -- Foreign keys are conditional on table existence (see below)
    simpleproof_timestamp_id UUID,
    iroh_discovery_id UUID,

    -- Status tracking (CRITICAL FIX: tracks partial success scenarios)
    status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'partial')),
    error_details JSONB,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure at least one verification method is linked
    CONSTRAINT at_least_one_method CHECK (
        simpleproof_timestamp_id IS NOT NULL OR iroh_discovery_id IS NOT NULL
    )
);

-- Add foreign key constraints if the referenced tables exist
-- This makes the migration more robust and handles dependency ordering

DO $$
BEGIN
    -- Add foreign key to simpleproof_timestamps if table exists
    -- CRITICAL: Use ON DELETE RESTRICT to prevent data integrity violations
    -- The at_least_one_method CHECK constraint requires at least one method to be non-NULL
    -- If we used ON DELETE SET NULL, deleting a simpleproof_timestamp would violate the constraint
    -- when it's the only method linked to an attestation
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'simpleproof_timestamps'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE table_schema = 'public'
            AND table_name = 'attestations'
            AND constraint_name = 'attestations_simpleproof_fk'
        ) THEN
            ALTER TABLE public.attestations
            ADD CONSTRAINT attestations_simpleproof_fk
            FOREIGN KEY (simpleproof_timestamp_id)
            REFERENCES public.simpleproof_timestamps(id) ON DELETE RESTRICT;
        END IF;
    END IF;

    -- Add foreign key to iroh_node_discovery if table exists
    -- CRITICAL: Use ON DELETE RESTRICT to prevent data integrity violations
    -- Same reasoning as above: prevents violating the at_least_one_method constraint
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'iroh_node_discovery'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE table_schema = 'public'
            AND table_name = 'attestations'
            AND constraint_name = 'attestations_iroh_fk'
        ) THEN
            ALTER TABLE public.attestations
            ADD CONSTRAINT attestations_iroh_fk
            FOREIGN KEY (iroh_discovery_id)
            REFERENCES public.iroh_node_discovery(id) ON DELETE RESTRICT;
        END IF;
    END IF;
END $$;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_attestations_verification 
    ON public.attestations(verification_id);
CREATE INDEX IF NOT EXISTS idx_attestations_event_type 
    ON public.attestations(event_type);
CREATE INDEX IF NOT EXISTS idx_attestations_created 
    ON public.attestations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attestations_status 
    ON public.attestations(status);

-- Enable RLS for privacy-first access control
ALTER TABLE public.attestations ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access attestations linked to their verification attempts
-- This ensures users can only see attestations they created
-- Idempotent: Drop and recreate to ensure correct definition
DO $$
BEGIN
    -- Drop existing policy if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.role_table_grants
        WHERE table_schema = 'public' AND table_name = 'attestations'
    ) THEN
        DROP POLICY IF EXISTS attestations_user_access ON public.attestations;
    END IF;
END $$;

CREATE POLICY attestations_user_access ON public.attestations
    FOR ALL
    USING (
        verification_id IN (
            SELECT id FROM public.multi_method_verification_results
            WHERE user_duid = auth.uid()::text
        )
    );

-- Create function to automatically update updated_at timestamp
-- Idempotent: CREATE OR REPLACE handles re-runs
CREATE OR REPLACE FUNCTION public.update_attestations_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to call update function before any UPDATE
-- Idempotent: Drop and recreate to ensure correct definition
DO $$
BEGIN
    DROP TRIGGER IF EXISTS update_attestations_timestamp ON public.attestations;
END $$;

CREATE TRIGGER update_attestations_timestamp
    BEFORE UPDATE ON public.attestations
    FOR EACH ROW
    EXECUTE FUNCTION public.update_attestations_timestamp();

-- Helper function: Create attestation record
-- Idempotent: CREATE OR REPLACE handles re-runs
CREATE OR REPLACE FUNCTION public.create_attestation(
    p_verification_id UUID,
    p_event_type TEXT,
    p_metadata JSONB,
    p_simpleproof_timestamp_id UUID DEFAULT NULL,
    p_iroh_discovery_id UUID DEFAULT NULL,
    p_status TEXT DEFAULT 'pending'
) RETURNS UUID AS $$
DECLARE
    v_attestation_id UUID;
BEGIN
    INSERT INTO public.attestations (
        verification_id,
        event_type,
        metadata,
        simpleproof_timestamp_id,
        iroh_discovery_id,
        status
    ) VALUES (
        p_verification_id,
        p_event_type,
        p_metadata,
        p_simpleproof_timestamp_id,
        p_iroh_discovery_id,
        p_status
    )
    RETURNING id INTO v_attestation_id;

    RETURN v_attestation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function: Update attestation status
-- Idempotent: CREATE OR REPLACE handles re-runs
CREATE OR REPLACE FUNCTION public.update_attestation_status(
    p_attestation_id UUID,
    p_status TEXT,
    p_error_details JSONB DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
    UPDATE public.attestations
    SET
        status = p_status,
        error_details = p_error_details,
        updated_at = NOW()
    WHERE id = p_attestation_id;

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function: Get attestation with all details
-- Idempotent: CREATE OR REPLACE handles re-runs
CREATE OR REPLACE FUNCTION public.get_attestation_details(
    p_attestation_id UUID
) RETURNS TABLE (
    id UUID,
    verification_id UUID,
    event_type TEXT,
    metadata JSONB,
    status TEXT,
    error_details JSONB,
    simpleproof_id UUID,
    simpleproof_ots_proof TEXT,
    simpleproof_bitcoin_block INTEGER,
    simpleproof_bitcoin_tx VARCHAR,
    simpleproof_is_valid BOOLEAN,
    iroh_id UUID,
    iroh_node_id VARCHAR,
    iroh_relay_url VARCHAR,
    iroh_is_reachable BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        a.id,
        a.verification_id,
        a.event_type,
        a.metadata,
        a.status,
        a.error_details,
        sp.id,
        sp.ots_proof,
        sp.bitcoin_block,
        sp.bitcoin_tx,
        sp.is_valid,
        iroh.id,
        iroh.node_id,
        iroh.relay_url,
        iroh.is_reachable,
        a.created_at,
        a.updated_at
    FROM public.attestations a
    LEFT JOIN public.simpleproof_timestamps sp ON a.simpleproof_timestamp_id = sp.id
    LEFT JOIN public.iroh_node_discovery iroh ON a.iroh_discovery_id = iroh.id
    WHERE a.id = p_attestation_id;
END;
$$ LANGUAGE plpgsql;

