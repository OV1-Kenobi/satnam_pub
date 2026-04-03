-- Agent Skill Management Functions
-- Migration: 20260323_agent_skill_management_functions
-- Purpose: Create helper functions for enabling/disabling agent skills
-- Aligned with: netlify/functions_active/nip-sa-agent.js

-- ============================================================================
-- ENABLE AGENT SKILL
-- ============================================================================
-- Adds a skill_scope_id to agent's enabled_skill_scope_ids array

CREATE OR REPLACE FUNCTION enable_agent_skill(agent_pk TEXT, skill_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE agent_profiles
  SET enabled_skill_scope_ids = array_append(enabled_skill_scope_ids, skill_id)
  WHERE agent_pubkey = agent_pk
    AND NOT (enabled_skill_scope_ids @> ARRAY[skill_id]); -- Only add if not already present
END;
$$;

REVOKE EXECUTE ON FUNCTION enable_agent_skill FROM PUBLIC;
GRANT EXECUTE ON FUNCTION enable_agent_skill TO authenticated;

COMMENT ON FUNCTION enable_agent_skill IS
  'Adds a skill_scope_id to agent''s enabled_skill_scope_ids array (idempotent)';

-- ============================================================================
-- DISABLE AGENT SKILL
-- ============================================================================
-- Removes a skill_scope_id from agent's enabled_skill_scope_ids array

CREATE OR REPLACE FUNCTION disable_agent_skill(agent_pk TEXT, skill_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE agent_profiles
  SET enabled_skill_scope_ids = array_remove(enabled_skill_scope_ids, skill_id)
  WHERE agent_pubkey = agent_pk;
END;
$$;

REVOKE EXECUTE ON FUNCTION disable_agent_skill FROM PUBLIC;
GRANT EXECUTE ON FUNCTION disable_agent_skill TO authenticated;

COMMENT ON FUNCTION disable_agent_skill IS
  'Removes a skill_scope_id from agent''s enabled_skill_scope_ids array';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'enable_agent_skill'
  ) THEN
    RAISE NOTICE '✓ enable_agent_skill function created';
  ELSE
    RAISE EXCEPTION '✗ enable_agent_skill function creation failed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'disable_agent_skill'
  ) THEN
    RAISE NOTICE '✓ disable_agent_skill function created';
  ELSE
    RAISE EXCEPTION '✗ disable_agent_skill function creation failed';
  END IF;
END $$;

