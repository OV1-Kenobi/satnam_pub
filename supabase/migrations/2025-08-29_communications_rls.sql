-- Additional RLS clarifications and indexes for communications

-- Ensure RLS is enabled (idempotent)
ALTER TABLE IF EXISTS encrypted_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS gift_wrapped_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS message_read_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS encrypted_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS group_members ENABLE ROW LEVEL SECURITY;

-- Helpful index to accelerate per-conversation queries
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_gwm_pair_created'
  ) THEN
    EXECUTE 'CREATE INDEX idx_gwm_pair_created ON gift_wrapped_messages ((LEAST(sender_hash, recipient_hash)), (GREATEST(sender_hash, recipient_hash)), created_at DESC)';
  END IF;
END $$;

