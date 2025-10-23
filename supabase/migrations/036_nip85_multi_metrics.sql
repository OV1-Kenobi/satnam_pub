-- 036_nip85_multi_metrics.sql
-- Phase 2: Multi-Metric Trust Scoring & Provider Management
-- Idempotent by design; safe to run multiple times
--
-- Purpose: Extend NIP-85 Trust Provider with multi-metric trust scoring
-- - Store calculated trust metrics (rank, followers, hops, influence, reliability, recency)
-- - Manage user's trusted provider list
-- - Track user's trust level per provider
-- - Support metric aggregation from multiple providers
--
-- Privacy-First Design:
-- - RLS policies enforce user isolation via user_id matching auth.uid()
-- - All metrics encrypted at rest using existing privacy infrastructure
-- - Per-user trust models with customizable weights
-- - Audit logging for all metric calculations

BEGIN;

-- =====================================================
-- 1. TRUST_METRICS TABLE
-- =====================================================
-- Stores calculated multi-metric trust scores per provider
-- Supports caching and aggregation of metrics from multiple providers

CREATE TABLE IF NOT EXISTS public.trust_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public.user_identities(id) ON DELETE CASCADE,
  
  -- Provider pubkey (hex format) - identifies which provider calculated these metrics
  provider_pubkey TEXT NOT NULL,
  
  -- Individual metrics (0-100 scale, except followers and hops)
  rank SMALLINT CHECK (rank >= 0 AND rank <= 100),
  followers INTEGER DEFAULT 0 CHECK (followers >= 0),
  hops SMALLINT CHECK (hops >= 1 AND hops <= 6),
  influence SMALLINT CHECK (influence >= 0 AND influence <= 100),
  reliability SMALLINT CHECK (reliability >= 0 AND reliability <= 100),
  recency SMALLINT CHECK (recency >= 0 AND recency <= 100),
  
  -- Composite score (weighted aggregation of all metrics)
  composite_score SMALLINT CHECK (composite_score >= 0 AND composite_score <= 100),
  
  -- Calculation metadata
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(user_id, provider_pubkey)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_trust_metrics_user_id 
  ON public.trust_metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_trust_metrics_provider_pubkey 
  ON public.trust_metrics(provider_pubkey);
CREATE INDEX IF NOT EXISTS idx_trust_metrics_user_provider 
  ON public.trust_metrics(user_id, provider_pubkey);
CREATE INDEX IF NOT EXISTS idx_trust_metrics_calculated_at 
  ON public.trust_metrics(calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_trust_metrics_expires_at 
  ON public.trust_metrics(expires_at);

-- Row Level Security
ALTER TABLE public.trust_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trust_metrics_user_own" ON public.trust_metrics;
CREATE POLICY "trust_metrics_user_own" ON public.trust_metrics
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- =====================================================
-- 2. TRUSTED_PROVIDERS TABLE
-- =====================================================
-- Stores user's list of trusted providers
-- Users can add/remove providers and set trust levels

CREATE TABLE IF NOT EXISTS public.trusted_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public.user_identities(id) ON DELETE CASCADE,
  
  -- Provider pubkey (hex format)
  provider_pubkey TEXT NOT NULL,
  
  -- Provider metadata
  provider_name TEXT,
  provider_relay TEXT,
  
  -- Trust level (1-5 stars)
  trust_level SMALLINT NOT NULL DEFAULT 3 CHECK (trust_level >= 1 AND trust_level <= 5),
  
  -- Active/inactive status
  is_active BOOLEAN DEFAULT true,
  
  -- Timestamps
  added_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(user_id, provider_pubkey)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_trusted_providers_user_id 
  ON public.trusted_providers(user_id);
CREATE INDEX IF NOT EXISTS idx_trusted_providers_provider_pubkey 
  ON public.trusted_providers(provider_pubkey);
CREATE INDEX IF NOT EXISTS idx_trusted_providers_user_provider 
  ON public.trusted_providers(user_id, provider_pubkey);
CREATE INDEX IF NOT EXISTS idx_trusted_providers_is_active 
  ON public.trusted_providers(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_trusted_providers_added_at 
  ON public.trusted_providers(added_at DESC);

-- Row Level Security
ALTER TABLE public.trusted_providers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trusted_providers_user_own" ON public.trusted_providers;
CREATE POLICY "trusted_providers_user_own" ON public.trusted_providers
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- =====================================================
-- 3. PROVIDER_TRUST_LEVELS TABLE
-- =====================================================
-- Stores user's customized trust level and weight per provider
-- Supports weighted aggregation of metrics from multiple providers

CREATE TABLE IF NOT EXISTS public.provider_trust_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public.user_identities(id) ON DELETE CASCADE,
  
  -- Provider pubkey (hex format)
  provider_pubkey TEXT NOT NULL,
  
  -- Trust level (1-5)
  trust_level SMALLINT NOT NULL DEFAULT 3 CHECK (trust_level >= 1 AND trust_level <= 5),
  
  -- Weight for metric aggregation (0.0-1.0)
  weight DECIMAL(3,2) NOT NULL DEFAULT 0.5 CHECK (weight >= 0 AND weight <= 1),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(user_id, provider_pubkey)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_provider_trust_levels_user_id 
  ON public.provider_trust_levels(user_id);
CREATE INDEX IF NOT EXISTS idx_provider_trust_levels_provider_pubkey 
  ON public.provider_trust_levels(provider_pubkey);
CREATE INDEX IF NOT EXISTS idx_provider_trust_levels_user_provider 
  ON public.provider_trust_levels(user_id, provider_pubkey);
CREATE INDEX IF NOT EXISTS idx_provider_trust_levels_trust_level 
  ON public.provider_trust_levels(user_id, trust_level DESC);

-- Row Level Security
ALTER TABLE public.provider_trust_levels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "provider_trust_levels_user_own" ON public.provider_trust_levels;
CREATE POLICY "provider_trust_levels_user_own" ON public.provider_trust_levels
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- =====================================================
-- 4. UPDATED_AT TRIGGERS
-- =====================================================
-- Automatically update updated_at timestamp on row changes

DROP TRIGGER IF EXISTS update_trust_metrics_updated_at 
  ON public.trust_metrics;
CREATE TRIGGER update_trust_metrics_updated_at
  BEFORE UPDATE ON public.trust_metrics
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_trusted_providers_updated_at 
  ON public.trusted_providers;
CREATE TRIGGER update_trusted_providers_updated_at
  BEFORE UPDATE ON public.trusted_providers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_provider_trust_levels_updated_at 
  ON public.provider_trust_levels;
CREATE TRIGGER update_provider_trust_levels_updated_at
  BEFORE UPDATE ON public.provider_trust_levels
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMIT;

