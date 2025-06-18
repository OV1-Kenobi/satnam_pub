# Audit Details Encryption

## Overview

The privacy-auth service now encrypts all audit log details using production-grade AES-256-GCM encryption to protect personally identifiable information (PII) and sensitive data from unauthorized access.

## Security Features

### Encryption Algorithm

- **Algorithm**: AES-256-GCM (Galois/Counter Mode)
- **Key Size**: 256 bits
- **IV Size**: 128 bits (16 bytes)
- **Salt Size**: 256 bits (32 bytes)
- **Tag Size**: 128 bits (16 bytes)

### Key Derivation

- **Method**: Argon2id (Gold Standard)
- **Fallback**: PBKDF2 with SHA-512
- **Iterations**: 100,000 (configurable)
- **Salt**: Unique per encryption operation

### Security Properties

- **Authenticated Encryption**: GCM mode provides both confidentiality and integrity
- **Unique Encryption**: Each encryption uses a unique salt and IV
- **Non-Deterministic**: Same plaintext produces different ciphertext each time
- **Master Key**: Server-side key management via environment variables

## Implementation Details

### Encrypted Data Structure

Each audit detail is encrypted and stored as JSON containing:

```json
{
  "encrypted": "base64-encoded-ciphertext",
  "salt": "base64-encoded-salt",
  "iv": "base64-encoded-iv",
  "tag": "base64-encoded-auth-tag"
}
```

### Functions

#### `createAuditLog(userId, action, success, details?, ipAddress?, userAgent?)`

- Encrypts `details` object before database storage
- Hashes IP addresses and user agents
- Falls back to error logging if encryption fails
- Never stores sensitive data in plaintext

#### `decryptAuditDetails(encryptedDetailsJson)`

- Decrypts audit details for authorized access
- Validates encryption data structure
- Handles encryption errors gracefully
- Should only be used for legitimate security investigations

#### `getUserAuditLogWithDetails(userId, decryptDetails = false)`

- Enhanced audit log retrieval
- Optional detail decryption for authorized users
- Handles decryption failures without affecting entire request
- Returns both encrypted and decrypted details when authorized

## Environment Setup

### Required Environment Variables

```bash
# Production master key (CRITICAL - Generate with cryptographically secure random data)
PRIVACY_MASTER_KEY="your-256-bit-cryptographically-secure-random-key-here"
```

### Master Key Generation

Generate a secure master key using:

```bash
# Option 1: OpenSSL
openssl rand -base64 32

# Option 2: Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Option 3: Python
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

## Security Considerations

### Production Deployment

1. **Master Key**: Must be set in production environment
2. **Key Rotation**: Plan for periodic master key rotation
3. **Access Control**: Restrict decryption to authorized personnel only
4. **Audit Access**: Log all audit detail decryption attempts
5. **Backup**: Encrypted audit logs require master key for restoration

### Data Protection

- **PII Protection**: All personally identifiable information is encrypted
- **Error Handling**: Encryption failures don't expose sensitive data
- **Memory Safety**: Sensitive data cleared from memory after use
- **Network Safety**: Encrypted data safe for database replication/backups

## Testing

Run the encryption test before production deployment:

```bash
node test-audit-encryption.js
```

The test verifies:

- ✅ Encryption prevents plaintext storage
- ✅ Decryption accurately recovers original data
- ✅ Error handling works correctly
- ✅ No sensitive data leakage

## Migration from Plaintext

If you have existing plaintext audit logs:

1. **Immediate**: Deploy the encrypted version
2. **New Data**: All new audit entries will be encrypted
3. **Old Data**: Consider migrating existing logs if they contain PII
4. **Compatibility**: The system handles both encrypted and legacy data

## Monitoring

Monitor for:

- Encryption failures in application logs
- Unusual decryption access patterns
- Master key access/rotation events
- Database storage size changes (encrypted data is larger)

## Compliance

This implementation helps meet compliance requirements for:

- **GDPR**: PII protection through encryption
- **CCPA**: Consumer data protection
- **SOC 2 Type II**: Security controls for sensitive data
- **HIPAA**: If handling healthcare-related data
- **PCI DSS**: If processing payment information

## Performance Impact

- **Encryption Overhead**: ~1-2ms per audit log entry
- **Storage Overhead**: ~30-40% increase in database size
- **Decryption Overhead**: ~1-2ms per detail decryption
- **Memory Usage**: Minimal impact with proper cleanup

## Best Practices

1. **Least Privilege**: Only decrypt when absolutely necessary
2. **Audit Decryption**: Log all detail decryption attempts
3. **Regular Rotation**: Rotate master key periodically
4. **Secure Backup**: Backup master key separately from database
5. **Incident Response**: Have key recovery procedures for emergencies
