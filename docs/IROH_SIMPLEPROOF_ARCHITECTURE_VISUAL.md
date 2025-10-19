# Iroh + SimpleProof Architecture Visualization
## Visual Reference Guide for Integration

---

## Current Architecture (Weeks 1-3)

```
┌─────────────────────────────────────────────────────────┐
│                    Application Layer                    │
│         (Nostr, Messaging, Storage, Satnam.pub)         │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│              Multi-Method Verification                  │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   kind:0     │  │    PKARR     │  │     DNS      │ │
│  │  (Nostr)     │  │  (BitTorrent)│  │  (HTTP)      │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘ │
│         │                 │                 │          │
│         └─────────────────┼─────────────────┘          │
│                           │                            │
│                    ┌──────▼──────┐                     │
│                    │ Trust Score  │                     │
│                    │  (0-100)     │                     │
│                    └──────┬───────┘                     │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                  Network Layer                          │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ Nostr Relays │  │ BitTorrent   │  │ DNS Servers  │ │
│  │              │  │ DHT (PKARR)  │  │              │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## Phase 1: Iroh Discovery Integration

```
┌─────────────────────────────────────────────────────────┐
│                    Application Layer                    │
│         (Nostr, Messaging, Storage, Satnam.pub)         │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│              Multi-Method Verification                  │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   kind:0     │  │    PKARR     │  │     DNS      │ │
│  │  (Nostr)     │  │  (BitTorrent)│  │  (HTTP)      │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘ │
│         │                 │                 │          │
│         └─────────────────┼─────────────────┘          │
│                           │                            │
│                    ┌──────▼──────┐                     │
│                    │ Trust Score  │                     │
│                    │  (0-100)     │                     │
│                    │              │                     │
│                    │ + Iroh Node  │ (NEW)               │
│                    │   Discovery  │                     │
│                    └──────┬───────┘                     │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                  Network Layer                          │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ Nostr Relays │  │ Iroh + PKARR │  │ DNS Servers  │ │
│  │              │  │ (BitTorrent  │  │              │ │
│  │              │  │  DHT)        │  │              │ │
│  │              │  │              │  │              │ │
│  │              │  │ + DERP       │  │              │ │
│  │              │  │   Relays     │  │              │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## Phase 2: SimpleProof Timestamping Integration

```
┌─────────────────────────────────────────────────────────┐
│                    Application Layer                    │
│         (Nostr, Messaging, Storage, Satnam.pub)         │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│    DID:SCID + SimpleProof Verification Layer (NEW)      │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Verify DID:SCID Proof                            │  │
│  │ Create SimpleProof timestamp                     │  │
│  │ Verify on Bitcoin blockchain                     │  │
│  │ Store immutable audit trail                      │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│              Multi-Method Verification                  │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   kind:0     │  │    PKARR     │  │     DNS      │ │
│  │  (Nostr)     │  │  (BitTorrent)│  │  (HTTP)      │ │
│  │              │  │              │  │              │ │
│  │ + DID:SCID   │  │ + DID:SCID   │  │ + DID:SCID   │ │
│  │ + SimpleProof│  │ + SimpleProof│  │ + SimpleProof│ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘ │
│         │                 │                 │          │
│         └─────────────────┼─────────────────┘          │
│                           │                            │
│                    ┌──────▼──────────┐                 │
│                    │ Enhanced Trust   │                 │
│                    │ Score (0-100)    │                 │
│                    │                  │                 │
│                    │ + SimpleProof    │                 │
│                    │   Timestamp      │                 │
│                    │ + Bitcoin Block  │                 │
│                    └──────┬───────────┘                 │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                  Network Layer                          │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ Nostr Relays │  │ Iroh + PKARR │  │ DNS Servers  │ │
│  │              │  │ (BitTorrent  │  │              │ │
│  │              │  │  DHT)        │  │              │ │
│  │              │  │              │  │              │ │
│  │              │  │ + DERP       │  │              │ │
│  │              │  │   Relays     │  │              │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Bitcoin Blockchain (SimpleProof Timestamps)      │  │
│  │ - Immutable audit trail                          │  │
│  │ - OpenTimestamps proofs                          │  │
│  │ - Verification history                           │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## Phase 3: Full Integration with UDNA

```
┌─────────────────────────────────────────────────────────┐
│                    Application Layer                    │
│    (Nostr, Messaging, Storage, UDNA Services)           │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│    DID:SCID + SimpleProof Verification Layer            │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Verify DID:SCID Proof                            │  │
│  │ Create SimpleProof timestamp                     │  │
│  │ Verify on Bitcoin blockchain                     │  │
│  │ Store immutable audit trail                      │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│              Multi-Method Verification                  │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   kind:0     │  │    PKARR     │  │     DNS      │ │
│  │  (Nostr)     │  │  (BitTorrent)│  │  (HTTP)      │ │
│  │              │  │              │  │              │ │
│  │ + DID:SCID   │  │ + DID:SCID   │  │ + DID:SCID   │ │
│  │ + SimpleProof│  │ + SimpleProof│  │ + SimpleProof│ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘ │
│         │                 │                 │          │
│         └─────────────────┼─────────────────┘          │
│                           │                            │
│                    ┌──────▼──────────┐                 │
│                    │ Enhanced Trust   │                 │
│                    │ Score (0-100)    │                 │
│                    │                  │                 │
│                    │ + SimpleProof    │                 │
│                    │   Timestamp      │                 │
│                    │ + Bitcoin Block  │                 │
│                    └──────┬───────────┘                 │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│    UDNA Network Layer (with Iroh Enhancement)           │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │ UDNA Address Resolution                          │  │
│  │ - Iroh global node discovery                     │  │
│  │ - DERP relay fallback                            │  │
│  │ - Validate UDNA header signature                 │  │
│  │ - Route to facet service                         │  │
│  │ - SimpleProof verification proof                 │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                  Network Layer                          │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ Nostr Relays │  │ Iroh + SCP   │  │ DNS Servers  │ │
│  │              │  │ Overlay      │  │              │ │
│  │              │  │ (Kademlia    │  │              │ │
│  │              │  │  DHT with    │  │              │ │
│  │              │  │  Iroh)       │  │              │ │
│  │              │  │              │  │              │ │
│  │              │  │ + DERP       │  │              │ │
│  │              │  │   Relays     │  │              │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Bitcoin Blockchain (SimpleProof Timestamps)      │  │
│  │ - Immutable audit trail                          │  │
│  │ - OpenTimestamps proofs                          │  │
│  │ - Verification history                           │  │
│  │ - UDNA header validation proofs                  │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## Data Flow: Verification with Iroh + SimpleProof

### Phase 1: Iroh Discovery

```
User Login
    │
    ├─→ Query kind:0 from Nostr relays
    │   └─→ Extract nip05 + Iroh node ID
    │
    ├─→ Query PKARR record from DHT
    │   └─→ Extract nip05 + Iroh node ID
    │
    ├─→ Query DNS TXT record
    │   └─→ Extract nip05 + Iroh node ID
    │
    ├─→ Resolve Iroh node discovery (NEW)
    │   └─→ Get direct addresses + DERP URL
    │
    └─→ Calculate trust score (0-100)
        ├─→ Verify all methods agree
        └─→ Grant access based on trust level
```

### Phase 2: SimpleProof Timestamping

```
User Login
    │
    ├─→ Query kind:0 from Nostr relays
    │   ├─→ Extract nip05 + Iroh node ID
    │   └─→ Extract DID:SCID proof
    │
    ├─→ Query PKARR record from DHT
    │   ├─→ Extract nip05 + Iroh node ID
    │   └─→ Extract DID:SCID proof
    │
    ├─→ Query DNS TXT record
    │   ├─→ Extract nip05 + Iroh node ID
    │   └─→ Extract DID:SCID proof
    │
    ├─→ Resolve Iroh node discovery
    │   └─→ Get direct addresses + DERP URL
    │
    ├─→ Create SimpleProof timestamp (NEW)
    │   ├─→ Send verification data to SimpleProof API
    │   ├─→ Get OTS proof
    │   └─→ Wait for Bitcoin confirmation
    │
    └─→ Calculate enhanced trust score (0-100)
        ├─→ Verify all methods agree
        ├─→ Add SimpleProof bonus (+10 if verified)
        └─→ Grant access based on trust level
```

### Phase 3: Full Integration

```
User Login
    │
    ├─→ Query kind:0 from Nostr relays
    │   ├─→ Extract nip05 + Iroh node ID + DID:SCID
    │   └─→ Extract SimpleProof timestamp
    │
    ├─→ Query PKARR record from DHT
    │   ├─→ Extract nip05 + Iroh node ID + DID:SCID
    │   └─→ Extract SimpleProof timestamp
    │
    ├─→ Query DNS TXT record
    │   ├─→ Extract nip05 + Iroh node ID + DID:SCID
    │   └─→ Extract SimpleProof timestamp
    │
    ├─→ Resolve Iroh node discovery
    │   └─→ Get direct addresses + DERP URL
    │
    ├─→ Verify DID:SCID proofs
    │   └─→ Check inception keys + signatures
    │
    ├─→ Verify SimpleProof timestamps
    │   ├─→ Verify OTS proofs
    │   └─→ Check Bitcoin blockchain
    │
    ├─→ Resolve UDNA address
    │   ├─→ Use Iroh discovery
    │   ├─→ Validate UDNA header
    │   └─→ Route to facet service
    │
    └─→ Calculate final trust score (0-100)
        ├─→ Verify all methods agree
        ├─→ Add DID:SCID verification bonus
        ├─→ Add SimpleProof bonus
        ├─→ Add Iroh discovery bonus
        └─→ Grant access based on trust level
```

---

## Trust Score Calculation

### Phase 1: Base Score (kind:0 + PKARR + DNS)

```
All 3 agree → 100 (VERY HIGH)
2 agree → 75 (MEDIUM)
1 only → 25 (VERY LOW)
0 → 0 (NONE)
```

### Phase 2: Enhanced Score (+ DID:SCID + SimpleProof)

```
Base Score + Bonuses:
- DID:SCID verified: +5 points
- SimpleProof verified: +10 points
- Iroh discovery verified: +5 points

Max: 100 points
```

### Phase 3: Final Score (+ UDNA + Full Integration)

```
Base Score + Bonuses:
- DID:SCID verified: +5 points
- SimpleProof verified: +10 points
- Iroh discovery verified: +5 points
- UDNA header valid: +5 points
- All methods agree: +5 points

Max: 100 points
```

---

## Iroh Node Discovery Record Format

```
┌─────────────────────────────────────────────────────┐
│         Iroh Discovery Record (DNS TXT)             │
├─────────────────────────────────────────────────────┤
│                                                     │
│  @ TXT "v=iroh1"                                    │
│  @ TXT "node_id=hwpbkwcfcubxe4fwu5u5eobrsbwyfwiokk" │
│  @ TXT "addr=192.168.1.129:5000"                    │
│  @ TXT "addr=203.0.113.45:5000"                     │
│  @ TXT "_derp_url.iroh=https://use1-1.derp.iroh"   │
│                                                     │
│  Stored in: BitTorrent Mainline DHT                 │
│  Signed by: Ed25519 private key                     │
│  Updated: Every 1 hour (configurable)               │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## SimpleProof Timestamp Record Format

```
┌─────────────────────────────────────────────────────┐
│      SimpleProof Timestamp Record (JSON)            │
├─────────────────────────────────────────────────────┤
│                                                     │
│  {                                                  │
│    "ots_proof": "hex_encoded_proof",                │
│    "bitcoin_block": 123456,                         │
│    "bitcoin_tx": "txid_hex",                        │
│    "verified_at": 1234567890,                       │
│    "verification_data": {                           │
│      "nip05": "alice@satnam.pub",                   │
│      "pubkey": "hex_pubkey",                        │
│      "timestamp": 1234567800                        │
│    }                                                │
│  }                                                  │
│                                                     │
│  Stored in: Satnam.pub database                     │
│  Verified on: Bitcoin blockchain                    │
│  Immutable: Yes (blockchain-backed)                 │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## Integration Timeline

```
Week 1-4: Phase 1 (Iroh Discovery)
├─ Week 1: Library integration
├─ Week 2: Discovery implementation
├─ Week 3: Testing
└─ Week 4: Rollout (10% → 50% → 100%)

Week 5-8: Phase 2 (SimpleProof Timestamping)
├─ Week 5: API integration
├─ Week 6: Timestamp implementation
├─ Week 7: Testing
└─ Week 8: Rollout (10% → 50% → 100%)

Week 9-12: Phase 3 (Full Integration)
├─ Week 9: UDNA + Iroh integration
├─ Week 10: Dashboard development
├─ Week 11: Testing
└─ Week 12: Rollout (10% → 50% → 100%)
```

---

**Status**: ✅ ARCHITECTURE COMPLETE - READY FOR IMPLEMENTATION

