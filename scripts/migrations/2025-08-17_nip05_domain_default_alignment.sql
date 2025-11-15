-- Migration: Align nip05_records.domain default with canonical identity domain
-- Parent migration: 2025-08-16_nip05_records_privacy.sql
-- Context: NIP-05 Domain Environment Variable Standardization
-- Canonical identity domain: 'my.satnam.pub'
--
-- Objectives:
-- 1) Update nip05_records.domain column default from 'satnam.pub' to 'my.satnam.pub'.
-- 2) Update any existing rows that still use the legacy domain value 'satnam.pub'.
-- 3) Keep the migration idempotent and safe to run multiple times.

BEGIN;

-- 1) Align nip05_records.domain column default with 'my.satnam.pub'
DO $do$
DECLARE
  current_default text;
BEGIN
  -- Ensure the nip05_records.domain column exists before attempting to alter it
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'nip05_records'
      AND column_name  = 'domain'
  ) THEN
    -- Table or column does not exist; nothing to align.
    RETURN;
  END IF;

  -- Read the current default expression for nip05_records.domain (if any)
  SELECT pg_get_expr(d.adbin, d.adrelid)
  INTO current_default
  FROM pg_attrdef d
  JOIN pg_attribute a
    ON a.attrelid = d.adrelid
   AND a.attnum   = d.adnum
  WHERE d.adrelid = 'public.nip05_records'::regclass
    AND a.attname = 'domain'
  LIMIT 1;

  -- Only change the default if it is not already aligned to 'my.satnam.pub'
  IF current_default IS NULL OR current_default NOT LIKE '%my.satnam.pub%'
  THEN
    ALTER TABLE public.nip05_records
      ALTER COLUMN domain SET DEFAULT 'my.satnam.pub';
  END IF;
END;
$do$;

-- 2) Update any existing rows using the legacy domain value 'satnam.pub'
DO $do$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'nip05_records'
      AND column_name  = 'domain'
  ) THEN
    UPDATE public.nip05_records
    SET domain = 'my.satnam.pub'
    WHERE domain = 'satnam.pub';
  END IF;
END;
$do$;

COMMIT;

-- Verification: confirm domain default and distribution of domain values
--
-- 1) Show the current default expression for nip05_records.domain
SELECT
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'nip05_records'
  AND column_name  = 'domain';

-- 2) Show row counts grouped by domain (should normally be 'my.satnam.pub' only
--    in this greenfield deployment, but this also reveals any unexpected values)
SELECT domain, count(*) AS row_count
FROM public.nip05_records
GROUP BY domain
ORDER BY domain;

