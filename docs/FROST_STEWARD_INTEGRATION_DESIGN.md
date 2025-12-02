# FROST Session Manager ↔ Steward Approval Integration Design

**Date**: 2025-12-01  
**Status**: DESIGN PHASE - Awaiting Approval  
**Objective**: Wire FROST multiparty signing into Steward Approval flows for NFC tap-to-spend and tap-to-sign operations

---

## 1. Current Architecture (Independent)

### Steward Approval Flow (Current)
```
NFC Tap → tapToSpend/tapToSign
  ↓
Check steward policy
  ↓
publishApprovalRequests() → Nostr DMs
  ↓
awaitApprovals() → Collect threshold approvals
  ↓
If approved: Continue to operation execution
If rejected/expired: Abort
```

### FROST Session Manager (Current)
```
createSession() → Initialize multiparty signing
  ↓
submitNonceCommitment() → Round 1 (collect nonces)
  ↓
submitPartialSignature() → Round 2 (collect signatures)
  ↓
aggregateSignatures() → Combine into final signature
  ↓
verifyAggregatedSignature() → Cryptographic verification
  ↓
publishSignedEvent() → Publish to Nostr relays
```

**Problem**: These operate independently. Steward Approval doesn't trigger FROST, and FROST doesn't integrate with NFC flows.

---

## 2. Proposed Integration Architecture

### High-Level Flow

```
NFC Tap (tapToSpend/tapToSign)
  ↓
Check steward policy
  ↓
IF steward approval required:
  ├─ publishApprovalRequests() → Nostr DMs
  ├─ awaitApprovals() → Collect threshold approvals
  ├─ IF approved:
  │  ├─ CREATE FROST SESSION
  │  │  ├─ Participants = eligible stewards
  │  │  ├─ Threshold = stewardThreshold
  │  │  └─ Message = operationHash
  │  ├─ COLLECT FROST SIGNATURES
  │  │  ├─ Round 1: Nonce commitments
  │  │  └─ Round 2: Partial signatures
  │  ├─ AGGREGATE SIGNATURES
  │  │  └─ Combine into final (R, s)
  │  ├─ VERIFY SIGNATURE
  │  │  └─ secp256k1.verify()
  │  └─ PUBLISH SIGNED EVENT
  │     └─ Nostr relays
  └─ IF rejected/expired: Abort

Execute operation with FROST signature
```

---

## 3. Integration Points (Specific Files & Line Numbers)

### 3.1 Steward Approval Client
**File**: `src/lib/steward/approval-client.ts`

**Current State**:
- `publishApprovalRequests()` (line 67-169): Publishes approval requests
- `awaitApprovals()` (line 171-346): Waits for threshold approvals

**Integration Point**: After `awaitApprovals()` returns `status: "approved"`, trigger FROST session creation.

**New Method Needed**:
```typescript
async createFrostSessionForApprovals(
  operationHash: string,
  familyId: string,
  stewardThreshold: number,
  eligibleStewardPubkeys: string[]
): Promise<{ sessionId: string; success: boolean; error?: string }>
```

---

### 3.2 NFC Auth Service
**File**: `src/lib/nfc-auth.ts`

**Current State**:
- `tapToSpend()` (line 637-780): Calls steward approval, then executes spend
- `tapToSign()` (line 785-919): Calls steward approval, then executes sign

**Integration Points**:

#### tapToSpend() - Line 754-762
```typescript
if (approvalResult.status !== "approved") {
  // CURRENT: Abort
  // NEW: Create FROST session, collect signatures, verify, then execute
}
```

**Changes**:
1. After approval, create FROST session with operation hash
2. Collect FROST signatures from stewards
3. Verify aggregated signature
4. Include FROST signature in operation execution

#### tapToSign() - Line 893-901
```typescript
if (approvalResult.status !== "approved") {
  // CURRENT: Abort
  // NEW: Create FROST session, collect signatures, verify, then execute
}
```

**Same changes as tapToSpend()**

---

### 3.3 FROST Session Manager
**File**: `lib/frost/frost-session-manager.ts`

**Current State**:
- `createSession()` (line 1-200): Creates FROST session
- `aggregateSignatures()` (line 656-873): Aggregates signatures
- `verifyAggregatedSignature()` (line 986-1138): Verifies signature
- `publishSignedEvent()` (line 1153-1327): Publishes to Nostr

**Integration Points**:

1. **Session Creation** (line 1-200):
   - Already supports `operationHash` parameter
   - Already supports `participants` parameter
   - No changes needed

2. **Signature Collection** (line 300-600):
   - Already supports `submitNonceCommitment()` and `submitPartialSignature()`
   - Participants submit signatures via Nostr DMs
   - No changes needed

3. **Aggregation & Verification** (line 656-1138):
   - Already production-ready
   - No changes needed

4. **Event Publishing** (line 1153-1327):
   - Already publishes to Nostr relays
   - No changes needed

**Conclusion**: FROST session manager is ready as-is. No modifications needed.

---

## 4. Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ NFC Tap-to-Spend/Sign                                           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Check Steward Policy                                            │
│ - Get stewardThreshold                                          │
│ - Get eligibleApproverPubkeys                                   │
│ - Get federationDuid                                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    ┌─────────┴─────────┐
                    │                   │
            NO APPROVAL NEEDED    APPROVAL NEEDED
                    │                   │
                    ↓                   ↓
            Execute directly    ┌──────────────────────┐
                                │ Steward Approval     │
                                │ publishRequests()    │
                                │ awaitApprovals()     │
                                └──────────────────────┘
                                        ↓
                            ┌───────────┴───────────┐
                            │                       │
                        APPROVED            REJECTED/EXPIRED
                            │                       │
                            ↓                       ↓
                    ┌──────────────────────┐    ABORT
                    │ FROST Session        │
                    │ createSession()      │
                    │ - operationHash      │
                    │ - participants       │
                    │ - threshold          │
                    └──────────────────────┘
                            ↓
                    ┌──────────────────────┐
                    │ Collect Signatures   │
                    │ Round 1: Nonces      │
                    │ Round 2: Partials    │
                    └──────────────────────┘
                            ↓
                    ┌──────────────────────┐
                    │ Aggregate Signatures │
                    │ aggregateSignatures()│
                    │ → (R, s)             │
                    └──────────────────────┘
                            ↓
                    ┌──────────────────────┐
                    │ Verify Signature     │
                    │ verifyAggregated...()│
                    │ → valid: true/false  │
                    └──────────────────────┘
                            ↓
                    ┌──────────────────────┐
                    │ Execute Operation    │
                    │ with FROST signature │
                    └──────────────────────┘
```

---

## 5. Implementation Strategy

### Phase 1: Create Integration Wrapper
Create new file: `src/lib/steward/frost-approval-integration.ts`

**Purpose**: Orchestrate FROST session creation and signature collection after steward approval.

**Key Methods**:
- `createFrostSessionForApprovals()` - Create FROST session with stewards as participants
- `collectFrostSignaturesForApprovals()` - Wait for FROST signature collection
- `verifyAndExecuteWithFrostSignature()` - Verify signature and execute operation

### Phase 2: Integrate into NFC Auth
Modify `src/lib/nfc-auth.ts`:
- After `awaitApprovals()` returns approved, call FROST integration
- Collect FROST signatures
- Verify signature
- Execute operation with FROST signature

### Phase 3: Add Integration Tests
Create: `tests/frost-steward-integration.test.ts`

**Test Coverage**:
- Steward Approval → FROST session creation
- FROST signature aggregation → verification
- End-to-end multiparty signing flow
- Error handling (threshold failures, timeouts)
- Backward compatibility (single-signature flows)

---

## 6. Backward Compatibility

**Requirement**: Existing single-signature flows must continue to work.

**Strategy**:
- FROST integration is ONLY triggered when `stewardThreshold > 0`
- Single-signature flows (no steward approval) bypass FROST entirely
- Existing `createSignedSpendOperation()` and `createSignedSignOperation()` remain unchanged
- FROST signature is additional layer, not replacement

---

## 7. Success Criteria

- ✅ FROST session created after steward approval threshold met
- ✅ Stewards receive FROST signing requests via Nostr DMs
- ✅ FROST signatures aggregated and verified
- ✅ Operation executed with FROST signature
- ✅ All integration tests pass (>90% coverage)
- ✅ Backward compatibility verified
- ✅ Zero-knowledge logging maintained

---

## 8. Next Steps

**Awaiting Approval**: Should I proceed with Phase 1 (Create Integration Wrapper)?


