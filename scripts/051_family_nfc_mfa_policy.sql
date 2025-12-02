/**
 * Migration: Family Federation NFC MFA Policy Configuration
 * Adds NFC MFA policy configuration to family_federations table
 * 
 * Changes:
 * 1. Add nfc_mfa_policy column to family_federations
 * 2. Add nfc_mfa_amount_threshold for high-value operation detection
 * 3. Add nfc_mfa_threshold for steward consensus requirement
 * 4. Create indexes for policy queries
 * 5. Maintain backward compatibility (all columns optional)
 */

-- =====================================================
-- FAMILY FEDERATION NFC MFA POLICY CONFIGURATION
-- =====================================================

-- Add NFC MFA policy to family_federations
ALTER TABLE public.family_federations ADD COLUMN IF NOT EXISTS
  nfc_mfa_policy TEXT DEFAULT 'disabled'
  CHECK (nfc_mfa_policy IN ('disabled', 'optional', 'required', 'required_for_high_value'));

-- Amount threshold for high-value operation detection (in satoshis)
-- Operations above this amount require NFC MFA when policy = 'required_for_high_value'
ALTER TABLE public.family_federations ADD COLUMN IF NOT EXISTS
  nfc_mfa_amount_threshold BIGINT DEFAULT 1000000; -- 1M satoshis (~$400 USD)

-- Steward consensus requirement for NFC MFA
-- 'all' = all stewards must provide NFC MFA
-- 'threshold' = only threshold number of stewards need NFC MFA
ALTER TABLE public.family_federations ADD COLUMN IF NOT EXISTS
  nfc_mfa_threshold TEXT DEFAULT 'all'
  CHECK (nfc_mfa_threshold IN ('all', 'threshold'));

-- =====================================================
-- AUDIT LOGGING FOR NFC MFA EVENTS
-- =====================================================

-- Create audit log table for NFC MFA events
CREATE TABLE IF NOT EXISTS public.nfc_mfa_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Session reference
  session_id TEXT NOT NULL,
  family_id TEXT NOT NULL,
  
  -- Event details
  event_type TEXT NOT NULL CHECK (event_type IN (
    'policy_retrieved',
    'signature_collected',
    'signature_verified',
    'signature_failed',
    'operation_blocked',
    'operation_allowed'
  )),
  
  -- Participant information
  participant_id TEXT NOT NULL,
  
  -- Event data
  operation_hash TEXT,
  policy TEXT,
  error_message TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT nfc_mfa_audit_log_session_fk FOREIGN KEY (session_id)
    REFERENCES public.frost_signing_sessions(session_id) ON DELETE CASCADE
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Index for policy queries
CREATE INDEX IF NOT EXISTS idx_family_federations_nfc_policy
  ON public.family_federations(nfc_mfa_policy)
  WHERE nfc_mfa_policy != 'disabled';

-- Index for high-value operation detection
CREATE INDEX IF NOT EXISTS idx_family_federations_nfc_threshold
  ON public.family_federations(nfc_mfa_amount_threshold)
  WHERE nfc_mfa_policy = 'required_for_high_value';

-- Index for audit log queries
CREATE INDEX IF NOT EXISTS idx_nfc_mfa_audit_log_session
  ON public.nfc_mfa_audit_log(session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_nfc_mfa_audit_log_family
  ON public.nfc_mfa_audit_log(family_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_nfc_mfa_audit_log_event_type
  ON public.nfc_mfa_audit_log(event_type, created_at DESC);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

-- Enable RLS on audit log table
ALTER TABLE public.nfc_mfa_audit_log ENABLE ROW LEVEL SECURITY;

-- Users can view audit logs for their family federations
CREATE POLICY "Users can view NFC MFA audit logs for their families"
  ON public.nfc_mfa_audit_log
  FOR SELECT
  TO authenticated
  USING (
    family_id IN (
      SELECT federation_duid
      FROM public.family_federations ff
      JOIN public.family_members fm ON ff.id = fm.family_federation_id
      WHERE fm.user_duid = auth.uid()::text AND fm.is_active = true
    )
  );

-- Service role can do everything
CREATE POLICY "Service role has full access to NFC MFA audit logs"
  ON public.nfc_mfa_audit_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- COMMENTS (DOCUMENTATION)
-- =====================================================

COMMENT ON COLUMN public.family_federations.nfc_mfa_policy IS
  'NFC MFA enforcement policy: disabled (no NFC), optional (NFC if available), required (NFC mandatory), required_for_high_value (NFC for high-value operations)';

COMMENT ON COLUMN public.family_federations.nfc_mfa_amount_threshold IS
  'Amount threshold in satoshis for high-value operation detection. Operations above this amount require NFC MFA when policy = required_for_high_value';

COMMENT ON COLUMN public.family_federations.nfc_mfa_threshold IS
  'Steward consensus requirement for NFC MFA: all (all stewards must provide NFC MFA), threshold (only threshold number of stewards need NFC MFA)';

COMMENT ON TABLE public.nfc_mfa_audit_log IS
  'Audit log for NFC MFA events including policy retrieval, signature collection/verification, and operation decisions';

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

-- Verify migration
SELECT 
  column_name, 
  data_type, 
  is_nullable 
FROM information_schema.columns 
WHERE table_name = 'family_federations' 
  AND column_name LIKE 'nfc_%'
ORDER BY ordinal_position;

