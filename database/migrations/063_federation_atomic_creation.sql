-- Migration 063: Atomic Federation Creation with Founding Member
-- 
-- PURPOSE: Ensure transactional atomicity for federation creation.
-- If federation creation succeeds but founding member creation fails,
-- the user cannot see their own federation in the dashboard (orphaned federation).
-- This RPC function wraps both operations in a single transaction.
--
-- IDEMPOTENT: Yes - uses CREATE OR REPLACE FUNCTION
-- ROLLBACK: Automatic via PostgreSQL transaction semantics

-- ============================================================================
-- ATOMIC FEDERATION CREATION FUNCTION
-- ============================================================================
-- Creates both the federation record AND the founding member in a single
-- transaction. If either operation fails, both are rolled back.
--
-- PARAMETERS:
--   p_charter_id        - UUID of the family charter
--   p_federation_name   - Display name of the federation
--   p_federation_duid   - Privacy-first DUID identifier
--   p_user_duid         - DUID of the founding user
--   p_frost_threshold   - FROST signing threshold (1-5)
--   p_nfc_mfa_policy    - NFC MFA policy string
--   p_nfc_mfa_amount_threshold - Amount threshold for NFC MFA
--   p_nfc_mfa_threshold - Number of stewards required for NFC MFA
--
-- RETURNS: JSONB with success status, federation_id, member_id, or error

CREATE OR REPLACE FUNCTION create_federation_with_founding_member(
  p_charter_id UUID,
  p_federation_name TEXT,
  p_federation_duid TEXT,
  p_user_duid TEXT,
  p_frost_threshold INTEGER DEFAULT 2,
  p_nfc_mfa_policy TEXT DEFAULT 'required_for_high_value',
  p_nfc_mfa_amount_threshold INTEGER DEFAULT 100000,
  p_nfc_mfa_threshold INTEGER DEFAULT 2
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_federation_id UUID;
  v_member_id UUID;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Validate required parameters
  IF p_charter_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'charter_id is required');
  END IF;
  
  IF p_federation_name IS NULL OR p_federation_name = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'federation_name is required');
  END IF;
  
  IF p_federation_duid IS NULL OR p_federation_duid = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'federation_duid is required');
  END IF;
  
  IF p_user_duid IS NULL OR p_user_duid = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_duid is required');
  END IF;

  -- STEP 1: Create federation record
  INSERT INTO family_federations (
    charter_id,
    federation_name,
    federation_duid,
    status,
    progress,
    created_by,
    frost_threshold,
    nfc_mfa_policy,
    nfc_mfa_amount_threshold,
    nfc_mfa_threshold,
    created_at,
    updated_at
  )
  VALUES (
    p_charter_id,
    p_federation_name,
    p_federation_duid,
    'active',
    100,
    p_user_duid,
    COALESCE(p_frost_threshold, 2),
    p_nfc_mfa_policy,
    p_nfc_mfa_amount_threshold,
    COALESCE(p_nfc_mfa_threshold, 2),
    v_now,
    v_now
  )
  RETURNING id INTO v_federation_id;

  -- STEP 2: Create founding member record
  INSERT INTO family_members (
    family_federation_id,
    federation_duid,
    user_duid,
    family_role,
    role,
    joined_via,
    spending_approval_required,
    voting_power,
    is_active,
    joined_at,
    created_at,
    updated_at
  )
  VALUES (
    v_federation_id,
    p_federation_duid,
    p_user_duid,
    'guardian',
    'guardian',
    'founder',
    false,
    1,
    true,
    v_now,
    v_now,
    v_now
  )
  RETURNING id INTO v_member_id;

  -- Both operations succeeded - transaction will commit
  RETURN jsonb_build_object(
    'success', true,
    'federation_id', v_federation_id,
    'federation_duid', p_federation_duid,
    'member_id', v_member_id,
    'created_at', v_now
  );

EXCEPTION
  WHEN unique_violation THEN
    -- Handle duplicate federation name constraint
    RETURN jsonb_build_object(
      'success', false,
      'error', 'A federation with this name already exists',
      'code', 'DUPLICATE_FEDERATION_NAME'
    );
  WHEN OTHERS THEN
    -- Transaction will be automatically rolled back
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Transaction failed: ' || SQLERRM,
      'code', 'TRANSACTION_FAILED'
    );
END;
$$;

-- Grant execute to service role (admin operations only)
GRANT EXECUTE ON FUNCTION create_federation_with_founding_member TO service_role;

-- Add documentation
COMMENT ON FUNCTION create_federation_with_founding_member IS 
  'Atomically creates a federation and its founding member in a single transaction. '
  'If either operation fails, both are rolled back to prevent orphaned federations.';

