# Trust Scoring Enhancement - Implementation Specification

**Status**: Ready for Development  
**Priority**: High (Phase 3B continuation)  
**Estimated Effort**: 6-8 weeks

---

## 1. Database Schema Changes

### 1.1 New Tables

```sql
-- NIP-85 Assertions Storage
CREATE TABLE IF NOT EXISTS nip85_assertions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES user_identities(id) ON DELETE CASCADE,
  assertion_kind INT NOT NULL CHECK (assertion_kind IN (30382, 30383, 30384)),
  subject_pubkey TEXT NOT NULL,  -- Target of assertion
  subject_event_id TEXT,  -- For kind 30383
  subject_address TEXT,  -- For kind 30384
  metrics JSONB NOT NULL,  -- {rank: 89, followers: 1500, ...}
  relay_urls TEXT[] DEFAULT ARRAY[]::TEXT[],
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, assertion_kind, subject_pubkey)
);

-- Trusted Service Providers
CREATE TABLE IF NOT EXISTS trusted_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES user_identities(id) ON DELETE CASCADE,
  provider_pubkey TEXT NOT NULL,
  assertion_kind INT NOT NULL,
  relay_url TEXT NOT NULL,
  trust_level INT CHECK (trust_level BETWEEN 1 AND 5),
  is_encrypted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider_pubkey, assertion_kind)
);

-- Multi-Metric Trust Profiles
CREATE TABLE IF NOT EXISTS trust_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES user_identities(id) ON DELETE CASCADE,
  metric_type VARCHAR(50) NOT NULL,  -- 'rank', 'followers', 'hops', etc.
  metric_value DECIMAL(10, 2),
  calculation_method VARCHAR(50),  -- 'action_based', 'graph_based', 'hybrid'
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, metric_type)
);
```

### 1.2 RLS Policies

```sql
-- Users can only see their own assertions
ALTER TABLE nip85_assertions ENABLE ROW LEVEL SECURITY;
CREATE POLICY nip85_assertions_user_isolation ON nip85_assertions
  FOR ALL USING (user_id = auth.uid()::text);

-- Users can only manage their own providers
ALTER TABLE trusted_providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY trusted_providers_user_isolation ON trusted_providers
  FOR ALL USING (user_id = auth.uid()::text);
```

---

## 2. Service Implementation

### 2.1 NIP85PublishingService

**Location**: `src/lib/trust/nip85-publishing.ts`

```typescript
export class NIP85PublishingService {
  // Publish user-level assertion (kind 30382)
  async publishUserAssertion(
    userId: string,
    targetPubkey: string,
    metrics: Record<string, any>,
    relayUrls: string[]
  ): Promise<void>

  // Publish event-level assertion (kind 30383)
  async publishEventAssertion(
    userId: string,
    eventId: string,
    metrics: Record<string, any>,
    relayUrls: string[]
  ): Promise<void>

  // Publish address-level assertion (kind 30384)
  async publishAddressAssertion(
    userId: string,
    address: string,
    metrics: Record<string, any>,
    relayUrls: string[]
  ): Promise<void>

  // Manage trusted providers (kind 10040)
  async updateTrustedProviders(
    userId: string,
    providers: TrustedProvider[]
  ): Promise<void>

  // Fetch assertions from trusted providers
  async fetchTrustedAssertions(
    userId: string,
    targetPubkey: string,
    kinds?: number[]
  ): Promise<NIP85Assertion[]>
}
```

### 2.2 Enhanced TrustScoringService

**Location**: `src/lib/trust/trust-scoring-enhanced.ts`

```typescript
export interface MultiMetricTrust {
  rank: number;  // 0-100 normalized
  followers: number;
  hops: number;  // Network distance
  influence: number;  // PageRank-style
  reliability: number;  // Based on actions
  recency: number;  // Activity freshness
}

export class EnhancedTrustScoringService {
  // Calculate multi-metric trust profile
  async calculateMultiMetricTrust(
    userId: string,
    targetPubkey: string
  ): Promise<MultiMetricTrust>

  // Calculate network distance (hops)
  async calculateNetworkDistance(
    userId: string,
    targetPubkey: string
  ): Promise<number>

  // Get user's trust model preference
  async getUserTrustModel(userId: string): Promise<TrustModel>

  // Apply custom trust model
  async applyCustomModel(
    metrics: MultiMetricTrust,
    model: TrustModel
  ): Promise<number>
}
```

### 2.3 CEPS Extensions

**Location**: `lib/central_event_publishing_service.ts` (additions)

```typescript
// Add NIP-85 publishing methods
async publishNIP85Assertion(
  kind: 30382 | 30383 | 30384,
  dTag: string,
  metrics: Record<string, string>,
  relayUrls: string[]
): Promise<string>

// Add NIP-85 fetching methods
async fetchNIP85Assertions(
  kind: 30382 | 30383 | 30384,
  dTag: string,
  relayUrls: string[]
): Promise<NostrEvent[]>

// Add kind 10040 management
async publishTrustedProviders(
  providers: Array<{kind: number, pubkey: string, relay: string}>,
  encrypted?: boolean
): Promise<string>
```

---

## 3. UI Components

### 3.1 TrustProviderSelector

**Location**: `src/components/TrustProviderSelector.tsx`

- Display available trust providers
- Allow user to select/deselect providers
- Configure encryption preferences
- Set trust levels (1-5)

### 3.2 TrustMetricsDisplay

**Location**: `src/components/TrustMetricsDisplay.tsx`

- Show multi-metric trust breakdown
- Visualize rank, followers, hops, influence
- Display provider sources
- Show calculation method

### 3.3 TrustModelSelector

**Location**: `src/components/TrustModelSelector.tsx`

- Choose between trust models (action-based, graph-based, hybrid)
- Customize metric weights
- Preview calculated scores

---

## 4. API Endpoints

### 4.1 Netlify Functions

**`netlify/functions_active/nip85-publish.ts`**
- Publish NIP-85 assertions
- Validate metrics
- Handle relay publishing

**`netlify/functions_active/nip85-fetch.ts`**
- Fetch assertions from relays
- Verify signatures
- Cache results

**`netlify/functions_active/trust-providers.ts`**
- Manage trusted providers
- Update kind 10040 events
- Handle encryption

---

## 5. Testing Strategy

### 5.1 Unit Tests

- NIP85PublishingService methods
- Multi-metric calculations
- Trust model application
- Encryption/decryption

### 5.2 Integration Tests

- End-to-end assertion publishing
- Provider management workflow
- CEPS integration
- Database operations

### 5.3 Security Tests

- Signature verification
- RLS policy enforcement
- Encryption validation
- Rate limiting

---

## 6. Migration Path

### 6.1 Backward Compatibility

- Existing trust_score remains unchanged
- New metrics are additive
- Gradual rollout with feature flags
- Fallback to action-based scoring

### 6.2 Data Migration

- Migrate existing trust_history to nip85_assertions
- Populate trust_metrics from current scores
- Create default trusted providers
- Publish initial assertions

---

## 7. Feature Flags

```typescript
// Environment variables
VITE_NIP85_ENABLED=true
VITE_NIP85_RELAY_URLS=wss://relay.satnam.pub,wss://relay.nostr.band
VITE_MULTI_METRIC_TRUST_ENABLED=true
VITE_GRAPH_BASED_TRUST_ENABLED=false  // Neo4j integration (future)
```

---

## 8. Success Criteria

- ✅ All NIP-85 events published correctly
- ✅ Multi-metric trust calculated accurately
- ✅ Provider management working end-to-end
- ✅ Zero-knowledge architecture maintained
- ✅ All tests passing (>80% coverage)
- ✅ Security audit passed
- ✅ Performance: <500ms for trust calculations


