DO $$ BEGIN
  CREATE TYPE task_challenge_reason AS ENUM (
    'AMBIGUOUS_SPEC',
    'RESOURCE_EXCEED',
    'ETHICAL_CONCERN',
    'CAPABILITY_MISMATCH',
    'CONTEXT_SATURATION'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE challenge_resolution AS ENUM (
    'REVISED',
    'OVERRIDE_WITH_EXPLANATION',
    'CANCELLED',
    'DELEGATED_TO_ALTERNATIVE'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS agent_task_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL,
  agent_id TEXT NOT NULL REFERENCES user_identities(id),
  delegator_id TEXT NOT NULL REFERENCES user_identities(id),
  challenge_reason task_challenge_reason NOT NULL,
  agent_concern TEXT NOT NULL,
  suggested_modification TEXT,
  resolution challenge_resolution,
  delegator_explanation TEXT,
  revised_task_spec JSONB,
  challenge_accepted BOOLEAN,
  task_proceeded BOOLEAN DEFAULT FALSE,
  confidence_in_challenge NUMERIC,
  final_task_outcome TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

DO $$ BEGIN
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_task_challenges_task ON agent_task_challenges(task_id)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_task_challenges_agent ON agent_task_challenges(agent_id)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_task_challenges_delegator ON agent_task_challenges(delegator_id)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_task_challenges_reason ON agent_task_challenges(challenge_reason)';
END $$;

ALTER TABLE agent_task_challenges ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_task_challenges'
      AND policyname = 'task_challenges_participant_read'
  ) THEN
    CREATE POLICY task_challenges_participant_read
      ON agent_task_challenges
      FOR SELECT
      USING (agent_id = auth.uid()::TEXT OR delegator_id = auth.uid()::TEXT);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_task_challenges'
      AND policyname = 'task_challenges_agent_insert'
  ) THEN
    CREATE POLICY task_challenges_agent_insert
      ON agent_task_challenges
      FOR INSERT
      WITH CHECK (agent_id = auth.uid()::TEXT);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_task_challenges'
      AND policyname = 'task_challenges_delegator_update'
  ) THEN
    CREATE POLICY task_challenges_delegator_update
      ON agent_task_challenges
      FOR UPDATE
      USING (delegator_id = auth.uid()::TEXT)
      WITH CHECK (delegator_id = auth.uid()::TEXT);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_task_challenges'
      AND policyname = 'task_challenges_service_full'
  ) THEN
    CREATE POLICY task_challenges_service_full
      ON agent_task_challenges
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;