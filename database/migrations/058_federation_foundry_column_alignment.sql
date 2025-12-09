-- Migration 058: Federation Foundry Column Alignment
-- Date: 2025-12-09
-- Purpose:
--   - Add missing columns to family_federations and family_members tables
--     so they match the expectations of the Family Foundry and Invitation
--     APIs (api/family/foundry.js, api/family/invitations/*.js)
--   - Maintain privacy-first architecture by using TEXT identifiers for
--     user- and charter-related references
--   - Idempotent and safe to run multiple times

-- ============================================================================
-- PART 1: FAMILY_FEDERATIONS COLUMN ADDITIONS
-- ============================================================================

-- Add charter_id (TEXT) reference to family_charters.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'family_federations'
      AND column_name = 'charter_id'
  ) THEN
    ALTER TABLE family_federations
      ADD COLUMN charter_id TEXT;

    COMMENT ON COLUMN family_federations.charter_id IS
      'Privacy-first reference to family_charters.id (TEXT identifier) for the charter that defines this federation.';

    -- Optional: add FK if family_charters table exists
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'family_charters'
    ) THEN
      BEGIN
        ALTER TABLE family_federations
          ADD CONSTRAINT family_federations_charter_fk
          FOREIGN KEY (charter_id) REFERENCES family_charters(id) ON DELETE SET NULL;
      EXCEPTION
        WHEN duplicate_object THEN
          -- Constraint already exists; no-op for idempotency
          NULL;
      END;
    END IF;
  END IF;
END $$;

-- Add status (TEXT) to track federation lifecycle state
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'family_federations'
      AND column_name = 'status'
  ) THEN
    ALTER TABLE family_federations
      ADD COLUMN status TEXT DEFAULT 'active';

    COMMENT ON COLUMN family_federations.status IS
      'Lifecycle status for the federation (e.g., active, suspended, archived). Used by Family Foundry APIs.';
  END IF;
END $$;

-- Add progress (INTEGER) to track creation progress (0-100)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'family_federations'
      AND column_name = 'progress'
  ) THEN
    ALTER TABLE family_federations
      ADD COLUMN progress INTEGER DEFAULT 0
      CHECK (progress >= 0 AND progress <= 100);

    COMMENT ON COLUMN family_federations.progress IS
      'Federation creation progress percentage (0-100) for wizard UX and audit purposes.';
  END IF;
END $$;

-- Add created_by (TEXT) to store creator''s user_duid
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'family_federations'
      AND column_name = 'created_by'
  ) THEN
    ALTER TABLE family_federations
      ADD COLUMN created_by TEXT;

    COMMENT ON COLUMN family_federations.created_by IS
      'user_duid (TEXT) of the federation creator/founder from user_identities table. Privacy-first, no auth.users UUIDs.';
  END IF;
END $$;

-- ============================================================================
-- PART 2: FAMILY_MEMBERS COLUMN ADDITIONS
-- ============================================================================

-- Add federation_duid (TEXT) denormalized reference for invitations & analytics
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'family_members'
      AND column_name = 'federation_duid'
  ) THEN
    ALTER TABLE family_members
      ADD COLUMN federation_duid TEXT;

    COMMENT ON COLUMN family_members.federation_duid IS
      'Denormalized federation_duid (TEXT) from family_federations for invitation flows and privacy-first analytics.';
  END IF;
END $$;

-- Add role (TEXT) for invitation-role tracking distinct from family_role
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'family_members'
      AND column_name = 'role'
  ) THEN
    ALTER TABLE family_members
      ADD COLUMN role TEXT;

    COMMENT ON COLUMN family_members.role IS
      'Original role label from invitation/join flow (may differ from normalized family_role used for RBAC).';
  END IF;
END $$;

-- Add joined_via (TEXT) to track join mechanism (invitation, founder, etc.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'family_members'
      AND column_name = 'joined_via'
  ) THEN
    ALTER TABLE family_members
      ADD COLUMN joined_via TEXT;

    COMMENT ON COLUMN family_members.joined_via IS
      'Join mechanism for this member (e.g., invitation, founder, manual_add). Used for audit and UX flows.';
  END IF;
END $$;

-- Add invitation_id (UUID) to reference family_federation_invitations.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'family_members'
      AND column_name = 'invitation_id'
  ) THEN
    ALTER TABLE family_members
      ADD COLUMN invitation_id UUID;

    COMMENT ON COLUMN family_members.invitation_id IS
      'Optional reference to family_federation_invitations.id for members who joined via invite acceptance.';

    -- Optional: add FK if invitations table exists
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'family_federation_invitations'
    ) THEN
      BEGIN
        ALTER TABLE family_members
          ADD CONSTRAINT family_members_invitation_fk
          FOREIGN KEY (invitation_id) REFERENCES family_federation_invitations(id) ON DELETE SET NULL;
      EXCEPTION
        WHEN duplicate_object THEN
          -- Constraint already exists; no-op for idempotency
          NULL;
      END;
    END IF;
  END IF;
END $$;

