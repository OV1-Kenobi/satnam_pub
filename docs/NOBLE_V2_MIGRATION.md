# 🚀 Noble V2 Encryption Migration Guide

## Overview

This document outlines the complete migration from legacy encryption systems to Noble V2 cryptography for the Satnam application. This is a **greenfield migration** designed for development environments with only test data.

## 🎯 Migration Goals

- **Security**: Upgrade to Cure53-audited Noble cryptography libraries
- **Standardization**: Unified encryption system across the entire application
- **Performance**: Optimized pure JavaScript implementation
- **Compatibility**: Browser-only, zero Node.js dependencies
- **Future-Proof**: Versioned encryption format for easy future migrations

## 📋 Pre-Migration Checklist

### ⚠️ **CRITICAL WARNING**

This migration will **DELETE ALL EXISTING USER DATA**. Only run in development/test environments.

### Prerequisites

- [ ] Backup any important test data (if needed)
- [ ] Verify you're in a development environment
- [ ] Ensure Supabase access for SQL execution
- [ ] Node.js environment with npm/yarn

## 🔧 Migration Steps

### Step 1: Install Noble V2 Dependencies

```bash
npm install @noble/ciphers
```

The following dependencies are already installed:

- `@noble/curves@2.0.0` ✅
- `@noble/hashes@1.8.0` ✅
- `@scure/base` ✅

### Step 2: Run Database Migration

Execute the SQL migration in your Supabase SQL editor:

```bash
npm run migrate:noble-v2
```

**Option A: Full Migration (Recommended)**
Copy and paste the contents of `database/noble-v2-migration.sql` into your Supabase SQL editor and execute.

- Comprehensive logging and progress reporting
- Handles all optional tables gracefully
- Detailed record counts and summaries

**Option B: Simplified Migration**
Copy and paste the contents of `database/noble-v2-migration-simple.sql` into your Supabase SQL editor and execute.

- Clean, minimal logging
- Handles missing tables gracefully
- Same functionality as Option A

**Option C: Minimal Migration (For Missing Tables)**
If your database is missing core tables, use the minimal version:
Copy and paste the contents of `database/noble-v2-migration-minimal.sql` into your Supabase SQL editor and execute.

- Only touches existing tables
- Prepares validation functions for future table creation
- Safe for incomplete database schemas

### Step 3: Verify Migration

Run the Noble V2 test suite:

```bash
npm run test:noble
```

Expected output:

```
✅ Noble V2 Encryption System
✅ Basic Encryption/Decryption
✅ Nsec Encryption/Decryption
✅ Cryptographic Properties
✅ Hashing Functions
✅ Utility Functions
✅ Error Handling
✅ Backward Compatibility
```

### Step 4: Test Application

1. Start the development server:

   ```bash
   npm run dev
   ```

2. Attempt user registration with NIP-05/password
3. Verify nsec encryption/decryption works
4. Check browser console for Noble V2 logs:
   ```
   🔐 decryptNsecSimple: Using Noble V2 implementation
   🔐 encryptNsecSimple: Using Noble V2 implementation
   ```

## 🏗️ Technical Architecture

### Noble V2 Encryption System

```typescript
// Core encryption functions
import { NobleEncryption } from "src/lib/crypto/noble-encryption";

// General data encryption
const encrypted = await NobleEncryption.encrypt(data, password);
const decrypted = await NobleEncryption.decrypt(encrypted, password);

// Nsec encryption (zero-knowledge)
const encryptedNsec = await NobleEncryption.encryptNsec(nsec, userSalt);
const decryptedNsec = await NobleEncryption.decryptNsec(
  encryptedNsec,
  userSalt
);
```

### Encryption Format

**General Data Format:**

```json
{
  "encrypted": "base64url-encoded-ciphertext",
  "salt": "base64url-encoded-salt",
  "iv": "base64url-encoded-iv",
  "version": "noble-v2"
}
```

**Nsec Database Format:**

```
noble-v2.salt.iv.encrypted
```

### Security Properties

- **Algorithm**: AES-256-GCM (authenticated encryption)
- **Key Derivation**: PBKDF2 with SHA-256, 100,000 iterations
- **Key Length**: 256-bit keys
- **IV Length**: 96-bit IV (optimal for GCM)
- **Salt Length**: 256-bit salt
- **Encoding**: Base64URL (URL-safe)

## 🔄 Migration Details

### What Changed

1. **Replaced Functions:**

   - `decryptNsecSimple()` → Noble V2 implementation
   - `encryptNsecSimple()` → Noble V2 implementation

2. **New Components:**

   - `src/lib/crypto/noble-encryption.ts` - Core Noble V2 system
   - `tests/noble-v2-encryption.test.ts` - Comprehensive test suite
   - `database/noble-v2-migration.sql` - Database migration

3. **Database Changes:**
   - Added `encryption_version` column
   - Added Noble V2 format validation
   - Added audit logging
   - Cleared all test data

### Backward Compatibility

The migration maintains API compatibility:

- Existing function signatures unchanged
- Same input/output formats
- Transparent Noble V2 usage

Legacy functions now internally use Noble V2 but maintain the same external interface.

## 🧪 Testing

### Automated Tests

```bash
# Run all tests
npm test

# Run only Noble V2 tests
npm run test:noble

# Run with coverage
npm run test:coverage
```

### Manual Testing Checklist

- [ ] User registration with NIP-05/password
- [ ] User sign-in with NIP-05/password
- [ ] Nsec encryption during registration
- [ ] Nsec decryption during sign-in
- [ ] SecureSession creation
- [ ] Message signing functionality

## 🚨 Troubleshooting

### Common Issues

**1. PostgreSQL Table Does Not Exist**

```
ERROR: relation 'secure_sessions' does not exist
```

**Solution**: Use `database/noble-v2-migration-minimal.sql` which only operates on existing tables and handles missing tables gracefully.

**2. PostgreSQL Syntax Error in Migration**

```
ERROR: syntax error at or near "RAISE"
```

**Solution**: All migration scripts now have proper `DO $$` blocks. If you still encounter this, try the minimal migration script.

**2. Import Errors**

```
Error: Cannot resolve '@noble/ciphers'
```

**Solution**: Run `npm install @noble/ciphers`

**3. Database Constraint Errors**

```
ERROR: new row violates check constraint "chk_encrypted_nsec_noble_v2"
```

**Solution**: Ensure encrypted nsec data uses Noble V2 format

**4. Decryption Failures**

```
Noble V2 decryption failed: Invalid encrypted nsec format
```

**Solution**: Verify data was encrypted with Noble V2 system

### Debug Logging

Enable debug logging by checking browser console for:

```
🔐 decryptNsecSimple: Using Noble V2 implementation
🔐 encryptNsecSimple: Using Noble V2 implementation
```

## 📊 Performance Impact

### Bundle Size

- **Added**: `@noble/ciphers` (~50KB minified)
- **Removed**: Legacy encryption code (~30KB)
- **Net Impact**: +20KB (acceptable for security improvement)

### Runtime Performance

- **Encryption**: ~10ms for typical nsec
- **Decryption**: ~10ms for typical nsec
- **Memory**: Minimal impact, efficient cleanup

## 🔮 Future Considerations

### Post-Quantum Readiness

Noble V2 provides a foundation for future post-quantum cryptography:

- Versioned format enables easy migration
- Modular architecture supports algorithm swapping
- Audit trail tracks encryption versions

### Scaling Considerations

- Noble V2 is optimized for browser environments
- Supports Web Workers for heavy operations
- Compatible with WebAssembly acceleration

## 📚 References

- [Noble Cryptography](https://github.com/paulmillr/noble-ciphers)
- [Cure53 Audit Report](https://cure53.de/audit-report_noble-crypto-libs.pdf)
- [NIST Cryptographic Standards](https://csrc.nist.gov/projects/cryptographic-standards-and-guidelines)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)

## ✅ Migration Completion

After successful migration:

- [ ] All tests passing
- [ ] User registration/sign-in working
- [ ] Noble V2 logs visible in console
- [ ] Database constraints enforced
- [ ] Audit log entries created

**🎉 Congratulations! Your application now uses Noble V2 encryption!**
