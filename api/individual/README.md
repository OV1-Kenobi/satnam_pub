# Individual Finances API Endpoints

This directory contains API endpoints for individual wallet management, supporting both Lightning Network and Cashu eCash protocols.

## Endpoints Overview

### Main Wallet Endpoint

#### `GET /api/individual/wallet`

Retrieves the main wallet information for an individual member.

**Query Parameters:**

- `memberId` (string, required): The unique identifier for the family member

**Response:**

```json
{
  "memberId": "user123",
  "username": "user_user123",
  "lightningAddress": "user_user123@satnam.pub",
  "lightningBalance": 75000,
  "ecashBalance": 25000,
  "spendingLimits": {
    "daily": 10000,
    "weekly": 50000,
    "requiresApproval": 100000
  },
  "recentTransactions": [...],
  "privacySettings": {
    "defaultRouting": "lightning",
    "lnproxyEnabled": true,
    "guardianProtected": true
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

## Security Considerations

- All endpoints should implement proper authentication
- Rate limiting should be applied to prevent abuse
- Spending limits should be enforced before processing payments
- Guardian approval should be required for large transactions when enabled
- All sensitive operations should be logged for audit purposes

## Integration Notes

These endpoints are designed to work with the `IndividualFinancesDashboard` React component, providing a complete dual-protocol wallet management system that supports both Lightning Network and Cashu eCash protocols.
