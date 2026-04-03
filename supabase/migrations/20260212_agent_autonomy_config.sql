-- IDEMPOTENT: Safe to run multiple times
-- Add autonomy configuration fields to agent intent configurations

-- Add extra_config column if it doesn't exist
DO $$ BEGIN
  ALTER TABLE agent_intent_configurations
    ADD COLUMN IF NOT EXISTS extra_config JSONB DEFAULT '{}'::jsonb;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Add constraint to ensure extra_config is an object
DO $$ BEGIN
  ALTER TABLE agent_intent_configurations
    ADD CONSTRAINT agent_intent_extra_config_object
    CHECK (jsonb_typeof(extra_config) = 'object');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add autonomy-specific constraint
DO $$ BEGIN
  ALTER TABLE agent_intent_configurations
    ADD CONSTRAINT agent_intent_autonomy_config_valid
    CHECK (
      extra_config ? 'autonomy' IS FALSE OR
      (
        jsonb_typeof(extra_config->'autonomy') = 'object' AND
        jsonb_typeof(extra_config->'autonomy'->'max_auto_spend_single_sats') = 'number' AND
        jsonb_typeof(extra_config->'autonomy'->'max_auto_spend_daily_sats') = 'number' AND
        jsonb_typeof(extra_config->'autonomy'->'require_human_for_external_api_calls') = 'boolean' AND
        jsonb_typeof(extra_config->'autonomy'->'risk_tolerance') = 'object' AND
        jsonb_typeof(extra_config->'autonomy'->'escalation_rules') = 'array'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create function to get default autonomy configuration based on agent role
CREATE OR REPLACE FUNCTION get_default_autonomy_config(p_agent_role TEXT)
RETURNS JSONB AS $$
BEGIN
  CASE p_agent_role
    WHEN 'adult' THEN
      RETURN '{
        "max_auto_spend_single_sats": 1000,
        "max_auto_spend_daily_sats": 5000,
        "require_human_for_external_api_calls": false,
        "risk_tolerance": {
          "payments": "medium",
          "data_access": "medium",
          "messaging": "medium"
        },
        "escalation_rules": [
          {
            "trigger": "payment_over_limit",
            "action": "pause_and_notify",
            "channel": "email"
          },
          {
            "trigger": "new_external_api_domain",
            "action": "log_only",
            "channel": "nostr_dm"
          }
        ]
      }'::jsonb;
    WHEN 'offspring' THEN
      RETURN '{
        "max_auto_spend_single_sats": 100,
        "max_auto_spend_daily_sats": 500,
        "require_human_for_external_api_calls": true,
        "risk_tolerance": {
          "payments": "low",
          "data_access": "low",
          "messaging": "low"
        },
        "escalation_rules": [
          {
            "trigger": "payment_over_limit",
            "action": "pause_and_notify",
            "channel": "email"
          },
          {
            "trigger": "new_external_api_domain",
            "action": "pause_and_notify",
            "channel": "email"
          },
          {
            "trigger": "bulk_message_send",
            "action": "pause_and_notify",
            "channel": "email"
          }
        ]
      }'::jsonb;
    ELSE
      RETURN '{
        "max_auto_spend_single_sats": 500,
        "max_auto_spend_daily_sats": 2500,
        "require_human_for_external_api_calls": true,
        "risk_tolerance": {
          "payments": "medium",
          "data_access": "medium",
          "messaging": "medium"
        },
        "escalation_rules": [
          {
            "trigger": "payment_over_limit",
            "action": "pause_and_notify",
            "channel": "email"
          }
        ]
      }'::jsonb;
  END CASE;
END;
$$ LANGUAGE plpgsql;

-- Create function to update autonomy configuration
CREATE OR REPLACE FUNCTION update_agent_autonomy_config(
  p_agent_id UUID,
  p_autonomy_config JSONB
)
RETURNS VOID AS $$
BEGIN
  UPDATE agent_intent_configurations
  SET extra_config = jsonb_set(extra_config, '{autonomy}', p_autonomy_config, true)
  WHERE agent_id = p_agent_id;
END;
$$ LANGUAGE plpgsql;

-- Create table for tracking autonomy violations
CREATE TABLE IF NOT EXISTS agent_autonomy_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL REFERENCES user_identities(id),
  action_type TEXT NOT NULL,
  violation_reason TEXT NOT NULL,
  escalation_action TEXT,
  escalation_channel TEXT,
  context JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for autonomy violations
DO $$ BEGIN EXECUTE 'CREATE INDEX IF NOT EXISTS idx_autonomy_violations_agent ON agent_autonomy_violations(agent_id)'; END $$;
DO $$ BEGIN EXECUTE 'CREATE INDEX IF NOT EXISTS idx_autonomy_violations_created ON agent_autonomy_violations(created_at)'; END $$;

-- RLS policies for autonomy violations
ALTER TABLE agent_autonomy_violations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_autonomy_violations'
      AND policyname = 'autonomy_violations_agent_read'
  ) THEN
    CREATE POLICY autonomy_violations_agent_read
      ON agent_autonomy_violations
      FOR SELECT
      USING (agent_id = auth.uid()::TEXT);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_autonomy_violations'
      AND policyname = 'autonomy_violations_service_full'
  ) THEN
    CREATE POLICY autonomy_violations_service_full
      ON agent_autonomy_violations
      FOR ALL
      USING (auth.role() = 'service_role');
  END IF;
END $$;
-- Create function to check autonomy rules
CREATE OR REPLACE FUNCTION check_autonomy_rules(
  p_agent_id UUID,
  p_action_type TEXT,
  p_estimated_cost_sats INTEGER DEFAULT NULL,
  p_external_api_domain TEXT DEFAULT NULL,
  p_message_batch_size INTEGER DEFAULT NULL
)
RETURNS TABLE(
  allowed BOOLEAN,
  reason TEXT,
  escalation_action TEXT,
  escalation_channel TEXT
) AS $$
DECLARE
  autonomy_config JSONB;
  max_single_sats INTEGER;
  max_daily_sats INTEGER;
  require_human_api BOOLEAN;
  escalation_rules JSONB;
  daily_spent BIGINT;
BEGIN
  SELECT extra_config->'autonomy' INTO autonomy_config
  FROM agent_intent_configurations
  WHERE agent_id = p_agent_id;

  -- If no autonomy config, default to allowed
  IF autonomy_config IS NULL THEN
    RETURN QUERY SELECT true, NULL, NULL, NULL;
    RETURN;
  END IF;

  -- Extract configuration values
  max_single_sats := (autonomy_config->>'max_auto_spend_single_sats')::INTEGER;
  max_daily_sats := (autonomy_config->>'max_auto_spend_daily_sats')::INTEGER;
  require_human_api := (autonomy_config->>'require_human_for_external_api_calls')::BOOLEAN;
  escalation_rules := autonomy_config->'escalation_rules';

  -- Check monetary limits
  IF p_action_type = 'payment' AND p_estimated_cost_sats IS NOT NULL THEN
    -- Check single transaction limit first (no DB query needed)
    IF p_estimated_cost_sats > max_single_sats THEN
      RETURN QUERY SELECT false, 'payment_over_single_limit'::TEXT, NULL::TEXT, NULL::TEXT;
      RETURN;
    END IF;

    -- Check daily spending limit (requires summing prior spend)
    SELECT COALESCE(SUM(amount_sats), 0)
    INTO daily_spent
    FROM agent_payment_receipts
    WHERE agent_id = p_agent_id
      AND received_at >= NOW() - INTERVAL '24 hours';

    IF daily_spent + p_estimated_cost_sats > max_daily_sats THEN
      RETURN QUERY SELECT false, 'payment_over_daily_limit'::TEXT, NULL::TEXT, NULL::TEXT;
      RETURN;
    END IF;
  END IF;

  -- Check external API guardrail
  IF p_action_type = 'external_api_call' AND require_human_api THEN
    RETURN QUERY SELECT false, 'external_api_requires_human', NULL, NULL;
    RETURN;
  END IF;

  -- Check bulk messaging
  IF p_action_type = 'encrypted_dm_send' AND p_message_batch_size IS NOT NULL THEN
    IF p_message_batch_size > 10 AND escalation_rules @> '[{"trigger": "bulk_message_send"}]' THEN
      RETURN QUERY SELECT false, 'bulk_message_send', 'pause_and_notify', 'email';
      RETURN;
    END IF;
  END IF;

  -- Default: action is allowed
  RETURN QUERY SELECT true, NULL, NULL, NULL;
END;
$$ LANGUAGE plpgsql;