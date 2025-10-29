-- Migration 041: NIP-03 Attestation System
-- Purpose: Create infrastructure for NIP-03 Kind:1040 attestation events
-- Scope: Identity creation, key rotation, and role change attestations
-- Status: Production-ready with comprehensive RLS policies

-- ============================================================================
-- TABLE: nip03_attestations
-- ============================================================================
-- Tracks NIP-03 Kind:1040 attestation events published to Nostr relays
-- Links original events (Kind:0, Kind:1776, Kind:1777, role changes) to their
-- OpenTimestamps proofs and blockchain confirmations

CREATE TABLE IF NOT EXISTS public.nip03_attestations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Reference to original event being attested
    attested_event_id VARCHAR(64) NOT NULL,
    attested_event_kind INTEGER NOT NULL,
    
    -- NIP-03 Kind:1040 event details
    nip03_event_id VARCHAR(64) NOT NULL UNIQUE,
    nip03_event_kind INTEGER DEFAULT 1040 CHECK (nip03_event_kind = 1040),
    
    -- OpenTimestamps proof reference
    simpleproof_timestamp_id UUID REFERENCES simpleproof_timestamps(id),
    ots_proof TEXT NOT NULL,
    bitcoin_block INTEGER,
    bitcoin_tx VARCHAR(64),
    
    -- Event context
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN (
        'identity_creation', 'profile_update', 'key_rotation', 
        'role_change', 'custom_attestation'
    )),
    
    -- User context
    user_duid VARCHAR(50) NOT NULL,
    
    -- Publishing details
    relay_urls TEXT[] DEFAULT ARRAY['wss://relay.satnam.pub'],
    published_at BIGINT NOT NULL,
    verified_at BIGINT,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
    updated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
    
    -- Constraints
    CONSTRAINT user_fk FOREIGN KEY (user_duid)
        REFERENCES user_identities(id) ON DELETE CASCADE,
    CONSTRAINT bitcoin_tx_format CHECK (bitcoin_tx IS NULL OR bitcoin_tx ~ '^[a-fA-F0-9]{64}$')
);

-- ============================================================================
-- INDEXES
-- ============================================================================
-- Performance indexes for common query patterns

CREATE INDEX IF NOT EXISTS idx_nip03_attested_event ON nip03_attestations(attested_event_id);
CREATE INDEX IF NOT EXISTS idx_nip03_user ON nip03_attestations(user_duid);
CREATE INDEX IF NOT EXISTS idx_nip03_event_type ON nip03_attestations(event_type);
CREATE INDEX IF NOT EXISTS idx_nip03_published ON nip03_attestations(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_nip03_simpleproof ON nip03_attestations(simpleproof_timestamp_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================
-- Enforce privacy-first access control: users can only access their own attestations

ALTER TABLE nip03_attestations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own attestations
CREATE POLICY nip03_attestations_select_own ON nip03_attestations
    FOR SELECT
    USING (user_duid = auth.uid()::text);

-- Policy: Users can insert attestations for themselves
CREATE POLICY nip03_attestations_insert_own ON nip03_attestations
    FOR INSERT
    WITH CHECK (user_duid = auth.uid()::text);

-- Policy: Users can update their own attestations
CREATE POLICY nip03_attestations_update_own ON nip03_attestations
    FOR UPDATE
    USING (user_duid = auth.uid()::text)
    WITH CHECK (user_duid = auth.uid()::text);

-- Policy: Users can delete their own attestations
CREATE POLICY nip03_attestations_delete_own ON nip03_attestations
    FOR DELETE
    USING (user_duid = auth.uid()::text);

-- Policy: Service role can perform all operations (for backend services)
CREATE POLICY nip03_attestations_service_all ON nip03_attestations
    FOR ALL
    USING (auth.role() = 'service')
    WITH CHECK (auth.role() = 'service');

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function: Create NIP-03 attestation for an event
CREATE OR REPLACE FUNCTION create_nip03_attestation(
    p_attested_event_id VARCHAR(64),
    p_attested_event_kind INTEGER,
    p_nip03_event_id VARCHAR(64),
    p_simpleproof_timestamp_id UUID,
    p_ots_proof TEXT,
    p_event_type VARCHAR(50),
    p_relay_urls TEXT[] DEFAULT ARRAY['wss://relay.satnam.pub'],
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
    v_user_duid VARCHAR(50);
    v_attestation_id UUID;
BEGIN
    -- Get current user's DUID
    v_user_duid := auth.uid()::text;
    
    IF v_user_duid IS NULL THEN
        RAISE EXCEPTION 'User not authenticated';
    END IF;
    
    -- Insert attestation record
    INSERT INTO nip03_attestations (
        attested_event_id,
        attested_event_kind,
        nip03_event_id,
        simpleproof_timestamp_id,
        ots_proof,
        event_type,
        user_duid,
        relay_urls,
        published_at,
        metadata
    ) VALUES (
        p_attested_event_id,
        p_attested_event_kind,
        p_nip03_event_id,
        p_simpleproof_timestamp_id,
        p_ots_proof,
        p_event_type,
        v_user_duid,
        p_relay_urls,
        EXTRACT(EPOCH FROM NOW())::BIGINT,
        p_metadata
    )
    RETURNING id INTO v_attestation_id;
    
    RETURN v_attestation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Update attestation with blockchain confirmation
CREATE OR REPLACE FUNCTION update_nip03_blockchain_confirmation(
    p_attestation_id UUID,
    p_bitcoin_block INTEGER,
    p_bitcoin_tx VARCHAR(64)
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE nip03_attestations
    SET 
        bitcoin_block = p_bitcoin_block,
        bitcoin_tx = p_bitcoin_tx,
        verified_at = EXTRACT(EPOCH FROM NOW())::BIGINT,
        updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT
    WHERE id = p_attestation_id
    AND user_duid = auth.uid()::text;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- SCHEMA EXTENSION: pkarr_records
-- ============================================================================
-- Link PKARR records to their NIP-03 attestations (optional)

ALTER TABLE pkarr_records ADD COLUMN IF NOT EXISTS nip03_attestation_id UUID 
    REFERENCES nip03_attestations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pkarr_nip03_attestation ON pkarr_records(nip03_attestation_id);

-- ============================================================================
-- MIGRATION VALIDATION
-- ============================================================================
-- Verify table structure and constraints

DO $$
BEGIN
    -- Verify table exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'nip03_attestations'
    ) THEN
        RAISE EXCEPTION 'nip03_attestations table creation failed';
    END IF;
    
    -- Verify RLS is enabled
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = 'nip03_attestations' AND rowsecurity = true
    ) THEN
        RAISE EXCEPTION 'RLS not enabled on nip03_attestations';
    END IF;
    
    RAISE NOTICE 'Migration 041: NIP-03 attestations table created successfully';
END $$;

