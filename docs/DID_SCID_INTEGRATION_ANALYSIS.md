# DID:SCID Integration Analysis

## Multi-Method Verification System Enhancement

**Status**: ANALYSIS PHASE  
**Date**: 2025-10-18  
**Objective**: Integrate DID:SCID (Self-Certifying Identifier) specification into multi-method verification system

---

## Executive Summary

This document analyzes the DID:SCID specification and proposes integration into the Satnam.pub multi-method verification system. DID:SCID is a Trust over IP (ToIP) standardization proposal for self-certifying identifiers that provides cryptographic binding between identifiers and their controlling keys.

**Key Finding**: DID:SCID is closely related to KERI (Key Event Receipt Infrastructure) and AIDs (Autonomic Identifiers), which provide a foundation for self-certifying identity management. Integration should focus on:

1. **Complementary to existing Nostr/PKARR infrastructure** - Not a replacement
2. **Progressive trust enhancement** - Adds cryptographic verification layer
3. **Backward compatible** - Existing NIP-05/PKARR/DNS verification continues to work
4. **Privacy-first** - Maintains zero-knowledge principles

---

## DID:SCID Specification Overview

### What is DID:SCID?

**DID:SCID** (Self-Certifying Identifier) is a Trust over IP standardization proposal for decentralized identifiers that are:

- **Self-certifying**: The identifier itself proves control of the associated keys
- **Cryptographically bound**: Derived from inception keys using hash-based derivation
- **Autonomic**: Self-managing without external authorities
- **Verifiable**: Can be verified independently without contacting issuer

### Related Concepts

**KERI (Key Event Receipt Infrastructure)**:

- System for secure self-certifying identifiers
- Provides key rotation, delegation, and recovery mechanisms
- Uses append-only Key Event Logs (KEL) for state management
- Foundation for did:keri DID method

**AID (Autonomic Identifier)**:

- Fully qualified Self-Certifying Identifier
- Derived from inception keys using KERI derivation codes
- Format: Base64url-encoded cryptographic material
- Example: `EaU6JR2nmwyZ-i0d8JZAoTNZH3ULvYAfSVPzhzS6b5CM`

**UDNA (Universal DID-Native Addressing)**:

- Paradigm shift: **Identity is Address** at network layer
- Promotes DIDs from application constructs to network primitives
- Provides cryptographic authentication as first-class network service
- Implements SCP (Sirraya Communication Protocol) overlay network
- Uses modified Kademlia DHT with DID-based node identification

### DID:SCID Format

```
did:scid:<SCID>:<method-specific-data>

Example:
did:scid:EaU6JR2nmwyZ-i0d8JZAoTNZH3ULvYAfSVPzhzS6b5CM:webvh:example.com
```

**Components**:

- `did:scid:` - Method prefix
- `<SCID>` - Self-certifying identifier (AID)
- `<method-specific-data>` - Optional method-specific resolution data

### UDNA Address Format

```
udna://<did>:<facet-id>

Example:
udna://did:scp:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK:1
```

**Components**:

- `udna://` - Protocol prefix
- `<did>` - Decentralized identifier (any DID method)
- `<facet-id>` - Logical service port (0-255)
  - `0x00`: Control channel
  - `0x01`: Messaging service
  - `0x02`: Storage service
  - `0x03`: HTTP gateway
  - `0x80-0xFF`: Application-defined

---

## Current Satnam.pub Architecture

### Existing Identity Verification Chain

```
User enters NIP-05 (alice@satnam.pub)
  ↓
Multi-Method Verification (parallel execution):
  ├─ kind:0 Resolution (Nostr metadata)
  ├─ PKARR Resolution (BitTorrent DHT)
  └─ DNS Resolution (Traditional)
  ↓
Trust Score Calculation (0-100)
  ├─ All 3 agree → 100 (HIGH)
  ├─ 2 agree → 75 (MEDIUM)
  ├─ 1 succeeds → 50 (LOW)
  └─ Disagree → 25 (LOW)
```

### Current Data Formats

**kind:0 Metadata Event**:

```json
{
  "kind": 0,
  "pubkey": "hex_pubkey",
  "created_at": 1234567890,
  "content": {
    "name": "Alice",
    "nip05": "alice@satnam.pub",
    "picture": "https://...",
    "about": "...",
    "lud16": "alice@satnam.pub"
  },
  "tags": []
}
```

**PKARR Record**:

```json
{
  "nip05": "alice@satnam.pub",
  "pubkey": "hex_pubkey",
  "name": "Alice",
  "picture": "https://...",
  "about": "..."
}
```

**DNS TXT Record** (NIP-05):

```
_nostr.alice.satnam.pub TXT "names": {"alice": "hex_pubkey"}
```

---

## UDNA Integration Opportunity

### What is UDNA?

**UDNA (Universal DID-Native Addressing)** represents a paradigm shift in network architecture:

**Core Principle**: **Identity is Address**

Instead of separating "who" (identity) from "where" (location), UDNA makes DIDs the fundamental network primitive:

```
Traditional Internet:
IP Address (location) → DNS (naming) → PKI (trust) → Application (identity)

UDNA Network:
DID (identity + address) → Cryptographic authentication → Application
```

### UDNA Architecture

**Five-Plane Architecture**:

1. **Application Plane** - DApps, services, user interfaces
2. **Security & Privacy Plane** - ZCAPs, pairwise DIDs, encryption
3. **Network Plane** - SCP overlay, routing, discovery
4. **Cryptographic Plane** - Key management, signatures, KDFs
5. **Resolution Plane** - DID resolution, document caching
6. **Binary Plane** - Wire protocol, header format

### UDNA Address Header

```
UDNA Address = f(did, facet_id)

Example:
udna://did:scp:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK:1
                                                                    ↑
                                                            Facet ID (service port)
```

**Header Format** (binary):

- Version (8 bits)
- Flags (16 bits) - P, R, E, A, K flags
- DIDType (8 bits) - did:key, did:web, did:scp, did:ion, etc.
- DIDLength (8 bits)
- FacetID (8 bits) - Service identifier
- DIDBytes (variable) - Raw DID string
- KeyHint (32 bytes) - BLAKE2b hash of public key
- RouteHint (variable) - Routing optimization metadata
- Nonce (16 bytes) - Replay attack prevention
- Signature (variable) - Cryptographic signature

### UDNA + DID:SCID Synergy

**DID:SCID** provides the cryptographic foundation for UDNA:

1. **Self-Certifying**: SCID proves key control mathematically
2. **Network Primitive**: UDNA makes SCID the network address
3. **Cryptographic Routing**: Node IDs derived from DID public keys
4. **Zero-Knowledge**: Pairwise ephemeral DIDs (PE-DIDs) for privacy

**Integration Benefits**:

- SCID validates UDNA header signatures
- UDNA provides network transport for SCID resolution
- Together they create **identity-native network layer**

---

## DID:SCID Integration Strategy

### Phase 1: Metadata Enhancement (Non-Breaking)

**Objective**: Add DID:SCID formatted data to existing structures without breaking compatibility

#### 1.1 kind:0 Metadata Enhancement

Add optional DID:SCID fields to kind:0 events:

```json
{
  "kind": 0,
  "pubkey": "hex_pubkey",
  "created_at": 1234567890,
  "content": {
    "name": "Alice",
    "nip05": "alice@satnam.pub",
    "picture": "https://...",
    "about": "...",
    "lud16": "alice@satnam.pub",

    // NEW: DID:SCID fields
    "did": "did:scid:EaU6JR2nmwyZ-i0d8JZAoTNZH3ULvYAfSVPzhzS6b5CM",
    "did_scid_proof": {
      "inception_key": "hex_inception_pubkey",
      "derivation_code": "E",
      "timestamp": 1234567890
    }
  },
  "tags": [["alt", "Satnam identity with DID:SCID verification"]]
}
```

#### 1.2 PKARR Record Enhancement

Add DID:SCID to PKARR records:

```json
{
  "nip05": "alice@satnam.pub",
  "pubkey": "hex_pubkey",
  "name": "Alice",
  "picture": "https://...",
  "about": "...",

  // NEW: DID:SCID fields
  "did": "did:scid:EaU6JR2nmwyZ-i0d8JZAoTNZH3ULvYAfSVPzhzS6b5CM",
  "did_scid_proof": {
    "inception_key": "hex_inception_pubkey",
    "derivation_code": "E",
    "timestamp": 1234567890
  }
}
```

#### 1.3 DNS Record Enhancement

Add DID:SCID reference to DNS TXT records:

```
_nostr.alice.satnam.pub TXT "names": {
  "alice": "hex_pubkey",
  "did": "did:scid:EaU6JR2nmwyZ-i0d8JZAoTNZH3ULvYAfSVPzhzS6b5CM"
}
```

### Phase 2: Verification Enhancement

**Objective**: Add DID:SCID verification to multi-method verification system

#### 2.1 New Verification Method

Add `tryDIDSCIDResolution()` method to `HybridNIP05Verifier`:

```typescript
private async tryDIDSCIDResolution(
  identifier: string,
  expectedPubkey?: string
): Promise<MethodVerificationResult> {
  // 1. Extract DID:SCID from kind:0/PKARR/DNS
  // 2. Verify SCID derivation from inception key
  // 3. Validate cryptographic proof
  // 4. Return verification result
}
```

#### 2.2 Enhanced Trust Scoring

Update trust score calculation to include DID:SCID verification:

```
All 4 methods agree (kind:0 + PKARR + DNS + DID:SCID) → 100 (VERY HIGH)
3 methods agree (including DID:SCID) → 90 (HIGH)
3 methods agree (without DID:SCID) → 75 (MEDIUM)
2 methods agree → 50 (LOW)
1 method only → 25 (VERY LOW)
```

### Phase 3: Key Rotation Integration

**Objective**: Leverage DID:SCID for key rotation management

#### 3.1 Key Rotation Events

Publish key rotation events with DID:SCID proof:

```json
{
  "kind": 1776,
  "pubkey": "old_pubkey",
  "created_at": 1234567890,
  "content": "Key rotation notice",
  "tags": [
    ["p", "new_pubkey"],
    ["did", "did:scid:EaU6JR2nmwyZ-i0d8JZAoTNZH3ULvYAfSVPzhzS6b5CM"],
    ["rotation_proof", "hex_signature_from_inception_key"]
  ]
}
```

---

## Implementation Roadmap

### Phase 1: Metadata Enhancement (Week 1-2)

**Tasks**:

1. Create DID:SCID generation utility
2. Update kind:0 metadata structure
3. Update PKARR record structure
4. Update DNS record format
5. Add database fields for DID:SCID data
6. Create migration for new fields

**Files to Modify**:

- `lib/central_event_publishing_service.ts` - kind:0 publishing
- `lib/pubky-enhanced-client.ts` - PKARR record storage
- `src/lib/nip05-verification.ts` - DNS parsing
- `database/migrations/032_did_scid_integration.sql` - Schema updates

### Phase 2: Verification Enhancement (Week 3-4)

**Tasks**:

1. Implement `tryDIDSCIDResolution()` method
2. Update trust score calculation
3. Add DID:SCID validation logic
4. Update multi-method verification tests
5. Create DID:SCID verification UI component

**Files to Modify**:

- `src/lib/nip05-verification.ts` - Verification logic
- `src/components/identity/VerificationStatusDisplay.tsx` - UI display
- `tests/hybrid-nip05-verification.integration.test.ts` - Tests

### Phase 3: Key Rotation Integration (Week 5-6)

**Tasks**:

1. Implement key rotation with DID:SCID proof
2. Update key recovery system
3. Add rotation event publishing
4. Create rotation verification logic

**Files to Modify**:

- `src/lib/auth/nostr-key-recovery.ts` - Key rotation
- `lib/central_event_publishing_service.ts` - Event publishing
- `src/hooks/useKeyRotation.ts` - UI integration

---

## Data Format Specifications

### DID:SCID Proof Structure

```typescript
interface DIDSCIDProof {
  // Self-certifying identifier (AID)
  did: string; // "did:scid:EaU6JR2nmwyZ-i0d8JZAoTNZH3ULvYAfSVPzhzS6b5CM"

  // Inception key used to derive SCID
  inception_key: string; // hex-encoded public key

  // KERI derivation code
  derivation_code: "E" | "D" | "A"; // E=Ed25519, D=ECDSA, A=Argon2

  // Timestamp of SCID creation
  timestamp: number; // Unix timestamp

  // Optional: Signature proof from inception key
  signature?: string; // hex-encoded signature

  // Optional: Key rotation sequence number
  rotation_sequence?: number;
}
```

### Database Schema Updates

**New Table: `did_scid_identities`**

```sql
CREATE TABLE did_scid_identities (
  id UUID PRIMARY KEY,
  user_duid VARCHAR(50) NOT NULL,
  did VARCHAR(255) NOT NULL UNIQUE,
  inception_key VARCHAR(64) NOT NULL,
  derivation_code VARCHAR(10) NOT NULL,
  created_at BIGINT NOT NULL,
  verified_at BIGINT,
  verification_method VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  rotation_sequence INTEGER DEFAULT 0,

  FOREIGN KEY (user_duid) REFERENCES user_identities(duid)
);
```

---

## Security Considerations

### Cryptographic Verification

- **SCID Derivation**: Verify SCID matches hash of inception key
- **Signature Validation**: Verify rotation proofs with inception key
- **Replay Protection**: Use timestamps and sequence numbers
- **Key Compromise**: Support key rotation with proof chain

### Privacy Implications

- **No PII Exposure**: DID:SCID is cryptographic, not personally identifiable
- **Correlation Resistance**: Different DIDs can be used for different contexts
- **Zero-Knowledge**: Verification doesn't require revealing private keys

### Attack Mitigation

| Attack         | Mitigation                              |
| -------------- | --------------------------------------- |
| SCID Forgery   | Verify derivation from inception key    |
| Key Compromise | Rotation with proof chain               |
| Replay Attacks | Timestamp and sequence validation       |
| Impersonation  | Multi-method verification with DID:SCID |

---

## Backward Compatibility

### Existing Systems

- **NIP-05 Verification**: Continues to work unchanged
- **PKARR Resolution**: Continues to work unchanged
- **DNS Resolution**: Continues to work unchanged
- **Nostr Clients**: No changes required

### Migration Path

1. **Phase 1**: Add DID:SCID fields as optional metadata
2. **Phase 2**: Gradually populate DID:SCID for new users
3. **Phase 3**: Enable DID:SCID verification for existing users
4. **Phase 4**: Make DID:SCID verification default (optional)

### Feature Flags

```typescript
VITE_DID_SCID_ENABLED = false; // Disabled by default
VITE_DID_SCID_VERIFICATION_ENABLED = false; // Disabled by default
VITE_DID_SCID_REQUIRE_PROOF = false; // Don't require proof initially
```

---

## Recommended Approach

### Recommendation: Phased Integration with Feature Flags

**Rationale**:

1. **Non-breaking**: Existing functionality unaffected
2. **Gradual rollout**: Test with subset of users first
3. **Reversible**: Can disable if issues arise
4. **Measurable**: Track adoption and trust score improvements

### Implementation Priority

1. **High Priority**: Metadata enhancement (Phase 1)

   - Low risk, high value
   - Enables future verification

2. **Medium Priority**: Verification enhancement (Phase 2)

   - Moderate complexity
   - Improves trust scoring

3. **Lower Priority**: Key rotation integration (Phase 3)
   - Higher complexity
   - Builds on Phase 1-2

---

## Next Steps

1. **Approval**: Review this analysis and get stakeholder approval
2. **Design Review**: Present proposed data formats for feedback
3. **Implementation Planning**: Create detailed implementation plan
4. **Development**: Begin Phase 1 implementation
5. **Testing**: Comprehensive testing with feature flags
6. **Rollout**: Gradual rollout to production

---

## References

- [KERI Specification](https://identity.foundation/keri/did_methods/)
- [did:keri Method v0.1](https://identity.foundation/keri/did_methods/)
- [Trust over IP Foundation](https://trustoverip.org/)
- [W3C DID Core Specification](https://www.w3.org/TR/did-core/)
- [NIP-05 Specification](https://github.com/nostr-protocol/nips/blob/master/05.md)
- [Satnam.pub Multi-Method Verification](./MULTI_METHOD_VERIFICATION_GUIDE.md)
