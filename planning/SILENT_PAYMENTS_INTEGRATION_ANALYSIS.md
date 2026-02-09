# Silent Payments Integration Analysis

**Version:** 1.0  
**Date:** 2026-01-27  
**Status:** Strategic Planning  
**Related Documents:**

- [BIP-352: Silent Payments](https://bips.dev/352/)
- [Silent Payments Website](https://silentpayments.xyz/)
- [KEET_P2P_MESSAGING_INTEGRATION.md](./KEET_P2P_MESSAGING_INTEGRATION.md)
- [LNBITS_PROGRESSIVE_ENHANCEMENT_IMPLEMENTATION.md](./LNBITS_PROGRESSIVE_ENHANCEMENT_IMPLEMENTATION.md)

---

## Executive Summary

This document analyzes the feasibility and implementation strategy for integrating **BIP-352 Silent Payments** into Satnam's unified identity system, enabling users to receive on-chain Bitcoin payments to the same human-readable address (`username@satnam.pub`) that already handles Nostr DMs, Lightning payments, and (planned) Keet P2P messages.

**Key Findings:**

- ✅ **Technically Feasible**: Keet's 24-word BIP39 seed can derive both Keet Peer ID AND Silent Payment keys
- ✅ **Privacy-Preserving**: Silent Payments eliminate on-chain linkability while maintaining reusable addresses
- ✅ **Unified Identity**: Same `username@satnam.pub` can resolve to all payment/messaging protocols
- ⚠️ **Scanning Requirement**: Requires blockchain scanning infrastructure (significant complexity)
- ⚠️ **Light Client Challenge**: Mobile/browser clients need specialized infrastructure

**Recommendation**: **Phase this integration in 3 stages** (see Implementation Roadmap)

---

## Question 1: Can Keet's 24-Word Seed Derive Bitcoin Wallet Keys?

### Answer: YES ✅

**Technical Explanation:**

Keet uses a standard **BIP39 24-word mnemonic** to derive its peer ID. This same seed can be used to derive Bitcoin wallet keys using BIP32 hierarchical deterministic (HD) key derivation.

**Current Keet Seed Usage (from planning docs):**

```typescript
// From KEET_P2P_MESSAGING_INTEGRATION.md
const keetSeed = await generateKeetSeedPhrase(); // 24-word BIP39
const keetPeerId = await deriveKeetPeerIdFromSeed(keetSeed);
```

**Proposed Multi-Purpose Derivation:**

```typescript
// Single 24-word seed derives EVERYTHING
const masterSeed = await generateBIP39Seed(); // 24 words

// 1. Keet Peer ID (existing)
const keetPeerId = await deriveKeetPeerIdFromSeed(masterSeed);

// 2. Silent Payment Keys (NEW)
const silentPaymentKeys = await deriveSilentPaymentKeys(masterSeed);
// Uses BIP32 path: m/352'/0'/0'/1'/0 (scan key)
//                   m/352'/0'/0'/0'/0 (spend key)

// 3. Optional: Standard Bitcoin wallet (NEW)
const bitcoinWallet = await deriveBIP84Wallet(masterSeed);
// Uses BIP32 path: m/84'/0'/0' (native segwit)
```

**Key Derivation Paths (BIP-352 Compliant):**

```
Master Seed (24 words)
├── m/352'/0'/0'/1'/0  → Silent Payment Scan Key (bscan)
├── m/352'/0'/0'/0'/0  → Silent Payment Spend Key (bspend)
├── m/84'/0'/0'        → Standard Bitcoin Wallet (optional)
└── [Custom Path]      → Keet Peer ID derivation
```

**Security Benefit**: Single backup (24 words) recovers ALL identities:

- Keet P2P messaging
- Silent Payment receiving
- Standard Bitcoin wallet (if enabled)
- Nostr keys (if derived from same seed)

---

## Question 2: Enabling Reusable Silent Payments to NIP-05/Lightning Address

### Answer: YES, with Protocol Extension ✅

**Implementation Strategy:**

Silent Payments use a **static address format** (Bech32m encoded, starting with `sp1q`). To make this work with existing `username@satnam.pub` addresses, we need a **protocol resolver** that maps human-readable addresses to Silent Payment addresses.

**Proposed Architecture:**

```
User shares: alice@satnam.pub

Sender queries: GET https://satnam.pub/.well-known/payment-protocols?name=alice

Response:
{
  "name": "alice",
  "protocols": {
    "nostr": {
      "npub": "npub1...",
      "relays": ["wss://relay.satnam.pub"]
    },
    "lightning": {
      "address": "alice@satnam.pub",
      "lnurl": "https://satnam.pub/.well-known/lnurlp/alice"
    },
    "bitcoin_silent": {
      "address": "sp1qqgste7k9hx0qftg6qmwlkqtwuy6cycyavzmzj85c6qdfhjdpdjtdgqjuexzk6murw56suy3e0rd2cgqvycxttddwsvgxe2usfpxumr70xc9pkqwv",
      "version": 0,
      "scan_key": "02...",  // Public scan key for verification
      "spend_key": "03..."  // Public spend key
    },
    "keet": {
      "peer_id": "...",
      "discovery_key": "..."
    }
  }
}
```

**Wallet Integration Flow:**

1. **Sender** enters `alice@satnam.pub` in their wallet
2. Wallet queries `.well-known/payment-protocols`
3. Wallet detects `bitcoin_silent` protocol support
4. Wallet uses Silent Payment address to create output
5. **Alice's wallet** scans blockchain and detects payment

**Advantages:**

- ✅ Single address for all payment types
- ✅ Sender chooses protocol (Lightning for instant, on-chain for settlement)
- ✅ No on-chain linkability (Silent Payments privacy)
- ✅ No address reuse (each payment goes to unique address)

---

## Question 3: Custom Lightning Address + On-Chain Payments

### Answer: YES, Same Resolver Pattern ✅

**Scenario**: User chooses custom Lightning Address (e.g., `bob@custom-domain.com`)

**Solution**: Extend the resolver to support **external domains**:

```
User configures in Satnam:
- Lightning Address: bob@custom-domain.com (external)
- Silent Payment: Derived from Satnam-managed seed
- NIP-05: bob@satnam.pub (Satnam-hosted)

Satnam publishes at https://satnam.pub/.well-known/payment-protocols?name=bob:
{
  "name": "bob",
  "protocols": {
    "lightning": {
      "address": "bob@custom-domain.com",  // External
      "lnurl": "https://custom-domain.com/.well-known/lnurlp/bob"
    },
    "bitcoin_silent": {
      "address": "sp1qq..."  // Satnam-derived
    }
  }
}
```

**Key Insight**: Lightning Address and Silent Payment address are **independent**:

- Lightning Address can be hosted anywhere (LNbits, Alby, custom)
- Silent Payment address is derived from user's seed (self-sovereign)
- Resolver just maps the human-readable name to both

---

## Question 4: Unified Multi-Protocol Address

### Answer: YES, via Protocol Resolver + Client Intelligence ✅

**Vision**: `alice@satnam.pub` receives ANY format sent to it

**Implementation**:

### 4.1 Protocol Detection Matrix

| Sender Input                           | Detected Protocol | Routing                           |
| -------------------------------------- | ----------------- | --------------------------------- |
| `alice@satnam.pub` in Lightning wallet | Lightning Address | LNURL-pay → LNbits invoice        |
| `alice@satnam.pub` in Bitcoin wallet   | Silent Payment    | Query resolver → sp1qq... address |
| `alice@satnam.pub` in Nostr client     | NIP-05            | Query .well-known/nostr.json      |
| `alice@satnam.pub` in Keet             | Keet Peer ID      | Query resolver → peer discovery   |

### 4.2 Sender-Side Intelligence

**Modern wallets** (Phoenix, Zeus, Sparrow) already support multiple protocols:

```typescript
// Pseudo-code for intelligent wallet
async function sendTo(address: string, amount: number) {
  // 1. Check if Lightning Address
  const lnurlData = await fetchLNURL(address);
  if (lnurlData) {
    return await sendLightning(lnurlData, amount);
  }

  // 2. Check if Silent Payment supported
  const protocolData = await fetch(
    `https://${domain}/.well-known/payment-protocols?name=${user}`,
  );
  if (protocolData.bitcoin_silent) {
    return await sendSilentPayment(protocolData.bitcoin_silent.address, amount);
  }

  // 3. Fallback to standard Bitcoin address
  return await sendBitcoin(address, amount);
}
```

### 4.3 Receiver-Side Scanning

**Alice's wallet** must scan for incoming payments across all protocols:

```typescript
// Unified payment scanner
class UnifiedPaymentScanner {
  async scanForPayments() {
    // 1. Lightning payments (instant)
    await this.scanLightningInvoices();

    // 2. Silent Payments (blockchain scan)
    await this.scanSilentPayments();

    // 3. Nostr DMs (relay subscription)
    await this.scanNostrMessages();

    // 4. Keet P2P messages (DHT)
    await this.scanKeetMessages();
  }
}
```

---

## Risk Assessment

### Technical Risks

| Risk                               | Severity | Likelihood | Mitigation                                                                                        |
| ---------------------------------- | -------- | ---------- | ------------------------------------------------------------------------------------------------- |
| **Blockchain Scanning Complexity** | HIGH     | HIGH       | Use existing libraries (rust-silentpayments, silentpayments.js), start with full node requirement |
| **Light Client Support**           | HIGH     | MEDIUM     | Phase 2 implementation, use BIP158 filters + tweak data server                                    |
| **Key Management Complexity**      | MEDIUM   | MEDIUM     | Leverage existing ClientSessionVault, add Silent Payment key derivation                           |
| **Wallet Compatibility**           | MEDIUM   | LOW        | Most modern wallets adding SP support (Cake, Sparrow, BTCPay)                                     |
| **Privacy Leakage**                | HIGH     | LOW        | Follow BIP-352 spec strictly, audit scanning implementation                                       |
| **Backup/Recovery**                | MEDIUM   | MEDIUM     | 24-word seed backs up everything, document recovery process                                       |

### Operational Risks

| Risk                     | Severity | Likelihood | Mitigation                                                          |
| ------------------------ | -------- | ---------- | ------------------------------------------------------------------- |
| **Infrastructure Costs** | MEDIUM   | HIGH       | Blockchain scanning requires full node + indexing (500GB+ storage)  |
| **User Confusion**       | MEDIUM   | MEDIUM     | Clear UX explaining Lightning (instant) vs On-chain (settlement)    |
| **Regulatory Scrutiny**  | LOW      | LOW        | Silent Payments are standard Bitcoin, no additional regulatory risk |
| **Maintenance Burden**   | MEDIUM   | HIGH       | BIP-352 is stable, but scanning infrastructure needs monitoring     |

### Security Risks

| Risk                        | Severity | Likelihood | Mitigation                                                            |
| --------------------------- | -------- | ---------- | --------------------------------------------------------------------- |
| **Seed Compromise**         | CRITICAL | LOW        | Same risk as existing Keet seed, use hardware signing devices         |
| **Scanning Server Trust**   | HIGH     | MEDIUM     | Users can run own scanning server, provide open-source implementation |
| **UTXO Dust Attacks**       | LOW      | MEDIUM     | Implement dust limits, allow users to ignore small UTXOs              |
| **Malicious Notifications** | MEDIUM   | LOW        | Verify all notifications against blockchain, never trust blindly      |

---

## Benefit Analysis

### User Benefits

| Benefit                             | Impact | User Segment                     |
| ----------------------------------- | ------ | -------------------------------- |
| **Single Address for All Payments** | HIGH   | All users - simplified UX        |
| **On-Chain Settlement**             | HIGH   | Merchants, savings-focused users |
| **Privacy Preservation**            | HIGH   | Privacy-conscious users          |
| **No Address Reuse**                | MEDIUM | Security-conscious users         |
| **Offline Receiving**               | MEDIUM | Users in low-connectivity areas  |
| **Reduced Coordination**            | HIGH   | Donors, content creators         |

### Business Benefits

| Benefit                         | Impact | Rationale                                               |
| ------------------------------- | ------ | ------------------------------------------------------- |
| **Competitive Differentiation** | HIGH   | Few platforms offer unified Lightning + Silent Payments |
| **Sovereignty Alignment**       | HIGH   | On-chain settlement aligns with self-custody mission    |
| **Reduced Custodial Risk**      | MEDIUM | Users can receive directly to cold storage              |
| **Network Effects**             | MEDIUM | More payment options = more users                       |
| **Future-Proofing**             | HIGH   | Silent Payments gaining wallet adoption                 |

### Technical Benefits

| Benefit                  | Impact | Rationale                                   |
| ------------------------ | ------ | ------------------------------------------- |
| **Reusable Seed**        | HIGH   | Single 24-word backup for all identities    |
| **Standard Compliance**  | HIGH   | BIP-352 is finalized, stable spec           |
| **Library Ecosystem**    | MEDIUM | Growing library support (rust, JS, Python)  |
| **Taproot Native**       | MEDIUM | Leverages latest Bitcoin features           |
| **No Server Dependency** | HIGH   | Users can self-host scanning infrastructure |

---

## Implementation Roadmap

### Phase 1: Foundation (Weeks 1-4)

**Objective**: Prove Silent Payment key derivation from Keet seed

**Deliverables**:

- [ ] Extend Keet seed generation to derive Silent Payment keys (BIP-352 paths)
- [ ] Create `SilentPaymentKeyManager` service
- [ ] Add Silent Payment address to `.well-known/payment-protocols` resolver
- [ ] Unit tests for key derivation
- [ ] Documentation: "How Silent Payments Work in Satnam"

**Dependencies**:

- Existing Keet seed generation (Phase 8 of onboarding)
- BIP32 derivation library (@scure/bip32)
- BIP-352 reference implementation (silentpayments.js)

**Success Criteria**:

- ✅ Single 24-word seed derives Keet Peer ID + Silent Payment keys
- ✅ Silent Payment address displayed in user profile
- ✅ Address validates against BIP-352 test vectors
- ✅ Zero TypeScript errors

**Estimated Effort**: 40 hours

---

### Phase 2: Sending Support (Weeks 5-8)

**Objective**: Enable users to SEND to Silent Payment addresses

**Deliverables**:

- [ ] `SilentPaymentSender` service
- [ ] Input selection logic (P2TR, P2WPKH, P2SH-P2WPKH, P2PKH)
- [ ] ECDH shared secret derivation
- [ ] Output creation (multiple outputs, labels)
- [ ] Integration with existing wallet UI
- [ ] Send transaction tests

**Dependencies**:

- Phase 1 complete
- Bitcoin wallet infrastructure (UTXO management)
- Transaction signing capability

**Success Criteria**:

- ✅ Users can send to `sp1q...` addresses
- ✅ Transactions pass BIP-352 test vectors
- ✅ Multiple outputs supported
- ✅ Integration tests with testnet

**Estimated Effort**: 80 hours

---

### Phase 3: Receiving Support - Full Node (Weeks 9-16)

**Objective**: Enable users to RECEIVE Silent Payments (full node scanning)

**Deliverables**:

- [ ] `SilentPaymentScanner` service
- [ ] Bitcoin Core RPC integration
- [ ] Transaction filtering (eligible transactions only)
- [ ] ECDH calculation for incoming payments
- [ ] Label detection (change label m=0)
- [ ] UTXO database integration
- [ ] Background scanning worker
- [ ] Notification system for new payments

**Dependencies**:

- Phase 2 complete
- Bitcoin Core full node (or equivalent)
- Database schema for Silent Payment UTXOs

**Success Criteria**:

- ✅ Users receive payments to Silent Payment address
- ✅ Scanning detects payments within 1 block
- ✅ Labels correctly identified
- ✅ Integration with existing wallet balance

**Estimated Effort**: 120 hours

**Infrastructure Requirements**:

- Bitcoin Core full node (500GB+ storage)
- Indexing database (100GB+ storage)
- Background worker process

---

### Phase 4: Light Client Support (Weeks 17-24)

**Objective**: Enable mobile/browser clients to scan without full node

**Deliverables**:

- [ ] Tweak data server (33 bytes per eligible transaction)
- [ ] BIP158 block filter integration
- [ ] Client-side scanning with tweak data
- [ ] Transaction cut-through optimization
- [ ] Mobile SDK for scanning
- [ ] Browser-based scanning (Web Workers)

**Dependencies**:

- Phase 3 complete
- BIP158 filter server
- Tweak data indexing service

**Success Criteria**:

- ✅ Mobile clients scan with <50MB/month bandwidth
- ✅ Browser clients scan in background
- ✅ Scanning completes within 5 minutes for 1-day gap
- ✅ Privacy preserved (no address disclosure to server)

**Estimated Effort**: 160 hours

**Infrastructure Requirements**:

- Tweak data server (API endpoint)
- BIP158 filter server (if not using existing)
- CDN for tweak data distribution

---

### Phase 5: Unified Address Resolver (Weeks 25-28)

**Objective**: Complete multi-protocol address resolution

**Deliverables**:

- [ ] `.well-known/payment-protocols` endpoint
- [ ] Protocol detection logic
- [ ] Sender-side wallet intelligence
- [ ] Receiver-side unified scanner
- [ ] UX for protocol selection
- [ ] Documentation for wallet developers

**Dependencies**:

- Phases 1-4 complete
- Lightning Address integration (existing)
- NIP-05 integration (existing)
- Keet integration (Phase 8 of onboarding)

**Success Criteria**:

- ✅ `alice@satnam.pub` resolves to all protocols
- ✅ Wallets auto-detect best protocol
- ✅ Users can manually select protocol
- ✅ Unified balance view (Lightning + On-chain)

**Estimated Effort**: 60 hours

---

## When to Implement

### Recommended Timeline

**Immediate (After Phase 8 Onboarding Complete)**:

- ✅ Phase 1: Foundation (key derivation)
  - **Rationale**: Low risk, high value, enables future phases
  - **Effort**: 1 month
  - **Blocker**: None

**Short-Term (Q2 2026)**:

- Phase 2: Sending Support
  - **Rationale**: Enables users to send to Silent Payment addresses (growing adoption)
  - **Effort**: 2 months
  - **Blocker**: Bitcoin wallet infrastructure

**Medium-Term (Q3 2026)**:

- Phase 3: Receiving Support (Full Node)
  - **Rationale**: Completes the loop, requires infrastructure investment
  - **Effort**: 2 months
  - **Blocker**: Bitcoin Core full node deployment

**Long-Term (Q4 2026)**:

- Phase 4: Light Client Support
  - **Rationale**: Enables mobile/browser clients, complex implementation
  - **Effort**: 2 months
  - **Blocker**: Tweak data server infrastructure

**Future (2027)**:

- Phase 5: Unified Address Resolver
  - **Rationale**: Completes the vision, requires all protocols integrated
  - **Effort**: 1.5 months
  - **Blocker**: All previous phases complete

---

## How to Proceed

### Immediate Next Steps

1. **Complete Phase 8 (Keet P2P Messaging)** of the onboarding plan
   - This establishes the 24-word seed generation
   - Provides foundation for Silent Payment key derivation

2. **Prototype Silent Payment Key Derivation** (1 week spike)
   - Use `@scure/bip32` to derive keys from Keet seed
   - Validate against BIP-352 test vectors
   - Document derivation paths

3. **Stakeholder Decision Point**
   - Present this analysis to stakeholders
   - Decide on go/no-go for Phase 1
   - Allocate infrastructure budget (Bitcoin Core node)

4. **If GO: Begin Phase 1 Implementation**
   - Create `SilentPaymentKeyManager` service
   - Extend `.well-known/payment-protocols` endpoint
   - Add Silent Payment address to user profile UI

### Decision Criteria

**Proceed with Silent Payments if**:

- ✅ Willing to run Bitcoin Core full node (500GB+ storage)
- ✅ Target users need on-chain settlement (not just Lightning)
- ✅ Privacy is a core value proposition
- ✅ 6-12 month implementation timeline is acceptable

**Defer Silent Payments if**:

- ❌ Infrastructure costs are prohibitive
- ❌ Lightning-only payments are sufficient
- ❌ Team bandwidth is constrained
- ❌ User demand for on-chain is low

---

## Conclusion

**Silent Payments integration is FEASIBLE and ALIGNED with Satnam's mission**, but requires significant infrastructure investment and development effort.

**Key Recommendations**:

1. ✅ **Proceed with Phase 1** (key derivation) immediately after Phase 8 onboarding
   - Low risk, high value, enables future optionality
   - Minimal infrastructure requirements

2. ⏸️ **Defer Phases 2-4** until user demand is validated
   - Requires Bitcoin Core full node (significant cost)
   - Scanning infrastructure is complex
   - Wait for wallet ecosystem maturity

3. 🎯 **Focus on Lightning + Cashu** for near-term payment needs
   - Instant settlement (Lightning)
   - Offline capability (Cashu)
   - Lower infrastructure costs

4. 📊 **Monitor Silent Payment adoption** in wallet ecosystem
   - Cake Wallet, Sparrow, BTCPay adding support
   - If adoption accelerates, prioritize Phases 2-4

**The unified `username@satnam.pub` vision is achievable**, but should be implemented incrementally based on user demand and infrastructure readiness.

---

## References

- [BIP-352: Silent Payments](https://bips.dev/352/)
- [Silent Payments Website](https://silentpayments.xyz/)
- [rust-silentpayments](https://github.com/cygnet3/rust-silentpayments)
- [silentpayments.js](https://github.com/setavenger/silentpayments.js)
- [BIP-158: Compact Block Filters](https://github.com/bitcoin/bips/blob/master/bip-0158.mediawiki)
- [BIP-32: Hierarchical Deterministic Wallets](https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki)
- [@scure/bip32](https://github.com/paulmillr/scure-bip32) - Audited BIP32 implementation
- [@scure/bip39](https://github.com/paulmillr/scure-bip39) - Audited BIP39 implementation

- ✅ Users receive payments to Silent Payment address
- ✅ Scanning detects payments within 1 block
- ✅ Labels correctly identified
- ✅ Integration with existing wallet balance

**Estimated Effort**: 120 hours

**Infrastructure Requirements**:

- Bitcoin Core full node (500GB+ storage)
- Indexing database (100GB+ storage)
- Background worker process

---
