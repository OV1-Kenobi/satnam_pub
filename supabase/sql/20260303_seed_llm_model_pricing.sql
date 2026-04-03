-- Seed: LLM model token pricing (msats per token)
--
-- Purpose:
--   Provide an easy, copy/pasteable, idempotent seed to populate llm_model_pricing
--   so netlify/functions/agent-llm-proxy.ts can compute sats-based cost immediately.
--
-- Units:
--   input_msats_per_token / output_msats_per_token are INTEGER millisatoshis per token.
--   (1000 msats = 1 sat). The proxy computes:
--     cost_msats = inputTokens*input_msats_per_token + outputTokens*output_msats_per_token
--     cost_sats  = ceil(cost_msats / 1000)
--
-- IMPORTANT:
--   The numbers below are STARTING VALUES / PLACEHOLDERS.
--   You MUST keep them current with provider/model pricing.
--
-- How to run:
--   - Supabase SQL editor: paste this file and run (recommended).
--   - Safe to run multiple times (UPSERT).
--
-- Provider enum constraint (from migration): 'openai' | 'anthropic' | 'custom'

BEGIN;

-- OpenAI (example/common models)
INSERT INTO llm_model_pricing (
  provider,
  model,
  input_msats_per_token,
  output_msats_per_token,
  is_active,
  notes
) VALUES
  (
    'openai',
    'gpt-4o-mini',
    2,
    3,
    true,
    'SEED PLACEHOLDER: update to current OpenAI pricing (msats/token).'
  ),
  (
    'openai',
    'gpt-4.1-mini',
    2,
    4,
    true,
    'SEED PLACEHOLDER: update to current OpenAI pricing (msats/token).'
  )
ON CONFLICT (provider, model) WHERE is_active
DO UPDATE SET
  input_msats_per_token = EXCLUDED.input_msats_per_token,
  output_msats_per_token = EXCLUDED.output_msats_per_token,
  notes = EXCLUDED.notes;

-- Anthropic (placeholder models; adjust/remove as needed)
INSERT INTO llm_model_pricing (
  provider,
  model,
  input_msats_per_token,
  output_msats_per_token,
  is_active,
  notes
) VALUES
  (
    'anthropic',
    'claude-3-5-sonnet',
    3,
    6,
    true,
    'SEED PLACEHOLDER: update to current Anthropic pricing (msats/token).'
  )
ON CONFLICT (provider, model) WHERE is_active
DO UPDATE SET
  input_msats_per_token = EXCLUDED.input_msats_per_token,
  output_msats_per_token = EXCLUDED.output_msats_per_token,
  notes = EXCLUDED.notes;

-- Verify seeded active pricing rows
SELECT provider, model, input_msats_per_token, output_msats_per_token, is_active, updated_at
FROM llm_model_pricing
WHERE is_active = true
ORDER BY provider, model;

COMMIT;

