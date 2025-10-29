# FROST Signature Verification & CEPS Integration - Plan for Approval

## 📋 Overview

This document presents a detailed implementation plan for two critical methods that complete the FROST signature system:

1. **`verifyAggregatedSignature()`** - Verify FROST signatures cryptographically
2. **`publishSignedEvent()`** - Publish signed events to Nostr relays via CEPS

---

## ✅ Plan Summary

### Task 1: Signature Verification

**Purpose:** Cryptographically verify FROST signatures using secp256k1

**Method Signature:**
```typescript
static async verifyAggregatedSignature(
  sessionId: string,
  messageHash: string,
  publicKey: string
): Promise<{ success: boolean; valid?: boolean; error?: string }>
```

**Implementation:**
- Retrieve completed FROST session from database
- Extract signature components (R: 66 hex chars, s: 64 hex chars)
- Convert inputs to Uint8Array format
- Reconstruct signature as elliptic curve point + scalar
- Call `secp256k1.verify()` to verify signature
- Return `{ success: true, valid: true/false }` or error

**Error Cases:** 6 specific error messages for debugging

---

### Task 2: CEPS Integration

**Purpose:** Publish FROST-signed Nostr events to relays

**Method Signature:**
```typescript
static async publishSignedEvent(
  sessionId: string
): Promise<{ success: boolean; eventId?: string; error?: string }>
```

**Implementation:**
- Retrieve completed FROST session with event_template
- Parse event template as JSON
- Add signature components to event
- Call `CEPS.publishEvent()` to publish to relays
- Update session with `final_event_id` (optimistic locking)
- Return `{ success: true, eventId: "..." }` or error

**Error Cases:** 7 specific error messages for debugging

---

## 🔧 Technical Details

### Cryptographic Operations
- **Library:** @noble/curves/secp256k1 (audited, production-ready)
- **Signature Format:** (R, s) where R is elliptic curve point, s is scalar
- **Verification:** `secp256k1.verify(signature, messageHash, publicKey)`

### Database Operations
- **Table:** frost_signing_sessions
- **Queries:** SELECT by session_id, UPDATE with optimistic locking
- **Concurrency:** Handled via updated_at timestamp validation

### CEPS Integration
- **Import:** `import { central_event_publishing_service as CEPS }`
- **Method:** `CEPS.publishEvent(event, relays)`
- **Relays:** Family-specific or default (wss://relay.satnam.pub)

---

## 📊 Code Organization

| Item | Details |
|------|---------|
| **File** | lib/frost/frost-session-manager.ts |
| **Lines** | ~900-1150 (estimated) |
| **Methods** | 2 new static methods |
| **Type Updates** | types/missing-modules.d.ts |
| **Imports** | CEPS (new), secp256k1 (existing) |

---

## ✅ Quality Standards

- ✅ **Type Safety:** Full TypeScript, no 'any' types
- ✅ **Error Handling:** 13+ specific error messages
- ✅ **Security:** Zero-knowledge architecture maintained
- ✅ **Patterns:** Follows existing code style
- ✅ **Documentation:** JSDoc + inline comments
- ✅ **Memory Safety:** Proper cleanup of sensitive data
- ✅ **Concurrency:** Optimistic locking for updates

---

## 🔐 Security Considerations

1. **Signature Verification**
   - Uses audited @noble/curves library
   - Proper error handling
   - No key exposure

2. **Event Publishing**
   - No nsec/private key exposure
   - Maintains zero-knowledge architecture
   - CEPS handles relay security

3. **Database Operations**
   - Optimistic locking prevents race conditions
   - Timestamp validation ensures consistency
   - No sensitive data in logs

---

## 📝 Deliverables

Upon approval and implementation:

1. ✅ `verifyAggregatedSignature()` method
   - Full implementation with error handling
   - Comprehensive documentation
   - Type-safe with TypeScript

2. ✅ `publishSignedEvent()` method
   - Full implementation with CEPS integration
   - Optimistic locking for database updates
   - Feature gate for event_template

3. ✅ Type Declarations
   - Updated types/missing-modules.d.ts
   - Added secp256k1.verify() signature

4. ✅ Documentation
   - JSDoc comments for both methods
   - Inline comments for complex logic
   - Error handling documentation

---

## 🎯 Implementation Steps

1. **Implement verifyAggregatedSignature()**
   - Add method to frost-session-manager.ts (lines ~900-1050)
   - Implement 5-step verification process
   - Add 6 error cases

2. **Implement publishSignedEvent()**
   - Add method to frost-session-manager.ts (lines ~1050-1150)
   - Implement 5-step publishing process
   - Add 7 error cases

3. **Update Type Declarations**
   - Add secp256k1.verify() to types/missing-modules.d.ts

4. **Verify Quality**
   - Run TypeScript diagnostics (expect 0 errors)
   - Verify all error cases handled
   - Check documentation completeness

---

## ⚠️ Constraints

- ✅ Do NOT modify aggregateSignatures() method
- ✅ Maintain zero-knowledge architecture
- ✅ ESM-only patterns (static imports)
- ✅ No dynamic imports in these methods
- ✅ Follow existing code patterns

---

## 📚 Documentation References

- **FROST Spec:** https://eprint.iacr.org/2020/852.pdf
- **@noble/curves:** https://github.com/paulmillr/noble-curves
- **secp256k1:** https://en.bitcoin.it/wiki/Secp256k1
- **Schnorr Signatures:** https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki

---

## 🚀 Status

**Ready for Implementation:** ✅ YES

All requirements are clear, patterns are established, and implementation can proceed immediately upon approval.

---

## 📋 Approval Checklist

- [ ] Plan reviewed and understood
- [ ] Technical approach approved
- [ ] Error handling strategy approved
- [ ] CEPS integration approach approved
- [ ] Type safety approach approved
- [ ] Ready to proceed with implementation

---

## 📞 Questions or Concerns?

Please review the following detailed documents:
1. `docs/FROST_VERIFICATION_CEPS_INTEGRATION_PLAN.md` - Detailed step-by-step plan
2. `docs/FROST_IMPLEMENTATION_CODE_STRUCTURE.md` - Code structure preview
3. `docs/IMPLEMENTATION_PLAN_SUMMARY.md` - Executive summary

All implementation details are documented and ready for review.


