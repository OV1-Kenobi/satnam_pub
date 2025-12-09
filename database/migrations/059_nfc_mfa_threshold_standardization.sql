-- Migration 059: Standardize family_federations.nfc_mfa_threshold to INTEGER (1-5)
-- Date: 2025-12-09
-- Purpose:
--   - Normalize nfc_mfa_threshold to INTEGER with CHECK 1-5
--   - Migrate any legacy TEXT values ('all' / 'threshold') to integer equivalents
--   - Drop legacy CHECK constraints referencing nfc_mfa_threshold
--   - Be safe and idempotent across mixed environments

-- ==========================================================================
-- STEP 1: STANDARDIZE nfc_mfa_threshold COLUMN TYPE AND VALUES
-- ==========================================================================

DO $$
DECLARE
  v_data_type TEXT;
  con_rec RECORD;
BEGIN
  -- Detect current data type of nfc_mfa_threshold (if column exists)
  SELECT c.data_type
  INTO v_data_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name   = 'family_federations'
    AND c.column_name  = 'nfc_mfa_threshold';

  IF v_data_type IS NULL THEN
    -- Column does not exist yet: create as INTEGER with default 2
    ALTER TABLE public.family_federations
      ADD COLUMN nfc_mfa_threshold INTEGER DEFAULT 2;
  ELSE
    -- Column exists; normalize based on current type
    IF v_data_type = 'text' THEN
      -- Map legacy TEXT values to numeric equivalents before type conversion
      -- 'all' and 'threshold' -> 2 (2-of-N NFC MFA by default)
      UPDATE public.family_federations
      SET nfc_mfa_threshold = '2'
      WHERE nfc_mfa_threshold IN ('all', 'threshold')
         OR nfc_mfa_threshold IS NULL;

      -- For any unexpected non-numeric strings, fall back to '2'
      UPDATE public.family_federations
      SET nfc_mfa_threshold = '2'
      WHERE nfc_mfa_threshold !~ '^[0-9]+$';

    ELSIF v_data_type = 'integer' THEN
      -- Already integer; normalize NULLs and out-of-range values before reapplying CHECK
      UPDATE public.family_federations
      SET nfc_mfa_threshold = 2
      WHERE nfc_mfa_threshold IS NULL;

      UPDATE public.family_federations
      SET nfc_mfa_threshold = 1
      WHERE nfc_mfa_threshold < 1;

      UPDATE public.family_federations
      SET nfc_mfa_threshold = 5
      WHERE nfc_mfa_threshold > 5;
    ELSE
      -- Unexpected type: best-effort normalization, let USING cast handle failures
      UPDATE public.family_federations
      SET nfc_mfa_threshold = 2
      WHERE nfc_mfa_threshold IS NULL;
    END IF;

    -- Drop any existing CHECK constraints that reference nfc_mfa_threshold
    FOR con_rec IN
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      WHERE nsp.nspname = 'public'
        AND rel.relname = 'family_federations'
        AND con.contype = 'c'
        AND pg_get_constraintdef(con.oid, true) ILIKE '%nfc_mfa_threshold%'
    LOOP
      EXECUTE format(
        'ALTER TABLE public.family_federations DROP CONSTRAINT IF EXISTS %I;',
        con_rec.conname
      );
    END LOOP;

    -- If type is not already integer, drop any existing default (which may be
    -- a TEXT expression like 'all' / 'threshold') before converting the type.
    -- This avoids "default cannot be cast automatically" errors.
    IF v_data_type <> 'integer' THEN
      ALTER TABLE public.family_federations
        ALTER COLUMN nfc_mfa_threshold DROP DEFAULT;

      ALTER TABLE public.family_federations
        ALTER COLUMN nfc_mfa_threshold TYPE integer
        USING nfc_mfa_threshold::integer;
    END IF;

    -- After type conversion, ensure all values are within [1, 5]
    UPDATE public.family_federations
    SET nfc_mfa_threshold = 2
    WHERE nfc_mfa_threshold IS NULL;

    UPDATE public.family_federations
    SET nfc_mfa_threshold = 1
    WHERE nfc_mfa_threshold < 1;

    UPDATE public.family_federations
    SET nfc_mfa_threshold = 5
    WHERE nfc_mfa_threshold > 5;
  END IF;

  -- Ensure INTEGER default is set to 2
  ALTER TABLE public.family_federations
    ALTER COLUMN nfc_mfa_threshold SET DEFAULT 2;

  -- Re-create standard CHECK constraint if missing
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'family_federations'
      AND con.contype = 'c'
      AND con.conname = 'family_federations_nfc_mfa_threshold_check'
  ) THEN
    ALTER TABLE public.family_federations
      ADD CONSTRAINT family_federations_nfc_mfa_threshold_check
      CHECK (nfc_mfa_threshold >= 1 AND nfc_mfa_threshold <= 5);
  END IF;
END;
$$ LANGUAGE plpgsql;

