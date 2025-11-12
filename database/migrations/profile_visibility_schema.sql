-- Migration: Add Public Profile URL Support with Privacy Controls
-- Date: October 23, 2025
-- Purpose: Enable shareable profile URLs with privacy-first visibility controls
-- Status: APPROVED - Privacy-first implementation

-- ============================================================================
-- STEP 1: Add profile visibility columns to user_identities table
-- ============================================================================

ALTER TABLE user_identities ADD COLUMN IF NOT EXISTS profile_visibility VARCHAR(20)
  DEFAULT 'private'
  CHECK (profile_visibility IN ('public', 'contacts_only', 'private'));


-- Ensure profile_visibility CHECK constraint allows 'trusted_contacts_only' (idempotent)
DO $$
DECLARE c_name text;
BEGIN
  SELECT conname INTO c_name
  FROM pg_constraint
  WHERE conrelid = 'public.user_identities'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%profile_visibility%';

  IF c_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.user_identities DROP CONSTRAINT %I', c_name);
  END IF;

  ALTER TABLE public.user_identities
    ADD CONSTRAINT user_identities_profile_visibility_chk
    CHECK (profile_visibility IN ('public','contacts_only','trusted_contacts_only','private'));
END$$;

ALTER TABLE user_identities ADD COLUMN IF NOT EXISTS profile_banner_url TEXT;

ALTER TABLE user_identities ADD COLUMN IF NOT EXISTS profile_theme JSONB DEFAULT '{}';

ALTER TABLE user_identities ADD COLUMN IF NOT EXISTS social_links JSONB DEFAULT '{}';

ALTER TABLE user_identities ADD COLUMN IF NOT EXISTS is_discoverable BOOLEAN DEFAULT false;

ALTER TABLE user_identities ADD COLUMN IF NOT EXISTS profile_views_count INTEGER DEFAULT 0;

ALTER TABLE user_identities ADD COLUMN IF NOT EXISTS last_profile_view TIMESTAMP;

ALTER TABLE user_identities ADD COLUMN IF NOT EXISTS analytics_enabled BOOLEAN DEFAULT false;

-- ============================================================================
-- STEP 2: Create profile_views table for privacy-first analytics
-- ============================================================================

CREATE TABLE IF NOT EXISTS profile_views (
  id VARCHAR(255) PRIMARY KEY DEFAULT encode(gen_random_bytes(16), 'hex'),
  profile_id VARCHAR(255) NOT NULL REFERENCES user_identities(id) ON DELETE CASCADE,
  viewer_hash VARCHAR(50),  -- Hashed viewer identity (privacy-first, no PII)
  viewed_at TIMESTAMP DEFAULT NOW(),
  referrer VARCHAR(255)    -- Optional: referrer domain (no full URL)
);

-- ============================================================================
-- STEP 3: Create indexes for performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_user_identities_profile_visibility
  ON user_identities(profile_visibility);

CREATE INDEX IF NOT EXISTS idx_user_identities_is_discoverable
  ON user_identities(is_discoverable);

CREATE INDEX IF NOT EXISTS idx_profile_views_profile_id
  ON profile_views(profile_id);

CREATE INDEX IF NOT EXISTS idx_profile_views_viewed_at
  ON profile_views(viewed_at);

CREATE INDEX IF NOT EXISTS idx_profile_views_viewer_hash
  ON profile_views(viewer_hash);

-- =============================================================================
-- STEP 3.5: Enhance encrypted_contacts schema with verification flags (idempotent)
-- =============================================================================

ALTER TABLE public.encrypted_contacts
  ADD COLUMN IF NOT EXISTS physical_mfa_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS simpleproof_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS kind0_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS pkarr_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS iroh_dht_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS verification_level TEXT
    CHECK (verification_level IN ('unverified','basic','verified','trusted'))
    DEFAULT 'unverified';

-- ============================================================================
-- STEP 4: Enable RLS on profile_views table
-- ============================================================================

ALTER TABLE profile_views ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- ============================================================================
-- STEP 4.5: Helper functions for DUID and contacts (idempotent)
-- ============================================================================

-- Resolve current viewer's DUID from session context or JWT claims
CREATE OR REPLACE FUNCTION public.get_current_user_duid()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('app.current_user_duid', true), ''),
    (current_setting('request.jwt.claims', true)::json ->> 'userId')
  )
$$;

-- Map profile owner's DUID to privacy_users.hashed_uuid via user_salt join
CREATE OR REPLACE FUNCTION public.get_owner_hash_from_duid(p_owner_duid TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_user_salt TEXT;
  v_owner_hash TEXT;
  v_col_name TEXT;
BEGIN
  -- Resolve owner's user_salt from user_identities
  SELECT ui.user_salt INTO v_user_salt
  FROM public.user_identities ui
  WHERE ui.id = p_owner_duid;

  IF v_user_salt IS NULL OR v_user_salt = '' THEN
    RETURN NULL;
  END IF;

  -- Determine which column exists on privacy_users for salt join
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='privacy_users' AND column_name='user_salt'
    ) THEN 'user_salt'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='privacy_users' AND column_name='user_identity_salt'
    ) THEN 'user_identity_salt'
    ELSE NULL
  END INTO v_col_name;

  IF v_col_name IS NULL THEN
    RETURN NULL;
  END IF;

  -- Use dynamic SQL to join on whichever column is present
  EXECUTE format('SELECT hashed_uuid FROM public.privacy_users WHERE %I = $1', v_col_name)
  INTO v_owner_hash
  USING v_user_salt;

  RETURN v_owner_hash;
END;
$$;

-- Compute owner-bound contact hash (32-hex truncation of SHA-256)
CREATE OR REPLACE FUNCTION public.compute_contact_hash_for_owner(p_owner_duid TEXT, p_viewer_duid TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  WITH s AS (
    SELECT ui.user_salt
    FROM public.user_identities ui
    WHERE ui.id = p_owner_duid
  )
  SELECT SUBSTRING(encode(digest(p_viewer_duid || '|' || s.user_salt, 'sha256'), 'hex'), 1, 32)
  FROM s
$$;

-- SECURITY DEFINER helper: returns true if viewer is in owner's encrypted_contacts
CREATE OR REPLACE FUNCTION public.is_contact_of_owner(p_owner_duid TEXT, p_viewer_duid TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_owner_hash TEXT;
  v_contact_hash TEXT;
  v_exists BOOLEAN := false;
BEGIN
  -- Ensure safe search_path
  PERFORM set_config('search_path', 'public', true);

  v_owner_hash := public.get_owner_hash_from_duid(p_owner_duid);
  IF v_owner_hash IS NULL OR v_owner_hash = '' THEN
    RETURN false;
  END IF;

  v_contact_hash := public.compute_contact_hash_for_owner(p_owner_duid, p_viewer_duid);
  IF v_contact_hash IS NULL OR v_contact_hash = '' THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.encrypted_contacts ec
    WHERE ec.owner_hash = v_owner_hash
      AND ec.contact_hash = v_contact_hash
  ) INTO v_exists;

  RETURN COALESCE(v_exists, false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_contact_of_owner(TEXT, TEXT) TO authenticated, anon;

-- SECURITY DEFINER helper: returns true if viewer is trusted contact (verified/trusted)
CREATE OR REPLACE FUNCTION public.is_trusted_contact_of_owner(p_owner_duid TEXT, p_viewer_duid TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_owner_hash TEXT;
  v_contact_hash TEXT;
  v_exists BOOLEAN := false;
BEGIN
  -- Ensure safe search_path
  PERFORM set_config('search_path', 'public', true);

  v_owner_hash := public.get_owner_hash_from_duid(p_owner_duid);
  IF v_owner_hash IS NULL OR v_owner_hash = '' THEN
    RETURN false;
  END IF;

  v_contact_hash := public.compute_contact_hash_for_owner(p_owner_duid, p_viewer_duid);
  IF v_contact_hash IS NULL OR v_contact_hash = '' THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.encrypted_contacts ec
    WHERE ec.owner_hash = v_owner_hash
      AND ec.contact_hash = v_contact_hash
      AND ec.verification_level IN ('verified','trusted')
  ) INTO v_exists;

  RETURN COALESCE(v_exists, false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_trusted_contact_of_owner(TEXT, TEXT) TO authenticated, anon;

-- Auto-derivation of verification_level based on verification flags (BEFORE trigger)
CREATE OR REPLACE FUNCTION public.auto_update_verification_level()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.physical_mfa_verified AND (NEW.simpleproof_verified OR NEW.kind0_verified) THEN
    NEW.verification_level := 'trusted';
  ELSIF NEW.physical_mfa_verified OR (NEW.simpleproof_verified AND NEW.kind0_verified) THEN
    NEW.verification_level := 'verified';
  ELSIF NEW.physical_mfa_verified OR NEW.simpleproof_verified OR NEW.kind0_verified OR NEW.pkarr_verified OR NEW.iroh_dht_verified THEN
    NEW.verification_level := 'basic';
  ELSE
    NEW.verification_level := 'unverified';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS encrypted_contacts_auto_update_verification_level ON public.encrypted_contacts;
CREATE TRIGGER encrypted_contacts_auto_update_verification_level
BEFORE INSERT OR UPDATE OF physical_mfa_verified, simpleproof_verified, kind0_verified, pkarr_verified, iroh_dht_verified
ON public.encrypted_contacts
FOR EACH ROW
EXECUTE FUNCTION public.auto_update_verification_level();

-- STEP 5: Create RLS Policies for Public Profile Access
-- ============================================================================

-- Policy: Public profiles are readable by anyone
DROP POLICY IF EXISTS "public_profiles_readable" ON user_identities;
CREATE POLICY "public_profiles_readable"
  ON user_identities FOR SELECT
  USING (profile_visibility = 'public');

-- Policy: Contacts-only profiles readable by contacts via encrypted_contacts (privacy-first)
DROP POLICY IF EXISTS "contacts_profiles_readable" ON user_identities;
CREATE POLICY "contacts_profiles_readable"
  ON user_identities FOR SELECT
  USING (
    profile_visibility = 'contacts_only'
    AND is_contact_of_owner(id, get_current_user_duid())
  );

-- Policy: Trusted-contacts-only profiles readable by trusted contacts
DROP POLICY IF EXISTS "trusted_contacts_profiles_readable" ON user_identities;
CREATE POLICY "trusted_contacts_profiles_readable"
  ON user_identities FOR SELECT
  USING (
    profile_visibility = 'trusted_contacts_only'
    AND is_trusted_contact_of_owner(id, get_current_user_duid())
  );


-- Policy: Own profile always readable
DROP POLICY IF EXISTS "own_profile_readable" ON user_identities;
CREATE POLICY "own_profile_readable"
  ON user_identities FOR SELECT
  USING (id = get_current_user_duid());

-- Policy: Own profile updatable
DROP POLICY IF EXISTS "own_profile_updatable" ON user_identities;
CREATE POLICY "own_profile_updatable"
  ON user_identities FOR UPDATE
  USING (id = get_current_user_duid())
  WITH CHECK (id = get_current_user_duid());

-- ============================================================================
-- STEP 6: Create RLS Policies for Profile Views Analytics
-- ============================================================================

-- Policy: Profile views readable by profile owner
DROP POLICY IF EXISTS "profile_views_readable_by_owner" ON profile_views;
CREATE POLICY "profile_views_readable_by_owner"
  ON profile_views FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_identities
      WHERE user_identities.id = profile_views.profile_id
      AND user_identities.id = get_current_user_duid()
    )
  );

-- Policy: Profile views insertable (anonymous analytics)
DROP POLICY IF EXISTS "profile_views_insertable" ON profile_views;
CREATE POLICY "profile_views_insertable"
  ON profile_views FOR INSERT
  WITH CHECK (true);  -- Allow anonymous view tracking

-- ============================================================================
-- STEP 7: Create helper function to hash viewer identity
-- ============================================================================

CREATE OR REPLACE FUNCTION hash_viewer_identity(viewer_id TEXT)
RETURNS VARCHAR(50) AS $$
BEGIN
  -- Hash viewer identity using SHA-256 (privacy-first)
  -- Returns first 50 chars of hex hash
  RETURN SUBSTRING(encode(digest(viewer_id, 'sha256'), 'hex'), 1, 50);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- STEP 8: Create helper function to increment profile view count
-- ============================================================================

CREATE OR REPLACE FUNCTION increment_profile_view_count(profile_id VARCHAR)
RETURNS void AS $$
BEGIN
  UPDATE user_identities
  SET
    profile_views_count = profile_views_count + 1,
    last_profile_view = NOW()
  WHERE id = profile_id AND analytics_enabled = true;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 9: Create trigger to update profile view count
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_increment_profile_views()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM increment_profile_view_count(NEW.profile_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profile_views_increment_trigger ON profile_views;

CREATE TRIGGER profile_views_increment_trigger
  AFTER INSERT ON profile_views
  FOR EACH ROW
  EXECUTE FUNCTION trigger_increment_profile_views();

-- ============================================================================
-- STEP 10: Verify migration success
-- ============================================================================

SELECT 'Profile visibility schema migration completed successfully' as status;

-- Verify columns exist
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'user_identities'
AND column_name IN (
  'profile_visibility', 'profile_banner_url', 'profile_theme',
  'social_links', 'is_discoverable', 'profile_views_count',
  'last_profile_view', 'analytics_enabled'
)
ORDER BY ordinal_position;

-- Verify profile_views table exists
SELECT table_name FROM information_schema.tables
WHERE table_name = 'profile_views';

-- Verify indexes exist
SELECT indexname FROM pg_indexes
WHERE tablename IN ('user_identities', 'profile_views')
AND indexname LIKE 'idx_%'
ORDER BY indexname;

