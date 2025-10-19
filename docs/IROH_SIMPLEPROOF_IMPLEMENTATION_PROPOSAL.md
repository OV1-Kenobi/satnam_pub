# Iroh + SimpleProof Implementation Proposal
## Detailed Technical Specifications for Satnam.pub Integration

**Status**: IMPLEMENTATION READY  
**Date**: 2025-10-19  
**Scope**: Phase 1-3 implementation details

---

## Phase 1: Iroh Node Discovery Integration (Weeks 1-4)

### 1.1 Iroh Library Integration

**Dependencies**:
```toml
[dependencies]
iroh = "0.12.0"
iroh-net = "0.12.0"
pkarr = "1.0.0"
mainline = "0.1.0"
```

**Feature Flags**:
```rust
#[cfg(feature = "iroh-discovery")]
pub mod iroh_discovery;
```

### 1.2 Iroh Discovery Implementation

**File**: `src/lib/iroh-discovery.ts`

```typescript
interface IrohDiscoveryConfig {
  enabled: boolean;
  nodeId: string;
  directAddresses: string[];
  derpUrl: string;
  publishInterval: number; // milliseconds
}

interface IrohDiscoveryResult {
  nodeId: string;
  directAddresses: string[];
  derpUrl: string;
  lastUpdated: number;
  verified: boolean;
}

async function publishIrohDiscovery(
  config: IrohDiscoveryConfig
): Promise<void> {
  // Publish node discovery to DHT
  // Update every publishInterval
}

async function resolveIrohDiscovery(
  nodeId: string
): Promise<IrohDiscoveryResult> {
  // Resolve node from DHT
  // Return addresses and DERP URL
}
```

### 1.3 Database Schema

**Migration**: `database/migrations/033_iroh_discovery.sql`

```sql
CREATE TABLE IF NOT EXISTS public.iroh_discovery (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_duid VARCHAR(50) NOT NULL,
    iroh_node_id VARCHAR(64) NOT NULL UNIQUE,
    direct_addresses TEXT[] NOT NULL,
    derp_url VARCHAR(255) NOT NULL,
    published_at BIGINT NOT NULL,
    verified_at BIGINT,
    is_active BOOLEAN DEFAULT true,
    CONSTRAINT user_duid_fk FOREIGN KEY (user_duid) 
        REFERENCES user_identities(duid)
);

CREATE INDEX idx_iroh_node_id ON public.iroh_discovery(iroh_node_id);
CREATE INDEX idx_user_duid ON public.iroh_discovery(user_duid);
```

### 1.4 Multi-Method Verification Enhancement

**File**: `src/lib/nip05-verification.ts`

```typescript
async function tryIrohResolution(
  nodeId: string
): Promise<VerificationResult> {
  try {
    const discovery = await resolveIrohDiscovery(nodeId);
    
    return {
      method: 'iroh',
      success: discovery.verified,
      data: {
        nodeId: discovery.nodeId,
        addresses: discovery.directAddresses,
        derpUrl: discovery.derpUrl,
        lastUpdated: discovery.lastUpdated
      },
      timestamp: Date.now()
    };
  } catch (error) {
    return {
      method: 'iroh',
      success: false,
      error: error.message,
      timestamp: Date.now()
    };
  }
}
```

### 1.5 Feature Flag Configuration

**File**: `src/config/env.client.ts`

```typescript
export const IROH_DISCOVERY_ENABLED = 
  import.meta.env.VITE_IROH_DISCOVERY_ENABLED === 'true';

export const IROH_PUBLISH_INTERVAL = 
  parseInt(import.meta.env.VITE_IROH_PUBLISH_INTERVAL || '3600000');
```

### 1.6 Testing

**Test File**: `tests/iroh-discovery.test.ts`

```typescript
describe('Iroh Discovery', () => {
  test('should publish node discovery', async () => {
    // Test publishing to DHT
  });
  
  test('should resolve node discovery', async () => {
    // Test resolving from DHT
  });
  
  test('should handle outdated records', async () => {
    // Test handling stale data
  });
});
```

---

## Phase 2: SimpleProof Timestamping Integration (Weeks 5-8)

### 2.1 SimpleProof API Integration

**Dependencies**:
```toml
[dependencies]
reqwest = "0.11"
serde_json = "1.0"
opentimestamps = "0.1.0"
```

**File**: `netlify/functions_active/simpleproof-timestamp.ts`

```typescript
interface SimpleProofConfig {
  apiKey: string;
  apiUrl: string;
  enabled: boolean;
}

interface SimpleProofTimestamp {
  otsProof: string;
  bitcoinBlock: number;
  bitcoinTx: string;
  verifiedAt: number;
}

async function createSimpleProofTimestamp(
  data: string,
  config: SimpleProofConfig
): Promise<SimpleProofTimestamp> {
  // Create timestamp via SimpleProof API
  // Return OTS proof and Bitcoin details
}

async function verifySimpleProofTimestamp(
  otsProof: string
): Promise<boolean> {
  // Verify OTS proof
  // Check Bitcoin blockchain
  // Return verification result
}
```

### 2.2 Database Schema

**Migration**: `database/migrations/034_simpleproof_timestamps.sql`

```sql
CREATE TABLE IF NOT EXISTS public.simpleproof_timestamps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    verification_id UUID NOT NULL,
    ots_proof TEXT NOT NULL,
    bitcoin_block INTEGER,
    bitcoin_tx VARCHAR(64),
    created_at BIGINT NOT NULL,
    verified_at BIGINT,
    is_valid BOOLEAN,
    CONSTRAINT verification_fk FOREIGN KEY (verification_id)
        REFERENCES multi_method_verification_results(id)
);

CREATE INDEX idx_verification_id ON public.simpleproof_timestamps(verification_id);
CREATE INDEX idx_bitcoin_tx ON public.simpleproof_timestamps(bitcoin_tx);
```

### 2.3 Enhanced Trust Scoring

**File**: `src/lib/nip05-verification.ts`

```typescript
interface EnhancedTrustScore {
  baseScore: number;
  simpleproofBonus: number;
  finalScore: number;
  trustLevel: 'very_high' | 'high' | 'medium' | 'low' | 'very_low';
}

function calculateEnhancedTrustScore(
  multiMethodScore: number,
  simpleproofVerified: boolean
): EnhancedTrustScore {
  let bonus = 0;
  
  if (simpleproofVerified) {
    bonus = 10; // +10 points for blockchain verification
  }
  
  const finalScore = Math.min(100, multiMethodScore + bonus);
  
  return {
    baseScore: multiMethodScore,
    simpleproofBonus: bonus,
    finalScore,
    trustLevel: getTrustLevel(finalScore)
  };
}
```

### 2.4 Feature Flag Configuration

**File**: `src/config/env.client.ts`

```typescript
export const SIMPLEPROOF_ENABLED = 
  import.meta.env.VITE_SIMPLEPROOF_ENABLED === 'true';

export const SIMPLEPROOF_API_KEY = 
  import.meta.env.VITE_SIMPLEPROOF_API_KEY || '';

export const SIMPLEPROOF_API_URL = 
  import.meta.env.VITE_SIMPLEPROOF_API_URL || 
  'https://api.simpleproof.com';
```

### 2.5 Testing

**Test File**: `tests/simpleproof-timestamp.test.ts`

```typescript
describe('SimpleProof Timestamping', () => {
  test('should create timestamp', async () => {
    // Test timestamp creation
  });
  
  test('should verify timestamp', async () => {
    // Test verification
  });
  
  test('should handle Bitcoin confirmation', async () => {
    // Test blockchain confirmation
  });
});
```

---

## Phase 3: Full Integration (Weeks 9-12)

### 3.1 UDNA + Iroh Integration

**File**: `src/lib/udna-iroh-integration.ts`

```typescript
interface UDNAIrohAddress {
  did: string;
  facetId: number;
  irohNodeId: string;
  directAddresses: string[];
  derpUrl: string;
  signature: string;
}

async function resolveUDNAWithIroh(
  udnaAddress: string
): Promise<UDNAIrohAddress> {
  // Parse UDNA address
  // Resolve DID
  // Get Iroh discovery
  // Validate signature
  // Return resolved address
}
```

### 3.2 Verification Dashboard

**Component**: `src/components/verification/VerificationDashboard.tsx`

```typescript
interface VerificationDashboardProps {
  userId: string;
}

export function VerificationDashboard({
  userId
}: VerificationDashboardProps) {
  return (
    <div className="verification-dashboard">
      <VerificationMethodsDisplay />
      <IrohDiscoveryStatus />
      <SimpleProofTimestamps />
      <TrustScoreChart />
      <AuditTrail />
    </div>
  );
}
```

### 3.3 Unified Verification Endpoint

**File**: `netlify/functions_active/unified-verification.ts`

```typescript
export const handler = async (event, context) => {
  const { nip05, includeIroh, includeSimpleproof } = JSON.parse(event.body);
  
  const results = {
    kind0: await verifyKind0(nip05),
    pkarr: await verifyPKARR(nip05),
    dns: await verifyDNS(nip05),
    ...(includeIroh && { iroh: await verifyIroh(nip05) }),
    ...(includeSimpleproof && { simpleproof: await verifySimpleproof(nip05) })
  };
  
  const trustScore = calculateTrustScore(results);
  
  return {
    statusCode: 200,
    body: JSON.stringify({ results, trustScore })
  };
};
```

---

## Database Schema Updates

### Combined Schema

```sql
-- Iroh Discovery
CREATE TABLE iroh_discovery (
  id UUID PRIMARY KEY,
  user_duid VARCHAR(50) NOT NULL,
  iroh_node_id VARCHAR(64) NOT NULL UNIQUE,
  direct_addresses TEXT[] NOT NULL,
  derp_url VARCHAR(255) NOT NULL,
  published_at BIGINT NOT NULL,
  verified_at BIGINT,
  is_active BOOLEAN DEFAULT true
);

-- SimpleProof Timestamps
CREATE TABLE simpleproof_timestamps (
  id UUID PRIMARY KEY,
  verification_id UUID NOT NULL,
  ots_proof TEXT NOT NULL,
  bitcoin_block INTEGER,
  bitcoin_tx VARCHAR(64),
  created_at BIGINT NOT NULL,
  verified_at BIGINT,
  is_valid BOOLEAN
);

-- Enhanced Verification Results
CREATE TABLE enhanced_verification_results (
  id UUID PRIMARY KEY,
  user_duid VARCHAR(50) NOT NULL,
  kind0_result JSONB,
  pkarr_result JSONB,
  dns_result JSONB,
  iroh_result JSONB,
  simpleproof_result JSONB,
  base_trust_score INTEGER,
  simpleproof_bonus INTEGER,
  final_trust_score INTEGER,
  trust_level VARCHAR(20),
  created_at BIGINT NOT NULL
);
```

---

## Environment Variables

### Required

```
VITE_IROH_DISCOVERY_ENABLED=true
VITE_IROH_PUBLISH_INTERVAL=3600000
VITE_SIMPLEPROOF_ENABLED=true
VITE_SIMPLEPROOF_API_KEY=your_api_key
VITE_SIMPLEPROOF_API_URL=https://api.simpleproof.com
```

### Optional

```
VITE_IROH_DHT_TIMEOUT=5000
VITE_SIMPLEPROOF_TIMEOUT=10000
VITE_VERIFICATION_CACHE_TTL=3600
```

---

## Rollout Strategy

### Phase 1 Rollout (Week 4)
- 10% of users → 50% → 100%
- Monitor performance and errors
- Gather user feedback

### Phase 2 Rollout (Week 8)
- 10% of users → 50% → 100%
- Monitor blockchain confirmation times
- Adjust SimpleProof settings

### Phase 3 Rollout (Week 12)
- Full integration
- Unified verification dashboard
- Complete audit trail

---

## Success Criteria

### Phase 1
- Iroh discovery working for 95%+ of nodes
- <500ms average lookup time
- Zero performance degradation

### Phase 2
- SimpleProof timestamps on 80%+ of verifications
- <100ms timestamp creation time
- Bitcoin confirmation within 10 minutes

### Phase 3
- Unified verification dashboard operational
- Complete audit trail available
- User satisfaction > 85%

---

## Risk Mitigation

### Iroh Risks
- **Outdated Records**: Implement cache invalidation
- **DHT Attacks**: Use signature verification
- **Privacy**: Make publishing optional

### SimpleProof Risks
- **API Downtime**: Implement fallback verification
- **Bitcoin Fees**: Batch timestamps
- **Confirmation Delays**: Show pending status

### Combined Risks
- **Complexity**: Comprehensive testing
- **Performance**: Async operations
- **Adoption**: Gradual rollout with feature flags

---

## Testing Strategy

### Unit Tests
- Iroh discovery functions
- SimpleProof timestamp creation
- Trust score calculation

### Integration Tests
- Multi-method verification
- Database operations
- API endpoints

### End-to-End Tests
- Complete verification flow
- Blockchain confirmation
- Dashboard functionality

### Performance Tests
- Lookup time benchmarks
- Timestamp creation latency
- Database query performance

---

## Deployment Checklist

- [ ] Code review completed
- [ ] All tests passing
- [ ] Database migrations tested
- [ ] Feature flags configured
- [ ] Environment variables set
- [ ] Documentation updated
- [ ] Monitoring configured
- [ ] Rollout plan approved
- [ ] User communication ready
- [ ] Support team trained

---

**Status**: ✅ READY FOR IMPLEMENTATION

