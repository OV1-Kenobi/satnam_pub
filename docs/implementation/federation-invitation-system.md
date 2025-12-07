# Family Federation Invitation System - Implementation Documentation

**Version**: 2.0  
**Date**: December 6, 2025  
**Status**: IMPLEMENTED (Phases 1-3 Complete)

---

## Executive Summary

This document describes the implemented Family Federation Invitation System, which enables secure invitation-based onboarding for family federations. The system supports:

1. **Persistent Token Storage** - AES-256-GCM encrypted sessionStorage for page refresh survival
2. **Auto-Accept During Registration** - Seamless federation joining for new users
3. **Optional Safeword Verification** - Verbal passphrase for out-of-band security

---

## Implementation Status

| Phase   | Name                            | Status      | Completion Date  |
| ------- | ------------------------------- | ----------- | ---------------- |
| Phase 1 | Persistent Token Storage        | ✅ Complete | December 6, 2025 |
| Phase 2 | Auto-Accept During Registration | ✅ Complete | December 6, 2025 |
| Phase 3 | Optional Safeword Verification  | ✅ Complete | December 6, 2025 |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FAMILY FEDERATION INVITATION FLOW                        │
└─────────────────────────────────────────────────────────────────────────────┘

INVITATION GENERATION (Founder):
┌──────────────────┐    ┌─────────────────────┐    ┌──────────────────────┐
│ InvitationGen.tsx│───▶│ /api/family/        │───▶│ family_federation_   │
│ (React Component)│    │ invitations/generate│    │ invitations (DB)     │
└──────────────────┘    └─────────────────────┘    └──────────────────────┘
        │                        │
        │                        ├── Generates inv_* token
        │                        ├── Hashes safeword (if enabled)
        │                        └── Returns URL + QR code

INVITATION ACCEPTANCE (Invitee):
┌──────────────────┐    ┌─────────────────────┐    ┌──────────────────────┐
│ /invite/{token}  │───▶│ /api/family/        │───▶│ Validate token       │
│ (App.tsx route)  │    │ invitations/validate│    │ Check expiration     │
└──────────────────┘    └─────────────────────┘    └──────────────────────┘
        │
        ▼
┌──────────────────┐    ┌─────────────────────┐    ┌──────────────────────┐
│ InvitationDisplay│───▶│ /api/family/        │───▶│ Verify safeword      │
│ (Accept button)  │    │ invitations/accept  │    │ Add to federation    │
└──────────────────┘    └─────────────────────┘    └──────────────────────┘

NEW USER FLOW (Identity Forge Integration):
┌──────────────────┐    ┌─────────────────────┐    ┌──────────────────────┐
│ Store token in   │───▶│ Complete Identity   │───▶│ register-identity.ts │
│ sessionStorage   │    │ Forge registration  │    │ auto-accepts invite  │
│ (AES-256-GCM)    │    │                     │    │                      │
└──────────────────┘    └─────────────────────┘    └──────────────────────┘
```

---

## Phase 1: Persistent Token Storage

### Purpose

Preserve family invitation tokens across page refreshes during the Identity Forge registration flow.

### Implementation

**File**: `src/lib/crypto/invitation-token-storage.ts`

| Function                               | Description                                 |
| -------------------------------------- | ------------------------------------------- |
| `storeEncryptedInvitationToken(token)` | Encrypts and stores token in sessionStorage |
| `recoverEncryptedInvitationToken()`    | Decrypts and returns stored token           |
| `clearInvitationToken()`               | Removes token from storage                  |
| `hasPendingInvitationToken()`          | Checks if token exists                      |

### Security Properties

- **Encryption**: AES-256-GCM via Web Crypto API
- **Key Management**: Random 256-bit session key per browser session
- **IV**: Random 96-bit IV per encryption (prevents ciphertext reuse)
- **Storage Format**: `{iv_base64}.{ciphertext_base64}`
- **Token Validation**: Only accepts `inv_` prefixed tokens

### Integration Points

| File                               | Integration                                    |
| ---------------------------------- | ---------------------------------------------- |
| `src/App.tsx`                      | Stores token when navigating to Identity Forge |
| `src/components/IdentityForge.tsx` | Recovers token on mount, clears on completion  |

---

## Phase 2: Auto-Accept During Registration

### Purpose

Automatically join new users to their invited federation upon successful registration.

### Implementation

**File**: `netlify/functions_active/register-identity.ts`

**Key Logic** (lines 2403-2516):

```typescript
// Detect family vs peer invitations
const isFamilyInvitation = inviteToken.startsWith("inv_");

if (isFamilyInvitation) {
  // Call /api/family/invitations/accept with new user's JWT
  // On success: responseData.federationJoined = {...}
  // On failure: responseData.federationJoinPending = true
}
```

### Response Fields

| Field                   | Type                                       | Description                                             |
| ----------------------- | ------------------------------------------ | ------------------------------------------------------- |
| `federationJoined`      | `{federation_duid, role, federation_name}` | Set on successful auto-accept                           |
| `federationJoinPending` | `boolean`                                  | Set if auto-accept failed (registration still succeeds) |
| `postAuthAction`        | `"show_invitation_modal"`                  | Triggers manual acceptance UI                           |

### Error Handling

- Registration **never fails** due to invitation issues
- All invitation errors are logged server-side
- Client receives minimal error details (security)

---

## Phase 3: Optional Safeword Verification

### Purpose

Add verbal passphrase verification for enhanced security against stolen invitation links.

### Database Schema

**Migration**: `database/migrations/057_invitation_security_hardening.sql`

| Column                  | Type      | Description                            |
| ----------------------- | --------- | -------------------------------------- |
| `safeword_hash`         | TEXT      | SHA-256 hash of safeword (hex-encoded) |
| `safeword_salt`         | TEXT      | Random 32-byte salt (hex-encoded)      |
| `safeword_attempts`     | INTEGER   | Failed verification counter            |
| `safeword_locked_until` | TIMESTAMP | Lockout expiration                     |
| `require_safeword`      | BOOLEAN   | Per-invitation toggle (default: FALSE) |

### PL/pgSQL Functions

| Function                                              | Purpose                                  |
| ----------------------------------------------------- | ---------------------------------------- |
| `verify_invitation_safeword(invitation_id, safeword)` | Verifies safeword with rate limiting     |
| `is_invitation_locked(invitation_id)`                 | Checks if invitation is currently locked |

### Rate Limiting

- **Max Attempts**: 3 failed attempts
- **Lockout Duration**: 1 hour
- **Reset**: Successful verification resets counter

### API Changes

**`api/family/invitations/generate.js`**:

- Added `hashSafeword()` helper using Web Crypto API
- Accepts `safeword` and `requireSafeword` parameters
- Returns `safeword_reminder` for founder to share verbally

**`api/family/invitations/validate.js`**:

- Returns `require_safeword` and `safeword_locked_until` fields

**`api/family/invitations/accept.js`**:

- Added `verifySafeword()` with constant-time comparison
- Implements lockout check and attempt tracking
- Returns remaining attempts on failure

### Frontend Components

**`src/components/family-invitations/InvitationGenerator.tsx`**:

- Toggle switch for "Require Security Passphrase" (default: ON)
- Safeword input with 8-character minimum validation
- Safeword display section with copy button after generation

**`src/components/family-invitations/InvitationDisplay.tsx`**:

- Safeword input field when `require_safeword: true`
- Locked invitation display with countdown
- Remaining attempts display on failure

---

## Security Properties

### Cryptographic Implementations

| Feature                  | Algorithm              | Library        |
| ------------------------ | ---------------------- | -------------- |
| Token Storage Encryption | AES-256-GCM            | Web Crypto API |
| Safeword Hashing         | SHA-256 with salt      | Web Crypto API |
| Timing Attack Mitigation | Double-hash comparison | Web Crypto API |
| Token Generation         | 128-bit random         | Web Crypto API |

### Constant-Time Comparison

```javascript
// From api/family/invitations/accept.js
async function verifySafeword(safeword, storedHash, storedSalt) {
  // Compute SHA-256(salt || safeword)
  const computedHash = await sha256(storedSalt + safeword);

  // Double-hash for timing attack mitigation
  const computedHashBuffer = await sha256(computedHash);
  const storedHashBuffer = await sha256(storedHash);

  // Constant-time XOR comparison
  let result = 0;
  for (let i = 0; i < computedBytes.length; i++) {
    result |= computedBytes[i] ^ storedBytes[i];
  }
  return result === 0;
}
```

### Zero-Knowledge Principles

- Safewords are **never logged** or stored in plaintext
- Only hashes are stored in database
- Client receives minimal error details
- Rate limiting prevents brute-force attacks

### Privacy-First Npub Storage

**CRITICAL**: Npubs (Nostr public keys) are **never stored in cleartext** in the database.

- Invitee npubs are stored as `encrypted_invitee_npub` (SHA-256 hash)
- RLS policies do not query `user_identities.npub` column (doesn't exist in privacy-first schema)
- Targeted invitation matching uses safeword verification as primary security mechanism
- Application-layer encryption allows verification without database-level npub exposure

**Database Column Change** (Migration 056):

```diff
- invitee_npub TEXT,
+ encrypted_invitee_npub TEXT,  -- SHA-256 hash of npub
```

**API Changes for Privacy Compliance**:

- `generate.js`: Encrypts invitee_npub via `encryptInviteeNpub()` before storage
- `validate.js`: Queries `encrypted_invitee_npub` instead of cleartext
- `accept.js`: Validates via safeword + authentication (no npub database lookup)

---

## Decision Log

| Decision                | Status         | Implementation                                 |
| ----------------------- | -------------- | ---------------------------------------------- |
| FROST Validation Timing | ✅ Implemented | Deferred to member joining                     |
| Invitation Expiration   | ✅ Implemented | 7 days with regeneration option (tested)       |
| NIP-17 DM Integration   | ✅ Implemented | Optional (link/QR always available)            |
| Role Guide Delivery     | ✅ Implemented | Link to docs in invitation                     |
| Database Table Location | ✅ Implemented | Separate migration file                        |
| Safeword Default        | ✅ Implemented | Required by default (toggle available)         |
| Rate Limiting           | ✅ Implemented | 3 attempts, 1-hour lockout                     |
| Privacy-First Npub      | ✅ Implemented | encrypted_invitee_npub (SHA-256), no cleartext |

---

## File Reference

### Created Files

| File                                                        | Phase | Purpose                              |
| ----------------------------------------------------------- | ----- | ------------------------------------ |
| `src/lib/crypto/invitation-token-storage.ts`                | 1     | AES-256-GCM encrypted sessionStorage |
| `database/migrations/057_invitation_security_hardening.sql` | 3     | Safeword columns and functions       |
| `api/family/invitations/generate.js`                        | 2     | Invitation generation API            |
| `api/family/invitations/validate.js`                        | 2     | Invitation validation API            |
| `api/family/invitations/accept.js`                          | 2     | Invitation acceptance API            |
| `src/components/family-invitations/InvitationGenerator.tsx` | 2     | Generation UI component              |
| `src/components/family-invitations/InvitationDisplay.tsx`   | 2     | Acceptance UI component              |

### Modified Files

| File                                            | Phase | Changes                                       |
| ----------------------------------------------- | ----- | --------------------------------------------- |
| `src/App.tsx`                                   | 1     | Token storage on navigation to Identity Forge |
| `src/components/IdentityForge.tsx`              | 1     | Token recovery and cleanup                    |
| `netlify/functions_active/register-identity.ts` | 2     | Auto-accept family invitations                |

---

## Testing Strategy

See: `docs/planning/federation-invitation-testing-strategy.md`

---

## Future Enhancements

| Enhancement              | Priority | Description                                  |
| ------------------------ | -------- | -------------------------------------------- |
| Invitation Revocation UI | P2       | Allow founders to revoke pending invitations |
| Invitation Analytics     | P3       | Track view counts, acceptance rates          |
| Multi-Language Safewords | P3       | Support non-ASCII passphrases                |
| Invitation Templates     | P3       | Pre-defined messages for common scenarios    |

---

**Document Status**: Current as of December 6, 2025
**Last Updated By**: Implementation Team
