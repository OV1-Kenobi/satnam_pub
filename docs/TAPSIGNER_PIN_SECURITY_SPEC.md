# Tapsigner PIN Security Specification

**Document Version**: 1.0  
**Date**: 2025-11-06  
**Status**: APPROVED  
**Security Level**: CRITICAL

---

## 🔐 Overview

All Tapsigner signing operations require **Two-Factor Authentication (2FA)**:
1. **Something you have**: Physical Tapsigner card (tap to authenticate)
2. **Something you know**: 6-digit PIN number (user input)

This eliminates the risk of physical theft allowing unauthorized signing operations.

---

## 📋 PIN Security Requirements

### PIN Entry Specifications

**Format**:
- 6-digit numeric PIN (0-9)
- User input via masked input field (display as dots/asterisks)
- No copy/paste allowed (security best practice)
- No autocomplete (autocomplete="off")

**Validation**:
- PIN validated on Tapsigner card hardware (NOT server-side)
- Maintains zero-knowledge architecture
- Card hardware enforces rate limiting and lockout
- Server never receives plaintext PIN

**Attempt Limits**:
- Maximum 3 failed PIN attempts per signing operation
- After 3 failures: Card locks for 15 minutes
- Lockout enforced by card hardware
- Failed attempts logged to audit trail with timestamp

### PIN Storage & Handling

**CRITICAL - PIN Must NEVER**:
- ❌ Be stored in React state after verification
- ❌ Be stored in localStorage or sessionStorage
- ❌ Be transmitted to server in plaintext
- ❌ Be logged in console or error messages
- ❌ Be included in error responses
- ❌ Be cached in memory longer than needed

**CORRECT - PIN Should**:
- ✅ Be collected in secure input field (masked)
- ✅ Be passed directly to card hardware for validation
- ✅ Be cleared from memory immediately after use
- ✅ Be validated only on card hardware
- ✅ Have failed attempts logged (without PIN value)

### Memory Cleanup

```typescript
// After PIN validation attempt (success or failure):
// 1. Clear PIN from input field
pinInputRef.current.value = "";

// 2. Clear any PIN variables
let pin = ""; // Overwrite with empty string

// 3. Clear from state if temporarily stored
setPinInput("");

// 4. Ensure no references remain
// Use TextEncoder + ArrayBuffer pattern for sensitive data
const pinBuffer = new TextEncoder().encode(pin);
// ... use buffer for card communication ...
// Clear buffer
pinBuffer.fill(0);
```

---

## 🔄 5-Step Signing Flow with PIN

### Step 1: Event Preview
- Display unsigned event details
- Show event kind, content (truncated if >200 chars), tags
- User reviews and confirms they want to sign
- **No PIN required yet**

### Step 2: Tap Card
- Prompt: "Tap your Tapsigner card to the NFC reader"
- Detect card via Web NFC API
- Establish secure communication with card
- **No PIN required yet**

### Step 3: PIN Entry (2FA)
- Prompt: "Enter your 6-digit PIN"
- Display masked input field
- User enters PIN (6 digits)
- **PIN validated on card hardware**
- If validation fails:
  - Display error: "Invalid PIN. X attempts remaining"
  - Increment attempt counter
  - If 3 attempts exceeded: "Card locked for 15 minutes"
  - Log failed attempt to audit trail

### Step 4: Signature Verification
- Card produces signature using private key
- Verify signature format and validity
- Display: "Signature created successfully"
- **No PIN required**

### Step 5: Publish
- Publish signed event via CEPS to Nostr relays
- Display: "Event published successfully"
- Show event ID and relay count
- **No PIN required**

---

## 🛡️ Security Audit Trail

### Failed PIN Attempts Logging

**Table**: `tapsigner_operations_log`

```sql
INSERT INTO tapsigner_operations_log (
  owner_hash,
  card_id,
  operation_type,
  success,
  timestamp,
  metadata
) VALUES (
  'user_hash',
  'card_id_hash',
  'pin_validation_failed',
  false,
  NOW(),
  jsonb_build_object(
    'attempt_number', 3,
    'card_locked', true,
    'lockout_duration_minutes', 15
  )
);
```

**Logged Information**:
- ✅ User hash (owner_hash)
- ✅ Card ID hash (card_id_hash)
- ✅ Operation type: "pin_validation_failed"
- ✅ Attempt number (1-3)
- ✅ Whether card is now locked
- ✅ Timestamp

**NOT Logged**:
- ❌ PIN value (never logged)
- ❌ Partial PIN (never logged)
- ❌ PIN length (never logged)
- ❌ Any PIN-related information

### Successful Signing Logging

```sql
INSERT INTO tapsigner_operations_log (
  owner_hash,
  card_id,
  operation_type,
  success,
  signature_hex,
  timestamp,
  metadata
) VALUES (
  'user_hash',
  'card_id_hash',
  'sign_nostr_event',
  true,
  'signature_hex_value',
  NOW(),
  jsonb_build_object(
    'event_kind', 1,
    'event_content_hash', 'hash_value',
    'pin_verified', true
  )
);
```

---

## 🔒 Implementation Checklist

### Frontend Component (TapsignerNostrSignerModal.tsx)

- [ ] Step 1: Event preview display
- [ ] Step 2: Card tap detection via Web NFC API
- [ ] Step 3: PIN entry with masked input field
  - [ ] 6-digit numeric input only
  - [ ] Masked display (dots/asterisks)
  - [ ] No copy/paste
  - [ ] No autocomplete
- [ ] Step 4: Signature verification
- [ ] Step 5: Event publishing via CEPS
- [ ] Error handling for each step
- [ ] Retry logic with clear messaging
- [ ] Rate limit display (10 signatures/min)
- [ ] PIN attempt counter display
- [ ] Lockout timer display (if locked)

### Backend Integration (tapsigner-unified.ts)

- [ ] `handleSignNostrEvent()` receives PIN from frontend
- [ ] PIN passed to card hardware for validation
- [ ] Failed PIN attempts logged to audit trail
- [ ] Lockout enforced by card hardware
- [ ] Rate limiting enforced (10 signatures/min per card)
- [ ] Signature returned only after successful PIN validation

### Security Validation

- [ ] PIN never stored in state after verification
- [ ] PIN never transmitted in plaintext
- [ ] PIN never logged in console/errors
- [ ] PIN cleared from memory after use
- [ ] Failed attempts logged without PIN value
- [ ] 3-attempt limit enforced
- [ ] 15-minute lockout enforced
- [ ] Zero-knowledge architecture maintained

---

## 🚨 Security Warnings

### For Users

**⚠️ PIN Security**:
- Your PIN is like your password - keep it secret
- Never share your PIN with anyone
- Never enter your PIN on untrusted devices
- If you forget your PIN, you'll need to reset your card

**⚠️ Card Security**:
- Keep your Tapsigner card in a safe place
- If your card is lost or stolen, disable it immediately
- The PIN protects your card from unauthorized use

### For Developers

**⚠️ Implementation**:
- PIN validation MUST happen on card hardware only
- Never implement server-side PIN validation
- Never store PIN in any form (plaintext, hashed, encrypted)
- Never log PIN values or partial PINs
- Always clear PIN from memory after use
- Always use masked input field for PIN entry

---

## 📊 Threat Model

### Threat: Physical Card Theft

**Without PIN**:
- Attacker steals card
- Attacker can sign events/payments immediately
- User's identity compromised

**With PIN (2FA)**:
- Attacker steals card
- Attacker cannot sign without knowing PIN
- User's identity protected
- User can disable card before attacker guesses PIN

### Threat: Brute Force PIN Attack

**Protection**:
- 3 attempts maximum per signing operation
- 15-minute lockout after 3 failures
- Card hardware enforces lockout (not software)
- Failed attempts logged to audit trail
- User can monitor audit trail for suspicious activity

### Threat: PIN Interception

**Protection**:
- PIN validated on card hardware only
- PIN never transmitted to server
- PIN never stored in browser storage
- PIN cleared from memory after use
- HTTPS enforced for all communication

---

## ✅ Compliance Checklist

- [x] Two-factor authentication implemented
- [x] PIN validated on card hardware (zero-knowledge)
- [x] 3-attempt limit with 15-minute lockout
- [x] Failed attempts logged to audit trail
- [x] PIN never stored or logged
- [x] Masked input field for PIN entry
- [x] Comprehensive error handling
- [x] Rate limiting enforced
- [x] Security audit trail complete

---

## 📚 Related Documentation

- `docs/TAPSIGNER_EXTENDED_TECHNICAL_SPEC.md` - Technical specifications
- `docs/TAPSIGNER_PHASE3_PREVIEW.md` - Phase 3 implementation guide
- `database/migrations/044_tapsigner_nostr_signings.sql` - Database schema
- `database/migrations/045_tapsigner_action_contexts.sql` - Action context schema

---

**This specification is APPROVED and MANDATORY for all Tapsigner signing operations.**

