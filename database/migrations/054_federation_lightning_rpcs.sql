-- ============================================================================
-- Migration 054: Federation Lightning RPC Functions
-- Date: 2025-12-03
-- Purpose:
--   - Create public.get_federation_ln_proxy_data() for LNURL-pay operations
--   - Create private secure decrypt wrappers with audit logging
--   - Mirror existing user lightning RPC patterns
--
-- Dependencies:
--   - Migration 053: federation_lightning_config table
--   - 20251011_security_hardening_audit_logging.sql: private.lnbits_key_access_audit
--   - 20251011_hybrid_minimal_custody_lightning.sql: private.dec() function
--
-- Security:
--   - All functions are SECURITY DEFINER with restricted search_path
--   - Private functions accessible only via service_role
--   - Full audit logging of all key decryption operations
--
-- Idempotent: Safe to run multiple times
-- ============================================================================

-- Ensure private schema exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.schemata WHERE schema_name = 'private'
  ) THEN
    EXECUTE 'CREATE SCHEMA private';
  END IF;
END $$;

-- ============================================================================
-- FUNCTION: public.get_federation_ln_proxy_data(p_handle text)
-- Returns federation lightning data for LNURL-pay invoice generation
-- Similar to public.get_ln_proxy_data() but for federation handles
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_federation_ln_proxy_data(p_handle text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  r RECORD;
  v_role text := auth.role();
  v_invoice_key text;
  v_request_id text := gen_random_uuid()::text;
BEGIN
  -- Look up federation lightning config by handle
  SELECT
    flc.federation_duid,
    flc.federation_handle,
    flc.external_ln_address,
    flc.lnbits_wallet_id,
    flc.lnbits_invoice_key_enc,
    flc.platform_ln_address,
    flc.scrub_enabled,
    flc.scrub_percent
  INTO r
  FROM public.federation_lightning_config flc
  WHERE flc.federation_handle = lower(p_handle)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Authorization: only service_role can call this function
  -- (RLS on the table handles steward/guardian access for direct queries)
  IF COALESCE(v_role, '') <> 'service_role' THEN
    RAISE EXCEPTION 'get_federation_ln_proxy_data requires service_role';
  END IF;

  -- Decrypt with audit logging
  BEGIN
    v_invoice_key := private.dec(r.lnbits_invoice_key_enc);
    INSERT INTO private.lnbits_key_access_audit(
      wallet_id, caller, operation, result, request_id
    ) VALUES (
      r.lnbits_wallet_id, v_role, 'decrypt_federation_invoice_key', 'success', v_request_id
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO private.lnbits_key_access_audit(
      wallet_id, caller, operation, result, error, request_id
    ) VALUES (
      r.lnbits_wallet_id, v_role, 'decrypt_federation_invoice_key', 'failure',
      SQLERRM, v_request_id
    );
    RAISE;
  END;

  RETURN jsonb_build_object(
    'federation_duid', r.federation_duid,
    'federation_handle', r.federation_handle,
    'external_ln_address', r.external_ln_address,
    'lnbits_wallet_id', r.lnbits_wallet_id,
    'lnbits_invoice_key', v_invoice_key,
    'platform_ln_address', r.platform_ln_address,
    'scrub_enabled', r.scrub_enabled,
    'scrub_percent', r.scrub_percent
  );
END$$;

-- Restrict access to service_role only
REVOKE ALL ON FUNCTION public.get_federation_ln_proxy_data(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_federation_ln_proxy_data(text) TO service_role;

COMMENT ON FUNCTION public.get_federation_ln_proxy_data(text) IS 
  'Retrieve federation lightning proxy data for LNURL-pay operations. Service role only. Decrypts invoice key.';

-- ============================================================================
-- FUNCTION: private.get_federation_invoice_key_for_wallet
-- Secure decrypt wrapper with audit logging for federation invoice keys
-- ============================================================================

CREATE OR REPLACE FUNCTION private.get_federation_invoice_key_for_wallet(
  p_wallet_id text,
  p_caller text,
  p_request_id text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_key_enc text;
  v_key text;
  v_federation_duid text;
BEGIN
  -- Look up encrypted invoice key by wallet_id
  SELECT flc.federation_duid, flc.lnbits_invoice_key_enc
    INTO v_federation_duid, v_key_enc
  FROM public.federation_lightning_config flc
  WHERE flc.lnbits_wallet_id = p_wallet_id
  LIMIT 1;

  IF v_key_enc IS NULL THEN
    INSERT INTO private.lnbits_key_access_audit(
      wallet_id, caller, operation, result, error, request_id
    ) VALUES (
      p_wallet_id, p_caller, 'decrypt_federation_invoice_key', 'failure', 
      'missing_encrypted_key', p_request_id
    );
    RAISE EXCEPTION 'Federation invoice key not found for wallet %', p_wallet_id;
  END IF;

  BEGIN
    v_key := private.dec(v_key_enc);
    INSERT INTO private.lnbits_key_access_audit(
      wallet_id, caller, operation, result, request_id
    ) VALUES (
      p_wallet_id, p_caller, 'decrypt_federation_invoice_key', 'success', p_request_id
    );
    RETURN v_key;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO private.lnbits_key_access_audit(
      wallet_id, caller, operation, result, error, request_id
    ) VALUES (
      p_wallet_id, p_caller, 'decrypt_federation_invoice_key', 'failure', 
      SQLERRM, p_request_id
    );
    RAISE;
  END;
END;
$$;

-- Restrict to service_role
REVOKE ALL ON FUNCTION private.get_federation_invoice_key_for_wallet(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.get_federation_invoice_key_for_wallet(text, text, text) TO service_role;

COMMENT ON FUNCTION private.get_federation_invoice_key_for_wallet(text, text, text) IS
  'Secure decrypt wrapper for federation LNbits invoice key. Full audit logging. Service role only.';

-- ============================================================================
-- FUNCTION: private.get_federation_admin_key_for_wallet
-- Secure decrypt wrapper with audit logging for federation admin keys
-- ============================================================================

CREATE OR REPLACE FUNCTION private.get_federation_admin_key_for_wallet(
  p_wallet_id text,
  p_caller text,
  p_request_id text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_key_enc text;
  v_key text;
  v_federation_duid text;
BEGIN
  -- Look up encrypted admin key by wallet_id
  SELECT flc.federation_duid, flc.lnbits_admin_key_enc
    INTO v_federation_duid, v_key_enc
  FROM public.federation_lightning_config flc
  WHERE flc.lnbits_wallet_id = p_wallet_id
  LIMIT 1;

  IF v_key_enc IS NULL THEN
    INSERT INTO private.lnbits_key_access_audit(
      wallet_id, caller, operation, result, error, request_id
    ) VALUES (
      p_wallet_id, p_caller, 'decrypt_federation_admin_key', 'failure',
      'missing_encrypted_key', p_request_id
    );
    RAISE EXCEPTION 'Federation admin key not found for wallet %', p_wallet_id;
  END IF;

  BEGIN
    v_key := private.dec(v_key_enc);
    INSERT INTO private.lnbits_key_access_audit(
      wallet_id, caller, operation, result, request_id
    ) VALUES (
      p_wallet_id, p_caller, 'decrypt_federation_admin_key', 'success', p_request_id
    );
    RETURN v_key;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO private.lnbits_key_access_audit(
      wallet_id, caller, operation, result, error, request_id
    ) VALUES (
      p_wallet_id, p_caller, 'decrypt_federation_admin_key', 'failure',
      SQLERRM, p_request_id
    );
    RAISE;
  END;
END;
$$;

-- Restrict to service_role
REVOKE ALL ON FUNCTION private.get_federation_admin_key_for_wallet(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.get_federation_admin_key_for_wallet(text, text, text) TO service_role;

COMMENT ON FUNCTION private.get_federation_admin_key_for_wallet(text, text, text) IS
  'Secure decrypt wrapper for federation LNbits admin key. Full audit logging. Service role only.';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
  v_func_count integer := 0;
BEGIN
  -- Check public function exists
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'get_federation_ln_proxy_data' AND n.nspname = 'public'
  ) THEN
    v_func_count := v_func_count + 1;
  END IF;

  -- Check private invoice key function exists
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'get_federation_invoice_key_for_wallet' AND n.nspname = 'private'
  ) THEN
    v_func_count := v_func_count + 1;
  END IF;

  -- Check private admin key function exists
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'get_federation_admin_key_for_wallet' AND n.nspname = 'private'
  ) THEN
    v_func_count := v_func_count + 1;
  END IF;

  IF v_func_count = 3 THEN
    RAISE NOTICE '✓ Migration 054 verification successful. All 3 federation lightning RPC functions created.';
  ELSE
    RAISE WARNING 'Migration 054 verification: Only % of 3 functions found.', v_func_count;
  END IF;
END $$;

