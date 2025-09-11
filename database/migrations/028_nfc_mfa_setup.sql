-- NFC Physical MFA (NTAG424) Schema (Idempotent)
-- Privacy-first: never store raw tag UIDs or secrets. Use owner_hash (session hashedId) + hashed_tag_uid.
-- RLS uses app.current_user_hash GUC as in existing privacy-first tables.

DO $$
BEGIN
  RAISE NOTICE 'Creating NTAG424 tables (if not exists)...';
END $$;

-- Core registrations table (client code also reads from this name)
CREATE TABLE IF NOT EXISTS public.ntag424_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_hash TEXT NOT NULL,                                 -- session.hashedId (privacy-first)
  hashed_tag_uid TEXT NOT NULL UNIQUE,                       -- HMAC(user-hash || raw tag UID)
  uid TEXT,                                                 -- legacy/compat; should be NULL in privacy-first mode
  encrypted_config TEXT NOT NULL,                            -- Encrypted tag metadata/config (client-side encryption)
  family_role TEXT NOT NULL DEFAULT 'private' CHECK (family_role IN ('private','offspring','adult','steward','guardian')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used TIMESTAMPTZ
);

-- Operations log
CREATE TABLE IF NOT EXISTS public.ntag424_operations_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_hash TEXT NOT NULL,
  hashed_tag_uid TEXT,
  operation_type TEXT NOT NULL CHECK (operation_type IN ('auth','register','spend','sign')),
  success BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes (created conditionally inside DO blocks)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_ntag424_reg_owner_hash'
  ) THEN
    EXECUTE 'CREATE INDEX idx_ntag424_reg_owner_hash ON public.ntag424_registrations(owner_hash)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_ntag424_reg_hashed_uid'
  ) THEN
    EXECUTE 'CREATE INDEX idx_ntag424_reg_hashed_uid ON public.ntag424_registrations(hashed_tag_uid)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_ntag424_log_owner'
  ) THEN
    EXECUTE 'CREATE INDEX idx_ntag424_log_owner ON public.ntag424_operations_log(owner_hash)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_ntag424_log_time'
  ) THEN
    EXECUTE 'CREATE INDEX idx_ntag424_log_time ON public.ntag424_operations_log(timestamp)';
  END IF;
END $$;

-- RLS: enable and tie to app.current_user_hash (consistent with repo patterns)
ALTER TABLE public.ntag424_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ntag424_operations_log ENABLE ROW LEVEL SECURITY;

-- Owner policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ntag424_registrations' AND policyname='ntag424_registrations_owner'
  ) THEN
    EXECUTE 'CREATE POLICY ntag424_registrations_owner ON public.ntag424_registrations
      FOR ALL USING (owner_hash = current_setting(''app.current_user_hash'', true))
      WITH CHECK (owner_hash = current_setting(''app.current_user_hash'', true))';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ntag424_operations_log' AND policyname='ntag424_operations_owner'
  ) THEN
    EXECUTE 'CREATE POLICY ntag424_operations_owner ON public.ntag424_operations_log
      FOR ALL USING (owner_hash = current_setting(''app.current_user_hash'', true))
      WITH CHECK (owner_hash = current_setting(''app.current_user_hash'', true))';
  END IF;
END $$;

-- Ensure user_signing_preferences has NFC fields (if table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_signing_preferences'
  ) THEN
    BEGIN
      ALTER TABLE public.user_signing_preferences
        ADD COLUMN IF NOT EXISTS owner_hash TEXT,
        ADD COLUMN IF NOT EXISTS nfc_pin_timeout_seconds INTEGER NOT NULL DEFAULT 30,
        ADD COLUMN IF NOT EXISTS nfc_require_confirmation BOOLEAN NOT NULL DEFAULT true;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- Unique owner_hash constraint for upserts (idempotent)
    BEGIN
      ALTER TABLE public.user_signing_preferences
        ADD CONSTRAINT IF NOT EXISTS user_signing_prefs_owner_unique UNIQUE (owner_hash);
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- RLS policy aligned with app.current_user_hash
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_signing_preferences' AND policyname='usp_owner_hash'
    ) THEN
      EXECUTE 'CREATE POLICY usp_owner_hash ON public.user_signing_preferences
        FOR ALL USING (owner_hash = current_setting(''app.current_user_hash'', true))
        WITH CHECK (owner_hash = current_setting(''app.current_user_hash'', true))';
    END IF;
  END IF;
END $$;

COMMENT ON TABLE public.ntag424_registrations IS 'NTAG424 registrations (privacy-first): owner_hash + hashed_tag_uid + client-encrypted config';
COMMENT ON TABLE public.ntag424_operations_log IS 'NTAG424 operation audit log (auth/register/spend/sign) without sensitive data';

