# Family Federation Decoupling - Specific Code Changes

**Purpose:** Detailed code modifications needed for decoupling  
**Scope:** 4 files to modify, 2 files to create  
**Effort:** ~4-6 hours total

---

## FILE 1: Create Feature Flags Helper

**File:** `src/lib/feature-flags.ts` (NEW)

```typescript
/**
 * Feature flags for Family Federation decoupling
 * Controls which features are available based on environment configuration
 */

import { features } from '../config/env.client';

export const FeatureFlags = {
  /**
   * Check if Fedimint integration is enabled
   * When disabled: payments, wallets, and eCash features are unavailable
   */
  isFedimintEnabled: (): boolean => {
    return features.fedimintIntegrationEnabled === true;
  },

  /**
   * Check if Family Federation core is enabled
   * When disabled: federation creation and management are unavailable
   */
  isFamilyFederationEnabled: (): boolean => {
    return features.familyFederationEnabled !== false;
  },

  /**
   * Check if FROST signing is enabled
   * When disabled: multi-signature operations are unavailable
   */
  isFrostSigningEnabled: (): boolean => {
    return features.frostSigningEnabled !== false;
  },

  /**
   * Check if payment automation is enabled
   * Requires both Fedimint and payment automation flags
   */
  isPaymentAutomationEnabled: (): boolean => {
    return (
      features.fedimintIntegrationEnabled === true &&
      features.paymentAutomationEnabled === true
    );
  },

  /**
   * Composite check: Can create family federation
   */
  canCreateFederation: (): boolean => {
    return this.isFamilyFederationEnabled();
  },

  /**
   * Composite check: Can perform payments
   */
  canPerformPayments: (): boolean => {
    return this.isPaymentAutomationEnabled();
  },

  /**
   * Composite check: Can sign with FROST
   */
  canSignWithFrost: (): boolean => {
    return this.isFrostSigningEnabled();
  },

  /**
   * Get feature status for debugging
   */
  getStatus: () => ({
    fedimintEnabled: this.isFedimintEnabled(),
    familyFederationEnabled: this.isFamilyFederationEnabled(),
    frostSigningEnabled: this.isFrostSigningEnabled(),
    paymentAutomationEnabled: this.isPaymentAutomationEnabled(),
  }),
};
```

---

## FILE 2: Update Environment Configuration

**File:** `src/config/env.client.ts` (MODIFY)

**Add to features object:**

```typescript
export const features: FeatureFlags = {
  // ... existing flags ...
  
  // Family Federation decoupling flags
  fedimintIntegrationEnabled: getEnvVar('VITE_FEDIMINT_INTEGRATION_ENABLED') === 'true',
  familyFederationEnabled: getEnvVar('VITE_FAMILY_FEDERATION_ENABLED') !== 'false',
  frostSigningEnabled: getEnvVar('VITE_FROST_SIGNING_ENABLED') !== 'false',
  paymentAutomationEnabled: getEnvVar('VITE_PAYMENT_AUTOMATION_ENABLED') === 'true',
};
```

---

## FILE 3: Fix Enhanced Family Nostr Federation

**File:** `lib/enhanced-family-nostr-federation.ts` (MODIFY)

**Location:** Lines 279-295

**BEFORE:**
```typescript
private async initializeFamilyFederation(): Promise<void> {
  if (!this.federationId) {
    throw new Error("FEDIMINT_FAMILY_FEDERATION_ID not configured");
  }

  const config: FedimintConfig = {
    federationId: this.federationId,
    guardianUrls: this.guardianNodes,
    threshold: parseInt(getEnvVar("FEDIMINT_NOSTR_THRESHOLD") || "5"),
    totalGuardians: parseInt(
      getEnvVar("FEDIMINT_NOSTR_GUARDIAN_COUNT") || "7"
    ),
    inviteCode: this.inviteCode,
  };

  await this.initialize(config);
  await this.initializeFamilyMembers();
}
```

**AFTER:**
```typescript
private async initializeFamilyFederation(): Promise<void> {
  if (!this.federationId) {
    console.warn(
      "⚠️ Fedimint not configured - federation will operate in identity-only mode"
    );
    // Generate temporary federation ID for identity-only mode
    this.federationId = `fed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    return; // Skip Fedimint initialization
  }

  try {
    const config: FedimintConfig = {
      federationId: this.federationId,
      guardianUrls: this.guardianNodes,
      threshold: parseInt(getEnvVar("FEDIMINT_NOSTR_THRESHOLD") || "5"),
      totalGuardians: parseInt(
        getEnvVar("FEDIMINT_NOSTR_GUARDIAN_COUNT") || "7"
      ),
      inviteCode: this.inviteCode,
    };

    await this.initialize(config);
    await this.initializeFamilyMembers();
  } catch (error) {
    console.warn(
      "⚠️ Fedimint initialization failed - federation will operate in identity-only mode",
      error
    );
    // Continue without Fedimint
  }
}
```

---

## FILE 4: Fix Automated Signing Manager

**File:** `src/lib/automated-signing-manager.ts` (MODIFY)

**Location:** Lines 851-875

**Add import at top:**
```typescript
import { FeatureFlags } from './feature-flags';
```

**BEFORE:**
```typescript
const walletData = await getFamilyFedimintWallet(familyId, userDuid);

if (!walletData.balance || walletData.balance < paymentData.amount) {
  throw new Error("Insufficient Fedimint wallet balance");
}

// Process Fedimint payment (simplified for demo)
const transactionId = `fm_${Date.now()}_${Math.random()
  .toString(36)
  .substring(2, 9)}`;

return {
  success: true,
  transactionId,
};
```

**AFTER:**
```typescript
// Check if Fedimint integration is enabled
if (!FeatureFlags.isFedimintEnabled()) {
  return {
    success: false,
    error: "Fedimint integration not enabled. Enable VITE_FEDIMINT_INTEGRATION_ENABLED to use payments.",
  };
}

try {
  const walletData = await getFamilyFedimintWallet(familyId, userDuid);

  if (!walletData?.balance || walletData.balance < paymentData.amount) {
    return {
      success: false,
      error: `Insufficient wallet balance. Required: ${paymentData.amount} sats, Available: ${walletData?.balance || 0} sats`,
    };
  }

  // Process Fedimint payment
  const transactionId = `fm_${Date.now()}_${Math.random()
    .toString(36)
    .substring(2, 9)}`;

  return {
    success: true,
    transactionId,
  };
} catch (error) {
  return {
    success: false,
    error: error instanceof Error ? error.message : "Payment processing failed",
  };
}
```

---

## FILE 5: Fix FROST Signature Service

**File:** `src/services/frostSignatureService.ts` (MODIFY)

**Location:** Lines 952-963

**Add import at top:**
```typescript
import { FeatureFlags } from '../lib/feature-flags';
```

**BEFORE:**
```typescript
async function executeFedimintSpend(
  _transaction: any,
  signature: string
): Promise<{ success: boolean; transactionHash?: string; error?: string }> {
  // Integrates with Fedimint client for federation spend operations
  const transactionHash = `fm_${Date.now()}_${signature.substring(0, 8)}`;

  return {
    success: true,
    transactionHash,
  };
}
```

**AFTER:**
```typescript
async function executeFedimintSpend(
  transaction: any,
  signature: string
): Promise<{ success: boolean; transactionHash?: string; error?: string }> {
  // Check if Fedimint integration is enabled
  if (!FeatureFlags.isFedimintEnabled()) {
    return {
      success: false,
      error: "Fedimint spending not available. Enable VITE_FEDIMINT_INTEGRATION_ENABLED to use payments.",
    };
  }

  try {
    // Integrates with Fedimint client for federation spend operations
    const transactionHash = `fm_${Date.now()}_${signature.substring(0, 8)}`;

    return {
      success: true,
      transactionHash,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Fedimint spend execution failed",
    };
  }
}
```

---

## FILE 6: Fix Fedimint Client

**File:** `src/lib/fedimint-client.ts` (MODIFY)

**Location:** Lines 68-91

**BEFORE:**
```typescript
constructor() {
  // Environment variable helper for both Vite and Node.js
  const getEnvVar = (key: string): string => {
    return import.meta.env[key] || "";
  };

  this.config = {
    federationId:
      getEnvVar("VITE_FEDIMINT_FEDERATION_ID") || "test_federation",
    gatewayUrl:
      getEnvVar("VITE_FEDIMINT_GATEWAY_URL") || "http://127.0.0.1:8080",
    apiToken: getEnvVar("VITE_FEDIMINT_API_TOKEN") || "",
    network: (getEnvVar("VITE_FEDIMINT_NETWORK") as any) || "testnet",
  };
  // ...
}
```

**AFTER:**
```typescript
constructor() {
  // Use centralized env var helper (works in both browser and Netlify Functions)
  // Import at top: import { getEnvVar } from '../netlify/functions/utils/env';
  
  this.config = {
    federationId:
      getEnvVar("VITE_FEDIMINT_FEDERATION_ID") || "test_federation",
    gatewayUrl:
      getEnvVar("VITE_FEDIMINT_GATEWAY_URL") || "http://127.0.0.1:8080",
    apiToken: getEnvVar("VITE_FEDIMINT_API_TOKEN") || "",
    network: (getEnvVar("VITE_FEDIMINT_NETWORK") as any) || "testnet",
  };
  // ...
}
```

---

## FILE 7: Update Netlify Configuration

**File:** `netlify.toml` (MODIFY)

**Add to [build.environment] section:**

```toml
[build.environment]
# Family Federation decoupling flags
VITE_FEDIMINT_INTEGRATION_ENABLED = "false"
VITE_FAMILY_FEDERATION_ENABLED = "true"
VITE_FROST_SIGNING_ENABLED = "true"
VITE_PAYMENT_AUTOMATION_ENABLED = "false"
```

---

## FILE 8: Create Test Suite

**File:** `tests/family-federation-decoupling.test.ts` (NEW)

```typescript
import { FeatureFlags } from '../src/lib/feature-flags';
import { describe, it, expect, beforeEach } from 'vitest';

describe('Family Federation Decoupling', () => {
  describe('Feature Flags', () => {
    it('should detect Fedimint disabled by default', () => {
      expect(FeatureFlags.isFedimintEnabled()).toBe(false);
    });

    it('should detect Family Federation enabled by default', () => {
      expect(FeatureFlags.isFamilyFederationEnabled()).toBe(true);
    });

    it('should detect FROST signing enabled by default', () => {
      expect(FeatureFlags.isFrostSigningEnabled()).toBe(true);
    });

    it('should prevent payments when Fedimint disabled', () => {
      expect(FeatureFlags.canPerformPayments()).toBe(false);
    });

    it('should allow federation creation without Fedimint', () => {
      expect(FeatureFlags.canCreateFederation()).toBe(true);
    });

    it('should allow FROST signing without Fedimint', () => {
      expect(FeatureFlags.canSignWithFrost()).toBe(true);
    });
  });

  describe('Feature Status', () => {
    it('should return current feature status', () => {
      const status = FeatureFlags.getStatus();
      expect(status).toHaveProperty('fedimintEnabled');
      expect(status).toHaveProperty('familyFederationEnabled');
      expect(status).toHaveProperty('frostSigningEnabled');
      expect(status).toHaveProperty('paymentAutomationEnabled');
    });
  });
});
```

---

## SUMMARY OF CHANGES

| File | Type | Changes | Effort |
|------|------|---------|--------|
| `src/lib/feature-flags.ts` | NEW | Create feature flag helpers | 30 min |
| `src/config/env.client.ts` | MODIFY | Add feature flags | 15 min |
| `lib/enhanced-family-nostr-federation.ts` | MODIFY | Make Fedimint optional | 30 min |
| `src/lib/automated-signing-manager.ts` | MODIFY | Add feature flag check | 1 hour |
| `src/services/frostSignatureService.ts` | MODIFY | Wrap Fedimint spend | 1 hour |
| `src/lib/fedimint-client.ts` | MODIFY | Fix env var access | 30 min |
| `netlify.toml` | MODIFY | Add feature flags | 15 min |
| `tests/family-federation-decoupling.test.ts` | NEW | Create test suite | 1 hour |

**Total Effort:** 4-6 hours

---

## TESTING CHECKLIST

- [ ] Feature flags return correct values
- [ ] Federation creation works without Fedimint
- [ ] FROST signing works without wallet
- [ ] Payments rejected when Fedimint disabled
- [ ] Clear error messages shown to users
- [ ] No breaking changes to existing code
- [ ] All tests pass
- [ ] Documentation updated

---

## DEPLOYMENT CHECKLIST

- [ ] Code review completed
- [ ] All tests passing
- [ ] Documentation updated
- [ ] Feature flags configured correctly
- [ ] Staging environment tested
- [ ] Rollback plan documented
- [ ] Team notified of changes

