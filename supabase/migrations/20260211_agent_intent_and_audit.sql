BEGIN;

DO $$ BEGIN
  CREATE TYPE agent_creator_type AS ENUM ('human', 'agent');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE agent_creation_channel AS ENUM ('wizard', 'api_self_onboard', 'api_human_programmatic');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE agent_profiles
  ADD COLUMN IF NOT EXISTS lifecycle_state TEXT DEFAULT 'ACTIVE';

CREATE TABLE IF NOT EXISTS agent_intent_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL UNIQUE REFERENCES user_identities(id),
  created_by_user_id TEXT REFERENCES user_identities(id),
  vision_title TEXT NOT NULL,
  vision_summary TEXT NOT NULL,
  mission_summary TEXT NOT NULL,
  mission_checklist TEXT[],
  value_context TEXT NOT NULL,
  constraints TEXT[],
  success_metrics TEXT[],
  extra_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_agent_intent_agent ON agent_intent_configurations(agent_id)';
END $$;

ALTER TABLE agent_intent_configurations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_intent_configurations'
      AND policyname = 'agent_intent_own_read'
  ) THEN
    CREATE POLICY agent_intent_own_read
      ON agent_intent_configurations
      FOR SELECT
      USING (agent_id = auth.uid()::TEXT OR created_by_user_id = auth.uid()::TEXT);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_intent_configurations'
      AND policyname = 'agent_intent_own_insert'
  ) THEN
    CREATE POLICY agent_intent_own_insert
      ON agent_intent_configurations
      FOR INSERT
      WITH CHECK (agent_id = auth.uid()::TEXT OR created_by_user_id = auth.uid()::TEXT);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_intent_configurations'
      AND policyname = 'agent_intent_own_update'
  ) THEN
    CREATE POLICY agent_intent_own_update
      ON agent_intent_configurations
      FOR UPDATE
      USING (agent_id = auth.uid()::TEXT OR created_by_user_id = auth.uid()::TEXT)
      WITH CHECK (agent_id = auth.uid()::TEXT OR created_by_user_id = auth.uid()::TEXT);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_intent_configurations'
      AND policyname = 'agent_intent_service_full'
  ) THEN
    CREATE POLICY agent_intent_service_full
      ON agent_intent_configurations
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS agent_creation_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL REFERENCES user_identities(id),
  created_by_user_id TEXT REFERENCES user_identities(id),
  creator_type agent_creator_type NOT NULL,
  creation_channel agent_creation_channel NOT NULL,
  agent_role TEXT NOT NULL,
  free_tier_used BOOLEAN DEFAULT FALSE,
  free_tier_allocation_number INTEGER,
  required_bond_amount_sats BIGINT DEFAULT 0,
  intent_snapshot JSONB,
  request_metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_agent_creation_agent ON agent_creation_audit(agent_id)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_agent_creation_creator ON agent_creation_audit(created_by_user_id)';
END $$;

ALTER TABLE agent_creation_audit ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_creation_audit'
      AND policyname = 'agent_creation_own_read'
  ) THEN
    CREATE POLICY agent_creation_own_read
      ON agent_creation_audit
      FOR SELECT
      USING (created_by_user_id = auth.uid()::TEXT);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_creation_audit'
      AND policyname = 'agent_creation_own_insert'
  ) THEN
    CREATE POLICY agent_creation_own_insert
      ON agent_creation_audit
      FOR INSERT
      WITH CHECK (created_by_user_id = auth.uid()::TEXT);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_creation_audit'
      AND policyname = 'agent_creation_service_full'
  ) THEN
    CREATE POLICY agent_creation_service_full
      ON agent_creation_audit
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS agent_paygate_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL UNIQUE REFERENCES user_identities(id),
  provider TEXT NOT NULL CHECK (provider IN ('lightning_faucet', 'routstr', 'aperture', 'self_hosted')),
  max_spend_per_call_sats BIGINT NOT NULL DEFAULT 0,
  max_spend_per_hour_sats BIGINT NOT NULL DEFAULT 0,
  max_spend_per_day_sats BIGINT NOT NULL DEFAULT 0,
  fallback_provider TEXT CHECK (fallback_provider IN ('lightning_faucet', 'routstr', 'aperture', 'self_hosted')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE agent_paygate_config ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_paygate_config'
      AND policyname = 'agent_paygate_read'
  ) THEN
    CREATE POLICY agent_paygate_read
      ON agent_paygate_config
      FOR SELECT
      USING (
        agent_id = auth.uid()::TEXT
        OR EXISTS (
          SELECT 1
          FROM agent_profiles ap
          WHERE ap.user_identity_id = agent_paygate_config.agent_id
            AND ap.created_by_user_id = auth.uid()::TEXT
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_paygate_config'
      AND policyname = 'agent_paygate_insert'
  ) THEN
    CREATE POLICY agent_paygate_insert
      ON agent_paygate_config
      FOR INSERT
      WITH CHECK (
        agent_id = auth.uid()::TEXT
        OR EXISTS (
          SELECT 1
          FROM agent_profiles ap
          WHERE ap.user_identity_id = agent_paygate_config.agent_id
            AND ap.created_by_user_id = auth.uid()::TEXT
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_paygate_config'
      AND policyname = 'agent_paygate_update'
  ) THEN
    CREATE POLICY agent_paygate_update
      ON agent_paygate_config
      FOR UPDATE
      USING (
        agent_id = auth.uid()::TEXT
        OR EXISTS (
          SELECT 1
          FROM agent_profiles ap
          WHERE ap.user_identity_id = agent_paygate_config.agent_id
            AND ap.created_by_user_id = auth.uid()::TEXT
        )
      )
      WITH CHECK (
        agent_id = auth.uid()::TEXT
        OR EXISTS (
          SELECT 1
          FROM agent_profiles ap
          WHERE ap.user_identity_id = agent_paygate_config.agent_id
            AND ap.created_by_user_id = auth.uid()::TEXT
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_paygate_config'
      AND policyname = 'agent_paygate_service_full'
  ) THEN
    CREATE POLICY agent_paygate_service_full
      ON agent_paygate_config
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

COMMIT;