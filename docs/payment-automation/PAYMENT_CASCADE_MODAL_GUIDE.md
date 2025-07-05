# Payment Cascade Modal Guide

## Overview

The `PaymentCascadeModal` is a comprehensive React component that enables users to set up complex payment cascades and split payments for automated Bitcoin distribution. It integrates seamlessly with the existing payment automation system and supports both Lightning (Voltage/LNbits/PhoenixD) and eCash payment methods.

## Features

### 🎯 Core Functionality
- **Visual Tree Structure**: Hierarchical display of payment cascades
- **Real-time Amount Tracking**: Live calculation of distributed vs remaining amounts
- **Multi-Currency Support**: Lightning (sats) and eCash payments
- **Payment Method Selection**: Voltage, LNbits, PhoenixD, and eCash minting
- **Quick Templates**: Pre-configured cascade patterns
- **Family Member Integration**: Role-based recipient selection

### 🔧 Technical Capabilities
- **Recursive Payment Trees**: Unlimited depth for complex distributions
- **Method-Specific Routing**: Automatic fallback from Voltage → LNbits → PhoenixD
- **Privacy-First Design**: No external logging, client-side processing
- **Bitcoin-Only Compliance**: No altcoins, satoshi-denominated
- **Master Context Adherence**: Full compliance with privacy and sovereignty protocols

## Component Integration

### 1. Family Foundry Wizard Integration

The modal is integrated into the Family Foundry process during charter definition:

```tsx
// In FamilyFoundryWizard.tsx
import PaymentCascadeModal from './PaymentCascadeModal';
import { PaymentCascadeNode } from '../lib/payment-automation';

const FamilyFoundryWizard: React.FC = () => {
  const [showCascadeModal, setShowCascadeModal] = useState(false);
  const [paymentCascade, setPaymentCascade] = useState<PaymentCascadeNode[]>([]);

  const handleCascadeSave = (cascade: PaymentCascadeNode[]) => {
    setPaymentCascade(cascade);
    setShowCascadeModal(false);
  };

  return (
    <>
      {/* Charter definition step with cascade option */}
      {charter.initialTreasury > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-white font-semibold">Payment Cascade Setup</h4>
            <button
              onClick={() => setShowCascadeModal(true)}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg"
            >
              <Zap className="h-4 w-4" />
              Configure Cascade
            </button>
          </div>
        </div>
      )}

      <PaymentCascadeModal
        isOpen={showCascadeModal}
        onClose={() => setShowCascadeModal(false)}
        onSave={handleCascadeSave}
        familyMembers={familyMembersForCascade}
        totalAmount={charter.initialTreasury}
        defaultCurrency="sats"
        title="Family Treasury Cascade Setup"
      />
    </>
  );
};
```

### 2. Individual Finances Dashboard Integration

Available for individual users to set up personal payment cascades:

```tsx
// In IndividualFinancesDashboard.tsx
const IndividualFinancesDashboard: React.FC = () => {
  const [showCascadeModal, setShowCascadeModal] = useState(false);
  const [paymentCascade, setPaymentCascade] = useState<PaymentCascadeNode[]>([]);

  const handleCascadeSave = (cascade: PaymentCascadeNode[]) => {
    setPaymentCascade(cascade);
    setShowCascadeModal(false);
    // Integrate with payment automation service
    console.log('Payment cascade configured:', cascade);
  };

  return (
    <>
      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          onClick={() => setShowCascadeModal(true)}
          className="flex items-center justify-center space-x-2 bg-green-500 hover:bg-green-600 text-white font-medium py-3 px-4 rounded-lg"
        >
          <Split className="h-5 w-5" />
          <span>Setup Payment Cascade</span>
        </button>
      </div>

      <PaymentCascadeModal
        isOpen={showCascadeModal}
        onClose={() => setShowCascadeModal(false)}
        onSave={handleCascadeSave}
        familyMembers={familyMembersForCascade}
        totalAmount={wallet?.lightningBalance || 0}
        defaultCurrency="sats"
        title="Individual Payment Cascade Setup"
      />
    </>
  );
};
```

## Usage Examples

### Basic Split Payment

```tsx
const basicSplit: PaymentCascadeNode[] = [
  {
    recipientId: 'guardian-1',
    recipientNpub: 'npub1guardian123...',
    amount: 40000,
    currency: 'sats',
    method: 'voltage',
    children: []
  },
  {
    recipientId: 'steward-1',
    recipientNpub: 'npub1steward123...',
    amount: 60000,
    currency: 'sats',
    method: 'lnbits',
    children: []
  }
];
```

### Complex Cascade with eCash

```tsx
const complexCascade: PaymentCascadeNode[] = [
  {
    recipientId: 'guardian-1',
    recipientNpub: 'npub1guardian123...',
    amount: 30000,
    currency: 'ecash',
    method: 'ecash',
    children: [
      {
        recipientId: 'adult-1',
        recipientNpub: 'npub1adult123...',
        amount: 15000,
        currency: 'ecash',
        method: 'ecash',
        children: [
          {
            recipientId: 'offspring-1',
            recipientNpub: 'npub1offspring123...',
            amount: 7500,
            currency: 'ecash',
            method: 'ecash',
            children: []
          }
        ]
      }
    ]
  }
];
```

### Mixed Payment Methods

```tsx
const mixedPayments: PaymentCascadeNode[] = [
  {
    recipientId: 'guardian-1',
    recipientNpub: 'npub1guardian123...',
    amount: 50000,
    currency: 'sats',
    method: 'voltage', // Primary: Voltage
    children: []
  },
  {
    recipientId: 'steward-1',
    recipientNpub: 'npub1steward123...',
    amount: 30000,
    currency: 'sats',
    method: 'lnbits', // Secondary: LNbits
    children: []
  },
  {
    recipientId: 'adult-1',
    recipientNpub: 'npub1adult123...',
    amount: 20000,
    currency: 'ecash',
    method: 'ecash', // Offline: eCash
    children: []
  }
];
```

## Quick Templates

The modal includes pre-configured templates for common use cases:

### Guardian + Steward Split
- 40% to guardians via Voltage
- 60% to stewards via LNbits
- Ideal for family treasury management

### Adult → Offspring Cascade
- 30% to adults via eCash
- 70% distributed to offspring via eCash
- Perfect for allowance automation

## Payment Method Routing

### Lightning Network Routing
1. **Primary**: Voltage (enterprise infrastructure)
2. **Secondary**: LNbits (user-friendly interface)
3. **Fallback**: PhoenixD (mobile wallet integration)

### eCash Routing
- Direct minting and distribution
- Recursive cascading support
- Privacy-preserving bearer instruments

## Integration with Payment Automation

The cascade configuration integrates with the existing payment automation system:

```tsx
// In payment-automation.ts
export const executePaymentCascade = async (
  cascade: PaymentCascadeNode[],
  schedule: PaymentSchedule
): Promise<PaymentResult[]> => {
  const results: PaymentResult[] = [];
  
  for (const node of cascade) {
    const result = await executeCascadeNode(node, schedule);
    results.push(result);
    
    // Recursively process children
    if (node.children && node.children.length > 0) {
      const childResults = await executePaymentCascade(node.children, schedule);
      results.push(...childResults);
    }
  }
  
  return results;
};
```

## Privacy & Security Features

### Privacy-First Design
- **No External Logging**: All processing client-side
- **Metadata Minimization**: Only essential data collected
- **User-Controlled Data**: Full sovereignty over cascade configurations
- **Ephemeral Computing**: No persistent storage of sensitive data

### Security Protocols
- **Client-Side Verification**: All operations verified locally
- **Encrypted Communications**: NIP-59 Gift Wrapped messaging
- **Rate Limiting**: Protection against abuse
- **Input Validation**: Zod schema validation for all inputs

## Testing

Use the `PaymentCascadeTest` component for development and testing:

```tsx
import PaymentCascadeTest from './PaymentCascadeTest';

// In your test environment
<PaymentCascadeTest />
```

The test component provides:
- Sample family member data
- Interactive cascade configuration
- Real-time preview of saved cascades
- Feature demonstration

## API Integration

### Frontend Service Integration

```tsx
// In your service layer
export const savePaymentCascade = async (
  cascade: PaymentCascadeNode[],
  scheduleId: string
): Promise<void> => {
  const response = await fetch('/api/payments/cascade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cascade, scheduleId })
  });
  
  if (!response.ok) {
    throw new Error('Failed to save payment cascade');
  }
};
```

### Backend API Endpoint

```typescript
// In api/payments/cascade.ts
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { cascade, scheduleId } = req.body;
  
  // Validate cascade structure
  const validatedCascade = PaymentCascadeSchema.parse(cascade);
  
  // Save to database
  await saveCascadeToDatabase(validatedCascade, scheduleId);
  
  res.status(200).json({ success: true });
}
```

## Best Practices

### 1. User Experience
- Always provide clear visual feedback for amount distribution
- Use role-based icons and colors for easy identification
- Implement progressive disclosure for complex cascades
- Provide quick templates for common scenarios

### 2. Performance
- Lazy load cascade components
- Optimize re-renders with React.memo
- Use efficient state management for large cascades
- Implement proper error boundaries

### 3. Security
- Validate all inputs server-side
- Implement proper authentication checks
- Use HTTPS for all API communications
- Follow principle of least privilege

### 4. Privacy
- Minimize data collection
- Implement client-side encryption
- Provide data deletion controls
- Use privacy-preserving defaults

## Troubleshooting

### Common Issues

1. **Amount Mismatch**
   - Check that total distributed amount equals total available
   - Verify currency consistency across nodes
   - Ensure proper decimal handling for satoshis

2. **Method Selection**
   - Validate method compatibility with currency
   - Check fallback routing configuration
   - Verify API endpoint availability

3. **Family Member Mapping**
   - Ensure proper role type casting
   - Validate npub format and existence
   - Check for duplicate recipient IDs

### Debug Mode

Enable debug logging for development:

```tsx
const handleCascadeSave = (cascade: PaymentCascadeNode[]) => {
  console.log('Cascade configuration:', cascade);
  console.log('Total distributed:', calculateTotalAmount(cascade));
  console.log('Validation result:', validateCascade(cascade));
  
  setPaymentCascade(cascade);
  setShowCascadeModal(false);
};
```

## Future Enhancements

### Planned Features
- **Advanced Templates**: More sophisticated cascade patterns
- **Batch Operations**: Multiple cascade management
- **Analytics Dashboard**: Cascade performance metrics
- **Mobile Optimization**: Touch-friendly interface
- **Offline Support**: Local cascade configuration

### Integration Roadmap
- **Fedimint Support**: Cross-protocol cascades
- **Hardware Wallet**: Cold storage integration
- **Multi-Signature**: Collaborative cascade approval
- **Smart Contracts**: Programmable cascade logic

---

*This guide covers the complete implementation and usage of the PaymentCascadeModal component. For additional support, refer to the master context documentation and existing codebase patterns.* 