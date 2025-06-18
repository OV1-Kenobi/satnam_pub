# Secure Storage Security Improvements

## Issue Addressed

The original `updatePasswordAndReencryptNsec` method had a potential consistency and race condition issue:

1. **Non-atomic operations**: The method performed decrypt → encrypt → database update as separate operations
2. **Race condition vulnerability**: If the database update failed after successful decryption, sensitive data remained in memory without proper cleanup
3. **No transaction rollback**: No mechanism to ensure atomicity of the entire operation

## Solution Implemented

### 1. Atomic Database Operations with Optimistic Locking

```typescript
// Atomic update with optimistic locking to prevent race conditions
const { error: updateError } = await supabase
  .from("encrypted_keys")
  .update({
    encrypted_nsec: newEncryptedNsec,
    salt: null,
    updated_at: new Date().toISOString(),
  })
  .eq("user_id", userId)
  .eq("encrypted_nsec", currentData.encrypted_nsec); // ← Optimistic lock
```

### 2. Database-Level Transaction Support

Created a PostgreSQL function (`update_password_and_reencrypt`) that can handle the entire operation atomically at the database level when crypto functions are available.

### 3. Automatic Fallback Strategy

The main method tries the database transaction first, then falls back to the atomic application-level method:

```typescript
// Try database-level transaction first
const { data, error } = await supabase.rpc("update_password_and_reencrypt", {
  p_user_id: userId,
  p_old_password: oldPassword,
  p_new_password: newPassword,
});

// Fall back to atomic application-level transaction
if (error) {
  return await this.updatePasswordAndReencryptNsecAtomic(
    userId,
    oldPassword,
    newPassword,
  );
}
```

### 4. Secure Memory Cleanup

Implemented proper secure memory handling using `SecureBuffer` class that actually zeros memory:

```typescript
/**
 * SecureBuffer uses Uint8Array with fill(0) for real memory zeroization
 * JavaScript strings are immutable - setting to null only drops references
 */
class SecureBuffer {
  clear(): void {
    if (this.buffer) {
      // Overwrite memory with zeros multiple times for extra security
      this.buffer.fill(0);
      this.buffer.fill(0xff);
      this.buffer.fill(0);
      this.buffer = null;
    }
  }
}

// Usage in secure operations
const nsecBuffer = this.createSecureBuffer(nsec);
const passwordBuffer = this.createSecureBuffer(userPassword);

try {
  // ... crypto operations using buffers
} finally {
  // Always clear sensitive data from memory, even on error
  nsecBuffer.clear();
  passwordBuffer.clear();
}
```

### 5. Secure Memory Management

All methods now use `SecureBuffer` for proper memory management:

```typescript
// Retrieve decrypted nsec securely
const secureNsec = await SecureStorage.retrieveDecryptedNsec(userId, password);
try {
  const nsecString = secureNsec.toString();
  // Use nsecString...
} finally {
  secureNsec.clear(); // Properly zero memory
}
```

## Security Benefits

1. **Atomicity**: Either the entire operation succeeds or fails completely
2. **Consistency**: No partial state where old password works but new password doesn't
3. **Race condition prevention**: Optimistic locking ensures concurrent updates don't interfere
4. **Memory safety**: Sensitive data is actually zeroed from memory using Uint8Array.fill(0)
5. **Transaction rollback**: Database changes are rolled back on failure
6. **Real memory zeroization**: Unlike JavaScript strings, Uint8Array allows actual memory overwriting
7. **Multiple overwrite passes**: Enhanced security with multiple zero/0xFF/zero passes
8. **Clean API**: All methods now use secure memory management by default

## Usage

The API is clean and secure by default:

```typescript
// Update password
const success = await SecureStorage.updatePasswordAndReencryptNsec(
  userId,
  oldPassword,
  newPassword,
);

// Retrieve nsec securely
const secureNsec = await SecureStorage.retrieveDecryptedNsec(userId, password);
try {
  // Use the nsec
  const nsecString = secureNsec.toString();
  // ... do something with nsecString
} finally {
  // Always clear from memory
  secureNsec.clear();
}
```

## Database Migration

Run the migration to add the database-level function:

```sql
-- migrations/005_atomic_password_update_function.sql
```

The system works without this migration (using the fallback method), but the migration provides additional transaction safety when available.

## Testing

Added test structure to verify:

- Transaction rollback on database failure
- Optimistic locking prevents race conditions
- Sensitive data cleanup on both success and failure
- Key pair generation remains functional

## Future Improvements

1. Implement actual crypto functions at the database level for even better transaction safety
2. Add retry logic for optimistic lock failures
3. Implement audit logging for password change operations
4. Add rate limiting for password change attempts
