# FROST Signature Verification & CEPS Integration - Implementation Plan

## 📋 Overview

This plan details the implementation of two new methods in `lib/frost/frost-session-manager.ts`:
1. **`verifyAggregatedSignature()`** - Verify FROST signatures using secp256k1
2. **`publishSignedEvent()`** - Integrate with CEPS for Nostr event publishing

---

## 🔍 Task 1: Signature Verification Implementation

### Method Signature
```typescript
static async verifyAggregatedSignature(
  sessionId: string,
  messageHash: string,
  publicKey: string
): Promise<{ success: boolean; valid: boolean; error?: string }>
```

### Parameters
- **sessionId** (string): FROST session ID to retrieve from database
- **messageHash** (string): Original message hash (64 hex chars, SHA-256)
- **publicKey** (string): Aggregated public key (hex format, 64 chars)

### Implementation Steps

#### Step 1: Retrieve Session (Lines ~900-920)
- Query `frost_signing_sessions` table by `session_id`
- Validate session exists
- Check session status is `'completed'`
- Validate `final_signature` exists and has `R` and `s` properties
- Return error if any validation fails

#### Step 2: Extract Signature Components (Lines ~920-940)
- Extract `R` from `final_signature.R` (66 hex chars - compressed point)
- Extract `s` from `final_signature.s` (64 hex chars - scalar)
- Validate format: R length === 66, s length === 64
- Return error if format invalid

#### Step 3: Convert Inputs (Lines ~940-960)
- Convert `messageHash` (64 hex chars) to Uint8Array using hex conversion
- Convert `publicKey` (64 hex chars) to Uint8Array
- Validate conversions succeed
- Return error if conversion fails

#### Step 4: Reconstruct Signature (Lines ~960-980)
- Parse `R` as elliptic curve point: `secp256k1.Point.fromHex(R)`
- Parse `s` as BigInt scalar: `BigInt("0x" + s)`
- Validate both conversions succeed
- Return error if parsing fails

#### Step 5: Verify Signature (Lines ~980-1000)
- Call `secp256k1.verify(signatureBytes, messageHash, publicKeyBytes)`
- **Note:** secp256k1.verify() expects:
  - Parameter 1: signature as Uint8Array (64 bytes) OR {r, s} object
  - Parameter 2: message hash as Uint8Array
  - Parameter 3: public key as Uint8Array
- Return `{ success: true, valid: true }` if verification passes
- Return `{ success: true, valid: false }` if verification fails
- Return `{ success: false, error: "..." }` if any error occurs

### Error Handling
- Session not found: `"Session not found"`
- Session not completed: `"Session not in completed status"`
- Missing final_signature: `"No final signature in session"`
- Invalid signature format: `"Invalid signature format: R={len}, s={len}"`
- Invalid message hash format: `"Invalid message hash format"`
- Invalid public key format: `"Invalid public key format"`
- Verification error: `"Signature verification failed: {error}"`

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

### Method Signature
```typescript
static async publishSignedEvent(
  sessionId: string
): Promise<{ success: boolean; eventId?: string; error?: string }>
```

### Parameters
- **sessionId** (string): FROST session ID with completed signature

### Implementation Steps

#### Step 1: Retrieve Session (Lines ~1010-1030)
- Query `frost_signing_sessions` table by `session_id`
- Validate session exists
- Check session status is `'completed'`
- Validate `event_template` exists (feature gate)
- Validate `event_type` exists
- Return error if any validation fails

#### Step 2: Parse Event Template (Lines ~1030-1050)
- Parse `event_template` as JSON
- Validate it's a valid Nostr event object
- Check required fields: `kind`, `content`, `tags`, `created_at`
- Return error if parsing fails

#### Step 3: Add Signature to Event (Lines ~1050-1070)
- Extract `final_signature` from session
- Add signature to event:
  - `event.sig = final_signature.s` (scalar part)
  - Add nonce commitment tag: `["nonce", final_signature.R]`
  - Add FROST metadata tag: `["frost", sessionId]`
- Validate event structure
- Return error if modification fails

#### Step 4: Publish via CEPS (Lines ~1070-1090)
- Import CEPS: `import { central_event_publishing_service as CEPS } from "./central_event_publishing_service"`
- Call `CEPS.publishEvent(event, relays)` where relays are:
  - Family-specific relays if `family_id` available
  - Default relays: `["wss://relay.satnam.pub"]`
- Capture returned event ID
- Return error if publish fails

#### Step 5: Update Session (Lines ~1090-1110)
- Update `frost_signing_sessions` table:
  - Set `final_event_id = eventId`
  - Set `updated_at = Date.now()`
  - Use optimistic locking: `WHERE session_id = ? AND updated_at = ?`
- Handle concurrent update conflicts gracefully
- Return `{ success: true, eventId }`

### Error Handling
- Session not found: `"Session not found"`
- Session not completed: `"Session not in completed status"`
- Missing event_template: `"No event template in session"`
- Missing event_type: `"No event type in session"`
- Invalid event template: `"Invalid event template JSON: {error}"`
- CEPS publish failed: `"CEPS publish failed: {error}"`
- Database update failed: `"Failed to update session: {error}"`

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

Add signature verification support:
```typescript
export const secp256k1: {
  verify(
    signature: Uint8Array | { r: bigint; s: bigint },
    msgHash: Uint8Array,
    publicKey: Uint8Array
  ): boolean;
  // ... existing properties
};
```

---

## 📊 Integration Points

### CEPS Integration
- **Import:** `import { central_event_publishing_service as CEPS } from "./central_event_publishing_service"`
- **Method:** `CEPS.publishEvent(event, relays)`
- **Returns:** Event ID (string)
- **Error Handling:** Throws on failure, returns event ID on success

### Database Operations
- **Table:** `frost_signing_sessions`
- **Query:** Retrieve by `session_id`
- **Update:** Set `final_event_id` and `updated_at`
- **Locking:** Optimistic locking with `updated_at` timestamp

### Cryptographic Operations
- **Library:** `@noble/curves/secp256k1`
- **Methods:** `Point.fromHex()`, `verify()`
- **Formats:** Hex strings for all inputs/outputs

---

## ✅ Code Quality Standards

- ✅ Full TypeScript type safety (no 'any' except Point from @noble/curves)
- ✅ Comprehensive error handling for all failure cases
- ✅ Clear error messages for debugging
- ✅ Follows existing frost-session-manager.ts patterns
- ✅ Maintains zero-knowledge architecture
- ✅ ESM-only patterns (static imports)
- ✅ Proper memory cleanup for sensitive data
- ✅ Optimistic locking for concurrent updates
- ✅ Feature gate for CEPS integration (event_template check)

---

## 📝 Documentation

Each method will include:
- JSDoc comments explaining purpose and parameters
- Step-by-step inline comments for complex logic
- Error handling documentation
- Example usage patterns
- Security considerations

---

## 🎯 Deliverables

1. ✅ `verifyAggregatedSignature()` method (complete implementation)
2. ✅ `publishSignedEvent()` method (complete implementation)
3. ✅ Updated type declarations in `types/missing-modules.d.ts`
4. ✅ Comprehensive error handling
5. ✅ Full documentation and comments

---

## ⚠️ Constraints & Assumptions

- **Constraint:** Do NOT modify `aggregateSignatures()` method
- **Constraint:** Maintain zero-knowledge architecture
- **Constraint:** ESM-only patterns (static imports)
- **Assumption:** CEPS is already initialized and available
- **Assumption:** Database schema includes `final_event_id` field
- **Assumption:** Event template is valid JSON Nostr event

---

## 🔐 Security Considerations

1. **Signature Verification:** Uses audited @noble/curves library
2. **Memory Safety:** No sensitive data stored in variables after use
3. **Timing Attacks:** Constant-time comparison for verification
4. **Input Validation:** All inputs validated before use
5. **Error Messages:** Clear but non-revealing error messages
6. **Optimistic Locking:** Prevents race conditions in database updates

---

## ✨ Status

**Ready for Implementation:** ✅ YES

All requirements are clear, patterns are established, and implementation can proceed.


