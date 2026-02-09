-- Migration: Create NIP-03 Attestation Transaction Function
-- Purpose: Atomic database operations for NIP-03 attestation creation
-- Date: 2026-02-07
-- 
-- This function ensures data integrity by performing all NIP-03 attestation
-- operations in a single transaction. If any operation fails, the entire
-- transaction is rolled back to prevent inconsistent state.

CREATE OR REPLACE FUNCTION create_nip03_attestation_transaction(
  p_attested_event_id TEXT,
  p_attested_event_kind INTEGER,
  p_nip03_event_id TEXT,
  p_nip03_event_kind INTEGER,
  p_simpleproof_timestamp_id TEXT,
  p_ots_proof TEXT,
  p_event_type TEXT,
  p_user_duid TEXT,
  p_relay_urls TEXT[],
  p_published_at INTEGER,
  p_metadata JSONB,
  p_participant_id TEXT,
  p_updated_at TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_attestation_id BIGINT;
  v_result JSONB;
BEGIN
  -- Start transaction (implicit in function)
  
  -- 1. Create NIP-03 attestation record
  INSERT INTO nip03_attestations (
    attested_event_id,
    attested_event_kind,
    nip03_event_id,
    nip03_event_kind,
    simpleproof_timestamp_id,
    ots_proof,
    bitcoin_block,
    bitcoin_tx,
    event_type,
    user_duid,
    relay_urls,
    published_at,
    verified_at,
    metadata
  ) VALUES (
    p_attested_event_id,
    p_attested_event_kind,
    p_nip03_event_id,
    p_nip03_event_kind,
    p_simpleproof_timestamp_id,
    p_ots_proof,
    NULL, -- bitcoin_block (will be updated when OTS is verified)
    NULL, -- bitcoin_tx (will be updated when OTS is verified)
    p_event_type,
    p_user_duid,
    p_relay_urls,
    p_published_at,
    NULL, -- verified_at (will be set when Bitcoin confirmation is available)
    p_metadata
  ) RETURNING id INTO v_attestation_id;
  
  -- 2. Update participant record with NIP-03 event ID
  UPDATE onboarded_identities 
  SET 
    nip03_event_id = p_nip03_event_id,
    updated_at = p_updated_at::TIMESTAMP WITH TIME ZONE
  WHERE participant_id = p_participant_id;
  
  -- Check if participant update was successful
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant not found: %', p_participant_id;
  END IF;
  
  -- Return success result
  v_result := jsonb_build_object(
    'success', true,
    'attestation_id', v_attestation_id,
    'nip03_event_id', p_nip03_event_id
  );
  
  RETURN v_result;
  
EXCEPTION
  WHEN OTHERS THEN
    -- Transaction will be automatically rolled back
    RAISE EXCEPTION 'NIP-03 attestation transaction failed: %', SQLERRM;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_nip03_attestation_transaction TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION create_nip03_attestation_transaction IS 
'Atomically creates NIP-03 attestation record and updates participant. Ensures data integrity by rolling back on any failure.';
