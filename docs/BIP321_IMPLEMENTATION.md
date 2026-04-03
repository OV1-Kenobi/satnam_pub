# BIP-321 Unified Payment URI Implementation

## Overview

Satnam implements **BIP-321 Unified Payment URIs** to enable seamless multi-protocol Bitcoin payments across Lightning, Cashu, Fedimint, and Ark. This allows a single QR code or payment link to support multiple payment methods, with the wallet automatically selecting the best available option.

## What is BIP-321?

BIP-321 is a Bitcoin Improvement Proposal that extends BIP-21 to support modern payment protocols beyond on-chain transactions. It provides:

- **Multi-protocol support**: Lightning (BOLT11), Cashu, Fedimint, Ark, and on-chain
- **Graceful degradation**: Wallets use the first supported payment method
- **Proof of payment**: Built-in callback mechanism for payment verification
- **Backward compatibility**: Works with existing BIP-21 implementations

## Architecture

### Core Components

1. **BIP-321 URI Generator** (`netlify/functions/utils/bip321-uri-generator.ts`)
   - Generates standardized `bitcoin:` URIs with multiple payment options
   - Supports amount encoding, labels, messages, and proof-of-payment callbacks

2. **BIP-321 URI Parser** (`netlify/functions/utils/bip321-uri-generator.ts`)
   - Parses and validates BIP-321 URIs
   - Extracts payment methods and metadata

3. **Credit Envelope Integration** (`netlify/functions/agents/credit-envelope-lifecycle.ts`)
   - Automatically generates BIP-321 URIs for agent credit envelopes
   - Stores URIs in database for retrieval

4. **Proof-of-Payment Handler** (`netlify/functions/agents/payment-proof-callback.ts`)
   - Handles `satnam://payment-proof` deep link callbacks
   - Verifies payment proofs and triggers settlement

5. **Database Schema** (`supabase/migrations/20260223_bip321_payment_uris.sql`)
   - Stores payment URIs, QR codes, and payment method metadata

## Usage Examples

### Example 1: Lightning-Only Payment

```typescript
import { generateBIP321URI } from "./netlify/functions/utils/bip321-uri-generator";

const uri = generateBIP321URI({
  amount_sats: 1000,
  label: "agent-alice@ai.satnam.pub",
  message: "Payment for AI task completion",
  lightning_invoice: "lnbc1000n1p...",
  pop_callback_uri: "satnam://payment-proof?envelope_id=abc123",
});

// Result: bitcoin:?lightning=lnbc1000n1p...&amount=0.00001&label=agent-alice@ai.satnam.pub&message=Payment%20for%20AI%20task%20completion&pop=satnam%3A%2F%2Fpayment-proof%3Fenvelope_id%3Dabc123
```

### Example 2: Multi-Protocol Payment (Lightning + Cashu + Fedimint)

```typescript
const uri = generateBIP321URI({
  amount_sats: 5000,
  label: "family-allowance@satnam.pub",
  message: "Weekly allowance for offspring",
  lightning_invoice: "lnbc5000n1p...",
  cashu_token: "cashuAeyJ0b2tlbiI6...",
  fedimint_address: "fedimint1q...",
  pop_callback_uri: "satnam://payment-proof?envelope_id=xyz789",
});

// Wallet will choose the first supported method:
// 1. Try Lightning
// 2. Fall back to Cashu
// 3. Fall back to Fedimint
```

### Example 3: Required Payment Method

```typescript
const uri = generateBIP321URI({
  amount_sats: 10000,
  cashu_token: "cashuAeyJ0b2tlbiI6...",
  required_payment_methods: ["cashu"], // MUST use Cashu
  pop_callback_uri: "satnam://payment-proof?envelope_id=def456",
});

// Result: bitcoin:?req-cashu=cashuAeyJ0b2tlbiI6...
// Wallet MUST support Cashu or reject the payment
```

### Example 4: Parsing a BIP-321 URI

```typescript
import { parseBIP321URI } from "./netlify/functions/utils/bip321-uri-generator";

const parsed = parseBIP321URI(
  "bitcoin:?lightning=lnbc1000n1p...&cashu=cashuA...&amount=0.00001",
);

console.log(parsed);
// {
//   amount_sats: 1000,
//   amount_btc: 0.00001,
//   lightning_invoice: 'lnbc1000n1p...',
//   cashu_token: 'cashuA...',
//   required_payment_methods: [],
//   raw_params: { lightning: 'lnbc1000n1p...', cashu: 'cashuA...', amount: '0.00001' }
// }
```

## Credit Envelope Workflow

### 1. Agent Requests Credit Envelope

```bash
POST /netlify/functions/agents/credit-envelope-lifecycle
{
  "action": "credit_intent",
  "agent_id": "uuid-123",
  "scope": "l402:lunanode:compute:5min",
  "requested_amount_sats": 5000,
  "expires_in_seconds": 3600,
  "sig4sats_token": "cashuAeyJ0b2tlbiI6..." // Optional Cashu token
}
```

### 2. Platform Generates BIP-321 URI

The system automatically:

- Generates Lightning invoice
- Includes Cashu token (if provided)
- Generates Fedimint address
- Creates BIP-321 URI with all methods
- Stores URI in `credit_envelopes` table

Response:

```json
{
  "envelope_id": "abc-123",
  "status": "pending",
  "payment_uri": "bitcoin:?lightning=lnbc5000n1p...&cashu=cashuA...&fedimint=fedimint1q...&amount=0.00005&label=agent-alice@ai.satnam.pub&pop=satnam%3A%2F%2Fpayment-proof%3Fenvelope_id%3Dabc-123",
  "payment_methods_available": ["lightning", "cashu", "fedimint"],
  "qr_code_url": null
}
```

### 3. Client Generates QR Code

```typescript
import { generateQRCodeDataURL } from "@/utils/qr-code-browser";

const qrCode = await generateQRCodeDataURL(response.payment_uri, {
  size: 256,
  errorCorrectionLevel: "M",
});

// Display QR code to user
```

### 4. Wallet Scans and Pays

User scans QR code with any BIP-321 compatible wallet:

- Wallet parses URI and detects available methods
- Wallet selects preferred method (e.g., Lightning)
- User confirms payment
- Wallet pays via selected method

### 5. Proof-of-Payment Callback

After payment, wallet opens the `pop` callback URI:

```
satnam://payment-proof?envelope_id=abc-123&lightning=<hex_preimage>
```

The proof-of-payment handler:

- Verifies the payment proof
- Updates envelope with payment method used
- Triggers automatic settlement

## Database Schema

### credit_envelopes Table Additions

```sql
ALTER TABLE credit_envelopes ADD COLUMN payment_uri TEXT;
ALTER TABLE credit_envelopes ADD COLUMN payment_qr_code TEXT;
ALTER TABLE credit_envelopes ADD COLUMN payment_methods_available JSONB DEFAULT '[]';
ALTER TABLE credit_envelopes ADD COLUMN payment_method_used TEXT;
ALTER TABLE credit_envelopes ADD COLUMN pop_callback_received_at TIMESTAMPTZ;
```

## Integration with Existing Systems

### Sig4Sats Integration

BIP-321 URIs seamlessly integrate with Sig4Sats (Cashu tokens locked to Nostr signatures):

```typescript
const uri = generateBIP321URI({
  amount_sats: 1000,
  cashu_token: sig4satsToken, // Locked Cashu token
  lightning_invoice: fallbackInvoice,
  pop_callback_uri: "satnam://payment-proof?envelope_id=123",
});

// Wallet can choose:
// 1. Pay with Sig4Sats Cashu token (requires Nostr signature)
// 2. Fall back to Lightning
```

### Family Federation Payments

Guardians can generate unified payment URIs for offspring allowances:

```typescript
const allowanceURI = generateBIP321URI({
  amount_sats: 10000,
  label: "family-allowance@satnam.pub",
  lightning_invoice: familyLightningInvoice,
  cashu_token: familyMintToken,
  fedimint_address: familyFederationAddress,
  pop_callback_uri: "satnam://family-payment?federation_id=xyz",
});
```

## Testing

### Sample BIP-321 URIs

#### Lightning-Only (1000 sats)

```
bitcoin:?lightning=lnbc10000n1p3xnhl2pp5gc3xfm35w4mjnp3x6sq2h3y9vhxtsvxbe482yucmrt7uu8s3hl4cqhp5&amount=0.00001&label=agent-alice@ai.satnam.pub&message=Credit%20envelope%20for%20AI%20task&pop=satnam%3A%2F%2Fpayment-proof%3Fenvelope_id%3Dtest-123
```

#### Cashu-Only (5000 sats)

```
bitcoin:?cashu=cashuAeyJ0b2tlbiI6W3sicHJvb2ZzIjpbeyJpZCI6IjAwOWExZjI5MzI1M2U0MWUiLCJhbW91bnQiOjIsInNlY3JldCI6IjQwNzkxNWJjMjEyYmU2MWE3N2UzZTZkMmFlYjRjNzI3IiwiQyI6IjAyYmNlY2Y5MjY5MmFkODkxNDNjNmY4OGI0ZGE2YjU3YjA0YmJlNDM1YzI0MjIxMjc5NjQ2YjQ2YjJlZjVkMDljYSJ9XSwibWludCI6Imh0dHBzOi8vODMzMy5zcGFjZTozMzM4In1dfQ&amount=0.00005&label=agent-bob@ai.satnam.pub&pop=satnam%3A%2F%2Fpayment-proof%3Fenvelope_id%3Dtest-456
```

#### Multi-Protocol (10000 sats - Lightning + Cashu + Fedimint)

```
bitcoin:?lightning=lnbc100000n1p3xnhl2pp5gc3xfm35w4mjnp3x6sq2h3y9vhxtsvxbe482yucmrt7uu8s3hl4cqhp5&cashu=cashuAeyJ0b2tlbiI6W3sicHJvb2ZzIjpbeyJpZCI6IjAwOWExZjI5MzI1M2U0MWUiLCJhbW91bnQiOjIsInNlY3JldCI6IjQwNzkxNWJjMjEyYmU2MWE3N2UzZTZkMmFlYjRjNzI3IiwiQyI6IjAyYmNlY2Y5MjY5MmFkODkxNDNjNmY4OGI0ZGE2YjU3YjA0YmJlNDM1YzI0MjIxMjc5NjQ2YjQ2YjJlZjVkMDljYSJ9XSwibWludCI6Imh0dHBzOi8vODMzMy5zcGFjZTozMzM4In1dfQ&fedimint=fedimint1qgdq6w5leqg69u4gslha9tkqmnywkkq7&amount=0.0001&label=family-allowance@satnam.pub&message=Weekly%20allowance&pop=satnam%3A%2F%2Fpayment-proof%3Fenvelope_id%3Dtest-789
```

### Testing Checklist

- [ ] Generate BIP-321 URIs for Lightning-only payments
- [ ] Generate BIP-321 URIs for Cashu-only payments
- [ ] Generate BIP-321 URIs for multi-protocol payments
- [ ] Verify QR codes are scannable with standard QR readers
- [ ] Test with BIP-321 compatible wallets (Zeus, Phoenix, etc.)
- [ ] Verify proof-of-payment callback receives correct data
- [ ] Test payment verification for Lightning preimages
- [ ] Test payment verification for Cashu tokens
- [ ] Test payment verification for Fedimint transactions
- [ ] Verify envelope settlement triggers after proof verification
- [ ] Test graceful degradation (wallet tries methods in order)
- [ ] Test required payment methods (req- prefix)

## Production Deployment

### Prerequisites

1. **Lightning Node Integration**
   - Replace `generateLightningInvoice()` mock with actual Lightning node API
   - Recommended: PhoenixD, LNbits, or LND
   - Ensure invoice generation includes proper amount and description

2. **Fedimint Gateway Integration**
   - Replace `generateFedimintAddress()` mock with actual Fedimint gateway API
   - Configure federation connection details
   - Implement address generation and payment verification

3. **Cashu Mint Integration**
   - Already integrated via Sig4Sats system
   - Ensure Cashu wallet is properly configured
   - Verify token validation works correctly

4. **Deep Link Handler**
   - Register `satnam://` URL scheme in mobile app
   - Configure web handler for desktop browsers
   - Test deep link routing to proof-of-payment handler

### Environment Variables

```bash
# Lightning Node Configuration
VITE_LIGHTNING_NODE_URL=https://your-lightning-node.com
VITE_LIGHTNING_NODE_MACAROON=your_macaroon_here

# Fedimint Gateway Configuration
VITE_FEDIMINT_GATEWAY_URL=https://your-fedimint-gateway.com
VITE_FEDIMINT_FEDERATION_ID=your_federation_id

# Cashu Mint Configuration (already configured)
VITE_CASHU_MINT_URL=https://your-cashu-mint.com
```

## Future Enhancements

### Ark Protocol Support

When Ark protocol is ready, add support:

```typescript
const uri = generateBIP321URI({
  amount_sats: 50000,
  lightning_invoice: "lnbc...",
  ark_vtxo: "ark1q...", // Ark virtual UTXO
  pop_callback_uri: "satnam://payment-proof?envelope_id=abc",
});
```

### On-Chain Fallback

Add on-chain Bitcoin address as final fallback:

```typescript
const uri = generateBIP321URI({
  bitcoin_address: "bc1q...", // On-chain fallback
  lightning_invoice: "lnbc...",
  cashu_token: "cashuA...",
  amount_sats: 100000,
});
```

### AI Agent Payment Negotiation

Implement autonomous payment method selection:

```typescript
// Agent analyzes available methods and selects optimal one
const optimalMethod = await agent.negotiatePaymentMethod({
  available: ["lightning", "cashu", "fedimint"],
  amount: 5000,
  urgency: "high",
  privacy_preference: "maximum",
});

// Result: 'cashu' (best privacy) or 'lightning' (fastest)
```

## Security Considerations

1. **Proof-of-Payment Verification**
   - Always verify payment proofs cryptographically
   - Use constant-time comparisons to prevent timing attacks
   - Implement replay protection (store used proofs)

2. **Amount Validation**
   - Verify payment amount matches envelope amount
   - Reject overpayments and underpayments
   - Check for amount manipulation in URI

3. **Callback Security**
   - Validate callback origin
   - Use HTTPS for all callbacks
   - Implement rate limiting to prevent DoS

4. **Privacy Protection**
   - Don't leak payment method preferences
   - Use different addresses for each payment
   - Avoid correlating payments across methods

## References

- [BIP-321 Specification](https://github.com/bitcoin/bips/blob/master/bip-0321.mediawiki)
- [BIP-21 (Original Bitcoin URI Scheme)](https://github.com/bitcoin/bips/blob/master/bip-0021.mediawiki)
- [BOLT11 (Lightning Invoice Format)](https://github.com/lightning/bolts/blob/master/11-payment-encoding.md)
- [Cashu Protocol](https://github.com/cashubtc/nuts)
- [Fedimint Documentation](https://fedimint.org/docs)

## Support

For questions or issues with BIP-321 implementation:

- Open an issue on GitHub
- Contact the Satnam development team
- Join the Nostr community discussion

---

**Implementation Status**: ✅ Complete (Mock payment generation - production integration pending)

**Last Updated**: 2026-02-23
