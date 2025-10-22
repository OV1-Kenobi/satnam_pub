# Trust Scoring System Enhancement Analysis
## Integrating Brainstorm.world and NIP-85 Trusted Assertions

**Date**: October 22, 2025  
**Status**: Analysis Complete - Ready for Implementation Planning

---

## Executive Summary

This document analyzes two external resources for enhancing Satnam.pub's trust scoring system:

1. **Brainstorm.world** - A personalized Web of Trust (WoT) relay using GrapeRank algorithm
2. **NIP-85** - Nostr protocol standard for Trusted Assertions (kind 30382/30383/30384 events)

Both resources offer complementary approaches to trust scoring that can significantly enhance Satnam.pub's existing progressive trust system.

---

## 1. Brainstorm.world Analysis

### 1.1 Core Technology

**Web of Trust Model**: Grapevine Algorithm
- Calculates personalized trust scores based on Nostr follows/mutes/reports
- Generates three metrics per user:
  - **GrapeRank**: Personalized ranking (0-100)
  - **PageRank**: Global influence score
  - **Hops**: Degrees of separation (network distance)

**Architecture**:
- Neo4j graph database for relationship storage
- strfry Nostr relay for content filtering
- Customizable parameters (blacklist, whitelist, GrapeRank tuning)
- Publishes results as NIP-85 kind 30382 events

### 1.2 Key Insights for Satnam.pub

| Aspect | Brainstorm | Satnam.pub Current | Enhancement Opportunity |
|--------|-----------|-------------------|------------------------|
| **Calculation** | Graph-based (Neo4j) | Action-based (weights) | Add graph-based social metrics |
| **Metrics** | GrapeRank, PageRank, Hops | Trust score (0-100) | Integrate multi-metric approach |
| **Distribution** | NIP-85 events | Database only | Publish trust assertions to Nostr |
| **Customization** | Per-relay parameters | Fixed weights | Allow user-configurable trust models |
| **Privacy** | Relay-scoped | User-scoped | Maintain zero-knowledge architecture |

### 1.3 Recommended Integration Points

1. **Social Graph Analysis**: Add optional Neo4j integration for calculating network distance
2. **Multi-Metric Trust**: Extend trust_score to include rank, hops, and influence metrics
3. **NIP-85 Publishing**: Publish personalized trust assertions to Nostr relays
4. **Customizable Models**: Allow users to select trust calculation models

---

## 2. NIP-85 Trusted Assertions Analysis

### 2.1 Specification Overview

**Purpose**: Enable service providers to publish computed trust metrics as signed Nostr events

**Event Kinds**:
- **Kind 30382**: User-level assertions (followers, rank, zap amounts, etc.)
- **Kind 30383**: Event-level assertions (comment count, zap count, rank)
- **Kind 30384**: Address-level assertions (for long-form content)
- **Kind 10040**: User's trusted service provider declarations

### 2.2 NIP-85 Event Structure

```typescript
// Kind 30382 - User Rank Assertion
{
  kind: 30382,
  tags: [
    ["d", "pubkey"],  // Subject pubkey
    ["p", "pubkey", "relay-url"],  // Relay hint
    ["rank", "89"],  // Normalized 0-100
    ["followers", "1500"],
    ["zap_amt_sent", "1000000"],
  ],
  content: "",  // Empty or encrypted
  pubkey: "service-provider-pubkey",
  sig: "..."
}

// Kind 10040 - User's Trusted Providers
{
  kind: 10040,
  tags: [
    ["30382:rank", "provider-pubkey", "wss://relay.url"],
    ["30382:followers", "provider-pubkey", "wss://relay.url"],
  ],
  content: nip44Encrypt(JSON.stringify([
    ["30383:rank", "provider-pubkey", "wss://relay.url"],
  ])),
}
```

### 2.3 Key Advantages for Satnam.pub

1. **Decentralized Distribution**: Trust scores published to Nostr network
2. **Client Interoperability**: Any NIP-85-compliant client can consume scores
3. **Multiple Providers**: Users can trust multiple scoring services
4. **Cryptographic Verification**: All assertions are signed and verifiable
5. **Privacy Options**: Encrypted content for sensitive metrics

---

## 3. Integration Recommendations

### 3.1 Database Schema Enhancements

**New Table: `nip85_assertions`**
```sql
CREATE TABLE nip85_assertions (
  id UUID PRIMARY KEY,
  user_id TEXT REFERENCES user_identities(id),
  assertion_kind INT,  -- 30382, 30383, 30384
  subject_pubkey TEXT,  -- Target of assertion
  metrics JSONB,  -- {rank: 89, followers: 1500, ...}
  published_at TIMESTAMPTZ,
  relay_urls TEXT[],  -- Where published
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE trusted_providers (
  id UUID PRIMARY KEY,
  user_id TEXT REFERENCES user_identities(id),
  provider_pubkey TEXT,
  assertion_kind INT,
  relay_url TEXT,
  trust_level INT,  -- 1-5 confidence
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.2 Service Implementation

**New Service: `NIP85PublishingService`**
- Converts trust_history records to NIP-85 kind 30382 events
- Publishes to configured relays via CEPS
- Manages provider declarations (kind 10040)
- Handles encryption for sensitive metrics

**Enhanced Service: `TrustScoringService`**
- Integrate GrapeRank-style metrics (optional Neo4j)
- Calculate network distance (hops)
- Generate multi-metric trust profiles
- Support multiple trust models

### 3.3 CEPS Integration

```typescript
// Publish trust assertion
await CEPS.publishNIP85Assertion({
  kind: 30382,
  subject: userPubkey,
  metrics: {
    rank: 89,
    followers: 1500,
    zap_amt_sent: 1000000,
  },
  relays: ["wss://relay.satnam.pub"],
});

// Fetch trusted provider assertions
const assertions = await CEPS.fetchNIP85Assertions({
  subject: targetPubkey,
  providers: trustedProviders,
  kinds: [30382],
});
```

---

## 4. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)
- [ ] Create NIP-85 database schema
- [ ] Implement NIP85PublishingService
- [ ] Add CEPS NIP-85 publishing methods
- [ ] Create kind 10040 provider declaration UI

### Phase 2: Integration (Weeks 3-4)
- [ ] Integrate with existing trust_history
- [ ] Add multi-metric trust calculation
- [ ] Implement provider trust management
- [ ] Create NIP-85 assertion fetching

### Phase 3: Enhancement (Weeks 5-6)
- [ ] Optional Neo4j integration for GrapeRank
- [ ] Network distance calculation
- [ ] User-configurable trust models
- [ ] Trust assertion caching

### Phase 4: UI & Testing (Weeks 7-8)
- [ ] Trust provider selection UI
- [ ] Trust metric visualization
- [ ] End-to-end testing
- [ ] Security audit

---

## 5. Security & Privacy Considerations

### 5.1 Zero-Knowledge Architecture Compliance

✅ **Maintained**:
- Trust assertions published to Nostr (not stored centrally)
- User can choose which providers to trust
- Encrypted metrics for sensitive data
- No nsec exposure in assertions

### 5.2 Privacy-First Principles

✅ **Preserved**:
- Per-user trust models
- Encrypted provider declarations (kind 10040 content)
- Optional anonymization of metrics
- RLS policies on trust_history

### 5.3 Security Considerations

⚠️ **Risks & Mitigations**:
1. **Provider Spoofing**: Verify provider pubkey signatures (CEPS handles)
2. **Metric Manipulation**: Rate limit assertion publishing
3. **Relay Censorship**: Support multiple relay providers
4. **Privacy Leakage**: Encrypt sensitive metrics in kind 10040

---

## 6. Compatibility Matrix

| Component | Brainstorm | NIP-85 | Satnam.pub | Status |
|-----------|-----------|--------|-----------|--------|
| Noble V2 Encryption | ✅ | ✅ | ✅ | Compatible |
| CEPS Integration | ✅ | ✅ | ✅ | Ready |
| Zero-Knowledge | ✅ | ✅ | ✅ | Maintained |
| Privacy-First | ✅ | ✅ | ✅ | Preserved |
| Netlify Functions | ✅ | ✅ | ✅ | Compatible |

---

## 7. Next Steps

1. **Review & Approval**: Present analysis to stakeholders
2. **Detailed Planning**: Create implementation specification
3. **Database Migration**: Design schema changes
4. **Service Development**: Implement NIP85PublishingService
5. **Testing**: Comprehensive test suite
6. **Deployment**: Staged rollout with monitoring

---

## References

- **Brainstorm Repository**: https://github.com/Pretty-Good-Freedom-Tech/brainstorm
- **NIP-85 Specification**: https://github.com/vitorpamplona/nips/blob/user-summaries/85.md
- **Satnam.pub Trust System**: `src/lib/trust/`
- **CEPS Documentation**: `lib/central_event_publishing_service.ts`


