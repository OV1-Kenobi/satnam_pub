# LNProxy Privacy Integration for Satnam.pub

## Overview

The LNProxy privacy layer integration provides Lightning Network payment privacy by hiding your node's identity from payers. This acts like a VPN for Bitcoin Lightning payments, ensuring that family payments remain private and untraceable to your specific node.

## Features

- **Node Identity Privacy**: Hides your Lightning node's identity from payers
- **Graceful Fallback**: Automatically falls back to original invoices if privacy service fails
- **Family Payment Integration**: Seamlessly integrates with family payment workflows
- **Health Monitoring**: Built-in health checks for privacy service availability
- **Vite Compatibility**: Works in both browser (Vite) and Node.js environments
- **TypeScript Support**: Full TypeScript support with proper type definitions

## Architecture

```
Payer → LNProxy Service → Your Lightning Node
  ↑                           ↓
Invoice Request         Actual Payment
(Anonymous)            (To Your Node)
```

## Installation & Setup

### 1. Environment Variables

Add these to your `.env` file:

```bash
# LNProxy Privacy Configuration
VITE_LNPROXY_URL=https://lnproxy.org
LNPROXY_URL=https://lnproxy.org

# Lightning/LNbits Configuration (required)
VITE_VOLTAGE_LNBITS_URL=https://your-lnbits-instance.com
VITE_VOLTAGE_LNBITS_ADMIN_KEY=your_admin_key_here
```

### 2. Import and Initialize

```typescript
import {
  SatnamPrivacyLayer,
  createPrivacyLayer,
} from "@/lib/privacy/lnproxy-privacy";
import { LightningClient } from "@/lib/lightning-client";

// Direct usage
const privacy = createPrivacyLayer();

// Or through Lightning client (recommended)
const lightningClient = new LightningClient();
```

## Usage Examples

### Basic Invoice Privacy Protection

```typescript
import { wrapInvoiceForPrivacy } from "@/lib/privacy";

// Wrap an existing invoice for privacy
const originalInvoice = "lnbc10000n1..."; // From LNbits
const privacyResult = await wrapInvoiceForPrivacy(
  originalInvoice,
  "Payment to daughter@satnam.pub",
);

if (privacyResult.isPrivacyEnabled) {
  console.log("🛡️ Privacy enabled! Share this invoice:");
  console.log(privacyResult.wrappedInvoice);
  console.log(`Privacy fee: ${privacyResult.privacyFee} sats`);
} else {
  console.log("⚠️ Privacy unavailable, using original invoice");
  console.log(privacyResult.originalInvoice);
}
```

### Family Payment with Privacy

```typescript
import { LightningClient } from "@/lib/lightning-client";

const client = new LightningClient();

// Create family payment with automatic privacy protection
const familyInvoice = await client.createFamilyInvoice(
  "daughter", // Family member
  2500, // Amount in sats
  "Weekly allowance", // Purpose
);

console.log("Family payment created:");
console.log(`Privacy enabled: ${familyInvoice.privacy.isPrivacyEnabled}`);
console.log(`Privacy fee: ${familyInvoice.privacy.privacyFee} sats`);
console.log("Share with payer:", familyInvoice.invoice);
```

### Health Monitoring

```typescript
// Check privacy service health
const health = await client.checkPrivacyHealth();

console.log(
  `Privacy service: ${health.available ? "Available" : "Unavailable"}`,
);
console.log(`Response time: ${health.responseTime}ms`);

if (health.error) {
  console.log(`Error: ${health.error}`);
}
```

### React Component Integration

```tsx
import React, { useState, useEffect } from "react";
import { PrivacyEnhancedPayments } from "@/components";

function App() {
  return (
    <div>
      <h1>Satnam.pub Family Payments</h1>
      <PrivacyEnhancedPayments />
    </div>
  );
}
```

## API Reference

### `SatnamPrivacyLayer`

Main class for privacy operations.

#### Constructor Options

```typescript
new SatnamPrivacyLayer({
  lnproxyUrl?: string;           // Custom LNProxy URL
  defaultRoutingBudgetPpm?: number; // Default routing budget (PPM)
  requestTimeout?: number;        // Request timeout in ms
})
```

#### Methods

- `wrapInvoiceForPrivacy(invoice, description?, routingBudgetPpm?)`: Wrap invoice for privacy
- `testPrivacyConnection()`: Test privacy service health
- `getServiceUrl()`: Get configured service URL
- `getDefaultRoutingBudget()`: Get default routing budget

### `LightningClient` Privacy Methods

Enhanced Lightning client with privacy integration.

- `createInvoice(request, enablePrivacy?)`: Create invoice with optional privacy
- `createFamilyInvoice(member, amount, purpose?)`: Create family payment with privacy
- `checkPrivacyHealth()`: Check privacy service health
- `getPrivacyConfig()`: Get privacy configuration

### Type Definitions

```typescript
interface PrivacyWrappedInvoice {
  wrappedInvoice: string; // Privacy-wrapped invoice
  originalInvoice: string; // Original invoice
  privacyFee: number; // Additional fee in sats
  isPrivacyEnabled: boolean; // Whether privacy is active
}

interface PrivacyServiceHealth {
  available: boolean; // Service availability
  responseTime: number; // Response time in ms
  error?: string; // Error message if any
}
```

## Configuration

### Environment Variables

| Variable           | Description                   | Default               |
| ------------------ | ----------------------------- | --------------------- |
| `VITE_LNPROXY_URL` | LNProxy service URL (Vite)    | `https://lnproxy.org` |
| `LNPROXY_URL`      | LNProxy service URL (Node.js) | `https://lnproxy.org` |

### Privacy Settings

- **Routing Budget**: Default 0.1% (1000 PPM) fee for privacy
- **Timeout**: 30 seconds for privacy wrapping requests
- **Health Check Timeout**: 10 seconds for health checks

## Privacy & Security

### What Gets Hidden

- Your Lightning node's public key
- Your node's network location
- Payment routing path to your node
- Channel relationships

### What Remains Visible

- Payment amount (to the recipient)
- Payment description/memo
- Final payment confirmation

### Security Considerations

1. **Service Dependency**: Privacy depends on LNProxy service availability
2. **Additional Hop**: Adds one routing hop (small fee increase)
3. **Trust Model**: Requires trust in LNProxy service for privacy
4. **Fallback Safety**: Always falls back to original invoice if privacy fails

## Monitoring & Production

### Health Checks

The privacy layer is integrated into the Lightning health check script:

```bash
# Run health check with privacy monitoring
tsx scripts/lightning-health-check.ts --verbose
```

Health check includes:

- Privacy service availability
- Response time monitoring
- Error detection and reporting

### Production Deployment

1. **Monitor Privacy Service**: Set up alerts for privacy service downtime
2. **Log Privacy Operations**: All privacy operations are logged for audit
3. **Graceful Degradation**: System continues working if privacy fails
4. **Fee Monitoring**: Monitor privacy fees for cost control

### Troubleshooting

Common issues and solutions:

```typescript
// Test privacy connection
const health = await privacy.testPrivacyConnection();
if (!health.available) {
  console.log("Privacy service unavailable:", health.error);
  // Payments will work but without privacy protection
}

// Check configuration
const config = lightningClient.getPrivacyConfig();
console.log("Service URL:", config.serviceUrl);
console.log("Routing budget:", config.defaultRoutingBudget, "PPM");
```

## Integration with Existing Systems

### Family Dashboard Integration

```typescript
// Add privacy toggle to family payments
const [privacyEnabled, setPrivacyEnabled] = useState(true);

const createPayment = async () => {
  const invoice = await lightningClient.createInvoice(
    { amount: 1000, description: "Family payment" },
    privacyEnabled,
  );

  // Handle invoice...
};
```

### Health Monitoring Integration

```typescript
// Add privacy metrics to existing health dashboard
const healthMetrics = await lightningClient.checkNodeHealth();
const privacyHealth = await lightningClient.checkPrivacyHealth();

const overallHealth = {
  ...healthMetrics,
  privacy: privacyHealth,
};
```

## Migration Guide

### From Direct LNbits to Privacy-Enhanced

1. **No Breaking Changes**: Existing code continues to work
2. **Opt-in Privacy**: Privacy is enabled by default but fails gracefully
3. **Environment Setup**: Add LNProxy configuration to environment
4. **Testing**: Test privacy integration in development first

### Example Migration

```typescript
// Before: Direct invoice creation
const invoice = await createDirectInvoice(amount, description);

// After: Privacy-enhanced invoice creation
const invoice = await lightningClient.createInvoice({
  amount,
  description,
}); // Privacy enabled by default
```

## Best Practices

1. **Always Test Health**: Check privacy service health before important payments
2. **Monitor Fees**: Privacy adds small fees - monitor for cost control
3. **Log Operations**: Enable privacy operation logging for audit trails
4. **Graceful UX**: Design UI to handle privacy failures gracefully
5. **Family First**: Use privacy for all family payments by default

## Examples Repository

See the `examples/` directory for complete working examples:

- `privacy-lightning-demo.ts`: Complete CLI demonstration
- `PrivacyEnhancedPayments.tsx`: React component example
- Integration with existing family dashboard components

## Support

For issues or questions:

1. Check privacy service health first
2. Review environment variable configuration
3. Enable debug logging for detailed error information
4. Check LNProxy service status at https://lnproxy.org
