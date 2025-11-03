# Phase 1 Quick-Start Guide: Core Messaging Compatibility

**Duration**: 2 weeks (full-time) or 4 weeks (part-time)  
**Total Effort**: 17-21 hours  
**Goal**: Enable Satnam to send/receive all message types from Tides and 0xchat users

---

## Phase 1 Overview

### Success Criteria
- ✅ Receive 100% of NIP-17 messages from Tides users
- ✅ Receive 100% of NIP-59 messages from 0xchat users
- ✅ Receive NIP-101 secret chat invitations from 0xchat
- ✅ Relay strategy optimized for 40-60% faster delivery
- ✅ All tests passing, no regressions

### Tasks (in order)
1. **Task 1.1**: Unified Relay Strategy (4-6 hours)
2. **Task 1.2**: Enhanced NIP-17/59 Message Handling (5-7 hours)
3. **Task 1.3**: Contact Discovery from DM History (3-4 hours)
4. **Task 1.4**: Event Validation Framework (3-5 hours)

---

## Task 1.1: Unified Relay Strategy (4-6 hours)

### What to Build
Combine Tides' MIN_READY threshold (connect 3 fast relays first) with 0xchat's relay categorization (general, dm, inbox, group).

### Files to Create/Modify
- **CREATE**: `src/lib/relay-strategy.ts`
- **UPDATE**: `src/lib/central_event_publishing_service.ts`
- **CREATE**: `netlify/functions/utils/relay-manager.ts` (optional)

### Key Implementation Details
```typescript
// Key constants
const MIN_READY = 3; // Tides pattern
const SLOW_RELAY_PATTERN = /nostr\.watch|relay\.nostr\.net|relay\.damus\.io/i;

// Key methods
- ensureConnection(relayList, category): Promise<boolean>
- updateTimestamp(relay, category, until): void
- getTimestamp(relay, category): { until, since }
```

### Testing Checklist
- [ ] Unit test: MIN_READY threshold triggers at 3 relays
- [ ] Unit test: Fast relays connect before slow relays
- [ ] Integration test: Relay connection time <500ms
- [ ] Integration test: Category-based timestamp tracking works

### Success Criteria
- Relay connection time improved by 40-60%
- All tests passing
- No regressions in existing CEPS functionality

---

## Task 1.2: Enhanced NIP-17/59 Message Handling (5-7 hours)

### What to Build
Support all message types: NIP-04 (legacy), NIP-17 (kind 14), NIP-59 (kind 1059 gift-wrap), NIP-101 (secret chats).

### Files to Create/Modify
- **CREATE**: `src/lib/message-handler.ts`
- **UPDATE**: `src/lib/central_event_publishing_service.ts`
- **UPDATE**: `types/nostr-events.ts`

### Key Implementation Details
```typescript
// Key methods
- decryptMessage(event, privateKey): Promise<string | null>
- decryptGiftWrap(event, privateKey): Promise<string | null>
- decryptNip17(event, privateKey): Promise<string | null>
- decryptNip04(event, privateKey): Promise<string | null>

// Decryption order
1. Try NIP-59 (kind 1059) - gift wrap
2. Try NIP-17 (kind 14) - modern DMs
3. Try NIP-04 (kind 4) - legacy DMs
4. Fallback to plaintext
```

### Testing Checklist
- [ ] Unit test: Decrypt NIP-04 messages
- [ ] Unit test: Decrypt NIP-17 (kind 14) messages
- [ ] Unit test: Decrypt NIP-59 gift-wrapped messages
- [ ] Integration test: Receive message from Tides user
- [ ] Integration test: Receive message from 0xchat user
- [ ] Security test: Verify no plaintext nsec in logs

### Success Criteria
- Receive 100% of NIP-17 messages from Tides
- Receive 100% of NIP-59 messages from 0xchat
- All tests passing
- No security vulnerabilities

---

## Task 1.3: Contact Discovery from DM History (3-4 hours)

### What to Build
Automatically discover contacts from message history (Tides pattern).

### Files to Create/Modify
- **CREATE**: `src/lib/contact-manager.ts`
- **UPDATE**: `src/lib/auth/unified-auth-system.ts`

### Key Implementation Details
```typescript
// Key methods
- discoverContactsFromDMs(userPubkey, dmRelays): Promise<Set<string>>
- mergeContacts(followListContacts, dmDiscoveredContacts): Promise<Contact[]>

// Query for DMs
const dmFilters = [
  { kinds: [4, 14], authors: [userPubkey] },
  { kinds: [4, 14], '#p': [userPubkey] }
];

// Extract pubkeys from events and 'p' tags
```

### Testing Checklist
- [ ] Unit test: Extract pubkeys from DM events
- [ ] Integration test: Discover contacts from message history
- [ ] Integration test: Merge follow list with DM-discovered contacts
- [ ] Performance test: Discovery completes in <5 seconds

### Success Criteria
- Discover all contacts from DM history
- Merge with existing follow list
- All tests passing

---

## Task 1.4: Event Validation Framework (3-5 hours)

### What to Build
Implement kind-specific validation rules (Tides pattern).

### Files to Create/Modify
- **CREATE**: `src/lib/validation/event-validator.ts`
- **UPDATE**: `src/lib/central_event_publishing_service.ts`

### Key Implementation Details
```typescript
// Validation rules for each kind
Kind 4 (NIP-04):
  - Required fields: id, pubkey, created_at, content
  - Required tags: p (exactly 1)

Kind 14 (NIP-17):
  - Required fields: id, pubkey, created_at, content
  - Required tags: p (at least 1)

Kind 1059 (NIP-59):
  - Required fields: id, pubkey, created_at, content
  - Required tags: p (exactly 1)
```

### Testing Checklist
- [ ] Unit test: Validate kind 4 messages
- [ ] Unit test: Validate kind 14 messages
- [ ] Unit test: Validate kind 1059 gift wraps
- [ ] Unit test: Reject invalid events
- [ ] Integration test: Validation integrated into CEPS

### Success Criteria
- All valid events accepted
- All invalid events rejected
- All tests passing

---

## Implementation Order

### Week 1
- **Days 1-2**: Task 1.1 (Relay Strategy)
- **Days 3-4**: Task 1.2 (Message Handling)
- **Day 5**: Testing and integration

### Week 2
- **Days 1-2**: Task 1.3 (Contact Discovery)
- **Days 3-4**: Task 1.4 (Event Validation)
- **Day 5**: Final testing, bug fixes, documentation

---

## Testing Strategy

### Unit Tests
- Test each class/method in isolation
- Mock external dependencies (CEPS, Supabase)
- Aim for >80% code coverage

### Integration Tests
- Test with real Nostr events
- Test with real relay connections
- Test with real Tides/0xchat users (if possible)

### E2E Tests
- Test complete message flow
- Test with multiple relays
- Test error handling

---

## Common Pitfalls to Avoid

1. **Don't hardcode relay URLs** - Use CEPS relay list
2. **Don't store plaintext nsec** - Use ClientSessionVault
3. **Don't log sensitive data** - Redact nsec, salts, hashes
4. **Don't break existing functionality** - Run full test suite
5. **Don't skip error handling** - Handle all edge cases

---

## Success Metrics

### Performance
- Relay connection time: <500ms (40-60% improvement)
- Message decryption: <100ms per message
- Contact discovery: <5 seconds for 1000 contacts

### Compatibility
- NIP-17 message delivery: 100%
- NIP-59 message delivery: 100%
- NIP-04 message delivery: 100%

### Quality
- Unit test coverage: >80%
- Integration test pass rate: 100%
- Security vulnerabilities: 0

---

## Resources

- **Full Plan**: `UNIFIED_IMPLEMENTATION_PLAN.md` (1,796 lines)
- **Summary**: `IMPLEMENTATION_PLAN_SUMMARY.md`
- **Tides Reference**: https://github.com/arbadacarbaYK/tides
- **0xchat Reference**: https://github.com/0xchat-app/0xchat-core
- **NIP-17 Spec**: https://github.com/nostr-protocol/nips/blob/master/17.md
- **NIP-59 Spec**: https://github.com/nostr-protocol/nips/blob/master/59.md

---

## Questions?

Refer to the full `UNIFIED_IMPLEMENTATION_PLAN.md` for:
- Detailed code examples
- Integration points with CEPS
- Architectural compatibility analysis
- Conflict resolution strategies
- Complete testing requirements

**Ready to start? Begin with Task 1.1: Unified Relay Strategy**

