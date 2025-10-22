# Phase 1: NIP-85 Trust Provider Implementation Plan

**Objective**: Transform Satnam.pub into a NIP-85 Trust Provider that publishes user trust scores to the Nostr network while maintaining zero-knowledge architecture and privacy-first principles.

**Timeline**: 2 weeks (10 working days)  
**Status**: READY FOR IMPLEMENTATION  
**Primary Relay**: wss://relay.satnam.pub

---

## Executive Summary

This plan outlines the implementation of NIP-85 Trusted Assertions support in Satnam.pub, enabling:

1. ✅ Satnam.pub acts as a trusted service provider publishing kind 30382 events
2. ✅ Users control exposure of their trust scores (public/contacts/whitelist/private)
3. ✅ Public API for external Nostr clients to query trust scores
4. ✅ All trust assertions published to wss://relay.satnam.pub
5. ✅ Zero-knowledge architecture maintained (no nsec exposure)
6. ✅ Privacy-first principles (opt-in, not opt-out)

---

## Week 1: Foundation & Database

### Day 1-2: Database Schema & Migrations

**Task 1.1**: Create `trust_provider_preferences` table
```sql
CREATE TABLE IF NOT EXISTS trust_provider_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES user_identities(id) ON DELETE CASCADE,
  exposure_level VARCHAR(20) NOT NULL DEFAULT 'private' 
    CHECK (exposure_level IN ('public', 'contacts', 'whitelist', 'private')),
  visible_metrics JSONB DEFAULT '["rank", "followers", "hops", "influence", "reliability", "recency", "composite"]',
  whitelisted_pubkeys TEXT[] DEFAULT '{}',
  encryption_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- RLS Policy: Users can only manage their own preferences
ALTER TABLE trust_provider_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY trust_provider_preferences_user_isolation 
  ON trust_provider_preferences FOR ALL 
  USING (user_id = auth.uid()::text);
```

**Task 1.2**: Create `nip85_assertions` table
```sql
CREATE TABLE IF NOT EXISTS nip85_assertions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES user_identities(id) ON DELETE CASCADE,
  assertion_kind INT NOT NULL CHECK (assertion_kind IN (30382, 30383, 30384)),
  subject_pubkey TEXT NOT NULL,
  metrics JSONB NOT NULL,
  event_id TEXT UNIQUE,
  published_at TIMESTAMPTZ,
  relay_urls TEXT[] DEFAULT ARRAY['wss://relay.satnam.pub'],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, assertion_kind, subject_pubkey)
);

-- RLS Policy: Users can only see their own assertions
ALTER TABLE nip85_assertions ENABLE ROW LEVEL SECURITY;
CREATE POLICY nip85_assertions_user_isolation 
  ON nip85_assertions FOR ALL 
  USING (user_id = auth.uid()::text);
```

**Task 1.3**: Create `trust_query_audit_log` table
```sql
CREATE TABLE IF NOT EXISTS trust_query_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queried_user_id TEXT REFERENCES user_identities(id) ON DELETE CASCADE,
  querier_pubkey TEXT,
  query_type VARCHAR(50),  -- 'api', 'relay', 'internal'
  ip_hash TEXT,
  user_agent_hash TEXT,
  success BOOLEAN,
  metrics_returned JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for performance
CREATE INDEX idx_trust_query_audit_queried_user 
  ON trust_query_audit_log(queried_user_id, created_at DESC);
```

**Deliverable**: Migration file `035_nip85_trust_provider.sql`

---

### Day 3-4: NIP85PublishingService Implementation

**Task 1.4**: Create `src/lib/trust/nip85-publishing.ts`

Core methods:
- `publishUserAssertion(userId, targetPubkey, metrics, relayUrls)` - Publish kind 30382
- `publishEventAssertion(userId, eventId, metrics, relayUrls)` - Publish kind 30383
- `publishAddressAssertion(userId, address, metrics, relayUrls)` - Publish kind 30384
- `publishProviderDeclaration(relayUrls)` - Publish kind 10040 (Satnam.pub as provider)
- `fetchTrustedAssertions(userId, targetPubkey, kinds)` - Query assertions from relays
- `encryptMetricsIfNeeded(metrics, encryptionEnabled)` - NIP-44 encryption

**Key Features**:
- CEPS integration for all Nostr operations
- Relay health monitoring
- Fallback relay support
- Signature verification
- Rate limiting (100 events/hour per user)

**Deliverable**: Production-ready service with >80% test coverage

---

### Day 5: Feature Flags & Environment Configuration

**Task 1.5**: Add feature flags to `src/config/env.client.ts`
```typescript
trustProviderEnabled: boolean;  // VITE_TRUST_PROVIDER_ENABLED
trustPublicApiEnabled: boolean; // VITE_TRUST_PUBLIC_API_ENABLED
```

**Task 1.6**: Update `netlify.toml` with environment variables
```toml
[context.production.environment]
VITE_TRUST_PROVIDER_ENABLED = "true"
VITE_TRUST_PUBLIC_API_ENABLED = "true"
VITE_TRUST_PROVIDER_RELAY = "wss://relay.satnam.pub"
```

**Deliverable**: Feature flags configured with safe defaults (disabled)

---

## Week 2: API & UI Implementation

### Day 6-7: Public API Endpoint

**Task 2.1**: Create `netlify/functions_active/trust-query.ts`

Endpoint: `GET /api/trust/query?npub={npub}&metrics=rank,followers`

Features:
- Accept npub or hex pubkey
- Check user's exposure preferences
- Return NIP-85 formatted assertions
- Rate limiting (100 requests/hour per IP)
- CORS support
- Audit logging
- Relay hints in response

Response format:
```json
{
  "success": true,
  "pubkey": "hex_pubkey",
  "exposure_level": "public",
  "metrics": {
    "rank": 85,
    "followers": 1500,
    "hops": 2,
    "influence": 72,
    "reliability": 90,
    "recency": 95,
    "composite": 82
  },
  "relay_hints": ["wss://relay.satnam.pub"],
  "published_at": "2025-10-22T12:00:00Z"
}
```

**Task 2.2**: Create `netlify/functions_active/trust-provider-config.ts`

Endpoint: `GET /api/trust/provider-config`

Returns:
- Satnam.pub provider info
- Supported metrics
- Relay URLs
- API documentation link

---

### Day 8: User Settings UI Component

**Task 2.3**: Create `src/components/TrustProviderSettings.tsx`

Features:
- Exposure level selector (public/contacts/whitelist/private)
- Metric visibility toggles
- Whitelist management (add/remove npubs)
- Encryption preference toggle
- Save/cancel buttons
- Success/error notifications

**Task 2.4**: Integrate into Settings page
- Add "Trust Provider" section to Settings.tsx
- Link from user profile
- Help text explaining privacy implications

---

### Day 9: CEPS Integration & Publishing

**Task 2.5**: Extend CEPS with NIP-85 methods

Add to `lib/central_event_publishing_service.ts`:
```typescript
async publishNIP85Assertion(
  kind: 30382 | 30383 | 30384,
  dTag: string,
  metrics: Array<[string, string]>,
  relayUrls: string[]
): Promise<string>

async publishProviderDeclaration(
  relayUrls: string[]
): Promise<string>
```

**Task 2.6**: Implement background publishing job
- Publish trust scores daily at 2 AM UTC
- Retry failed publishes
- Monitor relay health
- Log all publishing events

---

### Day 10: Testing & Documentation

**Task 2.7**: Comprehensive Testing

Unit tests:
- NIP85PublishingService methods
- Metric calculation
- Encryption/decryption
- RLS policy enforcement

Integration tests:
- Full trust score publishing flow
- API endpoint responses
- Privacy preference enforcement
- Audit logging

Security tests:
- No nsec exposure
- No PII leakage
- Rate limiting effectiveness
- Signature verification

**Task 2.8**: Documentation

- API documentation with examples
- User guide for trust provider settings
- Developer guide for third-party integration
- Security audit report

**Deliverable**: >80% test coverage, all tests passing

---

## Database Schema Summary

| Table | Purpose | Key Columns |
|-------|---------|------------|
| `trust_provider_preferences` | User privacy settings | user_id, exposure_level, visible_metrics, whitelisted_pubkeys |
| `nip85_assertions` | Published assertions | user_id, assertion_kind, subject_pubkey, metrics, event_id |
| `trust_query_audit_log` | Query audit trail | queried_user_id, querier_pubkey, ip_hash, success |

---

## API Endpoints

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/api/trust/query` | GET | Query public trust scores | None (rate limited) |
| `/api/trust/provider-config` | GET | Get provider info | None |
| `/api/trust/preferences` | GET/POST/PUT | Manage user preferences | JWT |
| `/api/trust/publish` | POST | Manually publish assertions | JWT |

---

## Feature Flags

| Flag | Default | Purpose |
|------|---------|---------|
| `VITE_TRUST_PROVIDER_ENABLED` | false | Enable trust provider functionality |
| `VITE_TRUST_PUBLIC_API_ENABLED` | false | Enable public API endpoint |
| `VITE_TRUST_PROVIDER_RELAY` | wss://relay.satnam.pub | Primary relay URL |

---

## Success Criteria

✅ Users can configure trust score exposure preferences  
✅ Trust scores published to wss://relay.satnam.pub as NIP-85 events  
✅ External Nostr clients can query public trust scores via API  
✅ All privacy controls enforced (no data leaks)  
✅ API rate limiting prevents abuse  
✅ >80% test coverage  
✅ Zero regressions in existing tests  
✅ Security audit passed  

---

## Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| **Relay unavailability** | Medium | High | Fallback relays, health monitoring |
| **Privacy leakage** | Low | Critical | RLS policies, audit logging, security tests |
| **API abuse** | Medium | Medium | Rate limiting, IP blocking, monitoring |
| **Performance degradation** | Low | Medium | Caching, async publishing, monitoring |

---

## Next Steps

1. ✅ Review and approve implementation plan
2. ⏭️ Create database migration file
3. ⏭️ Implement NIP85PublishingService
4. ⏭️ Create API endpoints
5. ⏭️ Build UI components
6. ⏭️ Comprehensive testing
7. ⏭️ Security audit
8. ⏭️ Staged deployment


