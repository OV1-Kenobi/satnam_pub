-- 20251011_hybrid_minimal_custody_lightning.sql
-- Hybrid Minimal-Custody Lightning: every user has external self-custody LN Address AND an internal LNbits wallet with Scrub auto-forward.
-- Idempotent, privacy-first, safe to re-run. Designed for Supabase SQL editor.
-- Platform NIP-05 + Lightning Address domain: username@my.satnam.pub
-- LN_BITS_ENC_KEY in Supabase Vault MUST MATCH LNbits' internal DB encryption key (shared-key requirement).

-- 0) Required extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Private schema + encryption helpers (fail-safe: raise if key missing)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name='private') THEN
    EXECUTE 'CREATE SCHEMA private';
  END IF;
  BEGIN EXECUTE 'REVOKE ALL ON SCHEMA private FROM PUBLIC'; EXCEPTION WHEN OTHERS THEN NULL; END;
END$$;

CREATE OR REPLACE FUNCTION private.get_lnbits_key() RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_key text;
BEGIN
  -- First attempt: query vault.decrypted_secrets
  BEGIN
    EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name=''LN_BITS_ENC_KEY'' LIMIT 1' INTO v_key;
  EXCEPTION
    WHEN undefined_table THEN v_key := NULL;
    WHEN invalid_schema_name THEN v_key := NULL;
  END;

  -- Second attempt: use vault.get_secret() function
  IF v_key IS NULL THEN
    BEGIN
      EXECUTE 'SELECT vault.get_secret(''LN_BITS_ENC_KEY'')::text' INTO v_key;
    EXCEPTION
      WHEN undefined_function THEN v_key := NULL;
    END;
  END IF;

  -- Fail-safe: raise error if key still not found
  IF v_key IS NULL OR length(coalesce(v_key,'')) = 0 THEN
    RAISE EXCEPTION 'LN_BITS_ENC_KEY missing in Vault. Configure shared LNbits key before using Lightning.';
  END IF;

  RETURN v_key;
END$$;

CREATE OR REPLACE FUNCTION private.enc(p_text text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_key text; v_out text; BEGIN
  v_key := private.get_lnbits_key();
  SELECT encode(pgp_sym_encrypt(coalesce(p_text,''), v_key, 'cipher-algo=aes256'), 'base64') INTO v_out; RETURN v_out; END$$;

CREATE OR REPLACE FUNCTION private.dec(p_text text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_key text; v_out text; BEGIN
  v_key := private.get_lnbits_key(); IF p_text IS NULL THEN RETURN NULL; END IF;
  SELECT convert_from(pgp_sym_decrypt(decode(p_text,'base64'), v_key),'utf8') INTO v_out; RETURN v_out; END$$;

-- 2) user_lightning_config (Hybrid Minimal Custody)
CREATE TABLE IF NOT EXISTS public.user_lightning_config (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nip05_username text UNIQUE NOT NULL,
  external_ln_address text,
  platform_ln_address text GENERATED ALWAYS AS (nip05_username || '@' || 'my.satnam.pub') STORED,
  lnbits_wallet_id text NOT NULL,
  lnbits_admin_key_enc text NOT NULL,
  lnbits_invoice_key_enc text NOT NULL,
  scrub_enabled boolean DEFAULT false,
  scrub_percent integer NOT NULL DEFAULT 100 CHECK (scrub_percent >= 0 AND scrub_percent <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_nip05_username_format CHECK (nip05_username = lower(nip05_username) AND nip05_username ~ '^[a-z0-9_-]+$')
);

-- Uniqueness for platform address (computed)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='user_lightning_config' AND indexname='user_lightning_config_platform_ln_address_key'
  ) THEN EXECUTE 'CREATE UNIQUE INDEX user_lightning_config_platform_ln_address_key ON public.user_lightning_config(platform_ln_address)'; END IF;
END$$;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END$$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_ulc_touch_updated_at') THEN
    EXECUTE 'CREATE TRIGGER trg_ulc_touch_updated_at BEFORE UPDATE ON public.user_lightning_config FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at()';
  END IF; END$$;

-- Default scrub_percent=100 when enabling scrub (but reconfigurable if explicitly set)
CREATE OR REPLACE FUNCTION public.tg_ulc_scrub_defaults() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.scrub_enabled IS TRUE AND NEW.scrub_percent IS NULL THEN NEW.scrub_percent := 100; END IF; RETURN NEW; END$$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_ulc_scrub_defaults') THEN
    EXECUTE 'CREATE TRIGGER trg_ulc_scrub_defaults BEFORE INSERT OR UPDATE ON public.user_lightning_config FOR EACH ROW EXECUTE FUNCTION public.tg_ulc_scrub_defaults()';
  END IF; END$$;

-- Enforce nip05_username exists in nip05_records when available
CREATE OR REPLACE FUNCTION public.tg_ulc_require_nip05() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t_exists boolean; c_name text; ok boolean := false; BEGIN
  IF to_regclass('public.nip05_records') IS NULL THEN RETURN NEW; END IF;
  FOR c_name IN SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='nip05_records' AND column_name IN ('username','nip05_username','name','identifier') ORDER BY 1 LOOP
    IF c_name <> 'identifier' THEN
      EXECUTE format('SELECT true FROM public.nip05_records WHERE %I = $1 LIMIT 1', c_name) INTO t_exists USING NEW.nip05_username; IF t_exists THEN ok := true; EXIT; END IF;
    ELSE
      EXECUTE 'SELECT true FROM public.nip05_records WHERE split_part(identifier,''@'',1)=$1 LIMIT 1' INTO t_exists USING NEW.nip05_username; IF t_exists THEN ok := true; EXIT; END IF;
    END IF;
  END LOOP;
  IF NOT ok THEN RAISE EXCEPTION 'NIP-05 username % not present in nip05_records.', NEW.nip05_username; END IF; RETURN NEW; END$$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_ulc_require_nip05') THEN
    EXECUTE 'CREATE TRIGGER trg_ulc_require_nip05 BEFORE INSERT OR UPDATE OF nip05_username ON public.user_lightning_config FOR EACH ROW EXECUTE FUNCTION public.tg_ulc_require_nip05()';
  END IF; END$$;

-- RLS: user_lightning_config
ALTER TABLE public.user_lightning_config ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_lightning_config' AND policyname='anon_insert_ulc') THEN
    EXECUTE $policy$CREATE POLICY anon_insert_ulc ON public.user_lightning_config FOR INSERT TO anon WITH CHECK (auth.uid() = user_id)$policy$; END IF; END$$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_lightning_config' AND policyname='auth_select_ulc') THEN
    EXECUTE $policy$CREATE POLICY auth_select_ulc ON public.user_lightning_config FOR SELECT TO authenticated USING (auth.uid() = user_id)$policy$; END IF; END$$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_lightning_config' AND policyname='auth_insert_ulc') THEN
    EXECUTE $policy$CREATE POLICY auth_insert_ulc ON public.user_lightning_config FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)$policy$; END IF; END$$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_lightning_config' AND policyname='auth_update_ulc') THEN
    EXECUTE $policy$CREATE POLICY auth_update_ulc ON public.user_lightning_config FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)$policy$; END IF; END$$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_lightning_config' AND policyname='auth_delete_ulc') THEN
    EXECUTE $policy$CREATE POLICY auth_delete_ulc ON public.user_lightning_config FOR DELETE TO authenticated USING (auth.uid() = user_id)$policy$; END IF; END$$;

-- 3) custody_events (temporary custody audit log)
CREATE TABLE IF NOT EXISTS public.custody_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_hash text NOT NULL UNIQUE,
  amount_msats bigint NOT NULL,
  custody_start timestamptz NOT NULL DEFAULT now(),
  custody_end timestamptz,
  custody_duration_ms integer GENERATED ALWAYS AS ((EXTRACT(epoch FROM (custody_end - custody_start)) * 1000)::integer) STORED,
  forwarded_to text,
  status text CHECK (status IN ('held','forwarded','failed','refunded')),
  feature_used text CHECK (feature_used IN ('direct_zap','split_payment','paywall','boltcard','other')),
  scrub_payment_hash text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- updated_at trigger for custody_events
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_custody_events_touch_updated_at') THEN
    EXECUTE 'CREATE TRIGGER trg_custody_events_touch_updated_at BEFORE UPDATE ON public.custody_events FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at()';
  END IF; END$$;

-- Indexes for custody_events
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='custody_events' AND indexname='idx_custody_events_user_id') THEN
    EXECUTE 'CREATE INDEX idx_custody_events_user_id ON public.custody_events(user_id)'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='custody_events' AND indexname='idx_custody_events_payment_hash') THEN
    EXECUTE 'CREATE INDEX idx_custody_events_payment_hash ON public.custody_events(payment_hash)'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='custody_events' AND indexname='idx_custody_events_status') THEN
    EXECUTE 'CREATE INDEX idx_custody_events_status ON public.custody_events(status)'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='custody_events' AND indexname='idx_custody_events_custody_duration_ms_gt5s') THEN
    EXECUTE 'CREATE INDEX idx_custody_events_custody_duration_ms_gt5s ON public.custody_events(custody_duration_ms) WHERE custody_duration_ms > 5000'; END IF;
END$$;

-- RLS for custody_events: anon none; authenticated SELECT-own only
ALTER TABLE public.custody_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='custody_events' AND policyname='auth_select_own_custody_events') THEN
    EXECUTE $policy$CREATE POLICY auth_select_own_custody_events ON public.custody_events FOR SELECT TO authenticated USING (auth.uid() = user_id)$policy$; END IF; END$$;

-- 4) Domain migration @satnam.pub -> @my.satnam.pub (idempotent, data-only)
DO $$ DECLARE old_domain text:='satnam.pub'; new_domain text:='my.satnam.pub'; BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_identities' AND column_name='nip05_identifier') THEN
    EXECUTE $update$UPDATE public.user_identities SET nip05_identifier = regexp_replace(nip05_identifier,'@'||$1||'$','@'||$2) WHERE nip05_identifier LIKE '%'||'@'||$1$update$ USING old_domain,new_domain; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_identities' AND column_name='nip05') THEN
    EXECUTE $update$UPDATE public.user_identities SET nip05 = regexp_replace(nip05,'@'||$1||'$','@'||$2) WHERE nip05 LIKE '%'||'@'||$1$update$ USING old_domain,new_domain; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_identities' AND column_name='nip05_domain') THEN
    EXECUTE $update$UPDATE public.user_identities SET nip05_domain = $2 WHERE nip05_domain = $1$update$ USING old_domain,new_domain; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='nip05_records' AND column_name='identifier') THEN
    EXECUTE $update$UPDATE public.nip05_records SET identifier = regexp_replace(identifier,'@'||$1||'$','@'||$2) WHERE identifier LIKE '%'||'@'||$1$update$ USING old_domain,new_domain; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='nip05_records' AND column_name='domain') THEN
    EXECUTE $update$UPDATE public.nip05_records SET domain = $2 WHERE domain = $1$update$ USING old_domain,new_domain; END IF; END$$;

-- 5) Functions
-- 5a) LN proxy data: expose external address, wallet id, decrypted invoice key, platform address
CREATE OR REPLACE FUNCTION public.get_ln_proxy_data(p_username text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  r RECORD;
  v_uid uuid := auth.uid();
  v_role text := auth.role();
BEGIN
  SELECT user_id,
         external_ln_address,
         lnbits_wallet_id,
         private.dec(lnbits_invoice_key_enc) AS invoice_key,
         platform_ln_address
    INTO r
    FROM public.user_lightning_config
   WHERE nip05_username = lower(p_username)
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  -- Authorization: allow service_role or owner only
  IF COALESCE(v_role, '') <> 'service_role'
     AND (v_uid IS NULL OR r.user_id <> v_uid) THEN
    RAISE EXCEPTION 'Not authorized for username %', p_username;
  END IF;
  RETURN jsonb_build_object('external_ln_address', r.external_ln_address,
                            'lnbits_wallet_id', r.lnbits_wallet_id,
                            'lnbits_invoice_key', r.invoice_key,
                            'platform_ln_address', r.platform_ln_address);
END$$;
REVOKE ALL ON FUNCTION public.get_ln_proxy_data(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ln_proxy_data(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ln_proxy_data(text) TO service_role;

-- 5b) get_nip05_data: only create if absent
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='get_nip05_data' AND n.nspname='public' AND p.pronargs=1) THEN
    EXECUTE $func$CREATE FUNCTION public.get_nip05_data(p_username text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $body$
    DECLARE v_result jsonb;
    BEGIN
      BEGIN
        SELECT jsonb_build_object('pubkey', pk, 'relays', rl) INTO v_result
        FROM (
          SELECT COALESCE((SELECT pubkey FROM public.nip05_records WHERE username=lower(p_username) LIMIT 1),
                          (SELECT pubkey_hex FROM public.nip05_records WHERE username=lower(p_username) LIMIT 1)) AS pk,
                 (SELECT relays FROM public.nip05_records WHERE username=lower(p_username) LIMIT 1) AS rl
        ) q;
        IF v_result IS NOT NULL THEN RETURN v_result; END IF;
      EXCEPTION
        WHEN undefined_table THEN NULL;
        WHEN undefined_column THEN NULL;
      END;
      BEGIN
        SELECT jsonb_build_object('pubkey', pk, 'relays', rl) INTO v_result
        FROM (
          SELECT COALESCE((SELECT pubkey FROM public.user_identities WHERE nip05_username=lower(p_username) LIMIT 1),
                          (SELECT pubkey_hex FROM public.user_identities WHERE nip05_username=lower(p_username) LIMIT 1)) AS pk,
                 (SELECT relays FROM public.user_identities WHERE nip05_username=lower(p_username) LIMIT 1) AS rl
        ) q;
        IF v_result IS NOT NULL THEN RETURN v_result; END IF;
      EXCEPTION
        WHEN undefined_table THEN NULL;
        WHEN undefined_column THEN NULL;
      END;
      RETURN NULL;
    END$body$;$func$;
  END IF; END$$;

-- 5c) log_custody_event helper
CREATE OR REPLACE FUNCTION public.log_custody_event(p_user_id uuid, p_payment_hash text, p_amount_msats bigint, p_forwarded_to text, p_feature_used text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_id uuid;
  v_uid uuid := auth.uid();
  v_role text := auth.role();
BEGIN
  IF COALESCE(v_role, '') <> 'service_role'
     AND (v_uid IS NULL OR v_uid <> p_user_id) THEN
    RAISE EXCEPTION 'Not authorized to log custody event for user %', p_user_id;
  END IF;
  INSERT INTO public.custody_events(user_id,payment_hash,amount_msats,forwarded_to,status,feature_used)
  VALUES(p_user_id,p_payment_hash,p_amount_msats,p_forwarded_to,'held',p_feature_used)
  RETURNING id INTO v_id;
  RETURN v_id;
END$$;
REVOKE ALL ON FUNCTION public.log_custody_event(uuid,text,bigint,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_custody_event(uuid,text,bigint,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_custody_event(uuid,text,bigint,text,text) TO service_role;

-- 6) LNbits User Manager workflow (docs):
-- App flow (not implemented here):
-- 1) Create user wallet via LNbits User Manager API -> wallet_id, admin_key, invoice_key.
-- 2) Enable Scrub extension via admin_key; configure forward to external_ln_address; default 100% (scrub_percent=100) but user can adjust 0..100.
-- 3) Store in user_lightning_config: lnbits_wallet_id, lnbits_admin_key_enc:=private.enc(admin_key), lnbits_invoice_key_enc:=private.enc(invoice_key), external_ln_address (optional), scrub_enabled true/false, scrub_percent.
-- SECURITY: LN_BITS_ENC_KEY in Vault MUST equal LNbits DB key.

-- 7) Verification (run manually after apply):
-- Tables: SELECT column_name,data_type FROM information_schema.columns WHERE table_name IN ('user_lightning_config','custody_events') ORDER BY table_name,ordinal_position;
-- Policies: SELECT schemaname,tablename,policyname,roles,cmd FROM pg_policies WHERE tablename IN ('user_lightning_config','custody_events');
-- Indexes: SELECT tablename,indexname FROM pg_indexes WHERE tablename IN ('user_lightning_config','custody_events');
-- Functions: SELECT public.get_ln_proxy_data('someusername'); SELECT public.get_nip05_data('existing_username');
-- Domain updates remaining: SELECT COUNT(*) FROM public.nip05_records WHERE identifier LIKE '%@satnam.pub';

