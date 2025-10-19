# DID:SCID + UDNA Integration Architecture
## Visual Reference Guide

---

## Current Architecture (Weeks 1-3)

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                        │
│         (Nostr, Messaging, Storage, Satnam.pub)             │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│              Multi-Method Verification                      │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   kind:0     │  │    PKARR     │  │     DNS      │     │
│  │  (Nostr)     │  │  (BitTorrent)│  │  (HTTP)      │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                 │                 │              │
│         └─────────────────┼─────────────────┘              │
│                           │                                │
│                    ┌──────▼──────┐                         │
│                    │ Trust Score  │                         │
│                    │  (0-100)     │                         │
│                    └──────┬───────┘                         │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                  Network Layer                              │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Nostr Relays │  │ BitTorrent   │  │ DNS Servers  │     │
│  │              │  │ DHT (PKARR)  │  │              │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 1: DID:SCID Metadata Enhancement

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                        │
│         (Nostr, Messaging, Storage, Satnam.pub)             │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│              Multi-Method Verification                      │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   kind:0     │  │    PKARR     │  │     DNS      │     │
│  │  (Nostr)     │  │  (BitTorrent)│  │  (HTTP)      │     │
│  │              │  │              │  │              │     │
│  │ + DID:SCID   │  │ + DID:SCID   │  │ + DID:SCID   │     │
│  │   (NEW)      │  │   (NEW)      │  │   (NEW)      │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                 │                 │              │
│         └─────────────────┼─────────────────┘              │
│                           │                                │
│                    ┌──────▼──────┐                         │
│                    │ Trust Score  │                         │
│                    │  (0-100)     │                         │
│                    │              │                         │
│                    │ + DID:SCID   │                         │
│                    │   Proof      │                         │
│                    └──────┬───────┘                         │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                  Network Layer                              │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Nostr Relays │  │ BitTorrent   │  │ DNS Servers  │     │
│  │              │  │ DHT (PKARR)  │  │              │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 2: DID:SCID Verification Enhancement

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                        │
│         (Nostr, Messaging, Storage, Satnam.pub)             │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│           DID:SCID Verification Layer (NEW)                 │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Verify DID:SCID Proof                               │  │
│  │  - Check inception key                               │  │
│  │  - Validate derivation code                          │  │
│  │  - Verify timestamp                                  │  │
│  │  - Validate signature                                │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│              Multi-Method Verification                      │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   kind:0     │  │    PKARR     │  │     DNS      │     │
│  │  (Nostr)     │  │  (BitTorrent)│  │  (HTTP)      │     │
│  │              │  │              │  │              │     │
│  │ + DID:SCID   │  │ + DID:SCID   │  │ + DID:SCID   │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                 │                 │              │
│         └─────────────────┼─────────────────┘              │
│                           │                                │
│                    ┌──────▼──────────┐                     │
│                    │ Enhanced Trust   │                     │
│                    │ Score (0-100)    │                     │
│                    │                  │                     │
│                    │ 100: All 4 agree │                     │
│                    │  90: 3 + DID:SCID│                     │
│                    │  75: 3 methods   │                     │
│                    │  50: 2 methods   │                     │
│                    │  25: 1 method    │                     │
│                    └──────┬───────────┘                     │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                  Network Layer                              │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Nostr Relays │  │ BitTorrent   │  │ DNS Servers  │     │
│  │              │  │ DHT (PKARR)  │  │              │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 3+: UDNA Network Layer Integration

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                        │
│    (Nostr, Messaging, Storage, UDNA Services, Satnam.pub)   │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│           DID:SCID Verification Layer                       │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Verify DID:SCID Proof                               │  │
│  │  - Check inception key                               │  │
│  │  - Validate derivation code                          │  │
│  │  - Verify timestamp                                  │  │
│  │  - Validate signature                                │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│              Multi-Method Verification                      │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   kind:0     │  │    PKARR     │  │     DNS      │     │
│  │  (Nostr)     │  │  (BitTorrent)│  │  (HTTP)      │     │
│  │              │  │              │  │              │     │
│  │ + DID:SCID   │  │ + DID:SCID   │  │ + DID:SCID   │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                 │                 │              │
│         └─────────────────┼─────────────────┘              │
│                           │                                │
│                    ┌──────▼──────────┐                     │
│                    │ Enhanced Trust   │                     │
│                    │ Score (0-100)    │                     │
│                    └──────┬───────────┘                     │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│         UDNA Network Layer (NEW - Phase 3+)                 │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  UDNA Address Resolution                             │  │
│  │  udna://did:scp:...:facet_id                         │  │
│  │                                                      │  │
│  │  - Validate UDNA header signature                    │  │
│  │  - Resolve DID to public key                         │  │
│  │  - Route to facet service                            │  │
│  │  - Establish encrypted session                       │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                  Network Layer                              │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Nostr Relays │  │ SCP Overlay  │  │ DNS Servers  │     │
│  │              │  │ (Kademlia    │  │              │     │
│  │              │  │  DHT with    │  │              │     │
│  │              │  │  DID-based   │  │              │     │
│  │              │  │  node IDs)   │  │              │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Flow: Identity Verification

### Current Flow (Weeks 1-3)

```
User Login
    │
    ├─→ Query kind:0 from Nostr relays
    │   └─→ Extract nip05 field
    │
    ├─→ Query PKARR record from DHT
    │   └─→ Extract nip05 field
    │
    ├─→ Query DNS TXT record
    │   └─→ Extract nip05 field
    │
    └─→ Calculate trust score (0-100)
        └─→ Grant access based on trust level
```

### Phase 1 Flow (With DID:SCID Metadata)

```
User Login
    │
    ├─→ Query kind:0 from Nostr relays
    │   ├─→ Extract nip05 field
    │   └─→ Extract did + did_scid_proof (NEW)
    │
    ├─→ Query PKARR record from DHT
    │   ├─→ Extract nip05 field
    │   └─→ Extract did + did_scid_proof (NEW)
    │
    ├─→ Query DNS TXT record
    │   ├─→ Extract nip05 field
    │   └─→ Extract did + did_scid_proof (NEW)
    │
    └─→ Calculate trust score (0-100)
        ├─→ Verify DID:SCID proofs (NEW)
        └─→ Grant access based on trust level
```

### Phase 2 Flow (With DID:SCID Verification)

```
User Login
    │
    ├─→ Query kind:0 from Nostr relays
    │   ├─→ Extract nip05 field
    │   ├─→ Extract did + did_scid_proof
    │   └─→ Verify DID:SCID proof (NEW)
    │
    ├─→ Query PKARR record from DHT
    │   ├─→ Extract nip05 field
    │   ├─→ Extract did + did_scid_proof
    │   └─→ Verify DID:SCID proof (NEW)
    │
    ├─→ Query DNS TXT record
    │   ├─→ Extract nip05 field
    │   ├─→ Extract did + did_scid_proof
    │   └─→ Verify DID:SCID proof (NEW)
    │
    └─→ Calculate enhanced trust score (0-100)
        ├─→ All 4 methods agree → 100 (VERY HIGH)
        ├─→ 3 methods + DID:SCID → 90 (HIGH)
        ├─→ 3 methods → 75 (MEDIUM)
        ├─→ 2 methods → 50 (LOW)
        ├─→ 1 method → 25 (VERY LOW)
        └─→ Grant access based on trust level
```

---

## DID:SCID Proof Structure

```
┌─────────────────────────────────────────────────────────┐
│              DID:SCID Proof Object                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  did: "did:scid:EaU6JR2nmwyZ-i0d8JZAoTNZH3ULvYAfSVPz" │
│       "hzS6b5CM"                                        │
│                                                         │
│  inception_key: "hex_encoded_public_key"               │
│                 (64 hex characters)                     │
│                                                         │
│  derivation_code: "E"                                   │
│                   (E=Ed25519, D=ECDSA, A=Argon2)       │
│                                                         │
│  timestamp: 1234567890                                  │
│             (Unix timestamp)                            │
│                                                         │
│  signature: "hex_encoded_signature"                     │
│             (optional, for rotation proof)              │
│                                                         │
│  rotation_sequence: 0                                   │
│                     (optional, for key rotation)        │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## UDNA Address Format

```
┌─────────────────────────────────────────────────────────┐
│              UDNA Address Format                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  udna://did:scp:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKL  │
│         GpbnnEGta2doK:1                                │
│         ├─────────────────────────────────────────┤   │
│         │ DID (Self-Certifying Identifier)        │   │
│         └─────────────────────────────────────────┘   │
│                                                    ↑   │
│                                                    │   │
│                                            Facet ID   │
│                                            (0-255)    │
│                                                         │
│  Facet IDs:                                            │
│  - 0x00: Control channel                               │
│  - 0x01: Messaging service                             │
│  - 0x02: Storage service                               │
│  - 0x03: HTTP gateway                                  │
│  - 0x80-0xFF: Application-defined                      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Pairwise Identity System

```
┌─────────────────────────────────────────────────────────┐
│         Pairwise Identity Derivation                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Root DID (PP-DID)                                      │
│  did:scid:EaU6JR2nmwyZ-i0d8JZAoTNZH3ULvYAfSVPzhzS6b5CM│
│         │                                               │
│         ├─→ PE-DID 1 (Relationship 1)                   │
│         │   did:scid:...derived_from_root_1             │
│         │   └─→ Unlinkable to other relationships       │
│         │                                               │
│         ├─→ PE-DID 2 (Relationship 2)                   │
│         │   did:scid:...derived_from_root_2             │
│         │   └─→ Unlinkable to other relationships       │
│         │                                               │
│         └─→ PE-DID N (Relationship N)                   │
│             did:scid:...derived_from_root_N             │
│             └─→ Unlinkable to other relationships       │
│                                                         │
│  Derivation: PE-DID = KDF(Root_Private_Key,            │
│                           Context_String)              │
│                                                         │
│  Benefits:                                              │
│  ✓ Privacy: No correlation across relationships         │
│  ✓ Recovery: Recoverability from root key               │
│  ✓ Security: Compromise of one PE-DID doesn't affect   │
│    others                                               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Implementation Timeline

```
Week 1-6: Phase 1 (DID:SCID Metadata)
├─ Week 1-2: DID:SCID utility implementation
├─ Week 2-3: Database schema updates
├─ Week 3-4: kind:0, PKARR, DNS integration
├─ Week 4-5: Testing and beta rollout
└─ Week 5-6: Production deployment

Month 2-3: Phase 2 (DID:SCID Verification)
├─ Week 1: Verification logic implementation
├─ Week 2: Trust score enhancement
└─ Week 3: User education and rollout

Month 6-12: Phase 3 (UDNA Network Layer)
├─ Month 1-2: Research and prototyping
├─ Month 2-4: SCP overlay implementation
├─ Month 4-6: Integration and testing
└─ Month 6: Beta deployment

Month 12-24: Phase 4 (UDNA-Native Services)
├─ Month 1-6: Service development
├─ Month 6-12: Production deployment
└─ Month 12+: Ecosystem development
```

---

## Success Metrics

```
Phase 1 Success Criteria:
├─ ✓ Zero breaking changes
├─ ✓ DID:SCID adoption > 50% within 3 months
├─ ✓ No performance degradation
└─ ✓ User satisfaction > 80%

Phase 2 Success Criteria:
├─ ✓ Trust score improvements measurable
├─ ✓ DID:SCID verification accuracy > 99%
└─ ✓ User adoption of verification features

Phase 3+ Success Criteria:
├─ ✓ UDNA network operational
├─ ✓ Cross-DID-method communication working
└─ ✓ Ecosystem adoption growing
```

---

**Status**: ✅ ARCHITECTURE COMPLETE - READY FOR IMPLEMENTATION

