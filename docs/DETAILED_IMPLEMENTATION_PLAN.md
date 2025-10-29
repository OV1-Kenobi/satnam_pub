# FROST Signature Verification & CEPS Integration - Detailed Implementation Plan

## 🎯 Executive Summary

This plan provides a complete roadmap for implementing two critical methods that complete the FROST signature system:

1. **`verifyAggregatedSignature()`** - Cryptographically verify FROST signatures
2. **`publishSignedEvent()`** - Publish signed events to Nostr relays via CEPS

Both methods will be added to `lib/frost/frost-session-manager.ts` following established patterns.

---

## 📋 Task 1: Signature Verification

### Overview
Verify that a FROST signature (R, s) is cryptographically valid for a given message and public key using secp256k1.

### Method Signature
```typescript
static async verifyAggregatedSignature(
  sessionId: string,
  messageHash: string,
  publicKey: string
): Promise<{ success: boolean; valid?: boolean; error?: string }>
```

### Parameters
| Parameter | Type | Description | Format |
|-----------|------|-------------|--------|
| sessionId | string | FROST session ID | UUID |
| messageHash | string | Original message hash | 64 hex chars (SHA-256) |
| publicKey | string | Aggregated public key | 64 hex chars |

### Implementation (5 Steps)

**Step 1: Retrieve Session**
- Query `frost_signing_sessions` table by `session_id`
- Validate session exists
- Check `status === 'completed'`
- Validate `final_signature` exists with `R` and `s` properties
- Error: "Session not found" or "Session not in completed status"

**Step 2: Extract Signature Components**
- Extract `R` from `final_signature.R` (66 hex chars - compressed point)
- Extract `s` from `final_signature.s` (64 hex chars - scalar)
- Validate format: `R.length === 66 && s.length === 64`
- Error: "Invalid signature format: R={len}, s={len}"

**Step 3: Convert Inputs**
- Convert `messageHash` (64 hex) to Uint8Array
- Convert `publicKey` (64 hex) to Uint8Array
- Validate conversions succeed
- Error: "Invalid message hash format" or "Invalid public key format"

**Step 4: Reconstruct Signature**
- Parse `R` as elliptic curve point: `secp256k1.Point.fromHex(R)`
- Parse `s` as BigInt scalar: `BigInt("0x" + s)`
- Validate both conversions succeed
- Error: "Failed to parse nonce point R: {error}"

**Step 5: Verify Signature**
- Call `secp256k1.verify(signatureBytes, messageHash, publicKeyBytes)`
- Return `{ success: true, valid: true }` if verification passes
- Return `{ success: true, valid: false }` if verification fails
- Return `{ success: false, error: "..." }` if any error occurs

### Error Handling
```typescript
// 6 specific error cases
"Session not found"
"Session not in completed status"
"No final signature in session"
"Invalid signature format: R={len}, s={len}"
"Invalid message hash format"
"Invalid public key format"
"Failed to parse nonce point R: {error}"
"Signature verification failed: {error}"
```

### Return Type
```typescript
interface VerifyResult {
  success: boolean;      // Operation succeeded (no exceptions)
  valid?: boolean;       // Signature is valid (only if success=true)
  error?: string;        // Error message (only if success=false)
}
```

---

## 🚀 Task 2: CEPS Integration

### Overview
Publish a FROST-signed Nostr event to relays via the Central Event Publishing Service.

### Method Signature
```typescript
static async publishSignedEvent(
  sessionId: string
): Promise<{ success: boolean; eventId?: string; error?: string }>
```

### Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| sessionId | string | FROST session ID with completed signature |

### Implementation (5 Steps)

**Step 1: Retrieve Session**
- Query `frost_signing_sessions` table by `session_id`
- Validate session exists
- Check `status === 'completed'`
- Validate `event_template` exists (feature gate)
- Validate `event_type` exists
- Error: "Session not found" or "No event template in session"

**Step 2: Parse Event Template**
- Parse `event_template` as JSON
- Validate it's a valid Nostr event object
- Check required fields: `kind`, `content`, `tags`, `created_at`
- Error: "Invalid event template JSON: {error}"

**Step 3: Add Signature to Event**
- Extract `final_signature` from session
- Add signature to event:
  - `event.sig = final_signature.s` (scalar part)
  - Add nonce commitment tag: `["nonce", final_signature.R]`
  - Add FROST metadata tag: `["frost", sessionId]`
- Validate event structure
- Error: "Invalid event structure"

**Step 4: Publish via CEPS**
- Import CEPS: `import { central_event_publishing_service as CEPS }`
- Call `CEPS.publishEvent(event, relays)` where relays are:
  - Family-specific relays if `family_id` available
  - Default: `["wss://relay.satnam.pub"]`
- Capture returned event ID
- Error: "CEPS publish failed: {error}"

**Step 5: Update Session**
- Update `frost_signing_sessions` table:
  - Set `final_event_id = eventId`
  - Set `updated_at = Date.now()`
  - Use optimistic locking: `WHERE session_id = ? AND updated_at = ?`
- Handle concurrent update conflicts gracefully
- Return `{ success: true, eventId }`
- Error: "Failed to update session: {error}"

### Error Handling
```typescript
// 7 specific error cases
"Session not found"
"Session not in completed status"
"No event template in session"
"No event type in session"
"Invalid event template JSON: {error}"
"Invalid event structure"
"CEPS publish failed: {error}"
"Failed to update session: {error}"
```

### Return Type
```typescript
interface PublishResult {
  success: boolean;      // Operation succeeded
  eventId?: string;      // Published event ID (only if success=true)
  error?: string;        // Error message (only if success=false)
}
```

---

## 🔧 Type Declarations

### Update `types/missing-modules.d.ts`

Add signature verification support to secp256k1 interface:
```typescript
export const secp256k1: {
  // ... existing properties ...
  
  verify(
    signature: Uint8Array | { r: bigint; s: bigint },
    msgHash: Uint8Array,
    publicKey: Uint8Array
  ): boolean;
};
```

---

## 📊 Code Organization

| Item | Details |
|------|---------|
| **File** | lib/frost/frost-session-manager.ts |
| **Method 1** | verifyAggregatedSignature (lines ~900-1050) |
| **Method 2** | publishSignedEvent (lines ~1050-1150) |
| **Type Updates** | types/missing-modules.d.ts |
| **Total Lines** | ~250 lines of new code |

---

## ✅ Quality Standards

- ✅ **Type Safety:** Full TypeScript, no 'any' types
- ✅ **Error Handling:** 13+ specific error messages
- ✅ **Security:** Zero-knowledge architecture
- ✅ **Patterns:** Follows existing code style
- ✅ **Documentation:** JSDoc + inline comments
- ✅ **Memory Safety:** Proper cleanup
- ✅ **Concurrency:** Optimistic locking

---

## 🎯 Implementation Checklist

- [ ] Implement verifyAggregatedSignature() method
- [ ] Implement publishSignedEvent() method
- [ ] Update types/missing-modules.d.ts
- [ ] Add comprehensive error handling
- [ ] Add JSDoc comments
- [ ] Add inline documentation
- [ ] Run TypeScript diagnostics (expect 0 errors)
- [ ] Test with sample data
- [ ] Verify all error cases handled

---

## ✨ Status

**Ready for Implementation:** ✅ YES

All requirements are clear, patterns are established, and implementation can proceed immediately upon approval.


