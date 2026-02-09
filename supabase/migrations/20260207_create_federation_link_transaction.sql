-- Migration: Create Federation Link Transaction Function
-- Purpose: Atomic database operations for linking participants to federations
-- Date: 2026-02-07
-- 
-- This function ensures data integrity by performing both family_members insert
-- and onboarded_identities update in a single transaction. If any operation fails,
-- the entire transaction is rolled back to prevent inconsistent state.

CREATE OR REPLACE FUNCTION link_participant_to_federation_transaction(
  p_federation_duid TEXT,
  p_user_duid TEXT,
  p_role TEXT,
  p_joined_at TEXT,
  p_metadata JSONB,
  p_participant_id TEXT,
  p_federation_id TEXT,
  p_updated_at TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_membership_id BIGINT;
  v_result JSONB;
BEGIN
  -- Start transaction (implicit in function)
  
  -- 1. Create family_members record
  INSERT INTO family_members (
    federation_duid,
    user_duid,
    role,
    joined_at,
    metadata
  ) VALUES (
    p_federation_duid,
    p_user_duid,
    p_role,
    p_joined_at::TIMESTAMP WITH TIME ZONE,
    p_metadata
  ) RETURNING id INTO v_membership_id;
  
  -- 2. Update participant record with federation ID
  UPDATE onboarded_identities 
  SET 
    federation_id = p_federation_id,
    updated_at = p_updated_at::TIMESTAMP WITH TIME ZONE
  WHERE participant_id = p_participant_id;
  
  -- Check if participant update was successful
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant not found: %', p_participant_id;
  END IF;
  
  -- Return success result
  v_result := jsonb_build_object(
    'success', true,
    'membership_id', v_membership_id,
    'federation_id', p_federation_id
  );
  
  RETURN v_result;
  
EXCEPTION
  WHEN OTHERS THEN
    -- Transaction will be automatically rolled back
    RAISE EXCEPTION 'Federation link transaction failed: %', SQLERRM;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION link_participant_to_federation_transaction TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION link_participant_to_federation_transaction IS 
'Atomically creates family membership and updates participant federation status. Ensures data integrity by rolling back on any failure.';
