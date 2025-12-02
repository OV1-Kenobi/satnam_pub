# Phase 4: Guardian Approval Integration with NFC MFA

**Status**: Design Phase  
**Objective**: Integrate NFC MFA with guardian approval workflows for FROST multiparty signing  
**Estimated Effort**: 5-6 hours

---

## 1. Architecture Overview

### Current State
- **Guardian Approval**: Steward approval requests sent via CEPS (NIP-59 gift-wrapped messaging)
- **FROST Signing**: Multiparty signing with threshold consensus
- **NFC MFA**: Post-aggregation verification (Phases 1-3 complete)
- **Gap**: No NFC MFA integration in guardian approval request/response cycle

### Phase 4 Integration Points

```
Guardian Approval Request
    ↓
[NEW] Collect NFC MFA Signature from Guardian
    ↓
Verify NFC MFA Signature
    ↓
Guardian Approval Response
    ↓
[NEW] Verify NFC MFA in Response
    ↓
FROST Session Aggregation
    ↓
[EXISTING] Post-Aggregation NFC MFA Verification
    ↓
Operation Execution
```

---

## 2. Integration Design

### 2.1 Guardian Approval Request Extension

**Current**: `publishApprovalRequests()` in `src/lib/steward/approval-client.ts`

**Extension**:
- Add `nfcMfaRequired` flag to approval request payload
- Include `operationAmount` for high-value detection
- Include `familyNfcMfaPolicy` for guardian-side enforcement

**New Payload**:
```typescript
{
  type: "steward_approval_request",
  operationHash: string,
  operationKind: string,
  operationAmount?: number,  // NEW: for high-value detection
  nfcMfaRequired: boolean,   // NEW: policy enforcement flag
  nfcMfaPolicy: string,      // NEW: "disabled" | "optional" | "required" | "required_for_high_value"
  stewardThreshold: number,
  federationDuid: string,
  expiresAt: number,
  nonce: string,
}
```

### 2.2 Guardian Approval Response Extension

**Current**: Guardian responds with approval/rejection

**Extension**:
- If `nfcMfaRequired`, guardian must provide NFC MFA signature
- NFC signature verifies guardian's physical card possession
- Response includes NFC signature and verification status

**New Response Payload**:
```typescript
{
  type: "steward_approval_response",
  requestId: string,
  approved: boolean,
  nfcSignature?: {
    signature: string,      // P-256 ECDSA signature
    publicKey: string,      // P-256 public key from card
    timestamp: number,      // Unix milliseconds
    cardUid: string,        // NTAG424 card identifier
  },
  nfcVerified?: boolean,    // Verification result
  reason?: string,
}
```

### 2.3 High-Value Operation Detection

**Integration Point**: `shouldEnforceNfcMfa()` in `src/lib/steward/frost-nfc-mfa-policy.ts`

**Flow**:
1. Guardian receives approval request with `operationAmount`
2. Guardian-side policy check: `shouldEnforceNfcMfa(policy, operationAmount)`
3. If high-value: require NFC MFA signature
4. If low-value: NFC MFA optional

**Decision Tree**:
```
operationAmount provided?
  ├─ NO → Enforce NFC MFA (safe default)
  ├─ YES → Check policy
      ├─ "disabled" → No NFC MFA
      ├─ "optional" → NFC MFA optional
      ├─ "required" → NFC MFA required
      └─ "required_for_high_value"
          ├─ amount > threshold → NFC MFA required
          └─ amount ≤ threshold → NFC MFA optional
```

---

## 3. Implementation Strategy

### Phase 4.1: Design (CURRENT)
- ✅ Architecture overview
- ✅ Integration points identified
- ✅ Data flow documented
- ⏳ Awaiting approval to proceed

### Phase 4.2: Extend Approval Request/Response
- Update `publishApprovalRequests()` to include NFC MFA fields
- Create `processGuardianApprovalResponse()` with NFC verification
- Implement NFC signature verification in response handler

### Phase 4.3: High-Value Operation Detection
- Integrate `shouldEnforceNfcMfa()` into approval request flow
- Add `operationAmount` parameter to approval requests
- Implement guardian-side policy enforcement

### Phase 4.4: Integration Tests
- Test approval request with NFC MFA required
- Test approval response with NFC signature verification
- Test high-value operation detection
- Test policy-based enforcement
- Test backward compatibility (NFC MFA disabled)

### Phase 4.5: Documentation & Deployment
- Update design documentation
- Create deployment guide
- Document guardian UX changes
- Create migration guide for existing deployments

---

## 4. Key Files to Modify

1. **`src/lib/steward/approval-client.ts`**
   - Extend `publishApprovalRequests()` with NFC MFA fields
   - Add `processGuardianApprovalResponse()` with NFC verification

2. **`src/lib/steward/frost-nfc-mfa-policy.ts`**
   - Export `shouldEnforceNfcMfa()` for guardian-side use
   - Add `verifyGuardianApprovalNfcSignature()` function

3. **`src/lib/steward/frost-nfc-mfa-integration.ts`**
   - Add `verifyApprovalResponseNfcSignature()` function
   - Integrate with approval response processing

4. **`netlify/functions_active/group-messaging.ts`** (if applicable)
   - Add NFC MFA verification to approval response handler

---

## 5. Security Considerations

- **Replay Protection**: NFC signature includes operation hash + timestamp
- **Guardian Verification**: NFC signature proves guardian's physical card possession
- **Policy Enforcement**: Guardian-side policy check prevents unauthorized NFC bypass
- **Backward Compatibility**: NFC MFA optional by default (policy = "disabled")
- **Audit Logging**: All NFC MFA events logged with privacy protection

---

## 6. Backward Compatibility

- **Default**: All families default to `nfc_mfa_policy = "disabled"`
- **Opt-in**: Families must explicitly enable NFC MFA
- **Graceful Degradation**: If NFC MFA fails, operation proceeds (unless policy = "required")
- **Migration Path**: Families can test with `optional` before enabling `required`

---

## Next Steps

1. ✅ Design complete
2. ⏳ Await user approval to proceed with Phase 4.2
3. ⏳ Implement approval request/response extension
4. ⏳ Add high-value operation detection
5. ⏳ Create comprehensive integration tests
6. ⏳ Update documentation and deployment guide

**Ready to proceed with Phase 4.2 implementation?**

