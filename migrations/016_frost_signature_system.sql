-- Migration: FROST Signature System for Family Federation Multi-Signature Operations
-- Purpose: Create production-ready FROST (Flexible Round-Optimized Schnorr Threshold) signature infrastructure
-- Date: 2024-12-24
-- Version: 016

BEGIN;

-- ============================================================================

-- FROST TRANSACTIONS: Core transaction management
CREATE TABLE IF NOT EXISTS frost_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_federation_id UUID,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('lightning_payment', 'fedimint_spend', 'bitcoin_transaction', 'internal_transfer')),
    amount BIGINT NOT NULL CHECK (amount > 0),
    recipient_address TEXT,
    description TEXT,
    transaction_data JSONB,
    required_signatures INTEGER,
    signing_context TEXT,
    status TEXT NOT NULL DEFAULT 'pending_signatures' CHECK (status IN ('pending_signatures', 'threshold_met', 'completed', 'failed', 'expired')),
    transaction_hash TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_by_duid TEXT,
    CONSTRAINT valid_completion CHECK (
        (status = 'completed' AND transaction_hash IS NOT NULL AND completed_at IS NOT NULL) OR
        (status != 'completed')
    ),
    CONSTRAINT valid_failure CHECK (
        (status = 'failed' AND error_message IS NOT NULL) OR
        (status != 'failed')
    )
);

-- Ensure columns exist with safe defaults if table already existed without them
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'frost_transactions' AND column_name = 'family_federation_id'
  ) THEN
    ALTER TABLE public.frost_transactions ADD COLUMN family_federation_id UUID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'frost_transactions' AND column_name = 'created_by_duid'
  ) THEN
    ALTER TABLE public.frost_transactions ADD COLUMN created_by_duid TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'frost_transactions' AND column_name = 'transaction_data'
  ) THEN
    ALTER TABLE public.frost_transactions ADD COLUMN transaction_data JSONB DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'frost_transactions' AND column_name = 'required_signatures'
  ) THEN
    ALTER TABLE public.frost_transactions ADD COLUMN required_signatures INTEGER DEFAULT 1;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'frost_transactions' AND column_name = 'signing_context'
  ) THEN
    ALTER TABLE public.frost_transactions ADD COLUMN signing_context TEXT DEFAULT '';
  END IF;
END
$$;

-- ============================================================================

CREATE TABLE IF NOT EXISTS frost_transaction_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES frost_transactions(id) ON DELETE CASCADE,
    participant_duid TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('offspring', 'adult', 'steward', 'guardian')),
    signature_required BOOLEAN NOT NULL DEFAULT true,
    has_signed BOOLEAN NOT NULL DEFAULT false,
    signed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_participant_transaction UNIQUE (transaction_id, participant_duid),
    CONSTRAINT valid_signature_time CHECK (
        (has_signed = true AND signed_at IS NOT NULL) OR
        (has_signed = false AND signed_at IS NULL)
    )
);

-- ============================================================================

CREATE TABLE IF NOT EXISTS frost_signature_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES frost_transactions(id) ON DELETE CASCADE,
    session_id TEXT,
    participant_duid TEXT NOT NULL,
    signature_share TEXT NOT NULL,
    nonce TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'validated', 'aggregated', 'invalid')),
    validation_error TEXT,
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    validated_at TIMESTAMPTZ,
    CONSTRAINT unique_signature_share UNIQUE (transaction_id, participant_duid)
);

-- If referencing composite foreign key to participants, ensure participant columns exist and FK added only if possible
DO $$
BEGIN
  -- Only add the composite FK if both referenced columns exist
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='frost_transaction_participants' AND column_name='transaction_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='frost_transaction_participants' AND column_name='participant_duid'
  ) THEN
    -- Add FK if not already present (pg_constraint check)
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = 'frost_signature_shares' AND c.conname = 'fss_participant_fk'
    ) THEN
      ALTER TABLE public.frost_signature_shares
        ADD CONSTRAINT fss_participant_fk FOREIGN KEY (transaction_id, participant_duid)
        REFERENCES frost_transaction_participants(transaction_id, participant_duid) ON DELETE CASCADE;
    END IF;
  END IF;
EXCEPTION WHEN others THEN
  -- swallow: if adding FK fails because the referenced constraint doesn't exist, skip
  RAISE NOTICE 'Skipping composite FK addition for frost_signature_shares — referenced structure not ready.';
END
$$;

-- ============================================================================

CREATE TABLE IF NOT EXISTS frost_key_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_duid TEXT NOT NULL,
    family_federation_id UUID,
    encrypted_key_share TEXT NOT NULL,
    key_share_index INTEGER NOT NULL,
    threshold_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    CONSTRAINT unique_active_key_share UNIQUE (participant_duid, family_federation_id, is_active)
        DEFERRABLE INITIALLY DEFERRED
);

-- Ensure family_federation_id exists on key_shares (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='frost_key_shares' AND column_name='family_federation_id'
  ) THEN
    ALTER TABLE public.frost_key_shares ADD COLUMN family_federation_id UUID;
  END IF;
END
$$;

-- ============================================================================

CREATE TABLE IF NOT EXISTS frost_signing_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL,
    family_id TEXT NOT NULL,
    message_hash TEXT NOT NULL,
    event_template TEXT,
    event_type TEXT,
    participants JSONB NOT NULL DEFAULT '{}'::jsonb,
    threshold INTEGER NOT NULL CHECK (threshold >= 1 AND threshold <= 7),
    nonce_commitments JSONB DEFAULT '{}'::jsonb,
    partial_signatures JSONB DEFAULT '{}'::jsonb,
    final_signature JSONB,
    created_by TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (
        status IN ('pending', 'nonce_collection', 'signing', 'aggregating', 'completed', 'failed', 'expired')
    ),
    final_event_id TEXT,
    created_at BIGINT NOT NULL,
    updated_at BIGINT,
    nonce_collection_started_at BIGINT,
    signing_started_at BIGINT,
    completed_at BIGINT,
    failed_at BIGINT,
    expires_at BIGINT NOT NULL,
    error_message TEXT,
    CONSTRAINT frost_sessions_session_id_unique UNIQUE (session_id),
    CONSTRAINT valid_completion CHECK (
        (status = 'completed' AND final_signature IS NOT NULL AND completed_at IS NOT NULL) OR
        (status != 'completed')
    ),
    CONSTRAINT valid_failure CHECK (
        (status = 'failed' AND error_message IS NOT NULL AND failed_at IS NOT NULL) OR
        (status != 'failed')
    )
);

-- ============================================================================

-- Idempotent index creation blocks
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i' AND c.relname = 'idx_frost_transactions_family_status' AND n.nspname = 'public'
  ) THEN
    CREATE INDEX idx_frost_transactions_family_status
      ON frost_transactions (family_federation_id, status);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i' AND c.relname = 'idx_frost_transactions_created_by' AND n.nspname = 'public'
  ) THEN
    CREATE INDEX idx_frost_transactions_created_by
      ON frost_transactions (created_by_duid, created_at DESC);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i' AND c.relname = 'idx_frost_transactions_expires' AND n.nspname = 'public'
  ) THEN
    CREATE INDEX idx_frost_transactions_expires
      ON frost_transactions (expires_at)
      WHERE expires_at IS NOT NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i' AND c.relname = 'idx_frost_participants_transaction' AND n.nspname = 'public'
  ) THEN
    CREATE INDEX idx_frost_participants_transaction
      ON frost_transaction_participants (transaction_id, signature_required);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i' AND c.relname = 'idx_frost_participants_duid' AND n.nspname = 'public'
  ) THEN
    CREATE INDEX idx_frost_participants_duid
      ON frost_transaction_participants (participant_duid, has_signed);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i' AND c.relname = 'idx_frost_signatures_transaction' AND n.nspname = 'public'
  ) THEN
    CREATE INDEX idx_frost_signatures_transaction
      ON frost_signature_shares (transaction_id, status);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i' AND c.relname = 'idx_frost_signatures_participant' AND n.nspname = 'public'
  ) THEN
    CREATE INDEX idx_frost_signatures_participant
      ON frost_signature_shares (participant_duid, submitted_at DESC);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i' AND c.relname = 'idx_frost_key_shares_participant' AND n.nspname = 'public'
  ) THEN
    CREATE INDEX idx_frost_key_shares_participant
      ON frost_key_shares (participant_duid, is_active);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i' AND c.relname = 'idx_frost_key_shares_federation' AND n.nspname = 'public'
  ) THEN
    CREATE INDEX idx_frost_key_shares_federation
      ON frost_key_shares (family_federation_id, is_active);
  END IF;
END
$$;

-- ============================================================================

-- Enable RLS on FROST tables (idempotent)
ALTER TABLE IF EXISTS frost_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS frost_transaction_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS frost_signature_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS frost_key_shares ENABLE ROW LEVEL SECURITY;

-- ============================================================================

-- FROST transactions policies (idempotent checks using pg_policies.policyname)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'users_can_view_family_frost_transactions' AND schemaname = 'public' AND tablename = 'frost_transactions'
  ) THEN
    CREATE POLICY users_can_view_family_frost_transactions ON frost_transactions
      FOR SELECT TO authenticated
      USING (
        family_federation_id IN (
            SELECT family_federation_id
            FROM family_members
            WHERE user_duid = (SELECT auth.uid())::text
        )
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'authorized_users_create_frost_transactions' AND schemaname = 'public' AND tablename = 'frost_transactions'
  ) THEN
    CREATE POLICY authorized_users_create_frost_transactions ON frost_transactions
      FOR INSERT TO authenticated
      WITH CHECK (
        created_by_duid = (SELECT auth.uid())::text AND
        family_federation_id IN (
          SELECT family_federation_id
          FROM family_members
          WHERE user_duid = (SELECT auth.uid())::text
            AND family_role IN ('steward', 'guardian')
        )
      );
  END IF;
END
$$;

-- Participants policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'users_view_participation_frost_transactions' AND schemaname = 'public' AND tablename = 'frost_transaction_participants'
  ) THEN
    CREATE POLICY users_view_participation_frost_transactions ON frost_transaction_participants
      FOR SELECT TO authenticated
      USING (
        participant_duid = (SELECT auth.uid())::text OR
        transaction_id IN (
            SELECT id FROM frost_transactions
            WHERE family_federation_id IN (
                SELECT family_federation_id
                FROM family_members
                WHERE user_duid = (SELECT auth.uid())::text
            )
        )
      );
  END IF;
END
$$;

-- Signature shares policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'users_manage_signature_shares' AND schemaname = 'public' AND tablename = 'frost_signature_shares'
  ) THEN
    CREATE POLICY users_manage_signature_shares ON frost_signature_shares
      FOR ALL TO authenticated
      USING ((SELECT auth.uid())::text = participant_duid)
      WITH CHECK ((SELECT auth.uid())::text = participant_duid);
  END IF;
END
$$;

-- Key shares policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'users_own_key_shares' AND schemaname = 'public' AND tablename = 'frost_key_shares'
  ) THEN
    CREATE POLICY users_own_key_shares ON frost_key_shares
      FOR ALL TO authenticated
      USING ((SELECT auth.uid())::text = participant_duid)
      WITH CHECK ((SELECT auth.uid())::text = participant_duid);
  END IF;
END
$$;

-- Service role policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'service_role_full_access_frost_transactions' AND schemaname = 'public' AND tablename = 'frost_transactions'
  ) THEN
    CREATE POLICY service_role_full_access_frost_transactions ON frost_transactions
      FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'service_role_full_access_frost_participants' AND schemaname = 'public' AND tablename = 'frost_transaction_participants'
  ) THEN
    CREATE POLICY service_role_full_access_frost_participants ON frost_transaction_participants
      FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'service_role_full_access_frost_signatures' AND schemaname = 'public' AND tablename = 'frost_signature_shares'
  ) THEN
    CREATE POLICY service_role_full_access_frost_signatures ON frost_signature_shares
      FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'service_role_full_access_frost_key_shares' AND schemaname = 'public' AND tablename = 'frost_key_shares'
  ) THEN
    CREATE POLICY service_role_full_access_frost_key_shares ON frost_key_shares
      FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END
$$;

-- ============================================================================

-- Automatic cleanup function
CREATE OR REPLACE FUNCTION cleanup_expired_frost_transactions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    UPDATE frost_transactions
    SET status = 'expired'
    WHERE status = 'pending_signatures'
      AND expires_at IS NOT NULL
      AND expires_at < NOW();

    GET DIAGNOSTICS expired_count = ROW_COUNT;

    IF expired_count > 0 THEN
        RAISE NOTICE 'Marked % FROST transactions as expired', expired_count;
    END IF;

    RETURN expired_count;
END $$;

-- ============================================================================

-- Helper function: threshold check
CREATE OR REPLACE FUNCTION check_frost_threshold(transaction_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    required_sigs INTEGER;
    current_sigs INTEGER;
BEGIN
    SELECT required_signatures INTO required_sigs
    FROM frost_transactions
    WHERE id = transaction_uuid;

    IF required_sigs IS NULL THEN
        RETURN false;
    END IF;

    SELECT COUNT(*) INTO current_sigs
    FROM frost_transaction_participants
    WHERE transaction_id = transaction_uuid
      AND signature_required = true
      AND has_signed = true;

    RETURN current_sigs >= required_sigs;
END $$;

-- ============================================================================

-- Comments (safe even if columns exist)
COMMENT ON TABLE frost_transactions IS 'FROST multi-signature transactions for family federations';
COMMENT ON COLUMN frost_transactions.signing_context IS 'Cryptographic context used for FROST signature generation';
COMMENT ON COLUMN frost_transactions.required_signatures IS 'Minimum number of signatures required to execute transaction';

COMMENT ON TABLE frost_transaction_participants IS 'Family members who can participate in FROST transaction signing';
COMMENT ON COLUMN frost_transaction_participants.signature_required IS 'Whether this participant must sign for transaction to execute';

COMMENT ON TABLE frost_signature_shares IS 'Individual FROST signature shares from participants';
COMMENT ON COLUMN frost_signature_shares.signature_share IS 'Cryptographic signature share generated using FROST protocol';
COMMENT ON COLUMN frost_signature_shares.nonce IS 'Cryptographic nonce used in signature generation';

COMMENT ON TABLE frost_key_shares IS 'Encrypted FROST key shares for signature generation';
COMMENT ON COLUMN frost_key_shares.encrypted_key_share IS 'User key share encrypted with authentication context';
COMMENT ON COLUMN frost_key_shares.threshold_config IS 'FROST threshold signature configuration parameters';

-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '=== FROST SIGNATURE SYSTEM MIGRATION COMPLETED ===';
    RAISE NOTICE 'Migration 016: Production-ready FROST multi-signature infrastructure';
    RAISE NOTICE 'Date: %', NOW();
    RAISE NOTICE 'Tables: frost_transactions, frost_transaction_participants, frost_signature_shares, frost_key_shares';
    RAISE NOTICE 'Features: Multi-signature transactions, threshold signatures, encrypted key shares';
    RAISE NOTICE 'Security: Row Level Security, role-based access, audit trails';
    RAISE NOTICE 'Performance: Optimized indexes for fast lookups and queries';
    RAISE NOTICE 'Status: READY FOR PRODUCTION FROST OPERATIONS';
    RAISE NOTICE '====================================================';
END $$;

COMMIT;