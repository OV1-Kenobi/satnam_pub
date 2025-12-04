-- ============================================================================
-- Migration 053: Federation Lightning Configuration Table
-- Date: 2025-12-03
-- Purpose:
--   - Create federation_lightning_config table mirroring user_lightning_config
--   - Store encrypted LNbits admin/invoice keys for federation wallets
--   - Support external Lightning address forwarding (Scrub pattern)
--   - Enable federation LNURL-pay operations
--
-- Dependencies:
--   - Migration 048: family_federations table must exist
--   - Migration 052: federation_lnbits_wallet_id column on family_federations
--   - 20251011_hybrid_minimal_custody_lightning.sql: private.enc()/dec() functions
--
-- Privacy-First Design:
--   - LNbits keys encrypted at rest using private.enc() (LN_BITS_ENC_KEY from Vault)
--   - federation_handle stored for LNURL lookup (public identifier, not PII)
--   - RLS restricts access to federation stewards/guardians only
--
-- Idempotent: Safe to run multiple times
-- ============================================================================

-- Ensure pgcrypto extension is available
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- TABLE: federation_lightning_config
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.federation_lightning_config (
  -- Primary key is the federation_duid (matches family_federations.federation_duid)
  federation_duid TEXT PRIMARY KEY,
  
  -- Federation handle for LNURL/NIP-05 lookup (e.g., "smith-family")
  -- This is the local part of handle@my.satnam.pub
  federation_handle TEXT UNIQUE NOT NULL,
  
  -- External self-custody Lightning address (optional, for Scrub forwarding)
  external_ln_address TEXT,
  
  -- Platform Lightning address (computed from federation_handle)
  platform_ln_address TEXT GENERATED ALWAYS AS (federation_handle || '@my.satnam.pub') STORED,
  
  -- LNbits wallet configuration
  lnbits_wallet_id TEXT NOT NULL,
  lnbits_admin_key_enc TEXT NOT NULL,
  lnbits_invoice_key_enc TEXT NOT NULL,
  
  -- Scrub forwarding configuration (same as user_lightning_config)
  scrub_enabled BOOLEAN DEFAULT false,
  scrub_percent INTEGER NOT NULL DEFAULT 100 CHECK (scrub_percent >= 0 AND scrub_percent <= 100),
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Handle format constraint (lowercase alphanumeric + hyphen/underscore)
  CONSTRAINT chk_federation_handle_format CHECK (
    federation_handle = lower(federation_handle) AND 
    federation_handle ~ '^[a-z0-9][a-z0-9_-]*[a-z0-9]$|^[a-z0-9]$'
  )
);

-- Add foreign key to family_federations if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'federation_lightning_config_federation_fkey'
    AND table_name = 'federation_lightning_config'
  ) THEN
    ALTER TABLE public.federation_lightning_config
    ADD CONSTRAINT federation_lightning_config_federation_fkey
    FOREIGN KEY (federation_duid) REFERENCES public.family_federations(federation_duid) ON DELETE CASCADE;
    RAISE NOTICE '✓ Added foreign key constraint to family_federations';
  ELSE
    RAISE NOTICE '✓ Foreign key constraint already exists';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Warning: Could not add foreign key (family_federations may not exist): %', SQLERRM;
END $$;

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Index on platform_ln_address for LNURL lookup
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
    AND tablename = 'federation_lightning_config' 
    AND indexname = 'idx_flc_platform_ln_address'
  ) THEN
    CREATE UNIQUE INDEX idx_flc_platform_ln_address 
    ON public.federation_lightning_config(platform_ln_address);
    RAISE NOTICE '✓ Created index idx_flc_platform_ln_address';
  END IF;
END $$;

-- Index on lnbits_wallet_id for secure decrypt wrapper lookups
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
    AND tablename = 'federation_lightning_config' 
    AND indexname = 'idx_flc_lnbits_wallet_id'
  ) THEN
    CREATE INDEX idx_flc_lnbits_wallet_id 
    ON public.federation_lightning_config(lnbits_wallet_id);
    RAISE NOTICE '✓ Created index idx_flc_lnbits_wallet_id';
  END IF;
END $$;

-- ============================================================================
-- TRIGGER: updated_at auto-update
-- ============================================================================

-- Reuse existing tg_touch_updated_at function from user_lightning_config migration
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_flc_touch_updated_at') THEN
    CREATE TRIGGER trg_flc_touch_updated_at 
    BEFORE UPDATE ON public.federation_lightning_config 
    FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
    RAISE NOTICE '✓ Created trigger trg_flc_touch_updated_at';
  END IF;
END $$;

-- ============================================================================
-- TRIGGER: Scrub defaults (same logic as user_lightning_config)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.tg_flc_scrub_defaults() 
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.scrub_enabled IS TRUE AND NEW.scrub_percent IS NULL THEN 
    NEW.scrub_percent := 100; 
  END IF; 
  RETURN NEW; 
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_flc_scrub_defaults') THEN
    CREATE TRIGGER trg_flc_scrub_defaults
    BEFORE INSERT OR UPDATE ON public.federation_lightning_config
    FOR EACH ROW EXECUTE FUNCTION public.tg_flc_scrub_defaults();
    RAISE NOTICE '✓ Created trigger trg_flc_scrub_defaults';
  END IF;
END $$;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.federation_lightning_config ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS flc_steward_guardian_select ON public.federation_lightning_config;
DROP POLICY IF EXISTS flc_steward_guardian_insert ON public.federation_lightning_config;
DROP POLICY IF EXISTS flc_steward_guardian_update ON public.federation_lightning_config;
DROP POLICY IF EXISTS flc_service_role_all ON public.federation_lightning_config;

-- Policy: Stewards and guardians can SELECT their federation's lightning config
CREATE POLICY flc_steward_guardian_select ON public.federation_lightning_config
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.family_members fm
      JOIN public.family_federations ff ON ff.id = fm.family_federation_id
      WHERE ff.federation_duid = federation_lightning_config.federation_duid
        AND fm.user_duid = auth.uid()::text
        AND fm.family_role IN ('steward', 'guardian')
        AND fm.is_active = true
    )
  );

-- Policy: Stewards and guardians can INSERT (for initial provisioning)
CREATE POLICY flc_steward_guardian_insert ON public.federation_lightning_config
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.family_members fm
      JOIN public.family_federations ff ON ff.id = fm.family_federation_id
      WHERE ff.federation_duid = federation_lightning_config.federation_duid
        AND fm.user_duid = auth.uid()::text
        AND fm.family_role IN ('steward', 'guardian')
        AND fm.is_active = true
    )
  );

-- Policy: Stewards can UPDATE (for external_ln_address, scrub config)
CREATE POLICY flc_steward_guardian_update ON public.federation_lightning_config
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.family_members fm
      JOIN public.family_federations ff ON ff.id = fm.family_federation_id
      WHERE ff.federation_duid = federation_lightning_config.federation_duid
        AND fm.user_duid = auth.uid()::text
        AND fm.family_role IN ('steward', 'guardian')
        AND fm.is_active = true
    )
  );

-- Policy: Service role has full access (for Netlify functions)
CREATE POLICY flc_service_role_all ON public.federation_lightning_config
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- TABLE COMMENTS
-- ============================================================================

COMMENT ON TABLE public.federation_lightning_config IS
  'Federation Lightning wallet configuration for LNURL-pay operations. Mirrors user_lightning_config pattern with encrypted LNbits keys.';

COMMENT ON COLUMN public.federation_lightning_config.federation_duid IS
  'Primary key linking to family_federations.federation_duid';

COMMENT ON COLUMN public.federation_lightning_config.federation_handle IS
  'User-chosen handle for NIP-05 and Lightning address (local part of handle@my.satnam.pub)';

COMMENT ON COLUMN public.federation_lightning_config.external_ln_address IS
  'Optional external self-custody Lightning address for Scrub forwarding';

COMMENT ON COLUMN public.federation_lightning_config.platform_ln_address IS
  'Computed platform Lightning address (federation_handle@my.satnam.pub)';

COMMENT ON COLUMN public.federation_lightning_config.lnbits_wallet_id IS
  'LNbits wallet identifier (plaintext, not PII)';

COMMENT ON COLUMN public.federation_lightning_config.lnbits_admin_key_enc IS
  'LNbits admin key encrypted via private.enc() using LN_BITS_ENC_KEY from Vault';

COMMENT ON COLUMN public.federation_lightning_config.lnbits_invoice_key_enc IS
  'LNbits invoice key encrypted via private.enc() using LN_BITS_ENC_KEY from Vault';

COMMENT ON COLUMN public.federation_lightning_config.scrub_enabled IS
  'Whether to forward incoming payments to external_ln_address via Scrub';

COMMENT ON COLUMN public.federation_lightning_config.scrub_percent IS
  'Percentage of incoming payments to forward (0-100)';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
  v_table_exists boolean;
  v_column_count integer;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'federation_lightning_config'
  ) INTO v_table_exists;

  SELECT COUNT(*) INTO v_column_count
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'federation_lightning_config';

  IF v_table_exists AND v_column_count >= 10 THEN
    RAISE NOTICE '✓ Migration 053 verification successful. federation_lightning_config table created with % columns.', v_column_count;
  ELSE
    RAISE WARNING 'Migration 053 verification failed. Table exists: %, Column count: %', v_table_exists, v_column_count;
  END IF;
END $$;

