# WebAuthn/FIDO2 Quick Start Guide

## 🚀 Getting Started

### 1. Enable Feature Flags

Set these environment variables in your Netlify environment:

```bash
VITE_WEBAUTHN_ENABLED=true
VITE_WEBAUTHN_PLATFORM_AUTHENTICATOR_ENABLED=false  # Set to true to allow Windows Hello, Touch ID, Face ID
```

### 2. Execute Database Migration

1. Go to Supabase SQL Editor
2. Copy the contents of `database/migrations/036_fido2_webauthn_support.sql`
3. Paste into SQL Editor
4. Click "Run"
5. Verify all 3 tables are created:
   - `webauthn_credentials`
   - `webauthn_challenges`
   - `webauthn_audit_log`

### 3. Test Registration

```typescript
import { WebAuthnRegistration } from '@/components';

export function RegisterSecurityKey() {
  return (
    <WebAuthnRegistration
      onSuccess={(credential) => {
        console.log('Registration successful:', credential);
      }}
      onError={(error) => {
        console.error('Registration failed:', error);
      }}
    />
  );
}
```

### 4. Test Authentication

```typescript
import { WebAuthnAuthentication } from '@/components';

export function AuthenticateWithSecurityKey() {
  return (
    <WebAuthnAuthentication
      nip05="user@satnam.pub"
      onSuccess={(sessionToken) => {
        console.log('Authentication successful');
        // Store session token and redirect
      }}
      onError={(error) => {
        console.error('Authentication failed:', error);
      }}
    />
  );
}
```

---

## 📱 Device Support

### Hardware Security Keys (Recommended)
- **YubiKey 5** - USB, NFC, Bluetooth
- **Google Titan** - USB, Bluetooth
- **Feitian ePass** - USB
- **Ledger Nano** - USB

### Platform Authenticators (Less Secure)
- **Windows Hello** - Biometric/PIN
- **Touch ID** - Biometric (macOS/iOS)
- **Face ID** - Biometric (iOS)

⚠️ **Warning**: Platform authenticators are less secure than hardware keys due to biometric risks. Users should prefer hardware keys.

---

## 🔐 API Reference

### Registration Endpoint

**POST** `/.netlify/functions/webauthn-register`

**Start Registration:**
```json
{
  "action": "start"
}
```

**Response:**
```json
{
  "success": true,
  "challenge": "base64-encoded-challenge",
  "rp": {
    "name": "Satnam.pub",
    "id": "satnam.pub"
  },
  "user": {
    "id": "user-duid",
    "name": "user@satnam.pub",
    "displayName": "User Name"
  },
  "pubKeyCredParams": [
    { "type": "public-key", "alg": -7 },
    { "type": "public-key", "alg": -257 }
  ],
  "timeout": 60000,
  "attestation": "direct",
  "authenticatorSelection": {
    "authenticatorAttachment": "cross-platform",
    "residentKey": "preferred",
    "userVerification": "preferred"
  }
}
```

**Complete Registration:**
```json
{
  "action": "complete",
  "deviceName": "My YubiKey",
  "deviceType": "roaming",
  "attestationObject": "base64-encoded-attestation",
  "clientDataJSON": "base64-encoded-client-data"
}
```

### Authentication Endpoint

**POST** `/.netlify/functions/webauthn-authenticate`

**Start Authentication:**
```json
{
  "action": "start",
  "nip05": "user@satnam.pub"
}
```

**Response:**
```json
{
  "success": true,
  "challenge": "base64-encoded-challenge",
  "allowCredentials": [
    {
      "id": "credential-id",
      "type": "public-key",
      "transports": ["usb", "nfc", "ble", "internal"]
    }
  ],
  "timeout": 60000,
  "userVerification": "preferred",
  "rpId": "satnam.pub"
}
```

**Complete Authentication:**
```json
{
  "action": "complete",
  "nip05": "user@satnam.pub",
  "assertionObject": "base64-encoded-assertion",
  "clientDataJSON": "base64-encoded-client-data"
}
```

---

## 🔍 Monitoring

### Check Audit Log

```sql
SELECT * FROM webauthn_audit_log
WHERE user_duid = 'user-duid'
ORDER BY created_at DESC
LIMIT 10;
```

### Detect Cloning

```sql
SELECT * FROM webauthn_audit_log
WHERE action = 'cloning_detected'
ORDER BY created_at DESC;
```

### View Active Credentials

```sql
SELECT 
  id,
  device_name,
  device_type,
  counter,
  last_used_at,
  is_active
FROM webauthn_credentials
WHERE user_duid = 'user-duid'
AND is_active = true;
```

---

## 🛠️ Troubleshooting

### "Rate limit exceeded"
- Wait 60 seconds before retrying
- Check IP address in audit log

### "Credential not found"
- Ensure credential is registered first
- Check if credential is marked as active

### "Cloning detected"
- Credential has been automatically disabled
- User should register a new credential
- Check audit log for details

### "Challenge expired"
- Challenge is only valid for 10 minutes
- Restart the registration/authentication flow

---

## 📊 Database Schema

### webauthn_credentials
```sql
id UUID PRIMARY KEY
user_duid TEXT NOT NULL (FK: user_identities)
credential_id TEXT NOT NULL UNIQUE
public_key_spki BYTEA NOT NULL
public_key_jwk JSONB NOT NULL
counter BIGINT NOT NULL DEFAULT 0
transports TEXT[]
device_name TEXT
device_type TEXT ('platform' | 'roaming')
attestation_type TEXT
aaguid TEXT
is_backup_eligible BOOLEAN
is_backup_state BOOLEAN
is_active BOOLEAN DEFAULT true
created_at TIMESTAMP
updated_at TIMESTAMP
last_used_at TIMESTAMP
```

### webauthn_challenges
```sql
id UUID PRIMARY KEY
user_duid TEXT NOT NULL (FK: user_identities)
challenge TEXT NOT NULL
challenge_type TEXT ('registration' | 'authentication')
expires_at TIMESTAMP NOT NULL
created_at TIMESTAMP
```

### webauthn_audit_log
```sql
id UUID PRIMARY KEY
user_duid TEXT NOT NULL (FK: user_identities)
action TEXT NOT NULL
credential_id TEXT
device_name TEXT
device_type TEXT
counter_value BIGINT
ip_address TEXT
user_agent TEXT
details JSONB
created_at TIMESTAMP
```

---

## 🔗 Integration with Auth

The WebAuthn components integrate seamlessly with the existing authentication system:

1. **Registration**: Add to onboarding flow after NIP-05 setup
2. **Authentication**: Offer as primary auth method before password fallback
3. **Session Management**: Uses existing SecureSessionManager
4. **JWT Tokens**: Compatible with existing token validation

---

## 📚 References

- [WebAuthn Specification](https://www.w3.org/TR/webauthn-2/)
- [FIDO2 Overview](https://fidoalliance.org/fido2/)
- [SimpleWebAuthn Library](https://simplewebauthn.dev/)
- [YubiKey Documentation](https://docs.yubico.com/)

---

**Ready to deploy! Follow the Getting Started section above.**

