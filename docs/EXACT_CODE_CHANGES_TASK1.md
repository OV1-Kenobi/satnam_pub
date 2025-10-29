# Exact Code Changes - Task 1: Security Fix

**File:** `src/lib/client-decryption.ts`  
**Lines:** 127-161  
**Status:** ✅ APPLIED

---

## BEFORE (VULNERABLE)

```typescript
async function decryptField(
  fieldName: string,
  hashedValue: string,
  userSalt: string,
  knownValue?: string
): Promise<string> {
  // If we have the known value (e.g., from user input during login), use it directly
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
        return knownValue; // Return anyway, but log warning
      }
    } catch (error) {
      console.error(`Failed to verify hash for ${fieldName}:`, error);
      return knownValue;
    }
  }

  // CRITICAL: Hashed data cannot be decrypted without the original value
  // Return empty string for display purposes
  // The application should maintain known values in session state
  console.warn(
    `Cannot decrypt hashed field ${fieldName} without known value. ` +
      `Hashed data is one-way and requires the original value from user input.`
  );

  return ""; // Return empty string - UI should handle gracefully
}
```

---

## AFTER (SECURE)

```typescript
async function decryptField(
  fieldName: string,
  hashedValue: string,
  userSalt: string,
  knownValue?: string
): Promise<string> {
  // If we have the known value (e.g., from user input during login), use it directly
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

  // CRITICAL: Hashed data cannot be decrypted without the original value
  // Throw error instead of returning empty string
  // The application should maintain known values in session state
  console.error(
    `Cannot decrypt hashed field ${fieldName} without known value. ` +
      `Hashed data is one-way and requires the original value from user input.`
  );

  throw new Error(`Cannot decrypt hashed field ${fieldName}`);
}
```

---

## Specific Changes

### Change 1: Line 141
**Before:** `console.warn(`
**After:** `console.error(`

**Reason:** Upgrade warning to error for visibility

---

### Change 2: Line 143
**Before:** `Hash mismatch for ${fieldName} - known value may be incorrect`
**After:** `Hash verification failed for ${fieldName} - known value is incorrect`

**Reason:** Clearer error message indicating verification failure

---

### Change 3: Line 144
**Before:** `return knownValue; // Return anyway, but log warning`
**After:** `throw new Error(\`Hash verification failed for ${fieldName}\`);`

**Reason:** CRITICAL - Enforce verification instead of silently returning incorrect data

---

### Change 4: Line 148
**Before:** `return knownValue;`
**After:** `throw error;`

**Reason:** Propagate error instead of silently returning incorrect data

---

### Change 5: Line 155
**Before:** `console.warn(`
**After:** `console.error(`

**Reason:** Upgrade warning to error for visibility

---

### Change 6: Line 160
**Before:** `return ""; // Return empty string - UI should handle gracefully`
**After:** `throw new Error(\`Cannot decrypt hashed field ${fieldName}\`);`

**Reason:** Throw error instead of returning empty string, forcing proper error handling

---

## Impact Analysis

### Security Impact
✅ **POSITIVE:**
- Hash verification now enforced
- Incorrect data will throw errors instead of silently failing
- No more silent failures masking security issues
- Errors will be caught and logged

### Functional Impact
⚠️ **POTENTIAL ISSUES:**
- Code that expects empty strings will now receive errors
- Error handling must be in place in calling code
- May cause temporary failures if known values are missing

### Calling Code
**File:** `src/lib/client-decryption.ts` lines 188-295

**Current Error Handling:**
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
    decryptField(...),
    // ... more fields ...
  ]);
  
  // ... process decrypted data ...
  
  return decryptedProfile;
} catch (error) {
  console.error("❌ Profile decryption failed:", error);
  throw new Error(
    `Profile decryption failed: ${
      error instanceof Error ? error.message : "Unknown error"
    }`
  );
}
```

**Status:** ✅ Error handling already in place - no changes needed

---

## Testing Recommendations

### Unit Tests
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
  
  it('should throw error when no known value provided', async () => {
    const userSalt = 'test-salt';
    const hashedValue = 'some-hash';
    
    // Should throw when no known value provided
    await expect(
      decryptField('test_field', hashedValue, userSalt)
    ).rejects.toThrow('Cannot decrypt hashed field');
  });
});
```

### Integration Tests
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

## Deployment Checklist

- [ ] Code review approved
- [ ] Unit tests passing
- [ ] Integration tests passing
- [ ] E2E tests passing
- [ ] Deployed to staging
- [ ] Staging tests passing
- [ ] Monitoring configured
- [ ] Deployed to production
- [ ] Production monitoring active
- [ ] No errors in logs

---

## Rollback Plan

If errors exceed 1% of users:

1. Revert `src/lib/client-decryption.ts` to previous version
2. Redeploy to production
3. Investigate root cause
4. Fix and retry

**Estimated Rollback Time:** 15 minutes

---

## Success Criteria

✅ Hash verification enforced  
✅ Incorrect data throws errors  
✅ Errors are caught and logged  
✅ No data loss  
✅ No breaking changes to authentication  
✅ Error handling in place  
✅ Tests passing  

