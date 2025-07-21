# Individual Finances API Endpoints

This directory contains API endpoints for individual wallet management, supporting Lightning Network, Cashu eCash protocols, and cross-mint operations with **Individual Wallet Sovereignty Principle** enforcement.

## 🏛️ Master Context Compliance

This API is **100% Master Context compliant** with comprehensive test coverage validating:

- ✅ **Individual Wallet Sovereignty Principle** enforcement
- ✅ **Privacy-first architecture** with zero-knowledge patterns
- ✅ **eCash bridge integration** (Fedimint↔Cashu conversion)
- ✅ **Cross-mint operations** with sovereignty validation
- ✅ **Standardized role hierarchy** support
- ✅ **Parent-offspring authorization** relationship handling

**Test Coverage**: See [`api/__tests__/api-endpoints.test.js`](../__tests__/api-endpoints.test.js) for comprehensive sovereignty compliance validation.

## Endpoints Overview

### Main Wallet Endpoint (Privacy-Enhanced)

#### `GET /api/individual/wallet`

Retrieves the privacy-enhanced wallet information for an individual member, including privacy settings, multiple eCash protocol balances, and transaction history with privacy metadata.

**Query Parameters:**

- `memberId` (string, required): The unique identifier for the family member

#### `POST /api/individual/wallet`

Updates privacy settings and spending limits for an individual member.

**Query Parameters:**

- `memberId` (string, required): The unique identifier for the family member

**Request Body:**

```json
{
  "privacySettings": {
    "defaultPrivacyLevel": "giftwrapped" | "encrypted" | "minimal",
    "allowMinimalPrivacy": boolean,
    "lnproxyEnabled": boolean,
    "cashuPreferred": boolean,
    "requireGuardianApproval": boolean
  },
  "spendingLimits": {
    "daily": number,
    "weekly": number,
    "requiresApproval": number
  }
}
```

**GET Response:**

```json
{
  "success": true,
  "data": {
    "memberId": "user123",
    "username": "user_user123",
    "lightningAddress": "user_user123@satnam.pub",
    "lightningBalance": 75000,
    "cashuBalance": 25000,
    "fedimintBalance": 12500,
    "privacySettings": {
      "defaultPrivacyLevel": "giftwrapped",
      "allowMinimalPrivacy": false,
      "lnproxyEnabled": true,
      "cashuPreferred": true,
      "requireGuardianApproval": false
    },
    "spendingLimits": {
      "daily": -1,
      "weekly": -1,
      "requiresApproval": -1
    },
    "recentTransactions": [
      {
        "id": "tx123",
        "type": "sent",
        "amount": 5000,
        "fee": 100,
        "timestamp": "2024-01-01T12:00:00Z",
        "status": "completed",
        "privacyLevel": "giftwrapped",
        "privacyRouting": true,
        "metadataProtectionLevel": 100,
        "memo": "Coffee payment",
        "counterparty": "merchant_123"
      }
    ]
  },
  "meta": {
    "timestamp": "2024-01-01T12:00:00Z",
    "privacyCompliant": true
  }
}
```

**POST Response:**

```json
{
  "success": true,
  "message": "Privacy settings updated successfully",
  "meta": {
    "timestamp": "2024-01-01T12:00:00Z",
    "privacyCompliant": true
  }
}
```

### Lightning Network Endpoints

#### `GET /api/individual/lightning/wallet`

Retrieves Lightning-specific wallet data including zap history and transactions.

**Query Parameters:**

- `memberId` (string, required): The unique identifier for the family member

**Response:**

```json
{
  "zapHistory": [
    {
      "id": "zap_1",
      "amount": 1000,
      "recipient": "npub1abc123...",
      "memo": "Great post! ⚡",
      "timestamp": "2024-01-15T10:30:00Z",
      "status": "completed"
    }
  ],
  "transactions": [
    {
      "id": "ln_tx_1",
      "type": "payment",
      "amount": 25000,
      "fee": 10,
      "recipient": "merchant@store.com",
      "memo": "Online purchase",
      "timestamp": "2024-01-15T09:30:00Z",
      "status": "completed",
      "paymentHash": "a1b2c3d4e5f6..."
    }
  ]
}
```

#### `POST /api/individual/lightning/zap`

Sends a Lightning zap (Nostr payment) to a recipient.

**Request Body:**

```json
{
  "memberId": "user123",
  "amount": 1000,
  "recipient": "npub1abc123... or user@domain.com",
  "memo": "Optional message"
}
```

**Response:**

```json
{
  "success": true,
  "zapId": "zap_1642234567_abc123",
  "amount": 1000,
  "recipient": "npub1abc123...",
  "memo": "Optional message",
  "status": "completed",
  "timestamp": "2024-01-15T10:30:00Z",
  "fee": 1,
  "paymentHash": "a1b2c3d4e5f6..."
}
```

### Cashu eCash Endpoints

#### `GET /api/individual/cashu/wallet`

Retrieves Cashu-specific wallet data including bearer instruments and transactions.

**Query Parameters:**

- `memberId` (string, required): The unique identifier for the family member

**Response:**

```json
{
  "bearerInstruments": [
    {
      "id": "bearer_1",
      "amount": 10000,
      "formFactor": "qr",
      "created": "2024-01-14T10:30:00Z",
      "redeemed": false,
      "token": "cashuAbc123..."
    }
  ],
  "transactions": [
    {
      "id": "cashu_tx_1",
      "type": "mint",
      "amount": 25000,
      "fee": 0,
      "memo": "Lightning to Cashu conversion",
      "timestamp": "2024-01-15T09:30:00Z",
      "status": "completed",
      "tokenId": "token_abc123..."
    }
  ]
}
```

#### `POST /api/individual/cashu/bearer`

Creates a new Cashu bearer instrument (gift, QR code, NFC tag, or DM).

**Request Body:**

```json
{
  "memberId": "user123",
  "amount": 10000,
  "formFactor": "qr", // "qr", "nfc", "dm", or "physical"
  "recipientNpub": "npub1abc123..." // Required only for "dm" formFactor
}
```

**Response:**

```json
{
  "success": true,
  "bearerId": "bearer_1642234567_abc123",
  "amount": 10000,
  "formFactor": "qr",
  "token": "cashuAbc123def456...",
  "created": "2024-01-15T10:30:00Z",
  "redeemed": false,
  "qrCode": "data:image/png;base64,..." // Only for QR formFactor
}
```

## Form Factors for Bearer Instruments

### QR Code (`qr`)

- Creates a printable QR code containing the Cashu token
- Returns base64-encoded PNG image in response
- Suitable for physical sharing or digital display

### NFC Tag (`nfc`)

- Provides NFC data structure for writing to NFC tags
- Returns NDEF format instructions
- Enables tap-to-redeem functionality

### Gift Wrapped DM (`dm`)

- Sends the bearer token via Nostr DM to specified recipient
- Requires `recipientNpub` parameter
- Returns DM sending status

### Physical (`physical`)

- Creates token for manual/physical distribution
- Returns raw token string for custom implementation
- Suitable for integration with physical devices

## Cross-Mint API Endpoints (eCash Bridge Integration)

The cross-mint system enables seamless operations across multiple eCash protocols (Fedimint, Cashu, Satnam Mint) with **Individual Wallet Sovereignty Principle** enforcement.

### Multi-Nut Payment (`POST /api/individual/cross-mint/multi-nut-payment`)

Creates payments that automatically use multiple mints for optimal privacy and liquidity distribution.

**Request Body:**

```json
{
  "memberId": "string",
  "amount": "number",
  "recipient": "string",
  "memo": "string (optional)",
  "mintPreference": "satnam-first | external-first | balanced (optional)",
  "userRole": "private | offspring | adult | steward | guardian (optional)"
}
```

**Response:**

```json
{
  "success": true,
  "paymentId": "payment_abc123def456",
  "totalAmount": 100000,
  "mintSources": [
    {
      "mint": "https://mint.satnam.pub",
      "amount": 50000,
      "protocol": "satnam"
    },
    {
      "mint": "https://mint.fedimint.org",
      "amount": 50000,
      "protocol": "fedimint"
    }
  ],
  "status": "pending",
  "created": "2024-01-15T10:30:00Z"
}
```

**Sovereignty Enforcement:**

- **Adults/Stewards/Guardians**: Unlimited cross-mint payments (no authorization required)
- **Offspring**: Subject to spending limits and parent approval requirements
- **Private**: Full autonomy over individual cross-mint operations

### Nut Swap - Fedimint↔Cashu Conversion (`POST /api/individual/cross-mint/nut-swap`)

Performs atomic swaps between different eCash protocols for privacy enhancement and liquidity optimization.

**Request Body:**

```json
{
  "memberId": "string",
  "fromMint": "https://mint.fedimint.org",
  "toMint": "https://mint.cashu.org",
  "amount": "number",
  "fromProtocol": "fedimint | cashu | satnam",
  "toProtocol": "fedimint | cashu | satnam",
  "userRole": "private | offspring | adult | steward | guardian (optional)"
}
```

**Response:**

```json
{
  "success": true,
  "swapId": "swap_abc123def456",
  "fromMint": "https://mint.fedimint.org",
  "toMint": "https://mint.cashu.org",
  "amount": 50000,
  "status": "pending",
  "created": "2024-01-15T10:30:00Z",
  "fee": 50
}
```

**eCash Bridge Features:**

- **Fedimint→Cashu**: Convert federation tokens to bearer instruments
- **Cashu→Fedimint**: Convert bearer instruments to federation shares
- **Satnam↔External**: Bridge between Satnam mint and external protocols
- **Atomic Operations**: Guaranteed swap completion or full rollback
- **Privacy Preservation**: No cross-protocol metadata leakage

### Receive External Nuts (`POST /api/individual/cross-mint/receive-external`)

Imports eCash tokens from external mints with configurable storage preferences.

**Request Body:**

```json
{
  "memberId": "string",
  "externalToken": "cashuABCDEF123456789",
  "storagePreference": "satnam-mint | keep-external | auto (optional)",
  "userRole": "private | offspring | adult | steward | guardian (optional)"
}
```

**Response:**

```json
{
  "success": true,
  "amount": 25000,
  "sourceMint": "https://mint.external.com",
  "destinationMint": "https://mint.satnam.pub",
  "sourceProtocol": "cashu",
  "destinationProtocol": "satnam",
  "created": "2024-01-15T10:30:00Z"
}
```

### Cross-Mint Wallet (`GET /api/individual/cross-mint/wallet`)

Retrieves cross-mint wallet information with sovereignty-compliant spending limits.

**Query Parameters:**

- `memberId` (string, required): Member identifier
- `userRole` (string, optional): User role for sovereignty validation

**Response:**

```json
{
  "memberId": "user123",
  "userRole": "adult",
  "supportedProtocols": {
    "fedimint": {
      "enabled": true,
      "balance": 150000
    },
    "cashu": {
      "enabled": true,
      "balance": 75000,
      "availableMints": ["https://mint.cashu.org", "https://mint.minibits.cash"]
    },
    "satnamMint": {
      "enabled": true,
      "balance": 250000,
      "url": "https://mint.satnam.pub"
    }
  },
  "crossMintLimits": {
    "daily": -1,
    "weekly": -1,
    "perTransaction": -1
  },
  "recentCrossMintTransactions": [
    {
      "id": "tx_001",
      "type": "swap",
      "fromProtocol": "cashu",
      "toProtocol": "fedimint",
      "amount": 10000,
      "status": "completed",
      "timestamp": "2024-01-15T09:30:00Z"
    }
  ]
}
```

**Cross-Mint Sovereignty Limits:**

- **Sovereign Roles** (Private/Adult/Steward/Guardian): `-1` values = unlimited cross-mint operations
- **Offspring Accounts**: Positive values = enforced limits with parent approval requirements

## Error Handling

All endpoints return appropriate HTTP status codes:

- `200`: Success
- `400`: Bad Request (missing/invalid parameters)
- `405`: Method Not Allowed
- `500`: Internal Server Error

Error responses include descriptive messages:

```json
{
  "error": "Member ID is required"
}
```

## Individual Wallet Sovereignty Principle (Master Context Compliant)

**CRITICAL**: This API enforces the **Individual Wallet Sovereignty Principle** as documented in the Master Context, with comprehensive test coverage validating sovereignty compliance across all endpoints.

### 🏛️ Sovereignty Architecture

**FUNDAMENTAL PRINCIPLE**: Individual wallet sovereignty is **completely separate** from Family Federation management authority. Stewards and Guardians manage family structure and shared resources, but have **NO control** over individual member wallets.

### Sovereign Roles (Unlimited Individual Wallet Operations)

#### **Private Users**

- **Status**: Autonomous users not part of any Family Federation
- **Individual Wallet Authority**: Unlimited spending (`-1` values)
- **Cross-Mint Operations**: Unlimited across all protocols (Fedimint, Cashu, Satnam)
- **Approval Requirements**: None for individual wallet operations

#### **Adults**

- **Status**: Full individual wallet sovereignty within Family Federation
- **Individual Wallet Authority**: Unlimited spending (`-1` values)
- **Cross-Mint Operations**: Unlimited across all protocols
- **Approval Requirements**: None for individual wallet operations
- **Family Authority**: Can create and manage Offspring accounts

#### **Stewards**

- **Status**: Family Federation management role with individual wallet sovereignty
- **Individual Wallet Authority**: Unlimited spending (`-1` values)
- **Cross-Mint Operations**: Unlimited across all protocols
- **Approval Requirements**: None for individual wallet operations
- **Family Authority**: Can manage family structure and shared resources
- **Individual Wallet Control**: **NO control** over other members' individual wallets

#### **Guardians**

- **Status**: Highest Family Federation role with individual wallet sovereignty
- **Individual Wallet Authority**: Unlimited spending (`-1` values)
- **Cross-Mint Operations**: Unlimited across all protocols
- **Approval Requirements**: None for individual wallet operations
- **Family Authority**: Can manage all family operations and emergency recovery
- **Individual Wallet Control**: **NO control** over other members' individual wallets

### Controlled Accounts (Parent-Offspring Authorization)

#### **Offspring**

- **Status**: Accounts created by Adults with spending oversight
- **Individual Wallet Authority**: Subject to spending limits (positive values)
- **Cross-Mint Operations**: Subject to limits and approval requirements
- **Approval Requirements**: Parent approval required above configured thresholds
- **Creating Adult Authority**: Only the creating Adult can modify spending limits

### Configuration Standards

```json
// ✅ CORRECT: Sovereign role configuration
{
  "spendingLimits": {
    "daily": -1,        // Unlimited individual wallet spending
    "weekly": -1,       // Unlimited individual wallet spending
    "requiresApproval": -1  // No approval required for individual wallet
  }
}

// ✅ CORRECT: Offspring configuration
{
  "spendingLimits": {
    "daily": 50000,     // 50K sats daily limit
    "weekly": 200000,   // 200K sats weekly limit
    "requiresApproval": 10000  // Requires parent approval above 10K sats
  }
}
```

**SOVEREIGNTY PRINCIPLE**: Individual wallet sovereignty is separate from Family Federation management authority. Stewards and Guardians manage family structure and shared resources, but have NO control over individual member wallets.

### 🧪 Sovereignty Compliance Test Coverage

**Comprehensive test validation** is provided in [`api/__tests__/api-endpoints.test.js`](../__tests__/api-endpoints.test.js):

#### Individual Wallet Sovereignty Tests

- ✅ **Adults/Stewards/Guardians**: Validate unlimited spending (`-1` values) without approval
- ✅ **Private Users**: Validate autonomous wallet operations without limits
- ✅ **Offspring Accounts**: Validate spending limits and parent approval requirements
- ✅ **Configuration Standards**: Validate `-1` value convention for unlimited sovereignty

#### Cross-Mint Operations Tests

- ✅ **Sovereign Roles**: Validate unlimited cross-mint operations across all protocols
- ✅ **eCash Bridge**: Validate Fedimint↔Cashu conversion with sovereignty compliance
- ✅ **Protocol Support**: Validate multi-protocol operations (Fedimint, Cashu, Satnam)
- ✅ **Privacy Preservation**: Validate no sensitive data logging in cross-mint operations

#### API Endpoint Tests

- ✅ **Individual Wallet API**: Validate sovereignty-compliant spending limits in responses
- ✅ **Lightning Network API**: Validate unlimited zap operations for sovereign roles
- ✅ **Cross-Mint API**: Validate all cross-mint endpoints with sovereignty enforcement
- ✅ **Error Handling**: Validate privacy-first error responses without sensitive data

#### System Integration Tests

- ✅ **Environment Variables**: Validate Master Context `getEnvVar()` pattern usage
- ✅ **Role Standardization**: Validate standardized role hierarchy across all endpoints
- ✅ **Privacy Architecture**: Validate zero-knowledge patterns and Web Crypto API usage
- ✅ **Serverless Compatibility**: Validate Netlify Functions handler patterns

**Run Tests**:

```bash
npm test api/__tests__/api-endpoints.test.js
```

## Security Considerations (Master Context Compliant)

### Authentication & Authorization

- ✅ **JWT Authentication**: All endpoints use JWT tokens with SecureSessionManager (no cookie-based auth)
- ✅ **Role-Based Access**: Standardized role hierarchy enforcement ('private'|'offspring'|'adult'|'steward'|'guardian')
- ✅ **Session Validation**: Proper session validation for individual wallet and cross-mint access
- ✅ **Vault Integration**: Vault-compatible credential management for sensitive operations

### Privacy-First Architecture

- ✅ **Zero-Knowledge Patterns**: No sensitive user data logging or exposure
- ✅ **Privacy-Preserving Hashing**: Web Crypto API for privacy-preserving user identification
- ✅ **Generic Error Messages**: No sensitive data exposure in error responses
- ✅ **Audit Logging**: Privacy-compliant audit logging without sensitive transaction data

### Individual Wallet Sovereignty Enforcement

- ✅ **SOVEREIGNTY**: Spending limits enforced ONLY for Offspring accounts, never for sovereign roles
- ✅ **Parent-Offspring Authorization**: Parent approval required ONLY for Offspring accounts from their creating Adult
- ✅ **Cross-Mint Sovereignty**: Unlimited cross-mint operations for Adults/Stewards/Guardians across all protocols
- ✅ **Configuration Validation**: `-1` values enforced for unlimited sovereignty in all API responses

### eCash Bridge Security

- ✅ **Protocol Validation**: Only whitelisted mint protocols supported (Fedimint, Cashu, Satnam)
- ✅ **Atomic Operations**: Guaranteed swap completion or full rollback for cross-mint operations
- ✅ **Token Validation**: Comprehensive eCash token validation before processing
- ✅ **Amount Limits**: Reasonable transaction limits with sovereignty override for sovereign roles

### Rate Limiting & Abuse Prevention

- ✅ **Rate Limiting**: Applied to prevent abuse while respecting sovereignty principles
- ✅ **Input Validation**: All inputs validated for type, format, and reasonable limits
- ✅ **Mint Validation**: Only whitelisted mints supported for cross-mint operations
- ✅ **Privacy-Preserving Monitoring**: System health monitoring without user data exposure

## Integration Notes

These endpoints are designed to work with the `IndividualFinancesDashboard` React component, providing a complete multi-protocol wallet management system that supports Lightning Network, Cashu eCash protocols, and cross-mint operations with Individual Wallet Sovereignty enforcement.

### React Component Integration

- **IndividualFinancesDashboard**: Main wallet management interface
- **Lightning Address Service**: Integration with `lib/lightning-address.ts`
- **Cross-Mint Manager**: Integration with `SatnamCrossMintCashuManager`
- **Privacy Controls**: Gift-wrapped messaging and bearer instrument management

### API Consumer Libraries

- **Lightning Address Service** (`lib/lightning-address.ts`): Consumes individual wallet APIs
- **Payment Automation** (`src/lib/payment-automation.ts`): Sovereignty-compliant payment processing
- **Cross-Mint Manager**: Multi-protocol eCash operations

## Related Documentation

### API Documentation

- **Cross-Mint API**: [`api/individual/cross-mint/README.md`](cross-mint/README.md) - Detailed cross-mint endpoint specifications
- **Federation API**: [`api/federation/README.md`](../federation/README.md) - Family Federation governance endpoints
- **Test Coverage**: [`api/__tests__/api-endpoints.test.js`](../__tests__/api-endpoints.test.js) - Comprehensive sovereignty compliance tests

### System Documentation

- **Master Context**: [`.zencoder/rules/MASTER_CONTEXT.md`](../../.zencoder/rules/MASTER_CONTEXT.md) - Individual Wallet Sovereignty Principle documentation
- **Lightning Integration**: [`docs/LIGHTNING_ADDRESSES.md`](../../docs/LIGHTNING_ADDRESSES.md) - Lightning Address system integration
- **Privacy Architecture**: [`docs/PRIVACY-PROTECTION.md`](../../docs/PRIVACY-PROTECTION.md) - Privacy-first architecture patterns

### Development Resources

- **Main README**: [`README.md`](../../README.md) - Project overview and quick start
- **Setup Guide**: [`docs/SETUP-GUIDE.md`](../../docs/SETUP-GUIDE.md) - Development environment setup
- **Security Guidelines**: [`docs/PRIVACY_FIRST_SECURITY.md`](../../docs/PRIVACY_FIRST_SECURITY.md) - Security best practices

---

**Last Updated**: January 2025
**API Version**: 1.0.0
**Master Context Compliance**: ✅ 100% Compliant
**Test Coverage**: ✅ Comprehensive Sovereignty Validation

---

_Individual Wallet Sovereignty: Empowering financial autonomy while preserving family coordination_
