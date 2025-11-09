# VertexLab vs Satnam: Detailed Comparison

**Purpose:** Side-by-side analysis of Web of Trust approaches  
**Audience:** Technical decision-makers, architects  
**Date:** November 9, 2025

---

## 1. Core Algorithm Comparison

### VertexLab: Personalized Pagerank

**Algorithm:**
```
PR(A) = (1-d)/N + d * Σ(PR(B)/L(B))
where:
  d = damping factor (0.85)
  N = total nodes
  B = pages linking to A
  L(B) = outbound links from B
```

**Characteristics:**
- Graph-based (follows relationships)
- Real-time computation
- Personalized variant available
- Handles network topology
- Resistant to Sybil attacks (requires graph position)

**Strengths:**
- ✅ Proven algorithm (Google's original)
- ✅ Captures network influence
- ✅ Personalized variant for custom perspectives
- ✅ Efficient computation (custom data structures)

**Weaknesses:**
- ❌ No action history consideration
- ❌ Slow to adapt to new users
- ❌ Requires full graph computation
- ❌ No privacy controls

### Satnam: Action-Based Reputation + Time Escalation

**Algorithm:**
```
Score = Σ(action_weight * decay_factor) + time_bonus + verification_bonus
where:
  decay_factor = exp(-age_days / 30)
  time_bonus = account_age_factor * activity_factor * success_factor
  verification_bonus = physical_mfa(30) + vp(30) + social_attestations(30)
```

**Characteristics:**
- Action-based (user behavior)
- Time-escalation (account age + activity)
- Exponential decay (30-day half-life)
- Verification-weighted
- Privacy-first (opt-in exposure)

**Strengths:**
- ✅ Rewards consistent behavior
- ✅ Penalizes inactivity
- ✅ Privacy-first design
- ✅ Verification-weighted
- ✅ Transparent (users see actions)

**Weaknesses:**
- ❌ Ignores network topology
- ❌ Slow to detect Sybil attacks
- ❌ Requires action history
- ❌ New users start at 0

---

## 2. Feature Comparison Matrix

| Feature | VertexLab | Satnam | Winner |
|---------|-----------|--------|--------|
| **Real-time Ranking** | ✅ Yes | ⚠️ Cached | VertexLab |
| **Privacy Controls** | ❌ No | ✅ Yes (4-level) | Satnam |
| **Action History** | ❌ No | ✅ Yes | Satnam |
| **Verification Weighting** | ❌ No | ✅ Yes | Satnam |
| **Personalization** | ✅ Yes (PPR) | ⚠️ Limited | VertexLab |
| **Sybil Resistance** | ✅ High | ⚠️ Medium | VertexLab |
| **New User Onboarding** | ❌ Poor | ✅ Good | Satnam |
| **Audit Logging** | ❌ No | ✅ Yes | Satnam |
| **Encryption Support** | ⚠️ Optional | ✅ Yes (NIP-44) | Satnam |
| **Family Federation** | ❌ No | ✅ Yes | Satnam |
| **Rate Limiting** | ✅ Yes | ⚠️ Basic | VertexLab |
| **Batch Operations** | ✅ 1000/req | ⚠️ Single | VertexLab |
| **Cost** | Free | Free | Tie |
| **Relay Dependency** | ✅ Single | ✅ Multiple | Satnam |

---

## 3. Use Case Suitability

### VertexLab Best For:
- Comment sorting (real-time ranking)
- Zap list ranking (batch operations)
- Follow recommendations (discovery)
- Spam filtering (graph-based detection)
- General reputation queries

### Satnam Best For:
- Family governance (role hierarchy)
- Progressive trust (time-based escalation)
- Verification tracking (multi-method)
- Privacy-sensitive applications
- Action-based incentives
- Emergency recovery (family consensus)

### Hybrid (VertexLab + Satnam) Best For:
- Comprehensive trust assessment
- Balanced Sybil resistance
- Privacy-preserving ranking
- Family + social networks
- Monetized trust services

---

## 4. Privacy Model Comparison

### VertexLab Privacy Model
```
Default: Public (no privacy controls)
Exposure: All queries visible to relay operator
Encryption: Not implemented
Audit: Not available
```

**Privacy Score: 2/10**

### Satnam Privacy Model
```
Default: PRIVATE (opt-in)
Exposure Levels:
  - public: visible to all
  - contacts: visible to followers
  - whitelist: visible to specific pubkeys
  - private: not visible (default)
Encryption: Optional NIP-44
Audit: Query audit log with IP hash + user agent hash
```

**Privacy Score: 9/10**

---

## 5. Architecture Comparison

### VertexLab Architecture
```
┌─────────────────────────────────────┐
│   VertexLab Relay                   │
│   (wss://relay.vertexlab.io)        │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ Pagerank Computation Engine │   │
│  │ (Real-time, Personalized)   │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ DVM Services (4 endpoints)  │   │
│  │ - Verify Reputation         │   │
│  │ - Rank Profiles             │   │
│  │ - Recommend Follows         │   │
│  │ - Search Profiles           │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

**Characteristics:**
- Centralized computation
- Single relay dependency
- Stateless (no user data stored)
- Real-time results

### Satnam Architecture
```
┌──────────────────────────────────────────┐
│   Satnam Client (Browser)                │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │ Trust Scoring Services             │ │
│  │ - Action Reputation                │ │
│  │ - Time-Based Escalation            │ │
│  │ - Enhanced Trust Scoring (6-metric)│ │
│  │ - Hybrid Trust (+ VertexLab)       │ │
│  └────────────────────────────────────┘ │
└──────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────┐
│   Supabase (PostgreSQL)                  │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │ Tables:                            │ │
│  │ - trust_history                    │ │
│  │ - reputation_actions               │ │
│  │ - trust_provider_preferences       │ │
│  │ - trust_metrics                    │ │
│  │ - nip85_assertions                 │ │
│  │ - trust_query_audit_log            │ │
│  └────────────────────────────────────┘ │
└──────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────┐
│   Nostr Relays (Multiple)                │
│                                          │
│  - wss://relay.satnam.pub (primary)     │
│  - wss://nos.lol (fallback)             │
│  - wss://relay.damus.io (fallback)      │
└──────────────────────────────────────────┘
```

**Characteristics:**
- Distributed computation
- Multiple relay support
- Stateful (user data in Supabase)
- Cached results (24-hour TTL)

---

## 6. Integration Points

### How They Work Together

```
User Action
    │
    ▼
┌─────────────────────────────────────┐
│ Satnam Action Reputation Service    │
│ - Record action                     │
│ - Calculate decay                   │
│ - Update trust_history              │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ Hybrid Trust Scoring Service        │
│ - Get Satnam metrics (60%)          │
│ - Query VertexLab Pagerank (40%)    │
│ - Blend scores                      │
│ - Store in trust_metrics            │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ Application Layer                   │
│ - Comment sorting                   │
│ - Zap ranking                       │
│ - Follow recommendations            │
│ - Spam filtering                    │
└─────────────────────────────────────┘
```

---

## 7. Performance Comparison

| Metric | VertexLab | Satnam | Hybrid |
|--------|-----------|--------|--------|
| **Single Query Latency** | 100-500ms | 10-50ms | 150-550ms |
| **Batch Query (1000)** | 500-1000ms | N/A | 500-1000ms |
| **Cache Hit Rate** | N/A | 80-90% | 80-90% |
| **Throughput** | 1000 req/s | 10000 req/s | 5000 req/s |
| **Storage** | None | ~1MB/user | ~1.5MB/user |
| **Computation** | Server-side | Client-side | Hybrid |

---

## 8. Cost Analysis

### VertexLab Costs
- **API:** Free (public relay)
- **Relay:** Free (public relay)
- **Computation:** Included
- **Storage:** None
- **Total:** $0/month

### Satnam Costs
- **Database:** Supabase (pay-as-you-go)
  - Storage: ~$0.10/GB
  - Queries: ~$0.001 per 1M queries
- **Relays:** Free (public relays)
- **Computation:** Client-side (free)
- **Total:** $10-50/month at scale

### Hybrid Costs
- **VertexLab:** $0
- **Satnam:** $10-50/month
- **Total:** $10-50/month

---

## 9. Recommendation Summary

### Use VertexLab When:
- ✅ Real-time ranking needed
- ✅ Batch operations (1000+ pubkeys)
- ✅ Discovery is primary use case
- ✅ Privacy not critical
- ✅ Cost is primary concern

### Use Satnam When:
- ✅ Privacy is critical
- ✅ Action history matters
- ✅ Family governance needed
- ✅ Verification tracking required
- ✅ Audit logging needed

### Use Hybrid When:
- ✅ Best of both worlds
- ✅ Balanced Sybil resistance
- ✅ Privacy + real-time ranking
- ✅ Comprehensive trust assessment
- ✅ Family + social networks

---

## 10. Migration Path

### Current State (Satnam Only)
```
User → Satnam Trust Scoring → Application
```

### Phase 1 (Add VertexLab Ranking)
```
User → Satnam Trust Scoring → Application
         ↓
       VertexLab Rank Profiles (for sorting)
```

### Phase 2 (Hybrid Scoring)
```
User → Satnam Trust Scoring ──┐
         ↓                     ├→ Hybrid Scoring → Application
       VertexLab Pagerank ────┘
```

### Phase 3 (Federated Trust)
```
User → Satnam Trust Scoring ──┐
         ↓                     ├→ Hybrid Scoring ──┐
       VertexLab Pagerank ────┘                   ├→ Federated Graph → Application
                                                  │
                              Other Families ────┘
```

---

## Conclusion

**VertexLab and Satnam are complementary, not competitive.** VertexLab excels at real-time graph-based ranking; Satnam excels at privacy-first action-based scoring. Integration creates a unique hybrid approach combining both strengths.

**Recommendation: Proceed with phased integration starting with Tier 1 (Rank Profiles).**

