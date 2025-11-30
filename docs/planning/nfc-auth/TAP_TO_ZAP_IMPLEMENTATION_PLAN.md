# Tap-to-Zap Lightning Flow Implementation Plan

**Status:** Planning Phase (No Implementation Yet)  
**Date:** November 30, 2025  
**Scope:** Complete infrastructure for NTAG424-based Lightning Zap flows with steward approvals

---

## 1. Gap Analysis

### 1.1 Lightning Flow Gaps

**Current State:**
- `NFCAuthService.tapToSpend()` creates signed `NTAG424SpendOperation` with `paymentType: "lightning"`
- `ntag424Manager.executeTapToSpend()` calls `lightningClient.sendPayment()` (mock implementation)
- `lightningClient.sendPayment()` returns mock success without actual payment execution
- No connection between NTAG424 operations and real LNbits/PhoenixD/NWC invoice payment

**Missing Components:**
1. **Invoice Generation Pipeline** - Convert `TapToSpendRequest` (amount, recipient) → Lightning invoice (bolt11)
   - Recipient resolution: npub → Lightning address → LNURL endpoint → invoice
   - Amount validation and fee estimation
   - Privacy-preserving invoice wrapping
   - Effort: 8 hours | Complexity: Medium

2. **Payment Execution Routing** - Route payment to correct backend (LNbits/PhoenixD/NWC)
   - Backend selection logic based on user role, recipient, amount
   - Fallback chain if primary backend fails
   - Payment status polling and confirmation
   - Effort: 6 hours | Complexity: Medium

3. **Payment Failure Handling** - Handle failures after steward approvals granted
   - Retry logic with same approvals vs new approval round
   - Partial payment scenarios
   - Refund/reversal workflows
   - Effort: 5 hours | Complexity: High

4. **Transaction Recording** - Store payment metadata in Supabase
   - Privacy-preserving transaction logging
   - Payment hash, preimage, invoice tracking
   - Audit trail for compliance
   - Effort: 4 hours | Complexity: Low

**Total Lightning Gap Effort:** 23 hours

---

### 1.2 CEPS Encryption Gaps

**Current State:**
- `StewardApprovalClient.publishApprovalRequests()` uses NIP-17 gift-wrap (kind 1059 + kind 13)
- Fallback to NIP-04/NIP-44 standard DMs if NIP-17 fails
- `awaitApprovals()` listens for kinds [1059, 13, 4, 14] and decrypts responses
- CEPS provides `sealKind13WithActiveSession()`, `giftWrap1059()`, `openNip17DmWithActiveSession()`

**Potential Issues:**
1. **NIP-17 Correctness Validation** - Verify gift-wrap implementation matches NIP-17 spec
   - Kind 13 sealing with NIP-44 encryption
   - Kind 1059 wrapping with ephemeral key
   - Recipient pubkey handling in tags
   - Effort: 3 hours | Complexity: Low

2. **NIP-04/NIP-44 Fallback Handling** - Ensure fallback doesn't leak metadata
   - Protocol selection logic (when to use NIP-04 vs NIP-44)
   - Encryption strength consistency
   - Decryption error handling
   - Effort: 2 hours | Complexity: Low

3. **Replay Attack Prevention** - Steward approval messages should be non-replayable
   - Nonce validation in approval payloads
   - Timestamp validation (expiresAt field)
   - Operation hash binding
   - Effort: 2 hours | Complexity: Medium

4. **Logging & Privacy** - Ensure no sensitive data in logs
   - Verify fingerprinting doesn't expose pubkeys
   - Check operation hash truncation
   - Audit log review
   - Effort: 1 hour | Complexity: Low

**Total CEPS Gap Effort:** 8 hours

---

### 1.3 Nostr Zap Integration Gaps

**Current State:**
- `docs/EXTERNAL_RESOURCES_ANALYSIS.md` documents NIP-57 protocol
- `api/individual/lightning/zap.js` has mock zap endpoint
- `src/lib/automated-signing-manager.ts` creates kind 9734 events (unsigned)
- No zap request validation, LNURL callback handling, or receipt validation

**Missing Components:**
1. **Zap Request Creation & Signing** - Build kind 9734 events
   - Create `src/lib/zap-service.ts` with `createZapRequest()`
   - Sign with CEPS via `signEventWithActiveSession()`
   - Validate structure (tags, amount, relays)
   - Effort: 4 hours | Complexity: Low

2. **LNURL Callback Integration** - Send zap requests to recipient's LNURL server
   - Extend `netlify/functions/lnbits-proxy.ts` to handle zap validation
   - Create `POST /api/payments/zap-request-validate` endpoint
   - Description-hash invoice generation
   - Effort: 5 hours | Complexity: Medium

3. **Zap Receipt Validation** - Verify kind 9735 receipts
   - Create `src/lib/zap-receipt-validator.ts`
   - Validate pubkey, amount, description hash
   - Extract amount from bolt11 invoices
   - Effort: 4 hours | Complexity: Medium

4. **Zap Receipt Storage & Display** - Persist and show zap history
   - Create `zap_receipts` Supabase table with RLS
   - Subscribe to kind 9735 events via CEPS
   - Display zap history on profiles/events
   - Effort: 5 hours | Complexity: Low

**Total Zap Gap Effort:** 18 hours

---

### 1.4 UI/UX Gaps

**Current State:**
- `nfc-auth-ui-adapter.ts` provides error handling for NFC flows
- No recipient selection UI (npub/Lightning address/NIP-05)
- No amount entry or validation UI
- No steward approval progress display
- No integration with Tap-to-Zap flows

**Missing Components:**
1. **Recipient Selection Component** - Multi-format recipient input
   - Support npub, Lightning address (user@domain), NIP-05, bolt11 invoices
   - Auto-detection and validation
   - Recipient profile preview
   - Effort: 6 hours | Complexity: Medium

2. **Amount Entry & Validation** - User-friendly amount input
   - Satoshi/millisatoshi conversion
   - Fee estimation display
   - Spending limit warnings
   - Effort: 3 hours | Complexity: Low

3. **Steward Approval Progress UI** - Show approval status during NFC tap
   - Approval request sent indicator
   - Approver list with status (pending/approved/rejected)
   - Timeout countdown
   - Effort: 5 hours | Complexity: Medium

4. **Error Handling Integration** - Wire `nfc-auth-ui-adapter` errors to UI
   - Toast/dialog messages for each error reason
   - Retry buttons for transient failures
   - Support contact links for configuration errors
   - Effort: 3 hours | Complexity: Low

**Total UI/UX Gap Effort:** 17 hours

---

### 1.5 Testing Gaps

**Current State:**
- `src/lib/__tests__/nfc-auth.test.ts` covers steward-gated NFC flows
- `src/lib/__tests__/nfc-auth-ui-adapter.test.ts` covers error mapping
- No end-to-end Tap-to-Zap tests
- No payment failure scenario tests
- No zap receipt validation tests

**Missing Test Coverage:**
1. **End-to-End Tap-to-Zap Flow** - Full flow from NFC tap to payment confirmation
   - Mock LNbits/PhoenixD backends
   - Steward approval flow
   - Payment execution and receipt
   - Effort: 8 hours | Complexity: High

2. **Payment Failure Scenarios** - Test failure paths
   - Insufficient balance
   - Invoice expiration
   - Network timeout
   - Backend unavailability
   - Effort: 6 hours | Complexity: High

3. **Zap Receipt Validation Tests** - Verify receipt handling
   - Valid receipt acceptance
   - Invalid signature rejection
   - Amount mismatch detection
   - Description hash validation
   - Effort: 4 hours | Complexity: Medium

4. **Recipient Resolution Tests** - Test all recipient formats
   - npub → pubkey conversion
   - Lightning address → LNURL discovery
   - NIP-05 → pubkey resolution
   - Bolt11 invoice parsing
   - Effort: 4 hours | Complexity: Medium

**Total Testing Gap Effort:** 22 hours

---

## 2. Prioritized Task Breakdown

### Phase 1: Critical Security Gaps (CEPS Encryption) - 8 hours

#### TZ-1: Validate NIP-17 Gift-Wrap Implementation
- **Priority:** P0 (Security)
- **Effort:** 3 hours
- **Files:** `lib/central_event_publishing_service.ts`, `src/lib/steward/approval-client.ts`
- **Dependencies:** None
- **Acceptance Criteria:**
  - NIP-17 spec compliance verified (kind 13 sealing, kind 1059 wrapping)
  - Ephemeral key generation correct
  - Recipient pubkey properly tagged
  - Test coverage for encryption/decryption round-trip
- **Testing:** Unit tests for `sealKind13WithActiveSession()`, `giftWrap1059()`, `openNip17DmWithActiveSession()`

#### TZ-2: Implement Replay Attack Prevention
- **Priority:** P0 (Security)
- **Effort:** 2 hours
- **Files:** `src/lib/steward/approval-client.ts`
- **Dependencies:** TZ-1
- **Acceptance Criteria:**
  - Nonce validation in approval payloads
  - Timestamp validation (expiresAt enforcement)
  - Operation hash binding prevents reuse
  - Duplicate approval rejection
- **Testing:** Unit tests for replay scenarios

#### TZ-3: Audit CEPS Logging for Privacy Leaks
- **Priority:** P0 (Security)
- **Effort:** 1 hour
- **Files:** `lib/central_event_publishing_service.ts`, `src/lib/steward/approval-client.ts`
- **Dependencies:** None
- **Acceptance Criteria:**
  - No raw pubkeys in logs
  - No federation IDs in logs
  - Fingerprints properly truncated
  - Operation hashes truncated to 8 chars
- **Testing:** Log output review, grep for sensitive patterns

#### TZ-4: Enhance NIP-04/NIP-44 Fallback Handling
- **Priority:** P1 (High)
- **Effort:** 2 hours
- **Files:** `src/lib/steward/approval-client.ts`, `lib/central_event_publishing_service.ts`
- **Dependencies:** TZ-1
- **Acceptance Criteria:**
  - Fallback triggered only on NIP-17 failure
  - Protocol selection logic documented
  - Encryption strength consistent
  - Error handling for decryption failures
- **Testing:** Unit tests for fallback scenarios

---

### Phase 2: Core Lightning Zap Flow Infrastructure - 49 hours

#### TZ-5: Implement Recipient Resolution Pipeline
- **Priority:** P0 (Blocking)
- **Effort:** 8 hours
- **Files:** `src/lib/recipient-resolver.ts` (new), `src/utils/lightning-address.ts` (extend)
- **Dependencies:** None
- **Acceptance Criteria:**
  - Resolve npub → pubkey (hex)
  - Resolve Lightning address → LNURL endpoint
  - Resolve NIP-05 → pubkey via CEPS
  - Resolve bolt11 invoice → amount + recipient
  - Auto-detection of input format
  - Privacy-preserving (no logging of resolved identifiers)
- **Testing:** Unit tests for each resolution type, integration tests with real LNURL endpoints

#### TZ-6: Create Invoice Generation Service
- **Priority:** P0 (Blocking)
- **Effort:** 6 hours
- **Files:** `src/lib/invoice-service.ts` (new), `netlify/functions_active/invoice-generator.ts` (new)
- **Dependencies:** TZ-5
- **Acceptance Criteria:**
  - Generate bolt11 invoices via LNbits/PhoenixD
  - Amount validation (min/max)
  - Fee estimation
  - Privacy-preserving invoice wrapping
  - Timeout handling (invoices expire)
  - Fallback to secondary backend if primary fails
- **Testing:** Unit tests with mocked backends, integration tests with real LNbits

#### TZ-7: Implement Payment Execution Routing
- **Priority:** P0 (Blocking)
- **Effort:** 6 hours
- **Files:** `src/lib/payment-router.ts` (new), `src/lib/ntag424-production.ts` (extend)
- **Dependencies:** TZ-6
- **Acceptance Criteria:**
  - Route to LNbits/PhoenixD/NWC based on user role + recipient
  - Payment status polling
  - Confirmation detection (payment hash preimage)
  - Timeout handling
  - Fallback chain implementation
  - Zero-knowledge logging (no amounts, recipients)
- **Testing:** Unit tests for routing logic, integration tests with payment backends

#### TZ-8: Build Zap Request Creation Service
- **Priority:** P1 (High)
- **Effort:** 4 hours
- **Files:** `src/lib/zap-service.ts` (new)
- **Dependencies:** TZ-5
- **Acceptance Criteria:**
  - Create kind 9734 events with proper tags
  - Sign via CEPS `signEventWithActiveSession()`
  - Validate structure (p tag, amount tag, relays tag)
  - Optional message field
  - Relay discovery via NIP-10050
- **Testing:** Unit tests for event creation, signature validation

#### TZ-9: Implement Zap Receipt Validation
- **Priority:** P1 (High)
- **Effort:** 4 hours
- **Files:** `src/lib/zap-receipt-validator.ts` (new)
- **Dependencies:** TZ-8
- **Acceptance Criteria:**
  - Validate kind 9735 receipt structure
  - Verify pubkey matches LNURL provider
  - Verify amount matches expected
  - Validate description hash (SHA-256)
  - Extract bolt11 invoice amount
  - Reject invalid/expired receipts
- **Testing:** Unit tests for validation logic, test vectors from NIP-57 spec

#### TZ-10: Create Zap Receipt Storage & Subscription
- **Priority:** P1 (High)
- **Effort:** 5 hours
- **Files:** `supabase/migrations/zap_receipts.sql` (new), `src/lib/zap-receipt-store.ts` (new)
- **Dependencies:** TZ-9
- **Acceptance Criteria:**
  - Create `zap_receipts` table with RLS (user-scoped)
  - Subscribe to kind 9735 events via CEPS
  - Store validated receipts in Supabase
  - Query receipts by event/user/timerange
  - Privacy-first schema (no raw amounts/recipients)
- **Testing:** Integration tests with Supabase, CEPS subscription tests

#### TZ-11: Handle Payment Failures After Steward Approvals
- **Priority:** P1 (High)
- **Effort:** 5 hours
- **Files:** `src/lib/nfc-auth.ts` (extend), `src/lib/payment-router.ts` (extend)
- **Dependencies:** TZ-7
- **Acceptance Criteria:**
  - Detect payment failure after approvals granted
  - Retry with same approvals (configurable retry count)
  - Option to request new approvals if retries exhausted
  - Refund/reversal workflow for partial payments
  - Clear error messaging to user
- **Testing:** Unit tests for retry logic, integration tests with payment failures

#### TZ-12: Extend NTAG424 Production Manager for Zap Execution
- **Priority:** P1 (High)
- **Effort:** 5 hours
- **Files:** `src/lib/ntag424-production.ts` (extend)
- **Dependencies:** TZ-7, TZ-11
- **Acceptance Criteria:**
  - Replace mock `executeLightningPayment()` with real implementation
  - Call `paymentRouter.executePayment()` with signed operation
  - Handle payment confirmation
  - Log operation success/failure (privacy-preserving)
  - Integration with steward approval flow
- **Testing:** Unit tests with mocked payment router, integration tests

#### TZ-13: Create Zap Request Validation Netlify Function
- **Priority:** P1 (High)
- **Effort:** 4 hours
- **Files:** `netlify/functions_active/zap-request-validate.ts` (new)
- **Dependencies:** TZ-8
- **Acceptance Criteria:**
  - Validate kind 9734 signature
  - Check tags (p, amount, relays)
  - Verify sender pubkey
  - Return validation result + invoice
  - Handle LNURL callback integration
- **Testing:** Unit tests, integration tests with LNURL endpoints

---

### Phase 3: UI/UX Integration and Error Handling - 17 hours

#### TZ-14: Build Recipient Selection Component
- **Priority:** P1 (High)
- **Effort:** 6 hours
- **Files:** `src/components/TapToZapRecipientInput.tsx` (new)
- **Dependencies:** TZ-5
- **Acceptance Criteria:**
  - Input field with format auto-detection
  - Validation feedback (valid/invalid)
  - Recipient profile preview (name, avatar)
  - Support npub, Lightning address, NIP-05, bolt11
  - Accessibility (keyboard navigation, screen reader)
- **Testing:** Component tests, integration tests with recipient resolver

#### TZ-15: Create Amount Entry & Fee Display Component
- **Priority:** P1 (High)
- **Effort:** 3 hours
- **Files:** `src/components/TapToZapAmountInput.tsx` (new)
- **Dependencies:** TZ-6
- **Acceptance Criteria:**
  - Satoshi/millisatoshi toggle
  - Fee estimation display
  - Spending limit warnings
  - Min/max amount validation
  - Real-time fee updates
- **Testing:** Component tests, unit tests for fee calculation

#### TZ-16: Implement Steward Approval Progress UI
- **Priority:** P1 (High)
- **Effort:** 5 hours
- **Files:** `src/components/StewardApprovalProgress.tsx` (new)
- **Dependencies:** TZ-2
- **Acceptance Criteria:**
  - Show approval request sent indicator
  - List eligible approvers with status
  - Timeout countdown timer
  - Approved/rejected/expired state display
  - Accessibility (ARIA labels, keyboard support)
- **Testing:** Component tests, integration tests with steward approval client

#### TZ-17: Wire Error Handling to UI Components
- **Priority:** P1 (High)
- **Effort:** 3 hours
- **Files:** `src/lib/nfc-auth-ui-adapter.ts` (extend), UI components
- **Dependencies:** TZ-14, TZ-15, TZ-16
- **Acceptance Criteria:**
  - Map error reasons to user-friendly messages
  - Toast/dialog display for each error type
  - Retry buttons for transient failures
  - Support contact links for config errors
  - Accessibility (ARIA live regions)
- **Testing:** Component tests, integration tests with error scenarios

---

### Phase 4: Testing and Validation - 22 hours

#### TZ-18: Create End-to-End Tap-to-Zap Test Suite
- **Priority:** P1 (High)
- **Effort:** 8 hours
- **Files:** `src/lib/__tests__/tap-to-zap-e2e.test.ts` (new)
- **Dependencies:** All Phase 2 tasks
- **Acceptance Criteria:**
  - Full flow: NFC tap → recipient selection → amount entry → steward approvals → payment → receipt
  - Mock LNbits/PhoenixD backends
  - Steward approval flow simulation
  - Payment confirmation detection
  - Receipt validation and storage
  - All major paths covered (success, failures, timeouts)
- **Testing:** Integration tests with mocked backends

#### TZ-19: Implement Payment Failure Scenario Tests
- **Priority:** P1 (High)
- **Effort:** 6 hours
- **Files:** `src/lib/__tests__/payment-failures.test.ts` (new)
- **Dependencies:** TZ-7, TZ-11
- **Acceptance Criteria:**
  - Test insufficient balance scenario
  - Test invoice expiration
  - Test network timeout
  - Test backend unavailability
  - Test partial payment handling
  - Test retry logic
  - Test new approval request after retries exhausted
- **Testing:** Unit tests for each failure scenario

#### TZ-20: Build Zap Receipt Validation Test Suite
- **Priority:** P1 (High)
- **Effort:** 4 hours
- **Files:** `src/lib/__tests__/zap-receipt-validator.test.ts` (new)
- **Dependencies:** TZ-9
- **Acceptance Criteria:**
  - Valid receipt acceptance
  - Invalid signature rejection
  - Amount mismatch detection
  - Description hash validation
  - Expired receipt rejection
  - Test vectors from NIP-57 spec
- **Testing:** Unit tests with test vectors

#### TZ-21: Create Recipient Resolution Test Suite
- **Priority:** P1 (High)
- **Effort:** 4 hours
- **Files:** `src/lib/__tests__/recipient-resolver.test.ts` (new)
- **Dependencies:** TZ-5
- **Acceptance Criteria:**
  - npub → pubkey conversion
  - Lightning address → LNURL discovery
  - NIP-05 → pubkey resolution
  - Bolt11 invoice parsing
  - Invalid input rejection
  - Error handling for unreachable endpoints
- **Testing:** Unit tests with mocked LNURL endpoints

---

## 3. Implementation Phases

### Phase 1: Critical Security Gaps (CEPS Encryption)
**Duration:** 1 week | **Effort:** 8 hours  
**Deliverable:** Validated NIP-17 encryption, replay attack prevention, privacy audit  
**Success Criteria:** All CEPS encryption tests pass, no privacy leaks in logs

### Phase 2: Core Lightning Zap Flow Infrastructure
**Duration:** 2 weeks | **Effort:** 49 hours  
**Deliverable:** Complete Lightning payment pipeline, zap request/receipt handling  
**Success Criteria:** End-to-end Tap-to-Zap flow works with real LNbits/PhoenixD

### Phase 3: UI/UX Integration and Error Handling
**Duration:** 1 week | **Effort:** 17 hours  
**Deliverable:** User-facing components, error handling integration  
**Success Criteria:** All UI components render correctly, error messages are user-friendly

### Phase 4: Testing and Validation
**Duration:** 1 week | **Effort:** 22 hours  
**Deliverable:** Comprehensive test coverage, validated payment flows  
**Success Criteria:** All tests pass, payment failure scenarios handled gracefully

**Total Project Effort:** 96 hours (~2.4 weeks full-time)

---

## 4. Architecture Decisions

### 4.1 Zap Receipt Storage Strategy

**Decision:** Supabase table with privacy-first schema

**Rationale:**
- Enables zap history queries and display
- Privacy-first: store only hashed identifiers, not raw amounts/recipients
- RLS ensures user-scoped access
- Integrates with existing Supabase infrastructure

**Schema:**
```sql
CREATE TABLE zap_receipts (
  id UUID PRIMARY KEY,
  user_duid TEXT NOT NULL,  -- Privacy-preserving user identifier
  event_id TEXT NOT NULL,   -- Nostr event ID (kind 9735)
  amount_sats BIGINT NOT NULL,
  sender_pubkey_hash TEXT,  -- Hashed sender pubkey
  payment_hash TEXT,        -- Lightning payment hash
  receipt_event JSONB,      -- Full kind 9735 event
  validated BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Alternative Considered:** Client-only (localStorage/IndexedDB)
- **Rejected:** No cross-device sync, no server-side queries, privacy risk if device compromised

---

### 4.2 Payment Failure After Steward Approvals

**Decision:** Retry with same approvals (up to 3 retries), then request new approvals

**Rationale:**
- Transient failures (network, timeout) should retry without new approvals
- Persistent failures (insufficient balance, invoice expired) require new approvals
- Prevents approval fatigue while maintaining security

**Workflow:**
1. Payment fails after approvals granted
2. Retry up to 3 times with exponential backoff (1s, 2s, 4s)
3. If all retries fail, show user option to request new approvals
4. New approval round required if user chooses to retry

**Configuration:**
```typescript
const PAYMENT_RETRY_CONFIG = {
  maxRetries: 3,
  backoffMs: [1000, 2000, 4000],
  requireNewApprovalsAfter: 3,
};
```

---

### 4.3 Steward Approvals: Separate Events vs Embedded

**Decision:** Separate Nostr events (kind TBD, linked by operationHash)

**Rationale:**
- Preserves deterministic operation hashing (NTAG424 operations must be reproducible)
- Allows steward approvals to be audited independently
- Enables approval revocation/expiration without modifying operation
- Follows Nostr event model (immutable events, linked by tags)

**Implementation:**
- Steward approval events: kind 9999 (TBD, reserved for Satnam)
- Tags: `["operation_hash", "..."]`, `["decision", "approved|rejected"]`, `["federation_duid", "..."]`
- Published to relays, subscribed by NFCAuthService
- Linked to NTAG424 operations via operationHash

**Alternative Considered:** Embedded in operation envelope
- **Rejected:** Would require re-hashing operations, breaks determinism

---

### 4.4 Invoice vs Recipient Handling

**Decision:** Accept all formats with auto-detection

**Rationale:**
- Maximum flexibility for users
- Supports Lightning addresses, npubs, NIP-05, bolt11 invoices
- Auto-detection reduces user friction

**Resolution Priority:**
1. If starts with `lnbc` → Parse as bolt11 invoice
2. If starts with `npub1` → Resolve to Lightning address via NIP-05
3. If contains `@` → Treat as Lightning address, fetch LNURL
4. Otherwise → Try NIP-05 resolution

**Implementation:**
```typescript
async function resolveRecipient(input: string): Promise<ResolvedRecipient> {
  if (input.startsWith('lnbc')) {
    return parseBolt11Invoice(input);
  }
  if (input.startsWith('npub1')) {
    return resolveNpubToLightningAddress(input);
  }
  if (input.includes('@')) {
    return resolveLightningAddress(input);
  }
  return resolveNip05(input);
}
```

---

### 4.5 NWC vs LNbits vs PhoenixD Routing

**Decision:** User role + recipient-based routing with fallback chain

**Rationale:**
- Different backends have different capabilities/privacy properties
- User role determines available backends (offspring limited, adults/stewards unlimited)
- Recipient location (internal vs external) affects routing
- Fallback chain ensures payment succeeds if primary backend fails

**Routing Logic:**
```typescript
function selectPaymentBackend(
  userRole: UserRole,
  recipient: string,
  amount: number
): PaymentBackend[] {
  const isInternal = recipient.includes('@my.satnam.pub');
  
  if (userRole === 'offspring') {
    // Offspring: PhoenixD only (parental control)
    return ['phoenixd'];
  }
  
  if (isInternal) {
    // Internal: PhoenixD (privacy) → LNbits (fallback)
    return ['phoenixd', 'lnbits'];
  }
  
  // External: NWC (user's wallet) → LNbits → PhoenixD
  return ['nwc', 'lnbits', 'phoenixd'];
}
```

---

### 4.6 Task 5.5 Consideration: Tap-to-Verify Contacts

**Note:** Task 5.5 (Tap-to-Verify contacts) is separate from Tap-to-Zap but may share infrastructure:
- Both use NTAG424 NFC operations
- Both may require steward approvals for sensitive operations
- Recipient resolution logic can be shared
- Steward approval flow is identical

**Recommendation:** Design recipient resolver and steward approval flow to be reusable across both tasks.

---

## 5. Dependencies & Sequencing

```
TZ-1 (NIP-17 Validation)
  ↓
TZ-2 (Replay Prevention) → TZ-4 (NIP-04/44 Fallback)
  ↓
TZ-3 (Privacy Audit)

TZ-5 (Recipient Resolution)
  ↓
TZ-6 (Invoice Generation) → TZ-8 (Zap Request Creation)
  ↓
TZ-7 (Payment Routing) → TZ-9 (Receipt Validation)
  ↓
TZ-10 (Receipt Storage) → TZ-11 (Failure Handling)
  ↓
TZ-12 (NTAG424 Extension) → TZ-13 (Zap Validation Function)

TZ-14 (Recipient UI) → TZ-15 (Amount UI) → TZ-16 (Approval UI)
  ↓
TZ-17 (Error Handling)

TZ-18 (E2E Tests) → TZ-19 (Failure Tests) → TZ-20 (Receipt Tests) → TZ-21 (Resolver Tests)
```

---

## 6. Success Criteria

### Phase 1 Complete
- [ ] NIP-17 encryption validated against spec
- [ ] Replay attack prevention implemented and tested
- [ ] Privacy audit passed (no sensitive data in logs)
- [ ] NIP-04/44 fallback working correctly

### Phase 2 Complete
- [ ] Recipient resolution works for all formats
- [ ] Invoice generation succeeds with LNbits/PhoenixD
- [ ] Payment routing selects correct backend
- [ ] Zap requests created and signed correctly
- [ ] Zap receipts validated and stored
- [ ] Payment failures handled gracefully
- [ ] NTAG424 production manager executes real payments
- [ ] Zap validation function deployed

### Phase 3 Complete
- [ ] Recipient selection component renders and validates
- [ ] Amount entry component displays fees correctly
- [ ] Steward approval progress UI shows status
- [ ] Error messages are user-friendly and actionable
- [ ] All components accessible (WCAG 2.1 AA)

### Phase 4 Complete
- [ ] End-to-end Tap-to-Zap flow passes all tests
- [ ] Payment failure scenarios handled correctly
- [ ] Zap receipt validation tests pass
- [ ] Recipient resolution tests pass
- [ ] Code coverage > 80%

---

## 7. Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| CEPS encryption bugs | Medium | High | Phase 1 security audit, test vectors from NIP-57 |
| Payment backend failures | High | Medium | Fallback chain, retry logic, clear error messages |
| Steward approval timeout | Medium | Medium | Configurable timeout, user-friendly messaging |
| Privacy leaks in logs | Low | High | Automated log scanning, privacy audit |
| Recipient resolution failures | Medium | Low | Graceful fallbacks, user guidance |
| Zap receipt validation bugs | Low | High | Test vectors from spec, integration tests |

---

## 8. Next Steps

1. **Immediate:** Review and approve this plan with stakeholders
2. **Week 1:** Begin Phase 1 (CEPS encryption validation)
3. **Week 2-3:** Execute Phase 2 (Lightning infrastructure)
4. **Week 4:** Execute Phase 3 (UI/UX)
5. **Week 5:** Execute Phase 4 (Testing)
6. **Week 6:** Integration testing, bug fixes, deployment

**Estimated Total Timeline:** 6 weeks (with 1 week buffer for unforeseen issues)


