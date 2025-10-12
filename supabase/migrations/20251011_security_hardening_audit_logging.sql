-- Security Hardening: Audit Logging + Secure RPC Wrappers for LNbits key decrypt
-- Idempotent; run after base hybrid migration and access-control script

BEGIN;

-- 1) Ensure private schema exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.schemata WHERE schema_name = 'private'
  ) THEN
    EXECUTE 'CREATE SCHEMA private';
  END IF;
END $$;

-- 2) Audit table for decrypt and privileged ops
CREATE TABLE IF NOT EXISTS private.lnbits_key_access_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ts timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  wallet_id text,
  caller text,
  operation text,
  source_ip text,
  result text,
  error text,
  request_id text
);

-- 3) Secure RPC: decrypt invoice key by wallet_id
CREATE OR REPLACE FUNCTION private.get_invoice_key_for_wallet(
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
  v_user_id uuid;
BEGIN
  SELECT u.user_id, u.lnbits_invoice_key_enc
    INTO v_user_id, v_key_enc
  FROM public.user_lightning_config u
  WHERE u.lnbits_wallet_id = p_wallet_id
  LIMIT 1;

  IF v_key_enc IS NULL THEN
    INSERT INTO private.lnbits_key_access_audit(user_id, wallet_id, caller, operation, result, error, request_id)
    VALUES (v_user_id, p_wallet_id, p_caller, 'decrypt_invoice_key', 'failure', 'missing_encrypted_key', p_request_id);
    RAISE EXCEPTION 'Invoice key not found for wallet %', p_wallet_id;
  END IF;

  BEGIN
    v_key := private.dec(v_key_enc);
    INSERT INTO private.lnbits_key_access_audit(user_id, wallet_id, caller, operation, result, request_id)
    VALUES (v_user_id, p_wallet_id, p_caller, 'decrypt_invoice_key', 'success', p_request_id);
    RETURN v_key;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO private.lnbits_key_access_audit(user_id, wallet_id, caller, operation, result, error, request_id)
    VALUES (v_user_id, p_wallet_id, p_caller, 'decrypt_invoice_key', 'failure', SQLERRM, p_request_id);
    RAISE;
  END;
END;
$$;

-- 4) Secure RPC: decrypt admin key by wallet_id
CREATE OR REPLACE FUNCTION private.get_admin_key_for_wallet(
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
  v_user_id uuid;
BEGIN
  SELECT u.user_id, u.lnbits_admin_key_enc
    INTO v_user_id, v_key_enc
  FROM public.user_lightning_config u
  WHERE u.lnbits_wallet_id = p_wallet_id
  LIMIT 1;

  IF v_key_enc IS NULL THEN
    INSERT INTO private.lnbits_key_access_audit(user_id, wallet_id, caller, operation, result, error, request_id)
    VALUES (v_user_id, p_wallet_id, p_caller, 'decrypt_admin_key', 'failure', 'missing_encrypted_key', p_request_id);
    RAISE EXCEPTION 'Admin key not found for wallet %', p_wallet_id;
  END IF;

  BEGIN
    v_key := private.dec(v_key_enc);
    INSERT INTO private.lnbits_key_access_audit(user_id, wallet_id, caller, operation, result, request_id)
    VALUES (v_user_id, p_wallet_id, p_caller, 'decrypt_admin_key', 'success', p_request_id);
    RETURN v_key;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO private.lnbits_key_access_audit(user_id, wallet_id, caller, operation, result, error, request_id)
    VALUES (v_user_id, p_wallet_id, p_caller, 'decrypt_admin_key', 'failure', SQLERRM, p_request_id);
    RAISE;
  END;
END;
$$;

-- 5) Restrict EXECUTE on wrappers to service_role only
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'private' AND p.proname = 'get_invoice_key_for_wallet'
      AND pg_get_function_identity_arguments(p.oid) = 'text, text, text'
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION private.get_invoice_key_for_wallet(text, text, text) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION private.get_invoice_key_for_wallet(text, text, text) TO service_role';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'private' AND p.proname = 'get_admin_key_for_wallet'
      AND pg_get_function_identity_arguments(p.oid) = 'text, text, text'
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION private.get_admin_key_for_wallet(text, text, text) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION private.get_admin_key_for_wallet(text, text, text) TO service_role';
  END IF;
END $$;

COMMIT;

