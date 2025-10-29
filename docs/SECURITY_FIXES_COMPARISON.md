# FROST Implementation - Security Fixes Comparison

## 🚨 Critical Issues & Corrections

---

## Issue 1: Nsec Exposure in Method Parameters

### ❌ ORIGINAL (INSECURE)
```typescript
static async verifyAggregatedSignature(
  sessionId: string,
  messageHash: string,
  publicKey: string  // ❌ WRONG - Accepts from client-side
): Promise<{ success: boolean; valid?: boolean; error?: string }>
```

**Why This Is Wrong:**
- Client-side code could pass wrong/malicious public key
- No validation of key source
- Violates zero-knowledge principle
- Could lead to signature verification bypass

### ✅ CORRECTED (SECURE)
```typescript
static async verifyAggregatedSignature(
  sessionId: string,
  messageHash: string
  // ✅ NO publicKey parameter
): Promise<{ success: boolean; valid?: boolean; error?: string }>
```

**How It Works:**
- Retrieve `family_id` from session
- Query `family_federations` table for `npub`
- Use database-stored public key only
- Prevents parameter injection attacks

---

## Issue 2: Zero-Knowledge Architecture Violation

### ❌ ORIGINAL (INSECURE)
```typescript
// Step 4: Reconstruct Signature
const R = secp256k1.Point.fromHex(finalSignature.R);
const s = BigInt("0x" + finalSignature.s);

// Step 5: Verify Signature
const isValid = secp256k1.verify(
  { r: R, s: s },
  messageHash,
  publicKey  // ❌ Suggests nsec reconstruction
);
```

**Why This Is Wrong:**
- Implies nsec reconstruction (FROST doesn't work this way)
- Confuses npub (public) with nsec (private)
- Violates FROST multi-signature principle
- Suggests single point of key exposure

### ✅ CORRECTED (SECURE)
```typescript
// Step 2: Retrieve Group Public Key (from database)
const { data: family } = await supabase
  .from("family_federations")
  .select("npub")
  .eq("family_id", session.family_id)
  .single();

// Step 5: Verify Signature (using npub only)
const isValid = secp256k1.verify(
  { r: R, s: s },
  messageHash,
  family.npub  // ✅ Public key from database
);
```

**How It Works:**
- FROST aggregation combines partial signatures
- NO nsec reconstruction at any point
- Final signature mathematically valid
- Each guardian/steward uses their own nsec for partial signature only

---

## Issue 3: Missing Federation Notification Flow

### ❌ ORIGINAL (INCOMPLETE)
```typescript
static async publishSignedEvent(
  sessionId: string
): Promise<{ success: boolean; eventId?: string; error?: string }> {
  // Step 1-5: Publish event
  // ❌ NO notification to participants
  // ❌ NO tracking of who approved
  // ❌ NO audit trail
}
```

**Why This Is Wrong:**
- Guardians/stewards don't know signing request was approved
- No transparency in multi-signature process
- No audit trail for compliance
- Violates family governance principles

### ✅ CORRECTED (SECURE)
```typescript
static async publishSignedEvent(
  sessionId: string
): Promise<{ success: boolean; eventId?: string; error?: string }> {
  // Step 1-5: Publish event (existing)
  
  // Step 6: Send Notifications to Participants
  const { data: members } = await supabase
    .from("family_members")
    .select("user_duid, role")
    .eq("family_id", session.family_id)
    .in("role", ["guardian", "steward"]);
  
  for (const member of members) {
    // Send individual NIP-17 DM to each participant
    await CEPS.sendPrivateMessage({
      recipientNpub: member.npub,
      content: `FROST signing completed. Event ID: ${eventId}`,
      tags: [["frost", sessionId], ["event", eventId]]
    });
  }
}
```

**How It Works:**
- Each participant receives individual NIP-17 DM
- Privacy maintained (no group chat exposure)
- Audit trail created (messages logged)
- Transparency in multi-signature process

---

## Issue 4: Nsec Handling in Partial Signature Creation

### ❌ ORIGINAL (NOT ADDRESSED)
```typescript
// Original plan didn't specify how partial signatures are created
// Implied nsec reconstruction or exposure
```

**Why This Is Wrong:**
- Unclear how guardians/stewards sign
- Could lead to nsec exposure
- Violates zero-knowledge principle

### ✅ CORRECTED (SECURE)
```typescript
// Each guardian/steward signs with THEIR OWN nsec (from ClientSessionVault)

// In guardian/steward client:
const nsec = await clientSessionVault.decryptNsec(userDuid);
try {
  // Create partial signature with individual nsec
  const partialSignature = secp256k1.sign(messageHash, nsec);
  
  // Submit partial signature to FROST session
  await submitPartialSignature(sessionId, partialSignature);
} finally {
  // ✅ Wipe nsec from memory immediately
  nsec.fill(0);
}
```

**How It Works:**
- Each guardian/steward uses their own nsec
- Nsec never exposed to other participants
- Nsec wiped from memory after use
- Partial signature submitted to FROST session
- FROST aggregation combines partial signatures
- Final signature valid without nsec reconstruction

---

## Issue 5: Event Publishing Without Nsec

### ❌ ORIGINAL (CONFUSING)
```typescript
// Step 4: Add Signature to Event
event.sig = final_signature.s;
// ❌ Unclear where event.pubkey comes from
// ❌ Suggests nsec needed for publishing
```

**Why This Is Wrong:**
- Unclear that signature is already complete
- Suggests nsec needed for event publishing
- Confuses npub (public) with nsec (private)

### ✅ CORRECTED (SECURE)
```typescript
// Step 2: Retrieve Group Public Key
const { data: family } = await supabase
  .from("family_federations")
  .select("npub")
  .eq("family_id", session.family_id)
  .single();

// Step 4: Add Signature to Event
event.pubkey = family.npub;  // ✅ Group's public key
event.sig = final_signature.s;  // ✅ Already aggregated
// ✅ NO nsec needed - signature is complete

// Step 5: Publish via CEPS
const eventId = await CEPS.publishEvent(event, relays);
// ✅ Event published from group account
```

**How It Works:**
- Event published from group's npub (public account)
- Signature already complete (no nsec needed)
- All participants can verify signature
- No single point of key exposure

---

## 🔐 Security Principles Restored

| Principle | Original | Corrected |
|-----------|----------|-----------|
| **Nsec Exposure** | ❌ Parameter-based | ✅ Database-only |
| **Zero-Knowledge** | ❌ Implied reconstruction | ✅ No reconstruction |
| **Multi-Signature** | ❌ Unclear flow | ✅ Clear partial signatures |
| **Notifications** | ❌ Missing | ✅ Individual DMs |
| **Audit Trail** | ❌ None | ✅ Message logs |
| **Privacy** | ❌ Exposed | ✅ NIP-17 protected |

---

## ✅ Implementation Checklist

- [ ] Remove `publicKey` parameter from `verifyAggregatedSignature()`
- [ ] Add database query to retrieve group npub
- [ ] Implement `publishSignedEvent()` with notifications
- [ ] Add `sendFrostSigningRequest()` method
- [ ] Add `sendFrostCompletionNotification()` method
- [ ] Document nsec handling in partial signature creation
- [ ] Verify zero-knowledge architecture maintained
- [ ] Run security review
- [ ] Run TypeScript diagnostics (expect 0 errors)

---

## 📚 References

- **FROST Spec:** https://eprint.iacr.org/2020/852.pdf
- **NIP-17 (Private DMs):** https://github.com/nostr-protocol/nips/blob/master/17.md
- **Zero-Knowledge Proofs:** https://en.wikipedia.org/wiki/Zero-knowledge_proof
- **Schnorr Signatures:** https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki


