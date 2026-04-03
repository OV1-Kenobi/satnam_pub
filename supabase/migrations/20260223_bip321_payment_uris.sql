-- BIP-321 Unified Payment URI Support for Credit Envelopes
-- Adds payment_uri and payment_qr_code columns to credit_envelopes table
-- Enables multi-protocol payment support (Lightning, Cashu, Fedimint, Ark, Onchain)

-- Migration: 20260223_bip321_payment_uris.sql
-- Author: Satnam Platform
-- Date: 2026-02-23
-- Description: Add BIP-321 unified payment URI support to credit envelopes

BEGIN;

-- Idempotent ALTER TABLE: Add BIP-321 payment URI columns to credit_envelopes
DO $$ 
BEGIN
  -- Add payment_uri column (stores BIP-321 formatted URI)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'credit_envelopes' 
    AND column_name = 'payment_uri'
  ) THEN
    ALTER TABLE public.credit_envelopes 
    ADD COLUMN payment_uri TEXT;
    
    COMMENT ON COLUMN public.credit_envelopes.payment_uri IS 
      'BIP-321 unified payment URI containing Lightning, Cashu, Fedimint, and/or Ark payment options';
  END IF;

  -- Add payment_qr_code column (stores QR code data URL)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'credit_envelopes' 
    AND column_name = 'payment_qr_code'
  ) THEN
    ALTER TABLE public.credit_envelopes 
    ADD COLUMN payment_qr_code TEXT;
    
    COMMENT ON COLUMN public.credit_envelopes.payment_qr_code IS 
      'QR code data URL (base64 encoded PNG/SVG) for BIP-321 payment URI';
  END IF;

  -- Add payment_methods_available column (JSONB array of available methods)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'credit_envelopes' 
    AND column_name = 'payment_methods_available'
  ) THEN
    ALTER TABLE public.credit_envelopes 
    ADD COLUMN payment_methods_available JSONB DEFAULT '[]'::jsonb;
    
    COMMENT ON COLUMN public.credit_envelopes.payment_methods_available IS 
      'Array of available payment methods in BIP-321 URI: ["lightning", "cashu", "fedimint", "ark"]';
  END IF;

  -- Add payment_method_used column (tracks which method was actually used)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'credit_envelopes' 
    AND column_name = 'payment_method_used'
  ) THEN
    ALTER TABLE public.credit_envelopes 
    ADD COLUMN payment_method_used TEXT 
    CHECK (payment_method_used IN ('lightning', 'cashu', 'fedimint', 'ark', 'onchain'));
    
    COMMENT ON COLUMN public.credit_envelopes.payment_method_used IS 
      'Payment method actually used by payer (from BIP-321 proof-of-payment callback)';
  END IF;

  -- Add pop_callback_received_at column (timestamp of proof-of-payment callback)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'credit_envelopes' 
    AND column_name = 'pop_callback_received_at'
  ) THEN
    ALTER TABLE public.credit_envelopes 
    ADD COLUMN pop_callback_received_at TIMESTAMPTZ;
    
    COMMENT ON COLUMN public.credit_envelopes.pop_callback_received_at IS 
      'Timestamp when BIP-321 proof-of-payment callback was received';
  END IF;

EXCEPTION 
  WHEN duplicate_column THEN 
    RAISE NOTICE 'Column already exists, skipping';
END $$;

-- Create index on payment_uri for lookup performance
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
    AND tablename = 'credit_envelopes' 
    AND indexname = 'idx_credit_envelopes_payment_uri'
  ) THEN
    CREATE INDEX idx_credit_envelopes_payment_uri 
    ON public.credit_envelopes(payment_uri) 
    WHERE payment_uri IS NOT NULL;
  END IF;
END $$;

-- Create index on payment_method_used for analytics
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
    AND tablename = 'credit_envelopes' 
    AND indexname = 'idx_credit_envelopes_payment_method'
  ) THEN
    CREATE INDEX idx_credit_envelopes_payment_method 
    ON public.credit_envelopes(payment_method_used) 
    WHERE payment_method_used IS NOT NULL;
  END IF;
END $$;

-- Create GIN index on payment_methods_available for JSONB queries
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
    AND tablename = 'credit_envelopes' 
    AND indexname = 'idx_credit_envelopes_payment_methods_gin'
  ) THEN
    CREATE INDEX idx_credit_envelopes_payment_methods_gin 
    ON public.credit_envelopes USING GIN(payment_methods_available);
  END IF;
END $$;

COMMIT;

-- Verification query (optional - comment out in production)
-- SELECT column_name, data_type, column_default, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public' 
-- AND table_name = 'credit_envelopes'
-- AND column_name IN ('payment_uri', 'payment_qr_code', 'payment_methods_available', 'payment_method_used', 'pop_callback_received_at')
-- ORDER BY ordinal_position;

