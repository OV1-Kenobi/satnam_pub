-- Migration 065: Remove obsolete UUID-based federation creation function overload
--
-- PURPOSE: The database contains two overloaded versions of
-- create_federation_with_founding_member: one with p_charter_id UUID (legacy)
-- and one with p_charter_id TEXT (privacy-first DUID). This causes runtime
-- ambiguity when the application calls the RPC via Supabase, since PostgreSQL
-- cannot automatically choose between the UUID and TEXT overloads.
--
-- This migration removes ONLY the obsolete UUID-based overload so that the
-- TEXT-based function introduced in migration 064 is the sole definition.
--
-- IDEMPOTENT: Yes - uses DROP FUNCTION IF EXISTS and does not modify schemas.

DROP FUNCTION IF EXISTS create_federation_with_founding_member(
  uuid,
  text,
  text,
  text,
  integer,
  text,
  integer,
  integer
);

