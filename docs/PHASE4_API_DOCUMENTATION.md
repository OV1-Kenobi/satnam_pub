# Phase 4: Family Foundry API Documentation

**Date**: December 1, 2025
**Version**: 1.0
**Status**: PRODUCTION READY

---

## 📡 API ENDPOINTS

### POST /api/family/foundry

Create a new family federation with FROST threshold configuration and NFC MFA policies.

**Endpoint**: `POST /api/family/foundry`

**Authentication**: Required (X-User-ID header)

**Request Headers**:
```
Content-Type: application/json
X-User-ID: <user-id>
```

---

## 📥 REQUEST BODY

```typescript
{
  charter: {
    familyName: string,           // Required: 2+ characters
    familyMotto?: string,         // Optional: Family motto
    foundingDate: string,         // Required: ISO date (YYYY-MM-DD)
    missionStatement?: string,    // Optional: Family mission
    values?: string[]             // Optional: Core family values
  },
  rbac: {
    roles: Array<{
      id: string,                 // 'guardian'|'steward'|'adult'|'offspring'
      name: string,               // Display name
      description: string,        // Role description
      rights: string[],           // Role permissions
      responsibilities: string[], // Role duties
      rewards: string[],          // Role benefits
      hierarchyLevel: number      // 1-4 (1=highest)
    }>,
    frostThreshold?: number       // 1-5 (default: 2)
  },
  members: Array<{
    user_duid: string,            // User's privacy-first identifier
    role: string                  // Role assignment
  }>
}
```

---

## 📤 RESPONSE BODY

### Success Response (201 Created)

```typescript
{
  success: true,
  message: "Family foundry created successfully",
  data: {
    charterId: string,                    // Charter identifier
    federationId: string,                 // Federation UUID
    federationDuid: string,               // Privacy-first federation identifier
    familyName: string,                   // Family name
    foundingDate: string,                 // ISO date
    status: 'active',                     // Federation status
    frostThreshold: number,               // FROST signing threshold (1-5)
    nfcMfaPolicy: string,                 // NFC MFA enforcement policy
    nfcMfaAmountThreshold: number         // Amount threshold in satoshis
  },
  meta: {
    timestamp: string,                    // ISO timestamp
    environment: string                   // 'production'|'development'
  }
}
```

### Error Response (400/401/500)

```typescript
{
  success: false,
  error: string,                          // Error message
  details?: Array<{
    field: string,                        // Field with error
    message: string                       // Error description
  }>,
  meta: {
    timestamp: string                     // ISO timestamp
  }
}
```

---

## 🔍 VALIDATION RULES

### Charter Validation

- `familyName`: 2-255 characters, required
- `foundingDate`: Valid ISO date, not in future
- `familyMotto`: String, optional
- `missionStatement`: String, optional
- `values`: Array of strings, optional

### RBAC Validation

- `roles`: Array of role definitions, required
- Each role must have:
  - `id`: One of 'guardian', 'steward', 'adult', 'offspring'
  - `name`: Non-empty string
  - `hierarchyLevel`: 1-4 (1=highest authority)

### FROST Threshold Validation

- Range: 1-5 (default: 2)
- Participants: 2-7
- Threshold ≤ participant count
- Error if threshold > 5 or < 1

### Member Validation

- `user_duid`: Valid privacy-first identifier
- `role`: Valid Master Context role
- Minimum 2 members required
- Maximum 7 members supported

---

## 🎯 FROST THRESHOLD CONFIGURATION

### Supported Configurations

| Threshold | Participants | Security | Use Case |
|-----------|--------------|----------|----------|
| 1 | 2 | Low | Minimum (fastest) |
| 2 | 3 | Medium | Recommended (default) |
| 3 | 4 | High | Enhanced |
| 4 | 5 | Very High | Strict |
| 5 | 7 | Maximum | Maximum (slowest) |

### Example: 3-of-4 Configuration

```json
{
  "rbac": {
    "roles": [...],
    "frostThreshold": 3
  },
  "members": [
    {"user_duid": "user_1", "role": "guardian"},
    {"user_duid": "user_2", "role": "steward"},
    {"user_duid": "user_3", "role": "steward"},
    {"user_duid": "user_4", "role": "adult"}
  ]
}
```

---

## 🔐 NFC MFA POLICY CONFIGURATION

### Automatic Configuration

NFC MFA policies are automatically configured based on member count:

- **1-3 members**: 100,000 sats threshold
- **4-6 members**: 250,000 sats threshold
- **7+ members**: 500,000 sats threshold

### Policy Types

- `disabled`: NFC MFA not required
- `optional`: NFC MFA optional
- `required_for_high_value`: NFC MFA for operations > threshold
- `required_for_all`: NFC MFA required for all operations

---

## 📊 RESPONSE EXAMPLES

### Example 1: 2-of-3 Federation (Default)

```bash
curl -X POST https://api.satnam.pub/api/family/foundry \
  -H "Content-Type: application/json" \
  -H "X-User-ID: user_123" \
  -d '{
    "charter": {
      "familyName": "Smith Family",
      "familyMotto": "Together we thrive",
      "foundingDate": "2025-01-01",
      "missionStatement": "Build family wealth",
      "values": ["Trust", "Growth", "Security"]
    },
    "rbac": {
      "roles": [...],
      "frostThreshold": 2
    },
    "members": [
      {"user_duid": "user_1", "role": "guardian"},
      {"user_duid": "user_2", "role": "steward"},
      {"user_duid": "user_3", "role": "adult"}
    ]
  }'
```

**Response**:
```json
{
  "success": true,
  "message": "Family foundry created successfully",
  "data": {
    "charterId": "abc123",
    "federationId": "fed_uuid_123",
    "federationDuid": "fed_hash_abc",
    "familyName": "Smith Family",
    "foundingDate": "2025-01-01",
    "status": "active",
    "frostThreshold": 2,
    "nfcMfaPolicy": "required_for_high_value",
    "nfcMfaAmountThreshold": 100000
  }
}
```

---

## ⚠️ ERROR CODES

| Code | Error | Cause |
|------|-------|-------|
| 400 | Invalid charter definition | Missing/invalid charter fields |
| 400 | Invalid RBAC definition | Invalid role hierarchy |
| 400 | Invalid FROST threshold | Threshold out of range (1-5) |
| 401 | Authentication required | Missing X-User-ID header |
| 405 | Method not allowed | Non-POST request |
| 500 | Database operation failed | Server error |

---

## 🔄 INTEGRATION FLOW

1. **Frontend**: User completes wizard (Charter → RBAC → Invite → Review)
2. **Frontend**: Sends POST request with charter, RBAC, and members
3. **Backend**: Validates all inputs
4. **Backend**: Creates family charter record
5. **Backend**: Creates family federation with FROST/NFC config
6. **Backend**: Returns federation details
7. **Frontend**: Stores federation ID and displays success

---

## 📝 NOTES

- All timestamps in ISO 8601 format
- FROST threshold defaults to 2 if not specified
- NFC MFA policy automatically configured
- Privacy-first DUID system prevents social graph analysis
- All operations logged to federation_audit_log
- RLS policies enforce access control

**Status**: ✅ **PRODUCTION READY**

