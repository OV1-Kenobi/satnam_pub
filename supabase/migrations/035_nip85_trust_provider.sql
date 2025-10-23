-- 035_nip85_trust_provider.sql
-- NIP-85 Trust Provider Implementation: Database Schema for Trust Score Publishing
-- Idempotent by design; safe to run multiple times
-- 
-- Purpose: Enable Satnam.pub to act as a NIP-85 trusted service provider
-- - Publish user trust scores to Nostr network (kind 30382 events)
-- - Store user privacy preferences for trust score exposure
-- - Audit all trust score queries for privacy compliance
-- - Support per-metric visibility controls and encryption preferences
--
-- Privacy-First Design:
-- - RLS policies enforce user isolation via user_id matching auth.uid()
-- - Opt-in model: default to PRIVATE exposure (users must explicitly enable sharing)
-- - Audit logging with IP/UA hashing (no PII stored)
-- - Optional NIP-44 encryption for sensitive metrics

BEGIN;

-- =====================================================
-- 1. TRUST_PROVIDER_PREFERENCES TABLE
-- =====================================================
-- Stores user privacy settings for trust score exposure
-- Default: PRIVATE (opt-in model, not opt-out)

CREATE TABLE IF NOT EXISTS public.trust_provider_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public.user_identities(id) ON DELETE CASCADE,
  
  -- Privacy level: public, contacts, whitelist, private (default)
  exposure_level VARCHAR(20) NOT NULL DEFAULT 'private' 
    CHECK (exposure_level IN ('public', 'contacts', 'whitelist', 'private')),
  
  -- Which metrics are visible (JSONB array of metric names)
  -- Default: all 7 metrics (rank, followers, hops, influence, reliability, recency, composite)
  visible_metrics JSONB DEFAULT '["rank", "followers", "hops", "influence", "reliability", "recency", "composite"]',
  
  -- Whitelisted pubkeys for whitelist exposure level (TEXT array of npub/hex)
  whitelisted_pubkeys TEXT[] DEFAULT '{}',
  
  -- Enable NIP-44 encryption for sensitive metrics in kind 10040 content field
  encryption_enabled BOOLEAN DEFAULT false,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(user_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_trust_provider_prefs_user_id 
  ON public.trust_provider_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_trust_provider_prefs_exposure 
  ON public.trust_provider_preferences(exposure_level);

-- Row Level Security
ALTER TABLE public.trust_provider_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trust_provider_prefs_user_own" ON public.trust_provider_preferences;
CREATE POLICY "trust_provider_prefs_user_own" ON public.trust_provider_preferences
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- =====================================================
-- 2. NIP85_ASSERTIONS TABLE
-- =====================================================
-- Stores published NIP-85 assertions (kind 30382, 30383, 30384)
-- Tracks all trust assertions published to Nostr relays

CREATE TABLE IF NOT EXISTS public.nip85_assertions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public.user_identities(id) ON DELETE CASCADE,
  
  -- NIP-85 assertion kind (30382=user-level, 30383=event-level, 30384=address-level)
  assertion_kind SMALLINT NOT NULL CHECK (assertion_kind IN (30382, 30383, 30384)),
  
  -- Subject pubkey (hex format)
  subject_pubkey TEXT NOT NULL,
  
  -- Metrics published (JSONB object with metric_name: metric_value pairs)
  metrics JSONB NOT NULL,
  
  -- Nostr event ID (hex format, unique per assertion)
  event_id TEXT NOT NULL UNIQUE,
  
  -- Relay URLs where assertion was published (TEXT array)
  relay_urls TEXT[] DEFAULT '{"wss://relay.satnam.pub"}',
  
  -- Timestamps
  published_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_nip85_assertions_user_id 
  ON public.nip85_assertions(user_id);
CREATE INDEX IF NOT EXISTS idx_nip85_assertions_event_id 
  ON public.nip85_assertions(event_id);
CREATE INDEX IF NOT EXISTS idx_nip85_assertions_subject_pubkey 
  ON public.nip85_assertions(subject_pubkey);
CREATE INDEX IF NOT EXISTS idx_nip85_assertions_published_at 
  ON public.nip85_assertions(published_at);
CREATE INDEX IF NOT EXISTS idx_nip85_assertions_kind 
  ON public.nip85_assertions(assertion_kind);

-- Row Level Security
ALTER TABLE public.nip85_assertions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nip85_assertions_user_own" ON public.nip85_assertions;
CREATE POLICY "nip85_assertions_user_own" ON public.nip85_assertions
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- =====================================================
-- 3. TRUST_QUERY_AUDIT_LOG TABLE
-- =====================================================
-- Audit trail for all trust score queries
-- Privacy-preserving: IP and User-Agent are hashed (SHA-256)
-- No PII stored; only hashes and metadata

CREATE TABLE IF NOT EXISTS public.trust_query_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- User whose trust score was queried
  queried_user_id TEXT NOT NULL REFERENCES public.user_identities(id) ON DELETE CASCADE,
  
  -- Querier's pubkey (if available, NULL for anonymous queries)
  querier_pubkey TEXT,
  
  -- Query type: 'api', 'relay', 'internal'
  query_type VARCHAR(20) NOT NULL DEFAULT 'api' 
    CHECK (query_type IN ('api', 'relay', 'internal')),
  
  -- Privacy-preserving hashes (SHA-256, first 16 chars)
  ip_hash VARCHAR(16),
  user_agent_hash VARCHAR(16),
  
  -- Query result
  success BOOLEAN NOT NULL DEFAULT true,
  metrics_returned JSONB,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance and audit queries
CREATE INDEX IF NOT EXISTS idx_trust_query_audit_queried_user 
  ON public.trust_query_audit_log(queried_user_id);
CREATE INDEX IF NOT EXISTS idx_trust_query_audit_created_at 
  ON public.trust_query_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_trust_query_audit_query_type 
  ON public.trust_query_audit_log(query_type);

-- Row Level Security
ALTER TABLE public.trust_query_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trust_query_audit_user_own" ON public.trust_query_audit_log;
CREATE POLICY "trust_query_audit_user_own" ON public.trust_query_audit_log
  FOR SELECT
  TO authenticated
  USING (queried_user_id = auth.uid()::text);

-- =====================================================
-- 4. UPDATED_AT TRIGGERS
-- =====================================================
-- Automatically update updated_at timestamp on row changes

DROP TRIGGER IF EXISTS update_trust_provider_prefs_updated_at 
  ON public.trust_provider_preferences;
CREATE TRIGGER update_trust_provider_prefs_updated_at
  BEFORE UPDATE ON public.trust_provider_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_nip85_assertions_updated_at 
  ON public.nip85_assertions;
CREATE TRIGGER update_nip85_assertions_updated_at
  BEFORE UPDATE ON public.nip85_assertions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMIT;

