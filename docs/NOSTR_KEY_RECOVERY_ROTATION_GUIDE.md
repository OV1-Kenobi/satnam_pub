# 🔐 Nostr Key Recovery and Rotation Guide

## Overview

This guide covers the comprehensive Nostr key recovery and rotation system implemented for both Family Federation and Private Individual users. The system provides secure key management while preserving social network continuity.

## 🎯 Key Features

### Recovery System
- **Private Individual Recovery**: Direct authentication-based nsec recovery
- **Family Federation Recovery**: Guardian consensus-based recovery
- **Dual Credential Support**: NIP-05/Password and NIP-07/Password methods
- **Secure Display**: Memory-only decryption with copy/download options

### Rotation System
- **Identity Preservation**: Maintains NIP-05 and Lightning Address continuity
- **Profile Migration**: Transfers username, bio, and profile picture
- **Deprecation Management**: Automatic notices for old and new profiles
- **Social Continuity**: Ensures contacts can still find and pay user

## 🏗️ System Architecture

### Core Components

```
src/lib/auth/
└── nostr-key-recovery.ts              # Main recovery and rotation service

src/components/auth/
├── NsecRecoveryModal.tsx              # Recovery interface for logged-out users
├── KeyRotationModal.tsx               # Rotation interface for logged-in users
├── RecoveryAndRotationInterface.tsx   # Main interface component
└── RecoveryAndRotationPage.tsx        # Standalone page component

database/
└── nostr-key-recovery-rotation-migration.sql  # Database schema

src/lib/privacy/
└── encryption.ts                      # Enhanced with nsec encryption/decryption
```

### Database Schema

```sql
-- Recovery requests tracking
recovery_requests (
    id, user_id, user_role, recovery_type, recovery_method,
    status, credentials, family_consensus, audit_log
)

-- Key rotation tracking
key_rotations (
    rotation_id, user_id, old_npub, new_npub,
    preserve_identity, reason, status
)

-- Profile migration notices
profile_migration_notices (
    rotation_id, npub, notice_type, notice_content
)

-- Recovery audit log
recovery_audit_log (
    request_id, action, details, ip_address, timestamp
)
```

## 🚀 Usage Instructions

### 1. Database Setup

Run the migration to create required tables:

```sql
-- Execute in Supabase SQL editor
\i database/nostr-key-recovery-rotation-migration.sql
```

### 2. Component Integration

Add to your app routing:

```tsx
import { RecoveryAndRotationPage } from './components/auth/RecoveryAndRotationPage';

// Add route
<Route path="/key-management" element={<RecoveryAndRotationPage />} />
```

Or integrate into existing auth flows:

```tsx
import { RecoveryAndRotationInterface } from './components/auth/RecoveryAndRotationInterface';

function AuthPage() {
  return (
    <div>
      <RecoveryAndRotationInterface />
    </div>
  );
}
```

### 3. Recovery Process (Logged Out Users)

#### Private Individual Recovery

1. **Access Recovery Interface** when logged out
2. **Select Account Type**: Choose "Private Individual"
3. **Choose Credential Method**: NIP-05/Password or NIP-07/Password
4. **Enter Credentials**: Same credentials used for signin
5. **Process Recovery**: System authenticates and retrieves encrypted nsec
6. **Secure Display**: Nsec displayed with copy/download options
7. **Backup Securely**: Store nsec in secure password manager
8. **Clear Memory**: Close modal to clear nsec from memory

#### Family Federation Recovery

1. **Access Recovery Interface** when logged out
2. **Select Account Type**: Choose "Family Federation"
3. **Submit Request**: System creates recovery request
4. **Guardian Consensus**: Guardians must approve recovery
5. **Process Recovery**: After consensus, nsec is recovered
6. **Secure Display**: Same secure display as private users

### 4. Key Rotation Process (Logged In Users)

#### Rotation Setup

1. **Access Rotation Interface** when logged in
2. **Fill Identity Preservation Form**:
   - Username (display name)
   - NIP-05 identifier (username@satnam.pub)
   - Lightning Address (username@satnam.pub)
   - Bio (optional)
   - Profile Picture URL (optional)
3. **Provide Rotation Reason**: Explain why keys need rotation
4. **Confirm Requirements**: Check all confirmation boxes
5. **Initiate Rotation**: System generates new keypair

#### Rotation Completion

1. **Review New Keys**: System displays new npub and nsec
2. **Backup New Keys**: Securely store new nsec
3. **Complete Rotation**: System updates database and NIP-05 records
4. **Migration Steps**: System shows completed migration steps
5. **Update Clients**: Import new nsec into Nostr clients

## 🛡️ Security Measures

### Access Control

```typescript
// Recovery only when logged out
if (auth.authenticated) {
  return 'You must be logged out to access recovery';
}

// Rotation only when logged in
if (!auth.authenticated) {
  return 'You must be logged in to rotate keys';
}
```

### Memory Protection

```typescript
// Immediate cleanup after nsec use
finally {
  if (nsecKey) {
    nsecKey = '';
    nsecKey = null;
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  }
}
```

### Audit Trail

```typescript
// All operations logged
await this.logRecoveryAttempt(requestId, 'recovery_successful', {
  method: recoveryMethod,
  userRole: userRole,
  timestamp: new Date().toISOString()
});
```

## 🔄 Identity Preservation

### NIP-05 Continuity

```typescript
// Update NIP-05 record to point to new npub
await this.updateNIP05Record(
  rotationData.preserveIdentity.nip05,
  rotationData.newNpub
);
```

### Profile Migration

```typescript
// Preserve user identity data
const preserveIdentity = {
  nip05: 'username@satnam.pub',        // Unchanged
  lightningAddress: 'username@satnam.pub', // Unchanged
  username: 'Display Name',            // Migrated
  bio: 'User bio content',             // Migrated
  profilePicture: 'https://...'        // Migrated
};
```

### Deprecation Notices

```typescript
// New profile notice
const newProfileNotice = `🔄 Key Rotation Notice: This is a new Nostr identity for ${username}. Previous npub deprecated for security. Same NIP-05: ${nip05} | Same Lightning: ${lightningAddress}`;

// Old profile notice
const oldProfileNotice = `⚠️ DEPRECATED: This identity has been rotated for security. Find me at my new npub via NIP-05: ${nip05} | Lightning: ${lightningAddress}`;
```

## 📋 User Workflows

### Recovery Workflow

```
1. User is logged out
2. Accesses recovery interface
3. Selects account type (Private/Family)
4. Provides authentication credentials
5. System validates credentials
6. For Private: Immediate recovery
7. For Family: Guardian consensus required
8. Nsec decrypted and displayed securely
9. User backs up nsec
10. Memory cleared automatically
```

### Rotation Workflow

```
1. User is logged in
2. Accesses rotation interface
3. Fills identity preservation form
4. Provides rotation reason
5. Confirms all requirements
6. System generates new keypair
7. User backs up new keys
8. System completes migration:
   - Updates user database record
   - Updates NIP-05 record
   - Creates deprecation notices
   - Logs rotation completion
9. User updates Nostr clients
10. Social network continuity maintained
```

## 🧪 Testing

### Manual Testing Steps

#### Recovery Testing

1. **Log out** of the application
2. **Access recovery interface**
3. **Test Private Recovery**:
   - Select "Private Individual"
   - Use NIP-05/Password credentials
   - Verify nsec recovery and display
4. **Test Family Recovery**:
   - Select "Family Federation"
   - Verify guardian consensus requirement

#### Rotation Testing

1. **Log in** to the application
2. **Access rotation interface**
3. **Fill identity preservation form**
4. **Initiate rotation**
5. **Verify new key generation**
6. **Complete rotation process**
7. **Verify database updates**
8. **Test NIP-05 resolution to new npub**

### Automated Testing

```bash
# Run comprehensive validation tests
npm test nostr-key-recovery-rotation-validation.js
```

## 🚨 Important Security Notes

### Recovery Security

1. **Authentication Required**: Same credentials as signin
2. **Memory Only**: Nsec decrypted in memory only
3. **Immediate Cleanup**: Sensitive data cleared after use
4. **Audit Logging**: All attempts logged for security
5. **Session Timeouts**: Automatic expiration of recovery sessions

### Rotation Security

1. **Secure Generation**: Cryptographically secure new keys
2. **Identity Preservation**: NIP-05 and Lightning Address maintained
3. **Profile Migration**: Existing social data transferred
4. **Deprecation Management**: Clear migration notices
5. **Rollback Option**: Limited-time reversal capability

### General Security

1. **Access Control**: Strict logged-in/logged-out requirements
2. **Credential Validation**: Same authentication as signin
3. **Memory Protection**: Immediate nsec cleanup
4. **Audit Trail**: Comprehensive logging
5. **Error Handling**: Secure error messages

## 📚 External Resources

- **Message History**: Use [0xchat.com](https://0xchat.com) for accessing message history
- **NIP-07 Extensions**: Install Alby, nos2x, or Flamingo for maximum security
- **Nostr Protocol**: Compliance with NIP-05, NIP-07, NIP-58, NIP-59 specifications
- **Security Best Practices**: Follow Nostr security guidelines

## 🎉 Implementation Complete

The Nostr key recovery and rotation system provides comprehensive functionality for both Family Federation and Private Individual users, with robust security measures, identity preservation, and social network continuity. The system is ready for production use with proper testing and validation.
