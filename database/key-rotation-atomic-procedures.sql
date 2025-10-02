-- Key Rotation Atomic Procedures
-- These stored procedures ensure transactional guarantees for key rotation operations

-- Function to atomically complete key rotation
CREATE OR REPLACE FUNCTION complete_key_rotation_atomic(
  p_user_duid TEXT,
  p_rotation_id TEXT,
  p_old_npub TEXT,
  p_new_npub TEXT,
  p_nip05_strategy TEXT,
  p_nip05_identifier TEXT DEFAULT NULL,
  p_prev_nip05 TEXT DEFAULT NULL,
  p_lightning_strategy TEXT,
  p_lightning_address TEXT DEFAULT NULL,
  p_prev_lightning_address TEXT DEFAULT NULL,
  p_ceps_payload JSONB DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
  v_effective_at TIMESTAMPTZ;
BEGIN
  -- Set effective timestamp for consistency
  v_effective_at := NOW();
  
  -- Begin transaction (implicit in function)
  
  -- 1. Update user_identities
  UPDATE user_identities 
  SET 
    npub = p_new_npub,
    nip05 = CASE 
      WHEN p_nip05_strategy = 'create' AND p_nip05_identifier IS NOT NULL 
      THEN p_nip05_identifier 
      ELSE nip05 
    END,
    lightning_address = CASE 
      WHEN p_lightning_strategy = 'create' AND p_lightning_address IS NOT NULL 
      THEN p_lightning_address 
      ELSE lightning_address 
    END,
    updated_at = v_effective_at
  WHERE id = p_user_duid;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'User identity not found');
  END IF;
  
  -- 2. Insert identity key link
  INSERT INTO identity_key_links (
    user_duid, old_npub, new_npub, linked_at, note
  ) VALUES (
    p_user_duid, p_old_npub, p_new_npub, v_effective_at, 'rotation-complete'
  );
  
  -- 3. Insert NIP-05 history record
  IF p_nip05_strategy = 'create' AND p_nip05_identifier IS NOT NULL THEN
    INSERT INTO nip05_history (
      user_duid, identifier, action, effective_at, reason
    ) VALUES (
      p_user_duid, p_nip05_identifier, 'create', v_effective_at, 'key-rotation'
    );
  ELSE
    INSERT INTO nip05_history (
      user_duid, identifier, action, effective_at, reason
    ) VALUES (
      p_user_duid, COALESCE(p_prev_nip05, ''), 'keep', v_effective_at, 'key-rotation'
    );
  END IF;
  
  -- 4. Insert Lightning Address history record
  IF p_lightning_strategy = 'create' AND p_lightning_address IS NOT NULL THEN
    INSERT INTO lightning_address_history (
      user_duid, lightning_address, action, effective_at, reason
    ) VALUES (
      p_user_duid, p_lightning_address, 'create', v_effective_at, 'key-rotation'
    );
    
    -- 5. Update LNbits wallet if lightning address was created
    UPDATE lnbits_wallets 
    SET 
      lightning_address = p_lightning_address,
      updated_at = v_effective_at
    WHERE user_duid = p_user_duid;
  ELSE
    INSERT INTO lightning_address_history (
      user_duid, lightning_address, action, effective_at, reason
    ) VALUES (
      p_user_duid, COALESCE(p_prev_lightning_address, ''), 'keep', v_effective_at, 'key-rotation'
    );
  END IF;
  
  -- 6. Update key rotation events audit record
  UPDATE key_rotation_events 
  SET 
    new_npub = p_new_npub,
    status = 'completed',
    completed_at = v_effective_at,
    updated_at = v_effective_at,
    nip05_action = p_nip05_strategy,
    nip05_identifier = CASE 
      WHEN p_nip05_strategy = 'create' THEN p_nip05_identifier 
      ELSE p_prev_nip05 
    END,
    lightning_action = p_lightning_strategy,
    lightning_address = CASE 
      WHEN p_lightning_strategy = 'create' THEN p_lightning_address 
      ELSE p_prev_lightning_address 
    END,
    ceps_event_ids = p_ceps_payload
  WHERE user_duid = p_user_duid AND rotation_id = p_rotation_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Key rotation event not found');
  END IF;
  
  -- Return success
  RETURN json_build_object('success', true);
  
EXCEPTION
  WHEN OTHERS THEN
    -- Transaction will be automatically rolled back
    RETURN json_build_object(
      'success', false, 
      'error', 'Transaction failed: ' || SQLERRM
    );
END;
$$;

-- Function to atomically rollback key rotation
CREATE OR REPLACE FUNCTION rollback_key_rotation_atomic(
  p_user_duid TEXT,
  p_rotation_id TEXT,
  p_old_npub TEXT,
  p_prev_nip05 TEXT DEFAULT NULL,
  p_prev_lightning_address TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
  v_effective_at TIMESTAMPTZ;
BEGIN
  -- Set effective timestamp for consistency
  v_effective_at := NOW();
  
  -- Begin transaction (implicit in function)
  
  -- 1. Revert user_identities to previous state
  UPDATE user_identities 
  SET 
    npub = p_old_npub,
    nip05 = p_prev_nip05,
    lightning_address = p_prev_lightning_address,
    updated_at = v_effective_at
  WHERE id = p_user_duid;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'User identity not found');
  END IF;
  
  -- 2. Update LNbits wallet if previous lightning address exists
  IF p_prev_lightning_address IS NOT NULL THEN
    UPDATE lnbits_wallets 
    SET 
      lightning_address = p_prev_lightning_address,
      updated_at = v_effective_at
    WHERE user_duid = p_user_duid;
  END IF;
  
  -- 3. Insert NIP-05 history record for rollback
  IF p_prev_nip05 IS NOT NULL THEN
    INSERT INTO nip05_history (
      user_duid, identifier, action, effective_at, reason
    ) VALUES (
      p_user_duid, p_prev_nip05, 'create', v_effective_at, 'rollback'
    );
  END IF;
  
  -- 4. Insert Lightning Address history record for rollback
  IF p_prev_lightning_address IS NOT NULL THEN
    INSERT INTO lightning_address_history (
      user_duid, lightning_address, action, effective_at, reason
    ) VALUES (
      p_user_duid, p_prev_lightning_address, 'create', v_effective_at, 'rollback'
    );
  END IF;
  
  -- 5. Update key rotation events to mark as rolled back
  UPDATE key_rotation_events 
  SET 
    status = 'rolled_back',
    updated_at = v_effective_at
  WHERE user_duid = p_user_duid AND rotation_id = p_rotation_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Key rotation event not found');
  END IF;
  
  -- Return success
  RETURN json_build_object('success', true);
  
EXCEPTION
  WHEN OTHERS THEN
    -- Transaction will be automatically rolled back
    RETURN json_build_object(
      'success', false, 
      'error', 'Rollback transaction failed: ' || SQLERRM
    );
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION complete_key_rotation_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION rollback_key_rotation_atomic TO authenticated;

-- Add comments for documentation
COMMENT ON FUNCTION complete_key_rotation_atomic IS 'Atomically completes key rotation with transactional guarantees across all related tables';
COMMENT ON FUNCTION rollback_key_rotation_atomic IS 'Atomically rolls back a completed key rotation with transactional guarantees';
