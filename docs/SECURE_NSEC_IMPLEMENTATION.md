# Secure Nsec Implementation Guide

## Overview

This document outlines the secure implementation for handling Nostr secret keys (nsec) in the Satnam.pub platform. The implementation follows strict privacy-first and security-first principles as outlined in the master context document.

## Security Architecture

### Core Principles

1. **Never Store Plain Text**: Nsec values are never stored in plain text anywhere in the system
2. **Client-Side Encryption**: All encryption/decryption happens in the browser using Web Crypto API
3. **Temporary Storage**: Credentials have automatic expiration (default 24 hours)
4. **Unique Salts**: Each credential uses a unique salt for PBKDF2 key derivation
5. **UUID-Based Storage**: Each credential gets a unique UUID identifier
6. **Automatic Cleanup**: Expired credentials are automatically removed

### Encryption Protocol

- **Algorithm**: AES-256-GCM (Galois/Counter Mode)
- **Key Derivation**: PBKDF2 with 100,000 iterations
- **Salt**: 32-byte random salt per credential
- **Authentication**: GCM provides both encryption and authentication
- **Key Source**: User password + unique salt

## Implementation Components

### 1. Enhanced Nostr Manager (`lib/enhanced-nostr-manager.ts`)

The main manager class that handles secure nsec operations:

```typescript
// Store nsec securely
await nostrManager.storeNsecCredentialSecurely(
  userId,
  nsec,
  userPassword,
  expirationHours
);

// Retrieve nsec temporarily
const result = await nostrManager.retrieveNsecCredentialTemporarily(
  userId,
  userPassword,
  credentialId
);
```

### 2. Secure Credential Manager (`src/lib/auth/secure-credential-manager.ts`)

Low-level credential management with database operations:

```typescript
// Store credential
await secureCredentialManager.storeCredential(
  userId,
  nsec,
  password,
  24 // hours
);

// Retrieve credential
const result = await secureCredentialManager.retrieveCredential(
  userId,
  credentialId,
  password
);
```

### 3. React Hook (`src/hooks/useSecureNsec.ts`)

React hook for managing secure nsec state:

```typescript
const { state, storeNsec, retrieveNsec, clearNsec } = useSecureNsec(userId);

// Store nsec
await storeNsec(nsec, password, 24);

// Retrieve nsec
const result = await retrieveNsec(password);
```

### 4. UI Component (`src/components/auth/SecureNsecInput.tsx`)

Secure input component for nsec during sign-up:

```typescript
<SecureNsecInput
  userId={userId}
  userPassword={password}
  onCredentialStored={(credentialId) => {
    // Handle successful storage
  }}
  onError={(error) => {
    // Handle errors
  }}
  expirationHours={24}
/>
```

## Database Schema

### Table: `secure_nostr_credentials`

```sql
CREATE TABLE secure_nostr_credentials (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    credential_id UUID NOT NULL UNIQUE,
    salt TEXT NOT NULL,
    encrypted_nsec TEXT NOT NULL,
    iv TEXT NOT NULL,
    tag TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    last_accessed_at TIMESTAMPTZ,
    access_count INTEGER DEFAULT 0,
    is_revoked BOOLEAN DEFAULT FALSE,
    revoked_at TIMESTAMPTZ,
    revocation_reason TEXT
);
```

### Security Features

- **Row Level Security (RLS)**: Users can only access their own credentials
- **Automatic Expiration**: Credentials are automatically deleted when expired
- **Access Tracking**: Tracks when and how often credentials are accessed
- **Revocation Support**: Credentials can be revoked if compromised

## Usage Guidelines

### During Sign-Up

1. User provides nsec in the secure input component
2. Component validates nsec format
3. Nsec is encrypted with user's password + unique salt
4. Encrypted data is stored in database with UUID
5. Plain text nsec is immediately cleared from memory

### During Operations

1. User provides password to retrieve nsec
2. System decrypts nsec using password + stored salt
3. Nsec is used for the specific operation
4. Nsec is immediately cleared from memory after use
5. Access metadata is updated

### Security Best Practices

1. **Never Log Nsec**: Never log or display nsec values
2. **Immediate Cleanup**: Clear nsec from memory immediately after use
3. **Password Validation**: Always validate user password before decryption
4. **Expiration Enforcement**: Respect credential expiration times
5. **Access Monitoring**: Monitor for unusual access patterns

## Security Considerations

### Threat Model

- **Database Compromise**: Encrypted data is protected by user passwords
- **Memory Dumps**: Nsec is only in memory briefly during operations
- **Network Interception**: All operations happen client-side
- **Brute Force**: PBKDF2 with 100k iterations provides protection

### Mitigations

- **Strong Passwords**: Encourage users to use strong passwords
- **Regular Rotation**: Credentials expire automatically
- **Access Limits**: Track and limit credential access
- **Revocation**: Support for immediate credential revocation

## Error Handling

### Common Error Scenarios

1. **Invalid Password**: Wrong password during decryption
2. **Expired Credential**: Credential has passed expiration time
3. **Revoked Credential**: Credential has been revoked
4. **Database Errors**: Issues with credential storage/retrieval

### Error Responses

```typescript
{
  success: false,
  message: "Credential has expired",
  // No sensitive data in error messages
}
```

## Testing

### Security Tests

1. **Encryption Tests**: Verify AES-256-GCM encryption/decryption
2. **Password Tests**: Test with various password strengths
3. **Expiration Tests**: Verify automatic cleanup
4. **Access Tests**: Verify RLS policies
5. **Memory Tests**: Verify nsec is cleared from memory

### Integration Tests

1. **Sign-up Flow**: Test complete nsec storage flow
2. **Operation Flow**: Test nsec retrieval and use
3. **Error Handling**: Test various error scenarios
4. **Cleanup Flow**: Test automatic expiration cleanup

## Compliance

### Privacy Requirements

- ✅ No plain text storage
- ✅ Client-side encryption
- ✅ Automatic expiration
- ✅ User-controlled deletion
- ✅ No external logging

### Security Requirements

- ✅ AES-256-GCM encryption
- ✅ PBKDF2 key derivation
- ✅ Unique salts per credential
- ✅ UUID-based identification
- ✅ Row-level security

## Monitoring and Auditing

### Access Logs

- Track credential creation times
- Monitor access patterns
- Alert on unusual activity
- Log revocation events

### Security Metrics

- Number of active credentials
- Average credential lifetime
- Access frequency patterns
- Revocation rates

## Future Enhancements

### Planned Improvements

1. **Hardware Security**: Integration with hardware security modules
2. **Multi-Factor**: Additional authentication factors
3. **Audit Trails**: Enhanced audit logging
4. **Backup Recovery**: Secure backup mechanisms

### Research Areas

1. **Zero-Knowledge Proofs**: For credential verification
2. **Threshold Encryption**: For distributed credential storage
3. **Quantum Resistance**: Post-quantum cryptography preparation

## Conclusion

This secure nsec implementation provides robust protection for user credentials while maintaining usability and following privacy-first principles. The multi-layered approach ensures that even if one component is compromised, user credentials remain protected.

The implementation is designed to be:
- **Secure**: Military-grade encryption with proper key management
- **Private**: No plain text storage or external logging
- **Usable**: Simple integration with existing authentication flows
- **Maintainable**: Clear separation of concerns and comprehensive testing
- **Compliant**: Follows all master context security requirements 