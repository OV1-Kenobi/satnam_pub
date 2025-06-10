# Nostr-Native Authentication Implementation

This document outlines the changes made to implement a sovereign identity authentication system using Nostr protocol, replacing the traditional email/password authentication.

## Core Changes

### 1. User Interface and Types

- Removed email/password fields from user interface
- Added Nostr-specific fields:
  - `npub`: Nostr public key (bech32 encoded)
  - `nip05`: NIP-05 identifier (username@satnam.pub)
  - `lightning_address`: Lightning address (username@satnam.pub)
  - `relay_url`: User's preferred relay

### 2. Authentication Flow

#### Previous Flow:

1. User enters email/password
2. Server validates credentials against database
3. Server issues JWT token

#### New Flow:

1. **Nostr Wallet Connect (NWC)**:

   - User signs a challenge with their Nostr private key
   - Server verifies signature cryptographically
   - Server issues JWT token

2. **One-Time Password (OTP) Backup**:

   - User requests OTP using their npub
   - Server sends OTP via Nostr DM
   - User enters OTP to authenticate

3. **Recovery Flow**:
   - User provides username and recovery password
   - System decrypts their encrypted private key backup
   - User regains access to their identity

### 3. Security Improvements

- No passwords stored server-side
- Authentication based on cryptographic signatures
- Time-based challenges prevent replay attacks
- Domain verification prevents phishing
- Recovery system with encrypted backups

## Files Modified

1. **Types**:

   - `types/user.ts`: Updated user interface to include Nostr fields

2. **Authentication Service**:

   - `services/auth.ts`: Replaced email/password functions with Nostr authentication

3. **API Endpoints**:

   - `api/endpoints/auth.ts`: Updated endpoints for Nostr authentication

4. **Middleware**:

   - `middleware/auth.ts`: Updated to verify Nostr signatures and JWT tokens

5. **Utilities**:

   - `utils/crypto.ts`: Removed password hashing, added cryptographic functions

6. **Nostr Library**:

   - `lib/nostr.ts`: Enhanced with authentication-specific functions

7. **Configuration**:
   - `config/index.ts`: Added Nostr-specific configuration

## Database Schema Changes

New tables required:

- `recovery_codes`: Stores hashed recovery codes for users
- `otp_codes`: Stores temporary OTP codes with expiration

Modified tables:

- `users`: Replaced email/password fields with Nostr fields

## Security Model

1. **Primary Authentication**: Cryptographic signatures via Nostr protocol
2. **Backup Authentication**: Time-based OTP via Nostr DMs
3. **Recovery**: Encrypted private key backup with recovery password
4. **No Server-Side Secrets**: User controls their own keys

## Benefits

1. **Sovereignty**: Users own and control their identity
2. **Portability**: Identity works across the Nostr ecosystem
3. **Security**: No password database to breach
4. **Simplicity**: No email verification or password reset flows
5. **Privacy**: No email address required

## Next Steps

1. Implement server-side API handlers for the new endpoints
2. Create database migration for schema changes
3. Update frontend components to use Nostr authentication
4. Implement NIP-05 verification system
5. Add Lightning Address support
