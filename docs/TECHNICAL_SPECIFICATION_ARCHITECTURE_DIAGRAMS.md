# Architecture Diagrams and Integration Guide

## 1. Decentralized Identity Verification System Architecture

```mermaid
graph TB
    User["User Login"]
    
    User -->|NIP-05 Lookup| HybridVerifier["Hybrid NIP-05 Verifier"]
    
    HybridVerifier -->|Priority 1| Kind0["Nostr kind:0 Resolution"]
    HybridVerifier -->|Priority 2| PKARR["PKARR/DHT Resolution"]
    HybridVerifier -->|Priority 3| DNS["DNS Resolution"]
    
    Kind0 -->|Query Relays| CEPS["Central Event Publishing Service"]
    CEPS -->|Relay Pool| Relays["Nostr Relays"]
    
    PKARR -->|DHT Query| DHT["BitTorrent DHT"]
    DHT -->|Fallback| DNS
    
    DNS -->|DNS Lookup| DNSServer[".well-known/nostr.json"]
    
    Kind0 -->|Verify| VerifyResult["Verification Result"]
    PKARR -->|Verify| VerifyResult
    DNS -->|Verify| VerifyResult
    
    VerifyResult -->|Store| Database["Database<br/>nip05_records<br/>pkarr_records"]
    VerifyResult -->|Return| User
    
    style Kind0 fill:#90EE90
    style PKARR fill:#FFD700
    style DNS fill:#FFB6C6
    style VerifyResult fill:#87CEEB
```

## 2. Proof-of-Personhood and Unique Personhood System

```mermaid
graph TB
    User["User Account"]
    
    User -->|PoP Calculation| PopCalc["PoP Score Calculator"]
    
    PopCalc -->|35%| NFC["NFC Verification<br/>0-100"]
    PopCalc -->|35%| Social["Social Attestations<br/>0-100"]
    PopCalc -->|30%| Time["Time-Based<br/>0-100"]
    
    NFC -->|Self/Peer/Guardian Scans| NFCScore["NFC Score"]
    Social -->|Peer Attestations| SocialScore["Social Score"]
    Time -->|Account Age + Activity| TimeScore["Time Score"]
    
    NFCScore -->|Weighted| PopScore["PoP Score<br/>0-100"]
    SocialScore -->|Weighted| PopScore
    TimeScore -->|Weighted| PopScore
    
    User -->|UP Calculation| UpCalc["UP Score Calculator"]
    
    UpCalc -->|FROST Sharding| Sharding["Identity Sharding<br/>Threshold: 3/4"]
    UpCalc -->|Guardian Consensus| Consensus["Duplicate Detection<br/>Voting"]
    UpCalc -->|Trust Escalation| Escalation["Progressive Trust<br/>Levels"]
    
    Sharding -->|Distribute| Guardians["Guardian Shards"]
    Consensus -->|Vote| DuplicateCheck["Duplicate Verdict"]
    Escalation -->|Promote| RoleHierarchy["Role Hierarchy<br/>private→offspring→adult→steward→guardian"]
    
    PopScore -->|Combined| TrustLevel["Trust Level<br/>0-100"]
    DuplicateCheck -->|Verified| TrustLevel
    RoleHierarchy -->|Assigned| TrustLevel
    
    TrustLevel -->|Store| Database["Database<br/>pop_attestations<br/>identity_shards<br/>duplicate_votes"]
    
    style PopScore fill:#90EE90
    style DuplicateCheck fill:#FFD700
    style TrustLevel fill:#87CEEB
```

## 3. Progressive Trust System Architecture

```mermaid
graph TB
    User["User Activity"]
    
    User -->|Record| ActionLog["Action Logger"]
    
    ActionLog -->|Payment| PaymentWeight["Lightning: +5<br/>Cashu: +4<br/>Fedimint: +6"]
    ActionLog -->|Social| SocialWeight["Attestation: +10<br/>NFC Scan: +4"]
    ActionLog -->|Governance| GovWeight["Guardian Approval: +20<br/>Federation: +25"]
    
    PaymentWeight -->|Aggregate| ReputationScore["Reputation Score<br/>0-100"]
    SocialWeight -->|Aggregate| ReputationScore
    GovWeight -->|Aggregate| ReputationScore
    
    ReputationScore -->|Decay| DecayCalc["Decay Calculator<br/>Exponential: -15 @ 180d"]
    
    DecayCalc -->|Check| DecayStatus["Decay Status<br/>active/warning/at_risk/critical"]
    
    DecayStatus -->|Prevent| PreventionActions["Login / Payment / Message"]
    
    ReputationScore -->|Checkpoint| Checkpoints["Checkpoints<br/>7d: +5<br/>30d: +15<br/>90d: +25<br/>180d: +35<br/>365d: +50"]
    
    Checkpoints -->|Escalate| TrustEscalation["Trust Escalation<br/>Check PoP + UP"]
    
    TrustEscalation -->|Promote| RolePromotion["Role Promotion<br/>private→offspring→adult→steward→guardian"]
    
    RolePromotion -->|Gate| FeatureGates["Feature Gates<br/>basic: 0<br/>cashu: 25<br/>lightning: 50<br/>federation: 50<br/>guardian: 75<br/>admin: 90"]
    
    FeatureGates -->|Unlock| Features["Available Features"]
    
    style ReputationScore fill:#90EE90
    style TrustEscalation fill:#FFD700
    style FeatureGates fill:#87CEEB
```

## 4. Infrastructure Decentralization Architecture

```mermaid
graph TB
    subgraph Phase1["Phase 1: Self-Hosted"]
        Docker["Docker Compose<br/>Frontend + Functions + DB"]
        K8s["Kubernetes<br/>Multi-replica deployment"]
        DBAbstract["Database Abstraction<br/>PostgreSQL / SQLite"]
    end
    
    subgraph Phase2["Phase 2: Multi-Platform"]
        Netlify["Netlify Functions<br/>Current"]
        AWS["AWS Lambda<br/>Terraform"]
        GCP["GCP Cloud Functions<br/>YAML"]
        Adapter["Serverless Adapter<br/>Unified Interface"]
    end
    
    subgraph Phase3["Phase 3: Federation"]
        Instance1["Instance 1<br/>satnam.pub"]
        Instance2["Instance 2<br/>satnam.local"]
        Instance3["Instance 3<br/>satnam.family"]
        Discovery["Instance Discovery<br/>Nostr kind:30078"]
        Federation["Federation Protocol<br/>Cross-instance verification"]
    end
    
    Docker --> K8s
    K8s --> DBAbstract
    
    Netlify --> Adapter
    AWS --> Adapter
    GCP --> Adapter
    
    Instance1 --> Discovery
    Instance2 --> Discovery
    Instance3 --> Discovery
    Discovery --> Federation
    
    DBAbstract -.->|Supports| Adapter
    
    style Docker fill:#90EE90
    style Adapter fill:#FFD700
    style Federation fill:#87CEEB
```

## 5. Integration Points with Existing Code

### 5.1 Decentralized Identity Integration

```
lib/pubky-enhanced-client.ts
├── Activate PubkyDHTClient
├── Implement publishRecord()
└── Implement resolveRecord()

lib/central_event_publishing_service.ts
├── Add IdentityResolutionService
├── Implement resolveIdentityFromKind0()
└── Add kind:0 event caching

src/lib/nip05-verification.ts
├── Refactor to HybridNIP05Verifier
├── Implement verifyWithMethod()
└── Add verification result storage

netlify/functions_active/nip05-resolver.ts
├── Update to use HybridNIP05Verifier
├── Add PKARR resolution endpoint
└── Add monitoring/alerting
```

### 5.2 PoP/UP Integration

```
src/lib/pop/nfc-verification.ts
├── Extend src/lib/nfc-auth.ts
├── Implement calculateNFCScore()
└── Add NFC verification tracking

src/lib/pop/social-attestation.ts
├── Extend encrypted_contacts table
├── Implement calculateSocialScore()
└── Add attestation Nostr events

src/lib/up/identity-sharding.ts
├── Extend src/lib/frost/
├── Implement createIdentityShards()
└── Add shard distribution

src/lib/up/duplicate-detection.ts
├── Implement initiateDuplicateVote()
├── Implement checkDuplicateConsensus()
└── Add guardian voting
```

### 5.3 Progressive Trust Integration

```
src/lib/trust/progressive-escalation.ts
├── Extend src/lib/trust/trust-score.ts
├── Implement calculateTrustDelta()
└── Add checkpoint tracking

src/lib/trust/action-reputation.ts
├── Implement recordAction()
├── Implement calculateReputationScore()
└── Add action weighting

src/lib/trust/feature-gates.ts
├── Implement isFeatureAvailable()
├── Implement getLockedFeatures()
└── Add feature gate mapping

src/components/FeatureGate.tsx
├── New component for locked features
├── Display requirements
└── Show next milestone
```

### 5.4 Infrastructure Integration

```
docker-compose.yml
├── Frontend service
├── Functions service
├── PostgreSQL service
└── Phoenixd service

netlify/functions/utils/serverless-adapter.ts
├── NetlifyAdapter
├── AWSLambdaAdapter
└── GCPAdapter

src/lib/database/db-adapter.ts
├── DatabaseAdapter interface
├── PostgresAdapter
└── SQLiteAdapter

src/lib/federation/federation-protocol.ts
├── FederationManager
├── Instance discovery
└── Cross-instance verification
```

---

## 6. Data Flow Diagrams

### 6.1 User Registration with PoP/UP

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Functions
    participant Database
    participant CEPS
    participant Relays
    
    User->>Frontend: Register with NIP-05
    Frontend->>Functions: POST /api/auth/register
    Functions->>Database: Create user_identities
    Functions->>Database: Create pop_time_metrics
    Functions->>Database: Create identity_shards
    Functions->>CEPS: Publish kind:0 event
    CEPS->>Relays: Publish to relays
    Functions->>Database: Record checkpoint (day 0)
    Functions->>Frontend: Return JWT token
    Frontend->>User: Registration complete
```

### 6.2 Trust Escalation Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Functions
    participant Database
    participant TrustService
    
    User->>Frontend: Perform action (payment)
    Frontend->>Functions: POST /api/action/record
    Functions->>Database: Insert reputation_actions
    Functions->>TrustService: Calculate new score
    TrustService->>Database: Check checkpoints
    alt Checkpoint reached
        TrustService->>Database: Record checkpoint reward
        TrustService->>Database: Check role promotion
        alt Eligible for promotion
            TrustService->>Database: Update user role
            TrustService->>Frontend: Notify promotion
        end
    end
    Functions->>Frontend: Return updated trust score
```

---

## 7. Testing Strategy

### 7.1 Unit Tests

```typescript
// tests/lib/pop/nfc-verification.test.ts
describe('NFCVerificationService', () => {
  it('should calculate NFC score correctly', () => {
    const verifications = [
      { verification_type: 'self_scan' },
      { verification_type: 'peer_scan' },
      { verification_type: 'guardian_scan' }
    ];
    const score = service.calculateNFCScore(verifications);
    expect(score).toBe(45); // 10 + 15 + 20
  });
});

// tests/lib/trust/progressive-escalation.test.ts
describe('TimeBasedEscalationService', () => {
  it('should award checkpoint bonus at 30 days', () => {
    const user = { createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
    const checkpoints = service.checkCheckpoints(user);
    expect(checkpoints).toContainEqual({ checkpoint: 'month_one', trustBonus: 15 });
  });
});
```

### 7.2 Integration Tests

```typescript
// tests/integration/identity-verification.test.ts
describe('Hybrid Identity Verification', () => {
  it('should verify via kind:0 first', async () => {
    const result = await verifier.verify('alice@satnam.pub');
    expect(result.method).toBe('kind0');
  });
  
  it('should fallback to PKARR if kind:0 fails', async () => {
    // Mock kind:0 failure
    const result = await verifier.verify('bob@satnam.pub');
    expect(result.method).toBe('pkarr');
  });
});
```

### 7.3 Security Audits

- [ ] Cryptographic operations audit (FROST, PBKDF2, AES-256-GCM)
- [ ] Database RLS policy audit
- [ ] API endpoint authentication audit
- [ ] Nostr event signature verification audit
- [ ] Shard encryption audit

---

## 8. Rollout Plan

### Phase 1: Feature Flags (Week 1-2)
```bash
VITE_HYBRID_IDENTITY_ENABLED=false
VITE_POP_SYSTEM_ENABLED=false
VITE_UP_SYSTEM_ENABLED=false
VITE_PROGRESSIVE_TRUST_ENABLED=false
```

### Phase 2: Gradual Rollout (Week 3-4)
- 10% of users → 25% → 50% → 100%
- Monitor error rates and performance
- Collect user feedback

### Phase 3: Full Deployment (Week 5+)
- Enable for all users
- Monitor trust score distribution
- Adjust weights if needed

---

## 9. Rollback Procedures

```bash
# Disable feature
VITE_HYBRID_IDENTITY_ENABLED=false

# Revert database changes
psql -f database/rollback/001_revert_pkarr.sql

# Clear caches
redis-cli FLUSHDB

# Restart services
docker-compose restart
```


