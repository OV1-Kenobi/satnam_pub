-- Migration: 056_family_federation_invitations.sql
-- Description: Family Federation Invitation System
-- Date: 2025-12-06
-- 
-- Creates the family_federation_invitations table for tracking
-- invitation tokens, status, and redemption for family federations.
-- Supports the invitation-first architecture where founders can
-- create federations and invite members afterward.

-- ============================================================
-- FAMILY FEDERATION INVITATIONS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS family_federation_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Federation reference (links to family_federations table)
  federation_id UUID NOT NULL,
  federation_duid TEXT NOT NULL,
  
  -- Invitation token (unique, used in URLs)
  invitation_token TEXT UNIQUE NOT NULL,
  
  -- Inviter information
  inviter_user_duid TEXT NOT NULL,
  
  -- Invitation details
  invited_role TEXT NOT NULL CHECK (invited_role IN ('guardian', 'steward', 'adult', 'offspring')),
  personal_message TEXT,
  
  -- Optional: pre-targeted invitee (for NIP-17 DMs)
  -- PRIVACY-FIRST: Store encrypted npub, never cleartext (zero-knowledge compliance)
  encrypted_invitee_npub TEXT,
  invitee_nip05 TEXT,
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'viewed', 'accepted', 'expired', 'revoked')),
  view_count INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  viewed_at TIMESTAMP WITH TIME ZONE,
  accepted_at TIMESTAMP WITH TIME ZONE,
  accepted_by_user_duid TEXT,
  
  -- Metadata for display (federation name, charter details, role guide URL, etc.)
  metadata JSONB DEFAULT '{}'::jsonb
);

-- ============================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================

-- Fast token lookups (primary access pattern)
CREATE INDEX IF NOT EXISTS idx_ffi_invitation_token 
  ON family_federation_invitations(invitation_token);

-- Federation-based queries (list invitations for a federation)
CREATE INDEX IF NOT EXISTS idx_ffi_federation_duid 
  ON family_federation_invitations(federation_duid);

-- Status-based queries (find pending/active invitations)
CREATE INDEX IF NOT EXISTS idx_ffi_status 
  ON family_federation_invitations(status);

-- Expiration checks (cleanup expired invitations)
CREATE INDEX IF NOT EXISTS idx_ffi_expires_at 
  ON family_federation_invitations(expires_at) 
  WHERE status = 'pending';

-- Inviter queries (list invitations sent by a user)
CREATE INDEX IF NOT EXISTS idx_ffi_inviter_user_duid 
  ON family_federation_invitations(inviter_user_duid);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE family_federation_invitations ENABLE ROW LEVEL SECURITY;

-- Policy: Founders/inviters can manage their invitations (CRUD)
CREATE POLICY "Inviters can manage their invitations"
  ON family_federation_invitations FOR ALL
  USING (inviter_user_duid = auth.uid()::text);

-- Policy: Anyone can view pending, non-expired invitations (for acceptance flow)
-- This allows unauthenticated users to see invitation details before accepting
CREATE POLICY "Anyone can view valid pending invitations"
  ON family_federation_invitations FOR SELECT
  USING (status = 'pending' AND expires_at > NOW());

-- Policy: Authenticated users can accept invitations addressed to them
-- PRIVACY-FIRST: Targeted invitation matching done at application layer
-- (encrypted npub comparison requires app-level decryption, not DB-level)
-- Database RLS allows update if: open invitation OR authenticated user
-- Application layer validates encrypted_invitee_npub match
CREATE POLICY "Users can accept invitations addressed to them"
  ON family_federation_invitations FOR UPDATE
  USING (
    status = 'pending'
    AND expires_at > NOW()
    AND (
      encrypted_invitee_npub IS NULL -- Open invitation (anyone can accept)
      OR auth.uid() IS NOT NULL -- Targeted invitation - app validates encrypted npub match
    )
  );

-- ============================================================
-- FUNCTIONS FOR INVITATION MANAGEMENT
-- ============================================================

-- Function to generate a secure invitation token
CREATE OR REPLACE FUNCTION generate_invitation_token()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Generate a URL-safe base64 token: inv_ prefix + 22 random chars
  -- Uses translate() to replace + with -, / with _, and remove = padding
  RETURN 'inv_' || translate(
    encode(gen_random_bytes(16), 'base64'),
    '+/=',
    '-_'
  );
END;
$$;

-- Function to expire old invitations (called by scheduled job or on-demand)
CREATE OR REPLACE FUNCTION expire_old_invitations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE family_federation_invitations
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at < NOW();
  
  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION generate_invitation_token() TO authenticated;
GRANT EXECUTE ON FUNCTION expire_old_invitations() TO authenticated;

-- ============================================================
-- VIEW COUNT TRIGGER
-- ============================================================
-- Automatically increments view_count and sets viewed_at when status changes to 'viewed'

CREATE OR REPLACE FUNCTION increment_invitation_view_count()
RETURNS TRIGGER AS $$
BEGIN
  -- Increment view_count and set viewed_at when status transitions to 'viewed'
  IF NEW.status = 'viewed' AND OLD.status != 'viewed' THEN
    NEW.view_count = COALESCE(NEW.view_count, 0) + 1;
    NEW.viewed_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (drop first if exists for idempotency)
DROP TRIGGER IF EXISTS invitation_view_count_trigger ON family_federation_invitations;
CREATE TRIGGER invitation_view_count_trigger
  BEFORE UPDATE ON family_federation_invitations
  FOR EACH ROW
  EXECUTE FUNCTION increment_invitation_view_count();

-- ============================================================
-- RACE CONDITION PROTECTION: UNIQUE CONSTRAINT ON FAMILY_MEMBERS
-- ============================================================
-- Add unique constraint on (federation_duid, user_duid) if not exists
-- This prevents duplicate members from being inserted during concurrent requests
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'family_members'
      AND tc.constraint_name = 'family_members_federation_duid_user_duid_unique'
  ) THEN
    -- First ensure the column exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'family_members'
        AND column_name = 'federation_duid'
    ) THEN
      ALTER TABLE family_members
      ADD CONSTRAINT family_members_federation_duid_user_duid_unique
      UNIQUE (federation_duid, user_duid);
      RAISE NOTICE '✓ Added unique constraint on (federation_duid, user_duid)';
    ELSE
      RAISE NOTICE '⚠ federation_duid column not found in family_members table';
    END IF;
  ELSE
    RAISE NOTICE '✓ Unique constraint already exists on (federation_duid, user_duid)';
  END IF;
END $$;

