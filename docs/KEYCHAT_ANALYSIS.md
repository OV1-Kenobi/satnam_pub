# Keychat Project Analysis: Messaging Capabilities for Satnam

**Analysis Date:** November 7, 2025  
**Scope:** Keychat (Flutter/Dart) vs Satnam (TypeScript/React + Netlify Functions)  
**Focus:** Messaging architecture, privacy patterns, relay management, and NIP implementations

---

## Executive Summary

Keychat is a Flutter-based "super app" built on Bitcoin Ecash (Cashu), Nostr Protocol, Signal Protocol, and MLS Protocol. While architecturally different from Satnam (browser-only serverless), Keychat offers valuable patterns for:

1. **Advanced encryption strategies** (Signal/MLS for group messaging)
2. **Relay payment mechanisms** (Cashu-based relay access)
3. **Metadata privacy** (address rotation via Signal/MLS)
4. **Multi-protocol fallback chains** (NIP-17 → NIP-59 → NIP-04)

---

## 1. Messaging Architecture Comparison

### Keychat Approach
- **Primary:** Signal Protocol + MLS for end-to-end encryption
- **Relay Payment:** Bitcoin Ecash (Cashu) stamps for relay access
- **Message Delivery:** Postal system metaphor (stamps = payment, relays = post offices)
- **Group Messaging:** MLS protocol for large group encryption
- **Key Rotation:** Signal/MLS handles per-message address changes

### Satnam Current Implementation
- **Primary:** NIP-17 (private DMs) with NIP-59 (gift-wrap) fallback
- **Encryption:** NIP-44 (ChaCha20-Poly1305) + NIP-04 (legacy)
- **Relay Selection:** NIP-10050 (inbox relay discovery) with TTL caching
- **Fallback Chain:** NIP-17 → NIP-59 → NIP-44 (three-tier)
- **Session Management:** ClientSessionVault (WebAuthn + PBKDF2)

### Key Differences
| Aspect | Keychat | Satnam |
|--------|---------|--------|
| **Encryption** | Signal/MLS (stateful) | NIP-44/04 (stateless) |
| **Group Messaging** | MLS protocol | NIP-17 + custom federation |
| **Relay Access** | Cashu payment per message | Free (relay-dependent) |
| **Address Privacy** | Per-message rotation | Per-conversation rotation |
| **Architecture** | Native app (Flutter) | Browser-only serverless |

---

## 2. Privacy & Security Patterns

### Keychat Innovations
1. **Postal System Model:** Conceptually elegant - separates identity (sender/receiver) from delivery (relay)
2. **Cashu Integration:** Micropayment-based relay access prevents spam/DoS
3. **Signal Protocol:** Proven double-ratchet algorithm for forward secrecy
4. **MLS for Groups:** Scalable group encryption without per-member encryption

### Satnam Advantages
1. **Zero-Knowledge Architecture:** No nsec reconstruction, encrypted storage only
2. **Privacy-First Schema:** DUID hashing with per-user salts
3. **NIP-17 Standardization:** Leverages Nostr ecosystem standards
4. **Netlify Compatibility:** Serverless constraints force stateless design

### Compatibility Assessment
- **Signal Protocol:** ❌ NOT compatible with browser-only serverless (requires stateful ratchet state)
- **MLS Protocol:** ⚠️ PARTIAL - could be adapted for group messaging, but adds complexity
- **Cashu Integration:** ⚠️ POSSIBLE - requires LNbits/Phoenixd integration (already planned)
- **Address Rotation:** ✅ COMPATIBLE - can enhance NIP-17 with per-message key derivation

---

## 3. Relay Management & Discovery

### Keychat Strategy
- Relays act as "post offices" collecting Cashu stamps
- Relay selection based on payment capacity and uptime
- No explicit NIP-10050 implementation mentioned
- Fallback to default relays if primary unavailable

### Satnam Current Implementation
- **NIP-10050 Discovery:** Inbox relay discovery with TTL caching
- **Fallback Relays:** wss://relay.satnam.pub, wss://relay.damus.io, etc.
- **PoW Support:** Optional proof-of-work for specific relays (0xchat.com: difficulty 28)
- **Relay Privacy Layer:** Metadata protection via relay selection strategy

### Recommendations
1. **Enhance NIP-10050 Caching:** Implement longer TTL (24h) with refresh on failure
2. **Add Relay Health Monitoring:** Track relay response times and success rates
3. **Implement Relay Reputation:** Score relays based on uptime/latency
4. **Cashu-Based Access:** Gate premium relay access via Cashu tokens (future)

---

## 4. NIP Implementations

### Keychat NIPs
- ✅ NIP-01 (Basic protocol)
- ✅ NIP-06 (BIP39 key derivation)
- ✅ NIP-07 (window.nostr)
- ✅ NIP-17 (Private DMs)
- ✅ NIP-19 (Bech32 entities)
- ✅ NIP-44 (Encrypted payloads)
- ✅ NIP-47 (Nostr Wallet Connect)
- ✅ NIP-55 (Android Signer)
- ✅ NIP-59 (Gift Wrap)
- ✅ NIP-B7 (Blossom Media)

### Satnam NIPs (Current)
- ✅ NIP-01, 04, 17, 19, 42, 44, 59
- ✅ NIP-10050 (Inbox relay discovery)
- ✅ NIP-26 (Delegation)
- ✅ NIP-41/1776/1777 (Key rotation)
- ✅ NIP-03 (Attestation - SimpleProof)
- ✅ NIP-85 (Trust Provider - planned)

### Missing NIPs for Satnam
- ❌ NIP-06 (BIP39) - intentionally avoided (no mnemonic recovery)
- ❌ NIP-55 (Android Signer) - mobile-specific
- ❌ NIP-B7 (Blossom Media) - file hosting protocol
- ⚠️ NIP-47 (NWC) - in progress with lnbits-proxy

---

## 5. Message Types & Features

### Keychat Capabilities
- Text messages
- File attachments (via AWS S3)
- Voice notes
- Short video messages
- Group messaging (MLS-based)
- Cashu token sharing
- Lightning invoice payments

### Satnam Current
- Text messages (NIP-17/59)
- OTP delivery (NIP-59 gift-wrapped)
- Notifications (CEPS-based)
- Payment notifications (Lightning)
- Peer invitations (QR codes via Nostr.build)

### Recommendations for Satnam
1. **Multimedia Messaging:** Add file attachment support via Blossom or similar
2. **Voice Notes:** Implement audio message support (requires storage backend)
3. **Message Reactions:** Add NIP-25 support for emoji reactions
4. **Message Editing:** Implement NIP-16 (event deletion) + edit markers
5. **Read Receipts:** Add privacy-preserving read status (optional, encrypted)

---

## 6. UI/UX Patterns

### Keychat Strengths
- Clean conversation list with contact avatars
- Message search across conversations
- Contact management with QR code sharing
- Wallet integration (Cashu + Lightning)
- Mini-app browser integration

### Satnam Opportunities
1. **Conversation Threading:** Group related messages by topic
2. **Contact Verification:** Display trust scores and verification status
3. **Message Reactions:** Add emoji reactions to messages
4. **Typing Indicators:** Implement privacy-preserving typing status
5. **Message Pinning:** Pin important messages in conversations

---

## 7. Implementation Complexity & Effort Estimates

| Feature | Effort | Compatibility | Priority |
|---------|--------|---------------|----------|
| **Multimedia Messaging** | Medium (20-30h) | ✅ High | Medium |
| **Message Reactions (NIP-25)** | Low (8-12h) | ✅ High | Low |
| **Enhanced Relay Discovery** | Low (12-16h) | ✅ High | Medium |
| **Signal Protocol Integration** | High (80-120h) | ❌ Low | Low |
| **MLS Group Messaging** | High (100-150h) | ⚠️ Medium | Low |
| **Cashu Relay Payment** | Medium (30-40h) | ✅ High | Medium |
| **Voice Notes** | Medium (25-35h) | ✅ High | Low |
| **Message Search** | Low (15-20h) | ✅ High | Medium |

---

## 8. Architectural Conflicts & Constraints

### Browser-Only Serverless Limitations
1. **No Stateful Encryption:** Signal protocol requires ratchet state persistence
2. **No Background Processing:** Can't maintain relay connections
3. **No Local Database:** Limited to IndexedDB (small storage)
4. **No Native Crypto:** Must use Web Crypto API (limited algorithms)

### Satnam-Specific Constraints
1. **Netlify Functions:** 10-second timeout, 256MB memory
2. **Privacy-First:** No social graph exposure, encrypted UUIDs
3. **Zero-Knowledge:** No nsec reconstruction, encrypted storage only
4. **Feature Flags:** All new features must be gated

### Keychat Advantages (Not Applicable)
- ❌ Native Signal/MLS libraries (Dart FFI)
- ❌ Persistent local database (Isar)
- ❌ Background message processing
- ❌ Direct relay connections

---

## 9. Recommendations Prioritized by Impact vs. Effort

### High Impact, Low Effort (Implement First)
1. **Enhanced NIP-10050 Caching** (12-16h) - Better relay discovery
2. **Message Reactions (NIP-25)** (8-12h) - UX improvement
3. **Message Search** (15-20h) - Discoverability

### Medium Impact, Medium Effort (Phase 2)
1. **Multimedia Messaging** (20-30h) - Feature parity with competitors
2. **Cashu Relay Payment** (30-40h) - Monetization + spam prevention
3. **Enhanced Relay Health Monitoring** (16-24h) - Reliability

### Low Impact, High Effort (Defer)
1. **Signal Protocol** (80-120h) - Incompatible with serverless
2. **MLS Groups** (100-150h) - Complex, limited benefit
3. **Voice Notes** (25-35h) - Nice-to-have

### Not Recommended
- ❌ Full Signal Protocol adoption (architectural mismatch)
- ❌ Stateful encryption (breaks serverless model)
- ❌ BIP39 mnemonics (conflicts with zero-knowledge design)

---

## 10. Integration Strategy

### Phase 1: Quick Wins (Weeks 1-2)
- Implement NIP-25 (message reactions)
- Enhance NIP-10050 relay discovery
- Add message search capability

### Phase 2: Feature Parity (Weeks 3-6)
- Multimedia messaging support
- Relay health monitoring
- Cashu integration for relay access

### Phase 3: Advanced Features (Weeks 7+)
- Voice notes (if storage backend available)
- Message threading
- Advanced contact management

---

## Conclusion

Keychat's architecture offers valuable insights into privacy-first messaging, but **direct adoption of Signal/MLS is not feasible** for Satnam's browser-only serverless model. Instead, focus on:

1. **Incremental NIP improvements** (NIP-25, enhanced NIP-10050)
2. **Multimedia support** (compatible with existing CEPS)
3. **Relay optimization** (health monitoring, Cashu integration)
4. **UX enhancements** (reactions, search, threading)

These changes maintain Satnam's zero-knowledge architecture while improving messaging capabilities to compete with Keychat's feature set.

---

## References

- Keychat GitHub: https://github.com/keychat-io/keychat-app
- Keychat Website: https://www.keychat.io/
- Nostr NIPs: https://github.com/nostr-protocol/nips
- Satnam CEPS: `lib/central_event_publishing_service.ts`
- Satnam Messaging: `src/lib/messaging/`

