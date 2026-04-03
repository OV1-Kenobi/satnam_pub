# Adult Agent LLM Integration & BTC/USD Cost Tracking Plan (Draft)

## 1. Purpose & Scope

This plan specifies a 10–12 day implementation to:
- Enable an **Adult-role AI agent** on Satnam that uses a **ChatGPT Business (and other LLM) API key** for task execution.
- Provide **comprehensive observability** and reporting via existing Phase 2.5 agent session infrastructure.
- Introduce a **multi-provider BTC/USD pricing utility** as a **blocking dependency** for all USD cost tracking.

The work must:
- Reuse existing `agent_sessions`, `agent_session_events`, `agent_task_records`, `session_cost_analysis`, and Netlify Functions (`agent-session-create`, `agent-session-event`, `agent-session-manage`).
- Maintain **zero-knowledge security** for API keys (client-side encryption, no plaintext at rest).
- Respect Master Context role hierarchy and privacy-first patterns.

---

## 2. High-Level Architecture

1. **Adult Agent & LLM Usage**
   - Use existing `user_identities` + `agent_profiles` to create an `adult`-role agent.
   - Store LLM provider metadata per agent (model name, provider) in `agent_task_records`.
   - Route agent LLM calls via a new **LLM proxy Netlify Function** using a pluggable provider adapter.

2. **Cost & Observability**
   - Continue to treat **sats-based cost** as primary truth (`actual_cost_sats`, `sats_spent`).
   - Use a shared BTC/USD pricing utility to derive **`cost_usd_cents`** at event time.
   - Drive daily/weekly reports from `agent_task_records`, `agent_sessions`, `session_cost_analysis`, and new reporting views.

3. **BTC/USD Pricing Utility (Blocking Dependency)**
   - Server-only module (e.g., `netlify/functions/utils/btc-usd-pricing.ts`).
   - Fetch BTC/USD spot rate in parallel from **Coinbase**, **Mempool.space**, and **Bitfinex**.
   - Normalize to numeric `btcUsd` per provider; aggregate via **median** (or average if only two values).
   - Provide helpers for `sats → BTC → USD` and `BTC → USD`, returning minor units (USD cents) for storage.

---

## 3. Phased Timeline (10–12 Days)

### Phase 0 – Foundations & Design (0.5–1 day)

0.1 **Review existing infra**
- Confirm schemas for `agent_sessions`, `agent_session_events`, `agent_task_records`, `agent_profiles`, `agent_operational_state`, and `session_cost_analysis`.
- Identify all current uses of `/api/agents/*`, `AgentSessionMonitor`, `AgentHealthDashboard`, and `AgentDelegationMonitoringDashboard`.

0.2 **Define LLM adapter shape**
- Draft a lightweight interface (TypeScript) for providers (OpenAI, Anthropic, future others):
  - Methods for `createChatCompletion`, token accounting, and error normalization.
  - Ensure no provider-specific logic leaks into Netlify handlers.

0.3 **Design BTC/USD pricing module (blocking)**
- Specify function signatures (see Section 4) and error types.
- Decide on **median-first** aggregation, with simple average as fallback when needed.
- Align caching and fallback behavior with the `bitcoin-fee-estimate` pattern but **without** hardcoded BTC price defaults.

### Phase 1 – Schema & BTC/USD Pricing Utility (2 days)

1.1 **Extend `agent_task_records`**
- Add columns (idempotent migrations):
  - `input_tokens INTEGER DEFAULT 0`.
  - `output_tokens INTEGER DEFAULT 0`.
  - `total_tokens INTEGER DEFAULT 0`.
  - `llm_model TEXT` and `llm_provider TEXT`.
  - `cost_usd_cents INTEGER DEFAULT 0`.
  - Optional: `task_output_summary TEXT` for punch-listed deliverables.
- Add targeted indexes if needed for report views (e.g., `(assignee_agent_id, completed_at)`).

1.2 **Create `agent_llm_credentials` table**
- Table to store encrypted LLM API key material per agent:
  - `agent_id UUID REFERENCES user_identities(id) ON DELETE CASCADE NOT NULL`.
  - `provider TEXT NOT NULL` (e.g., `openai`, `anthropic`).
  - `encrypted_api_key TEXT NOT NULL`, `iv TEXT NOT NULL`, `salt TEXT NOT NULL`.
  - Optional `key_prefix TEXT` for display (e.g., last 4 chars).
  - `is_active BOOLEAN DEFAULT TRUE`, timestamps, `UNIQUE(agent_id, provider)`.
- RLS: only auth user who created/owns the agent can access/update their credentials; service role for maintenance only.

1.3 **Implement BTC/USD pricing utility (blocking)**
- Location: shared server-only module (e.g., `netlify/functions/utils/btc-usd-pricing.ts`).
- Public interface (conceptual):
  - `getBtcUsdSpot(options?): Promise<{ priceUsd: number; sourceCount: number; usedCache: boolean; stale: boolean; timestamp: string; }>`.
  - `satsToUsdCents(sats: number): Promise<{ usdCents: number; priceUsd: number; }>`.
  - `btcToUsdCents(btc: number): Promise<{ usdCents: number; priceUsd: number; }>`.
- Providers (HTTP GET, no auth, no user data):
  - **Coinbase**: spot price endpoint for `BTC-USD`; parse numeric amount.
  - **Mempool.space**: `/api/v1/prices`; parse `USD` field.
  - **Bitfinex**: `ticker` for `tBTCUSD`; parse appropriate field for last/spot price per API spec.
- Behavior:
  - Run all three fetches **in parallel** with per-provider timeouts.
  - Collect only valid numeric prices; log failures as high-level warnings.
  - If ≥2 valid prices: compute **median**; if only 1–2: use simple average of valid values.
  - If **no** providers succeed:
    - Return a typed error (e.g., `PricingUnavailableError`) — **no** hardcoded BTC price.

1.4 **Caching & stale fallback**
- In-memory module-level cache:
  - Key: `"btc-usd:spot"`.
  - TTL: **60 seconds** for “fresh” values.
  - Grace window: additional ~4 minutes for “stale but usable” values.
- On request:
  - If fresh cache: return cached value.
  - If providers fail but cached value within grace window: return cached value with `stale=true` and log a warning.
  - If no cache and all providers fail: throw `PricingUnavailableError`.

1.5 **Tests / harness**
- Add unit tests or a small harness function:
  - Provider response parsing for each API (happy path + malformed responses).
  - Aggregation logic (median vs average) across combinations of valid/invalid values.
  - Caching behavior (within TTL vs stale vs no cache).
  - Error behavior when all providers fail.

### Phase 2 – LLM Credential Management (1.5–2 days)

2.1 **Netlify Function: `agent-llm-credential`**
- Endpoints (server-side only):
  - `POST /api/agents/llm-credential` – create/update encrypted API key for an agent.
  - `GET /api/agents/llm-credential` – fetch metadata (provider, key_prefix, is_active), **never** plaintext.
  - `DELETE /api/agents/llm-credential` – revoke credential.
- Patterns:
  - Follow `secure-storage.ts` and `secure-credential-manager` patterns for AES-256-GCM + PBKDF2.
  - Expect **client-side encrypted** payload; Netlify only stores ciphertext.
  - Use central Supabase client singleton and standard security headers / rate limiting.

2.2 **Client-side form for LLM credential input**
- New React component (e.g., `AgentLLMCredentialForm.tsx`):
  - Provider selector (initially OpenAI, Anthropic) + API key input.
  - Local encryption using existing encryption helpers (Noble V2 + PBKDF2) before sending to server.
  - Displays only obfuscated key prefix once stored.
- Integrate into existing agent creation / settings UI (e.g., `AgentsDashboard`), gated by feature flag.

### Phase 3 – LLM Proxy & Token/Cost Logging (3–4 days)

3.1 **LLM provider adapter implementation**
- Implement concrete adapters:
  - `OpenAIProvider` for ChatGPT Business.
  - Placeholder `AnthropicProvider` with same interface (can be fleshed out later).
- Responsibilities:
  - Construct provider-specific HTTP requests (no user identifiers).
  - Parse responses to extract:
    - `inputTokens`, `outputTokens`, `totalTokens`.
    - Model name, finish reasons, and any billing-related metadata provided.

3.2 **Netlify Function: `agent-llm-proxy`**
- Endpoint: `POST /api/agents/llm-proxy` (server-side only).
- Flow:
  1. Authenticate via `SecureSessionManager` and ensure caller is authorized for the given `agent_id`.
  2. Look up encrypted LLM credential for `(agent_id, provider)`; decrypt in memory.
  3. Forward request to selected adapter; obtain completion and token usage.
  4. Compute sats-based cost for this invocation (using existing cost model / `agent_payment_config`).
  5. Call BTC/USD pricing utility **once per invocation** to obtain `priceUsd` snapshot.
  6. Derive `cost_usd_cents` from `actual_cost_sats` using the shared FX rate snapshot.
  7. Log via `log_session_event()` RPC, including:
     - `p_tokens_used`, `p_input_tokens`, `p_output_tokens`.
     - `p_sats_cost` and derived `cost_usd_cents` (in event_data or separate metadata table).
     - `p_tool_name` / `p_tool_parameters` representing the LLM tool.

3.3 **Update task completion logic**
- Extend `netlify/functions/agents/task-complete.ts` to:
  - Populate `input_tokens`, `output_tokens`, `total_tokens`, `llm_model`, `llm_provider`, and `cost_usd_cents` on `agent_task_records`.
  - Ensure conversion uses **exact same FX snapshot** used when logging the underlying events (pass FX snapshot through invocation context, not recomputed later).

3.4 **Error handling & privacy**
- If BTC/USD pricing fails:
  - Continue with sats-based logging; set `cost_usd_cents = 0` or `NULL`.
  - Mark event metadata with `pricing_unavailable=true` for downstream analytics.
- Logging:
  - Log only high-level provider errors (HTTP status, provider name).
  - Never log API keys or full provider responses.

3.5 **Tests**
- Integration tests hitting `agent-llm-proxy` with mocked provider responses.
- Verify:
  - Correct propagation of token counts into `agent_session_events` and `agent_task_records`.
  - Correct `cost_usd_cents` derivation using BTC/USD utility.
  - Behavior when BTC pricing is stale/unavailable.

### Phase 4 – Reporting & Dashboards (2–3 days)

4.1 **Reporting views**
- Add views (idempotent migrations) for:
  - `agent_daily_report` – per-agent, per-day aggregates:
    - Tasks completed, total/avg `actual_cost_sats`, total/avg `cost_usd_cents`, total tokens.
  - `agent_weekly_report` – 7-day rollups per agent.
- Ensure RLS ensures only agent owners (and permitted federation roles later) can see their data.

4.2 **Netlify Function: `agent-performance-report`**
- Endpoint: `GET /api/agents/performance-report` with filters:
  - `agent_id`, `range` (e.g., `daily`, `weekly`), optional pagination.
- Queries:
  - Use `agent_task_records`, `session_cost_analysis`, `agent_daily_report`, `agent_weekly_report`.
- Response:
  - Structured JSON including punch-listed completed tasks, token usage, sats cost, and USD cost.

4.3 **Frontend: performance dashboard**
- New component (e.g., `AgentPerformanceReport.tsx`):
  - Date range selector (daily / weekly).
  - Tables for completed tasks with token usage and sats/USD costs.
  - Summary cards for total tokens, total sats, total USD (using stored cents, not live FX).
  - CSV export using existing CSV safety patterns (no formula injection).

4.4 **Enhance existing dashboards**
- Optionally extend `AgentSessionMonitor` and/or `AgentDelegationMonitoringDashboard` to:
  - Show high-level USD-equivalent cost per agent/session using precomputed `cost_usd_cents`.
  - Add filters by model/provider.

### Phase 5 – Integration, Hardening, and Future Federation Support (1–2 days)

5.1 **Feature flags & configuration**
- Add flags, e.g. `VITE_AGENT_LLM_PROXY_ENABLED`, `VITE_AGENT_BTC_PRICING_ENABLED`.
- Ensure server and client respect flags and fail closed by default.

5.2 **Load, caching, and rate limits**
- Confirm BTC/USD utility’s 60-second TTL suffices under expected load.
- Add rate limiting on `agent-llm-proxy` and `agent-llm-credential` using existing enhanced rate limiter.

5.3 **Security & privacy review**
- Verify no API keys, FX responses, or cost data leak to unauthorized clients.
- Confirm all external calls (Coinbase, Mempool, Bitfinex) are server-side only and contain no user identifiers.

5.4 **Federation-ready architecture notes**
- Document how:
  - `agent_llm_credentials` remains per-agent, but report views can be extended with federation-level grouping.
  - BTC/USD utility remains a shared, stateless module.
  - RLS and session-based access can later permit guardians/stewards to view multi-agent team reports.

5.5 **Documentation & handoff**
- Update developer docs to describe:
  - BTC/USD pricing utility behavior, error modes, and caching.
  - How to add new LLM providers via the adapter pattern.
  - How `cost_usd_cents` is computed and why it must always use the shared pricing module.

