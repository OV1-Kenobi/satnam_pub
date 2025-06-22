# Cross-Mint API Endpoints

This directory contains API endpoints for cross-mint Cashu operations, enabling users to interact with multiple Cashu mints seamlessly.

## Endpoints

### 1. Multi-Nut Payment (`/api/individual/cross-mint/multi-nut-payment`)

**Method:** POST

Creates a payment that automatically uses multiple mints for optimal privacy and liquidity.

**Request Body:**

```json
{
  "memberId": "string",
  "amount": "number",
  "recipient": "string",
  "memo": "string (optional)",
  "mintPreference": "satnam-first | external-first | balanced (optional)"
}
```

**Response:**

```json
{
  "success": true,
  "paymentId": "string",
  "totalAmount": "number",
  "mintSources": [
    {
      "mint": "string",
      "amount": "number"
    }
  ],
  "status": "pending | completed | failed",
  "created": "ISO string"
}
```

### 2. Nut Swap (`/api/individual/cross-mint/nut-swap`)

**Method:** POST

Swaps tokens between different mints for better distribution and privacy.

**Request Body:**

```json
{
  "memberId": "string",
  "fromMint": "string",
  "toMint": "string",
  "amount": "number"
}
```

**Response:**

```json
{
  "success": true,
  "swapId": "string",
  "fromMint": "string",
  "toMint": "string",
  "amount": "number",
  "status": "pending | completed | failed",
  "created": "ISO string"
}
```

### 3. Receive External Nuts (`/api/individual/cross-mint/receive-external`)

**Method:** POST

Imports Cashu tokens from external mints with configurable storage preferences.

**Request Body:**

```json
{
  "memberId": "string",
  "externalToken": "string",
  "storagePreference": "satnam-mint | keep-external | auto (optional)"
}
```

**Response:**

```json
{
  "success": true,
  "amount": "number",
  "sourceMint": "string",
  "destinationMint": "string",
  "storagePreference": "string",
  "processed": "ISO string"
}
```

### 4. Cross-Mint Wallet Data (`/api/individual/cross-mint/wallet`)

**Method:** GET

Retrieves comprehensive cross-mint wallet data including balances, transaction history, and supported mints.

**Query Parameters:**

- `memberId`: string (required)

**Response:**

```json
{
  "externalMintBalances": {
    "mint_url": "number"
  },
  "supportedMints": ["string"],
  "multiNutPayments": [
    {
      "id": "string",
      "totalAmount": "number",
      "mintSources": [
        {
          "mint": "string",
          "amount": "number"
        }
      ],
      "status": "pending | completed | failed",
      "created": "ISO string"
    }
  ],
  "nutSwapHistory": [
    {
      "id": "string",
      "fromMint": "string",
      "toMint": "string",
      "amount": "number",
      "status": "pending | completed | failed",
      "created": "ISO string"
    }
  ]
}
```

## Supported Mints

- `https://mint.satnam.pub` - Satnam Family Mint (primary)
- `https://mint.minibits.cash` - Minibits Mint
- `https://mint.coinos.io` - Coinos Mint
- `https://mint.bitcoinmints.com` - Bitcoin Mints

## Error Handling

All endpoints return consistent error responses:

```json
{
  "error": "Error message",
  "success": false
}
```

Common HTTP status codes:

- `400` - Bad Request (validation errors)
- `405` - Method Not Allowed
- `500` - Internal Server Error

## Security Considerations

1. **Input Validation**: All inputs are validated for type, format, and reasonable limits
2. **Amount Limits**: Maximum transaction amount is 1,000,000 sats
3. **Mint Validation**: Only whitelisted mints are supported
4. **Token Validation**: Cashu tokens are validated before processing

## Integration Notes

These endpoints are designed to work with the `SatnamCrossMintCashuManager` class and integrate seamlessly with the Individual Finances Dashboard's cross-mint functionality.

For frontend integration, use the `IndividualApiService` methods:

- `createMultiNutPayment()`
- `performNutSwap()`
- `receiveExternalNuts()`
- `getCrossMintWalletData()`
