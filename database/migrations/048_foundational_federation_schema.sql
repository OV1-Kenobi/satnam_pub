-- =====================================================
-- MIGRATION 048: FOUNDATIONAL FEDERATION & FROST SCHEMA
-- =====================================================
-- Purpose: Establish core federation tables, FROST infrastructure, and steward pubkey lookup
-- Scope: Creates family_federations, family_members, FROST tables, and RPC functions
-- Idempotent: Yes - safe to run multiple times
-- Dependencies: user_identities table must exist
-- Enables: Migrations 049 and 050 (steward pubkey lookup, FROST NFC MFA)
-- =====================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- TABLE 1: FAMILY_FEDERATIONS
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'family_federations'
  ) THEN
    CREATE TABLE family_federations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      federation_name TEXT NOT NULL,
      domain VARCHAR(255),
      relay_url VARCHAR(255),
      federation_duid TEXT NOT NULL UNIQUE,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      CONSTRAINT family_federations_name_unique UNIQUE(federation_name)
    );
    RAISE NOTICE '✓ Created family_federations table';
  ELSE
    RAISE NOTICE '✓ family_federations table already exists';
  END IF;
END $$;

-- =====================================================
-- TABLE 2: FAMILY_MEMBERS
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'family_members'
  ) THEN
    CREATE TABLE family_members (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      family_federation_id UUID NOT NULL,
      user_duid TEXT NOT NULL,
      family_role TEXT NOT NULL CHECK (family_role IN ('offspring', 'adult', 'steward', 'guardian')),
      spending_approval_required BOOLEAN NOT NULL DEFAULT false,
      voting_power INTEGER NOT NULL DEFAULT 1,
      joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      CONSTRAINT family_members_user_federation_unique UNIQUE(family_federation_id, user_duid)
    );
    RAISE NOTICE '✓ Created family_members table';
  ELSE
    RAISE NOTICE '✓ family_members table already exists';
  END IF;
END $$;

-- Add foreign key constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'family_members_federation_fkey'
    AND table_name = 'family_members'
  ) THEN
    ALTER TABLE family_members
    ADD CONSTRAINT family_members_federation_fkey
    FOREIGN KEY (family_federation_id) REFERENCES family_federations(id) ON DELETE CASCADE;
    RAISE NOTICE '✓ Added foreign key constraint to family_members';
  ELSE
    RAISE NOTICE '✓ Foreign key constraint already exists';
  END IF;
END $$;

-- COLUMN: nostr_pubkey_hex on user_identities
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'user_identities'
    AND column_name = 'nostr_pubkey_hex'
  ) THEN
    ALTER TABLE user_identities ADD COLUMN nostr_pubkey_hex TEXT;
    RAISE NOTICE '✓ Added nostr_pubkey_hex column to user_identities';
  ELSE
    RAISE NOTICE '✓ nostr_pubkey_hex column already exists';
  END IF;
END $$;

--