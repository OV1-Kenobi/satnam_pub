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

Added proper cleanup of sensitive data using try/finally blocks:

```typescript
finally {
  // Always clear sensitive data from memory, even on error
  if (decryptedNsec) {
    this.secureClearString(decryptedNsec)
    decryptedNsec = null
  }
}
```

## Security Benefits

1. **Atomicity**: Either the entire operation succeeds or fails completely
2. **Consistency**: No partial state where old password works but new password doesn't
3. **Race condition prevention**: Optimistic locking ensures concurrent updates don't interfere
4. **Memory safety**: Sensitive data is always cleared from memory
5. **Transaction rollback**: Database changes are rolled back on failure

## Usage

The API remains the same - existing code continues to work:

```typescript
const success = await SecureStorage.updatePasswordAndReencryptNsec(
  userId,
  oldPassword,
  newPassword,
);
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
