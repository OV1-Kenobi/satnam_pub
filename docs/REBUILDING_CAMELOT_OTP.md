# 🏰 Rebuilding Camelot OTP System

## Overview

The Rebuilding Camelot OTP System provides secure, Nostr-based one-time password authentication for the Satnam.pub Family Federation. This system uses a dedicated Nostr account ("Rebuilding Camelot") to send encrypted OTP codes via direct messages to users.

## Features

- **🔐 Secure OTP Delivery**: OTPs are sent via encrypted Nostr DMs using NIP-04 encryption
- **🏰 Dedicated Identity**: Uses the "RebuildingCamelot@satnam.pub" identity for consistent branding
- **🛡️ Vault Security**: Private keys stored securely in Supabase Vault
- **📊 Database Tracking**: OTP verification tracked in database with proper security measures
- **🔄 Automatic Cleanup**: Expired OTPs are automatically cleaned up
- **⚡ Multi-Relay**: Publishes to multiple relays for reliability
- **🔙 Backward Compatible**: Works alongside existing OTP system during transition

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Client App    │    │   API Server     │    │  Supabase DB    │
│                 │    │                  │    │                 │
│ 1. Request OTP  │───▶│ 2. Generate OTP  │    │ 5. Store Hash   │
│                 │    │                  │    │                 │
│ 8. Submit OTP   │    │ 3. Encrypt DM    │    │ 6. Vault Keys   │
│                 │    │                  │    │                 │
│ 9. Get Session  │◀───│ 4. Send via      │    │ 7. Verify Hash  │
│                 │    │    Nostr Relays  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │  Nostr Network   │
                       │                  │
                       │ • relay.damus.io │
                       │ • relay.satnam   │
                       │ • nos.lol        │
                       └──────────────────┘
```

## Setup Instructions

### 1. Database Migration

Run the migration to create the necessary tables and functions:

```bash
npm run migrate:rebuilding-camelot
```

This creates:

- `family_otp_verification` table for OTP tracking
- Vault functions for secure credential access
- Automatic cleanup procedures

### 2. Supabase Vault Configuration

#### Enable Vault Extension

In your Supabase dashboard, enable the Vault extension:

```sql
CREATE EXTENSION IF NOT EXISTS supabase_vault;
```

#### Store Credentials

Replace the placeholder values in the migration with your actual credentials:

```sql
-- Store the actual nsec (private key)
SELECT vault.create_secret(
  'nsec1your_actual_private_key_here',
  'rebuilding_camelot_nsec',
  'Rebuilding Camelot Nostr private key for OTP DM authentication'
);

-- Store the corresponding npub (public key)
SELECT vault.create_secret(
  'npub1your_actual_public_key_here',
  'rebuilding_camelot_npub',
  'Rebuilding Camelot Nostr public key for verification'
);

-- Store the NIP-05 address
SELECT vault.create_secret(
  'RebuildingCamelot@satnam.pub',
  'rebuilding_camelot_nip05',
  'Rebuilding Camelot NIP-05 address for user verification'
);
```

### 3. Environment Variables

Add to your `.env` file:

```env
# OTP Salt for hashing (use a strong, random value)
OTP_SALT=your_secure_random_salt_here

# Supabase credentials (if not already set)
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 4. Generate Rebuilding Camelot Keys

You can generate new Nostr keys for the Rebuilding Camelot account:

⚠️ **Security Warning**: Never log or expose private keys in production. The example below should only be run in a secure environment.

```javascript
import { generateSecretKey, getPublicKey, nip19 } from "../src/lib/nostr-browser";

// Generate new keys
const privateKey = generateSecretKey();
const publicKey = getPublicKey(privateKey);

// Convert to bech32 format
const nsec = nip19.nsecEncode(privateKey);
const npub = nip19.npubEncode(publicKey);

// Store these securely - DO NOT log in production
console.log("Private Key (nsec):", nsec);
console.log("Public Key (npub):", npub);

// Immediately clear from memory
privateKey.fill(0);
```

## API Usage

### Send OTP

```http
POST /api/auth/otp/initiate
Content-Type: application/json

{
  "npub": "npub1...",
  "nip05": "user@domain.com"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "message": "OTP sent successfully via Nostr DM from Rebuilding Camelot",
    "otpKey": "npub1..._1234567890",
    "npub": "npub1...",
    "nip05": "user@domain.com",
    "expiresIn": 600,
    "messageId": "event_id_hash",
    "sentVia": "nostr-dm",
    "sender": "RebuildingCamelot@satnam.pub"
  },
  "meta": {
    "timestamp": "2024-01-01T12:00:00.000Z",
    "production": true
  }
}
```

### Verify OTP

```http
POST /api/auth/otp/verify
Content-Type: application/json

{
  "otpKey": "npub1..._1234567890",
  "otp": "123456"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "authenticated": true,
    "sessionToken": "secure_session_token",
    "userAuth": {
      "npub": "npub1...",
      "nip05": "user@domain.com",
      "federationRole": "member",
      "authMethod": "otp",
      "isWhitelisted": true,
      "votingPower": 1,
      "guardianApproved": true
    },
    "message": "OTP verification successful",
    "verificationMethod": "database",
    "otpSender": "RebuildingCamelot@satnam.pub"
  }
}
```

## Security Features

### 1. Encrypted Storage

- Private keys stored in Supabase Vault with encryption at rest
- OTP codes hashed with salt before database storage
- No plaintext sensitive data in logs or responses

### 2. Access Control

- Vault functions restricted to service role only
- Row Level Security on OTP verification table
- Rate limiting on authentication endpoints

### 3. Expiration & Cleanup

- OTPs expire after 10 minutes by default
- Automatic cleanup of expired records
- Used OTPs are marked and cannot be reused

### 4. Multi-Layer Verification

- Database-backed verification as primary method
- Legacy in-memory verification as fallback
- Comprehensive logging for security monitoring

## Testing

### Run Tests

```bash
# Test the OTP system
npm run test:rebuilding-camelot

# Test specific components
npm run test:backend
```

### Manual Testing

1. Set up a test Nostr account
2. Add the test npub to federation whitelist
3. Request OTP via API
4. Check your Nostr client for the DM
5. Verify the OTP via API

## Monitoring & Maintenance

### Database Queries

Check OTP verification attempts:

```sql
SELECT * FROM otp_verification_attempts
ORDER BY created_at DESC
LIMIT 10;
```

Check active OTPs:

```sql
SELECT recipient_npub, expires_at, used
FROM family_otp_verification
WHERE expires_at > NOW()
ORDER BY created_at DESC;
```

### Cleanup Operations

Manual cleanup of expired OTPs:

```sql
SELECT cleanup_expired_otps();
```

Check vault secrets:

```sql
SELECT name, description, created_at
FROM vault.secrets
WHERE name LIKE 'rebuilding_camelot%';
```

## Troubleshooting

### Common Issues

1. **"Vault functions not found"**

   - Ensure Supabase Vault extension is enabled
   - Run the migration script
   - Check service role permissions

2. **"Failed to send OTP DM"**

   - Verify Nostr relay connectivity
   - Check private key format in vault
   - Ensure recipient npub is valid

3. **"OTP verification failed"**
   - Check OTP expiration time
   - Verify salt configuration
   - Check database table exists

### Debug Mode

Enable debug logging by setting:

```env
NODE_ENV=development
DEBUG=nostr-otp:*
```

## Migration from Legacy System

The system supports both database-backed and legacy in-memory OTP verification during the transition period. The verification process:

1. First attempts database verification (new system)
2. Falls back to in-memory verification (legacy system)
3. Logs which method was used for monitoring

To complete migration:

1. Ensure all new OTPs use the database system
2. Monitor verification method logs
3. Remove legacy in-memory storage when confident

## Contributing

When contributing to the OTP system:

1. **Security First**: All changes must maintain security standards
2. **Test Coverage**: Add tests for new functionality
3. **Documentation**: Update this README for any changes
4. **Backward Compatibility**: Maintain compatibility during transitions

## Support

For issues with the Rebuilding Camelot OTP system:

1. Check the troubleshooting section above
2. Review logs for error messages
3. Test with the provided test scripts
4. Verify Supabase configuration

---

_🏰 "In the realm of sovereign identity, every castle needs a trusted messenger."_
