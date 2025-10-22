-- 030_progressive_trust_system.sql
-- Progressive Trust System: Time-based escalation, action-based reputation, and trust decay
-- Idempotent by design; safe to run multiple times

BEGIN;

-- 1. Trust History Table (tracks all trust score changes)
CREATE TABLE IF NOT EXISTS public.trust_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES user_identities(id) ON DELETE CASCADE,
  trust_score_before SMALLINT,
  trust_score_after SMALLINT,
  trust_delta SMALLINT,
  reason VARCHAR(50),  -- 'checkpoint', 'action', 'decay', 'manual'
  checkpoint_name VARCHAR(50),
  action_type VARCHAR(50),
  metadata JSONB,
  recorded_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trust_history_user ON public.trust_history(user_id);
CREATE INDEX IF NOT EXISTS idx_trust_history_recorded ON public.trust_history(recorded_at);

ALTER TABLE public.trust_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_see_own_trust_history" ON public.trust_history;
CREATE POLICY "users_see_own_trust_history" ON public.trust_history
  FOR SELECT
  TO authenticated
  USING (user_id = current_setting('app.current_user_duid', true));

-- 2. Reputation Actions Table (logs all user actions for reputation scoring)
CREATE TABLE IF NOT EXISTS public.reputation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES user_identities(id) ON DELETE CASCADE,
  action_type VARCHAR(100) NOT NULL,  -- 'lightning_payment_sent', 'peer_attestation_given', etc.
  weight SMALLINT NOT NULL,  -- Action weight (1-25)
  category VARCHAR(50) NOT NULL,  -- 'payment', 'social', 'governance', 'engagement'
  metadata JSONB,  -- Additional context (e.g., amount, recipient, attestation details)
  recorded_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reputation_actions_user ON public.reputation_actions(user_id);
CREATE INDEX IF NOT EXISTS idx_reputation_actions_recorded ON public.reputation_actions(recorded_at);
CREATE INDEX IF NOT EXISTS idx_reputation_actions_category ON public.reputation_actions(category);

ALTER TABLE public.reputation_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_see_own_reputation_actions" ON public.reputation_actions;
CREATE POLICY "users_see_own_reputation_actions" ON public.reputation_actions
  FOR SELECT
  TO authenticated
  USING (user_id = current_setting('app.current_user_duid', true));

-- 3. Extend user_identities with trust metrics (if not already present)
DO $$
BEGIN
  -- Add trust_score column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_identities' AND column_name = 'trust_score'
  ) THEN
    ALTER TABLE public.user_identities ADD COLUMN trust_score SMALLINT DEFAULT 0;
  END IF;

  -- Add reputation_score column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_identities' AND column_name = 'reputation_score'
  ) THEN
    ALTER TABLE public.user_identities ADD COLUMN reputation_score SMALLINT DEFAULT 0;
  END IF;

  -- Add pop_score column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_identities' AND column_name = 'pop_score'
  ) THEN
    ALTER TABLE public.user_identities ADD COLUMN pop_score SMALLINT DEFAULT 0;
  END IF;

  -- Add up_score column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_identities' AND column_name = 'up_score'
  ) THEN
    ALTER TABLE public.user_identities ADD COLUMN up_score SMALLINT DEFAULT 0;
  END IF;

  -- Add last_activity_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_identities' AND column_name = 'last_activity_at'
  ) THEN
    ALTER TABLE public.user_identities ADD COLUMN last_activity_at TIMESTAMPTZ DEFAULT now();
  END IF;
END $$;

COMMIT;

