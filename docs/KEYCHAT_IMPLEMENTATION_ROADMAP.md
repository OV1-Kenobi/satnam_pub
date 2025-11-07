# Keychat-Inspired Features: Implementation Roadmap for Satnam

---

## Decision Matrix: What to Adopt, What to Adapt, What to Avoid

| Feature | Keychat Approach | Satnam Adaptation | Decision | Rationale |
|---------|------------------|-------------------|----------|-----------|
| **Signal Protocol** | Stateful double-ratchet | N/A | ❌ AVOID | Incompatible with serverless (requires persistent state) |
| **MLS Groups** | Scalable group encryption | Custom federation | ⚠️ DEFER | High complexity, limited benefit over NIP-17 |
| **Cashu Relay Payment** | Per-message Bitcoin stamp | Optional premium relays | ✅ ADOPT | Aligns with LNbits/Phoenixd integration |
| **Per-Message Address Rotation** | Signal/MLS automatic | NIP-17 key derivation | ✅ ADAPT | Enhance privacy without stateful encryption |
| **Relay Health Monitoring** | Implicit selection | Explicit scoring | ✅ ADOPT | Improves reliability, low effort |
| **Message Reactions** | Custom implementation | NIP-25 standard | ✅ ADOPT | Standard, low effort, high UX value |
| **Multimedia Messaging** | AWS S3 + Blossom | Blossom/Nostr.build | ✅ ADOPT | Maintains zero-knowledge, feature parity |
| **Message Search** | Local Isar DB | Relay + client-side | ✅ ADAPT | Works with serverless constraints |
| **Contact QR Codes** | Built-in sharing | Already implemented | ✅ MAINTAIN | Satnam already has this |
| **Wallet Integration** | Cashu + Lightning | LNbits + NWC | ✅ MAINTAIN | Satnam already planned |

---

## Phase 1: Quick Wins (Weeks 1-2, 40 hours)

### 1.1 Message Reactions (NIP-25)
**Effort:** 8-12 hours  
**Impact:** High (UX improvement)  
**Complexity:** Low

**Deliverables:**
- [ ] Implement NIP-25 reaction publishing
- [ ] Add reaction aggregation in message UI
- [ ] Display emoji reactions below messages
- [ ] Add reaction picker component
- [ ] Write unit tests (8+ test cases)

**Files to Create/Modify:**
- `src/lib/messaging/reactions.ts` (new)
- `src/components/messaging/ReactionPicker.tsx` (new)
- `src/components/messaging/MessageReactions.tsx` (new)
- `src/lib/messaging/client-message-service.ts` (modify)

**Feature Flag:** `VITE_MESSAGE_REACTIONS_ENABLED`

---

### 1.2 Message Search
**Effort:** 15-20 hours  
**Impact:** Medium (discoverability)  
**Complexity:** Low-Medium

**Deliverables:**
- [ ] Implement relay-based search (if supported)
- [ ] Implement client-side search fallback
- [ ] Add search UI component
- [ ] Index messages in IndexedDB
- [ ] Write integration tests (10+ test cases)

**Files to Create/Modify:**
- `src/lib/messaging/search.ts` (new)
- `src/components/messaging/MessageSearch.tsx` (new)
- `src/lib/messaging/client-message-service.ts` (modify)

**Feature Flag:** `VITE_MESSAGE_SEARCH_ENABLED`

---

### 1.3 Enhanced Relay Discovery (NIP-10050)
**Effort:** 12-16 hours  
**Impact:** High (reliability)  
**Complexity:** Low

**Deliverables:**
- [ ] Implement 24-hour TTL caching
- [ ] Add relay scoring algorithm
- [ ] Implement cache invalidation on failure
- [ ] Add relay fallback chain
- [ ] Write unit tests (12+ test cases)

**Files to Create/Modify:**
- `lib/relay-discovery-service.ts` (new)
- `lib/central_event_publishing_service.ts` (modify)

**Feature Flag:** `VITE_ENHANCED_RELAY_DISCOVERY`

---

## Phase 2: Feature Parity (Weeks 3-6, 70 hours)

### 2.1 Relay Health Monitoring
**Effort:** 16-24 hours  
**Impact:** High (reliability)  
**Complexity:** Medium

**Deliverables:**
- [ ] Implement relay health checks
- [ ] Track response times and success rates
- [ ] Automatic relay rotation on failure
- [ ] Health dashboard (optional)
- [ ] Write integration tests (15+ test cases)

**Files to Create/Modify:**
- `lib/relay-health-monitor.ts` (new)
- `lib/central_event_publishing_service.ts` (modify)
- `src/components/admin/RelayHealthDashboard.tsx` (optional)

**Feature Flag:** `VITE_RELAY_HEALTH_MONITORING`

---

### 2.2 Multimedia Messaging
**Effort:** 20-30 hours  
**Impact:** High (feature parity)  
**Complexity:** Medium

**Deliverables:**
- [ ] Implement Blossom protocol (NIP-B7)
- [ ] Add file upload component
- [ ] Add image preview in messages
- [ ] Add video/audio player
- [ ] Write integration tests (12+ test cases)

**Files to Create/Modify:**
- `src/lib/messaging/multimedia.ts` (new)
- `src/lib/blossom-client.ts` (new)
- `src/components/messaging/FileUpload.tsx` (new)
- `src/components/messaging/MediaPreview.tsx` (new)
- `src/lib/messaging/client-message-service.ts` (modify)

**Feature Flag:** `VITE_MULTIMEDIA_MESSAGING_ENABLED`

**Storage Backend Options:**
1. **Blossom Protocol** (NIP-B7) - Recommended
2. **Nostr.build** - Already integrated
3. **Custom S3** - If available
4. **IPFS** - Decentralized option

---

### 2.3 Cashu Relay Payment Integration
**Effort:** 30-40 hours  
**Impact:** Medium (monetization + spam prevention)  
**Complexity:** Medium-High

**Deliverables:**
- [ ] Implement Cashu token validation
- [ ] Add relay payment configuration
- [ ] Integrate with lnbits-proxy
- [ ] Add payment UI for premium relays
- [ ] Write integration tests (15+ test cases)

**Files to Create/Modify:**
- `netlify/functions/utils/relay-payment.ts` (new)
- `netlify/functions/lnbits-proxy.ts` (modify)
- `src/lib/messaging/relay-payment.ts` (new)
- `src/components/messaging/RelayPaymentModal.tsx` (new)

**Feature Flag:** `VITE_CASHU_RELAY_PAYMENT_ENABLED`

**Dependencies:**
- Cashu library (npm)
- LNbits Cashu extension
- Phoenixd integration

---

## Phase 3: Advanced Features (Weeks 7+, 60+ hours)

### 3.1 Voice Notes
**Effort:** 25-35 hours  
**Impact:** Medium (feature richness)  
**Complexity:** Medium

**Deliverables:**
- [ ] Implement audio recording
- [ ] Add audio compression
- [ ] Upload to Blossom
- [ ] Add audio player in messages
- [ ] Write integration tests (10+ test cases)

**Files to Create/Modify:**
- `src/lib/messaging/voice-notes.ts` (new)
- `src/components/messaging/VoiceRecorder.tsx` (new)
- `src/components/messaging/AudioPlayer.tsx` (new)

**Feature Flag:** `VITE_VOICE_NOTES_ENABLED`

---

### 3.2 Message Threading
**Effort:** 20-30 hours  
**Impact:** Low-Medium (organization)  
**Complexity:** Medium

**Deliverables:**
- [ ] Implement NIP-10 threading tags
- [ ] Add thread UI component
- [ ] Implement thread aggregation
- [ ] Write integration tests (12+ test cases)

**Files to Create/Modify:**
- `src/lib/messaging/threading.ts` (new)
- `src/components/messaging/MessageThread.tsx` (new)

**Feature Flag:** `VITE_MESSAGE_THREADING_ENABLED`

---

### 3.3 Advanced Contact Management
**Effort:** 15-25 hours  
**Impact:** Low (UX improvement)  
**Complexity:** Low-Medium

**Deliverables:**
- [ ] Add contact groups
- [ ] Implement contact blocking
- [ ] Add contact verification status
- [ ] Write integration tests (10+ test cases)

**Files to Create/Modify:**
- `src/lib/contacts/contact-manager.ts` (modify)
- `src/components/contacts/ContactGroups.tsx` (new)

**Feature Flag:** `VITE_ADVANCED_CONTACTS_ENABLED`

---

## Architecture Constraints & Mitigations

### Constraint 1: Serverless Timeout (10 seconds)
**Problem:** Long-running operations timeout  
**Mitigation:**
- Implement async message queuing
- Use background jobs for heavy lifting
- Stream responses where possible

### Constraint 2: Memory Limit (256MB)
**Problem:** Large file uploads fail  
**Mitigation:**
- Implement chunked uploads
- Stream to Blossom server
- Compress before upload

### Constraint 3: No Persistent State
**Problem:** Can't maintain encryption state  
**Mitigation:**
- Use stateless NIP-17/59 (already done)
- Store state in IndexedDB (client-side)
- Use CEPS for all Nostr operations

### Constraint 4: Privacy-First Architecture
**Problem:** Can't expose social graph  
**Mitigation:**
- All features must use encrypted UUIDs
- No plaintext metadata in database
- All relay queries must be privacy-preserving

---

## Testing Requirements

### Unit Tests (Per Feature)
- Minimum 8-15 test cases
- 80%+ code coverage
- Mock CEPS and relay interactions

### Integration Tests
- End-to-end message flows
- Relay failover scenarios
- Error handling and recovery

### E2E Tests
- Real relay interactions
- Multi-user scenarios
- Performance benchmarks

---

## Rollout Strategy

### Canary Deployment
1. Deploy to 10% of users
2. Monitor error rates and performance
3. Collect user feedback
4. Iterate for 1 week

### Gradual Rollout
1. Increase to 50% of users
2. Monitor for 1 week
3. Full rollout if stable

### Feature Flags
- All features behind feature flags
- Ability to disable per-user
- A/B testing support

---

## Success Metrics

### Phase 1
- [ ] 80%+ adoption of message reactions
- [ ] Search used in 30%+ of conversations
- [ ] Relay discovery improves delivery by 15%

### Phase 2
- [ ] 50%+ of messages include media
- [ ] Relay health monitoring reduces failures by 20%
- [ ] Cashu integration enables premium relays

### Phase 3
- [ ] Voice notes used in 20%+ of conversations
- [ ] Threading improves conversation clarity
- [ ] Contact management reduces friction

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| **Relay incompatibility** | Medium | High | Test with multiple relays, fallback chains |
| **Performance degradation** | Low | High | Implement caching, lazy loading |
| **Privacy leaks** | Low | Critical | Audit all features, use encrypted UUIDs |
| **User confusion** | Medium | Medium | Clear UI, feature flags, documentation |
| **Storage limits** | Low | Medium | Implement cleanup, compression |

---

## Conclusion

Adopting Keychat-inspired features while maintaining Satnam's zero-knowledge architecture is achievable through:

1. **Selective adoption** (reactions, search, health monitoring)
2. **Architectural adaptation** (Blossom instead of S3, NIP-25 instead of custom)
3. **Strategic deferral** (Signal/MLS incompatible with serverless)
4. **Privacy preservation** (all features maintain encryption, no metadata exposure)

**Estimated Total Effort:** 170-180 hours (4-5 weeks with 2 developers)

---

## References

- Keychat: https://github.com/keychat-io/keychat-app
- Nostr NIPs: https://github.com/nostr-protocol/nips
- Blossom (NIP-B7): https://github.com/nostr-protocol/nips/blob/master/B7.md
- Cashu: https://cashu.space/
- Satnam CEPS: `lib/central_event_publishing_service.ts`

