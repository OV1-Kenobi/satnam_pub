-- Adaptive Delegation Coordinator (Task 4.5.5)
-- Adds fallback strategy storage and transfer audit trails for mid-execution task switching.

DO $$ BEGIN
  CREATE TYPE escalation_path AS ENUM (
    'HUMAN',
    'NEXT_FALLBACK',
    'CANCEL_TASK',
    'RETRY_PRIMARY'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE transfer_reason AS ENUM (
    'LATENCY_EXCEEDED',
    'COST_OVERRUN',
    'PROGRESS_STALLED',
    'AGENT_UNAVAILABLE',
    'QUALITY_DEGRADATION',
    'MANUAL_SWITCH'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS agent_delegation_strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES agent_task_records(id) ON DELETE CASCADE,
  primary_agent_id TEXT NOT NULL REFERENCES user_identities(id) ON DELETE CASCADE,
  delegator_id TEXT NOT NULL REFERENCES user_identities(id) ON DELETE CASCADE,
  fallback_agents JSONB NOT NULL DEFAULT '[]'::jsonb,
  max_latency_seconds INTEGER NOT NULL DEFAULT 300 CHECK (max_latency_seconds > 0),
  max_cost_overrun_percent INTEGER NOT NULL DEFAULT 50 CHECK (max_cost_overrun_percent >= 0),
  min_progress_check_failures INTEGER NOT NULL DEFAULT 3 CHECK (min_progress_check_failures >= 0),
  max_quality_score_drop INTEGER NOT NULL DEFAULT 20 CHECK (max_quality_score_drop >= 0),
  escalation_path escalation_path NOT NULL DEFAULT 'NEXT_FALLBACK',
  current_agent_id TEXT REFERENCES user_identities(id) ON DELETE SET NULL,
  switch_count INTEGER NOT NULL DEFAULT 0 CHECK (switch_count >= 0),
  last_health_check_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(task_id)
);

DO $$ BEGIN
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_delegation_strategies_task ON agent_delegation_strategies(task_id)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_delegation_strategies_current_agent ON agent_delegation_strategies(current_agent_id)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_delegation_strategies_delegator ON agent_delegation_strategies(delegator_id)';
END $$;

ALTER TABLE agent_delegation_strategies ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'agent_delegation_strategies'
      AND policyname = 'delegation_strategies_participant_read'
  ) THEN
    CREATE POLICY delegation_strategies_participant_read
      ON agent_delegation_strategies FOR SELECT
      USING (delegator_id = auth.uid()::TEXT OR current_agent_id = auth.uid()::TEXT OR primary_agent_id = auth.uid()::TEXT);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'agent_delegation_strategies'
      AND policyname = 'delegation_strategies_delegator_manage'
  ) THEN
    CREATE POLICY delegation_strategies_delegator_manage
      ON agent_delegation_strategies FOR ALL
      USING (delegator_id = auth.uid()::TEXT) WITH CHECK (delegator_id = auth.uid()::TEXT);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'agent_delegation_strategies'
      AND policyname = 'delegation_strategies_service_full'
  ) THEN
    CREATE POLICY delegation_strategies_service_full
      ON agent_delegation_strategies FOR ALL
      USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS agent_task_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES agent_task_records(id) ON DELETE CASCADE,
  strategy_id UUID REFERENCES agent_delegation_strategies(id) ON DELETE SET NULL,
  from_agent_id TEXT NOT NULL REFERENCES user_identities(id) ON DELETE CASCADE,
  to_agent_id TEXT NOT NULL REFERENCES user_identities(id) ON DELETE CASCADE,
  transfer_reason transfer_reason NOT NULL,
  transfer_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  work_completed_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  progress_percent INTEGER CHECK (progress_percent >= 0 AND progress_percent <= 100),
  transfer_successful BOOLEAN NOT NULL DEFAULT TRUE,
  transfer_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_task_transfers_task ON agent_task_transfers(task_id)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_task_transfers_strategy ON agent_task_transfers(strategy_id)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_task_transfers_from_agent ON agent_task_transfers(from_agent_id)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_task_transfers_to_agent ON agent_task_transfers(to_agent_id)';
END $$;

ALTER TABLE agent_task_transfers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'agent_task_transfers'
      AND policyname = 'task_transfers_participant_read'
  ) THEN
    CREATE POLICY task_transfers_participant_read
      ON agent_task_transfers FOR SELECT
      USING (from_agent_id = auth.uid()::TEXT OR to_agent_id = auth.uid()::TEXT);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'agent_task_transfers'
      AND policyname = 'task_transfers_service_full'
  ) THEN
    CREATE POLICY task_transfers_service_full
      ON agent_task_transfers FOR ALL
      USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;