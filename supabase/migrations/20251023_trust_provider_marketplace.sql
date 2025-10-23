-- Trust Provider Marketplace Schema
-- Phase 3 Day 5: Trust Provider API Endpoints
-- 
-- Creates tables for trust provider marketplace, ratings, and metrics
-- Maintains privacy-first architecture with RLS policies
-- 
-- Tables:
-- 1. trust_providers - Public provider directory
-- 2. trust_provider_ratings - User ratings and reviews
-- 3. trust_metrics - Trust metrics per contact (updated from Phase 2)

BEGIN;

-- =====================================================
-- 1. TRUST_PROVIDERS TABLE
-- =====================================================
-- Public directory of trust providers
-- Stores provider metadata and aggregate metrics

CREATE TABLE IF NOT EXISTS public.trust_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Provider identification
  name VARCHAR(255) NOT NULL,
  pubkey VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  
  -- Provider metrics (aggregate from all users)
  metrics JSONB DEFAULT '{
    "rank": 0,
    "followers": 0,
    "hops": 0,
    "influence": 0,
    "reliability": 0,
    "recency": 0
  }'::jsonb,
  
  -- Aggregate ratings
  rating NUMERIC(3, 2) DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
  review_count INTEGER DEFAULT 0,
  subscription_count INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policy: Public read access (no authentication required)
ALTER TABLE public.trust_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trust_providers_select_public" ON public.trust_providers
  FOR SELECT USING (true);

-- Service role can update
CREATE POLICY "trust_providers_update_service" ON public.trust_providers
  FOR UPDATE USING (auth.role() = 'service_role');

-- =====================================================
-- 2. TRUST_PROVIDER_RATINGS TABLE
-- =====================================================
-- User ratings and reviews for providers

CREATE TABLE IF NOT EXISTS public.trust_provider_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public.user_identities(id) ON DELETE CASCADE,
  
  -- Provider reference
  provider_id TEXT NOT NULL,
  
  -- Rating data
  rating SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review TEXT,
  
  -- Helpfulness tracking
  helpful INTEGER DEFAULT 0,
  unhelpful INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(user_id, provider_id)
);

-- RLS Policy: Users can only access their own ratings
ALTER TABLE public.trust_provider_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trust_provider_ratings_select" ON public.trust_provider_ratings
  FOR SELECT USING (auth.uid()::text = user_id OR auth.role() = 'service_role');

CREATE POLICY "trust_provider_ratings_insert" ON public.trust_provider_ratings
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "trust_provider_ratings_update" ON public.trust_provider_ratings
  FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "trust_provider_ratings_delete" ON public.trust_provider_ratings
  FOR DELETE USING (auth.uid()::text = user_id);

-- =====================================================
-- 3. TRUST_METRICS TABLE (VERIFY/UPDATE)
-- =====================================================
-- Verify this table exists from Phase 2
-- If it exists, ensure it has contact_id field

-- Check if table exists and add contact_id if missing
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'trust_metrics'
  ) THEN
    -- Add contact_id column if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'trust_metrics' AND column_name = 'contact_id'
    ) THEN
      ALTER TABLE public.trust_metrics ADD COLUMN contact_id TEXT;
    END IF;
    
    -- Add timestamp column if it doesn't exist (alias for calculated_at)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'trust_metrics' AND column_name = 'timestamp'
    ) THEN
      ALTER TABLE public.trust_metrics ADD COLUMN timestamp TIMESTAMPTZ DEFAULT NOW();
    END IF;
  END IF;
END $$;

-- =====================================================
-- INDEXES
-- =====================================================

-- Trust providers indexes
CREATE INDEX IF NOT EXISTS idx_trust_providers_pubkey 
  ON public.trust_providers(pubkey);

CREATE INDEX IF NOT EXISTS idx_trust_providers_rating 
  ON public.trust_providers(rating DESC);

CREATE INDEX IF NOT EXISTS idx_trust_providers_created_at 
  ON public.trust_providers(created_at DESC);

-- Trust provider ratings indexes
CREATE INDEX IF NOT EXISTS idx_trust_provider_ratings_user_id 
  ON public.trust_provider_ratings(user_id);

CREATE INDEX IF NOT EXISTS idx_trust_provider_ratings_provider_id 
  ON public.trust_provider_ratings(provider_id);

CREATE INDEX IF NOT EXISTS idx_trust_provider_ratings_user_provider 
  ON public.trust_provider_ratings(user_id, provider_id);

CREATE INDEX IF NOT EXISTS idx_trust_provider_ratings_created_at 
  ON public.trust_provider_ratings(created_at DESC);

-- Trust metrics indexes (if table exists)
CREATE INDEX IF NOT EXISTS idx_trust_metrics_contact_id 
  ON public.trust_metrics(contact_id);

CREATE INDEX IF NOT EXISTS idx_trust_metrics_user_contact 
  ON public.trust_metrics(user_id, contact_id);

CREATE INDEX IF NOT EXISTS idx_trust_metrics_timestamp 
  ON public.trust_metrics(timestamp DESC);

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Update trust_providers.updated_at on changes
CREATE OR REPLACE FUNCTION update_trust_providers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_trust_providers_updated_at ON public.trust_providers;
CREATE TRIGGER trigger_trust_providers_updated_at
  BEFORE UPDATE ON public.trust_providers
  FOR EACH ROW
  EXECUTE FUNCTION update_trust_providers_updated_at();

-- Update trust_provider_ratings.updated_at on changes
CREATE OR REPLACE FUNCTION update_trust_provider_ratings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_trust_provider_ratings_updated_at ON public.trust_provider_ratings;
CREATE TRIGGER trigger_trust_provider_ratings_updated_at
  BEFORE UPDATE ON public.trust_provider_ratings
  FOR EACH ROW
  EXECUTE FUNCTION update_trust_provider_ratings_updated_at();

COMMIT;

