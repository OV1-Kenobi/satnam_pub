-- database/migrations/add_nostr_nip05_to_boltcards.sql
-- Purpose: Add nostr_nip05 column to lnbits_boltcards to persist Nostr identity bound to a card
-- Idempotent with guard clauses

DO $pl$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lnbits_boltcards' AND column_name = 'nostr_nip05'
  ) THEN
    EXECUTE $sql$ALTER TABLE public.lnbits_boltcards ADD COLUMN nostr_nip05 TEXT$sql$;
  END IF;
END$pl$;

