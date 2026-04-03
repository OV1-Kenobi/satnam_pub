# NIP-Triumvirate Implementation Plan: Satnam as Canonical Agent Economy Platform

**Version:** 1.0 | **Date:** 2026-03-18 | **Status:** Planning
**Source:** Analysis of OpenAgentsInc/openagents `docs/NIP_SA_SKL_AC_IMPLEMENTATION_PLAN.md` + `docs/PROTOCOL_SURFACE.md` against current Satnam codebase.

> **Related file:** `docs/planning/NIP-Triumvirate-Implementation-Roadmap.md` — granular step-by-step dev guide (v3.0, 2026-03-03).  
> **This file:** Architectural integration plan grounded in the existing Satnam codebase (Supabase, Netlify Functions, CEPS, NWC/LNbits).

---

## 1. Executive Summary

The OpenAgents repo has NIP-SA/SKL/AC implemented in Rust (`crates/nostr/core`) but no
JavaScript/TypeScript consumer surface. Satnam already owns the key primitives —
`credit_envelopes`, `agent_profiles`, NWC/LNbits BOLT-11 invoicing, CEPS publishing, and NWC wallet
integration — making it the natural canonical web platform for these protocols.

> **Payment rail correction:** BIP-321 (Bitcoin URI scheme) is an on-chain payment primitive
> used elsewhere in Satnam and must not be removed from the codebase. However, NIP-AC credit
> envelopes operate entirely off-chain. The `lightning` rail uses HTLC-based BOLT-11 invoices
> generated via the existing NWC/LNbits integration. The `cashu` rail is stubbed (see §5.3).
> The `fedimint` rail is type-only. BIP-321 plays no role in NIP-AC envelope or spend flows.

The plan layers the three NIPs onto existing Satnam infrastructure across **four phases**,
adding approximately 32 new files and extending 8 existing ones.

---

## 2. Protocol Surface Reference

From `docs/PROTOCOL_SURFACE.md` in OpenAgentsInc/openagents:

| NIP     | Kind      | Purpose                                     |
| ------- | --------- | ------------------------------------------- |
| NIP-SKL | **33400** | Skill Manifest (addressable, `d-tag` keyed) |
| NIP-SKL | **33401** | Skill Version Log (append-only)             |
| NIP-SKL | **1985**  | Guardian attestation (NIP-32 labels)        |
| NIP-SKL | **5**     | Publisher-origin revocation (NIP-09)        |
| NIP-SA  | **39200** | Agent Profile                               |
| NIP-SA  | **39201** | Agent State                                 |
| NIP-SA  | **39220** | Skill License                               |
| NIP-SA  | **39221** | Skill Delivery                              |
| NIP-AC  | **39240** | Credit Intent                               |
| NIP-AC  | **39241** | Credit Offer                                |
| NIP-AC  | **39242** | Credit Envelope (budget)                    |
| NIP-AC  | **39243** | Spend Authorization                         |
| NIP-AC  | **39244** | Settlement Receipt                          |
| NIP-AC  | **39245** | Default Notice                              |

**Skill scope canonical form:** `skill:33400:<skill_pubkey>:<d-tag>:<version>:<constraints_hash>`

---

## 3. System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    SATNAM GUARDIAN DASHBOARD                      │
│  SkillRegistryBrowser | AgentProfileViewer | EnvelopeMonitor     │
└─────────────┬──────────────┬──────────────────┬─────────────────┘
              │              │                  │
   ┌──────────▼──────┐ ┌─────▼──────┐ ┌────────▼──────────────────┐
   │ src/lib/nip-skl/ │ │src/lib/nip-│ │   src/lib/nip-ac/         │
   │ manifest.ts      │ │sa/profile  │ │   envelope.ts             │
   │ runtime-gate.ts  │ │ policy.ts  │ │   revocation-watcher.ts   │
   │ registry.ts      │ │ wallet.ts  │ │   spend-authorizer.ts     │
   └──────────┬───────┘ └─────┬──────┘ └────┬──────────────────────┘
              │               │             │
   ┌──────────▼───────────────▼─────────────▼──────────────────────┐
   │                    CEPS (Nostr Publishing)                      │
   │       lib/central_event_publishing_service.ts                  │
   └────────────────────────────┬───────────────────────────────────┘
                                │
   ┌────────────────────────────▼───────────────────────────────────┐
   │                  NETLIFY FUNCTIONS (Server)                     │
   │  nip-skl-registry.js | nip-sa-agent.js | nip-ac-envelope.js   │
   │  credit-envelope-lifecycle.ts (EXTENDED)                       │
   └────────────────────────────┬───────────────────────────────────┘
                                │
   ┌────────────────────────────▼───────────────────────────────────┐
   │                        SUPABASE                                 │
   │  skill_manifests | agent_wallet_policies | credit_envelopes    │
   │  (extended with NIP-AC fields)                                 │
   └─────────────────────────────────────────────────────────────────┘
```

---

## 4. TypeScript Type Definitions

**`types/nip-triumvirate.ts`** _(new)_

```typescript
// NIP-SKL
export interface SkillManifest {
  // kind 33400
  skillScopeId: string; // "33400:<pubkey>:<d-tag>"
  version: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  runtimeConstraints: string[];
  attestations: GuardianAttestation[];
}

export interface GuardianAttestation {
  // kind 1985
  guardianPubkey: string;
  manifestEventId: string;
  label: string; // e.g. "skill/verified"
  timestamp: number;
}

// NIP-SA
export interface AgentProfile {
  // kind 39200
  agentPubkey: string;
  walletPolicy: AgentWalletPolicy;
  enabledSkills: string[]; // skillScopeIds
  sweepPolicy: SweepPolicy;
  mintPreferences: string[];
  wellKnownEndpoint?: string;
}

export interface AgentWalletPolicy {
  maxSingleSpendSats: number;
  dailyLimitSats: number;
  requiresApprovalAboveSats: number;
  preferredRail: SpendRail;
  allowedMints: string[];
}

// NIP-AC
export interface CreditEnvelopeNIP {
  // kind 39242
  envelopeId: string;
  agentPubkey: string;
  skillScopeId: string;
  manifestEventId: string; // version pin
  maxSats: number;
  spentSats: number;
  expiryUnix: number;
  spendRail: SpendRail;
  revocationStatus: RevocationStatus;
  // Lightning rail: BOLT-11 invoice + payment state (6-state settlement machine)
  bolt11Invoice?: string;
  lightningPaymentHash?: string;
  lightningInvoiceStatus?:
    | "quoted"
    | "pending"
    | "paid"
    | "expired"
    | "failed"
    | "withheld";
  paymentProofType?: string;
  paymentProofReceivedAt?: number;
  settlementProofRef?: string;
  settlementFailureReason?: string; // typed reason code
  quoteExpiryUnix?: number; // mandatory expiry for quoted state
  // Cashu rail: token or mint quote — stubbed, not yet implemented
  // TODO(cashu): add cashuToken field when NUT-05/NUT-06 rail is implemented
}

export type SpendRail = "lightning" | "cashu" | "fedimint";
export type RevocationStatus = "active" | "revoked" | "expired";
```

---

## 5. Phase 1 — Protocol Types & Core Libraries

**Duration estimate:** 3–4 days

### 5.1 NIP-SKL Core Library

| File                                      | Purpose                                                                                                                                                                                                                           |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/nip-skl/manifest.ts`             | Fetch + validate kind 33400 from relays. Verify event signature via `@noble/curves`. Cache with TTL.                                                                                                                              |
| `src/lib/nip-skl/runtime-gate.ts`         | **Critical safety gate.** Called before every skill execution. Never throws — returns `{allowed: boolean, reason: string}`. Checks attestation, revocation, version pin, constraints. Uses Web Crypto HMAC constant-time compare. |
| `src/lib/nip-skl/registry.ts`             | Client-side registry cache. Subscribes to `{kinds: [33400, 33401]}`. Persists to IndexedDB using existing vault patterns.                                                                                                         |
| `src/lib/nip-skl/attestation-verifier.ts` | Verifies kind 1985 attestations. Trusted guardian pubkeys from `VITE_GUARDIAN_PUBKEYS`. Validates `l` tag contains `skill/verified` or `skill/audited`.                                                                           |

**Verification Tier System (OA Compatibility)**

To enable cross-platform verification evidence with OpenAgents Kernel-based systems, Satnam attestations should optionally declare a verification tier in the kind 1985 `l` tag:

**Tier definitions (aligned with OpenAgents Kernel):**

- **Tier 1 (Self-Check):** Publisher's own test suite / CI
- **Tier 2 (Peer Review):** Independent reviewer, no formal independence requirement
- **Tier 3 (Audited):** Independent auditor with declared conflict-of-interest check
- **Tier 4 (Formal Verification):** Machine-checked proof or multi-party consensus

**NIP-32 label format:**

```json
["l", "skill/verified/tier3", "verification"]
["L", "verification", "satnam.pub"]
```

**Guardian attestation requirements:**

- Satnam guardians issuing kind 1985 attestations should declare the tier level
- `attestation-verifier.ts` should validate that the tier matches the guardian's declared capability
- For cross-platform consumption, Tier 3+ attestations are recommended

**Future:** Add `checker_lineage_ids` and `correlation_group` fields to `skill_manifests.attestation_event_ids` JSONB metadata for full OA VerificationPlan compatibility.

### 5.2 NIP-SA Core Library

| File                                       | Purpose                                                                                                                                                                                                                                       |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/nip-sa/profile.ts`                | Fetch kind 39200. Parse wallet policy + mint preferences. Return typed `AgentProfile`.                                                                                                                                                        |
| `src/lib/nip-sa/wallet-policy-enforcer.ts` | Enforce `AgentWalletPolicy` before any spend. Check single-spend and daily limits (queried from Supabase). Returns `{allowed: boolean, reason: string}` — never throws.                                                                       |
| `src/lib/nip-sa/sweep-executor.ts`         | **Cashu rail stub only.** Returns `{supported: false, reason: 'Cashu rail not yet implemented'}`. `// TODO(cashu): implement NUT-05 melt sweep via UnifiedWalletService`. Lightning sweeps handled by NWC via `credit-envelope-lifecycle.ts`. |
| `src/lib/nip-sa/well-known.ts`             | Maps kind 39200 event content to `.well-known/agent.json` response format.                                                                                                                                                                    |

### 5.3 NIP-AC Core Library

| File                                   | Purpose                                                                                                                                                                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/nip-ac/envelope.ts`           | Create + validate kind 39242. Compute `scope_hash` (SHA-256 via Web Crypto). For `spendRail: 'lightning'`: attach `bolt11Invoice` generated by NWC/LNbits. For `spendRail: 'cashu'`: stub — returns `{supported: false}`. `// TODO(cashu)`. |
| `src/lib/nip-ac/spend-authorizer.ts`   | Issue kind 39243. Validate: envelope not revoked, not expired, headroom ≥ requested, agent pubkey matches. Constant-time constraint hash compare.                                                                                           |
| `src/lib/nip-ac/revocation-watcher.ts` | Subscribe to kinds 1985 and 5. On match against active envelope `manifestEventId`: set `revocationStatus = 'revoked'` in Supabase, halt pending spend auth. Never bypassed.                                                                 |
| `src/lib/nip-ac/settlement.ts`         | Handle kind 39244. For `lightning` rail: verify BOLT-11 preimage via NWC payment status check. For `cashu` rail: stub — `// TODO(cashu): verify NUT-05 melt receipt`. Update `spentSats` and `revocationStatus`.                            |

---

## 6. Phase 2 — Database Schema Extensions

**Duration estimate:** 1 day

Migration file: **`supabase/migrations/20260320_nip_triumvirate.sql`** _(new)_

### New Tables

```sql
-- NIP-SKL: Skill manifests cache (relay is canonical source of truth)
CREATE TABLE IF NOT EXISTS skill_manifests (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_scope_id     TEXT NOT NULL UNIQUE,
  manifest_event_id  TEXT NOT NULL,
  version            TEXT NOT NULL,
  name               TEXT NOT NULL,
  description        TEXT,
  input_schema       JSONB DEFAULT '{}',
  output_schema      JSONB DEFAULT '{}',
  runtime_constraints TEXT[] DEFAULT '{}',
  publisher_pubkey   TEXT NOT NULL,
  attestation_status TEXT CHECK (attestation_status IN ('unverified','pending','verified','revoked'))
                     DEFAULT 'unverified',
  attestation_event_ids TEXT[] DEFAULT '{}',
  revoked_at         TIMESTAMPTZ,
  relay_hint         TEXT,
  raw_event          JSONB,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

-- NIP-AC: Spend authorizations log
CREATE TABLE IF NOT EXISTS credit_spend_authorizations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  envelope_id      UUID NOT NULL REFERENCES credit_envelopes(id) ON DELETE CASCADE,
  agent_pubkey     TEXT NOT NULL,
  skill_scope_id   TEXT NOT NULL,
  authorized_sats  BIGINT NOT NULL,
  constraints_hash TEXT NOT NULL,
  nostr_event_id   TEXT,
  status           TEXT CHECK (status IN ('pending','completed','revoked')) DEFAULT 'pending',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Revocation audit log
CREATE TABLE IF NOT EXISTS nip_revocation_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind             INTEGER NOT NULL,
  nostr_event_id   TEXT NOT NULL UNIQUE,
  pubkey           TEXT NOT NULL,
  target_event_id  TEXT,
  skill_scope_id   TEXT,
  reason           TEXT,
  detected_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### Extended Columns (Additive, Backward-Compatible)

```sql
-- NIP-SA: Extend agent_profiles
ALTER TABLE agent_profiles
  ADD COLUMN IF NOT EXISTS nip_sa_profile_event_id      TEXT,
  ADD COLUMN IF NOT EXISTS max_single_spend_sats          BIGINT DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS daily_limit_sats               BIGINT DEFAULT 100000,
  ADD COLUMN IF NOT EXISTS requires_approval_above_sats   BIGINT DEFAULT 10000,
  ADD COLUMN IF NOT EXISTS preferred_spend_rail           TEXT CHECK (preferred_spend_rail IN ('lightning','cashu','fedimint')) DEFAULT 'lightning',
  ADD COLUMN IF NOT EXISTS allowed_mints                  TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sweep_threshold_sats           BIGINT DEFAULT 50000,
  ADD COLUMN IF NOT EXISTS sweep_destination              TEXT,
  ADD COLUMN IF NOT EXISTS well_known_published_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS enabled_skill_scope_ids        TEXT[] DEFAULT '{}';

-- NIP-AC: Extend credit_envelopes
ALTER TABLE credit_envelopes
  ADD COLUMN IF NOT EXISTS skill_scope_id         TEXT REFERENCES skill_manifests(skill_scope_id),
  ADD COLUMN IF NOT EXISTS manifest_event_id      TEXT,
  ADD COLUMN IF NOT EXISTS agent_pubkey           TEXT,
  ADD COLUMN IF NOT EXISTS spend_rail             TEXT CHECK (spend_rail IN ('lightning','cashu','fedimint')) DEFAULT 'lightning',
  ADD COLUMN IF NOT EXISTS revocation_status      TEXT CHECK (revocation_status IN ('active','revoked','expired')) DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS scope_constraints_hash TEXT,
  ADD COLUMN IF NOT EXISTS spent_sats             BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nostr_envelope_event_id TEXT,
  -- Lightning rail: BOLT-11 invoice + payment state (6-state settlement machine)
  ADD COLUMN IF NOT EXISTS bolt11_invoice         TEXT,
  ADD COLUMN IF NOT EXISTS lightning_payment_hash TEXT,
  ADD COLUMN IF NOT EXISTS lightning_invoice_status TEXT CHECK (lightning_invoice_status IN ('quoted','pending','paid','expired','failed','withheld')) DEFAULT 'quoted',
  ADD COLUMN IF NOT EXISTS payment_proof_type     TEXT,
  ADD COLUMN IF NOT EXISTS payment_proof_received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS settlement_proof_ref   TEXT,
  ADD COLUMN IF NOT EXISTS settlement_failure_reason TEXT,  -- typed reason code
  ADD COLUMN IF NOT EXISTS quote_expiry_unix      BIGINT,   -- mandatory expiry for quoted state
  -- Optional: OpenAgents WorkUnit compatibility fields (for cross-platform task interoperability)
  ADD COLUMN IF NOT EXISTS oa_category            TEXT,  -- e.g. 'inference', 'data_processing', 'verification'
  ADD COLUMN IF NOT EXISTS oa_tfb                 TEXT CHECK (oa_tfb IN ('INSTANT','SHORT','LONG')),  -- feedback latency
  ADD COLUMN IF NOT EXISTS oa_severity            TEXT CHECK (oa_severity IN ('LOW','MEDIUM','HIGH')),
  ADD COLUMN IF NOT EXISTS verification_budget_hint_sats BIGINT;  -- suggested verification cost (default: maxSats * 0.1)
```

**OpenAgents WorkUnit compatibility notes:**

These fields are **optional** and only populated when:

- The envelope is created for cross-platform task delegation to an OpenAgents Kernel-based agent
- The skill manifest explicitly declares OA compatibility

**Mapping guidance:**

- `oa_tfb`: derive from `expiryUnix - created_at` (INSTANT: <5min, SHORT: <1hr, LONG: >1hr)
- `oa_severity`: derive from `maxSats` threshold (LOW: <10k sats, MEDIUM: <100k sats, HIGH: ≥100k sats)
- `verification_budget_hint_sats`: default to `maxSats * 0.1` (10% of envelope budget)
- `oa_category`: map from `skill_scope_id` or skill manifest metadata

**Settlement State Machine (Lightning rail):**

The `lightning_invoice_status` field follows a 6-state transition model:

1. **`quoted`** — Envelope created, BOLT-11 invoice generated, quote valid until `quote_expiry_unix`
2. **`pending`** — Payment initiated (HTLC in flight)
3. **`paid`** — Preimage received, settlement complete
4. **`expired`** — Quote expiry passed without payment
5. **`failed`** — Payment attempt failed, `settlement_failure_reason` populated
6. **`withheld`** — Guardian/steward intervention, funds held pending dispute resolution

**Typed reason codes** (for `settlement_failure_reason`):

- `insufficient_balance`
- `policy_violation`
- `verification_failed`
- `timeout_exceeded`
- `revocation_detected`
- `guardian_withheld`

The `settlement.ts` library (§5.3) must enforce this state machine and populate reason codes on all non-success transitions.

### RLS Policies

**Multi-actor access model for NIP-AC tables:**

- `skill_manifests`:
  - `SELECT` to all authenticated users (public registry)
  - `INSERT/UPDATE` only via service role (Netlify function validates Nostr event signature before any write)

- `credit_envelopes` (extended):
  - **Issuer identity** (steward/guardian who created the envelope): full CRUD on envelopes they created
  - **Target agent identity**: `SELECT` on envelopes where `agent_pubkey` matches their identity
  - **Stewards/guardians in same federation**: `SELECT` for monitoring according to federation membership (via `family_federations` / `family_members` DUID relationships)
  - **Service role**: migrations and ingestion jobs only, not general application querying

- `credit_spend_authorizations`:
  - **Issuer identity**: `SELECT` on spend authorizations for envelopes they created
  - **Target agent identity**: `INSERT` spend authorization rows only for envelopes where `agent_pubkey` matches; `SELECT` their own authorizations
  - **Stewards/guardians in same federation**: `SELECT` for audit/monitoring
  - **Service role**: settlement reconciliation only

- `nip_revocation_events`:
  - `SELECT` to all authenticated (public audit log)
  - `INSERT` via service role only (server-side revocation handler is authoritative)

---

## 7. Phase 3 — Netlify Functions (Server-Side Authority)

**Duration estimate:** 4–5 days

All new functions go in `netlify/functions_active/` as pure ESM with `export const handler` and `process.env` only.

### 7.1 New Function: `nip-skl-registry.js`

| Action               | Method | Description                                                               |
| -------------------- | ------ | ------------------------------------------------------------------------- |
| `search`             | GET    | Query `skill_manifests` by `skillScopeId`, `version`, `attestationStatus` |
| `upsert_manifest`    | POST   | Validate kind 33400 signature server-side, upsert to DB                   |
| `record_attestation` | POST   | Record kind 1985, update `attestation_status`                             |

Security: Verifies Nostr event signature via `@noble/secp256k1`. Rate-limited via existing rate-limiter.

**Guardian Attestation Publishing Workflow (Client-Side — Phase 5):**

**Component:** `src/components/guardian/GuardianAttestationPublisher.tsx`

**Workflow:**

1. Guardian selects unverified skill from `skill_manifests` table
2. Guardian chooses attestation label (`skill/verified`, `skill/audited`, `tier1-4`)
3. Component creates kind 1985 Nostr event with selected label
4. Guardian signs event using NIP-07 browser extension (`window.nostr.signEvent()`)
5. Component publishes event to Nostr relays (via CEPS integration)
6. Component calls `record_attestation` endpoint to update database
7. Component triggers OTS proof generation (non-blocking)

**Server-Side:**

- `record_attestation` endpoint receives already-published kind 1985 events
- Validates guardian pubkey against `VITE_GUARDIAN_PUBKEYS`
- Validates Nostr event signature using `nostr-tools` `verifyEvent()`
- Updates `skill_manifests.attestation_status = 'verified'`
- Appends event ID to `attestation_event_ids` array

**External Integration:**

- Guardians can also use external Nostr clients (Damus, Amethyst, etc.) to publish kind 1985 events
- Satnam's `record_attestation` endpoint accepts attestations from any source (as long as signature is valid and guardian is trusted)

### 7.2 New Function: `nip-sa-agent.js`

| Action            | Method | Description                                                             |
| ----------------- | ------ | ----------------------------------------------------------------------- |
| `get_profile`     | GET    | Fetch agent profile + wallet policy from `agent_profiles`               |
| `publish_profile` | POST   | Validate JWT, update wallet policy columns, publish kind 39200 via CEPS |
| `well_known`      | GET    | Return `.well-known/agent.json` format                                  |

### 7.3 New Function: `well-known-agent.js`

Serves `GET /.well-known/agent.json` for a given agent pubkey.

Add to `netlify.toml`:

```toml
[[redirects]]
  from = "/.well-known/agent.json"
  to   = "/.netlify/functions/well-known-agent"
  status = 200
```

Response format:

```json
{
  "pubkey": "<npub>",
  "name": "agent-alice",
  "version": "1.0",
  "enabled_skills": ["33400:<pubkey>:<d-tag>:<version>"],
  "wallet_policy": {
    "max_single_spend_sats": 1000,
    "preferred_rail": "lightning"
  },
  "nostr_profile_kind": 39200
}
```

### 7.4 New Function: `nip-ac-revocation-handler.js`

Receives relay webhook (or polling result) for kind 1985/5. Matches against active envelope
`manifest_event_id`. Marks affected envelopes `revoked`. Records to `nip_revocation_events`.
Sends guardian notification via existing communications infrastructure.

### 7.5 Extend Existing: `credit-envelope-lifecycle.ts`

Extend the existing `credit_intent` action to accept and validate NIP-AC fields:

- Accept `skill_scope_id`, `manifest_event_id`, `agent_pubkey`, `spend_rail`
- Validate `skill_scope_id` exists in `skill_manifests` and is not revoked
- Compute `scope_constraints_hash` = SHA-256(`skill:<skillScopeId>:<constraintsHash>`)
- For `spendRail: 'lightning'`: generate BOLT-11 invoice via existing NWC/LNbits integration, attach as `bolt11Invoice` on the envelope record
- For `spendRail: 'cashu'`: return `{supported: false, reason: 'Cashu rail not yet implemented'}` — `// TODO(cashu): NUT-06 capability check + NUT-05 melt`
- For `spendRail: 'fedimint'`: type accepted, no execution — `// TODO(fedimint)`
- Publish kind 39242 via CEPS

New actions to add:

- `issue_spend_auth` — creates row in `credit_spend_authorizations`, publishes kind 39243
- `revoke_envelope` — sets `revocationStatus = 'revoked'`, publishes kind 1985 via CEPS

### 7.6 Receipt Generation for All Authority Actions

Every NIP-AC authority mutation must generate a deterministic, content-addressed receipt stored in Supabase and optionally published via Nostr.

**Receipt schema:**

```sql
CREATE TABLE IF NOT EXISTS nip_ac_receipts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_hash       TEXT NOT NULL UNIQUE,  -- SHA-256 of canonical receipt content
  action_type        TEXT NOT NULL CHECK (action_type IN ('envelope_created','spend_authorized','envelope_revoked','settlement_completed')),
  envelope_id        UUID REFERENCES credit_envelopes(id),
  actor_pubkey       TEXT NOT NULL,
  timestamp          TIMESTAMPTZ DEFAULT NOW(),
  nostr_event_id     TEXT,                   -- published kind 39242/39243/39244/1985
  receipt_content    JSONB NOT NULL,         -- canonical deterministic JSON
  idempotency_key    TEXT,                   -- client-supplied or server-generated
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_nip_ac_receipts_envelope ON nip_ac_receipts(envelope_id);
CREATE INDEX idx_nip_ac_receipts_idempotency ON nip_ac_receipts(idempotency_key) WHERE idempotency_key IS NOT NULL;
```

**Receipt content format (deterministic JSON):**

```json
{
  "action": "envelope_created",
  "envelope_id": "<uuid>",
  "skill_scope_id": "<scope>",
  "agent_pubkey": "<npub>",
  "max_sats": 1000,
  "expiry_unix": 1234567890,
  "spend_rail": "lightning",
  "bolt11_invoice": "<invoice>",
  "timestamp": "2026-03-18T12:00:00Z",
  "actor_pubkey": "<guardian_npub>",
  "policy_bundle_hash": "<sha256>"
}
```

**Idempotency:** All Netlify function authority endpoints must accept an optional `Idempotency-Key` header. If a receipt with that key already exists, return the existing receipt instead of creating a new one. This prevents duplicate envelope creation or spend authorization on retry.

**Audit trail:** The `nip_ac_receipts` table provides a complete, deterministic audit log of all NIP-AC authority actions, enabling cross-platform verification and replay-safe reconciliation with OpenAgents Kernel-based systems.

### 7.7 New Function: `nip-ac-stats.js` (Public Transparency Endpoint)

**Status:** Low priority transparency feature. Not required for Phase 1.

**Purpose:** Public, unauthenticated, 1-minute-cached statistics endpoint for NIP-AC economy health monitoring.

**Endpoint:** `GET /.netlify/functions/nip-ac-stats`

**Response format:**

```json
{
  "timestamp": "2026-03-18T12:00:00Z",
  "cache_ttl_seconds": 60,
  "economy_stats": {
    "active_envelopes_count": 42,
    "total_sats_at_risk": 1000000,
    "total_sats_settled": 5000000,
    "revoked_envelopes_count": 3,
    "active_agents_count": 15,
    "verified_skills_count": 8
  },
  "payment_rail_distribution": {
    "lightning": 0.85,
    "cashu": 0.1,
    "fedimint": 0.05
  },
  "settlement_success_rate_7d": 0.97
}
```

**Caching:** Use Netlify's edge caching or in-memory cache with 60-second TTL.

**Privacy:** Aggregate statistics only, no individual envelope or agent details.

**RLS:** Query uses service role with aggregation-only queries.

Add to `netlify.toml`:

```toml
[[redirects]]
  from = "/api/stats"
  to = "/.netlify/functions/nip-ac-stats"
  status = 200
```

---

## 8. Phase 4 — UI Dashboard

**Duration estimate:** 5–7 days
**Status:** ✅ **COMPLETE** (Phase 5 implementation)

### 8.1 Components (Implemented in Phase 5)

| Component                      | Path                              | Status | Description                                                                                                                                         |
| ------------------------------ | --------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GuardianAttestationPublisher` | `src/components/guardian/`        | ✅     | Guardian UI for attesting skills (kind 1985). NIP-07 signing, relay publishing, database update, OTS proof generation.                              |
| `AgentManagementDashboard`     | `src/components/guardian/`        | ✅     | List agents, edit wallet policies, manage skills, view proofs. Multi-view state management.                                                         |
| `SkillLicensingManager`        | `src/components/guardian/`        | ✅     | Two-column UI for enabling/disabling skills for agents. Queries verified skills, updates enabled_skill_scope_ids.                                   |
| `OTSProofList`                 | `src/components/ots/`             | ✅     | List OTS proofs for agents. Filter by status, pagination, download .ots files, verify proofs.                                                       |
| `OTSProofStatusBadge`          | `src/components/ots/`             | ✅     | Visual indicator for proof status (pending/confirmed/failed). Color-coded badges with Bitcoin block height.                                         |
| `SkillRegistryBrowser`         | `src/components/nip-triumvirate/` | ⚠️     | (Planned) Search by `skillScopeId`, version, attestation status. Table with badge chips. Click-through to manifest detail drawer.                   |
| `SkillManifestDetail`          | `src/components/nip-triumvirate/` | ⚠️     | (Planned) Manifest JSON, guardian attestations list, version log history, runtime constraints.                                                      |
| `AgentProfileViewer`           | `src/components/nip-triumvirate/` | ⚠️     | (Planned) Agent card, wallet policy, enabled skills, sweep policy. "Publish Profile" → signs kind 39200 via CEPS.                                   |
| `EnvelopeCreationWizard`       | `src/components/nip-triumvirate/` | ⚠️     | (Planned) 5-step wizard: Select Skill → Select Agent → Configure Budget → Payment (BOLT-11 QR for lightning; Cashu rail shows "not yet available"). |
| `EnvelopeMonitor`              | `src/components/nip-triumvirate/` | ⚠️     | (Planned) Table with progress bars, expiry countdowns, status chips. Realtime via Supabase subscription.                                            |
| `SpendAuthorizationLog`        | `src/components/nip-triumvirate/` | ⚠️     | (Planned) Per-envelope spend history sub-table.                                                                                                     |
| `RevocationAlertBanner`        | `src/components/nip-triumvirate/` | ⚠️     | (Planned) Red alert banner shown when `revocationStatus = 'revoked'` detected.                                                                      |

**Phase 5 Achievements:**

- ✅ Guardian attestation publishing workflow (addresses missing kind 1985 publishing)
- ✅ Agent management with wallet policy editor
- ✅ Skill licensing UI (enable/disable skills for agents)
- ✅ OTS proof viewing and verification
- ✅ NIP-07 signer integration
- ✅ Netlify Function API integration

### 8.2 Hooks

| Hook                      | Status | Description                                                            |
| ------------------------- | ------ | ---------------------------------------------------------------------- |
| `useSkillRegistry.ts`     | ⚠️     | (Planned) Fetches + filters skill manifests from `/nip-skl-registry`   |
| `useEnvelopeMonitor.ts`   | ⚠️     | (Planned) Supabase realtime subscription on `credit_envelopes`         |
| `useRevocationWatcher.ts` | ⚠️     | (Planned) Wraps `revocation-watcher.ts`, emits revocation events to UI |

### 8.3 Control Board Integration

**Status:** ⚠️ **TODO** (20% remaining from Phase 5)

Add **"Agent Economy"** tab to existing dashboard (steward/guardian role gate):

- Contains `GuardianAttestationPublisher`, `AgentManagementDashboard`, `OTSProofList`
- Summary stats: active agents count, total skills attested, OTS proofs generated
- Guardian role check: only users with role `guardian` or `steward` can access

**Implementation Notes:**

- Modify `src/components/control-board/ControlBoard.tsx` to add new tabs
- Use existing role check pattern from Control Board
- Integrate Phase 5 components into tab views

---

## 9. End-to-End Workflow

```
1. GUARDIAN DISCOVERS SKILL
   SkillRegistryBrowser → filter attestation_status=verified
   → kind 33400 fetched from relay + kind 1985 attestations verified
   → runtime-gate.ts pre-validates constraints

2. GUARDIAN SELECTS COMPATIBLE AGENT
   AgentProfileViewer → shows AgentWalletPolicy
   wallet-policy-enforcer.ts checks compatibility:
   → agent's max_single_spend_sats >= envelope budget?
   → agent's enabled_skill_scope_ids includes this skill?

3. SYSTEM GENERATES CREDIT ENVELOPE
   EnvelopeCreationWizard POSTs to credit-envelope-lifecycle
   → Validates manifest via skill_manifests table
   → Computes scope_constraints_hash (SHA-256, Web Crypto)
   → spendRail: 'lightning' → NWC/LNbits generates BOLT-11 invoice (HTLC)
     BOLT-11 QR code rendered client-side for payment
   → spendRail: 'cashu' → returns {supported: false} (stub)
     // TODO(cashu): NUT-06 capability check + mint quote
   → spendRail: 'fedimint' → type accepted, no execution (stub)
   → Publishes kind 39242 via CEPS

4. AGENT RECEIVES ENVELOPE & VERIFIES SKILL
   Agent subscribes to kind 39242 filtered by its pubkey
   → runtime-gate.ts: verify manifest + attestation
   → Verify scope_constraints_hash (constant-time compare)
   → Confirm envelope not revoked
   → Request spend authorization via API

5. AGENT EXECUTES SKILL WITHIN BUDGET
   credit-envelope-lifecycle (issue_spend_auth)
   → spend-authorizer.ts: validate headroom, publish kind 39243
   → Agent executes, spentSats decremented
   → Settlement receipt published as kind 39244

6. SYSTEM MONITORS REVOCATIONS
   revocation-watcher.ts subscribes to kinds [1985, 5]
   → Match against active envelope manifest_event_ids
   → If match: revocation_status = 'revoked' in Supabase
   → nip-ac-revocation-handler.js fires
   → EnvelopeMonitor shows red alert banner
   → Guardian notified via existing communications service
```

---

## 10. Complete File Deliverables Map

### New Files (32 total)

```
types/
  nip-triumvirate.ts

src/lib/nip-skl/
  manifest.ts
  runtime-gate.ts             ← CRITICAL: never bypassed
  registry.ts
  attestation-verifier.ts

src/lib/nip-sa/
  profile.ts
  wallet-policy-enforcer.ts
  sweep-executor.ts
  well-known.ts

src/lib/nip-ac/
  envelope.ts
  spend-authorizer.ts
  revocation-watcher.ts       ← CRITICAL: never bypassed
  settlement.ts

netlify/functions_active/
  nip-skl-registry.js         ← Pure ESM, process.env only
  nip-sa-agent.js
  nip-ac-revocation-handler.js
  well-known-agent.js

src/components/nip-triumvirate/
  SkillRegistryBrowser.tsx
  SkillManifestDetail.tsx
  AgentProfileViewer.tsx
  AgentWalletPolicyEditor.tsx
  EnvelopeCreationWizard.tsx
  EnvelopeMonitor.tsx
  SpendAuthorizationLog.tsx
  RevocationAlertBanner.tsx

src/hooks/
  useSkillRegistry.ts
  useEnvelopeMonitor.ts
  useRevocationWatcher.ts

supabase/migrations/
  20260320_nip_triumvirate.sql
```

### Modified Files (8 total)

```
netlify/functions/agents/credit-envelope-lifecycle.ts
  → Add: skill_scope_id, manifest_event_id, agent_pubkey, spend_rail params
  → Add: issue_spend_auth and revoke_envelope actions
  → Add: kind 39242/39243 CEPS publishing

netlify.toml
  → Add: /.well-known/agent.json redirect

src/App.tsx (or router)
  → Add: /dashboard/agent-economy route

src/pages/ControlBoard.tsx
  → Add: "Agent Economy" tab (steward/guardian role gate)

types/database.ts
  → Add: skill_manifests, credit_spend_authorizations, nip_revocation_events
  → Extend: agent_profiles, credit_envelopes with new columns

lib/central_event_publishing_service.ts
  → Add: publishSkillManifest(), publishAgentProfile(), publishCreditEnvelope()
  → These are thin wrappers over existing publishEvent() — CEPS stays coordinator

src/lib/trust/feature-gates.ts
  → Add: 'nip_triumvirate' feature gate

src/services/EventSigningPermissionService.ts
  → Add: nip_ac_issue_spend_auth, nip_skl_publish_manifest permission types
```

---

## 11. Security Considerations

### Runtime Gate — Non-Bypassable

`runtime-gate.ts` must be called before every skill execution with no bypass path.
Returns `{allowed: boolean, reason: string}` — never throws — to prevent silent failures
from empty `catch` blocks.

Checks in order:

1. Manifest exists on relay with valid signature
2. Guardian attestation present from trusted pubkey (`VITE_GUARDIAN_PUBKEYS`)
3. No NIP-09 kind 5 revocation from same publisher pubkey
4. `manifestEventId` matches envelope's version pin (constant-time compare)
5. `revocationStatus = 'active'` confirmed in Supabase

### Constant-Time Comparison Pattern

All `constraintsHash` and `manifestEventId` comparisons use Web Crypto HMAC
constant-time comparison (not `===`) to prevent timing attacks:

```typescript
async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    crypto.getRandomValues(new Uint8Array(32)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const [macA, macB] = await Promise.all([
    crypto.subtle.sign("HMAC", key, enc.encode(a)),
    crypto.subtle.sign("HMAC", key, enc.encode(b)),
  ]);
  // Compare byte-by-byte with no short-circuit
  const va = new Uint8Array(macA),
    vb = new Uint8Array(macB);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}
```

### Zero-Knowledge nsec Handling

- `revocation-watcher.ts` never receives or stores nsec
- CEPS publishes kind 39242/39243 using existing `signEventWithActiveSession()` — nsec never leaves the session vault
- Guardian attestations verified by pubkey only

### Authority Transport Discipline (OA Kernel Compatibility)

For cross-platform interoperability with OpenAgents Kernel-based systems, Satnam must maintain strict separation between authority and coordination:

**Authority mutations** (envelope creation, spend authorization, revocation, settlement) occur exclusively via authenticated Netlify Functions (HTTPS). The economic state change happens in Supabase via the Netlify function **before** any Nostr event is published.

**Nostr event publication** via CEPS is a **coordination signal only** — not the authoritative state mutation itself. The Nostr event (kind 39242, 39243, 1985) serves as:

- Public notification/discovery
- Cross-platform coordination
- Audit trail reference
- **NOT** the authoritative state mutation

**Implementation pattern:**

1. Netlify function validates request, checks permissions, mutates Supabase (authority)
2. Function returns success to caller
3. Function publishes Nostr event via CEPS (coordination)
4. If CEPS publish fails, the authority action has still succeeded — the Nostr event is best-effort notification

This ensures Satnam agents can interoperate with OA kernel-based agents while preserving Satnam's Nostr-native coordination layer.

### CEPS Coordination Discipline

CEPS must stay a thin coordinator. Add `publishSkillManifest()`, `publishAgentProfile()`,
`publishCreditEnvelope()` as wrappers around the existing `publishEvent()`. Attestation
verification, spend authorization logic, and revocation decisions remain in their
respective `src/lib/nip-*` modules — never in CEPS.

---

## 12. Integration Points with Existing Satnam Infrastructure

### OTS/SimpleProof Integration (Added 2026-03-22)

**OpenTimestamps proof generation** is integrated with NIP-SKL/SA/AC attestation flows to provide immutable Bitcoin-anchored proofs for high-value events:

- **NIP-SKL attestations (kind 1985)** — Guardian attestations are timestamped to provide immutable proof of skill safety approval
- **NIP-AC credit envelopes (kind 39242)** — Financial commitments are timestamped to provide immutable proof of envelope creation
- **NIP-AC settlement receipts (kind 39244)** — Payment settlements are timestamped to provide immutable proof of completion
- **NIP-AC default notices (kind 39245)** — Dispute claims are timestamped to provide immutable proof of default

**Database schema:**

- `agent_profiles` extended with `ots_proofs_storage_url`, `simpleproof_api_key_encrypted`, `simpleproof_enabled`, `ots_attestation_count`, `last_ots_attestation_at`
- New `ots_proof_records` table stores proof metadata (proof_hash, ots_proof_file_url, bitcoin_block_height, agent_pubkey, nostr_event_id, proof_status, storage_backend)

**Storage backends:**

- Supabase Storage (default)
- IPFS (decentralized)
- Agent-controlled endpoints (self-hosted)
- SimpleProof platform (when API key is provisioned)

**SimpleProof API integration:**

- Per-agent API keys (encrypted via ClientSessionVault pattern)
- Guardian-controlled provisioning/rotation/revocation
- Feature flag: `agent_profiles.simpleproof_enabled`
- Stub functions in `src/lib/ots/simpleproof-provisioning.ts` (implementation pending developer call)

**Documentation:** See `docs/specs/OTS-SIMPLEPROOF-INTEGRATION.md` for complete design.

---

| Satnam Existing System                       | NIP Integration                                                                                                                    |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `generateBIP321URI()`                        | **Not used in NIP-AC flows.** Remains valid for other on-chain payment flows in Satnam.                                            |
| NWC/LNbits BOLT-11 invoice generation        | Used for `spendRail: 'lightning'` in kind 39242 envelope creation and kind 39244 settlement verification (BOLT-11 preimage check). |
| `credit-envelope-lifecycle.ts`               | Extended with `skill_scope_id`, `manifest_event_id`, NIP-AC fields                                                                 |
| `CEPS.publishEvent()`                        | Wraps kind 33400, 39200, 39242, 39243 publishing                                                                                   |
| `agent_profiles` table                       | Extended with NIP-SA wallet policy columns                                                                                         |
| `credit_envelopes` table                     | Extended with NIP-AC columns                                                                                                       |
| `EventSigningPermissionService`              | Add `nip_ac_issue_spend_auth`, `nip_skl_publish_manifest`                                                                          |
| `UnifiedWalletService`                       | Used by `sweep-executor.ts` to check balance before sweep                                                                          |
| `netlify/functions/security/rate-limiter.ts` | Applied to all new `functions_active/` endpoints                                                                                   |
| `src/lib/trust/feature-gates.ts`             | `'nip_triumvirate'` gate guards dashboard tab and API                                                                              |
| Supabase Realtime                            | Used in `useEnvelopeMonitor.ts` for live spend/revocation updates                                                                  |

### NIP-90 Task Market Interoperability (Future Work)

**Status:** Not required for Phase 1. Planned for Phase 2 (cross-platform interop).

For cross-platform task delegation to non-Satnam agents (e.g. OpenAgents Kernel-based DVMs), Satnam should support NIP-90 (Data Vending Machine) protocol as an interop bridge:

**Integration points:**

- `src/lib/nip-90/job-request.ts` — translates `CreditEnvelopeNIP` + `SkillManifest` into NIP-90 kind 5xxx job request
- `src/lib/nip-90/job-result.ts` — parses NIP-90 kind 6xxx job result, updates `credit_envelopes.spent_sats` and `settlement_proof_ref`
- `netlify/functions_active/nip-90-adapter.js` — server-side NIP-90 event publisher/subscriber

**Workflow:**

1. Guardian creates envelope for a skill that declares `"nip90_compatible": true` in its manifest
2. System publishes NIP-90 kind 5xxx job request with:
   - `amount` tag = `maxSats` in msats
   - `payment` tag = `bolt11Invoice`
   - `expiration` tag = `expiryUnix`
3. External DVM (OA agent or other) picks up job, executes, publishes kind 6xxx result
4. Satnam's NIP-90 adapter verifies result, marks envelope as settled

This enables Satnam to participate in the broader Nostr task market ecosystem while maintaining its privacy-first, federation-governed architecture.

---

## 13. Phased Delivery Checklist

```
PHASE 1 — Protocol Types & Libraries (days 1–4)
  [ ] types/nip-triumvirate.ts
  [ ] src/lib/nip-skl/manifest.ts
  [ ] src/lib/nip-skl/runtime-gate.ts       ← constant-time compare
  [ ] src/lib/nip-skl/registry.ts
  [ ] src/lib/nip-skl/attestation-verifier.ts
  [ ] src/lib/nip-sa/profile.ts
  [ ] src/lib/nip-sa/wallet-policy-enforcer.ts
  [ ] src/lib/nip-sa/sweep-executor.ts
  [ ] src/lib/nip-sa/well-known.ts
  [ ] src/lib/nip-ac/envelope.ts
  [ ] src/lib/nip-ac/spend-authorizer.ts
  [ ] src/lib/nip-ac/revocation-watcher.ts
  [ ] src/lib/nip-ac/settlement.ts

PHASE 2 — Database Schema (day 5)
  [ ] supabase/migrations/20260320_nip_triumvirate.sql
  [ ] types/database.ts extended
  [ ] skill_manifests table + RLS
  [ ] credit_spend_authorizations table + RLS
  [ ] nip_revocation_events table + RLS
  [ ] nip_ac_receipts table + RLS + indexes
  [ ] agent_profiles: NIP-SA wallet policy columns
  [ ] credit_envelopes: NIP-AC columns (including Lightning state fields)

PHASE 3 — Netlify Functions (days 6–10)
  [ ] netlify/functions_active/nip-skl-registry.js
  [ ] netlify/functions_active/nip-sa-agent.js
  [ ] netlify/functions_active/nip-ac-revocation-handler.js
  [ ] netlify/functions_active/well-known-agent.js
  [ ] credit-envelope-lifecycle.ts: NIP-AC extensions
  [ ] Receipt generation in all authority endpoints (envelope creation, spend auth, revocation, settlement)
  [ ] Idempotency-Key header handling in all authority endpoints
  [ ] netlify.toml: .well-known/agent.json redirect
  [ ] CEPS: publishSkillManifest / publishAgentProfile / publishCreditEnvelope

PHASE 4 — UI Dashboard (days 11–17)
  [ ] SkillRegistryBrowser.tsx
  [ ] SkillManifestDetail.tsx
  [ ] AgentProfileViewer.tsx
  [ ] AgentWalletPolicyEditor.tsx
  [ ] EnvelopeCreationWizard.tsx
  [ ] EnvelopeMonitor.tsx
  [ ] SpendAuthorizationLog.tsx
  [ ] RevocationAlertBanner.tsx
  [ ] useSkillRegistry.ts
  [ ] useEnvelopeMonitor.ts
  [ ] useRevocationWatcher.ts
  [ ] ControlBoard "Agent Economy" tab
  [ ] feature-gates.ts: 'nip_triumvirate' gate
  [ ] EventSigningPermissionService: new permission types
```

---

## 14. Key Architectural Decisions

1. **`functions_active/` not `functions/`** — New Netlify handlers are pure ESM with
   `export const handler` and `process.env` only, per Master Context architecture rules.

2. **No NIP event publishing in UI components** — Components call Netlify function APIs.
   CEPS publishing happens server-side or via the existing CEPS client pattern only.
   UI never holds private key material that creates Nostr events.

3. **`skill_manifests` is a cache, not the source of truth** — The Nostr relay is
   canonical. The DB enables fast search/filter in the UI and offline revocation checks.
   Cache invalidated when kind 33401 or kind 1985/5 revocation arrives.

4. **`runtime-gate.ts` is synchronous after cache warm** — First call fetches from relay
   and populates IndexedDB + Supabase cache. Subsequent calls within TTL are synchronous,
   adding <1ms to skill execution after warm-up.

5. **`credit_envelopes` backward-compatible extension** — All new NIP-AC columns are
   `ADD COLUMN IF NOT EXISTS` with `DEFAULT NULL`. Existing envelope records work normally.

6. **NIP-AC is off-chain only — BIP-321 is not used here** — NIP-AC credit envelopes
   operate exclusively over off-chain rails (Lightning BOLT-11 / Cashu / Fedimint).
   BIP-321 (Bitcoin URI scheme for on-chain payments) is preserved elsewhere in Satnam
   but plays no role in NIP-AC envelope creation, spend authorization, or settlement.
   The `lightning` rail uses NWC/LNbits BOLT-11 invoice generation and HTLC-based
   preimage verification. The `cashu` and `fedimint` rails are stubbed pending
   NUT-05/NUT-06 and Fedimint SDK integration respectively.

7. **Authority via HTTP, coordination via Nostr** — All economic state mutations occur
   via authenticated Netlify Functions (HTTPS). Nostr events published via CEPS are
   coordination signals only. The Supabase state change happens first; Nostr publication
   is best-effort notification. This pattern enables cross-platform interoperability with
   OpenAgents Kernel-based systems while preserving Satnam's Nostr-native coordination.

8. **Custody Model: Self-Custodial by Default** — Satnam's default custody model is
   **self-custodial / client-managed** via NWC (Nostr Wallet Connect). This differs from
   OpenAgents Kernel's server-side Wallet Executor pattern. For NIP-AC envelopes:
   - **Lightning rail:** Satnam uses NWC to generate BOLT-11 invoices. The guardian/steward's
     NWC connection is client-managed (keys held in browser session vault or hardware wallet).
   - **Server-side alternative:** For enterprise/federation deployments requiring server-side
     custody, Satnam can integrate with LNbits API directly via Netlify Functions using a
     federation-scoped API key. This is **optional** and not the default.
   - **Cross-platform interop:** When delegating tasks to OA agents, Satnam acts as the
     "buyer" role with client-managed custody, while the OA agent operates under server-side
     custody. The payment rail (BOLT-11 invoice) is custody-agnostic.
   - **Recommendation:** Preserve Satnam's self-custodial default for privacy/sovereignty;
     offer server-side custody as an opt-in federation configuration.
