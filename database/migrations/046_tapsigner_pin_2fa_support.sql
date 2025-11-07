-- Migration: 046_tapsigner_pin_2fa_support.sql
-- Purpose: Add PIN 2FA support to Tapsigner operations
-- Date: November 6, 2025
-- Status: Ready for execution in Supabase SQL Editor

-- ============================================================================
-- 1. UPDATE OPERATION_TYPE CONSTRAINT
-- ============================================================================
-- Add new operation types for PIN validation tracking
-- Note: This uses a workaround since PostgreSQL doesn't allow direct constraint modification
-- We'll create a new constraint and drop the old one

DO $$
BEGIN
  -- Drop old constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'tapsigner_operations_log' 
    AND constraint_name = 'tapsigner_operations_log_operation_type_check'
  ) THEN
    ALTER TABLE public.tapsigner_operations_log 
    DROP CONSTRAINT tapsigner_operations_log_operation_type_check;
  END IF;
  
  -- Add new constraint with PIN operation types
  ALTER TABLE public.tapsigner_operations_log
  ADD CONSTRAINT tapsigner_operations_log_operation_type_check 
  CHECK (operation_type IN (
    'register',
    'auth',
    'sign',
    'payment',
    'verify',
    'error',
    'sign_nostr_event',
    'authorize_action',
    'pin_validation_failed',
    'pin_validation_success'
  ));
EXCEPTION WHEN OTHERS THEN
  -- Constraint may already exist, continue
  NULL;
END $$;

-- ============================================================================
-- 2. ADD PIN TRACKING COLUMNS TO TAPSIGNER_REGISTRATIONS
-- ============================================================================
-- Track PIN attempt count and lockout status per card

DO $$
BEGIN
  -- Add pin_attempts column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
    AND table_name = 'tapsigner_registrations' 
    AND column_name = 'pin_attempts'
  ) THEN
    ALTER TABLE public.tapsigner_registrations
    ADD COLUMN pin_attempts INTEGER DEFAULT 0;
    
    COMMENT ON COLUMN public.tapsigner_registrations.pin_attempts IS
      'Failed PIN attempt counter for rate limiting. Reset after successful PIN validation.';
  END IF;
  
  -- Add pin_locked_until column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
    AND table_name = 'tapsigner_registrations' 
    AND column_name = 'pin_locked_until'
  ) THEN
    ALTER TABLE public.tapsigner_registrations
    ADD COLUMN pin_locked_until TIMESTAMPTZ;
    
    COMMENT ON COLUMN public.tapsigner_registrations.pin_locked_until IS
      'Timestamp when PIN lockout expires (15 minutes after 3 failed attempts). NULL if not locked.';
  END IF;
  
  -- Add last_pin_attempt column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
    AND table_name = 'tapsigner_registrations' 
    AND column_name = 'last_pin_attempt'
  ) THEN
    ALTER TABLE public.tapsigner_registrations
    ADD COLUMN last_pin_attempt TIMESTAMPTZ;
    
    COMMENT ON COLUMN public.tapsigner_registrations.last_pin_attempt IS
      'Timestamp of last PIN validation attempt (successful or failed).';
  END IF;
END $$;

-- ============================================================================
-- 3. CREATE INDEXES FOR PIN LOCKOUT QUERIES
-- ============================================================================
-- Optimize queries for checking PIN lockout status

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
    AND indexname = 'idx_tapsigner_pin_locked_until'
  ) THEN
    CREATE INDEX idx_tapsigner_pin_locked_until 
    ON public.tapsigner_registrations(pin_locked_until)
    WHERE pin_locked_until IS NOT NULL;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
    AND indexname = 'idx_tapsigner_pin_attempts'
  ) THEN
    CREATE INDEX idx_tapsigner_pin_attempts 
    ON public.tapsigner_registrations(pin_attempts)
    WHERE pin_attempts > 0;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
    AND indexname = 'idx_tapsigner_ops_pin_validation'
  ) THEN
    CREATE INDEX idx_tapsigner_ops_pin_validation 
    ON public.tapsigner_operations_log(operation_type, timestamp DESC)
    WHERE operation_type IN ('pin_validation_failed', 'pin_validation_success');
  END IF;
END $$;

-- ============================================================================
-- 4. CREATE HELPER FUNCTION FOR PIN LOCKOUT CHECK
-- ============================================================================
-- Check if card is currently locked due to failed PIN attempts

CREATE OR REPLACE FUNCTION check_pin_lockout(
  p_card_id_hash TEXT,
  p_owner_hash TEXT
) RETURNS TABLE (
  is_locked BOOLEAN,
  attempts_remaining INTEGER,
  lockout_expires_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    CASE 
      WHEN pin_locked_until IS NOT NULL AND pin_locked_until > NOW() THEN true
      ELSE false
    END as is_locked,
    CASE 
      WHEN pin_locked_until IS NOT NULL AND pin_locked_until > NOW() THEN 0
      ELSE (3 - COALESCE(pin_attempts, 0))
    END as attempts_remaining,
    pin_locked_until as lockout_expires_at
  FROM public.tapsigner_registrations
  WHERE card_id = p_card_id_hash 
  AND owner_hash = p_owner_hash;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 5. CREATE HELPER FUNCTION FOR PIN ATTEMPT TRACKING
-- ============================================================================
-- Record PIN validation attempt and update lockout status

CREATE OR REPLACE FUNCTION record_pin_attempt(
  p_card_id_hash TEXT,
  p_owner_hash TEXT,
  p_success BOOLEAN
) RETURNS TABLE (
  attempts_remaining INTEGER,
  is_now_locked BOOLEAN,
  lockout_expires_at TIMESTAMPTZ
) AS $$
BEGIN
  IF p_success THEN
    -- Reset PIN attempts on successful validation
    UPDATE public.tapsigner_registrations
    SET 
      pin_attempts = 0,
      pin_locked_until = NULL,
      last_pin_attempt = NOW()
    WHERE card_id = p_card_id_hash 
    AND owner_hash = p_owner_hash;
    
    RETURN QUERY
    SELECT 
      3 as attempts_remaining,
      false as is_now_locked,
      NULL::TIMESTAMPTZ as lockout_expires_at;
  ELSE
    -- Increment failed attempts
    UPDATE public.tapsigner_registrations
    SET 
      pin_attempts = COALESCE(pin_attempts, 0) + 1,
      last_pin_attempt = NOW(),
      pin_locked_until = CASE 
        WHEN COALESCE(pin_attempts, 0) + 1 >= 3 THEN NOW() + INTERVAL '15 minutes'
        ELSE pin_locked_until
      END
    WHERE card_id = p_card_id_hash 
    AND owner_hash = p_owner_hash;
    
    RETURN QUERY
    SELECT 
      GREATEST(0, 3 - (COALESCE(pin_attempts, 0) + 1)) as attempts_remaining,
      COALESCE(pin_attempts, 0) + 1 >= 3 as is_now_locked,
      CASE 
        WHEN COALESCE(pin_attempts, 0) + 1 >= 3 THEN NOW() + INTERVAL '15 minutes'
        ELSE NULL
      END as lockout_expires_at;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 6. GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION check_pin_lockout(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION record_pin_attempt(TEXT, TEXT, BOOLEAN) TO authenticated;

-- ============================================================================
-- 7. ADD COMMENTS
-- ============================================================================

COMMENT ON TABLE public.tapsigner_operations_log IS
  'Audit trail for all Tapsigner operations including PIN validation attempts. PIN values are NEVER stored.';

COMMENT ON FUNCTION check_pin_lockout(TEXT, TEXT) IS
  'Check if a Tapsigner card is locked due to failed PIN attempts. Returns lockout status and remaining attempts.';

COMMENT ON FUNCTION record_pin_attempt(TEXT, TEXT, BOOLEAN) IS
  'Record a PIN validation attempt (success or failure) and update lockout status. Returns remaining attempts and new lockout status.';

