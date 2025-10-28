# TASK 7: Fix FROST Persistence - Implementation Plan

**Date:** 2025-10-27
**Priority:** Medium (🟡)
**Status:** PHASE 1 COMPLETE ✅ - Ready for Phase 2

**Phase 1 Status:** ✅ COMPLETE (67/67 tests passing, 100% pass rate)
**Phase 2 Status:** 🔄 READY TO START
**Phase 3 Status:** ⏸️ PENDING
**Phase 4 Status:** ⏸️ PENDING

---

## Executive Summary

After comprehensive analysis of the codebase, I've identified critical persistence issues with the FROST (Flexible Round-Optimized Schnorr Threshold) signature system. While database tables exist (`migrations/016_frost_signature_system.sql`), there are significant gaps in session management, nonce storage, and integration with the existing SSS (Shamir Secret Sharing) infrastructure.

---

## Current State Analysis

### ✅ What Exists

1. **Database Schema** (`migrations/016_frost_signature_system.sql`)

   - `frost_transactions` - Transaction management (EXISTS)
   - `frost_transaction_participants` - Participant tracking (EXISTS)
   - `frost_signature_shares` - Signature share storage (EXISTS)
   - `frost_key_shares` - Encrypted key shares (EXISTS)
   - RLS policies for privacy-first architecture (EXISTS)
   - Indexes for performance (EXISTS)

2. **FROST Implementation** (`src/lib/frost/`)

   - `polynomial.ts` - Polynomial secret sharing (EXISTS)
   - `share-encryption.ts` - Share encryption (EXISTS)
   - `crypto-utils.ts` - Cryptographic utilities (EXISTS)
   - `zero-knowledge-nsec.ts` - Zero-knowledge key management (EXISTS)

3. **FROST Service** (`src/services/frostSignatureService.ts`)

   - `generateFrostSignatureShare()` - Signature generation (EXISTS)
   - `submitFrostSignatureShare()` - Database submission (EXISTS)
   - `computeFrostSignatureShare()` - FROST protocol implementation (EXISTS)
   - `aggregateFrostSignatures()` - Signature aggregation (EXISTS)

4. **SSS Integration** (`lib/api/sss-federated-signing.js`)
   - SSS reconstruction (EXISTS)
   - Guardian approval workflow (EXISTS)
   - CEPS integration (EXISTS)

### ❌ What's Missing (CRITICAL GAPS)

1. **FROST Signing Session Persistence**

   - **Problem:** `FROSTSigningSession` interface exists in code but NO database table
   - **Impact:** Sessions lost on page refresh, no recovery mechanism
   - **Location:** `netlify/functions/crypto/shamir-secret-sharing.ts:219-229`
   - **Missing Table:** `frost_signing_sessions`

2. **Nonce Management**

   - **Problem:** Nonces stored in-memory Map, not persisted
   - **Impact:** Nonce reuse vulnerability, session recovery impossible
   - **Security Risk:** CRITICAL - nonce reuse breaks FROST security
   - **Missing:** Database storage for nonce commitments

3. **Partial Signature Coordination**

   - **Problem:** No coordination mechanism for multi-round FROST signing
   - **Impact:** Cannot track which participants have submitted nonces/signatures
   - **Missing:** Session state machine (nonce_collection → signing → aggregation)

4. **Session Expiration & Cleanup**

   - **Problem:** No automated cleanup of expired FROST sessions
   - **Impact:** Database bloat, stale sessions
   - **Missing:** Cleanup functions and scheduled tasks

5. **Integration with SSS System**

   - **Problem:** FROST and SSS operate independently
   - **Impact:** Duplicate code, inconsistent behavior
   - **Missing:** Unified federated signing service

6. **CEPS Integration for FROST Events**
   - **Problem:** FROST signatures not published via CEPS
   - **Impact:** No Nostr event broadcasting for FROST-signed transactions
   - **Missing:** CEPS methods for FROST event publishing

---

## Identified Issues

### Issue 1: Missing `frost_signing_sessions` Table

**Severity:** CRITICAL  
**Description:** The `FROSTSigningSession` interface exists in code but has no corresponding database table.

**Current Code:**

```typescript
// netlify/functions/crypto/shamir-secret-sharing.ts:219-229
export interface FROSTSigningSession {
  sessionId: string;
  message: Uint8Array;
  participants: string[]; // guardian IDs
  threshold: number;
  nonces: Map<string, { commitment: string; nonce: string }>;
  partialSignatures: Map<string, string>;
  finalSignature?: FROSTSignature;
  createdAt: Date;
  expiresAt: Date;
}
```

**Problem:** This data structure is never persisted to database.

**Solution:** Create `frost_signing_sessions` table with proper schema.

### Issue 2: Nonce Reuse Vulnerability

**Severity:** CRITICAL (SECURITY)  
**Description:** Nonces are stored in-memory and can be reused across sessions.

**Security Impact:**

- Nonce reuse in FROST signatures breaks cryptographic security
- Attackers can derive private keys if nonces are reused
- No replay protection for nonce commitments

**Solution:** Persist nonces with unique constraints and replay protection.

### Issue 3: No Session State Machine

**Severity:** HIGH  
**Description:** FROST signing requires multiple rounds (nonce collection → signing → aggregation) but there's no state tracking.

**Current Behavior:**

- Participants submit signature shares independently
- No coordination of nonce exchange phase
- No validation that all nonces collected before signing

**Solution:** Implement state machine: `pending` → `nonce_collection` → `signing` → `aggregating` → `completed`

### Issue 4: Duplicate Infrastructure

**Severity:** MEDIUM  
**Description:** Both FROST and SSS have separate signing infrastructure.

**Tables:**

- FROST: `frost_transactions`, `frost_signature_shares`
- SSS: `sss_signing_requests` (created in Task 6)

**Problem:** Inconsistent behavior, duplicate code, maintenance burden.

**Solution:** Unify under single federated signing service with FROST as signing method.

### Issue 5: No CEPS Integration

**Severity:** MEDIUM  
**Description:** FROST-signed events not published to Nostr relays via CEPS.

**Current Behavior:**

- SSS signing publishes via CEPS (Task 6)
- FROST signing does NOT publish via CEPS
- Inconsistent event broadcasting

**Solution:** Add CEPS methods for FROST event publishing.

---

## Implementation Plan

### Phase 1: Database Schema (CRITICAL)

**Estimated Time:** 2-3 hours  
**Priority:** HIGHEST

#### Subtask 1.1: Create `frost_signing_sessions` Table

- Add table with columns: `session_id`, `message_hash`, `participants`, `threshold`, `nonce_commitments`, `partial_signatures`, `final_signature`, `status`, `created_at`, `expires_at`, `completed_at`
- Add indexes for performance
- Add RLS policies for privacy
- Add helper functions for expiration and cleanup

#### Subtask 1.2: Add Nonce Storage

- Add `frost_nonce_commitments` table
- Unique constraint on `(session_id, participant_duid, nonce_commitment)` to prevent reuse
- Timestamp tracking for replay protection

#### Subtask 1.3: Migration File

- Create `scripts/036_frost_signing_sessions.sql`
- Idempotent design (safe to run multiple times)
- Comprehensive comments and documentation

**Deliverables:**

- `scripts/036_frost_signing_sessions.sql` (migration file)
- `tests/frost-signing-sessions-migration.test.ts` (test suite)

### Phase 2: Session Management Service (HIGH)

**Estimated Time:** 3-4 hours  
**Priority:** HIGH

#### Subtask 2.1: Create FROST Session Manager

- Create `lib/frost/frost-session-manager.ts`
- Methods: `createSession()`, `getSession()`, `updateSession()`, `expireSession()`, `cleanupExpiredSessions()`
- State machine implementation
- Nonce management with replay protection

#### Subtask 2.2: Nonce Coordination

- `submitNonceCommitment()` - Store nonce commitment
- `getAllNonceCommitments()` - Retrieve all nonces for session
- `validateNonceUniqueness()` - Prevent nonce reuse

#### Subtask 2.3: Partial Signature Coordination

- `submitPartialSignature()` - Store partial signature
- `getAllPartialSignatures()` - Retrieve all signatures for session
- `checkThresholdMet()` - Validate threshold reached

**Deliverables:**

- `lib/frost/frost-session-manager.ts` (session manager)
- `tests/frost-session-manager.test.ts` (test suite)

### Phase 3: Integration with Existing Systems (MEDIUM)

**Estimated Time:** 2-3 hours  
**Priority:** MEDIUM

#### Subtask 3.1: Integrate with SSS System

- Update `lib/api/sss-federated-signing.js` to support FROST
- Add `signingMethod` field: `'sss' | 'frost'`
- Unified guardian approval workflow

#### Subtask 3.2: CEPS Integration

- Add `publishFrostSignedEvent()` to CEPS
- Add `notifyFrostSigningComplete()` to CEPS
- Integrate with existing relay selection logic

#### Subtask 3.3: Update FROST Service

- Update `src/services/frostSignatureService.ts` to use session manager
- Replace in-memory storage with database persistence
- Add session recovery logic

**Deliverables:**

- Updated `lib/api/sss-federated-signing.js`
- Updated `lib/central_event_publishing_service.ts`
- Updated `src/services/frostSignatureService.ts`
- `tests/frost-integration.test.ts` (integration tests)

### Phase 4: Monitoring & Cleanup (LOW)

**Estimated Time:** 1-2 hours  
**Priority:** LOW

#### Subtask 4.1: Add FROST Monitoring

- Extend `lib/monitoring/federated-signing-monitor.ts` to include FROST metrics
- Add `getFrostSessionMetrics()`
- Add `getFrostFailedSessions()`

#### Subtask 4.2: Automated Cleanup

- Add cleanup function for expired FROST sessions
- Add cleanup function for orphaned nonce commitments
- Schedule periodic cleanup (similar to SSS cleanup)

**Deliverables:**

- Updated `lib/monitoring/federated-signing-monitor.ts`
- `tests/frost-monitoring.test.ts` (test suite)

---

## Database Schema Design

### `frost_signing_sessions` Table

```sql
CREATE TABLE IF NOT EXISTS public.frost_signing_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL UNIQUE,
    family_id TEXT NOT NULL,
    message_hash TEXT NOT NULL,
    participants TEXT[] NOT NULL,
    threshold INTEGER NOT NULL CHECK (threshold >= 1 AND threshold <= 7),

    -- Session state
    status TEXT NOT NULL DEFAULT 'pending' CHECK (
        status IN ('pending', 'nonce_collection', 'signing', 'aggregating', 'completed', 'failed', 'expired')
    ),

    -- Cryptographic data (JSONB for flexibility)
    nonce_commitments JSONB DEFAULT '{}',
    partial_signatures JSONB DEFAULT '{}',
    final_signature JSONB,

    -- Metadata
    created_by TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    expires_at BIGINT NOT NULL,
    completed_at BIGINT,
    failed_at BIGINT,
    error_message TEXT,

    -- Audit trail
    last_activity BIGINT,
    nonce_count INTEGER NOT NULL DEFAULT 0,
    signature_count INTEGER NOT NULL DEFAULT 0
);
```

### `frost_nonce_commitments` Table

```sql
CREATE TABLE IF NOT EXISTS public.frost_nonce_commitments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL REFERENCES frost_signing_sessions(session_id) ON DELETE CASCADE,
    participant_duid TEXT NOT NULL,

    -- Cryptographic data
    nonce_commitment TEXT NOT NULL,
    nonce_hash TEXT NOT NULL, -- SHA-256 hash for verification

    -- Timestamps
    submitted_at BIGINT NOT NULL,

    -- Unique constraint to prevent nonce reuse
    CONSTRAINT unique_nonce_per_session UNIQUE (session_id, participant_duid),
    CONSTRAINT unique_nonce_commitment UNIQUE (nonce_commitment)
);
```

---

## Security Considerations

### 1. Nonce Reuse Prevention

- **Requirement:** Each FROST signature MUST use unique nonces
- **Implementation:** Unique constraint on `nonce_commitment` column
- **Validation:** Check nonce uniqueness before accepting commitment

### 2. Replay Protection

- **Requirement:** Prevent replay of old nonce commitments
- **Implementation:** Timestamp validation + session expiration
- **Validation:** Reject commitments for expired sessions

### 3. Session Isolation

- **Requirement:** FROST sessions must be isolated per family/transaction
- **Implementation:** RLS policies based on `family_id`
- **Validation:** Users can only access sessions for their family

### 4. Memory Protection

- **Requirement:** Clear intermediate cryptographic values
- **Implementation:** Secure wipe after signature aggregation
- **Validation:** No sensitive data in logs or error messages

---

## Testing Strategy

### Unit Tests

- `frost-signing-sessions-migration.test.ts` - Database schema tests
- `frost-session-manager.test.ts` - Session manager tests
- `frost-nonce-coordination.test.ts` - Nonce management tests

### Integration Tests

- `frost-integration.test.ts` - End-to-end FROST signing flow
- `frost-sss-integration.test.ts` - FROST + SSS integration
- `frost-ceps-integration.test.ts` - FROST + CEPS integration

### Security Tests

- Nonce reuse prevention
- Replay attack protection
- Session isolation validation
- RLS policy enforcement

---

## Success Criteria

### Phase 1 (Database Schema)

- [x] `frost_signing_sessions` table created
- [x] `frost_nonce_commitments` table created
- [x] Indexes and RLS policies in place
- [x] Migration tests passing (100%)

### Phase 2 (Session Management)

- [ ] FROST session manager implemented
- [ ] Nonce coordination working
- [ ] Partial signature coordination working
- [ ] Session manager tests passing (100%)

### Phase 3 (Integration)

- [ ] SSS integration complete
- [ ] CEPS integration complete
- [ ] FROST service updated
- [ ] Integration tests passing (100%)

### Phase 4 (Monitoring)

- [ ] FROST monitoring added
- [ ] Automated cleanup implemented
- [ ] Monitoring tests passing (100%)

---

## Risks & Mitigation

### Risk 1: Breaking Existing FROST Functionality

**Mitigation:** Incremental implementation with feature flags

### Risk 2: Performance Impact

**Mitigation:** Proper indexing, query optimization, connection pooling

### Risk 3: Nonce Reuse Vulnerability

**Mitigation:** Database-level unique constraints, validation before acceptance

### Risk 4: Session Bloat

**Mitigation:** Automated cleanup, retention policies

---

## Next Steps

1. **Get User Approval** - Review this plan with user before proceeding
2. **Phase 1 Implementation** - Start with database schema
3. **Test Phase 1** - Ensure all migration tests pass
4. **Phase 2 Implementation** - Build session manager
5. **Test Phase 2** - Ensure all session manager tests pass
6. **Continue Incrementally** - One phase at a time with testing

---

## Estimated Total Time

- **Phase 1:** 2-3 hours
- **Phase 2:** 3-4 hours
- **Phase 3:** 2-3 hours
- **Phase 4:** 1-2 hours
- **Total:** 8-12 hours

---

## Questions for User

1. Should we proceed with Phase 1 (Database Schema) first?
2. Do you want FROST and SSS to be unified under a single service, or keep them separate?
3. What should be the default session expiration time for FROST sessions? (Recommendation: 5 minutes)
4. Should we implement automatic session recovery on page refresh?
5. Any specific security requirements beyond nonce reuse prevention?

---

**Status:** ✅ PLAN COMPLETE - Awaiting user approval to proceed with Phase 1
