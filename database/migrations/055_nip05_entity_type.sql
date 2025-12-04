-- Migration 055: Add entity_type column to nip05_records for unified namespace management
-- Purpose: Allow nip05_records to track both individual user and federation identity reservations
-- This prevents namespace collisions by having a single authoritative source for handle@domain availability
--
-- Privacy-first design:
--   - No plaintext identifiers stored (uses name_duid, pubkey_duid)
--   - entity_type only distinguishes 'user' vs 'federation' for resolution routing
--   - Federation pubkey_duid uses federation_duid for referential integrity
--
-- Author: Phase 4 Federation LNURL Implementation
-- Date: 2025-12-03

BEGIN;

-- 1) Add entity_type column with default 'user' for backward compatibility
ALTER TABLE public.nip05_records
  ADD COLUMN IF NOT EXISTS entity_type TEXT NOT NULL DEFAULT 'user';

-- 2) Add CHECK constraint to ensure valid entity types
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'nip05_records_entity_type_check'
      AND conrelid = 'public.nip05_records'::regclass
  ) THEN
    ALTER TABLE public.nip05_records 
      ADD CONSTRAINT nip05_records_entity_type_check 
      CHECK (entity_type IN ('user', 'federation'));
  END IF;
END $do$;

-- 3) Add index for efficient entity_type filtering (e.g., listing all federations)
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
      AND tablename = 'nip05_records' 
      AND indexname = 'idx_nip05_records_entity_type'
  ) THEN
    EXECUTE 'CREATE INDEX idx_nip05_records_entity_type ON public.nip05_records (entity_type)';
  END IF;
END $do$;

-- 4) Add federation_duid column for federation records
-- This provides referential integrity to family_federations without exposing handle plaintext
-- Design decision: federation_duid is REQUIRED for entity_type='federation' records (enforced by constraint below)
ALTER TABLE public.nip05_records
  ADD COLUMN IF NOT EXISTS federation_duid TEXT;

-- 5) Add foreign key constraint for referential integrity to family_federations
-- Note: This assumes family_federations.federation_duid is the primary key or has a unique constraint
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'nip05_records_federation_duid_fkey'
      AND conrelid = 'public.nip05_records'::regclass
  ) THEN
    -- Add FK constraint - will fail if family_federations doesn't have the reference column
    -- This is intentional to ensure proper schema dependencies
    ALTER TABLE public.nip05_records
      ADD CONSTRAINT nip05_records_federation_duid_fkey
      FOREIGN KEY (federation_duid)
      REFERENCES public.family_federations(federation_duid)
      ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN undefined_table OR undefined_column THEN
  RAISE NOTICE 'FK constraint not added: family_federations.federation_duid not available yet. Apply migration when family_federations table exists.';
END $do$;

-- 6) Add CHECK constraint: federation_duid is required when entity_type='federation'
-- This prevents data integrity gaps where federation records lack a proper DUID reference
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'nip05_records_federation_duid_required'
      AND conrelid = 'public.nip05_records'::regclass
  ) THEN
    ALTER TABLE public.nip05_records
      ADD CONSTRAINT nip05_records_federation_duid_required
      CHECK (
        (entity_type = 'federation' AND federation_duid IS NOT NULL) OR
        (entity_type = 'user' AND federation_duid IS NULL)
      );
  END IF;
END $do$;

-- 7) Add index for federation_duid lookups
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'nip05_records'
      AND indexname = 'idx_nip05_records_federation_duid'
  ) THEN
    EXECUTE 'CREATE INDEX idx_nip05_records_federation_duid ON public.nip05_records (federation_duid) WHERE federation_duid IS NOT NULL';
  END IF;
END $do$;

-- 8) Update RLS policy to allow service_role full access (needed for federation creation)
-- Drop and recreate to ensure clean state
DO $do$
BEGIN
  PERFORM 1 FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'nip05_records'
    AND policyname = 'nip05_records_service_role_all';
  IF FOUND THEN
    EXECUTE 'DROP POLICY nip05_records_service_role_all ON public.nip05_records';
  END IF;
END $do$;

CREATE POLICY nip05_records_service_role_all ON public.nip05_records
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 9) Grant necessary permissions
GRANT ALL ON public.nip05_records TO service_role;

COMMIT;

-- Verification queries (run after migration)
-- SELECT column_name, data_type, column_default, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_schema = 'public' AND table_name = 'nip05_records';

-- SELECT conname, pg_get_constraintdef(oid) 
-- FROM pg_constraint 
-- WHERE conrelid = 'public.nip05_records'::regclass;

-- SELECT indexname, indexdef 
-- FROM pg_indexes 
-- WHERE schemaname = 'public' AND tablename = 'nip05_records';

-- SELECT policyname, cmd, roles, qual, with_check 
-- FROM pg_policies 
-- WHERE schemaname = 'public' AND tablename = 'nip05_records';

