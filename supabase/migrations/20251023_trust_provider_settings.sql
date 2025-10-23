-- Trust Provider Settings & Notifications Schema
-- Phase 3 Day 4: Trust Provider Settings Integration
-- 
-- Creates tables for managing user trust provider settings, subscriptions, and notifications
-- Maintains privacy-first architecture with RLS policies
-- 
-- Tables:
-- 1. user_trust_settings - User-level trust configuration
-- 2. trust_notification_preferences - Notification settings per user
-- 3. trust_provider_subscriptions - Active provider subscriptions
-- 4. trust_subscription_usage - Usage metrics per subscription

BEGIN;

-- =====================================================
-- 1. USER_TRUST_SETTINGS TABLE
-- =====================================================
-- Stores user-level trust configuration and preferences

CREATE TABLE IF NOT EXISTS public.user_trust_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public.user_identities(id) ON DELETE CASCADE,
  
  -- Trust model preference
  trust_model VARCHAR(20) NOT NULL DEFAULT 'multi-metric' 
    CHECK (trust_model IN ('action-based', 'multi-metric', 'hybrid')),
  
  -- Metric weights (stored as JSONB for flexibility)
  metric_weights JSONB DEFAULT '{
    "rank": 0.25,
    "followers": 0.15,
    "hops": 0.15,
    "influence": 0.20,
    "reliability": 0.15,
    "recency": 0.10
  }'::jsonb,
  
  -- Display preferences
  show_composite_score BOOLEAN DEFAULT true,
  show_individual_metrics BOOLEAN DEFAULT true,
  compact_view BOOLEAN DEFAULT false,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(user_id)
);

-- RLS Policy: Users can only access their own settings
ALTER TABLE public.user_trust_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_trust_settings_select" ON public.user_trust_settings
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "user_trust_settings_insert" ON public.user_trust_settings
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "user_trust_settings_update" ON public.user_trust_settings
  FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "user_trust_settings_delete" ON public.user_trust_settings
  FOR DELETE USING (auth.uid()::text = user_id);

-- =====================================================
-- 2. TRUST_NOTIFICATION_PREFERENCES TABLE
-- =====================================================
-- Stores notification settings and alert thresholds

CREATE TABLE IF NOT EXISTS public.trust_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public.user_identities(id) ON DELETE CASCADE,
  
  -- Alert thresholds
  trust_score_threshold SMALLINT DEFAULT 50 CHECK (trust_score_threshold >= 0 AND trust_score_threshold <= 100),
  min_trust_level SMALLINT DEFAULT 3 CHECK (min_trust_level >= 1 AND min_trust_level <= 5),
  
  -- Alert toggles
  enable_score_alerts BOOLEAN DEFAULT true,
  enable_provider_alerts BOOLEAN DEFAULT true,
  enable_new_provider_alerts BOOLEAN DEFAULT false,
  
  -- Delivery channels
  delivery_channels TEXT[] DEFAULT ARRAY['in-app']::TEXT[] 
    CHECK (delivery_channels <@ ARRAY['in-app', 'nostr-dm', 'email']::TEXT[]),
  
  -- Notification frequency
  frequency VARCHAR(20) DEFAULT 'daily' 
    CHECK (frequency IN ('real-time', 'daily', 'weekly')),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(user_id)
);

-- RLS Policy: Users can only access their own preferences
ALTER TABLE public.trust_notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trust_notification_preferences_select" ON public.trust_notification_preferences
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "trust_notification_preferences_insert" ON public.trust_notification_preferences
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "trust_notification_preferences_update" ON public.trust_notification_preferences
  FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "trust_notification_preferences_delete" ON public.trust_notification_preferences
  FOR DELETE USING (auth.uid()::text = user_id);

-- =====================================================
-- 3. TRUST_PROVIDER_SUBSCRIPTIONS TABLE
-- =====================================================
-- Tracks active provider subscriptions per user

CREATE TABLE IF NOT EXISTS public.trust_provider_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public.user_identities(id) ON DELETE CASCADE,
  
  -- Provider reference
  provider_id TEXT NOT NULL,
  provider_name TEXT,
  provider_pubkey TEXT,
  
  -- Subscription status
  status VARCHAR(20) NOT NULL DEFAULT 'active' 
    CHECK (status IN ('active', 'paused', 'expired')),
  
  -- Subscription dates
  subscribed_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  
  -- Usage tracking
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  metrics_count INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(user_id, provider_id)
);

-- RLS Policy: Users can only access their own subscriptions
ALTER TABLE public.trust_provider_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trust_provider_subscriptions_select" ON public.trust_provider_subscriptions
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "trust_provider_subscriptions_insert" ON public.trust_provider_subscriptions
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "trust_provider_subscriptions_update" ON public.trust_provider_subscriptions
  FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "trust_provider_subscriptions_delete" ON public.trust_provider_subscriptions
  FOR DELETE USING (auth.uid()::text = user_id);

-- =====================================================
-- INDEXES
-- =====================================================

-- Index for user_trust_settings lookups
CREATE INDEX IF NOT EXISTS idx_user_trust_settings_user_id 
  ON public.user_trust_settings(user_id);

-- Index for notification preferences lookups
CREATE INDEX IF NOT EXISTS idx_trust_notification_preferences_user_id 
  ON public.trust_notification_preferences(user_id);

-- Index for subscription lookups
CREATE INDEX IF NOT EXISTS idx_trust_provider_subscriptions_user_id 
  ON public.trust_provider_subscriptions(user_id);

CREATE INDEX IF NOT EXISTS idx_trust_provider_subscriptions_status 
  ON public.trust_provider_subscriptions(user_id, status);

CREATE INDEX IF NOT EXISTS idx_trust_provider_subscriptions_provider_id 
  ON public.trust_provider_subscriptions(provider_id);

COMMIT;

