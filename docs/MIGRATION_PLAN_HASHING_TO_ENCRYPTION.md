# Migration Plan: Hashing to Encryption for User Profile Data

**Status:** DRAFT - REQUIRES APPROVAL BEFORE IMPLEMENTATION  
**Estimated Timeline:** 3-5 days  
**Risk Level:** HIGH - Affects core authentication and profile display

---

## Phase 1: Database Schema Migration (Day 1)

### Step 1.1: Create New Encrypted Columns

```sql
ALTER TABLE user_identities ADD COLUMN IF NOT EXISTS encrypted_username TEXT;
ALTER TABLE user_identities ADD COLUMN IF NOT EXISTS encrypted_username_iv TEXT;
ALTER TABLE user_identities ADD COLUMN IF NOT EXISTS encrypted_username_tag TEXT;

ALTER TABLE user_identities ADD COLUMN IF NOT EXISTS encrypted_bio TEXT;
ALTER TABLE user_identities ADD COLUMN IF NOT EXISTS encrypted_bio_iv TEXT;
ALTER TABLE user_identities ADD COLUMN IF NOT EXISTS encrypted_bio_tag TEXT;

ALTER TABLE user_identities ADD COLUMN IF NOT EXISTS encrypted_display_name TEXT;
ALTER TABLE user_identities ADD COLUMN IF NOT EXISTS encrypted_display_name_iv TEXT;
ALTER TABLE user_identities ADD COLUMN IF NOT EXISTS encrypted_display_name_tag TEXT;

ALTER TABLE user_identities ADD COLUMN IF NOT EXISTS encrypted_picture TEXT;
ALTER TABLE user_identities ADD COLUMN IF NOT EXISTS encrypted_picture_iv TEXT;
ALTER TABLE user_identities ADD COLUMN IF NOT EXISTS encrypted_picture_tag TEXT;

ALTER TABLE user_identities ADD COLUMN IF NOT EXISTS encrypted_nip05 TEXT;
ALTER TABLE user_identities ADD COLUMN IF NOT EXISTS encrypted_nip05_iv TEXT;
ALTER TABLE user_identities ADD COLUMN IF NOT EXISTS encrypted_nip05_tag TEXT;

ALTER TABLE user_identities ADD COLUMN IF NOT EXISTS encrypted_lightning_address TEXT;
ALTER TABLE user_identities ADD COLUMN IF NOT EXISTS encrypted_lightning_address_iv TEXT;
ALTER TABLE user_identities ADD COLUMN IF NOT EXISTS encrypted_lightning_address_tag TEXT;
```

### Step 1.2: Add Migration Tracking

```sql
ALTER TABLE user_identities ADD COLUMN IF NOT EXISTS encryption_migration_status TEXT 
  DEFAULT 'pending' CHECK (encryption_migration_status IN ('pending', 'in_progress', 'completed', 'failed'));
ALTER TABLE user_identities ADD COLUMN IF NOT EXISTS encryption_migration_date TIMESTAMP;
```

### Step 1.3: Keep Old Columns (Temporary)

- Keep `hashed_*` columns for rollback capability
- Mark as deprecated in comments
- Plan removal after 30-day verification period

---

## Phase 2: Data Migration (Day 2-3)

### Step 2.1: Create Migration Function

```typescript
// netlify/functions_active/migrate-profile-encryption.ts
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

### Step 2.2: Batch Migration Strategy

**Option A: Lazy Migration (Recommended)**
- Migrate on first login after deployment
- Reduces server load
- Allows gradual rollout
- Requires fallback to hashed data during transition

**Option B: Bulk Migration**
- Run migration job for all users
- Requires known values for all users
- May fail for users without known values
- Faster but riskier

**Recommendation:** Use Option A with fallback logic

### Step 2.3: Fallback Logic During Transition

```typescript
async function getProfileField(userId: string, fieldName: string) {
  // 1. Try encrypted version first
  const encrypted = await getEncryptedField(userId, fieldName);
  if (encrypted) return decryptField(encrypted);
  
  // 2. Fall back to hashed version
  const hashed = await getHashedField(userId, fieldName);
  if (hashed && knownValue) return verifyAndReturnKnownValue(hashed, knownValue);
  
  // 3. Return empty string
  return '';
}
```

---

## Phase 3: Backend Code Updates (Day 2-3)

### Step 3.1: Update register-identity.ts

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

### Step 3.2: Update client-decryption.ts

**File:** `src/lib/client-decryption.ts`

**Changes:**
1. Implement actual decryption instead of hash verification
2. Enforce verification errors (throw on failure)
3. Remove dependency on knownValues parameter
4. Update type definitions

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

### Step 3.3: Update Type Definitions

**File:** `src/lib/auth/user-identities-auth.ts`

```typescript
export interface UserIdentity {
  // ... existing fields ...
  
  // ENCRYPTED PROFILE FIELDS
  encrypted_username?: string;
  encrypted_username_iv?: string;
  encrypted_username_tag?: string;
  
  // ... more encrypted fields ...
  
  // DEPRECATED - Remove after migration
  hashed_username?: string;
  hashed_bio?: string;
  // ... etc ...
}
```

---

## Phase 4: Frontend Updates (Day 3-4)

### Step 4.1: Update useClientDecryption Hook

- Remove knownValues parameter
- Implement actual decryption
- Add error handling for decryption failures

### Step 4.2: Update DecryptedUserContext

- Remove session-stored known values
- Implement proper error boundaries
- Add loading states for decryption

### Step 4.3: Update useUserDisplayData Hook

- Remove empty string fallbacks
- Add proper error handling
- Display error messages if decryption fails

---

## Phase 5: Testing & Verification (Day 4-5)

### Step 5.1: Unit Tests
- Test encryption/decryption functions
- Test migration function
- Test fallback logic

### Step 5.2: Integration Tests
- Test profile creation with new encryption
- Test profile retrieval and decryption
- Test migration on existing users

### Step 5.3: E2E Tests
- Test complete registration flow
- Test profile display in UI
- Test profile updates

### Step 5.4: Data Verification
- Verify all users migrated successfully
- Check for any failed migrations
- Validate data integrity

---

## Rollback Strategy

### If Issues Occur:

1. **Before Phase 2:** Revert database schema changes
2. **During Phase 2:** Keep hashed columns, use fallback logic
3. **After Phase 3:** Revert code changes, use old hashed columns
4. **After Phase 4:** Revert frontend changes, use fallback UI

### Rollback Steps:
```bash
# 1. Revert database changes
# 2. Revert code changes
# 3. Clear browser cache
# 4. Restart services
# 5. Monitor for errors
```

---

## Approval Checklist

- [ ] Architecture review approved
- [ ] Security review approved
- [ ] Timeline approved
- [ ] Rollback strategy approved
- [ ] Testing plan approved
- [ ] Data migration strategy approved
- [ ] Communication plan approved

---

## Questions for Stakeholders

1. Should we maintain backward compatibility with hashed data?
2. What's the acceptable downtime for this migration?
3. Should we notify users about the security improvement?
4. Do we need to preserve audit trails during migration?
5. Should we implement gradual rollout or big-bang migration?

