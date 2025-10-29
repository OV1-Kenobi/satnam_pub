# NIP-03 Integration into Identity Creation Flow - Strategic Implementation Plan

**Status:** DESIGN PHASE - AWAITING APPROVAL  
**Scope:** Identity Creation Flow (IdentityForge → register-identity → CEPS)  
**Timeline:** 2-3 weeks (Phase 2 of NIP-03 implementation)  
**Effort:** 35 hours (from NIP03_IMPLEMENTATION_ROADMAP.md Phase 2)

---

## EXECUTIVE SUMMARY

This document provides a **comprehensive strategic plan** for integrating NIP-03 attestations into the identity creation flow. It addresses:

1. **Event sequencing** - Optimal order of operations
2. **PKARR timing decision** - When to create PKARR addresses
3. **Data flow architecture** - How components reference each other
4. **Integration points** - Specific files and functions to modify
5. **Error handling** - Failure scenarios and recovery strategies
6. **Database schema** - Table relationships and indexes
7. **Feature flags** - Progressive enablement strategy
8. **Testing strategy** - End-to-end validation

---

## PART 1: CURRENT IDENTITY CREATION FLOW

### Current Sequence (IdentityForge.tsx)

```
Step 1: Key Generation (generateKeysAndPhrase)
  └─ Generate nsec/npub client-side
  └─ Encrypt nsec with PBKDF2
  └─ Store in ephemeralNsec

Step 2: Profile Creation (Step 3)
  └─ User enters profile data (name, bio, picture, website)
  └─ Optional: Iroh node ID
  └─ Optional: Lightning address

Step 3: Nostr Profile Publishing (publishNostrProfile)
  └─ Create Kind:0 event with profile metadata
  └─ Sign with CEPS.publishProfile()
  └─ Publish to relays
  └─ Get event ID

Step 4: Backend Registration (registerIdentity)
  └─ Call register-identity.ts endpoint
  └─ Create user_identities record
  └─ Create NIP-05 record
  └─ Optional: Publish PKARR record (non-blocking)
  └─ Optional: Setup Lightning wallet

Step 5: Completion
  └─ Show success screen
  └─ Offer next actions (invite peers, family foundry, etc.)
```

### Current Data Flow

```
IdentityForge.tsx
  ├─ ephemeralNsec (private key)
  ├─ formData.pubkey (npub)
  ├─ profileData (name, bio, picture, website, irohNodeId)
  └─ selectedDomain (NIP-05 domain)
       │
       ├─ publishNostrProfile()
       │  └─ CEPS.publishProfile(ephemeralNsec, profileMetadata)
       │     └─ Creates Kind:0 event
       │     └─ Returns event ID
       │
       └─ registerIdentity()
          └─ register-identity.ts
             ├─ Creates user_identities record
             ├─ Creates NIP-05 record
             ├─ Optional: publishPkarrRecordAsync() [non-blocking]
             └─ Returns success/error
```

---

## PART 2: PROPOSED NIP-03 INTEGRATED FLOW

### New Sequence with NIP-03

```
Step 1-3: [UNCHANGED]
  └─ Key generation, profile creation, Kind:0 publishing

Step 4: Backend Registration + Attestation Pipeline
  └─ register-identity.ts
     ├─ Create user_identities record
     ├─ Create NIP-05 record
     │
     ├─ [NEW] Create SimpleProof timestamp
     │  └─ Call simpleproof-timestamp.ts
     │  └─ Data: Kind:0 event ID
     │  └─ Get: ots_proof, bitcoin_block, bitcoin_tx
     │  └─ Store in simpleproof_timestamps table
     │
     ├─ [NEW] Create NIP-03 Kind:1040 event
     │  └─ Reference Kind:0 event ID
     │  └─ Include OTS proof + Bitcoin details
     │  └─ Sign with CEPS
     │  └─ Publish to relays
     │  └─ Get event ID
     │
     ├─ [NEW] Store NIP-03 attestation metadata
     │  └─ Insert into nip03_attestations table
     │  └─ Link to Kind:0 event
     │  └─ Link to SimpleProof timestamp
     │
     ├─ [DECISION] Create PKARR record
     │  └─ Option A: BEFORE SimpleProof (current)
     │  └─ Option B: AFTER NIP-03 (recommended)
     │
     └─ Optional: Setup Lightning wallet

Step 5: [UNCHANGED]
  └─ Completion screen
```

---

## PART 3: CRITICAL DECISION - PKARR TIMING

### Option A: PKARR Before SimpleProof (Current)

**Sequence:**
```
1. Create Kind:0 event
2. Create PKARR record (non-blocking)
3. Create SimpleProof timestamp
4. Create NIP-03 Kind:1040 event
```

**Pros:**
- ✅ PKARR address available immediately
- ✅ Minimal changes to current flow
- ✅ PKARR independent of blockchain confirmation

**Cons:**
- ❌ PKARR address NOT included in NIP-03 event
- ❌ No blockchain proof of PKARR address
- ❌ Separate attestation chains

---

### Option B: PKARR After NIP-03 (RECOMMENDED)

**Sequence:**
```
1. Create Kind:0 event
2. Create SimpleProof timestamp
3. Create NIP-03 Kind:1040 event (includes PKARR address in metadata)
4. Create PKARR record (non-blocking)
```

**Pros:**
- ✅ PKARR address included in NIP-03 event metadata
- ✅ Unified attestation chain (Kind:0 → SimpleProof → NIP-03 → PKARR)
- ✅ PKARR address has blockchain proof
- ✅ Better privacy (PKARR address not exposed until NIP-03 published)
- ✅ Cleaner data dependencies

**Cons:**
- ⚠️ PKARR address created after NIP-03 (minor timing issue)
- ⚠️ Requires NIP-03 event to include PKARR address in metadata

---

## RECOMMENDATION: **OPTION B**

**Rationale:**
1. **Data Dependencies:** PKARR address should be derived from Kind:0 event ID, so it makes sense to create it after Kind:0 is published
2. **Blockchain Proof:** Including PKARR address in NIP-03 event creates immutable record
3. **Privacy:** PKARR address not exposed until NIP-03 published to relays
4. **Unified Attestation:** Single chain of custody (Kind:0 → SimpleProof → NIP-03 → PKARR)
5. **User Experience:** User sees "Attestation complete" when NIP-03 is published, then PKARR is published asynchronously

---

## PART 4: DATA FLOW ARCHITECTURE

### Data Dependencies

```
Kind:0 Event
  ├─ Input: profileMetadata (name, bio, picture, website, nip05, lud16, iroh_node_id)
  ├─ Output: event_id (64-char hex)
  └─ Stored in: Nostr relays
       │
       ├─ SimpleProof Timestamp
       │  ├─ Input: event_id
       │  ├─ Output: ots_proof, bitcoin_block, bitcoin_tx
       │  └─ Stored in: simpleproof_timestamps table
       │       │
       │       └─ NIP-03 Kind:1040 Event
       │          ├─ Input: event_id, ots_proof, bitcoin_block, bitcoin_tx
       │          ├─ Metadata: { pkarr_address, iroh_node_id, user_duid }
       │          ├─ Output: nip03_event_id
       │          └─ Stored in: Nostr relays + nip03_attestations table
       │               │
       │               └─ PKARR Record
       │                  ├─ Input: npub, username, domain
       │                  ├─ Metadata: { nip03_event_id, nip03_attestation_id }
       │                  └─ Stored in: pkarr_records table + DHT
       │
       └─ Iroh Node Discovery (Optional)
          ├─ Input: iroh_node_id (from Kind:0 metadata)
          ├─ Output: relay_url, direct_addresses
          └─ Stored in: iroh_discoveries table
```

### What Data Goes Where

| Component | Input | Output | Storage |
|-----------|-------|--------|---------|
| **Kind:0 Event** | profileMetadata | event_id | Nostr relays |
| **SimpleProof** | event_id | ots_proof, bitcoin_block, bitcoin_tx | simpleproof_timestamps |
| **NIP-03 Kind:1040** | event_id, ots_proof, bitcoin_block, bitcoin_tx | nip03_event_id | Nostr relays + nip03_attestations |
| **PKARR Record** | npub, username, domain | pkarr_address | pkarr_records + DHT |
| **Iroh Discovery** | iroh_node_id | relay_url, direct_addresses | iroh_discoveries |

---

## PART 5: DATABASE SCHEMA RELATIONSHIPS

### Table Relationships

```
user_identities
  ├─ id (DUID)
  ├─ username
  ├─ npub
  └─ [1:N] nip03_attestations
       │
       └─ nip03_attestations
          ├─ id (UUID)
          ├─ attested_event_id (Kind:0 event ID)
          ├─ nip03_event_id (Kind:1040 event ID)
          ├─ simpleproof_timestamp_id (FK)
          ├─ user_duid (FK to user_identities)
          ├─ event_type = 'identity_creation'
          ├─ metadata (JSONB: { pkarr_address, iroh_node_id })
          └─ [1:1] simpleproof_timestamps
               │
               └─ simpleproof_timestamps
                  ├─ id (UUID)
                  ├─ verification_id (UUID)
                  ├─ ots_proof
                  ├─ bitcoin_block
                  └─ bitcoin_tx

pkarr_records
  ├─ id (UUID)
  ├─ public_key (npub hex)
  ├─ records (JSONB)
  ├─ nip03_attestation_id (FK) [NEW]
  └─ [1:1] nip03_attestations
```

### New Schema Changes

**Modify `nip03_attestations` table:**
```sql
-- Add PKARR address to metadata
ALTER TABLE nip03_attestations 
ADD COLUMN IF NOT EXISTS pkarr_address VARCHAR(255);

-- Add Iroh node ID to metadata
ALTER TABLE nip03_attestations 
ADD COLUMN IF NOT EXISTS iroh_node_id VARCHAR(64);

-- Add index for efficient queries
CREATE INDEX IF NOT EXISTS idx_nip03_user_event_type 
ON nip03_attestations(user_duid, event_type, created_at DESC);
```

**Modify `pkarr_records` table:**
```sql
-- Link PKARR record to NIP-03 attestation
ALTER TABLE pkarr_records 
ADD COLUMN IF NOT EXISTS nip03_attestation_id UUID 
REFERENCES nip03_attestations(id) ON DELETE SET NULL;

-- Add index for efficient queries
CREATE INDEX IF NOT EXISTS idx_pkarr_nip03_attestation 
ON pkarr_records(nip03_attestation_id);
```

---

## PART 6: INTEGRATION CHECKLIST

### Phase 2 Week 3-4: Identity Creation Integration

**Day 8: Backend Integration (register-identity.ts)**

- [ ] Add SimpleProof timestamp creation after Kind:0 event published
- [ ] Add NIP-03 Kind:1040 event creation after SimpleProof timestamp
- [ ] Add NIP-03 attestation storage in database
- [ ] Add PKARR record creation (non-blocking) after NIP-03 published
- [ ] Add error handling for each step
- [ ] Add feature flag gating (VITE_NIP03_IDENTITY_CREATION)

**Day 9: Frontend Integration (IdentityForge.tsx)**

- [ ] Add progress indicator for attestation steps
- [ ] Add loading states during SimpleProof/NIP-03 creation
- [ ] Add error messages for failed attestations
- [ ] Add success confirmation for NIP-03 published
- [ ] Add optional retry logic for failed steps

**Day 10: UI Components**

- [ ] Create AttestationProgressIndicator component
- [ ] Create AttestationStatusDisplay component
- [ ] Update completion screen to show attestation details
- [ ] Add "View Attestation" link to NIP-03 event

**Day 11: API Service Updates**

- [ ] Create nip03-attestation-service.ts
- [ ] Update attestation-manager.ts to support NIP-03
- [ ] Add NIP-03 event creation helper functions
- [ ] Add error handling and retry logic

**Day 12: Testing**

- [ ] Unit tests for NIP-03 event creation
- [ ] Integration tests for full flow
- [ ] Error scenario tests
- [ ] Feature flag tests

---

## PART 7: ERROR HANDLING MATRIX

| Failure Point | Scenario | Recovery | User Impact |
|---------------|----------|----------|-------------|
| **Kind:0 Publishing** | Relay connection fails | Retry with fallback relays | Registration blocked |
| **SimpleProof API** | API timeout/error | Retry with exponential backoff | Registration blocked |
| **SimpleProof Storage** | Database insert fails | Retry transaction | Registration blocked |
| **NIP-03 Creation** | Event signing fails | Retry with CEPS | Registration blocked |
| **NIP-03 Publishing** | Relay connection fails | Retry with fallback relays | Registration succeeds, attestation pending |
| **PKARR Publishing** | DHT publish fails | Retry asynchronously (non-blocking) | Registration succeeds, PKARR pending |
| **Iroh Discovery** | DHT lookup fails | Graceful degradation (optional) | Registration succeeds, Iroh skipped |

---

## PART 8: FEATURE FLAG STRATEGY

### Flag Hierarchy

```
VITE_NIP03_ENABLED (Master)
  ├─ VITE_NIP03_IDENTITY_CREATION (Phase 2)
  ├─ VITE_NIP03_KEY_ROTATION (Phase 1)
  └─ VITE_NIP03_ROLE_CHANGES (Phase 3)

VITE_SIMPLEPROOF_ENABLED (Dependency)
VITE_PKARR_ENABLED (Dependency)
VITE_IROH_ENABLED (Optional)
```

### Graceful Degradation

```
If VITE_NIP03_IDENTITY_CREATION = false:
  └─ Skip NIP-03 creation
  └─ Skip SimpleProof timestamp
  └─ Continue with registration (PKARR still optional)

If VITE_SIMPLEPROOF_ENABLED = false:
  └─ Skip SimpleProof timestamp
  └─ Skip NIP-03 creation
  └─ Continue with registration

If VITE_PKARR_ENABLED = false:
  └─ Skip PKARR record creation
  └─ Continue with registration
```

---

## PART 9: TESTING STRATEGY

### Unit Tests (40 tests)

- NIP-03 event creation (10 tests)
- SimpleProof integration (10 tests)
- PKARR integration (10 tests)
- Error handling (10 tests)

### Integration Tests (30 tests)

- Full identity creation flow (10 tests)
- Feature flag combinations (10 tests)
- Error recovery scenarios (10 tests)

### E2E Tests (20 tests)

- Complete user registration with attestations (10 tests)
- Attestation verification on Nostr relays (5 tests)
- PKARR record verification (5 tests)

---

## NEXT STEPS

### Upon Approval

1. **Week 3 (Day 8-9):** Backend integration + frontend UI
2. **Week 4 (Day 10-12):** Components, services, testing
3. **Week 5:** Staging deployment + monitoring
4. **Week 6:** Production deployment

### Deliverables

- ✅ Updated register-identity.ts (200 lines)
- ✅ Updated IdentityForge.tsx (150 lines)
- ✅ New nip03-attestation-service.ts (200 lines)
- ✅ New UI components (200 lines)
- ✅ 90+ tests with >85% coverage
- ✅ Complete documentation

---

## APPROVAL CHECKLIST

- [ ] Event sequencing approved
- [ ] PKARR timing decision (Option B) approved
- [ ] Data flow architecture approved
- [ ] Database schema changes approved
- [ ] Feature flag strategy approved
- [ ] Error handling approach approved
- [ ] Testing strategy approved
- [ ] Ready to proceed with implementation


