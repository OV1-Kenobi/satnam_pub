# Part 1: Decentralized Identity Verification System Specification

## Overview

This specification defines a unified decentralized identity verification system that integrates three complementary approaches:
1. **Pubky/PKARR** — BitTorrent DHT-based decentralized DNS
2. **Nostr kind:0** — Decentralized metadata events as primary identity source
3. **Hybrid verification** — Intelligent fallback system with DNS as last resort

### Current State Analysis

**Existing Components:**
- `lib/pubky-enhanced-client.ts` — Pubky client (inactive)
- `netlify/functions_active/nip05-resolver.ts` — DNS-based NIP-05 verification
- `src/lib/nip05-verification.ts` — NIP-05 verification logic
- `lib/central_event_publishing_service.ts` (CEPS) — Nostr event publishing
- `database/privacy-first-schema.sql` — Current schema

**Current Flow:**
```
User Login → NIP-05 lookup → DNS .well-known/nostr.json → npub verification
```

**Target Flow:**
```
User Login → Verify via:
  1. Nostr kind:0 (primary)
  2. PKARR/DHT (secondary)
  3. DNS (fallback)
```

---

## 1. Pubky/PKARR Integration

### 1.1 Architecture Overview

**PKARR (Public Key Address Record)** uses BitTorrent DHT to store DNS-like records without centralized registrars.

**Integration Points:**
- Replace DNS lookups in `nip05-resolver.ts`
- Activate `pubky-enhanced-client.ts` for DHT operations
- Add PKARR record storage to database schema
- Implement DHT discovery with fallback to DNS

### 1.2 Database Schema Changes

```sql
-- New table for PKARR records (add to privacy-first-schema.sql)
CREATE TABLE IF NOT EXISTS public.pkarr_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_identities(id) ON DELETE CASCADE,
  pkarr_key TEXT NOT NULL UNIQUE,  -- Public key for DHT
  pkarr_secret TEXT NOT NULL,      -- Encrypted secret for updates
  domain TEXT NOT NULL,             -- e.g., "alice.satnam.pub"
  nip05_username TEXT NOT NULL,
  npub TEXT NOT NULL,
  dht_published_at TIMESTAMPTZ,
  dht_verified_at TIMESTAMPTZ,
  dns_fallback_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_pkarr_domain ON public.pkarr_records(domain);
CREATE INDEX idx_pkarr_nip05 ON public.pkarr_records(nip05_username);

-- RLS Policy
ALTER TABLE public.pkarr_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_pkarr" ON public.pkarr_records
  FOR ALL USING (user_id = auth.uid());
```

### 1.3 API Endpoint Specification

**Endpoint: POST /api/identity/pkarr/publish**

```typescript
// Request
{
  nip05: "alice@satnam.pub",
  npub: "npub1...",
  dnsEnabled: true  // Allow DNS fallback
}

// Response
{
  success: true,
  pkarrKey: "z32_encoded_key",
  dhtPublished: true,
  dnsStatus: "active",
  ttl: 3600
}
```

**Endpoint: GET /api/identity/pkarr/resolve?domain=alice.satnam.pub**

```typescript
// Response
{
  success: true,
  source: "pkarr" | "dns" | "nostr",
  nip05: "alice@satnam.pub",
  npub: "npub1...",
  verifiedAt: "2025-10-18T...",
  ttl: 3600
}
```

### 1.4 Implementation: Activate Pubky Client

**File: `lib/pubky-enhanced-client.ts` (refactor)**

```typescript
export class PubkyDHTClient {
  private dhtNode: any;
  private cache: Map<string, CachedRecord> = new Map();
  private readonly CACHE_TTL = 3600000; // 1 hour

  async publishRecord(
    domain: string,
    nip05: string,
    npub: string
  ): Promise<PublishResult> {
    // 1. Generate PKARR keypair
    const keypair = await this.generatePkarrKeypair();
    
    // 2. Create DNS record
    const record = {
      name: domain,
      type: "TXT",
      value: JSON.stringify({ nip05, npub }),
      ttl: 3600
    };
    
    // 3. Publish to DHT
    const published = await this.dhtNode.put(keypair, record);
    
    // 4. Store in database
    await this.storePkarrRecord(domain, keypair, record);
    
    return { success: published, pkarrKey: keypair.publicKey };
  }

  async resolveRecord(domain: string): Promise<ResolveResult> {
    // 1. Check cache
    const cached = this.cache.get(domain);
    if (cached && !this.isCacheExpired(cached)) {
      return cached.value;
    }
    
    // 2. Query DHT
    try {
      const record = await this.dhtNode.get(domain);
      this.cache.set(domain, { value: record, expiry: Date.now() + this.CACHE_TTL });
      return record;
    } catch (error) {
      // 3. Fallback to DNS
      return await this.resolveDNS(domain);
    }
  }
}
```

### 1.5 Migration Path: DNS → PKARR

**Phase 1: Dual Publishing (Week 1)**
- Publish to both DNS and PKARR simultaneously
- Feature flag: `VITE_PKARR_DUAL_PUBLISH=true`

**Phase 2: PKARR Primary (Week 2)**
- Query PKARR first, DNS as fallback
- Feature flag: `VITE_PKARR_PRIMARY=true`

**Phase 3: DNS Optional (Week 3)**
- DNS only for legacy users
- Feature flag: `VITE_DNS_FALLBACK_ONLY=true`

---

## 2. Nostr-Based Identity as Primary Source

### 2.1 Architecture: kind:0 as Identity Source

**Nostr kind:0 (Metadata) Event Structure:**

```json
{
  "kind": 0,
  "content": {
    "name": "Alice",
    "about": "Bitcoin educator",
    "picture": "https://...",
    "nip05": "alice@satnam.pub",
    "lud16": "alice@satnam.pub",
    "website": "https://satnam.pub"
  },
  "tags": [
    ["identity_verified", "true"],
    ["verification_method", "nfc"],
    ["verification_timestamp", "1729267200"]
  ]
}
```

### 2.2 Integration with CEPS

**File: `lib/central_event_publishing_service.ts` (extend)**

```typescript
export class IdentityResolutionService {
  async resolveIdentityFromKind0(npub: string): Promise<IdentityData> {
    // 1. Query relays for latest kind:0 event
    const events = await CEPS.list(
      [{ kinds: [0], authors: [npub] }],
      undefined,
      { eoseTimeout: 5000 }
    );
    
    // 2. Get most recent event
    const latestEvent = events.sort((a, b) => b.created_at - a.created_at)[0];
    
    // 3. Parse and validate
    const metadata = JSON.parse(latestEvent.content);
    return {
      nip05: metadata.nip05,
      name: metadata.name,
      picture: metadata.picture,
      verificationTags: latestEvent.tags
    };
  }
}
```

### 2.3 Conflict Resolution

**Priority System:**

```typescript
async resolveIdentity(nip05: string): Promise<IdentityData> {
  const results = {
    kind0: await this.resolveFromKind0(nip05),
    pkarr: await this.resolveFromPkarr(nip05),
    dns: await this.resolveDNS(nip05)
  };
  
  // Verify consistency
  if (results.kind0 && results.pkarr && results.kind0.npub === results.pkarr.npub) {
    return results.kind0; // Consensus: use kind:0
  }
  
  if (results.kind0) return results.kind0;
  if (results.pkarr) return results.pkarr;
  return results.dns;
}
```

---

## 3. Hybrid Verification System

### 3.1 Refactored NIP-05 Verification

**File: `src/lib/nip05-verification.ts` (refactor)**

```typescript
export class HybridNIP05Verifier {
  private verificationMethods = [
    { name: 'kind0', priority: 1, timeout: 5000 },
    { name: 'pkarr', priority: 2, timeout: 3000 },
    { name: 'dns', priority: 3, timeout: 5000 }
  ];

  async verify(nip05: string): Promise<VerificationResult> {
    for (const method of this.verificationMethods) {
      try {
        const result = await this.verifyWithMethod(method.name, nip05);
        if (result.success) {
          return { ...result, method: method.name };
        }
      } catch (error) {
        console.warn(`${method.name} verification failed, trying next...`);
      }
    }
    throw new Error('All verification methods failed');
  }
}
```

### 3.2 Verification Result Storage

**Extend `nip05_records` table:**

```sql
ALTER TABLE public.nip05_records ADD COLUMN IF NOT EXISTS (
  verification_method VARCHAR(20) CHECK (verification_method IN ('kind0', 'pkarr', 'dns')),
  verification_chain TEXT,  -- JSON array of attempted methods
  last_verified_at TIMESTAMPTZ,
  next_reverify_at TIMESTAMPTZ
);
```

---

## 4. Monitoring and Alerting

### 4.1 Verification Failure Tracking

```typescript
async trackVerificationFailure(
  nip05: string,
  method: string,
  error: string
): Promise<void> {
  await supabase.from('verification_failures').insert({
    nip05,
    method,
    error,
    timestamp: new Date().toISOString()
  });
}
```

### 4.2 Health Check Endpoint

**GET /api/health/identity-verification**

```json
{
  "kind0_relay_health": "healthy",
  "pkarr_dht_health": "healthy",
  "dns_resolution_health": "degraded",
  "average_resolution_time_ms": 245,
  "failure_rate_24h": 0.02
}
```

---

## Implementation Timeline

| Week | Task | Dependencies |
|------|------|--------------|
| 1 | Activate Pubky client, add PKARR schema | None |
| 2 | Implement kind:0 resolution in CEPS | Week 1 |
| 3 | Refactor NIP-05 verifier for hybrid mode | Week 1-2 |
| 4 | Add monitoring/alerting | Week 1-3 |
| 5 | User testing & documentation | Week 1-4 |


