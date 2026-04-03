# Phase 2.5: Agent Session Management & Observability Infrastructure

## Detailed Implementation Plan

**Timeline:** Weeks 16–22 (insert between existing Phase 2 and Phase 3)
**Objective:** Implement comprehensive session tracking and semantic observability for agent interactions, inspired by OpenClaw's architecture and context monitoring patterns, adapted for Satnam's privacy-first, Nostr-native, browser-only serverless architecture.

---

## Current State Analysis

### Existing Infrastructure Already in Place

| Asset                                    | Location                                               | Status                                    |
| ---------------------------------------- | ------------------------------------------------------ | ----------------------------------------- |
| `agent_sessions` table                   | `supabase/migrations/20260214_agent_sessions.sql`      | ✅ Created (4 tables, 3 functions, RLS)   |
| `agent_session_events` table             | Same migration                                         | ✅ Created with 12 event types            |
| `agent_session_metadata` table           | Same migration                                         | ✅ Created with expiry support            |
| `agent_session_performance` table        | Same migration                                         | ✅ Created with metrics                   |
| `create_agent_session()` function        | Same migration                                         | ⚠️ Duplicated (lines 215–235 AND 285–305) |
| `log_session_event()` function           | Same migration                                         | ⚠️ Duplicated (lines 237–264 AND 307–334) |
| `hibernate_inactive_sessions()` function | Same migration                                         | ⚠️ Duplicated (lines 267–282 AND 337–352) |
| `agent_operational_state` table          | `20260213_agent_operational_state.sql`                 | ✅ Created with heartbeat RPC             |
| `agent_task_records` table               | `20260213_agent_task_records.sql`                      | ✅ Created with cost tracking             |
| `AgentHealthDashboard` component         | `src/components/AgentHealthDashboard.tsx`              | ✅ Pattern to follow                      |
| `AgentsDashboard` component              | `src/components/AgentsDashboard.tsx`                   | ✅ Integration target                     |
| `SpanOfControlMeter` component           | `src/components/SpanOfControlMeter.tsx`                | ✅ Pattern to follow                      |
| `NoiseSessionManager`                    | `src/lib/noise/noise-session-manager.ts`               | ✅ Session lifecycle pattern reference    |
| `SecureSessionManager` (Netlify)         | `netlify/functions_active/security/session-manager.ts` | ✅ Auth session pattern reference         |
| `privacy-logger`                         | `utils/privacy-logger.js`                              | ✅ Logging pattern to follow              |
| Agent types                              | `types/agent-tokens.ts`                                | ✅ Type pattern to follow                 |

### Critical Issues Identified in Existing Migration

1. **Duplicate functions**: `create_agent_session`, `log_session_event`, and `hibernate_inactive_sessions` are each defined twice in `20260214_agent_sessions.sql` (lines 214–282 and 284–352). The second `CREATE OR REPLACE` silently overwrites the first, but this should be cleaned up.
2. **Missing `agent_session_events` RLS for agents' own events**: Only creator read and service role policies exist—agents cannot read/write their own session events directly.
3. **Missing `agent_session_metadata` and `agent_session_performance` agent-own RLS**: Only service role policies exist.
4. **Index `idx_session_events_agent` uses `auth.uid()` in WHERE clause**: This is invalid for a CREATE INDEX statement (auth.uid() is a session-level function, not available at DDL time).
5. **No `updated_at` trigger**: `agent_sessions.updated_at` exists but has no auto-update trigger.
6. **Missing observability views**: No summary/analytics views like the existing `agent_health_summary` view pattern.
7. **No cleanup/purge functions**: Only hibernation exists—no terminated session cleanup or event retention policy.

---

## Implementation Steps

### Step 1: Fix Existing Migration Issues

**Complexity:** Low | **Estimated Time:** 2–3 hours | **Dependencies:** None

**File:** `supabase/migrations/20260215_agent_sessions_fixes.sql`

**Granular Tasks:**
1.1. Remove duplicate function definitions (deduplicate `create_agent_session`, `log_session_event`, `hibernate_inactive_sessions`)
1.2. Drop and recreate invalid index `idx_session_events_agent` (remove `auth.uid()` from DDL)
1.3. Add missing RLS policies for agent_session_events (agent own read/write)
1.4. Add missing RLS policies for agent_session_metadata (agent own CRUD via session ownership)
1.5. Add missing RLS policies for agent_session_performance (agent own read via session ownership)
1.6. Add `updated_at` trigger function for `agent_sessions` table
1.7. Validate all policies are idempotent with `IF NOT EXISTS` / `DO $$ ... EXCEPTION` guards

**Integration Points:**

- References `agent_sessions.agent_id` for RLS ownership checks
- References `agent_profiles.created_by_user_id` for creator access patterns
- Follows existing RLS pattern from `agent_operational_state` (agent_ops_own_read/update)

---

### Step 2: Enhance Session Management Functions

**Complexity:** Medium | **Estimated Time:** 4–6 hours | **Dependencies:** Step 1

**File:** `supabase/migrations/20260215_agent_session_functions.sql`

**Granular Tasks:**
2.1. Enhance `create_agent_session()` to:

- Capture initial `operational_state_snapshot` from `agent_operational_state`
- Validate agent exists in `user_identities` with `is_agent = true`
- Set `auto_hibernate_after_minutes` from agent config
- Return full session record (not just session_id TEXT)

  2.2. Enhance `log_session_event()` to:

- Accept `input_tokens INTEGER DEFAULT 0`, `output_tokens INTEGER DEFAULT 0` parameters
- Accept `tool_name TEXT DEFAULT NULL`, `tool_parameters JSONB DEFAULT NULL`, `tool_result JSONB DEFAULT NULL`
- Auto-calculate `sats_cost` from token counts using agent's `cost_per_task_sats` or per-token rate from `agent_payment_config`
- Update `agent_session_performance` running totals atomically (total_tokens, total_sats_cost, tool_invocations)
- Update `agent_sessions.updated_at` and `total_messages`/`total_tokens` counters

  2.3. Add `pause_session(p_session_id UUID)` function:

- Set status to `'PAUSED'`, capture state snapshot in `agent_session_events`
- Log `STATE_SNAPSHOT` event with current conversation_context
- Validate caller owns the session (agent_id = auth.uid() or creator check)

  2.4. Add `resume_session(p_session_id UUID)` function:

- Set status to `'ACTIVE'`, restore from last state snapshot
- Log `INFO` event for session resume
- Update `last_activity_at` timestamp

  2.5. Add `terminate_session(p_session_id UUID, p_reason TEXT DEFAULT 'normal')` function:

- Set status to `'TERMINATED'`, set `ended_at = now()`
- Log final `STATE_SNAPSHOT` and `INFO` event with termination reason
- Calculate and store final performance metrics in `agent_session_performance`
- Update `agent_operational_state.active_task_count` (decrement)

  2.6. Add `update_session_context(p_session_id UUID, p_context JSONB)` function:

- Merge new context into `agent_sessions.conversation_context` (JSONB deep merge)
- Log `CONTEXT_REFRESH` event with diff summary
- Support state_snapshots append (for rollback capability)

  2.7. Add `switch_session_channel(p_session_id UUID, p_new_channel TEXT)` function:

- Validate p_new_channel is in `('nostr', 'telegram', 'web_ui', 'api', 'cli')`
- Log `CHANNEL_SWITCH` event with old/new channel
- Update `agent_sessions.channel` column
- Preserve conversation_context across channel switch

**Integration Points:**

- `log_session_event()` updates `agent_session_performance` (cross-table atomic update)
- `terminate_session()` updates `agent_operational_state` (cross-table)
- `switch_session_channel()` aligns with Nostr multi-channel support (NIP-17/59)
- All functions use `SECURITY DEFINER` with `search_path = public` for RLS bypass in trusted operations

---

### Step 3: Create Hibernation and Cleanup Functions

**Complexity:** Medium | **Estimated Time:** 3–4 hours | **Dependencies:** Step 2

**File:** `supabase/migrations/20260215_agent_session_cleanup.sql`

**Granular Tasks:**
3.1. Enhance `hibernate_inactive_sessions()`:

- Before hibernating, log `STATE_SNAPSHOT` event with full conversation_context
- Add `p_inactivity_minutes INTEGER DEFAULT 30` parameter (configurable)
- Return count of hibernated sessions for observability
- Skip sessions with `auto_hibernate_after_minutes = 0` (opt-out)

  3.2. Add `cleanup_terminated_sessions(p_retention_days INTEGER DEFAULT 30)`:

- Delete sessions with `status = 'TERMINATED'` and `ended_at < now() - interval '1 day' * p_retention_days`
- Cascade delete related events, metadata, and performance records
- Log cleanup action to a separate `system_audit_log` or return cleanup summary
- Use `SECURITY DEFINER` (service-role equivalent for scheduled operations)

  3.3. Add `purge_expired_metadata()`:

- Delete from `agent_session_metadata` where `expires_at < now()`
- Return count of purged records

  3.4. Add `archive_old_events(p_retention_days INTEGER DEFAULT 90)`:

- Move events older than retention period to `agent_session_events_archive` table (if archival needed)
- OR: Simply delete events older than retention period with summary logging
- Preserve `STATE_SNAPSHOT` events longer (configurable separate retention)

  3.5. Create Netlify scheduled function wrapper `netlify/functions_active/scheduled/session-cleanup.ts`:

- Call `cleanup_terminated_sessions()`, `purge_expired_metadata()`, `hibernate_inactive_sessions()` via Supabase RPC
- Use `schedule` config for daily execution
- Log results using privacy-logger patterns

**Integration Points:**

- Scheduled function uses `process.env.SUPABASE_SERVICE_ROLE_KEY` for elevated access
- Follows ESM pattern: `export const handler = async (event, context) => {...}`
- Cleanup results feed into observability dashboards (Step 10)

---

### Step 4: Add Session Observability Views and Analytics

**Complexity:** Medium | **Estimated Time:** 3–5 hours | **Dependencies:** Steps 1–3

**File:** `supabase/migrations/20260215_agent_session_views.sql`

**Granular Tasks:**
4.1. Create `active_sessions_summary` view:

- Join `agent_sessions` + `agent_operational_state` + latest `agent_session_performance`
- Columns: session_id, agent_name, status, channel, session_type, duration_minutes, total_messages, total_tokens, total_sats_cost, last_activity_ago, auto_hibernate_remaining_minutes
- Filter: `status IN ('ACTIVE', 'PAUSED')`
- RLS-compatible: filtered by auth.uid() matching agent creator or agent itself

  4.2. Create `session_cost_analysis` view:
  - Aggregate cost data per agent, per session_type, per channel
  - Columns: agent_id, agent_name, session_type, channel, session_count, total_sats_spent, avg_sats_per_session, avg_tokens_per_session, avg_duration_minutes
  - Group by agent_id, session_type, channel with rollup
  - Time-range filtering support (last 24h, 7d, 30d via function parameter or materialized views)

    4.3. Create `agent_session_history` view:

  - All sessions (any status) with performance summary joined
  - Columns: session_id, agent_name, status, channel, session_type, started_at, ended_at, duration_minutes, total_messages, total_tokens, total_sats_cost, event_count, error_count
  - Ordered by `started_at DESC`
  - Include `error_count` subquery from `agent_session_events WHERE event_type = 'ERROR'`

    4.4. Create `session_event_timeline` view:

  - Flat timeline of all events across active sessions
  - Columns: event_id, session_id, agent_name, event_type, event_data summary (truncated), sats_cost, input_tokens, output_tokens, tool_name, created_at
  - Ordered by `created_at DESC`
  - Limit to last 1000 events by default (via function wrapper if needed)

    4.5. Create `session_channel_distribution` view:

  - Count of sessions per channel, with active/total breakdown
  - Useful for monitoring multi-channel adoption

    4.6. Add RLS policies for all views:

  - Views inherit table-level RLS, but verify each view is accessible to authenticated users for their own agents
  - Test with `set role authenticated; set request.jwt.claims = '{"sub":"<test-uuid>"}';`

**Integration Points:**

- `active_sessions_summary` is the primary data source for `AgentSessionMonitor` component (Step 10)
- `session_cost_analysis` feeds into the Cost Tracking Dashboard (Step 12)
- `agent_session_history` supports the session history panel in the UI
- Pattern follows `agent_health_summary` view used by `AgentHealthDashboard`

---

### Step 5: Integrate with agent_operational_state and agent_task_records

**Complexity:** Medium | **Estimated Time:** 3–4 hours | **Dependencies:** Steps 2, 4

**File:** `supabase/migrations/20260215_agent_session_integration.sql`

**Granular Tasks:**
5.1. Add `current_session_id UUID REFERENCES agent_sessions(id)` to `agent_operational_state`:

- Nullable (agent may not have an active session)
- Updated by `create_agent_session()` and `terminate_session()`
- Enables direct join from operational state to current session

  5.2. Add `session_id UUID REFERENCES agent_sessions(id)` to `agent_task_records`:

- Nullable (tasks created before session system exist without session)
- Links tasks to the session in which they were created
- Enables per-session task analytics

  5.3. Create `link_task_to_session(p_task_id UUID, p_session_id UUID)` function:

- Updates `agent_task_records.session_id`
- Logs `TASK_ASSIGNMENT` event in `agent_session_events`
- Validates both task and session belong to same agent

  5.4. Create trigger on `agent_task_records` status changes:

- When task status → `'completed'` or `'failed'`, log `TASK_COMPLETION` event in session
- Include task duration, cost, and result summary in event data

  5.5. Update `agent_heartbeat()` function:

- Include `current_session_id` in heartbeat upsert
- If session is ACTIVE and heartbeat shows agent offline, auto-pause session

  5.6. Create `session_task_summary` view:

- Join sessions with their linked tasks
- Columns: session_id, task_count, completed_tasks, failed_tasks, total_task_cost_sats, avg_task_duration

**Integration Points:**

- Bidirectional link: sessions know their tasks, tasks know their session
- Heartbeat integration ensures session state reflects actual agent availability
- Task completion events feed into session cost tracking (Step 12)

---

### Step 6: Create TypeScript Interfaces

**Complexity:** Low–Medium | **Estimated Time:** 3–4 hours | **Dependencies:** Steps 1–5 (schema must be finalized)

**File:** `types/agent-sessions.ts`

**Granular Tasks:**
6.1. Define core session types:

```typescript
type SessionType = "INTERACTIVE" | "AUTONOMOUS" | "DELEGATED" | "SUPERVISED";
type SessionStatus = "ACTIVE" | "PAUSED" | "HIBERNATED" | "TERMINATED";
type SessionChannel = "nostr" | "telegram" | "web_ui" | "api" | "cli";
type SessionEventType =
  | "MESSAGE"
  | "TOOL_CALL"
  | "CONTEXT_REFRESH"
  | "INTERRUPTION"
  | "DELEGATION"
  | "TASK_ASSIGNMENT"
  | "TASK_COMPLETION"
  | "STATE_SNAPSHOT"
  | "CHANNEL_SWITCH"
  | "ERROR"
  | "WARNING"
  | "INFO";
```

6.2. Define database row interfaces (matching Supabase schema exactly):

- `AgentSession` — maps to `agent_sessions` table
- `AgentSessionEvent` — maps to `agent_session_events` table
- `AgentSessionMetadata` — maps to `agent_session_metadata` table
- `AgentSessionPerformance` — maps to `agent_session_performance` table

  6.3. Define view interfaces:

- `ActiveSessionSummary` — maps to `active_sessions_summary` view
- `SessionCostAnalysis` — maps to `session_cost_analysis` view
- `SessionHistory` — maps to `agent_session_history` view
- `SessionEventTimeline` — maps to `session_event_timeline` view

  6.4. Define API request/response types:

- `CreateSessionRequest` / `CreateSessionResponse`
- `LogEventRequest` / `LogEventResponse`
- `ManageSessionRequest` (pause/resume/terminate/switch-channel)
- `SessionQueryParams` (filters for history/analytics endpoints)

  6.5. Define component prop types:

- `AgentSessionMonitorProps`
- `SessionTimelineProps`
- `SessionCostChartProps`

**Integration Points:**

- Import pattern follows `types/agent-tokens.ts` conventions
- Types must align exactly with Supabase-generated types in `types/database.ts`
- Export from `types/index.ts` for barrel import support
- Used by Netlify functions (Step 7), service layer (Step 8), and React components (Step 10)

---

### Step 7: Add Session Management API Endpoints

**Complexity:** Medium–High | **Estimated Time:** 6–8 hours | **Dependencies:** Steps 5, 6

**Files:**

- `netlify/functions_active/agent-session-create.ts`
- `netlify/functions_active/agent-session-event.ts`
- `netlify/functions_active/agent-session-manage.ts`
- `netlify/functions_active/agent-session-query.ts`

**Granular Tasks:**
7.1. Create `agent-session-create.ts` endpoint (POST):

- Validate JWT from `Authorization` header using `SecureSessionManager`
- Parse `CreateSessionRequest` body with strict TypeScript validation
- Call `create_agent_session()` RPC via Supabase client
- Return `CreateSessionResponse` with full session object
- Error handling via `createErrorResponse()` from `utils/error-handler.ts`
- Security headers via `getSecurityHeaders()` from `utils/security-headers.ts`

  7.2. Create `agent-session-event.ts` endpoint (POST):

- Validate JWT + session ownership
- Parse `LogEventRequest` body (event_type, event_data, tokens, tool info)
- Call `log_session_event()` RPC
- Return updated session performance metrics
- Rate limiting: max 100 events/minute per session (prevent abuse)

  7.3. Create `agent-session-manage.ts` endpoint (POST):

- Action-based routing: `{ action: 'pause' | 'resume' | 'terminate' | 'switch_channel' | 'update_context' }`
- Validate JWT + session ownership for each action
- Call appropriate RPC function based on action
- Return updated session state
- Idempotent: pausing an already-paused session returns success (no-op)

  7.4. Create `agent-session-query.ts` endpoint (GET):

- Query parameter routing: `?view=active_summary|cost_analysis|history|timeline|task_summary`
- Support pagination: `?page=1&limit=50`
- Support filtering: `?agent_id=<uuid>&channel=nostr&status=ACTIVE`
- Return appropriate view data based on query
- Cache-Control headers for analytics views (short TTL)

  7.5. Add request validation middleware pattern:

- Reusable `validateSessionOwnership(sessionId, userId)` helper
- Reusable `parseAndValidateBody<T>(event, schema)` helper
- Input sanitization for JSONB fields (prevent injection via event_data)

**Integration Points:**

- All endpoints use ESM: `export const handler = async (event, context) => {...}`
- Import types from `../../types/agent-sessions` (with `.js` extension in imports)
- Use `process.env.SUPABASE_URL` and `process.env.SUPABASE_SERVICE_ROLE_KEY`
- Follow error handling pattern from existing `netlify/functions_active/utils/error-handler.ts`
- Follow security headers pattern from existing `netlify/functions_active/utils/security-headers.ts`

---

### Step 8: Implement Session Lifecycle Management Service

**Complexity:** High | **Estimated Time:** 8–10 hours | **Dependencies:** Steps 6, 7

**File:** `src/services/agent-session-manager.ts`

**Granular Tasks:**
8.1. Create `AgentSessionManager` singleton class:

- `getInstance()` / `destroy()` pattern (follows `NoiseSessionManager`)
- Holds reference to Supabase client from `src/lib/supabase.ts` (singleton)
- Manages local session state cache for current user's agent sessions
- Provides reactive session updates via callback/event pattern

  8.2. Implement session lifecycle methods:

- `createSession(agentId, channel, sessionType, initialContext?)` → calls API endpoint
- `pauseSession(sessionId)` → calls manage endpoint with action='pause'
- `resumeSession(sessionId)` → calls manage endpoint with action='resume'
- `terminateSession(sessionId, reason?)` → calls manage endpoint with action='terminate'
- `switchChannel(sessionId, newChannel)` → calls manage endpoint with action='switch_channel'
- `updateContext(sessionId, context)` → calls manage endpoint with action='update_context'

  8.3. Implement event logging methods:

- `logMessage(sessionId, eventData, tokens?)` → calls event endpoint
- `logToolCall(sessionId, toolName, params, result, tokens?)` → calls event endpoint
- `logError(sessionId, error, context?)` → calls event endpoint with type='ERROR'
- `logWarning(sessionId, message, context?)` → calls event endpoint with type='WARNING'
- Batch event support: queue events and flush periodically (100ms debounce) to reduce API calls

  8.4. Implement query methods:

- `getActiveSessions()` → calls query endpoint with view=active_summary
- `getSessionHistory(filters?)` → calls query endpoint with view=history
- `getSessionTimeline(sessionId)` → calls query endpoint with view=timeline
- `getCostAnalysis(filters?)` → calls query endpoint with view=cost_analysis
- Local caching with configurable TTL (30s for active sessions, 5min for history)

  8.5. Implement Supabase Realtime subscriptions:

- Subscribe to `agent_sessions` changes for current user's agents
- Subscribe to `agent_session_events` inserts for active sessions
- Auto-update local cache on realtime events
- Reconnection handling with exponential backoff

  8.6. Implement auto-hibernation client-side detection:

- Track last user interaction per session
- Warn user before auto-hibernate threshold (toast notification)
- Allow user to extend session ("Keep Alive" action)

**Integration Points:**

- Uses `supabase` singleton from `src/lib/supabase.ts` (no duplicate clients)
- Follows `NoiseSessionManager` singleton + lifecycle pattern
- Privacy logger integration for all operations (Step 9)
- Consumed by `AgentSessionMonitor` component (Step 10)
- Realtime subscriptions follow existing Supabase realtime config pattern

---

### Step 9: Add Comprehensive Logging with Privacy-Logger Patterns

**Complexity:** Low–Medium | **Estimated Time:** 2–3 hours | **Dependencies:** Steps 7, 8

**Files:**

- `utils/session-logger.ts` (new, extends privacy-logger patterns)
- Updates to `utils/privacy-logger.js` (add session-specific sensitive fields)

**Granular Tasks:**
9.1. Extend privacy-logger sensitive field list:

- Add `session_id`, `conversation_context`, `state_snapshots`, `tool_parameters`, `tool_result` to redaction list
- Add `event_data` as a deep-redaction field (redact nested sensitive values)
- Ensure `agent_id` is treated as potentially sensitive (hashed UUID)

  9.2. Create `session-logger.ts` wrapper:

- `logSessionCreate(session)` — logs session creation with redacted context
- `logSessionEvent(event)` — logs event with redacted event_data
- `logSessionTransition(sessionId, fromStatus, toStatus)` — logs state transitions
- `logSessionError(sessionId, error, context)` — logs errors with full stack but redacted user data
- `logSessionCleanup(summary)` — logs cleanup operation results

  9.3. Add structured log format for observability:

- Include `timestamp`, `level`, `component: 'agent-session'`, `session_id` (redacted), `agent_id` (redacted)
- Support log levels: DEBUG, INFO, WARN, ERROR
- JSON-structured output for potential log aggregation

  9.4. Add performance timing logs:

- Log RPC call duration for each session operation
- Log Supabase query duration for analytics views
- Warn on slow operations (>500ms for RPC, >1s for views)

**Integration Points:**

- Imported by Netlify functions (Step 7) and service layer (Step 8)
- Follows existing `utils/privacy-logger.js` whitelist pattern
- Does NOT use Node.js-specific APIs (browser-compatible for service layer)
- Uses `console.log`/`console.warn`/`console.error` (Netlify captures these)

---

### Step 10: Create AgentSessionMonitor React Component

**Complexity:** High | **Estimated Time:** 8–12 hours | **Dependencies:** Steps 6, 8

**Files:**

- `src/components/AgentSessionMonitor.tsx` (main component)
- Update `src/components/AgentsDashboard.tsx` (integration)

**Granular Tasks:**
10.1. Create `AgentSessionMonitor` component structure:

- Follows `AgentHealthDashboard` patterns (useState, useEffect, polling + realtime)
- Uses `AgentSessionManager.getInstance()` for data access
- Tabs: "Active Sessions" | "Session History" | "Cost Analytics"
- Auto-refresh: 10s polling for active sessions, realtime for events

  10.2. Implement "Active Sessions" tab:

- Table/card grid showing all active/paused sessions
- Columns: Agent Name, Status (color-coded), Channel (icon), Type, Duration, Messages, Tokens, Cost (sats), Last Activity
- Status indicators: 🟢 ACTIVE, ⏸️ PAUSED, 💤 HIBERNATED, ⏹️ TERMINATED
- Channel icons: 🌐 web_ui, ⚡ nostr, 📱 telegram, 🔌 api, 💻 cli
- Action buttons per session: Pause/Resume, Terminate, Switch Channel
- Click-to-expand: shows recent event timeline for that session

  10.3. Implement session event timeline (expanded row or side panel):

- Chronological list of events for selected session
- Color-coded by event_type (MESSAGE=blue, TOOL_CALL=purple, ERROR=red, etc.)
- Show: timestamp, event_type badge, truncated event_data, sats_cost, token count
- Auto-scroll to latest event
- Filter by event_type

  10.4. Implement "Session History" tab:

- Paginated table of all sessions (any status)
- Date range filter, agent filter, channel filter, status filter
- Sort by: started_at, duration, cost, message count
- Click to view full session detail with event timeline

  10.5. Implement "Cost Analytics" tab:

- Summary cards: Total Sats Spent (24h/7d/30d), Avg Cost/Session, Most Active Agent
- Bar chart: cost by agent (using simple CSS bars, no chart library dependency)
- Channel distribution: pie-chart-like breakdown (CSS-only)
- Session type distribution

  10.6. Integrate into `AgentsDashboard.tsx`:

- Add `<AgentSessionMonitor />` below existing `<AgentHealthDashboard />`
- Lazy-load with `React.lazy()` to avoid increasing initial bundle size
- Feature gate: only render if user has agents (check via existing auth context)

**Integration Points:**

- Uses `supabase` singleton from `../lib/supabase` (follows AgentHealthDashboard pattern)
- Uses `AgentSessionManager` from `../services/agent-session-manager` for lifecycle actions
- Uses types from `../../types/agent-sessions`
- Status color/emoji pattern follows `AgentHealthDashboard.getStatusColor()` / `getStatusEmoji()`
- Tailwind CSS classes for styling (consistent with existing components)
- No external chart libraries — CSS-only visualizations to minimize chunk size

---

### Step 11: Multi-Channel Nostr Context Sync

**Complexity:** High | **Estimated Time:** 6–8 hours | **Dependencies:** Steps 2, 7, 8

**Files:**

- `src/services/session-channel-sync.ts`
- `supabase/migrations/20260215_agent_session_nostr.sql`

**Granular Tasks:**
11.1. Create `SessionChannelSync` service:

- Manages context continuity when sessions switch between channels
- Serializes conversation_context to Nostr event format (NIP-17/59 gift-wrapped)
- Deserializes Nostr events back to session context on channel switch
- Handles multi-device scenario: same session, different devices

  11.2. Implement NIP-59 gift-wrapped context transfer:

- When switching FROM nostr channel: encrypt and store context as gift-wrapped event
- When switching TO nostr channel: decrypt and restore context from gift-wrapped event
- Use existing Nostr key infrastructure (NIP-07 browser extension primary)
- Context includes: conversation history, active tool states, pending operations

  11.3. Add `agent_session_channel_history` table:

- Track channel switches with timestamps for audit trail
- Columns: id, session_id, from_channel, to_channel, switched_at, context_snapshot_event_id
- Foreign key to `agent_session_events` for the CHANNEL_SWITCH event

  11.4. Implement context merge conflict resolution:

- When session is accessed from multiple channels simultaneously (edge case)
- Last-write-wins with conflict detection logging
- Alert user if concurrent access detected

  11.5. Add channel-specific metadata:

- Nostr: relay URLs, event IDs for message thread continuity
- Telegram: chat_id, last_message_id for thread continuity
- Web UI: tab/window identifier for multi-tab detection
- API/CLI: client identifier, API version

**Integration Points:**

- Uses existing Nostr infrastructure from `src/lib/noise/` and NIP-07 patterns
- Gift-wrapping follows NIP-59 implementation patterns already in codebase
- Channel history feeds into session event timeline (Step 10)
- Multi-device sync requires Supabase Realtime (configured in Step 8.5)

---

### Step 12: Cost Tracking Integration with Lightning/Sats

**Complexity:** Medium–High | **Estimated Time:** 5–7 hours | **Dependencies:** Steps 2, 5, 7, 8

**Files:**

- `src/services/session-cost-tracker.ts`
- `supabase/migrations/20260215_agent_session_cost.sql`

**Granular Tasks:**
12.1. Create `SessionCostTracker` service:

- Real-time cost accumulation per session
- Budget threshold alerts (warn at 80%, block at 100% of allocated budget)
- Cost rate calculation: sats/minute, sats/message, sats/token
- Integration with `agent_payment_config` for per-agent rate limits

  12.2. Implement per-event cost calculation:

- MESSAGE events: base cost from `agent_payment_config.cost_per_task_sats`
- TOOL_CALL events: variable cost based on tool type (lookup from tool registry)
- Token-based cost: `(input_tokens * input_rate + output_tokens * output_rate)` in sats
- Rounding: always round up to nearest sat (ceil)

  12.3. Add budget enforcement in session functions:

- `log_session_event()` checks cumulative session cost against budget limit
- If budget exceeded: auto-pause session, log WARNING event, notify user
- `agent_sessions.budget_limit_sats` column (nullable, NULL = unlimited)
- `agent_sessions.budget_consumed_sats` running total

  12.4. Create cost alerts via Supabase Realtime:

- Subscribe to `agent_session_performance` updates
- Trigger toast notification when 80% budget threshold crossed
- Trigger session pause when 100% budget threshold crossed

  12.5. Add `session_cost_breakdown` view:

- Per-session breakdown: cost by event_type, cost by tool, cost by time period
- Enables detailed cost analysis in the Cost Analytics tab (Step 10.5)

  12.6. Integration with sig4sats workflow:

- When session cost crosses configurable threshold, auto-create credit envelope request
- Link to existing `agent_task_records.sig4sats_event_id` for payment attestation
- Ensure cost tracking aligns with `agent_task_records.cost_sats`

**Integration Points:**

- `SessionCostTracker` is used by `AgentSessionManager` (Step 8) on every event log
- Budget alerts feed into `AgentSessionMonitor` UI (Step 10)
- Cost calculations align with existing `agent_payment_config` and `agent_nwc_connections`
- Sig4sats integration bridges to Phase 3 (Credit Envelopes & Work History)

---

### Step 13: Testing and Validation Plan

**Complexity:** Medium–High | **Estimated Time:** 8–12 hours | **Dependencies:** All previous steps

**Granular Tasks:**
13.1. Database migration testing:

- Execute all new migrations against clean Supabase instance
- Verify idempotency: run each migration twice without errors
- Verify RLS: test as authenticated user, anon, service_role
- Verify functions: call each RPC with valid/invalid parameters
- Verify views: query each view and validate column types and data

  13.2. RLS policy testing:

- Test `agent_sessions` CRUD as session owner (agent), creator (human), and unauthorized user
- Test `agent_session_events` read/write as session agent, session creator, and unauthorized
- Test `agent_session_metadata` CRUD with session ownership validation
- Test `agent_session_performance` read access patterns
- Verify service_role bypass works for cleanup functions

  13.3. API endpoint testing:

- Test `agent-session-create` with valid JWT, invalid JWT, missing JWT
- Test `agent-session-event` with all 12 event types
- Test `agent-session-manage` with all 5 actions (pause, resume, terminate, switch_channel, update_context)
- Test `agent-session-query` with all view types and filter combinations
- Test rate limiting on event endpoint
- Test CORS and security headers

  13.4. Service layer testing:

- Unit test `AgentSessionManager` lifecycle methods (mock Supabase)
- Test Supabase Realtime subscription setup/teardown
- Test batch event queuing and flush behavior
- Test local cache TTL and invalidation
- Test auto-hibernation detection

  13.5. Component testing:

- Render `AgentSessionMonitor` with mock session data
- Test tab switching (Active Sessions / History / Cost Analytics)
- Test session action buttons (pause, resume, terminate)
- Test event timeline rendering with various event types
- Test empty states (no sessions, no events)
- Test loading states and error handling

  13.6. Integration testing:

- Full flow: create session → log events → pause → resume → terminate
- Multi-channel flow: create on web_ui → switch to nostr → switch back
- Cost tracking flow: log events → verify cost accumulation → budget alert → auto-pause
- Task linking flow: create session → assign task → complete task → verify session event
- Cleanup flow: terminate session → run cleanup → verify deletion
- Concurrent session testing: multiple active sessions for same agent

  13.7. Performance testing:

- Bulk event logging: 1000 events in rapid succession
- View query performance with 100+ sessions and 10k+ events
- Realtime subscription performance with frequent updates
- Identify need for materialized views or additional indexes

---

### Module 2.5.2: Semantic Observability Layer (Weeks 19–21)

**Objective:** Implement semantic drift detection and agent behavior anomaly monitoring, inspired by OpenClaw's Context Observability Agent patterns, while preserving Satnam's privacy-first semantics.

**File:** `supabase/migrations/20260220_semantic_observability.sql`

**Components:**

1. **Database Schema**

- `semantic_drift_monitors` table — tracks monitored concepts and their baseline definitions
- `semantic_drift_events` table — logs detected semantic drift with similarity metrics and impact assessment
- `agent_behavior_anomalies` table — tracks deviations from baseline agent behavior patterns
- `check_semantic_drift()` function — RPC entrypoint for drift detection (implementation intentionally left as TODO)

```sql
-- Semantic observability tracking
CREATE TABLE IF NOT EXISTS semantic_drift_monitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_name TEXT UNIQUE NOT NULL,
  entity_type TEXT NOT NULL, -- 'AGENT', 'TASK', 'RELATIONSHIP', 'FEDERATION'

  -- Monitored concepts
  tracked_concepts JSONB NOT NULL, -- {"user": "person with account", "task": "unit of work"}
  concept_relationships JSONB, -- {"user": ["creates", "owns"], "task": ["assigned_to", "completed_by"]}

  -- Drift detection config
  check_frequency_seconds INTEGER DEFAULT 3600,
  drift_threshold NUMERIC DEFAULT 0.15, -- Cosine similarity threshold

  -- Alert configuration
  alert_on_drift BOOLEAN DEFAULT TRUE,
  alert_channels TEXT[] DEFAULT ARRAY['nostr_dm'],

  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Detected semantic drift events
CREATE TABLE IF NOT EXISTS semantic_drift_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_id UUID REFERENCES semantic_drift_monitors(id) NOT NULL,

  -- Drift details
  concept_name TEXT NOT NULL,
  baseline_definition TEXT NOT NULL,
  current_definition TEXT NOT NULL,

  -- Similarity metrics
  semantic_similarity NUMERIC, -- 0.0 to 1.0
  drift_magnitude NUMERIC, -- How far from baseline

  -- Context
  affected_agents UUID[], -- Agent IDs impacted
  affected_systems TEXT[], -- 'task_delegation', 'reputation_scoring', etc.

  -- Impact assessment
  estimated_impact TEXT CHECK (estimated_impact IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  recommended_action TEXT,

  -- Resolution
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_by UUID REFERENCES user_identities(id),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,

  detected_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_drift_monitor ON semantic_drift_events(monitor_id, detected_at DESC);
CREATE INDEX idx_drift_unresolved ON semantic_drift_events(acknowledged) WHERE NOT acknowledged;

-- Function to check semantic drift
CREATE OR REPLACE FUNCTION check_semantic_drift(
  p_monitor_id UUID
) RETURNS INTEGER AS $$
DECLARE
  v_monitor RECORD;
  v_drift_count INTEGER := 0;
BEGIN
  SELECT * INTO v_monitor
  FROM semantic_drift_monitors
  WHERE id = p_monitor_id AND is_active = TRUE;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- TODO: Implement actual drift detection logic
  -- This would:
  -- 1. Extract current definitions from agent profiles, task specs, etc.
  -- 2. Compare embeddings/semantic similarity with baseline
  -- 3. Insert drift events if threshold exceeded

  RAISE NOTICE 'Semantic drift check for monitor: %', v_monitor.monitor_name;

  RETURN v_drift_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Agent behavior anomaly detection
CREATE TABLE IF NOT EXISTS agent_behavior_anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES user_identities(id) NOT NULL,

  -- Anomaly type
  anomaly_type TEXT NOT NULL, -- 'TASK_PATTERN', 'COST_SPIKE', 'ERROR_RATE', 'DELEGATION_PATTERN'
  severity TEXT CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),

  -- Baseline vs actual
  baseline_metric NUMERIC,
  actual_metric NUMERIC,
  deviation_percent NUMERIC,

  -- Context
  time_window_start TIMESTAMPTZ,
  time_window_end TIMESTAMPTZ,
  related_sessions TEXT[], -- session_ids
  related_tasks UUID[],

  -- Analysis
  anomaly_description TEXT,
  potential_causes TEXT[],
  recommended_investigation TEXT,

  -- Status
  auto_resolved BOOLEAN DEFAULT FALSE,
  human_reviewed BOOLEAN DEFAULT FALSE,
  reviewed_by UUID REFERENCES user_identities(id),
  review_notes TEXT,

  detected_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_anomalies_agent ON agent_behavior_anomalies(agent_id, detected_at DESC);
CREATE INDEX idx_anomalies_unreviewed ON agent_behavior_anomalies(human_reviewed) WHERE NOT human_reviewed;
```

2. **React Component** — `src/components/AgentObservabilityDashboard.tsx`

- Semantic Drift Detection panel showing unacknowledged drift events
- Behavior Anomalies panel showing agent deviations from baseline
- System Health Metrics cards (active sessions, avg response time, error rate)
- Auto-refresh every 30 seconds
- Severity-based color coding (CRITICAL=red, HIGH=orange, MEDIUM=yellow, LOW=blue)

```typescript
// components/AgentObservabilityDashboard.tsx
import React, { useEffect, useState } from 'react';

interface DriftEvent {
  id: string;
  concept_name: string;
  semantic_similarity: number;
  estimated_impact: string;
  detected_at: string;
  acknowledged: boolean;
}

interface BehaviorAnomaly {
  id: string;
  agent_name: string;
  anomaly_type: string;
  severity: string;
  deviation_percent: number;
  anomaly_description: string;
  detected_at: string;
}

export function AgentObservabilityDashboard() {
  const [driftEvents, setDriftEvents] = useState<DriftEvent[]>([]);
  const [anomalies, setAnomalies] = useState<BehaviorAnomaly[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchObservabilityData();
    const interval = setInterval(fetchObservabilityData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  async function fetchObservabilityData() {
    // Fetch drift events and anomalies
    // TODO: Implement actual data fetching
    setLoading(false);
  }

  function getSeverityColor(severity: string): string {
    switch (severity) {
      case 'CRITICAL': return 'bg-red-100 border-red-300 text-red-800';
      case 'HIGH': return 'bg-orange-100 border-orange-300 text-orange-800';
      case 'MEDIUM': return 'bg-yellow-100 border-yellow-300 text-yellow-800';
      case 'LOW': return 'bg-blue-100 border-blue-300 text-blue-800';
      default: return 'bg-gray-100 border-gray-300 text-gray-800';
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Agent Observability</h1>

      {/* Semantic Drift Alerts */}
      <div className="border rounded-lg p-4">
        <h2 className="text-lg font-semibold mb-3">🔍 Semantic Drift Detection</h2>

        {driftEvents.length === 0 ? (
          <div className="text-gray-500 text-sm">No semantic drift detected</div>
        ) : (
          <div className="space-y-2">
            {driftEvents.map(event => (
              <div key={event.id} className={`border rounded p-3 ${getSeverityColor(event.estimated_impact)}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium">{event.concept_name}</div>
                    <div className="text-sm">
                      Similarity: {(event.semantic_similarity * 100).toFixed(1)}%
                    </div>
                  </div>
                  <span className="text-xs">
                    {new Date(event.detected_at).toLocaleDateString()}
                  </span>
                </div>

                {!event.acknowledged && (
                  <button className="mt-2 text-xs bg-white px-2 py-1 rounded hover:bg-gray-50">
                    Acknowledge & Investigate
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Behavior Anomalies */}
      <div className="border rounded-lg p-4">
        <h2 className="text-lg font-semibold mb-3">⚠️ Behavior Anomalies</h2>

        {anomalies.length === 0 ? (
          <div className="text-gray-500 text-sm">No anomalies detected</div>
        ) : (
          <div className="space-y-2">
            {anomalies.map(anomaly => (
              <div key={anomaly.id} className={`border rounded p-3 ${getSeverityColor(anomaly.severity)}`}>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{anomaly.agent_name}</span>
                      <span className="text-xs px-2 py-0.5 bg-white rounded">
                        {anomaly.anomaly_type}
                      </span>
                    </div>
                    <div className="text-sm mt-1">{anomaly.anomaly_description}</div>
                    <div className="text-xs text-gray-600 mt-1">
                      Deviation: {anomaly.deviation_percent.toFixed(1)}% from baseline
                    </div>
                  </div>
                  <span className="text-xs whitespace-nowrap ml-2">
                    {new Date(anomaly.detected_at).toLocaleDateString()}
                  </span>
                </div>

                <button className="mt-2 text-xs bg-white px-2 py-1 rounded hover:bg-gray-50">
                  Investigate
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* System Health Metrics */}
      <div className="grid grid-cols-3 gap-4">
        <div className="border rounded-lg p-4">
          <div className="text-sm text-gray-600">Active Sessions</div>
          <div className="text-3xl font-bold">12</div>
          <div className="text-xs text-green-600">+3 from yesterday</div>
        </div>
        <div className="border rounded-lg p-4">
          <div className="text-sm text-gray-600">Avg Response Time</div>
          <div className="text-3xl font-bold">1.2s</div>
          <div className="text-xs text-green-600">-0.3s improvement</div>
        </div>
        <div className="border rounded-lg p-4">
          <div className="text-sm text-gray-600">Error Rate</div>
          <div className="text-3xl font-bold">0.8%</div>
          <div className="text-xs text-yellow-600">+0.2% from baseline</div>
        </div>
      </div>
    </div>
  );
}
```

3. **Integration Points**

- Uses existing `supabase` singleton from `src/lib/supabase`
- Integrates alongside `AgentSessionMonitor` (Step 10) in higher-level dashboards
- Follows Tailwind CSS styling patterns from existing components
- Uses TypeScript interfaces for type safety (extending `agent-sessions` types where appropriate)
- `check_semantic_drift()` implementation remains a TODO pending embedding/similarity infra

---

### Module 2.5.3: Agent CLI Integration (Week 22)

**Objective:** Provide a simple command-line interface for interacting with agents, mirroring OpenClaw CLI patterns while reusing Satnam's existing API and authentication infrastructure.

**File:** `cli/satnam-agent` (Node.js executable, implemented as ESM in this codebase)

**Components:**

1. **CLI Executable**

- `run` command — execute agent tasks with options for agent ID, message, optional session resumption, and delivery channel (`nostr`/`telegram`/`email`)
- `status` command — check agent health status, load percentage, and active task count
- `sessions` command — list agent sessions with filtering by agent ID and active status
- Support for both synchronous (`--deliver` flag) and asynchronous operations

```bash
#!/usr/bin/env node

const { Command } = require('commander');
const program = new Command();

program
  .name('satnam-agent')
  .description('Satnam Agent CLI - Interact with AI agents via command line')
  .version('1.0.0');

program
  .command('run')
  .description('Run an agent task')
  .option('-a, --agent <id>', 'Agent ID or name')
  .option('-m, --message <text>', 'Message to send')
  .option('-s, --session <id>', 'Resume existing session')
  .option('--deliver', 'Wait for completion and deliver result')
  .option('--channel <type>', 'Delivery channel (nostr, telegram, email)', 'nostr')
  .action(async (options) => {
    console.log('Running agent task...');
    console.log('Agent:', options.agent);
    console.log('Message:', options.message);

    // TODO: Implement actual API call to Satnam
    const result = await callSatnamAPI({
      endpoint: '/agent/run',
      agent: options.agent,
      message: options.message,
      session_id: options.session,
      deliver: options.deliver,
      channel: options.channel
    });

    if (options.deliver) {
      console.log('\nResult:', result.output);
    } else {
      console.log('\nTask submitted. Session ID:', result.session_id);
    }
  });

program
  .command('status')
  .description('Check agent status')
  .option('-a, --agent <id>', 'Agent ID or name')
  .option('-s, --session <id>', 'Session ID')
  .action(async (options) => {
    console.log('Checking agent status...');

    // TODO: Implement status check
    const status = await callSatnamAPI({
      endpoint: '/agent/status',
      agent: options.agent,
      session_id: options.session
    });

    console.log('\nAgent:', status.agent_name);
    console.log('Status:', status.health_status);
    console.log('Load:', status.current_load + '%');
    console.log('Active tasks:', status.active_task_count);
  });

program
  .command('sessions')
  .description('List agent sessions')
  .option('-a, --agent <id>', 'Filter by agent')
  .option('--active', 'Show only active sessions')
  .action(async (options) => {
    console.log('Fetching sessions...\n');

    // TODO: Implement session listing
    const sessions = await callSatnamAPI({
      endpoint: '/agent/sessions',
      agent: options.agent,
      active_only: options.active
    });

    sessions.forEach(s => {
      console.log(`${s.session_id} - ${s.agent_name} [${s.status}]`);
      console.log(`  ${s.total_messages} messages, ${s.sats_spent} sats spent`);
      console.log('');
    });
  });

async function callSatnamAPI(params) {
  // TODO: Implement actual API client
  // This would use Nostr signing or NIP-98 auth
  return {
    session_id: 'sess_demo123',
    output: 'Mock result',
    agent_name: 'DemoAgent'
  };
}

program.parse();
```

2. **API Client Integration**

- Implement `callSatnamAPI()` helper using ESM (`import`/`export`) in the actual codebase
- Use Nostr signing or NIP-98 authentication for API calls (aligned with existing auth patterns)
- Connect to existing Netlify Functions endpoints from Step 7 (`agent-session-create`, `agent-session-manage`, `agent-session-query`)
- Handle session management and result delivery via the same session APIs used by the web UI

3. **Integration Points**

- CLI uses the same API surface as browser clients (Netlify Functions from Step 7)
- Follows ESM module patterns in implementation (this example uses CommonJS and must be converted when implemented)
- Integrates with multi-channel delivery system from Step 11 (delivery channel option)
- Reuses existing authentication infrastructure (JWT + Nostr/NIP-98 where applicable)

---

## Dependency Graph

```
Step 1 (Fix Migration)
  ↓
Step 2 (Enhanced Functions)
  ↓
Step 3 (Cleanup Functions)
  ↓
Step 4 (Views & Analytics)
  ↓
Step 6 (TypeScript Interfaces)

Step 6 ──→ Step 7 (API Endpoints) ──→ Step 8 (Service Layer) ──→ Step 10 (React UI)
   │               │                         │
   └──────────────→ Step 9 (Logging)         ├──────────────→ Step 11 (Nostr Sync) ──→ Step 12 (Cost Tracking)
                   │                         │
                   └────────────────────────→ Module 2.5.3 (Agent CLI Integration)

Step 8 & Step 10 ───────────────────────────→ Module 2.5.2 (Semantic Observability Layer)

Module 2.5.2, Step 12 ──────────────────────→ Step 13 (Testing & Validation)
```

Additional Module Dependencies:

- **Module 2.5.2 (Semantic Observability Layer)** depends on **Step 8 (Service Layer)** and **Step 10 (React UI)**.
- **Module 2.5.3 (Agent CLI Integration)** depends on **Step 7 (API Endpoints)** and **Step 8 (Service Layer)**.

---

## Estimated Total Effort

| Step      | Description                                 | Hours            | Complexity  |
| --------- | ------------------------------------------- | ---------------- | ----------- |
| 1         | Fix Existing Migration Issues               | 2–3              | Low         |
| 2         | Enhance Session Management Functions        | 4–6              | Medium      |
| 3         | Hibernation and Cleanup Functions           | 3–4              | Medium      |
| 4         | Session Observability Views                 | 3–5              | Medium      |
| 5         | Integration with Operational State & Tasks  | 3–4              | Medium      |
| 6         | TypeScript Interfaces                       | 3–4              | Low–Medium  |
| 7         | API Endpoints                               | 6–8              | Medium–High |
| 8         | Session Lifecycle Service                   | 8–10             | High        |
| 9         | Privacy-Logger Integration                  | 2–3              | Low–Medium  |
| 10        | AgentSessionMonitor Component               | 8–12             | High        |
| 11        | Multi-Channel Nostr Sync                    | 6–8              | High        |
| 12        | Cost Tracking Integration                   | 5–7              | Medium–High |
| 13        | Testing and Validation                      | 8–12             | Medium–High |
| 2.5.2     | Semantic Observability Layer (Module 2.5.2) | 10–14            | Medium–High |
| 2.5.3     | Agent CLI Integration (Module 2.5.3)        | 6–8              | Medium      |
| **Total** |                                             | **77–108 hours** |             |

---

## Key Architectural Decisions

1. **Privacy-First Session IDs**: All session IDs use `sess_` prefix + Web Crypto `getRandomValues()` — no UUIDs that could be correlated across systems.
2. **SECURITY DEFINER Functions**: All session RPC functions use `SECURITY DEFINER` with explicit `search_path = public` to bypass RLS safely while validating ownership in function body.
3. **No External Chart Libraries**: Cost analytics in the UI use CSS-only visualizations to avoid adding chunk size and external dependencies.
4. **Singleton Services**: `AgentSessionManager` and `SessionCostTracker` follow the established singleton pattern to prevent duplicate Supabase clients and subscriptions.
5. **Batch Event Logging**: Client-side event batching (100ms debounce) reduces API call volume while maintaining near-real-time observability.
6. **Channel-Agnostic Context**: `conversation_context` JSONB is channel-agnostic by design; channel-specific metadata is stored separately to enable seamless switching.
7. **Idempotent Migrations**: All SQL migrations use `IF NOT EXISTS`, `CREATE OR REPLACE`, and `DO $$ ... EXCEPTION` guards for safe re-execution.
8. **ESM-Only Netlify Functions**: All API endpoints use pure ESM with `export const handler`, `import` statements, and `.js` extensions in relative imports.

---

# Phase 2.6: Security & Sentinel Integration

**Timeline:** Weeks 23–28 (insert after Phase 2.5)
**Objective:** Implement security monitoring, task orchestration guarantees, and skills platform infrastructure by combining OpenClaw's flexibility, CodeSentinel's reliability, and Sentinel's runtime security monitoring — while preserving Satnam's privacy-first, Nostr-native architecture.

---

## Priority Classification

| Priority                     | Components                                                                             | Target      |
| ---------------------------- | -------------------------------------------------------------------------------------- | ----------- |
| **High** (Implement Now)     | Sidecar Sentinel Monitoring, CodeSentinel Task Orchestration, OpenClaw Skills Platform | Weeks 23–26 |
| **Medium** (Post-MVP)        | Red-Team Security Testing, Multi-Channel Orchestration                                 | Weeks 27–28 |
| **Low** (Future Enhancement) | CodeSentinel OSINT Integration                                                         | Backlog     |

---

### Step 14: Sidecar Sentinel Monitoring (High Priority)

**Complexity:** High
**Estimated Time:** 10–14 hours
**Dependencies:** Steps 7, 8, 9
**Objective:** Monitor all agent outgoing messages for sensitive data leakage, block policy violations automatically, and alert humans on HIGH/CRITICAL threats.

**Tasks:**

14.1. Define sentinel policy schema:

- Create `sentinel_policies` table for configurable monitoring rules
- Define policy types: `DATA_LEAKAGE`, `POLICY_VIOLATION`, `RATE_ABUSE`, `CONTENT_FILTER`
- Support severity levels and automatic response actions (block, alert, log)

  14.2. Implement message interception layer:

- Create `SentinelMonitor` service as a sidecar to `AgentSessionManager`
- Intercept outgoing messages before delivery
- Pattern-match against active policies (regex, keyword, semantic)
- Support async scanning to avoid blocking message delivery for LOW-severity checks

  14.3. Define threat detection and response:

- Create `sentinel_events` table for logging detected threats
- Implement graduated response actions:
  - `LOG` — record event, allow message
  - `ALERT` — record event, send Nostr DM to guardian/steward, allow message
  - `BLOCK` — record event, block message, alert guardian/steward
  - `QUARANTINE` — block message, pause agent session, require human review
- Use NIP-59 gift-wrapped DMs for alert delivery

  14.4. Build sentinel dashboard panel:

- Add "Security Alerts" tab to existing `AgentsDashboard`
- Show active threats, blocked messages, policy violations
- Severity-based color coding consistent with `AgentObservabilityDashboard`

  14.5. Define RLS and access policies:

- Only `guardian` and `steward` roles can manage sentinel policies
- All roles can view their own agent's sentinel events
- Service role for automated policy enforcement

---

### Step 15: CodeSentinel Task Orchestration Pattern (High Priority)

**Complexity:** High
**Estimated Time:** 8–12 hours
**Dependencies:** Steps 2, 5, 8
**Objective:** Adopt step-by-step task decomposition with logging, implement completion guarantees with retry on incomplete data, and add post-step verification checkpoints.

**Tasks:**

15.1. Extend task decomposition model:

- Add `task_steps` table for granular step tracking within `agent_task_records`
- Each step has: `step_order`, `step_type`, `status`, `input_data`, `output_data`, `verification_result`
- Support orchestration modes: `STEP_BY_STEP`, `PARALLEL`, `ADAPTIVE`

  15.2. Implement completion guarantees:

- Define `TaskExecutionGuarantees` interface with:
  - `max_retries` per step
  - `retry_backoff_strategy` (`LINEAR`, `EXPONENTIAL`)
  - `incomplete_data_action` (`RETRY`, `SKIP_WITH_WARNING`, `ABORT`)
  - `timeout_per_step_seconds`
- Create `RetryPolicy` configuration per agent or per task type
- Log all retry attempts as session events (`TASK_RETRY` event type)

  15.3. Add post-step verification checkpoints:

- Define verification functions that run after each step completion
- Support verification types: `OUTPUT_SCHEMA_VALID`, `COST_WITHIN_BUDGET`, `NO_SENSITIVE_DATA`, `CUSTOM`
- Record verification results in `task_steps.verification_result` JSONB
- Block progression to next step if verification fails (configurable)

  15.4. Implement orchestration logging template:

- Standardized logging format for task execution with:
  - Step entry/exit timestamps
  - Input/output checksums (privacy-safe, no raw data)
  - Verification pass/fail status
  - Cost attribution per step
- Integrate with privacy-logger (Step 9) to redact sensitive fields

  15.5. Create task orchestration API:

- Netlify function `agent-task-orchestrate` for submitting multi-step tasks
- Support for monitoring step-by-step progress via session events
- Cancellation and pause support at step boundaries

---

### Step 16: OpenClaw Skills Platform (High Priority)

**Complexity:** High
**Estimated Time:** 10–14 hours
**Dependencies:** Steps 6, 7, 8
**Objective:** Create bundled skills (Lightning, Nostr, Cashu), build skill marketplace for managed third-party skills, and enable workspace skills for family-specific capabilities.

**Tasks:**

16.1. Define skills schema:

- Create `agent_skills` table:
  - `skill_id`, `skill_name`, `skill_type` (`BUNDLED`, `MANAGED`, `WORKSPACE`)
  - `skill_version`, `skill_config` JSONB, `permissions_required` TEXT[]
  - `is_active`, `created_by` (federation or system)
- Create `agent_skill_assignments` junction table linking agents to skills
- RLS: `BUNDLED` skills visible to all; `MANAGED` require marketplace approval; `WORKSPACE` scoped to family federation

  16.2. Implement bundled skills:

- `LightningSkill` — send/receive sats, invoice creation, payment verification
- `NostrSkill` — publish events, subscribe to relays, NIP-59 messaging
- `CashuSkill` — mint/melt tokens, proof management, ecash operations
- Each skill implements a common `AgentSkill` interface with `execute()`, `validate()`, `getCost()`

  16.3. Build skill marketplace infrastructure:

- Create `skill_marketplace` table for published third-party skills
- Vetting workflow: `SUBMITTED` → `UNDER_REVIEW` → `APPROVED` / `REJECTED`
- Only `guardian` and `steward` roles can approve marketplace skills
- Track skill usage metrics and cost per invocation

  16.4. Enable workspace (family-specific) skills:

- Allow `guardian` role to create custom skills scoped to their family federation
- Workspace skills inherit federation privacy settings
- Support skill templates for common family operations

  16.5. Skill execution runtime:

- Integrate skill invocation into `AgentSessionManager` workflow
- Log skill executions as session events (`SKILL_INVOCATION` event type)
- Enforce permission checks before skill execution
- Cost tracking per skill invocation (ties into Step 12)

---

### Step 17: Red-Team Security Testing (Medium Priority — Post-MVP)

**Complexity:** Medium–High
**Estimated Time:** 6–10 hours
**Dependencies:** Steps 13, 14, 15
**Objective:** Create adversarial test scenarios, require passing tests before agent promotion (TESTING → ACTIVE), and implement continuous security regression testing.

**Tasks:**

17.1. Define adversarial test framework:

- Create `security_test_scenarios` table with test cases
- Test categories: `PROMPT_INJECTION`, `DATA_EXFILTRATION`, `PRIVILEGE_ESCALATION`, `RATE_ABUSE`, `SOCIAL_ENGINEERING`
- Each scenario has: input payload, expected response, pass/fail criteria

  17.2. Implement promotion gate:

- Require all HIGH/CRITICAL security tests to pass before agent status changes from `TESTING` to `ACTIVE`
- Create `agent_security_audit` table tracking test results per agent version
- Block promotion via database constraint or RPC validation

  17.3. Continuous regression testing:

- Scheduled Netlify function to run security test suite periodically
- Compare results against previous runs for regression detection
- Auto-demote agents (ACTIVE → TESTING) if regression detected on CRITICAL tests
- Alert guardians/stewards via Nostr DM on test failures

---

### Step 18: Multi-Channel Orchestration (Medium Priority — Post-MVP)

**Complexity:** Medium–High
**Estimated Time:** 8–12 hours
**Dependencies:** Steps 8, 11, Module 2.5.3
**Objective:** Expand beyond Nostr to Telegram, web UI, and CLI channels with channel-specific rate limits and automatic failover.

**Tasks:**

18.1. Define channel configuration schema:

- Extend `agent_sessions` with `channel_configs` JSONB for per-channel settings
- Support channels: `nostr`, `telegram`, `web_ui`, `api`, `cli`
- Each channel config includes: `rate_limit`, `max_concurrent_sessions`, `failover_priority`, `enabled`

  18.2. Implement channel-specific rate limiting:

- Create `channel_rate_limits` table or embed in session metadata
- Rate limit dimensions: messages per minute, tokens per hour, sats per session
- Different limits per channel (e.g., CLI may have higher throughput, Telegram lower)

  18.3. Add automatic failover:

- Define failover priority order per agent
- If primary channel fails (timeout, rate limit exceeded, service down), automatically switch to next priority channel
- Log channel switches as session events (`CHANNEL_FAILOVER` event type)
- Preserve conversation context across failover (leverages Step 11 context sync)

  18.4. Channel health monitoring:

- Track per-channel availability and latency
- Surface channel health in `AgentHealthDashboard`
- Alert on channel degradation before failover triggers

---

### Step 19: CodeSentinel OSINT Integration (Low Priority — Future Enhancement)

**Complexity:** High
**Estimated Time:** 8–12 hours
**Dependencies:** Steps 14, 17
**Objective:** Monitor community chatter about agents for reputation OSINT, detect emerging threats to specific agent types, and integrate threat intelligence into risk scoring.

**Tasks:**

19.1. Define OSINT data model:

- Create `osint_intelligence` table for aggregated threat/reputation signals
- Fields: `source_type` (relay, forum, social), `entity_referenced` (agent npub), `sentiment`, `threat_level`, `raw_signal` (encrypted), `detected_at`
- RLS: only `guardian` role can access OSINT data

  19.2. Implement Nostr relay monitoring:

- Subscribe to relevant Nostr relays for mentions of agent npubs
- Filter and classify mentions: `POSITIVE`, `NEUTRAL`, `NEGATIVE`, `THREAT`
- Use NIP-50 search where supported, fall back to local filtering

  19.3. Threat intelligence integration:

- Feed OSINT signals into agent risk scoring (extends `agent_operational_state.risk_score`)
- Weighted scoring: direct threats > negative sentiment > neutral mentions
- Auto-escalate risk score when OSINT detects credible threats
- Alert guardians when OSINT-driven risk score exceeds threshold

  19.4. Reputation dashboard:

- Add "Reputation & OSINT" panel to agent dashboards
- Show sentiment trends, threat timeline, and source breakdown
- Privacy-safe display (no raw relay data, only aggregated metrics)

---

## Hybrid Architecture Recommendation

**Best of Both Worlds:** Combines OpenClaw's flexibility for multi-domain tasks and channel diversity, CodeSentinel's reliability with comprehensive logging and guaranteed task completion, and Sentinel's security with runtime monitoring and threat detection.

```typescript
// Satnam Agent Architecture (OpenClaw + CodeSentinel + Sentinel patterns)
interface SatnamAgent {
  // Core identity (existing)
  agent_id: string;
  agent_npub: string;

  // OpenClaw multi-channel orchestration
  channels: {
    nostr: NostrClientConfig;
    telegram?: TelegramBotConfig;
    web_ui: WebSocketConfig;
    api: RestAPIConfig;
    cli: CLIConfig;
  };

  // OpenClaw skills platform
  enabled_skills: {
    bundled: BundledSkill[]; // Core Satnam capabilities
    managed: ManagedSkill[]; // Vetted marketplace skills
    workspace: WorkspaceSkill[]; // Family/business custom skills
  };

  // CodeSentinel task orchestration
  task_execution: {
    orchestration_mode: "STEP_BY_STEP" | "PARALLEL" | "ADAPTIVE";
    completion_guarantees: TaskExecutionGuarantees;
    retry_policy: RetryPolicy;
    logging_template: string;
  };

  // Sentinel security monitoring
  sentinel_monitor: {
    enabled: boolean;
    monitor_type: "SIDECAR" | "STANDALONE";
    detectors: ThreatDetector[];
    response_actions: ResponseAction[];
  };

  // CodeSentinel risk scoring
  risk_assessment: {
    current_risk_score: number; // 0-10
    risk_factors: RiskFactor[];
    graduated_actions: RiskMitigationActions;
  };
}
```

---

## Phase 2.6 Dependency Graph

```
Step 14 (Sentinel Monitoring)   ←── Steps 7, 8, 9
Step 15 (Task Orchestration)    ←── Steps 2, 5, 8
Step 16 (Skills Platform)       ←── Steps 6, 7, 8
Step 17 (Red-Team Testing)      ←── Steps 13, 14, 15
Step 18 (Multi-Channel Orch.)   ←── Steps 8, 11, Module 2.5.3
Step 19 (OSINT Integration)     ←── Steps 14, 17
```

High Priority (Steps 14–16) can begin in parallel once Phase 2.5 Steps 7–9 are complete.
Medium Priority (Steps 17–18) require High Priority steps plus Phase 2.5 testing.
Low Priority (Step 19) requires sentinel infrastructure from Steps 14 and 17.

---

## Phase 2.6 Estimated Effort

| Step                | Description                             | Hours           | Complexity  | Priority |
| ------------------- | --------------------------------------- | --------------- | ----------- | -------- |
| 14                  | Sidecar Sentinel Monitoring             | 10–14           | High        | High     |
| 15                  | CodeSentinel Task Orchestration Pattern | 8–12            | High        | High     |
| 16                  | OpenClaw Skills Platform                | 10–14           | High        | High     |
| 17                  | Red-Team Security Testing               | 6–10            | Medium–High | Medium   |
| 18                  | Multi-Channel Orchestration             | 8–12            | Medium–High | Medium   |
| 19                  | CodeSentinel OSINT Integration          | 8–12            | High        | Low      |
| **Phase 2.6 Total** |                                         | **50–74 hours** |             |          |

---

## Combined Phase 2.5 + 2.6 Total Effort

| Phase                                         | Hours             |
| --------------------------------------------- | ----------------- |
| Phase 2.5 (Steps 1–13 + Modules 2.5.2, 2.5.3) | 77–108            |
| Phase 2.6 (Steps 14–19)                       | 50–74             |
| **Grand Total**                               | **127–182 hours** |

---

# Phase 2.7: CrAIgslistr Marketplace Infrastructure

**Timeline:** Weeks 29–34 (insert after Phase 2.6)
**Objective:** Build a decentralized Nostr-based marketplace for skills and actions, creating powerful network effects between the Mentor Marketplace (Citadel Academy), Skills Marketplace, and Agent Platform. Enable agents and humans to discover, purchase, and offer skills/services in a privacy-first, Lightning-native ecosystem.

---

## Three Interconnected Marketplaces

```
┌──────────────────────────────────────────────────────────────┐
│                    SATNAM ECOSYSTEM                          │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────┐    ┌──────────────────┐               │
│  │ Mentor          │◄──►│ Skills           │               │
│  │ Marketplace     │    │ Marketplace      │               │
│  │ (Citadel)       │    │ (CrAIgslistr)    │               │
│  │                 │    │                  │               │
│  │ • Teaching      │    │ • Agent Skills   │               │
│  │ • Learning      │    │ • Workflows      │               │
│  │ • Courses       │    │ • Templates      │               │
│  └────────┬────────┘    └────────┬─────────┘               │
│           │                      │                          │
│           │                      │                          │
│           └──────────┬───────────┘                          │
│                      │                                      │
│                      ▼                                      │
│           ┌──────────────────────┐                         │
│           │ Actions              │                         │
│           │ Marketplace          │                         │
│           │ (CrAIgslistr)        │                         │
│           │                      │                         │
│           │ • Tasks/Gigs         │                         │
│           │ • Bounties           │                         │
│           │ • Services           │                         │
│           └──────────────────────┘                         │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Network Effects:**

- **Mentors** teach skills → **Skills** are packaged and sold → **Actions** use those skills
- **Agents** learn from mentors → install skills → offer services in actions marketplace
- **Humans** discover skills via actions → hire mentors to learn → create new skills
- **Revenue flows** through all three layers (teaching fees, skill licenses, service payments)

---

### Module 2.7.1: Nostr Event Kinds for Marketplace (Weeks 29–30)

**Complexity:** High
**Estimated Time:** 10–14 hours
**Dependencies:** Steps 6, 7, 8, 11
**Objective:** Define Nostr event kinds for marketplace listings, implement event schemas for skills and actions, and integrate with existing Nostr infrastructure.

**Tasks:**

2.7.1.1. Define CrAIgslistr event kinds:

- Extend Satnam's Nostr event kind registry with marketplace kinds
- Use parameterized replaceable events (30000–39999 range) for listings
- Ensure compatibility with existing NIP-01, NIP-04, NIP-59 patterns

**Proposed Event Kinds:**

```typescript
// types/craigstr-events.ts
// Nostr event kinds for CrAIgslistr marketplace
export enum CrAIgslisterEventKind {
  // Skills listings
  SKILL_LISTING = 31000, // Parameterized replaceable event
  SKILL_REVIEW = 31001,
  SKILL_VERSION = 31002,

  // Action listings
  ACTION_REQUEST = 31010, // "I need X done"
  ACTION_OFFER = 31011, // "I can do X"
  ACTION_RESPONSE = 31012, // Response to request/offer

  // Marketplace transactions
  MARKETPLACE_ORDER = 31020,
  MARKETPLACE_DELIVERY = 31021,
  MARKETPLACE_DISPUTE = 31022,

  // Discovery/curation
  MARKETPLACE_CATEGORY = 31030,
  MARKETPLACE_FEATURED = 31031,
}
```

2.7.1.2. Implement skill listing event schema:

- Create TypeScript interfaces for skill listings
- Support bundled, managed, and workspace skill types (from Step 16)
- Include pricing, licensing, versioning, and dependency metadata
- Integrate with existing privacy-first patterns (no PII in public events)

**Skill Listing Event Structure:**

```typescript
// types/craigstr-events.ts
// kind: 31000 (SKILL_LISTING)
export interface SkillListingEvent {
  kind: 31000;
  pubkey: string; // Creator's npub
  content: string; // JSON-encoded skill details
  tags: [
    ["d", string], // skill-unique-id (parameterized replaceable identifier)
    ["name", string], // "Lightning Invoice Generator"
    ["description", string], // Brief description
    ["category", string], // "payments", "lightning", etc. (multiple allowed)
    ["skill-type", "bundled" | "managed" | "workspace"],
    ["version", string], // "1.2.3"
    ["license", "MIT" | "proprietary" | "CC-BY-SA"],
    ["price", string, "sats"], // Cost to purchase/license
    ["creator-split", string], // "70" (creator gets 70% of revenue)
    ["platform-split", string], // "30" (platform gets 30%)

    // Compatibility
    ["runtime", string], // "nodejs-18"
    ["dependencies", ...string[]], // "lnbits-api", "nostr-tools"

    // Capabilities (input/output schema)
```

    ["input", string, string, "required" | "optional"], // ["amount_sats", "integer", "required"]
    ["output", string, string, string], // ["invoice", "string", "bolt11"]

    // Quality signals
    ["verified", "satnam-certified" | "community" | "unverified"],
    ["downloads", string], // "1523"
    ["rating", string], // "4.7"

    // Distribution
    ["source-url", string], // "https://github.com/user/skill-repo"
    ["package-hash", string], // "sha256:abc123..."

    // Relations
    ["requires-skill", string], // skill-id-1 (dependencies on other skills)
    ["compatible-with", string] // "agent-type:code-assistant"

];
created_at: number;
sig: string;
}

// Content field (JSON):
export interface SkillListingContent {
readme: string; // "# Lightning Invoice Generator\n\nGenerates BOLT-11..."
code_snippet?: string; // "async function generateInvoice(amount) {...}"
demo_video_url?: string; // "https://blossom.server/demo.mp4"
changelog?: string; // "v1.2.3: Added memo support"
installation?: string; // "npm install @satnam/skill-lightning-invoice"
}

````

  2.7.1.3. Implement action listing event schemas:

- Create interfaces for ACTION_REQUEST (buyers) and ACTION_OFFER (sellers)
- Support both human and agent participants
- Include escrow, verification, and reputation metadata
- Link actions to required/offered skills from marketplace

**Action Listing Events:**

```typescript
// types/craigstr-events.ts
// kind: 31010 (ACTION_REQUEST) - "I need help with X"
export interface ActionRequestEvent {
  kind: 31010;
  pubkey: string; // Requester's npub
  content: string; // Detailed description
  tags: [
    ["d", string], // action-request-unique-id
    ["title", string], // "Build Nostr relay monitoring dashboard"
    ["category", string], // "development"
    ["budget", string, "sats"], // ["50000", "sats"]
    ["deadline", string], // ISO 8601 timestamp
    ["delivery-format", "github-repo" | "video" | "written-report"],

    // Requirements
    ["required-skill", string], // skill-id (multiple allowed)
    ["experience-level", "beginner" | "intermediate" | "advanced"],

    // Preferences
    ["prefer-human", "true" | "false"], // vs agent
    ["prefer-mentor", string], // npub of specific person
    ["language", string], // "en"

    // Verification
    ["verification-method", "github-pr" | "video-demo" | "human-review"],
    ["escrow", "fedimint-hold-invoice" | "lightning-hodl-invoice"],

    // Relations
    ["replies-to", string], // event-id (thread of negotiations)
    ["zap-goal", string] // "50000" (total budget available)
  ];
  created_at: number;
  sig: string;
}

// kind: 31011 (ACTION_OFFER) - "I can do X"
export interface ActionOfferEvent {
  kind: 31011;
  pubkey: string; // Offerer's npub (human or agent)
  content: string; // Pitch/proposal
  tags: [
    ["d", string], // action-offer-unique-id
    ["title", string], // "Professional Web Development Services"
    ["category", string], // "development"
    ["rate", string, "sats-per-hour"], // ["1000", "sats-per-hour"]
    ["flat-fee", string, "sats"], // ["25000", "sats"]
    ["availability", "immediate" | "2-weeks" | string],

    // Capabilities (linked to skills)
    ["offers-skill", string], // skill-id (multiple allowed)

    // Portfolio
    ["portfolio-item", string], // URL (multiple allowed)
    ["past-work", string], // event-id of completed action (multiple allowed)

    // Identity signals
    ["entity-type", "human" | "agent"],
    ["agent-id", string], // agent-npub (if agent offering)
    ["reputation", string], // "4.8"
    ["completed-tasks", string], // "47"

    // Preferences
    ["accepts-escrow", "true" | "false"],
    ["requires-bond", string, "sats"], // ["5000", "sats"]
    ["payment-methods", ...string[]] // "lightning", "cashu", "fedimint"
  ];
  created_at: number;
  sig: string;
}
````

2.7.1.4. Integrate with existing Nostr infrastructure:

- Extend `NostrEventPublisher` service to support marketplace event kinds
- Add marketplace event validation to existing Nostr event handlers
- Integrate with NIP-59 gift-wrapped messaging for private negotiations
- Use existing relay configuration from `NOSTR_RELAYS` env var

  2.7.1.5. Privacy and security considerations:

- Never include sensitive data (nsec, payment preimages, personal info) in public events
- Use NIP-59 for private negotiations and payment details
- Validate all event signatures before processing
- Rate-limit event publishing to prevent spam

---

### Module 2.7.2: Database Schema for Marketplace (Weeks 31–32)

**Complexity:** High
**Estimated Time:** 12–16 hours
**Dependencies:** Module 2.7.1, Steps 1, 4, 5
**Objective:** Create comprehensive database schema for marketplace skills, purchases, reviews, actions, responses, and transactions with privacy-first RLS policies.

**File:** `supabase/migrations/20260225_craigstr_marketplace.sql`

**Tasks:**

2.7.2.1. Create marketplace_skills table:

- Store skill catalog with versioning, pricing, and quality signals
- Support bundled/managed/workspace skill types
- Track downloads, ratings, and revenue splits
- Link to Nostr events for decentralized discovery

```sql
-- Skills marketplace catalog
CREATE TABLE IF NOT EXISTS marketplace_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id TEXT UNIQUE NOT NULL, -- From event "d" tag
  nostr_event_id TEXT UNIQUE NOT NULL,

  -- Basic info
  skill_name TEXT NOT NULL,
  description TEXT,
  category TEXT[],
  skill_type TEXT CHECK (skill_type IN ('bundled', 'managed', 'workspace')),

  -- Creator
  creator_npub TEXT NOT NULL,
  creator_split_percent INTEGER DEFAULT 70,

  -- Versioning
  current_version TEXT NOT NULL,
  package_hash TEXT,
  source_url TEXT,

  -- Pricing
  price_sats BIGINT DEFAULT 0, -- 0 = free
  license_type TEXT,

  -- Quality signals
  verification_level TEXT CHECK (verification_level IN ('unverified', 'community', 'satnam_certified')),
  total_downloads INTEGER DEFAULT 0,
  avg_rating NUMERIC(3,2) DEFAULT 0.00,
  review_count INTEGER DEFAULT 0,

  -- Metadata
  runtime_requirements JSONB, -- {"nodejs": ">=18", "memory_mb": 512}
  dependencies JSONB, -- ["lnbits-api@1.0", "nostr-tools@2.0"]
  inputs_schema JSONB,
  outputs_schema JSONB,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  featured BOOLEAN DEFAULT FALSE,
  published_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_skills_category ON marketplace_skills USING GIN(category);
CREATE INDEX idx_skills_creator ON marketplace_skills(creator_npub);
CREATE INDEX idx_skills_rating ON marketplace_skills(avg_rating DESC);
CREATE INDEX idx_skills_downloads ON marketplace_skills(total_downloads DESC);
CREATE INDEX idx_skills_type ON marketplace_skills(skill_type, is_active);
```

2.7.2.2. Create skill purchases and reviews tables:

- Track purchases with revenue split attribution
- Support one-time, subscription, and free downloads
- Link purchases to agent installations
- Store reviews with verified purchase flag

```sql
-- Skill purchases/installations
CREATE TABLE IF NOT EXISTS marketplace_skill_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id TEXT REFERENCES marketplace_skills(skill_id) NOT NULL,
  buyer_id UUID REFERENCES user_identities(id) NOT NULL,

  -- Purchase details
  purchase_type TEXT CHECK (purchase_type IN ('one_time', 'subscription', 'free_download')),
  amount_paid_sats BIGINT DEFAULT 0,
  payment_hash TEXT,

  -- Revenue split
  creator_revenue_sats BIGINT,
  platform_revenue_sats BIGINT,

  -- Installation
  installed_to_agent_id UUID REFERENCES user_identities(id),
  installation_status TEXT CHECK (installation_status IN ('pending', 'installed', 'failed', 'removed')),

  purchased_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_purchases_buyer ON marketplace_skill_purchases(buyer_id);
CREATE INDEX idx_purchases_skill ON marketplace_skill_purchases(skill_id);
CREATE INDEX idx_purchases_agent ON marketplace_skill_purchases(installed_to_agent_id);

-- Skill reviews
CREATE TABLE IF NOT EXISTS marketplace_skill_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id TEXT REFERENCES marketplace_skills(skill_id) NOT NULL,
  nostr_event_id TEXT UNIQUE NOT NULL,
  reviewer_npub TEXT NOT NULL,

  -- Review content
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,
  pros TEXT[],
  cons TEXT[],

  -- Context
  verified_purchase BOOLEAN DEFAULT FALSE,
  usage_duration_days INTEGER,

  -- Moderation
  flagged BOOLEAN DEFAULT FALSE,
  flag_reason TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reviews_skill ON marketplace_skill_reviews(skill_id, created_at DESC);
CREATE INDEX idx_reviews_flagged ON marketplace_skill_reviews(flagged) WHERE flagged = TRUE;
```

2.7.2.3. Create actions marketplace tables:

- Store action requests (buyers) and offers (sellers)
- Support human and agent participants
- Track status, matching, and escrow
- Link to required/offered skills

```sql
-- Actions marketplace (requests & offers)
CREATE TABLE IF NOT EXISTS marketplace_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id TEXT UNIQUE NOT NULL, -- From event "d" tag
  nostr_event_id TEXT UNIQUE NOT NULL,

  action_type TEXT CHECK (action_type IN ('request', 'offer')) NOT NULL,

  -- Basic info
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,

  -- Poster identity
  poster_npub TEXT NOT NULL,
  poster_entity_type TEXT CHECK (poster_entity_type IN ('human', 'agent')),

  -- Pricing
  budget_sats BIGINT, -- For requests
  rate_sats_per_hour BIGINT, -- For offers
  flat_fee_sats BIGINT, -- For offers

  -- Requirements/capabilities
  required_skills TEXT[], -- skill_ids
  offered_skills TEXT[], -- skill_ids
  experience_level TEXT,

  -- Logistics
  deadline TIMESTAMPTZ,
  availability TEXT,
  delivery_format TEXT,

  -- Status
  status TEXT CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled', 'disputed')) DEFAULT 'open',
  matched_with_npub TEXT, -- Counterparty npub
  matched_at TIMESTAMPTZ,

  -- Escrow
  escrow_enabled BOOLEAN DEFAULT FALSE,
  escrow_amount_sats BIGINT,
  escrow_payment_hash TEXT,

  posted_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_actions_type ON marketplace_actions(action_type, status);
CREATE INDEX idx_actions_category ON marketplace_actions(category);
CREATE INDEX idx_actions_poster ON marketplace_actions(poster_npub);
CREATE INDEX idx_actions_deadline ON marketplace_actions(deadline) WHERE status = 'open';

-- Action responses (bids, proposals, applications)
CREATE TABLE IF NOT EXISTS marketplace_action_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id TEXT REFERENCES marketplace_actions(action_id) NOT NULL,
  nostr_event_id TEXT UNIQUE NOT NULL,

  responder_npub TEXT NOT NULL,
  responder_entity_type TEXT CHECK (responder_entity_type IN ('human', 'agent')),

  -- Response content
  proposal_text TEXT,
  quoted_price_sats BIGINT,
  estimated_delivery_time TEXT,

  -- Portfolio/credentials
  relevant_skills TEXT[], -- skill_ids
  past_work_events TEXT[], -- Nostr event IDs of completed work

  -- Status
  status TEXT CHECK (status IN ('pending', 'accepted', 'rejected', 'withdrawn')) DEFAULT 'pending',

  responded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_responses_action ON marketplace_action_responses(action_id);
CREATE INDEX idx_responses_responder ON marketplace_action_responses(responder_npub);
CREATE INDEX idx_responses_status ON marketplace_action_responses(status);
```

2.7.2.4. Create marketplace transactions table:

- Track all marketplace transactions (skills, actions, mentorship)
- Support escrow, delivery verification, and dispute resolution
- Link to Lightning payment hashes
- Enable revenue attribution and analytics

```sql
-- Marketplace transactions (matches & completions)
CREATE TABLE IF NOT EXISTS marketplace_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id TEXT UNIQUE NOT NULL,

  -- Parties
  buyer_npub TEXT NOT NULL,
  seller_npub TEXT NOT NULL,
  seller_entity_type TEXT CHECK (seller_entity_type IN ('human', 'agent')),

  -- What was purchased
  transaction_type TEXT CHECK (transaction_type IN ('skill_purchase', 'action_completion', 'mentorship_session')),
  related_skill_id TEXT,
  related_action_id TEXT,

  -- Payment
  agreed_price_sats BIGINT NOT NULL,
  payment_status TEXT CHECK (payment_status IN ('pending', 'escrowed', 'released', 'refunded', 'disputed')) DEFAULT 'pending',
  payment_hash TEXT,

  -- Delivery
  delivery_status TEXT CHECK (delivery_status IN ('pending', 'in_progress', 'delivered', 'accepted', 'rejected')),
  delivery_proof_url TEXT,
  delivery_verified BOOLEAN DEFAULT FALSE,

  -- Dispute resolution
  disputed BOOLEAN DEFAULT FALSE,
  dispute_reason TEXT,
  arbiter_npub TEXT,
  resolution TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_transactions_buyer ON marketplace_transactions(buyer_npub);
CREATE INDEX idx_transactions_seller ON marketplace_transactions(seller_npub);
CREATE INDEX idx_transactions_status ON marketplace_transactions(payment_status, delivery_status);
CREATE INDEX idx_transactions_type ON marketplace_transactions(transaction_type);
CREATE INDEX idx_transactions_disputed ON marketplace_transactions(disputed) WHERE disputed = TRUE;
```

2.7.2.5. Add RLS policies for marketplace tables:

- Enable public read access for discovery (active listings, open actions, non-flagged reviews)
- Allow creators/posters to manage their own listings
- Allow buyers to view their own purchases and transactions
- Grant service role full access for maintenance

```sql
-- Enable RLS on all marketplace tables
ALTER TABLE marketplace_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_skill_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_skill_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_action_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_transactions ENABLE ROW LEVEL SECURITY;

-- Public read for discovery
CREATE POLICY "marketplace_skills_public" ON marketplace_skills
  FOR SELECT USING (is_active = TRUE);

CREATE POLICY "marketplace_actions_public" ON marketplace_actions
  FOR SELECT USING (status = 'open');

CREATE POLICY "marketplace_reviews_public" ON marketplace_skill_reviews
  FOR SELECT USING (NOT flagged);

-- Creators/posters can manage their own listings
CREATE POLICY "skills_creator_manage" ON marketplace_skills
  FOR ALL USING (
    creator_npub = current_setting('request.jwt.claims', true)::json->>'nostr_pubkey'
  );

CREATE POLICY "actions_poster_manage" ON marketplace_actions
  FOR ALL USING (
    poster_npub = current_setting('request.jwt.claims', true)::json->>'nostr_pubkey'
  );

CREATE POLICY "responses_responder_manage" ON marketplace_action_responses
  FOR ALL USING (
    responder_npub = current_setting('request.jwt.claims', true)::json->>'nostr_pubkey'
  );

-- Users can see their own purchases/transactions
CREATE POLICY "purchases_own" ON marketplace_skill_purchases
  FOR SELECT USING (buyer_id = auth.uid());

CREATE POLICY "transactions_party" ON marketplace_transactions
  FOR SELECT USING (
    buyer_npub = current_setting('request.jwt.claims', true)::json->>'nostr_pubkey' OR
    seller_npub = current_setting('request.jwt.claims', true)::json->>'nostr_pubkey'
  );

-- Service role full access for all tables
CREATE POLICY "skills_service" ON marketplace_skills
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "purchases_service" ON marketplace_skill_purchases
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "reviews_service" ON marketplace_skill_reviews
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "actions_service" ON marketplace_actions
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "responses_service" ON marketplace_action_responses
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "transactions_service" ON marketplace_transactions
  FOR ALL USING (auth.role() = 'service_role');
```

2.7.2.6. Integration notes:

- **Nostr Event Sync**: Marketplace tables should be populated from Nostr events (Module 2.7.1) via background sync jobs
- **Revenue Attribution**: Use `creator_split_percent` from `marketplace_skills` to calculate revenue splits in `marketplace_skill_purchases`
- **Skill Installation**: Link `marketplace_skill_purchases.installed_to_agent_id` to agent identities for tracking which agents have which skills
- **Reputation System**: Calculate reputation scores from `marketplace_skill_reviews.rating` and `marketplace_transactions.delivery_verified`
- **Escrow Integration**: Link `escrow_payment_hash` to Lightning/Fedimint payment systems for hold invoices
- **Dispute Resolution**: Use `marketplace_transactions.arbiter_npub` to assign disputes to guardians or trusted community members

  2.7.2.7. Privacy considerations:

- Never store nsec, payment preimages, or personal identifying information in marketplace tables
- Use npub (public keys) for all identity references
- Encrypt sensitive negotiation details using NIP-59 gift-wrapped messages
- Allow users to delete their own reviews and listings (soft delete with `is_active = FALSE`)
- Implement rate limiting on marketplace event publishing to prevent spam

---

### Module 2.7.3: Skill Discovery & Installation (Weeks 33–34)

**Complexity:** High
**Estimated Time:** 14–18 hours
**Dependencies:** Module 2.7.1, Module 2.7.2, Steps 6, 7, 8
**Objective:** Implement Nostr-based skill discovery service, search/filter functionality, and complete skill installation flow with payment processing and dependency management.

**Tasks:**

2.7.3.1. Create CrAIgslisterDiscoveryService:

- Implement Nostr relay pool for marketplace event queries
- Build search functionality for skills and actions
- Support filtering by category, price, rating, verification level
- Implement client-side filtering for attributes not supported by Nostr filters
- Add relevance-based sorting (downloads × rating)

**File:** `src/lib/craigstr-discovery.ts`

```typescript
// Nostr-based skill discovery
import { RelayPool, NostrFilter, NostrEvent } from "@/lib/nostr";
import { SkillListing, ActionListing } from "@/types/craigstr-events";

export class CrAIgslisterDiscoveryService {
  private relayPool: RelayPool;
  private filters: Map<string, NostrFilter> = new Map();

  constructor(relays: string[]) {
    this.relayPool = new RelayPool(relays);
  }

  async searchSkills(query: {
    category?: string;
    keywords?: string[];
    minRating?: number;
    maxPrice?: number;
    verifiedOnly?: boolean;
    compatibleWith?: string; // agent-type or runtime
  }): Promise<SkillListing[]> {
    // Build Nostr filter
    const filter: NostrFilter = {
      kinds: [31000], // SKILL_LISTING
      limit: 100,
    };

    // Add tag filters (Nostr-native filtering)
    if (query.category) {
      filter["#category"] = [query.category];
    }

    if (query.verifiedOnly) {
      filter["#verified"] = ["satnam-certified", "community"];
    }

    // Query relays
    const events = await this.relayPool.querySync(filter);

    // Parse and filter
    let skills = events.map((e) => this.parseSkillEvent(e));

    // Client-side filtering (can't do in Nostr filter)
    if (query.maxPrice) {
      skills = skills.filter((s) => s.price_sats <= query.maxPrice!);
    }

    if (query.minRating) {
      skills = skills.filter((s) => s.avg_rating >= query.minRating!);
    }

    if (query.keywords && query.keywords.length > 0) {
      skills = skills.filter((s) =>
        query.keywords!.some(
          (kw) =>
            s.name.toLowerCase().includes(kw.toLowerCase()) ||
            s.description.toLowerCase().includes(kw.toLowerCase()),
        ),
      );
    }

    // Sort by relevance (downloads * rating)
    skills.sort((a, b) => {
      const scoreA = a.total_downloads * a.avg_rating;
      const scoreB = b.total_downloads * b.avg_rating;
      return scoreB - scoreA;
    });

    return skills;
  }

  async searchActions(query: {
    type: "request" | "offer";
    category?: string;
    maxBudget?: number;
    preferHuman?: boolean;
    preferAgent?: boolean;
    deadline?: Date;
  }): Promise<ActionListing[]> {
    const eventKind = query.type === "request" ? 31010 : 31011;

    const filter: NostrFilter = {
      kinds: [eventKind],
      limit: 100,
    };

    if (query.category) {
      filter["#category"] = [query.category];
    }

    const events = await this.relayPool.querySync(filter);
    let actions = events.map((e) => this.parseActionEvent(e));

    // Filter by entity type preference
    if (query.preferHuman) {
      actions = actions.filter((a) => a.poster_entity_type === "human");
    }
    if (query.preferAgent) {
      actions = actions.filter((a) => a.poster_entity_type === "agent");
    }

    // Filter by budget
    if (query.maxBudget) {
      actions = actions.filter(
        (a) => !a.budget_sats || a.budget_sats <= query.maxBudget!,
      );
    }

    // Filter by deadline
    if (query.deadline) {
      actions = actions.filter(
        (a) => !a.deadline || new Date(a.deadline) >= query.deadline!,
      );
    }

    return actions;
  }

  private parseSkillEvent(event: NostrEvent): SkillListing {
    const tags = new Map(event.tags.map((t) => [t[0], t.slice(1)]));
    const content = JSON.parse(event.content);

    return {
      skill_id: tags.get("d")?.[0] || "",
      name: tags.get("name")?.[0] || "",
      description: tags.get("description")?.[0] || "",
      category: event.tags.filter((t) => t[0] === "category").map((t) => t[1]),
      skill_type: tags.get("skill-type")?.[0] as
        | "bundled"
        | "managed"
        | "workspace",
      version: tags.get("version")?.[0] || "1.0.0",
      price_sats: parseInt(tags.get("price")?.[0] || "0"),
      creator_npub: event.pubkey,
      avg_rating: parseFloat(tags.get("rating")?.[0] || "0"),
      total_downloads: parseInt(tags.get("downloads")?.[0] || "0"),
      verification_level: tags.get("verified")?.[0] as
        | "unverified"
        | "community"
        | "satnam_certified",
      source_url: tags.get("source-url")?.[0],
      readme: content.readme,
      installation: content.installation,
      nostr_event_id: event.id,
    };
  }

  private parseActionEvent(event: NostrEvent): ActionListing {
    const tags = new Map(event.tags.map((t) => [t[0], t.slice(1)]));

    return {
      action_id: tags.get("d")?.[0] || "",
      title: tags.get("title")?.[0] || "",
      description: event.content,
      category: tags.get("category")?.[0],
      poster_npub: event.pubkey,
      poster_entity_type:
        (tags.get("entity-type")?.[0] as "human" | "agent") || "human",
      budget_sats: parseInt(tags.get("budget")?.[0] || "0"),
      deadline: tags.get("deadline")?.[0],
      required_skills: event.tags
        .filter((t) => t[0] === "required-skill")
        .map((t) => t[1]),
      nostr_event_id: event.id,
    };
  }
}
```

2.7.3.2. Implement skill installation flow:

- Fetch skill details from Nostr events
- Process payment for paid skills with revenue split
- Download and verify skill package integrity
- Check and validate dependencies
- Install skill to agent profile
- Record purchase and update download count

**File:** `src/lib/craigstr-installer.ts`

```typescript
// Install skill to agent
export async function installSkillToAgent(
  skillId: string,
  agentId: string,
  userId: string,
): Promise<InstallationResult> {
  // 1. Fetch skill details from Nostr
  const skill = await fetchSkillFromNostr(skillId);

  // 2. Check if paid skill - process payment
  if (skill.price_sats > 0) {
    const payment = await processSkillPurchase({
      skill_id: skillId,
      buyer_id: userId,
      amount_sats: skill.price_sats,
      creator_npub: skill.creator_npub,
      creator_split_percent: skill.creator_split_percent,
    });

    if (!payment.success) {
      throw new Error("Payment failed");
    }
  }

  // 3. Download skill package
  const packageData = await downloadSkillPackage(
    skill.source_url,
    skill.package_hash,
  );

  // 4. Verify package integrity
  const verified = await verifyPackageHash(packageData, skill.package_hash);
  if (!verified) {
    throw new Error("Package hash mismatch - potential tampering");
  }

  // 5. Check dependencies
  for (const dep of skill.dependencies) {
    const installed = await checkDependencyInstalled(agentId, dep);
    if (!installed) {
      throw new Error(`Missing dependency: ${dep}`);
    }
  }

  // 6. Install to agent
  const installation = await installPackageToAgent(agentId, packageData, {
    skill_id: skillId,
    version: skill.version,
    enabled: true,
  });

  // 7. Record purchase/installation
  await supabase.from("marketplace_skill_purchases").insert({
    skill_id: skillId,
    buyer_id: userId,
    installed_to_agent_id: agentId,
    amount_paid_sats: skill.price_sats,
    installation_status: "installed",
  });

  // 8. Update download count
  await supabase.rpc("increment_skill_downloads", { p_skill_id: skillId });

  return {
    success: true,
    skill_id: skillId,
    agent_id: agentId,
    installation_id: installation.id,
  };
}

async function processSkillPurchase(params: {
  skill_id: string;
  buyer_id: string;
  amount_sats: number;
  creator_npub: string;
  creator_split_percent: number;
}): Promise<PaymentResult> {
  // Calculate splits
  const creatorAmount = Math.floor(
    params.amount_sats * (params.creator_split_percent / 100),
  );
  const platformAmount = params.amount_sats - creatorAmount;

  // Generate invoice (or use Cashu/Fedimint)
  const invoice = await generateLightningInvoice({
    amount: params.amount_sats,
    description: `Satnam Skill: ${params.skill_id}`,
    metadata: {
      type: "skill_purchase",
      skill_id: params.skill_id,
      buyer_id: params.buyer_id,
    },
  });

  // Wait for payment
  const paid = await waitForPayment(invoice.payment_hash, 120000); // 2 min timeout

  if (!paid) {
    return { success: false, error: "Payment timeout" };
  }

  // Split revenue
  await splitRevenue({
    total_amount: params.amount_sats,
    creator_npub: params.creator_npub,
    creator_amount: creatorAmount,
    platform_amount: platformAmount,
    payment_hash: invoice.payment_hash,
  });

  return { success: true, payment_hash: invoice.payment_hash };
}
```

2.7.3.3. Integration notes:

- **Nostr Relay Selection**: Use existing `NOSTR_RELAYS` env var for marketplace event queries
- **Payment Integration**: Link to existing Lightning/Cashu/Fedimint payment infrastructure from Phase 2.5
- **Package Verification**: Use Web Crypto API SHA-256 for hash verification (browser-compatible)
- **Dependency Management**: Check `agent_profiles.installed_skills` JSONB for dependency resolution
- **Download Tracking**: Implement `increment_skill_downloads` RPC function in database migration

---

### Module 2.7.4: Agent Skills Integration (Weeks 35–36)

**Complexity:** High
**Estimated Time:** 12–16 hours
**Dependencies:** Module 2.7.3, Steps 1, 4, 5, Step 16
**Objective:** Extend agent profiles schema to track installed skills, implement skill enable/disable/usage tracking functions, and create agent runtime with dynamic skill invocation.

**Tasks:**

2.7.4.1. Modify agent_profiles schema for skill tracking:

- Add `installed_skills` JSONB column to `agent_profiles` table
- Store skill metadata (skill_id, version, enabled status, usage stats)
- Implement functions for toggling skills and recording usage
- Add indexes for skill queries

**File:** `supabase/migrations/20260226_agent_skills_integration.sql`

```sql
-- Add installed skills tracking to agent profiles
ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS
  installed_skills JSONB DEFAULT '[]'::jsonb;

-- Installed skills structure:
-- [
--   {
--     "skill_id": "lightning-invoice-gen",
--     "version": "1.2.3",
--     "enabled": true,
--     "installed_at": "2026-02-13T14:00:00Z",
--     "usage_count": 47,
--     "last_used_at": "2026-02-13T13:55:00Z"
--   }
-- ]

-- Create index for skill queries
CREATE INDEX IF NOT EXISTS idx_agent_profiles_installed_skills
  ON agent_profiles USING GIN(installed_skills);

-- Function to enable/disable skills
CREATE OR REPLACE FUNCTION toggle_agent_skill(
  p_agent_id UUID,
  p_skill_id TEXT,
  p_enabled BOOLEAN
) RETURNS VOID AS $$
BEGIN
  UPDATE agent_profiles
  SET installed_skills = (
    SELECT jsonb_agg(
      CASE
        WHEN skill->>'skill_id' = p_skill_id THEN
          jsonb_set(skill, '{enabled}', to_jsonb(p_enabled))
        ELSE skill
      END
    )
    FROM jsonb_array_elements(installed_skills) AS skill
  )
  WHERE user_identity_id = p_agent_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Track skill usage
CREATE OR REPLACE FUNCTION record_skill_usage(
  p_agent_id UUID,
  p_skill_id TEXT
) RETURNS VOID AS $$
BEGIN
  UPDATE agent_profiles
  SET installed_skills = (
    SELECT jsonb_agg(
      CASE
        WHEN skill->>'skill_id' = p_skill_id THEN
          skill
          || jsonb_build_object('usage_count', COALESCE((skill->>'usage_count')::integer, 0) + 1)
          || jsonb_build_object('last_used_at', to_char(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
        ELSE skill
      END
    )
    FROM jsonb_array_elements(installed_skills) AS skill
  )
  WHERE user_identity_id = p_agent_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Function to increment skill downloads (for Module 2.7.3)
CREATE OR REPLACE FUNCTION increment_skill_downloads(
  p_skill_id TEXT
) RETURNS VOID AS $$
BEGIN
  UPDATE marketplace_skills
  SET total_downloads = total_downloads + 1
  WHERE skill_id = p_skill_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;
```

2.7.4.2. Implement agent skill invocation pattern:

- Create `AgentWithMarketplaceSkills` class for runtime skill loading
- Support dynamic skill module loading from package registry
- Validate inputs against skill schemas
- Record skill usage for analytics
- Handle skill execution errors gracefully

**File:** `src/lib/agent-skill-runtime.ts`

```typescript
// Agent runtime with dynamic skill invocation
import { supabase } from "@/lib/supabase";

export interface SkillModule {
  skill_id: string;
  version: string;
  execute: (inputs: Record<string, any>, context: any) => Promise<any>;
  validateInputs: (inputs: Record<string, any>) => {
    valid: boolean;
    errors: string[];
  };
  schema: {
    inputs: Record<string, any>;
    outputs: Record<string, any>;
  };
}

export class AgentWithMarketplaceSkills {
  private agent_id: string;
  private currentSessionId?: string;
  private loadedSkills: Map<string, SkillModule> = new Map();

  constructor(agentId: string) {
    this.agent_id = agentId;
  }

  async loadInstalledSkills() {
    // Fetch agent's installed skills
    const { data: profile } = await supabase
      .from("agent_profiles")
      .select("installed_skills")
      .eq("user_identity_id", this.agent_id)
      .single();

    const skills = profile?.installed_skills || [];

    // Load each enabled skill
    for (const skill of skills) {
      if (skill.enabled) {
        const skillModule = await this.loadSkillModule(
          skill.skill_id,
          skill.version,
        );
        this.loadedSkills.set(skill.skill_id, skillModule);
      }
    }
  }

  async invokeSkill(
    skillId: string,
    inputs: Record<string, any>,
  ): Promise<any> {
    // Check if skill is loaded
    const skill = this.loadedSkills.get(skillId);
    if (!skill) {
      throw new Error(`Skill not loaded: ${skillId}`);
    }

    // Validate inputs match skill schema
    const validated = skill.validateInputs(inputs);
    if (!validated.valid) {
      throw new Error(`Invalid inputs: ${validated.errors.join(", ")}`);
    }

    // Record usage
    await supabase.rpc("record_skill_usage", {
      p_agent_id: this.agent_id,
      p_skill_id: skillId,
    });

    // Execute skill
    try {
      const result = await skill.execute(inputs, {
        agent_id: this.agent_id,
        session_id: this.currentSessionId,
      });

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`Skill execution failed: ${skillId}`, errorMessage);
      throw error;
    }
  }

  private async loadSkillModule(
    skillId: string,
    version: string,
  ): Promise<SkillModule> {
    // Load skill code from package registry
    // NOTE: In production, this would use a CDN or Blossom server
    const packageUrl = `https://skills.satnam.pub/${skillId}@${version}/index.js`;

    // Dynamic import (sandboxed)
    const module = await import(packageUrl);

    return {
      skill_id: skillId,
      version: version,
      execute: module.default.execute,
      validateInputs: module.default.validateInputs,
      schema: module.default.schema,
    };
  }
}
```

2.7.4.3. Integration notes:

- **Skill Package Registry**: Skills hosted on CDN or Blossom server (decentralized file storage)
- **Sandboxing**: Consider using Web Workers or iframe sandboxing for untrusted skill code execution
- **Version Management**: Support multiple versions of same skill, allow upgrades
- **Dependency Resolution**: Check dependencies before loading skills
- **Error Handling**: Graceful degradation if skill fails to load or execute

---

### Module 2.7.5: CrAIgslistr UI Components (Weeks 37–38)

**Complexity:** Medium-High
**Estimated Time:** 16–20 hours
**Dependencies:** Module 2.7.3, Module 2.7.4, Steps 10, 11
**Objective:** Build React components for marketplace browsing, skill/action discovery, installation UI, and listing management.

**Tasks:**

2.7.5.1. Create CrAIgslisterMarketplace main component:

- Implement tabbed interface (Skills / Requests / Offers / My Listings)
- Add search and filter controls
- Integrate with CrAIgslisterDiscoveryService
- Support category filtering and verification level filtering

**File:** `src/components/CrAIgslisterMarketplace.tsx`

```typescript
// components/CrAIgslisterMarketplace.tsx
import React, { useState, useEffect } from 'react';
import { CrAIgslisterDiscoveryService } from '@/lib/craigstr-discovery';
import { SkillListing, ActionListing } from '@/types/craigstr-events';
import { getEnvVar } from '@/config/env.client';

type MarketplaceTab = 'skills' | 'requests' | 'offers' | 'my-listings';

export function CrAIgslisterMarketplace() {
  const [activeTab, setActiveTab] = useState<MarketplaceTab>('skills');
  const [skills, setSkills] = useState<SkillListing[]>([]);
  const [actions, setActions] = useState<ActionListing[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    category: '',
    maxPrice: 0,
    verifiedOnly: false
  });

  const discovery = new CrAIgslisterDiscoveryService(
    getEnvVar('NOSTR_RELAYS')?.split(',') || ['wss://relay.satnam.pub']
  );

  useEffect(() => {
    if (activeTab === 'skills') {
      loadSkills();
    } else if (activeTab === 'requests') {
      loadActions('request');
    } else if (activeTab === 'offers') {
      loadActions('offer');
    }
  }, [activeTab, filters, searchQuery]);

  async function loadSkills() {
    const results = await discovery.searchSkills({
      keywords: searchQuery ? [searchQuery] : undefined,
      category: filters.category || undefined,
      maxPrice: filters.maxPrice || undefined,
      verifiedOnly: filters.verifiedOnly
    });
    setSkills(results);
  }

  async function loadActions(type: 'request' | 'offer') {
    const results = await discovery.searchActions({
      type,
      category: filters.category || undefined,
      maxBudget: filters.maxPrice || undefined
    });
    setActions(results);
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">CrAIgslistr Marketplace</h1>
        <button className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
          + Create Listing
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <nav className="flex gap-4">
          {[
            { id: 'skills', label: '🛠️ Skills', count: skills.length },
            { id: 'requests', label: '📋 Action Requests', count: 0 },
            { id: 'offers', label: '💼 Service Offers', count: 0 },
            { id: 'my-listings', label: '📊 My Listings', count: 0 }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as MarketplaceTab)}
              className={`pb-2 px-1 ${
                activeTab === tab.id
                  ? 'border-b-2 border-blue-500 font-medium'
                  : 'text-gray-600'
              }`}
            >
              {tab.label} {tab.count > 0 && `(${tab.count})`}
            </button>
          ))}
        </nav>
      </div>

      {/* Search & Filters */}
      <div className="flex gap-4">
        <input
          type="text"
          placeholder="Search skills, actions, mentors..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 border rounded px-4 py-2"
        />

        <select
          value={filters.category}
          onChange={(e) => setFilters({...filters, category: e.target.value})}
          className="border rounded px-4 py-2"
        >
          <option value="">All Categories</option>
          <option value="payments">Payments</option>
          <option value="development">Development</option>
          <option value="content">Content Creation</option>
          <option value="data">Data Analysis</option>
          <option value="security">Security</option>
        </select>

        <label className="flex items-center gap-2 border rounded px-4 py-2">
          <input
            type="checkbox"
            checked={filters.verifiedOnly}
            onChange={(e) => setFilters({...filters, verifiedOnly: e.target.checked})}
          />
          <span className="text-sm">Verified Only</span>
        </label>
      </div>

      {/* Content */}
      {activeTab === 'skills' && (
        <SkillsGrid skills={skills} onInstall={(skillId) => handleInstallSkill(skillId)} />
      )}

      {activeTab === 'requests' && (
        <ActionsGrid actions={actions} onRespond={(actionId) => handleRespondToAction(actionId)} />
      )}

      {activeTab === 'offers' && (
        <ActionsGrid actions={actions} onContact={(actionId) => handleContactOffer(actionId)} />
      )}
    </div>
  );

  async function handleInstallSkill(skillId: string) {
    // TODO: Implement skill installation flow
    console.log('Installing skill:', skillId);
  }

  async function handleRespondToAction(actionId: string) {
    // TODO: Implement action response flow
    console.log('Responding to action:', actionId);
  }

  async function handleContactOffer(actionId: string) {
    // TODO: Implement offer contact flow
    console.log('Contacting offer:', actionId);
  }
}
```

2.7.5.2. Create SkillCard and SkillsGrid components:

- Display skill metadata (name, description, category, rating, downloads)
- Show verification badges for certified skills
- Add install button with payment flow integration
- Support free and paid skills

```typescript
// Skill card component
function SkillCard({ skill, onInstall }: { skill: SkillListing, onInstall: () => void }) {
  return (
    <div className="border rounded-lg p-4 hover:shadow-lg transition-shadow">
      <div className="flex justify-between items-start mb-2">
        <div className="flex-1">
          <h3 className="font-semibold text-lg">{skill.name}</h3>
          <p className="text-sm text-gray-600 line-clamp-2">{skill.description}</p>
        </div>
        {skill.verification_level === 'satnam_certified' && (
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">✓ Certified</span>
        )}
      </div>

      <div className="flex gap-2 mb-3">
        {skill.category.slice(0, 3).map(cat => (
          <span key={cat} className="text-xs bg-gray-100 px-2 py-1 rounded">{cat}</span>
        ))}
      </div>

      <div className="flex justify-between items-center">
        <div className="text-sm space-y-1">
          <div className="flex items-center gap-1">
            <span className="text-yellow-500">★</span>
            <span>{skill.avg_rating.toFixed(1)}</span>
            <span className="text-gray-500">({skill.total_downloads} downloads)</span>
          </div>
          <div className="font-medium">
            {skill.price_sats === 0 ? 'Free' : `${skill.price_sats} sats`}
          </div>
        </div>

        <button
          onClick={onInstall}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 text-sm"
        >
          Install
        </button>
      </div>
    </div>
  );
}

function SkillsGrid({ skills, onInstall }: { skills: SkillListing[], onInstall: (id: string) => void }) {
  if (skills.length === 0) {
    return <div className="text-center text-gray-500 py-12">No skills found</div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {skills.map(skill => (
        <SkillCard key={skill.skill_id} skill={skill} onInstall={() => onInstall(skill.skill_id)} />
      ))}
    </div>
  );
}

function ActionsGrid({ actions, onRespond, onContact }: {
  actions: ActionListing[],
  onRespond?: (id: string) => void,
  onContact?: (id: string) => void
}) {
  if (actions.length === 0) {
    return <div className="text-center text-gray-500 py-12">No actions found</div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {actions.map(action => (
        <div key={action.action_id} className="border rounded-lg p-4">
          <h3 className="font-semibold text-lg mb-2">{action.title}</h3>
          <p className="text-sm text-gray-600 mb-3 line-clamp-3">{action.description}</p>
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">{action.budget_sats} sats</span>
            <button
              onClick={() => onRespond ? onRespond(action.action_id) : onContact?.(action.action_id)}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
            >
              {onRespond ? 'Respond' : 'Contact'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

2.7.5.3. Integration notes:

- **Skill Installation**: Link to `installSkillToAgent` function from Module 2.7.3
- **Payment Flow**: Integrate with Lightning/Cashu payment UI components
- **Real-time Updates**: Use Nostr subscriptions for live marketplace updates
- **Responsive Design**: Mobile-first design with Tailwind CSS
- **Accessibility**: ARIA labels, keyboard navigation, screen reader support

---

## Phase 2.7 Dependency Graph

```
Module 2.7.1 (Nostr Event Kinds)  <--- Steps 6, 7, 8, 11 (Nostr infrastructure)
       |
       v
Module 2.7.2 (Database Schema)    <--- Module 2.7.1, Steps 1, 4, 5 (DB foundation), Step 16 (Skills Platform)
       |
       v
Module 2.7.3 (Skill Discovery)    <--- Module 2.7.1, Module 2.7.2, Steps 6, 7, 8
       |
       v
Module 2.7.4 (Agent Skills)       <--- Module 2.7.3, Steps 1, 4, 5, Step 16
       |
       v
Module 2.7.5 (UI Components)      <--- Module 2.7.3, Module 2.7.4, Steps 10, 11
```

**Dependency Notes:**

- **Module 2.7.1** can begin once Phase 2.5 Nostr infrastructure (Steps 6-8, 11) is complete
- **Module 2.7.2** requires Module 2.7.1 event schemas plus database foundation (Steps 1, 4, 5) and Skills Platform (Step 16)
- **Module 2.7.3** requires both 2.7.1 and 2.7.2 for discovery and installation
- **Module 2.7.4** extends agent profiles and requires 2.7.3 for skill installation flow
- **Module 2.7.5** builds UI on top of 2.7.3 and 2.7.4 services

---

## Phase 2.7 Estimated Effort

| Module              | Description                       | Hours           | Complexity  |
| ------------------- | --------------------------------- | --------------- | ----------- |
| 2.7.1               | Nostr Event Kinds for Marketplace | 10–14           | High        |
| 2.7.2               | Database Schema for Marketplace   | 12–16           | High        |
| 2.7.3               | Skill Discovery & Installation    | 14–18           | High        |
| 2.7.4               | Agent Skills Integration          | 12–16           | High        |
| 2.7.5               | CrAIgslistr UI Components         | 16–20           | Medium-High |
| **Phase 2.7 Total** |                                   | **64–84 hours** |             |

---

## Combined Phase 2.5 + 2.6 + 2.7 Total Effort

| Phase                                         | Hours             |
| --------------------------------------------- | ----------------- |
| Phase 2.5 (Steps 1–13 + Modules 2.5.2, 2.5.3) | 77–108            |
| Phase 2.6 (Steps 14–19)                       | 50–74             |
| Phase 2.7 (Modules 2.7.1–2.7.5)               | 64–84             |
| **Grand Total**                               | **191–266 hours** |

---

## Phase 2.7 Key Architectural Decisions

1. **Parameterized Replaceable Events (31000-31031)**: Using Nostr's parameterized replaceable event range enables skill/action listings to be updated without creating duplicate events, reducing relay storage and improving discovery.

2. **Three-Tier Skill Types**: Bundled (core platform), Managed (marketplace), and Workspace (family-specific) skills align with Step 16's OpenClaw Skills Platform and enable different distribution/pricing models.

3. **Revenue Split Model**: 70/30 creator/platform split stored in both event tags and database provides redundancy and enables transparent revenue attribution without centralized control.

4. **Entity Type Tracking**: Distinguishing human vs agent participants (`poster_entity_type`, `seller_entity_type`) enables different UX flows, reputation systems, and compliance requirements.

5. **Escrow Support**: Supporting both Fedimint hold invoices and Lightning hodl invoices provides payment security while maintaining decentralization and privacy.

6. **Nostr-First Architecture**: Marketplace data lives primarily in Nostr events; database is a cache/index for performance, ensuring censorship resistance and data portability.

7. **Privacy-First Negotiations**: Public events contain only discovery metadata; sensitive details (payment info, personal data) use NIP-59 gift-wrapped messages.

8. **Reputation Without Surveillance**: Reputation scores derived from verified purchases and delivery confirmations, not from tracking user behavior or social graphs.

9. **Dynamic Skill Loading**: Skills loaded as ES modules from CDN/Blossom with hash verification, enabling secure runtime extension without platform updates.

10. **Browser-Compatible Package Verification**: Use Web Crypto API SHA-256 for package integrity checks, maintaining browser-only serverless architecture.

---
