# Code Comparison: Before and After

---

## Issue #2: Hash Verification Not Enforced

### BEFORE (VULNERABLE)

**File:** `src/lib/client-decryption.ts` lines 127-161

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
        return knownValue; // ❌ RETURNS ANYWAY - VERIFICATION DEFEATED
      }
    } catch (error) {
      console.error(`Failed to verify hash for ${fieldName}:`, error);
      return knownValue; // ❌ RETURNS ANYWAY - VERIFICATION DEFEATED
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

### AFTER (SECURE)

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
        throw new Error(`Hash verification failed for ${fieldName}`); // ✅ THROW ERROR
      }
    } catch (error) {
      console.error(`Failed to verify hash for ${fieldName}:`, error);
      throw error; // ✅ THROW ERROR
    }
  }

  // CRITICAL: Hashed data cannot be decrypted without the original value
  // Throw error instead of returning empty string
  console.error(
    `Cannot decrypt hashed field ${fieldName} without known value. ` +
      `Hashed data is one-way and requires the original value from user input.`
  );

  throw new Error(`Cannot decrypt hashed field ${fieldName}`); // ✅ THROW ERROR
}
```

**Changes:**
1. Line 141: `console.warn` → `console.error`
2. Line 144: `return knownValue` → `throw new Error(...)`
3. Line 148: `return knownValue` → `throw error`
4. Line 160: `return ""` → `throw new Error(...)`

---

## Issue #1: Hashing to Encryption Conversion

### BEFORE (HASHED - BROKEN)

**File:** `netlify/functions_active/register-identity.ts` lines 695-710

```typescript
// HASHED COLUMNS ONLY - MAXIMUM ENCRYPTION COMPLIANCE
const profileData = {
  id: deterministicUserId,
  user_salt: userSalt,
  
  // HASHED PROFILE DATA (ONE-WAY - CANNOT DISPLAY)
  hashed_username: hashedUsername,
  hashed_bio: hashedBio,
  hashed_display_name: hashedDisplayName,
  hashed_picture: hashedPicture,
  hashed_npub: hashedUserData.hashed_npub,
  hashed_nip05: hashedUserData.hashed_nip05,
  hashed_lightning_address: hashedLightningAddress,
  
  // ENCRYPTED NSEC (CORRECT)
  encrypted_nsec: encryptedNsecNoble,
  
  // REDUNDANT HASHED VERSION (SHOULD REMOVE)
  hashed_encrypted_nsec: hashedEncryptedNsec,
};
```

### AFTER (ENCRYPTED - CORRECT)

```typescript
// ENCRYPTED COLUMNS - REVERSIBLE FOR DISPLAY
const profileData = {
  id: deterministicUserId,
  user_salt: userSalt,
  
  // ENCRYPTED PROFILE DATA (REVERSIBLE - CAN DISPLAY)
  encrypted_username: encryptedUsername,
  encrypted_username_iv: usernameIv,
  encrypted_username_tag: usernameTag,
  
  encrypted_bio: encryptedBio,
  encrypted_bio_iv: bioIv,
  encrypted_bio_tag: bioTag,
  
  encrypted_display_name: encryptedDisplayName,
  encrypted_display_name_iv: displayNameIv,
  encrypted_display_name_tag: displayNameTag,
  
  encrypted_picture: encryptedPicture,
  encrypted_picture_iv: pictureIv,
  encrypted_picture_tag: pictureTag,
  
  encrypted_nip05: encryptedNip05,
  encrypted_nip05_iv: nip05Iv,
  encrypted_nip05_tag: nip05Tag,
  
  encrypted_lightning_address: encryptedLightningAddress,
  encrypted_lightning_address_iv: lightningAddressIv,
  encrypted_lightning_address_tag: lightningAddressTag,
  
  // ENCRYPTED NSEC (CORRECT - KEEP)
  encrypted_nsec: encryptedNsecNoble,
  
  // REMOVE REDUNDANT HASHED VERSION
  // hashed_encrypted_nsec: REMOVED
};
```

---

## Client-Side Decryption

### BEFORE (HASH VERIFICATION)

**File:** `src/lib/client-decryption.ts` lines 166-296

```typescript
export async function decryptUserProfile(
  encryptedData: EncryptedUserData,
  knownValues?: Partial<{
    username: string;
    bio: string;
    display_name: string;
    picture: string;
    npub: string;
    nip05: string;
    lightning_address: string;
  }>
): Promise<DecryptedUserProfile> {
  // ... cache check ...
  
  try {
    // Decrypt all encrypted fields
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
      decryptField(
        "hashed_username",
        encryptedData.hashed_username,
        encryptedData.user_salt,
        knownValues?.username  // ❌ REQUIRES KNOWN VALUE
      ),
      // ... more fields with known values ...
    ]);
    
    // ... rest of function ...
  } catch (error) {
    console.error("❌ Profile decryption failed:", error);
    throw error;
  }
}
```

### AFTER (ACTUAL DECRYPTION)

```typescript
export async function decryptUserProfile(
  encryptedData: EncryptedUserData
): Promise<DecryptedUserProfile> {
  // ... cache check ...
  
  try {
    // Decrypt all encrypted fields
    const [
      username,
      bio,
      display_name,
      picture,
      nip05,
      lightning_address,
      encrypted_nsec,
    ] = await Promise.all([
      decryptField(
        "encrypted_username",
        encryptedData.encrypted_username,
        encryptedData.encrypted_username_iv,
        encryptedData.encrypted_username_tag,
        encryptedData.user_salt
        // ✅ NO KNOWN VALUE NEEDED
      ),
      decryptField(
        "encrypted_bio",
        encryptedData.encrypted_bio,
        encryptedData.encrypted_bio_iv,
        encryptedData.encrypted_bio_tag,
        encryptedData.user_salt
      ),
      // ... more fields without known values ...
    ]);
    
    // ... rest of function ...
  } catch (error) {
    console.error("❌ Profile decryption failed:", error);
    throw error;
  }
}
```

---

## Type Definitions

### BEFORE (HASHED)

**File:** `src/lib/auth/user-identities-auth.ts` lines 89-110

```typescript
export interface UserIdentity {
  id: string;
  user_salt: string;
  
  // HASHED COLUMNS (ONE-WAY)
  hashed_username?: string;
  hashed_bio?: string;
  hashed_display_name?: string;
  hashed_picture?: string;
  hashed_npub?: string;
  hashed_nip05?: string;
  hashed_lightning_address?: string;
  
  // ENCRYPTED NSEC (CORRECT)
  encrypted_nsec?: string;
  hashed_encrypted_nsec?: string; // REDUNDANT
  
  // PASSWORD (CORRECT)
  password_hash: string;
  password_salt: string;
}
```

### AFTER (ENCRYPTED)

```typescript
export interface UserIdentity {
  id: string;
  user_salt: string;
  
  // ENCRYPTED COLUMNS (REVERSIBLE)
  encrypted_username?: string;
  encrypted_username_iv?: string;
  encrypted_username_tag?: string;
  
  encrypted_bio?: string;
  encrypted_bio_iv?: string;
  encrypted_bio_tag?: string;
  
  encrypted_display_name?: string;
  encrypted_display_name_iv?: string;
  encrypted_display_name_tag?: string;
  
  encrypted_picture?: string;
  encrypted_picture_iv?: string;
  encrypted_picture_tag?: string;
  
  encrypted_nip05?: string;
  encrypted_nip05_iv?: string;
  encrypted_nip05_tag?: string;
  
  encrypted_lightning_address?: string;
  encrypted_lightning_address_iv?: string;
  encrypted_lightning_address_tag?: string;
  
  // ENCRYPTED NSEC (CORRECT - KEEP)
  encrypted_nsec?: string;
  
  // PASSWORD (CORRECT - KEEP)
  password_hash: string;
  password_salt: string;
  
  // DEPRECATED - REMOVE AFTER MIGRATION
  hashed_username?: string;
  hashed_bio?: string;
  hashed_display_name?: string;
  hashed_picture?: string;
  hashed_npub?: string;
  hashed_nip05?: string;
  hashed_lightning_address?: string;
  hashed_encrypted_nsec?: string;
}
```

---

## Summary of Changes

| Aspect | Before | After |
|--------|--------|-------|
| **Profile Data** | Hashed (one-way) | Encrypted (reversible) |
| **Display** | Requires known values | Direct decryption |
| **Verification** | Computed but ignored | Enforced with errors |
| **Empty Fields** | Returns empty strings | Throws errors |
| **Security** | Weak (verification ignored) | Strong (enforced) |
| **Architecture** | Broken (hashing for display) | Correct (encryption for display) |

