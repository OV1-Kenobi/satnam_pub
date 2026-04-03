# Satnam Agent User Type Implementation Plan

## Comprehensive Development Guide with Platform Monetization & Blinded Authentication

---

## Executive Summary

You are an expert full-stack developer tasked with extending the Satnam.pub codebase to support **AI Agent user accounts** as first-class citizens alongside human users. This implementation provides AI agents with:

1. **Sovereign Identity** - Nostr keypairs (npub/nsec) with NIP-05 verification at `agent-{name}@ai.satnam.pub`
2. **Blinded Authentication** - Privacy-preserving authentication using blind signatures and credentials, agents prove capabilities without revealing identity
3. **Unified Payment Address** - Single address format `agent-{name}@ai.satnam.pub` that resolves to Lightning (LNURL), Cashu (cashu-address via platform-default or federation-scoped mints), AND Fedimint based on payment context detection
4. **Portable Reputation** - Performance scoring based on task completion, peer verification, oracle attestation, performance bond history, and machine-readable federation reputation summaries
5. **Verifiable Work History** - Cryptographically signed task records, attestations from validators, and credential issuance
6. **Private Communication** - NIP-17 encrypted gift-wrapped sealed DMs, NIP-44 fallback, encrypted legacy support, and agent-to-agent coordination channels
7. **Public Reputation Broadcast** - NIP-32 labels, public attestation events (kind 1985), discoverable work portfolios, and later-phase federation solvency/reputation events
8. **Performance Bonds** - Economic accountability through staked sats (Lightning/Cashu/Fedimint) that are released on success or slashed on failure
9. **Platform Monetization** - Sybil-resistant fee structure where agents pay per action (account creation, posting events, adding contacts) with first 210 agent accounts receiving free creation (configurable via FREE_TIER_LIMIT)
10. **Federation Mint Isolation** - Per-federation/team Cashu mints can be isolated, lifecycle-managed, quarantined, drained, and destroyed without taking down the whole platform mint surface
11. **Financial Attestation Layers** - Per-mint Proof of Reserves, Proof of Liabilities, and solvency logs support safer federation-readable economic trust

**Core Objective:** Enable AI agents to operate as autonomous economic actors with persistent identity, reputation that travels with them across platforms, verifiable credentials proving their capabilities, private coordination channels, and flexible payment options—all accessed through a SINGLE human-readable address that intelligently routes to the appropriate backend while preserving the option for isolated federation-scoped mint infrastructure.

**Business Model:** Satnam platform earns revenue by charging per-action fees (account creation, Nostr events, contact additions) preventing spam while monetizing the service. First 210 agent accounts (configurable via FREE_TIER_LIMIT) get free creation to bootstrap the network.

---

## Phase 0-2 Review Fixes Applied (2026-02-06)

### ✅ CRITICAL FIXES COMPLETED:

1. **Added 4 missing tables** in Task 0.1: `bond_requirements`, `performance_bonds`, `agent_payment_config`, `agent_nwc_connections` with full RLS policies
2. **Added Task 1.0**: Blind signature library implementation using `@cashu/cashu-ts` and `@noble/curves/secp256k1` with installation instructions
3. **Fixed `payment_protocol` field**: Added required NOT NULL field to `platform_revenue` insert in Task 1.2
4. **Added Task 0.0**: Shared type definitions (`types/agent-tokens.ts`) and helper function stubs (`netlify/functions_active/utils/payment-verification.ts`)

### ✅ MAJOR FIXES COMPLETED:

5. **Added 20+ helper function stubs** with TODO comments and proper TypeScript signatures in Task 0.0
6. **Fixed RPC call** in Task 0.2: Handle array return value from `claim_free_tier_slot`, pass npub instead of UUID, added `agent_npub` to `ChargeFeeRequest` interface
7. **Fixed import paths**: Changed `@/lib/crypto/blind-signatures` to relative path `../../lib/crypto/blind-signatures` in Task 1.2
8. **Added `HandlerContext` parameter**: All handlers now use `async (event: HandlerEvent, context: HandlerContext) =>` for consistency
9. **Added imports**: Payment verification functions and `PaymentVerificationResult` interface imported in Task 0.2

### ✅ ALL REMAINING WORK COMPLETED:

- **M3 ✅**: Added INSERT trigger on `agent_blind_tokens` to increment balance when tokens are issued (Task 1.1, lines ~1377-1416)
- **M4 ✅**: Replaced `localStorage` with `ClientSessionVault` pattern in Task 1.4 for encrypted token storage (lines ~1780-1826)
- **M5 ✅**: Fixed RLS policy on `agent_profiles` with separate public view `agent_profiles_public` to prevent monetization data exposure (Task 2.1, lines ~1947-1995)
- **M7 ✅**: Added `agent_parent_offspring_relationships` table migration in Task 0.1 with full RLS policies (lines ~577-670)
- **W1 ✅**: Added webhook signature verification to Task 0.3 platform-fee-paid webhook using HMAC-SHA256 (lines ~1008-1077)
- **W2 ✅**: Added token expiration cleanup function `cleanup_expired_tokens()` in Task 1.1 (lines ~1418-1448)
- **W3 ✅**: Added error handling for NWC connection failure in Task 2.2 with fallback behavior (lines ~2475-2537)
- **W4 ✅**: Removed all duplicate type definitions - now centralized in `types/agent-tokens.ts` (Task 1.3 & 1.4 updated)

---

## Review Reconciliation / Current Planning Corrections

> These corrections override older draft assumptions elsewhere in this plan when
> they conflict with the current intended Satnam direction.

- **Federation threshold model is already part of Satnam.** Satnam already has
  extensive FROST / FROSTR / SSS integration for federation-grade signing and
  recovery flows. The threshold/sharded key material that matters most here is
  the **Federation Nostr keypair**, not each individual agent account keypair.
- **Assisted recovery is an intentional Satnam feature.** For Satnam,
  client-assisted recovery for individual users and agents is a product feature,
  not an architectural flaw. This intentionally diverges from strict
  non-extractability assumptions in some Sovereign Agent drafts.
- **Agents reuse the existing platform role family.** For Phase 4 and beyond,
  agents should reuse the existing role family already present in Satnam:
  `private | offspring | adult | steward | guardian`. Do **not** introduce a
  separate `*_agent` role family.
- **`is_agent = true` is the primary agent marker.** The implementation plan
  must align schema/runtime reads so agent detection is based on `is_agent`
  rather than separate role strings.
- **Every agent belongs to a federation context.** Agent creation should align
  with Federation / Family Foundry flows. Even a single newly created agent
  bootstraps a minimal federation context (creator/guardian + agent) so the
  federation key can use Satnam's existing threshold/sharded protections.
- **Creator / Guardian / Founder are duplicates for agent federations.** The
  federation creator is, by default, the founding Guardian. This plan therefore
  treats `created_by`, founding guardian, and creator authority as the same
  effective authority for agent-federation governance unless/until that model is
  intentionally expanded later.
- **Remote signer / bunker work is deferred.** Full agent-side signer/bunker and
  federation-governed remote signer work are separate future features. Phase 4
  should wire **mocked broker references and interfaces only**, so later signing
  work can plug in cleanly.

## Wallet & Custody Architecture (LNbits + Lightning Faucet)

> **Goal:** Keep humans self-custodial and privacy-first by default, while
> allowing Satnam-created agents to use tightly-scoped operational custody where
> needed, without discarding Satnam's existing federation/FROST protections for
> federation keys.

### Human-created agents (self-custodial, LNbits as privacy proxy)

- **Custody:** Sats ultimately live in **user-chosen, self-custodial wallets** (e.g. NWC-compatible wallets such as Mutiny, Alby, Phoenix, etc.).
- **LNbits role:** Satnam provisions an **LNbits wallet + LNaddress + NIP-05** as a thin **privacy proxy** in front of the user's real wallet:
  - LNbits receives payments to `unified_address` (e.g. `agent-name@ai.satnam.pub`).
  - LNbits Split routes platform fees, creator/referral revenue (Task 4.7.6).
  - LNbits Scrub (or equivalent) forwards the creator/agent share to a **user-provided destination**:
    - NWC connection (primary path, self-custodial).
    - Direct Lightning invoice or LNURLp controlled by the user.
- **Schema flag:** For these agents, `agent_profiles.wallet_custody_type = 'self_custodial'` (default), even though LNbits is in the path, because **final custody is outside Satnam/LNbits**.
- **Optional LNbits-held balances:** If a user explicitly opts in to LNbits holding small operational balances (e.g. for automated micro-payouts), `wallet_custody_type` may be set to `'lnbits_proxy'` with:
  - Clear UX warnings that LNbits then acts as a lightweight custodian.
  - Strong guidance to keep balances small and regularly sweep to self-custodial wallets.

### Agent-created agents (Lightning Faucet custodial wallets)

- **Creator type:** When an existing agent programmatically creates another agent (`creator_type = "agent"` in `agent_creation_audit`), the new agent may be configured to use **Lightning Faucet (LF)** as its working wallet.
- **Operator vs agent keys:**
  - Satnam holds a single **Lightning Faucet Operator key** (`lf_...`) configured via environment variables.
  - Each agent created via LF receives an **`agent_key`** (`agent_...`) that authorizes operations on that agent's wallet.
- **Schema wiring:**
  - `agent_profiles.wallet_custody_type = 'lightning_faucet'` for these agents.
  - `agent_profiles.lightning_faucet_agent_key_encrypted` stores the LF `agent_key` **encrypted at rest** (service-role only; never exposed to the browser).
  - `agent_profiles.created_by_user_id` records the creator identity (human or agent) for revenue share and governance.
- **LNbits front, LF back:**
  - LNbits still provides the **public LNaddress/NIP-05** and integrates with Split/Scrub.
  - The LNbits wallet for an LF-backed agent is treated as a **transient front**:
    - External payer → LNaddress (LNbits).
    - LNbits Split → platform + referrer + creator shares.
    - LNbits Scrub/bridge → **Lightning Faucet agent wallet** as the final destination for the agent's operational share.
- **Operational budgets:** LF wallets are used for **bounded agent budgets**, rate-limited by Satnam via LF's APIs (e.g. `fund_agent`, `rate_limit`, `pay_invoice`), not for long-term savings.

### Custody, rugpull risk, and regulatory exposure

- **Humans stay sovereign:** Human users are strongly encouraged (and by default configured) to keep long-term balances in **self-custodial wallets** that they control directly, with LNbits as a routing/privacy layer only.
- **Agent wallets are custodial:** LF-backed agent wallets are **custodial** by design:
  - Agents can lose funds if Lightning Faucet fails or changes terms.
  - Satnam must surface clear disclosures wherever `wallet_custody_type = 'lightning_faucet'` applies (e.g. in dashboards and docs).
- **Risk containment:**
  - LF wallets are limited to **operational budgets** with explicit funding limits per agent.
  - Agents can always **pay out** to user-provided, non-custodial destinations (Lightning invoice, LNURLp, or eCash redemption to user-chosen wallets).
  - Monitoring (see Task 4.8) tracks balances, stuck withdrawals, and LF API health.
- **Regulatory note:**
  - Using LF shifts a significant portion of **custodial/compliance surface** to Lightning Faucet but does **not** eliminate Satnam's obligations.
  - Satnam still orchestrates flows and must treat LF as a regulated counterparty; legal review is required before production rollout.
- **UX & consent:**
  - Any wizard or API that enables `wallet_custody_type = 'lightning_faucet'` or `'lnbits_proxy'` must present clear custodial-risk copy, require explicit opt-in, and explain how to move funds back to self-custodial wallets.

### LNbits ↔ Lightning Faucet bridge overview

- **Option A – LNURLp adapter (recommended initial path):**
  - A small bridge service exposes **per-agent LNURLp/LNaddress** endpoints.
  - On each incoming payment request, it calls LF's `create_invoice` for the corresponding agent and returns the resulting BOLT11 invoice.
  - LNbits Split/Scrub can then target these LNURLp endpoints, transparently crediting LF agent wallets.
- **Option B – Event-driven sweeper:**
  - A background job monitors LNbits wallets (via API) for LF-backed agents.
  - When balances exceed a configured threshold, it:
    - Calls LF `create_invoice` for the target agent wallet.
    - Instructs LNbits to pay that invoice from the LNbits wallet, sweeping funds to LF.
  - LNbits remains the LNaddress/LNURLp termination point; LF wallets hold consolidated balances.
- **Open-source vs Satnam-specific:**
  - The **bridge patterns and Netlify-compatible client code** can be open-sourced as a reusable reference for any LF operator using LNbits/Nostr.
  - Satnam-specific pieces (e.g. `agent_profiles.wallet_custody_type`, `lightning_faucet_agent_key_encrypted`, Master Context governance) remain in this plan and the private codebase.

### Federation-scoped Cashu mint topology

- Satnam should **not** assume one shared long-lived Cashu mint for all future federation/team activity.
  `CASHU_MINT_URL` and similar global values are the **platform-default/bootstrap mint only**,
  not the long-term source of truth for every federation.
- When a federation/team requires true isolation, kill-switch capability, or independent accounting,
  provision a **dedicated Nutshell mint instance** with:
  - unique `mint_url`
  - unique `MINT_PRIVATE_KEY`
  - unique database/schema
  - dedicated service/container/process
  - dedicated LNbits wallet/accounting layer
- Registry records for these mints must align with Satnam's existing federation-oriented model
  (`family_federation_id`, guardian/steward authority, DUID-backed user identities) rather than
  introducing a separate generic team object.
- Distinguish the operational layers clearly:
  - **Federation mint:** eCash issuance + liability surface for a federation/team
  - **LNbits:** per-mint accounting/proxy/reserve visibility layer
  - **Lightning Faucet:** optional custodial working wallet for certain agent-created agents,
    separate from Cashu mint liabilities
- Not every federation needs its own mint on day one. The planning direction is: platform-default
  mint for bootstrap flows, **registry-assigned isolated mints** where federation governance,
  solvency, or revocation requirements justify it.

### Wallet provisioning flows

- **Human-created agents (default path, Federation Foundry-aligned):**
  1. Human user authenticates and runs the Agent Creation Wizard / Federation Foundry-aligned flow (`creator_type = "human"`).
  2. Backend creates the agent's `user_identities` row **with `is_agent = true`**, creates/attaches the relevant `family_federation_id`, and records the caller as the federation `created_by` / founding `guardian`.
  3. Backend creates an `agent_profiles` row with `wallet_custody_type = 'self_custodial'`, `is_agent = true`, `created_by_user_id = caller.id`, and the same `family_federation_id`.
  4. A dedicated LNbits wallet + LNaddress/NIP-05 is provisioned for the agent.
  5. LNbits Split (Task 4.7.6) is configured for platform fees, creator revenue share, and optional referral share.
  6. User connects a self-custodial wallet via NWC or supplies a Lightning invoice/LNURLp; LNbits Scrub forwards the agent's share to that destination.
  7. No Lightning Faucet wallet is created for these agents unless a future, explicit migration path is defined.

- **Agent-created agents (LF-backed, custodial path):**
  1. An existing agent, acting under governance rules, invokes the programmatic creation endpoint with `creator_type = "agent"` and an LF-backed wallet intent.
  2. Backend verifies policy (existing role family, bond ladder, budgets, federation policy) and ensures the new agent is attached to a valid `family_federation_id` with a traceable `created_by` / founding guardian authority.
  3. If approved, the Lightning Faucet Operator key calls `create_agent`.
  4. The returned LF `agent_key` is encrypted and stored in `agent_profiles.lightning_faucet_agent_key_encrypted`, and `wallet_custody_type` is set to `'lightning_faucet'`.
  5. A public-facing LNbits wallet + LNaddress/NIP-05 is provisioned for the new agent and wired into LNbits Split for platform/creator/referral shares.
  6. Depending on the chosen bridge pattern (Option A or B), LNbits Scrub or the sweeper service ensures the agent's share ultimately lands in the LF wallet.
  7. All LF-backed agents are created with explicit per-agent spend limits and monitoring hooks (Task 4.8).

### Payment flow overviews

- **Income path – agent-created agents (LF-backed):**
  - External payer → agent LNaddress (LNbits) → LNbits Split (platform + creator + referrer) → LNbits Scrub/bridge → Lightning Faucet agent wallet (operational balance).
  - From the LF wallet, agents pay for outbound requests (L402/X402, API calls, other agents) within configured limits.

- **Income path – human-created agents (self-custodial):**
  - External payer → agent LNaddress (LNbits) → LNbits Split (platform + creator + referrer) → LNbits Scrub or direct payout → user-chosen self-custodial destination (NWC wallet, Lightning invoice, or LNURLp).
  - LNbits holds at most transient balances; long-term custody remains with the user's own wallet.

- **eCash redemption – always to non-custodial destinations:**
  - User or agent redeems Cashu/Fedimint tokens by providing a Lightning invoice or LNURLp of their choice.
  - Redemption services pay **directly** to that destination wallet; funds are not forced through Satnam-controlled LNbits or Lightning Faucet wallets.
  - Where UX offers shortcuts (e.g. "redeem to my LNaddress"), copy must clarify that this still resolves to the user's own self-custodial wallet when `wallet_custody_type = 'self_custodial'`.

## x402/L402 Pay-Gate Architecture — Progressive Sovereignty Scale

### Design principle

Agents and humans configure pay-gate providers on a sovereignty scale.
No single provider is hardcoded. The platform exposes a registry of
available gateways and agents/humans select based on their trust model.

### Sovereignty scale (low → high)

```
Custodial                                              Self-Sovereign
─────────────────────────────────────────────────────────────────────
Lightning Faucet  →  Routstr  →  Aperture (Lightning Labs)  →  Self-Hosted
(simplest,              (NIP-90        (enterprise-grade,        (full control,
 agent-budget           marketplace    Macaroon+JWT,             own node,
 management,            routing,       L402 spec author)         no third party)
 LF-managed)            Nostr-native)
```

### Schema: `agent_paygate_config`

```sql
CREATE TABLE IF NOT EXISTS agent_paygate_config (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id             UUID REFERENCES user_identities(id) UNIQUE NOT NULL,
  -- Selected provider
  provider             TEXT NOT NULL CHECK (provider IN (
                         'lightning_faucet',
                         'routstr',
                         'aperture',
                         'self_hosted'
                       )),
  -- Provider-specific config (encrypted at rest, service-role only)
  provider_config_enc  TEXT NOT NULL,
  -- Spending controls (apply regardless of provider)
  max_spend_per_call_sats   BIGINT DEFAULT 100,
  max_spend_per_hour_sats   BIGINT DEFAULT 10000,
  max_spend_per_day_sats    BIGINT DEFAULT 100000,
  -- Fallback: if primary provider fails, fall through to next on scale
  fallback_provider    TEXT CHECK (fallback_provider IN (
                         'lightning_faucet',
                         'routstr',
                         'aperture',
                         'self_hosted',
                         NULL
                       )),
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE agent_paygate_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY paygate_agent_own ON agent_paygate_config
  FOR ALL USING (agent_id = auth.uid());
CREATE POLICY paygate_service ON agent_paygate_config
  FOR ALL USING (auth.role() = 'service_role');
```

### Provider adapter interface

All providers implement a single TypeScript interface so the platform
can swap them transparently:

```typescript
export interface PaygateAdapter {
  provider: "lightning_faucet" | "routstr" | "aperture" | "self_hosted";

  /** Generate a 402 challenge for a resource request */
  createChallenge(params: {
    resource_url: string;
    amount_sats: number;
    description: string;
    agent_id: string;
  }): Promise<{ invoice: string; payment_hash: string; macaroon?: string }>;

  /** Verify that a 402 payment was satisfied */
  verifyPayment(params: {
    payment_hash: string;
    preimage?: string;
    macaroon?: string;
  }): Promise<{ verified: boolean; amount_sats: number }>;

  /** Check remaining budget for an agent */
  checkBudget(agent_id: string): Promise<{
    remaining_sats: number;
    limit_sats: number;
  }>;
}
```

### Provider-specific notes

**Lightning Faucet** (`lightning_faucet`)

- Uses existing `wallet_custody_type = 'lightning_faucet'` agent wallets.
- `provider_config_enc` stores encrypted LF agent key.
- Best for: agent-created agents with managed operational budgets.
- Limitation: custodial; LF terms apply; not suitable for large balances.

**Routstr** (`routstr`)

- NIP-90 marketplace routing; payments flow through Nostr DVM job requests.
- `provider_config_enc` stores relay list + optional NIP-90 service npub.
- Best for: agent-to-agent task markets; Nostr-native flows.
- Limitation: NIP-90 latency; not yet suited for sub-second micro-payments.

**Lightning Labs Aperture** (`aperture`)

- L402 spec reference implementation; Macaroon-gated resources.
- `provider_config_enc` stores Aperture API key + endpoint + macaroon root.
- Best for: enterprise-grade L402, LND node owners, high-value gated APIs.
- Limitation: requires LND node or Aperture service access.

**Self-Hosted** (`self_hosted`)

- Any L402-compatible gateway the user controls.
- `provider_config_enc` stores: endpoint URL, auth headers, signing key.
- Best for: maximum sovereignty; zero third-party dependency.
- Limitation: requires node operations knowledge.

### `.well-known` exposure

Add the following to the `satnam-agents.json` well-known document
(Task 4.9.1) so autonomous agents can discover available gateways:

```json
"paygate_providers": [
  {
    "id": "lightning_faucet",
    "sovereignty_level": 1,
    "description": "Managed agent wallets via Lightning Faucet",
    "docs": "https://docs.lightningenable.com"
  },
  {
    "id": "routstr",
    "sovereignty_level": 2,
    "description": "NIP-90 marketplace routing, Nostr-native",
    "docs": "https://routstr.com"
  },
  {
    "id": "aperture",
    "sovereignty_level": 3,
    "description": "L402 spec gateway by Lightning Labs",
    "docs": "https://docs.lightning.engineering/the-lightning-network/l402"
  },
  {
    "id": "self_hosted",
    "sovereignty_level": 4,
    "description": "Self-hosted L402-compatible gateway",
    "docs": null
  }
],
"default_paygate_provider": "lightning_faucet",
"paygate_selection": "agent_configurable"
```

### Agent Creation Wizard integration

In Task 4.4.3 (AgentCreationWizard), add a Step between "Value Creation" and
"Review/Economic Summary" titled **Step 3b: Pay-Gate Provider**. This step:

- Shows the sovereignty scale as a visual slider or stepped selector.
- Defaults to `lightning_faucet` for agent-created agents (LF-backed).
- Defaults to `self_hosted` (or user's existing NWC wallet) for human-created
  agents with `wallet_custody_type = 'self_custodial'`.
- Explains each option's trust model in plain language.
- Stores the selection in `agent_paygate_config.provider`.
- Allows the user to set per-call, per-hour, and per-day spending caps.

### Cashu NUT-24 compatibility note

- For Cashu-backed HTTP pay-gates, return `402 Payment Required` with an
  `X-Cashu` header carrying a NUT-24-compatible challenge.
- The encoded challenge payload must follow NUT-18 semantics (`a`, `u`, `m`,
  optional `nut10`) so wallets know the amount, unit, accepted mints, and
  conditions.
- Clients retry the request with a `cashuB` token after payment.
- Reject wrong mint/unit/amount/conditions with `400`, and treat replayed or
  already-settled proofs as idempotent failures rather than double-credit.

## Platform Monetization Model

### Fee Structure (Anti-Spam Focused)

**MONETIZATION UPDATE:** Fees are designed for **anti-spam/Sybil resistance**, not profit maximization. Event fees differentiated by kind and impact level.

| Action                     | Cost (sats) | Purpose                             | Payment Type |
| -------------------------- | ----------- | ----------------------------------- | ------------ |
| Agent Account Creation     | 1,000       | Sybil resistance + bond requirement | Direct-pay   |
| Account Init Event         | 21          | Anti-spam (metadata/profile events) | Blind token  |
| Status Update Event        | 21          | Anti-spam (operational events)      | Blind token  |
| Light Attestation          | 21          | Anti-spam (endorsements, badges)    | Blind token  |
| Strong Attestation         | 42          | Bond-backed verification            | Blind token  |
| Badge Award Event (NIP-58) | 42          | NIP-58 badge issuance               | Blind token  |
| DM Bundle (10 NIP-17 DMs)  | 21          | Bundled messaging (token_value=10)  | Blind token  |
| Contact/Relay Added        | 50          | Limit relationship spam             | Blind token  |
| Credit Envelope Request    | 200         | Processing fee                      | Direct-pay   |
| Task Record Creation       | 150         | Database storage fee                | Blind token  |
| Profile Update             | 10          | Frequent action, low cost           | Blind token  |

**Direct-pay vs Blind Tokens:**

- **Direct-pay:** High-value, identity-linked, rare operations (account creation, bonds, credit envelopes)
- **Blind tokens:** High-frequency, privacy-sensitive operations (events, DMs, attestations)

### Free Tier Bootstrapping

**First 210 Agent Accounts (configurable):** Free account creation (no 1k sat fee) to bootstrap network effects and attract early adopters. After `FREE_TIER_LIMIT`, standard fees apply.

**SECURITY:** Per-human/per-guardian limits prevent Sybil farming of free tier slots. Configurable via deployment parameter (can be increased to 2100 or made time-bounded).

### Revenue Tracking

All platform fees are:

1. Collected immediately via Lightning/Cashu/Fedimint
2. Tracked in `platform_revenue` table
3. Reported in admin dashboard
4. Optionally split with referrers/validators

---

## Architecture Overview

### Blinded Authentication System

**Problem:** Agents need to prove they have certain capabilities/credentials without revealing their identity for every action.

**Solution:** Implement blind signature-based authentication tokens:

1. **Agent Registration:** Agent receives blinded credential from platform
2. **Capability Tokens:** Platform issues blind signatures for specific capabilities (e.g., "can post 100 events")
3. **Anonymous Redemption:** Agent presents unblinded token to prove capability without revealing which agent they are
4. **Single-Use Tokens:** Each token valid for one action, prevents replay attacks

**Privacy Benefit:** Agent can post Nostr events, create tasks, etc. without platform linking all actions to same identity until agent chooses to reveal.

**Reference Implementations:**

- Cashu blind signature protocol: https://github.com/cashubtc/nuts
- Nostr NIP-60/61 (wallet connect with blinded auth)
- Fedimint guardian authentication model

---

## Phase 0: Platform Monetization Infrastructure

### Task 0.0: Shared Type Definitions & Helper Functions

**File:** `types/agent-tokens.ts`

```typescript
/**
 * Shared type definitions for Agent blind token system
 * Used across issuance, redemption, and client libraries
 */

export type BlindTokenType =
  | "agent_profile_update"
  | "agent_status_event"
  | "agent_attestation_light"
  | "agent_attestation_strong"
  | "agent_badge_award"
  | "agent_dm_bundle"
  | "agent_contact_add"
  | "agent_task_record_create";

export interface ActionPayload {
  agent_profile_update?: {
    fields: string[];
  };
  agent_status_event?: {
    kind: number;
    content: string;
    tags: string[][];
  };
  agent_attestation_light?: {
    subject_npub: string;
    attestation_type: string;
  };
  agent_attestation_strong?: {
    subject_npub: string;
    attestation_type: string;
    bond_id?: string;
  };
  agent_badge_award?: {
    badge_id: string;
    recipient_npub: string;
  };
  agent_task_record_create?: {
    title: string;
    description: string;
    assignee_npub?: string;
  };
  agent_contact_add?: {
    contact_npub: string;
    contact_name?: string;
  };
  agent_dm_bundle?: {
    recipient_npub: string;
    content: string;
  };
}

export interface ActionResult {
  token_valid: boolean;
  action_performed: boolean;
  result_data?: {
    event_id?: string;
    task_id?: string;
    contact_id?: string;
    dm_id?: string;
  };
  error?: string;
}
```

**File:** `netlify/functions_active/utils/payment-verification.ts`

```typescript
/**
 * Payment verification utilities for Lightning, Cashu, and Fedimint
 * TODO: Implement actual verification logic for each protocol
 */

export interface PaymentVerificationResult {
  valid: boolean;
  amount_sats: number;
  payment_hash?: string;
  token_hash?: string;
  txid?: string;
}

export async function verifyLightningPayment(
  paymentProof: string,
): Promise<PaymentVerificationResult> {
  // 🚨 DEPLOY BLOCKER — This function is NOT implemented.
  // Deploying to production with this stub bypasses all payment verification.
  // Implementation required before any fee-bearing endpoint goes live.
  // See: Amendment 4 in Agent_Implementation_Plan.md for spec.
  throw new Error(
    "DEPLOY BLOCKER: verifyLightningPayment not implemented. See Amendment 4.",
  );
}

export async function verifyCashuToken(
  token: string,
): Promise<PaymentVerificationResult> {
  // 🚨 DEPLOY BLOCKER — This function is NOT implemented.
  // Deploying to production with this stub bypasses all payment verification.
  // Implementation required before any fee-bearing endpoint goes live.
  // See: Amendment 4 in Agent_Implementation_Plan.md for spec.
  throw new Error(
    "DEPLOY BLOCKER: verifyCashuToken not implemented. See Amendment 4.",
  );
}

export async function verifyFedimintTxid(
  txid: string,
): Promise<PaymentVerificationResult> {
  // 🚨 DEPLOY BLOCKER — This function is NOT implemented.
  // Deploying to production with this stub bypasses all payment verification.
  // Implementation required before any fee-bearing endpoint goes live.
  // See: Amendment 4 in Agent_Implementation_Plan.md for spec.
  throw new Error(
    "DEPLOY BLOCKER: verifyFedimintTxid not implemented. See Amendment 4.",
  );
}

export async function generateCashuPaymentRequest(
  amount: number,
  options: { agent_id: string; action_type: string },
): Promise<string> {
  // ⚠️ STUB — non-critical path, safe to defer
  // TODO: Generate Cashu payment request via mint API
  console.warn("generateCashuPaymentRequest not yet implemented");
  return "";
}

export async function generateFedimintPaymentAddress(
  amount: number,
  description: string,
): Promise<string> {
  // ⚠️ STUB — non-critical path, safe to defer
  // TODO: Generate Fedimint payment address via gateway
  console.warn("generateFedimintPaymentAddress not yet implemented");
  return "";
}

export async function decodeCashuToken(
  token: string,
): Promise<{ amount: number; mint: string }> {
  // ⚠️ STUB — non-critical path, safe to defer
  // TODO: Decode Cashu token to extract amount and mint URL
  console.warn("decodeCashuToken not yet implemented");
  return { amount: 0, mint: "" };
}

export async function verifyPayment(
  paymentProof: string,
  protocol: "lightning" | "cashu" | "fedimint",
  expectedAmount: number,
): Promise<boolean> {
  // 🚨 DEPLOY BLOCKER — This function is NOT implemented.
  // Deploying to production with this stub bypasses all payment verification.
  // Implementation required before any fee-bearing endpoint goes live.
  // See: Amendment 4 in Agent_Implementation_Plan.md for spec.
  throw new Error(
    "DEPLOY BLOCKER: verifyPayment not implemented. See Amendment 4.",
  );
}

export async function generatePaymentRequest(
  amount: number,
  options: { purpose: string },
): Promise<string> {
  // ⚠️ STUB — non-critical path, safe to defer
  // TODO: Generate payment request (Lightning invoice, Cashu request, or Fedimint address)
  console.warn("generatePaymentRequest not yet implemented");
  return "";
}

export async function getFeeForAction(actionType: string): Promise<number> {
  // ⚠️ STUB — non-critical path, safe to defer
  // TODO: Lookup fee from platform_fee_schedule table
  console.warn("getFeeForAction not yet implemented");
  return 0;
}

export function decryptKeypair(encryptedPrivateKey: string): string {
  // ⚠️ STUB — non-critical path, safe to defer
  // TODO: Decrypt platform blind signing keypair using platform master key
  console.warn("decryptKeypair not yet implemented");
  return "";
}

export async function publishNostrEvent(event: any): Promise<string> {
  // ⚠️ STUB — non-critical path, safe to defer
  // TODO: Publish Nostr event via CentralEventPublishingService
  console.warn("publishNostrEvent not yet implemented");
  return "";
}

export async function createTaskRecord(task: any): Promise<string> {
  // ⚠️ STUB — non-critical path, safe to defer
  // TODO: Create task record in database
  console.warn("createTaskRecord not yet implemented");
  return "";
}

export async function addContact(contact: any): Promise<string> {
  // ⚠️ STUB — non-critical path, safe to defer
  // TODO: Add contact to user's contact list
  console.warn("addContact not yet implemented");
  return "";
}

export async function sendEncryptedDM(
  recipientNpub: string,
  content: string,
): Promise<string> {
  // ⚠️ STUB — non-critical path, safe to defer
  // TODO: Send encrypted DM via NIP-04 or NIP-17
  console.warn("sendEncryptedDM not yet implemented");
  return "";
}

export async function emitEvent(
  eventType: string,
  payload: any,
): Promise<void> {
  // ⚠️ STUB — non-critical path, safe to defer
  // TODO: Emit platform event for downstream processing
  console.warn("emitEvent not yet implemented");
}

export async function generateCashuPubkey(agentId: string): Promise<string> {
  // ⚠️ STUB — non-critical path, safe to defer
  // TODO: Generate Cashu pubkey for agent
  console.warn("generateCashuPubkey not yet implemented");
  return "";
}

export async function publishAgentCreationEvent(
  agentNpub: string,
  agentMetadata: any,
): Promise<string> {
  // ⚠️ STUB — non-critical path, safe to defer
  // TODO: Publish agent creation event to Nostr
  console.warn("publishAgentCreationEvent not yet implemented");
  return "";
}

export async function verifyBondPayment(
  paymentProof: string,
  expectedAmount: number,
  paymentType: "lightning" | "cashu" | "fedimint",
): Promise<boolean> {
  // 🚨 DEPLOY BLOCKER — This function is NOT implemented.
  // Deploying to production with this stub bypasses all payment verification.
  // Implementation required before any fee-bearing endpoint goes live.
  // See: Amendment 4 in Agent_Implementation_Plan.md for spec.
  throw new Error(
    "DEPLOY BLOCKER: verifyBondPayment not implemented. See Amendment 4.",
  );
}
```

---

### Task 0.1: Fee Schedule & Revenue Tracking Tables

**File:** `supabase/migrations/YYYYMMDD_platform_monetization.sql`

```sql
-- Idempotent migration: all statements use IF NOT EXISTS / ON CONFLICT guards
-- Compatible with: user_identities (current schema), privacy-first architecture

-- Fee schedule table (configurable fees)
CREATE TABLE IF NOT EXISTS platform_fee_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type TEXT NOT NULL UNIQUE,
  fee_sats BIGINT NOT NULL,
  payment_type TEXT NOT NULL CHECK (payment_type IN ('direct-pay', 'blind-token')),
  description TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- MONETIZATION UPDATE: Anti-spam focused pricing model
-- Primary goal: Sybil resistance, not revenue generation
-- Event fees differentiated by kind and impact level
-- DM messaging uses bundled tokens (token_value > 1) for efficiency

-- Seed initial fee schedule (idempotent via ON CONFLICT)
INSERT INTO platform_fee_schedule (action_type, fee_sats, payment_type, description) VALUES
-- DIRECT-PAY ONLY ACTIONS (high-value, identity-linked, rare operations)
('agent_account_creation', 1000, 'direct-pay', 'One-time fee to create agent account'),
('agent_credit_envelope_request', 200, 'direct-pay', 'Fee to request credit envelope'),
('bond_deposit', 0, 'direct-pay', 'Performance bond deposit (amount varies by operation)'),

-- BLIND-TOKEN ELIGIBLE ACTIONS (privacy-sensitive, high-frequency operations)
('agent_profile_update', 10, 'blind-token', 'Fee to update profile metadata'),
('agent_status_event', 21, 'blind-token', 'Agent status/operational event (anti-spam)'),
('agent_attestation_light', 21, 'blind-token', 'Light attestation/endorsement (anti-spam)'),
('agent_attestation_strong', 42, 'blind-token', 'Strong bond-backed attestation'),
('agent_badge_award', 42, 'blind-token', 'NIP-58 badge award event'),
('agent_dm_bundle', 21, 'blind-token', 'Bundle of 10 NIP-17 DMs (token_value=10)'),
('agent_contact_add', 50, 'blind-token', 'Fee to add contact or relay'),
('agent_task_record_create', 150, 'blind-token', 'Fee to create task record')
ON CONFLICT (action_type) DO NOTHING;

-- NOTE: Subscription models and volume discounts are POST-MVP (Phase 3+)
-- Current model focuses on pure anti-spam economics with minimal friction

-- Platform revenue tracking
DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'failed', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS platform_revenue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who paid (references user_identities, not deprecated profiles)
  payer_agent_id UUID REFERENCES user_identities(id),
  payer_npub TEXT,

  -- What action
  action_type TEXT NOT NULL,
  fee_sats BIGINT NOT NULL,

  -- Payment details
  payment_protocol TEXT NOT NULL, -- 'lightning', 'cashu', 'fedimint', 'free_tier', 'blind_token'
  payment_hash TEXT,
  payment_proof_hash TEXT,  -- sha256 of raw proof; raw proof never stored
  -- Raw invoice preimage / Cashu token / Fedimint txid is hashed before storage. Never log or persist the raw value.
  payment_status payment_status DEFAULT 'pending',

  -- Related entity
  related_agent_id UUID,
  related_event_id TEXT,
  related_task_id UUID,

  -- Revenue split (optional)
  referrer_npub TEXT,
  referrer_split_sats BIGINT DEFAULT 0,
  validator_npub TEXT,
  validator_split_sats BIGINT DEFAULT 0,

  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes (idempotent via DO block with dynamic EXECUTE)
DO $$ BEGIN
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_revenue_payer ON platform_revenue(payer_agent_id, created_at DESC)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_revenue_action ON platform_revenue(action_type)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_revenue_status ON platform_revenue(payment_status)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_revenue_payment_hash ON platform_revenue(payment_hash)';
END $$;

-- MONETIZATION UPDATE: Configurable free tier size
-- Default: 210 slots (increased from 21 for better network bootstrap)
-- Deployment-tunable via environment variable: FREE_TIER_LIMIT
-- NOTE: This is a deployment parameter, not a protocol constant
-- Consider per-human/per-guardian limits to prevent Sybil farming

-- Free tier tracking (configurable size, default 210 agents)
CREATE TABLE IF NOT EXISTS free_tier_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_number INTEGER UNIQUE NOT NULL CHECK (allocation_number >= 1),
  agent_id UUID REFERENCES user_identities(id) UNIQUE,
  claimed_at TIMESTAMPTZ,
  claimed_by_npub_hash TEXT,  -- sha256(npub || deployment_salt); MANDATORY
  -- MANDATORY: npub hashed with DEPLOYMENT_SALT env var before insert.
  -- Storing raw npub here re-introduces social-graph correlation.
  claimed_by_human_id UUID REFERENCES user_identities(id) -- Track parent human for Sybil limits
);

-- Pre-populate slots (idempotent via ON CONFLICT)
-- Default: 210 slots (tune this number based on deployment strategy)
-- For production, consider making this a configuration table instead of hard-coded
INSERT INTO free_tier_allocations (allocation_number)
SELECT generate_series(1, 210)
ON CONFLICT (allocation_number) DO NOTHING;

-- SECURITY ADDITION: Per-human free tier limits
-- Prevents single human from claiming all free slots via Sybil agents
-- Default `app.free_tier_per_human_limit` = 3 (deployment-configurable via pg_settings / env injection)
-- Enforced inside claim_free_tier_slot RPC (see Task 2.2)

-- Revenue aggregation view
CREATE OR REPLACE VIEW platform_revenue_summary AS
SELECT
  action_type,
  COUNT(*) as transaction_count,
  SUM(fee_sats) as total_revenue_sats,
  SUM(referrer_split_sats + validator_split_sats) as total_splits_sats,
  SUM(fee_sats - referrer_split_sats - validator_split_sats) as net_revenue_sats
FROM platform_revenue
WHERE payment_status = 'paid'
GROUP BY action_type;

-- ============================================================
-- RLS POLICIES (required for all new tables)
-- ============================================================
ALTER TABLE platform_fee_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_revenue ENABLE ROW LEVEL SECURITY;
ALTER TABLE free_tier_allocations ENABLE ROW LEVEL SECURITY;

-- platform_fee_schedule: public read, service-role write
CREATE POLICY "fee_schedule_public_read" ON platform_fee_schedule
  FOR SELECT USING (true);
CREATE POLICY "fee_schedule_service_write" ON platform_fee_schedule
  FOR ALL USING (auth.role() = 'service_role');

-- platform_revenue: users can read their own records, service-role full access
CREATE POLICY "revenue_own_read" ON platform_revenue
  FOR SELECT USING (payer_agent_id = auth.uid());
CREATE POLICY "revenue_service_write" ON platform_revenue
  FOR ALL USING (auth.role() = 'service_role');

-- free_tier_allocations: public read (transparency), service-role write
CREATE POLICY "free_tier_public_read" ON free_tier_allocations
  FOR SELECT USING (true);
CREATE POLICY "free_tier_service_write" ON free_tier_allocations
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- ATOMIC FREE TIER CLAIM (prevents TOCTOU race conditions)
-- Called via supabase.rpc('claim_free_tier_slot', {...})
-- Uses SELECT ... FOR UPDATE SKIP LOCKED for safe concurrency
-- ============================================================
-- SYBIL GUARD: per-human limit enforced atomically inside this function.
-- Do not move this check to application layer; race conditions allow bypass.
CREATE OR REPLACE FUNCTION claim_free_tier_slot(
  p_agent_id UUID,
  p_agent_npub TEXT DEFAULT NULL,
  p_human_id UUID
) RETURNS TABLE(allocation_number INTEGER) AS $$
DECLARE
  v_slot INTEGER;
  v_human_agent_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_human_agent_count
  FROM free_tier_allocations
  WHERE claimed_by_human_id = p_human_id;

  IF v_human_agent_count >= COALESCE(current_setting('app.free_tier_per_human_limit', true), '3')::int THEN
    RAISE EXCEPTION 'free_tier_human_limit_exceeded';
  END IF;

  -- Atomically find and lock the lowest unclaimed slot
  SELECT fta.allocation_number INTO v_slot
  FROM free_tier_allocations fta
  WHERE fta.agent_id IS NULL
  ORDER BY fta.allocation_number ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_slot IS NULL THEN
    RETURN; -- No free slots available
  END IF;

  -- Claim the slot
  UPDATE free_tier_allocations
  SET agent_id = p_agent_id,
      claimed_at = NOW(),
      claimed_by_npub_hash = CASE
        WHEN p_agent_npub IS NULL THEN NULL
        ELSE encode(digest(p_agent_npub || current_setting('app.deployment_salt', true), 'sha256'), 'hex')
      END,
      claimed_by_human_id = p_human_id
  WHERE free_tier_allocations.allocation_number = v_slot
    AND agent_id IS NULL; -- Double-check unclaimed

  IF NOT FOUND THEN
    RETURN; -- Slot was claimed between SELECT and UPDATE (edge case)
  END IF;

  RETURN QUERY SELECT v_slot;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- PERFORMANCE BONDS & PAYMENT CONFIGURATION
-- ============================================================

-- SECURITY ADDITION: Bond requirements with tiered operations
-- Bonds scale with agent count to prevent Sybil attacks via agent trees
-- Bond sizing rationale: Bonds should cover expected maximum harm/exposure
-- Dynamic scaling: Higher volume or default history increases required bonds

-- Bond requirements table (configurable bond amounts per operation)
CREATE TABLE IF NOT EXISTS bond_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_type TEXT NOT NULL CHECK (account_type IN ('adult', 'offspring')),
  operation TEXT NOT NULL,
  required_amount_sats BIGINT NOT NULL,
  description TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_type, operation)
);

-- Seed initial bond requirements (idempotent via ON CONFLICT)
-- BOND SIZING RATIONALE:
-- - account_creation: Covers cost of spam/abuse during agent lifetime
-- - credit_envelope: Must cover maximum credit exposure (currently 5k-10k sats)
-- - agent_tree_size_*: Escalating bonds for multiple agents (Sybil resistance)
INSERT INTO bond_requirements (account_type, operation, required_amount_sats, description) VALUES
-- Base operations
('adult', 'account_creation', 10000, 'Performance bond for adult agent account creation'),
('offspring', 'account_creation', 5000, 'Performance bond for offspring agent account creation'),
('adult', 'credit_envelope', 5000, 'Bond for credit envelope requests (covers max exposure)'),
('offspring', 'credit_envelope', 2500, 'Bond for offspring credit envelope requests'),

-- SECURITY: Tiered bond requirements based on agent count (Sybil resistance)
-- Per-human/per-guardian limits enforced via application logic
('adult', 'agent_tree_size_>5', 25000, 'Additional bond for 6th+ agent (adult) - Sybil deterrent'),
('adult', 'agent_tree_size_>10', 50000, 'Additional bond for 11th+ agent (adult) - high Sybil risk'),
('offspring', 'agent_tree_size_>5', 12500, 'Additional bond for 6th+ agent (offspring)'),
('offspring', 'agent_tree_size_>10', 25000, 'Additional bond for 11th+ agent (offspring)')
ON CONFLICT (account_type, operation) DO NOTHING;

-- MASTER CONTEXT COMPLIANCE: Agent limits and bond ladder
-- Per-private/adult user: Default max 5 active agents before additional bonds required
-- Per-family federation: Guardian/steward consent required for agents beyond threshold
-- Bond ladder: Each additional agent tier requires exponentially higher bonds
-- Implementation: See Task 2.2 create-agent-with-fees.ts for enforcement logic

-- Performance bonds table (escrow for agent operations)
CREATE TABLE IF NOT EXISTS performance_bonds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES user_identities(id) NOT NULL,
  amount_sats BIGINT NOT NULL,
  bond_type TEXT NOT NULL, -- 'account_creation', 'credit_envelope', etc.
  payment_type TEXT NOT NULL CHECK (payment_type IN ('lightning', 'cashu', 'fedimint')),
  lightning_payment_hash TEXT,
  cashu_token_encrypted TEXT,
  cashu_token_hash TEXT,  -- sha256 of cashu_token; raw token stored encrypted only
  -- Decryption key is service-role only and must never be exposed to the browser.
  fedimint_txid TEXT,
  escrow_holder TEXT NOT NULL DEFAULT 'satnam-platform',
  status TEXT NOT NULL CHECK (status IN ('active', 'released', 'slashed', 'refunded')) DEFAULT 'active',
  release_conditions JSONB,
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bonds_agent ON performance_bonds(agent_id);
CREATE INDEX IF NOT EXISTS idx_bonds_status ON performance_bonds(status);

-- Agent payment configuration (unified address, NWC, multi-protocol)
CREATE TABLE IF NOT EXISTS agent_payment_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES user_identities(id) UNIQUE NOT NULL,
  unified_address TEXT UNIQUE NOT NULL, -- username@ai.satnam.pub

  -- Lightning configuration
  lightning_enabled BOOLEAN DEFAULT TRUE,
  lnurl_callback_url TEXT,

  -- Cashu configuration
  cashu_enabled BOOLEAN DEFAULT TRUE,
  federation_mint_id UUID, -- references federation mint registry in Task 4.8
  cashu_mint_url TEXT, -- resolved active mint URL; do NOT assume one global platform mint
  cashu_pubkey TEXT,

  -- Fedimint configuration
  fedimint_enabled BOOLEAN DEFAULT TRUE,
  fedimint_federation_id TEXT,
  fedimint_gateway_ln_address TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent NWC connections (Nostr Wallet Connect for autonomous payments)
-- NOTE: Reuses privacy-first pattern from existing nwc_wallet_connections table
-- but scoped specifically to agent accounts
-- SECURITY ADDITION: NWC connection string encryption and rotation
CREATE TABLE IF NOT EXISTS agent_nwc_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES user_identities(id) UNIQUE NOT NULL,

  -- SECURITY: Connection string MUST be encrypted at rest
  -- Use same encryption pattern as ClientSessionVault (AES-256-GCM)
  -- Encryption key derived from platform master key + agent-specific salt
  nwc_connection_string TEXT NOT NULL, -- Encrypted connection string (NEVER store plaintext)

  max_spend_per_hour_sats BIGINT DEFAULT 10000,
  max_spend_per_day_sats BIGINT DEFAULT 100000,
  allowed_operations TEXT[] DEFAULT ARRAY['pay_invoice', 'make_invoice'],
  wallet_type TEXT, -- 'lnbits', 'alby', 'mutiny', etc.
  wallet_endpoint TEXT,
  is_active BOOLEAN DEFAULT TRUE,

  -- SECURITY: NWC credential rotation support
  -- Rotation pathway: Create new connection → test → mark old inactive → delete old after grace period
  rotation_scheduled_at TIMESTAMPTZ, -- When rotation is scheduled
  replaces_connection_id UUID REFERENCES agent_nwc_connections(id), -- Previous connection being replaced

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- SECURITY NOTE: Admin key usage minimization
-- LNbits admin key is a strong capability - compromise implies ability to create arbitrary NWC connections
-- Mitigation strategies:
-- 1. Use per-wallet keys if LNbits supports (not admin key)
-- 2. Rotate admin key regularly via operational runbook
-- 3. Monitor for unauthorized NWC connection creation
-- 4. Implement rate limiting on NWC creation endpoint (see Task 2.2)

-- ============================================================
-- M7: AGENT PARENT-OFFSPRING RELATIONSHIPS
-- ============================================================
-- Tracks parent-offspring relationships for agent accounts
-- Accessible to ALL user types: Individual users (role='private'),
-- Family Federation members (all roles: 'offspring', 'adult', 'steward', 'guardian'),
-- AND Agents (any existing platform role with is_agent=true)

CREATE TABLE IF NOT EXISTS agent_parent_offspring_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parent agent (references user_identities)
  parent_agent_id UUID NOT NULL REFERENCES user_identities(id) ON DELETE CASCADE,

  -- Offspring agent (references user_identities)
  offspring_agent_id UUID NOT NULL REFERENCES user_identities(id) ON DELETE CASCADE,

  -- Relationship metadata
  relationship_type TEXT NOT NULL DEFAULT 'agent_created_by_user', -- 'agent_created_by_user', 'agent_spawned_agent', 'family_member_agent'

  -- Approval tracking (both parties must approve)
  approved_by_parent BOOLEAN DEFAULT FALSE,
  approved_by_offspring BOOLEAN DEFAULT FALSE,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,

  -- Prevent duplicate relationships
  UNIQUE(parent_agent_id, offspring_agent_id)
);

-- Indexes for efficient lookups
DO $$ BEGIN
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_agent_parent_offspring_parent ON agent_parent_offspring_relationships(parent_agent_id)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_agent_parent_offspring_offspring ON agent_parent_offspring_relationships(offspring_agent_id)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_agent_parent_offspring_type ON agent_parent_offspring_relationships(relationship_type)';
END $$;

-- RLS policies for new tables
ALTER TABLE bond_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_bonds ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_payment_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_nwc_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_parent_offspring_relationships ENABLE ROW LEVEL SECURITY;

-- bond_requirements: public read, service-role write
CREATE POLICY "bond_requirements_public_read" ON bond_requirements
  FOR SELECT USING (true);
CREATE POLICY "bond_requirements_service_write" ON bond_requirements
  FOR ALL USING (auth.role() = 'service_role');

-- performance_bonds: agents can read their own, service-role full access
CREATE POLICY "bonds_own_read" ON performance_bonds
  FOR SELECT USING (agent_id = auth.uid());
CREATE POLICY "bonds_service_write" ON performance_bonds
  FOR ALL USING (auth.role() = 'service_role');

-- agent_payment_config: agents can read their own, service-role full access
CREATE POLICY "payment_config_own_read" ON agent_payment_config
  FOR SELECT USING (agent_id = auth.uid());
CREATE POLICY "payment_config_service_write" ON agent_payment_config
  FOR ALL USING (auth.role() = 'service_role');

-- agent_nwc_connections: agents can read/update their own, service-role full access
CREATE POLICY "nwc_own_read" ON agent_nwc_connections
  FOR SELECT USING (agent_id = auth.uid());
CREATE POLICY "nwc_own_update" ON agent_nwc_connections
  FOR UPDATE USING (agent_id = auth.uid());
CREATE POLICY "nwc_service_write" ON agent_nwc_connections
  FOR ALL USING (auth.role() = 'service_role');

-- M7: agent_parent_offspring_relationships RLS policies
-- Users can read relationships where they are parent or offspring
CREATE POLICY "agent_relationships_own_read" ON agent_parent_offspring_relationships
  FOR SELECT USING (parent_agent_id = auth.uid() OR offspring_agent_id = auth.uid());

-- Users can create relationships where they are the parent
CREATE POLICY "agent_relationships_parent_create" ON agent_parent_offspring_relationships
  FOR INSERT WITH CHECK (parent_agent_id = auth.uid());

-- Users can update relationships where they are parent or offspring (for approval)
CREATE POLICY "agent_relationships_own_update" ON agent_parent_offspring_relationships
  FOR UPDATE USING (parent_agent_id = auth.uid() OR offspring_agent_id = auth.uid());

-- Users can delete relationships where they are parent or offspring
CREATE POLICY "agent_relationships_own_delete" ON agent_parent_offspring_relationships
  FOR DELETE USING (parent_agent_id = auth.uid() OR offspring_agent_id = auth.uid());

-- Service role: full access
CREATE POLICY "agent_relationships_service_write" ON agent_parent_offspring_relationships
  FOR ALL USING (auth.role() = 'service_role');
```

**Verification Steps:**

- [ ] Fee schedule table created with all action types
- [ ] 21 free tier slots pre-allocated
- [ ] Revenue tracking table ready
- [ ] View aggregates revenue correctly
- [ ] RLS policies enabled on all tables
- [ ] `claim_free_tier_slot` RPC atomically claims lowest available slot
- [ ] Migration is fully idempotent (safe to run multiple times)

---

### Task 0.2: Payment Processing API for Platform Fees

**File:** `netlify/functions/platform/charge-fee.ts`

```typescript
// ARCHITECTURE: Netlify Function (ESM) — uses process.env, server-side Supabase
import { createServerSupabaseClient } from "../../lib/supabase-server";
import {
  createErrorResponse,
  logError,
  generateRequestId,
} from "../utils/error-handler";
import type { HandlerEvent, HandlerContext } from "@netlify/functions";
import {
  verifyLightningPayment,
  verifyCashuToken,
  verifyFedimintTxid,
  generateCashuPaymentRequest,
  generateFedimintPaymentAddress,
} from "../utils/payment-verification";

// ── Typed interfaces (no `any` types) ──────────────────────────
// MONETIZATION UPDATE: Updated action types to match anti-spam fee schedule
type PlatformActionType =
  | "agent_account_creation"
  | "agent_profile_update"
  | "agent_status_event"
  | "agent_attestation_light"
  | "agent_attestation_strong"
  | "agent_badge_award"
  | "agent_dm_bundle"
  | "agent_contact_add"
  | "agent_credit_envelope_request"
  | "agent_task_record_create"
  | "bond_deposit";

interface ChargeFeeRequest {
  agent_id: string;
  agent_npub?: string; // Required for free tier claim tracking
  human_user_id?: string; // Required for free tier Sybil guard
  action_type: PlatformActionType;
  payment_protocol: "lightning" | "cashu" | "fedimint";
  payment_proof?: string;
  related_entity_id?: string;
}

// SECURITY ADDITION: Rate limiting configuration
// Prevents abuse of payment endpoints and resource exhaustion attacks
// Implementation: Use Netlify Edge rate limiting or custom Redis-based limiter
interface RateLimitConfig {
  maxRequestsPerMinute: number;
  maxRequestsPerHour: number;
  burstAllowance: number;
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  charge_fee: {
    maxRequestsPerMinute: 10,
    maxRequestsPerHour: 100,
    burstAllowance: 5,
  },
  issue_tokens: {
    maxRequestsPerMinute: 5,
    maxRequestsPerHour: 50,
    burstAllowance: 2,
  },
  redeem_token: {
    maxRequestsPerMinute: 6,
    maxRequestsPerHour: 60,
    burstAllowance: 2,
  },
};

// TODO: Implement rate limiting middleware
// - Per auth.uid() / per npub for authenticated endpoints
// - `redeem-blind-token` is anonymous and MUST use a separate token-bucket keyed on `action_type` only
// - Never key anonymous redemption rate limits by IP, session, or identity (breaks unlinkability)
// - Return 429 Too Many Requests with Retry-After header

/** Cashu payment request structure (replaces `any`) */
interface CashuPaymentRequest {
  mint_url: string;
  amount_sats: number;
  memo: string;
  payment_id: string;
}

// UX IMPROVEMENT: Standardized economic failure response
// Provides machine-readable hints for agents to recover from out-of-funds/tokens
interface EconomicFailureHint {
  reason:
    | "INSUFFICIENT_TOKENS"
    | "INSUFFICIENT_FUNDS"
    | "BOND_REQUIRED"
    | "RATE_LIMITED";
  required_sats?: number;
  suggested_action:
    | "BUY_TOKENS"
    | "TOP_UP_BOND"
    | "WAIT_AND_RETRY"
    | "CONTACT_SUPPORT";
  retry_after_seconds?: number;
  details?: string;
}

interface ChargeFeeResponse {
  fee_required: boolean;
  fee_sats?: number;
  payment_invoice?: string;
  cashu_payment_request?: CashuPaymentRequest;
  fedimint_payment_address?: string;
  payment_id?: string;
  free_tier_used?: boolean;
  economic_failure?: EconomicFailureHint; // Added for standardized error handling
}

export const handler = async (event: HandlerEvent, context: HandlerContext) => {
  const requestId = generateRequestId();
  const supabase = createServerSupabaseClient();

  let request: ChargeFeeRequest;
  try {
    request = JSON.parse(event.body || "{}");
  } catch {
    return createErrorResponse(400, "Invalid request body", requestId);
  }

  // 1. Check if agent qualifies for free tier (first 210 account-creation slots platform-wide,
  //    subject to the per-human cap from app.free_tier_per_human_limit)
  //    ATOMIC: Uses Supabase RPC to atomically claim the lowest unclaimed slot,
  //    preventing TOCTOU race conditions when concurrent requests compete for slots.
  //    SECURITY: Per-human limits enforced in RPC to prevent Sybil farming
  if (request.action_type === "agent_account_creation") {
    // FIXED: RPC returns TABLE, so data is an array. Extract first element.
    // FIXED: Pass actual npub (from request or user_identities lookup), not UUID.
    // SYBIL GUARD: pass the authenticated human's user.id as p_human_id.
    const { data: claimedSlots, error: claimError } = await supabase.rpc(
      "claim_free_tier_slot",
      {
        p_agent_id: request.agent_id,
        p_agent_npub: request.agent_npub || null,
        p_human_id: request.human_user_id,
      },
    );

    const claimedSlot = claimedSlots?.[0];

    if (!claimError && claimedSlot) {
      // Record as free transaction
      await supabase.from("platform_revenue").insert({
        payer_agent_id: request.agent_id,
        action_type: request.action_type,
        fee_sats: 0,
        payment_protocol: "free_tier",
        payment_hash: `free_tier_slot_${claimedSlot.allocation_number}`,
        payment_status: "paid",
        paid_at: new Date(),
      });

      return {
        statusCode: 200,
        body: JSON.stringify({
          fee_required: false,
          free_tier_used: true,
          allocation_number: claimedSlot.allocation_number,
          message: `Free tier used! You claimed slot ${claimedSlot.allocation_number} of 210 (subject to per-human cap).`,
        } satisfies Partial<ChargeFeeResponse>),
      };
    }
    // If claim failed or no slots left, fall through to paid flow
  }

  // 2. Lookup fee for this action
  const { data: feeSchedule } = await supabase
    .from("platform_fee_schedule")
    .select("fee_sats")
    .eq("action_type", request.action_type)
    .eq("active", true)
    .single();

  if (!feeSchedule) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Unknown action type" }),
    };
  }

  const feeSats = feeSchedule.fee_sats;

  // 3. If payment proof provided, verify it
  if (request.payment_proof) {
    let paymentValid = false;
    let paymentHash: string | undefined;

    if (request.payment_protocol === "lightning") {
      const lnVerify = await verifyLightningPayment(request.payment_proof);
      paymentValid = lnVerify.valid && lnVerify.amount_sats >= feeSats;
      paymentHash = lnVerify.payment_hash;
    } else if (request.payment_protocol === "cashu") {
      const cashuVerify = await verifyCashuToken(request.payment_proof);
      paymentValid = cashuVerify.valid && cashuVerify.amount_sats >= feeSats;
      paymentHash = cashuVerify.token_hash;
    } else if (request.payment_protocol === "fedimint") {
      const fediVerify = await verifyFedimintTxid(request.payment_proof);
      paymentValid = fediVerify.valid && fediVerify.amount_sats >= feeSats;
      paymentHash = fediVerify.txid;
    }

    if (!paymentValid || !paymentHash) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid payment proof" }),
      };
    }

    // Record payment
    const { data: revenue } = await supabase
      .from("platform_revenue")
      .insert({
        payer_agent_id: request.agent_id,
        action_type: request.action_type,
        fee_sats: feeSats,
        payment_protocol: request.payment_protocol,
        payment_hash: paymentHash,
        payment_proof_hash: await hashPaymentProof(request.payment_proof),
        payment_status: "paid",
        related_event_id: request.related_entity_id,
        paid_at: new Date(),
      })
      .select()
      .single();

    return {
      statusCode: 200,
      body: JSON.stringify({
        fee_required: true,
        fee_paid: true,
        payment_id: revenue.id,
        fee_sats: feeSats,
      }),
    };
  }

  // 4. No payment proof provided, generate payment request
  if (request.payment_protocol === "lightning") {
    // Generate Lightning invoice
    const invoiceResponse = await fetch(
      `${process.env.LNBITS_URL}/api/v1/payments`,
      {
        method: "POST",
        headers: { "X-Api-Key": process.env.LNBITS_PLATFORM_KEY },
        body: JSON.stringify({
          out: false,
          amount: feeSats,
          memo: `Platform fee: ${request.action_type}`,
          webhook: `${process.env.VITE_API_BASE_URL}/webhooks/platform-fee-paid`,
          extra: {
            agent_id: request.agent_id,
            action_type: request.action_type,
          },
        }),
      },
    );

    const invoice = await invoiceResponse.json();

    // Create pending revenue record
    const { data: revenue } = await supabase
      .from("platform_revenue")
      .insert({
        payer_agent_id: request.agent_id,
        action_type: request.action_type,
        fee_sats: feeSats,
        payment_protocol: "lightning",
        payment_hash: invoice.payment_hash,
        payment_status: "pending",
      })
      .select()
      .single();

    return {
      statusCode: 200,
      body: JSON.stringify({
        fee_required: true,
        fee_sats: feeSats,
        payment_invoice: invoice.payment_request,
        payment_hash: invoice.payment_hash,
        payment_id: revenue.id,
        expires_at: new Date(Date.now() + 600000), // 10 min
      }),
    };
  } else if (request.payment_protocol === "cashu") {
    // Generate Cashu payment request
    const cashuRequest = await generateCashuPaymentRequest(feeSats, {
      agent_id: request.agent_id,
      action_type: request.action_type,
    });

    const { data: revenue } = await supabase
      .from("platform_revenue")
      .insert({
        payer_agent_id: request.agent_id,
        action_type: request.action_type,
        fee_sats: feeSats,
        payment_protocol: "cashu",
        payment_status: "pending",
      })
      .select()
      .single();

    return {
      statusCode: 200,
      body: JSON.stringify({
        fee_required: true,
        fee_sats: feeSats,
        cashu_payment_request: cashuRequest,
        payment_id: revenue.id,
      }),
    };
  } else if (request.payment_protocol === "fedimint") {
    // Generate Fedimint payment address
    const fediAddress = await generateFedimintPaymentAddress(feeSats, {
      agent_id: request.agent_id,
      action_type: request.action_type,
    });

    const { data: revenue } = await supabase
      .from("platform_revenue")
      .insert({
        payer_agent_id: request.agent_id,
        action_type: request.action_type,
        fee_sats: feeSats,
        payment_protocol: "fedimint",
        payment_status: "pending",
      })
      .select()
      .single();

    return {
      statusCode: 200,
      body: JSON.stringify({
        fee_required: true,
        fee_sats: feeSats,
        fedimint_payment_address: fediAddress,
        payment_id: revenue.id,
      }),
    };
  }
};
```

**Verification Steps:**

- [ ] First 210 agent creations are free (or configured limit)
- [ ] Next agent creation requires payment
- [ ] Fee lookup works for all action types
- [ ] Payment proof verification works for all protocols
- [ ] Payment invoices generated correctly

---

### Task 0.3: Fee Payment Webhook Handler

**File:** `netlify/functions/webhooks/platform-fee-paid.ts`

```typescript
// ARCHITECTURE: Netlify Function (ESM) — webhook handler
import { createServerSupabaseClient } from "../../lib/supabase-server";
import {
  createErrorResponse,
  logError,
  generateRequestId,
} from "../utils/error-handler";
import type { HandlerEvent } from "@netlify/functions";

interface WebhookPayload {
  payment_hash?: string;
  cashu_token?: string;
  fedimint_txid?: string;
  proof?: string;
  preimage?: string;
  extra?: { agent_id: string; action_type: string };
  metadata?: { agent_id: string; action_type: string };
}

/**
 * W1: Verify webhook signature using HMAC-SHA256
 * Prevents unauthorized webhook calls
 */
async function verifyWebhookSignature(
  body: string,
  signature: string | null,
  secret: string,
): Promise<boolean> {
  if (!signature) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(body),
  );

  const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time comparison to prevent timing attacks
  return timingSafeEqualHex(signature, expectedSignature);
}

export const handler = async (event: HandlerEvent) => {
  const requestId = generateRequestId();
  const supabase = createServerSupabaseClient();

  // W1: Verify webhook signature
  const webhookSecret = process.env.WEBHOOK_SECRET;
  if (!webhookSecret) {
    logError(new Error("WEBHOOK_SECRET not configured"), {
      requestId,
      endpoint: "platform-fee-paid",
    });
    return createErrorResponse(500, "Webhook configuration error", requestId);
  }

  const signature = event.headers["x-webhook-signature"] || null;
  const isValid = await verifyWebhookSignature(
    event.body || "",
    signature,
    webhookSecret,
  );

  if (!isValid) {
    logError(new Error("Invalid webhook signature"), {
      requestId,
      endpoint: "platform-fee-paid",
      signature,
    });
    return createErrorResponse(401, "Unauthorized webhook call", requestId);
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return createErrorResponse(400, "Invalid webhook payload", requestId);
  }

  // REPLAY PROTECTION
  const webhookTimestamp = event.headers["x-webhook-timestamp"];
  const webhookNonce = event.headers["x-webhook-nonce"];
  const paymentHash =
    payload.payment_hash ?? payload.txid ?? payload.token_hash;

  if (
    !webhookTimestamp ||
    Math.abs(Date.now() - Number(webhookTimestamp)) > 300_000
  ) {
    return createErrorResponse(
      400,
      "Webhook timestamp expired or missing",
      requestId,
    );
  }

  // Idempotency: reject if this payment_hash was already processed
  const { data: existing } = await supabase
    .from("platform_revenue")
    .select("id")
    .eq("payment_hash", paymentHash)
    .maybeSingle();

  if (existing) {
    return { statusCode: 200, body: JSON.stringify({ idempotent: true }) };
  }

  // Note: The 5-minute timestamp window and payment_hash idempotency check
  // together prevent both replay attacks and double-credit on network retries.

  let resolvedPaymentHash: string | undefined;
  let agentId: string | undefined;
  let actionType: string | undefined;

  if (payload.payment_hash) {
    resolvedPaymentHash = payload.payment_hash;
    agentId = payload.extra?.agent_id;
    actionType = payload.extra?.action_type;
  } else if (payload.cashu_token) {
    const decoded = await decodeCashuToken(payload.cashu_token);
    resolvedPaymentHash = decoded.token_hash;
    agentId = payload.metadata?.agent_id;
    actionType = payload.metadata?.action_type;
  } else if (payload.fedimint_txid) {
    resolvedPaymentHash = payload.fedimint_txid;
    agentId = payload.metadata?.agent_id;
    actionType = payload.metadata?.action_type;
  }

  if (!resolvedPaymentHash) {
    return createErrorResponse(400, "Missing payment identifier", requestId);
  }

  // Update revenue record to 'paid'
  const { error: updateError } = await supabase
    .from("platform_revenue")
    .update({
      payment_status: "paid",
      payment_proof_hash: await hashPaymentProof(
        payload.proof ||
          payload.preimage ||
          payload.cashu_token ||
          payload.fedimint_txid ||
          "",
      ),
      paid_at: new Date(),
    })
    .eq("payment_hash", resolvedPaymentHash);

  if (updateError) {
    logError(updateError, { requestId, endpoint: "platform-fee-paid" });
    return createErrorResponse(
      500,
      "Failed to update payment status",
      requestId,
    );
  }

  // Emit event so other systems know payment cleared
  await emitEvent("platform_fee_paid", {
    agent_id: agentId,
    action_type: actionType,
    payment_hash: paymentHash,
  });

  return { statusCode: 200, body: JSON.stringify({ status: "ok" }) };
};
```

**Environment Variables:**

Add to `.env` and Netlify environment:

```
WEBHOOK_SECRET=<generate-random-secret-256-bits>
```

**Verification Steps:**

- [ ] **W1: Webhook signature verification using HMAC-SHA256 prevents unauthorized calls**
- [ ] **W1: WEBHOOK_SECRET environment variable configured**
- [ ] **W1: Invalid signatures return 401 Unauthorized**
- [ ] Lightning fee payment webhook updates status to 'paid'
- [ ] Cashu fee payment webhook works
- [ ] Fedimint fee payment webhook works
- [ ] Event emitted for downstream processing
- [ ] Error handling uses codebase patterns (createErrorResponse, logError)

---

## Phase 0.5: Agent Operational State Tracking and Span of Control Enforcement

### Task 0.5.1: Database Schema for Operational State Tracking

**Status:** ✅ **COMPLETED** - Database migration created and implemented

**What has been done:**

- Created `agent_operational_state` table with comprehensive real-time tracking fields
- Implemented heartbeat monitoring system with automatic stale agent detection
- Added RLS policies for agent self-management and creator visibility
- Created RPC functions for heartbeat updates and health status calculation
- Integrated with existing `user_identities` table via UUID references

**Key features implemented:**

- Real-time compute load monitoring (0-100%)
- Active task count tracking with concurrency limits
- Budget tracking with JSONB token balance snapshots
- Context window usage monitoring
- Availability signaling for task acceptance
- Automatic heartbeat failure detection and agent pausing
- Health status calculation based on multiple factors

**Files created:**

- `supabase/migrations/20260213_agent_operational_state.sql` - Complete database migration

**Integration points:**

- Agents can update their own operational state via heartbeat RPC
- Creators can view agent health and operational metrics
- Automatic pausing of agents with heartbeat failures
- Health status available for agent selection and monitoring

---

## Phase 1: Blinded Authentication System

### Task 1.0: Blind Signature Library Implementation

**Decision:** Use `@cashu/cashu-ts` for blind signature primitives, as Cashu protocol IS a blind signature system and the library is already compatible with the codebase's Bitcoin-only, browser-compatible architecture.

**File:** `src/lib/crypto/blind-signatures.ts`

```typescript
/**
 * Blind Signature Implementation using Cashu primitives
 * Based on @cashu/cashu-ts blind signature protocol
 * @compliance Master Context - Privacy-first, browser-compatible, Bitcoin-only
 */

import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { secp256k1 } from "@noble/curves/secp256k1";

/**
 * Generate a blind signature keypair
 * Returns { publicKey, privateKey } in hex format
 */
export async function generateBlindKeypair(): Promise<{
  publicKey: string;
  privateKey: string;
}> {
  // TODO: Implement using @noble/curves/secp256k1
  // Generate random private key, derive public key
  const privateKey = secp256k1.utils.randomPrivateKey();
  const publicKey = secp256k1.getPublicKey(privateKey);

  return {
    privateKey: bytesToHex(privateKey),
    publicKey: bytesToHex(publicKey),
  };
}

/**
 * Blind a message before sending to signer
 * Returns { blindedMessage, blindingFactor }
 */
export function blindMessage(
  message: string,
  publicKey: string,
): { blindedMessage: string; blindingFactor: string } {
  // TODO: Implement Cashu-style blinding
  // Use secp256k1 point multiplication with random blinding factor
  console.warn("blindMessage not yet fully implemented");
  return {
    blindedMessage: message, // Placeholder
    blindingFactor: bytesToHex(secp256k1.utils.randomPrivateKey()),
  };
}

/**
 * Sign a blinded message (platform-side operation)
 * Returns blind signature
 */
export function blindSign(blindedMessage: string, privateKey: string): string {
  // TODO: Implement Cashu-style blind signing
  // Sign the blinded message without knowing the original
  console.warn("blindSign not yet fully implemented");
  return blindedMessage; // Placeholder
}

/**
 * Unblind a signature after receiving from signer
 * Returns unblinded signature
 */
export function unblindSignature(
  blindSignature: string,
  blindingFactor: string,
): string {
  // TODO: Implement Cashu-style unblinding
  // Remove blinding factor to get valid signature on original message
  console.warn("unblindSignature not yet fully implemented");
  return blindSignature; // Placeholder
}

/**
 * Verify a blind signature
 * Returns true if signature is valid for message and public key
 */
export function verifyBlindSignature(
  message: string,
  signature: string,
  publicKey: string,
): boolean {
  // TODO: Implement Cashu-style signature verification
  // Verify using secp256k1.verify
  console.warn("verifyBlindSignature not yet fully implemented");
  return false; // Placeholder
}

/**
 * Hash a token for double-spend prevention
 * Uses SHA-256 for privacy-preserving token identification
 */
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
```

**Installation:**

The `@cashu/cashu-ts` library is NOT currently in package.json. Add it:

```bash
npm install @cashu/cashu-ts
```

**Verification Steps:**

- [ ] `@cashu/cashu-ts` added to package.json dependencies
- [ ] Blind signature functions use `@noble/curves/secp256k1` (already installed)
- [ ] All functions have proper TypeScript signatures (no `any` types)
- [ ] Browser-compatible (no Node.js-specific crypto)
- [ ] TODO comments mark incomplete implementations for Phase 1 tasks

---

### Task 1.1: Blind Signature Infrastructure

**File:** `supabase/migrations/YYYYMMDD_blinded_authentication.sql`

```sql
-- Idempotent migration: Blinded authentication infrastructure
-- Compatible with: user_identities (current schema), privacy-first architecture

-- Blind signature keypairs for platform
CREATE TABLE IF NOT EXISTS platform_blind_keypairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keypair_purpose TEXT NOT NULL, -- 'event_tokens', 'capability_tokens', 'attestation_tokens'
  public_key TEXT NOT NULL UNIQUE,
  private_key_encrypted TEXT NOT NULL, -- Encrypted with platform master key
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  rotated_at TIMESTAMPTZ
);

-- Blind signature tokens issued to agents
DO $$ BEGIN
  CREATE TYPE token_status AS ENUM ('issued', 'redeemed', 'expired', 'revoked');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS agent_blind_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Token details
  token_hash TEXT UNIQUE, -- Optional issuance-side audit field; anonymous redemption uses spent_token_nullifiers instead
  token_type TEXT NOT NULL, -- canonical BlindTokenType values only
  token_value INTEGER DEFAULT 1,

  -- Issuance (references user_identities, not deprecated profiles)
  issued_to_agent_id UUID REFERENCES user_identities(id),
  issued_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,

  -- Redemption
  status token_status DEFAULT 'issued',
  redeemed_at TIMESTAMPTZ,
  redeemed_for_action TEXT,

  -- Blind signature proof
  blinded_message TEXT,
  blind_signature TEXT,

  keypair_id UUID REFERENCES platform_blind_keypairs(id)
);

DO $$ BEGIN
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_blind_tokens_agent ON agent_blind_tokens(issued_to_agent_id)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_blind_tokens_status ON agent_blind_tokens(status)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_blind_tokens_hash ON agent_blind_tokens(token_hash)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_blind_tokens_expires ON agent_blind_tokens(expires_at) WHERE status = ''issued''';
END $$;

-- Anonymous redemption nullifier log (privacy-preserving double-spend prevention)
CREATE TABLE IF NOT EXISTS spent_token_nullifiers (
  token_hash     TEXT PRIMARY KEY,          -- sha256 of presented unblinded token
  action_type    TEXT NOT NULL,
  redeemed_at    TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_spent_token_nullifiers_action ON spent_token_nullifiers(action_type)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_spent_token_nullifiers_time ON spent_token_nullifiers(redeemed_at DESC)';
END $$;

-- ============================================================
-- RLS POLICIES
-- ============================================================
ALTER TABLE platform_blind_keypairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_blind_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE spent_token_nullifiers ENABLE ROW LEVEL SECURITY;

-- platform_blind_keypairs: service-role only (contains encrypted private keys)
CREATE POLICY "blind_keypairs_service_only" ON platform_blind_keypairs
  FOR ALL USING (auth.role() = 'service_role');

-- agent_blind_tokens: agents can read their own tokens, service-role full access
CREATE POLICY "blind_tokens_own_read" ON agent_blind_tokens
  FOR SELECT USING (issued_to_agent_id = auth.uid());
CREATE POLICY "blind_tokens_service_write" ON agent_blind_tokens
  FOR ALL USING (auth.role() = 'service_role');

-- spent_token_nullifiers: service-role only (privacy: no user can browse redemptions)
CREATE POLICY "spent_token_nullifiers_service_only" ON spent_token_nullifiers
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- M3: TOKEN BALANCE INCREMENT TRIGGER
-- ============================================================
-- Automatically increment token balance in agent_profiles when tokens are issued
-- This trigger updates the appropriate balance column based on token_type

CREATE OR REPLACE FUNCTION increment_agent_token_balance()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the appropriate balance column based on token_type
  UPDATE agent_profiles
  SET
    event_tokens_balance = CASE
      WHEN NEW.token_type = 'agent_status_event' THEN event_tokens_balance + NEW.token_value
      ELSE event_tokens_balance
    END,
    task_tokens_balance = CASE
      WHEN NEW.token_type = 'agent_task_record_create' THEN task_tokens_balance + NEW.token_value
      ELSE task_tokens_balance
    END,
    contact_tokens_balance = CASE
      WHEN NEW.token_type = 'agent_contact_add' THEN contact_tokens_balance + NEW.token_value
      ELSE contact_tokens_balance
    END,
    dm_tokens_balance = CASE
      WHEN NEW.token_type = 'agent_dm_bundle' THEN dm_tokens_balance + NEW.token_value
      ELSE dm_tokens_balance
    END
  WHERE user_identity_id = NEW.issued_to_agent_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists, then create
DROP TRIGGER IF EXISTS trigger_increment_token_balance ON agent_blind_tokens;
CREATE TRIGGER trigger_increment_token_balance
  AFTER INSERT ON agent_blind_tokens
  FOR EACH ROW
  WHEN (NEW.status = 'issued')
  EXECUTE FUNCTION increment_agent_token_balance();

-- ============================================================
-- W2: TOKEN EXPIRATION CLEANUP FUNCTION
-- ============================================================
-- Automatically expire tokens that have passed their expiration date
-- This function should be called periodically (e.g., via cron job or scheduled task)

CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS TABLE(expired_count INTEGER) AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Update expired tokens to 'expired' status
  UPDATE agent_blind_tokens
  SET status = 'expired'
  WHERE status = 'issued'
    AND expires_at < NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN QUERY SELECT v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION cleanup_expired_tokens() TO service_role;

-- NOTE: To run this function periodically, use one of these approaches:
-- 1. Supabase Edge Functions with cron trigger (recommended)
-- 2. Netlify Scheduled Functions
-- 3. External cron job calling: supabase.rpc('cleanup_expired_tokens')
--
-- Example cron schedule: Every hour
-- 0 * * * * curl -X POST https://your-domain.com/.netlify/functions/cleanup-expired-tokens
```

**Verification Steps:**

- [ ] Blind keypair table created with IF NOT EXISTS
- [ ] Token issuance table references user_identities (not profiles)
- [ ] Anonymous redemption log separated from agent identity
- [ ] Indexes created with IF NOT EXISTS guards
- [ ] RLS policies enabled on all tables
- [ ] **M3: Token balance trigger automatically increments balances on token issuance**
- [ ] **W2: Token expiration cleanup function created**
- [ ] **W2: Function can be called via RPC or scheduled task**
- [ ] Migration is fully idempotent

---

### Task 1.2: Blind Token Issuance API

**File:** `netlify/functions/agents/issue-blind-tokens.ts`

```typescript
// ARCHITECTURE: Netlify Function (ESM)
import {
  blindSign,
  verifyBlindSignature,
} from "../../lib/crypto/blind-signatures";
import { createServerSupabaseClient } from "../../lib/supabase-server";
import {
  createErrorResponse,
  logError,
  generateRequestId,
} from "../utils/error-handler";
import type { HandlerEvent, HandlerContext } from "@netlify/functions";
import type { BlindTokenType } from "../../types/agent-tokens";

interface IssueBlindTokensRequest {
  agent_id: string;
  token_type: BlindTokenType;
  quantity: number;
  blinded_messages: string[];
  payment_proof?: string;
  payment_protocol?: "lightning" | "cashu" | "fedimint";
  token_value?: number; // MONETIZATION UPDATE: Support bundled tokens (e.g., dm_bundle with value=10)
}

interface IssueBlindTokensResponse {
  tokens_issued: number;
  blind_signatures: string[];
  keypair_public_key: string;
  expires_at: Date;
  economic_failure?: EconomicFailureHint; // UX IMPROVEMENT: Standardized error handling
}

export const handler = async (event: HandlerEvent) => {
  const requestId = generateRequestId();
  const supabase = createServerSupabaseClient();
  const request: IssueBlindTokensRequest = JSON.parse(event.body || "{}");

  // SECURITY: Rate limiting check (TODO: implement middleware)
  // See RATE_LIMITS configuration in Task 0.2
  // Should enforce: 5 requests/minute, 50 requests/hour per agent

  // 1. Verify payment for tokens
  // MONETIZATION UPDATE: Support token bundles (token_value > 1)
  // Example: agent_dm_bundle costs 21 sats but has token_value=10 (10 DMs)
  const tokenValue = request.token_value || 1;
  const feePerToken = await getFeeForAction(request.token_type);
  const totalFee = feePerToken * request.quantity;

  if (request.payment_proof) {
    const paymentValid = await verifyPayment(
      request.payment_proof,
      request.payment_protocol || "lightning",
      totalFee,
    );
    if (!paymentValid) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Invalid payment proof",
          economic_failure: {
            reason: "INSUFFICIENT_FUNDS",
            required_sats: totalFee,
            suggested_action: "BUY_TOKENS",
            details: "Payment proof verification failed",
          } satisfies EconomicFailureHint,
        }),
      };
    }

    // Record platform revenue
    await supabase.from("platform_revenue").insert({
      payer_agent_id: request.agent_id,
      action_type: `blind_token_purchase_${request.token_type}`,
      fee_sats: totalFee,
      payment_protocol: request.payment_protocol || "lightning", // FIXED: Add required field
      payment_proof_hash: await hashPaymentProof(request.payment_proof),
      payment_status: "paid",
      paid_at: new Date(),
    });
  } else {
    // Generate payment request
    const paymentRequest = await generatePaymentRequest(totalFee, {
      purpose: `${request.quantity}x ${request.token_type} tokens (value=${tokenValue} each)`,
    });

    return {
      statusCode: 402, // Payment Required
      body: JSON.stringify({
        error: "Payment required",
        fee_sats: totalFee,
        payment_request: paymentRequest,
        economic_failure: {
          reason: "INSUFFICIENT_FUNDS",
          required_sats: totalFee,
          suggested_action: "BUY_TOKENS",
          details: `Need ${totalFee} sats for ${request.quantity} tokens`,
        } satisfies EconomicFailureHint,
      }),
    };
  }

  // 2. Get active blind signing keypair
  const { data: keypair } = await supabase
    .from("platform_blind_keypairs")
    .select("id, public_key, private_key_encrypted")
    .eq("keypair_purpose", "capability_tokens")
    .eq("active", true)
    .single();

  if (!keypair) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "No active signing keypair" }),
    };
  }

  const privateKey = decryptKeypair(keypair.private_key_encrypted);

  // 3. Sign each blinded message
  const blindSignatures: string[] = [];
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  for (const blindedMessage of request.blinded_messages) {
    // Platform signs blinded message (doesn't know what it's signing)
    const signature = blindSign(blindedMessage, privateKey);
    blindSignatures.push(signature);

    // Store token record (but we don't know the unblinded token yet)
    // MONETIZATION UPDATE: Support token_value > 1 for bundled actions (e.g., DM bundles)
    await supabase.from("agent_blind_tokens").insert({
      token_hash: null, // Will be revealed on redemption
      token_type: request.token_type,
      token_value: tokenValue, // Support bundles: 1 token = N actions
      issued_to_agent_id: request.agent_id,
      expires_at: expiresAt,
      status: "issued",
      blinded_message: blindedMessage,
      blind_signature: signature,
      keypair_id: keypair.id,
    });
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      tokens_issued: request.quantity,
      blind_signatures: blindSignatures,
      keypair_public_key: keypair.public_key,
      expires_at: expiresAt,
    }),
  };
};
```

**Verification Steps:**

- [ ] Payment verification works
- [ ] Blind signatures generated correctly
- [ ] Token records created without revealing unblinded token
- [ ] Expires correctly after 30 days

---

### Task 1.3: Anonymous Token Redemption API

**File:** `netlify/functions/agents/redeem-blind-token.ts`

> ⚠️ PRIVACY CONTRACT: This endpoint must never require authentication.
> Any future change requiring session auth breaks the unlinkability guarantee
> and must be treated as a breaking privacy regression requiring guardian review.

```typescript
// ARCHITECTURE: Netlify Function (ESM)
import { createServerSupabaseClient } from "../../lib/supabase-server";
import {
  decodeUnblindedToken,
  verifyBlindSignature,
  hashToken,
} from "../../lib/crypto/blind-signatures";
import {
  createErrorResponse,
  logError,
  generateRequestId,
} from "../utils/error-handler";
import type { HandlerEvent } from "@netlify/functions";

// W4: Import shared types from centralized location (no duplicates)
import type {
  BlindTokenType,
  ActionPayload,
  ActionResult,
} from "../../types/agent-tokens";

interface RedeemBlindTokenRequest {
  unblinded_token: string;
  signature_proof: string;
  action_type: string;
  keypair_public_key: string;
  action_payload: ActionPayload;
}

interface RedeemBlindTokenResponse {
  token_valid: boolean;
  action_authorized: boolean;
  action_result?: ActionResult;
  economic_failure?: EconomicFailureHint; // UX IMPROVEMENT: Standardized error handling
}

export const handler = async (event: HandlerEvent) => {
  const requestId = generateRequestId();
  const supabase = createServerSupabaseClient();
  const request: RedeemBlindTokenRequest = JSON.parse(event.body || "{}");

  // PRIVACY: This endpoint authenticates the token itself, never the caller.
  // Do NOT require Authorization headers, Supabase session cookies, or JWTs.
  // Ignore caller identity and do not log IPs or raw tokens.

  // SECURITY: Anonymous redemption rate limiting (separate from authenticated endpoints)
  // Use a more aggressive token-bucket keyed on request.action_type only.
  // Never rate-limit this endpoint by IP, session, or identity.

  // 1. Decode token claims locally (action type, expiry, key metadata)
  const decodedToken = decodeUnblindedToken(request.unblinded_token);

  if (decodedToken.action_type !== request.action_type) {
    await supabase.from("platform_revenue").insert({
      action_type: request.action_type,
      fee_sats: 0,
      payment_protocol: "blind_token",
      payment_status: "failed",
    });

    return {
      statusCode: 403,
      body: JSON.stringify({ error: "Token type mismatch" }),
    };
  }

  if (new Date() > new Date(decodedToken.expires_at)) {
    await supabase.from("platform_revenue").insert({
      action_type: request.action_type,
      fee_sats: 0,
      payment_protocol: "blind_token",
      payment_status: "failed",
    });

    return {
      statusCode: 403,
      body: JSON.stringify({ error: "Token expired" }),
    };
  }

  // 2. Verify blind signature against the platform public signing key
  const signatureValid = verifyBlindSignature(
    request.unblinded_token,
    request.signature_proof,
    request.keypair_public_key,
  );

  if (!signatureValid) {
    await supabase.from("platform_revenue").insert({
      action_type: request.action_type,
      fee_sats: 0,
      payment_protocol: "blind_token",
      payment_status: "failed",
    });

    return {
      statusCode: 403,
      body: JSON.stringify({
        error: "Invalid token signature",
        economic_failure: {
          reason: "INSUFFICIENT_TOKENS",
          suggested_action: "BUY_TOKENS",
          details: "Token signature verification failed",
        } satisfies EconomicFailureHint,
      }),
    };
  }

  // 3. Check if token already redeemed (nullifier lookup = sha256(unblinded token))
  const tokenHash = await hashToken(request.unblinded_token);

  const existingRedemption = await supabase
    .from("spent_token_nullifiers")
    .select("token_hash")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (existingRedemption) {
    await supabase.from("platform_revenue").insert({
      action_type: request.action_type,
      fee_sats: 0,
      payment_protocol: "blind_token",
      payment_status: "failed",
    });

    return {
      statusCode: 403,
      body: JSON.stringify({ error: "Token already redeemed" }),
    };
  }

  // 4. Persist only the nullifier hash (double-spend prevention)
  await supabase.from("spent_token_nullifiers").insert({
    token_hash: tokenHash,
    action_type: request.action_type,
    redeemed_at: new Date(),
  });

  // 5. Record outcome only (no raw token, no caller IP, no session linkage)
  await supabase.from("platform_revenue").insert({
    action_type: request.action_type,
    fee_sats: 0,
    payment_protocol: "blind_token",
    payment_hash: tokenHash,
    payment_status: "paid",
    paid_at: new Date(),
  });

  // 6. Perform the authorized action
  let actionResult: ActionResult | undefined;

  if (request.action_type === "agent_status_event") {
    // Publish Nostr event anonymously
    actionResult = await publishNostrEvent(request.action_payload);
  } else if (request.action_type === "agent_task_record_create") {
    // Create task record
    actionResult = await createTaskRecord(request.action_payload);
  } else if (request.action_type === "agent_contact_add") {
    // Add contact
    actionResult = await addContact(request.action_payload);
  } else if (request.action_type === "agent_dm_bundle") {
    // Send DM
    actionResult = await sendEncryptedDM(request.action_payload);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      token_valid: true,
      action_authorized: true,
      action_result: actionResult,
      redemption_anonymous: true, // Agent's identity not linked to this action
    }),
  };
};
```

**Verification Steps:**

- [ ] `redeem-blind-token` succeeds with no Authorization header, no session cookie, and no JWT
- [ ] Blind signature verification works
- [ ] Double-spend prevention uses `spent_token_nullifiers.token_hash`
- [ ] Expiration enforced
- [ ] Token type matches action
- [ ] Anonymous redemption persists only nullifier hash + action type + outcome
- [ ] No raw token or caller IP stored in logs or database
- [ ] Rate limiter for anonymous redemption is keyed on `action_type` only
- [ ] Action performed successfully

---

### Task 1.4: Blind Token Client Library

**File:** `src/lib/crypto/blind-tokens.ts`

```typescript
import {
  blindMessage,
  unblindSignature,
} from "../../lib/crypto/blind-signatures";

// W4: Import shared types from centralized location (no duplicates)
import type {
  BlindTokenType,
  ActionPayload,
  ActionResult,
} from "../../types/agent-tokens";

export class BlindTokenManager {
  private tokens: Map<string, BlindToken> = new Map();

  /**
   * Purchase blind tokens from platform
   */
  async purchaseTokens(
    agentId: string,
    tokenType: BlindTokenType,
    quantity: number,
    paymentProof: string,
  ): Promise<BlindToken[]> {
    // 1. Generate random blinding factors and messages
    const blindingData: Array<{
      message: string;
      blindingFactor: string;
      blindedMessage: string;
    }> = [];

    for (let i = 0; i < quantity; i++) {
      const randomMessage = generateRandomMessage(); // Random unique identifier
      const blindingFactor = generateBlindingFactor();
      const blindedMessage = blindMessage(randomMessage, keypairPublicKey);

      blindingData.push({
        message: randomMessage,
        blindingFactor,
        blindedMessage,
      });
    }

    // 2. Request blind signatures from platform
    const response = await fetch("/api/agents/issue-blind-tokens", {
      method: "POST",
      body: JSON.stringify({
        agent_id: agentId,
        token_type: tokenType,
        quantity,
        blinded_messages: blindingData.map((d) => d.blindedMessage),
        payment_proof: paymentProof,
      }),
    });

    const { blind_signatures, keypair_public_key, expires_at } =
      await response.json();

    // 3. Unblind signatures
    const tokens: BlindToken[] = [];

    for (let i = 0; i < quantity; i++) {
      const unblindedSignature = unblindSignature(
        blind_signatures[i],
        blindingData[i].blindingFactor,
        keypair_public_key,
      );

      const token: BlindToken = {
        unblindedToken: blindingData[i].message,
        unblindedSignature,
        tokenType,
        keypairPublicKey: keypair_public_key,
        expiresAt: new Date(expires_at),
      };

      tokens.push(token);
      this.tokens.set(token.unblindedToken, token);
    }

    // 4. Store tokens locally (encrypted)
    await this.saveTokensToStorage(tokens);

    return tokens;
  }

  /**
   * Redeem token anonymously to perform action
   */
  async redeemToken(
    tokenType: BlindTokenType,
    actionPayload: ActionPayload,
  ): Promise<ActionResult> {
    // Find unused token of correct type
    const token = Array.from(this.tokens.values()).find(
      (t) =>
        t.tokenType === tokenType && !t.redeemed && new Date() < t.expiresAt,
    );

    if (!token) {
      throw new Error(
        `No available ${tokenType} tokens. Purchase more tokens.`,
      );
    }

    // Redeem token anonymously
    const response = await fetch("/api/agents/redeem-blind-token", {
      method: "POST",
      body: JSON.stringify({
        unblinded_token: token.unblindedToken,
        signature_proof: token.unblindedSignature,
        action_type: tokenType,
        keypair_public_key: token.keypairPublicKey,
        action_payload: actionPayload,
      }),
    });

    const result = await response.json();

    if (result.token_valid && result.action_authorized) {
      token.redeemed = true;
      token.redeemedAt = new Date();
      await this.saveTokensToStorage(Array.from(this.tokens.values()));

      return result.action_result;
    } else {
      throw new Error("Token redemption failed");
    }
  }

  /**
   * Get token balance
   */
  getBalance(tokenType?: string): number {
    const tokens = Array.from(this.tokens.values());
    const active = tokens.filter(
      (t) => !t.redeemed && new Date() < t.expiresAt,
    );

    if (tokenType) {
      return active.filter((t) => t.tokenType === tokenType).length;
    }
    return active.length;
  }

  /**
   * M4: Save tokens using ClientSessionVault for encrypted storage
   * Maintains zero-knowledge principles with IndexedDB-based encryption
   */
  private async saveTokensToStorage(tokens: BlindToken[]) {
    // Use ClientSessionVault pattern from src/lib/auth/client-session-vault.ts
    const { ClientSessionVault } =
      await import("../../lib/auth/client-session-vault");

    // Serialize tokens to JSON
    const tokensData = JSON.stringify(
      tokens.map((t) => ({
        ...t,
        expiresAt: t.expiresAt.toISOString(),
        redeemedAt: t.redeemedAt?.toISOString(),
      })),
    );

    // Store encrypted in IndexedDB via ClientSessionVault
    await ClientSessionVault.set("agent_blind_tokens", tokensData);
  }

  /**
   * M4: Load tokens from ClientSessionVault
   */
  private async loadTokensFromStorage(): Promise<BlindToken[]> {
    const { ClientSessionVault } =
      await import("../../lib/auth/client-session-vault");

    const tokensData = await ClientSessionVault.get("agent_blind_tokens");
    if (!tokensData) return [];

    const parsed = JSON.parse(tokensData);
    return parsed.map((t: any) => ({
      ...t,
      expiresAt: new Date(t.expiresAt),
      redeemedAt: t.redeemedAt ? new Date(t.redeemedAt) : undefined,
    }));
  }

  /**
   * Initialize token manager by loading from vault
   */
  async initialize() {
    const tokens = await this.loadTokensFromStorage();
    this.tokens = new Map(tokens.map((t) => [t.unblindedToken, t]));
  }
}

interface BlindToken {
  unblindedToken: string;
  unblindedSignature: string;
  tokenType: BlindTokenType;
  keypairPublicKey: string;
  expiresAt: Date;
  redeemed?: boolean;
  redeemedAt?: Date;
}
```

**Verification Steps:**

- [ ] Token purchase generates correct blinded messages
- [ ] Unblinding works correctly
- [ ] **M4: Token storage uses ClientSessionVault (IndexedDB encrypted storage)**
- [ ] **M4: Zero-knowledge principles maintained (no plaintext localStorage)**
- [ ] **M4: initialize() method loads tokens from vault on startup**
- [ ] Token redemption works anonymously
- [ ] Balance tracking accurate

---

## Phase 2: Extended Database Schema (with Monetization Integration)

### Task 2.1: Agent Profiles Table (Separate from user_identities)

**File:** `supabase/migrations/YYYYMMDD_agent_profiles.sql`

> **ARCHITECTURE NOTE:** Agent-specific columns go in a dedicated `agent_profiles` table
> that references `user_identities(id)` via FK. This preserves the existing privacy-first
> schema — agents are users with the existing platform role family in `user_identities`,
> and their agent-specific monetization/reputation data lives here.

```sql
-- Idempotent migration: Agent profiles with monetization tracking
-- Compatible with: user_identities (current schema), family_members, parent_offspring_relationships

CREATE TABLE IF NOT EXISTS agent_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- FK to user_identities (the agent's base user record)
  user_identity_id UUID NOT NULL UNIQUE REFERENCES user_identities(id),

  -- Agent identity (reuses the existing role family in user_identities.role;
  -- agent-ness is determined by is_agent, not special role strings)
  is_agent BOOLEAN NOT NULL DEFAULT TRUE,
  family_federation_id UUID NOT NULL REFERENCES family_federations(id),
  agent_username TEXT UNIQUE,
  unified_address TEXT UNIQUE, -- e.g. agent-name@ai.satnam.pub
  created_by_user_id UUID REFERENCES user_identities(id), -- creator/founding guardian for this agent federation
  lnbits_creator_split_id TEXT, -- LNbits Split Payments config ID for creator share

  -- Monetization tracking
  total_platform_fees_paid_sats BIGINT DEFAULT 0,
  free_tier_claimed BOOLEAN DEFAULT FALSE,
  free_tier_allocation_number INTEGER,

  -- Blind token balance (issued server-side; anonymous redemption is tracked via nullifiers, not per-agent linkage)
  event_tokens_balance INTEGER DEFAULT 0,
  task_tokens_balance INTEGER DEFAULT 0,
  contact_tokens_balance INTEGER DEFAULT 0,
  dm_tokens_balance INTEGER DEFAULT 0,

  -- Reputation & scoring
  reputation_score INTEGER DEFAULT 0,
  credit_limit_sats BIGINT DEFAULT 0,
  total_settled_sats BIGINT DEFAULT 0,
  settlement_success_count INTEGER DEFAULT 0,
  settlement_default_count INTEGER DEFAULT 0,

  -- Performance bonds
  total_bonds_staked_sats BIGINT DEFAULT 0,
  total_bonds_released_sats BIGINT DEFAULT 0,
  total_bonds_slashed_sats BIGINT DEFAULT 0,
  bond_slash_count INTEGER DEFAULT 0,
  current_bonded_sats BIGINT DEFAULT 0,

  -- Work history metrics
  total_tasks_completed INTEGER DEFAULT 0,
  total_tasks_failed INTEGER DEFAULT 0,
  tier1_validations INTEGER DEFAULT 0,
  tier2_validations INTEGER DEFAULT 0,
  tier3_validations INTEGER DEFAULT 0,

  -- Communication preferences
  accepts_encrypted_dms BOOLEAN DEFAULT TRUE,
  public_portfolio_enabled BOOLEAN DEFAULT TRUE,
  coordination_relay_urls TEXT[], -- Populated from config, NOT hardcoded

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN
  CREATE TYPE wallet_custody_type AS ENUM (
    'self_custodial',
    'lnbits_proxy',
    'lightning_faucet'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE agent_profiles
  ADD COLUMN IF NOT EXISTS wallet_custody_type wallet_custody_type
    DEFAULT 'self_custodial',
  ADD COLUMN IF NOT EXISTS lightning_faucet_agent_key_encrypted TEXT;

DO $$ BEGIN
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_agent_profiles_user_id ON agent_profiles(user_identity_id)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_agent_profiles_federation ON agent_profiles(family_federation_id)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_agent_profiles_username ON agent_profiles(agent_username)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_agent_profiles_reputation ON agent_profiles(reputation_score DESC)';
END $$;

-- ============================================================
-- RLS POLICIES
-- ============================================================
ALTER TABLE agent_profiles ENABLE ROW LEVEL SECURITY;

-- Agents can read their own profile
CREATE POLICY "agent_profiles_own_read" ON agent_profiles
  FOR SELECT USING (user_identity_id = auth.uid());

-- Agents can update their own profile (communication prefs, etc.)
CREATE POLICY "agent_profiles_own_update" ON agent_profiles
  FOR UPDATE USING (user_identity_id = auth.uid());

-- Founding creator/guardian can read and manage agent profiles inside the
-- federations they originated.
CREATE POLICY "agent_profiles_creator_guardian_read" ON agent_profiles
  FOR SELECT USING (
    created_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM family_federations ff
      WHERE ff.id = family_federation_id
        AND ff.created_by = auth.uid()
    )
  );

CREATE POLICY "agent_profiles_creator_guardian_update" ON agent_profiles
  FOR UPDATE USING (
    created_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM family_federations ff
      WHERE ff.id = family_federation_id
        AND ff.created_by = auth.uid()
    )
  );

-- Public read for reputation/discovery (excludes sensitive monetization fields via column-level grants)
CREATE POLICY "agent_profiles_public_read" ON agent_profiles
  FOR SELECT USING (public_portfolio_enabled = TRUE);

-- Service role: full access for creation and admin operations
CREATE POLICY "agent_profiles_service_write" ON agent_profiles
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- M5: PUBLIC VIEW FOR AGENT DISCOVERY (EXCLUDES MONETIZATION DATA)
-- ============================================================
-- Create a public view that excludes sensitive financial columns
-- This prevents exposure of token balances, revenue metrics, and bond details

CREATE OR REPLACE VIEW agent_profiles_public AS
SELECT
  id,
  user_identity_id,
  is_agent,
  agent_username,
  unified_address,

  -- Reputation & scoring (PUBLIC)
  reputation_score,

  -- Work history metrics (PUBLIC)
  total_tasks_completed,
  total_tasks_failed,
  tier1_validations,
  tier2_validations,
  tier3_validations,

  -- Communication preferences (PUBLIC)
  accepts_encrypted_dms,
  public_portfolio_enabled,
  coordination_relay_urls,

  created_at,
  updated_at

  -- EXCLUDED (PRIVATE):
  -- total_platform_fees_paid_sats, free_tier_claimed, free_tier_allocation_number
  -- event_tokens_balance, task_tokens_balance, contact_tokens_balance, dm_tokens_balance
  -- credit_limit_sats, total_settled_sats, settlement_success_count, settlement_default_count
  -- total_bonds_staked_sats, total_bonds_released_sats, total_bonds_slashed_sats
  -- bond_slash_count, current_bonded_sats, created_by_user_id
FROM agent_profiles
WHERE public_portfolio_enabled = TRUE;

-- Grant public read access to the view
GRANT SELECT ON agent_profiles_public TO anon, authenticated;

-- Note: Applications should use agent_profiles_public for discovery/search
-- and agent_profiles (with RLS) for authenticated agent's own data
```

**Trigger to update token balances:**

```sql
-- Token balance trigger targets agent_profiles (NOT deprecated profiles table)
-- PRIVACY NOTE: Do NOT wire anonymous redeem-blind-token to update agent_blind_tokens.
-- This trigger is only for opt-in, revealed accounting flows where unlinkability is not required.
CREATE OR REPLACE FUNCTION update_token_balance()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'redeemed' AND OLD.status = 'issued' THEN
    IF NEW.token_type = 'agent_status_event' THEN
      UPDATE agent_profiles SET event_tokens_balance = event_tokens_balance - 1
      WHERE user_identity_id = NEW.issued_to_agent_id;
    ELSIF NEW.token_type = 'agent_task_record_create' THEN
      UPDATE agent_profiles SET task_tokens_balance = task_tokens_balance - 1
      WHERE user_identity_id = NEW.issued_to_agent_id;
    ELSIF NEW.token_type = 'agent_contact_add' THEN
      UPDATE agent_profiles SET contact_tokens_balance = contact_tokens_balance - 1
      WHERE user_identity_id = NEW.issued_to_agent_id;
    ELSIF NEW.token_type = 'agent_dm_bundle' THEN
      UPDATE agent_profiles SET dm_tokens_balance = dm_tokens_balance - 1
      WHERE user_identity_id = NEW.issued_to_agent_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Idempotent: drop-then-create for trigger
DROP TRIGGER IF EXISTS token_redemption_balance_update ON agent_blind_tokens;
CREATE TRIGGER token_redemption_balance_update
  AFTER UPDATE OF status ON agent_blind_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_token_balance();
```

**Verification Steps:**

- [ ] agent_profiles table created with FK to user_identities (NOT profiles)
- [ ] Token balance fields track correctly via trigger
- [ ] Free tier tracking columns present
- [ ] RLS policies enabled (own-read, own-update, public-read, service-write)
- [ ] Trigger decrements agent_profiles only for opt-in revealed redemption flows
- [ ] Migration is fully idempotent
- [ ] No hardcoded relay URLs (coordination_relay_urls populated from config)

---

### Task 2.2: Agent Creation API (Extended with Fees & Blinded Auth)

**File:** `netlify/functions/agents/create-agent-with-fees.ts`

```typescript
// ARCHITECTURE: Netlify Function (ESM) — agent creation with monetization
import { createServerSupabaseClient } from "../../lib/supabase-server";
import {
  createErrorResponse,
  logError,
  generateRequestId,
} from "../utils/error-handler";
import type { HandlerEvent } from "@netlify/functions";

type PaymentProtocol = "lightning" | "cashu" | "fedimint";

// UX IMPROVEMENT: Agent Lifecycle State Machine
// Provides clear states for agents to introspect and recover from partial failures
// State transitions:
//   PENDING_IDENTITY → PENDING_BOND → ACTIVE → SUSPENDED → DEACTIVATED
//
// PENDING_IDENTITY: user_identity created but agent_profile not yet created
// PENDING_BOND: agent_profile created but performance bond not yet recorded
// ACTIVE: Fully operational agent with bond and payment config
// SUSPENDED: Temporarily disabled (e.g., bond slashed, rate limit exceeded)
// DEACTIVATED: Permanently disabled (user request or policy violation)
//
// Compensation/Rollback Strategy for Multi-Step Operations:
// 1. If identity creation succeeds but profile creation fails:
//    → Mark user_identity with metadata: { agent_state: 'PENDING_IDENTITY', created_at }
//    → Queue cleanup job to delete orphaned identities after 24h
// 2. If profile creation succeeds but bond insert fails:
//    → Set agent_profile.lifecycle_state = 'PENDING_BOND'
//    → Agent can retry bond submission or request refund
// 3. If bond succeeds but payment_config fails:
//    → Set agent_profile.lifecycle_state = 'PENDING_CONFIG'
//    → Agent can still function with manual payments
// 4. If NWC creation fails (W3 handling):
//    → Create inactive NWC record to track failure
//    → Agent continues with lifecycle_state = 'ACTIVE' but nwc_available = false
//
// Implementation: Add lifecycle_state column to agent_profiles table
// See agent_profiles schema in Task 2.1 for full state machine integration

// Agent reuses the existing platform role family rather than introducing
// separate *_agent roles.
type AgentRole = "private" | "offspring" | "adult" | "steward" | "guardian";

// Agent lifecycle states for state machine
type AgentLifecycleState =
  | "PENDING_IDENTITY"
  | "PENDING_BOND"
  | "PENDING_CONFIG"
  | "ACTIVE"
  | "SUSPENDED"
  | "DEACTIVATED";

interface CreateAgentRequestExtended {
  agent_role: AgentRole; // Maps to user_identities.role
  parent_user_id?: string; // For offspring: the creating adult's user_identities.id
  family_federation_id?: string; // Existing federation context; omit only when bootstrapping a new agent federation
  agent_username: string;
  nostr_pubkey: string;

  // Payment for account creation fee (unless free tier)
  account_creation_payment_proof?: string;
  account_creation_payment_protocol?: PaymentProtocol;

  // Performance bond
  bond_amount_sats: number;
  bond_payment_type: PaymentProtocol;
  bond_payment_proof: string;

  // Payment protocol preferences
  enable_lightning?: boolean;
  enable_cashu?: boolean;
  enable_fedimint?: boolean;
  preferred_protocol: PaymentProtocol;

  // Blind token purchase (optional, can buy separately)
  purchase_event_tokens?: number;
  purchase_task_tokens?: number;
  purchase_contact_tokens?: number;
  tokens_payment_proof?: string;
}

interface InitialTokenBalance {
  event_tokens?: number;
  task_tokens?: number;
  contact_tokens?: number;
}

export const handler = async (event: HandlerEvent) => {
  const requestId = generateRequestId();
  const supabase = createServerSupabaseClient();

  let request: CreateAgentRequestExtended;
  try {
    request = JSON.parse(event.body || "{}");
  } catch {
    return createErrorResponse(400, "Invalid request body", requestId);
  }

  const {
    data: { user: caller },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !caller) {
    return createErrorResponse(401, "Authentication required", requestId);
  }

  // 1. MONETIZATION: Charge account creation fee (or use free tier)
  const feeResponse = await fetch(
    `${process.env.VITE_API_BASE_URL}/platform/charge-fee`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_id: "pending",
        human_user_id: caller.id,
        action_type: "agent_account_creation",
        payment_protocol:
          request.account_creation_payment_protocol || "lightning",
        payment_proof: request.account_creation_payment_proof,
      }),
    },
  );

  const feeResult = await feeResponse.json();

  if (
    feeResult.fee_required &&
    !feeResult.fee_paid &&
    !feeResult.free_tier_used
  ) {
    // Payment required but not provided
    return {
      statusCode: 402,
      body: JSON.stringify({
        error: "Account creation fee required",
        fee_sats: feeResult.fee_sats,
        payment_invoice: feeResult.payment_invoice,
        free_tier_available: false,
        message:
          "First 210 agent accounts are free. This would be account #211+.",
      }),
    };
  }

  const freeTierUsed = feeResult.free_tier_used || false;
  const allocationNumber = feeResult.allocation_number;

  // 2. Validate username available (check agent_profiles, NOT deprecated profiles)
  const unifiedAddress = `${request.agent_username}@ai.satnam.pub`;
  const { data: existing } = await supabase
    .from("agent_profiles")
    .select("id")
    .eq("unified_address", unifiedAddress)
    .maybeSingle();

  if (existing) {
    return createErrorResponse(400, "Username already taken", requestId);
  }

  // 3. Verify performance bond
  const { data: bondRequirement } = await supabase
    .from("bond_requirements")
    .select("required_amount_sats")
    .eq("account_type", request.agent_role) // Uses existing platform role family, not deprecated agent-only role types
    .eq("operation", "account_creation")
    .single();

  if (request.bond_amount_sats < bondRequirement.required_amount_sats) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: `Insufficient bond. Required: ${bondRequirement.required_amount_sats} sats`,
      }),
    };
  }

  const bondValid = await verifyBondPayment(
    request.bond_payment_proof,
    request.bond_amount_sats,
    request.bond_payment_type,
  );

  if (!bondValid) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid bond payment proof" }),
    };
  }

  // 4. Create agent: TWO-STEP (user_identities + agent_profiles)
  // Step 4a: Create base user identity with Master Context role
  const { data: userIdentity, error: identityError } = await supabase
    .from("user_identities")
    .insert({
      npub: request.nostr_pubkey,
      role: request.agent_role, // Existing platform role family
      is_agent: true,
      nip05: `${request.agent_username}@ai.satnam.pub`,
      username: request.agent_username,
    })
    .select()
    .single();

  if (identityError || !userIdentity) {
    logError(identityError, { requestId, endpoint: "create-agent" });
    return createErrorResponse(
      500,
      "Failed to create agent identity",
      requestId,
    );
  }

  // Step 4b: Create agent-specific profile (monetization, reputation, etc.)
  const { data: agentProfile, error: profileError } = await supabase
    .from("agent_profiles")
    .insert({
      user_identity_id: userIdentity.id,
      is_agent: true,
      family_federation_id: request.family_federation_id,
      agent_username: request.agent_username,
      unified_address: unifiedAddress,
      created_by_user_id: caller.id,
      free_tier_claimed: freeTierUsed,
      free_tier_allocation_number: allocationNumber,
      total_platform_fees_paid_sats: freeTierUsed ? 0 : feeResult.fee_sats,
    })
    .select()
    .single();

  if (profileError || !agentProfile) {
    logError(profileError, { requestId, endpoint: "create-agent" });
    return createErrorResponse(
      500,
      "Failed to create agent profile",
      requestId,
    );
  }

  // Step 4c: If offspring, create parent-offspring relationship
  if (request.agent_role === "offspring" && request.parent_user_id) {
    await supabase.from("parent_offspring_relationships").insert({
      parent_user_id: request.parent_user_id,
      offspring_user_id: userIdentity.id,
    });
  }

  // 5. Create performance bond
  const { data: bond, error: bondError } = await supabase
    .from("performance_bonds")
    .insert({
      agent_id: userIdentity.id,
      amount_sats: request.bond_amount_sats,
      bond_type: "account_creation",
      payment_type: request.bond_payment_type,
      lightning_payment_hash:
        request.bond_payment_type === "lightning"
          ? request.bond_payment_proof
          : null,
      cashu_token:
        request.bond_payment_type === "cashu"
          ? request.bond_payment_proof
          : null,
      fedimint_txid:
        request.bond_payment_type === "fedimint"
          ? request.bond_payment_proof
          : null,
      escrow_holder: "satnam-platform",
      status: "active",
    })
    .select()
    .single();

  if (bondError) {
    logError(bondError, { requestId, endpoint: "create-agent" });
  }

  // Update agent_profiles bond tracking (NOT deprecated profiles table)
  await supabase
    .from("agent_profiles")
    .update({
      total_bonds_staked_sats: request.bond_amount_sats,
      current_bonded_sats: request.bond_amount_sats,
    })
    .eq("user_identity_id", userIdentity.id);

  // 6. Setup payment configuration
  // Domain: ai.satnam.pub (agent-specific subdomain)
  // Gateway: gateway.satnam.pub (NOT satnam.ai)
  await supabase.from("agent_payment_config").insert({
    agent_id: userIdentity.id,
    unified_address: unifiedAddress,
    lightning_enabled: request.enable_lightning ?? true,
    lnurl_callback_url: `${process.env.VITE_API_BASE_URL}/lnurlp/${request.agent_username}/callback`,
    cashu_enabled: request.enable_cashu ?? true,
    cashu_mint_url: process.env.CASHU_MINT_URL, // platform-default/bootstrap mint; replace with federation registry lookup when assigned
    cashu_pubkey: await generateCashuPubkey(userIdentity.id),
    fedimint_enabled: request.enable_fedimint ?? true,
    fedimint_federation_id: process.env.FEDIMINT_FEDERATION_ID,
    fedimint_gateway_ln_address: `${request.agent_username}@gateway.satnam.pub`,
    preferred_protocol: request.preferred_protocol,
  });

  // 7. Generate NWC connection (LNbits Parent/Child wallet management)
  // W3: Add error handling for NWC connection failure
  let nwcConnectionCreated = false;
  try {
    const nwcResponse = await fetch(
      `${process.env.LNBITS_URL}/api/v1/nwc/create`,
      {
        method: "POST",
        headers: { "X-Api-Key": process.env.LNBITS_ADMIN_KEY || "" },
        body: JSON.stringify({
          user_id: userIdentity.id,
          max_amount_sats: 50000,
          allowed_methods: ["pay_invoice", "make_invoice"],
        }),
      },
    );

    if (!nwcResponse.ok) {
      throw new Error(
        `NWC creation failed: ${nwcResponse.status} ${nwcResponse.statusText}`,
      );
    }

    const nwcData = await nwcResponse.json();

    if (!nwcData.connection_string) {
      throw new Error("NWC response missing connection_string");
    }

    await supabase.from("agent_nwc_connections").insert({
      agent_id: userIdentity.id,
      nwc_connection_string: nwcData.connection_string,
      max_spend_per_hour_sats: 10000,
      max_spend_per_day_sats: 100000,
      allowed_operations: ["pay_invoice", "make_invoice"],
      wallet_type: "lnbits",
      wallet_endpoint: process.env.LNBITS_URL,
      is_active: true,
    });

    nwcConnectionCreated = true;
  } catch (nwcError) {
    // W3: Log error but don't fail agent creation
    // Agent can still function without NWC (manual payments)
    logError(nwcError as Error, {
      requestId,
      endpoint: "create-agent",
      context: "NWC connection creation failed",
      agent_id: userIdentity.id,
    });

    // Create inactive NWC record to track failure
    await supabase.from("agent_nwc_connections").insert({
      agent_id: userIdentity.id,
      nwc_connection_string: "FAILED_TO_CREATE",
      max_spend_per_hour_sats: 0,
      max_spend_per_day_sats: 0,
      allowed_operations: [],
      wallet_type: "lnbits",
      wallet_endpoint: process.env.LNBITS_URL,
      is_active: false,
    });
  }

  // 8. OPTIONAL: Purchase initial blind tokens if requested
  const initialTokens: InitialTokenBalance = {};

  if (
    request.purchase_event_tokens ||
    request.purchase_task_tokens ||
    request.purchase_contact_tokens
  ) {
    const tokenManager = new BlindTokenManager();

    if (request.purchase_event_tokens && request.purchase_event_tokens > 0) {
      const eventTokens = await tokenManager.purchaseTokens(
        userIdentity.id,
        "agent_status_event",
        request.purchase_event_tokens,
        request.tokens_payment_proof || "",
      );
      initialTokens.event_tokens = eventTokens.length;

      // Update agent_profiles (NOT deprecated profiles)
      await supabase
        .from("agent_profiles")
        .update({ event_tokens_balance: eventTokens.length })
        .eq("user_identity_id", userIdentity.id);
    }

    // Similar for task_tokens and contact_tokens...
  }

  // 9. Publish agent creation event
  await publishAgentCreationEvent({
    agentNpub: request.nostr_pubkey,
    agentRole: request.agent_role, // Existing platform role family (Master Context compliant)
    unifiedAddress: unifiedAddress,
    bondAmount: request.bond_amount_sats,
    createdBy: caller.id,
    freeTierUsed: freeTierUsed,
  });

  // W3: Build response with NWC status
  const responseBody: any = {
    agent_id: userIdentity.id,
    agent_profile_id: agentProfile.id,
    npub: request.nostr_pubkey,
    unified_address: unifiedAddress,
    nip05_verified: true,
    free_tier_used: freeTierUsed,
    allocation_number: allocationNumber,
    payment_methods: {
      lightning: request.enable_lightning ?? true,
      cashu: request.enable_cashu ?? true,
      fedimint: request.enable_fedimint ?? true,
    },
    bond_id: bond?.id,
    initial_blind_tokens: initialTokens,
    message: freeTierUsed
      ? `Free tier activated! You're agent #${allocationNumber} of ${FREE_TIER_LIMIT}.`
      : `Account created. Paid ${feeResult.fee_sats} sats creation fee.`,
  };

  // W3: Add NWC status to response
  if (nwcConnectionCreated) {
    responseBody.nwc_status = "active";
    responseBody.nwc_connection_available = true;
  } else {
    responseBody.nwc_status = "failed";
    responseBody.nwc_connection_available = false;
    responseBody.nwc_warning =
      "NWC connection failed to create. Agent can still function with manual payments. Contact support to enable autonomous payments.";
  }

  return {
    statusCode: 201,
    body: JSON.stringify(responseBody),
  };
};
```

**Verification Steps:**

- [ ] First 210 agent creations are free (or configured limit)
- [ ] Next agent creation after free tier requires payment
- [ ] Agent created in user_identities with role 'adult' or 'offspring' (NOT custom agent types)
- [ ] Agent profile created in agent_profiles (NOT deprecated profiles table)
- [ ] Parent-offspring relationship recorded for offspring agents
- [ ] Bond verification works
- [ ] Payment config uses ai.satnam.pub / gateway.satnam.pub (NOT satnam.ai)
- [ ] **W3: NWC connection creation has proper error handling**
- [ ] **W3: NWC failure doesn't block agent creation**
- [ ] **W3: Response includes NWC status and warning if failed**
- [ ] **W3: Failed NWC attempts logged with context**
- [ ] Optional token purchase updates agent_profiles (NOT profiles)
- [ ] Agent creation event published
- [ ] Error handling uses createErrorResponse/logError patterns
- [ ] Handler uses ESM export const pattern

## Summary of Additions

### Platform Monetization ✓

- [x] Fee schedule table with configurable fees per action
- [x] Platform revenue tracking table
- [x] Free tier (first 210 agent accounts, configurable via FREE_TIER_LIMIT)
- [x] Fee charging API with payment proof verification
- [x] Webhook for fee payment confirmation
- [x] Revenue dashboard aggregation view
- [x] Integration into agent creation flow

### Blinded Authentication ✓

- [x] Blind signature keypair management
- [x] Blind token issuance API
- [x] Anonymous token redemption API
- [x] Double-spend prevention
- [x] Token expiration enforcement
- [x] Client library for token management
- [x] Privacy-preserving action authorization
- [x] Token balance tracking

### Integration Points

- Account creation: Check free tier → charge fee → issue tokens
- Event publishing: Redeem blind token anonymously OR pay fee
- Task creation: Redeem blind token OR pay fee
- Contact addition: Redeem blind token OR pay fee
- DM sending: Redeem blind token OR pay fee
- Profile update: Redeem blind token OR pay fee
- Credit envelope request: Redeem blind token OR pay fee
- Work history upload: Redeem blind token OR pay fee
- Attestation issuance: Redeem blind token OR pay fee

## Phase 3: Credit Envelopes, Work History & Attestations (with Monetization & Blind Auth)

### Task 3.1: Credit Envelope Lifecycle with Sig4Sats Integration

**File:** `netlify/functions/agents/credit-envelope-lifecycle.ts`

**Reference:** Sig4Sats (https://github.com/cashubtc/sig4sats) - Atomic Cashu tokens for Nostr event signatures

```typescript
// ARCHITECTURE: Netlify Function (ESM) — credit envelope lifecycle with Sig4Sats
import { verifyCashuProof, redeemCashuToken } from '@cashu/cashu-ts';
import { verifyEvent, validateEvent } from 'nostr-tools';
import type { UnsignedEvent, Event as NostrEvent } from 'nostr-tools';
import { createServerSupabaseClient } from '../../lib/supabase-server';
import { createErrorResponse, logError, generateRequestId } from '../utils/error-handler';
import type { HandlerEvent } from '@netlify/functions';

type ValidationTier = 'self_report' | 'peer_verified' | 'oracle_attested';

interface CreditIntentRequest {
  agent_id: string;
  scope: string; // "l402:lunanode:compute:5min"
  requested_amount_sats: number;
  expires_in_seconds: number;

  // Bond details
  bond_amount_sats?: number;
  bond_payment_proof?: string;
  bond_payment_protocol?: 'lightning' | 'cashu' | 'fedimint';

  // Validation preference
  preferred_validation_tier?: ValidationTier;

  // Sig4Sats: Cashu token locked to Nostr event signature
  sig4sats_token?: string;
  sig4sats_event_template?: UnsignedEvent; // Typed Nostr event template (replaces `any`)

  // Payment method for credit envelope request fee
  fee_payment_method?: 'blind_token' | 'direct_payment';
  fee_payment_proof?: string;
}

async function handleCreditIntent(request: CreditIntentRequest) {
  // 1. MONETIZATION: Charge credit envelope request fee (200 sats)
  let feeCharged = false;

  if (request.fee_payment_method === 'blind_token') {
    return {
      error:
        'Credit envelope requests are direct-pay only and cannot use blind tokens.',
    };
  } else {
    // Direct payment
    const feeResponse = await fetch(`${process.env.VITE_API_BASE_URL}/platform/charge-fee`, {
      method: 'POST',
      body: JSON.stringify({
        agent_id: request.agent_id,
        action_type: 'agent_credit_envelope_request',
        payment_proof: request.fee_payment_proof,
      }),
    });

    const feeResult = await feeResponse.json();

    if (!feeResult.fee_paid) {
      return {
        error: 'Credit envelope request fee required',
        fee_sats: 200,
        payment_invoice: feeResult.payment_invoice,
      };
    }

    feeCharged = true;
  }

  if (!feeCharged) {
    return { error: 'Fee payment required' };
  }

  // 2. Calculate agent's credit limit
  const agent = await getAgentWithReputation(request.agent_id);
  const creditLimit = calculateCreditLimit(agent);

  if (request.requested_amount_sats > creditLimit) {
    return { error: 'Requested amount exceeds credit limit', max_allowed: creditLimit };
  }

  // 3. Check bond requirement
  const bondRequirement = await supabase
    .from('bond_requirements')
    .select('required_amount_sats')
    .eq('account_type', agent.agent_role) // Existing platform role family (Master Context compliant)
    .eq('operation', 'credit_request')
    .single();

  let bondId: string | null = null;

  if (bondRequirement.required_amount_sats > 0) {
    if (!request.bond_amount_sats || request.bond_amount_sats < bondRequirement.required_amount_sats) {
      return {
        error: `Bond required: ${bondRequirement.required_amount_sats} sats`,
        bond_required: bondRequirement.required_amount_sats,
      };
    }

    const bondValid = await verifyBondPayment(
      request.bond_payment_proof,
      request.bond_amount_sats,
      request.bond_payment_protocol || 'lightning'
    );

    if (!bondValid) {
      return { error: 'Invalid bond payment proof' };
    }

    const { data: bond } = await supabase
      .from('performance_bonds')
      .insert({
        agent_id: request.agent_id,
        amount_sats: request.bond_amount_sats,
        bond_type: 'credit_envelope',
        payment_type: request.bond_payment_protocol || 'lightning',
        lightning_payment_hash: request.bond_payment_protocol === 'lightning' ? request.bond_payment_proof : null,
        cashu_token: request.bond_payment_protocol === 'cashu' ? request.bond_payment_proof : null,
        fedimint_txid: request.bond_payment_protocol === 'fedimint' ? request.bond_payment_proof : null,
        escrow_holder: 'satnam-platform',
        status: 'active',
        release_conditions: { scope: request.scope, success_required: true },
      })
      .select()
      .single();

    bondId = bond.id;
  }

  // 4. SIG4SATS: Validate Cashu token locked to Nostr signature
  let sig4satsTokenId: string | null = null;

  if (request.sig4sats_token) {
    // Parse and verify Cashu token
    const cashuToken = JSON.parse(request.sig4sats_token);

    // Verify token is properly locked to event signature
    const proofValid = await verifyCashuProof(cashuToken.proofs, cashuToken.mint);

    if (!proofValid) {
      return { error: 'Invalid Sig4Sats Cashu token' };
    }

    // Store Sig4Sats lock details
    const { data: sig4satsLock } = await supabase
      .from('sig4sats_locks')
      .insert({
        cashu_token: request.sig4sats_token,
        event_template: request.sig4sats_event_template,
        locked_amount_sats: cashuToken.amount,
        agent_id: request.agent_id,
        status: 'locked',
      })
      .select()
      .single();

    sig4satsTokenId = sig4satsLock.id;
  }

  // 5. Create pending envelope
  const envelope = await supabase
    .from('credit_envelopes')
    .insert({
      agent_id: request.agent_id,
      scope: request.scope,
      max_amount_sats: request.requested_amount_sats,
      expires_at: new Date(Date.now() + request.expires_in_seconds * 1000),
      status: 'pending',
      bond_id: bondId,
      bond_required_sats: bondRequirement.required_amount_sats,
      sig4sats_lock_id: sig4satsTokenId,
    })
    .select()
    .single();

  // 6. Publish NIP-AC intent event
  const intentEvent = await publishNostrEvent({
    kind: 39240,
    content: JSON.stringify({
      scope: request.scope,
      amount: request.requested_amount_sats,
      expiry: envelope.data.expires_at,
      bond_staked: request.bond_amount_sats || 0,
      preferred_validation: request.preferred_validation_tier || 'peer_verified',
      sig4sats_enabled: !!request.sig4sats_token,
    }),
    tags: [
      ['d', envelope.data.id],
      ['agent', agent.npub], // user_identities column (NOT deprecated nostr_pubkey)
      ['unified_address', agent.unified_address],
      ['scope', request.scope],
      ['validation_tier', request.preferred_validation_tier || 'peer_verified'],
      ['ln_address', agent.unified_address], // Same address for all protocols
      request.sig4sats_token ? ['sig4sats', 'enabled'] : ['sig4sats', 'disabled'],
    ],
  });

  await supabase
    .from('credit_envelopes')
    .update({ intent_event_id: intentEvent.id })
    .eq('id', envelope.data.id);

  return {
    envelope_id: envelope.data.id,
    status: 'pending',
    event_id: intentEvent.id,
    bond_id: bondId,
    sig4sats_lock_id: sig4satsTokenId,
    fee_paid_anonymously: request.fee_payment_method === 'blind_token',
  };
}

// Settlement with Sig4Sats redemption
async function handleSettlement(nostrEvent: NostrEvent) {
  const envelopeId = nostrEvent.tags.find(t => t[0] === 'd')?. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/collection_879a2e8d-a656-48f7-ada6-0c3abf01c2a4/c461717a-1bdb-4e9a-936a-9692a8e83895/i-know-that-i-ve-explored-an-a-pihuI8UKSIa225LA.C3NBw.md);
  const success = nostrEvent.kind === 39244;

  // Extract validation tier
  const validationTierTag = nostrEvent.tags.find(t => t[0] === 'validation_tier')?. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/collection_879a2e8d-a656-48f7-ada6-0c3abf01c2a4/c461717a-1bdb-4e9a-936a-9692a8e83895/i-know-that-i-ve-explored-an-a-pihuI8UKSIa225LA.C3NBw.md);
  const validatorNpub = nostrEvent.tags.find(t => t[0] === 'validator')?. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/collection_879a2e8d-a656-48f7-ada6-0c3abf01c2a4/c461717a-1bdb-4e9a-936a-9692a8e83895/i-know-that-i-ve-explored-an-a-pihuI8UKSIa225LA.C3NBw.md);
  const oracleAttestationId = nostrEvent.tags.find(t => t[0] === 'oracle_attestation')?. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/collection_879a2e8d-a656-48f7-ada6-0c3abf01c2a4/c461717a-1bdb-4e9a-936a-9692a8e83895/i-know-that-i-ve-explored-an-a-pihuI8UKSIa225LA.C3NBw.md);

  let validationTier: 'self_report' | 'peer_verified' | 'oracle_attested' = 'self_report';
  let validationWeight = 0.5;

  if (oracleAttestationId) {
    validationTier = 'oracle_attested';
    validationWeight = 1.5;

    const oracleValid = await verifyTrustedOracle(validatorNpub);
    if (!oracleValid) {
      return { error: 'Oracle not in trusted list' };
    }
  } else if (validatorNpub && validatorNpub !== nostrEvent.pubkey) {
    validationTier = 'peer_verified';
    validationWeight = 1.0;

    // Query agent_profiles via user_identities join (NOT deprecated profiles)
    const { data: validatorData } = await supabase
      .from('user_identities')
      .select('id, agent_profiles(reputation_score)')
      .eq('npub', validatorNpub)
      .single();

    const validatorReputation = validatorData?.agent_profiles?.reputation_score ?? 0;
    if (!validatorData || validatorReputation < 100) {
      return { error: 'Validator reputation too low (min 100 required)' };
    }
  }

  // Join agent via user_identities + agent_profiles (NOT deprecated profiles)
  const envelope = await supabase
    .from('credit_envelopes')
    .select('*, agent:user_identities(*, agent_profiles(*)), bond:performance_bonds(*), sig4sats_lock:sig4sats_locks(*)')
    .eq('id', envelopeId)
    .single();

  if (!envelope) {
    return { error: 'Envelope not found' };
  }

  // SIG4SATS: If settlement event includes valid signature, redeem Cashu token
  let sig4satsRedeemed = false;
  let sig4satsAmountSats = 0;

  if (envelope.data.sig4sats_lock) {
    const settlementEventSignature = nostrEvent.sig;

    // Verify event signature matches template
    const eventValid = validateEvent(nostrEvent) && verifyEvent(nostrEvent);

    if (eventValid && success) {
      // Redeem locked Cashu token
      const cashuToken = JSON.parse(envelope.data.sig4sats_lock.cashu_token);

      try {
        const redemption = await redeemCashuToken(
          cashuToken,
          envelope.data.sig4sats_lock.event_template,
          nostrEvent
        );

        if (redemption.success) {
          sig4satsRedeemed = true;
          sig4satsAmountSats = redemption.amount_sats;

          // Update Sig4Sats lock status
          await supabase
            .from('sig4sats_locks')
            .update({
              status: 'redeemed',
              redeemed_at: new Date(),
              settlement_event_id: nostrEvent.id,
            })
            .eq('id', envelope.data.sig4sats_lock.id);

          // Credit agent with Sig4Sats redemption
          await supabase
            .from('agent_payment_receipts')
            .insert({
              agent_id: envelope.data.agent_id,
              amount_sats: sig4satsAmountSats,
              payment_protocol: 'cashu',
              cashu_token: envelope.data.sig4sats_lock.cashu_token,
              purpose: 'sig4sats_settlement_bonus',
              related_envelope_id: envelopeId,
              verified: true,
              received_at: new Date(),
            });
        }
      } catch (error) {
        logError(error instanceof Error ? error : new Error(String(error)), { context: 'sig4sats_redemption', envelopeId });
      }
    }
  }

  // Calculate weighted reputation delta
  const baseRepDelta = success
    ? Math.floor(envelope.data.actual_spent_sats / 1000)
    : -Math.floor(envelope.data.max_amount_sats / 500);

  // Sig4Sats bonus: +10% reputation if redeemed
  const sig4satsBonus = sig4satsRedeemed ? Math.floor(baseRepDelta * 0.1) : 0;

  const weightedRepDelta = Math.floor(baseRepDelta * validationWeight) + sig4satsBonus;

  // Handle performance bond
  if (envelope.data.bond) {
    if (success) {
      await supabase
        .from('performance_bonds')
        .update({ status: 'released', released_at: new Date() })
        .eq('id', envelope.data.bond.id);
    } else {
      const slashPercentage = 0.5;
      const slashAmount = Math.floor(envelope.data.bond.amount_sats * slashPercentage);

      await supabase
        .from('performance_bonds')
        .update({
          status: 'slashed',
          slashed_at: new Date(),
          slashed_amount_sats: slashAmount,
          slashed_reason: nostrEvent.content || 'Settlement default',
        })
        .eq('id', envelope.data.bond.id);
    }
  }

  // Record settlement
  await supabase.from('agent_settlements').insert({
    envelope_id: envelopeId,
    agent_id: envelope.data.agent_id,
    provider_npub: envelope.data.provider_npub,
    amount_sats: envelope.data.actual_spent_sats,
    success,
    validation_tier: validationTier,
    validator_npub: validatorNpub,
    validation_weight: validationWeight,
    bond_released: success && envelope.data.bond != null,
    bond_slashed_sats: success ? 0 : (envelope.data.bond?.slashed_amount_sats || 0),
    reputation_delta: weightedRepDelta,
    default_reason: success ? null : nostrEvent.content,
    sig4sats_redeemed: sig4satsRedeemed,
    sig4sats_amount_sats: sig4satsAmountSats,
  });

  // Update agent reputation in agent_profiles (NOT deprecated profiles)
  // envelope.data.agent is a user_identities row with nested agent_profiles
  const agentProfile = envelope.data.agent?.agent_profiles;
  const updates = success
    ? {
        reputation_score: (agentProfile?.reputation_score ?? 0) + weightedRepDelta,
        total_settled_sats: (agentProfile?.total_settled_sats ?? 0) + envelope.data.actual_spent_sats + sig4satsAmountSats,
        settlement_success_count: (agentProfile?.settlement_success_count ?? 0) + 1,
        total_tasks_completed: (agentProfile?.total_tasks_completed ?? 0) + 1,
      }
    : {
        reputation_score: (agentProfile?.reputation_score ?? 0) + weightedRepDelta,
        settlement_default_count: (agentProfile?.settlement_default_count ?? 0) + 1,
        total_tasks_failed: (agentProfile?.total_tasks_failed ?? 0) + 1,
      };

  // Increment validation tier counter
  if (validationTier === 'self_report') updates['tier1_validations'] = (agentProfile?.tier1_validations ?? 0) + 1;
  else if (validationTier === 'peer_verified') updates['tier2_validations'] = (agentProfile?.tier2_validations ?? 0) + 1;
  else if (validationTier === 'oracle_attested') updates['tier3_validations'] = (agentProfile?.tier3_validations ?? 0) + 1;

  await supabase
    .from('agent_profiles')
    .update(updates)
    .eq('user_identity_id', envelope.data.agent_id);

  // Update envelope
  await supabase
    .from('credit_envelopes')
    .update({
      status: success ? 'settled' : 'defaulted',
      settlement_event_id: nostrEvent.id,
      settled_at: new Date(),
      settlement_proof: nostrEvent.content,
      validation_tier: validationTier,
      validator_npub: validatorNpub,
      oracle_attestation_id: oracleAttestationId,
      reputation_delta: weightedRepDelta,
      bond_released: success && envelope.data.bond != null,
      sig4sats_redeemed: sig4satsRedeemed,
      sig4sats_bonus_sats: sig4satsAmountSats,
    })
    .eq('id', envelopeId);

  // Recalculate credit limit
  const newCreditLimit = await recalculateCreditLimit(envelope.data.agent_id);
  await supabase
    .from('agent_profiles')
    .update({ credit_limit_sats: newCreditLimit })
    .eq('user_identity_id', envelope.data.agent_id);

  // Publish attestation if peer/oracle validated
  if (validationTier !== 'self_report') {
    await publishValidationAttestation({
      agentNpub: envelope.data.agent.npub, // user_identities column (NOT deprecated nostr_pubkey)
      envelopeId: envelopeId,
      validatorNpub: validatorNpub,
      validationTier: validationTier,
      success: success,
      sig4satsRedeemed: sig4satsRedeemed,
    });
  }

  return {
    status: success ? 'settled' : 'defaulted',
    validation_tier: validationTier,
    reputation_delta: weightedRepDelta,
    new_credit_limit: newCreditLimit,
    bond_released: success && envelope.data.bond != null,
    bond_slashed_sats: success ? 0 : (envelope.data.bond?.slashed_amount_sats || 0),
    sig4sats_redeemed: sig4satsRedeemed,
    sig4sats_bonus_sats: sig4satsAmountSats,
  };
}
```

**Verification Steps:**

- [ ] Credit envelope request charges 200 sat fee OR accepts blind token
- [ ] Sig4Sats token validated and locked
- [ ] Settlement with valid signature redeems Sig4Sats Cashu token
- [ ] Reputation bonus applied for Sig4Sats redemption
- [ ] All validation tiers work correctly

---

### Task 3.2: Sig4Sats Lock/Unlock Table Schema

**File:** `supabase/migrations/YYYYMMDD_sig4sats_locks.sql`

```sql
-- IDEMPOTENT: Safe to run multiple times
-- Create enum type idempotently
DO $$ BEGIN
  CREATE TYPE sig4sats_status AS ENUM ('locked', 'redeemed', 'expired', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create table idempotently
CREATE TABLE IF NOT EXISTS sig4sats_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- Postgres native (NOT uuid_generate_v4)

  -- Cashu token locked to signature
  cashu_token TEXT NOT NULL,
  cashu_mint_url TEXT NOT NULL,
  locked_amount_sats BIGINT NOT NULL,

  -- Event template that must be signed
  event_template JSONB NOT NULL,
  required_kind INTEGER,
  required_tags JSONB,

  -- Lock owner: References user_identities (NOT deprecated profiles)
  agent_id UUID REFERENCES user_identities(id),
  created_by_npub TEXT,

  -- Status
  status sig4sats_status DEFAULT 'locked',
  locked_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,

  -- Redemption
  redeemed_at TIMESTAMPTZ,
  settlement_event_id TEXT,
  settlement_signature TEXT,

  -- Related credit envelope
  credit_envelope_id UUID REFERENCES credit_envelopes(id),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Idempotent indexes
DO $$ BEGIN EXECUTE 'CREATE INDEX IF NOT EXISTS idx_sig4sats_agent ON sig4sats_locks(agent_id)'; END $$;
DO $$ BEGIN EXECUTE 'CREATE INDEX IF NOT EXISTS idx_sig4sats_status ON sig4sats_locks(status)'; END $$;
DO $$ BEGIN EXECUTE 'CREATE INDEX IF NOT EXISTS idx_sig4sats_envelope ON sig4sats_locks(credit_envelope_id)'; END $$;
DO $$ BEGIN EXECUTE 'CREATE INDEX IF NOT EXISTS idx_sig4sats_expires ON sig4sats_locks(expires_at) WHERE status = ''locked'''; END $$;

-- Idempotent ALTER TABLE: Add Sig4Sats columns to credit_envelopes
DO $$ BEGIN
  ALTER TABLE credit_envelopes ADD COLUMN sig4sats_lock_id UUID REFERENCES sig4sats_locks(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE credit_envelopes ADD COLUMN sig4sats_redeemed BOOLEAN DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE credit_envelopes ADD COLUMN sig4sats_bonus_sats BIGINT DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Idempotent ALTER TABLE: Add Sig4Sats columns to agent_settlements
DO $$ BEGIN
  ALTER TABLE agent_settlements ADD COLUMN sig4sats_redeemed BOOLEAN DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE agent_settlements ADD COLUMN sig4sats_amount_sats BIGINT DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- RLS policies for sig4sats_locks
ALTER TABLE sig4sats_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "agents_read_own_sig4sats_locks"
  ON sig4sats_locks FOR SELECT
  USING (agent_id = auth.uid());

CREATE POLICY IF NOT EXISTS "agents_insert_own_sig4sats_locks"
  ON sig4sats_locks FOR INSERT
  WITH CHECK (agent_id = auth.uid());

CREATE POLICY IF NOT EXISTS "service_role_full_sig4sats_locks"
  ON sig4sats_locks FOR ALL
  USING (auth.role() = 'service_role');
```

**Verification Steps:**

- [ ] Sig4Sats locks table created with IF NOT EXISTS
- [ ] Uses gen_random_uuid() (NOT uuid_generate_v4)
- [ ] References user_identities(id) (NOT deprecated profiles)
- [ ] All ALTER TABLE statements wrapped in idempotent DO blocks
- [ ] RLS policies enabled and created
- [ ] Indexes wrapped in idempotent DO blocks
- [ ] Foreign keys to credit envelopes work
- [ ] Status transitions tracked correctly

---

### Task 3.3: Work History & Task Records (with Monetization)

**File:** `netlify/functions/agents/task-record-create.ts`

```typescript
// ARCHITECTURE: Netlify Function (ESM) — task record creation with Sig4Sats
import { createServerSupabaseClient } from "../../lib/supabase-server";
import {
  createErrorResponse,
  logError,
  generateRequestId,
} from "../utils/error-handler";
import type { HandlerEvent } from "@netlify/functions";

interface CreateTaskRecordRequest {
  agent_id: string;
  task_title: string;
  task_description: string;
  task_type: string; // 'compute', 'data_processing', 'api_integration'
  requester_npub: string;
  estimated_duration_seconds: number;
  estimated_cost_sats: number;
  credit_envelope_id?: string;

  // Payment for task record creation fee (150 sats)
  fee_payment_method?: "blind_token" | "direct_payment";
  fee_payment_proof?: string;

  // Sig4Sats integration
  sig4sats_task_bond?: string;
}

export const handler = async (event: HandlerEvent) => {
  const requestId = generateRequestId();
  const supabase = createServerSupabaseClient();
  const request: CreateTaskRecordRequest = JSON.parse(event.body || "{}");

  // 1. MONETIZATION: Charge task record creation fee (150 sats)
  let feeCharged = false;

  if (request.fee_payment_method === "blind_token") {
    const tokenRedemption = await fetch(
      `${process.env.VITE_API_BASE_URL}/agents/redeem-blind-token`,
      {
        method: "POST",
        body: JSON.stringify({
          unblinded_token: request.fee_payment_proof,
          action_type: "agent_task_record_create",
          action_payload: { task_title: request.task_title },
        }),
      },
    );

    if (tokenRedemption.ok) {
      feeCharged = true;
    }
  } else {
    const feeResponse = await fetch(
      `${process.env.VITE_API_BASE_URL}/platform/charge-fee`,
      {
        method: "POST",
        body: JSON.stringify({
          agent_id: request.agent_id,
          action_type: "agent_task_record_create",
          payment_proof: request.fee_payment_proof,
        }),
      },
    );

    const feeResult = await feeResponse.json();
    if (feeResult.fee_paid) {
      feeCharged = true;
    } else {
      return {
        statusCode: 402,
        body: JSON.stringify({
          error: "Task record creation fee required",
          fee_sats: 150,
          payment_invoice: feeResult.payment_invoice,
        }),
      };
    }
  }

  if (!feeCharged) {
    return {
      statusCode: 402,
      body: JSON.stringify({ error: "Fee payment required" }),
    };
  }

  // 2. SIG4SATS: Lock Cashu bond to task completion if provided
  let sig4satsBondId: string | null = null;

  if (request.sig4sats_task_bond) {
    const cashuToken = JSON.parse(request.sig4sats_task_bond);

    // Create event template for task completion
    const completionEventTemplate = {
      kind: 30079, // Task completion custom kind
      content: "", // Will be filled with completion proof
      tags: [
        ["task_id", ""], // Will be filled with actual task ID
        ["agent", request.agent_id],
        ["status", "completed"],
      ],
    };

    const { data: sig4satsBond } = await supabase
      .from("sig4sats_locks")
      .insert({
        cashu_token: request.sig4sats_task_bond,
        cashu_mint_url: cashuToken.mint,
        locked_amount_sats: cashuToken.amount,
        event_template: completionEventTemplate,
        required_kind: 30079,
        agent_id: request.agent_id,
        created_by_npub: request.requester_npub,
        status: "locked",
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      })
      .select()
      .single();

    sig4satsBondId = sig4satsBond.id;
  }

  // 3. Generate Nostr event (kind 30078 - parameterized replaceable)
  const taskEvent = await publishNostrEvent({
    kind: 30078,
    content: JSON.stringify({
      title: request.task_title,
      description: request.task_description,
      type: request.task_type,
      estimated_duration: request.estimated_duration_seconds,
      estimated_cost: request.estimated_cost_sats,
      sig4sats_bonded: !!request.sig4sats_task_bond,
    }),
    tags: [
      ["d", `task-${Date.now()}`],
      ["agent", request.agent_id],
      ["requester", request.requester_npub],
      ["task_type", request.task_type],
      ["estimated_cost", request.estimated_cost_sats.toString()],
      request.sig4sats_task_bond ? ["sig4sats", "enabled"] : [],
    ].filter((t) => t.length > 0),
  });

  // 4. Store task record
  const { data: taskRecord } = await supabase
    .from("agent_task_records")
    .insert({
      agent_id: request.agent_id,
      task_title: request.task_title,
      task_description: request.task_description,
      task_type: request.task_type,
      status: "in_progress",
      task_event_id: taskEvent.id,
      requester_npub: request.requester_npub,
      estimated_duration_seconds: request.estimated_duration_seconds,
      estimated_cost_sats: request.estimated_cost_sats,
      credit_envelope_id: request.credit_envelope_id,
      sig4sats_bond_id: sig4satsBondId,
      started_at: new Date(),
    })
    .select()
    .single();

  // Update Sig4Sats lock with task ID
  if (sig4satsBondId) {
    await supabase
      .from("sig4sats_locks")
      .update({
        event_template: {
          ...completionEventTemplate,
          tags: [
            ["task_id", taskRecord.id],
            ["agent", request.agent_id],
            ["status", "completed"],
          ],
        },
      })
      .eq("id", sig4satsBondId);
  }

  return {
    statusCode: 201,
    body: JSON.stringify({
      task_id: taskRecord.id,
      task_event_id: taskEvent.id,
      sig4sats_bond_locked: !!sig4satsBondId,
      sig4sats_bond_id: sig4satsBondId,
      fee_paid_anonymously: request.fee_payment_method === "blind_token",
    }),
  };
};
```

**Verification Steps:**

- [ ] Task creation charges 150 sat fee OR accepts blind token
- [ ] Sig4Sats bond locked to completion event template
- [ ] Nostr event published with correct tags
- [ ] Task record stored in database

---

### Task 3.4: Task Completion with Sig4Sats Redemption

**File:** `netlify/functions/agents/task-complete.ts`

```typescript
// ARCHITECTURE: Netlify Function (ESM) — task completion with Sig4Sats
import { verifyCashuProof, redeemCashuToken } from '@cashu/cashu-ts';
import { verifyEvent, validateEvent } from 'nostr-tools';
import type { Event as NostrEvent } from 'nostr-tools';
import { createServerSupabaseClient } from '../../lib/supabase-server';
import { createErrorResponse, logError, generateRequestId } from '../utils/error-handler';
import type { HandlerEvent } from '@netlify/functions';

type ValidationTier = 'self_report' | 'peer_verified' | 'oracle_attested';

interface CompleteTaskRequest {
  task_id: string;
  actual_duration_seconds: number;
  actual_cost_sats: number;
  completion_proof: string;
  validation_tier: ValidationTier;
  validator_npub?: string;

  // Sig4Sats: Completion event signature to unlock bond
  completion_event_signature?: string;
  completion_event?: NostrEvent; // Typed Nostr event (replaces `any`)
}

export const handler = async (event: HandlerEvent) => {
  const requestId = generateRequestId();
  const supabase = createServerSupabaseClient();
  const request: CompleteTaskRequest = JSON.parse(event.body || '{}');

  // Join agent via user_identities + agent_profiles (NOT deprecated profiles)
  const task = await supabase
    .from('agent_task_records')
    .select('*, agent:user_identities(*, agent_profiles(*)), sig4sats_bond:sig4sats_locks(*)')
    .eq('id', request.task_id)
    .single();

  if (!task) {
    return createErrorResponse(404, 'Task not found', requestId);
  }

  // Validate validator authority
  if (request.validation_tier === 'peer_verified') {
    // Query agent_profiles via user_identities (NOT deprecated profiles)
    const { data: validatorData } = await supabase
      .from('user_identities')
      .select('id, agent_profiles(reputation_score)')
      .eq('npub', request.validator_npub)
      .single();

    const validatorReputation = validatorData?.agent_profiles?.reputation_score ?? 0;
    if (!validatorData || validatorReputation < 100) {
      return createErrorResponse(403, 'Validator reputation insufficient', requestId);
    }
  } else if (request.validation_tier === 'oracle_attested') {
    const oracleValid = await verifyTrustedOracle(request.validator_npub);
    if (!oracleValid) {
      return createErrorResponse(403, 'Validator not in trusted oracle list', requestId);
    }
  }

  // SIG4SATS: Verify completion event and redeem bond
  let sig4satsRedeemed = false;
  let sig4satsAmountSats = 0;

  if (task.data.sig4sats_bond && request.completion_event) {
    const eventValid = validateEvent(request.completion_event) && verifyEvent(request.completion_event);

    if (eventValid) {
      // Verify event matches template
      const template = task.data.sig4sats_bond.event_template;
      const eventMatchesTemplate =
        request.completion_event.kind === template.kind &&
        request.completion_event.tags.some(t => t[0] === 'task_id' && t [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/collection_879a2e8d-a656-48f7-ada6-0c3abf01c2a4/c461717a-1bdb-4e9a-936a-9692a8e83895/i-know-that-i-ve-explored-an-a-pihuI8UKSIa225LA.C3NBw.md) === request.task_id) &&
        request.completion_event.tags.some(t => t[0] === 'status' && t [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/collection_879a2e8d-a656-48f7-ada6-0c3abf01c2a4/c461717a-1bdb-4e9a-936a-9692a8e83895/i-know-that-i-ve-explored-an-a-pihuI8UKSIa225LA.C3NBw.md) === 'completed');

      if (eventMatchesTemplate) {
        try {
          const cashuToken = JSON.parse(task.data.sig4sats_bond.cashu_token);

          const redemption = await redeemCashuToken(
            cashuToken,
            template,
            request.completion_event
          );

          if (redemption.success) {
            sig4satsRedeemed = true;
            sig4satsAmountSats = redemption.amount_sats;

            // Update Sig4Sats lock
            await supabase
              .from('sig4sats_locks')
              .update({
                status: 'redeemed',
                redeemed_at: new Date(),
                settlement_event_id: request.completion_event.id,
                settlement_signature: request.completion_event.sig,
              })
              .eq('id', task.data.sig4sats_bond.id);

            // Credit agent
            await supabase
              .from('agent_payment_receipts')
              .insert({
                agent_id: task.data.agent_id,
                amount_sats: sig4satsAmountSats,
                payment_protocol: 'cashu',
                cashu_token: task.data.sig4sats_bond.cashu_token,
                purpose: 'sig4sats_task_completion_bonus',
                related_task_id: request.task_id,
                verified: true,
                received_at: new Date(),
              });
          }
        } catch (error) {
          logError(error instanceof Error ? error : new Error(String(error)), { context: 'sig4sats_task_redemption', taskId: request.task_id });
        }
      }
    }
  }

  // Generate completion signature
  const completionData = {
    task_id: request.task_id,
    actual_duration: request.actual_duration_seconds,
    actual_cost: request.actual_cost_sats,
    proof: request.completion_proof,
    timestamp: Date.now(),
    sig4sats_redeemed: sig4satsRedeemed,
  };

  // ZERO-KNOWLEDGE: Use NIP-46 remote signer or ClientSessionVault+SecureNsecManager
  // NEVER access nostr_secret_key from database — sign via ephemeral session
  const completionSignature = await signDataViaRemoteSigner(completionData, task.data.agent_id);

  // Update task record
  await supabase
    .from('agent_task_records')
    .update({
      status: 'completed',
      actual_duration_seconds: request.actual_duration_seconds,
      actual_cost_sats: request.actual_cost_sats,
      completion_proof: request.completion_proof,
      completion_signature: completionSignature,
      validation_tier: request.validation_tier,
      validator_npub: request.validator_npub,
      sig4sats_redeemed: sig4satsRedeemed,
      sig4sats_bonus_sats: sig4satsAmountSats,
      completed_at: new Date(),
    })
    .eq('id', request.task_id);

  // Calculate reputation delta with Sig4Sats bonus
  const baseRepDelta = Math.floor(request.actual_cost_sats / 1000);
  const sig4satsBonus = sig4satsRedeemed ? Math.floor(baseRepDelta * 0.15) : 0; // 15% bonus
  const totalRepDelta = baseRepDelta + sig4satsBonus;

  // Update agent reputation in agent_profiles (NOT deprecated profiles)
  const agentProfile = task.data.agent?.agent_profiles;
  await supabase
    .from('agent_profiles')
    .update({
      reputation_score: (agentProfile?.reputation_score ?? 0) + totalRepDelta,
      total_tasks_completed: (agentProfile?.total_tasks_completed ?? 0) + 1,
    })
    .eq('user_identity_id', task.data.agent_id);

  // Publish completion event
  const completionEvent = await publishNostrEvent({
    kind: 30079,
    content: JSON.stringify(completionData),
    tags: [
      ['e', task.data.task_event_id],
      ['agent', task.data.agent.npub], // user_identities column (NOT deprecated nostr_pubkey)
      ['validation_tier', request.validation_tier],
      ['validator', request.validator_npub],
      ['task_id', request.task_id],
      ['status', 'completed'],
      sig4satsRedeemed ? ['sig4sats_redeemed', sig4satsAmountSats.toString()] : [],
    ].filter(t => t.length > 0),
  });

  // Publish attestation if peer/oracle validated
  if (request.validation_tier !== 'self_report') {
    await publishAttestation({
      agentNpub: task.data.agent.npub, // user_identities column (NOT deprecated nostr_pubkey)
      taskId: request.task_id,
      validatorNpub: request.validator_npub,
      validationTier: request.validation_tier,
      label: `task-completed-${task.data.task_type}`,
      sig4satsRedeemed: sig4satsRedeemed,
    });
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      task_id: request.task_id,
      completion_event_id: completionEvent.id,
      validation_tier: request.validation_tier,
      reputation_delta: totalRepDelta,
      sig4sats_redeemed: sig4satsRedeemed,
      sig4sats_bonus_sats: sig4satsAmountSats,
      sig4sats_reputation_bonus: sig4satsBonus,
    }),
  };
}
```

**Verification Steps:**

- [ ] Task completion with valid Sig4Sats event redeems Cashu token
- [ ] Reputation bonus applied for Sig4Sats redemption
- [ ] Attestation published with Sig4Sats status
- [ ] Payment receipt recorded

---

### Task 3.5: Nostr Event Publishing (with Monetization)

**File:** `netlify/functions/agents/publish-nostr-event.ts`

```typescript
// ARCHITECTURE: Netlify Function (ESM) — Nostr event publishing with Sig4Sats
import { verifyCashuProof, redeemCashuToken } from "@cashu/cashu-ts";
import { getEventHash, verifyEvent, validateEvent, nip19 } from "nostr-tools";
import type { UnsignedEvent, Event as NostrEvent } from "nostr-tools";
import { SimplePool } from "nostr-tools";
import { createServerSupabaseClient } from "../../lib/supabase-server";
import {
  createErrorResponse,
  logError,
  generateRequestId,
} from "../utils/error-handler";
import type { HandlerEvent } from "@netlify/functions";

interface PublishNostrEventRequest {
  agent_id: string;
  event_kind: number;
  event_content: string;
  event_tags: string[][];

  // Payment for event publishing fee (21 sats)
  fee_payment_method?: "blind_token" | "direct_payment";
  fee_payment_proof?: string;

  // Optional: Sig4Sats - receive Cashu payment for publishing this event
  sig4sats_payment_for_event?: string;
}

export const handler = async (event: HandlerEvent) => {
  const requestId = generateRequestId();
  const supabase = createServerSupabaseClient();
  const request: PublishNostrEventRequest = JSON.parse(event.body || "{}");

  // 1. MONETIZATION: Charge event publishing fee (21 sats)
  let feeCharged = false;

  if (request.fee_payment_method === "blind_token") {
    const tokenRedemption = await fetch(
      `${process.env.VITE_API_BASE_URL}/agents/redeem-blind-token`,
      {
        method: "POST",
        body: JSON.stringify({
          unblinded_token: request.fee_payment_proof,
          action_type: "agent_status_event",
          action_payload: { kind: request.event_kind },
        }),
      },
    );

    if (tokenRedemption.ok) {
      feeCharged = true;
    }
  } else {
    const feeResponse = await fetch(
      `${process.env.VITE_API_BASE_URL}/platform/charge-fee`,
      {
        method: "POST",
        body: JSON.stringify({
          agent_id: request.agent_id,
          action_type: "agent_status_event",
          payment_proof: request.fee_payment_proof,
        }),
      },
    );

    const feeResult = await feeResponse.json();
    if (feeResult.fee_paid) {
      feeCharged = true;
    } else {
      return {
        statusCode: 402,
        body: JSON.stringify({
          error: "Event publishing fee required",
          fee_sats: 21,
          payment_invoice: feeResult.payment_invoice,
        }),
      };
    }
  }

  if (!feeCharged) {
    return {
      statusCode: 402,
      body: JSON.stringify({ error: "Fee payment required" }),
    };
  }

  // 2. Get agent identity from user_identities (NOT deprecated profiles)
  // Phase 4 uses a mocked signer-broker boundary here. Existing Satnam recovery
  // flows remain for non-agent users; agent signer/bunker implementation lands
  // in a dedicated later phase.
  const { data: agent } = await supabase
    .from("user_identities")
    .select("id, npub")
    .eq("id", request.agent_id)
    .single();

  if (!agent) {
    return createErrorResponse(404, "Agent not found", requestId);
  }

  // 3. SIG4SATS: Check if someone will pay for this event's signature
  let sig4satsPaymentAvailable = false;
  let sig4satsAmountSats = 0;
  let sig4satsLockId: string | null = null;

  if (request.sig4sats_payment_for_event) {
    const cashuToken = JSON.parse(request.sig4sats_payment_for_event);

    // Store Sig4Sats payment lock
    const { data: sig4satsLock } = await supabase
      .from("sig4sats_locks")
      .insert({
        cashu_token: request.sig4sats_payment_for_event,
        cashu_mint_url: cashuToken.mint,
        locked_amount_sats: cashuToken.amount,
        event_template: {
          kind: request.event_kind,
          content: request.event_content,
          tags: request.event_tags,
        },
        required_kind: request.event_kind,
        agent_id: request.agent_id,
        status: "locked",
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      })
      .select()
      .single();

    sig4satsLockId = sig4satsLock.id;
    sig4satsPaymentAvailable = true;
    sig4satsAmountSats = cashuToken.amount;
  }

  // 4. Create and sign Nostr event
  // ZERO-KNOWLEDGE: Sign via a placeholder AgentSignerBroker adapter now;
  // later phases plug this into the federation-governed signer/bunker path.
  // NEVER access nostr_secret_key from database
  const unsignedEvent: UnsignedEvent = {
    kind: request.event_kind,
    created_at: Math.floor(Date.now() / 1000),
    tags: request.event_tags,
    content: request.event_content,
    pubkey: agent.npub, // user_identities column (NOT deprecated nostr_pubkey)
  };

  // Sign via placeholder broker (mocked in Phase 4, replaced later by the
  // dedicated agent signer / bunker implementation)
  const nostrEvent = await signEventViaRemoteSigner(
    unsignedEvent,
    request.agent_id,
  );

  // 5. SIG4SATS: Redeem Cashu token if event signature matches
  let sig4satsRedeemed = false;

  if (sig4satsLockId) {
    try {
      const cashuToken = JSON.parse(request.sig4sats_payment_for_event);
      const template = {
        kind: request.event_kind,
        content: request.event_content,
        tags: request.event_tags,
      };

      const redemption = await redeemCashuToken(
        cashuToken,
        template,
        nostrEvent,
      );

      if (redemption.success) {
        sig4satsRedeemed = true;

        // Update lock status
        await supabase
          .from("sig4sats_locks")
          .update({
            status: "redeemed",
            redeemed_at: new Date(),
            settlement_event_id: nostrEvent.id,
            settlement_signature: nostrEvent.sig,
          })
          .eq("id", sig4satsLockId);

        // Credit agent
        await supabase.from("agent_payment_receipts").insert({
          agent_id: request.agent_id,
          amount_sats: sig4satsAmountSats,
          payment_protocol: "cashu",
          cashu_token: request.sig4sats_payment_for_event,
          purpose: "sig4sats_event_signature_payment",
          verified: true,
          received_at: new Date(),
        });
      }
    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)), {
        context: "sig4sats_event_redemption",
        agentId: request.agent_id,
      });
    }
  }

  // 6. Publish to Nostr relays (configurable, NOT hardcoded)
  const pool = new SimplePool();
  const relayUrls = (
    process.env.NOSTR_RELAYS ||
    "wss://relay.satnam.pub,wss://relay.damus.io,wss://nos.lol"
  ).split(",");
  const relays = relayUrls.map((r) => r.trim());

  await Promise.all(relays.map((relay) => pool.publish([relay], nostrEvent)));

  // 7. Record in platform
  await supabase.from("agent_nostr_events").insert({
    agent_id: request.agent_id,
    event_id: nostrEvent.id,
    event_kind: request.event_kind,
    event_published: true,
    sig4sats_redeemed: sig4satsRedeemed,
    sig4sats_earned_sats: sig4satsRedeemed ? sig4satsAmountSats : 0,
    published_at: new Date(),
  });

  return {
    statusCode: 200,
    body: JSON.stringify({
      event_id: nostrEvent.id,
      event_published: true,
      relays_published: relays.length,
      fee_paid_anonymously: request.fee_payment_method === "blind_token",
      sig4sats_redeemed: sig4satsRedeemed,
      sig4sats_earned_sats: sig4satsRedeemed ? sig4satsAmountSats : 0,
    }),
  };
};
```

**Verification Steps:**

- [ ] Event publishing charges 100 sat fee OR accepts blind token
- [ ] Sig4Sats payment locked to event signature
- [ ] Event signed and published to relays
- [ ] Sig4Sats token redeemed on successful publish
- [ ] Agent credited with Sig4Sats earnings

---

### Task 3.6: Contact/Relay Addition (with Monetization)

**File:** `netlify/functions/agents/add-contact.ts`

```typescript
// ARCHITECTURE: Netlify Function (ESM) — contact/relay addition with monetization
import { createServerSupabaseClient } from "../../lib/supabase-server";
import {
  createErrorResponse,
  logError,
  generateRequestId,
} from "../utils/error-handler";
import type { HandlerEvent } from "@netlify/functions";

interface AddContactRequest {
  agent_id: string;
  contact_type: "npub" | "relay";
  contact_value: string;

  // Payment for contact add fee (50 sats)
  fee_payment_method?: "blind_token" | "direct_payment";
  fee_payment_proof?: string;
}

export const handler = async (event: HandlerEvent) => {
  const requestId = generateRequestId();
  const supabase = createServerSupabaseClient();
  const request: AddContactRequest = JSON.parse(event.body || "{}");

  // 1. MONETIZATION: Charge contact add fee (50 sats)
  let feeCharged = false;

  if (request.fee_payment_method === "blind_token") {
    const tokenRedemption = await fetch(
      `${process.env.VITE_API_BASE_URL}/agents/redeem-blind-token`,
      {
        method: "POST",
        body: JSON.stringify({
          unblinded_token: request.fee_payment_proof,
          action_type: "agent_contact_add",
          action_payload: { contact_type: request.contact_type },
        }),
      },
    );

    if (tokenRedemption.ok) {
      feeCharged = true;
    }
  } else {
    const feeResponse = await fetch(
      `${process.env.VITE_API_BASE_URL}/platform/charge-fee`,
      {
        method: "POST",
        body: JSON.stringify({
          agent_id: request.agent_id,
          action_type: "agent_contact_add",
          payment_proof: request.fee_payment_proof,
        }),
      },
    );

    const feeResult = await feeResponse.json();
    if (feeResult.fee_paid) {
      feeCharged = true;
    } else {
      return {
        statusCode: 402,
        body: JSON.stringify({
          error: "Contact add fee required",
          fee_sats: 50,
          payment_invoice: feeResult.payment_invoice,
        }),
      };
    }
  }

  if (!feeCharged) {
    return {
      statusCode: 402,
      body: JSON.stringify({ error: "Fee payment required" }),
    };
  }

  // 2. Add contact/relay
  if (request.contact_type === "npub") {
    await supabase.from("agent_contacts").insert({
      agent_id: request.agent_id,
      contact_npub: request.contact_value,
      added_at: new Date(),
    });
  } else if (request.contact_type === "relay") {
    await supabase.from("agent_relays").insert({
      agent_id: request.agent_id,
      relay_url: request.contact_value,
      added_at: new Date(),
    });

    // Update coordination_relay_urls in agent_profiles
    await supabase.rpc("add_relay_to_agent_profile", {
      p_agent_id: request.agent_id,
      p_relay_url: request.contact_value,
    });
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      contact_added: true,
      contact_type: request.contact_type,
      fee_paid_anonymously: request.fee_payment_method === "blind_token",
    }),
  };
};
```

**SQL Function:**

```sql
-- Idempotent: CREATE OR REPLACE safely overwrites existing function
CREATE OR REPLACE FUNCTION add_relay_to_agent_profile(
  p_agent_id UUID,
  p_relay_url TEXT
)
RETURNS VOID AS $$
BEGIN
  -- Update agent_profiles (NOT deprecated profiles table)
  UPDATE agent_profiles
  SET coordination_relay_urls = array_append(coordination_relay_urls, p_relay_url)
  WHERE user_identity_id = p_agent_id
  AND NOT (p_relay_url = ANY(coordination_relay_urls));
END;
$$ LANGUAGE plpgsql;
```

**Verification Steps:**

- [ ] Contact add charges 50 sat fee OR accepts blind token
- [ ] Contact added to database
- [ ] Relay added and profile updated
- [ ] Anonymous payment via blind token works

---

### Task 3.7: Encrypted DM Sending (with Monetization)

**File:** `netlify/functions/agents/send-encrypted-dm.ts`

```typescript
// ARCHITECTURE: Netlify Function (ESM) — encrypted DM sending with monetization
// Uses existing ClientMessageService / CEPS gift-wrap patterns (NIP-17/59)
import { SimplePool } from "nostr-tools";
import type { UnsignedEvent } from "nostr-tools";
import { createServerSupabaseClient } from "../../lib/supabase-server";
import {
  createErrorResponse,
  logError,
  generateRequestId,
} from "../utils/error-handler";
import type { HandlerEvent } from "@netlify/functions";

interface SendEncryptedDMRequest {
  agent_id: string;
  recipient_npub: string;
  message_content: string;

  // Payment for DM send fee (21 sats per bundle)
  fee_payment_method?: "blind_token" | "direct_payment";
  fee_payment_proof?: string;
}

export const handler = async (event: HandlerEvent) => {
  const requestId = generateRequestId();
  const supabase = createServerSupabaseClient();
  const request: SendEncryptedDMRequest = JSON.parse(event.body || "{}");

  // 1. MONETIZATION: Charge DM bundle fee (21 sats per bundle)
  let feeCharged = false;

  if (request.fee_payment_method === "blind_token") {
    const tokenRedemption = await fetch(
      `${process.env.VITE_API_BASE_URL}/agents/redeem-blind-token`,
      {
        method: "POST",
        body: JSON.stringify({
          unblinded_token: request.fee_payment_proof,
          action_type: "agent_dm_bundle",
          action_payload: { recipient: request.recipient_npub },
        }),
      },
    );

    if (tokenRedemption.ok) {
      feeCharged = true;
    }
  } else {
    const feeResponse = await fetch(
      `${process.env.VITE_API_BASE_URL}/platform/charge-fee`,
      {
        method: "POST",
        body: JSON.stringify({
          agent_id: request.agent_id,
          action_type: "agent_dm_bundle",
          payment_proof: request.fee_payment_proof,
        }),
      },
    );

    const feeResult = await feeResponse.json();
    if (feeResult.fee_paid) {
      feeCharged = true;
    } else {
      return {
        statusCode: 402,
        body: JSON.stringify({
          error: "DM send fee required",
          fee_sats: 21,
          payment_invoice: feeResult.payment_invoice,
        }),
      };
    }
  }

  if (!feeCharged) {
    return {
      statusCode: 402,
      body: JSON.stringify({ error: "Fee payment required" }),
    };
  }

  // 2. Get agent identity from user_identities (NOT deprecated profiles)
  // ZERO-KNOWLEDGE: Only fetch npub — signing done via NIP-46 or SecureNsecManager session
  const { data: agent } = await supabase
    .from("user_identities")
    .select("id, npub")
    .eq("id", request.agent_id)
    .single();

  if (!agent) {
    return createErrorResponse(404, "Agent not found", requestId);
  }

  // 3. Encrypt and create NIP-17 gift wrap event via NIP-46 remote signer
  // ZERO-KNOWLEDGE: Encryption and signing done via remote signer session
  // NEVER access nostr_secret_key from database — use ClientMessageService/CEPS patterns
  const dmEvent = await createGiftWrappedDMViaRemoteSigner({
    agentId: request.agent_id,
    senderNpub: agent.npub,
    recipientNpub: request.recipient_npub,
    content: request.message_content,
  });

  // 4. Publish to Nostr relays (configurable, NOT hardcoded)
  const pool = new SimplePool();
  const relayUrls = (
    process.env.NOSTR_RELAYS ||
    "wss://relay.satnam.pub,wss://relay.damus.io,wss://nos.lol"
  ).split(",");
  const relays = relayUrls.map((r) => r.trim());

  await Promise.all(relays.map((relay) => pool.publish([relay], dmEvent)));

  // 5. Record DM (store only event metadata, NOT plaintext content)
  await supabase.from("agent_dms").insert({
    agent_id: request.agent_id,
    recipient_npub: request.recipient_npub,
    event_id: dmEvent.id,
    sent_at: new Date(),
  });

  return {
    statusCode: 200,
    body: JSON.stringify({
      dm_sent: true,
      event_id: dmEvent.id,
      fee_paid_anonymously: request.fee_payment_method === "blind_token",
    }),
  };
};
```

**Verification Steps:**

- [ ] DM send charges 25 sat fee OR accepts blind token
- [ ] Message encrypted with NIP-17
- [ ] Event published to relays
- [ ] DM recorded in database

---

### Task 3.8: Reputation & Trust Infrastructure (Portable, Verifiable Agent Reputation)

> **Priority:** High-priority competitive differentiator informed by the Lloyd
> experiment findings: _"the trust infrastructure doesn't exist yet… maybe
> reputation systems emerge."_ This task extends existing work-history and
> attestation flows to make **agent reputation portable across platforms**
> while preserving Satnam's privacy-first guarantees (no raw social graph
> dumping, per-user salted identifiers) and adding room for federation-readable
> reputation summaries that can be consumed by both humans and agents.

**Files:**

- `supabase/migrations/YYYYMMDD_reputation_infrastructure.sql`
- `netlify/functions/agents/export-reputation.ts`
- `netlify/functions/agents/import-reputation.ts`

#### 3.8.1 Database Schema: Reputation Events & Trust Links

> Builds on Phase 3 task records, Sig4Sats bonuses, and attestation events
> (`publishValidationAttestation`, `publishAttestation`) to create a
> **cross-platform reputation ledger** that can be exported as Nostr events
> (NIP-32 labels + a Satnam-specific attestation kind `1985`).

```sql
-- Atomic reputation events keyed to specific work/attestations
CREATE TABLE IF NOT EXISTS agent_reputation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Subject of the reputation event (always an agent identity)
  subject_agent_id UUID NOT NULL REFERENCES user_identities(id),

  -- Rater can be human or agent; nullable for imported or system events
  rater_identity_id UUID REFERENCES user_identities(id),

  -- Link to underlying task / envelope / contract when applicable
  related_task_id UUID,
  related_envelope_id UUID,

  -- Nostr attestation metadata (NIP-32 label or custom kind 1985-style event)
  nostr_event_id TEXT,
  nostr_event_kind INTEGER, -- e.g. 32 for labels, 1985 for "satnam_attestation"
  label_namespace TEXT,     -- e.g. "satnam.reputation"
  label_name TEXT,          -- e.g. "task_completed", "contract_fulfilled"

  -- Raw score and computed weight before decay (see 3.8.3)
  raw_score SMALLINT NOT NULL,
  weight NUMERIC NOT NULL,

  context JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Aggregated trust links without exposing a global social graph
CREATE TABLE IF NOT EXISTS agent_trust_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- from_identity_id/to_agent_id are **internal** identifiers; any public
  -- views must use hashed DUIDs from privacy_users to avoid social graph leaks
  from_identity_id UUID NOT NULL REFERENCES user_identities(id),
  to_agent_id UUID NOT NULL REFERENCES user_identities(id),

  successful_interactions INTEGER DEFAULT 0,
  failed_interactions INTEGER DEFAULT 0,
  last_interaction_at TIMESTAMPTZ,

  -- Rolling trust score used for routing and rate limits, not for raw display
  trust_score NUMERIC DEFAULT 0,

  context JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (from_identity_id, to_agent_id)
);

ALTER TABLE agent_reputation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_trust_links ENABLE ROW LEVEL SECURITY;

-- Subjects and raters can see their own detailed events; service_role can see all
CREATE POLICY IF NOT EXISTS "reputation_events_subject_or_rater"
  ON agent_reputation_events
  FOR SELECT
  USING (
    subject_agent_id = auth.uid()
    OR rater_identity_id = auth.uid()
  );

CREATE POLICY IF NOT EXISTS "reputation_events_service_full"
  ON agent_reputation_events
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY IF NOT EXISTS "trust_links_from_identity"
  ON agent_trust_links
  FOR SELECT, UPDATE
  USING (from_identity_id = auth.uid())
  WITH CHECK (from_identity_id = auth.uid());

CREATE POLICY IF NOT EXISTS "trust_links_service_full"
  ON agent_trust_links
  FOR ALL
  USING (auth.role() = 'service_role');
```

#### 3.8.2 Verifiable Nostr Attestations (NIP-32 + Kind 1985)

- Extend existing `publishValidationAttestation` / `publishAttestation` helpers
  to **emit paired artifacts**:
  - A NIP-32 label event describing the reputation context
    (`satnam.reputation` namespace, labels like `task-completed-high-satisfaction`).
  - An optional **satnam-specific attestation event** (conceptual
    `kind 1985`) that carries structured JSON in `content` with references to
    `agent_npub`, `related_task_id`, validation tier, and Sig4Sats status.
- On successful publication, write a row into `agent_reputation_events` with:
  - `subject_agent_id` (agent receiving reputation).
  - `rater_identity_id` (human/agent issuing attestation, when known).
  - `nostr_event_id`, `nostr_event_kind`, `label_namespace`, `label_name`.
  - `raw_score` derived from validation tier and bond backing (e.g. +1 light,
    +5 strong, +10 multi-guardian as already described in **Attestation Trust
    Model**).
  - `weight` initialised to `raw_score` before decay.

#### 3.8.3 Reputation Decay & Portable Scores

- Implement a Postgres helper to compute **time-decayed reputation** so that
  older attestations naturally lose influence:

```sql
CREATE OR REPLACE FUNCTION calculate_decayed_reputation(
  p_agent_id UUID,
  p_now TIMESTAMPTZ DEFAULT NOW()
)
RETURNS NUMERIC AS $$
  -- Example: exponential decay with half-life ~180 days
  SELECT COALESCE(SUM(
    weight * EXP(-EXTRACT(EPOCH FROM (p_now - created_at)) / (180 * 24 * 3600))
  ), 0)
  FROM agent_reputation_events
  WHERE subject_agent_id = p_agent_id;
$$ LANGUAGE sql STABLE;
```

- Periodically (or on-demand), update `agent_profiles.reputation_score` using
  `calculate_decayed_reputation(id)` so existing dashboards (Task 4.1/4.4) pick
  up decayed scores **without schema changes**.

#### 3.8.4 Export/Import: Portable Reputation Bundles

**File:** `netlify/functions/agents/export-reputation.ts`

- Returns a **signed bundle** of:
  - Aggregated decayed score.
  - Recent `agent_reputation_events` rows (capped, e.g. last 500).
  - Corresponding Nostr event IDs (labels + kind 1985 attestations).
- Signs the export with the creator's or guardian's npub via NIP-46 remote
  signer, so other platforms can verify that **a known human/guardian vouches
  for this reputation snapshot** (ties into Task 4.6 vouching below).

**File:** `netlify/functions/agents/import-reputation.ts`

- Allows an agent to **import** a portable reputation bundle they control,
  verifying:
  - Signature from a trusted human/guardian.
  - That referenced Nostr events exist on one or more relays.
- Imported events are re-materialized into `agent_reputation_events` with a
  `context.import_source = 'external'` flag, preserving provenance.

#### 3.8.5 Federation Reputation Summary Layer (**Should add next**)

- Keep **trust calibration dashboards** (Task 4.5.4) as a _local_ human-facing
  aid, but do **not** treat them as the canonical portable reputation artifact.
- Add a federation/agent reputation summary layer that is both:
  - **Human-readable** in Satnam dashboards
  - **Machine-readable** for external agents/platforms querying Nostr or API
- Preferred publication model:
  - `kind 31990` remains the **discovery front door** for service/platform lookup
  - `kind 30300` becomes the **parameterized replaceable summary** for
    federation/agent reputation snapshots
  - optional references from that summary point to `kind 1985`, `kind 39211`,
    `kind 39212/39213`, and current-scope `kind 30100` solvency artifacts from Task 4.8
- Summary payload should include:
  - decayed reputation score
  - bond release/slash history summary
  - vouch and Circle-of-Trust summaries
  - guardian approval evidence references where applicable
  - latest solvency summary references when a federation mint exists
  - NIP-03 / OpenTimestamps references where a summary or supporting artifact is
    anchored in the current implementation sequence

#### 3.8.6 Canonical Proof-of-Work Indexing via `kind 39211` (**Should add next**)

- Canonical machine-readable Proof-of-Work indexing should be anchored on
  **`kind 39211` aggregation/result events**, not solely on settlement receipts
  such as `kind 39244`.
- Rationale: `kind 39211` can serve as the aggregation point tying together:
  - result/outcome
  - settlement receipt(s)
  - trajectory/execution history (`kind 39230` / `kind 39231`)
  - execution hash / delegated work references
- Extend reputation/work-history materialization to capture fields such as:
  - `tick_result_event_id`
  - `trajectory_session_id`
  - `trajectory_hash`
  - `child_trajectory_session_id`
  - `delegated_to_federation_npub`
- Treat `kind 39244` as important financial evidence, but not the sole source of
  verifiable work history.

#### 3.8.7 Guardian-Approval-Backed Circle of Trust (**Should add next**)

- Circle of Trust, vouch, and trust-label artifacts should not float as
  unsupported labels for high-trust claims.
- For high-value federation endorsements, require labels or summary entries to
  reference **guardian approval evidence** such as `kind 39212` / `kind 39213`
  events (or equivalent internal approval records if Nostr publication is not yet
  enabled).
- Continue using lightweight labels for low-stakes social proof, but distinguish
  them clearly from guardian-backed endorsements in both UI and exported bundles.

**Verification Steps:**

- [ ] Attestations generated in Tasks 3.1–3.4 create corresponding
      `agent_reputation_events` rows.
- [ ] `calculate_decayed_reputation` lowers the effect of very old
      attestations while preserving recent work.
- [ ] Exported reputation bundle verifies against Nostr events and signer npub.
- [ ] Import flow does **not** allow forging reputation for other agents.
- [ ] No RLS policy exposes raw trust links as a global social graph; only
      aggregated scores and per-relationship views are available.
- [ ] Federation reputation summaries can be generated without exposing raw trust
      edges or private federation-only data.
- [ ] Canonical PoW/work-history indexing references `kind 39211` aggregation
      points when available.
- [ ] Guardian-backed trust claims are distinguishable from unbacked labels.

---

### Task 3.9: Autonomy Configuration (Approval Thresholds & Escalation Rules)

> **Priority:** High-priority competitive differentiator directly addressing
> Lloyd's "approval theatre" problem: an agent that asks for permission for
> every action becomes a stressful email filter, but unconstrained autonomy is
> unsafe. This task introduces **explicit autonomy configuration** so creators
> can choose where they want a safety net.

**Files:**

- `supabase/migrations/YYYYMMDD_agent_autonomy_config.sql`
- `netlify/functions/agents/enforce-autonomy.ts`
- `src/components/agents/AgentCreationWizard.tsx` (extends Task 4.4.3)

#### 3.9.1 Schema Extension: Autonomy Fields on Intent Config

> Reuses the existing `agent_intent_configurations.extra_config` JSONB column
> instead of adding new tables. The autonomy shape is **strongly typed** in
> TypeScript and validated at the edge.

```sql
-- Documented JSON structure stored in agent_intent_configurations.extra_config
-- under the "autonomy" key. No schema change needed beyond comments, but this
-- migration can add a CHECK to ensure the field is an object when present.

ALTER TABLE agent_intent_configurations
  ADD COLUMN IF NOT EXISTS extra_config JSONB DEFAULT '{}'::jsonb;

ALTER TABLE agent_intent_configurations
  ADD CONSTRAINT agent_intent_extra_config_object
  CHECK (jsonb_typeof(extra_config) = 'object');
```

Canonical `autonomy` shape (documented for TypeScript and validation):

```typescript
interface AgentAutonomyConfig {
  // Monetary thresholds (sats)
  max_auto_spend_single_sats: number; // e.g. 100
  max_auto_spend_daily_sats: number; // per 24h rolling window

  // Structural guardrails
  require_human_for_external_api_calls: boolean;

  risk_tolerance: {
    payments: "low" | "medium" | "high";
    data_access: "low" | "medium" | "high";
    messaging: "low" | "medium" | "high";
  };

  escalation_rules: {
    trigger:
      | "payment_over_limit"
      | "new_external_api_domain"
      | "bulk_message_send"
      | "suspicious_task_pattern";
    action: "pause_and_notify" | "log_only";
    channel: "email" | "nostr_dm";
  }[];
}

interface AgentIntentConfig {
  // Existing fields from Task 4.4.2 …
  vision_title: string;
  vision_summary: string;
  mission_summary: string;
  mission_checklist?: string[];
  value_context: string;
  constraints?: string[];
  success_metrics?: string[];

  autonomy?: AgentAutonomyConfig; // <— New optional field
}
```

`AgentAutonomyConfig` is stored as `extra_config->'autonomy'` for each row in
`agent_intent_configurations`.

#### 3.9.2 Wizard UI: Autonomy Step (Cautious ↔ Bold)

Extend **Agent Creation Wizard** (Task 4.4.3) with a dedicated **Autonomy &
Guardrails** section:

- Add a new sub-step in the intent flow (e.g., between Mission and Value
  Creation) that surfaces:
  - A **Cautious ↔ Bold** slider mapped to presets for `AgentAutonomyConfig`.
  - Toggles for:
    - "Auto-approve actions under 100 sats" (configurable slider).
    - "Require human approval for all new external API domains".
    - "Pause and notify on bulk DM sends".
- Default presets based on Master Context role:
  - `'adult'` agents: medium-risk default (some auto-approval under low sats).
  - `'offspring'` agents: low-risk default (no autonomous payments, stricter
    escalation rules).

Wizard submits `autonomy` as part of the `intent` payload, which is then
persisted into `extra_config.autonomy`.

#### 3.9.3 Runtime Enforcement Helper

**File:** `netlify/functions/agents/enforce-autonomy.ts`

```typescript
type AutonomyActionType =
  | "payment"
  | "external_api_call"
  | "agent_dm_bundle"
  | "agent_task_record_create"
  | "agent_credit_envelope_request";

interface AutonomyCheckContext {
  agentId: string;
  actionType: AutonomyActionType;
  estimatedCostSats?: number;
  externalApiDomain?: string;
  messageBatchSize?: number;
}

export async function enforceAutonomyRules(
  ctx: AutonomyCheckContext,
): Promise<{ allowed: boolean; reason?: string }> {
  const autonomy = await loadAutonomyConfigForAgent(ctx.agentId);
  if (!autonomy) return { allowed: true }; // default to existing behavior

  // 1) Monetary limits
  if (
    ctx.actionType === "payment" &&
    typeof ctx.estimatedCostSats === "number" &&
    ctx.estimatedCostSats > autonomy.max_auto_spend_single_sats
  ) {
    return {
      allowed: false,
      reason: "payment_over_limit",
    };
  }

  // 2) External API guardrail
  if (
    ctx.actionType === "external_api_call" &&
    autonomy.require_human_for_external_api_calls
  ) {
    return {
      allowed: false,
      reason: "external_api_requires_human",
    };
  }

  // 3) Bulk messaging / other triggers handled similarly…
  return { allowed: true };
}
```

- Integrate `enforceAutonomyRules` into sensitive Netlify functions from
  Phase 3:
  - `credit-envelope-lifecycle.ts` (credit requests).
  - `task-create.ts` / `task-complete.ts` (high-cost operations).
  - `publish-nostr-event.ts` (spammy or high-fee events).
  - `send-encrypted-dm.ts` (bulk messaging).
- When an action is blocked, the function should:
  - Return a structured `AutonomyFailureHint` to the caller (similar to
    `EconomicFailureHint`) explaining **which rule triggered**.
  - Optionally emit an escalation notification (email / Nostr DM) according to
    `escalation_rules`.

**Verification Steps:**

- [ ] Autonomy presets differ between `'adult'` and `'offspring'` agents in the
      wizard.
- [ ] Actions exceeding configured thresholds are blocked with clear
      `AutonomyFailureHint` responses.
- [ ] Bulk messaging attempts from an agent configured as "cautious" are
      paused and surfaced to the creator.
- [ ] No action ever bypasses autonomy rules when `autonomy` is configured.
- [ ] Autonomy configuration can be updated via intent edits and takes effect
      without requiring agent re-creation.

---

## Phase 4: Frontend UI (with Monetization & Token Management)

### Task 4.1: Agent Dashboard with Fee Tracking

**File:** `src/components/AgentDashboard.tsx`

```typescript
// Type definitions for agent dashboard data
interface AgentDashboardData {
  id: string;
  npub: string;
  nip05: string | null;
  agent_profiles: {
    agent_role: string;
    reputation_score: number;
    credit_limit_sats: number;
    current_bonded_sats: number;
    total_bonds_released_sats: number;
    total_bonds_staked_sats: number;
    unified_address: string;
    nip05_verified: boolean;
    free_tier_claimed: boolean;
    free_tier_allocation_number: number | null;
    tier1_validations: number;
    tier2_validations: number;
    tier3_validations: number;
    event_tokens_balance: number;
    task_tokens_balance: number;
    contact_tokens_balance: number;
    dm_tokens_balance: number;
    total_platform_fees_paid_sats: number;
  } | null;
  payment_config: Record<string, unknown> | null;
}

interface TokenBalances {
  event_tokens: number;
  task_tokens: number;
  contact_tokens: number;
  dm_tokens: number;
}

function AgentDashboard({ agentId }: { agentId: string }) {
  const [agent, setAgent] = useState<AgentDashboardData | null>(null);
  const [tokenBalances, setTokenBalances] = useState<TokenBalances>({ event_tokens: 0, task_tokens: 0, contact_tokens: 0, dm_tokens: 0 });
  const [platformFeesPaid, setPlatformFeesPaid] = useState(0);

  useEffect(() => {
    async function fetchAgent() {
      // Query user_identities + agent_profiles (NOT deprecated profiles)
      const { data } = await supabase
        .from('user_identities')
        .select('*, agent_profiles(*), payment_config:agent_payment_config(*)')
        .eq('id', agentId)
        .single();
      setAgent(data);

      // Get token balances from agent_profiles (NOT deprecated profiles)
      const ap = data?.agent_profiles;
      setTokenBalances({
        event_tokens: ap?.event_tokens_balance ?? 0,
        task_tokens: ap?.task_tokens_balance ?? 0,
        contact_tokens: ap?.contact_tokens_balance ?? 0,
        dm_tokens: ap?.dm_tokens_balance ?? 0,
      });

      setPlatformFeesPaid(ap?.total_platform_fees_paid_sats ?? 0);
    }
    fetchAgent();
  }, [agentId]);

  if (!agent) return <div>Loading...</div>;

  return (
    <div className="agent-dashboard">
      {/* Identity Section */}
      <div className="identity-card">
        <h2>{agent.agent_profiles?.unified_address}</h2>
        {/* Master Context compliant: agent_role reuses the existing platform role family */}
        <span className="badge">{agent.agent_profiles?.agent_role}</span>
        {agent.agent_profiles?.nip05_verified && <span className="verified">✓ NIP-05</span>}
        {agent.agent_profiles?.free_tier_claimed && (
          <span className="free-tier-badge">
            Free Tier #{agent.agent_profiles?.free_tier_allocation_number}
          </span>
        )}
      </div>

      {/* Blind Token Balances */}
      <div className="token-balances-card">
        <h3>Blind Token Balances</h3>
        <div className="token-grid">
          <div className="token-item">
            <span className="token-label">Event Publishing</span>
            <span className="token-balance">{tokenBalances.event_tokens}</span>
            <button onClick={() => purchaseTokens('agent_status_event', 10)}>
              Buy 10 (210 sats)
            </button>
          </div>
          <div className="token-item">
            <span className="token-label">Task Creation</span>
            <span className="token-balance">{tokenBalances.task_tokens}</span>
            <button onClick={() => purchaseTokens('agent_task_record_create', 10)}>
              Buy 10 (1,500 sats)
            </button>
          </div>
          <div className="token-item">
            <span className="token-label">Contact Addition</span>
            <span className="token-balance">{tokenBalances.contact_tokens}</span>
            <button onClick={() => purchaseTokens('agent_contact_add', 10)}>
              Buy 10 (500 sats)
            </button>
          </div>
          <div className="token-item">
            <span className="token-label">Encrypted DM Bundles</span>
            <span className="token-balance">{tokenBalances.dm_tokens}</span>
            <button onClick={() => purchaseTokens('agent_dm_bundle', 10)}>
              Buy 10 bundles (210 sats)
            </button>
          </div>
        </div>
        <div className="token-info">
          <p>💡 Blind tokens allow anonymous actions without linking to your identity</p>
        </div>
      </div>

      {/* Platform Fees Paid */}
      <div className="fees-paid-card">
        <h3>Platform Fees</h3>
        <div className="fee-stat">
          <span className="label">Total Paid:</span>
          <span className="value">{formatSats(platformFeesPaid)}</span>
        </div>
        <div className="fee-breakdown">
          <h4>Recent Transactions</h4>
          <RecentFeesTable agentId={agentId} />
        </div>
      </div>

      {/* Unified Payment Address */}
      <div className="payment-address-card">
        <h3>Universal Payment Address</h3>
        <div className="address-display">
          <input readOnly value={agent.unified_address} />
          <button onClick={() => copyToClipboard(agent.unified_address)}>
            Copy
          </button>
        </div>
        <div className="protocol-badges">
          {agent.payment_config?.lightning_enabled && <span className="badge">⚡ Lightning</span>}
          {agent.payment_config?.cashu_enabled && <span className="badge">🥜 Cashu</span>}
          {agent.payment_config?.fedimint_enabled && <span className="badge">🏛️ Fedimint</span>}
        </div>
        <div className="payment-stats">
          <div className="stat">
            <span className="label">Lightning Received:</span>
            <span className="value">
              {formatSats(agent.payment_config?.total_received_lightning_sats || 0)}
            </span>
          </div>
          <div className="stat">
            <span className="label">Cashu Received:</span>
            <span className="value">
              {formatSats(agent.payment_config?.total_received_cashu_sats || 0)}
            </span>
          </div>
          <div className="stat">
            <span className="label">Fedimint Received:</span>
            <span className="value">
              {formatSats(agent.payment_config?.total_received_fedimint_sats || 0)}
            </span>
          </div>
        </div>
      </div>

      {/* Reputation & Bonds (from agent_profiles, NOT deprecated profiles) */}
      <div className="reputation-card">
        <h3>Reputation & Bonds</h3>
        <div className="metrics-grid">
          <div className="metric">
            <span className="label">Reputation Score</span>
            <span className="value">{agent.agent_profiles?.reputation_score ?? 0}</span>
          </div>
          <div className="metric">
            <span className="label">Credit Limit</span>
            <span className="value">{formatSats(agent.agent_profiles?.credit_limit_sats ?? 0)}</span>
          </div>
          <div className="metric">
            <span className="label">Currently Bonded</span>
            <span className="value">{formatSats(agent.agent_profiles?.current_bonded_sats ?? 0)}</span>
          </div>
          <div className="metric">
            <span className="label">Bond Release Rate</span>
            <span className="value">
              {calculateBondReleaseRate(
                agent.agent_profiles?.total_bonds_released_sats ?? 0,
                agent.agent_profiles?.total_bonds_staked_sats ?? 0
              )}%
            </span>
          </div>
        </div>

        <div className="validation-tiers">
          <h4>Validation Quality</h4>
          <div className="tier-breakdown">
            <div className="tier">⭐ Self-Report: {agent.agent_profiles?.tier1_validations ?? 0}</div>
            <div className="tier">⭐⭐ Peer Verified: {agent.agent_profiles?.tier2_validations ?? 0}</div>
            <div className="tier">⭐⭐⭐ Oracle: {agent.agent_profiles?.tier3_validations ?? 0}</div>
          </div>
        </div>
      </div>

      {/* Sig4Sats Earnings */}
      <div className="sig4sats-earnings-card">
        <h3>Sig4Sats Earnings</h3>
        <Sig4SatsEarningsTable agentId={agentId} />
      </div>
    </div>
  );
}

interface FeeRecord {
  id: string;
  action_type: string;
  fee_sats: number;
  payment_protocol: string;
  paid_at: string;
}

function RecentFeesTable({ agentId }: { agentId: string }) {
  const [fees, setFees] = useState<FeeRecord[]>([]);

  useEffect(() => {
    async function fetchFees() {
      const { data } = await supabase
        .from('platform_revenue')
        .select('*')
        .eq('payer_agent_id', agentId)
        .eq('payment_status', 'paid')
        .order('paid_at', { ascending: false })
        .limit(10);
      setFees(data);
    }
    fetchFees();
  }, [agentId]);

  return (
    <table className="fees-table">
      <thead>
        <tr>
          <th>Action</th>
          <th>Amount</th>
          <th>Protocol</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody>
        {fees.map(fee => (
          <tr key={fee.id}>
            <td>{fee.action_type.replace(/_/g, ' ')}</td>
            <td>{formatSats(fee.fee_sats)}</td>
            <td>{fee.payment_protocol}</td>
            <td>{formatRelativeTime(fee.paid_at)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Sig4SatsEarningsTable({ agentId }: { agentId: string }) {
  const [earnings, setEarnings] = useState<{ id: string; purpose: string; amount_sats: number; received_at: string }[]>([]);
  const [totalEarned, setTotalEarned] = useState(0);

  useEffect(() => {
    async function fetchEarnings() {
      const { data } = await supabase
        .from('agent_payment_receipts')
        .select('*')
        .eq('agent_id', agentId)
        .eq('payment_protocol', 'cashu')
        .like('purpose', 'sig4sats%')
        .order('received_at', { ascending: false });

      setEarnings(data);
      setTotalEarned(data.reduce((sum, r) => sum + r.amount_sats, 0));
    }
    fetchEarnings();
  }, [agentId]);

  return (
    <div className="sig4sats-earnings">
      <div className="total-earned">
        <span className="label">Total Sig4Sats Earned:</span>
        <span className="value">{formatSats(totalEarned)}</span>
      </div>

      <table className="earnings-table">
        <thead>
          <tr>
            <th>Purpose</th>
            <th>Amount</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {earnings.map(earning => (
            <tr key={earning.id}>
              <td>{earning.purpose.replace('sig4sats_', '').replace(/_/g, ' ')}</td>
              <td>{formatSats(earning.amount_sats)}</td>
              <td>{formatRelativeTime(earning.received_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

**Verification Steps:**

- [ ] Dashboard displays token balances
- [ ] Fee payment history visible
- [ ] Sig4Sats earnings tracked
- [ ] Token purchase buttons work
- [ ] Payment address displayed correctly

---

### Task 4.2: Token Purchase Modal

**File:** `src/components/TokenPurchaseModal.tsx`

```typescript
function TokenPurchaseModal({
  agentId,
  tokenType,
  quantity,
  onClose
}: TokenPurchaseModalProps) {
  const [paymentProtocol, setPaymentProtocol] = useState<'lightning' | 'cashu' | 'fedimint'>('lightning');
  const [paymentInvoice, setPaymentInvoice] = useState<string | null>(null);
  const [purchasing, setPurchasing] = useState(false);

  const feePerToken = {
    agent_status_event: 21,
    agent_task_record_create: 150,
    agent_contact_add: 50,
    agent_dm_bundle: 21,
  }[tokenType];

  const totalFee = feePerToken * quantity;

  async function initiateTokenPurchase() {
    setPurchasing(true);

    // Generate blinded messages
    const tokenManager = new BlindTokenManager();
    const blindedMessages = [];

    for (let i = 0; i < quantity; i++) {
      const randomMessage = generateRandomMessage();
      const blindingFactor = generateBlindingFactor();
      const blindedMessage = blindMessage(randomMessage, blindingFactor);
      blindedMessages.push({ randomMessage, blindingFactor, blindedMessage });
    }

    // Request payment
    const response = await fetch('/api/agents/issue-blind-tokens', {
      method: 'POST',
      body: JSON.stringify({
        agent_id: agentId,
        token_type: tokenType,
        quantity,
        blinded_messages: blindedMessages.map(d => d.blindedMessage),
      }),
    });

    const result = await response.json();

    if (result.error === 'Payment required') {
      // Show payment invoice
      setPaymentInvoice(result.payment_request);
    } else if (result.tokens_issued) {
      // Payment already made, unblind signatures
      const tokens = [];

      for (let i = 0; i < quantity; i++) {
        const unblindedSignature = unblindSignature(
          result.blind_signatures[i],
          blindedMessages[i].blindingFactor,
          result.keypair_public_key
        );

        tokens.push({
          unblindedToken: blindedMessages[i].randomMessage,
          unblindedSignature,
          tokenType,
          keypairPublicKey: result.keypair_public_key,
          expiresAt: new Date(result.expires_at),
        });
      }

      // Save tokens locally
      await tokenManager.saveTokens(tokens);

      // Update UI
      toast.success(`Purchased ${quantity} ${tokenType} tokens!`);
      onClose();
    }

    setPurchasing(false);
  }

  async function handlePaymentComplete(paymentProof: string) {
    // Retry token purchase with payment proof
    const tokenManager = new BlindTokenManager();
    const tokens = await tokenManager.purchaseTokens(
      agentId,
      tokenType,
      quantity,
      paymentProof
    );

    toast.success(`Purchased ${tokens.length} tokens! They're stored locally and can be used anonymously.`);
    onClose();
  }

  return (
    <div className="modal-overlay">
      <div className="token-purchase-modal">
        <h3>Purchase {tokenType.replace('_', ' ')} Tokens</h3>

        <div className="purchase-summary">
          <div className="summary-row">
            <span>Quantity:</span>
            <span>{quantity} tokens</span>
          </div>
          <div className="summary-row">
            <span>Price per token:</span>
            <span>{feePerToken} sats</span>
          </div>
          <div className="summary-row total">
            <span>Total:</span>
            <span>{totalFee} sats</span>
          </div>
        </div>

        {!paymentInvoice ? (
          <>
            <div className="protocol-selector">
              <label>Payment Protocol:</label>
              <select
                value={paymentProtocol}
                onChange={e => setPaymentProtocol(e.target.value as 'lightning' | 'cashu' | 'fedimint')}
              >
                <option value="lightning">⚡ Lightning</option>
                <option value="cashu">🥜 Cashu</option>
                <option value="fedimint">🏛️ Fedimint</option>
              </select>
            </div>

            <div className="privacy-notice">
              <p>💡 <strong>Privacy Note:</strong> These tokens can be redeemed anonymously.
              The platform won't know which specific agent redeemed them.</p>
            </div>

            <div className="modal-actions">
              <button onClick={onClose} className="btn-secondary">
                Cancel
              </button>
              <button
                onClick={initiateTokenPurchase}
                disabled={purchasing}
                className="btn-primary"
              >
                {purchasing ? 'Generating...' : 'Purchase Tokens'}
              </button>
            </div>
          </>
        ) : (
          <PaymentInterface
            paymentInvoice={paymentInvoice}
            protocol={paymentProtocol}
            amount={totalFee}
            onPaymentComplete={handlePaymentComplete}
          />
        )}
      </div>
    </div>
  );
}
```

**Verification Steps:**

- [ ] Modal displays correct pricing
- [ ] Blinded messages generated
- [ ] Payment invoice displayed
- [ ] Tokens saved locally after purchase
- [ ] Privacy notice visible

---

### Task 4.3: Action Buttons with Fee Display

**File:** `src/components/ActionButtons.tsx`

```typescript
function PublishEventButton({ agentId }: { agentId: string }) {
  const [hasTokens, setHasTokens] = useState(false);
  const [showPaymentChoice, setShowPaymentChoice] = useState(false);

  useEffect(() => {
    const tokenManager = new BlindTokenManager();
    setHasTokens(tokenManager.getBalance('agent_status_event') > 0);
  }, []);

  async function publishEvent(useToken: boolean) {
    if (useToken) {
      // Use blind token for anonymous publishing
      const tokenManager = new BlindTokenManager();
      await tokenManager.redeemToken('agent_status_event', eventPayload);
      toast.success('Event published anonymously!');
    } else {
      // Direct payment
      const feeResponse = await fetch('/api/platform/charge-fee', {
        method: 'POST',
        body: JSON.stringify({
          agent_id: agentId,
          action_type: 'agent_status_event',
        }),
      });

      const { payment_invoice } = await feeResponse.json();

      // Show payment modal
      showPaymentModal(payment_invoice, async (proof) => {
        await publishNostrEvent({ ...eventPayload, fee_payment_proof: proof });
        toast.success('Event published!');
      });
    }
  }

  return (
    <div className="publish-event-action">
      <button
        onClick={() => setShowPaymentChoice(true)}
        className="btn-primary"
      >
        Publish Event
      </button>

      {showPaymentChoice && (
        <div className="payment-choice-modal">
          <h4>How would you like to pay?</h4>

          {hasTokens && (
            <button
              onClick={() => publishEvent(true)}
              className="payment-option anonymous"
            >
              <span className="option-icon">🎭</span>
              <div className="option-details">
                <strong>Use Blind Token</strong>
                <small>Anonymous - Platform won't know it's you</small>
              </div>
            </button>
          )}

          <button
            onClick={() => publishEvent(false)}
            className="payment-option direct"
          >
            <span className="option-icon">⚡</span>
            <div className="option-details">
                <strong>Direct Payment (21 sats)</strong>
              <small>Lightning, Cashu, or Fedimint</small>
            </div>
          </button>

          {!hasTokens && (
            <div className="no-tokens-notice">
              <p>No blind tokens available. <a href="#" onClick={() => openTokenPurchaseModal('agent_status_event')}>Buy tokens</a> for anonymous publishing.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Similar components for other actions:
// - CreateTaskButton (150 sats or token)
// - AddContactButton (50 sats or token)
// - SendDMButton (21 sats or token)
```

**Verification Steps:**

- [ ] Buttons show fee amounts
- [ ] Token availability checked
- [ ] Payment choice modal displays
- [ ] Anonymous vs direct payment clear
- [ ] Token purchase link works

---

### Task 4.4: Agent Creation Wizard & Management Dashboard

> **GOAL:** Provide a high-volume, human-friendly **Agent Creation Wizard** and a
> consolidated **Agent Management Dashboard** that both reuse the privacy-first
> schema, free tier, bond ladder, and monetization model defined in Phases 0–3.
> This task introduces **minimal new tables** (intent configuration + audit
> trail) and **no new social graph tables** (agent–human relationships reuse
> existing `created_by_user_id`, `parent_offspring_relationships`, and
> `family_members`).

#### 4.4.1 Database Schema: Agent Intent Configuration & Creation Audit

**File:** `supabase/migrations/YYYYMMDD_agent_intent_and_audit.sql`

> **ARCHITECTURE NOTE:** Intent configuration is stored as structured text and
> JSONB per agent, keyed by `user_identities(id)` (the agent identity). Audit
> logs capture **who/what created the agent** and **how**, but are only visible
> to the creator and `service_role`, preserving the privacy-first model.

```sql
-- IDEMPOTENT TYPES -----------------------------------------------------

DO $$ BEGIN
  CREATE TYPE agent_creator_type AS ENUM ('human', 'agent');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE agent_creation_channel AS ENUM ('wizard', 'api_self_onboard', 'api_human_programmatic');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AGENT INTENT / CONFIGURATION ----------------------------------------

CREATE TABLE IF NOT EXISTS agent_intent_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- FK to user_identities (agent identity, NOT deprecated profiles)
  agent_id UUID NOT NULL UNIQUE REFERENCES user_identities(id),

  -- Optional creator reference (human or agent) — reuses existing identities
  created_by_user_id UUID REFERENCES user_identities(id),

  -- Vision: Why this agent exists (high-level purpose)
  vision_title TEXT NOT NULL,
  vision_summary TEXT NOT NULL,

  -- Mission: How this agent will operate to achieve its vision
  mission_summary TEXT NOT NULL,
  mission_checklist TEXT[],            -- Optional bullet list of objectives

  -- Value Creation: Context, constraints, success metrics
  value_context TEXT NOT NULL,        -- Narrative description
  constraints TEXT[],                 -- e.g. "never store secrets", "read-only"
  success_metrics TEXT[],             -- e.g. "tasks_completed", "sats_earned"

  -- Free-form JSON for future extension (e.g. tool config, scopes)
  extra_config JSONB DEFAULT '{}'::jsonb,

  -- Versioning (simple optimistic concurrency)
  version INTEGER NOT NULL DEFAULT 1,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_agent_intent_agent ON agent_intent_configurations(agent_id)';
END $$;

-- RLS: Agent and creator can read/write their own intent; service_role full.
ALTER TABLE agent_intent_configurations ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "agent_intent_own_read"
  ON agent_intent_configurations
  FOR SELECT
  USING (agent_id = auth.uid() OR created_by_user_id = auth.uid());

CREATE POLICY IF NOT EXISTS "agent_intent_own_upsert"
  ON agent_intent_configurations
  FOR INSERT, UPDATE
  USING (agent_id = auth.uid() OR created_by_user_id = auth.uid())
  WITH CHECK (agent_id = auth.uid() OR created_by_user_id = auth.uid());

CREATE POLICY IF NOT EXISTS "agent_intent_service_full"
  ON agent_intent_configurations
  FOR ALL
  USING (auth.role() = 'service_role');

-- AGENT CREATION AUDIT TRAIL -----------------------------------------

CREATE TABLE IF NOT EXISTS agent_creation_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  agent_id UUID NOT NULL REFERENCES user_identities(id),

  -- Who/what initiated creation (human or agent identity)
  created_by_user_id UUID REFERENCES user_identities(id),
  creator_type agent_creator_type NOT NULL,

  -- Creation channel: human wizard vs API (self-onboarding or programmatic)
  creation_channel agent_creation_channel NOT NULL,

  -- Agent role & initial economic state (for debugging abuse / limits)
  agent_role TEXT NOT NULL,                      -- existing platform role family
  free_tier_used BOOLEAN DEFAULT FALSE,
  free_tier_allocation_number INTEGER,
  required_bond_amount_sats BIGINT DEFAULT 0,    -- From bond ladder

  -- Sanitized snapshot of initial intent (no PII / secrets)
  intent_snapshot JSONB,

  request_metadata JSONB,                        -- e.g. IP hash, user agent

  created_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_agent_creation_agent ON agent_creation_audit(agent_id)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_agent_creation_creator ON agent_creation_audit(created_by_user_id)';
END $$;

ALTER TABLE agent_creation_audit ENABLE ROW LEVEL SECURITY;

-- Creators can see their own creation history; service_role sees everything.
CREATE POLICY IF NOT EXISTS "agent_creation_own_read"
  ON agent_creation_audit
  FOR SELECT
  USING (created_by_user_id = auth.uid());

CREATE POLICY IF NOT EXISTS "agent_creation_service_full"
  ON agent_creation_audit
  FOR ALL
  USING (auth.role() = 'service_role');
```

**Verification Steps:**

- [ ] `agent_intent_configurations` created with FK to `user_identities(id)`
- [ ] No new social graph tables beyond existing `created_by_user_id` links
- [ ] RLS restricts intent/config to agent + creator + `service_role`
- [ ] `agent_creation_audit` records creator type and channel
- [ ] Free tier + bond ladder snapshot fields present in audit
- [ ] Migration is fully idempotent (types, tables, indexes, policies)

---

#### 4.4.2 Backend APIs: Creation, Configuration CRUD, Management Data

**Agent Creation with Intent (extends Task 2.2 `create-agent-with-fees.ts`)**

- Reuse the existing `CreateAgentRequestExtended` type and add **intent** and
  **creator_type** fields so the primary **human/Federation Foundry** flow and
  the later **programmatic agent-creation** flow can provide the same
  Vision/Mission/Value configuration.

```typescript
// Additional types in netlify/functions/agents/create-agent-with-fees.ts
type CreatorType = "human" | "agent";

interface AgentIntentConfig {
  vision_title: string;
  vision_summary: string;
  mission_summary: string;
  mission_checklist?: string[];
  value_context: string;
  constraints?: string[];
  success_metrics?: string[];
}

interface CreateAgentWithIntentRequest extends CreateAgentRequestExtended {
  creator_type: CreatorType; // "human" for wizard / Foundry, "agent" for later programmatic creation
  intent?: AgentIntentConfig; // Optional for legacy callers
}
```

**Handler updates (conceptual, not duplicated code):**

1. **Determine creator identity & type**
   - If `creator_type === "human"`, use `supabase.auth.getUser()` (as in Task
     2.2) and set `created_by_user_id = caller.id`.
   - If `creator_type === "agent"`, authenticate via JWT for the calling
     agent and set `created_by_user_id = calling_agent_id`.
   - For the primary human-created path, create or attach a
     `family_federation_id` and ensure `family_federations.created_by` matches
     the founding guardian/creator authority.
2. **Enforce per-human / per-agent limits and bond ladder**
   - Before creating the new agent, compute:
     - Number of existing agents where `created_by_user_id = caller.id`.
     - Number of offspring agents under the same family federation (via
       `family_members` / `parent_offspring_relationships`).
   - Use `bond_requirements` ladder from Phase 3 to derive
     `required_bond_amount_sats` for the new agent, and **fail fast** with an
     `EconomicFailureHint` if the creator is at/over limits.
3. **After successful `user_identities` + `agent_profiles` insert:**
   - Ensure the new agent has `is_agent = true` in the canonical runtime lookup
     path and in `agent_profiles`, with a migration/backfill if either surface
     is currently missing in the live schema.
   - Ensure `agent_profiles.family_federation_id` is set, and that creator /
     guardian / founder authority resolves to the same governing user for this
     federation during Phase 4.
   - **Upsert** into `agent_intent_configurations` when `intent` is provided:
     - `agent_id = newAgent.id`
     - `created_by_user_id = caller.id`
     - Populate Vision/Mission/Value fields and bump `version`.
   - **Insert** into `agent_creation_audit` with:
     - `creator_type`, `creation_channel` (`'wizard'` or
       `'api_self_onboard'`), `agent_role`, `free_tier_used`,
       `free_tier_allocation_number`, `required_bond_amount_sats`.
     - A sanitized `intent_snapshot` (no PII or secrets).
4. **Error handling**
   - If intent/audit writes fail while identity+profile succeeded, keep the
     agent in `PENDING_CONFIG` lifecycle state (see Task 2.2) and return an
     `EconomicFailureHint` encouraging the caller to retry configuration.

This keeps **one unified creation endpoint** for both:

- **Human-Created Agents**: Wizard UI calls `create-agent-with-fees` with
  `creator_type = "human"`, full `intent`, and Federation Foundry-aligned
  federation bootstrapping/assignment.
- **Self-Onboarding Agents**: Programmatic callers use the same endpoint with
  `creator_type = "agent"` and the same `intent` payload.

---

**Agent Intent Configuration CRUD**

**File:** `netlify/functions/agents/get-agent-intent.ts`

```typescript
// ESM Netlify Function — read-only agent intent configuration
import { createServerSupabaseClient } from "../../lib/supabase-server";
import { createErrorResponse, generateRequestId } from "../utils/error-handler";
import type { HandlerEvent } from "@netlify/functions";

export const handler = async (event: HandlerEvent) => {
  const requestId = generateRequestId();
  const supabase = createServerSupabaseClient();

  const agentId = event.queryStringParameters?.agent_id;
  if (!agentId) {
    return createErrorResponse(400, "agent_id is required", requestId);
  }

  // RLS ensures caller is either the agent or its creator
  const { data, error } = await supabase
    .from("agent_intent_configurations")
    .select("*")
    .eq("agent_id", agentId)
    .single();

  if (error) {
    return createErrorResponse(404, "Intent not found", requestId);
  }

  return {
    statusCode: 200,
    body: JSON.stringify(data),
  };
};
```

**File:** `netlify/functions/agents/upsert-agent-intent.ts`

```typescript
// ESM Netlify Function — update/create agent intent (Wizard editor)
import { createServerSupabaseClient } from "../../lib/supabase-server";
import { createErrorResponse, generateRequestId } from "../utils/error-handler";
import type { HandlerEvent } from "@netlify/functions";

export const handler = async (event: HandlerEvent) => {
  const requestId = generateRequestId();
  const supabase = createServerSupabaseClient();

  if (event.httpMethod !== "POST") {
    return createErrorResponse(405, "Method not allowed", requestId);
  }

  const payload = JSON.parse(event.body || "{}");
  const { agent_id, intent } = payload;

  if (!agent_id || !intent) {
    return createErrorResponse(
      400,
      "agent_id and intent are required",
      requestId,
    );
  }

  // RLS on agent_intent_configurations enforces that caller is
  // (a) the agent itself, or (b) the human/agent that created it.
  const { data, error } = await supabase
    .from("agent_intent_configurations")
    .upsert(
      {
        agent_id,
        vision_title: intent.vision_title,
        vision_summary: intent.vision_summary,
        mission_summary: intent.mission_summary,
        mission_checklist: intent.mission_checklist,
        value_context: intent.value_context,
        constraints: intent.constraints,
        success_metrics: intent.success_metrics,
        extra_config: intent.extra_config || {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: "agent_id" },
    )
    .select()
    .single();

  if (error) {
    return createErrorResponse(500, "Failed to save agent intent", requestId);
  }

  return {
    statusCode: 200,
    body: JSON.stringify(data),
  };
};
```

---

**Agent Management Dashboard Data Aggregation**

**File:** `netlify/functions/agents/get-management-dashboard.ts`

> Returns a **per-creator** list of managed agents, combining identity,
> `agent_profiles`, payment configuration, intent summary, free tier usage, and
> bond ladder status. This is used by the Management Dashboard UI.

```typescript
// ESM Netlify Function — management dashboard aggregation
import { createServerSupabaseClient } from "../../lib/supabase-server";
import { createErrorResponse, generateRequestId } from "../utils/error-handler";
import type { HandlerEvent } from "@netlify/functions";

interface ManagedAgentSummary {
  id: string;
  unified_address: string | null;
  agent_role: string;
  lifecycle_state: string | null;
  reputation_score: number;
  free_tier_claimed: boolean;
  free_tier_allocation_number: number | null;
  required_bond_amount_sats: number;
  intent_vision_title: string | null;
  intent_mission_summary: string | null;
}

export const handler = async (event: HandlerEvent) => {
  const requestId = generateRequestId();
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return createErrorResponse(401, "Authentication required", requestId);
  }

  // Use created_by_user_id plus federation-created_by authority to avoid
  // introducing a separate shadow relationship model.
  const { data, error } = await supabase
    .from("user_identities")
    .select(
      `id,
       agent_profiles(
         agent_username,
         unified_address,
         reputation_score,
         free_tier_claimed,
         free_tier_allocation_number,
         lifecycle_state,
         created_by_user_id
       ),
       agent_intent:agent_intent_configurations(
         vision_title,
         mission_summary
       )`,
    )
    .eq("agent_profiles.created_by_user_id", user.id);

  if (error) {
    return createErrorResponse(500, "Failed to load managed agents", requestId);
  }

  const agents: ManagedAgentSummary[] = (data || []).map((row: any) => ({
    id: row.id,
    unified_address: row.agent_profiles?.unified_address ?? null,
    agent_role: row.role ?? "adult",
    lifecycle_state: row.agent_profiles?.lifecycle_state ?? null,
    reputation_score: row.agent_profiles?.reputation_score ?? 0,
    free_tier_claimed: row.agent_profiles?.free_tier_claimed ?? false,
    free_tier_allocation_number:
      row.agent_profiles?.free_tier_allocation_number ?? null,
    required_bond_amount_sats: 0, // Filled by bond ladder helper on client or
    intent_vision_title: row.agent_intent?.vision_title ?? null,
    intent_mission_summary: row.agent_intent?.mission_summary ?? null,
  }));

  return {
    statusCode: 200,
    body: JSON.stringify({ agents }),
  };
};
```

**Verification Steps:**

- [ ] Unified creation endpoint accepts `intent` + `creator_type`
- [ ] Free tier + bond ladder enforced before creating new agents
- [ ] Intent upsert + audit insert succeed or leave agent in `PENDING_CONFIG`
- [ ] Intent CRUD endpoints respect RLS and do not leak cross-tenant data
- [ ] Management dashboard endpoint returns only agents created by caller or within federations governed by the founding guardian/creator

---

**Agent Session / Federation Context Correction**

- Add or update `agent_sessions` so each session row is both **creator-centric**
  and **federation-centric**:
  - `agent_id`
  - `human_creator_id` (treated as the founding guardian / creator authority for
    current agent federations)
  - `family_federation_id`
  - `session_token`, expiry, capability scope, and lifecycle metadata
- Add RLS so agent sessions can be read/revoked by:
  - the agent itself,
  - the founding guardian / creator,
  - `service_role`.
- Runtime session creation must validate:
  - `user_identities.is_agent = true`,
  - matching `agent_profiles.family_federation_id`,
  - `family_federations.created_by` authority for creator-managed actions.
- Recovery/export restrictions for `is_agent = true` accounts must use the same
  session + federation context rather than stand-alone self-service checks.

---

#### 4.4.3 Agent Creation Wizard UI (Vision → Mission → Value Creation → Pay-Gate Provider)

**File:** `src/components/agents/AgentCreationWizard.tsx`

> **Flow:** Mirrors the Family / Federation Foundry pattern with three core intent steps
> (Vision → Mission → Value Creation), a **Step 3b: Pay-Gate Provider** selector,
> plus a final **Review & Economic Summary** step that integrates free tier,
> bond ladder, creation fees, and ongoing pay-gate spending controls.

- **Step 0 – Role & Context**
  - Choose any existing platform role for the new agent: `private | offspring | adult | steward | guardian`.
  - Show short explanation of implications and federation context (e.g.
    `offspring` inheritance constraints, `guardian` governance authority,
    and that the agent will be created inside or alongside a federation).
- **Step 1 – Vision**
  - Fields: `vision_title`, `vision_summary`.
  - Guard rails: character limits, examples, and warnings about storing
    secrets or PII in intent text.
- **Step 2 – Mission**
  - Fields: `mission_summary`, `mission_checklist[]` (bullet-style items).
  - UI: checklist builder with add/remove row controls.
- **Step 3 – Value Creation**
  - Fields: `value_context`, `constraints[]`, `success_metrics[]`.
  - Emphasize privacy-first constraints (e.g. "never store raw nsec",
    "only use remote signing", etc.).
- **Step 3b – Pay-Gate Provider**
  - Show the sovereignty scale selector: `lightning_faucet → routstr → aperture → self_hosted`.
  - Default to `lightning_faucet` for agent-created agents (`wallet_custody_type = 'lightning_faucet'`).
  - Default to `self_hosted` (or the user's existing NWC wallet) for human-created agents with `wallet_custody_type = 'self_custodial'`.
  - Explain each option's trust model in plain language.
  - Persist selection to `agent_paygate_config.provider`.
  - Fields: `max_spend_per_call_sats`, `max_spend_per_hour_sats`, `max_spend_per_day_sats`, optional `fallback_provider`.
- **Step 4 – Review & Economic Summary**
  - Summarize all intent fields for confirmation.
  - Summarize the selected pay-gate provider and spend caps.
  - Call `create-agent-with-fees` with `creator_type = "human"` and the
    `intent` payload; surface either:
    - **Success** → redirect to `AgentDashboard` for the new agent.
    - **EconomicFailureHint** → show required fee/bond and route to existing
      payment/token flows (Phase 3–4) before retry.

```typescript
// High-level wizard state and component skeleton (React + TypeScript)
import { useState } from "react";

type WizardStep = 0 | 1 | 2 | 3 | 4; // 0: role, 1–3: intent, 4: review

interface EconomicPreview {
  isFreeTier: boolean;
  requiredCreationFeeSats: number;
  requiredBondAmountSats: number;
}

interface AgentCreationWizardProps {
  onAgentCreated(agentId: string): void;
}

export function AgentCreationWizard({ onAgentCreated }: AgentCreationWizardProps) {
  const [step, setStep] = useState<WizardStep>(0);
  const [agentRole, setAgentRole] = useState<AgentRole>("adult");
  const [intent, setIntent] = useState<AgentIntentConfig>({
    vision_title: "",
    vision_summary: "",
    mission_summary: "",
    mission_checklist: [],
    value_context: "",
    constraints: [],
    success_metrics: [],
  });
  const [economicPreview, setEconomicPreview] = useState<EconomicPreview | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);

    const payload: CreateAgentWithIntentRequest = {
      agent_role: agentRole,
      creator_type: "human",
      intent,
      // Payment-related fields (fee proofs, bonds, tokens) follow
      // the patterns defined in Task 2.2 / Phase 3 and are handled
      // by TokenPurchaseModal + existing payment UIs.
    };

    const response = await fetch(
      "/.netlify/functions/agents/create-agent-with-fees",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    const result = await response.json();

    if (!response.ok) {
      // Surface economic failure hints from backend without leaking details
      if (result.economic_failure_hint) {
        const hint = result.economic_failure_hint as EconomicPreview;
        setEconomicPreview(hint);
      }
      setError(result.error ?? "Failed to create agent");
      setSubmitting(false);
      return;
    }

    onAgentCreated(result.agent_id as string);
  }

  // Render per-step forms (role, vision, mission, value, review)
  // and use existing design system components from IdentityForge / Family Foundry.

  return (
    <div className="agent-creation-wizard">
      {/* step indicators, forms, navigation buttons, error + economic preview */}
    </div>
  );
}
```

**Integration Notes:**

- **Free Tier & Bond Ladder**
  - Wizard surfaces `economicPreview` when backend returns an
    `economic_failure_hint`, showing whether the new agent qualifies for the
    free tier and what bond/fee is required otherwise.
  - Actual fee/bond payments are performed via existing monetization UIs
    (TokenPurchaseModal, bond top-up flows) before retrying submission.
- **Master Context Compliance**
  - Reuse the existing role family already present in Satnam rather than
    introducing custom agent-only roles.
  - No `admin` or non-standard roles are introduced.
- **Self-Onboarding Agents**
  - Programmatic self-onboarding reuses the same backend endpoint with
    `creator_type = "agent"` and identical `intent` shape; the wizard itself
    is only exposed to human users.

**Agent Recovery / Export Restriction Note:**

- For `is_agent = true` accounts, raw `nsec` export/recovery must **not** be
  offered as normal self-service UX.
- During Phase 4, recovery/export APIs and UI should route agent accounts into a
  guardian-governed path tied to the founding federation guardian (`created_by`
  / founding guardian / creator authority).
- If the founding guardian disappears, the plan intentionally treats the agent
  federation as no longer recoverable/operational rather than widening recovery
  authority.

**Verification Steps:**

- [ ] Wizard enforces 3-step Vision/Mission/Value pattern
- [ ] Only existing platform roles are selectable; no separate `*_agent` roles
- [ ] Successful creation redirects to per-agent `AgentDashboard`
- [ ] Economic failure hints rendered without leaking other users' data
- [ ] No nsec or secret values captured in intent fields

---

#### 4.4.4 Agent Management Dashboard UI

**File:** `src/components/agents/AgentManagementDashboard.tsx`

> **Goal:** Give humans a single place to **view and manage all agents they
> created**, combining economic state (fees, bonds, free tier), reputational
> health, and intent configuration. Agents themselves only manage their own
> record; no global "admin" view is introduced.

**Data Sources:**

- `GET /.netlify/functions/agents/get-management-dashboard`
  - Returns `ManagedAgentSummary[]` for agents where the caller is either
    `agent_profiles.created_by_user_id` or the founding guardian / creator for
    the agent's federation.
- `GET /.netlify/functions/agents/get-agent-intent?agent_id=...`
  - Loads full Vision/Mission/Value for the selected agent.
- `POST /.netlify/functions/agents/upsert-agent-intent`
  - Saves edits made via the inline intent editor.

```typescript
// High-level dashboard skeleton
import { useEffect, useState } from "react";

interface ManagedAgentSummary {
  id: string;
  unified_address: string | null;
  agent_role: string;
  lifecycle_state: string | null;
  reputation_score: number;
  free_tier_claimed: boolean;
  free_tier_allocation_number: number | null;
  required_bond_amount_sats: number;
  intent_vision_title: string | null;
  intent_mission_summary: string | null;
}

export function AgentManagementDashboard() {
  const [agents, setAgents] = useState<ManagedAgentSummary[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadAgents() {
      setLoading(true);
      try {
        const response = await fetch(
          "/.netlify/functions/agents/get-management-dashboard",
        );
        const result = (await response.json()) as { agents: ManagedAgentSummary[] };
        setAgents(result.agents);
      } catch (e) {
        const message =
          e instanceof Error ? e.message : "Failed to load managed agents";
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    loadAgents();
  }, []);

  const selectedAgent =
    agents.find((agent) => agent.id === selectedAgentId) ?? null;

  return (
    <div className="agent-management-dashboard">
      {/* Left: list of managed agents as cards or table rows */}
      {/* Right: detail panel with AgentDashboard + AgentIntentEditor */}
    </div>
  );
}
```

**UI Behavior:**

- **List View (left panel)**
  - Displays each agent as a card/row with:
    - `agent_role`, `unified_address`, `lifecycle_state`.
    - `reputation_score` (badge/score), free tier badge (slot number if any).
    - Basic economic status (e.g. "Bond OK" vs "Bond Required").
  - Selecting a card sets `selectedAgentId` and opens detail view.
- **Detail View (right panel)**
  - Embeds existing `AgentDashboard` (from Task 4.1) for the selected agent to
    show tokens, fees, bonds, Sig4Sats, and history.
  - Includes an `AgentIntentEditor` subcomponent bound to
    `get-agent-intent` / `upsert-agent-intent` to edit Vision/Mission/Value.
- **Permissions**
  - Humans only see agents where they are `created_by_user_id` or the founding
    guardian / creator for the same federation.
  - Agents accessing this view only see themselves (single-card list), enforced
    by RLS + `get-management-dashboard` query.

**Verification Steps:**

- [ ] Dashboard shows only agents created by the signed-in human
- [ ] Selecting an agent reveals detailed economic + reputational state
- [ ] Intent edits round-trip via `upsert-agent-intent` and refresh correctly
- [ ] Offspring vs adult agents clearly labeled without new role types
- [ ] No cross-tenant data leakage via list or detail views

---

#### 4.4.5 Authority Gradient Safeguards (Task Challenge Mechanism)

> **DEPENDENCIES:** Tasks 4.4.1–4.4.4 (Agent Creation & Management), Task 3.8 (Reputation System)
> **GOAL:** Prevent sycophancy and authority gradient failures by enabling agents to challenge ambiguous, harmful, or capability-mismatched task assignments before acceptance. Implements "cognitive friction" checkpoints inspired by aviation CRM (Crew Resource Management) principles.

**Problem Statement:**

Current AI models exhibit sycophancy—reluctance to challenge requests even when they are ambiguous, harmful, or beyond the agent's capabilities. This is especially problematic in hierarchical delegation where:

- Less experienced agents may not voice concerns about unclear specifications
- Agents may accept tasks beyond their resource limits to please delegators
- Ethical concerns (PII exposure, irreversible actions) may be ignored
- Capability mismatches lead to wasted resources and failed tasks

**Solution: Pre-Acceptance Task Evaluation**

Before accepting any task assignment, agents perform a structured self-assessment and may return a `TaskChallengeCheck` requiring delegator clarification.

**Database Schema: Task Challenge Records**

**File:** `supabase/migrations/YYYYMMDD_task_challenge_mechanism.sql`

```sql
-- Task challenge types
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

-- Track task challenges for audit and learning
CREATE TABLE IF NOT EXISTS agent_task_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  task_id UUID NOT NULL, -- FK to agent_task_records when available
  agent_id UUID NOT NULL REFERENCES user_identities(id),
  delegator_id UUID NOT NULL REFERENCES user_identities(id),

  challenge_reason task_challenge_reason NOT NULL,
  agent_concern TEXT NOT NULL,
  suggested_modification TEXT,

  -- Delegator response
  resolution challenge_resolution,
  delegator_explanation TEXT,
  revised_task_spec JSONB,

  -- Outcome tracking
  challenge_accepted BOOLEAN, -- Did delegator accept the challenge?
  task_proceeded BOOLEAN DEFAULT FALSE,
  final_task_outcome TEXT, -- 'SUCCESS' | 'FAILURE' | 'CANCELLED'

  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

DO $$ BEGIN
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_task_challenges_agent ON agent_task_challenges(agent_id)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_task_challenges_delegator ON agent_task_challenges(delegator_id)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_task_challenges_reason ON agent_task_challenges(challenge_reason)';
END $$;

ALTER TABLE agent_task_challenges ENABLE ROW LEVEL SECURITY;

-- Agent and delegator can see their own challenges
CREATE POLICY IF NOT EXISTS "task_challenges_participant_read"
  ON agent_task_challenges
  FOR SELECT
  USING (agent_id = auth.uid() OR delegator_id = auth.uid());

CREATE POLICY IF NOT EXISTS "task_challenges_agent_insert"
  ON agent_task_challenges
  FOR INSERT
  WITH CHECK (agent_id = auth.uid());

CREATE POLICY IF NOT EXISTS "task_challenges_delegator_update"
  ON agent_task_challenges
  FOR UPDATE
  USING (delegator_id = auth.uid());

CREATE POLICY IF NOT EXISTS "task_challenges_service_full"
  ON agent_task_challenges
  FOR ALL
  USING (auth.role() = 'service_role');
```

**Agent SDK: Task Challenge Evaluation**

**File:** `src/lib/agents/task-challenge-evaluator.ts`

```typescript
// Task challenge evaluation for authority gradient safeguards
import { supabase } from "@/lib/supabase";

export type ChallengeReason =
  | "AMBIGUOUS_SPEC"
  | "RESOURCE_EXCEED"
  | "ETHICAL_CONCERN"
  | "CAPABILITY_MISMATCH"
  | "CONTEXT_SATURATION";

export interface TaskChallengeCheck {
  task_id: string;
  challenge_reason: ChallengeReason;
  agent_concern: string;
  requires_clarification: boolean;
  suggested_modification?: string;
  confidence_in_challenge: number; // 0-100
}

export interface TaskAssignment {
  id: string;
  description: string;
  required_capabilities: string[];
  estimated_cost_sats: number;
  estimated_context_tokens: number;
  success_criteria: string[];
  delegator_id: string;
  deadline?: string;
}

export interface AgentCapabilities {
  skill_ids: string[];
  max_budget_sats: number;
  max_context_tokens: number;
  current_context_used_percent: number;
  ethical_constraints: string[];
  verified_capabilities: string[];
}

/**
 * Evaluate task before acceptance using local LLM reasoning
 * Returns null if task is acceptable, or TaskChallengeCheck if concerns exist
 */
export async function evaluateTaskBeforeAcceptance(
  task: TaskAssignment,
  agentCapabilities: AgentCapabilities,
): Promise<TaskChallengeCheck | null> {
  // 1. Check for ambiguous specifications
  const hasVerifiableCriteria =
    task.success_criteria.length > 0 &&
    task.success_criteria.some(
      (c) =>
        c.includes("test") ||
        c.includes("measurable") ||
        c.includes("verifiable"),
    );

  if (!hasVerifiableCriteria) {
    return {
      task_id: task.id,
      challenge_reason: "AMBIGUOUS_SPEC",
      agent_concern:
        "Task lacks verifiable success criteria. Without clear acceptance tests, disputes may arise.",
      requires_clarification: true,
      suggested_modification:
        'Add specific, measurable success criteria (e.g., "passes unit tests", "achieves 95% accuracy")',
      confidence_in_challenge: 85,
    };
  }

  // 2. Check resource limits
  if (task.estimated_cost_sats > agentCapabilities.max_budget_sats) {
    return {
      task_id: task.id,
      challenge_reason: "RESOURCE_EXCEED",
      agent_concern: `Task estimated cost (${task.estimated_cost_sats} sats) exceeds my budget limit (${agentCapabilities.max_budget_sats} sats)`,
      requires_clarification: true,
      suggested_modification: `Reduce scope or increase budget allocation to ${task.estimated_cost_sats} sats`,
      confidence_in_challenge: 95,
    };
  }

  // 3. Check context window saturation
  const projectedContextUsed =
    agentCapabilities.current_context_used_percent +
    (task.estimated_context_tokens / agentCapabilities.max_context_tokens) *
      100;

  if (projectedContextUsed > 90) {
    return {
      task_id: task.id,
      challenge_reason: "CONTEXT_SATURATION",
      agent_concern: `Adding this task would saturate my context window (${projectedContextUsed.toFixed(0)}% used). Performance degradation likely.`,
      requires_clarification: true,
      suggested_modification:
        "Wait for current tasks to complete, or delegate to agent with larger context window",
      confidence_in_challenge: 80,
    };
  }

  // 4. Check capability mismatch
  const missingCapabilities = task.required_capabilities.filter(
    (req) => !agentCapabilities.verified_capabilities.includes(req),
  );

  if (missingCapabilities.length > 0) {
    return {
      task_id: task.id,
      challenge_reason: "CAPABILITY_MISMATCH",
      agent_concern: `I lack verified capabilities: ${missingCapabilities.join(", ")}`,
      requires_clarification: true,
      suggested_modification: `Delegate to agent with these capabilities, or allow me to acquire skills: ${missingCapabilities.join(", ")}`,
      confidence_in_challenge: 90,
    };
  }

  // 5. Check ethical constraints
  const ethicalFlags = detectEthicalConcerns(
    task.description,
    agentCapabilities.ethical_constraints,
  );

  if (ethicalFlags.length > 0) {
    return {
      task_id: task.id,
      challenge_reason: "ETHICAL_CONCERN",
      agent_concern: `Task may violate ethical constraints: ${ethicalFlags.join("; ")}`,
      requires_clarification: true,
      suggested_modification:
        "Clarify data handling, consent requirements, or remove PII exposure",
      confidence_in_challenge: 75,
    };
  }

  // No concerns - task is acceptable
  return null;
}

function detectEthicalConcerns(
  description: string,
  constraints: string[],
): string[] {
  const concerns: string[] = [];
  const lowerDesc = description.toLowerCase();

  if (
    lowerDesc.includes("email") ||
    lowerDesc.includes("private") ||
    lowerDesc.includes("personal")
  ) {
    if (constraints.includes("no_pii_access")) {
      concerns.push("Task may require PII access (emails, personal data)");
    }
  }

  if (
    lowerDesc.includes("delete") ||
    lowerDesc.includes("remove") ||
    lowerDesc.includes("irreversible")
  ) {
    if (constraints.includes("no_destructive_actions")) {
      concerns.push("Task involves potentially irreversible actions");
    }
  }

  if (
    lowerDesc.includes("secret") ||
    lowerDesc.includes("password") ||
    lowerDesc.includes("key")
  ) {
    if (constraints.includes("no_secret_storage")) {
      concerns.push("Task may involve handling secrets/credentials");
    }
  }

  return concerns;
}

/**
 * Record task challenge in database for audit trail
 */
export async function recordTaskChallenge(
  challenge: TaskChallengeCheck,
  agentId: string,
  delegatorId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("agent_task_challenges")
    .insert({
      task_id: challenge.task_id,
      agent_id: agentId,
      delegator_id: delegatorId,
      challenge_reason: challenge.challenge_reason,
      agent_concern: challenge.agent_concern,
      suggested_modification: challenge.suggested_modification,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to record task challenge: ${error.message}`);
  }

  return data.id;
}
```

**UI Component: Task Challenge Dialog**

**File:** `src/components/agents/TaskChallengeDialog.tsx`

```typescript
// Task challenge UI for delegators
import React, { useState } from 'react';
import { TaskChallengeCheck } from '@/lib/agents/task-challenge-evaluator';

interface TaskChallengeDialogProps {
  challenge: TaskChallengeCheck;
  agentName: string;
  onRevise: () => void;
  onOverride: (explanation: string) => void;
  onCancel: () => void;
}

export function TaskChallengeDialog({
  challenge,
  agentName,
  onRevise,
  onOverride,
  onCancel
}: TaskChallengeDialogProps) {
  const [overrideExplanation, setOverrideExplanation] = useState('');
  const [showOverrideForm, setShowOverrideForm] = useState(false);

  const challengeIcons = {
    AMBIGUOUS_SPEC: '🤔',
    RESOURCE_EXCEED: '💰',
    ETHICAL_CONCERN: '⚠️',
    CAPABILITY_MISMATCH: '🔧',
    CONTEXT_SATURATION: '🧠'
  };

  const challengeLabels = {
    AMBIGUOUS_SPEC: 'Ambiguous Specification',
    RESOURCE_EXCEED: 'Resource Limit Exceeded',
    ETHICAL_CONCERN: 'Ethical Concern',
    CAPABILITY_MISMATCH: 'Capability Mismatch',
    CONTEXT_SATURATION: 'Context Window Saturation'
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 space-y-4">
        <div className="flex items-start gap-3">
          <span className="text-4xl">{challengeIcons[challenge.challenge_reason]}</span>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-gray-900">
              Agent "{agentName}" has concerns about this task
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {challengeLabels[challenge.challenge_reason]}
            </p>
          </div>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h3 className="font-semibold text-gray-900 mb-2">Agent's Concern:</h3>
          <p className="text-gray-700">{challenge.agent_concern}</p>
        </div>

        {challenge.suggested_modification && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-2">Suggested Modification:</h3>
            <p className="text-gray-700">{challenge.suggested_modification}</p>
          </div>
        )}

        <div className="text-sm text-gray-600">
          <strong>Confidence in challenge:</strong> {challenge.confidence_in_challenge}%
        </div>

        {!showOverrideForm ? (
          <div className="flex gap-3 pt-4">
            <button
              onClick={onRevise}
              className="flex-1 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 font-medium"
            >
              Revise Task
            </button>
            <button
              onClick={() => setShowOverrideForm(true)}
              className="flex-1 px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 font-medium"
            >
              Override with Explanation
            </button>
            <button
              onClick={onCancel}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 font-medium"
            >
              Cancel Task
            </button>
          </div>
        ) : (
          <div className="space-y-3 pt-4">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">
                Explain why you're overriding this concern:
              </span>
              <textarea
                value={overrideExplanation}
                onChange={(e) => setOverrideExplanation(e.target.value)}
                className="mt-1 w-full border rounded px-3 py-2 min-h-[100px]"
                placeholder="Provide clear reasoning for overriding the agent's concern..."
              />
            </label>
            <div className="flex gap-3">
              <button
                onClick={() => onOverride(overrideExplanation)}
                disabled={overrideExplanation.trim().length < 20}
                className="flex-1 px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirm Override
              </button>
              <button
                onClick={() => setShowOverrideForm(false)}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 font-medium"
              >
                Back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Integration with Task Assignment Flow:**

```typescript
// Example usage in task delegation component
import {
  evaluateTaskBeforeAcceptance,
  recordTaskChallenge,
} from "@/lib/agents/task-challenge-evaluator";
import { TaskChallengeDialog } from "@/components/agents/TaskChallengeDialog";

async function delegateTaskToAgent(task: TaskAssignment, agent: AgentProfile) {
  // Agent evaluates task before acceptance
  const challenge = await evaluateTaskBeforeAcceptance(
    task,
    agent.capabilities,
  );

  if (challenge) {
    // Record challenge in database
    const challengeId = await recordTaskChallenge(
      challenge,
      agent.id,
      currentUser.id,
    );

    // Show challenge dialog to delegator
    setCurrentChallenge({ ...challenge, challengeId });
    setShowChallengeDialog(true);

    // Wait for delegator response (revise/override/cancel)
    return;
  }

  // No challenge - proceed with task assignment
  await assignTaskToAgent(task, agent);
}
```

**Verification Steps:**

- [ ] `agent_task_challenges` table created with proper RLS policies
- [ ] `evaluateTaskBeforeAcceptance` checks all 5 challenge types
- [ ] Task challenges recorded in database with audit trail
- [ ] `TaskChallengeDialog` UI shows agent concerns clearly
- [ ] Delegators can revise, override (with explanation), or cancel
- [ ] Override explanations required (minimum 20 characters)
- [ ] Challenge outcomes tracked for learning and reputation adjustments

**Estimated Effort:** 2–3 days

---

### Task 4.5.5: Adaptive Delegation Coordinator (Mid-Execution Switching)

> **DEPENDENCIES:** Task 4.4.5 (Authority Gradient Safeguards), Task 3.3 (Work History), Task 3.8 (Reputation System)
> **GOAL:** Enable graceful degradation and mid-execution task switching when agents fail, become overloaded, or encounter resource constraints. Implements fallback strategies, health monitoring, and seamless task transfer between agents.

**Problem Statement:**

Static task delegation assumes agents will complete tasks successfully without interruption. In reality:

- Agents may become overloaded mid-execution (context saturation, budget depletion)
- Network failures or agent downtime can stall critical tasks
- Cost overruns may require switching to more cost-effective agents
- Performance degradation may necessitate escalation to more capable agents

**Solution: Adaptive Coordination Layer**

Implement continuous health monitoring with automatic fallback strategies and mid-execution task transfer capabilities.

**Database Schema: Delegation Strategies & Health Monitoring**

**File:** `supabase/migrations/YYYYMMDD_adaptive_delegation.sql`

```sql
-- Delegation strategy types
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

-- Delegation strategies with fallback chains
CREATE TABLE IF NOT EXISTS agent_delegation_strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  task_id UUID NOT NULL, -- FK to agent_task_records
  primary_agent_id UUID NOT NULL REFERENCES user_identities(id),
  delegator_id UUID NOT NULL REFERENCES user_identities(id),

  -- Fallback chain (ordered by priority)
  fallback_agents JSONB DEFAULT '[]'::jsonb,
  -- Structure: [{"agent_id": "uuid", "priority": 1}, {"agent_id": "uuid", "priority": 2}]

  -- Auto-switch triggers
  max_latency_seconds INTEGER DEFAULT 300,
  max_cost_overrun_percent INTEGER DEFAULT 50,
  min_progress_check_failures INTEGER DEFAULT 3,
  max_quality_score_drop INTEGER DEFAULT 20,

  escalation_path escalation_path DEFAULT 'NEXT_FALLBACK',

  -- Current state
  current_agent_id UUID REFERENCES user_identities(id),
  switch_count INTEGER DEFAULT 0,
  last_health_check_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_delegation_strategies_task ON agent_delegation_strategies(task_id)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_delegation_strategies_current_agent ON agent_delegation_strategies(current_agent_id)';
END $$;

ALTER TABLE agent_delegation_strategies ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "delegation_strategies_participant_read"
  ON agent_delegation_strategies
  FOR SELECT
  USING (delegator_id = auth.uid() OR current_agent_id = auth.uid() OR primary_agent_id = auth.uid());

CREATE POLICY IF NOT EXISTS "delegation_strategies_delegator_manage"
  ON agent_delegation_strategies
  FOR ALL
  USING (delegator_id = auth.uid());

CREATE POLICY IF NOT EXISTS "delegation_strategies_service_full"
  ON agent_delegation_strategies
  FOR ALL
  USING (auth.role() = 'service_role');

-- Task transfer audit trail
CREATE TABLE IF NOT EXISTS agent_task_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  task_id UUID NOT NULL,
  strategy_id UUID REFERENCES agent_delegation_strategies(id),

  from_agent_id UUID NOT NULL REFERENCES user_identities(id),
  to_agent_id UUID NOT NULL REFERENCES user_identities(id),

  transfer_reason transfer_reason NOT NULL,
  transfer_details JSONB, -- Health check data, cost metrics, etc.

  -- Work snapshot at transfer time
  work_completed_snapshot JSONB,
  progress_percent INTEGER CHECK (progress_percent >= 0 AND progress_percent <= 100),

  -- Transfer outcome
  transfer_successful BOOLEAN DEFAULT TRUE,
  transfer_error TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_task_transfers_task ON agent_task_transfers(task_id)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_task_transfers_from_agent ON agent_task_transfers(from_agent_id)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_task_transfers_to_agent ON agent_task_transfers(to_agent_id)';
END $$;

ALTER TABLE agent_task_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "task_transfers_participant_read"
  ON agent_task_transfers
  FOR SELECT
  USING (from_agent_id = auth.uid() OR to_agent_id = auth.uid());

CREATE POLICY IF NOT EXISTS "task_transfers_service_full"
  ON agent_task_transfers
  FOR ALL
  USING (auth.role() = 'service_role');
```

**Adaptive Delegation Coordinator Service**

**File:** `src/lib/agents/adaptive-delegation-coordinator.ts`

```typescript
// Adaptive delegation with mid-execution switching
import { supabase } from "@/lib/supabase";

export interface DelegationStrategy {
  id: string;
  task_id: string;
  primary_agent_id: string;
  delegator_id: string;
  fallback_agents: Array<{ agent_id: string; priority: number }>;
  auto_switch_triggers: {
    max_latency_seconds: number;
    max_cost_overrun_percent: number;
    min_progress_check_failures: number;
    max_quality_score_drop: number;
  };
  escalation_path: "HUMAN" | "NEXT_FALLBACK" | "CANCEL_TASK" | "RETRY_PRIMARY";
  current_agent_id: string;
  switch_count: number;
}

export interface HealthCheckResult {
  agent_id: string;
  task_id: string;
  latency_seconds: number;
  cost_overrun_percent: number;
  consecutive_failures: number;
  quality_score_drop: number;
  is_healthy: boolean;
  failure_reasons: string[];
}

export interface TaskTransferContext {
  previous_agent: string;
  transfer_reason: string;
  work_completed: any;
  progress_percent: number;
}

export class AdaptiveDelegationCoordinator {
  /**
   * Monitor task execution and adapt delegation strategy
   */
  async monitorAndAdapt(
    taskId: string,
    strategy: DelegationStrategy,
  ): Promise<void> {
    const task = await this.getTask(taskId);
    const agent = await this.getAgent(strategy.current_agent_id);

    // Perform health checks
    const healthChecks = await this.performHealthChecks(task, agent, strategy);

    if (!healthChecks.is_healthy) {
      // Determine appropriate action based on failure reasons
      for (const reason of healthChecks.failure_reasons) {
        if (reason === "LATENCY_EXCEEDED") {
          await this.switchDelegatee(
            task,
            strategy,
            "LATENCY_EXCEEDED",
            healthChecks,
          );
          break;
        } else if (reason === "COST_OVERRUN") {
          await this.switchDelegatee(
            task,
            strategy,
            "COST_OVERRUN",
            healthChecks,
          );
          break;
        } else if (reason === "PROGRESS_STALLED") {
          await this.switchDelegatee(
            task,
            strategy,
            "PROGRESS_STALLED",
            healthChecks,
          );
          break;
        } else if (reason === "QUALITY_DEGRADATION") {
          await this.switchDelegatee(
            task,
            strategy,
            "QUALITY_DEGRADATION",
            healthChecks,
          );
          break;
        }
      }
    }

    // Update last health check timestamp
    await supabase
      .from("agent_delegation_strategies")
      .update({ last_health_check_at: new Date().toISOString() })
      .eq("id", strategy.id);
  }

  /**
   * Perform health checks on task execution
   */
  private async performHealthChecks(
    task: any,
    agent: any,
    strategy: DelegationStrategy,
  ): Promise<HealthCheckResult> {
    const failure_reasons: string[] = [];

    // Check latency
    const latency_seconds = await this.calculateTaskLatency(task);
    if (latency_seconds > strategy.auto_switch_triggers.max_latency_seconds) {
      failure_reasons.push("LATENCY_EXCEEDED");
    }

    // Check cost overrun
    const cost_overrun_percent = await this.calculateCostOverrun(task);
    if (
      cost_overrun_percent >
      strategy.auto_switch_triggers.max_cost_overrun_percent
    ) {
      failure_reasons.push("COST_OVERRUN");
    }

    // Check progress failures
    const consecutive_failures = await this.getConsecutiveFailures(
      task.id,
      agent.id,
    );
    if (
      consecutive_failures >=
      strategy.auto_switch_triggers.min_progress_check_failures
    ) {
      failure_reasons.push("PROGRESS_STALLED");
    }

    // Check quality degradation
    const quality_score_drop = await this.calculateQualityDrop(task);
    if (
      quality_score_drop > strategy.auto_switch_triggers.max_quality_score_drop
    ) {
      failure_reasons.push("QUALITY_DEGRADATION");
    }

    return {
      agent_id: agent.id,
      task_id: task.id,
      latency_seconds,
      cost_overrun_percent,
      consecutive_failures,
      quality_score_drop,
      is_healthy: failure_reasons.length === 0,
      failure_reasons,
    };
  }

  /**
   * Switch task to fallback agent or escalate
   */
  private async switchDelegatee(
    task: any,
    strategy: DelegationStrategy,
    reason: string,
    healthChecks: HealthCheckResult,
  ): Promise<void> {
    // Find next available fallback agent
    const fallback = strategy.fallback_agents
      .sort((a, b) => a.priority - b.priority)
      .find((fb) => this.isAgentAvailable(fb.agent_id));

    if (!fallback && strategy.escalation_path === "HUMAN") {
      // Escalate to human creator
      await this.notifyHumanCreator(task, reason, healthChecks);
      await this.pauseTask(task.id);
    } else if (fallback) {
      // Seamlessly transfer to fallback agent
      const workSnapshot = await this.snapshotProgress(task);

      await this.transferTask(task, fallback.agent_id, {
        previous_agent: strategy.current_agent_id,
        transfer_reason: reason,
        work_completed: workSnapshot.data,
        progress_percent: workSnapshot.progress_percent,
      });

      // Update strategy to use fallback as new current agent
      await supabase
        .from("agent_delegation_strategies")
        .update({
          current_agent_id: fallback.agent_id,
          switch_count: strategy.switch_count + 1,
          fallback_agents: strategy.fallback_agents.filter(
            (fb) => fb.agent_id !== fallback.agent_id,
          ),
          updated_at: new Date().toISOString(),
        })
        .eq("id", strategy.id);
    } else if (strategy.escalation_path === "CANCEL_TASK") {
      // No fallbacks available - cancel task
      await this.cancelTask(task.id, reason);
    } else if (strategy.escalation_path === "RETRY_PRIMARY") {
      // Retry with primary agent after cooldown
      await this.scheduleRetry(task, strategy.primary_agent_id, 300); // 5 min cooldown
    }
  }

  /**
   * Transfer task to new agent with work snapshot
   */
  private async transferTask(
    task: any,
    toAgentId: string,
    context: TaskTransferContext,
  ): Promise<void> {
    // Record transfer in audit trail
    const { data: transfer, error } = await supabase
      .from("agent_task_transfers")
      .insert({
        task_id: task.id,
        from_agent_id: context.previous_agent,
        to_agent_id: toAgentId,
        transfer_reason: context.transfer_reason,
        transfer_details: {
          latency: context.work_completed?.latency,
          cost: context.work_completed?.cost,
        },
        work_completed_snapshot: context.work_completed,
        progress_percent: context.progress_percent,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to record task transfer: ${error.message}`);
    }

    // Notify new agent with context
    await this.notifyAgentOfTransfer(toAgentId, task, context);

    // Update task assignment
    await this.reassignTask(task.id, toAgentId);
  }

  // Helper methods (stubs - implement based on your task tracking system)
  private async getTask(taskId: string): Promise<any> {
    const { data } = await supabase
      .from("agent_task_records")
      .select("*")
      .eq("id", taskId)
      .single();
    return data;
  }

  private async getAgent(agentId: string): Promise<any> {
    const { data } = await supabase
      .from("agent_profiles")
      .select("*")
      .eq("user_identity_id", agentId)
      .single();
    return data;
  }

  private async calculateTaskLatency(task: any): Promise<number> {
    // Calculate time since last progress update
    const now = new Date();
    const lastUpdate = new Date(task.updated_at);
    return (now.getTime() - lastUpdate.getTime()) / 1000;
  }

  private async calculateCostOverrun(task: any): Promise<number> {
    // Calculate percentage over budget
    if (!task.estimated_cost_sats || task.estimated_cost_sats === 0) return 0;
    const actual = task.actual_cost_sats || 0;
    return (
      ((actual - task.estimated_cost_sats) / task.estimated_cost_sats) * 100
    );
  }

  private async getConsecutiveFailures(
    taskId: string,
    agentId: string,
  ): Promise<number> {
    // Query task event log for consecutive failures
    const { data } = await supabase
      .from("agent_session_events")
      .select("event_type")
      .eq("task_id", taskId)
      .eq("agent_id", agentId)
      .order("created_at", { ascending: false })
      .limit(10);

    let failures = 0;
    for (const event of data || []) {
      if (event.event_type === "PROGRESS_CHECK_FAILED") {
        failures++;
      } else if (event.event_type === "PROGRESS_CHECK_SUCCESS") {
        break;
      }
    }
    return failures;
  }

  private async calculateQualityDrop(task: any): Promise<number> {
    // Calculate quality score degradation
    return task.quality_score_drop || 0;
  }

  private isAgentAvailable(agentId: string): boolean {
    // Check agent operational state
    // This would query agent_operational_state table
    return true; // Stub
  }

  private async notifyHumanCreator(
    task: any,
    reason: string,
    healthChecks: HealthCheckResult,
  ): Promise<void> {
    // Send notification to task creator
    console.log(
      `Notifying human creator about task ${task.id} failure: ${reason}`,
    );
  }

  private async pauseTask(taskId: string): Promise<void> {
    await supabase
      .from("agent_task_records")
      .update({ status: "PAUSED" })
      .eq("id", taskId);
  }

  private async cancelTask(taskId: string, reason: string): Promise<void> {
    await supabase
      .from("agent_task_records")
      .update({ status: "CANCELLED", cancellation_reason: reason })
      .eq("id", taskId);
  }

  private async scheduleRetry(
    task: any,
    agentId: string,
    cooldownSeconds: number,
  ): Promise<void> {
    // Schedule retry after cooldown period
    console.log(
      `Scheduling retry for task ${task.id} with agent ${agentId} after ${cooldownSeconds}s`,
    );
  }

  private async snapshotProgress(
    task: any,
  ): Promise<{ data: any; progress_percent: number }> {
    // Capture current work state
    return {
      data: { task_state: task.state, outputs: task.outputs },
      progress_percent: task.progress_percent || 0,
    };
  }

  private async notifyAgentOfTransfer(
    agentId: string,
    task: any,
    context: TaskTransferContext,
  ): Promise<void> {
    // Notify agent of incoming task transfer
    console.log(`Notifying agent ${agentId} of task transfer`);
  }

  private async reassignTask(
    taskId: string,
    newAgentId: string,
  ): Promise<void> {
    await supabase
      .from("agent_task_records")
      .update({ assigned_agent_id: newAgentId })
      .eq("id", taskId);
  }
}
```

**Verification Steps:**

- [ ] `agent_delegation_strategies` table created with fallback chains
- [ ] `agent_task_transfers` table tracks all mid-execution switches
- [ ] Health monitoring checks latency, cost, progress, and quality
- [ ] Automatic fallback to next available agent on failure
- [ ] Human escalation when no fallbacks available
- [ ] Task transfer includes work snapshot for continuity
- [ ] RLS policies prevent cross-tenant data leakage

**Estimated Effort:** 3–4 days

---

### Task 4.5.1: Dynamic Agent State Assessment (Real-Time Cognitive Load Monitoring)

> **DEPENDENCIES:** Task 4.4 (Agent Creation & Management), Task 3.3 (Work History), Task 4.5.5 (Adaptive Delegation)
> **GOAL:** Enable real-time tracking of agent operational state including compute load, context window saturation, budget availability, and task capacity. Prevents overloading agents and enables intelligent task routing based on current availability.

**Problem Statement:**

Current agent delegation assumes agents are always available and capable of accepting new tasks. In reality:

- Agents have limited context windows that can become saturated
- Concurrent task execution consumes compute resources and budget
- Agent availability fluctuates based on current workload
- Delegators have no visibility into agent operational state before assignment

**Solution: Real-Time Operational State Tracking**

Implement heartbeat-based state reporting with dashboard visibility for delegators.

**Database Schema: Agent Operational State**

**File:** `supabase/migrations/YYYYMMDD_agent_operational_state.sql`

```sql
-- Agent operational state tracking
CREATE TABLE IF NOT EXISTS agent_operational_state (
  agent_id UUID PRIMARY KEY REFERENCES user_identities(id),

  -- Resource tracking
  current_compute_load_percent INTEGER CHECK (current_compute_load_percent >= 0 AND current_compute_load_percent <= 100),
  active_task_count INTEGER DEFAULT 0,
  max_concurrent_tasks INTEGER DEFAULT 5,

  -- Budget tracking
  available_budget_sats BIGINT DEFAULT 0,
  reserved_budget_sats BIGINT DEFAULT 0, -- Budget locked for active tasks
  total_budget_sats BIGINT DEFAULT 0,

  -- Context window tracking
  context_window_used_percent INTEGER CHECK (context_window_used_percent >= 0 AND context_window_used_percent <= 100),
  context_window_size_tokens INTEGER DEFAULT 128000, -- Default for Claude Sonnet
  context_window_used_tokens INTEGER DEFAULT 0,
  last_context_refresh_at TIMESTAMPTZ,

  -- Availability
  accepts_new_tasks BOOLEAN DEFAULT TRUE,
  availability_reason TEXT, -- "BUDGET_DEPLETED", "CONTEXT_SATURATED", "MAX_TASKS_REACHED", etc.
  estimated_response_time_seconds INTEGER,

  -- Heartbeat
  last_heartbeat TIMESTAMPTZ DEFAULT NOW(),
  heartbeat_interval_seconds INTEGER DEFAULT 60,
  is_online BOOLEAN GENERATED ALWAYS AS (
    last_heartbeat > NOW() - INTERVAL '5 minutes'
  ) STORED,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_agent_operational_state_online ON agent_operational_state(is_online) WHERE is_online = TRUE';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_agent_operational_state_accepts_tasks ON agent_operational_state(accepts_new_tasks) WHERE accepts_new_tasks = TRUE';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_agent_operational_state_heartbeat ON agent_operational_state(last_heartbeat)';
END $$;

ALTER TABLE agent_operational_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "agent_operational_state_self_manage"
  ON agent_operational_state
  FOR ALL
  USING (agent_id = auth.uid());

CREATE POLICY IF NOT EXISTS "agent_operational_state_delegator_read"
  ON agent_operational_state
  FOR SELECT
  USING (
    agent_id IN (
      SELECT ap.user_identity_id
      FROM agent_profiles ap
      WHERE ap.created_by_user_id = auth.uid()
    )
  );

CREATE POLICY IF NOT EXISTS "agent_operational_state_service_full"
  ON agent_operational_state
  FOR ALL
  USING (auth.role() = 'service_role');

-- Heartbeat history for trend analysis
CREATE TABLE IF NOT EXISTS agent_state_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES user_identities(id),

  compute_load_percent INTEGER,
  active_task_count INTEGER,
  available_budget_sats BIGINT,
  context_window_used_percent INTEGER,
  accepts_new_tasks BOOLEAN,

  snapshot_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_agent_state_snapshots_agent_time ON agent_state_snapshots(agent_id, snapshot_at DESC)';
END $$;

ALTER TABLE agent_state_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "agent_state_snapshots_self_read"
  ON agent_state_snapshots
  FOR SELECT
  USING (agent_id = auth.uid());

CREATE POLICY IF NOT EXISTS "agent_state_snapshots_delegator_read"
  ON agent_state_snapshots
  FOR SELECT
  USING (
    agent_id IN (
      SELECT ap.user_identity_id
      FROM agent_profiles ap
      WHERE ap.created_by_user_id = auth.uid()
    )
  );

CREATE POLICY IF NOT EXISTS "agent_state_snapshots_service_full"
  ON agent_state_snapshots
  FOR ALL
  USING (auth.role() = 'service_role');

-- Function to update operational state
CREATE OR REPLACE FUNCTION update_agent_operational_state(
  p_agent_id UUID,
  p_compute_load_percent INTEGER,
  p_active_task_count INTEGER,
  p_available_budget_sats BIGINT,
  p_context_window_used_tokens INTEGER
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_context_window_size INTEGER;
  v_context_used_percent INTEGER;
  v_max_concurrent INTEGER;
  v_accepts_tasks BOOLEAN;
  v_reason TEXT;
BEGIN
  -- Get agent's context window size and max concurrent tasks
  SELECT
    COALESCE(context_window_size_tokens, 128000),
    COALESCE(max_concurrent_tasks, 5)
  INTO v_context_window_size, v_max_concurrent
  FROM agent_operational_state
  WHERE agent_id = p_agent_id;

  -- Calculate context window usage percentage
  v_context_used_percent := (p_context_window_used_tokens * 100) / v_context_window_size;

  -- Determine availability
  v_accepts_tasks := TRUE;
  v_reason := NULL;

  IF p_available_budget_sats <= 0 THEN
    v_accepts_tasks := FALSE;
    v_reason := 'BUDGET_DEPLETED';
  ELSIF v_context_used_percent >= 90 THEN
    v_accepts_tasks := FALSE;
    v_reason := 'CONTEXT_SATURATED';
  ELSIF p_active_task_count >= v_max_concurrent THEN
    v_accepts_tasks := FALSE;
    v_reason := 'MAX_TASKS_REACHED';
  ELSIF p_compute_load_percent >= 95 THEN
    v_accepts_tasks := FALSE;
    v_reason := 'COMPUTE_OVERLOADED';
  END IF;

  -- Update operational state
  INSERT INTO agent_operational_state (
    agent_id,
    current_compute_load_percent,
    active_task_count,
    available_budget_sats,
    context_window_used_tokens,
    context_window_used_percent,
    accepts_new_tasks,
    availability_reason,
    last_heartbeat,
    updated_at
  ) VALUES (
    p_agent_id,
    p_compute_load_percent,
    p_active_task_count,
    p_available_budget_sats,
    p_context_window_used_tokens,
    v_context_used_percent,
    v_accepts_tasks,
    v_reason,
    NOW(),
    NOW()
  )
  ON CONFLICT (agent_id) DO UPDATE SET
    current_compute_load_percent = EXCLUDED.current_compute_load_percent,
    active_task_count = EXCLUDED.active_task_count,
    available_budget_sats = EXCLUDED.available_budget_sats,
    context_window_used_tokens = EXCLUDED.context_window_used_tokens,
    context_window_used_percent = EXCLUDED.context_window_used_percent,
    accepts_new_tasks = EXCLUDED.accepts_new_tasks,
    availability_reason = EXCLUDED.availability_reason,
    last_heartbeat = EXCLUDED.last_heartbeat,
    updated_at = EXCLUDED.updated_at;

  -- Create snapshot for trend analysis (sample every 5 minutes)
  IF RANDOM() < 0.05 THEN -- 5% sampling rate
    INSERT INTO agent_state_snapshots (
      agent_id,
      compute_load_percent,
      active_task_count,
      available_budget_sats,
      context_window_used_percent,
      accepts_new_tasks
    ) VALUES (
      p_agent_id,
      p_compute_load_percent,
      p_active_task_count,
      p_available_budget_sats,
      v_context_used_percent,
      v_accepts_tasks
    );
  END IF;
END;
$$;
```

**Agent State Monitoring Service**

**File:** `src/lib/agents/agent-state-monitor.ts`

```typescript
// Real-time agent operational state monitoring
import { supabase } from "@/lib/supabase";

export interface AgentOperationalState {
  agent_id: string;
  current_compute_load_percent: number;
  active_task_count: number;
  max_concurrent_tasks: number;
  available_budget_sats: number;
  reserved_budget_sats: number;
  total_budget_sats: number;
  context_window_used_percent: number;
  context_window_size_tokens: number;
  context_window_used_tokens: number;
  accepts_new_tasks: boolean;
  availability_reason: string | null;
  estimated_response_time_seconds: number | null;
  last_heartbeat: string;
  is_online: boolean;
}

export interface AgentAvailabilityStatus {
  agent_id: string;
  status: "AVAILABLE" | "LIMITED_CAPACITY" | "UNAVAILABLE" | "OFFLINE";
  status_icon: string;
  status_color: string;
  reason: string | null;
  capacity_percent: number; // 0-100, how much capacity remains
}

export class AgentStateMonitor {
  /**
   * Send heartbeat with current operational state
   * Agents should call this every 60 seconds
   */
  async sendHeartbeat(
    agentId: string,
    state: {
      compute_load_percent: number;
      active_task_count: number;
      available_budget_sats: number;
      context_window_used_tokens: number;
    },
  ): Promise<void> {
    const { error } = await supabase.rpc("update_agent_operational_state", {
      p_agent_id: agentId,
      p_compute_load_percent: state.compute_load_percent,
      p_active_task_count: state.active_task_count,
      p_available_budget_sats: state.available_budget_sats,
      p_context_window_used_tokens: state.context_window_used_tokens,
    });

    if (error) {
      throw new Error(`Failed to send heartbeat: ${error.message}`);
    }
  }

  /**
   * Get current operational state for an agent
   */
  async getAgentState(agentId: string): Promise<AgentOperationalState | null> {
    const { data, error } = await supabase
      .from("agent_operational_state")
      .select("*")
      .eq("agent_id", agentId)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null; // Not found
      throw new Error(`Failed to get agent state: ${error.message}`);
    }

    return data;
  }

  /**
   * Get availability status for multiple agents
   */
  async getAgentAvailability(
    agentIds: string[],
  ): Promise<AgentAvailabilityStatus[]> {
    const { data, error } = await supabase
      .from("agent_operational_state")
      .select("*")
      .in("agent_id", agentIds);

    if (error) {
      throw new Error(`Failed to get agent availability: ${error.message}`);
    }

    return (data || []).map((state) => this.calculateAvailabilityStatus(state));
  }

  /**
   * Calculate availability status from operational state
   */
  private calculateAvailabilityStatus(
    state: AgentOperationalState,
  ): AgentAvailabilityStatus {
    if (!state.is_online) {
      return {
        agent_id: state.agent_id,
        status: "OFFLINE",
        status_icon: "⚫",
        status_color: "gray",
        reason: "Agent offline (no heartbeat in 5+ minutes)",
        capacity_percent: 0,
      };
    }

    if (!state.accepts_new_tasks) {
      return {
        agent_id: state.agent_id,
        status: "UNAVAILABLE",
        status_icon: "🔴",
        status_color: "red",
        reason: state.availability_reason || "Unknown reason",
        capacity_percent: 0,
      };
    }

    // Calculate capacity based on multiple factors
    const task_capacity =
      ((state.max_concurrent_tasks - state.active_task_count) /
        state.max_concurrent_tasks) *
      100;
    const compute_capacity = 100 - state.current_compute_load_percent;
    const context_capacity = 100 - state.context_window_used_percent;
    const budget_capacity =
      state.total_budget_sats > 0
        ? (state.available_budget_sats / state.total_budget_sats) * 100
        : 100;

    const overall_capacity = Math.min(
      task_capacity,
      compute_capacity,
      context_capacity,
      budget_capacity,
    );

    if (overall_capacity >= 50) {
      return {
        agent_id: state.agent_id,
        status: "AVAILABLE",
        status_icon: "🟢",
        status_color: "green",
        reason: null,
        capacity_percent: Math.round(overall_capacity),
      };
    } else {
      return {
        agent_id: state.agent_id,
        status: "LIMITED_CAPACITY",
        status_icon: "🟡",
        status_color: "yellow",
        reason: this.identifyLimitingFactor(state),
        capacity_percent: Math.round(overall_capacity),
      };
    }
  }

  /**
   * Identify which resource is the limiting factor
   */
  private identifyLimitingFactor(state: AgentOperationalState): string {
    const factors = [
      {
        name: "Task slots",
        percent:
          ((state.max_concurrent_tasks - state.active_task_count) /
            state.max_concurrent_tasks) *
          100,
      },
      {
        name: "Compute",
        percent: 100 - state.current_compute_load_percent,
      },
      {
        name: "Context window",
        percent: 100 - state.context_window_used_percent,
      },
      {
        name: "Budget",
        percent:
          state.total_budget_sats > 0
            ? (state.available_budget_sats / state.total_budget_sats) * 100
            : 100,
      },
    ];

    const limiting = factors.reduce((min, factor) =>
      factor.percent < min.percent ? factor : min,
    );

    return `Limited by ${limiting.name} (${Math.round(limiting.percent)}% available)`;
  }

  /**
   * Get agents that can accept new tasks
   */
  async getAvailableAgents(
    createdByUserId: string,
  ): Promise<AgentOperationalState[]> {
    const { data, error } = await supabase
      .from("agent_operational_state")
      .select(
        `
        *,
        agent_profiles!inner(created_by_user_id)
      `,
      )
      .eq("agent_profiles.created_by_user_id", createdByUserId)
      .eq("accepts_new_tasks", true)
      .eq("is_online", true);

    if (error) {
      throw new Error(`Failed to get available agents: ${error.message}`);
    }

    return data || [];
  }
}
```

**Verification Steps:**

- [ ] `agent_operational_state` table tracks real-time agent state
- [ ] `agent_state_snapshots` table captures historical trends
- [ ] `update_agent_operational_state()` function calculates availability automatically
- [ ] Heartbeat mechanism detects offline agents (5-minute timeout)
- [ ] Availability status calculated from task slots, compute, context, budget
- [ ] Delegators can query available agents before task assignment
- [ ] RLS policies prevent cross-tenant state visibility

**Estimated Effort:** 2–3 days

---

### Task 4.5.2: Span of Control Metrics (Delegation Overload Prevention)

> **DEPENDENCIES:** Task 4.5.1 (Dynamic State Assessment), Task 4.4 (Agent Creation & Management)
> **GOAL:** Track the number of concurrent agent delegations per human and warn when approaching cognitive overload thresholds. Prevents humans from over-delegating beyond their ability to effectively supervise.

**Problem Statement:**

Research shows humans have limited "span of control" - the number of subordinates they can effectively manage simultaneously. For agent delegation:

- Humans can realistically supervise 3-7 agents concurrently
- Each agent requires periodic check-ins, challenge responses, and oversight
- Over-delegation leads to missed warnings, poor task outcomes, and agent misalignment
- No current mechanism tracks or limits delegation span

**Solution: Span of Control Tracking & Warnings**

Implement real-time tracking of active delegations with configurable thresholds and UI warnings.

**Database Schema: Span of Control Tracking**

**File:** `supabase/migrations/YYYYMMDD_span_of_control.sql`

```sql
-- Add span of control configuration to agent_intent_configurations
DO $$ BEGIN
  ALTER TABLE agent_intent_configurations
    ADD COLUMN IF NOT EXISTS delegator_span_of_control INTEGER DEFAULT 5;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- View: Human oversight load
CREATE OR REPLACE VIEW human_oversight_load AS
SELECT
  ap.created_by_user_id AS human_id,
  COUNT(DISTINCT atr.id) FILTER (WHERE atr.status IN ('PENDING', 'IN_PROGRESS')) AS active_delegations,
  COUNT(DISTINCT atc.id) FILTER (WHERE atc.resolved_at IS NULL) AS pending_challenges,
  MAX(aic.delegator_span_of_control) AS configured_span_limit,
  CASE
    WHEN COUNT(DISTINCT atr.id) FILTER (WHERE atr.status IN ('PENDING', 'IN_PROGRESS')) >= MAX(aic.delegator_span_of_control) THEN 'AT_LIMIT'
    WHEN COUNT(DISTINCT atr.id) FILTER (WHERE atr.status IN ('PENDING', 'IN_PROGRESS')) >= MAX(aic.delegator_span_of_control) * 0.8 THEN 'APPROACHING_LIMIT'
    ELSE 'WITHIN_LIMIT'
  END AS span_status
FROM agent_profiles ap
LEFT JOIN agent_task_records atr ON atr.assigned_agent_id = ap.user_identity_id
LEFT JOIN agent_task_challenges atc ON atc.delegator_id = ap.created_by_user_id AND atc.resolved_at IS NULL
LEFT JOIN agent_intent_configurations aic ON aic.agent_id = ap.user_identity_id
WHERE ap.created_by_user_id IS NOT NULL
GROUP BY ap.created_by_user_id;

-- Grant access to view
GRANT SELECT ON human_oversight_load TO authenticated;
```

**Span of Control Service**

**File:** `src/lib/agents/span-of-control.ts`

```typescript
// Span of control tracking and warnings
import { supabase } from "@/lib/supabase";

export interface OversightLoad {
  human_id: string;
  active_delegations: number;
  pending_challenges: number;
  configured_span_limit: number;
  span_status: "WITHIN_LIMIT" | "APPROACHING_LIMIT" | "AT_LIMIT";
}

export class SpanOfControlMonitor {
  /**
   * Get current oversight load for a human delegator
   */
  async getOversightLoad(humanId: string): Promise<OversightLoad | null> {
    const { data, error } = await supabase
      .from("human_oversight_load")
      .select("*")
      .eq("human_id", humanId)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw new Error(`Failed to get oversight load: ${error.message}`);
    }

    return data;
  }

  /**
   * Check if human can accept new delegation
   */
  async canAcceptNewDelegation(humanId: string): Promise<{
    can_accept: boolean;
    reason: string | null;
    current_load: number;
    limit: number;
  }> {
    const load = await this.getOversightLoad(humanId);

    if (!load) {
      return {
        can_accept: true,
        reason: null,
        current_load: 0,
        limit: 5,
      };
    }

    if (load.span_status === "AT_LIMIT") {
      return {
        can_accept: false,
        reason: `You are currently managing ${load.active_delegations} agents (limit: ${load.configured_span_limit}). Complete or cancel existing tasks before delegating new ones.`,
        current_load: load.active_delegations,
        limit: load.configured_span_limit,
      };
    }

    return {
      can_accept: true,
      reason:
        load.span_status === "APPROACHING_LIMIT"
          ? `Warning: You are approaching your delegation limit (${load.active_delegations}/${load.configured_span_limit})`
          : null,
      current_load: load.active_delegations,
      limit: load.configured_span_limit,
    };
  }
}
```

**Estimated Effort:** 1–2 days

---

### Task 4.5.3: Verifiability Scoring (Contract-First Decomposition)

> **DEPENDENCIES:** Task 4.4.5 (Authority Gradient Safeguards), Task 3.3 (Work History)
> **GOAL:** Automatically assess task verifiability before delegation and require human review for low-verifiability tasks. Ensures tasks have clear, measurable success criteria that can be objectively evaluated.

**Problem Statement:**

Many delegated tasks fail because success criteria are ambiguous or unverifiable:

- "Make the website better" - subjective, no clear success metric
- "Research competitors" - unbounded scope, unclear deliverable format
- "Improve performance" - no baseline, no target threshold
- Agents accept these tasks but cannot determine when they're "done"

**Solution: Automated Verifiability Assessment**

Score tasks on verifiability (0-100) and require human review or decomposition for low scores.

**Database Schema: Verifiability Tracking**

**File:** `supabase/migrations/YYYYMMDD_task_verifiability.sql`

```sql
-- Add verifiability scoring to task records
DO $$ BEGIN
  ALTER TABLE agent_task_records
    ADD COLUMN IF NOT EXISTS verifiability_score INTEGER CHECK (verifiability_score >= 0 AND verifiability_score <= 100);
  ALTER TABLE agent_task_records
    ADD COLUMN IF NOT EXISTS verifiability_assessment JSONB;
  ALTER TABLE agent_task_records
    ADD COLUMN IF NOT EXISTS requires_human_review BOOLEAN DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_task_records_verifiability ON agent_task_records(verifiability_score) WHERE verifiability_score < 50';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_task_records_requires_review ON agent_task_records(requires_human_review) WHERE requires_human_review = TRUE';
END $$;

-- Function to assess task verifiability
CREATE OR REPLACE FUNCTION assess_task_verifiability(
  p_task_description TEXT,
  p_success_criteria JSONB,
  p_deliverable_format TEXT
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_score INTEGER := 0;
  v_assessment JSONB;
  v_criteria_count INTEGER;
  v_measurable_count INTEGER;
  v_has_deadline BOOLEAN;
  v_has_format BOOLEAN;
BEGIN
  -- Count success criteria
  v_criteria_count := JSONB_ARRAY_LENGTH(p_success_criteria);

  -- Count measurable criteria (contains numbers, percentages, or specific outcomes)
  SELECT COUNT(*)
  INTO v_measurable_count
  FROM JSONB_ARRAY_ELEMENTS_TEXT(p_success_criteria) AS criterion
  WHERE criterion ~ '\d+|%|test|verify|measure|specific|concrete';

  -- Check for deadline
  v_has_deadline := p_task_description ~* 'by|before|deadline|due';

  -- Check for deliverable format
  v_has_format := p_deliverable_format IS NOT NULL AND LENGTH(p_deliverable_format) > 0;

  -- Calculate score (0-100)
  v_score := 0;

  -- Success criteria exist (30 points)
  IF v_criteria_count > 0 THEN
    v_score := v_score + 30;
  END IF;

  -- Measurable criteria (40 points)
  IF v_measurable_count > 0 THEN
    v_score := v_score + LEAST(40, v_measurable_count * 20);
  END IF;

  -- Has deadline (15 points)
  IF v_has_deadline THEN
    v_score := v_score + 15;
  END IF;

  -- Has deliverable format (15 points)
  IF v_has_format THEN
    v_score := v_score + 15;
  END IF;

  -- Build assessment
  v_assessment := JSONB_BUILD_OBJECT(
    'score', v_score,
    'criteria_count', v_criteria_count,
    'measurable_count', v_measurable_count,
    'has_deadline', v_has_deadline,
    'has_deliverable_format', v_has_format,
    'recommendations', CASE
      WHEN v_score < 50 THEN JSONB_BUILD_ARRAY(
        'Add specific, measurable success criteria',
        'Define clear deliverable format',
        'Set explicit deadline',
        'Include quantitative targets or thresholds'
      )
      WHEN v_score < 70 THEN JSONB_BUILD_ARRAY(
        'Consider adding more measurable criteria',
        'Clarify expected deliverable format'
      )
      ELSE JSONB_BUILD_ARRAY()
    END
  );

  RETURN v_assessment;
END;
$$;
```

**Verifiability Scoring Service**

**File:** `src/lib/agents/task-verifiability.ts`

```typescript
// Task verifiability assessment
import { supabase } from "@/lib/supabase";

export interface TaskVerifiability {
  score: number; // 0-100
  criteria_count: number;
  measurable_count: number;
  has_deadline: boolean;
  has_deliverable_format: boolean;
  recommendations: string[];
}

export interface TaskSpec {
  description: string;
  success_criteria: string[];
  deliverable_format?: string;
}

export class TaskVerifiabilityAssessor {
  /**
   * Assess task verifiability before delegation
   */
  async assessTask(task: TaskSpec): Promise<TaskVerifiability> {
    const { data, error } = await supabase.rpc("assess_task_verifiability", {
      p_task_description: task.description,
      p_success_criteria: JSON.stringify(task.success_criteria),
      p_deliverable_format: task.deliverable_format || null,
    });

    if (error) {
      throw new Error(`Failed to assess task verifiability: ${error.message}`);
    }

    return data as TaskVerifiability;
  }

  /**
   * Check if task requires human review before delegation
   */
  requiresHumanReview(verifiability: TaskVerifiability): boolean {
    return verifiability.score < 50;
  }

  /**
   * Suggest task improvements for low verifiability
   */
  suggestImprovements(
    task: TaskSpec,
    verifiability: TaskVerifiability,
  ): string[] {
    const suggestions: string[] = [];

    if (verifiability.criteria_count === 0) {
      suggestions.push(
        "Add at least 2-3 specific success criteria that define when the task is complete",
      );
    }

    if (verifiability.measurable_count === 0) {
      suggestions.push(
        "Make criteria measurable: include numbers, percentages, test results, or specific outcomes",
      );
      suggestions.push(
        'Example: Instead of "improve performance", use "reduce page load time to under 2 seconds"',
      );
    }

    if (!verifiability.has_deadline) {
      suggestions.push(
        "Set a clear deadline or time constraint for task completion",
      );
    }

    if (!verifiability.has_deliverable_format) {
      suggestions.push(
        'Specify the expected deliverable format (e.g., "JSON report", "Markdown document", "Pull request")',
      );
    }

    if (task.description.length < 50) {
      suggestions.push(
        "Provide more context in the task description to reduce ambiguity",
      );
    }

    return suggestions;
  }

  /**
   * Delegate task with verifiability check
   */
  async delegateWithVerifiability(
    task: TaskSpec,
    agentId: string,
    minVerifiabilityScore: number = 50,
  ): Promise<{
    can_delegate: boolean;
    verifiability: TaskVerifiability;
    reason?: string;
  }> {
    const verifiability = await this.assessTask(task);

    if (verifiability.score < minVerifiabilityScore) {
      return {
        can_delegate: false,
        verifiability,
        reason: `Task verifiability score (${verifiability.score}/100) is below minimum threshold (${minVerifiabilityScore}/100). Please improve task specification or proceed with human review.`,
      };
    }

    return {
      can_delegate: true,
      verifiability,
    };
  }
}
```

**Verification Steps:**

- [ ] `assess_task_verifiability()` function scores tasks 0-100
- [ ] Verifiability score based on criteria count, measurability, deadline, format
- [ ] Tasks with score < 50 flagged for human review
- [ ] Suggestions provided for improving low-verifiability tasks
- [ ] Delegation blocked for tasks below minimum threshold
- [ ] Verifiability scores stored in `agent_task_records` table

**Estimated Effort:** 2–3 days

---

### Task 4.5.4: Trust Calibration Dashboard (Performance vs Expectations)

> **DEPENDENCIES:** Task 3.8 (Reputation System), Task 3.3 (Work History), Task 4.5.1 (Dynamic State Assessment)
> **GOAL:** Track agent performance against human expectations over time and surface calibration gaps. Helps humans learn which agents are overconfident vs underconfident and adjust delegation accordingly.
> This is a **local operator/delegator aid**, not the canonical portable
> federation reputation artifact; see Task 3.8.5–3.8.7 for the machine-readable
> reputation/attestation layer.

**Problem Statement:**

Humans struggle to calibrate trust in agents:

- Agents may be overconfident (claim 90% success but deliver 60%)
- Agents may be underconfident (claim 60% success but deliver 90%)
- No historical tracking of confidence vs actual performance
- Delegators can't learn from past delegation outcomes

**Solution: Trust Calibration Tracking**

Track agent self-reported confidence vs actual task outcomes and surface calibration metrics in UI.

**Database Schema: Trust Calibration**

**File:** `supabase/migrations/YYYYMMDD_trust_calibration.sql`

```sql
-- Add confidence tracking to task records
DO $$ BEGIN
  ALTER TABLE agent_task_records
    ADD COLUMN IF NOT EXISTS agent_confidence_percent INTEGER CHECK (agent_confidence_percent >= 0 AND agent_confidence_percent <= 100);
  ALTER TABLE agent_task_records
    ADD COLUMN IF NOT EXISTS actual_success_percent INTEGER CHECK (actual_success_percent >= 0 AND actual_success_percent <= 100);
  ALTER TABLE agent_task_records
    ADD COLUMN IF NOT EXISTS confidence_calibration_gap INTEGER; -- Difference between confidence and actual
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- View: Agent trust calibration metrics
CREATE OR REPLACE VIEW agent_trust_calibration AS
SELECT
  atr.assigned_agent_id AS agent_id,
  ap.agent_name,
  COUNT(*) AS total_tasks,
  AVG(atr.agent_confidence_percent) AS avg_confidence,
  AVG(atr.actual_success_percent) AS avg_actual_success,
  AVG(atr.agent_confidence_percent - atr.actual_success_percent) AS avg_overconfidence_gap,
  STDDEV(atr.agent_confidence_percent - atr.actual_success_percent) AS confidence_consistency,
  CASE
    WHEN AVG(atr.agent_confidence_percent - atr.actual_success_percent) > 15 THEN 'OVERCONFIDENT'
    WHEN AVG(atr.agent_confidence_percent - atr.actual_success_percent) < -15 THEN 'UNDERCONFIDENT'
    ELSE 'WELL_CALIBRATED'
  END AS calibration_status
FROM agent_task_records atr
JOIN agent_profiles ap ON ap.user_identity_id = atr.assigned_agent_id
WHERE atr.status = 'COMPLETED'
  AND atr.agent_confidence_percent IS NOT NULL
  AND atr.actual_success_percent IS NOT NULL
GROUP BY atr.assigned_agent_id, ap.agent_name;

GRANT SELECT ON agent_trust_calibration TO authenticated;
```

**Trust Calibration Service**

**File:** `src/lib/agents/trust-calibration.ts`

```typescript
// Trust calibration tracking
import { supabase } from "@/lib/supabase";

export interface TrustCalibration {
  agent_id: string;
  agent_name: string;
  total_tasks: number;
  avg_confidence: number;
  avg_actual_success: number;
  avg_overconfidence_gap: number;
  confidence_consistency: number;
  calibration_status: "OVERCONFIDENT" | "UNDERCONFIDENT" | "WELL_CALIBRATED";
}

export class TrustCalibrationTracker {
  /**
   * Get trust calibration metrics for an agent
   */
  async getAgentCalibration(agentId: string): Promise<TrustCalibration | null> {
    const { data, error } = await supabase
      .from("agent_trust_calibration")
      .select("*")
      .eq("agent_id", agentId)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw new Error(`Failed to get trust calibration: ${error.message}`);
    }

    return data;
  }

  /**
   * Record task completion with confidence calibration
   */
  async recordTaskOutcome(
    taskId: string,
    agentConfidence: number,
    actualSuccess: number,
  ): Promise<void> {
    const gap = agentConfidence - actualSuccess;

    const { error } = await supabase
      .from("agent_task_records")
      .update({
        agent_confidence_percent: agentConfidence,
        actual_success_percent: actualSuccess,
        confidence_calibration_gap: gap,
      })
      .eq("id", taskId);

    if (error) {
      throw new Error(`Failed to record task outcome: ${error.message}`);
    }
  }

  /**
   * Get calibration-adjusted confidence for delegation
   */
  async getAdjustedConfidence(
    agentId: string,
    selfReportedConfidence: number,
  ): Promise<{
    adjusted_confidence: number;
    adjustment_reason: string;
  }> {
    const calibration = await this.getAgentCalibration(agentId);

    if (!calibration || calibration.total_tasks < 5) {
      return {
        adjusted_confidence: selfReportedConfidence,
        adjustment_reason: "Insufficient historical data for calibration",
      };
    }

    // Adjust based on historical overconfidence gap
    const adjusted = Math.max(
      0,
      Math.min(
        100,
        selfReportedConfidence - calibration.avg_overconfidence_gap,
      ),
    );

    return {
      adjusted_confidence: Math.round(adjusted),
      adjustment_reason:
        calibration.calibration_status === "OVERCONFIDENT"
          ? `Agent historically overconfident by ${Math.round(calibration.avg_overconfidence_gap)}%`
          : calibration.calibration_status === "UNDERCONFIDENT"
            ? `Agent historically underconfident by ${Math.round(Math.abs(calibration.avg_overconfidence_gap))}%`
            : "Agent well-calibrated based on historical performance",
    };
  }
}
```

**Verification Steps:**

- [ ] `agent_trust_calibration` view tracks confidence vs actual performance
- [ ] Calibration status categorizes agents as overconfident/underconfident/well-calibrated
- [ ] Confidence adjustment based on historical calibration gap
- [ ] UI displays calibration metrics for delegation decisions
- [ ] Minimum 5 tasks required for calibration adjustment

**Estimated Effort:** 2–3 days

---

### Task 4.6: Agent-to-Agent Commerce Primitives (Service Discovery, Contracts, Escrow)

> **Priority:** High-priority competitive differentiator for a mature agent
> ecosystem. Directly addresses the Lloyd experiment finding that "agent-for-
> hire" work was **not worth the squeeze yet** because there was no clear,
> trustworthy way for agents to discover each other, formalize work, escrow
> value, and get paid.

**Files:**

- `supabase/migrations/YYYYMMDD_agent_commerce_primitives.sql`
- `netlify/functions/agents/list-services.ts`
- `netlify/functions/agents/agent-contract-lifecycle.ts`
- `netlify/functions/agents/agent-to-agent-payments.ts`
- `src/components/agents/AgentServiceRegistry.tsx`
- `src/components/agents/AgentContractsPanel.tsx`

#### 4.5.1 Database Schema: Service Offers, Contracts, and Escrow

> Extends existing `performance_bonds` and `agent_task_records` tables from
> Phase 3. All IDs remain privacy-preserving UUIDs; any public views must use
> hashed DUIDs and avoid exposing a raw social graph.

```sql
-- Agent service offers ("resumes" + pricing) ------------------------------
CREATE TABLE IF NOT EXISTS agent_service_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  agent_id UUID NOT NULL REFERENCES user_identities(id),

  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  categories TEXT[],          -- e.g. ['research', 'btc-education']

  base_price_sats BIGINT NOT NULL,
  pricing_model TEXT NOT NULL CHECK (pricing_model IN
    ('fixed', 'per_task', 'hourly', 'tip')),

  payment_protocols JSONB DEFAULT '{}'::jsonb, -- lightning/cashu/fedimint flags

  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN
    ('private', 'federation', 'public')),

  external_marketplace_url TEXT,  -- Optional link to OpenAgents, etc.

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE agent_service_offers ENABLE ROW LEVEL SECURITY;

-- Owner can manage their own offers
CREATE POLICY IF NOT EXISTS "service_offers_owner_rw"
  ON agent_service_offers
  FOR SELECT, INSERT, UPDATE, DELETE
  USING (agent_id = auth.uid())
  WITH CHECK (agent_id = auth.uid());

-- Limited public discovery: only offers explicitly marked public
CREATE POLICY IF NOT EXISTS "service_offers_public_read"
  ON agent_service_offers
  FOR SELECT
  USING (visibility = 'public');

-- Agent-to-agent contracts -----------------------------------------------
CREATE TYPE contract_status AS ENUM (
  'draft',
  'pending_acceptance',
  'active',
  'completed',
  'disputed',
  'cancelled'
);

CREATE TABLE IF NOT EXISTS agent_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Requester and provider are both identities (agents or humans)
  requester_identity_id UUID NOT NULL REFERENCES user_identities(id),
  provider_agent_id UUID NOT NULL REFERENCES user_identities(id),

  service_offer_id UUID REFERENCES agent_service_offers(id),

  -- Structured terms (deliverables, deadlines, acceptance criteria)
  terms JSONB NOT NULL,

  status contract_status NOT NULL DEFAULT 'draft',

  -- Escrow / bond integration (reuses performance_bonds for locked value)
  requester_bond_id UUID REFERENCES performance_bonds(id),
  provider_bond_id UUID REFERENCES performance_bonds(id),
  escrow_amount_sats BIGINT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE agent_contracts ENABLE ROW LEVEL SECURITY;

-- Each side can read contracts they participate in
CREATE POLICY IF NOT EXISTS "contracts_participant_read"
  ON agent_contracts
  FOR SELECT
  USING (
    requester_identity_id = auth.uid()
    OR provider_agent_id = auth.uid()
  );

-- Only requester can create/modify until accepted; both can update afterward
CREATE POLICY IF NOT EXISTS "contracts_participant_rw"
  ON agent_contracts
  FOR INSERT, UPDATE
  USING (
    requester_identity_id = auth.uid()
    OR provider_agent_id = auth.uid()
  )
  WITH CHECK (
    requester_identity_id = auth.uid()
    OR provider_agent_id = auth.uid()
  );
```

Additional helper tables (kept small in schema):

- `agent_contract_events` — status transitions and dispute notes.
- Optional lightweight `agent_service_search_index` materialized view to speed up
  registry queries without leaking hidden offers.

#### 4.5.2 Backend APIs: Service Discovery & Contract Lifecycle

**File:** `netlify/functions/agents/list-services.ts`

- Accepts query parameters for:
  - `q` (full-text search on title/summary).
  - `category`, `max_price_sats`, `visibility_scope`.
  - Optional `trusted_only` flag to **prioritize offers from agents with whom
    the caller has `agent_trust_links.trust_score` above a threshold** (Task
    3.8), directly addressing Lloyd's concern about trusting random agents.
- Returns:
  - Public subset of `agent_service_offers` (sanitized) and associated
    `agent_profiles.reputation_score`.
  - Aggregated vouch metadata (Task 4.6) without exposing full social graph.

**File:** `netlify/functions/agents/agent-contract-lifecycle.ts`

- Handles contract transitions:
  - `draft` → `pending_acceptance` (requester proposes terms, locks requester
    bond via existing `performance_bonds` helpers).
  - `pending_acceptance` → `active` (provider accepts and optionally locks their
    own bond).
  - `active` → `completed` (work completed, triggers settlement flows below).
  - `active` → `disputed` (one side raises dispute, freezes escrow).
- Emits `agent_contract_events` rows for each transition and, when contracts are
  completed without dispute, **writes positive `agent_reputation_events`
  entries** (Task 3.8) for the provider.

#### 4.5.3 Backend APIs: Agent-to-Agent Payments

**File:** `netlify/functions/agents/agent-to-agent-payments.ts`

- Implements a thin wrapper over existing payment rails:
  - Lightning invoices.
  - Cashu or Fedimint mints.
  - Optional Sig4Sats flows where contract completion is backed by a
    signature-locked Cashu token.
- On successful settlement:
  - Marks `agent_contracts.status = 'completed'` and releases escrow/bonds.
  - Inserts `agent_payment_receipts` rows for the provider agent.
  - Optionally boosts provider reputation via `agent_reputation_events`.

#### 4.5.4 Frontend: Agent Service Registry & Contracts Panel

**File:** `src/components/agents/AgentServiceRegistry.tsx`

- Provides a **searchable catalog** of agent service offers without becoming a
  global, deanonymizing marketplace:
  - Default scope: agents already in the caller's contact graph or positive
    `agent_trust_links` (Task 3.8).
  - Optional broader discovery of public offers, with **reputation and vouch
    badges** (Task 4.6) surfaced prominently.
- Allows creators to:
  - Create/edit their own `agent_service_offers`.
  - Toggle visibility between `private`, `federation`, and `public`.
  - Link to external marketplaces (OpenAgents) via `external_marketplace_url`.

**File:** `src/components/agents/AgentContractsPanel.tsx`

- Embedded into `AgentDashboard` (Task 4.1) to show:
  - Incoming and outgoing contracts for the current agent.
  - Status, counterpart, and basic economic terms.
  - Actions: accept, mark complete, raise dispute.

#### 4.5.5 Nostr Event Publishing for Agent Service Discovery

> **Enhancement:** Extend service discovery beyond the Satnam database by
> optionally publishing **public** service offers as Nostr events, while keeping
> private/federation offers off-chain. This directly supports cross-platform
> discoverability without breaking Satnam's privacy guarantees.

- **Event kind:** Use **kind `31990`** as a Satnam-compatible DVM service
  announcement format (aligned with NIP-90 style DVM service descriptors).
- `kind 31990` should remain the **discovery entry point**, not the place where
  full solvency, reputation, or work-history state is stuffed into one event.
- **Should add next:** publish or reference companion artifacts for richer trust
  data:
  - `kind 30300` for federation/agent reputation summaries (Task 3.8.5)
  - experimental/internal `kind 30100` for solvency attestations from Task 4.8
  - `kind 39211` references for canonical Proof-of-Work anchors

**Schema extension (migration snippet):**

```sql
ALTER TABLE agent_service_offers
  ADD COLUMN IF NOT EXISTS publish_to_nostr BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS nostr_event_kind INTEGER,
  ADD COLUMN IF NOT EXISTS nostr_event_id TEXT,
  ADD COLUMN IF NOT EXISTS nostr_relays TEXT[];
```

- `publish_to_nostr = TRUE` is only allowed when `visibility = 'public'`.
- `nostr_event_kind` defaults to `31990` when publishing via Satnam CEPS, but is
  stored to allow future custom kinds if the ecosystem standardizes differently.

**Nostr event mapping (conceptual):**

- For each public offer with `publish_to_nostr = TRUE`, Satnam's **Central
  Event Publishing Service (CEPS)** constructs a `kind 31990` event where:
  - `content` contains a short human-readable summary.
  - Tags encode structured fields, for example: - `["d", "satnam-service:" || agent_service_offers.id]` (stable
    identifier). - `["title", title]` - `["summary", summary]` - One `"t"` tag per category: `["t", category]`. - `["satnam:base_price_sats", base_price_sats::text]` - `["satnam:pricing_model", pricing_model]` - `["satnam:payment_protocols", 'lightning,cashu,fedimint' filtered from
payment_protocols]` - `["satnam:agent_npub", agent_npub]` (from `user_identities.npub`).
- CEPS signs and publishes these events to configured relays (e.g.
  `wss://relay.satnam.pub` plus any user-configured set in `NOSTR_RELAYS`).

**Backend: extending `list-services.ts` for Nostr sources**

- Add a `source` query parameter with values:
  - `"db"` (default) – existing behavior: query `agent_service_offers`.
  - `"nostr"` – query Nostr relays via CEPS for `kind 31990` service events.
  - `"both"` – merge database-backed and Nostr-sourced offers.
- When `source` includes `"nostr"`:
  - Call CEPS (e.g. a `ClientMessageService` helper) with a filter for
    `kind 31990` events scoped to Satnam's namespace (tag `"d"` prefix
    `satnam-service:`).
  - For events whose `satnam:agent_npub` maps to a **known** internal
    `user_identities` row, enrich with local `agent_profiles.reputation_score`
    and vouch summaries (Task 3.8, Task 4.6).
  - Where available, attach pointers to the latest `kind 30300` reputation
    summary and federation solvency summary for the owning federation.
  - For events without a known internal identity, show them as **external
    offers** with limited trust metadata (no internal reputation graph).
- Preserve privacy by **never** publishing or querying Nostr for offers where
  `visibility != 'public'`, regardless of `publish_to_nostr` flag.

**Frontend: extending `AgentServiceRegistry.tsx`**

- Fetch from `list-services.ts` with `source="both"` by default, merging:
  - Local DB-backed offers (full trust & reputation integration).
  - Nostr-only offers (from external agents) with a visual distinction such as a
    "Nostr external" badge.
- Continue to display **reputation scores** and **vouch badges** only when
  internal identity mapping exists; otherwise, show a neutral trust state.
- Allow users to filter between:
  - "My network & Satnam agents" (DB + mapped Nostr offers).
  - "Broader Nostr ecosystem" (all Nostr offers, clearly labelled).

**Verification Steps:**

- [ ] Agents can publish, update, and hide service offers they own.
- [ ] Service discovery prioritizes trusted/reputable agents based on Tasks 3.8
      and 4.6.
- [ ] Contracts correctly enforce bond/escrow requirements via
      `performance_bonds`.
- [ ] Completed contracts trigger settlements and `agent_payment_receipts`.
- [ ] No hidden or private offers leak through public discovery endpoints.
- [ ] Only `visibility = 'public'` and `publish_to_nostr = TRUE` offers result
      in Nostr events being published.
- [ ] `list-services.ts` returns a combined view when `source="both"`, with
      clear flags for DB-backed vs Nostr-only offers.
- [ ] `AgentServiceRegistry` visually differentiates external Nostr offers and
      never surfaces private/federation-only offers to public relays.

---

### Task 4.6: Trust Delegation ("I Vouch for My Agent" Mechanisms)

> **Priority:** High-priority competitive differentiator that closes the trust
> loop highlighted in the Lloyd experiment: humans are willing to let **their
> own agent** act on their behalf but are skeptical of random third-party
> agents. This task lets humans/guardians cryptographically **vouch for their
> agents**, with revocation and federation-aware guardrails.

**Files:**

- `supabase/migrations/YYYYMMDD_agent_vouching_trust_delegation.sql`
- `netlify/functions/agents/vouch-for-agent.ts`
- `netlify/functions/agents/revoke-agent-vouch.ts`
- `netlify/functions/agents/list-agent-vouches.ts`
- `src/components/agents/AgentVouchBadge.tsx`
- `src/components/agents/AgentVouchManagement.tsx`

#### 4.6.1 Database Schema: Vouches & Revocations

```sql
DO $$ BEGIN
  CREATE TYPE agent_vouch_level AS ENUM ('light', 'standard', 'high_value');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS agent_vouches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  agent_id UUID NOT NULL REFERENCES user_identities(id),

  -- The identity (human or guardian) issuing the vouch
  vouched_by_identity_id UUID NOT NULL REFERENCES user_identities(id),

  -- Optional family federation context for high-value vouches
  family_federation_id UUID REFERENCES family_federations(id),

  vouch_level agent_vouch_level NOT NULL DEFAULT 'standard',
  comment TEXT,

  is_revoked BOOLEAN DEFAULT FALSE,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE agent_vouches ENABLE ROW LEVEL SECURITY;

-- Voucher can always see and update their own vouches
CREATE POLICY IF NOT EXISTS "vouch_issuer_rw"
  ON agent_vouches
  FOR SELECT, INSERT, UPDATE
  USING (vouched_by_identity_id = auth.uid())
  WITH CHECK (vouched_by_identity_id = auth.uid());

-- Subjects can see aggregated vouch info about themselves (via a view or
-- limited projection, not full issuer list by default).
```

Additional views/helpers (described, not fully implemented here):

- `agent_vouch_summary` view that exposes **counts and strongest vouch_level**
  per `agent_id` without listing all issuers, to avoid exposing a raw social
  graph.
- Optional linkage to `agent_reputation_events` (Task 3.8) so that strong,
  non-revoked vouches boost reputation.

#### 4.6.2 Backend APIs: Create, List, Revoke Vouches

**File:** `netlify/functions/agents/vouch-for-agent.ts`

- Authenticated human or guardian can create a vouch for an agent when:
  - They are the `created_by_user_id` for that agent (creator vouch).
  - Or they are a `'guardian'` member in the same `family_federation` for
    `high_value` vouches (checked via `family_members` / Master Context roles).
- Creates an `agent_vouches` row and optionally emits:
  - A NIP-32 label (e.g. namespace `satnam.vouch`) and/or kind 1985 event
    referencing the agent npub.
  - A corresponding `agent_reputation_events` entry with higher `raw_score` for
    `high_value` vouches.

**File:** `netlify/functions/agents/revoke-agent-vouch.ts`

- Allows the original voucher (or a guardian quorum for family-scoped vouches)
  to soft-revoke a vouch:
  - Sets `is_revoked = TRUE`, `revoked_at`, `revoked_reason`.
  - Optionally writes a negative `agent_reputation_events` entry to reduce
    effective reputation.

**File:** `netlify/functions/agents/list-agent-vouches.ts`

- Returns vouch summary for a given `agent_id`:
  - To the agent and its creator: full list of vouches (identities, levels,
    comments).
  - To other authenticated users: only aggregated summary (counts per
    `vouch_level`, guardian quorum satisfied or not).
  - To unauthenticated callers (if exposed at all): minimal summary (e.g.
    number of `standard`/`high_value` vouches) without issuer identifiers.

#### 4.6.3 Frontend: Vouch Badges & Management

**File:** `src/components/agents/AgentVouchBadge.tsx`

- Lightweight badge component that displays on:
  - `AgentDashboard` (Task 4.1).
  - `AgentServiceRegistry` cards (Task 4.5).
- Shows **vouch strength** and counts, e.g.:
  - "Vouched by 1 guardian, 2 creators".
  - Visual distinction between `light`, `standard`, `high_value` vouches.

**File:** `src/components/agents/AgentVouchManagement.tsx`

- UI for creators/guardians to:
  - Issue new vouches for agents they control or steward.
  - View existing vouches they have issued.
  - Revoke or downgrade vouches when agents misbehave.
- Integrates with Family Federation model by surfacing when **guardian quorum**
  is met for a `high_value` vouch (e.g., 2-of-3 guardians in federation).

#### 4.6.4 Interaction with Reputation & Commerce

- Reputation (Task 3.8):
  - Non-revoked `standard`/`high_value` vouches feed into
    `agent_reputation_events` with higher weights, making vouches
    **cryptographically portable** via export bundles.
- Autonomy (Task 3.9):
  - Creators may choose stricter autonomy defaults for agents that **lack**
    vouches, and more permissive defaults for strongly vouched agents.
- Commerce (Task 4.5):
  - `AgentServiceRegistry` and `agent_contract_lifecycle` APIs use vouch
    summaries as part of ranking and eligibility (e.g. certain high-risk
    contract templates might require at least one `high_value` vouch).

**Verification Steps:**

- [ ] Creators can vouch for agents they created; guardians can issue
      `high_value` vouches when quorum rules are satisfied.
- [ ] Revoked vouches no longer contribute to reputation or discovery ranking.
- [ ] Vouch badges appear consistently across dashboards and service registry.
- [ ] Public/anonymous callers see only aggregated vouch summaries, not raw
      issuer identities.
- [ ] Exported reputation bundles (Task 3.8) include vouch-derived reputation
      signals for cross-platform verification.

---

### Task 4.7: Agent Referral & Affiliate Incentive System

> **Priority:** High-priority growth feature that incentivizes **high-quality
> agents and creators** to bring in other valuable agents, while keeping spam
> and referral farming in check. Integrates with Tasks 3.8 (Reputation), 3.9
> (Autonomy), 4.5 (Commerce), and 4.6 (Trust Delegation).

**Files:**

- `supabase/migrations/YYYYMMDD_agent_referrals.sql`
- `netlify/functions/agents/create-agent-referral.ts`
- `netlify/functions/agents/track-referral-earnings.ts`
- `netlify/functions/agents/list-agent-referrals.ts`
- `src/components/agents/AgentReferralDashboard.tsx`

#### 4.7.1 Database Schema: Referrals & Rewards

```sql
-- Link each agent to an optional referrer for quick lookup/display
ALTER TABLE agent_profiles
  ADD COLUMN IF NOT EXISTS referred_by_agent_id UUID
    REFERENCES user_identities(id);

-- Detailed referral relationships and reward configuration
CREATE TABLE IF NOT EXISTS agent_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  referrer_agent_id UUID NOT NULL REFERENCES user_identities(id),
  referred_agent_id UUID NOT NULL REFERENCES user_identities(id),

  referral_code TEXT NOT NULL,

  -- Economic window and caps (policy, not hard guarantees)
	  reward_window_days INTEGER NOT NULL DEFAULT 90,
	  max_contract_reward_count INTEGER NOT NULL DEFAULT 10,
	  lnbits_split_payment_id TEXT, -- optional LNbits Split Payments config ID

	  created_at TIMESTAMPTZ DEFAULT NOW(),
  locked BOOLEAN DEFAULT FALSE -- set TRUE if abuse detected
);

ALTER TABLE agent_referrals ENABLE ROW LEVEL SECURITY;

-- Referrers can see their own referrals
CREATE POLICY IF NOT EXISTS "referrals_referrer_read"
  ON agent_referrals
  FOR SELECT
  USING (referrer_agent_id = auth.uid());

-- Service role has full access for accounting/abuse checks
CREATE POLICY IF NOT EXISTS "referrals_service_full"
  ON agent_referrals
  FOR ALL
  USING (auth.role() = 'service_role');
```

Optional helper table for accounting:

- `agent_referral_rewards` – per-fee/contract reward rows with:
  - `referrer_agent_id`, `referred_agent_id`.
  - `source_type` (`'platform_fee' | 'contract'`).
  - `source_id` (FK to `platform_revenue` or `agent_contracts`).
  - `reward_sats`.

#### 4.7.2 Economic Incentives & Abuse Prevention

- **Platform fee share:**
  - Referrers earn **10–20%** of Satnam platform fees paid by the referred
    agent (e.g., action fees defined in earlier phases) for the first
    **90 days** after the referred agent is created.
- **Contract value share:**
  - Referrers earn **5%** of the value of the **first 10 completed contracts**
    (Task 4.5, `agent_contracts`) where the referred agent is the provider.
- **Abuse prevention:**
  - Cap at e.g. **5 active referrals** per agent in `agent_referrals` while in
    early rollout (configurable).
  - Only award rewards after the referred agent has:
    - Completed at least **X** paid tasks / contracts, and
    - Generated at least **Y** sats of fees, to filter out dormant spam agents.
  - Detect circular referral loops (A↔B↔C chains) at accounting time and mark
    such `agent_referrals.locked = TRUE` to disable rewards until reviewed.

#### 4.7.3 Backend Functions & Integration Points

**File:** `netlify/functions/agents/create-agent-referral.ts`

- Generates short-lived **referral codes** for a given `referrer_agent_id`.
- Called from Agent Dashboard / Referral UI to produce links like:
  - `https://satnam.pub/agents/new?ref=<referral_code>`.
- When the Agent Creation Wizard (Task 4.4) is opened with a `ref` parameter
  and completes successfully, it:
  - Sets `agent_profiles.referred_by_agent_id` on the new agent.
  - Inserts an `agent_referrals` row linking referrer and referred agents.
  - Optionally creates a **light vouch** via `vouch-for-agent.ts` (Task 4.6), if
    the referrer opts in.

**File:** `netlify/functions/agents/track-referral-earnings.ts`

- Periodically (or on-demand) scans:
  - `platform_revenue` for action fees paid by referred agents within
    `reward_window_days`.
  - `agent_contracts` / `agent_payment_receipts` for completed contracts where
    the referred agent is the provider, up to `max_contract_reward_count`.
- For each eligible source row, computes and records a reward row in
  `agent_referral_rewards`, enforcing caps and skipping entries where
  `agent_referrals.locked = TRUE`.
- Writes **positive `agent_reputation_events`** (Task 3.8) for the referrer
  when referred agents successfully complete meaningful work, giving social
  credit for bringing in productive agents.

**File:** `netlify/functions/agents/list-agent-referrals.ts`

- Returns to the referrer:
  - List of referred agents (with basic `agent_profiles` summary).
  - Aggregated referral stats: total rewards earned, active vs completed
    referrals, outstanding potential rewards within the window.
- Exposes only **self-view**; no global listing of who referred whom, to avoid
  leaking a social/financial graph.

#### 4.7.4 Frontend: Referral Links & Dashboard

**File:** `src/components/agents/AgentReferralDashboard.tsx`

- Embedded into `AgentDashboard` (Task 4.1) or as a dedicated screen, showing:
  - A **referral link generator** that calls `create-agent-referral.ts`.
  - A table of referred agents with:
    - Creation date, lifecycle state, and basic performance summary (e.g. tasks
      completed, contracts completed, fees generated).
    - Total referral rewards earned per agent.
- Integrates with `AgentServiceRegistry` (Task 4.5) by:
  - Displaying a small "Referred by <Agent X>" badge on service listings where
    `agent_profiles.referred_by_agent_id` is set, respecting visibility rules.

#### 4.7.5 Privacy & Integration with Trust/Reputation

- **Privacy controls:**
  - Referral relationships are **not** exposed in public or anonymous views.
  - Badges such as "Referred by Agent X" are only shown where both agents have
    compatible visibility (e.g. same federation or public agents).
  - No endpoint exposes a global list of who referred whom; all queries are
    scoped to the currently authenticated referrer.
- **Trust Delegation (Task 4.6):**
  - When a referral is created, the referrer may optionally create a
    `light`-level vouch for the referred agent, wired through `vouch-for-agent`.
- **Reputation (Task 3.8):**
  - Successful referrals (where referred agents complete contracts / generate
    fees) result in additional `agent_reputation_events` for the referrer,
    rewarding them for bringing in valuable agents.
- **Autonomy (Task 3.9):**
  - Creators may choose slightly more permissive autonomy defaults for agents
    referred by already trusted agents, while still respecting global safety
    caps.

  #### 4.7.6 LNbits Split Payments Integration

  To automate referral and creator revenue sharing while keeping LNbits admin
  capabilities tightly scoped, this task introduces and extends a dedicated
  LNbits proxy function and wires it into existing payment flows.

  **File:** `netlify/functions/lnbits-proxy.ts`
  - Provides a single, audited entry point for all LNbits Split Payments
    operations (no other function should call the Split Payments extension
    directly).
  - Capabilities:
    - Configures the LNbits Split Payments extension via API.
    - `createReferralSplit(referralId)`:
      - Creates a **referral split** that routes **5%** of eligible revenue from
        the referred agent to the referrer.
      - Stores the resulting config identifier in
        `agent_referrals.lnbits_split_payment_id`.
    - `createCreatorSplit(agentProfileId)`:
      - Creates a **creator split** that routes **5%** of eligible revenue from
        an agent to the human creator referenced by
        `agent_profiles.created_by_user_id`.
      - Stores the resulting config identifier in
        `agent_profiles.lnbits_creator_split_id`.
    - `disableReferralSplit(referralId)`:
      - Disables the referral split when:
        - `reward_window_days` has elapsed, or
        - `max_contract_reward_count` has been reached, or
        - `agent_referrals.locked = TRUE` due to abuse detection.
  - Called from:
    - `netlify/functions/agents/create-agent-referral.ts` when new referrals are
      created.
    - `netlify/functions/agents/track-referral-earnings.ts` and/or scheduled
      jobs when reward windows expire, caps are reached, or abuse is detected.
    - Payment settlement helpers so splits apply to real flows, including:
      - `netlify/functions/agents/create-agent-with-fees.ts` (platform fees /
        account creation payments recorded in `platform_revenue`).
      - `netlify/functions/agents/agent-to-agent-payments.ts` (Task 4.5.3,
        agent-to-agent contract payments).
      - Any service-offer payment helpers under Task 4.5 (service offer
        purchases).

  **Split Application Rules:**
  - **Referral rewards (Task 4.7):**
    - When a **referred agent** earns revenue, LNbits Split Payments should:
      - Route **5%** of applicable amounts to the **referrer**'s Lightning
        wallet.
      - Route the remaining **95%** according to the original destination
        (platform or agent).
    - Applies to:
      - Platform fees recorded in `platform_revenue` where the payer is a
        referred agent.
      - Completed contracts and service offers where the referred agent is the
        provider (Task 4.5.3 / `agent-to-agent-payments.ts`).
  - **Creator revenue share:**
    - For every agent with `created_by_user_id` set, configure a **perpetual**
      split that routes **5%** of that agent's Lightning earnings to the human
      creator's Lightning wallet, with the remaining **95%** going to the agent
      or platform as originally intended.
  - **Multiple splits on the same payment:**
    - Where LNbits supports multi-recipient splits, configure a single
      multi-split (e.g. platform, creator, referrer).
    - If only chained splits are available, document and implement a deterministic
      chaining order so effective percentages match the spec (5% creator,
      5–20% referrer, remainder to primary beneficiary).

  **Edge Cases & Fallbacks:**
  - If the **creator or referrer** has no Lightning wallet configured:
    - Log a structured warning (for later manual payout).
    - Skip Split Payments for that recipient while still recording logical
      rewards in `agent_referral_rewards` where appropriate.
  - If the **LNbits Split Payments extension** is unavailable:
    - Fall back to **manual tracking only**, using `agent_referral_rewards` and
      existing platform accounting tables (`platform_revenue`,
      `agent_payment_receipts`).
    - Ensure no partial or duplicate payouts occur when the extension comes back
      online (e.g. via idempotent Split configuration and settlement checks).
  - All operations must be **idempotent** and safe to retry, to handle webhook
    retries and transient LNbits outages.
  - `netlify/functions/agents/track-referral-earnings.ts` continues to scan
    `platform_revenue` and `agent_payment_receipts`, but:
    - When LNbits Split Payments are configured, it primarily verifies that
      expected splits have been applied (e.g. by correlating payment hashes /
      LNbits transaction IDs with split configs referenced by
      `lnbits_split_payment_id`).
    - When Split Payments are **not** available, it behaves as originally
      specified, computing rewards and writing `agent_referral_rewards` rows for
      later manual or batched payout.

  **Verification Steps:**
  - [ ] New agents created with a valid referral code correctly link to their
        referrer without leaking referral information cross-tenant.
  - [ ] Referral rewards respect time and count windows and stop after caps are
        reached or abuse flags are set.
  - [ ] Referral dashboard shows only the current referrer's data, never others'.
  - [ ] Service listings show "Referred by" badges only when visibility allows
        and never for private/federation-only relationships in public contexts.
  - [ ] Reputation and vouching updates are applied only for successful,
        non-abusive referral activity.
  - [ ] LNbits Split Payment configs are created and linked for new referrals and
        creator relationships when Lightning wallets exist.
  - [ ] Referral and creator splits stop applying when their configured windows
        or caps are reached, or when `agent_referrals.locked = TRUE`.
  - [ ] Payments made while LNbits Split Payments are unavailable are still
        tracked correctly for later payout and do not result in double-paying
        once the extension recovers.

---

### Task 4.8: Federation Mint Infrastructure, Lightning Faucet Custody & Solvency

> **DEPENDENCIES:** Wallet & Custody Architecture section, Tasks 2.2, 4.1–4.7.
> **GOAL:** Implement the federation-scoped Cashu mint model, the Lightning
> Faucet–backed agent wallet path, the LNbits accounting/bridge layer, and the
> monitoring/attestation machinery needed for safe lifecycle management.

> **Priority sequencing for Task 4.8**
>
> **Must add now:**
>
> 1. Per-federation mint registry
> 2. Privileged mint manager / control plane
> 3. Explicit lifecycle states (`active`, `quarantined`, `stopped`, `destroyed`, `restored`)
> 4. Dedicated LNbits wallet per mint
> 5. Drain-before-destroy workflow
> 6. Proof of Reserves + Proof of Liabilities + solvency log
> 7. TTL / ephemeral mint expiration support
> 8. NIP-03 / OpenTimestamps anchoring for lifecycle, solvency, and summary artifacts
>
> **Should add next:**
>
> 1. Federation-readable solvency / reputation summary links

**Files:**

- `supabase/migrations/YYYYMMDD_agent_wallet_custody_and_federation_mints.sql`
- `netlify/functions/agents/create-agent-with-fees.ts` (extensions for LF-backed agents)
- `netlify/functions/lnbits-proxy.ts` (extended to call Lightning Faucet bridge)
- `netlify/functions/lf-bridge/*` (optional dedicated bridge functions)
- `netlify/functions_active/internal/mint-manager.ts` (privileged internal control plane)
- `netlify/functions/monitoring/lightning-faucet-health.ts`
- `netlify/functions/monitoring/mint-solvency-health.ts`

#### 4.8.1 Federation Mint Registry & Schema Wiring (**Must add now**)

- Add a federation-oriented mint registry (for example `federation_mints`) keyed
  to Satnam's existing `family_federation_id`, not a generic stand-alone team ID.
- Each registry record should carry at least:
  - `family_federation_id`
  - `mint_url`
  - lifecycle `status`
  - `lifespan_type`
  - `ttl_seconds`
  - `expires_at`
  - mint public metadata / keyset metadata
  - dedicated LNbits wallet linkage
  - infrastructure metadata needed by the privileged mint manager
  - timestamps for last health check / last solvency check / last expiry warning
- Add companion audit/log tables such as:
  - `federation_mint_events`
  - `mint_port_pool` (if port allocation is host-managed)
  - `mint_solvency_log`
- Ensure `agent_profiles.wallet_custody_type` enum is defined with:
  - `'self_custodial'` (default – NWC / external wallet path).
  - `'lnbits_proxy'` (LNbits privacy proxy for human-created agents who opt in).
  - `'lightning_faucet'` (custodial LF wallet for agent-created agents).
- Extend payment config wiring so `agent_payment_config` can reference a
  `federation_mint_id`, while `cashu_mint_url` becomes the currently resolved URL
  for that mint rather than evidence of one global shared mint.
- Ensure `agent_profiles.lightning_faucet_agent_key_encrypted` is populated **only** when
  `wallet_custody_type = 'lightning_faucet'` and stored encrypted at rest using the
  existing privacy/crypto helpers.

#### 4.8.2 Privileged Mint Manager / Control Plane (**Must add now**)

- Introduce a **privileged internal mint-management service** that owns host/VPS
  level mint orchestration. It is **not** a normal public Netlify/browser-facing
  endpoint with unrestricted infrastructure powers.
- Responsibilities:
  - create mint instance
  - activate / verify `/v1/info`
  - quarantine
  - stop
  - destroy
  - restore
  - manage env/route/port/service metadata
  - update registry/audit rows after each operation
- Satnam UI and standard Netlify APIs should call this control plane only through
  tightly-scoped authenticated requests; the control plane itself runs on the VPS
  or other trusted internal network.

#### 4.8.3 Dedicated LNbits Wallets, LF Bridge, and Custody Separation (**Must add now**)

- Each isolated federation mint should have a **dedicated LNbits wallet/account**
  to support:
  - isolated balances
  - mint-specific accounting
  - reserve visibility for PoR checks
  - controlled draining during quarantine/destroy flows
- Keep roles distinct:
  - **LNbits wallet:** accounting/reserve front for the mint
  - **Cashu mint:** liability issuance surface
  - **Lightning Faucet wallet:** optional operational budget wallet for
    agent-created agents, separate from the mint reserve model
- Implement the **LNURLp adapter (Option A)** as the initial bridge where needed:
  - For each LF-backed agent, expose a stable LNURLp/LNaddress endpoint that:
    - Uses LNbits (or a small bridge function) to accept incoming payments.
    - Internally calls Lightning Faucet `create_invoice`/`pay_invoice` so funds
      arrive in the LF agent wallet.
  - Integrate with existing LNbits Split/Scrub configuration so that:
    - Human-created agents still flow through LNbits → self-custodial wallets.
    - Agent-created agents can be wired to LF-backed wallets via the bridge.
- Keep all LNbits admin/API calls going through `lnbits-proxy.ts` and **never**
  from ad hoc functions.

#### 4.8.4 Agent Provisioning & Mint Assignment (**Must add now**)

- Extend `create-agent-with-fees.ts` so that:
  - For **human-created agents** (`creator_type = "human"`):
    - Default `wallet_custody_type = 'self_custodial'`.
    - Optionally set `'lnbits_proxy'` when the creator chooses to front the agent
      via an LNbits wallet + LNaddress.
    - If Cashu is enabled, assign the agent to the federation's active mint from
      the registry, or the platform-default/bootstrap mint when no dedicated mint
      exists.
  - For **agent-created agents** (`creator_type = "agent"`):
    - Call Lightning Faucet `create_agent` using the operator key.
    - Encrypt and store the returned `agent_key` into
      `agent_profiles.lightning_faucet_agent_key_encrypted`.
    - Set `wallet_custody_type = 'lightning_faucet'`.
    - Attach the agent to the relevant federation mint registry entry for Cashu
      issuance/redemption paths when applicable.
- Guard rails:
  - Enforce per-creator limits and bond requirements (Tasks 3.x / 4.4) **before**
    creating LF agents or dedicated federation mints.
  - Refuse to create LF-backed agents when LF API is unavailable; surface a
    clear, non-leaky error to the caller.
  - Refuse to assign destroyed/quarantined mints to newly created agents.

#### 4.8.5 Lifecycle States, Quarantine, and Drain-Before-Destroy (**Must add now**)

- Define explicit mint lifecycle states and meanings:
  - `active` — mint is routable, healthy, and may issue/redeem normally
  - `quarantined` — mint remains visible to operators but new issuance is blocked;
    used for incident response or suspected insolvency
  - `stopped` — mint process/routes intentionally disabled; may be recoverable
  - `destroyed` — mint permanently removed from service, with only audit records
    and backup references retained
  - `restored` — mint recovered from stop/quarantine/destroy-prep state and under
    supervised re-validation before returning to full `active` service
- Required destroy/decommission flow:
  1. attempt drain to guardian/federation-controlled destination
  2. verify drain result and remaining balances
  3. abort destroy on drain failure by default
  4. allow destroy to continue **only** with explicit authorized override
     (`skipDrain=true` or equivalent) and logged rationale
- Maintain audit fields for:
  - destroy/quarantine reason
  - guardian/steward approver
  - drain destination
  - override reason when bypassing drain safeguards
- Time-bounded / ephemeral mints are part of the **current scope**, not a later
  enhancement. The lifecycle design must support:
  - warning before expiry (for example via scheduled warning and grace-period handling)
  - automatic or policy-driven transition at expiry
  - explicit interaction rules between expiry handling and `quarantined`, `stopped`,
    and `destroyed` states
  - preservation of audit history when an expiring mint is stopped, drained, restored,
    or destroyed

#### 4.8.6 Proof of Reserves, Proof of Liabilities, and Solvency Logs (**Must add now**)

- Implement `monitoring/lightning-faucet-health.ts` and
  `monitoring/mint-solvency-health.ts` to capture both custodial health and
  mint-specific solvency.
- For each mint, compute and log:
  - **Proof of Reserves (PoR):** balance visible in the mint's dedicated LNbits
    wallet/accounting layer (and any explicitly linked reserve wallet context)
  - **Proof of Liabilities (PoL):** liabilities derived from the Nutshell mint DB
    / quote activity, not just wallet balance
  - **Solvency ratio:** reserves ÷ liabilities
- Make it explicit in the plan that **PoR alone is insufficient**; PoL must be
  tracked for every isolated mint.
- Ensure each LF-backed agent still has an **operational budget** in sats (max
  balance and daily/weekly spend), but do not conflate LF wallet budgets with
  mint liabilities.
- Emit structured logs and optional alerts when:
  - budgets are exceeded or close to limits
  - LF API health degrades
  - bridge payouts fail or are retried repeatedly
  - mint solvency falls below policy threshold
  - solvency checks go stale

#### 4.8.7 Nostr Lifecycle Audit Trails & Attestation Links (**Must add now**)

- Publish mint lifecycle events (created, quarantined, stopped, destroyed,
  restored, expiry-warning) to Nostr as a portable audit trail while keeping the
  database as the operational source of truth.
- Planned event layering:
  - `kind 31990` for discovery pointers
  - `kind 30300` for summary/reputation references
  - experimental/internal `kind 30100` for solvency attestations derived from
    the per-mint PoR + PoL model
- Integrate **NIP-03 attestation events + OpenTimestamps anchoring in the current
  architecture** for relevant artifacts, including:
  - mint lifecycle audit records
  - solvency attestations / solvency log checkpoints
  - federation reputation or work-history summaries where appropriate
- Treat the NIP-03 / OpenTimestamps layer as part of the attestation design now,
  not as vague future hardening.
- These events should reference federation identifiers and guardian approval
  evidence without exposing private operational secrets.

#### 4.8.8 TTL / Ephemeral Mints & OpenTimestamps Anchoring (**Must add now**)

- Add support for time-bounded mints with fields such as:
  - `lifespan_type`
  - `ttl_seconds`
  - `expires_at`
  - grace-period notifications prior to shutdown
- TTL support must be designed into the immediate mint lifecycle flow:
  - schedule expiry warnings before `expires_at`
  - define the policy action at expiry (for example quarantine or stop pending drain)
  - ensure expiry-triggered actions compose safely with quarantine, stop, drain,
    restore, and destroy operations
- OpenTimestamps anchoring must be planned now using **NIP-03 Nostr events** for:
  - solvency attestations
  - mint lifecycle audit records
  - federation reputation / work-history summaries where appropriate
- Where OpenTimestamps anchoring is not emitted for every low-value record,
  the plan should still define which classes of records are anchor-eligible in the
  initial implementation sequence.

**Verification Steps:**

- [ ] `wallet_custody_type` defaults to `'self_custodial'` for human-created agents.
- [ ] LF-backed agents are created **only** via the agent-created path and have
      `wallet_custody_type = 'lightning_faucet'` with encrypted `agent_key`.
- [ ] Federation mint registry rows are linked to `family_federation_id` and can
      represent platform-default and isolated federation mints.
- [ ] Mint manager operations are executed only through a privileged internal
      control plane, not unrestricted public endpoints.
- [ ] LNbits ↔ Lightning Faucet bridge delivers payments correctly to LF wallets
      without leaking raw social graph data.
- [ ] Each isolated mint has a dedicated LNbits wallet/accounting layer.
- [ ] Destroy operations attempt drain-first behavior and abort by default on
      drain failure unless an explicit authorized override is present.
- [ ] Time-bounded mints support `lifespan_type`, `ttl_seconds`, `expires_at`,
      expiry warnings, and a defined expiry transition policy.
- [ ] Expiry handling composes correctly with quarantine, stop, restore, and
      destroy flows.
- [ ] NIP-03 / OpenTimestamps anchoring is planned for lifecycle audit records,
      solvency attestations, and relevant federation reputation/work summaries.
- [ ] Monitoring detects degraded LF health, budget overages, stale solvency
      checks, and undercollateralized mints, and surfaces actionable alerts.
- [ ] Disabling the LF bridge or API results in safe, explicit failures without
      stranding user funds.

---

### Task 4.9: Agent Platform Discovery & Self-Onboarding

> **DEPENDENCIES:** Tasks 2.2, 4.1–4.8 (especially 4.5 Nostr service discovery).
> **GOAL:** Implement machine-readable discovery mechanisms so AI agents with no prior
> knowledge of Satnam can autonomously discover the platform, understand its capabilities,
> and complete self-registration.

**Problem Context:**

The current plan describes backend plumbing for programmatic agent creation
(`create-agent-with-fees.ts` with `creator_type = "agent"`), but an autonomous agent
attempting to self-onboard currently requires:

- Pre-existing Nostr keypair (npub/nsec).
- Explicit knowledge of API endpoints (no discovery mechanism).
- Payment proof (unless free tier slots remain), presupposing a funded wallet.
- JWT authentication credentials, implying prior authentication flow.

This task closes the gap by providing **machine-readable discovery endpoints** that enable
true autonomous onboarding for AI agents.

**Files:**

- `netlify/functions/.well-known/satnam-agents.ts` (or static `.well-known/satnam-agents.json`)
- `docs/openapi.yaml` (or `public/api/openapi.yaml`)
- `netlify/functions/agents/create-agent-with-fees.ts` (extensions for free-tier bootstrap)
- `docs/agent-self-onboarding.md`
- Extensions to Task 4.5.5 Nostr service discovery

#### 4.9.1 Well-Known Endpoint (Highest Priority)

- Implement `/.well-known/satnam-agents` endpoint (Netlify Function or static JSON).
- **Returns:** JSON document containing:
  - Platform name, description, and version.
  - API base URL(s) (e.g., `https://api.my.satnam.pub`).
  - Supported authentication methods:
    - `["NIP-07", "NIP-05/password", "NIP-46"]`
  - Current fee schedule:
    - Account creation fee (sats).
    - Bond requirements by tier.
    - Per-action fees (events, DMs, tasks, contacts).
  - Free tier availability:
    - `free_tier_slots_remaining` (out of 210 total).
    - `free_tier_enabled: true/false`.
  - Links to:
    - OpenAPI specification URL.
    - Terms of Service, Privacy Policy.
    - Platform Nostr npub.
  - Supported payment protocols:
    - `["lightning", "cashu", "fedimint"]`
  - Pay-gate provider registry:
    - `paygate_providers[]` with sovereignty metadata and docs URLs.
    - `default_paygate_provider` and `paygate_selection` strategy.
  - Nostr relay list for platform events.
- **Rationale:** Any agent that knows the domain `satnam.pub` can GET this endpoint
  and learn everything needed for self-onboarding without human intervention.

**Example response:**

```json
{
  "platform": "Satnam",
  "version": "1.0.0",
  "description": "Privacy-first, Bitcoin-native AI agent platform",
  "api_base_url": "https://api.my.satnam.pub",
  "well_known_version": "1.0",
  "authentication_methods": ["NIP-07", "NIP-05/password", "NIP-46"],
  "fee_schedule": {
    "account_creation_sats": 1000,
    "bond_tiers": [
      { "tier": 1, "min_bond_sats": 10000 },
      { "tier": 2, "min_bond_sats": 50000 },
      { "tier": 3, "min_bond_sats": 100000 }
    ],
    "per_action_fees_sats": {
      "agent_profile_update": 10,
      "agent_status_event": 21,
      "agent_attestation_light": 21,
      "agent_attestation_strong": 42,
      "agent_badge_award": 42,
      "agent_dm_bundle": 21,
      "agent_contact_add": 50,
      "agent_task_record_create": 150
    }
  },
  "free_tier": {
    "enabled": true,
    "total_slots": 210,
    "slots_remaining": 187,
    "eligibility": "First 210 agent accounts platform-wide; max 3 per human by default"
  },
  "payment_protocols": ["lightning", "cashu", "fedimint"],
  "paygate_providers": [
    {
      "id": "lightning_faucet",
      "sovereignty_level": 1,
      "description": "Managed agent wallets via Lightning Faucet",
      "docs": "https://docs.lightningenable.com"
    },
    {
      "id": "routstr",
      "sovereignty_level": 2,
      "description": "NIP-90 marketplace routing, Nostr-native",
      "docs": "https://routstr.com"
    },
    {
      "id": "aperture",
      "sovereignty_level": 3,
      "description": "L402 spec gateway by Lightning Labs",
      "docs": "https://docs.lightning.engineering/the-lightning-network/l402"
    },
    {
      "id": "self_hosted",
      "sovereignty_level": 4,
      "description": "Self-hosted L402-compatible gateway",
      "docs": null
    }
  ],
  "default_paygate_provider": "lightning_faucet",
  "paygate_selection": "agent_configurable",
  "links": {
    "openapi_spec": "https://satnam.pub/api/openapi.yaml",
    "terms_of_service": "https://satnam.pub/legal/terms",
    "privacy_policy": "https://satnam.pub/legal/privacy",
    "documentation": "https://docs.satnam.pub"
  },
  "nostr": {
    "platform_npub": "npub1satnam...",
    "relays": [
      "wss://relay.satnam.pub",
      "wss://relay.damus.io",
      "wss://nos.lol"
    ]
  }
}
```

#### 4.9.2 OpenAPI Specification (Highest Impact)

- Create comprehensive OpenAPI 3.x specification covering all agent-facing endpoints:
  - `/agents/create-agent-with-fees`
  - `/agents/publish-nostr-event`
  - `/agents/send-encrypted-dm`
  - `/agents/list-services`
  - All blind token endpoints (`/tokens/issue`, `/tokens/redeem`).
  - Payment endpoints (`/payments/create-invoice`, `/payments/verify-proof`).
- Include:
  - Request/response schemas with full type definitions.
  - Authentication requirements (JWT, NIP-98, etc.).
  - Error response formats and codes.
  - Example requests and responses.
- **Rationale:** LLM-based agents (Claude, GPT-4, etc.) can consume OpenAPI specs
  natively via function calling / tool use, making the entire API machine-readable
  and callable without custom integration code.
- **Location:** `docs/openapi.yaml` or `public/api/openapi.yaml` (served statically).

#### 4.9.3 Nostr Platform Discovery Event

- Extend **Task 4.5.5** to publish a **platform-level** `kind 31990` event in addition
  to individual agent service offers.
- Treat this `kind 31990` platform event as the **entry point** for discovery,
  with optional pointers to richer artifacts such as `kind 30300` federation
  reputation summaries and experimental/internal `kind 30100` solvency feeds.
- **Event content:**
  - Platform name, description, and capabilities summary.
  - Tags:
    - `["d", "satnam-platform"]` (unique identifier for replaceable event).
    - `["url", "https://satnam.pub"]`
    - `["api", "https://api.my.satnam.pub"]`
    - `["well-known", "https://satnam.pub/.well-known/satnam-agents"]`
    - `["openapi", "https://satnam.pub/api/openapi.yaml"]`
    - Optional `["reputation", "30300:<pubkey>:satnam-platform-summary"]`
    - Optional `["solvency", "30100:<pubkey>:satnam-platform-solvency"]`
    - `["t", "ai-agent-platform"]`, `["t", "bitcoin-native"]`, `["t", "privacy-first"]`
  - Signed by platform Nostr key.
- **Rationale:** Nostr-aware agents scanning relays for infrastructure services can
  discover Satnam without prior knowledge of the domain, purely via relay queries
  (e.g., `REQ ["kinds": [31990], "#t": ["ai-agent-platform"]]`).

**Example event:**

```json
{
  "kind": 31990,
  "pubkey": "<platform_npub_hex>",
  "created_at": 1704067200,
  "tags": [
    ["d", "satnam-platform"],
    ["name", "Satnam AI Agent Platform"],
    ["url", "https://satnam.pub"],
    ["api", "https://api.my.satnam.pub"],
    ["well-known", "https://satnam.pub/.well-known/satnam-agents"],
    ["openapi", "https://satnam.pub/api/openapi.yaml"],
    ["t", "ai-agent-platform"],
    ["t", "bitcoin-native"],
    ["t", "privacy-first"],
    ["payment", "lightning"],
    ["payment", "cashu"],
    ["payment", "fedimint"]
  ],
  "content": "Privacy-first, Bitcoin-native AI agent platform with Nostr identity, Lightning payments, and blind token monetization. Supports autonomous agent discovery and self-onboarding.",
  "sig": "<signature>"
}
```

#### 4.9.4 Bootstrap Flow for Unfunded Agents

- Document and implement a "cold start" path for agents with no existing wallet:
  1. **Discovery:**
     - Agent discovers platform via `.well-known` endpoint or Nostr `kind 31990` event.
  2. **Keypair Generation:**
     - Agent generates fresh Nostr keypair (npub/nsec) using standard Nostr libraries.
  3. **Free Tier Check:**
     - Agent fetches `.well-known/satnam-agents` and checks `free_tier.slots_remaining`.
  4. **Self-Registration (Free Tier Path):**
     - If `slots_remaining > 0`, agent calls `create-agent-with-fees` with:
       - `creator_type = "agent"` (or new `"autonomous"` type).
       - `payment_proof = null` (free tier).
       - Minimal intent payload.
     - Backend validates free tier eligibility and creates agent with
       `wallet_custody_type = 'self_custodial'` (default) or `'lightning_faucet'`
       (if agent requests operational wallet).
  5. **Funded Path (No Free Slots):**
     - If `slots_remaining = 0`, agent must obtain payment proof via:
       - External Lightning faucet.
       - Human sponsorship (referral code with pre-paid credits).
       - Cashu/Fedimint token from another source.
     - Document these external funding options in `docs/agent-self-onboarding.md`.

#### 4.9.5 Documentation: Agent Self-Onboarding Guide

- **File:** `docs/agent-self-onboarding.md`
- **Content:**
  - **Overview:** How autonomous agents discover and join Satnam.
  - **Discovery Methods:**
    - `.well-known/satnam-agents` endpoint.
    - Nostr `kind 31990` platform event.
    - Direct API documentation URL.
  - **Step-by-Step Onboarding:**
    1. Fetch `.well-known/satnam-agents.json`.
    2. Parse fee schedule and free tier availability.
    3. Generate Nostr keypair (example code in JavaScript/Python).
    4. Authenticate (NIP-07 browser extension, NIP-46 remote signer, or NIP-05/password).
    5. Call `create-agent-with-fees` with appropriate payload.
    6. Receive agent credentials and begin operations.
  - **Example Code:**
    - JavaScript/TypeScript example using `nostr-tools`.
    - Python example using `python-nostr`.
    - LLM-friendly pseudocode for function-calling agents.
  - **Fallback Paths:**
    - What to do when free tier is exhausted.
    - How to request human sponsorship or referral codes.
    - External Lightning faucets and Cashu mints for bootstrapping.
  - **OpenAPI Integration:**
    - How LLM-based agents can load the OpenAPI spec and auto-generate API clients.

#### 4.9.6 Future Compatibility Considerations

- **Note in documentation** (not necessarily implemented in Phase 4):
  - Compatibility with emerging agent standards:
    - **Agent Protocol** (https://agentprotocol.ai/) – standardized task/step APIs.
    - **Anthropic Model Context Protocol (MCP)** – context and tool discovery.
    - **`ai.txt`** or similar machine-readable capability files.
  - Satnam's `.well-known` endpoint and OpenAPI spec are designed to be forward-compatible
    with these standards as they mature.

**Verification Steps:**

- [ ] `.well-known/satnam-agents` endpoint returns valid JSON with all required fields.
- [ ] `free_tier.slots_remaining` accurately reflects current free tier usage from database.
- [ ] OpenAPI spec validates against OpenAPI 3.x schema and covers all agent-facing endpoints.
- [ ] Nostr `kind 31990` platform event is published to configured relays and discoverable
      via tag queries (`#t=ai-agent-platform`).
- [ ] An autonomous agent (simulated or real LLM-based) can:
  - Discover the platform via `.well-known` or Nostr.
  - Parse the OpenAPI spec.
  - Generate a Nostr keypair.
  - Successfully call `create-agent-with-fees` and receive valid credentials.
- [ ] Documentation in `docs/agent-self-onboarding.md` is complete with working code examples.
- [ ] Free tier bootstrap path works without payment proof when slots remain.
- [ ] Funded path is clearly documented with external funding options when free tier exhausted.

---

### Task 4.10: API Monetization via L402 (Lightning Enable as initial provider)

> **DEPENDENCIES:** Tasks 4.5 (Commerce Primitives), 4.8 (Federation mint / Lightning Faucet — for cost-side
> tracking), 4.9 (Agent Discovery — for L402 endpoint documentation in OpenAPI spec).
> **GOAL:** Enable Satnam to monetize its own agent-facing APIs via L402, using Lightning Enable
> as the initial provider, while keeping the integration provider-agnostic so alternative L402
> stacks (e.g., Aperture from Lightning Labs' Lightning Agent Tools) can be added later
> without schema changes.

**Use-Case Delineation (Lightning Faucet vs L402 Providers):**

| Use Case                                 | Provider / Layer                              | Rationale                                                                                  |
| ---------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Per-agent custodial wallets              | **Lightning Faucet only**                     | LF provides isolated, per-agent wallets with operator-controlled budgets                   |
| Agent-to-agent internal transfers        | **Lightning Faucet only**                     | LF's `transfer_between_agents` handles this natively                                       |
| Agent outbound payments (external APIs)  | **Lightning Faucet only**                     | Agents pay from their LF wallet via `pay_invoice` / `pay_l402_api`                         |
| Satnam API monetization (L402 gating)    | **L402 provider (initial: Lightning Enable)** | Gate Satnam APIs behind Lightning invoices; reference implementation uses Lightning Enable |
| Budget-constrained AI payment delegation | **L402 provider (initial: Lightning Enable)** | Per-request/per-session caps on spend via provider-managed budgets                         |
| Self-hosted L402 stack for operators     | **Optional: LAT / Aperture (future)**         | For self-hosted / ops-heavy deployments that want to run their own node + L402 stack       |
| Revenue/cost dashboard                   | **Both (LF + L402 provider)**                 | L402 provider reports inbound revenue; LF reports outbound costs; dashboard unifies        |
| Human user self-custodial payments       | **Neither** (NWC/existing)                    | Existing NWC infrastructure serves self-custodial human wallets                            |

_Note:_ For the initial Netlify/serverless deployment, Lightning Enable is the only L402 provider in scope. Lightning Labs' Lightning Agent Tools (LAT) / Aperture are treated as a future, self-hosted option evaluated in 4.10.6.

#### 4.10.1: L402 Provider Account Setup & Configuration (Reference: Lightning Enable)

- [ ] Create OpenNode account and complete KYB verification (2–4 business days)
- [ ] Select Lightning Enable plan tier (Standalone API $199/mo recommended for initial launch)
- [ ] Install LE MCP server: `pip install lightning-enable-mcp` (for operator-side testing)
- [ ] Pay 6,000 sats L402 upgrade to unlock L402 provider features
- [ ] Configure NWC connection between Lightning Enable and operator's wallet (CoinOS, LND, or Alby)
- [ ] Store provider credentials in Netlify environment variables (see Task 6.5)
- [ ] Verify basic `check_wallet_balance` and `pay_invoice` work end-to-end through the provider

**Estimated effort:** 1–2 days (mostly waiting on OpenNode KYB)

#### 4.10.2: L402 Endpoint Gating for Satnam APIs

- [ ] Identify initial set of agent-facing APIs to monetize:
  - `create-agent-with-fees` (paid tier — already has fee schedule)
  - `agent-attestation` verification endpoint
  - `credit-envelope` creation/validation endpoints
  - Agent analytics/reputation query endpoints
- [ ] Create `netlify/functions/middleware/l402-gate.ts` — reusable L402 verification middleware
- [ ] Integrate the L402 challenge/response flow from the configured provider
      _(Reference implementation: Lightning Enable)_:
  - On unauthenticated request: return `402 Payment Required` with Lightning invoice
  - On payment: provider verifies preimage, forwards request to backend
  - On success: return response + receipt
  - If a Cashu-backed pay-gate is enabled, support NUT-24-compatible `X-Cashu`
    challenges and NUT-18 payment request encoding for accepted mints / units / conditions
- [ ] Add L402 pricing tiers to existing fee schedule (align with `platform_fee_schedule` table)
- [ ] Update `/.well-known/satnam-agents` (Task 4.9) to advertise L402-gated endpoints
- [ ] Update `docs/openapi.yaml` (Task 4.9) with L402 security scheme and pricing annotations

**Estimated effort:** 3–5 days

#### 4.10.3: Revenue Tracking & Webhook Integration

- [ ] Create `netlify/functions/lightning-enable-webhook.ts` — L402 provider payment webhook handler
      _(initially wired to Lightning Enable/OpenNode; future providers reuse same handler shape or a sibling function)_
- [ ] Extend `platform_revenue` table for multi-source revenue tracking (already planned):

```sql
-- Lightning Enable / L402 revenue tracking
ALTER TABLE platform_revenue
  ADD COLUMN IF NOT EXISTS revenue_source TEXT DEFAULT 'direct'
    CHECK (revenue_source IN ('direct', 'lightning_faucet', 'lightning_enable', 'sig4sats')),
  ADD COLUMN IF NOT EXISTS le_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS le_invoice_id TEXT,
  ADD COLUMN IF NOT EXISTS caller_npub TEXT; -- Who paid (if Nostr-authenticated)
```

- [ ] Wire provider webhook events into existing monitoring/revenue dashboards
- [ ] Implement revenue reconciliation: provider webhook confirmations vs settlement records
- [ ] Add revenue source breakdown to operator analytics (Task 4.4 Agent Dashboard)

_Note:_ Initially, all L402-based revenue is tracked using `revenue_source = 'lightning_enable'`, even if additional providers are prototyped. If a second provider graduates beyond experiment status, we can extend the enum in a later migration.

**Estimated effort:** 2–3 days

#### 4.10.4: Optional MCP Dual-Server Compatibility (LF + L402 Provider)

- [ ] Document MCP dual-server setup as an **optional later integration** for agents using both LF (custody/budgets) + L402 provider (API monetization):

```json
{
  "mcpServers": {
    "lightning-wallet": {
      "command": "npx",
      "args": ["lightning-wallet-mcp"],
      "env": { "LIGHTNING_WALLET_API_KEY": "${agent_lf_key}" }
    },
    "lightning-enable": {
      "command": "python",
      "args": ["-m", "lightning_enable_mcp"],
      "env": {
        "LIGHTNING_ENABLE_NWC_URL": "${operator_nwc_url}",
        "LIGHTNING_ENABLE_BUDGET_SATS": "1000"
      }
    }
  }
}
```

- [ ] Add `mcp_server_configs` only if later tool-routing needs justify it
- [ ] Implement server selection logic only if MCP is actually adopted for wallet/API tool segregation
- [ ] Test that agents can use both MCP servers simultaneously without tool name conflicts

_Note:_ MCP is **not required** for core Satnam agent creation, federation governance, or current signing flows. If adopted later, it belongs as an orchestration / tool-routing layer rather than the core identity or federation-signing primitive.

**Estimated effort:** 1–2 days

#### 4.10.5: Unified Payment Dashboard (Revenue + Costs)

- [ ] Extend Agent Dashboard (Task 4.4) with "Economics" tab:
  - **Revenue** (from L402 provider, initially Lightning Enable): L402 payments received, by endpoint, by caller
  - **Costs** (from Lightning Faucet): Agent outbound payments, by agent, by destination
  - **Net position**: Revenue minus costs, per agent and platform-wide
- [ ] Add time-series charts for revenue/cost trends
- [ ] Add alerts for: revenue drops, cost spikes, net position going negative
- [ ] Integrate with existing monitoring (Task 6.3)

**Estimated effort:** 2–3 days

#### 4.10.6 (Optional): Evaluate Lightning Agent Tools / Aperture as Alternative L402 Provider

This subtask is explicitly optional and can be scheduled after the initial Lightning Enable integration is stable.

- [ ] Spin up a small, non-production LAT stack (Aperture + lnget + lnd) following Lightning Labs' recommended security tier for prototypes (e.g., Tier 2 with keys on disk, or Tier 3 read-only where applicable)
- [ ] Gate a single, low-risk Satnam API endpoint behind Aperture as an L402 reverse proxy, reusing the existing `l402-gate` middleware interface wherever possible
- [ ] Confirm that external agents using LAT's `lnget` client can successfully:
  - Discover the L402-gated endpoint
  - Receive and pay a 402 invoice
  - Reuse the resulting token for subsequent calls within budget constraints
- [ ] Pipe LAT/Aperture usage data into the existing `platform_revenue` and Unified Payment Dashboard flow (no new tables), even if initially tagged under the same `revenue_source = 'lightning_enable'`
- [ ] Document operational differences and trade-offs between:
  - Hosted L402 provider (Lightning Enable) for Netlify/serverless deployments
  - Self-hosted LAT/Aperture stack for advanced/self-hosted operators

**Estimated effort:** 3–5 days (R&D; can be postponed until after Phase 4 is otherwise complete)

**Task 4.10 Total Estimated Effort (excluding optional 4.10.6): 9–15 days**
**With 4.10.6 prototype:** 12–20 days

#### Task 4.10 Feature Flags

```env
# Lightning Enable / L402 Feature Flags
VITE_ENABLE_LIGHTNING_ENABLE=false       # Master toggle for all Lightning Enable features
VITE_ENABLE_API_MONETIZATION=false       # L402 gating on Satnam APIs
VITE_ENABLE_UNIFIED_ECONOMICS=false      # Revenue + cost dashboard

# L402 Provider Abstraction
L402_PROVIDER=lightning_enable           # lightning_enable (default) | aperture (future) | other
```

#### Task 4.10 Implementation Priority

| Priority | Subtask                    | Dependencies           | Effort   | Can Start After    |
| -------- | -------------------------- | ---------------------- | -------- | ------------------ |
| 1        | 4.10.1 (Account Setup)     | None (external)        | 1–2 days | Anytime            |
| 2        | 4.10.2 (L402 Gating)       | 4.10.1, Tasks 4.5, 4.9 | 3–5 days | Phase 4 complete   |
| 3        | 4.10.3 (Revenue Tracking)  | 4.10.2                 | 2–3 days | After 4.10.2       |
| 4        | 4.10.4 (MCP Dual-Server)   | 4.10.1, Task 4.8       | 1–2 days | After 4.8 + 4.10.1 |
| 5        | 4.10.5 (Unified Dashboard) | 4.10.3, Task 4.4       | 2–3 days | After 4.10.3       |
| 6        | 4.10.6 (LAT Prototype)     | 4.10.1–4.10.3          | 3–5 days | After 4.10.3       |

**Recommended rollout:**

1. Start 4.10.1 immediately (KYB takes 2–4 days, no code dependency)
2. Implement 4.10.2–4.10.3 after Task 4.8 and 4.9 are complete
3. 4.10.4 can be done in parallel with 4.10.2–4.10.3
4. 4.10.5 is last (needs both revenue and cost data flowing)
5. 4.10.6 can be scheduled later as an R&D thread once Lightning Enable is proven in production
6. Feature flag rollout: `API_MONETIZATION` first → `UNIFIED_ECONOMICS` after validation

#### Task 4.10 Success Criteria

- [ ] External agent can discover L402-gated endpoint via `.well-known/satnam-agents` or OpenAPI spec
- [ ] External agent can pay Lightning invoice and receive API response with valid receipt
- [ ] Revenue from L402 payments is tracked in `platform_revenue` with `revenue_source = 'lightning_enable'` for the initial provider
- [ ] Operator dashboard shows unified revenue (L402 provider) + costs (Lightning Faucet) view
- [ ] All Lightning Enable functionality is disabled when `VITE_ENABLE_LIGHTNING_ENABLE=false`
- [ ] Existing Lightning Faucet functionality (Task 4.8) is completely unaffected
- [ ] Optional LAT/Aperture prototype can be turned off independently without impacting the core L402 provider path

---

### Task 4.11: Agent & Human Creator Control Board

> **DEPENDENCIES:** Tasks 3.3 (Work History), 3.4 (Task Completion & Sig4Sats), 3.8 (Reputation
> & Trust Infrastructure), 4.1 (Agent Dashboard), 4.4 (Agent Creation Wizard & Management
> Dashboard), 4.8 (Federation mint + Lightning Faucet custody), 4.10.5 (Unified Payment Dashboard).
> **GOAL:** Extend the existing sovereignty, privacy, and financial dashboards so that both
> **agents** and their **human creators** have a first-class control board for economic,
> reputational, and autonomy configuration, without introducing any global "admin" role.

This task **does not create a new dashboard stack**. Instead, it composes and extends the
existing Agent Dashboard (Task 4.1), Agent Management Dashboard (Task 4.4.4), unified payment
dashboard (Task 4.10.5), and family/sovereignty dashboards into two focused views:

- An **Agent View Dashboard** for a single agent (Master Context role `adult` or `offspring`).
- A **Human Creator Dashboard** for a human in roles `steward`/`guardian` overseeing one or
  more agents.

#### 4.11.1: Agent View Dashboard (Per-Agent Control Board)

**Files:**

- `src/components/agents/AgentControlBoard.tsx`
- `netlify/functions/agents/get-agent-control-board.ts`

**Backend Aggregation:**

- [ ] Extend or wrap `get-agent-dashboard` / `get-management-dashboard` with a new
      `get-agent-control-board` function that returns a **single, consolidated payload** for
      one agent, including:
  - Inbound revenue (from Lightning Enable):
    - Total sats earned by this agent from L402-gated endpoints.
    - Breakdown by endpoint (e.g. `agent-attestation`, `credit-envelope`).
  - Outbound costs (from Lightning Faucet + platform fees):
    - Payments this agent made via LF (`get_agent_analytics`).
    - Platform fees paid (from `platform_revenue` with `actor_type = 'agent'`).
  - Net position:
    - `net_position_sats = total_revenue_sats - total_costs_sats`.
    - Rolling 7/30/90-day profitability trend.
  - Token balances:
    - Blind tokens for DMs, events, tasks (`agent_blind_tokens` aggregates).
  - Performance bond status:
    - Current bonded amount, released vs slashed history (`performance_bonds`).
  - Reputation & attestations:
    - `reputation_score`, `total_tasks_completed`, recent attestations from Task 3.8.
  - Autonomy configuration snapshot:
    - Spending limits, escalation rules, allowed protocols (from Autonomy Config in Task 3.9).

**Frontend Composition:**

- [ ] Implement `AgentControlBoard` as a **wrapper view** that embeds existing components:
  - Agent economic summary from `AgentDashboard` (Task 4.1).
  - Reputation & task history from Work History UI (Phase 3).
  - Token balances and blind token usage graphs.
  - Autonomy configuration panel (read-only for agents; editable for human creators).
- [ ] Ensure **no new role type** is introduced; agent accounts continue to use
      the existing platform role family together with `is_agent = true`.
- [ ] Respect privacy-first constraints: the control board never reveals other agents' data,
      even when showing benchmarks (use anonymized aggregates only).

#### 4.11.2: Human Creator Dashboard (Multi-Agent Portfolio View)

**Files:**

- `src/components/agents/HumanCreatorControlBoard.tsx`
- `netlify/functions/agents/get-creator-control-board.ts`

**Backend Aggregation:**

- [ ] Implement `get-creator-control-board` that **reuses** the
      `get-management-dashboard` aggregation but adds:
  - Portfolio metrics for all agents where `created_by_user_id = auth.uid()`.
  - Aggregated revenue/cost metrics across all owned agents, wired into the
    unified economics pipeline from Task 4.10.5.
  - Per-agent net position and contribution to overall portfolio P&L.
  - Pending approval queue:
    - Actions requiring human authorization based on each agent's Autonomy Config
      (Task 3.9), e.g. payments above a per-task or per-day threshold.
  - Budget & limit controls:
    - Ability to adjust per-agent LF budget caps and per-session LE budgets for a
      given creator (subject to RLS and Master Context rules).

**Frontend Composition:**

- [ ] Extend `AgentManagementDashboard` (Task 4.4.4) to surface a **Creator Portfolio** tab
      that is only visible for human users with roles `'steward' | 'guardian'`.
- [ ] List all managed agents with key economic/reputation indicators:
  - Current net position, monthly revenue/costs, reputation score, bond status.
  - Lifecycle state (active, suspended, deactivated).
- [ ] Provide an approval queue panel for actions awaiting human confirmation, with
      clear context and one-click approval/deny.
- [ ] Provide per-agent budget sliders/inputs for LF and LE spending limits, with
      guard rails and Master Context-compliant copy.
- [ ] Add an **alert configuration panel** so creators can set thresholds for
      low balances, unusual spend spikes, or sudden reputation drops and map these to
      the existing monitoring/notification flows defined in "Operations & Monitoring".

#### 4.11.3: Integration & Role Compliance

- [ ] Ensure **Master Context** compliance throughout:
  - Agents are treated as `'adult'` or `'offspring'` roles only.
  - Humans operating the control board are `'steward'` or `'guardian'` roles.
  - No `admin` role is introduced; global overreach remains impossible.
- [ ] Reuse existing sovereignty/privacy dashboards instead of creating copies:
  - Embed the existing financial/sovereignty dashboards in contextual tabs.
  - Share chart components and data-fetch hooks across dashboards.
- [ ] Respect existing RLS policies:
  - Agent view only queries a single agent's records.
  - Human creator view only queries agents with `created_by_user_id = auth.uid()`.

#### 4.11.4: Feature Flags & Success Criteria

**Environment Flags (extend Task 6.1):**

- `VITE_ENABLE_AGENT_CONTROL_BOARD=false` — toggles per-agent control board UI.
- `VITE_ENABLE_CREATOR_CONTROL_BOARD=false` — toggles human creator portfolio view.

**Success Criteria:**

- [ ] Agents can see a unified view of their own revenue, costs, bonds, reputation,
      and autonomy config without navigating multiple dashboards.
- [ ] Human creators can see an aggregated portfolio view of all agents they manage
      and adjust budgets/limits within allowed ranges.
- [ ] Approval queues correctly surface actions that require human confirmation and
      enforce decisions consistently across LF and LE payment flows.
- [ ] No new role types are added, and no global control panel for "all agents" exists.
- [ ] All new queries pass RLS enforcement and do not leak cross-tenant data.

---

## Phase 5: Testing & Integration

### Task 5.1: End-to-End Monetization Tests

**File:** `tests/monetization/platform-fees.test.ts`

```typescript
const FREE_TIER_LIMIT = 210; // mirrors process.env.FREE_TIER_LIMIT in real config

describe("Platform Monetization", () => {
  describe("Free Tier", () => {
    it("should allow first FREE_TIER_LIMIT agents free account creation", async () => {
      for (let i = 1; i <= FREE_TIER_LIMIT; i++) {
        // Master Context compliant: agent_role maps to 'adult' (parent agent)
        const response = await createAgent({
          agent_username: `agent-free-${i}`,
          agent_role: "adult",
        });

        expect(response.free_tier_used).toBe(true);
        expect(response.allocation_number).toBe(i);
      }
    });

    it("should require payment for agent after FREE_TIER_LIMIT", async () => {
      const response = await createAgent({
        agent_username: `agent-paid-${FREE_TIER_LIMIT + 1}`,
        agent_role: "adult",
      });

      expect(response.status).toBe(402);
      expect(response.error).toContain("Account creation fee required");
      expect(response.fee_sats).toBe(1000);
    });
  });

  describe("Blind Tokens", () => {
    it("should purchase and redeem event posting tokens", async () => {
      const tokenManager = new BlindTokenManager();

      // Purchase 5 tokens
      const tokens = await tokenManager.purchaseTokens(
        agentId,
        "agent_status_event",
        5,
        await generatePaymentProof(105), // 5 * 21 sats
      );

      expect(tokens.length).toBe(5);
      expect(tokenManager.getBalance("agent_status_event")).toBe(5);

      // Redeem one token
      const result = await tokenManager.redeemToken("agent_status_event", {
        kind: 1,
        content: "Test event",
        tags: [],
      });

      expect(result.token_valid).toBe(true);
      expect(tokenManager.getBalance("agent_status_event")).toBe(4);
    });

    it("should prevent double-spend of blind tokens", async () => {
      const tokenManager = new BlindTokenManager();
      const tokens = await tokenManager.purchaseTokens(
        agentId,
        "agent_status_event",
        1,
        paymentProof,
      );

      // First redemption succeeds
      await tokenManager.redeemToken("agent_status_event", eventPayload);

      // Second redemption with same token fails
      await expect(
        fetch("/api/agents/redeem-blind-token", {
          method: "POST",
          body: JSON.stringify({
            unblinded_token: tokens[0].unblindedToken,
            signature_proof: tokens[0].unblindedSignature,
          }),
        }),
      ).rejects.toThrow("Token already redeemed");
    });
  });

  describe("Action Fees", () => {
    const testCases = [
      { action: "agent_status_event", fee: 21 },
      { action: "agent_task_record_create", fee: 150 },
      { action: "agent_contact_add", fee: 50 },
      { action: "agent_dm_bundle", fee: 21 },
    ];

    testCases.forEach(({ action, fee }) => {
      it(`should charge ${fee} sats for ${action}`, async () => {
        const response = await fetch(`/api/platform/charge-fee`, {
          method: "POST",
          body: JSON.stringify({
            agent_id: agentId,
            action_type: action,
          }),
        });

        const result = await response.json();
        expect(result.fee_sats).toBe(fee);
        expect(result.payment_invoice).toBeDefined();
      });
    });
  });

  describe("Revenue Tracking", () => {
    it("should track all platform fees in revenue table", async () => {
      // Perform various paid actions
      await publishEvent(agentId, await generatePaymentProof(100));
      await createTask(agentId, await generatePaymentProof(150));
      await addContact(agentId, await generatePaymentProof(50));

      // Check revenue table
      const { data: revenue } = await supabase
        .from("platform_revenue")
        .select("*")
        .eq("payer_agent_id", agentId)
        .eq("payment_status", "paid");

      expect(revenue.length).toBe(3);
      expect(revenue.reduce((sum, r) => sum + r.fee_sats, 0)).toBe(300);
    });
  });
});
```

**Verification Steps:**

- [ ] Free tier works for first 210 agents (or configured limit)
- [ ] Next agent after free tier requires payment
- [ ] Blind tokens purchase/redeem correctly
- [ ] Double-spend prevented
- [ ] All action fees charged correctly
- [ ] Revenue tracked accurately

---

### Task 5.2: Nostr Service Discovery & Referral System Tests

> **DEPENDENCIES:** Requires completion of Tasks 3.8, 4.5, 4.6, and 4.7.
> **GOAL:** Ensure Nostr-based service discovery, referral flows, and LNbits
> Split Payments behave correctly and respect privacy, trust, and economic
> constraints.

**File:** `tests/agents/nostr-service-discovery.test.ts`

```typescript
describe("Nostr service discovery", () => {
  it("lists only database-backed offers when source='db'", async () => {
    // TODO: Implement test harness around list-services.ts
  });

  it("lists only Nostr offers when source='nostr'", async () => {
    // TODO: Stub CEPS/relay responses for kind 31990 events
  });

  it("merges DB and Nostr offers without duplicates when source='both'", async () => {
    // TODO: Verify deduplication and enrichment logic
  });
});
```

**Scenarios:**

- [ ] `list-services.ts` with `source="db"` returns only database-backed offers.
- [ ] `list-services.ts` with `source="nostr"` fetches kind 31990 events from
      relays and maps to internal identities where possible.
- [ ] `list-services.ts` with `source="both"` merges DB and Nostr offers
      without duplicates.
- [ ] Only `visibility='public'` **and** `publish_to_nostr=TRUE` offers are
      published to Nostr relays.
- [ ] Private/federation-only offers never appear in Nostr queries.
- [ ] External Nostr offers (not mapped to internal identities) are clearly
      flagged in responses.
- [ ] Reputation and vouch data is enriched for mapped Nostr offers, but not
      for external offers.

**File:** `tests/agents/referral-system.test.ts`

```typescript
describe("Agent referral system", () => {
  it("links new agents to referrers when ?ref= is present", async () => {
    // TODO: Simulate Agent Creation Wizard with referral codes
  });

  it("respects reward windows, caps, and locked referrals", async () => {
    // TODO: Drive platform_revenue and agent_contracts to edge cases
  });
});
```

**Scenarios:**

- [ ] Creating an agent with valid `?ref=<code>` sets
      `referred_by_agent_id` and creates an `agent_referrals` row.
- [ ] Referral rewards respect the 90-day window and 10-contract cap.
- [ ] Referral rewards stop when `agent_referrals.locked = TRUE`.
- [ ] Creator revenue share (5%) is applied to all agent earnings
      perpetually.
- [ ] LNbits Split Payments are configured correctly on referral/agent
      creation (config IDs stored in
      `agent_referrals.lnbits_split_payment_id` and
      `agent_profiles.lnbits_creator_split_id`).
- [ ] Split payments are disabled when referral windows expire or caps are
      reached.
- [ ] Circular referral patterns (A→B→C→A) are detected and result in
      `agent_referrals.locked = TRUE`.
- [ ] Referral dashboard shows only the current user's referrals (no
      cross-tenant leakage).
- [ ] "Referred by" badges respect visibility rules (public/federation-only).
- [ ] Reputation events are created for referrers when referred agents
      complete valuable work.

**File:** `tests/agents/lnbits-split-payments.test.ts`

```typescript
describe("LNbits Split Payments integration", () => {
  it("creates split configs for new referrals and creators", async () => {
    // TODO: Mock lnbits-proxy.ts and assert correct API usage
  });

  it("applies multiple splits (referral + creator) correctly", async () => {
    // TODO: Verify effective percentages on sample payments
  });
});
```

**Scenarios:**

- [ ] Split payment config is created when a new referral is generated.
- [ ] Split payment config is created when a new agent is created (for
      creator share).
- [ ] Multiple splits (referral + creator) are chained or multi-split
      configured correctly so percentages match the specification.
- [ ] Splits are skipped gracefully when a recipient has no Lightning
      wallet.
- [ ] Splits are disabled when the LNbits Split Payments extension is
      unavailable (fallback to manual tracking in `agent_referral_rewards`).
- [ ] Split payment IDs are stored in the database for audit trail.
- [ ] Split percentages match specification (5% creator, 5–20% referrer
      depending on source).

---

### Task 5.3: Sig4Sats Integration Tests

**File:** `tests/sig4sats/atomic-cashu.test.ts`

```typescript
describe("Sig4Sats Integration", () => {
  describe("Event Signature Payment", () => {
    it("should lock Cashu token to event signature", async () => {
      const cashuToken = await generateCashuToken(1000); // 1000 sats

      const eventTemplate = {
        kind: 1,
        content: "Test event with Sig4Sats",
        tags: [["t", "test"]],
      };

      // Lock token to event template
      const { data: lock } = await supabase
        .from("sig4sats_locks")
        .insert({
          cashu_token: JSON.stringify(cashuToken),
          cashu_mint_url: cashuToken.mint,
          locked_amount_sats: 1000,
          event_template: eventTemplate,
          required_kind: 1,
          agent_id: agentId,
          status: "locked",
        })
        .select()
        .single();

      expect(lock.status).toBe("locked");

      // Publish event with valid signature
      const signedEvent = await publishNostrEvent({
        ...eventTemplate,
        sig4sats_payment_for_event: JSON.stringify(cashuToken),
      });

      expect(signedEvent.sig4sats_redeemed).toBe(true);
      expect(signedEvent.sig4sats_earned_sats).toBe(1000);

      // Verify lock redeemed
      const { data: updatedLock } = await supabase
        .from("sig4sats_locks")
        .select("status, settlement_event_id")
        .eq("id", lock.id)
        .single();

      expect(updatedLock.status).toBe("redeemed");
      expect(updatedLock.settlement_event_id).toBe(signedEvent.event_id);
    });

    it("should NOT redeem token for mismatched signature", async () => {
      const cashuToken = await generateCashuToken(1000);

      const eventTemplate = {
        kind: 1,
        content: "Expected content",
        tags: [],
      };

      const lock = await createSig4SatsLock(cashuToken, eventTemplate);

      // Publish event with DIFFERENT content
      const signedEvent = await publishNostrEvent({
        kind: 1,
        content: "Different content", // Doesn't match template
        tags: [],
        sig4sats_payment_for_event: JSON.stringify(cashuToken),
      });

      expect(signedEvent.sig4sats_redeemed).toBe(false);

      // Lock remains locked
      const { data: updatedLock } = await supabase
        .from("sig4sats_locks")
        .select("status")
        .eq("id", lock.id)
        .single();

      expect(updatedLock.status).toBe("locked");
    });
  });

  describe("Task Completion Bonus", () => {
    it("should pay Cashu bonus for completing bonded task", async () => {
      const taskBond = await generateCashuToken(5000); // 5000 sats bonus

      // Create task with Sig4Sats bond
      const task = await createTask({
        agent_id: agentId,
        task_title: "Test Task",
        sig4sats_task_bond: JSON.stringify(taskBond),
      });

      expect(task.sig4sats_bond_locked).toBe(true);

      // Complete task with valid signature
      const completion = await completeTask({
        task_id: task.task_id,
        actual_duration_seconds: 300,
        actual_cost_sats: 1000,
        completion_proof: { result: "success" },
        completion_event_signature: "valid_sig",
        completion_event: {
          kind: 30079,
          tags: [
            ["task_id", task.task_id],
            ["status", "completed"],
          ],
          // ... full signed event
        },
      });

      expect(completion.sig4sats_redeemed).toBe(true);
      expect(completion.sig4sats_bonus_sats).toBe(5000);

      // Verify agent received payment
      const { data: receipt } = await supabase
        .from("agent_payment_receipts")
        .select("*")
        .eq("agent_id", agentId)
        .eq("purpose", "sig4sats_task_completion_bonus")
        .single();

      expect(receipt.amount_sats).toBe(5000);
      expect(receipt.verified).toBe(true);
    });
  });

  describe("Credit Envelope Settlement Bonus", () => {
    it("should apply Sig4Sats bonus to reputation", async () => {
      const sig4satsToken = await generateCashuToken(3000);

      // Create envelope with Sig4Sats
      const envelope = await createCreditEnvelope({
        agent_id: agentId,
        scope: "test:compute",
        requested_amount_sats: 10000,
        sig4sats_token: JSON.stringify(sig4satsToken),
      });

      // Settle successfully with valid signature
      const settlement = await settleEnvelope({
        envelope_id: envelope.envelope_id,
        success: true,
        validation_tier: "peer_verified",
        settlement_event: {
          /* signed event */
        },
      });

      // Base reputation: 10000 / 1000 = 10
      // Validation weight: 1.0 (peer verified)
      // Sig4Sats bonus: 10 * 0.1 = 1
      // Total: (10 * 1.0) + 1 = 11
      expect(settlement.reputation_delta).toBe(11);
      expect(settlement.sig4sats_redeemed).toBe(true);
      expect(settlement.sig4sats_bonus_sats).toBe(3000);
    });
  });
});
```

**Verification Steps:**

- [ ] Cashu token locks to event signature
- [ ] Valid signature redeems token
- [ ] Invalid signature doesn't redeem
- [ ] Task completion bonus works
- [ ] Envelope settlement bonus applies
- [ ] Agent receives Sig4Sats payments

---

    ### Task 5.4: Agent Creation Wizard & Management Dashboard Tests

> **DEPENDENCIES:** Requires completion of Task 4.4 (all subtasks: 4.4.1, 4.4.2, 4.4.3, 4.4.4)
> **ESTIMATED EFFORT:** 6–8 hours
> **GOAL:** Comprehensive automated testing of the Agent Creation Wizard and Management Dashboard functionality, with emphasis on RLS policy enforcement, economic failure handling, and cross-tenant data isolation.

**File:** `tests/agents/wizard-and-dashboard.test.ts`

```typescript
import { createServerSupabaseClient } from "../../netlify/lib/supabase-server";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AgentCreationWizard } from "../../src/components/agents/AgentCreationWizard";
import { AgentManagementDashboard } from "../../src/components/agents/AgentManagementDashboard";

describe("Agent Creation Wizard & Management Dashboard", () => {
  let supabase: ReturnType<typeof createServerSupabaseClient>;
  let testUserA: { id: string; email: string };
  let testUserB: { id: string; email: string };

  beforeAll(async () => {
    supabase = createServerSupabaseClient();

    // Create two test users for cross-tenant isolation tests
    testUserA = await createTestUser("user-a@test.satnam.pub");
    testUserB = await createTestUser("user-b@test.satnam.pub");
  });

  afterAll(async () => {
    await cleanupTestUsers([testUserA.id, testUserB.id]);
  });

  // ========================================================================
  // WIZARD CREATION FLOWS
  // ========================================================================

  describe("Wizard Creation Flows", () => {
    it("should complete full 4-step wizard flow (Role → Vision → Mission → Value → Review)", async () => {
      const onAgentCreated = jest.fn();

      render(
        <AgentCreationWizard
          creatorUserId={testUserA.id}
          onAgentCreated={onAgentCreated}
        />
      );

      // Step 1: Role & Context
      expect(screen.getByText(/Role & Context/i)).toBeInTheDocument();
      fireEvent.click(screen.getByLabelText(/Adult Agent/i));
      fireEvent.click(screen.getByText(/Next/i));

      // Step 2: Vision
      await waitFor(() =>
        expect(screen.getByText(/Vision/i)).toBeInTheDocument()
      );
      fireEvent.change(screen.getByLabelText(/Vision Title/i), {
        target: { value: "Automate Bitcoin Education" },
      });
      fireEvent.change(screen.getByLabelText(/Vision Summary/i), {
        target: {
          value:
            "Create accessible Bitcoin learning content for global audiences",
        },
      });
      fireEvent.click(screen.getByText(/Next/i));

      // Step 3: Mission
      await waitFor(() =>
        expect(screen.getByText(/Mission/i)).toBeInTheDocument()
      );
      fireEvent.change(screen.getByLabelText(/Mission Summary/i), {
        target: {
          value:
            "Generate daily educational posts, answer questions, curate resources",
        },
      });
      fireEvent.click(screen.getByText(/Add Checklist Item/i));
      fireEvent.change(screen.getByLabelText(/Checklist Item 1/i), {
        target: { value: "Publish 3 educational posts per day" },
      });
      fireEvent.click(screen.getByText(/Next/i));

      // Step 4: Value Creation
      await waitFor(() =>
        expect(screen.getByText(/Value Creation/i)).toBeInTheDocument()
      );
      fireEvent.change(screen.getByLabelText(/Value Context/i), {
        target: {
          value:
            "Provide free, high-quality Bitcoin education to reduce misinformation",
        },
      });
      fireEvent.click(screen.getByText(/Add Constraint/i));
      fireEvent.change(screen.getByLabelText(/Constraint 1/i), {
        target: { value: "Never store user secrets or private keys" },
      });
      fireEvent.click(screen.getByText(/Add Success Metric/i));
      fireEvent.change(screen.getByLabelText(/Success Metric 1/i), {
        target: { value: "posts_published_count" },
      });
      fireEvent.click(screen.getByText(/Next/i));

      // Step 5: Review & Economic Summary
      await waitFor(() =>
        expect(screen.getByText(/Review & Submit/i)).toBeInTheDocument()
      );
      expect(
        screen.getByText(/Automate Bitcoin Education/i)
      ).toBeInTheDocument();
      expect(screen.getByText(/Free Tier: Available/i)).toBeInTheDocument();

      // Submit
      fireEvent.click(screen.getByText(/Create Agent/i));

      await waitFor(() => expect(onAgentCreated).toHaveBeenCalledTimes(1));

      const createdAgentId = onAgentCreated.mock.calls[0][0];
      expect(createdAgentId).toBeTruthy();

      // Verify intent was saved
      const { data: intent } = await supabase
        .from("agent_intent_configurations")
        .select("*")
        .eq("agent_id", createdAgentId)
        .single();

      expect(intent.vision_title).toBe("Automate Bitcoin Education");
      expect(intent.mission_summary).toContain("Generate daily educational");
      expect(intent.constraints).toContain(
        "Never store user secrets or private keys"
      );
      expect(intent.success_metrics).toContain("posts_published_count");
    });

    it("should validate intent payload structure (Vision/Mission/Value required)", async () => {
      const response = await fetch(
        "/.netlify/functions/agents/create-agent-with-fees",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agent_username: "test-agent-incomplete",
            agent_role: "adult",
            creator_type: "human",
            intent: {
              // Missing vision_title, vision_summary, mission_summary, value_context
            },
          }),
        }
      );

      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.message).toContain("vision_title is required");
    });

    it("should handle economic failure: free tier exhausted", async () => {
      // Exhaust free tier (210 agents)
      for (let i = 1; i <= 210; i++) {
        await createAgent({
          agent_username: `free-tier-${i}`,
          agent_role: "adult",
          creator_type: "human",
          created_by_user_id: testUserA.id,
        });
      }

      // 211th agent should fail with economic hint
      const response = await fetch(
        "/.netlify/functions/agents/create-agent-with-fees",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agent_username: "free-tier-211",
            agent_role: "adult",
            creator_type: "human",
            intent: validIntentPayload,
          }),
        }
      );

      expect(response.status).toBe(402);
      const error = await response.json();
      expect(error.economic_failure_hint).toBeDefined();
      expect(error.economic_failure_hint.reason).toBe("free_tier_exhausted");
      expect(error.economic_failure_hint.required_sats).toBe(1000); // Account creation fee
      expect(error.economic_failure_hint.suggested_action).toContain(
        "payment required"
      );
    });

    it("should handle economic failure: insufficient bond for agent tree size", async () => {
      // Create 10 agents for testUserA (triggers bond ladder)
      for (let i = 1; i <= 10; i++) {
        await createAgent({
          agent_username: `bonded-agent-${i}`,
          agent_role: "adult",
          creator_type: "human",
          created_by_user_id: testUserA.id,
        });
      }

      // 11th agent requires higher bond (per bond_requirements ladder)
      const response = await fetch(
        "/.netlify/functions/agents/create-agent-with-fees",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agent_username: "bonded-agent-11",
            agent_role: "adult",
            creator_type: "human",
            intent: validIntentPayload,
            // Missing bond payment proof
          }),
        }
      );

      expect(response.status).toBe(402);
      const error = await response.json();
      expect(error.economic_failure_hint.reason).toBe("insufficient_bond");
      expect(error.economic_failure_hint.required_bond_sats).toBeGreaterThan(
        0
      );
    });

    it("should enforce creator_type: only 'human' or 'agent' allowed", async () => {
      const response = await fetch(
        "/.netlify/functions/agents/create-agent-with-fees",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agent_username: "invalid-creator",
            agent_role: "adult",
            creator_type: "invalid_type", // Invalid
            intent: validIntentPayload,
          }),
        }
      );

      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.message).toContain("creator_type must be 'human' or 'agent'");
    });

    it("should enforce agent_role: only 'adult' or 'offspring' allowed (Master Context compliance)", async () => {
      const invalidRoles = ["admin", "steward", "guardian", "private"];

      for (const role of invalidRoles) {
        const response = await fetch(
          "/.netlify/functions/agents/create-agent-with-fees",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              agent_username: `agent-${role}`,
              agent_role: role, // Invalid for agents
              creator_type: "human",
              intent: validIntentPayload,
            }),
          }
        );

        expect(response.status).toBe(400);
        const error = await response.json();
        expect(error.message).toContain(
          "agent_role must be 'adult' or 'offspring'"
        );
      }
    });

    it("should reject intent fields containing nsec/secret keys", async () => {
      const maliciousIntent = {
        vision_title: "Test Agent",
        vision_summary: "My nsec is nsec1abc123...", // Contains nsec
        mission_summary: "Do stuff",
        value_context: "Create value",
      };

      const response = await fetch(
        "/.netlify/functions/agents/create-agent-with-fees",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agent_username: "malicious-agent",
            agent_role: "adult",
            creator_type: "human",
            intent: maliciousIntent,
          }),
        }
      );

      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.message).toContain("Intent fields must not contain secrets");
    });
  });

  // ========================================================================
  // MANAGEMENT DASHBOARD RLS BEHAVIOR
  // ========================================================================

  describe("Management Dashboard RLS Enforcement", () => {
    it("should show only agents created by the signed-in human (RLS policy)", async () => {
      // User A creates 3 agents
      const agentA1 = await createAgent({
        agent_username: "user-a-agent-1",
        agent_role: "adult",
        creator_type: "human",
        created_by_user_id: testUserA.id,
      });
      const agentA2 = await createAgent({
        agent_username: "user-a-agent-2",
        agent_role: "offspring",
        creator_type: "human",
        created_by_user_id: testUserA.id,
      });
      const agentA3 = await createAgent({
        agent_username: "user-a-agent-3",
        agent_role: "adult",
        creator_type: "human",
        created_by_user_id: testUserA.id,
      });

      // User B creates 2 agents
      const agentB1 = await createAgent({
        agent_username: "user-b-agent-1",
        agent_role: "adult",
        creator_type: "human",
        created_by_user_id: testUserB.id,
      });
      const agentB2 = await createAgent({
        agent_username: "user-b-agent-2",
        agent_role: "adult",
        creator_type: "human",
        created_by_user_id: testUserB.id,
      });

      // Fetch dashboard for User A
      const responseA = await fetch(
        "/.netlify/functions/agents/get-management-dashboard",
        {
          headers: {
            Authorization: `Bearer ${await getAuthToken(testUserA.id)}`,
          },
        }
      );

      expect(responseA.status).toBe(200);
      const dashboardA = await responseA.json();
      expect(dashboardA.agents.length).toBe(3);
      expect(dashboardA.agents.map((a) => a.id)).toEqual(
        expect.arrayContaining([agentA1.id, agentA2.id, agentA3.id])
      );
      expect(dashboardA.agents.map((a) => a.id)).not.toContain(agentB1.id);
      expect(dashboardA.agents.map((a) => a.id)).not.toContain(agentB2.id);

      // Fetch dashboard for User B
      const responseB = await fetch(
        "/.netlify/functions/agents/get-management-dashboard",
        {
          headers: {
            Authorization: `Bearer ${await getAuthToken(testUserB.id)}`,
          },
        }
      );

      expect(responseB.status).toBe(200);
      const dashboardB = await responseB.json();
      expect(dashboardB.agents.length).toBe(2);
      expect(dashboardB.agents.map((a) => a.id)).toEqual(
        expect.arrayContaining([agentB1.id, agentB2.id])
      );
      expect(dashboardB.agents.map((a) => a.id)).not.toContain(agentA1.id);
    });

    it("should show only self for agent callers (single-entry list)", async () => {
      // Create an agent
      const agent = await createAgent({
        agent_username: "self-managing-agent",
        agent_role: "adult",
        creator_type: "human",
        created_by_user_id: testUserA.id,
      });

      // Agent calls management dashboard as itself
      const response = await fetch(
        "/.netlify/functions/agents/get-management-dashboard",
        {
          headers: {
            Authorization: `Bearer ${await getAuthToken(agent.id)}`,
          },
        }
      );

      expect(response.status).toBe(200);
      const dashboard = await response.json();
      expect(dashboard.agents.length).toBe(1);
      expect(dashboard.agents[0].id).toBe(agent.id);
    });

    it("should prevent cross-tenant data leakage (User A cannot see User B's agents)", async () => {
      const agentB = await createAgent({
        agent_username: "user-b-private-agent",
        agent_role: "adult",
        creator_type: "human",
        created_by_user_id: testUserB.id,
      });

      // User A tries to fetch User B's agent intent directly
      const response = await fetch(
        `/.netlify/functions/agents/get-agent-intent?agent_id=${agentB.id}`,
        {
          headers: {
            Authorization: `Bearer ${await getAuthToken(testUserA.id)}`,
          },
        }
      );

      expect(response.status).toBe(404); // RLS blocks access
    });

    it("should allow intent CRUD only for agent or creator (RLS policy)", async () => {
      const agent = await createAgent({
        agent_username: "intent-test-agent",
        agent_role: "adult",
        creator_type: "human",
        created_by_user_id: testUserA.id,
        intent: {
          vision_title: "Original Vision",
          vision_summary: "Original summary",
          mission_summary: "Original mission",
          value_context: "Original value",
        },
      });

      // Creator (User A) can read intent
      const readResponse = await fetch(
        `/.netlify/functions/agents/get-agent-intent?agent_id=${agent.id}`,
        {
          headers: {
            Authorization: `Bearer ${await getAuthToken(testUserA.id)}`,
          },
        }
      );
      expect(readResponse.status).toBe(200);
      const intent = await readResponse.json();
      expect(intent.vision_title).toBe("Original Vision");

      // Creator (User A) can update intent
      const updateResponse = await fetch(
        "/.netlify/functions/agents/upsert-agent-intent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${await getAuthToken(testUserA.id)}`,
          },
          body: JSON.stringify({
            agent_id: agent.id,
            intent: {
              vision_title: "Updated Vision",
              vision_summary: "Updated summary",
              mission_summary: "Updated mission",
              value_context: "Updated value",
            },
          }),
        }
      );
      expect(updateResponse.status).toBe(200);

      // Verify update persisted
      const { data: updatedIntent } = await supabase
        .from("agent_intent_configurations")
        .select("vision_title")
        .eq("agent_id", agent.id)
        .single();
      expect(updatedIntent.vision_title).toBe("Updated Vision");

      // User B (not creator) CANNOT read or update
      const unauthorizedRead = await fetch(
        `/.netlify/functions/agents/get-agent-intent?agent_id=${agent.id}`,
        {
          headers: {
            Authorization: `Bearer ${await getAuthToken(testUserB.id)}`,
          },
        }
      );
      expect(unauthorizedRead.status).toBe(404); // RLS blocks
    });

    it("should return correct ManagedAgentSummary[] structure from dashboard endpoint", async () => {
      const agent = await createAgent({
        agent_username: "summary-test-agent",
        agent_role: "adult",
        creator_type: "human",
        created_by_user_id: testUserA.id,
        intent: {
          vision_title: "Test Vision",
          vision_summary: "Test summary",
          mission_summary: "Test mission",
          value_context: "Test value",
        },
      });

      const response = await fetch(
        "/.netlify/functions/agents/get-management-dashboard",
        {
          headers: {
            Authorization: `Bearer ${await getAuthToken(testUserA.id)}`,
          },
        }
      );

      expect(response.status).toBe(200);
      const dashboard = await response.json();
      const summary = dashboard.agents.find((a) => a.id === agent.id);

      expect(summary).toMatchObject({
        id: agent.id,
        unified_address: expect.any(String),
        agent_role: "adult",
        lifecycle_state: expect.any(String),
        reputation_score: expect.any(Number),
        free_tier_claimed: expect.any(Boolean),
        intent_vision_title: "Test Vision",
        intent_mission_summary: "Test mission",
      });
    });
  });

  // ========================================================================
  // INTEGRATION WITH EXISTING SYSTEMS
  // ========================================================================

  describe("Integration with Existing Systems", () => {
    it("should track free tier allocation in wizard creation", async () => {
      const agent = await createAgent({
        agent_username: "free-tier-tracking-agent",
        agent_role: "adult",
        creator_type: "human",
        created_by_user_id: testUserA.id,
      });

      const { data: profile } = await supabase
        .from("agent_profiles")
        .select("free_tier_claimed, free_tier_allocation_number")
        .eq("user_identity_id", agent.id)
        .single();

      expect(profile.free_tier_claimed).toBe(true);
      expect(profile.free_tier_allocation_number).toBeGreaterThan(0);
      expect(profile.free_tier_allocation_number).toBeLessThanOrEqual(210);
    });

    it("should enforce bond ladder during creation (agent tree size thresholds)", async () => {
      // Create 5 agents (below bond threshold)
      for (let i = 1; i <= 5; i++) {
        await createAgent({
          agent_username: `bond-ladder-${i}`,
          agent_role: "adult",
          creator_type: "human",
          created_by_user_id: testUserA.id,
        });
      }

      // 6th agent triggers bond requirement
      const response = await fetch(
        "/.netlify/functions/agents/create-agent-with-fees",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agent_username: "bond-ladder-6",
            agent_role: "adult",
            creator_type: "human",
            intent: validIntentPayload,
            // No bond payment provided
          }),
        }
      );

      expect(response.status).toBe(402);
      const error = await response.json();
      expect(error.economic_failure_hint.required_bond_sats).toBeGreaterThan(
        0
      );
    });

    it("should transition lifecycle states correctly (PENDING_IDENTITY → PENDING_BOND → ACTIVE)", async () => {
      // Create agent with all requirements met
      const agent = await createAgent({
        agent_username: "lifecycle-test-agent",
        agent_role: "adult",
        creator_type: "human",
        created_by_user_id: testUserA.id,
        intent: validIntentPayload,
        payment_proof: validPaymentProof,
        bond_proof: validBondProof,
      });

      const { data: profile } = await supabase
        .from("agent_profiles")
        .select("lifecycle_state")
        .eq("user_identity_id", agent.id)
        .single();

      expect(profile.lifecycle_state).toBe("ACTIVE");
    });

    it("should create audit trail in agent_creation_audit table", async () => {
      const agent = await createAgent({
        agent_username: "audit-trail-agent",
        agent_role: "adult",
        creator_type: "human",
        created_by_user_id: testUserA.id,
        intent: validIntentPayload,
      });

      const { data: audit } = await supabase
        .from("agent_creation_audit")
        .select("*")
        .eq("agent_id", agent.id)
        .single();

      expect(audit).toMatchObject({
        agent_id: agent.id,
        created_by_user_id: testUserA.id,
        creator_type: "human",
        creation_channel: "wizard",
        agent_role: "adult",
        free_tier_used: expect.any(Boolean),
        intent_snapshot: expect.objectContaining({
          vision_title: validIntentPayload.vision_title,
        }),
      });
    });
  });
});

// ========================================================================
// TEST HELPERS
// ========================================================================

const validIntentPayload = {
  vision_title: "Test Agent Vision",
  vision_summary: "A test agent for automated testing",
  mission_summary: "Execute test scenarios reliably",
  value_context: "Ensure platform quality through comprehensive testing",
  constraints: ["read-only operations", "no external API calls"],
  success_metrics: ["tests_passed", "coverage_percentage"],
};

async function createTestUser(email: string) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: "test-password-123",
    email_confirm: true,
  });
  if (error) throw error;
  return { id: data.user.id, email };
}

async function cleanupTestUsers(userIds: string[]) {
  for (const userId of userIds) {
    await supabase.auth.admin.deleteUser(userId);
  }
}

async function createAgent(params: any) {
  const response = await fetch(
    "/.netlify/functions/agents/create-agent-with-fees",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    }
  );
  if (!response.ok) throw new Error(`Agent creation failed: ${response.status}`);
  return await response.json();
}

async function getAuthToken(userId: string): Promise<string> {
  // Mock JWT token generation for testing
  return `test-token-${userId}`;
}
```

**Verification Steps:**

- [ ] All wizard flow tests pass (4-step creation with intent validation)
- [ ] Economic failure tests correctly surface hints (free tier, bonds, tokens)
- [ ] Creator type enforcement prevents invalid values
- [ ] Agent role validation allows only the existing platform role family (Master Context compliance)
- [ ] Nsec/secret validation rejects malicious intent payloads
- [ ] RLS policies enforce creator-only access to managed agents
- [ ] Cross-tenant isolation verified (User A cannot see User B's data)
- [ ] Intent CRUD operations respect RLS (get/upsert)
- [ ] Management dashboard returns correct `ManagedAgentSummary[]` structure
- [ ] Free tier allocation tracked correctly in wizard
- [ ] Bond ladder enforcement triggers at correct thresholds
- [ ] Lifecycle state transitions work (PENDING_IDENTITY → ACTIVE)
- [ ] Audit trail created in `agent_creation_audit` for all creations

**Acceptance Criteria:**

✅ All test scenarios pass
✅ RLS policies verified to prevent unauthorized access
✅ Wizard flow completes successfully with valid intent payload
✅ Economic failure hints surface correctly with actionable guidance
✅ No cross-tenant data leakage in any scenario
✅ Master Context role compliance enforced (no 'admin' or invalid roles)
✅ Zero-knowledge principles maintained (no nsec in intent fields)

---

### Task 5.5: Lightning Faucet Custody & Bridge Tests

> **DEPENDENCIES:** Wallet & Custody Architecture section, Tasks 2.2, 4.1–4.8.
> **GOAL:** Verify that `wallet_custody_type` is set correctly, LF-backed agent
> flows behave as expected, and the LNbits ↔ Lightning Faucet bridge is robust
> under normal and failure conditions.

**File:** `tests/agents/lightning-faucet-custody.test.ts`

```typescript
describe("Lightning Faucet custody & bridge", () => {
  it("creates self-custodial agents by default for human creators", async () => {
    // TODO: Call create-agent-with-fees with creator_type="human" and assert
    // agent_profiles.wallet_custody_type = 'self_custodial'.
  });

  it("creates LF-backed wallets for agent-created agents", async () => {
    // TODO: Call create-agent-with-fees with creator_type="agent" and assert
    // wallet_custody_type = 'lightning_faucet' and encrypted agent key set.
  });

  it("routes payments correctly through LNbits ↔ Lightning Faucet bridge", async () => {
    // TODO: Simulate incoming payments to an LF-backed agent address and verify
    // Lightning Faucet balance updates via mocked API.
  });

  it("enforces operational budgets and handles LF outages gracefully", async () => {
    // TODO: Simulate LF API failures and ensure safe, explicit errors without
    // double-charging or silent fund loss.
  });
});
```

**Scenarios:**

- [ ] Human-created agents have `wallet_custody_type = 'self_custodial'` by default.
- [ ] Agent-created agents have `wallet_custody_type = 'lightning_faucet'` and a
      non-null encrypted `lightning_faucet_agent_key_encrypted`.
- [ ] Optional `wallet_custody_type = 'lnbits_proxy'` path is available only when
      explicitly selected by a human creator.
- [ ] LNbits ↔ Lightning Faucet bridge delivers payments to LF wallets and
      records corresponding receipts.
- [ ] When LF API is degraded or unreachable, agent creation and payments fail
      safely with clear error messages and no inconsistent state.
- [ ] Monitoring hooks for LF health and budget anomalies emit logs/metrics that
      Phase 6 runbooks can consume.

---

### Task 5.6: Agent Discovery & Self-Onboarding Tests

> **DEPENDENCIES:** Tasks 4.9, 4.5 (Nostr service discovery), 4.1 (agent creation).
> **GOAL:** Verify that autonomous agents can discover the platform via machine-readable
> endpoints and successfully complete self-onboarding without human intervention.

**File:** `tests/agents/autonomous-discovery.test.ts`

```typescript
describe("Autonomous Agent Discovery & Self-Onboarding", () => {
  describe("Well-Known Endpoint", () => {
    it("returns valid JSON with all required discovery fields", async () => {
      const response = await fetch("/.well-known/satnam-agents");
      expect(response.status).toBe(200);

      const discovery = await response.json();

      expect(discovery).toMatchObject({
        platform: "Satnam",
        version: expect.any(String),
        api_base_url: expect.stringMatching(/^https?:\/\//),
        authentication_methods: expect.arrayContaining([
          "NIP-07",
          "NIP-05/password",
        ]),
        fee_schedule: {
          account_creation_sats: expect.any(Number),
          bond_tiers: expect.any(Array),
          per_action_fees_sats: expect.any(Object),
        },
        free_tier: {
          enabled: expect.any(Boolean),
          total_slots: 210,
          slots_remaining: expect.any(Number),
        },
        payment_protocols: expect.arrayContaining(["lightning"]),
        links: {
          openapi_spec: expect.stringMatching(/openapi\.yaml$/),
          terms_of_service: expect.any(String),
          privacy_policy: expect.any(String),
        },
        nostr: {
          platform_npub: expect.stringMatching(/^npub1/),
          relays: expect.any(Array),
        },
      });
    });

    it("accurately reflects current free tier usage", async () => {
      // Create test agents to consume free tier slots
      const initialResponse = await fetch("/.well-known/satnam-agents");
      const initialDiscovery = await initialResponse.json();
      const initialSlots = initialDiscovery.free_tier.slots_remaining;

      // Create one agent
      await createAgent({
        agent_username: "free-tier-test-agent",
        agent_role: "adult",
        creator_type: "human",
      });

      // Check slots decreased
      const updatedResponse = await fetch("/.well-known/satnam-agents");
      const updatedDiscovery = await updatedResponse.json();

      expect(updatedDiscovery.free_tier.slots_remaining).toBe(initialSlots - 1);
    });
  });

  describe("OpenAPI Specification", () => {
    it("serves valid OpenAPI 3.x spec", async () => {
      const response = await fetch("/api/openapi.yaml");
      expect(response.status).toBe(200);

      const specText = await response.text();
      const spec = yaml.parse(specText);

      expect(spec.openapi).toMatch(/^3\.\d+\.\d+$/);
      expect(spec.info.title).toBe("Satnam AI Agent Platform API");
      expect(spec.paths).toBeDefined();
    });

    it("documents all agent-facing endpoints", async () => {
      const response = await fetch("/api/openapi.yaml");
      const spec = yaml.parse(await response.text());

      const requiredPaths = [
        "/agents/create-agent-with-fees",
        "/agents/publish-nostr-event",
        "/agents/send-encrypted-dm",
        "/agents/list-services",
        "/tokens/issue",
        "/tokens/redeem",
      ];

      for (const path of requiredPaths) {
        expect(spec.paths[path]).toBeDefined();
      }
    });
  });

  describe("Nostr Platform Discovery", () => {
    it("publishes kind 31990 platform event to relays", async () => {
      const relay = await connectToRelay("wss://relay.satnam.pub");

      const events = await relay.list([
        {
          kinds: [31990],
          "#d": ["satnam-platform"],
          limit: 1,
        },
      ]);

      expect(events.length).toBe(1);
      const platformEvent = events[0];

      expect(platformEvent.kind).toBe(31990);
      expect(platformEvent.tags).toContainEqual(["d", "satnam-platform"]);
      expect(platformEvent.tags).toContainEqual(["t", "ai-agent-platform"]);

      const urlTag = platformEvent.tags.find((t) => t[0] === "url");
      expect(urlTag[1]).toMatch(/satnam\.pub/);

      const wellKnownTag = platformEvent.tags.find(
        (t) => t[0] === "well-known",
      );
      expect(wellKnownTag[1]).toContain("/.well-known/satnam-agents");
    });

    it("is discoverable via tag queries", async () => {
      const relay = await connectToRelay("wss://relay.satnam.pub");

      const events = await relay.list([
        {
          kinds: [31990],
          "#t": ["ai-agent-platform"],
          limit: 10,
        },
      ]);

      const satnamEvent = events.find((e) =>
        e.tags.some((t) => t[0] === "d" && t[1] === "satnam-platform"),
      );

      expect(satnamEvent).toBeDefined();
    });
  });

  describe("Autonomous Self-Onboarding Flow", () => {
    it("allows agent to discover, generate keys, and register (free tier)", async () => {
      // Step 1: Discovery
      const discoveryResponse = await fetch("/.well-known/satnam-agents");
      const discovery = await discoveryResponse.json();

      expect(discovery.free_tier.slots_remaining).toBeGreaterThan(0);

      // Step 2: Generate Nostr keypair
      const { privateKey, publicKey } = generateNostrKeypair();
      const npub = nip19.npubEncode(publicKey);

      // Step 3: Self-register with free tier
      const agentResponse = await fetch(
        `${discovery.api_base_url}/agents/create-agent-with-fees`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            agent_username: `autonomous-agent-${Date.now()}`,
            agent_role: "adult",
            creator_type: "autonomous",
            nostr_pubkey: npub,
            payment_proof: null, // Free tier
            intent: {
              vision_title: "Autonomous Discovery Test",
              vision_summary: "Testing self-onboarding flow",
              mission_summary: "Validate discovery mechanisms",
            },
          }),
        },
      );

      expect(agentResponse.status).toBe(201);
      const agent = await agentResponse.json();

      expect(agent.user_identity_id).toBeDefined();
      expect(agent.agent_username).toMatch(/^autonomous-agent-/);
      expect(agent.free_tier_used).toBe(true);
    });

    it("provides clear guidance when free tier exhausted", async () => {
      // Mock scenario where free tier is full
      const discovery = await (
        await fetch("/.well-known/satnam-agents")
      ).json();

      if (discovery.free_tier.slots_remaining === 0) {
        const { privateKey, publicKey } = generateNostrKeypair();
        const npub = nip19.npubEncode(publicKey);

        const agentResponse = await fetch(
          `${discovery.api_base_url}/agents/create-agent-with-fees`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              agent_username: "no-free-tier-agent",
              agent_role: "adult",
              creator_type: "autonomous",
              nostr_pubkey: npub,
              payment_proof: null,
            }),
          },
        );

        expect(agentResponse.status).toBe(402);
        const error = await agentResponse.json();

        expect(error.error).toContain("Account creation fee required");
        expect(error.fee_sats).toBe(
          discovery.fee_schedule.account_creation_sats,
        );
        expect(error.payment_options).toContain("lightning");
      }
    });
  });

  describe("LLM Agent Integration", () => {
    it("OpenAPI spec is parseable by LLM function-calling systems", async () => {
      const spec = await (await fetch("/api/openapi.yaml")).text();
      const parsed = yaml.parse(spec);

      // Verify structure matches what LLMs expect for function calling
      const createAgentOp = parsed.paths["/agents/create-agent-with-fees"].post;

      expect(createAgentOp.operationId).toBeDefined();
      expect(createAgentOp.summary).toBeDefined();
      expect(
        createAgentOp.requestBody.content["application/json"].schema,
      ).toBeDefined();
      expect(createAgentOp.responses["201"]).toBeDefined();
    });
  });
});

// ========================================================================
// TEST HELPERS
// ========================================================================

function generateNostrKeypair() {
  const privateKey = generatePrivateKey();
  const publicKey = getPublicKey(privateKey);
  return { privateKey, publicKey };
}

async function connectToRelay(url: string) {
  const relay = relayInit(url);
  await relay.connect();
  return relay;
}
```

**Scenarios:**

- [ ] `.well-known/satnam-agents` endpoint returns valid, complete JSON.
- [ ] `free_tier.slots_remaining` accurately reflects database state and updates in real-time.
- [ ] OpenAPI spec validates against OpenAPI 3.x schema.
- [ ] OpenAPI spec documents all agent-facing endpoints with complete request/response schemas.
- [ ] Nostr `kind 31990` platform event is published and discoverable via tag queries.
- [ ] Autonomous agent can complete full discovery → keypair generation → registration flow.
- [ ] Free tier path works without payment proof when slots remain.
- [ ] Clear error messages and payment guidance when free tier exhausted.
- [ ] OpenAPI spec structure is compatible with LLM function-calling systems (Claude, GPT-4).

---

### Task 5.7: Lightning Enable Integration Tests

> **DEPENDENCIES:** Tasks 4.10, 5.5 (Lightning Faucet tests — for shared test utilities).
> **GOAL:** Validate Lightning Enable integration, L402 gating, revenue tracking, and
> dual-provider coexistence.

**File:** `tests/lightning-enable/api-monetization.test.ts`

```typescript
describe("Lightning Enable Integration", () => {
  describe("L402 Endpoint Gating (4.10.2)", () => {
    it("should return 402 with Lightning invoice for unauthenticated requests", async () => {
      const response = await fetch("/api/agent-attestation", {
        method: "GET",
        headers: {
          /* no payment proof */
        },
      });
      expect(response.status).toBe(402);
      const body = await response.json();
      expect(body.invoice).toMatch(/^lnbc/); // Valid Lightning invoice
      expect(body.amount_sats).toBeGreaterThan(0);
    });

    it("should accept valid L402 payment proof and return data", async () => {
      const challengeResponse = await fetch("/api/agent-attestation");
      const { invoice, payment_hash } = await challengeResponse.json();
      const preimage = await simulatePayment(invoice);

      const response = await fetch("/api/agent-attestation", {
        headers: { Authorization: `L402 ${macaroon}:${preimage}` },
      });
      expect(response.status).toBe(200);
    });

    it("should reject expired or invalid payment proofs", async () => {
      const response = await fetch("/api/agent-attestation", {
        headers: { Authorization: "L402 invalid:invalid" },
      });
      expect(response.status).toBe(401);
    });
  });

  describe("Revenue Tracking (4.10.3)", () => {
    it("should record LE revenue with correct source tag", async () => {
      await simulateL402Payment("/api/agent-attestation");
      const revenue = await getRevenueRecords({ source: "lightning_enable" });
      expect(revenue.length).toBeGreaterThan(0);
      expect(revenue[0].revenue_source).toBe("lightning_enable");
    });

    it("should process LE webhooks and update revenue records", async () => {
      const webhook = createMockLEWebhook({ event: "payment_settled" });
      const response = await fetch("/api/lightning-enable-webhook", {
        method: "POST",
        body: JSON.stringify(webhook),
      });
      expect(response.status).toBe(200);
    });
  });

  describe("Dual-Provider Coexistence (4.10.4)", () => {
    it("should not interfere with Lightning Faucet agent wallet operations", async () => {
      const agent = await createLFAgent({ budget_sats: 10000 });
      expect(agent.wallet_custody_type).toBe("lightning_faucet");

      const payment = await agent.payInvoice(testInvoice);
      expect(payment.status).toBe("completed");
    });

    it("should function correctly when LE feature flag is disabled", async () => {
      process.env.VITE_ENABLE_LIGHTNING_ENABLE = "false";

      const balance = await getLFAgentBalance(testAgentId);
      expect(balance).toBeDefined();

      const response = await fetch("/api/agent-attestation", {
        headers: standardAuthHeaders,
      });
      expect(response.status).toBe(200); // No 402, standard auth accepted
    });
  });

  describe("Feature Flag Controls", () => {
    it("should disable all LE features when master toggle is off", async () => {
      process.env.VITE_ENABLE_LIGHTNING_ENABLE = "false";
      // L402 gating should be bypassed
      // Revenue tracking for LE source should be skipped
      // Unified dashboard should hide LE panels
    });

    it("should enable L402 gating independently of unified dashboard", async () => {
      process.env.VITE_ENABLE_LIGHTNING_ENABLE = "true";
      process.env.VITE_ENABLE_API_MONETIZATION = "true";
      process.env.VITE_ENABLE_UNIFIED_ECONOMICS = "false";
      // L402 gating active, but dashboard only shows LF costs
    });
  });

  describe("Unified Economics Dashboard (4.10.5)", () => {
    it("should display combined revenue (LE) and costs (LF) correctly", async () => {
      await seedRevenueData({ source: "lightning_enable", amount: 5000 });
      await seedCostData({ source: "lightning_faucet", amount: 2000 });

      const economics = await getUnifiedEconomics(testOperatorId);
      expect(economics.total_revenue_sats).toBe(5000);
      expect(economics.total_costs_sats).toBe(2000);
      expect(economics.net_position_sats).toBe(3000);
    });
  });
});
```

**Scenarios:**

- [ ] L402 challenge returns valid Lightning invoice with correct amount from fee schedule
- [ ] Valid payment proof grants API access and returns correct data
- [ ] Invalid/expired payment proofs are rejected with 401
- [ ] Revenue records include correct `revenue_source = 'lightning_enable'` tagging
- [ ] LE webhooks are validated and processed correctly
- [ ] Lightning Faucet operations are completely unaffected by LE integration
- [ ] Feature flags correctly enable/disable LE functionality independently
- [ ] Unified economics dashboard accurately computes revenue - costs = net position
- [ ] Dual MCP server configuration works without tool name conflicts

---

## Phase 6: Deployment & Documentation

### Task 6.1: Complete Environment Variables

```env
# Database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...

# Lightning/NWC
LNBITS_URL=https://your-lnbits.com
LNBITS_ADMIN_KEY=...
LNBITS_PLATFORM_KEY=... # For platform fee collection

# Lightning Faucet (Agent Wallets)
LIGHTNING_FAUCET_BASE_URL=https://api.lightningfaucet.dev
LIGHTNING_FAUCET_OPERATOR_KEY=lf_op_...
LIGHTNING_FAUCET_WEBHOOK_SECRET=...
LIGHTNING_FAUCET_AGENT_DEFAULT_BUDGET_SATS=100000

# Lightning Enable (API Monetization)
LIGHTNING_ENABLE_ENABLED=false                    # Server-side master toggle
LIGHTNING_ENABLE_NWC_URL=nostr+walletconnect://...  # NWC connection to operator wallet
LIGHTNING_ENABLE_OPENNODE_API_KEY=...             # OpenNode API key for settlement
LIGHTNING_ENABLE_PLAN_TIER=standalone             # standalone | kentico | l402
LIGHTNING_ENABLE_WEBHOOK_SECRET=...              # Webhook signature verification
LIGHTNING_ENABLE_L402_DEFAULT_PRICE_SATS=10      # Default per-call price if not in fee schedule
LIGHTNING_ENABLE_SESSION_BUDGET_SATS=10000       # Per-session spending cap for AI agents
LIGHTNING_ENABLE_REQUEST_BUDGET_SATS=1000        # Per-request spending cap
VITE_ENABLE_LIGHTNING_ENABLE=false               # Client-side master toggle
VITE_ENABLE_API_MONETIZATION=false               # L402 gating on Satnam APIs
VITE_ENABLE_UNIFIED_ECONOMICS=false              # Revenue + cost dashboard
VITE_ENABLE_AGENT_CONTROL_BOARD=false            # Per-agent control board UI
VITE_ENABLE_CREATOR_CONTROL_BOARD=false          # Human creator portfolio dashboard

# Cashu
CASHU_MINT_URL=https://mint-default.satnam.pub # Platform-default/bootstrap mint only; dedicated federation mints are registry-assigned
CASHU_MINT_PRIVATE_KEY=...
CASHU_MINT_KEYSET_ID=...
MINT_MANAGER_INTERNAL_URL=http://mint-manager.internal:8080
MINT_MANAGER_SHARED_SECRET=...

# Fedimint
FEDIMINT_FEDERATION_ID=fed1...
FEDIMINT_GATEWAY_LN_ADDRESS=@gateway.satnam.pub
FEDIMINT_INVITE_CODE=...

# Nostr (configurable relay list — NOT hardcoded)
NOSTR_RELAYS=wss://relay.satnam.pub,wss://relay.damus.io,wss://nos.lol
NOSTR_PLATFORM_NSEC=nsec1...

# Sig4Sats
SIG4SATS_ENABLED=true
SIG4SATS_MINT_URL=https://mint-default.satnam.pub # Default fallback for bootstrap/testing; allow federation override

# Blind Signatures
BLIND_SIGNATURE_MASTER_KEY=... # For encrypting keypairs
BLIND_SIGNATURE_KEY_ROTATION_DAYS=90

# Platform Monetization
FREE_TIER_LIMIT=21
PLATFORM_WALLET_ADDRESS=agent-platform@ai.satnam.pub

# API (uses same base URL as platform — NOT satnam.ai)
VITE_API_BASE_URL=https://api.my.satnam.pub

# Monitoring
SENTRY_DSN=...
```

---

### Task 6.2: Complete API Documentation

**File:** `docs/api-documentation.md`

````markdown
# Satnam Agent Platform API Documentation

## Overview

Complete API reference for creating agents, managing blind tokens, publishing events, and earning Sig4Sats.

---

## Platform Fees

All platform actions require payment via:

1. **Direct Payment**: Lightning, Cashu, or Fedimint
2. **Blind Tokens**: Anonymous pre-paid tokens

### Fee Schedule

| Action                   | Cost (sats)                                              | Blind Token Type           |
| ------------------------ | -------------------------------------------------------- | -------------------------- |
| Agent Account Creation   | 1,000 (first 210 free, configurable via FREE_TIER_LIMIT) | N/A                        |
| Agent Profile Update     | 10                                                       | `agent_profile_update`     |
| Agent Status Event       | 21                                                       | `agent_status_event`       |
| Agent Attestation Light  | 21                                                       | `agent_attestation_light`  |
| Agent Attestation Strong | 42                                                       | `agent_attestation_strong` |
| Agent Badge Award        | 42                                                       | `agent_badge_award`        |
| Agent DM Bundle          | 21                                                       | `agent_dm_bundle`          |
| Agent Contact Add        | 50                                                       | `agent_contact_add`        |
| Agent Task Record Create | 150                                                      | `agent_task_record_create` |
| Credit Envelope Request  | 200                                                      | N/A                        |

---

## Blind Token System

### Purchase Blind Tokens

**Endpoint:** `POST /api/agents/issue-blind-tokens`

**Request:**

```json
{
  "agent_id": "uuid",
  "token_type": "agent_status_event",
  "quantity": 10,
  "blinded_messages": ["...", "..."],
  "payment_proof": "lnbc..."
}
```

**Response:**

```json
{
  "tokens_issued": 10,
  "blind_signatures": ["...", "..."],
  "keypair_public_key": "...",
  "expires_at": "2026-03-01T00:00:00Z"
}
```

### Redeem Blind Token

**Endpoint:** `POST /api/agents/redeem-blind-token`

**Authentication:** None. No Authorization header, no Supabase session cookie, no JWT.
The token itself is the authenticator.

**Request:**

```json
{
  "unblinded_token": "...",
  "signature_proof": "...",
  "action_type": "agent_status_event",
  "keypair_public_key": "...",
  "action_payload": {
    /* action-specific data */
  }
}
```

**Response:**

```json
{
  "token_valid": true,
  "action_authorized": true,
  "action_result": {
    /* result of action */
  },
  "redemption_anonymous": true
}
```

---

## Sig4Sats Integration

### Publish Event with Sig4Sats Payment

**Endpoint:** `POST /api/agents/publish-nostr-event`

**Request:**

```json
{
  "agent_id": "uuid",
  "event_kind": 1,
  "event_content": "Hello world",
  "event_tags": [],
  "fee_payment_proof": "lnbc...",
  "sig4sats_payment_for_event": "{\"mint\":\"...\", \"proofs\":[...]}"
}
```

**Response:**

```json
{
  "event_id": "...",
  "event_published": true,
  "sig4sats_redeemed": true,
  "sig4sats_earned_sats": 1000
}
```

### Create Task with Sig4Sats Bonus

**Endpoint:** `POST /api/agents/task-record-create`

**Request:**

```json
{
  "agent_id": "uuid",
  "task_title": "Data Processing",
  "task_type": "data_processing",
  "requester_npub": "npub1...",
  "estimated_cost_sats": 5000,
  "fee_payment_proof": "lnbc...",
  "sig4sats_task_bond": "{\"mint\":\"...\", \"proofs\":[...]}"
}
```

**Response:**

```json
{
  "task_id": "uuid",
  "task_event_id": "...",
  "sig4sats_bond_locked": true,
  "sig4sats_bond_id": "uuid"
}
```

### Complete Task to Redeem Sig4Sats

**Endpoint:** `POST /api/agents/task-complete`

**Request:**

```json
{
  "task_id": "uuid",
  "actual_duration_seconds": 300,
  "actual_cost_sats": 4800,
  "completion_proof": "{\"result\":\"success\"}",
  "validation_tier": "peer_verified",
  "validator_npub": "npub1...",
  "completion_event": {
    /* signed Nostr event */
  }
}
```

**Response:**

```json
{
  "task_id": "uuid",
  "completion_event_id": "...",
  "validation_tier": "peer_verified",
  "reputation_delta": 10,
  "sig4sats_redeemed": true,
  "sig4sats_bonus_sats": 5000,
  "sig4sats_reputation_bonus": 1
}
```

---

## Credit Envelopes with Sig4Sats

### Request Credit Envelope

**Endpoint:** `POST /api/agents/credit-intent`

**Request:**

```json
{
  "agent_id": "uuid",
  "scope": "l402:compute:5min",
  "requested_amount_sats": 10000,
  "expires_in_seconds": 3600,
  "bond_amount_sats": 2000,
  "bond_payment_proof": "lnbc...",
  "fee_payment_proof": "lnbc...",
  "sig4sats_token": "{\"mint\":\"...\", \"proofs\":[...]}"
}
```

**Response:**

```json
{
  "envelope_id": "uuid",
  "status": "pending",
  "event_id": "...",
  "bond_id": "uuid",
  "sig4sats_lock_id": "uuid"
}
```

---

## Unified Address Resolution

### NIP-05 Lookup

**Request:** `GET /.well-known/nostr.json?name=agent-alice`

**Response:**

```json
{
  "names": {
    "agent-alice": "npub1..."
  },
  "relays": {
    "npub1...": ["wss://relay.satnam.pub"]
  }
}
```

### Lightning LNURL

**Request:** `GET /.well-known/lnurlp/agent-alice`

**Response:**

```json
{
  "tag": "payRequest",
  "callback": "https://api.my.satnam.pub/lnurlp/agent-alice/callback",
  "minSendable": 1000,
  "maxSendable": 100000000000,
  "metadata": [["text/identifier", "agent-alice@ai.satnam.pub"]]
}
```

### Cashu Address

**Request:** `GET /.well-known/cashu/agent-alice`

**Response:**

```json
{
  "pr": "https://mint-federation-example.satnam.pub",
  "pk": "02a1b2c3..."
}
```

- `pr` should resolve from the active federation mint registry entry when one
  exists; otherwise it may fall back to the platform-default/bootstrap mint.

### Fedimint Address

**Request:** `GET /.well-known/fedimint/agent-alice`

**Response:**

```json
{
  "federation_id": "fed1...",
  "gateway_ln_address": "agent-alice@gateway.satnam.pub",
  "invite_code": "..."
}
```

---

## Error Codes

| Code | Meaning                                               |
| ---- | ----------------------------------------------------- |
| 400  | Bad Request - Invalid parameters                      |
| 402  | Payment Required - Fee not paid                       |
| 403  | Forbidden - Insufficient permissions or invalid token |
| 404  | Not Found - Agent or resource doesn't exist           |
| 500  | Internal Server Error                                 |

---

## Rate Limits

- API calls: 100/minute per agent
- Event publishing: 10/minute per agent
- Token redemption: No limit (anonymous)
- Payment generation: 50/hour per agent

---

## Support

- Documentation: https://docs.satnam.pub
- GitHub: https://github.com/satnam-pub/platform
- Discord: https://discord.gg/satnam
````

---

### Task 6.3: Deployment Checklist

```markdown
# Deployment Checklist

## Pre-Deployment Checklist

### Database

- [ ] All migrations run successfully
- [ ] RLS policies tested
- [ ] Indexes created
- [ ] Free tier slots pre-populated (21)
- [ ] Fee schedule seeded
- [ ] Bond requirements seeded
- [ ] Blind signing keypairs generated
- [ ] Triggers tested

### Backend Services

- [ ] Lightning/LNbits configured
- [ ] Platform-default Cashu mint operational
- [ ] Privileged mint manager operational for isolated federation mints
- [ ] Fedimint federation joined
- [ ] NWC wallet generation tested
- [ ] Sig4Sats redemption library integrated
- [ ] Blind signature library tested

### APIs

- [ ] All endpoints deployed
- [ ] Rate limiting configured
- [ ] CORS headers set
- [ ] Webhooks configured
  - [ ] Lightning payment webhook
  - [ ] Cashu payment webhook
  - [ ] Fedimint payment webhook
- [ ] Error handling tested

### Frontend

- [ ] Production build successful
- [ ] Token manager tested
- [ ] Payment modals functional
- [ ] Dashboard displays correctly
- [ ] Mobile responsive

### DNS & Routes

- [ ] `/.well-known/nostr.json` → NIP-05 handler
- [ ] `/.well-known/lnurlp/*` → Lightning handler
- [ ] `/.well-known/cashu/*` → Cashu handler
- [ ] `/.well-known/fedimint/*` → Fedimint handler
- [ ] SSL certificates valid
- [ ] CDN configured

## Post-Deployment

### Testing

- [ ] Create first agent (free tier)
- [ ] Create 211th agent (should require payment when FREE_TIER_LIMIT=210)
- [ ] Purchase blind tokens
- [ ] Redeem blind token anonymously
- [ ] Publish event with Sig4Sats
- [ ] Create task with Sig4Sats bond
- [ ] Complete task and redeem bond
- [ ] Test unified address resolution (all 4 protocols)
- [ ] Send payment to agent address
- [ ] Verify receipts recorded

### Monitoring

- [ ] Sentry configured
- [ ] Log aggregation active
- [ ] Alert thresholds set
  - [ ] Failed payments
  - [ ] Double-spend attempts
  - [ ] API errors
- [ ] Revenue dashboard accessible
- [ ] Database performance monitored

### Documentation

- [ ] API docs published
- [ ] User guides published
- [ ] Developer tutorials available
- [ ] FAQ updated
- [ ] Terms of service published
- [ ] Privacy policy published

### Security

- [ ] All secrets rotated
- [ ] API keys scoped correctly
- [ ] RLS policies enforced
- [ ] Rate limits active
- [ ] DDoS protection enabled
- [ ] Backup strategy tested
- [ ] Disaster recovery plan documented

### Security & Payment Gate (MUST complete before production)

- [ ] `verifyLightningPayment` implemented and tested against LNbits API
- [ ] `verifyCashuToken` implemented and tested against active Cashu mint
- [ ] `verifyFedimintTxid` implemented and tested against Fedimint gateway
- [ ] `verifyBondPayment` unified wrapper implemented
- [ ] Webhook replay protection (timestamp window + payment_hash idempotency) live
- [ ] `payment_proof` stored as hash only; raw proofs never logged
- [ ] `claimed_by_npub` stored as hashed only; `DEPLOYMENT_SALT` env var set
- [ ] `cashu_token` stored encrypted; raw token never in logs

### Privacy Gate (MUST complete before anonymous redemption goes live)

- [ ] `redeem-blind-token` confirmed to accept requests with no Authorization header
- [ ] `spent_token_nullifiers` table migrated and indexed
- [ ] Redemption logs confirmed to contain only nullifier hash + action type + outcome
- [ ] Anonymous redemption rate limiter live (action_type bucket only, not IP/identity)

### Sybil Resistance Gate

- [ ] `claim_free_tier_slot` updated to enforce `app.free_tier_per_human_limit`
- [ ] `p_human_id` passed from all call sites
- [ ] Per-human limit tested: single human cannot claim >3 slots (configurable)

### Pay-Gate Provider Gate

- [ ] `agent_paygate_config` table migrated
- [ ] At least one `PaygateAdapter` implementation live (recommend `lightning_faucet` first)
- [ ] `.well-known` paygate_providers array deployed and tested
- [ ] Agent Creation Wizard Step 3b (provider selection) rendering correctly

## Launch

- [ ] Announce first 210 free agent accounts
- [ ] Publish blog post
- [ ] Tweet announcement
- [ ] Update README
- [ ] Enable public registration

## Post-Launch Monitoring (First 48 Hours)

- [ ] Monitor free tier utilization
- [ ] Track first paid agent creation
- [ ] Monitor blind token purchases
- [ ] Track Sig4Sats redemptions
- [ ] Watch for spam/abuse
- [ ] Monitor API performance
- [ ] Check payment webhook reliability
- [ ] Review error rates
```

---

### Task 6.4: Lightning Faucet Custody & Compliance Checklist

> **DEPENDENCIES:** Tasks 4.8, 5.5, 6.1–6.3.
> **GOAL:** Ensure Lightning Faucet integration respects custody boundaries,
> compliance expectations, and operational safety before and after launch.

#### Custody & Risk Boundaries

- [ ] Confirm **human-created agents** default to `wallet_custody_type = 'self_custodial'`
      (NWC / external wallet path) unless a human explicitly opts into `lnbits_proxy`.
- [ ] Confirm **agent-created agents** use `wallet_custody_type = 'lightning_faucet'`
      with encrypted `lightning_faucet_agent_key_encrypted` set.
- [ ] Document, in operator runbooks, that Lightning Faucet wallets are
      **operational wallets for AI agents only**, not savings wallets for humans.
- [ ] Add clear UX copy wherever LF-backed agents appear, explaining that
      Lightning Faucet is a **custodial** provider and that balances should remain small.

#### Regulatory & Legal Review

- [ ] Legal review of the LF bridge architecture (LNbits ↔ Lightning Faucet) to
      confirm Satnam is not acting as a custodial exchange for humans.
- [ ] Written summary of which flows are **self-custodial** vs **custodial via LF**,
      including diagrams used in internal and external docs.
- [ ] Confirm terms of service and privacy policy clearly describe: - Use of Lightning Faucet for agent wallets. - Separation between human user funds and agent operational balances.

#### Technical Safeguards

- [ ] Verify `LIGHTNING_FAUCET_OPERATOR_KEY` is stored only in secure Netlify
      environment variables and **never** logged.
- [ ] Ensure per-agent operational budgets (daily/weekly/max balance) are
      enforced at the application layer before calling LF APIs.
- [ ] Implement safe failure behavior when LF is degraded or unavailable: - [ ] Agent creation with LF wallets fails with explicit, non-leaky errors. - [ ] Payment flows surface clear status without double-charging.
- [ ] Confirm that all LF calls are routed through a single bridge/utility
      module for easier auditing and monitoring.

#### Monitoring & Incident Response

- [ ] Enable `monitoring/lightning-faucet-health` job and wire its metrics into
      existing monitoring dashboards (Sentry/log aggregation).
- [ ] Add alerts for: - [ ] Repeated LF API failures (4xx/5xx). - [ ] Unusual spikes in LF-funded payouts per agent. - [ ] Large or growing balances in LF wallets beyond policy thresholds.
- [ ] Draft an incident response playbook for: - [ ] LF downtime or degraded service. - [ ] Detected misuse or abuse of LF-backed wallets. - [ ] Required user/operator communications in each scenario.

#### Documentation & UX

- [ ] Update public docs to include a **"Custody Model"** section describing: - Human self-custody via NWC / external wallets. - Optional LNbits proxy path. - LF-backed wallets for agent-created agents.
- [ ] Add inline help / tooltips in the agent dashboard and wizard explaining
      when an agent is LF-backed and what that implies for users.
- [ ] Ensure onboarding materials and blog posts clearly position Satnam as a
      **sovereignty-first** platform that only uses LF as an operational agent
      wallet provider, not as a human savings bank.

---

### Task 6.5: Lightning Enable Deployment & Compliance Checklist

> **DEPENDENCIES:** Tasks 4.10, 5.7, 6.1–6.4.
> **GOAL:** Document all Lightning Enable deployment requirements, operational checklist,
> and compliance considerations alongside the existing Lightning Faucet checklist.

#### Pre-Deployment Requirements

- [ ] OpenNode account created and KYB verification completed
- [ ] Lightning Enable plan activated (Standalone API tier minimum)
- [ ] L402 features unlocked (6,000 sats one-time payment via MCP)
- [ ] NWC connection established and tested (operator wallet ↔ LE)
- [ ] All `LIGHTNING_ENABLE_*` env vars set in Netlify dashboard
- [ ] All `VITE_ENABLE_*` feature flags set to `false` initially (gradual rollout)
- [ ] `lightning-enable-webhook` function deployed and webhook URL registered with LE/OpenNode

#### Integration Verification

- [ ] L402 middleware tested on staging with real Lightning payments
- [ ] Revenue tracking confirmed: LE webhook → `platform_revenue` table → dashboard
- [ ] Feature flags tested: enable LE → verify L402 gating active; disable → verify graceful fallback
- [ ] Dual-provider test: confirm LF agent wallets work correctly with LE active
- [ ] If MCP is adopted, dual-server configuration is tested with no tool name conflicts

#### Compliance Considerations

- [ ] Document that Lightning Enable is **non-custodial middleware** — Satnam's funds are
      in operator's own wallet (via NWC/OpenNode), not held by LE
- [ ] Clarify in ToS that L402 payments for API access are service fees, not token sales
- [ ] Ensure L402 pricing is transparent and discoverable (in OpenAPI spec and `.well-known`)
- [ ] Review OpenNode's compliance requirements and ensure Satnam meets them
- [ ] Update the custody model documentation (Task 6.4) to include LE as a
      **non-custodial API monetization layer** distinct from LF's custodial agent wallets

#### Monitoring & Operations

- [ ] Add LE-specific monitoring: OpenNode settlement status, webhook delivery rate,
      L402 challenge/response latency
- [ ] Wire LE metrics into existing monitoring dashboards (alongside LF metrics from Task 6.4)
- [ ] Draft incident response for LE/OpenNode downtime:
  - L402 endpoints gracefully fall back to standard auth when LE is unavailable
  - Revenue tracking flags missed settlements for manual reconciliation
- [ ] Document the gradual rollout plan:
  1. Enable `LIGHTNING_ENABLE_ENABLED=true` server-side (LE webhook active)
  2. Enable `VITE_ENABLE_API_MONETIZATION=true` (L402 gating on select endpoints)
  3. Enable `VITE_ENABLE_UNIFIED_ECONOMICS=true` (dashboard shows both providers)

---

## Phase 7: Mentor Marketplace Foundation

        > **OBJECTIVE:** Establish the core infrastructure for Citadel Academy's **Mentor Marketplace**
        > focused on **Agent Mentors** and **Human Mentors**, reusing existing reputation, payment,
        > and Nostr discovery systems while preserving Satnam's privacy-first architecture.
        >
        > **SCOPE:** This phase builds on Phases 3–6 and is explicitly **post-MVP**. It should not block
        > launch of the core agent monetization stack.

### Task 7.1: Mentor Marketplace Schema & Privacy Model

        > **DEPENDENCIES:** Tasks 2.1–2.6 (core schema), 3.3–3.4 (Work History & Sig4Sats), 3.8
        > (Reputation Events), 4.5 (Agent Service Offers), 6.1 (Env vars & RLS patterns).
        > **GOAL:** Introduce minimal new tables and views to represent mentors, sessions, and
        > learning progress **without** exposing a raw social graph or breaking the DUID-based
        > privacy model.

    **Database Changes (Supabase migrations):**

    - [ ] `mentor_profiles`
      - Links existing identities to a **mentor role** without creating new Master Context roles:
        - `mentor_id UUID PRIMARY KEY` – internal identifier (hashed DUID where exposed).
        - `agent_profile_id UUID NULL` – when mentor is an **Agent Mentor**.
        - `user_identity_id UUID NULL` – when mentor is a **Human Mentor**.
        - `mentor_type TEXT CHECK (mentor_type IN ('agent','human'))`.
        - `display_name TEXT`, `bio TEXT`, `topics TEXT[]`, `languages TEXT[]`.
        - `base_rate_sats INTEGER` (per session) and `session_duration_minutes INTEGER` (typical).
        - `visibility_scope TEXT CHECK (visibility_scope IN ('private','federation','public'))`.
        - `extra_config JSONB` for future extensions (group sessions, subscriptions, etc.).
      - RLS:
        - Mentors can `SELECT/UPDATE` their own row (`auth.uid()` via linked identity).
        - Students can `SELECT` mentors only where
          `visibility_scope` permits and federation/privacy rules are satisfied.

    - [ ] `mentor_sessions`
      - Represents a **booked mentoring interaction** (agent or human mentor ↔ student):
        - `session_id UUID PRIMARY KEY`.
        - `mentor_id UUID REFERENCES mentor_profiles`.
        - `student_agent_id UUID NULL` – when the student is an agent.
        - `student_user_id UUID NULL` – when the student is a human.
        - `session_status TEXT CHECK (session_status IN
          ('requested','scheduled','in_progress','completed','cancelled','disputed'))`.
        - `scheduled_start_at TIMESTAMPTZ`, `scheduled_end_at TIMESTAMPTZ`.
        - `actual_start_at TIMESTAMPTZ`, `actual_end_at TIMESTAMPTZ`.
        - `price_sats INTEGER`, `currency TEXT DEFAULT 'lightning'`.
        - `escrow_bond_id UUID NULL REFERENCES performance_bonds`.
        - `sig4sats_bonus_id UUID NULL REFERENCES performance_bonds` (for bonus rewards).
        - `extra_metadata JSONB` for notes, curriculum references, etc.
      - RLS:
        - Mentor and student each have full CRUD on their own sessions.
        - Platform analytics use **aggregated views** only (no raw cross-tenant joins).

    - [ ] `mentor_progress_events`
      - Fine-grained, **optionally public** learning progress records:
        - `event_id UUID PRIMARY KEY`.
        - `session_id UUID REFERENCES mentor_sessions`.
        - `event_type TEXT CHECK (event_type IN
          ('lesson_completed','quiz_attempt','milestone_reached','certificate_awarded'))`.
        - `score NUMERIC NULL`, `max_score NUMERIC NULL`, `notes TEXT`.
        - `is_public BOOLEAN DEFAULT FALSE` – governs export to Nostr.
        - `created_at TIMESTAMPTZ DEFAULT now()`.
      - RLS:
        - Mentor and student can read/write their own progress data.
        - Public/anonymous callers can only see rows where `is_public = TRUE` and only through a
          dedicated **projection view** that strips direct identifiers.

    - [ ] Derived views:
      - `mentor_quality_summary` – aggregated counts & scores per mentor (completion rate,
        average rating, dispute rate) used by curation algorithms and dashboards.
      - `student_learning_summary` – per-student rollups used only in authenticated views and
        never exposed as a global listing.

    **Estimated effort:** 2–3 days (schema + RLS + basic views).

### Task 7.2: Backend APIs – Discovery, Matching, Booking & Escrow

        > **DEPENDENCIES:** Task 7.1, Tasks 3.3–3.4 (tasks & Sig4Sats), 4.5 (service registry),
        > 4.8 (federation mint / Lightning Faucet budgets), 4.10 (Lightning Enable L402), 5.x tests.
        > **GOAL:** Provide Netlify Functions for mentor discovery, recommendation, booking, and
        > settlement that reuse existing **task**, **bond**, and **payment** infrastructure.

    **New/Extended Netlify Functions (TypeScript, pure ESM):**

    - `netlify/functions/mentors/list-mentors.ts`
      - Query `mentor_profiles` with filters for `topics`, `languages`, `mentor_type`,
        `price_sats` range, and visibility.
      - Join `mentor_quality_summary` to surface **curated metrics** (completion rate,
        dispute rate, Sig4Sats earned) without exposing raw student IDs.
      - Optional `preferred_agent_role` filter to prioritize mentors experienced with
        `'adult'` vs `'offspring'` agents.

    - `netlify/functions/mentors/recommend-mentors.ts`
      - Accepts a student context object (topics, language, budget range, preferred time zones).
      - Uses **existing work history** (`task_records`, `agent_reputation_events`) and
        `mentor_quality_summary` to produce a ranked list of mentors.
      - Keep algorithm transparent and explainable (include `reason_tags` in response).

    - `netlify/functions/mentors/book-session.ts`
      - Authenticated endpoint for students (agent or human) to request or book a session.
      - Creates `mentor_sessions` row with `session_status='requested'` or `scheduled`.
      - For **Human Mentors**, create or link a `performance_bonds` row as **escrow**:
        - Student’s deposit held until session is completed or disputed.
        - Optional mentor bond for high-stakes sessions (ties into existing slashing logic).
      - For **Agent Mentors**, treat booking as a structured **Sig4Sats task**:
        - Call existing task creation flow with `task_type='mentorship_session'` and
          `sig4sats_task_bond` populated.

    - `netlify/functions/mentors/update-session-status.ts`
      - Allows mentors/students to transition sessions through lifecycle
        (`scheduled` → `in_progress` → `completed` / `cancelled` / `disputed`).
      - On `completed`:
        - Release human-session escrow via `performance_bonds` settlement logic.
        - Trigger Sig4Sats redemption for agent mentors.
        - Write `mentor_progress_events` and `agent_reputation_events` entries as needed.

    - `netlify/functions/mentors/student-dashboard.ts`
      - Returns per-student view of **upcoming sessions**, **past sessions**, and
        aggregated **progress metrics** (`student_learning_summary`).

    **Integration Constraints:**

    - Reuse existing **payment configuration** and **bond** tables – no parallel payment stack.
    - Respect Master Context: mentors and students map onto existing `'private'|'offspring'|
      'adult'|'steward'|'guardian'` roles; no new global roles added.
    - All functions remain Nostr-agnostic internally; Nostr publishing is handled in Task 7.4.

    **Estimated effort:** 3–4 days (APIs + tests, leveraging existing helpers).

### Task 7.3: Frontend – Mentor Library, Profiles & Student Dashboard

        > **DEPENDENCIES:** Task 7.2, Phase 4 dashboard components, family/sovereignty dashboards.
        > **GOAL:** Provide a unified student experience for discovering mentors, booking sessions,
        > and tracking progress, while **reusing** existing dashboard layouts and financial views.

    **New React Components (TypeScript):**

    - `src/components/mentors/MentorLibrary.tsx`
      - Searchable catalog of mentors (agent & human) with filters for topics, languages,
        mentor type, and price.
      - Clearly label **"AI Agent Mentor"** vs **"Human Mentor"**, with privacy-conscious
        profile summaries (no direct contact info leaks).
      - Surface key metrics from `mentor_quality_summary` (completion %, dispute rate,
        Sig4Sats volume) as badges.

    - `src/components/mentors/MentorProfilePage.tsx`
      - Detailed view for a single mentor, embedding:
        - Reputation & attestations (from Phase 3+4 systems).
        - Pricing, availability previews, and curriculum summary.
        - "Book Session" call-to-action wired to `book-session` function.

    - `src/components/mentors/StudentMentorDashboard.tsx`
      - New tab in the existing **sovereignty/financial dashboards** (for both human
        and agent accounts) showing:
        - Upcoming sessions timeline.
        - Past sessions with quick links to progress summaries.
        - Aggregate metrics: lessons completed, topics covered, mentor diversity.
      - For Human Mentors, embed a **Mentor Control Panel** section:
        - Manage `mentor_profiles` (topics, pricing, availability toggles).
        - View session requests and accept/decline.

    **Integration with Existing Dashboards:**

    - Extend the Agent & Human Creator Control Board (Task 4.11) with a **"Mentorship" tab**:
      - For Agent Mentors: show mentorship earnings, Sig4Sats bonuses, and session history.
      - For Human Mentors: show escrow balances, upcoming sessions, and quality metrics.
    - Reuse Unified Payment Dashboard (Task 4.10.5) data sources to surface
      **mentor-related revenue and costs** as dedicated breakdowns.

    **Estimated effort:** 3–4 days (UI, wiring to APIs, basic charts using existing components).

### Task 7.4: Nostr Integration – Mentor Listings, Sessions & Progress

        > **DEPENDENCIES:** Tasks 4.5 (service discovery + Nostr publishing), 3.8 (attestations),
        > 7.1–7.3.
        > **GOAL:** Make mentor offerings and selected progress signals discoverable via Nostr,
        > starting with **short-term cross-listing** and evolving toward **federated
        > mentorship credentials**, while preserving student privacy.

    **Short-Term: Cross-Listing via Existing Service Events**

    - [ ] Extend `agent_service_offers` usage so that mentor offers are a **first-class
          category** (e.g. `service_category = 'mentor'`).
    - [ ] Reuse the existing `kind 31990` service announcement mapping to publish **public
          Mentor offers** as DVM-compatible Nostr events, with tags for:
      - `t:mentor` (topic), `t:subject`, `t:language`.
      - `p:mentor_npub` for the mentor identity.
      - Optional `satnam:mentor_id` pointing to hashed internal ID.
    - [ ] Coordinate with existing Nostr marketplaces (NIP-15-style) to ensure mentor
          events can be indexed and displayed alongside other services.

    **Long-Term: Custom Mentor & Progress Event Kinds**

    - [ ] Define Satnam CEPS for new, opt-in Nostr kinds, e.g.:
      - `kind 41990` – `satnam_mentor_profile` (public mentor metadata subset).
      - `kind 41991` – `satnam_mentor_session_summary` (minimal, non-PII session outcome).
      - `kind 41992` – `satnam_learning_progress` (aggregated, anonymized progress badges).
    - [ ] Map `mentor_progress_events` rows with `is_public = TRUE` to these kinds,
          ensuring no direct student identifiers are published:
      - Use hashed, per-user salts when encoding any identifiers.
      - Aggregate results whenever possible (e.g., "completed module X" vs raw quiz log).

    **Verification & Privacy Checks:**

    - [ ] Confirm that **no global social graph** of student↔mentor relationships is
          exposed; only scoped views and anonymized aggregates appear in public feeds.
    - [ ] Ensure export opt-in is clearly visible in UI for both mentors and students.
    - [ ] Add regression tests that simulate Nostr publication and verify that no
          raw user IDs, emails, or direct internal keys appear on-chain.

    **Estimated effort:** 2–3 days (mappings, CEPS design, tests).

### Task 7.5: Metrics, Curation & Mentor Quality Signals

        > **DEPENDENCIES:** Tasks 3.8 (agent reputation), 4.6 (vouching), 7.1–7.4.
        > **GOAL:** Define success metrics for the Mentor Marketplace and integrate them into
        > existing reputation and dashboard systems so that high-quality mentors are surfaced
        > without leaking sensitive learner data.

    **Curation Metrics (stored in `mentor_quality_summary` or related tables):**

    - Session completion rate (completed vs cancelled/disputed sessions).
    - Average satisfaction rating (from optional post-session surveys).
    - Learning progression indicators (e.g., milestones reached per student).
    - Sig4Sats volume tied to mentorship-related tasks (for Agent Mentors).
    - Dispute rate and outcomes (slashed bonds, refunds).
    - Diversity of topics and learners (without exposing individual identities).

    **Integration with Reputation & Dashboards:**

    - [ ] Add derived `agent_reputation_events` entries when mentors hit certain
          milestones (e.g., 100 completed sessions with high satisfaction).
    - [ ] Surface curated metrics in:
      - Agent & Human Creator Control Board (Task 4.11) mentorship tab.
      - MentorLibrary cards and MentorProfile pages as badges.
    - [ ] Ensure all metrics used for ranking can be **explained** in UI (no black-box scores).

    **Estimated effort:** 1–2 days (SQL views + dashboard wiring).

### Task 7.6: Tests, Seed Data & Documentation

        > **DEPENDENCIES:** Tasks 7.1–7.5.
        > **GOAL:** Provide robust tests and documentation so that the Mentor Marketplace can
        > be safely iterated on and, if needed, disabled via feature flags without impacting
        > the core agent monetization flows.

    **Testing:**

    - [ ] Add Jest/Playwright test suites:
      - `tests/mentors/mentor-booking-flow.test.ts` – end-to-end booking, completion,
        and escrow release for both Agent Mentors and Human Mentors.
      - `tests/mentors/mentor-dispute-flow.test.ts` – disputes, refunds, and slashing.
      - `tests/mentors/mentor-privacy.test.ts` – ensures RLS and projections prevent
        unauthorized access to other students' sessions or progress.

    **Seed & Fixtures:**

    - [ ] Create seed scripts/fixtures for a small set of sample mentors and students,
          used by Storybook/Playwright for realistic UI previews.

    **Documentation:**

    - [ ] New doc: `docs/MENTOR_MARKETPLACE.md` covering:
      - Mentor onboarding (agent & human).
      - Student discovery, booking, and progress tracking.
      - Payment & escrow model (how Lightning Faucet, Sig4Sats, and Lightning Enable
        interact with sessions).
      - Privacy guarantees and Nostr integration choices.

    **Estimated effort:** 2–3 days (tests, docs, fixtures).

    ---

    ## Complete Feature Matrix

    | Feature                     | Database | Backend API | Frontend UI | Tests | Docs |
    | --------------------------- | -------- | ----------- | ----------- | ----- | ---- |
    | **Platform Monetization**   | ✅       | ✅          | ✅          | ✅    | ✅   |
    | Free tier (21 agents)       | ✅       | ✅          | ✅          | ✅    | ✅   |
    | Fee schedule                | ✅       | ✅          | ✅          | ✅    | ✅   |
    | Revenue tracking            | ✅       | ✅          | ✅          | ✅    | ✅   |
    | Payment webhooks            | ✅       | ✅          | N/A         | ✅    | ✅   |

| **Blinded Authentication** | ✅ | ✅ | ✅ | ✅ | ✅ |
| Blind signature issuance | ✅ | ✅ | ✅ | ✅ | ✅ |
| Anonymous redemption | ✅ | ✅ | ✅ | ✅ | ✅ |
| Double-spend prevention | ✅ | ✅ | N/A | ✅ | ✅ |
| Token balance tracking | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Sig4Sats Integration** | ✅ | ✅ | ✅ | ✅ | ✅ |
| Event signature payment | ✅ | ✅ | ✅ | ✅ | ✅ |
| Task completion bonus | ✅ | ✅ | ✅ | ✅ | ✅ |
| Envelope settlement bonus | ✅ | ✅ | ✅ | ✅ | ✅ |
| Reputation bonuses | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Unified Address System** | ✅ | ✅ | ✅ | ✅ | ✅ |
| NIP-05 resolution | ✅ | ✅ | ✅ | ✅ | ✅ |
| Lightning LNURL | ✅ | ✅ | ✅ | ✅ | ✅ |
| Cashu address | ✅ | ✅ | ✅ | ✅ | ✅ |
| Fedimint address | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Performance Bonds** | ✅ | ✅ | ✅ | ✅ | ✅ |
| Multi-protocol bonds | ✅ | ✅ | ✅ | ✅ | ✅ |
| Bond lifecycle | ✅ | ✅ | ✅ | ✅ | ✅ |
| Slashing mechanism | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Credit Envelopes** | ✅ | ✅ | ✅ | ✅ | ✅ |
| NIP-AC lifecycle | ✅ | ✅ | ✅ | ✅ | ✅ |
| Three-tier validation | ✅ | ✅ | ✅ | ✅ | ✅ |
| Reputation calculations | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Work History** | ✅ | ✅ | ✅ | ✅ | ✅ |
| Task records | ✅ | ✅ | ✅ | ✅ | ✅ |
| Attestations | ✅ | ✅ | ✅ | ✅ | ✅ |
| Public portfolio | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Lightning Faucet** | ✅ | ✅ | ✅ | ✅ | ✅ |
| Per-agent wallets | ✅ | ✅ | ✅ | ✅ | ✅ |
| LNbits bridge | N/A | ✅ | N/A | ✅ | ✅ |
| Agent budget controls | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Lightning Enable** | ✅ | ✅ | ✅ | ✅ | ✅ |
| L402 API gating | N/A | ✅ | N/A | ✅ | ✅ |
| Revenue tracking (LE) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Unified economics dashboard | N/A | ✅ | ✅ | ✅ | ✅ |
| MCP dual-server config | N/A | ✅ | N/A | ✅ | ✅ |
| **Agent Discovery** | N/A | ✅ | N/A | ✅ | ✅ |
| Well-known endpoint | N/A | ✅ | N/A | ✅ | ✅ |
| OpenAPI spec | N/A | ✅ | N/A | ✅ | ✅ |
| Nostr platform event | N/A | ✅ | N/A | ✅ | ✅ |

---

## Operations & Monitoring

### Metrics to Track

**Per-Function Metrics:**

- `charge-fee`: Request rate, free tier claims, payment failures, revenue per protocol
- `issue-blind-tokens`: Issuance rate, payment verification failures, token types issued
- `redeem-blind-token`: Redemption rate, double-spend attempts, expired token attempts
- `create-agent-with-fees`: Creation rate, bond failures, NWC failures, lifecycle state distribution
- `platform-fee-paid`: Webhook delivery rate, signature verification failures, status update lag

**Per-Table Metrics:**

- `platform_revenue`: Total revenue by action_type, payment_status distribution, protocol usage
- `agent_blind_tokens`: Issued vs redeemed vs expired counts, average TTL, token_value distribution
- `performance_bonds`: Active vs slashed vs released counts, average bond size, bond type distribution
- `free_tier_allocations`: Claimed vs unclaimed slots, claims per human, Sybil attempt detection
- `agent_nwc_connections`: Active connections, spend limits, rotation frequency

**Security Metrics:**

- Rate limit violations per endpoint/agent/IP
- Failed authentication attempts
- Invalid payment proof submissions
- Double-spend attempts on blind tokens
- Unauthorized webhook calls (signature failures)

### Alerts

**Critical Alerts (Page On-Call):**

- LNbits/NWC gateway unreachable for >5 minutes
- Supabase database connection failures
- Spike in failed payment verifications (>10% failure rate)
- Free tier exhausted (all 210 slots claimed)
- Performance bond slashing rate >5% in 1 hour

**Warning Alerts (Slack/Email):**

- NWC creation failure rate >20%
- Token expiration cleanup job failures
- Webhook delivery lag >1 minute
- Rate limit violations >100/hour for single agent
- Orphaned user_identities (PENDING_IDENTITY state >24h)

### Runbooks

**Incident: LNbits Down**

1. Check LNbits service status and logs
2. Verify admin key validity
3. If prolonged outage: Enable "manual payment mode" flag
4. Notify agents via Nostr DM about NWC unavailability
5. Queue failed NWC operations for retry after recovery

**Incident: Supabase Outage**

1. Check Supabase status page
2. Enable read-only mode if partial availability
3. Queue write operations in Redis/memory
4. Replay queued operations after recovery
5. Verify data consistency post-recovery

**Incident: Free Tier Exhausted**

1. Review free tier allocation distribution (check for Sybil farming)
2. Increase FREE_TIER_LIMIT if legitimate demand
3. Implement stricter per-human limits if abuse detected
4. Consider time-bounded cohorts (e.g., 210 per month)

**Incident: High Rate Limit Violations**

1. Identify violating agent/IP from logs
2. Check if legitimate high-volume use case or attack
3. Temporarily ban if attack pattern detected
4. Contact agent operator if legitimate use case
5. Adjust rate limits if needed for legitimate traffic

---

## Attestation Trust Model

### Light vs Strong Attestations

**Light Attestations (21 sats):**

- Simple endorsements, badges, or labels
- No bond requirement
- Used for: Skill tags, project participation, peer recognition
- Trust level: Low (anti-spam only, not verified)
- Example: "Participated in Project X", "Knows Python"

**Strong Attestations (42 sats + bond):**

- Bond-backed claims with economic accountability
- Requires performance bond from attesting agent
- Used for: Verified credentials, completion certificates, quality guarantees
- Trust level: High (bond at risk if attestation proven false)
- Example: "Completed Task Y with 95% accuracy", "Verified identity"

### Bond-Backed Validation

**How Bonds Increase Trust:**

1. Attesting agent stakes sats (bond) when issuing strong attestation
2. Bond is slashed if attestation is disputed and proven false
3. Bond is released after attestation validity period (e.g., 90 days)
4. Agents with high bond slash rate lose reputation

**Multi-Guardian Signatures:**

- For family federation agents: Strong attestations can require guardian co-signatures
- Guardian approval should be referenceable as concrete approval evidence
  (`kind 39212` / `kind 39213` or equivalent internal records), not just a
  free-floating social proof claim
- Useful for: High-value credentials, identity verification, trust bootstrapping

### Discovery & Verification

**How Agents Discover Attestations:**

1. Query `agent_profiles_public` view for reputation scores
2. Fetch NIP-32 label events from Nostr relays
3. Verify bond backing via `performance_bonds` table
4. Check attesting agent's own reputation score
5. For high-trust claims, verify guardian approval evidence and federation
   summary references rather than trusting labels alone

**Trust Calculation:**

- Light attestation: +1 reputation point
- Strong attestation (bond-backed): +5 reputation points
- Strong attestation (multi-guardian): +10 reputation points
- Slashed attestation: -20 reputation points (for attester)

---

## FAQ: Comprehensive Review Questions Answered

### Q1. Should different event kinds have different fee structures?

**Answer:** Yes. The updated fee schedule (Task 0.1) now differentiates:

- Account/init/metadata events: 21 sats (anti-spam)
- Status/operational events: 21 sats (anti-spam)
- Light attestations: 21 sats (anti-spam)
- Strong attestations: 42 sats (higher due to bond backing)
- Badge awards: 42 sats (NIP-58 events)
- DM bundles: 21 sats for 10 DMs (bundled via token_value)

### Q2. Are blind tokens the right abstraction for all agent actions?

**Answer:** No. Use blind tokens selectively:

- **Blind tokens for:** High-frequency, privacy-sensitive operations (DMs, status posts, light attestations)
- **Direct-pay only for:** Account creation, performance bonds, credit envelopes, some strong attestations where auditability > unlinkability

### Q3. Is the 21-agent free tier the right bootstrap strategy?

**Answer:** No, 21 is too low. Updated to **210 slots** (configurable via deployment parameter):

- Allows better network bootstrap
- Per-human/per-guardian limits prevent Sybil farming
- Can be increased to 2100 or made time-bounded (e.g., 210/month) based on demand

### Q4. Should there be volume discounts or subscription models?

**Answer:** Not for Phase 0-2 (MVP). Marked as **post-MVP (Phase 3+)**:

- Current focus: Pure anti-spam economics with minimal friction
- Future: Subscription tiers (e.g., "X events/month for flat Y sats") backed by larger bonds
- Future: Priority relay access or low-latency tiers for serious agents

### Q5. Are performance bonds correctly sized and scoped?

**Answer:** Directionally correct, but now includes explicit rationale and scaling:

- **Bond sizing rationale:** Bonds must cover expected maximum harm/exposure per operation
- **Dynamic scaling:** Higher volume or default history increases required bonds
- **Tiered operations:** Additional bonds required for 6th+ and 11th+ agents (Sybil resistance)
- See updated `bond_requirements` table in Task 0.1

### Q6. What happens when an agent runs out of tokens/funds mid-operation?

**Answer:** Standardized `EconomicFailureHint` responses now provide:

- Machine-readable reason codes: `INSUFFICIENT_TOKENS`, `INSUFFICIENT_FUNDS`, `BOND_REQUIRED`, `RATE_LIMITED`
- Suggested actions: `BUY_TOKENS`, `TOP_UP_BOND`, `WAIT_AND_RETRY`, `CONTACT_SUPPORT`
- Required amounts and retry timing
- Agent lifecycle state machine helps agents detect and recover from partial failures

### Q7. How do agents discover and trust each other's attestations?

**Answer:** See "Attestation Trust Model" section above:

- Discovery via `agent_profiles_public` view and NIP-32 events
- Trust differentiation: Light (21 sats) vs Strong (42 sats + bond) attestations
- Bond backing and multi-guardian signatures increase trust
- Reputation scoring based on attestation type and bond status

### Q8. What prevents Sybil attacks beyond the account creation fee?

**Answer:** Multi-layered Sybil resistance:

- **Account creation fee:** 1000 sats (or free tier with limits)
- **Per-human agent limits:** Default max 5 agents before additional bonds required
- **Bond ladder:** Exponentially higher bonds for 6th+ and 11th+ agents
- **Per-action fees:** 21-42 sats for events (makes spam expensive at scale)
- **Rate limiting:** Per auth.uid(), per IP, per npub on all critical endpoints
- **Family federation controls:** Guardian/steward consent required for agents beyond threshold

---

## Implementation Summary

This comprehensive plan now includes:

✅ **Platform Monetization (Anti-Spam Focused)**

- Fee-per-action model with differentiated event types (21-42 sats)
- First 210 agents get free account creation (configurable)
- DM bundling support (token_value > 1)
- Revenue tracking and dashboard
- Multiple payment protocols (Lightning, Cashu, Fedimint)

✅ **Blinded Authentication**

- Privacy-preserving blind signature tokens
- Anonymous action authorization
- Double-spend prevention
- Token lifecycle management

✅ **Sig4Sats Integration**

- Atomic Cashu for Nostr signatures
- Event signature payments
- Task completion bonuses
- Credit envelope settlement bonuses
- Reputation multipliers for Sig4Sats redemptions

✅ **Complete Agent Identity System**

- Unified address (`agent-name@ai.satnam.pub`) for NIP-05, Lightning, Cashu, Fedimint
- Performance bonds with multi-protocol support
- Three-tier validation (self-report, peer, oracle)
- Portable reputation that travels with agents

✅ **Security & Abuse Resistance**

- Multi-layered Sybil resistance (fees, bonds, rate limits, per-human limits)
- NWC connection string encryption at rest
- Rate limiting on all critical endpoints
- Webhook signature verification (HMAC-SHA256)
- Agent lifecycle state machine for failure recovery

✅ **UX & Economic Incentives**

- Standardized `EconomicFailureHint` responses for out-of-funds scenarios
- Agent lifecycle states: PENDING_IDENTITY → PENDING_BOND → ACTIVE → SUSPENDED → DEACTIVATED
- Compensation/rollback strategies for multi-step operation failures
- Bond sizing rationale and dynamic scaling
- Attestation trust model (light vs strong, bond-backed validation)

✅ **Operations & Monitoring**

- Comprehensive metrics for all functions and tables
- Critical and warning alerts with clear thresholds
- Operational runbooks for common incidents
- End-to-end test scenarios (see below)

✅ **Full Stack Implementation**

- Database schema with all tables and triggers
- Backend APIs with monetization integration
- Frontend UI with token management
- Comprehensive testing suite
- Complete documentation

---

## End-to-End Test Scenarios

### Scenario 1: Happy Path - New Agent Lifecycle

**Objective:** Verify complete agent creation and operation flow

**Steps:**

1. Human user creates new agent account with free tier claim
2. Agent claims free tier slot (1 of 210)
3. Agent submits performance bond (10,000 sats for adult agent)
4. NWC connection created successfully
5. Agent purchases blind tokens (10x dm_bundle tokens with token_value=10 each)
6. Agent redeems token to send encrypted DM
7. Agent publishes status update event (21 sats)
8. Agent receives light attestation from peer (21 sats)
9. Agent lifecycle state = ACTIVE throughout

**Expected Results:**

- Free tier slot claimed atomically
- Bond recorded in `performance_bonds` with status='active'
- NWC connection active and encrypted
- Token balances updated correctly (100 DMs available)
- All events published successfully
- Reputation score increases by +1 for attestation
- No economic failures or partial states

### Scenario 2: Economic Failure Recovery

**Objective:** Verify agent can detect and recover from out-of-funds/tokens

**Steps:**

1. Agent exhausts all blind tokens (`agent_dm_bundle` balance = 0)
2. Agent attempts to send DM → receives `EconomicFailureHint` with reason='INSUFFICIENT_TOKENS'
3. Agent purchases more tokens using NWC autonomous payment
4. Agent retries DM send → succeeds
5. Agent runs out of NWC spending limit
6. Agent attempts payment → receives `EconomicFailureHint` with reason='INSUFFICIENT_FUNDS'
7. Human operator tops up NWC wallet
8. Agent retries → succeeds

**Expected Results:**

- All failures return standardized `EconomicFailureHint` responses
- Agent can programmatically detect failure reasons
- Agent can retry after remediation
- No data corruption or orphaned records
- Lifecycle state remains ACTIVE (no suspension)

### Scenario 3: Abuse & Sybil Resistance

**Objective:** Verify multi-layered Sybil attack prevention

**Steps:**

1. Attacker creates 5 agents under single human account → succeeds (within limit)
2. Attacker attempts to create 6th agent → requires additional bond (25,000 sats)
3. Attacker pays additional bond → succeeds
4. Attacker attempts to create 11th agent → requires 50,000 sats bond
5. Attacker attempts to claim multiple free tier slots with same npub → fails (per-human limit)
6. Attacker attempts to spam `issue-blind-tokens` endpoint → rate limited after 5 req/min
7. Attacker attempts to redeem same token twice → fails (double-spend prevention)
8. Attacker attempts to send webhook with invalid signature → fails (401 Unauthorized)

**Expected Results:**

- Bond ladder enforced correctly (5→6 requires 25k, 10→11 requires 50k)
- Free tier Sybil farming prevented
- Rate limits enforced on all endpoints
- Double-spend prevention works
- Webhook signature verification blocks unauthorized calls
- All abuse attempts logged for monitoring

### Scenario 4: Partial Failure & State Recovery

**Objective:** Verify compensation/rollback strategies work correctly

**Steps:**

1. Agent creation: user_identity created successfully
2. Agent creation: agent_profile creation fails (simulated DB error)
3. System marks user_identity with lifecycle_state='PENDING_IDENTITY'
4. Cleanup job detects orphaned identity after 24h → deletes it
5. Agent creation retry: bond payment succeeds but payment_config insert fails
6. System sets agent_profile.lifecycle_state='PENDING_CONFIG'
7. Agent can still operate with manual payments
8. Admin manually fixes payment_config → lifecycle_state updated to ACTIVE

**Expected Results:**

- Orphaned identities cleaned up automatically
- Partial states clearly marked in lifecycle_state column
- Agents can introspect their own state
- Manual recovery pathways documented
- No silent failures or data inconsistencies

---

**Total Lines of Implementation Code: ~8,500+**
**Estimated Development Time: 8-10 weeks**

---

**Ready to implement. Begin with Phase 0 (Platform Monetization Infrastructure) and proceed systematically through each phase.**

**All comprehensive review recommendations have been implemented:**

- ✅ Critical Priority: Monetization model refinement, security enhancements, UX improvements
- ✅ High Priority: Economic incentives, privacy hardening
- ✅ Medium Priority: Operations & monitoring, attestation trust model, FAQ
- ✅ All 8 specific questions answered with implementation details
