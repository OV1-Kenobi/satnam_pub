-- OTS Agent Proof Generation — Helper Function
-- Migration: 20260323_increment_ots_attestation_count
-- Purpose: Increment OTS attestation count and update last attestation timestamp for agents
-- Called by: netlify/functions_active/ots-proof-generator.js

-- ============================================================================
-- HELPER FUNCTION: Increment OTS Attestation Count
-- ============================================================================

CREATE OR REPLACE FUNCTION increment_ots_attestation_count(agent_pk TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE agent_profiles
  SET ots_attestation_count = ots_attestation_count + 1,
      last_ots_attestation_at = NOW()
  WHERE agent_pubkey = agent_pk;
  
  -- Log if no rows were updated (agent not found)
  IF NOT FOUND THEN
    RAISE WARNING 'Agent not found: %', agent_pk;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION increment_ots_attestation_count(TEXT) IS
  'Increment OTS attestation count and update last attestation timestamp for an agent. Called by ots-proof-generator.js after successful proof generation.';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'increment_ots_attestation_count'
  ) THEN
    RAISE NOTICE '✓ increment_ots_attestation_count function created successfully';
  ELSE
    RAISE EXCEPTION '✗ increment_ots_attestation_count function creation failed';
  END IF;
END $$;

