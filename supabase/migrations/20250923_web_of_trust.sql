-- Web of Trust schema (idempotent)
-- Creates issuer_registry, contact_attestations, extends contact_verification_status
-- and applies owner_hash-scoped RLS where applicable.

-- 1) Issuer registry (platform-scoped)
CREATE TABLE IF NOT EXISTS public.issuer_registry (
  issuer_id TEXT PRIMARY KEY,
  issuer_did TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('did:jwk','did:web')),
  domain TEXT,
  jwk_thumbprint TEXT,
  did_web_url TEXT,
  status TEXT NOT NULL CHECK (status IN ('active','paused','revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS and allow read of active issuers to all authenticated requests
ALTER TABLE public.issuer_registry ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'issuer_registry' AND policyname = 'issuer_registry_select_active'
  ) THEN
    EXECUTE 'CREATE POLICY issuer_registry_select_active ON public.issuer_registry FOR SELECT USING (status = ''active'')';
  END IF;
END $$;

-- 2) Contact attestations (owner-scoped)
CREATE TABLE IF NOT EXISTS public.contact_attestations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_hash TEXT NOT NULL,
  contact_id UUID NOT NULL REFERENCES public.encrypted_contacts(id) ON DELETE CASCADE,
  vp_hash TEXT,
  attestation_type TEXT NOT NULL CHECK (attestation_type IN ('physical_nfc','vp_jwt','inbox_relays','group_peer')),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  metadata_encrypted TEXT,
  UNIQUE (owner_hash, contact_id, attestation_type, vp_hash)
);

-- Safety: if contact_attestations.contact_id was created as TEXT, convert to UUID
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='contact_attestations' AND column_name='contact_id' AND data_type='text'
  ) THEN
    EXECUTE 'ALTER TABLE public.contact_attestations ALTER COLUMN contact_id TYPE uuid USING contact_id::uuid';
  END IF;
END $$;

ALTER TABLE public.contact_attestations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'contact_attestations' AND policyname = 'contact_attestations_owner_read'
  ) THEN
    EXECUTE 'CREATE POLICY contact_attestations_owner_read ON public.contact_attestations FOR SELECT USING (owner_hash = current_setting(''app.current_user_hash'', true))';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'contact_attestations' AND policyname = 'contact_attestations_owner_write'
  ) THEN
    EXECUTE 'CREATE POLICY contact_attestations_owner_write ON public.contact_attestations FOR INSERT WITH CHECK (owner_hash = current_setting(''app.current_user_hash'', true))';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'contact_attestations' AND policyname = 'contact_attestations_owner_update'
  ) THEN
    EXECUTE 'CREATE POLICY contact_attestations_owner_update ON public.contact_attestations FOR UPDATE USING (owner_hash = current_setting(''app.current_user_hash'', true))';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'contact_attestations' AND policyname = 'contact_attestations_owner_delete'
  ) THEN
    EXECUTE 'CREATE POLICY contact_attestations_owner_delete ON public.contact_attestations FOR DELETE USING (owner_hash = current_setting(''app.current_user_hash'', true))';
  END IF;
END $$;

-- Helpful indexes
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relname='idx_contact_attest_owner_contact' AND n.nspname='public'
  ) THEN
    EXECUTE 'CREATE INDEX idx_contact_attest_owner_contact ON public.contact_attestations(owner_hash, contact_id)';
  END IF;
END $$;

-- 3) Extend contact_verification_status
-- Ensure table exists (minimal shape); if already exists this is a no-op
CREATE TABLE IF NOT EXISTS public.contact_verification_status (
  id SERIAL PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.encrypted_contacts(id) ON DELETE CASCADE,
  owner_hash TEXT NOT NULL
);

-- Safety: if contact_verification_status.contact_id was created as TEXT, convert to UUID
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='contact_verification_status' AND column_name='contact_id' AND data_type='text'
  ) THEN
    EXECUTE 'ALTER TABLE public.contact_verification_status ALTER COLUMN contact_id TYPE uuid USING contact_id::uuid';
  END IF;
END $$;

ALTER TABLE public.contact_verification_status ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'contact_verification_status' AND policyname = 'contact_verif_owner_read'
  ) THEN
    EXECUTE 'CREATE POLICY contact_verif_owner_read ON public.contact_verification_status FOR SELECT USING (owner_hash = current_setting(''app.current_user_hash'', true))';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'contact_verification_status' AND policyname = 'contact_verif_owner_write'
  ) THEN
    EXECUTE 'CREATE POLICY contact_verif_owner_write ON public.contact_verification_status FOR INSERT WITH CHECK (owner_hash = current_setting(''app.current_user_hash'', true))';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'contact_verification_status' AND policyname = 'contact_verif_owner_update'
  ) THEN
    EXECUTE 'CREATE POLICY contact_verif_owner_update ON public.contact_verification_status FOR UPDATE USING (owner_hash = current_setting(''app.current_user_hash'', true))';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'contact_verification_status' AND policyname = 'contact_verif_owner_delete'
  ) THEN
    EXECUTE 'CREATE POLICY contact_verif_owner_delete ON public.contact_verification_status FOR DELETE USING (owner_hash = current_setting(''app.current_user_hash'', true))';
  END IF;
END $$;

-- Add new columns if missing
ALTER TABLE public.contact_verification_status ADD COLUMN IF NOT EXISTS physical_mfa_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE public.contact_verification_status ADD COLUMN IF NOT EXISTS physical_verification_date TIMESTAMPTZ;
ALTER TABLE public.contact_verification_status ADD COLUMN IF NOT EXISTS vp_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE public.contact_verification_status ADD COLUMN IF NOT EXISTS vp_verified_at TIMESTAMPTZ;
ALTER TABLE public.contact_verification_status ADD COLUMN IF NOT EXISTS verification_proofs_encrypted TEXT;

-- Ensure uniqueness per owner+contact
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='uq_contact_verif_owner_contact'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX uq_contact_verif_owner_contact ON public.contact_verification_status(owner_hash, contact_id)';
  END IF;
END $$;

