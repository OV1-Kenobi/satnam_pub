-- database/migrations/validated_contacts.sql
-- Purpose: NFC tap-verified peer associations (Validated Contacts)
-- Idempotent by design; safe to run multiple times.

-- 1) Table
CREATE TABLE IF NOT EXISTS public.validated_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_duid TEXT NOT NULL,            -- User who tapped the card (auth.uid())
  contact_duid TEXT NOT NULL,          -- Card owner's user_duid
  contact_nip05 TEXT NOT NULL,         -- NIP-05 read from card (plaintext)
  card_uid_hash TEXT NOT NULL,         -- Owner-bound hash: SHA-256(card_uid || owner_salt) computed server-side
  verified_at TIMESTAMPTZ DEFAULT now(),
  verification_method TEXT DEFAULT 'nfc_tap',
  metadata JSONB,
  UNIQUE(owner_duid, contact_duid)
);

-- 2) RLS
ALTER TABLE public.validated_contacts ENABLE ROW LEVEL SECURITY;

DO $pl$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'validated_contacts' AND policyname = 'validated_contacts_owner_select'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY validated_contacts_owner_select
        ON public.validated_contacts FOR SELECT
        TO authenticated
        USING (owner_duid = auth.uid()::text)
    $sql$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'validated_contacts' AND policyname = 'validated_contacts_owner_insert'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY validated_contacts_owner_insert
        ON public.validated_contacts FOR INSERT
        TO authenticated
        WITH CHECK (owner_duid = auth.uid()::text)
    $sql$;
  END IF;
END$pl$;

-- 3) Indexes
DO $pl$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i' AND c.relname = 'idx_validated_contacts_owner' AND n.nspname = 'public'
  ) THEN
    EXECUTE 'CREATE INDEX idx_validated_contacts_owner ON public.validated_contacts(owner_duid)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i' AND c.relname = 'idx_validated_contacts_card_hash' AND n.nspname = 'public'
  ) THEN
    EXECUTE 'CREATE INDEX idx_validated_contacts_card_hash ON public.validated_contacts(card_uid_hash)';
  END IF;
END$pl$;

