-- Enforce protocol values in gift_wrapped_messages (idempotent)
-- Valid values: 'nip59','nip04','nip17','mls'

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'gift_wrapped_messages'
      AND c.conname = 'gift_wrapped_messages_protocol_check'
  ) THEN
    EXECUTE 'ALTER TABLE public.gift_wrapped_messages
             ADD CONSTRAINT gift_wrapped_messages_protocol_check
             CHECK (protocol IN (''nip59'',''nip04'',''nip17'',''mls''))';
  END IF;
END $$;

