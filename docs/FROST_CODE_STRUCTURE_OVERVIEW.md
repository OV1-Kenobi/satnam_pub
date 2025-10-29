# FROST Code Structure Overview

## File Organization

### `lib/frost/frost-session-manager.ts` (1,612 lines)

```
Lines 1-100:      Imports and type definitions
Lines 100-125:    FrostSessionManager class declaration
Lines 125-200:    Constants and configuration
Lines 200-500:    Session creation and management
Lines 500-700:    Nonce collection (Round 1)
Lines 700-850:    Partial signature collection (Round 2)
Lines 850-972:    Signature aggregation (COMPLETED)
Lines 973-1138:   ✨ verifyAggregatedSignature() - NEW
Lines 1140-1327:  ✨ publishSignedEvent() - NEW
Lines 1329-1460:  ✨ sendFrostSigningRequest() - NEW
Lines 1462-1599:  ✨ sendFrostCompletionNotification() - NEW
Lines 1601-1612:  Helper methods (generateSessionId)
```

---

## Method Implementation Details

### Method 1: verifyAggregatedSignature (166 lines)

**Location:** Lines 973-1138

**Structure:**
```
1. JSDoc documentation (11 lines)
2. Method signature (3 lines)
3. Try-catch wrapper (1 line)
4. Step 1: Retrieve session (8 lines)
5. Step 2: Retrieve group public key (8 lines)
6. Step 3: Extract signature components (8 lines)
7. Step 4: Convert inputs to Uint8Array (20 lines)
8. Step 5: Verify signature (20 lines)
9. Error handling (80+ lines)
```

**Key Features:**
- 5-step verification process
- 8+ error cases
- secp256k1 signature verification
- NIP-19 npub decoding
- Comprehensive error messages

---

### Method 2: publishSignedEvent (188 lines)

**Location:** Lines 1140-1327

**Structure:**
```
1. JSDoc documentation (13 lines)
2. Method signature (3 lines)
3. Try-catch wrapper (1 line)
4. Step 1: Retrieve session (8 lines)
5. Step 2: Retrieve group public key (8 lines)
6. Step 3: Parse event template (15 lines)
7. Step 4: Add signature to event (10 lines)
8. Step 5: Publish via CEPS (20 lines)
9. Step 6: Send notifications (10 lines)
10. Step 7: Update session (10 lines)
11. Error handling (80+ lines)
```

**Key Features:**
- 7-step publishing process
- CEPS integration
- Event template validation
- Optimistic locking
- Notification sending
- Graceful error handling

---

### Method 3: sendFrostSigningRequest (132 lines)

**Location:** Lines 1329-1460

**Structure:**
```
1. JSDoc documentation (10 lines)
2. Method signature (3 lines)
3. Try-catch wrapper (1 line)
4. Retrieve session (8 lines)
5. Retrieve family (8 lines)
6. Get guardians/stewards (8 lines)
7. Loop through members (60 lines)
   - Get user identity
   - Extract message preview
   - Send NIP-17 DM
   - Error handling per member
8. Return result (5 lines)
9. Error handling (20+ lines)
```

**Key Features:**
- Individual NIP-17 DMs
- Message preview extraction
- Per-member error handling
- Continues on failures

---

### Method 4: sendFrostCompletionNotification (138 lines)

**Location:** Lines 1462-1599

**Structure:**
```
1. JSDoc documentation (12 lines)
2. Method signature (5 lines)
3. Try-catch wrapper (1 line)
4. Retrieve session (8 lines)
5. Retrieve family (8 lines)
6. Get guardians/stewards (8 lines)
7. Loop through members (60 lines)
   - Get user identity
   - Extract message preview
   - Send NIP-17 DM with status
   - Error handling per member
8. Return result (5 lines)
9. Error handling (20+ lines)
```

**Key Features:**
- Individual NIP-17 DMs
- Success/failure status
- Event ID inclusion
- Per-member error handling
- Continues on failures

---

## Database Query Patterns

### Pattern 1: Session Retrieval
```typescript
const { data: session, error: sessionError } = await supabase
  .from("frost_signing_sessions")
  .select("*")
  .eq("session_id", sessionId)
  .single();
```

### Pattern 2: Family Retrieval
```typescript
const { data: family, error: familyError } = await supabase
  .from("family_federations")
  .select("npub")
  .eq("id", session.family_id)
  .single();
```

### Pattern 3: Members Retrieval
```typescript
const { data: members, error: membersError } = await supabase
  .from("family_members")
  .select("user_duid, family_role")
  .eq("family_federation_id", session.family_id)
  .in("family_role", ["guardian", "steward"])
  .eq("is_active", true);
```

### Pattern 4: User Identity Retrieval
```typescript
const { data: userIdentity, error: userError } = await supabase
  .from("user_identities")
  .select("npub")
  .eq("id", member.user_duid)
  .single();
```

### Pattern 5: Session Update (Optimistic Locking)
```typescript
const { error: updateError } = await supabase
  .from("frost_signing_sessions")
  .update({
    final_event_id: eventId,
    updated_at: now,
  })
  .eq("session_id", sessionId)
  .eq("updated_at", session.updated_at); // Optimistic locking
```

---

## Error Handling Patterns

### Pattern 1: Database Error Check
```typescript
if (sessionError || !session) {
  return {
    success: false,
    error: "Session not found",
  };
}
```

### Pattern 2: Status Validation
```typescript
if (session.status !== "completed") {
  return {
    success: false,
    error: "Session not in completed status",
  };
}
```

### Pattern 3: Per-Member Error Handling
```typescript
for (const member of members) {
  try {
    // Process member
  } catch (memberError) {
    console.warn(`Failed for member: ${memberError.message}`);
    // Continue to next member
  }
}
```

### Pattern 4: Graceful Failure
```typescript
try {
  await this.sendFrostCompletionNotification(sessionId, eventId, true);
} catch (notifyError) {
  // Log but don't fail
  console.warn(`Failed to send notifications: ${notifyError.message}`);
}
```

---

## Type Safety

All methods use proper TypeScript types:
- No 'any' types
- Proper return type annotations
- Parameter type validation
- Error type handling with `instanceof Error`

---

## Documentation

Each method includes:
- JSDoc comments with description
- Parameter documentation
- Return type documentation
- Security notes
- Implementation step comments
- Error case documentation

---

## Integration Points

### CEPS Integration
- Dynamic import to avoid circular dependencies
- `publishEvent()` for Nostr publishing
- `sendStandardDirectMessage()` for NIP-17 DMs

### Cryptography
- @noble/curves/secp256k1 for verification
- nostr-tools for NIP-19 decoding

### Database
- Supabase client for all queries
- RLS policy compliance
- Optimistic locking for updates

