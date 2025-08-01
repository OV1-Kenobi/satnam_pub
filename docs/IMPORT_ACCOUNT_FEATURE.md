# Import Account Feature Documentation

## Overview

The Import Account feature allows users to migrate their existing Nostr identities to Satnam.pub while preserving their existing profile data, social connections, and Lightning configurations. This feature supports both private key (nsec) and public key (npub) imports with full zero-knowledge security compliance.

## Features

### 🔐 Zero-Knowledge Security
- **Immediate Memory Cleanup**: All sensitive data is cleared from memory immediately after processing
- **Secure Memory Management**: Uses Web Crypto API and secure buffer cleanup utilities
- **No Server-Side Storage**: Private keys are encrypted client-side before transmission
- **Ephemeral Processing**: Keys are only held in memory during the import process

### 🔍 Automatic Profile Detection
- **Nostr Network Scanning**: Automatically detects existing profile metadata from Nostr relays
- **Profile Preservation**: Maintains existing name, bio, avatar, NIP-05, and Lightning addresses
- **Timeout Protection**: 15-second timeout prevents hanging on slow relays
- **Graceful Degradation**: Import continues even if profile detection fails

### 🎯 Dual Import Modes

#### Private Key Import (nsec1...)
- **Full Account Access**: Complete control over the Nostr identity
- **Profile Publishing**: Can update and publish profile changes
- **Message Signing**: Can sign events and send messages
- **Lightning Integration**: Full Lightning wallet functionality

#### Public Key Import (npub1...)
- **View-Only Mode**: Can view profile and content but cannot post
- **Profile Display**: Shows existing profile information
- **Contact Management**: Can add to contact lists
- **Limited Functionality**: Cannot sign events or send messages

### 🛡️ Comprehensive Validation
- **Format Validation**: Ensures proper nsec1/npub1 format
- **Length Checking**: Validates key length (60-70 characters)
- **Common Mistake Detection**: Identifies hex keys, spacing issues, and format errors
- **Real-Time Feedback**: Immediate validation feedback as user types

### 🔗 System Integration
- **Peer Invitations**: Works seamlessly with invitation system
- **Family Federation**: Compatible with family federation workflows
- **OTP Authentication**: Supports OTP sign-in for imported accounts
- **Contact Management**: Automatically integrates with contact system
- **Course Credits**: Preserves invitation credits and benefits

## User Experience Flow

### Step 1: Account Selection
```
┌─────────────────────────────────────┐
│  Create New Nostr Account           │
│  ○ Generate fresh keys              │
│                                     │
│  Import Existing Nostr Account      │
│  ● Use existing credentials         │
└─────────────────────────────────────┘
```

### Step 2: Key Import
```
┌─────────────────────────────────────┐
│  Enter Your Nostr Key               │
│  ┌─────────────────────────────────┐ │
│  │ nsec1... or npub1...            │ │
│  └─────────────────────────────────┘ │
│                                     │
│  ✓ Private key detected - full access │
│  [Import Account]                   │
└─────────────────────────────────────┘
```

### Step 3: Profile Detection
```
┌─────────────────────────────────────┐
│  🔍 Detecting Profile...            │
│  ┌─────────────────────────────────┐ │
│  │ ✅ Existing Nostr Profile Found │ │
│  │                                 │ │
│  │ Name: Alice                     │ │
│  │ About: Bitcoin educator         │ │
│  │ NIP-05: alice@example.com       │ │
│  │ Lightning: alice@getalby.com    │ │
│  └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

### Step 4: Migration Consent
```
┌─────────────────────────────────────┐
│  Migration Consent                  │
│                                     │
│  ☑ Update my profile with Satnam    │
│      NIP-05 (alice@satnam.pub)      │
│                                     │
│  ☑ Preserve existing profile data   │
│                                     │
│  [Complete Import] [Cancel]         │
└─────────────────────────────────────┘
```

## Technical Implementation

### Frontend Components

#### IdentityForge.tsx
- **Main Import Logic**: Handles key validation and profile detection
- **Zero-Knowledge Compliance**: Secure memory management
- **User Interface**: Import forms and validation feedback
- **State Management**: Migration mode and profile data

#### Key Functions
```typescript
// Secure memory cleanup utility
const secureMemoryCleanup = (sensitiveString: string | null) => {
  // Converts to ArrayBuffer and zeros out memory
}

// Profile detection with timeout
const detectNostrProfile = async (publicKey: string) => {
  // Uses NostrProfileService with 15-second timeout
  // Returns profile data or graceful fallback
}

// Import validation and processing
const handleNsecImport = async () => {
  // Validates format, detects profile, sets up migration
}
```

### Backend Integration

#### register-identity.js
- **Enhanced Validation**: Supports npub/encryptedNsec fields
- **Import Metadata**: Stores import status and detected profile data
- **Database Integration**: Creates entries in user_identities and profiles tables

#### Database Schema
```sql
-- user_identities table
CREATE TABLE user_identities (
  id UUID PRIMARY KEY,
  username VARCHAR(50) NOT NULL,
  npub VARCHAR(100) NOT NULL,
  encrypted_nsec TEXT,
  nip05 VARCHAR(255),
  lightning_address VARCHAR(255),
  role VARCHAR(20) DEFAULT 'private',
  privacy_settings JSONB DEFAULT '{
    "is_imported_account": false,
    "detected_profile_data": null
  }'
);
```

### Security Measures

#### Zero-Knowledge Compliance
1. **Immediate Cleanup**: `secureMemoryCleanup()` called after processing
2. **No Persistence**: Keys never stored in localStorage or state
3. **Memory Zeroing**: ArrayBuffer manipulation to clear sensitive data
4. **Timeout Protection**: Prevents memory leaks from hanging operations

#### Validation Pipeline
1. **Format Check**: nsec1/npub1 prefix validation
2. **Length Validation**: 60-70 character range
3. **Decode Verification**: Actual key decoding test
4. **Type Confirmation**: Ensures nsec/npub type matches

## Error Handling

### Common Error Scenarios

#### Invalid Key Format
```
❌ Invalid key format. Please enter a valid nsec1... or npub1... key
```

#### Network Timeout
```
⚠️ Profile detection timed out - you can still import your key
```

#### Corrupted Key
```
❌ Invalid nsec format or corrupted key
```

#### Common User Mistakes
```
❌ Nostr keys should not contain spaces. Please check your key and try again.
❌ This appears to be a hex private key. Please use the nsec1... format instead.
```

### Graceful Degradation
- Profile detection failures don't prevent import
- Network errors show helpful messages
- Import continues with minimal profile data
- User can complete setup manually

## Testing Scenarios

### Valid Import Cases
1. **Fresh nsec**: New private key with no existing profile
2. **Existing nsec**: Private key with rich profile metadata
3. **npub Only**: Public key for view-only access
4. **Invited User**: Import with active invitation token

### Edge Cases
1. **Network Failure**: Profile detection timeout/failure
2. **Malformed Keys**: Invalid format, wrong length, corrupted data
3. **Relay Issues**: Slow or unresponsive Nostr relays
4. **Memory Constraints**: Large profile data handling

### Security Tests
1. **Memory Cleanup**: Verify sensitive data is cleared
2. **Timeout Handling**: Ensure no hanging operations
3. **Validation Bypass**: Attempt to bypass format checks
4. **Injection Attacks**: Test with malicious input

## Integration Points

### Existing Systems
- **Peer Invitations**: Invitation tokens processed during import
- **Family Federation**: Family roles and permissions preserved
- **OTP Authentication**: npub-based OTP sign-in compatibility
- **Contact Management**: Automatic contact list integration
- **Lightning Wallets**: Lightning address preservation

### Future Enhancements
- **Batch Import**: Multiple key import support
- **Profile Merging**: Merge multiple Nostr identities
- **Advanced Validation**: Enhanced key verification
- **Backup Integration**: Automatic backup creation

## Monitoring and Analytics

### Success Metrics
- Import completion rate
- Profile detection success rate
- User retention after import
- Error resolution rate

### Error Tracking
- Validation failure types
- Network timeout frequency
- User abandonment points
- Support ticket correlation

## Support and Troubleshooting

### Common Issues
1. **"Key not recognized"**: Check format and try copy/paste
2. **"Profile not found"**: Normal for new keys, continue import
3. **"Import failed"**: Check network connection and retry
4. **"Invalid format"**: Ensure nsec1/npub1 prefix

### User Education
- Key format explanation
- Security best practices
- Profile detection process
- Migration benefits

---

*This documentation covers the complete Import Account feature implementation for Satnam.pub's Identity Forge system.*
