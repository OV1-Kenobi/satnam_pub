# NIP-03 Attestation Architecture Design

**Status:** DESIGN PHASE (Awaiting Approval)  
**Created:** 2025-10-27  
**Scope:** Three critical event flows with NIP-03 integration

---

## 1. ARCHITECTURE ASSESSMENT

### Current State Analysis

#### ✅ Existing Implementations
- **SimpleProof System** (Migration 034): Creates OpenTimestamps proofs, stores in `simpleproof_timestamps` table
- **CEPS Integration**: Fully functional event signing/publishing via `central_event_publishing_service.ts`
- **NIP-41 Key Rotation**: Kind:1776 (whitelist) and Kind:1777 (migration) events implemented
- **PKARR System**: Decentralized DNS records via BitTorrent DHT
- **Iroh Integration**: P2P node discovery and verification
- **Family Federation**: Master Context role hierarchy (private/offspring/adult/steward/guardian)

#### ⚠️ Gaps Identified
1. **NIP-03 Kind:1040 Events**: Not implemented (2 placeholder comments in codebase)
2. **Event-Level Attestations**: SimpleProof stores proofs but doesn't publish as Nostr events
3. **NIP-03 Database Tracking**: No table to track published Kind:1040 events
4. **Role Change Attestations**: No mechanism for Guardian/Steward role change events
5. **Dependency Check**: SimpleProof API already handles OpenTimestamps—no new npm dependency needed

---

## 2. DATABASE SCHEMA CHANGES

### New Table: `nip03_attestations`

```sql
CREATE TABLE IF NOT EXISTS public.nip03_attestations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Reference to original event being attested
    attested_event_id VARCHAR(64) NOT NULL,
    attested_event_kind INTEGER NOT NULL,
    
    -- NIP-03 Kind:1040 event details
    nip03_event_id VARCHAR(64) NOT NULL UNIQUE,
    nip03_event_kind CONSTANT 1040,
    
    -- OpenTimestamps proof reference
    simpleproof_timestamp_id UUID REFERENCES simpleproof_timestamps(id),
    ots_proof TEXT NOT NULL,
    bitcoin_block INTEGER,
    bitcoin_tx VARCHAR(64),
    
    -- Event context
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN (
        'identity_creation', 'profile_update', 'key_rotation', 
        'role_change', 'custom_attestation'
    )),
    
    -- User context
    user_duid VARCHAR(50) NOT NULL,
    
    -- Publishing details
    relay_urls TEXT[] DEFAULT '{"wss://relay.satnam.pub"}',
    published_at BIGINT NOT NULL,
    verified_at BIGINT,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
    updated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
    
    -- Constraints
    CONSTRAINT user_fk FOREIGN KEY (user_duid)
        REFERENCES user_identities(id) ON DELETE CASCADE,
    CONSTRAINT bitcoin_tx_format CHECK (bitcoin_tx IS NULL OR bitcoin_tx ~ '^[a-f0-9]{64}$')
);

-- Indexes
CREATE INDEX idx_nip03_attested_event ON nip03_attestations(attested_event_id);
CREATE INDEX idx_nip03_user ON nip03_attestations(user_duid);
CREATE INDEX idx_nip03_event_type ON nip03_attestations(event_type);
CREATE INDEX idx_nip03_published ON nip03_attestations(published_at DESC);
```

### Schema Extension: `pkarr_records` (Optional)

Add column to track NIP-03 attestation:
```sql
ALTER TABLE pkarr_records ADD COLUMN IF NOT EXISTS nip03_attestation_id UUID 
    REFERENCES nip03_attestations(id) ON DELETE SET NULL;
```

---

## 3. IMPLEMENTATION PLAN

### Phase 1: NIP-03 for Key Rotation (Weeks 1-2, 40 hours)

**Priority:** 🔴 CRITICAL (Security events)

**Tasks:**
1. Create `nip03-attestation-service.ts` (200 lines)
   - Build Kind:1040 event structure
   - Integrate with SimpleProof proofs
   - Publish via CEPS

2. Extend `nostr-key-recovery.ts` (100 lines)
   - Replace placeholder comments with NIP-03 calls
   - Create attestations for Kind:1776 and Kind:1777 events
   - Store attestation references in database

3. Create database migration (50 lines)
   - Add `nip03_attestations` table
   - Add RLS policies
   - Create helper functions

4. Add tests (150 lines)
   - Unit tests for Kind:1040 creation
   - Integration tests with SimpleProof
   - E2E tests for key rotation flow

**Estimated Effort:** 40 hours

---

### Phase 2: NIP-03 for Identity Creation (Weeks 3-4, 35 hours)

**Priority:** 🟡 HIGH (User onboarding)

**Tasks:**
1. Extend `attestation-manager.ts` (100 lines)
   - Add `includeNip03` parameter
   - Create Kind:1040 events for Kind:0 profiles
   - Link to SimpleProof proofs

2. Update `IdentityForge.tsx` (80 lines)
   - Add NIP-03 attestation step
   - Show blockchain confirmation UI
   - Display attestation details

3. Update `register-identity.ts` (60 lines)
   - Create NIP-03 attestation after registration
   - Store attestation reference
   - Non-blocking (don't fail registration)

4. Add tests (100 lines)
   - Unit tests for attestation creation
   - Integration tests with registration flow
   - E2E tests for full onboarding

**Estimated Effort:** 35 hours

---

### Phase 3: NIP-03 for Role Changes (Weeks 5-6, 30 hours)

**Priority:** 🟢 MEDIUM (Family governance)

**Tasks:**
1. Create `role-change-attestation.ts` (120 lines)
   - Detect Guardian/Steward role changes
   - Create attestation events
   - Publish via CEPS

2. Extend `family-member-management.ts` (80 lines)
   - Trigger attestation on role change
   - Store attestation reference
   - Emit events for UI updates

3. Create database migration (40 lines)
   - Add role_change_attestation_id to family_members
   - Add indexes for queries

4. Add tests (100 lines)
   - Unit tests for role change detection
   - Integration tests with family federation
   - E2E tests for governance flows

**Estimated Effort:** 30 hours

---

## 4. CODE INTEGRATION POINTS

### File Modifications Required

| File | Changes | Lines | Priority |
|------|---------|-------|----------|
| `src/lib/nip03-attestation-service.ts` | NEW | 200 | P1 |
| `src/lib/auth/nostr-key-recovery.ts` | Replace placeholders | 100 | P1 |
| `src/lib/attestation-manager.ts` | Add NIP-03 support | 100 | P2 |
| `src/components/IdentityForge.tsx` | Add attestation UI | 80 | P2 |
| `netlify/functions_active/register-identity.ts` | Add attestation call | 60 | P2 |
| `src/lib/family/role-change-attestation.ts` | NEW | 120 | P3 |
| `database/migrations/041_nip03_attestations.sql` | NEW | 130 | All |
| `src/lib/__tests__/nip03-attestation.test.ts` | NEW | 350 | All |

---

## 5. FEATURE FLAGS

```typescript
// .env.local
VITE_NIP03_ENABLED=true                    // Master flag
VITE_NIP03_KEY_ROTATION=true               // Phase 1
VITE_NIP03_IDENTITY_CREATION=true          // Phase 2
VITE_NIP03_ROLE_CHANGES=true               // Phase 3
VITE_NIP03_RELAY_URLS=wss://relay.satnam.pub,wss://nos.lol
```

---

## 6. TESTING STRATEGY

### Unit Tests (150 lines)
- Kind:1040 event structure validation
- SimpleProof proof integration
- Event signing and verification

### Integration Tests (200 lines)
- NIP-03 + SimpleProof + CEPS flow
- Database storage and retrieval
- RLS policy enforcement

### E2E Tests (300 lines)
- Full key rotation with attestation
- Identity creation with attestation
- Role change with attestation

**Target Coverage:** >85%

---

## 7. MIGRATION PATH

### Step 1: Database (Day 1)
- Run migration 041 to create `nip03_attestations` table
- Verify RLS policies

### Step 2: Services (Days 2-3)
- Implement `nip03-attestation-service.ts`
- Add tests

### Step 3: Integration (Days 4-5)
- Update `nostr-key-recovery.ts`
- Update `attestation-manager.ts`
- Update UI components

### Step 4: Deployment (Day 6)
- Enable feature flags in production
- Monitor Sentry for errors
- Verify blockchain confirmations

---

## 8. RISK ASSESSMENT

| Risk | Mitigation |
|------|-----------|
| SimpleProof API delays | Async processing, graceful degradation |
| Relay publishing failures | Retry logic, fallback relays |
| Database constraint violations | Comprehensive validation, RLS policies |
| User confusion | Clear UI messaging, documentation |

---

## 9. APPROVAL CHECKLIST

- [ ] Architecture design approved
- [ ] Database schema approved
- [ ] Feature flags approved
- [ ] Testing strategy approved
- [ ] Timeline approved
- [ ] Risk mitigation approved

**Next Step:** Await user approval before implementation begins.

