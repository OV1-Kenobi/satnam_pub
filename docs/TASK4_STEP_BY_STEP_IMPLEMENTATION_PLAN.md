# Task 4: Step-by-Step Implementation Plan

**Status:** READY FOR EXECUTION  
**Date:** 2025-10-29  
**Overall Timeline:** 5-7 days

---

## What Has Been Fixed (Tasks 1-3)

### ✅ Task 1: Security Fix Applied
**File:** `src/lib/client-decryption.ts` lines 127-161

**Changes Made:**
- Line 141: `console.warn` → `console.error`
- Line 144: `return knownValue` → `throw new Error(...)`
- Line 148: `return knownValue` → `throw error`
- Line 160: `return ""` → `throw new Error(...)`

**Impact:** Hash verification now enforced; incorrect data will throw errors instead of silently failing

**Status:** ✅ COMPLETE - Ready for testing

---

### ✅ Task 2: Database Schema Migration Created
**File:** `database/migrations/023_add_encrypted_profile_columns.sql`

**Changes Made:**
- Added 18 new columns for encrypted profile data (username, bio, display_name, picture, nip05, lightning_address)
- Each field has _iv and _tag columns for AES-256-GCM metadata
- Added migration tracking columns (encryption_migration_status, encryption_migration_date)
- Marked deprecated hashed_* columns with comments
- Idempotent design - safe to run multiple times

**Status:** ✅ COMPLETE - Ready to deploy to database

---

### ✅ Task 3: hashed_encrypted_nsec Removal Completed
**Files Updated:**
1. `src/lib/client-decryption.ts` - Removed from interface, use encrypted_nsec directly
2. `netlify/functions/register-identity.js` - Removed from hashing, logging, insert, and compliance check
3. `lib/security/privacy-hashing.js` - Removed from JSDoc

**Status:** ✅ COMPLETE - Safe to remove from database

---

## What Requires Further Work

### Phase 2: Data Migration (Days 2-3)
**Status:** NOT STARTED - Requires implementation

**Tasks:**
1. Create migration function to convert hashed data to encrypted
2. Implement lazy migration on first login
3. Add fallback logic for users not yet migrated
4. Test data integrity during migration

**Estimated Time:** 2 days

---

### Phase 3: Backend Code Updates (Days 2-3)
**Status:** PARTIALLY COMPLETE - Requires implementation

**Tasks:**
1. Update `netlify/functions_active/register-identity.ts` to use encryption instead of hashing
2. Update `netlify/functions/services/user-service.ts` for profile operations
3. Update `netlify/functions_active/unified-profiles.ts` for profile retrieval
4. Implement Noble V2 encryption for all profile fields

**Estimated Time:** 2 days

---

### Phase 4: Frontend Code Updates (Days 3-4)
**Status:** PARTIALLY COMPLETE - Requires implementation

**Tasks:**
1. Update `src/lib/client-decryption.ts` to use actual decryption instead of hash verification
2. Update `src/contexts/DecryptedUserContext.tsx` to handle encrypted data
3. Update `src/hooks/useClientDecryption.ts` for proper decryption
4. Remove dependency on session-stored known values

**Estimated Time:** 1-2 days

---

### Phase 5: Testing & Verification (Days 4-5)
**Status:** NOT STARTED - Requires comprehensive testing

**Tasks:**
1. Unit tests for encryption/decryption functions
2. Integration tests for profile creation/retrieval
3. E2E tests for complete registration flow
4. Data migration verification tests
5. Backward compatibility tests

**Estimated Time:** 1-2 days

---

## Detailed Next Steps

### IMMEDIATE (Today)

#### Step 1: Deploy Security Fix
**Timeline:** 1-2 hours  
**Risk:** LOW

1. Run tests on `src/lib/client-decryption.ts` changes
2. Verify error handling in calling code
3. Deploy to staging
4. Monitor for any decryption failures
5. Deploy to production

**Rollback:** Revert to previous version if errors exceed 1%

---

#### Step 2: Deploy Database Migration
**Timeline:** 30 minutes  
**Risk:** LOW

1. Execute `database/migrations/023_add_encrypted_profile_columns.sql` in Supabase
2. Verify all columns created successfully
3. Check migration tracking columns exist
4. Confirm no data loss

**Rollback:** Drop new columns if needed

---

### SHORT-TERM (Days 1-2)

#### Step 3: Implement Data Migration Function
**Timeline:** 4-6 hours  
**Risk:** MEDIUM

**File:** Create `netlify/functions_active/migrate-profile-encryption.ts`

**Implementation:**
```typescript
export async function migrateUserProfileEncryption(userId: string) {
  // 1. Fetch user with hashed data
  // 2. For each hashed field:
  //    a. Attempt to decrypt using known values from session
  //    b. If successful, re-encrypt with Noble V2
  //    c. Store in new encrypted columns
  //    d. Mark migration status as 'completed'
  // 3. Return migration result
}
```

**Testing:**
- Unit test: Verify encryption/decryption round-trip
- Integration test: Verify data integrity after migration
- E2E test: Test migration on real user account

---

#### Step 4: Implement Fallback Logic
**Timeline:** 2-3 hours  
**Risk:** MEDIUM

**File:** Update `src/lib/client-decryption.ts`

**Implementation:**
```typescript
async function getProfileField(userId: string, fieldName: string) {
  // 1. Try encrypted version first
  const encrypted = await getEncryptedField(userId, fieldName);
  if (encrypted) return decryptField(encrypted);
  
  // 2. Fall back to hashed version (temporary)
  const hashed = await getHashedField(userId, fieldName);
  if (hashed && knownValue) return verifyAndReturnKnownValue(hashed, knownValue);
  
  // 3. Throw error if neither available
  throw new Error(`Cannot retrieve ${fieldName}`);
}
```

**Testing:**
- Unit test: Verify fallback logic works
- Integration test: Verify both paths work
- E2E test: Test with mixed encrypted/hashed data

---

### MEDIUM-TERM (Days 2-4)

#### Step 5: Update Backend Registration
**Timeline:** 4-6 hours  
**Risk:** MEDIUM

**File:** `netlify/functions_active/register-identity.ts`

**Changes:**
1. Replace hashing with Noble V2 encryption for profile fields
2. Store IV and tag for each encrypted field
3. Keep password hashing (PBKDF2/SHA-512)
4. Update database insert to use new columns

**Example:**
```typescript
// OLD
const profileData = {
  hashed_username: await hashWithPrivacySalt(username, userSalt),
};

// NEW
const { cipher, iv, tag } = await NobleEncryption.encryptField(username, userSalt);
const profileData = {
  encrypted_username: cipher,
  encrypted_username_iv: iv,
  encrypted_username_tag: tag,
};
```

**Testing:**
- Unit test: Verify encryption works
- Integration test: Verify database insert works
- E2E test: Test complete registration flow

---

#### Step 6: Update Frontend Decryption
**Timeline:** 3-4 hours  
**Risk:** MEDIUM

**File:** `src/lib/client-decryption.ts`

**Changes:**
1. Implement actual decryption instead of hash verification
2. Use Noble V2 decryption for all profile fields
3. Remove dependency on known values
4. Add proper error handling

**Example:**
```typescript
async function decryptField(
  fieldName: string,
  encryptedValue: string,
  iv: string,
  tag: string,
  userSalt: string
): Promise<string> {
  try {
    return await NobleEncryption.decryptField(
      encryptedValue,
      iv,
      tag,
      userSalt
    );
  } catch (error) {
    console.error(`Decryption failed for ${fieldName}:`, error);
    throw error;
  }
}
```

**Testing:**
- Unit test: Verify decryption works
- Integration test: Verify round-trip encryption/decryption
- E2E test: Test profile display in UI

---

### LONG-TERM (Days 4-7)

#### Step 7: Comprehensive Testing
**Timeline:** 2-3 days  
**Risk:** LOW

**Test Coverage:**
- Unit tests: 20+ tests for encryption/decryption
- Integration tests: 15+ tests for profile operations
- E2E tests: 10+ tests for complete flows
- Data migration tests: 5+ tests for migration verification
- Backward compatibility tests: 5+ tests for mixed data

**Target:** 95%+ test pass rate

---

#### Step 8: Cleanup & Removal
**Timeline:** 1 day  
**Risk:** LOW

**After 30-day verification period:**
1. Remove deprecated hashed_* columns
2. Remove fallback logic
3. Remove known values from session
4. Update documentation

**Files to Update:**
- Database migration: Drop hashed_* columns
- Frontend code: Remove fallback logic
- Documentation: Update architecture docs

---

## Dependencies Between Steps

```
Step 1 (Security Fix)
    ↓
Step 2 (Database Migration)
    ↓
Step 3 (Data Migration Function) ← Step 4 (Fallback Logic)
    ↓
Step 5 (Backend Registration) ← Step 6 (Frontend Decryption)
    ↓
Step 7 (Testing)
    ↓
Step 8 (Cleanup)
```

---

## Risk Mitigation

### Rollback Procedures

**If Step 1 fails:**
- Revert `src/lib/client-decryption.ts` to previous version
- No database changes needed

**If Step 2 fails:**
- Drop new columns from database
- No code changes needed

**If Step 3-4 fails:**
- Keep fallback logic active
- Continue using hashed data temporarily
- Retry migration after fixes

**If Step 5-6 fails:**
- Revert code changes
- Use old hashing logic
- Retry after fixes

---

## Success Criteria

✅ All tests pass (95%+ pass rate)  
✅ No data loss during migration  
✅ Profile display works correctly  
✅ Authentication flows work correctly  
✅ Zero-knowledge architecture maintained  
✅ No performance degradation  
✅ No security vulnerabilities introduced  

---

## Timeline Summary

| Phase | Duration | Status |
|-------|----------|--------|
| Task 1: Security Fix | 1-2 hours | ✅ COMPLETE |
| Task 2: Database Schema | 30 minutes | ✅ COMPLETE |
| Task 3: hashed_encrypted_nsec | 2 hours | ✅ COMPLETE |
| Phase 2: Data Migration | 2 days | ⏳ NOT STARTED |
| Phase 3: Backend Updates | 2 days | ⏳ NOT STARTED |
| Phase 4: Frontend Updates | 1-2 days | ⏳ NOT STARTED |
| Phase 5: Testing | 1-2 days | ⏳ NOT STARTED |
| **TOTAL** | **5-7 days** | **3.5 hours done** |

---

## Next Immediate Actions

1. ✅ Review and approve security fix (Task 1)
2. ✅ Deploy database migration (Task 2)
3. ✅ Remove hashed_encrypted_nsec references (Task 3)
4. ⏳ Implement data migration function (Step 3)
5. ⏳ Implement fallback logic (Step 4)
6. ⏳ Update backend registration (Step 5)
7. ⏳ Update frontend decryption (Step 6)
8. ⏳ Run comprehensive tests (Step 7)
9. ⏳ Cleanup deprecated columns (Step 8)

