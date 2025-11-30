# Guardian Approval UI Implementation Plan

**Document ID:** GUARDIAN-APPROVAL-UI-001
**Version:** 1.0
**Date:** 2025-11-28
**Parent Documents:**

- `SECURITY_AUDIT_REPORT.md`
- `audit-reports/IMPLEMENTATION_STATUS_DETAIL.md`
- `docs/planning/nfc-auth/NFC_AUTH_TASK_BREAKDOWN.md`

---

## Executive Summary

This document provides a comprehensive implementation plan for completing the Guardian Approval UI system as identified in the NFC Authentication assessment. The current implementation has mock approval logic that must be replaced with production-ready, security-hardened guardian approval workflows.

### Success Criteria

- ✅ Real-time guardian approval request/response system
- ✅ Nostr-based encrypted messaging with authenticated relays
- ✅ Configurable timeout and fallback mechanisms
- ✅ NFC-based secondary approval authentication
- ✅ Comprehensive audit trail logging
- ✅ Zero-knowledge compliance across all operations

### Implementation Scope

- UI Components: Approval dialogs, status displays, timeout handling
- Backend Integration: Nostr messaging, CEPS signature verification
- Security Hardening: Anti-timing attacks, rate limiting, cryptographic validation
- Testing: Unit tests, integration tests, E2E flows

---

## Task Breakdown

### Phase 1: Core UI Components (Week 1)

#### Task 1.1: Guardian Approval Request Dialog

**File:** `src/components/guardian/GuardianApprovalRequestDialog.tsx`
**Priority:** CRITICAL
**Effort:** 6-8 hours

**Requirements:**

- Real-time message history display
- User-friendly icons and accessibility features
- Operation details (amount, recipient, memo - zero-knowledge)
- Approval button with loading states
- Reject button with optional reason input
- Timeout countdown display
- Auto-refresh every 5 seconds

**Implementation:**

```typescript
interface GuardianApprovalRequestDialogProps {
  request: GuardianApprovalRequest;
  onApprove: (signature: string) => Promise<void>;
  onReject: (reason?: string) => Promise<void>;
  onTimeout: () => void;
  timeoutMs: number;
}

export function GuardianApprovalRequestDialog({
  request,
  onApprove,
  onReject,
  onTimeout,
  timeoutMs,
}: GuardianApprovalRequestDialogProps) {
  // Implementation with real-time updates, accessibility, icons
}
```

#### Task 1.2: Guardian Approval Status Modal

**File:** `src/components/guardian/GuardianApprovalStatusModal.tsx`
**Priority:** HIGH
**Effort:** 4-6 hours

**Requirements:**

- Real-time approval status (pending/approved/rejected/expired)
- Progress indicators showing k of n guardians approved
- Individual guardian status display (anonymized)
- Time remaining countdown
- Fallback option display (when available)

#### Task 1.3: NFC Guardian Authentication Component

**File:** `src/components/guardian/NFCGuardianApproval.tsx`
**Priority:** HIGH
**Effort:** 4-6 hours

**Requirements:**

- Integration with `NFCAuthService.tapToSign()`
- Purpose-specific signing ("guardian-approval")
- Real-time NFC tap feedback
- Error handling for card mismatch/invalid signatures

---

### Phase 2: Nostr Messaging Integration (Week 2)

#### Task 2.1: Nostr Relay Authentication

**File:** `src/lib/nostr/guardian-approval-relay.ts`
**Priority:** CRITICAL
**Effort:** 8-10 hours

**Requirements:**

- Authenticated relay connections using npub keys
- NIP-42 AUTH challenge-response authentication
- Relay failover and retry logic
- Connection pooling for multiple guardians

**Security Considerations:**

- Use CEPS for all relay connections (no placeholder signatures)
- Validate relay authenticity before sending approval requests
- Implement relay reputation scoring

#### Task 2.2: Encrypted Approval Messages

**File:** `src/lib/nostr/guardian-approval-messaging.ts`
**Priority:** CRITICAL
**Effort:** 10-12 hours

**Requirements:**

- Primary: NIP-17 sealed DMs with kind 1059 gift-wrap
- Fallback: NIP-04/NIP-44 encrypted DMs
- Message format standardization
- Signature verification using CEPS (no placeholders)

**Implementation:**

```typescript
interface GuardianApprovalMessage {
  type: "guardian_approval_request" | "guardian_approval_response";
  operationHash: string;
  federationDuid: string;
  requesterNpub: string;
  operation: GuardianApprovalRequest["operation"];
  // Zero-knowledge: no raw amounts/recipients in message
  metadata: {
    operationType: string;
    timestamp: number;
    expiresAt: number;
  };
}
```

#### Task 2.3: Approval Message Processing

**File:** `src/lib/nostr/guardian-approval-processor.ts`
**Priority:** CRITICAL
**Effort:** 8-10 hours

**Requirements:**

- Real-time message subscription with CEPS
- Message decryption and validation
- Duplicate approval detection
- Signature verification using CEPS.verifyEventSignature()
- Approval aggregation and threshold checking

---

### Phase 3: Security Hardening (Week 3)

#### Task 3.1: Anti-Timing Attack Protection

**File:** `src/lib/security/timing-attack-protection.ts`
**Priority:** CRITICAL
**Effort:** 4-6 hours

**Requirements:**

- Constant-time approval checking operations
- Random delays for approval validation
- Memory access pattern normalization
- Side-channel attack prevention

#### Task 3.2: Rate Limiting Implementation

**File:** `src/lib/security/guardian-rate-limiting.ts`
**Priority:** HIGH
**Effort:** 6-8 hours

**Requirements:**

- Per-guardian request rate limiting
- Per-operation retry limits
- Exponential backoff for failed requests
- Database-backed rate limit tracking

#### Task 3.3: Cryptographic Validation Layer

**File:** `src/lib/security/guardian-crypto-validation.ts`
**Priority:** CRITICAL
**Effort:** 8-10 hours

**Requirements:**

- npubToHex conversion using real implementation (no placeholders)
- Event signature verification using CEPS (no placeholders)
- Public key validation for all guardians
- Hash verification for operation integrity

---

### Phase 4: Timeout and Fallback Mechanisms (Week 4)

#### Task 4.1: Configurable Timeout System

**File:** `src/lib/guardian/timeout-manager.ts`
**Priority:** HIGH
**Effort:** 4-6 hours

**Requirements:**

- Configurable timeout windows (5-30 minutes)
- Automatic timeout handling
- User notification of impending timeouts
- Graceful degradation when timeouts occur

#### Task 4.2: Fallback Mechanisms

**File:** `src/lib/guardian/fallback-manager.ts`
**Priority:** HIGH
**Effort:** 6-8 hours

**Requirements:**

- Email/SMS notifications when Nostr unavailable
- Vault escrow options for high-value operations
- Offline approval queuing for later sync
- Manual approval input for emergency situations

#### Task 4.3: Offline Messaging Support

**File:** `src/lib/guardian/offline-messaging.ts`
**Priority:** MEDIUM
**Effort:** 4-6 hours

**Requirements:**

- QR code generation for offline approval requests
- Manual approval code entry
- Offline approval storage and sync
- Conflict resolution for concurrent approvals

---

### Phase 5: Audit Trail Integration (Week 5)

#### Task 5.1: Comprehensive Audit Logging

**File:** `src/lib/audit/guardian-approval-audit.ts`
**Priority:** CRITICAL
**Effort:** 6-8 hours

**Requirements:**

- All approval requests logged to audit trails
- Zero-knowledge logging (no sensitive operation data)
- Approval decisions tracked with timestamps
- Fallback mechanism usage logged
- Timeout events recorded

**Integration Points:**

- Link to `SECURITY_AUDIT_REPORT.md` zero-knowledge compliance
- Update `audit-reports/IMPLEMENTATION_STATUS_DETAIL.md` with completion status

#### Task 5.2: Audit Trail Verification

**File:** `src/lib/audit/guardian-audit-verification.ts`
**Priority:** HIGH
**Effort:** 4-6 hours

**Requirements:**

- Cryptographic verification of audit log integrity
- Tamper detection mechanisms
- Audit log backup and recovery
- Compliance reporting capabilities

---

### Phase 6: Testing and Integration (Week 6)

#### Task 6.1: Unit Tests

**Files:** `src/components/guardian/__tests__/*.test.tsx`
**Priority:** HIGH
**Effort:** 8-10 hours

**Test Coverage:**

- Dialog state management
- Timeout handling
- NFC integration
- Error states
- Accessibility features

#### Task 6.2: Integration Tests

**Files:** `src/lib/guardian/__tests__/*.test.ts`
**Priority:** CRITICAL
**Effort:** 10-12 hours

**Test Coverage:**

- Nostr messaging flows
- Approval aggregation logic
- Security hardening features
- Fallback mechanisms
- Audit trail verification

#### Task 6.3: E2E Tests

**File:** `cypress/e2e/guardian-approval.cy.ts`
**Priority:** HIGH
**Effort:** 8-10 hours

**Test Coverage:**

- Complete approval workflow (request → approval → completion)
- Cross-device approval flows
- Timeout and fallback scenarios
- NFC approval integration

#### Task 6.4: Security Testing

**File:** `tests/security/guardian-approval-security.test.ts`
**Priority:** CRITICAL
**Effort:** 6-8 hours

**Test Coverage:**

- Timing attack resistance
- Rate limiting effectiveness
- Cryptographic validation
- Zero-knowledge compliance

---

## Architecture Integration

### CEPS Integration Requirements

**Critical Dependencies:**

- `CEPS.verifyEventSignature()` - Must be real implementation, not placeholder
- `CEPS.npubToHex()` - Must be real implementation, not placeholder
- `CEPS.signEventWithActiveSession()` - Must work with temporary nsec sessions

**Integration Points:**

```typescript
// Example: Real signature verification (not placeholder)
const isValid = CEPS.verifyEventSignature(approvalEvent);
if (!isValid) {
  throw new Error("Guardian approval signature verification failed");
}
```

### NFC Integration Requirements

**Integration with `src/lib/nfc-auth.ts`:**

- Use `tapToSign()` for guardian approvals
- Leverage entropy harvesting from NFC operations
- Integrate with existing card configuration system

**Security Enhancement:**

```typescript
// NFC-based guardian approval
const signature = await nfcAuth.tapToSign({
  message: approvalMessage,
  purpose: "guardian-approval",
  signingSessionId: sessionId,
});
```

### Audit Trail Integration

**Zero-Knowledge Logging:**

```typescript
// Compliant with SECURITY_AUDIT_REPORT.md requirements
await auditLog.logEvent({
  action: "guardian_approval_request",
  resource_type: "federation_operation",
  resource_id: operationHash.substring(0, 8), // Zero-knowledge
  action_data: {
    federation_duid: federationDuid,
    operation_type: operation.type,
    guardian_count: eligibleGuardians.length,
    required_threshold: threshold,
  },
});
```

---

## Security Compliance Checklist

### Zero-Knowledge Requirements (from SECURITY_AUDIT_REPORT.md)

- [ ] No raw operation amounts/recipients in approval messages
- [ ] No plaintext signatures in logs
- [ ] npubToHex conversions use real implementation
- [ ] Event signatures verified with real CEPS functions

### Anti-Timing Attack Requirements

- [ ] Constant-time approval validation
- [ ] Random delays in response times
- [ ] Memory access pattern normalization
- [ ] No early returns based on approval status

### Rate Limiting Requirements

- [ ] Per-guardian request limits (max 10/minute)
- [ ] Per-operation retry limits (max 3 retries)
- [ ] Exponential backoff on failures
- [ ] Database-backed tracking

---

## Implementation Timeline

| Week | Phase                | Deliverables                                  | Effort    | Dependencies |
| ---- | -------------------- | --------------------------------------------- | --------- | ------------ |
| 1    | Core UI Components   | Request/Status dialogs, NFC integration       | 16-20 hrs | None         |
| 2    | Nostr Messaging      | Relay auth, encrypted messages, processing    | 26-32 hrs | CEPS fixes   |
| 3    | Security Hardening   | Anti-timing, rate limiting, crypto validation | 18-24 hrs | Phase 2      |
| 4    | Timeouts & Fallbacks | Configurable timeouts, email/SMS, offline     | 14-20 hrs | Phase 3      |
| 5    | Audit Integration    | Comprehensive logging, verification           | 10-14 hrs | All phases   |
| 6    | Testing              | Unit, integration, E2E, security tests        | 32-40 hrs | All phases   |

**Total Effort:** 116-150 hours (4-6 weeks)

---

## Success Metrics

### Functional Metrics

- ✅ 100% guardian approval requests delivered via Nostr
- ✅ 99% approval signature verification success rate
- ✅ <30 second average approval response time
- ✅ 100% timeout scenarios handled gracefully

### Security Metrics

- ✅ Zero timing attack vulnerabilities
- ✅ Rate limiting prevents abuse (100% effectiveness)
- ✅ All cryptographic operations use real implementations
- ✅ 100% zero-knowledge compliance in logs

### Quality Metrics

- ✅ >90% test coverage for all components
- ✅ <1% false positive approval rejections
- ✅ 100% accessibility compliance (WCAG 2.1 AA)
- ✅ <500ms UI response times

---

## Risk Mitigation

### High-Risk Items

1. **CEPS Placeholder Functions** - Must be fixed before integration
2. **Nostr Relay Authentication** - Critical for message delivery
3. **Timing Attack Prevention** - Security requirement from audit

### Fallback Strategies

1. **Nostr Unavailable:** Email/SMS fallbacks
2. **CEPS Broken:** Simplified approval flow with increased threshold
3. **NFC Unavailable:** Password-based guardian authentication
4. **Timeout Exceeded:** Vault escrow with delayed execution

---

## Conclusion

This implementation plan provides a comprehensive roadmap for completing the Guardian Approval UI system with robust security integration. The plan addresses all requirements from the security audit while ensuring zero-knowledge compliance and production readiness.

**Next Steps:**

1. Begin with Phase 1 UI components
2. Verify CEPS cryptographic functions are production-ready
3. Implement Nostr messaging integration
4. Add comprehensive security hardening

**Approval Required:** Security Team, Product Owner
**Timeline:** 4-6 weeks from approval
**Budget Impact:** 116-150 developer hours
