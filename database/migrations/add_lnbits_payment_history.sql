-- database/migrations/add_lnbits_payment_history.sql
-- Idempotent migration adding lnbits_payment_events for UI history
-- Privacy-first: store minimal payment metadata only (no secrets)

BEGIN;

CREATE TABLE IF NOT EXISTS public.lnbits_payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_duid TEXT NOT NULL,
  payment_hash TEXT NOT NULL,
  amount_sats BIGINT NOT NULL,
  lightning_address TEXT,
  memo TEXT,
  lnurlp_link_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Unique constraint to ensure idempotent webhook inserts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='uq_lnbits_payment_events_payment_hash'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX uq_lnbits_payment_events_payment_hash ON public.lnbits_payment_events(payment_hash)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_lnbits_payment_events_user_duid_created_at'
  ) THEN
    EXECUTE 'CREATE INDEX idx_lnbits_payment_events_user_duid_created_at ON public.lnbits_payment_events(user_duid, created_at DESC)';
  END IF;
END $$;

-- Enable RLS and apply self-only policies
ALTER TABLE public.lnbits_payment_events ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE _p TEXT; BEGIN
  FOR _p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='lnbits_payment_events' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.lnbits_payment_events', _p);
  END LOOP;
END $$;

CREATE POLICY lnbits_payment_events_select_self ON public.lnbits_payment_events
  FOR SELECT USING (user_duid = auth.uid()::text);
CREATE POLICY lnbits_payment_events_insert_self ON public.lnbits_payment_events
  FOR INSERT WITH CHECK (user_duid = auth.uid()::text);

COMMIT;

