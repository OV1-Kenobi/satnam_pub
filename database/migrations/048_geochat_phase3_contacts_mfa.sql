-- database/migrations/048_geochat_phase3_contacts_mfa.sql
-- Phase 3: Geo-Room Contacts & Physical MFA Attestations
-- Idempotent by design; safe to run multiple times.
--
-- PRIVACY: origin_geohash_truncated: MAX 4 CHARS (~20km resolution)
--          npub values stored as SHA-256 hashes, not raw values

-- STEP 1: Add origin_geohash_truncated column to encrypted_contacts
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'encrypted_contacts'
        AND column_name = 'origin_geohash_truncated'
    ) THEN
        ALTER TABLE public.encrypted_contacts
        ADD COLUMN origin_geohash_truncated TEXT
        CHECK (origin_geohash_truncated IS NULL OR length(origin_geohash_truncated) <= 4);
        RAISE NOTICE 'Added origin_geohash_truncated column to encrypted_contacts';
    ELSE
        RAISE NOTICE 'origin_geohash_truncated column already exists';
    END IF;
END $$;

-- STEP 2: Create physical_mfa_attestations table
CREATE TABLE IF NOT EXISTS public.physical_mfa_attestations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    attestation_id TEXT NOT NULL,
    subject_npub_hash TEXT NOT NULL,
    counterparty_npub_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    origin_geohash_truncated TEXT CHECK (
        origin_geohash_truncated IS NULL OR length(origin_geohash_truncated) <= 4
    ),
    scope TEXT NOT NULL DEFAULT 'local_only' CHECK (
        scope IN ('local_only', 'shared_dm', 'nostr_attestation')
    ),
    encrypted_signatures BYTEA,
    encrypted_challenge BYTEA,
    revoked_at TIMESTAMPTZ,
    revocation_reason TEXT,
    UNIQUE(user_id, attestation_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_physical_mfa_attestations_user_id
    ON public.physical_mfa_attestations(user_id);
CREATE INDEX IF NOT EXISTS idx_physical_mfa_attestations_counterparty
    ON public.physical_mfa_attestations(counterparty_npub_hash);
CREATE INDEX IF NOT EXISTS idx_physical_mfa_attestations_not_revoked
    ON public.physical_mfa_attestations(user_id) WHERE revoked_at IS NULL;

-- STEP 3: Enable RLS
ALTER TABLE public.physical_mfa_attestations ENABLE ROW LEVEL SECURITY;

-- SELECT policy
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'physical_mfa_attestations'
        AND policyname = 'Users can view own attestations') THEN
        CREATE POLICY "Users can view own attestations"
            ON public.physical_mfa_attestations FOR SELECT USING (auth.uid() = user_id);
    END IF;
END $$;

-- INSERT policy
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'physical_mfa_attestations'
        AND policyname = 'Users can insert own attestations') THEN
        CREATE POLICY "Users can insert own attestations"
            ON public.physical_mfa_attestations FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;

-- UPDATE policy
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'physical_mfa_attestations'
        AND policyname = 'Users can update own attestations') THEN
        CREATE POLICY "Users can update own attestations"
            ON public.physical_mfa_attestations FOR UPDATE
            USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;

-- DELETE policy
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'physical_mfa_attestations'
        AND policyname = 'Users can delete own attestations') THEN
        CREATE POLICY "Users can delete own attestations"
            ON public.physical_mfa_attestations FOR DELETE USING (auth.uid() = user_id);
    END IF;
END $$;

-- STEP 4: Index on encrypted_contacts
CREATE INDEX IF NOT EXISTS idx_encrypted_contacts_origin_geohash
    ON public.encrypted_contacts(origin_geohash_truncated)
    WHERE origin_geohash_truncated IS NOT NULL;

-- Verification
DO $$
BEGIN
    RAISE NOTICE 'Phase 3 Migration Complete:';
    RAISE NOTICE '  - encrypted_contacts: origin_geohash_truncated column';
    RAISE NOTICE '  - physical_mfa_attestations: table with RLS policies';
END $$;

