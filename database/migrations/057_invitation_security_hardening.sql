-- Migration: 057_invitation_security_hardening.sql
-- Description: Family Federation Invitation Security Hardening - Safeword Verification
-- Date: 2025-12-06
--
-- Security Model:
-- - Safeword is a verbal passphrase shared out-of-band (phone call, in-person)
-- - Stored as SHA-256 hash with per-invitation random salt
-- - 3 failed attempts lock the invitation for 1 hour (rate limiting)
-- - Prevents stolen invitation links from being accepted without verbal confirmation
--
-- Backward Compatibility:
-- - require_safeword defaults to FALSE for existing rows
-- - New invitations default to TRUE (requiring safeword)
-- - Accept endpoint handles both cases

-- ============================================================
-- ADD SAFEWORD COLUMNS TO FAMILY_FEDERATION_INVITATIONS
-- ============================================================

-- Add safeword_hash column (SHA-256 hash of safeword)
ALTER TABLE family_federation_invitations
ADD COLUMN IF NOT EXISTS safeword_hash TEXT;

-- Add safeword_salt column (random salt for hashing)
ALTER TABLE family_federation_invitations
ADD COLUMN IF NOT EXISTS safeword_salt TEXT;

-- Add safeword_attempts column (failed verification counter)
ALTER TABLE family_federation_invitations
ADD COLUMN IF NOT EXISTS safeword_attempts INTEGER DEFAULT 0;

-- Add safeword_locked_until column (lockout timestamp after 3 failed attempts)
ALTER TABLE family_federation_invitations
ADD COLUMN IF NOT EXISTS safeword_locked_until TIMESTAMP WITH TIME ZONE;

-- Add require_safeword column (per-invitation toggle)
-- Default FALSE for backward compatibility with existing invitations
-- New invitations created via API will explicitly set this to TRUE
ALTER TABLE family_federation_invitations
ADD COLUMN IF NOT EXISTS require_safeword BOOLEAN DEFAULT FALSE;

-- ============================================================
-- SAFEWORD VERIFICATION FUNCTION
-- ============================================================
-- Uses SHA-256 with salt for hashing
-- Implements rate limiting: 3 attempts, 1-hour lockout
-- Returns TRUE on successful verification, FALSE otherwise

CREATE OR REPLACE FUNCTION verify_invitation_safeword(
  p_invitation_id UUID,
  p_safeword TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stored_hash TEXT;
  v_salt TEXT;
  v_attempts INTEGER;
  v_locked_until TIMESTAMP WITH TIME ZONE;
  v_computed_hash TEXT;
  v_require_safeword BOOLEAN;
BEGIN
  -- Fetch safeword verification data
  SELECT 
    safeword_hash, 
    safeword_salt, 
    safeword_attempts, 
    safeword_locked_until,
    require_safeword
  INTO 
    v_stored_hash, 
    v_salt, 
    v_attempts, 
    v_locked_until,
    v_require_safeword
  FROM family_federation_invitations
  WHERE id = p_invitation_id;
  
  -- If invitation not found, return FALSE
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- If safeword not required, return TRUE (skip verification)
  IF v_require_safeword IS NOT TRUE THEN
    RETURN TRUE;
  END IF;
  
  -- If no safeword hash stored but required, return FALSE
  IF v_stored_hash IS NULL OR v_salt IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Check if currently locked out
  IF v_locked_until IS NOT NULL AND v_locked_until > NOW() THEN
    RETURN FALSE;
  END IF;
  
  -- Compute hash of provided safeword: SHA-256(salt || safeword)
  -- Using digest() from pgcrypto extension
  v_computed_hash := encode(
    digest(v_salt || p_safeword, 'sha256'), 
    'hex'
  );
  
  -- Constant-time comparison via digest comparison
  -- Note: PostgreSQL's = operator on strings is not constant-time,
  -- but for this use case with rate limiting, it's acceptable.
  -- For maximum security, compare hashes of both values.
  IF encode(digest(v_computed_hash, 'sha256'), 'hex') = 
     encode(digest(v_stored_hash, 'sha256'), 'hex') THEN
    -- Success: reset attempts counter
    UPDATE family_federation_invitations
    SET safeword_attempts = 0, safeword_locked_until = NULL
    WHERE id = p_invitation_id;
    RETURN TRUE;
  ELSE
    -- Failure: increment attempts, potentially lock
    UPDATE family_federation_invitations
    SET 
      safeword_attempts = COALESCE(safeword_attempts, 0) + 1,
      safeword_locked_until = CASE 
        WHEN COALESCE(safeword_attempts, 0) >= 2 THEN NOW() + INTERVAL '1 hour'
        ELSE NULL
      END
    WHERE id = p_invitation_id;
    RETURN FALSE;
  END IF;
END;
$$;

-- ============================================================
-- HELPER FUNCTION: CHECK IF INVITATION IS LOCKED
-- ============================================================

CREATE OR REPLACE FUNCTION is_invitation_locked(p_invitation_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_locked_until TIMESTAMP WITH TIME ZONE;
BEGIN
  SELECT safeword_locked_until
  INTO v_locked_until
  FROM family_federation_invitations
  WHERE id = p_invitation_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  RETURN v_locked_until IS NOT NULL AND v_locked_until > NOW();
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION verify_invitation_safeword(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION is_invitation_locked(UUID) TO authenticated;

-- ============================================================
-- COMMENTS
-- ============================================================

COMMENT ON COLUMN family_federation_invitations.safeword_hash IS 
  'SHA-256 hash of the safeword (hex-encoded). NULL if safeword not set.';

COMMENT ON COLUMN family_federation_invitations.safeword_salt IS 
  'Random salt used for safeword hashing (hex-encoded). NULL if safeword not set.';

COMMENT ON COLUMN family_federation_invitations.safeword_attempts IS 
  'Number of failed safeword verification attempts. Resets on success.';

COMMENT ON COLUMN family_federation_invitations.safeword_locked_until IS 
  'Timestamp when lockout expires. NULL if not locked. Set after 3 failed attempts.';

COMMENT ON COLUMN family_federation_invitations.require_safeword IS 
  'Whether safeword verification is required for this invitation. Default FALSE for backward compat.';

COMMENT ON FUNCTION verify_invitation_safeword(UUID, TEXT) IS 
  'Verifies safeword for invitation. Returns TRUE on success, FALSE on failure or lockout. Implements rate limiting.';

