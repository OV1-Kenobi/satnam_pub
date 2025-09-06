-- Idempotent migration: drop hashed_encrypted_nsec from user_identities
-- This environment allows breaking changes; only test accounts present
-- Ensure the column is removed safely and any dependent indexes dropped

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'user_identities' 
      AND column_name = 'hashed_encrypted_nsec'
  ) THEN
    -- Drop indexes referencing the column (if any)
    PERFORM 1;
    -- If named index exists, drop; otherwise skip
    IF EXISTS (
      SELECT 1 FROM pg_indexes 
      WHERE schemaname = 'public' 
        AND tablename = 'user_identities' 
        AND indexname = 'idx_user_identities_hashed_encrypted_nsec'
    ) THEN
      EXECUTE 'DROP INDEX IF EXISTS public.idx_user_identities_hashed_encrypted_nsec';
    END IF;

    -- Drop the column
    EXECUTE 'ALTER TABLE public.user_identities DROP COLUMN IF EXISTS hashed_encrypted_nsec';
  END IF;
END $$;

COMMIT;

