-- database/migrations/add_lnbits_integration.sql
-- Idempotent migration for LNbits integration (wallets + boltcards)
-- NOTE: Aligns with privacy-first architecture; stores only references and encrypted keys

BEGIN;

-- lnbits_wallets: one row per Satnam user
CREATE TABLE IF NOT EXISTS public.lnbits_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_duid TEXT NOT NULL, -- matches auth.uid() / user_identities.id
  lnbits_user_id TEXT NOT NULL,
  wallet_id TEXT NOT NULL,
  wallet_admin_key_enc TEXT,
  wallet_invoice_key_enc TEXT,
  lnurlp_link_id TEXT,
  lnurlp_username TEXT,
  lnurlp_domain TEXT,
  lightning_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Uniqueness and lookup aids
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_lnbits_wallets_user_duid'
  ) THEN
    EXECUTE 'CREATE INDEX idx_lnbits_wallets_user_duid ON public.lnbits_wallets(user_duid)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_lnbits_wallets_lnurlp_link_id'
  ) THEN
    EXECUTE 'CREATE INDEX idx_lnbits_wallets_lnurlp_link_id ON public.lnbits_wallets(lnurlp_link_id)';
  END IF;
END $$;

-- lnbits_boltcards: one row per card (no secrets stored)
CREATE TABLE IF NOT EXISTS public.lnbits_boltcards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_duid TEXT NOT NULL,
  wallet_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  label TEXT,
  spend_limit_sats BIGINT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Store encrypted auth link and PIN verification data (no plaintext)
ALTER TABLE public.lnbits_boltcards
  ADD COLUMN IF NOT EXISTS auth_link_enc TEXT,
  ADD COLUMN IF NOT EXISTS pin_salt BYTEA,
  ADD COLUMN IF NOT EXISTS pin_hash_enc TEXT,
  ADD COLUMN IF NOT EXISTS pin_last_set_at TIMESTAMPTZ;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_lnbits_boltcards_user_duid'
  ) THEN
    EXECUTE 'CREATE INDEX idx_lnbits_boltcards_user_duid ON public.lnbits_boltcards(user_duid)';
  END IF;
END $$;

-- RLS Policies (example, adapt to your RLS approach). We assume RLS ON and auth.uid() usage
ALTER TABLE public.lnbits_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lnbits_boltcards ENABLE ROW LEVEL SECURITY;

-- Drop existing permissive policies safely then recreate minimal principle ones
DO $$
DECLARE
  _policy TEXT;
BEGIN
  FOR _policy IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='lnbits_wallets' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.lnbits_wallets', _policy);
  END LOOP;
  FOR _policy IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='lnbits_boltcards' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.lnbits_boltcards', _policy);
  END LOOP;
END $$;

-- lnbits_wallets
CREATE POLICY lnbits_wallets_select_self ON public.lnbits_wallets
  FOR SELECT USING (user_duid = auth.uid()::text);
CREATE POLICY lnbits_wallets_insert_self ON public.lnbits_wallets
  FOR INSERT WITH CHECK (user_duid = auth.uid()::text);
CREATE POLICY lnbits_wallets_update_self ON public.lnbits_wallets
  FOR UPDATE USING (user_duid = auth.uid()::text) WITH CHECK (user_duid = auth.uid()::text);

-- lnbits_boltcards
CREATE POLICY lnbits_boltcards_select_self ON public.lnbits_boltcards
  FOR SELECT USING (user_duid = auth.uid()::text);
CREATE POLICY lnbits_boltcards_insert_self ON public.lnbits_boltcards
  FOR INSERT WITH CHECK (user_duid = auth.uid()::text);
CREATE POLICY lnbits_boltcards_update_self ON public.lnbits_boltcards
  FOR UPDATE USING (user_duid = auth.uid()::text) WITH CHECK (user_duid = auth.uid()::text);

COMMIT;
