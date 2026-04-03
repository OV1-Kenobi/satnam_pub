# OTS Proof Generation, Storage, and Verification for Agents — Complete Implementation Plan

**Version:** 1.0  
**Date:** 2026-03-22  
**Status:** Implementation Ready  
**Prerequisites:** Phase 3.5 (OTS/SimpleProof Integration Schema) Complete

---

## 1. ASSESSMENT — Existing Infrastructure Analysis

### 1.1 What Already Exists (Reusable for Agents)

| Component | File Path | Status | Reusable for Agents? |
|-----------|-----------|--------|----------------------|
| **OTS Proof Generation** | `netlify/functions_active/simpleproof-timestamp.ts` | ✅ Production | ✅ **YES** — Headless, server-side, supports both OpenTimestamps and SimpleProof |
| **NIP-03 Publishing** | `src/services/nip03-attestation-service.ts` | ✅ Production | ⚠️ **PARTIAL** — Client-side service, needs server-side adapter for agents |
| **NIP-03 Event Creation** | `netlify/functions/onboarding-create-nip03-attestation.ts` | ✅ Production | ✅ **YES** — Server-side, can be adapted for agent events |
| **OTS Proof Validation** | `src/lib/simpleproof/opentimestampsLocalValidator.ts` | ✅ Production | ✅ **YES** — Browser-safe, can be used in guardian UI |
| **Proof Compression** | `netlify/functions_active/utils/proof-compression.ts` | ✅ Production | ✅ **YES** — Reduces storage costs |
| **Supabase Storage** | Used in `simpleproof-timestamp.ts` for proof persistence | ✅ Production | ✅ **YES** — Already integrated |
| **Rate Limiting** | `netlify/functions_active/utils/enhanced-rate-limiter.ts` | ✅ Production | ✅ **YES** — Prevents abuse |
| **Error Tracking** | `netlify/functions/utils/sentry.server.ts` | ✅ Production | ✅ **YES** — Sentry integration |

### 1.2 What's Missing (Needs to Be Built)

| Gap | Description | Priority |
|-----|-------------|----------|
| **Agent-Specific Proof Generation Trigger** | Automated proof generation when kind 1985, 39242, 39244, 39245 events are published | 🔴 **HIGH** |
| **Proof Storage Backend Integration** | Store .ots files in Supabase Storage with agent-specific paths | 🔴 **HIGH** |
| **Proof Metadata Persistence** | Insert rows into `ots_proof_records` table after proof generation | 🔴 **HIGH** |
| **Proof Confirmation Polling** | Background job to check Bitcoin block confirmations and update `proof_status` | 🟠 **MEDIUM** |
| **Guardian UI Components** | `OTSProofList.tsx`, `OTSProofVerifier.tsx`, `OTSProofStatusBadge.tsx` | 🟠 **MEDIUM** |
| **Agent Proof Generation Metrics** | Update `agent_profiles.ots_attestation_count` and `last_ots_attestation_at` | 🟡 **LOW** |
| **Multi-Backend Support** | IPFS, agent endpoint, SimpleProof storage backends (beyond Supabase) | 🟡 **LOW** (future) |

### 1.3 Dependency Analysis

**Already Integrated:**
- ✅ `@alexalves87/opentimestamps-client` — OpenTimestamps proof generation
- ✅ `@supabase/supabase-js` — Database and storage
- ✅ Sentry — Error tracking
- ✅ Node.js `crypto` module — Hashing (server-side only)
- ✅ Web Crypto API — Hashing (browser-side)

**No New Dependencies Required** — All necessary libraries are already in use.

---

## 2. ARCHITECTURE — High-Level Design Decisions

### 2.1 Synchronous vs. Asynchronous Proof Generation

**Decision: ASYNCHRONOUS (Background Job)**

**Rationale:**
- OpenTimestamps proof generation can take 5-30 seconds (network latency, Bitcoin block time)
- Blocking event publishing for 30 seconds is unacceptable UX
- Settlement receipts, attestations, and envelopes must publish immediately
- Proof generation failures should not block critical flows

**Implementation:**
1. Event is published to Nostr relays (synchronous, fast)
2. Event metadata is inserted into Supabase (synchronous, fast)
3. Proof generation job is queued (asynchronous, non-blocking)
4. Background worker processes proof generation queue
5. Proof confirmation polling runs separately (cron job or webhook)

**Trade-off:** Proofs are not immediately available, but critical flows are never blocked.

### 2.2 Storage Backend Selection

**Decision: Supabase Storage (Default), Multi-Backend Support (Future)**

**Default Backend: Supabase Storage**
- **Path format:** `ots-proofs/[agent_pubkey]/[proof_hash].ots`
- **Bucket:** `ots-proofs` (public read, service role write)
- **RLS:** Public read for confirmed proofs, agent-only read for pending proofs
- **Pros:** Easy integration, RLS support, no external dependencies
- **Cons:** Centralized (mitigated by future IPFS support)

**Future Backends:**
- **IPFS:** Decentralized, censorship-resistant (requires pinning service)
- **Agent Endpoint:** Self-hosted (requires agent to run HTTP server)
- **SimpleProof:** Managed hosting (requires API key)

**Storage Backend Selection Logic:**
```typescript
function selectStorageBackend(agent: AgentProfile): StorageBackend {
  if (agent.simpleproof_enabled && agent.simpleproof_api_key_encrypted) {
    return 'simpleproof';
  }
  if (agent.ots_proofs_storage_url?.startsWith('ipfs://')) {
    return 'ipfs';
  }
  if (agent.ots_proofs_storage_url?.startsWith('https://')) {
    return 'agent_endpoint';
  }
  return 'supabase'; // Default
}
```

### 2.3 Proof Generation Trigger Mechanism

**Decision: Event Listener Hooks in Existing Publishing Flows**

**Trigger Points:**
1. **NIP-SKL attestations (kind 1985)** — After guardian publishes attestation via CEPS
2. **NIP-AC credit envelopes (kind 39242)** — After envelope creation in `credit-envelope-lifecycle.ts`
3. **NIP-AC settlement receipts (kind 39244)** — After settlement completion
4. **NIP-AC default notices (kind 39245)** — After default claim is published

**Implementation Pattern:**
```typescript
// In credit-envelope-lifecycle.ts (example)
async function createCreditEnvelope(request) {
  // 1. Create envelope in Supabase
  const envelope = await supabase.from('credit_envelopes').insert(...);
  
  // 2. Publish kind 39242 event to Nostr
  const event = await publishNostrEvent({ kind: 39242, ... });
  
  // 3. Queue OTS proof generation (non-blocking)
  await queueOTSProofGeneration({
    attested_event_kind: 39242,
    attested_event_id: event.id,
    agent_pubkey: request.agent_pubkey,
    data: JSON.stringify(event),
  });
  
  // 4. Return success immediately (don't wait for proof)
  return { success: true, envelope_id: envelope.id };
}
```

### 2.4 Proof Confirmation Polling Strategy

**Decision: Cron Job (Netlify Scheduled Functions)**

**Polling Frequency:** Every 10 minutes

**Logic:**
1. Query `ots_proof_records` WHERE `proof_status = 'pending'` AND `created_at > NOW() - INTERVAL '7 days'`
2. For each pending proof:
   - Download .ots proof file from storage
   - Call OpenTimestamps verification API (or SimpleProof API)
   - If Bitcoin block confirmed:
     - Update `proof_status = 'confirmed'`
     - Update `bitcoin_block_height = [height]`
     - Update `confirmed_at = NOW()`
   - If verification fails after 7 days:
     - Update `proof_status = 'failed'`

**Netlify Scheduled Function:**
```typescript
// netlify/functions/ots-proof-confirmation-poller.ts
export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405 };
  }
  
  // Verify Netlify cron secret
  if (event.headers['x-netlify-event'] !== 'schedule') {
    return { statusCode: 403 };
  }
  
  await pollPendingProofs();
  return { statusCode: 200, body: 'OK' };
};
```

**netlify.toml:**
```toml
[[functions]]
  name = "ots-proof-confirmation-poller"
  schedule = "*/10 * * * *"  # Every 10 minutes
```

---

## 3. IMPLEMENTATION PLAN — Step-by-Step, File-by-File

### Phase 1: Core Proof Generation Infrastructure (Days 1-3)

#### Step 1.1: Create Proof Generation Queue Function

**File:** `netlify/functions_active/ots-proof-generator.js`

**Purpose:** Server-side function that generates OTS proofs for agent events

**Inputs:**
- `attested_event_kind` (number) — e.g. 1985, 39242, 39244, 39245
- `attested_event_id` (string) — Nostr event id
- `agent_pubkey` (string) — Agent's public key
- `data` (string) — Event content to timestamp (JSON-serialized event)
- `storage_backend` (optional) — 'supabase' | 'ipfs' | 'agent_endpoint' | 'simpleproof'

**Outputs:**
- `proof_hash` (string) — SHA-256 hash of attested data
- `ots_proof_file_url` (string) — URL to .ots proof file
- `proof_status` (string) — 'pending' | 'confirmed' | 'failed'
- `ots_proof_record_id` (UUID) — Primary key in `ots_proof_records` table

**Implementation:**
```javascript
// netlify/functions_active/ots-proof-generator.js
import { createHash } from 'node:crypto';
import { OpenTimestampsClient } from '@alexalves87/opentimestamps-client';
import { supabaseAdmin } from '../functions/supabase.js';
import { getEnvVar } from './utils/env.js';

export const handler = async (event) => {
  // 1. Parse request body
  const body = JSON.parse(event.body);
  const { attested_event_kind, attested_event_id, agent_pubkey, data, storage_backend = 'supabase' } = body;
  
  // 2. Compute SHA-256 hash of data
  const proof_hash = createHash('sha256').update(data).digest('hex');
  
  // 3. Generate OTS proof using existing simpleproof-timestamp logic
  const otsClient = new OpenTimestampsClient();
  const otsProof = await otsClient.stamp(Buffer.from(proof_hash, 'hex'));
  const otsProofHex = Buffer.from(otsProof.serializeToBytes()).toString('hex');
  
  // 4. Store .ots proof file in Supabase Storage
  const otsFileName = `${proof_hash}.ots`;
  const otsFilePath = `ots-proofs/${agent_pubkey}/${otsFileName}`;
  
  const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
    .from('ots-proofs')
    .upload(otsFilePath, Buffer.from(otsProofHex, 'hex'), {
      contentType: 'application/octet-stream',
      upsert: true,
    });
  
  if (uploadError) {
    throw new Error(`Failed to upload OTS proof: ${uploadError.message}`);
  }
  
  // 5. Get public URL
  const { data: urlData } = supabaseAdmin.storage
    .from('ots-proofs')
    .getPublicUrl(otsFilePath);
  
  const ots_proof_file_url = urlData.publicUrl;
  
  // 6. Insert row into ots_proof_records table
  const { data: proofRecord, error: insertError } = await supabaseAdmin
    .from('ots_proof_records')
    .insert({
      proof_hash,
      ots_proof_file_url,
      agent_pubkey,
      attested_event_kind,
      attested_event_id,
      proof_status: 'pending',
      storage_backend,
      storage_metadata: { uploaded_at: new Date().toISOString() },
    })
    .select()
    .single();
  
  if (insertError) {
    throw new Error(`Failed to insert proof record: ${insertError.message}`);
  }
  
  // 7. Update agent_profiles metrics
  await supabaseAdmin.rpc('increment_ots_attestation_count', { agent_pk: agent_pubkey });
  
  // 8. Return success
  return {
    statusCode: 200,
    body: JSON.stringify({
      success: true,
      proof_hash,
      ots_proof_file_url,
      proof_status: 'pending',
      ots_proof_record_id: proofRecord.id,
    }),
  };
};
```

**Database Function (Supabase):**
```sql
-- Create helper function to increment OTS attestation count
CREATE OR REPLACE FUNCTION increment_ots_attestation_count(agent_pk TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE agent_profiles
  SET ots_attestation_count = ots_attestation_count + 1,
      last_ots_attestation_at = NOW()
  WHERE agent_pubkey = agent_pk;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Supabase Storage Bucket Setup:**
```sql
-- Create ots-proofs bucket (run in Supabase SQL Editor)
INSERT INTO storage.buckets (id, name, public)
VALUES ('ots-proofs', 'ots-proofs', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policy: Public read for confirmed proofs
CREATE POLICY ots_proofs_public_read
  ON storage.objects FOR SELECT
  USING (bucket_id = 'ots-proofs');

-- RLS policy: Service role only for upload
CREATE POLICY ots_proofs_service_write
  ON storage.objects FOR INSERT
  TO service_role
  WITH CHECK (bucket_id = 'ots-proofs');
```

---

#### Step 1.2: Add Proof Generation Triggers to Existing Event Publishing Flows

**Files to Modify:**
1. `lib/central_event_publishing_service.ts` — For kind 1985 attestations
2. `netlify/functions/agents/credit-envelope-lifecycle.ts` — For kind 39242 envelopes
3. (Future) Settlement receipt publishing — For kind 39244
4. (Future) Default notice publishing — For kind 39245

**Example: Add trigger to credit envelope creation**

**File:** `netlify/functions/agents/credit-envelope-lifecycle.ts`

**Modification:**
```typescript
// After line 403 (after publishing kind 39240 intent event)

// Queue OTS proof generation for credit envelope (kind 39242)
try {
  await fetch('/.netlify/functions/ots-proof-generator', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      attested_event_kind: 39242,
      attested_event_id: intentEvent.id,
      agent_pubkey: request.agent_pubkey,
      data: JSON.stringify(intentEvent),
      storage_backend: 'supabase',
    }),
  });
} catch (error) {
  // Non-fatal: log error but don't block envelope creation
  console.warn('OTS proof generation failed (non-fatal):', error);
}
```

**Example: Add trigger to guardian attestation publishing**

**File:** `lib/central_event_publishing_service.ts`

**Modification:** (Find where kind 1985 events are published, add similar trigger)

---

#### Step 1.3: Create Proof Confirmation Polling Function

**File:** `netlify/functions/ots-proof-confirmation-poller.ts`

**Purpose:** Cron job that polls pending proofs and updates status when Bitcoin block is confirmed

**Implementation:**
```typescript
// netlify/functions/ots-proof-confirmation-poller.ts
import { Handler } from '@netlify/functions';
import { supabaseAdmin } from './supabase.js';
import { OpenTimestampsClient } from '@alexalves87/opentimestamps-client';

export const handler: Handler = async (event) => {
  // Verify this is a scheduled function call
  if (event.httpMethod !== 'POST' || event.headers['x-netlify-event'] !== 'schedule') {
    return { statusCode: 403, body: 'Forbidden' };
  }
  
  // Query pending proofs (created within last 7 days)
  const { data: pendingProofs, error } = await supabaseAdmin
    .from('ots_proof_records')
    .select('*')
    .eq('proof_status', 'pending')
    .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
  
  if (error || !pendingProofs) {
    console.error('Failed to query pending proofs:', error);
    return { statusCode: 500, body: 'Error' };
  }
  
  let confirmedCount = 0;
  let failedCount = 0;
  
  for (const proof of pendingProofs) {
    try {
      // Download .ots proof file from storage
      const response = await fetch(proof.ots_proof_file_url);
      const otsProofBytes = await response.arrayBuffer();
      
      // Verify proof using OpenTimestamps client
      const otsClient = new OpenTimestampsClient();
      const verifyResult = await otsClient.verify(Buffer.from(otsProofBytes));
      
      if (verifyResult && verifyResult.bitcoinBlockHeight) {
        // Proof confirmed!
        await supabaseAdmin
          .from('ots_proof_records')
          .update({
            proof_status: 'confirmed',
            bitcoin_block_height: verifyResult.bitcoinBlockHeight,
            confirmed_at: new Date().toISOString(),
          })
          .eq('id', proof.id);
        
        confirmedCount++;
      }
    } catch (error) {
      // Check if proof is older than 7 days — mark as failed
      const createdAt = new Date(proof.created_at);
      const ageInDays = (Date.now() - createdAt.getTime()) / (24 * 60 * 60 * 1000);
      
      if (ageInDays > 7) {
        await supabaseAdmin
          .from('ots_proof_records')
          .update({ proof_status: 'failed' })
          .eq('id', proof.id);
        
        failedCount++;
      }
    }
  }
  
  return {
    statusCode: 200,
    body: JSON.stringify({
      success: true,
      pending_proofs_checked: pendingProofs.length,
      confirmed: confirmedCount,
      failed: failedCount,
    }),
  };
};
```

**netlify.toml:**
```toml
[[functions]]
  name = "ots-proof-confirmation-poller"
  schedule = "*/10 * * * *"  # Every 10 minutes
```

---

### Phase 2: Guardian UI Components (Days 4-6)

#### Step 2.1: Create OTS Proof Status Badge Component

**File:** `src/components/ots/OTSProofStatusBadge.tsx`

**Purpose:** Visual indicator for proof status (pending/confirmed/failed)

**Implementation:**
```typescript
// src/components/ots/OTSProofStatusBadge.tsx
import React from 'react';

interface OTSProofStatusBadgeProps {
  status: 'pending' | 'confirmed' | 'failed';
  bitcoinBlockHeight?: number;
  confirmedAt?: Date;
}

export const OTSProofStatusBadge: React.FC<OTSProofStatusBadgeProps> = ({
  status,
  bitcoinBlockHeight,
  confirmedAt,
}) => {
  const statusConfig = {
    pending: {
      color: 'bg-yellow-100 text-yellow-800',
      icon: '⏳',
      label: 'Pending Confirmation',
    },
    confirmed: {
      color: 'bg-green-100 text-green-800',
      icon: '✓',
      label: 'Confirmed',
    },
    failed: {
      color: 'bg-red-100 text-red-800',
      icon: '✗',
      label: 'Failed',
    },
  };
  
  const config = statusConfig[status];
  
  return (
    <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${config.color}`}>
      <span className="mr-2">{config.icon}</span>
      <span>{config.label}</span>
      {status === 'confirmed' && bitcoinBlockHeight && (
        <span className="ml-2 text-xs">
          Block #{bitcoinBlockHeight}
        </span>
      )}
    </div>
  );
};
```

---

#### Step 2.2: Create OTS Proof List Component

**File:** `src/components/ots/OTSProofList.tsx`

**Purpose:** List all OTS proofs for agents under guardian's control

**Implementation:**
```typescript
// src/components/ots/OTSProofList.tsx
import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { OTSProofStatusBadge } from './OTSProofStatusBadge';
import type { OTSProofRecord } from '../../../types/database';

interface OTSProofListProps {
  agentPubkey?: string; // Optional: filter by specific agent
}

export const OTSProofList: React.FC<OTSProofListProps> = ({ agentPubkey }) => {
  const [proofs, setProofs] = useState<OTSProofRecord[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    async function fetchProofs() {
      let query = supabase
        .from('ots_proof_records')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (agentPubkey) {
        query = query.eq('agent_pubkey', agentPubkey);
      }
      
      const { data, error } = await query;
      
      if (error) {
        console.error('Failed to fetch OTS proofs:', error);
      } else {
        setProofs(data || []);
      }
      
      setLoading(false);
    }
    
    fetchProofs();
  }, [agentPubkey]);
  
  if (loading) {
    return <div>Loading OTS proofs...</div>;
  }
  
  if (proofs.length === 0) {
    return <div>No OTS proofs found.</div>;
  }
  
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">OpenTimestamps Proofs</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Event</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {proofs.map((proof) => (
              <tr key={proof.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  Kind {proof.attested_event_kind}
                  <br />
                  <span className="text-gray-500 text-xs">{proof.attested_event_id?.slice(0, 16)}...</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <OTSProofStatusBadge
                    status={proof.proof_status}
                    bitcoinBlockHeight={proof.bitcoin_block_height || undefined}
                    confirmedAt={proof.confirmed_at ? new Date(proof.confirmed_at) : undefined}
                  />
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(proof.created_at).toLocaleString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <a
                    href={proof.ots_proof_file_url}
                    download={`${proof.proof_hash}.ots`}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    Download .ots
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
```

---

#### Step 2.3: Create OTS Proof Verifier Component

**File:** `src/components/ots/OTSProofVerifier.tsx`

**Purpose:** Verify individual OTS proof (download .ots file, verify against original data, display Bitcoin block height and timestamp)

**Implementation:**
```typescript
// src/components/ots/OTSProofVerifier.tsx
import React, { useState } from 'react';
import { localValidateOtsProof } from '../../lib/simpleproof/opentimestampsLocalValidator';

interface OTSProofVerifierProps {
  proofFileUrl: string;
  originalData: string;
  proofHash: string;
}

export const OTSProofVerifier: React.FC<OTSProofVerifierProps> = ({
  proofFileUrl,
  originalData,
  proofHash,
}) => {
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{
    status: 'valid' | 'invalid' | 'inconclusive';
    reason?: string;
  } | null>(null);
  
  async function handleVerify() {
    setVerifying(true);
    
    try {
      // Download .ots proof file
      const response = await fetch(proofFileUrl);
      const otsProofBytes = await response.arrayBuffer();
      const otsProofHex = Array.from(new Uint8Array(otsProofBytes))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      
      // Verify using local validator
      const result = await localValidateOtsProof({
        data: originalData,
        otsProofHex,
      });
      
      setVerificationResult(result);
    } catch (error) {
      setVerificationResult({
        status: 'inconclusive',
        reason: error instanceof Error ? error.message : 'Verification failed',
      });
    } finally {
      setVerifying(false);
    }
  }
  
  return (
    <div className="space-y-4">
      <button
        onClick={handleVerify}
        disabled={verifying}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
      >
        {verifying ? 'Verifying...' : 'Verify Proof'}
      </button>
      
      {verificationResult && (
        <div className={`p-4 rounded ${
          verificationResult.status === 'valid' ? 'bg-green-100' :
          verificationResult.status === 'invalid' ? 'bg-red-100' :
          'bg-yellow-100'
        }`}>
          <p className="font-semibold">
            {verificationResult.status === 'valid' ? '✓ Proof Valid' :
             verificationResult.status === 'invalid' ? '✗ Proof Invalid' :
             '⚠ Verification Inconclusive'}
          </p>
          {verificationResult.reason && (
            <p className="text-sm mt-2">{verificationResult.reason}</p>
          )}
        </div>
      )}
    </div>
  );
};
```

---

### Phase 3: Integration with Existing Flows (Days 7-8)

#### Step 3.1: Add "Verify Proof" Button to Settlement Receipts

**File:** (Wherever settlement receipts are displayed in the UI)

**Modification:**
```typescript
import { OTSProofVerifier } from '../components/ots/OTSProofVerifier';

// In settlement receipt component
<OTSProofVerifier
  proofFileUrl={settlementReceipt.ots_proof_file_url}
  originalData={JSON.stringify(settlementReceipt.nostr_event)}
  proofHash={settlementReceipt.proof_hash}
/>
```

---

#### Step 3.2: Add Proof Generation Metrics to Agent Dashboard

**File:** (Agent dashboard component)

**Modification:**
```typescript
// Display agent OTS metrics
<div className="stats-card">
  <h4>OpenTimestamps Proofs</h4>
  <p className="text-2xl font-bold">{agent.ots_attestation_count}</p>
  <p className="text-sm text-gray-500">
    Last proof: {agent.last_ots_attestation_at ? new Date(agent.last_ots_attestation_at).toLocaleString() : 'Never'}
  </p>
</div>
```

---

## 4. TESTING STRATEGY

### 4.1 Unit Tests

**File:** `tests/ots/proof-generation.test.ts`

**Tests:**
- ✅ Proof hash computation is deterministic
- ✅ OTS proof file is valid format
- ✅ Supabase Storage upload succeeds
- ✅ `ots_proof_records` row is inserted correctly
- ✅ Agent metrics are updated (`ots_attestation_count`, `last_ots_attestation_at`)

### 4.2 Integration Tests

**File:** `tests/ots/proof-generation-integration.test.ts`

**Tests:**
- ✅ End-to-end proof generation for kind 39242 envelope
- ✅ Proof confirmation polling updates status from 'pending' to 'confirmed'
- ✅ Failed proofs are marked as 'failed' after 7 days
- ✅ Guardian UI displays proofs correctly

### 4.3 End-to-End Test

**Manual Test Scenario:**
1. Create a credit envelope (kind 39242)
2. Verify OTS proof generation is triggered (check `ots_proof_records` table)
3. Download .ots proof file from Supabase Storage
4. Verify proof using OpenTimestamps client
5. Wait for Bitcoin block confirmation (or simulate)
6. Verify proof status updates to 'confirmed'
7. View proof in guardian UI
8. Download and verify proof in UI

---

## 5. ROLLOUT STRATEGY

### 5.1 Feature Flag

**Environment Variable:** `VITE_OTS_AGENT_PROOFS_ENABLED`

**Default:** `false` (opt-in)

**Rollout Phases:**
1. **Phase 1 (Week 1):** Internal testing only (`VITE_OTS_AGENT_PROOFS_ENABLED=true` for dev environment)
2. **Phase 2 (Week 2):** Beta testing with select guardians (opt-in via Control Board UI)
3. **Phase 3 (Week 3):** General availability (default enabled for all new agents)

### 5.2 Backward Compatibility

**Existing Flows:**
- ✅ Human user OTS flows (`simpleproof-timestamp.ts`, `nip03-attestation-service.ts`) remain unchanged
- ✅ Agent proof generation is additive (no breaking changes to existing event publishing)
- ✅ Proof generation failures are non-fatal (events publish successfully even if proof fails)

### 5.3 Monitoring

**Metrics to Track:**
- Proof generation success rate (% of events that successfully generate proofs)
- Proof confirmation rate (% of pending proofs that confirm within 24 hours)
- Proof generation latency (time from event publish to proof file upload)
- Storage costs (total size of .ots files in Supabase Storage)

**Alerts:**
- Proof generation failure rate > 10%
- Proof confirmation rate < 90% after 48 hours
- Storage bucket approaching quota

---

## 6. SUMMARY

### What Exists (Reusable)
- ✅ OTS proof generation (`simpleproof-timestamp.ts`)
- ✅ NIP-03 publishing (`nip03-attestation-service.ts`)
- ✅ OTS proof validation (`opentimestampsLocalValidator.ts`)
- ✅ Supabase Storage integration
- ✅ Rate limiting, error tracking, logging

### What Needs to Be Built
- 🔴 **HIGH:** `ots-proof-generator.js` (agent-specific proof generation)
- 🔴 **HIGH:** Proof generation triggers in event publishing flows
- 🔴 **HIGH:** Proof metadata persistence to `ots_proof_records` table
- 🟠 **MEDIUM:** `ots-proof-confirmation-poller.ts` (cron job)
- 🟠 **MEDIUM:** Guardian UI components (`OTSProofList.tsx`, `OTSProofVerifier.tsx`, `OTSProofStatusBadge.tsx`)
- 🟡 **LOW:** Agent metrics updates

### Architecture Decisions
- ✅ **Asynchronous proof generation** (non-blocking)
- ✅ **Supabase Storage default** (multi-backend support future)
- ✅ **Event listener hooks** for proof generation triggers
- ✅ **Cron job polling** for proof confirmation (every 10 minutes)

### Testing & Rollout
- ✅ Unit tests, integration tests, end-to-end manual test
- ✅ Feature flag (`VITE_OTS_AGENT_PROOFS_ENABLED`)
- ✅ Phased rollout (internal → beta → general availability)
- ✅ Backward compatibility maintained

**Implementation is ready to proceed.**

