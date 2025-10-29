# Immediate Security Fix: Hash Verification Enforcement

**Priority:** CRITICAL  
**File:** `src/lib/client-decryption.ts`  
**Lines:** 140-149  
**Risk:** Can be applied immediately without affecting other systems

---

## The Problem

Hash verification is computed but the result is ignored. Incorrect known values are accepted without error, defeating the purpose of verification.

**Current Code (VULNERABLE):**
```typescript
if (knownValue) {
  // Verify the known value matches the hash
  try {
    const computedHash = await hashWithPrivacySalt(knownValue, userSalt);
    if (computedHash === hashedValue) {
      return knownValue;
    } else {
      console.warn(
        `Hash mismatch for ${fieldName} - known value may be incorrect`
      );
      return knownValue; // ❌ RETURNS ANYWAY - VERIFICATION DEFEATED
    }
  } catch (error) {
    console.error(`Failed to verify hash for ${fieldName}:`, error);
    return knownValue; // ❌ RETURNS ANYWAY - VERIFICATION DEFEATED
  }
}
```

**Security Implications:**
- No protection against data tampering
- Incorrect known values silently accepted
- Hash verification is meaningless
- Silent failures mask security issues

---

## The Fix

**Apply this diff to `src/lib/client-decryption.ts` lines 140-149:**

```typescript
if (knownValue) {
  // Verify the known value matches the hash
  try {
    const computedHash = await hashWithPrivacySalt(knownValue, userSalt);
    if (computedHash === hashedValue) {
      return knownValue;
    } else {
      console.error(
        `Hash verification failed for ${fieldName} - known value is incorrect`
      );
      throw new Error(`Hash verification failed for ${fieldName}`);
    }
  } catch (error) {
    console.error(`Failed to verify hash for ${fieldName}:`, error);
    throw error;
  }
}
```

**Changes:**
1. Line 141: Change `console.warn` to `console.error`
2. Line 143: Change message to indicate failure
3. Line 144: **THROW ERROR** instead of returning incorrect value
4. Line 148: **THROW ERROR** instead of returning incorrect value

---

## Impact Analysis

### What This Fixes

✅ **Security:** Prevents silent acceptance of incorrect data  
✅ **Debugging:** Errors will be caught and logged  
✅ **Data Integrity:** Ensures hash verification is enforced  

### What This Breaks

⚠️ **Potential Issues:**
- If any code relies on receiving incorrect known values, it will now throw
- Components expecting empty strings may now receive errors
- Error handling must be in place in calling code

### Calling Code That Needs Updates

**File:** `src/lib/client-decryption.ts` lines 166-296

**Function:** `decryptUserProfile()`

**Current Implementation:**
```typescript
const [
  username,
  bio,
  display_name,
  picture,
  npub,
  nip05,
  lightning_address,
  encrypted_nsec,
] = await Promise.all([
  decryptField("hashed_username", encryptedData.hashed_username, encryptedData.user_salt, knownValues?.username),
  // ... more fields ...
]);
```

**Required Update:**
Add try-catch to handle decryption errors:

```typescript
try {
  const [
    username,
    bio,
    display_name,
    picture,
    npub,
    nip05,
    lightning_address,
    encrypted_nsec,
  ] = await Promise.all([
    decryptField("hashed_username", encryptedData.hashed_username, encryptedData.user_salt, knownValues?.username),
    // ... more fields ...
  ]);
  
  // ... rest of function ...
} catch (error) {
  console.error("❌ Profile decryption failed:", error);
  throw new Error(
    `Profile decryption failed: ${
      error instanceof Error ? error.message : "Unknown error"
    }`
  );
}
```

---

## Testing the Fix

### Unit Test

```typescript
describe('decryptField with hash verification', () => {
  it('should throw error on hash mismatch', async () => {
    const userSalt = 'test-salt';
    const correctValue = 'correct-value';
    const incorrectValue = 'incorrect-value';
    
    const correctHash = await hashWithPrivacySalt(correctValue, userSalt);
    
    // Should throw when known value doesn't match hash
    await expect(
      decryptField('test_field', correctHash, userSalt, incorrectValue)
    ).rejects.toThrow('Hash verification failed');
  });
  
  it('should return value on hash match', async () => {
    const userSalt = 'test-salt';
    const correctValue = 'correct-value';
    
    const correctHash = await hashWithPrivacySalt(correctValue, userSalt);
    
    // Should return value when hash matches
    const result = await decryptField('test_field', correctHash, userSalt, correctValue);
    expect(result).toBe(correctValue);
  });
});
```

### Integration Test

```typescript
describe('decryptUserProfile with verification', () => {
  it('should throw error if any field verification fails', async () => {
    const encryptedData = {
      id: 'user-123',
      user_salt: 'test-salt',
      hashed_username: 'hash-of-alice',
      // ... other fields ...
    };
    
    const knownValues = {
      username: 'bob', // Wrong value - will fail verification
    };
    
    await expect(
      decryptUserProfile(encryptedData, knownValues)
    ).rejects.toThrow();
  });
});
```

---

## Deployment Steps

1. **Apply the fix** to `src/lib/client-decryption.ts`
2. **Update error handling** in `decryptUserProfile()`
3. **Run unit tests** to verify fix works
4. **Run integration tests** to verify no regressions
5. **Deploy to staging** for E2E testing
6. **Monitor logs** for any verification failures
7. **Deploy to production** with monitoring

---

## Monitoring After Deployment

### Logs to Watch

```
❌ Hash verification failed for hashed_username
❌ Hash verification failed for hashed_bio
❌ Profile decryption failed
```

### Metrics to Track

- Number of hash verification failures
- Number of profile decryption errors
- User impact (login failures, profile display issues)

### Rollback Criteria

If more than 1% of users experience decryption errors:
1. Revert the fix
2. Investigate root cause
3. Determine if known values are missing
4. Plan proper migration strategy

---

## Long-Term Solution

This fix is a **temporary security improvement** while the full migration from hashing to encryption is planned.

**Next Steps:**
1. Implement full encryption for profile fields (see MIGRATION_PLAN_HASHING_TO_ENCRYPTION.md)
2. Remove dependency on known values
3. Remove hashed columns from database
4. Implement proper decryption for all profile data

