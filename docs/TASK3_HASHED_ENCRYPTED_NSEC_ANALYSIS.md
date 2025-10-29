# Task 3 Analysis: hashed_encrypted_nsec Column

**Status:** ANALYSIS COMPLETE - SAFE TO REMOVE  
**Date:** 2025-10-29  
**Recommendation:** REMOVE hashed_encrypted_nsec column

---

## Executive Summary

After comprehensive codebase analysis, **hashed_encrypted_nsec is SAFE TO REMOVE**:

✅ **encrypted_nsec column exists and is accessible** in all necessary contexts  
✅ **No authentication or verification flows depend on hashed version**  
✅ **All references can be safely migrated to use encrypted_nsec**  
✅ **Migration already partially implemented** in existing migrations  

---

## Findings

### 1. Column Usage Analysis

#### Current Status in Database
- **hashed_encrypted_nsec:** Deprecated, marked for removal
- **encrypted_nsec:** Active, used for nsec storage
- **Existing migrations:** Already plan to drop hashed_encrypted_nsec

**Evidence:**
- `migrations/020_drop_hashed_encrypted_nsec.sql` - Idempotent drop script exists
- `migrations/022_clean_database_reset.sql` - Already removes hashed_encrypted_nsec
- `scripts/emergency-schema-fix.sql` - Adds hashed_encrypted_nsec (legacy)

### 2. Code References Found

#### Reference 1: src/lib/client-decryption.ts (TYPE DEFINITION)
**File:** `src/lib/client-decryption.ts` lines 18-35  
**Type:** EncryptedUserData interface  
**Usage:** Type definition only, not used for verification  
**Status:** ✅ Can be removed from interface

```typescript
export interface EncryptedUserData {
  // ... other fields ...
  hashed_encrypted_nsec: string;  // ← REMOVE FROM TYPE
  // ... other fields ...
}
```

**Action:** Remove from interface definition

#### Reference 2: src/lib/client-decryption.ts (FUNCTION CALL)
**File:** `src/lib/client-decryption.ts` lines 242-246  
**Usage:** Decrypting hashed_encrypted_nsec field  
**Status:** ✅ Can be removed - encrypted_nsec is already available

```typescript
decryptField(
  "hashed_encrypted_nsec",
  encryptedData.hashed_encrypted_nsec,
  encryptedData.user_salt
),
```

**Action:** Remove this decryptField call - use encrypted_nsec directly

#### Reference 3: netlify/functions/register-identity.js (LEGACY)
**File:** `netlify/functions/register-identity.js` lines 413, 425, 451, 672  
**Usage:** Creating and verifying hashed_encrypted_nsec  
**Status:** ✅ Can be removed - register-identity.ts (TypeScript) doesn't use it

**Lines:**
- Line 413: `hashed_encrypted_nsec: userDataForHashing.encryptedNsec ? hashUserDataNode(...)`
- Line 425: `hasHashedEncryptedNsec: !!hashedUserData.hashed_encrypted_nsec`
- Line 451: `hashed_encrypted_nsec: hashedUserData.hashed_encrypted_nsec`
- Line 672: Privacy compliance check includes hashed_encrypted_nsec

**Action:** Remove from legacy function (register-identity.ts is the active version)

#### Reference 4: api/authenticated/generate-peer-invite.js
**File:** `api/authenticated/generate-peer-invite.js` lines 321-327  
**Usage:** Explicitly removed/deprecated  
**Status:** ✅ Already migrated to use encrypted_nsec

```typescript
// Try simple format first (user salt based)
if (userIdentity.encrypted_nsec && userIdentity.user_salt) {
  const { decryptNsecSimple } = await import('../../src/lib/privacy/encryption.js');
  decryptedNsec = await decryptNsecSimple(userIdentity.encrypted_nsec, userIdentity.user_salt);
}
// Remove password-based path tied to hashed_encrypted_nsec (deprecated)
else {
  throw new Error('No encrypted nsec data found');
}
```

**Action:** No changes needed - already using encrypted_nsec

#### Reference 5: lib/security/privacy-hashing.js (DOCUMENTATION)
**File:** `lib/security/privacy-hashing.js` lines 277  
**Usage:** JSDoc type definition  
**Status:** ✅ Can be removed from documentation

```typescript
* @property {string} [hashed_encrypted_nsec] - Hashed encrypted private key
```

**Action:** Remove from JSDoc

#### Reference 6: netlify/functions/migrations/005_privacy_first_hashing.sql
**File:** `netlify/functions/migrations/005_privacy_first_hashing.sql` line 125  
**Usage:** Comment indicating deprecation  
**Status:** ✅ Already marked as deprecated

```sql
-- DEPRECATED: hashed_encrypted_nsec removed from schema
```

**Action:** No changes needed - already deprecated

#### Reference 7: scripts/security-audit-findings.md (DOCUMENTATION)
**File:** `scripts/security-audit-findings.md` lines 46  
**Usage:** Documentation only  
**Status:** ✅ Can be removed from documentation

**Action:** Update documentation

---

## Verification: encrypted_nsec Availability

### Where encrypted_nsec is Used

1. **register-identity.ts (Active)**
   - Line 702: `encrypted_nsec: encryptedNsecNoble`
   - ✅ Properly encrypted with Noble V2

2. **generate-peer-invite.js**
   - Line 321: `if (userIdentity.encrypted_nsec && userIdentity.user_salt)`
   - ✅ Used for nsec decryption

3. **client-decryption.ts**
   - Line 198: `encrypted_nsec` returned in DecryptedUserProfile
   - ✅ Available for client-side use

4. **Database migrations**
   - `migrations/022_clean_database_reset.sql` lines 198-206
   - ✅ Ensures encrypted_nsec column exists

### Conclusion
✅ **encrypted_nsec is available and accessible in all necessary contexts**

---

## Security Verification

### Authentication/Verification Flows
- ✅ No authentication flows depend on hashed_encrypted_nsec
- ✅ No verification flows use hashed version for security purposes
- ✅ All security-critical operations use encrypted_nsec
- ✅ Password-based path already removed (see generate-peer-invite.js line 325)

### Zero-Knowledge Architecture
- ✅ Removing hashed_encrypted_nsec maintains zero-knowledge principles
- ✅ encrypted_nsec provides proper encryption (AES-256-GCM with Noble V2)
- ✅ No plaintext nsec exposure

---

## Recommendation: SAFE TO REMOVE

### Files to Update

1. **src/lib/client-decryption.ts**
   - Remove `hashed_encrypted_nsec: string;` from EncryptedUserData interface
   - Remove decryptField call for hashed_encrypted_nsec (lines 242-246)
   - Update DecryptedUserProfile to use encrypted_nsec directly

2. **netlify/functions/register-identity.js** (Legacy - Optional)
   - Remove hashed_encrypted_nsec creation (line 413)
   - Remove from logging (line 425)
   - Remove from insert (line 451)
   - Remove from privacy compliance check (line 672)
   - Note: This is legacy code; register-identity.ts is the active version

3. **lib/security/privacy-hashing.js**
   - Remove hashed_encrypted_nsec from JSDoc (line 277)

4. **scripts/security-audit-findings.md**
   - Remove hashed_encrypted_nsec from documentation

5. **Database Migration**
   - Include in migration 023_add_encrypted_profile_columns.sql
   - Already planned in migrations/020_drop_hashed_encrypted_nsec.sql

---

## Migration Steps

### Phase 1: Code Updates (This Task)
1. Update src/lib/client-decryption.ts
2. Update netlify/functions/register-identity.js (legacy)
3. Update documentation files

### Phase 2: Database Migration
- Already implemented in migrations/020_drop_hashed_encrypted_nsec.sql
- Can be executed independently

### Phase 3: Verification
- Test profile creation with new code
- Verify nsec decryption works with encrypted_nsec
- Confirm no regressions in authentication flows

---

## Risk Assessment

**Risk Level:** ✅ LOW

- No active code depends on hashed_encrypted_nsec
- encrypted_nsec is fully functional replacement
- Migration already partially implemented
- No breaking changes to authentication flows
- Can be rolled back if needed

---

## Conclusion

**hashed_encrypted_nsec is SAFE TO REMOVE**

All references can be safely migrated to use encrypted_nsec instead. The column is deprecated, not used for security purposes, and has a proper replacement in place.

