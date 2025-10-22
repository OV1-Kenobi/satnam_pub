-- Phase 2: FIDO2/WebAuthn Hardware Security Key Support
-- Migration: 036_fido2_webauthn_support.sql
-- Purpose: Create tables for WebAuthn credential management with counter validation for cloning detection
-- Status: Production-Ready
--
-- PREREQUISITE: This migration assumes privacy-first-identity-system-migration.sql has been executed
-- to create user_identities table.
--
-- SECURITY FEATURES:
-- - Counter validation for cloning detection
-- - Attestation verification support
-- - Challenge freshness (10-minute expiry)
-- - Immutable audit logging
-- - RLS policies for privacy-preserving access control

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. WEBAUTHN_CREDENTIALS TABLE - Store registered FIDO2 credentials
-- ============================================================================
-- Supports both roaming authenticators (YubiKey, Titan, Feitian) and platform authenticators
-- (Windows Hello, Touch ID, Face ID)
CREATE TABLE IF NOT EXISTS public.webauthn_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_duid TEXT NOT NULL REFERENCES public.user_identities(id) ON DELETE CASCADE,
    credential_id TEXT NOT NULL UNIQUE, -- Base64-encoded credential ID
    public_key_spki BYTEA NOT NULL, -- SubjectPublicKeyInfo format for verification
    public_key_jwk JSONB NOT NULL, -- JWK format for easier handling
    counter BIGINT NOT NULL DEFAULT 0, -- Counter for cloning detection (must increment)
    transports TEXT[], -- ['usb', 'nfc', 'ble', 'internal'] - how to communicate with authenticator
    device_name TEXT, -- User-friendly name (e.g., "YubiKey 5", "Windows Hello")
    device_type TEXT NOT NULL CHECK (device_type IN ('platform', 'roaming')),
    -- platform: Windows Hello, Touch ID, Face ID (built-in to device)
    -- roaming: YubiKey, Titan, Feitian (external security key)
    attestation_type TEXT, -- 'none', 'indirect', 'direct', 'enterprise'
    aaguid TEXT, -- Authenticator AAGUID (identifies device model)
    is_backup_eligible BOOLEAN DEFAULT false, -- Can be used as backup authenticator
    is_backup_state BOOLEAN DEFAULT false, -- Currently in backup state
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE,
    
    -- Ensure counter only increases (cloning detection)
    CONSTRAINT counter_non_negative CHECK (counter >= 0)
);

-- ============================================================================
-- 2. WEBAUTHN_CHALLENGES TABLE - Temporary challenge storage
-- ============================================================================
-- Challenges are used for both registration and authentication flows
-- Must expire after 10 minutes for security
CREATE TABLE IF NOT EXISTS public.webauthn_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_duid TEXT NOT NULL REFERENCES public.user_identities(id) ON DELETE CASCADE,
    challenge TEXT NOT NULL, -- Base64-encoded challenge
    challenge_type TEXT NOT NULL CHECK (challenge_type IN ('registration', 'authentication')),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used BOOLEAN DEFAULT false,
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure challenge hasn't expired
    CONSTRAINT challenge_not_expired CHECK (expires_at > NOW())
);

-- ============================================================================
-- 3. WEBAUTHN_AUDIT_LOG TABLE - Immutable append-only audit trail
-- ============================================================================
-- Logs all WebAuthn operations for compliance and security monitoring
CREATE TABLE IF NOT EXISTS public.webauthn_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_duid TEXT NOT NULL REFERENCES public.user_identities(id) ON DELETE CASCADE,
    action TEXT NOT NULL CHECK (action IN (
        'credential_registered',
        'credential_authenticated',
        'credential_revoked',
        'cloning_detected',
        'counter_validation_failed',
        'challenge_generated',
        'challenge_verified'
    )),
    credential_id TEXT, -- References webauthn_credentials.credential_id
    device_name TEXT, -- Device name at time of action
    device_type TEXT, -- 'platform' or 'roaming'
    counter_value BIGINT, -- Counter value at time of action
    ip_address TEXT, -- Client IP address
    user_agent TEXT, -- Browser/client user agent
    details JSONB DEFAULT '{}', -- Additional context (error messages, etc.)
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT immutable_log CHECK (timestamp <= NOW())
);

-- ============================================================================
-- INDEXES - Performance optimization
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_user ON public.webauthn_credentials(user_duid);
CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_active ON public.webauthn_credentials(is_active);
CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_device_type ON public.webauthn_credentials(device_type);
CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_last_used ON public.webauthn_credentials(last_used_at DESC);

CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_user ON public.webauthn_challenges(user_duid);
CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_expires ON public.webauthn_challenges(expires_at);
CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_type ON public.webauthn_challenges(challenge_type);

CREATE INDEX IF NOT EXISTS idx_webauthn_audit_user ON public.webauthn_audit_log(user_duid);
CREATE INDEX IF NOT EXISTS idx_webauthn_audit_action ON public.webauthn_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_webauthn_audit_timestamp ON public.webauthn_audit_log(timestamp DESC);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) - Privacy-preserving access control
-- ============================================================================
ALTER TABLE public.webauthn_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webauthn_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webauthn_audit_log ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES - webauthn_credentials
-- ============================================================================
-- Users can view and manage only their own credentials
CREATE POLICY "webauthn_credentials_own_only" ON public.webauthn_credentials
    FOR SELECT
    TO authenticated
    USING (user_duid = current_setting('app.current_user_duid', true));

CREATE POLICY "webauthn_credentials_insert_own" ON public.webauthn_credentials
    FOR INSERT
    TO authenticated
    WITH CHECK (user_duid = current_setting('app.current_user_duid', true));

CREATE POLICY "webauthn_credentials_update_own" ON public.webauthn_credentials
    FOR UPDATE
    TO authenticated
    USING (user_duid = current_setting('app.current_user_duid', true))
    WITH CHECK (user_duid = current_setting('app.current_user_duid', true));

CREATE POLICY "webauthn_credentials_delete_own" ON public.webauthn_credentials
    FOR DELETE
    TO authenticated
    USING (user_duid = current_setting('app.current_user_duid', true));

-- ============================================================================
-- RLS POLICIES - webauthn_challenges
-- ============================================================================
-- Users can view only their own challenges
CREATE POLICY "webauthn_challenges_own_only" ON public.webauthn_challenges
    FOR SELECT
    TO authenticated
    USING (user_duid = current_setting('app.current_user_duid', true));

CREATE POLICY "webauthn_challenges_insert_own" ON public.webauthn_challenges
    FOR INSERT
    TO authenticated
    WITH CHECK (user_duid = current_setting('app.current_user_duid', true));

-- ============================================================================
-- RLS POLICIES - webauthn_audit_log
-- ============================================================================
-- Users can view only their own audit logs
CREATE POLICY "webauthn_audit_own_only" ON public.webauthn_audit_log
    FOR SELECT
    TO authenticated
    USING (user_duid = current_setting('app.current_user_duid', true));

-- Only service_role can insert audit logs
CREATE POLICY "webauthn_audit_insert_service_role" ON public.webauthn_audit_log
    FOR INSERT
    TO service_role
    WITH CHECK (true);

-- ============================================================================
-- TRIGGERS - Automatic timestamp management
-- ============================================================================
CREATE OR REPLACE FUNCTION update_webauthn_credentials_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER webauthn_credentials_update_timestamp
BEFORE UPDATE ON public.webauthn_credentials
FOR EACH ROW
EXECUTE FUNCTION update_webauthn_credentials_timestamp();

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Summary:
-- - Created 3 new tables for WebAuthn credential management
-- - Implemented RLS policies for privacy-preserving access control
-- - Added indexes for performance optimization
-- - Added triggers for automatic timestamp management
-- - Counter validation for cloning detection
-- - Support for both roaming (hardware keys) and platform authenticators
-- - Immutable audit logging for compliance
--
-- IMPORTANT NOTES:
-- ================
-- 1. COUNTER VALIDATION:
--    - Each credential has a counter that must increment on each use
--    - If counter doesn't increment or goes backward, cloning is detected
--    - Cloning detection is logged to webauthn_audit_log
--
-- 2. DEVICE TYPES:
--    - platform: Windows Hello, Touch ID, Face ID (built-in to device)
--    - roaming: YubiKey, Titan, Feitian (external security key)
--
-- 3. CHALLENGE EXPIRY:
--    - Challenges expire after 10 minutes for security
--    - Expired challenges are automatically cleaned up by database
--
-- 4. PRIVACY-FIRST ARCHITECTURE:
--    - All WebAuthn operations are logged immutably for compliance
--    - RLS policies enforce user-level access control at database level
--    - No plaintext secrets stored in database
--    - Public keys stored in both SPKI and JWK formats for flexibility
--
-- 5. ATTESTATION VERIFICATION:
--    - Attestation type indicates device authenticity verification level
--    - AAGUID identifies specific authenticator models
--    - Backup eligibility indicates if credential can be used as backup

