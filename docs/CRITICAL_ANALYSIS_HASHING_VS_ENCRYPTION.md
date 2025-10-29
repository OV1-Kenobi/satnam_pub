# CRITICAL ANALYSIS: Hashing vs Encryption Architectural Flaw

**Status:** REQUIRES IMMEDIATE REVIEW AND APPROVAL BEFORE IMPLEMENTATION  
**Severity:** CRITICAL - Affects core data architecture and security model  
**Date:** 2025-10-29

---

## Executive Summary

The codebase has a fundamental architectural flaw: **displayable user profile data is hashed instead of encrypted**. This violates cryptographic principles and creates a broken system where:

1. **Hashing is one-way** - cannot be reversed to display data to users
2. **Current workaround** - maintains "known values" in session memory, which defeats the purpose of hashing
3. **Security gap** - hash verification is not enforced (Issue #2 below)
4. **UX problem** - empty strings displayed when known values aren't available

---

## ISSUE #1: Architectural Flaw - Hashing vs Encryption

### The Problem

**Current Implementation:**
- User profile fields stored as HASHES: `hashed_username`, `hashed_bio`, `hashed_display_name`, `hashed_picture`, `hashed_nip05`, `hashed_lightning_address`, `hashed_encrypted_nsec`
- These are one-way hashes using `hashWithPrivacySalt()` (PBKDF2-SHA256)
- Cannot be reversed to display to users
- Workaround: Store plaintext in session memory as "known values"

**Why This Is Wrong:**
- Hashing is for **verification only** (passwords, authentication tokens)
- Encryption is for **reversible data** (profile info that needs display)
- Current approach stores plaintext anyway (in session), defeating hashing purpose
- Violates zero-knowledge architecture principles

### Affected Database Tables

1. **user_identities** (PRIMARY)
   - `hashed_username` - should be encrypted
   - `hashed_bio` - should be encrypted
   - `hashed_display_name` - should be encrypted
   - `hashed_picture` - should be encrypted
   - `hashed_nip05` - should be encrypted
   - `hashed_lightning_address` - should be encrypted
   - `hashed_encrypted_nsec` - SPECIAL CASE (see below)

2. **privacy_users** (SECONDARY)
   - Uses hashed identifiers for privacy
   - May need review for displayable vs verification fields

3. **family_members** (SECONDARY)
   - May store hashed member names/identifiers

### Affected Netlify Functions

- `register-identity.ts` - Creates hashed profile data
- `register-identity.js` - Legacy version
- `unified-profiles.ts` - Retrieves and displays profiles
- `user-service.ts` - User profile operations

### Affected Frontend Components

- `src/lib/client-decryption.ts` - Attempts to "decrypt" hashes using known values
- `src/contexts/DecryptedUserContext.tsx` - Provides decrypted user data
- `src/hooks/useClientDecryption.ts` - Fetches and decrypts profiles
- `useUserDisplayData()` hook - Returns empty strings for missing known values

---

## ISSUE #2: Critical Security Flaw - Hash Verification Not Enforced

### The Problem

**Location:** `src/lib/client-decryption.ts` lines 140-149

```typescript
if (computedHash === hashedValue) {
  return knownValue;
} else {
  console.warn(`Hash mismatch for ${fieldName} - known value may be incorrect`);
  return knownValue; // ❌ RETURNS ANYWAY - VERIFICATION DEFEATED
}
```

**Security Implications:**
- Hash verification is computed but ignored
- Incorrect known values accepted without error
- Silent failures mask security issues
- No protection against data tampering

### Required Fix

```typescript
if (computedHash === hashedValue) {
  return knownValue;
} else {
  console.error(`Hash verification failed for ${fieldName}`);
  throw new Error(`Hash verification failed for ${fieldName}`);
}
```

---

## ISSUE #3: UX Problem - Empty Strings Without Known Values

When no `knownValue` is provided, function returns empty strings, causing blank UI fields.

**Root Cause:** Symptom of Issue #1 (using hashing instead of encryption)

**Solution:** With proper encryption, data can be decrypted using keys without requiring session-stored known values.

---

## Affected Code Locations

### Database Migrations
- `database/privacy-first-identity-system-migration.sql`
- `database/unified-user-table-migration.sql`
- `scripts/emergency-schema-fix.sql`
- `database/migrations/profile_visibility_schema.sql`

### Backend Functions
- `netlify/functions_active/register-identity.ts` (lines 695-710)
- `netlify/functions/register-identity.js` (lines 398-450)
- `netlify/functions/services/user-service.ts` (lines 157-260)

### Frontend Code
- `src/lib/client-decryption.ts` (entire file)
- `src/contexts/DecryptedUserContext.tsx`
- `src/hooks/useClientDecryption.ts`
- `lib/security/privacy-hashing.js`

### Type Definitions
- `src/lib/auth/user-identities-auth.ts` (lines 89-110)

---

## Recommended Architecture

### Encryption vs Hashing Classification

**ENCRYPT (Reversible - for display):**
- username
- display_name
- bio
- picture
- nip05
- lightning_address

**HASH (One-way - for verification only):**
- password (PBKDF2/SHA-512)
- authentication tokens
- session identifiers

**SPECIAL CASE - encrypted_nsec:**
- Currently hashed, but should remain encrypted (already is with Noble V2)
- Remove hashed version, keep only encrypted version

---

## Next Steps

1. **IMMEDIATE:** Apply security fix to `client-decryption.ts` (Issue #2)
2. **REVIEW:** Present this analysis for approval
3. **PLAN:** Draft detailed migration plan covering:
   - Database schema changes
   - Backend updates
   - Frontend changes
   - Data migration strategy
   - Backward compatibility
4. **IMPLEMENT:** Execute migration after approval

---

## Questions for Review

1. Should we maintain backward compatibility with existing hashed data?
2. What's the timeline for this migration?
3. Should we use Noble V2 encryption for all profile fields?
4. How should we handle existing user data during migration?

