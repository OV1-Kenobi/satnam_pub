# BIFROST Implementation Guide for Satnam Family Federations

**Status:** Implementation Ready  
**Date:** 2025-10-23  
**Strategy:** BIFROST-First (Greenfield MVP)

---

## OVERVIEW

This guide provides step-by-step instructions for implementing BIFROST integration in Satnam Family Federations. BIFROST is the production-ready FROSTR protocol implementation that replaces custom Fedimint integration.

---

## PHASE 1-4 CHANGES SUMMARY

### ✅ COMPLETED (No Changes Required)
- Feature flag infrastructure (`src/lib/feature-flags.ts`)
- UI/UX updates (FamilyFoundryWizard, FamilyDashboard, PaymentAutomationModal)
- All 95 passing tests (unit, integration, E2E)
- Graceful degradation patterns

### 🔄 UPDATED (BIFROST Support Added)
- `src/lib/feature-flags.ts` - Added `isBifrostEnabled()` and `isPaymentIntegrationEnabled()`
- `src/config/env.client.ts` - Added `bifrostEnabled` flag and type definition

### ✨ NEW (BIFROST Integration)
- `src/lib/bifrost-federation-adapter.ts` - BIFROST integration layer
- `src/lib/bifrost-types.ts` - TypeScript type definitions

---

## IMPLEMENTATION STEPS

### Step 1: Install BIFROST Package

```bash
npm install @frostr/bifrost
```

### Step 2: Update netlify.toml

Add BIFROST environment variable:

```toml
[build.environment]
VITE_BIFROST_ENABLED = "false"  # Enable when ready for payment features
VITE_FAMILY_FEDERATION_ENABLED = "true"
VITE_FROST_SIGNING_ENABLED = "true"
VITE_PAYMENT_AUTOMATION_ENABLED = "false"
```

### Step 3: Update Enhanced Family Nostr Federation

**File:** `lib/enhanced-family-nostr-federation.ts`

```typescript
import { BifrostFamilyFederation } from '../src/lib/bifrost-federation-adapter';
import { FeatureFlags } from '../src/lib/feature-flags';

export class EnhancedFamilyNostrFederation {
  private bifrost: BifrostFamilyFederation | null = null;
  
  async initializeFederation() {
    if (!FeatureFlags.isBifrostEnabled()) {
      console.warn('⚠️ BIFROST not enabled - federation in identity-only mode');
      return;
    }
    
    this.bifrost = new BifrostFamilyFederation(
      this.federationId,
      CEPS.getRelays()
    );
    
    await this.bifrost.initializeNode(this.groupPkg, this.sharePkg);
  }
  
  async signWithBifrost(message: string) {
    if (!this.bifrost) throw new Error('BIFROST not initialized');
    return this.bifrost.signMessage(message);
  }
}
```

### Step 4: Update Automated Signing Manager

**File:** `src/lib/automated-signing-manager.ts`

```typescript
import { FeatureFlags } from './feature-flags';
import { BifrostFamilyFederation } from './bifrost-federation-adapter';

export class AutomatedSigningManager {
  async processPayment(request: PaymentRequest) {
    // Check if BIFROST or Fedimint is enabled
    if (!FeatureFlags.isPaymentIntegrationEnabled()) {
      return {
        success: false,
        error: 'Payment integration not enabled. Enable VITE_BIFROST_ENABLED or VITE_FEDIMINT_INTEGRATION_ENABLED.',
      };
    }
    
    // Use BIFROST if enabled
    if (FeatureFlags.isBifrostEnabled()) {
      return this.processBifrostPayment(request);
    }
    
    // Fall back to Fedimint if enabled
    if (FeatureFlags.isFedimintEnabled()) {
      return this.processFedimintPayment(request);
    }
  }
  
  private async processBifrostPayment(request: PaymentRequest) {
    // BIFROST payment processing
    const bifrost = new BifrostFamilyFederation(request.federationId);
    // ... implementation
  }
}
```

### Step 5: Update FROST Signature Service

**File:** `src/services/frostSignatureService.ts`

```typescript
import { FeatureFlags } from '../lib/feature-flags';
import { BifrostFamilyFederation } from '../lib/bifrost-federation-adapter';

export class FrostSignatureService {
  async executeSigningOperation(message: string) {
    if (!FeatureFlags.isBifrostEnabled()) {
      return {
        success: false,
        error: 'BIFROST signing not available. Enable VITE_BIFROST_ENABLED.',
      };
    }
    
    const bifrost = new BifrostFamilyFederation(this.federationId);
    const result = await bifrost.signMessage(message);
    
    return result;
  }
}
```

### Step 6: Update Tests

Update test files to use BIFROST mocks:

```typescript
import { BifrostFamilyFederation } from '../src/lib/bifrost-federation-adapter';
import { vi } from 'vitest';

describe('BIFROST Integration', () => {
  it('should sign message with BIFROST', async () => {
    const bifrost = new BifrostFamilyFederation('test-federation');
    
    // Mock BIFROST node
    vi.spyOn(bifrost, 'signMessage').mockResolvedValue({
      success: true,
      signature: 'test-signature',
    });
    
    const result = await bifrost.signMessage('test-message');
    expect(result.success).toBe(true);
  });
});
```

---

## BIFROST API REFERENCE

### Generate Shares

```typescript
const bifrost = new BifrostFamilyFederation('federation-id');
const result = await bifrost.generateShares(
  2,    // threshold
  3,    // members
  'secret-key-hex'
);

// Result:
// {
//   groupPkg: 'bech32-encoded-group',
//   sharePkgs: ['bech32-share-1', 'bech32-share-2', 'bech32-share-3']
// }
```

### Initialize Node

```typescript
await bifrost.initializeNode(groupPkg, sharePkg);
// Node is now ready for signing and ECDH operations
```

### Sign Message

```typescript
const result = await bifrost.signMessage('message-to-sign');

if (result.success) {
  console.log('Signature:', result.signature);
} else {
  console.error('Signing failed:', result.error);
}
```

### ECDH Key Exchange

```typescript
const result = await bifrost.performECDH(
  'ecdh-public-key',
  ['peer-pubkey-1', 'peer-pubkey-2']
);

if (result.success) {
  console.log('Shared secret:', result.sharedSecret);
}
```

### Get Status

```typescript
const status = bifrost.getStatus();
// {
//   federationId: 'federation-id',
//   isInitialized: true,
//   isReady: true,
//   relayCount: 3,
//   hasGroupPkg: true,
//   hasSharePkg: true
// }
```

---

## FEATURE FLAG USAGE

### Check BIFROST Status

```typescript
import { FeatureFlags } from './lib/feature-flags';

if (FeatureFlags.isBifrostEnabled()) {
  // Use BIFROST for signing
}

if (FeatureFlags.isPaymentIntegrationEnabled()) {
  // Either BIFROST or Fedimint is enabled
}

// Get all flags
const status = FeatureFlags.getStatus();
console.log(status);
```

---

## MIGRATION FROM FEDIMINT

### For Existing Fedimint Code

1. **Replace Fedimint client with BIFROST adapter:**
   ```typescript
   // Old
   const client = new FedimintClient();
   
   // New
   const bifrost = new BifrostFamilyFederation(federationId);
   ```

2. **Update signing calls:**
   ```typescript
   // Old
   const result = await client.spend(amount);
   
   // New
   const result = await bifrost.signMessage(message);
   ```

3. **Update feature checks:**
   ```typescript
   // Old
   if (FeatureFlags.isFedimintEnabled()) { }
   
   // New
   if (FeatureFlags.isBifrostEnabled()) { }
   ```

---

## TESTING STRATEGY

### Unit Tests

```typescript
describe('BIFROST Federation Adapter', () => {
  it('should generate shares', async () => {
    const bifrost = new BifrostFamilyFederation('test-fed');
    const result = await bifrost.generateShares(2, 3, 'secret');
    expect(result.groupPkg).toBeDefined();
    expect(result.sharePkgs).toHaveLength(3);
  });
});
```

### Integration Tests

```typescript
describe('BIFROST Integration', () => {
  it('should sign message end-to-end', async () => {
    const bifrost = new BifrostFamilyFederation('test-fed');
    await bifrost.initializeNode(groupPkg, sharePkg);
    const result = await bifrost.signMessage('test');
    expect(result.success).toBe(true);
  });
});
```

---

## TROUBLESHOOTING

### BIFROST Node Not Ready

**Problem:** `BIFROST node not ready` error

**Solution:** Ensure node is initialized and connected:
```typescript
await bifrost.initializeNode(groupPkg, sharePkg);
// Wait for 'ready' event
```

### Relay Connectivity Issues

**Problem:** Messages not being relayed

**Solution:** Check relay configuration:
```typescript
const status = bifrost.getStatus();
console.log('Relays:', status.relayCount);
```

### Signing Failures

**Problem:** Signing operations fail

**Solution:** Verify BIFROST is enabled:
```typescript
if (!FeatureFlags.isBifrostEnabled()) {
  throw new Error('BIFROST not enabled');
}
```

---

## DEPLOYMENT CHECKLIST

- [ ] BIFROST package installed (`npm install @frostr/bifrost`)
- [ ] Feature flags updated in `env.client.ts`
- [ ] `netlify.toml` updated with BIFROST flag
- [ ] Enhanced Family Nostr Federation updated
- [ ] Automated Signing Manager updated
- [ ] FROST Signature Service updated
- [ ] All tests passing (95+ tests)
- [ ] No regressions in existing functionality
- [ ] Code review completed
- [ ] Merged to main branch
- [ ] Deployed to staging
- [ ] User acceptance testing passed
- [ ] Deployed to production

---

## NEXT STEPS

1. **Install BIFROST:** `npm install @frostr/bifrost`
2. **Update configuration:** Add BIFROST flag to `netlify.toml`
3. **Integrate BIFROST:** Update integration points
4. **Test thoroughly:** Run full test suite
5. **Deploy:** Follow deployment checklist

---

## REFERENCES

- BIFROST Repository: https://github.com/FROSTR-ORG/bifrost
- FROSTR Protocol: https://github.com/FROSTR-ORG
- Satnam Family Federations: `docs/FAMILY_FEDERATION_DECOUPLING_IMPLEMENTATION_PLAN.md`

---

**Status:** ✅ Ready for Implementation  
**Timeline:** 1-2 weeks to full integration  
**Risk Level:** LOW  
**ROI:** Very High

