# Step 3.1 Complete: FROST ↔ Steward Approval Integration Design

**Status**: ✅ DESIGN PHASE COMPLETE - Awaiting Approval for Implementation

**Date**: 2025-12-01  
**Objective**: Design integration architecture for FROST multiparty signing with Steward Approval flows

---

## Summary

I have completed a comprehensive design of how to integrate the FROST session manager with Steward Approval flows for multiparty signing in NFC tap-to-spend and tap-to-sign operations.

### Key Findings

**FROST Session Manager**: ✅ **NO MODIFICATIONS NEEDED**
- All methods are production-ready
- Signature verification uses real secp256k1 (not placeholder)
- Event publishing is functional
- Already supports all required parameters

**Steward Approval Client**: ✅ **NO MODIFICATIONS NEEDED**
- Threshold approval collection works correctly
- CEPS integration is complete
- Ready to trigger FROST after approval

**Integration Points Identified**:
- `src/lib/steward/approval-client.ts` - Lines 67 & 171
- `src/lib/nfc-auth.ts` - Lines 754 & 893
- `lib/frost/frost-session-manager.ts` - All methods ready

---

## Design Documents Created

### 1. **`docs/FROST_STEWARD_INTEGRATION_DESIGN.md`** (Main Design)
- Current architecture (independent systems)
- Proposed integration flow with data paths
- Specific integration points with file names and line numbers
- Data flow diagram showing complete multiparty signing process
- Implementation strategy (3 phases)
- Backward compatibility strategy
- Success criteria

### 2. **`docs/FROST_STEWARD_SEQUENCE_DIAGRAM.md`** (Visual Flow)
- Complete multiparty signing sequence diagram
- Error handling paths (4 scenarios):
  - Steward approval rejected
  - Steward approval timeout
  - FROST signature timeout
  - FROST signature verification failed
- Data structures (JSON examples)
- Integration points summary table

### 3. **`docs/FROST_STEWARD_IMPLEMENTATION_DETAILS.md`** (Implementation Plan)
- Phase 1: Create integration wrapper (`src/lib/steward/frost-approval-integration.ts`)
  - `createFrostSessionForApprovals()` - Create FROST session with stewards
  - `collectFrostSignaturesForApprovals()` - Wait for signature collection
  - `verifyAndExecuteWithFrostSignature()` - Verify and execute operation
- Phase 2: Integrate into NFC Auth (`src/lib/nfc-auth.ts`)
  - Modify `tapToSpend()` at line 754
  - Modify `tapToSign()` at line 893
- Phase 3: Add integration tests (`tests/frost-steward-integration.test.ts`)
  - 6 test suites covering all scenarios
- Specific method signatures and implementations
- Data flow summary
- Security considerations
- Backward compatibility details

---

## Integration Flow (High-Level)

```
NFC Tap
  ↓
Check Steward Policy
  ↓
IF steward approval required:
  ├─ Publish approval requests
  ├─ Await threshold approvals
  ├─ IF approved:
  │  ├─ CREATE FROST SESSION
  │  ├─ COLLECT FROST SIGNATURES (Round 1 & 2)
  │  ├─ AGGREGATE SIGNATURES
  │  ├─ VERIFY SIGNATURE
  │  └─ PUBLISH SIGNED EVENT
  └─ IF rejected/expired: ABORT

Execute operation with FROST signature
```

---

## Implementation Strategy

**Phase 1: Create Integration Wrapper** (2-3 hours)
- New file: `src/lib/steward/frost-approval-integration.ts`
- Orchestrates FROST session creation and signature collection
- Handles error cases and timeouts

**Phase 2: Integrate into NFC Auth** (2-3 hours)
- Modify `src/lib/nfc-auth.ts` tapToSpend() and tapToSign()
- After steward approval, call FROST integration
- Collect signatures, verify, then execute

**Phase 3: Add Integration Tests** (2-3 hours)
- New file: `tests/frost-steward-integration.test.ts`
- 6 test suites covering all scenarios
- Error handling and backward compatibility

**Total Estimated Effort**: 6-9 hours

---

## Backward Compatibility

✅ **Single-Signature Flows** (no steward approval):
- Skip FROST integration entirely
- Use existing `createSignedSpendOperation()` and `createSignedSignOperation()`
- Execute operation directly
- No changes to existing code paths

✅ **Multi-Signature Flows** (with steward approval):
- NEW: Create FROST session after approval
- NEW: Collect FROST signatures
- NEW: Verify FROST signature
- Execute operation with FROST signature

---

## Security Considerations

1. **Zero-Knowledge Logging**
   - Truncate operationHash to first 8 chars + "..."
   - Truncate pubkeys to first 8 chars + "..."
   - Never log full signatures or private data

2. **Timeout Protection**
   - FROST session expires after 10 minutes
   - Steward approval timeout: 30 seconds
   - Prevents indefinite waiting

3. **Threshold Enforcement**
   - FROST threshold = stewardThreshold
   - Requires consensus from eligible stewards
   - Prevents single-steward override

4. **Signature Verification**
   - Uses real secp256k1.verify() from @noble/curves
   - Verifies against family federation's public key
   - Prevents invalid signatures from executing

---

## Next Steps

**Awaiting Your Approval**: Should I proceed with Step 3.2 (Implementation)?

**Step 3.2 will**:
1. Create `src/lib/steward/frost-approval-integration.ts` with orchestration methods
2. Modify `src/lib/nfc-auth.ts` to call FROST integration after steward approval
3. Add comprehensive integration tests
4. Verify backward compatibility

**Estimated effort for Step 3.2**: 6-9 hours


