# NFC Physical MFA Integration into FROST Multiparty Signing

**Status**: DESIGN PHASE - Analysis & Architecture  
**Date**: 2025-12-01  
**Objective**: Design optional NFC physical MFA layer for FROST threshold signatures

---

## Executive Summary

This document designs how Boltcard/Tapsigner NFC physical hardware tokens can be integrated as an **optional upgraded security layer** into the FROST multiparty signing flow. The design maintains:

- ✅ **Browser-only serverless architecture** (Web NFC API)
- ✅ **Zero-knowledge logging** (no sensitive data exposed)
- ✅ **Backward compatibility** (NFC MFA is optional, not required)
- ✅ **Layered authentication** (NFC proves personhood, FROST proves consensus)
- ✅ **Existing patterns** (NTAG424ProductionManager, NFCAuthService)

---

## 1. Security Model: Three-Layer Authentication

### Layer 1: Identity Proof (Nsec Control)

- **What it proves**: User controls the Nostr private key (nsec)
- **How**: SecureNsecManager session with zero-knowledge handling
- **When**: During FROST session creation and signature submission
- **Cryptography**: secp256k1 (Nostr standard)

### Layer 2: Personhood Proof (NFC Physical MFA)

- **What it proves**: User has physical possession of NFC card
- **How**: Tap Boltcard/Tapsigner to sign operation hash
- **When**: Before submitting FROST partial signature
- **Cryptography**: P-256 (NTAG424 standard)
- **Status**: ✅ **OPTIONAL** - Can be enabled per family policy

### Layer 3: Consensus Proof (FROST Threshold)

- **What it proves**: Steward consensus (threshold of stewards approved)
- **How**: FROST signature aggregation from multiple stewards
- **When**: After all stewards submit signatures
- **Cryptography**: secp256k1 (FROST standard)

**Result**: Combined authentication = Identity + Personhood + Consensus

---

## 2. Integration Point: Where NFC MFA Fits

### Current FROST Flow (Without NFC MFA)

```
Steward receives FROST signing request
  ↓
Steward submits nonce commitment (Round 1)
  ↓
Steward submits partial signature (Round 2)
  ↓
FROST aggregates signatures
  ↓
FROST verifies aggregated signature
  ↓
Operation executes
```

### New FROST Flow (With NFC MFA)

```
Steward receives FROST signing request
  ↓
Steward taps NFC card (PIN entry)
  ↓
NFC card signs operation hash (P-256)
  ↓
Steward submits nonce commitment + NFC signature (Round 1)
  ↓
Steward submits partial signature + NFC signature (Round 2)
  ↓
FROST aggregates signatures
  ↓
FROST verifies aggregated signature
  ↓
Verify NFC signatures from all stewards
  ↓
Operation executes
```

**Key Decision**: NFC MFA is verified **AFTER** FROST aggregation, not before. This allows:

- Stewards without physical cards to participate (backward compatibility)
- NFC verification as optional additional layer
- Graceful degradation if NFC fails

### NFC Verification Failure Modes

**Scenario 1: NFC verification fails for one steward (required policy)**

- **Behavior**: Operation BLOCKED
- **Reason**: `nfc_mfa_policy = "required"` with `nfc_mfa_threshold = "all"` requires all stewards
- **Audit log**: Event logged as `operation_blocked` with error details
- **User experience**: Steward notified to retry NFC tap or contact administrator

**Scenario 2: NFC verification fails for majority (required policy, threshold mode)**

- **Behavior**: Operation BLOCKED
- **Reason**: `nfc_mfa_policy = "required"` with `nfc_mfa_threshold = "threshold"` requires minimum verified count
- **Audit log**: Event logged as `operation_blocked` with verification summary
- **User experience**: Operation fails; stewards notified of NFC verification failure

**Scenario 3: NFC verification fails for optional policy stewards**

- **Behavior**: Operation ALLOWED (silent skip)
- **Reason**: `nfc_mfa_policy = "optional"` doesn't block on NFC failure
- **Audit log**: Event logged as `signature_failed` with error details (for compliance)
- **User experience**: Operation proceeds; NFC failure logged but not blocking

**Scenario 4: NFC verification fails for high-value operation (required_for_high_value policy)**

- **Behavior**: Operation BLOCKED (if amount > threshold)
- **Reason**: `nfc_mfa_policy = "required_for_high_value"` enforces NFC for high-value ops
- **Audit log**: Event logged as `operation_blocked` with amount and threshold
- **User experience**: Steward notified that operation exceeds NFC threshold

**Scenario 5: NFC verification fails for low-value operation (required_for_high_value policy)**

- **Behavior**: Operation ALLOWED (NFC not required)
- **Reason**: `nfc_mfa_policy = "required_for_high_value"` only enforces for high-value ops
- **Audit log**: Event logged as `signature_failed` (optional NFC attempt)
- **User experience**: Operation proceeds; NFC failure not blocking

---

## 3. Data Structures

### FROST Session Extension (Database)

```sql
ALTER TABLE frost_signing_sessions ADD COLUMN (
  -- NFC MFA Configuration
  requires_nfc_mfa BOOLEAN DEFAULT false,
  nfc_mfa_policy TEXT CHECK (nfc_mfa_policy IN ('optional', 'required', 'disabled')),

  -- NFC Signature Storage
  nfc_signatures JSONB DEFAULT '{}', -- { participantId: { signature, publicKey, timestamp } }
  nfc_verification_status JSONB DEFAULT '{}' -- { participantId: { verified: bool, error?: string } }
);
```

### FROST Signature Share Extension (Database)

```sql
ALTER TABLE frost_signature_shares ADD COLUMN (
  -- NFC MFA Data
  nfc_signature TEXT, -- P-256 signature of operation hash
  nfc_public_key TEXT, -- P-256 public key from NTAG424 card
  nfc_verified_at TIMESTAMPTZ, -- When NFC signature was verified
  nfc_verification_error TEXT -- Error message if verification failed
);
```

### NFC MFA Signature Envelope (JSON)

```json
{
  "operationHash": "a1b2c3d4...",
  "participantId": "steward_duid",
  "nfcSignature": {
    "curve": "P-256",
    "publicKey": "04abc123...",
    "signature": "def456...",
    "timestamp": 1733000000000,
    "cardUid": "0123456789ABCDEF"
  }
}
```

### Schema Details and Clarifications

#### NFC Public Key Format

- **Format**: Uncompressed P-256 public key (65 bytes)
- **Encoding**: Hex string (130 characters)
- **Prefix**: `04` (uncompressed point indicator)
- **Example**: `04abc123def456...` (130 hex chars)
- **Rationale**: Uncompressed format required for Web Crypto API verification

#### NFC Signature Format

- **Algorithm**: ECDSA (P-256)
- **Encoding**: Hex string (128 characters for 64-byte signature)
- **Format**: Raw signature (r || s, no DER encoding)
- **Rationale**: Raw format matches NTAG424 DNA output

#### Timestamp Format and Precision

- **Epoch**: Unix milliseconds (Date.now())
- **Precision**: Millisecond (1000 timestamps per second)
- **Timezone**: UTC (no timezone offset)
- **Tolerance**: ±5 minutes (300,000 ms)
- **Validation**: `Math.abs(now - nfcTimestamp) <= 300000`
- **Rationale**: Millisecond precision enables accurate replay detection

#### Card UID Format

- **Format**: NTAG424 DNA unique identifier
- **Encoding**: Hex string (16 characters for 8-byte UID)
- **Example**: `0123456789ABCDEF`
- **Rationale**: Enables audit trail and card cloning detection

#### JSONB Storage Strategy

**Current design (frost_signing_sessions)**:

- `nfc_signatures`: JSONB map of participant NFC signatures
- `nfc_verification_status`: JSONB map of verification results

**Rationale for JSONB**:

- Flexible schema for variable number of participants
- Efficient querying with `@>` operator
- Atomic updates for entire session

**Alternative considered (denormalization)**:

- Store NFC data only in `frost_signature_shares` table
- Eliminates redundancy with session-level aggregates
- Requires additional queries to aggregate verification status
- **Decision**: Keep JSONB for atomic session updates; denormalization can be optimized later

#### Indexes for Performance

- **Index on nfc_mfa_policy**: `CREATE INDEX idx_family_federations_nfc_policy ON family_federations(nfc_mfa_policy)`
- **Index on nfc_verified_at**: `CREATE INDEX idx_frost_signature_shares_nfc_verified ON frost_signature_shares(nfc_verified_at)`
- **Index on session_id + created_at**: `CREATE INDEX idx_nfc_mfa_audit_log_session ON nfc_mfa_audit_log(session_id, created_at DESC)`
- **Rationale**: Enables efficient queries for policy retrieval, verification status, and audit log retrieval

---

## 4. Implementation Architecture

### Phase 1: NFC MFA Signature Collection

**File**: `src/lib/steward/frost-nfc-mfa.ts` (NEW)

**Methods**:

- `collectNfcMfaSignature(operationHash, stewardDuid)` - Tap card, sign hash
- `verifyNfcMfaSignature(nfcSignature, operationHash)` - Verify P-256 signature
- `storeNfcMfaSignature(sessionId, participantId, nfcSignature)` - Store in DB

### Phase 2: FROST Session Integration

**File**: `lib/frost/frost-session-manager.ts` (MODIFY)

**Changes**:

- Add `requires_nfc_mfa` and `nfc_mfa_policy` to FrostSession interface
- Add `verifyNfcMfaSignatures()` method after aggregation
- Add `getNfcMfaPolicy()` method to fetch family policy

### Phase 3: Steward Approval Integration

**File**: `src/lib/steward/frost-approval-integration.ts` (MODIFY)

**Changes**:

- After steward approval, check if NFC MFA is required
- If required, call `collectNfcMfaSignature()` before submitting FROST signature
- Store NFC signature alongside FROST signature

### Phase 4: NFC Auth Service Integration

**File**: `src/lib/nfc-auth.ts` (MODIFY)

**Changes**:

- Add `tapToSignForFrost()` method for FROST-specific signing
- Reuse existing `createSignedSignOperation()` pattern
- Return both FROST signature and NFC signature

---

## 5. Complete Sequence Diagram

```
Steward                NFC Card         FROST Manager        Database
  │                      │                    │                  │
  │ Receive FROST req    │                    │                  │
  ├─────────────────────→│                    │                  │
  │                      │                    │                  │
  │ Check NFC policy     │                    │                  │
  ├────────────────────────────────────────→  │                  │
  │                      │                    │ Query policy     │
  │                      │                    ├─────────────────→│
  │                      │                    │ requires_nfc_mfa │
  │                      │                    │←─────────────────┤
  │                      │                    │                  │
  │ IF requires_nfc_mfa: │                    │                  │
  │ Tap card + PIN       │                    │                  │
  ├─────────────────────→│                    │                  │
  │                      │ Sign hash (P-256)  │                  │
  │                      │ (NTAG424 operation)│                  │
  │                      │                    │                  │
  │ NFC signature        │                    │                  │
  │←─────────────────────┤                    │                  │
  │                      │                    │                  │
  │ Submit nonce + NFC sig                    │                  │
  ├────────────────────────────────────────→  │                  │
  │                      │                    │ Store nonce      │
  │                      │                    │ Store NFC sig    │
  │                      │                    ├─────────────────→│
  │                      │                    │                  │
  │ Submit partial sig + NFC sig              │                  │
  ├────────────────────────────────────────→  │                  │
  │                      │                    │ Store partial    │
  │                      │                    │ Store NFC sig    │
  │                      │                    ├─────────────────→│
  │                      │                    │                  │
  │ [All stewards submitted]                  │                  │
  │                      │                    │                  │
  │                      │ Aggregate FROST    │                  │
  │                      │ signatures         │                  │
  │                      │←────────────────────┤                  │
  │                      │                    │                  │
  │                      │ Verify FROST sig   │                  │
  │                      │ ✅ Valid           │                  │
  │                      │                    │                  │
  │                      │ Verify NFC sigs    │                  │
  │                      │ (if required)      │                  │
  │                      │ ✅ All valid       │                  │
  │                      │                    │                  │
  │                      │ Execute operation  │                  │
  │                      │ ✅ Success         │                  │
  │                      │                    │                  │
```

---

## 6. Family Policy Configuration

### NFC MFA Policy Options

**Option 1: Disabled (Default)**

```json
{
  "nfc_mfa_policy": "disabled",
  "description": "No NFC MFA required"
}
```

**Option 2: Optional**

```json
{
  "nfc_mfa_policy": "optional",
  "description": "Stewards can optionally use NFC MFA",
  "nfc_mfa_threshold": 0
}
```

**Option 3: Required for All**

```json
{
  "nfc_mfa_policy": "required",
  "description": "All stewards must use NFC MFA",
  "nfc_mfa_threshold": "all"
}
```

**Option 4: Required for High-Value Operations**

```json
{
  "nfc_mfa_policy": "required_for_high_value",
  "description": "NFC MFA required for operations > threshold",
  "amount_threshold": 1000000,
  "nfc_mfa_threshold": "all"
}
```

---

## 7. Security Analysis

### Threat Model

| Threat                | Without NFC          | With NFC     | Mitigation                     |
| --------------------- | -------------------- | ------------ | ------------------------------ |
| Remote key compromise | ❌ Vulnerable        | ✅ Protected | NFC proves physical possession |
| Replay attack         | ✅ Protected (FROST) | ✅ Protected | Timestamp + operation hash     |
| Signature forgery     | ✅ Protected (FROST) | ✅ Protected | P-256 verification             |
| Steward impersonation | ❌ Vulnerable        | ✅ Protected | NFC card required              |
| Consensus bypass      | ✅ Protected (FROST) | ✅ Protected | Threshold enforcement          |

### Proof-of-Presence

NFC MFA provides **proof-of-presence** for each steward:

- Timestamp of NFC tap is recorded
- Card UID is stored for audit trail
- PIN entry proves human interaction
- Cannot be automated or delegated

---

## 8. Backward Compatibility

### Single-Signature Flows (No FROST)

- ✅ Existing `tapToSpend()` and `tapToSign()` unchanged
- ✅ NFC MFA not involved
- ✅ No breaking changes

### FROST Without NFC MFA

- ✅ Existing FROST flows work unchanged
- ✅ `nfc_mfa_policy = "disabled"` (default)
- ✅ No NFC card required

### FROST With Optional NFC MFA

- ✅ Stewards can choose to use NFC card
- ✅ `nfc_mfa_policy = "optional"`
- ✅ Graceful degradation if NFC fails

### FROST With Required NFC MFA

- ⚠️ Breaking change for stewards without cards
- ✅ Can be enabled per family policy
- ✅ Requires explicit family governance decision

---

## 9. Implementation Phases

### Phase 1: NFC MFA Signature Collection (2-3 hours)

- Create `src/lib/steward/frost-nfc-mfa.ts`
- Implement `collectNfcMfaSignature()` using existing NFCAuthService
- Implement `verifyNfcMfaSignature()` using P-256 verification
- Add database schema extensions

### Phase 2: FROST Session Integration (2-3 hours)

- Extend `FrostSession` interface with NFC MFA fields
- Add `verifyNfcMfaSignatures()` method to FROST manager
- Add `getNfcMfaPolicy()` method
- Update FROST aggregation to include NFC verification

### Phase 3: Steward Approval Integration (2-3 hours)

- Modify `frost-approval-integration.ts` to check NFC policy
- Call `collectNfcMfaSignature()` if required
- Store NFC signatures in database
- Add error handling for NFC failures

### Phase 4: Testing & Documentation (2-3 hours)

- Add integration tests for NFC MFA flows
- Test backward compatibility
- Document family policy configuration
- Create user guides for stewards

**Total Estimated Effort**: 8-12 hours

---

## 10. Success Criteria

- ✅ NFC MFA signatures collected and verified
- ✅ FROST aggregation includes NFC verification
- ✅ Family policies support all 4 NFC MFA options
- ✅ Backward compatibility verified (no breaking changes)
- ✅ All integration tests pass (>90% coverage)
- ✅ Zero-knowledge logging maintained
- ✅ Proof-of-presence audit trail complete
- ✅ Ready for MVP enablement with optional NFC MFA
