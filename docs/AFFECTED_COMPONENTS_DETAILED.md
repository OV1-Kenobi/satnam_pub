# Detailed Affected Components Analysis

## Database Schema

### user_identities Table (PRIMARY IMPACT)

**Current Schema:**
```sql
CREATE TABLE user_identities (
  id TEXT PRIMARY KEY,                    -- DUID
  user_salt TEXT NOT NULL UNIQUE,         -- Per-user salt
  
  -- HASHED FIELDS (SHOULD BE ENCRYPTED)
  hashed_username TEXT NOT NULL,
  hashed_bio TEXT DEFAULT '',
  hashed_display_name TEXT,
  hashed_picture TEXT DEFAULT '',
  hashed_nip05 TEXT,
  hashed_lightning_address TEXT,
  
  -- ENCRYPTED NSEC (CORRECT - but has hashed version too)
  encrypted_nsec TEXT,
  hashed_encrypted_nsec TEXT,             -- REDUNDANT - should remove
  
  -- PASSWORD (CORRECT - should remain hashed)
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL UNIQUE,
  
  -- METADATA
  role TEXT,
  spending_limits JSONB,
  privacy_settings JSONB,
  is_active BOOLEAN,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

**Migration Required:**
- Convert `hashed_*` columns to `encrypted_*` columns
- Add encryption IV and tag columns for AES-GCM
- Remove `hashed_encrypted_nsec` (redundant)
- Maintain `password_hash` and `password_salt` (correct)

### privacy_users Table (SECONDARY IMPACT)

Uses `hashed_uuid` as primary key - this is CORRECT for privacy (not displayable).

### family_members Table (SECONDARY IMPACT)

May store hashed member identifiers - review needed.

---

## Backend Functions

### register-identity.ts (CRITICAL)

**File:** `netlify/functions_active/register-identity.ts`

**Lines 695-710 - Profile Creation:**
```typescript
const profileData = {
  id: deterministicUserId,
  user_salt: userSalt,
  encrypted_nsec: encryptedNsecNoble,
  
  // HASHED COLUMNS - NEED CONVERSION
  hashed_username: hashedUsername,
  hashed_npub: hashedUserData.hashed_npub,
  hashed_nip05: hashedUserData.hashed_nip05,
  hashed_lightning_address: hashedLightningAddress,
  // ... more hashed fields
};
```

**Required Changes:**
- Replace hashing with encryption for displayable fields
- Use Noble V2 encryption (AES-256-GCM)
- Store IV and tag for decryption
- Keep password hashing (PBKDF2/SHA-512)

### user-service.ts (SECONDARY)

**File:** `netlify/functions/services/user-service.ts`

**Lines 157-260 - User Profile Operations:**
- Uses `hashIdentifier()` for npub and nip05
- Should use encryption instead
- Affects upsertUser() and related methods

---

## Frontend Components

### client-decryption.ts (CRITICAL)

**File:** `src/lib/client-decryption.ts`

**Issues:**
1. Lines 127-161: `decryptField()` function attempts to "decrypt" hashes
2. Lines 140-149: Hash verification not enforced (SECURITY FLAW)
3. Lines 160: Returns empty strings when no known value available
4. Lines 166-296: `decryptUserProfile()` relies on knownValues parameter

**Required Changes:**
1. Implement actual decryption instead of hash verification
2. Enforce verification errors (throw on mismatch)
3. Remove dependency on session-stored known values
4. Use Noble V2 decryption for all profile fields

### DecryptedUserContext.tsx (SECONDARY)

**File:** `src/contexts/DecryptedUserContext.tsx`

**Impact:**
- Provides decrypted user data to components
- Currently passes empty strings for missing known values
- Will work correctly once client-decryption.ts is fixed

### useClientDecryption.ts (SECONDARY)

**File:** `src/hooks/useClientDecryption.ts`

**Impact:**
- Fetches encrypted profile from database
- Calls `decryptUserProfile()` with known values
- Will work correctly once decryption is implemented

### useUserDisplayData() Hook (SECONDARY)

**File:** `src/contexts/DecryptedUserContext.tsx` lines 230-242

**Current Implementation:**
```typescript
export function useUserDisplayData() {
  const { user } = useDecryptedUser();
  return {
    username: user?.username || '',           // Empty if not in known values
    displayName: user?.display_name || '',    // Empty if not in known values
    bio: user?.bio || '',                     // Empty if not in known values
    picture: user?.picture || '',             // Empty if not in known values
    nip05: user?.nip05 || '',                 // Empty if not in known values
    lightningAddress: user?.lightning_address || '',
    isActive: user?.is_active || false
  };
}
```

**Will be fixed** once encryption is implemented.

---

## Type Definitions

### user-identities-auth.ts (SECONDARY)

**File:** `src/lib/auth/user-identities-auth.ts` lines 89-110

**Current Types:**
```typescript
export interface UserIdentity {
  id: string;
  user_salt: string;
  encrypted_nsec?: string;
  
  // HASHED COLUMNS - NEED TYPE UPDATES
  hashed_username?: string;
  hashed_npub?: string;
  hashed_nip05?: string;
  hashed_lightning_address?: string;
  
  password_hash: string;
  password_salt: string;
}
```

**Required Changes:**
- Replace `hashed_*` with `encrypted_*`
- Add IV and tag fields for AES-GCM
- Update JSDoc comments

---

## Data Migration Strategy

### Phase 1: Database Schema
1. Create new encrypted columns
2. Add IV and tag columns
3. Keep old hashed columns temporarily

### Phase 2: Data Migration
1. For each user, decrypt hashed values using known values
2. Re-encrypt with Noble V2
3. Store in new encrypted columns
4. Verify migration success

### Phase 3: Code Updates
1. Update register-identity.ts
2. Update client-decryption.ts
3. Update type definitions
4. Update frontend components

### Phase 4: Cleanup
1. Remove old hashed columns
2. Remove known values from session
3. Update documentation

---

## Testing Requirements

- Unit tests for encryption/decryption
- Integration tests for profile creation/retrieval
- E2E tests for user registration flow
- Data migration verification tests
- Backward compatibility tests (if needed)

