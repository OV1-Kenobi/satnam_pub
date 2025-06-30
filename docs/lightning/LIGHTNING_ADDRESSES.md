# Lightning Addresses for Satnam.pub Family Banking

## Overview

Lightning Addresses provide email-like Bitcoin payment addresses for your family members. Instead of sharing complex Lightning invoices, family members can simply share their Lightning Address (e.g., `daughter@satnam.pub`) to receive payments.

## Features

- **Email-like Addresses**: `username@satnam.pub` format for easy sharing
- **Nostr Zaps Integration**: Automatic support for Nostr Zaps with privacy protection
- **Family Role-Based Limits**: Different payment limits based on family member roles
- **Privacy Protection**: All payments use LNProxy privacy layer by default
- **LNURL-Pay Standard**: Full compatibility with Lightning wallets and services
- **Comment Support**: Allow payment memos up to 280 characters
- **Real-time Invoice Generation**: Dynamic invoice creation with current limits

## Architecture

```
Sender Wallet → LNURL Discovery → Invoice Generation → Privacy-Wrapped Payment
     ↓              ↓                    ↓                    ↓
Lightning Address   Family Member      LNbits Invoice      Your Node
   (External)      Validation         + Privacy Layer    (Anonymous)
```

## Setup

### 1. Environment Configuration

Add to your `.env` file:

```bash
# Lightning Address Domain (optional - defaults to satnam.pub)
VITE_LIGHTNING_ADDRESS_DOMAIN=satnam.pub
LIGHTNING_ADDRESS_DOMAIN=satnam.pub

# Required for Lightning functionality
VITE_VOLTAGE_LNBITS_URL=https://your-lnbits-instance.com
VITE_VOLTAGE_LNBITS_ADMIN_KEY=your_admin_key_here

# Required for privacy layer
VITE_LNPROXY_URL=https://lnproxy.org
```

### 2. Family Member Setup

Ensure family members have usernames configured:

```typescript
import { addFamilyMember } from "@/lib/family-api";

await addFamilyMember({
  name: "Alice",
  username: "daughter", // Creates daughter@satnam.pub
  role: "child",
  dailyLimit: 5000, // 5000 sats daily limit
  nostrPubkey: "npub1...", // Optional: enables Nostr Zaps
});
```

### 3. Domain Configuration

Configure your domain to serve the Lightning Address endpoints:

```nginx
# Nginx configuration
location /.well-known/lnurlp/ {
    proxy_pass http://localhost:3000/api/lnurl/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}

location /api/lnurl/ {
    proxy_pass http://localhost:3000/api/lnurl/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

## API Endpoints

### LNURL Discovery: `GET /api/lnurl/{username}`

Returns LNURL-pay information for a family member.

**Example Request:**

```bash
curl https://satnam.pub/api/lnurl/daughter
```

**Example Response:**

```json
{
  "callback": "https://satnam.pub/api/lnurl/daughter/callback",
  "maxSendable": 5000000,
  "minSendable": 1000,
  "metadata": "[
    [\"text/identifier\", \"daughter@satnam.pub\"],
    [\"text/plain\", \"Payment to Alice - Satnam Family Banking\"],
    [\"text/long-desc\", \"Sovereign family banking with privacy protection\"]
  ]",
  "tag": "payRequest",
  "commentAllowed": 280,
  "allowsNostr": true,
  "nostrPubkey": "npub1234567890abcdef"
}
```

### Invoice Generation: `GET /api/lnurl/{username}/callback`

Generates Lightning invoices for payments.

**Example Request:**

```bash
curl "https://satnam.pub/api/lnurl/daughter/callback?amount=1000000&comment=Weekly%20allowance"
```

**Example Response:**

```json
{
  "pr": "lnbc1000n1...privacy-wrapped-invoice",
  "status": "OK",
  "successAction": {
    "tag": "message",
    "message": "💰 Payment of 1000 sats sent to Alice at Satnam Family Banking!"
  },
  "disposable": true
}
```

## Usage Examples

### Basic Lightning Address Integration

```typescript
import {
  LightningAddressService,
  getLightningAddressInfo,
  generateLightningAddressPayment,
} from "@/lib/lightning-address";

const service = new LightningAddressService();

// Get Lightning Address info
const addressInfo = await service.getLightningAddressInfo("daughter");
console.log(`Address: ${addressInfo?.address}`);
console.log(
  `Limits: ${addressInfo?.limits.minSendable / 1000} - ${addressInfo?.limits.maxSendable / 1000} sats`,
);

// Generate payment invoice
const payment = await service.generatePaymentInvoice(
  "daughter",
  1000, // sats
  "Weekly allowance",
);

console.log(`Invoice: ${payment.invoice}`);
console.log(`Privacy enabled: ${payment.privacyEnabled}`);
```

### React Component Integration

```tsx
import React from "react";
import { LightningAddressManager } from "@/components";

function FamilyPaymentsApp() {
  return (
    <div>
      <h1>Satnam.pub Family Banking</h1>
      <LightningAddressManager />
    </div>
  );
}
```

### Nostr Zaps Integration

```typescript
// Handle Nostr Zap request
const nostrEvent = {
  kind: 9734,
  pubkey: "sender-pubkey",
  content: "Great family content!",
};

const zapPayment = await generateLightningAddressPayment(
  "daughter",
  2500, // 2500 sats
  "Zap for great content",
  nostrEvent,
);

console.log("⚡ Nostr Zap invoice generated!");
```

### Wallet Integration Example

```typescript
// For wallet developers integrating Lightning Addresses
async function payLightningAddress(
  address: string,
  amountSats: number,
  comment?: string,
) {
  // 1. Extract username and domain
  const [username, domain] = address.split("@");

  // 2. Fetch LNURL-pay info
  const lnurlResponse = await fetch(`https://${domain}/api/lnurl/${username}`);
  const lnurlData = await lnurlResponse.json();

  // 3. Validate amount
  const amountMillisats = amountSats * 1000;
  if (
    amountMillisats < lnurlData.minSendable ||
    amountMillisats > lnurlData.maxSendable
  ) {
    throw new Error("Amount outside allowed range");
  }

  // 4. Generate invoice
  const callbackUrl = new URL(lnurlData.callback);
  callbackUrl.searchParams.set("amount", amountMillisats.toString());
  if (comment) callbackUrl.searchParams.set("comment", comment);

  const invoiceResponse = await fetch(callbackUrl.toString());
  const invoiceData = await invoiceResponse.json();

  // 5. Pay the invoice
  return invoiceData.pr; // Lightning invoice to pay
}
```

## Payment Limits

Lightning Address payment limits are determined by family member roles:

| Role      | Default Max Limit | Customizable |
| --------- | ----------------- | ------------ |
| `parent`  | 100,000 sats      | ✅           |
| `teen`    | 50,000 sats       | ✅           |
| `child`   | 10,000 sats       | ✅           |
| `default` | 25,000 sats       | ✅           |

**Daily Limits Override Defaults:**
If a family member has a `dailyLimit` set, it takes precedence over role defaults.

```typescript
// Example: Teen with custom daily limit
{
  role: 'teen',
  dailyLimit: 15000 // 15,000 sats (overrides 50,000 default)
}
```

## Nostr Zaps Support

Lightning Addresses automatically support Nostr Zaps when family members have `nostrPubkey` configured:

### Features:

- **Automatic Zap Detection**: Recognizes Nostr events in callback requests
- **Privacy-Protected Zaps**: All zaps use privacy layer for anonymity
- **Zap Metadata**: Proper zap event handling and response formatting
- **Comment Support**: Zap comments included in payment descriptions

### Setup:

```typescript
await addFamilyMember({
  name: "Alice",
  username: "daughter",
  nostrPubkey: "npub1...", // Enables Nostr Zaps
  role: "child",
});
```

### Zap Flow:

1. Nostr client sends zap request to `daughter@satnam.pub`
2. Lightning Address validates zap event and amount
3. Privacy-wrapped invoice generated automatically
4. Payment processed with zap metadata preserved
5. Success message confirms zap delivery

## Security Features

### Privacy Protection

- **Node Identity Hidden**: LNProxy conceals your Lightning node's identity
- **Payment Path Obfuscation**: Routing path is anonymized
- **Graceful Fallback**: Continues working if privacy service is unavailable

### Input Validation

- **Username Sanitization**: Only alphanumeric, underscore, and hyphen allowed
- **Amount Validation**: Strict validation against family member limits
- **Comment Sanitization**: HTML/script content stripped from comments
- **Length Limits**: Comments limited to 280 characters

### Error Handling

- **Graceful Degradation**: System continues working even if components fail
- **Detailed Logging**: All operations logged for audit trails
- **Rate Limiting**: Built-in protection against abuse (configurable)

## Monitoring & Analytics

### Privacy Operations Logging

```typescript
// All Lightning Address operations are logged
{
  operation: 'lightning_address_payment',
  details: {
    username: 'daughter',
    amount: 1000,
    privacyEnabled: true,
    privacyFee: 2,
    hasNostrZap: false
  },
  timestamp: new Date()
}
```

### Health Monitoring

```typescript
// Check Lightning Address service health
const health = await lightningAddressService.checkHealth();
console.log(`Addresses available: ${health.addressCount}`);
console.log(`Privacy service: ${health.privacyEnabled ? "ON" : "OFF"}`);
```

### Usage Analytics

- Payment volumes by family member
- Privacy protection success rates
- Nostr Zap vs regular payment ratios
- Geographic payment origins (privacy-preserving)

## Troubleshooting

### Common Issues

**1. Lightning Address Not Found (404)**

```bash
# Check family member exists
curl https://satnam.pub/api/lnurl/daughter

# Verify username format (no special characters)
# Ensure family member has username set
```

**2. Amount Validation Errors**

```bash
# Check current limits
curl https://satnam.pub/api/lnurl/daughter

# Verify amount is within minSendable/maxSendable range
# Check daily limits haven't been exceeded
```

**3. Privacy Service Issues**

```typescript
// Test privacy layer health
const health = await lightningClient.checkPrivacyHealth();
if (!health.available) {
  console.log("Privacy service down, payments will work without privacy");
}
```

**4. Nostr Zaps Not Working**

- Verify `nostrPubkey` is set for family member
- Check Nostr event format in callback request
- Ensure `allowsNostr: true` in LNURL response

### Debug Mode

Enable debug logging for detailed troubleshooting:

```bash
DEBUG_LOGGING=true npm start
```

## Testing

### Unit Tests

```bash
# Run Lightning Address tests
npm run test:backend:vitest -- lightning-address

# Run API endpoint tests
npm run test:backend:vitest -- lightning-address-api
```

### Integration Testing

```bash
# Test full Lightning Address flow
npm run test:integration -- --pattern=lightning-address

# Test with real Lightning Address services
npm run test:lightning-address:integration
```

### Manual Testing

```bash
# Test LNURL discovery
curl https://satnam.pub/api/lnurl/daughter

# Test invoice generation
curl "https://satnam.pub/api/lnurl/daughter/callback?amount=1000000&comment=test"

# Test with Lightning wallet
# Send payment to daughter@satnam.pub using any LNURL-compatible wallet
```

## Production Deployment

### 1. Domain Setup

- Configure DNS for your domain
- Set up SSL certificates
- Configure web server to proxy Lightning Address endpoints

### 2. Environment Variables

```bash
# Production environment
LIGHTNING_ADDRESS_DOMAIN=yourdomain.com
VITE_VOLTAGE_LNBITS_URL=https://your-production-lnbits.com
VITE_LNPROXY_URL=https://lnproxy.org

# Security
NODE_ENV=production
ENABLE_PRIVACY_MODE=true
```

### 3. Monitoring Setup

- Set up alerts for Lightning Address endpoint availability
- Monitor privacy service health
- Track payment success rates
- Log analysis for usage patterns

### 4. Backup & Recovery

- Regular database backups of family member data
- LNbits wallet backup procedures
- Privacy layer configuration backup
- Disaster recovery testing

## Examples

See complete working examples in:

- `examples/lightning-address-demo.ts` - CLI demonstration
- `src/components/LightningAddressManager.tsx` - React component
- `api/__tests__/lightning-address-api.test.ts` - API integration tests

## Support

For issues or questions:

1. Check Lightning Address service health
2. Verify family member configuration
3. Test privacy layer connectivity
4. Review server logs for detailed error information
5. Check Lightning wallet compatibility with LNURL-pay standard

Lightning Addresses make Bitcoin payments as easy as sending an email while maintaining the privacy and sovereignty of your family's Lightning node! ⚡📧
