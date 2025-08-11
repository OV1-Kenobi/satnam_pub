# 🔐 Secure Message Signing Implementation

## Overview

This document describes the comprehensive secure message signing system implemented for Nostr messaging protocols. The system provides dual authentication pathways with robust security measures and user consent mechanisms.

## 🎯 Key Features

### Dual Authentication Pathways

1. **NIP-07 Browser Extension (PREFERRED)**
   - Zero-knowledge approach with no private key exposure
   - Uses `window.nostr.signEvent()` for secure signing
   - Automatic fallback when extension unavailable

2. **Encrypted Nsec Retrieval (FALLBACK)**
   - Secure database retrieval with user consent
   - Temporary memory-only nsec access
   - Immediate cleanup after signing

### Message Type Support

- **Group messaging (NIP-58)** - Cryptographically signed group messages
- **Gift-wrapped direct messages (NIP-59)** - Encrypted DMs with signing
- **Invitation messages** - Peer invitation with authenticity
- **General Nostr events** - Flexible event signing

### Security Features

- **User Consent System** - Explicit consent for nsec access
- **Zero-Content Storage** - No message content stored in database
- **Session Management** - Automatic timeout and cleanup
- **Memory Protection** - Immediate nsec clearing after use

## 🏗️ Architecture

### Core Components

```
src/lib/messaging/
├── secure-message-signing.ts          # Main signing service
└── 

src/components/messaging/
├── NsecConsentModal.tsx               # User consent interface
├── SecureMessageSigningProvider.tsx   # React context provider
├── MessagingIntegrationWrapper.tsx    # App wrapper component
└── SecureMessagingExample.tsx         # Usage demonstration

src/lib/privacy/
└── encryption.ts                     # Enhanced with nsec decryption

src/lib/auth/
└── user-identities-auth.ts          # Enhanced with user retrieval
```

### Data Flow

```
1. User initiates message signing
2. Check NIP-07 availability
3. If available: Use browser extension
4. If unavailable: Request user consent
5. Show consent modal with warnings
6. If granted: Retrieve encrypted nsec
7. Decrypt nsec in memory only
8. Sign message with appropriate method
9. Clear nsec from memory immediately
10. Return signed event
```

## 🚀 Usage

### Basic Setup

```tsx
import { MessagingIntegrationWrapper } from './components/messaging/MessagingIntegrationWrapper';

function App() {
  return (
    <MessagingIntegrationWrapper>
      <YourAppComponents />
    </MessagingIntegrationWrapper>
  );
}
```

### Signing Messages

```tsx
import { useDirectMessageSigning } from './components/messaging/MessagingIntegrationWrapper';

function MessageComponent() {
  const { signDirectMessage } = useDirectMessageSigning();

  const handleSendMessage = async () => {
    const result = await signDirectMessage(
      "Hello, this is a secure message!",
      "npub1recipient..."
    );
    
    if (result.success) {
      console.log('Message signed:', result.signedEvent);
    } else {
      console.error('Signing failed:', result.error);
    }
  };
}
```

### Group Messages

```tsx
import { useGroupMessageSigning } from './components/messaging/MessagingIntegrationWrapper';

function GroupComponent() {
  const { signGroupMessage } = useGroupMessageSigning();

  const sendGroupMessage = async () => {
    const result = await signGroupMessage(
      "Group announcement",
      "group-id-123"
    );
  };
}
```

### Invitation Messages

```tsx
import { useInvitationMessageSigning } from './components/messaging/MessagingIntegrationWrapper';

function InviteComponent() {
  const { signInvitationMessage } = useInvitationMessageSigning();

  const sendInvitation = async () => {
    const result = await signInvitationMessage(
      "Join our family federation!",
      "npub1recipient...",
      "family"
    );
  };
}
```

## 🛡️ Security Measures

### User Consent Process

1. **Security Warnings** - Clear explanation of nsec access
2. **Zero-Content Notice** - Explanation of privacy policy
3. **Session Information** - Timeout and cleanup details
4. **Required Acknowledgments** - Multiple consent checkboxes
5. **NIP-07 Recommendations** - Encourage extension use

### Memory Protection

```typescript
// Immediate cleanup after signing
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

### Session Management

- **30-minute timeout** for nsec access sessions
- **Automatic expiration** and cleanup
- **Single-use sessions** for enhanced security
- **User authentication validation** before access

## 🔧 Configuration

### Signing Preferences

```tsx
import { useSigningPreferences } from './components/messaging/MessagingIntegrationWrapper';

function SettingsComponent() {
  const { 
    signingPreference, 
    setSigningPreference, 
    availableMethods 
  } = useSigningPreferences();

  return (
    <div>
      {availableMethods.map(method => (
        <label key={method.method}>
          <input
            type="radio"
            value={method.method}
            checked={signingPreference === method.method}
            onChange={(e) => setSigningPreference(e.target.value)}
            disabled={!method.available}
          />
          {method.name} {method.recommended && '(Recommended)'}
        </label>
      ))}
    </div>
  );
}
```

### Security Status

```tsx
import { useSigningSecurity } from './components/messaging/MessagingIntegrationWrapper';

function SecurityStatus() {
  const { securityStatus } = useSigningSecurity();

  return (
    <div className={`security-${securityStatus.level}`}>
      Security Level: {securityStatus.level.toUpperCase()}
      <p>{securityStatus.description}</p>
    </div>
  );
}
```

## 📋 Privacy Policy

### Zero-Content Storage

- **No message content** is stored in our database
- **Only signing operations** are performed
- **Message history access** requires external Nostr clients
- **Recommended client**: [0xchat.com](https://0xchat.com)

### Data Handling

- **Encrypted nsec** stored with user-specific salt
- **Temporary access** only during signing sessions
- **Immediate cleanup** after signing completion
- **No logging** of sensitive data

## 🧪 Testing

### Validation Tests

Run comprehensive validation tests:

```bash
npm test secure-message-signing-validation.js
```

### Manual Testing

1. **NIP-07 Testing** - Install browser extension and test signing
2. **Fallback Testing** - Disable extension and test nsec fallback
3. **Consent Testing** - Verify consent modal functionality
4. **Security Testing** - Confirm memory cleanup and timeouts

## 🔗 Integration Points

### Database Schema

Requires `encrypted_nsec` field in `user_identities` table:

```sql
ALTER TABLE user_identities 
ADD COLUMN encrypted_nsec TEXT;
```

### Authentication System

Integrates with existing unified authentication:

- Uses `auth.user.id` for database queries
- Requires `auth.authenticated` validation
- Uses `auth.user.user_salt` for decryption

### Privacy Engine

Compatible with existing privacy infrastructure:

- Uses `decryptNsecSimple()` for nsec decryption
- Maintains privacy-first architecture
- Preserves zero-knowledge principles

## 🚨 Important Notes

### Security Considerations

1. **NIP-07 Preferred** - Always recommend browser extensions
2. **User Consent Required** - Never access nsec without explicit consent
3. **Memory Cleanup Critical** - Always clear nsec after use
4. **Session Timeouts** - Enforce automatic expiration
5. **Error Handling** - Provide clear feedback to users

### External Dependencies

- **0xchat.com** - For message history access
- **NIP-07 Extensions** - Alby, nos2x, Flamingo for maximum security
- **Nostr Protocol** - Compliance with NIP-58, NIP-59 specifications

## 📚 Resources

- [NIP-07 Specification](https://github.com/nostr-protocol/nips/blob/master/07.md)
- [NIP-58 Group Messaging](https://github.com/nostr-protocol/nips/blob/master/58.md)
- [NIP-59 Gift Wrapping](https://github.com/nostr-protocol/nips/blob/master/59.md)
- [0xchat Nostr Client](https://0xchat.com)

## 🎉 Implementation Complete

The secure message signing system provides comprehensive dual authentication pathways with robust security measures, user consent mechanisms, and privacy-first architecture. All message types are supported with proper cryptographic signing and zero-content storage policies.
