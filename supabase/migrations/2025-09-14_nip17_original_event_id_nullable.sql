-- Migration: Allow NULL original_event_id for NIP-17 sealed messages
-- Purpose: NIP-17 sealed content prevents server from deriving inner (kind:14) event id.
--          This migration makes original_event_id nullable only when protocol = 'nip17'.
-- Idempotent: Safe to run multiple times.
-- Notes:
-- - We drop NOT NULL constraint on original_event_id, then add a CHECK constraint that
--   enforces non-null except for rows marked protocol = 'nip17'.
-- - Uses DO blocks to guard constraint creation by name.

BEGIN;

-- 1) Ensure target column exists before proceeding
DO $$
DECLARE
  col_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'gift_wrapped_messages'
      AND column_name = 'original_event_id'
  ) INTO col_exists;

  IF NOT col_exists THEN
    RAISE NOTICE 'Column public.gift_wrapped_messages.original_event_id not found; skipping nullable/constraint adjustments.';
  END IF;
END$$;

-- 2) Drop NOT NULL on original_event_id (no-op if already nullable)
ALTER TABLE IF EXISTS public.gift_wrapped_messages
  ALTER COLUMN original_event_id DROP NOT NULL;

-- 3) Add conditional CHECK constraint: original_event_id must be NOT NULL unless protocol = 'nip17'
--    Create only if it does not already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'gift_wrapped_messages_original_event_id_nip17_check'
      AND conrelid = 'public.gift_wrapped_messages'::regclass
  ) THEN
    ALTER TABLE public.gift_wrapped_messages
      ADD CONSTRAINT gift_wrapped_messages_original_event_id_nip17_check
      CHECK (protocol = 'nip17' OR original_event_id IS NOT NULL) NOT VALID;

    -- Validate in a separate step to avoid long exclusive locks
    ALTER TABLE public.gift_wrapped_messages
      VALIDATE CONSTRAINT gift_wrapped_messages_original_event_id_nip17_check;
  END IF;
END$$;

-- Optional: document the rationale
COMMENT ON CONSTRAINT gift_wrapped_messages_original_event_id_nip17_check ON public.gift_wrapped_messages
  IS 'Allows NULL original_event_id only when protocol = ''nip17'' (sealed, unsigned inner).';

COMMIT;

