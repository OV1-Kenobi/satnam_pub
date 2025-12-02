/**
 * Migration: FROST NFC MFA Integration
 * Adds NFC Physical MFA support to FROST signing sessions
 * 
 * Changes:
 * 1. Add NFC MFA configuration columns to frost_signing_sessions
 * 2. Add NFC signature storage columns
 * 3. Add NFC verification status tracking
 * 4. Maintain backward compatibility (all columns optional)
 */

-- =====================================================
-- FROST NFC MFA CONFIGURATION
-- =====================================================

-- Add NFC MFA configuration to frost_signing_sessions
ALTER TABLE public.frost_signing_sessions ADD COLUMN IF NOT EXISTS
  requires_nfc_mfa BOOLEAN DEFAULT false;

ALTER TABLE public.frost_signing_sessions ADD COLUMN IF NOT EXISTS
  nfc_mfa_policy TEXT DEFAULT 'disabled' 
  CHECK (nfc_mfa_policy IN ('disabled', 'optional', 'required', 'required_for_high_value'));

-- =====================================================
-- NFC SIGNATURE STORAGE
-- =====================================================

 -- Store NFC signatures from all participants
 -- Format: { "participantId": { "signature", "publicKey", "timestamp", "cardUid" } }
ALTER TABLE public.frost_signing_sessions ADD COLUMN IF NOT EXISTS
  nfc_signatures JSONB DEFAULT '{}';

 -- Track NFC verification status for each participant
 -- Format: { "participantId": { "verified": boolean, "error"?: string, "verified_at"?: timestamp } }
ALTER TABLE public.frost_signing_sessions ADD COLUMN IF NOT EXISTS
  nfc_verification_status JSONB DEFAULT '{}';

-- =====================================================
-- FROST SIGNATURE SHARES NFC EXTENSION
-- =====================================================

-- Add NFC signature data to frost_signature_shares table
ALTER TABLE public.frost_signature_shares ADD COLUMN IF NOT EXISTS
  nfc_signature TEXT;

ALTER TABLE public.frost_signature_shares ADD COLUMN IF NOT EXISTS
  nfc_public_key TEXT;

ALTER TABLE public.frost_signature_shares ADD COLUMN IF NOT EXISTS
  nfc_verified_at TIMESTAMPTZ;

ALTER TABLE public.frost_signature_shares ADD COLUMN IF NOT EXISTS
  nfc_verification_error TEXT;

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Index for NFC MFA policy queries
CREATE INDEX IF NOT EXISTS idx_frost_sessions_nfc_policy 
  ON public.frost_signing_sessions(nfc_mfa_policy) 
  WHERE requires_nfc_mfa = true;

-- Index for NFC verification status queries
CREATE INDEX IF NOT EXISTS idx_frost_sessions_nfc_verified 
  ON public.frost_signing_sessions(family_id, status) 
  WHERE requires_nfc_mfa = true;

-- Index for NFC signature shares
CREATE INDEX IF NOT EXISTS idx_frost_signature_shares_nfc 
  ON public.frost_signature_shares(session_id) 
  WHERE nfc_signature IS NOT NULL;

-- =====================================================
-- COMMENTS (DOCUMENTATION)
-- =====================================================

COMMENT ON COLUMN public.frost_signing_sessions.requires_nfc_mfa IS
  'Whether this FROST session requires NFC Physical MFA verification';

COMMENT ON COLUMN public.frost_signing_sessions.nfc_mfa_policy IS
  'NFC MFA enforcement policy: disabled (no NFC), optional (NFC if available), required (NFC mandatory), required_for_high_value (NFC for high-value operations)';

COMMENT ON COLUMN public.frost_signing_sessions.nfc_signatures IS
	'JSONB map of participant NFC signatures: { "participantId": { "signature", "publicKey", "timestamp", "cardUid" } }';

COMMENT ON COLUMN public.frost_signing_sessions.nfc_verification_status IS
	'JSONB map of NFC verification results: { "participantId": { "verified": boolean, "error"?: string, "verified_at"?: timestamp } }';

COMMENT ON COLUMN public.frost_signature_shares.nfc_signature IS
  'P-256 signature from NFC card (hex string)';

COMMENT ON COLUMN public.frost_signature_shares.nfc_public_key IS
  'P-256 public key from NFC card (hex string)';

COMMENT ON COLUMN public.frost_signature_shares.nfc_verified_at IS
  'Timestamp when NFC signature was verified';

COMMENT ON COLUMN public.frost_signature_shares.nfc_verification_error IS
  'Error message if NFC signature verification failed';

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

-- Verify migration
SELECT 
  column_name, 
  data_type, 
  is_nullable 
FROM information_schema.columns 
WHERE table_name = 'frost_signing_sessions' 
	AND column_name LIKE 'nfc_%'
ORDER BY ordinal_position;

-- Verify NFC columns on frost_signature_shares as well
SELECT 
	column_name, 
	data_type, 
	is_nullable 
FROM information_schema.columns 
WHERE table_name = 'frost_signature_shares' 
	AND column_name LIKE 'nfc_%'
ORDER BY ordinal_position;

