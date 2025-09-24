-- Additional indexes for contact_trust_metrics to optimize batch operations (idempotent)

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='contact_trust_metrics'
  ) THEN
    -- Index by owner_hash to speed lookups/updates by session owner
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname='public' AND indexname='idx_contact_trust_owner'
    ) THEN
      EXECUTE 'CREATE INDEX idx_contact_trust_owner ON public.contact_trust_metrics(owner_hash)';
    END IF;
  END IF;
END $$;

