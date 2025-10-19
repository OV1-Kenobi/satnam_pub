# Implementation Guide and Integration Checklist

## Overview

This guide provides step-by-step instructions for implementing the four major enhancement areas with minimal disruption to existing functionality.

---

## Part 1: Decentralized Identity Verification (Weeks 1-5)

### Week 1: Foundation Setup

**Tasks:**
1. Create database schema for PKARR records
2. Activate and refactor `lib/pubky-enhanced-client.ts`
3. Add feature flag `VITE_PKARR_ENABLED`

**Implementation Steps:**

```bash
# 1. Create migration file
cat > database/migrations/002_add_pkarr_records.sql << 'EOF'
CREATE TABLE IF NOT EXISTS public.pkarr_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_identities(id) ON DELETE CASCADE,
  pkarr_key TEXT NOT NULL UNIQUE,
  pkarr_secret TEXT NOT NULL,
  domain TEXT NOT NULL,
  nip05_username TEXT NOT NULL,
  npub TEXT NOT NULL,
  dht_published_at TIMESTAMPTZ,
  dht_verified_at TIMESTAMPTZ,
  dns_fallback_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_pkarr_domain ON public.pkarr_records(domain);
CREATE INDEX idx_pkarr_nip05 ON public.pkarr_records(nip05_username);

ALTER TABLE public.pkarr_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_pkarr" ON public.pkarr_records
  FOR ALL USING (user_id = auth.uid());
EOF

# 2. Apply migration
psql -d satnam -f database/migrations/002_add_pkarr_records.sql

# 3. Add feature flag to .env
echo "VITE_PKARR_ENABLED=false" >> .env.local
```

**Code Changes:**

```typescript
// File: src/config/env.client.ts (add)
export const PKARR_ENABLED = 
  (process.env.VITE_PKARR_ENABLED as string) === 'true';
```

### Week 2: Kind:0 Integration

**Tasks:**
1. Extend CEPS with kind:0 resolution
2. Add caching for kind:0 events
3. Implement conflict resolution logic

**Implementation Steps:**

```typescript
// File: lib/central_event_publishing_service.ts (add method)
async resolveIdentityFromKind0(npub: string): Promise<IdentityData | null> {
  const cacheKey = `kind0:${npub}`;
  const cached = this.cache.get(cacheKey);
  
  if (cached && !this.isCacheExpired(cached)) {
    return cached.value;
  }
  
  try {
    const events = await this.list(
      [{ kinds: [0], authors: [npub] }],
      undefined,
      { eoseTimeout: 5000 }
    );
    
    if (events.length === 0) return null;
    
    const latestEvent = events.sort((a, b) => b.created_at - a.created_at)[0];
    const metadata = JSON.parse(latestEvent.content);
    
    const result: IdentityData = {
      nip05: metadata.nip05,
      name: metadata.name,
      picture: metadata.picture,
      verificationTags: latestEvent.tags,
      source: 'kind0'
    };
    
    this.cache.set(cacheKey, { value: result, expiry: Date.now() + 3600000 });
    return result;
  } catch (error) {
    console.error('kind:0 resolution failed:', error);
    return null;
  }
}
```

### Week 3: Hybrid Verification System

**Tasks:**
1. Refactor `src/lib/nip05-verification.ts` to support multiple methods
2. Implement verification priority system
3. Add verification result storage

**Implementation Steps:**

```typescript
// File: src/lib/nip05-verification.ts (refactor)
export class HybridNIP05Verifier {
  private verificationMethods = [
    { name: 'kind0', priority: 1, timeout: 5000 },
    { name: 'pkarr', priority: 2, timeout: 3000 },
    { name: 'dns', priority: 3, timeout: 5000 }
  ];

  async verify(nip05: string): Promise<VerificationResult> {
    const chain: VerificationAttempt[] = [];
    
    for (const method of this.verificationMethods) {
      try {
        const result = await this.verifyWithMethod(method.name, nip05);
        chain.push({ method: method.name, success: result.success });
        
        if (result.success) {
          // Store verification result
          await this.storeVerificationResult(nip05, method.name, result);
          return { ...result, method: method.name, chain };
        }
      } catch (error) {
        chain.push({ method: method.name, success: false, error: String(error) });
      }
    }
    
    throw new Error('All verification methods failed');
  }

  private async storeVerificationResult(
    nip05: string,
    method: string,
    result: any
  ): Promise<void> {
    await supabase.from('nip05_records').upsert({
      nip05,
      npub: result.npub,
      verification_method: method,
      verification_chain: JSON.stringify([method]),
      last_verified_at: new Date().toISOString(),
      next_reverify_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    });
  }
}
```

### Week 4: Monitoring and Alerting

**Tasks:**
1. Add verification failure tracking
2. Implement health check endpoint
3. Set up alerts for degraded services

**Implementation Steps:**

```typescript
// File: netlify/functions_active/health-check.ts (new)
export const handler = async (event: any) => {
  const health = {
    kind0_relay_health: await checkKind0Health(),
    pkarr_dht_health: await checkPkarrHealth(),
    dns_resolution_health: await checkDNSHealth(),
    average_resolution_time_ms: 0,
    failure_rate_24h: 0
  };
  
  // Calculate metrics
  const failures = await supabase
    .from('verification_failures')
    .select('count')
    .gte('timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  
  health.failure_rate_24h = (failures.data?.[0]?.count || 0) / 1000;
  
  return {
    statusCode: 200,
    body: JSON.stringify(health)
  };
};
```

### Week 5: Testing and Documentation

**Tasks:**
1. Write integration tests
2. Create user documentation
3. Perform security audit

**Test Coverage:**
- [ ] kind:0 resolution works
- [ ] PKARR DHT queries work
- [ ] DNS fallback works
- [ ] Verification results stored correctly
- [ ] Cache expiration works
- [ ] Conflict resolution works

---

## Part 2: PoP/UP System (Weeks 6-12)

### Week 6-7: NFC Verification

**Tasks:**
1. Create NFC verification schema
2. Implement NFC score calculation
3. Extend existing NFC auth

**Implementation Steps:**

```bash
# Create migration
cat > database/migrations/003_add_nfc_verifications.sql << 'EOF'
CREATE TABLE IF NOT EXISTS public.nfc_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_identities(id) ON DELETE CASCADE,
  nfc_tag_id TEXT NOT NULL,
  verification_type VARCHAR(20) CHECK (verification_type IN ('self_scan', 'peer_scan', 'guardian_scan')),
  verified_by_user_id UUID REFERENCES user_identities(id),
  verification_timestamp TIMESTAMPTZ NOT NULL,
  location_hash TEXT,
  device_fingerprint_hash TEXT,
  nfc_score_contribution SMALLINT DEFAULT 10,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_nfc_user ON public.nfc_verifications(user_id);
CREATE INDEX idx_nfc_timestamp ON public.nfc_verifications(verification_timestamp);

ALTER TABLE public.nfc_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_nfc" ON public.nfc_verifications
  FOR ALL USING (user_id = auth.uid());
EOF

psql -d satnam -f database/migrations/003_add_nfc_verifications.sql
```

### Week 8-9: Social Attestations

**Tasks:**
1. Create attestation schema
2. Implement attestation Nostr events
3. Add social score calculation

**Implementation Steps:**

```bash
# Create migration
cat > database/migrations/004_add_pop_attestations.sql << 'EOF'
CREATE TABLE IF NOT EXISTS public.pop_attestations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attester_id UUID NOT NULL REFERENCES user_identities(id) ON DELETE CASCADE,
  attestee_id UUID NOT NULL REFERENCES user_identities(id) ON DELETE CASCADE,
  attestation_type VARCHAR(20) CHECK (attestation_type IN ('peer_verification', 'guardian_approval', 'social_proof')),
  nostr_event_id TEXT,
  attestation_data JSONB,
  weight SMALLINT DEFAULT 10,
  verified_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(attester_id, attestee_id, attestation_type)
);

CREATE INDEX idx_attestations_attestee ON public.pop_attestations(attestee_id);
CREATE INDEX idx_attestations_verified ON public.pop_attestations(verified_at);

ALTER TABLE public.pop_attestations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_see_own_attestations" ON public.pop_attestations
  FOR SELECT USING (attestee_id = auth.uid() OR attester_id = auth.uid());
EOF

psql -d satnam -f database/migrations/004_add_pop_attestations.sql
```

### Week 10-11: Identity Sharding and Duplicate Detection

**Tasks:**
1. Create identity shards schema
2. Implement FROST-based sharding
3. Add duplicate detection voting

**Implementation Steps:**

```bash
# Create migration
cat > database/migrations/005_add_identity_shards.sql << 'EOF'
CREATE TABLE IF NOT EXISTS public.identity_shards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_identities(id) ON DELETE CASCADE,
  shard_index SMALLINT NOT NULL,
  guardian_id UUID NOT NULL REFERENCES user_identities(id),
  encrypted_shard TEXT NOT NULL,
  shard_commitment TEXT,
  threshold SMALLINT NOT NULL,
  total_shards SMALLINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, shard_index)
);

CREATE TABLE IF NOT EXISTS public.duplicate_detection_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suspected_duplicate_user_id UUID NOT NULL REFERENCES user_identities(id),
  original_user_id UUID NOT NULL REFERENCES user_identities(id),
  voting_guardian_id UUID NOT NULL REFERENCES user_identities(id),
  vote VARCHAR(10) CHECK (vote IN ('duplicate', 'not_duplicate', 'abstain')),
  evidence TEXT,
  voted_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(suspected_duplicate_user_id, voting_guardian_id)
);

CREATE INDEX idx_shards_user ON public.identity_shards(user_id);
CREATE INDEX idx_shards_guardian ON public.identity_shards(guardian_id);
CREATE INDEX idx_votes_suspected ON public.duplicate_detection_votes(suspected_duplicate_user_id);

ALTER TABLE public.identity_shards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duplicate_detection_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "guardians_see_own_shards" ON public.identity_shards
  FOR SELECT USING (guardian_id = auth.uid());
EOF

psql -d satnam -f database/migrations/005_add_identity_shards.sql
```

### Week 12: Testing and UI Components

**Tasks:**
1. Write PoP/UP tests
2. Create UI components for PoP/UP scores
3. Perform security audit

---

## Part 3: Infrastructure Decentralization (Weeks 13-22)

### Week 13-15: Docker/Kubernetes Setup

**Tasks:**
1. Create Dockerfile for frontend
2. Create Dockerfile for functions
3. Create docker-compose.yml
4. Create Kubernetes manifests

**Implementation Steps:**

```bash
# Build and test locally
docker-compose build
docker-compose up -d

# Test endpoints
curl http://localhost/api/health
curl http://localhost:3000/api/health

# Deploy to Kubernetes
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml
```

### Week 16-18: Database Abstraction

**Tasks:**
1. Create database adapter interface
2. Implement PostgreSQL adapter
3. Implement SQLite adapter
4. Create migration scripts

### Week 19-21: Serverless Abstraction

**Tasks:**
1. Create serverless adapter interface
2. Implement AWS Lambda adapter
3. Implement GCP Cloud Functions adapter
4. Test on all platforms

### Week 22: Federation Protocol

**Tasks:**
1. Implement instance discovery
2. Implement cross-instance verification
3. Test federation with 2+ instances

---

## Part 4: Progressive Trust System (Weeks 23-29)

### Week 23-24: Time-Based Escalation

**Tasks:**
1. Create trust history schema
2. Implement checkpoint system
3. Add trust escalation logic

### Week 25-26: Action-Based Reputation

**Tasks:**
1. Create reputation actions schema
2. Implement action weighting
3. Add reputation decay

### Week 27-28: Feature Gates

**Tasks:**
1. Create feature gate mapping
2. Implement feature gate service
3. Create UI components for locked features

### Week 29: Testing and Documentation

**Tasks:**
1. Write comprehensive tests
2. Create user documentation
3. Create developer documentation

---

## Integration Checklist

### Pre-Implementation
- [ ] Review all specifications with team
- [ ] Identify potential conflicts with existing code
- [ ] Plan database migration strategy
- [ ] Set up feature flags
- [ ] Create rollback procedures

### During Implementation
- [ ] Write tests as you go
- [ ] Document all changes
- [ ] Get code reviews
- [ ] Test on staging environment
- [ ] Monitor performance metrics

### Post-Implementation
- [ ] Gradual rollout (10% → 25% → 50% → 100%)
- [ ] Monitor error rates
- [ ] Collect user feedback
- [ ] Adjust weights/thresholds if needed
- [ ] Document lessons learned

---

## Backward Compatibility

All changes maintain backward compatibility:

1. **Existing users** continue to work with DNS-based NIP-05
2. **New features** are opt-in via feature flags
3. **Database migrations** are idempotent
4. **API endpoints** are versioned
5. **Rollback procedures** are documented

---

## Performance Considerations

### Caching Strategy
- kind:0 events: 1 hour TTL
- PKARR records: 30 minutes TTL
- DNS results: 5 minutes TTL
- Trust scores: 5 minutes TTL

### Database Optimization
- Add indexes on frequently queried columns
- Use connection pooling
- Implement query caching
- Monitor slow queries

### API Rate Limiting
- Identity verification: 10 req/min per user
- Trust score updates: 1 req/min per user
- Attestation creation: 5 req/min per user

---

## Security Considerations

### Cryptographic Operations
- Use @noble/@scure libraries only
- Implement constant-time comparisons
- Validate all signatures
- Encrypt sensitive data at rest

### Database Security
- Enable RLS on all sensitive tables
- Use parameterized queries
- Implement audit logging
- Regular security audits

### API Security
- Require authentication for all endpoints
- Implement rate limiting
- Validate all inputs
- Use HTTPS only


