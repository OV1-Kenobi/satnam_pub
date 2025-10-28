# NIP-03 Technical Specifications

---

## 1. NIP-03 KIND:1040 EVENT STRUCTURE

### Event Format

```typescript
interface NIP03AttestationEvent {
  kind: 1040;
  created_at: number;
  pubkey: string;
  content: string; // JSON stringified attestation data
  tags: [
    ["e", attested_event_id],           // Event being attested
    ["ots", ots_proof_hex],             // OpenTimestamps proof
    ["bitcoin_block", block_number],    // Bitcoin block
    ["bitcoin_tx", tx_id],              // Bitcoin transaction
    ["relay", relay_url],               // Relay URLs
    ["alt", "OpenTimestamps attestation for Nostr event"]
  ];
  sig: string;
}
```

### Content Structure

```json
{
  "attestation_type": "identity_creation|profile_update|key_rotation|role_change",
  "attested_event_id": "event_id_hex",
  "attested_event_kind": 0,
  "timestamp": 1729610400,
  "ots_proof": "hex_encoded_proof",
  "bitcoin_block": 123456,
  "bitcoin_tx": "txid_hex",
  "verified_at": 1729610500,
  "metadata": {
    "user_duid": "user_identifier",
    "event_context": "additional_context"
  }
}
```

---

## 2. SERVICE IMPLEMENTATION: `nip03-attestation-service.ts`

### Core Functions

```typescript
export class NIP03AttestationService {
  /**
   * Create NIP-03 Kind:1040 attestation event
   */
  async createAttestation(request: {
    attestedEventId: string;
    attestedEventKind: number;
    attestationType: AttestationType;
    simpleproofTimestampId: string;
    userDuid: string;
    metadata?: Record<string, any>;
  }): Promise<{
    success: boolean;
    nip03EventId?: string;
    error?: string;
  }>;

  /**
   * Publish attestation to relays via CEPS
   */
  async publishAttestation(
    event: Event,
    relayUrls?: string[]
  ): Promise<string>;

  /**
   * Store attestation in database
   */
  async storeAttestation(
    nip03EventId: string,
    attestedEventId: string,
    simpleproofTimestampId: string,
    userDuid: string,
    metadata: Record<string, any>
  ): Promise<UUID>;

  /**
   * Retrieve attestation by event ID
   */
  async getAttestation(nip03EventId: string): Promise<NIP03Attestation | null>;

  /**
   * List attestations for user
   */
  async listAttestations(userDuid: string): Promise<NIP03Attestation[]>;
}
```

---

## 3. INTEGRATION POINTS

### A. Key Rotation Flow

**File:** `src/lib/auth/nostr-key-recovery.ts`

**Current Code (Lines 663-668):**
```typescript
// Note: OpenTimestamp attestation (NIP-03) would be implemented here
// for full NIP-41 compliance...
console.log("✅ NIP-41 migration event created (OpenTimestamp attestation pending)");
```

**New Code:**
```typescript
// Create NIP-03 attestation for migration event
if (VITE_NIP03_ENABLED && VITE_NIP03_KEY_ROTATION) {
  try {
    const attestationService = new NIP03AttestationService();
    const attestation = await attestationService.createAttestation({
      attestedEventId: eventId,
      attestedEventKind: 1777,
      attestationType: 'key_rotation',
      simpleproofTimestampId: simpleproofId,
      userDuid: userId,
      metadata: { oldPubkey, newPubkey }
    });
    
    if (attestation.success) {
      console.log("✅ NIP-03 attestation created:", attestation.nip03EventId);
    }
  } catch (error) {
    console.warn("⚠️ NIP-03 attestation failed (non-blocking):", error);
  }
}
```

### B. Identity Creation Flow

**File:** `src/lib/attestation-manager.ts`

**New Parameter:**
```typescript
export interface AttestationRequest {
  verificationId: string;
  eventType: AttestationEventType;
  metadata?: string;
  includeSimpleproof?: boolean;
  includeIroh?: boolean;
  includeNip03?: boolean;  // NEW
  nodeId?: string;
}
```

**New Logic:**
```typescript
if (request.includeNip03 && simpleproofResult) {
  try {
    const nip03Service = new NIP03AttestationService();
    const nip03Result = await nip03Service.createAttestation({
      attestedEventId: kind0EventId,
      attestedEventKind: 0,
      attestationType: 'identity_creation',
      simpleproofTimestampId: simpleproofResult.id,
      userDuid: userDuid,
      metadata: { username, nip05 }
    });
    
    attestation.nip03Attestation = nip03Result;
  } catch (error) {
    console.warn("NIP-03 attestation failed:", error);
  }
}
```

### C. Role Change Flow

**File:** `src/lib/family/role-change-attestation.ts` (NEW)

```typescript
export async function attestRoleChange(
  userDuid: string,
  familyFederationId: string,
  oldRole: FederationRole,
  newRole: FederationRole,
  changedBy: string
): Promise<{
  success: boolean;
  attestationId?: string;
  error?: string;
}> {
  // 1. Create role change event (kind: custom)
  // 2. Create SimpleProof timestamp
  // 3. Create NIP-03 attestation
  // 4. Store in database
  // 5. Publish via CEPS
}
```

---

## 4. DATABASE OPERATIONS

### RLS Policies

```sql
-- Users can only see their own attestations
CREATE POLICY "user_view_own_attestations" ON nip03_attestations
  FOR SELECT USING (user_duid = auth.uid()::VARCHAR);

-- Service role can insert attestations
CREATE POLICY "service_insert_attestations" ON nip03_attestations
  FOR INSERT WITH CHECK (true);

-- Users can update their own attestations
CREATE POLICY "user_update_own_attestations" ON nip03_attestations
  FOR UPDATE USING (user_duid = auth.uid()::VARCHAR);
```

### Helper Functions

```sql
CREATE OR REPLACE FUNCTION store_nip03_attestation(
  p_attested_event_id VARCHAR,
  p_nip03_event_id VARCHAR,
  p_simpleproof_timestamp_id UUID,
  p_user_duid VARCHAR,
  p_event_type VARCHAR,
  p_metadata JSONB
) RETURNS UUID AS $$
DECLARE
  v_attestation_id UUID;
BEGIN
  INSERT INTO nip03_attestations (
    attested_event_id, nip03_event_id, simpleproof_timestamp_id,
    user_duid, event_type, metadata, published_at
  ) VALUES (
    p_attested_event_id, p_nip03_event_id, p_simpleproof_timestamp_id,
    p_user_duid, p_event_type, p_metadata, EXTRACT(EPOCH FROM NOW())::BIGINT
  )
  RETURNING id INTO v_attestation_id;
  
  RETURN v_attestation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 5. ERROR HANDLING

### Graceful Degradation

```typescript
// NIP-03 attestation is OPTIONAL - never block main flow
try {
  await nip03Service.createAttestation(...);
} catch (error) {
  // Log but don't throw
  console.warn("NIP-03 attestation failed (non-blocking):", error);
  // Continue with main flow
}
```

### Retry Logic

```typescript
async function publishWithRetry(
  event: Event,
  maxRetries: number = 3
): Promise<string> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await CEPS.publishEvent(event);
    } catch (error) {
      if (attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      } else {
        throw error;
      }
    }
  }
}
```

---

## 6. PRIVACY & SECURITY

### Zero-Knowledge Compliance
- No plaintext nsec exposure
- No PII in attestation events
- User DUID hashed in database
- RLS policies enforce user isolation

### Security Headers
- CORS validation (existing)
- Rate limiting (10 req/hour per user)
- Input validation (UUID format, payload size)
- SQL injection prevention (parameterized queries)

---

## 7. PERFORMANCE CONSIDERATIONS

### Async Processing
- NIP-03 creation happens after SimpleProof confirmation
- Non-blocking: doesn't delay user-facing operations
- Background job for relay publishing

### Caching
- Cache relay URLs (1-hour TTL)
- Cache user preferences (30-minute TTL)
- Cache attestation lookups (5-minute TTL)

### Database Indexes
```sql
CREATE INDEX idx_nip03_attested_event ON nip03_attestations(attested_event_id);
CREATE INDEX idx_nip03_user ON nip03_attestations(user_duid);
CREATE INDEX idx_nip03_event_type ON nip03_attestations(event_type);
CREATE INDEX idx_nip03_published ON nip03_attestations(published_at DESC);
```

---

## 8. MONITORING & OBSERVABILITY

### Sentry Breadcrumbs
```typescript
addBreadcrumb({
  category: 'nip03',
  message: 'NIP-03 attestation created',
  level: 'info',
  data: {
    attestedEventId,
    eventType,
    bitcoinBlock
  }
});
```

### Structured Logging
```typescript
logger.info('NIP-03 attestation published', {
  action: 'publish',
  nip03EventId,
  relayCount: relayUrls.length,
  metadata: { eventType, userDuid }
});
```

---

## 9. DEPENDENCY ANALYSIS

**NO NEW DEPENDENCIES REQUIRED**

- SimpleProof API already handles OpenTimestamps
- CEPS already handles event signing/publishing
- nostr-tools already available
- Web Crypto API for hashing

---

## 10. ROLLBACK STRATEGY

### If NIP-03 Fails
1. Set `VITE_NIP03_ENABLED=false`
2. Attestations stop being created
3. Existing attestations remain in database
4. No data loss

### Database Rollback
```sql
-- Drop NIP-03 table if needed
DROP TABLE IF EXISTS nip03_attestations CASCADE;
```

