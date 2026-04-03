# OTS/SimpleProof Integration for Agent Attestations

**Version:** 1.0  
**Date:** 2026-03-22  
**Status:** Design Phase (Schema Complete, Implementation Pending)

---

## Executive Summary

This document defines how OpenTimestamps (OTS) proof generation and SimpleProof API integration work alongside the NIP-SKL/SA/AC agent economy infrastructure. It maps OTS proof generation to specific Nostr event types, defines proof storage strategies, and outlines the SimpleProof API key provisioning flow for agent-independent proof generation.

**Key Design Principles:**

- **Agent-level proof storage** — each agent has its own OTS proof storage URL
- **Multi-backend support** — Supabase Storage, IPFS, agent-controlled endpoints, SimpleProof platform
- **Selective timestamping** — not all Nostr events are timestamped; only high-value attestations
- **Future-proof API key management** — encrypted SimpleProof API keys per agent (when available)

---

## 1. Current State: OTS/NIP-03 Flow (As-Is)

Satnam currently supports OpenTimestamps via:

- **NIP-03 (kind 1040)** — Bitcoin attestation events published to Nostr relays
- **SimpleProof integration** — platform-level proof generation (not yet agent-specific)

**Current limitations:**

- No agent-level proof storage (all proofs stored centrally)
- No per-agent SimpleProof API keys (agents cannot generate proofs independently)
- No systematic mapping of which Nostr events should be timestamped

---

## 2. Proposed Architecture: Agent-Level OTS Proof Storage (To-Be)

### 2.1 Database Schema

**Extended `agent_profiles` table:**

```sql
ALTER TABLE agent_profiles
  ADD COLUMN ots_proofs_storage_url TEXT,
  ADD COLUMN simpleproof_api_key_encrypted TEXT,
  ADD COLUMN simpleproof_enabled BOOLEAN DEFAULT false,
  ADD COLUMN ots_attestation_count INTEGER DEFAULT 0,
  ADD COLUMN last_ots_attestation_at TIMESTAMPTZ;
```

**New `ots_proof_records` table:**

```sql
CREATE TABLE ots_proof_records (
  id UUID PRIMARY KEY,
  proof_hash TEXT NOT NULL UNIQUE,
  ots_proof_file_url TEXT NOT NULL,
  bitcoin_block_height INTEGER,
  attestation_timestamp TIMESTAMPTZ,
  agent_pubkey TEXT NOT NULL,
  nostr_event_id TEXT,
  simpleproof_proof_id TEXT,
  attested_event_kind INTEGER,
  attested_event_id TEXT,
  proof_status TEXT CHECK (proof_status IN ('pending','confirmed','failed')),
  confirmed_at TIMESTAMPTZ,
  storage_backend TEXT CHECK IN ('supabase','ipfs','agent_endpoint','simpleproof'),
  storage_metadata JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

### 2.2 Storage Backends

| Backend              | Use Case                         | URL Format                                                                                          | Pros                          | Cons                     |
| -------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------ |
| **Supabase Storage** | Default for Satnam-hosted agents | `https://[project].supabase.co/storage/v1/object/public/ots-proofs/[agent_pubkey]/[proof_hash].ots` | Easy integration, RLS support | Centralized              |
| **IPFS**             | Decentralized storage            | `ipfs://[CID]`                                                                                      | Censorship-resistant          | Requires pinning service |
| **Agent Endpoint**   | Self-hosted agents               | `https://agent.example.com/proofs/[proof_hash].ots`                                                 | Full agent control            | Availability risk        |
| **SimpleProof**      | When SimpleProof API is used     | `https://simpleproof.com/proofs/[proof_id]`                                                         | Professional service          | Requires API key         |

---

## 3. Integration with NIP-SKL/SA/AC Flows

### 3.1 Which Nostr Events Should Be Timestamped?

| Nostr Event Kind | NIP     | Description                         | OTS Proof?      | Rationale                                                                        |
| ---------------- | ------- | ----------------------------------- | --------------- | -------------------------------------------------------------------------------- |
| **1985**         | NIP-32  | Guardian attestation (skill safety) | ✅ **YES**      | High-value trust signal; immutable proof of guardian approval                    |
| **33400**        | NIP-SKL | Skill manifest                      | ❌ No           | Manifests are versioned and replaceable; timestamping every version is excessive |
| **33401**        | NIP-SKL | Skill version log                   | ❌ No           | Append-only log; relay is sufficient                                             |
| **39200**        | NIP-SA  | Agent profile                       | ❌ No           | Replaceable event; timestamping every update is excessive                        |
| **39201**        | NIP-SA  | Agent state                         | ⚠️ **OPTIONAL** | Only timestamp critical state transitions (e.g. "agent promoted to steward")     |
| **39242**        | NIP-AC  | Credit envelope (OSCE)              | ✅ **YES**      | Financial commitment; immutable proof of envelope creation                       |
| **39243**        | NIP-AC  | Spend authorization                 | ❌ No           | Ephemeral event; envelope is already timestamped                                 |
| **39244**        | NIP-AC  | Settlement receipt                  | ✅ **YES**      | Financial settlement; immutable proof of payment completion                      |
| **39245**        | NIP-AC  | Credit default notice               | ✅ **YES**      | Dispute evidence; immutable proof of default claim                               |

**Summary:**

- **Always timestamp:** kind 1985 (attestations), 39242 (envelopes), 39244 (settlements), 39245 (defaults)
- **Never timestamp:** kind 33400, 33401, 39200, 39243 (too frequent or ephemeral)
- **Conditionally timestamp:** kind 39201 (only critical state transitions)

### 3.2 Proof Generation Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│  1. Nostr Event Published (e.g. kind 39244 settlement receipt)  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. Netlify Function: Check if event kind requires OTS proof    │
│     (consult mapping table above)                               │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼ (if YES)
┌─────────────────────────────────────────────────────────────────┐
│  3. Generate OTS Proof:                                         │
│     - Compute SHA-256 hash of event content                     │
│     - Call OpenTimestamps API (or SimpleProof if enabled)       │
│     - Receive .ots proof file                                   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. Store Proof:                                                │
│     - Upload .ots file to storage backend (Supabase/IPFS/etc.)  │
│     - Insert row into ots_proof_records table                   │
│     - Update agent_profiles.ots_attestation_count               │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. Publish NIP-03 Event (kind 1040):                           │
│     - Reference original event id                               │
│     - Include .ots proof file URL                               │
│     - Publish to Nostr relays                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 Proof Verification Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│  1. User/Agent wants to verify a settlement receipt             │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. Query ots_proof_records by attested_event_id                │
│     → Retrieve ots_proof_file_url                               │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. Download .ots proof file from storage backend               │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. Verify proof using OpenTimestamps client:                   │
│     - ots verify <proof_file> <original_data>                   │
│     - Check Bitcoin block height matches                        │
│     - Confirm proof_status = 'confirmed'                        │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. Display verification result to user:                        │
│     ✓ Proof confirmed in Bitcoin block #850123                 │
│     ✓ Timestamp: 2026-03-22 14:35:00 UTC                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. SimpleProof API Integration (Future)

### 4.1 API Key Provisioning Flow

**Who creates the API key?**

- **Guardian** creates the SimpleProof API key for their agents
- **Platform admin** can provision keys for platform-managed agents
- **Agent** cannot self-provision (security: prevents unauthorized proof generation)

**How is the key encrypted?**

- Use existing `ClientSessionVault` pattern from `src/lib/auth/client-session-vault.ts`
- Encrypt API key with guardian's session key before storing in `agent_profiles.simpleproof_api_key_encrypted`
- Decrypt only when needed for proof generation (server-side in Netlify Functions)

**How is the key rotated/revoked?**

- Guardian can rotate key via Control Board UI
- Old key is marked as revoked in `simpleproof_api_key_encrypted` (append rotation timestamp)
- New key is encrypted and stored
- Existing proofs remain valid (proof_id is immutable)

### 4.2 Stub Function: Provision SimpleProof API Key

```typescript
// src/lib/ots/simpleproof-provisioning.ts (STUB — Future Implementation)

import type { AgentProfile } from "../../../types/database";
import { supabase } from "../supabase";

/**
 * Provision a SimpleProof API key for an agent
 * TODO(simpleproof): Implement after SimpleProof developer call
 *
 * @param agentPubkey - Agent's Nostr public key
 * @param apiKey - SimpleProof API key (plaintext, will be encrypted)
 * @param guardianSessionKey - Guardian's session key for encryption
 * @returns Success status
 */
export async function provisionSimpleProofAPIKey(
  agentPubkey: string,
  apiKey: string,
  guardianSessionKey: string,
): Promise<{ success: boolean; error?: string }> {
  // TODO(simpleproof): Implement encryption using ClientSessionVault pattern
  // TODO(simpleproof): Store encrypted key in agent_profiles.simpleproof_api_key_encrypted
  // TODO(simpleproof): Set simpleproof_enabled = true
  // TODO(simpleproof): Log provisioning event for audit trail

  console.warn("provisionSimpleProofAPIKey stub: not yet implemented");
  return { success: false, error: "SimpleProof integration pending" };
}

/**
 * Rotate a SimpleProof API key for an agent
 * TODO(simpleproof): Implement key rotation logic
 */
export async function rotateSimpleProofAPIKey(
  agentPubkey: string,
  newApiKey: string,
  guardianSessionKey: string,
): Promise<{ success: boolean; error?: string }> {
  // TODO(simpleproof): Mark old key as revoked
  // TODO(simpleproof): Encrypt and store new key
  // TODO(simpleproof): Update rotation timestamp

  console.warn("rotateSimpleProofAPIKey stub: not yet implemented");
  return { success: false, error: "SimpleProof integration pending" };
}
```

---

## 5. Implementation Roadmap

### Phase 1: Schema & Design (COMPLETE)

- [x] Database migration: extend `agent_profiles` with OTS/SimpleProof fields
- [x] Database migration: create `ots_proof_records` table
- [x] TypeScript types: `AgentProfile` extended, `OTSProofRecord` interface created
- [x] Documentation: this file created

### Phase 2: OTS Proof Storage (Future)

- [ ] Implement Supabase Storage backend for .ots files
- [ ] Create Netlify Function: `ots-proof-generator.js`
- [ ] Integrate with NIP-03 kind 1040 publishing
- [ ] Add proof generation triggers for kind 1985, 39242, 39244, 39245

### Phase 3: SimpleProof API Integration (Future — After Developer Call)

- [ ] Implement `provisionSimpleProofAPIKey()` function
- [ ] Implement `rotateSimpleProofAPIKey()` function
- [ ] Add SimpleProof API client wrapper
- [ ] Test proof generation via SimpleProof API
- [ ] Add feature flag UI in Control Board

### Phase 4: Proof Verification UI (Future)

- [ ] Create `OTSProofVerifier.tsx` component
- [ ] Add "Verify Proof" button to settlement receipts
- [ ] Display Bitcoin block height and timestamp
- [ ] Show proof status (pending/confirmed/failed)

---

## 6. Questions for SimpleProof Developer Call

1. **API Key Provisioning:**
   - Can agents have individual API keys, or is there one platform-level key?
   - What are the rate limits per API key?
   - How do we handle key rotation/revocation?

2. **Proof Storage:**
   - Does SimpleProof host the .ots proof files, or do we need to store them ourselves?
   - What is the proof file URL format?
   - How long are proofs retained?

3. **Proof Verification:**
   - Is there a SimpleProof API endpoint for proof verification, or do we use the standard OTS client?
   - Can we query proof status (pending/confirmed) via API?

4. **Billing:**
   - How is proof generation billed? (per proof? monthly subscription?)
   - Can we pass billing through to agents, or is it platform-level?

5. **Integration:**
   - Is there a TypeScript/JavaScript SDK for SimpleProof API?
   - What are the required headers/authentication for API calls?
   - Are there webhook callbacks for proof confirmation?

---

## 7. References

- **OpenTimestamps:** https://opentimestamps.org/
- **NIP-03 (Bitcoin Attestation):** https://github.com/nostr-protocol/nips/blob/master/03.md
- **SimpleProof:** https://simpleproof.com/ (developer call pending)
- **NIP-SKL Spec:** `docs/specs/SKL.md`
- **NIP-SA Spec:** `docs/specs/SA.md`
- **NIP-AC Spec:** `docs/specs/AC.md`
- **Integration Plan:** `docs/planning/NIP-Triumvirate-Satnam-Integration-Plan.md`
