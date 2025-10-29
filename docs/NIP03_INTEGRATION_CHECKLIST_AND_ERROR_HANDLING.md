# NIP-03 Identity Creation - Integration Checklist & Error Handling

---

## INTEGRATION CHECKLIST

### Phase 2 Week 3: Backend Integration

#### Day 8: register-identity.ts Modifications

**File:** `netlify/functions_active/register-identity.ts`

- [ ] **Task 1: Add SimpleProof timestamp creation** (Lines 1200-1250)
  - [ ] After Kind:0 event published, extract event_id
  - [ ] Call simpleproof-timestamp.ts with event_id
  - [ ] Receive: ots_proof, bitcoin_block, bitcoin_tx
  - [ ] Store in simpleproof_timestamps table
  - [ ] Handle errors: retry 3x with exponential backoff
  - [ ] Log: "SimpleProof timestamp created: {timestamp_id}"

- [ ] **Task 2: Add NIP-03 Kind:1040 event creation** (Lines 1250-1320)
  - [ ] Create unsigned Kind:1040 event with:
    - [ ] tags: [["e", kind0_event_id], ["p", npub]]
    - [ ] content: OTS proof (hex-encoded)
    - [ ] metadata: { pkarr_address, iroh_node_id, user_duid }
  - [ ] Sign with CEPS.signEventWithActiveSession()
  - [ ] Publish to relays via CEPS.publishEvent()
  - [ ] Extract nip03_event_id from response
  - [ ] Handle errors: retry 3x with fallback relays

- [ ] **Task 3: Add NIP-03 attestation storage** (Lines 1320-1360)
  - [ ] Insert into nip03_attestations table:
    - [ ] attested_event_id = kind0_event_id
    - [ ] nip03_event_id = nip03_event_id
    - [ ] simpleproof_timestamp_id = timestamp_id
    - [ ] event_type = 'identity_creation'
    - [ ] user_duid = user_duid
    - [ ] metadata = { pkarr_address, iroh_node_id }
  - [ ] Handle errors: transaction rollback

- [ ] **Task 4: Add PKARR record creation** (Lines 1360-1400)
  - [ ] Create PKARR record with:
    - [ ] public_key = npub (hex)
    - [ ] records = DNS records (A, AAAA, TXT)
    - [ ] nip03_attestation_id = nip03_attestation_id
  - [ ] Publish to DHT (non-blocking, fire-and-forget)
  - [ ] Store in pkarr_records table
  - [ ] Handle errors: log warning, don't block registration

- [ ] **Task 5: Add feature flag gating** (Lines 1100-1120)
  - [ ] Check VITE_NIP03_ENABLED flag
  - [ ] Check VITE_NIP03_IDENTITY_CREATION flag
  - [ ] Skip SimpleProof/NIP-03 if disabled
  - [ ] Continue with registration

- [ ] **Task 6: Add error handling** (Lines 1400-1450)
  - [ ] Try-catch for each step
  - [ ] Structured error logging with context
  - [ ] Graceful degradation (don't block registration)
  - [ ] Return error details to frontend

#### Day 9: IdentityForge.tsx Modifications

**File:** `src/components/IdentityForge.tsx`

- [ ] **Task 1: Add attestation progress tracking** (Lines 1500-1550)
  - [ ] Add state: `attestationStep` (idle, creating_simpleproof, creating_nip03, creating_pkarr, complete)
  - [ ] Add state: `attestationProgress` (0-100)
  - [ ] Add state: `attestationError` (null or error message)

- [ ] **Task 2: Update progress indicator** (Lines 1600-1650)
  - [ ] Show 5 steps instead of 4:
    - [ ] Step 1: Key Generation
    - [ ] Step 2: Profile Creation
    - [ ] Step 3: Verification Opt-In
    - [ ] Step 4: Attestation (NEW)
    - [ ] Step 5: Completion
  - [ ] Update canContinue() logic for new step

- [ ] **Task 3: Add loading states** (Lines 1650-1700)
  - [ ] Show "Creating SimpleProof timestamp..." (20% progress)
  - [ ] Show "Creating NIP-03 attestation..." (40% progress)
  - [ ] Show "Publishing PKARR record..." (60% progress)
  - [ ] Show "Attestation complete!" (100% progress)

- [ ] **Task 4: Add error messages** (Lines 1700-1750)
  - [ ] Display attestation errors to user
  - [ ] Offer retry option for failed steps
  - [ ] Show "Attestation failed, but registration succeeded" if PKARR fails

- [ ] **Task 5: Update completion screen** (Lines 1800-1850)
  - [ ] Show attestation details:
    - [ ] SimpleProof timestamp ID
    - [ ] NIP-03 event ID
    - [ ] PKARR address
  - [ ] Add "View Attestation" link to NIP-03 event
  - [ ] Add "View PKARR Record" link to DHT

### Phase 2 Week 4: Frontend Components & Services

#### Day 10: UI Components

**File:** `src/components/identity/AttestationProgressIndicator.tsx` (NEW)

- [ ] Create component showing:
  - [ ] Current step (SimpleProof, NIP-03, PKARR)
  - [ ] Progress bar (0-100%)
  - [ ] Estimated time remaining
  - [ ] Status icons (pending, in-progress, complete, error)

**File:** `src/components/identity/AttestationStatusDisplay.tsx` (NEW)

- [ ] Create component showing:
  - [ ] SimpleProof timestamp status
  - [ ] NIP-03 event status
  - [ ] PKARR record status
  - [ ] Error messages with retry buttons

**File:** `src/components/identity/AttestationCompletionDetails.tsx` (NEW)

- [ ] Create component showing:
  - [ ] Attestation summary
  - [ ] Links to view attestations
  - [ ] Copy buttons for IDs
  - [ ] Share attestation option

#### Day 11: API Services

**File:** `src/services/nip03-attestation-service.ts` (NEW)

- [ ] Create NIP-03 attestation service:
  - [ ] `createNIP03Event()` - Create Kind:1040 event
  - [ ] `publishNIP03Event()` - Publish to relays
  - [ ] `storeNIP03Attestation()` - Store in database
  - [ ] `getAttestationStatus()` - Get current status
  - [ ] Error handling and retry logic

**File:** `src/lib/attestation-manager.ts` (UPDATE)

- [ ] Update attestation manager:
  - [ ] Add NIP-03 support
  - [ ] Add SimpleProof integration
  - [ ] Add PKARR integration
  - [ ] Add error handling
  - [ ] Add feature flag support

#### Day 12: Testing

**File:** `tests/nip03-identity-creation.test.ts` (NEW)

- [ ] Unit tests (40 tests):
  - [ ] NIP-03 event creation (10 tests)
  - [ ] SimpleProof integration (10 tests)
  - [ ] PKARR integration (10 tests)
  - [ ] Error handling (10 tests)

- [ ] Integration tests (30 tests):
  - [ ] Full identity creation flow (10 tests)
  - [ ] Feature flag combinations (10 tests)
  - [ ] Error recovery scenarios (10 tests)

- [ ] E2E tests (20 tests):
  - [ ] Complete user registration (10 tests)
  - [ ] Attestation verification (5 tests)
  - [ ] PKARR verification (5 tests)

---

## ERROR HANDLING MATRIX

### Failure Scenarios & Recovery Strategies

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ERROR HANDLING MATRIX - IDENTITY CREATION FLOW                         │
├─────────────────────────────────────────────────────────────────────────┤
```

| # | Failure Point | Scenario | Recovery | User Impact | Blocking |
|---|---------------|----------|----------|-------------|----------|
| 1 | **Kind:0 Publishing** | Relay connection fails | Retry 3x with fallback relays | Registration blocked | YES |
| 2 | **Kind:0 Publishing** | Event signing fails | Retry with CEPS | Registration blocked | YES |
| 3 | **Kind:0 Publishing** | Timeout (>5s) | Fail registration | Registration blocked | YES |
| 4 | **SimpleProof API** | API timeout | Retry 3x with exponential backoff (1s, 2s, 4s) | Registration blocked | YES |
| 5 | **SimpleProof API** | API returns error | Log error, retry 3x | Registration blocked | YES |
| 6 | **SimpleProof API** | Invalid response format | Log error, fail registration | Registration blocked | YES |
| 7 | **SimpleProof Storage** | Database insert fails | Retry transaction 3x | Registration blocked | YES |
| 8 | **SimpleProof Storage** | Constraint violation | Log error, fail registration | Registration blocked | YES |
| 9 | **NIP-03 Creation** | Event signing fails | Retry with CEPS | Registration blocked | YES |
| 10 | **NIP-03 Creation** | Invalid event structure | Log error, fail registration | Registration blocked | YES |
| 11 | **NIP-03 Publishing** | Relay connection fails | Retry 3x with fallback relays | Registration succeeds, attestation pending | NO |
| 12 | **NIP-03 Publishing** | Timeout (>5s) | Log warning, continue | Registration succeeds, attestation pending | NO |
| 13 | **NIP-03 Storage** | Database insert fails | Retry transaction 3x | Registration succeeds, attestation pending | NO |
| 14 | **PKARR Publishing** | DHT publish fails | Retry asynchronously (non-blocking) | Registration succeeds, PKARR pending | NO |
| 15 | **PKARR Publishing** | Invalid signature | Log error, skip PKARR | Registration succeeds, PKARR skipped | NO |
| 16 | **Iroh Discovery** | DHT lookup fails | Graceful degradation (optional) | Registration succeeds, Iroh skipped | NO |
| 17 | **Feature Flag** | NIP-03 disabled | Skip all attestation steps | Registration succeeds, no attestation | NO |
| 18 | **Feature Flag** | SimpleProof disabled | Skip SimpleProof/NIP-03 | Registration succeeds, no attestation | NO |

---

## ERROR HANDLING CODE PATTERNS

### Pattern 1: Blocking Operations (Kind:0, SimpleProof, NIP-03)

```typescript
async function createSimpleProofTimestamp(eventId: string, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch('/.netlify/functions/simpleproof-timestamp', {
        method: 'POST',
        body: JSON.stringify({ action: 'create', data: eventId })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const result = await response.json();
      return result;
      
    } catch (error) {
      const delay = Math.pow(2, attempt - 1) * 1000; // Exponential backoff
      
      if (attempt < maxRetries) {
        console.warn(`SimpleProof attempt ${attempt} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw new Error(`SimpleProof failed after ${maxRetries} attempts: ${error}`);
      }
    }
  }
}
```

### Pattern 2: Non-Blocking Operations (PKARR, Iroh)

```typescript
async function publishPkarrRecordAsync(pkarrAddress: string) {
  // Fire-and-forget - don't block registration
  fetch('/.netlify/functions/pkarr-publish', {
    method: 'POST',
    body: JSON.stringify({ action: 'publish', pkarr_address: pkarrAddress })
  }).catch((error) => {
    console.warn('⚠️ PKARR publishing failed (non-blocking):', error);
    // Log to Sentry for monitoring
    Sentry.captureException(error, {
      tags: { component: 'pkarr-publish', flow: 'identity-creation' }
    });
  });
}
```

### Pattern 3: Graceful Degradation (Feature Flags)

```typescript
async function registerIdentityWithAttestations(userData: UserData) {
  // Check feature flags
  const nip03Enabled = process.env.VITE_NIP03_ENABLED === 'true';
  const nip03IdentityEnabled = process.env.VITE_NIP03_IDENTITY_CREATION === 'true';
  
  if (!nip03Enabled || !nip03IdentityEnabled) {
    // Skip attestation steps
    return registerIdentityBasic(userData);
  }
  
  try {
    // Create attestations
    const attestation = await createAttestations(userData);
    return { ...userData, attestation };
  } catch (error) {
    // Graceful degradation - continue without attestation
    console.warn('Attestation failed, continuing with basic registration:', error);
    return registerIdentityBasic(userData);
  }
}
```

---

## MONITORING & ALERTING

### Metrics to Track

- SimpleProof API response time (target: <2s)
- SimpleProof API error rate (target: <1%)
- NIP-03 event publishing success rate (target: >95%)
- PKARR publishing success rate (target: >90%)
- Registration completion time (target: <5s)
- Attestation completion rate (target: >85%)

### Alerts to Configure

- SimpleProof API timeout (>5s)
- SimpleProof API error rate (>5%)
- NIP-03 publishing failure (>10%)
- PKARR publishing failure (>20%)
- Registration failure rate (>5%)

---

## TESTING CHECKLIST

### Unit Tests (40 tests)

- [ ] NIP-03 event creation (10 tests)
- [ ] SimpleProof integration (10 tests)
- [ ] PKARR integration (10 tests)
- [ ] Error handling (10 tests)

### Integration Tests (30 tests)

- [ ] Full identity creation flow (10 tests)
- [ ] Feature flag combinations (10 tests)
- [ ] Error recovery scenarios (10 tests)

### E2E Tests (20 tests)

- [ ] Complete user registration (10 tests)
- [ ] Attestation verification (5 tests)
- [ ] PKARR verification (5 tests)

**Target Coverage:** >85% code coverage, 100% critical path coverage


