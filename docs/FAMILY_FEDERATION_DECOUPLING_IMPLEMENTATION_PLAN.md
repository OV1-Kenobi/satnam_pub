# Family Federation Decoupling - Detailed Implementation Plan

**Status:** Ready for Implementation  
**Estimated Duration:** 2-3 weeks  
**Priority:** High (Enables MVP without Fedimint)

---

## PHASE 1: FEATURE FLAG INFRASTRUCTURE (Days 1-2)

### 1.1 Create Feature Flag Configuration

**File:** `src/config/env.client.ts`

```typescript
// Add to existing features object
export const features = {
  // ... existing flags ...
  fedimintIntegrationEnabled: getEnvVar('VITE_FEDIMINT_INTEGRATION_ENABLED') === 'true',
  familyFederationEnabled: getEnvVar('VITE_FAMILY_FEDERATION_ENABLED') !== 'false',
  frostSigningEnabled: getEnvVar('VITE_FROST_SIGNING_ENABLED') !== 'false',
  paymentAutomationEnabled: getEnvVar('VITE_PAYMENT_AUTOMATION_ENABLED') === 'true',
};
```

### 1.2 Update Netlify Configuration

**File:** `netlify.toml`

```toml
[build.environment]
VITE_FEDIMINT_INTEGRATION_ENABLED = "false"
VITE_FAMILY_FEDERATION_ENABLED = "true"
VITE_FROST_SIGNING_ENABLED = "true"
VITE_PAYMENT_AUTOMATION_ENABLED = "false"
```

### 1.3 Create Feature Flag Helper

**File:** `src/lib/feature-flags.ts` (NEW)

```typescript
import { features } from '../config/env.client';

export const FeatureFlags = {
  isFedimintEnabled: () => features.fedimintIntegrationEnabled,
  isFamilyFederationEnabled: () => features.familyFederationEnabled,
  isFrostSigningEnabled: () => features.frostSigningEnabled,
  isPaymentAutomationEnabled: () => features.paymentAutomationEnabled,
  
  // Composite checks
  canCreateFederation: () => features.familyFederationEnabled,
  canPerformPayments: () => features.fedimintIntegrationEnabled && features.paymentAutomationEnabled,
  canSignWithFrost: () => features.frostSigningEnabled,
};
```

---

## PHASE 2: CODE REFACTORING (Days 3-7)

### 2.1 Enhanced Family Nostr Federation

**File:** `lib/enhanced-family-nostr-federation.ts`

**Changes:**
- Line 279-282: Make Fedimint initialization optional
- Add try-catch around `initializeFamilyFederation()`
- Log warning instead of throwing error
- Return mock federation data when Fedimint disabled

**Diff:**
```typescript
// BEFORE
private async initializeFamilyFederation(): Promise<void> {
  if (!this.federationId) {
    throw new Error("FEDIMINT_FAMILY_FEDERATION_ID not configured");
  }
  // ... rest of initialization
}

// AFTER
private async initializeFamilyFederation(): Promise<void> {
  if (!this.federationId) {
    console.warn("⚠️ Fedimint not configured - federation will operate in identity-only mode");
    this.federationId = `fed_${Date.now()}`;
    return; // Skip Fedimint initialization
  }
  // ... rest of initialization
}
```

### 2.2 Automated Signing Manager

**File:** `src/lib/automated-signing-manager.ts`

**Changes:**
- Line 851-875: Add feature flag check before payment operations
- Return clear error when Fedimint disabled
- Preserve FROST signing capability

**Diff:**
```typescript
// BEFORE
const walletData = await getFamilyFedimintWallet(familyId, userDuid);
if (!walletData.balance || walletData.balance < paymentData.amount) {
  throw new Error("Insufficient Fedimint wallet balance");
}

// AFTER
if (!FeatureFlags.isFedimintEnabled()) {
  return {
    success: false,
    error: "Fedimint integration not enabled. Enable VITE_FEDIMINT_INTEGRATION_ENABLED to use payments.",
  };
}

const walletData = await getFamilyFedimintWallet(familyId, userDuid);
if (!walletData?.balance || walletData.balance < paymentData.amount) {
  return {
    success: false,
    error: "Insufficient wallet balance for payment",
  };
}
```

### 2.3 FROST Signature Service

**File:** `src/services/frostSignatureService.ts`

**Changes:**
- Line 952-963: Wrap `executeFedimintSpend()` in feature flag
- Support alternative payment methods
- Maintain FROST signing capability

**Diff:**
```typescript
// BEFORE
async function executeFedimintSpend(
  _transaction: any,
  signature: string
): Promise<{ success: boolean; transactionHash?: string; error?: string }> {
  const transactionHash = `fm_${Date.now()}_${signature.substring(0, 8)}`;
  return { success: true, transactionHash };
}

// AFTER
async function executeFedimintSpend(
  transaction: any,
  signature: string
): Promise<{ success: boolean; transactionHash?: string; error?: string }> {
  if (!FeatureFlags.isFedimintEnabled()) {
    return {
      success: false,
      error: "Fedimint spending not available. Enable VITE_FEDIMINT_INTEGRATION_ENABLED.",
    };
  }
  
  const transactionHash = `fm_${Date.now()}_${signature.substring(0, 8)}`;
  return { success: true, transactionHash };
}
```

### 2.4 Fedimint Client

**File:** `src/lib/fedimint-client.ts`

**Changes:**
- Line 68-91: Fix env var access for Netlify Functions
- Use `getEnvVar()` helper consistently
- Add graceful degradation

**Diff:**
```typescript
// BEFORE
const getEnvVar = (key: string): string => {
  return import.meta.env[key] || "";
};

// AFTER
import { getEnvVar } from '../netlify/functions/utils/env';

// Use getEnvVar directly (works in both browser and Netlify)
this.config = {
  federationId: getEnvVar("VITE_FEDIMINT_FEDERATION_ID") || "test_federation",
  gatewayUrl: getEnvVar("VITE_FEDIMINT_GATEWAY_URL") || "http://127.0.0.1:8080",
  // ...
};
```

---

## PHASE 3: UI/UX UPDATES (Days 8-10)

### 3.1 Family Foundry Wizard

**File:** `src/components/FamilyFoundryWizard.tsx`

**Changes:**
- Add optional "Include Fedimint Wallet" toggle
- Show different setup flows based on selection
- Display capability matrix

### 3.2 Family Dashboard

**File:** `src/components/FamilyDashboard.tsx`

**Changes:**
- Check `FeatureFlags.isFedimintEnabled()` before showing wallet
- Show "Wallet features unavailable" message
- Add "Enable Fedimint" upgrade button

### 3.3 Payment Automation Modal

**File:** `src/components/PaymentAutomationModal.tsx`

**Changes:**
- Check feature flag before rendering
- Show "Feature not available" message
- Suggest enabling Fedimint

---

## PHASE 4: TESTING STRATEGY (Days 11-14)

### 4.1 Unit Tests (Create `tests/family-federation-decoupling.test.ts`)

```typescript
describe('Family Federation Decoupling', () => {
  describe('Feature Flags', () => {
    test('should detect Fedimint disabled', () => {
      expect(FeatureFlags.isFedimintEnabled()).toBe(false);
    });
    
    test('should allow federation creation without Fedimint', () => {
      expect(FeatureFlags.canCreateFederation()).toBe(true);
    });
  });
  
  describe('Federation Creation', () => {
    test('should create federation without Fedimint config', async () => {
      // Test federation creation with minimal config
    });
    
    test('should initialize FROST signing without mint', async () => {
      // Test FROST key generation
    });
  });
  
  describe('Payment Operations', () => {
    test('should reject payments when Fedimint disabled', async () => {
      // Test payment rejection
    });
    
    test('should preserve FROST signing when Fedimint disabled', async () => {
      // Test FROST still works
    });
  });
});
```

### 4.2 Integration Tests

- Federation creation → Member addition → Messaging (no mint)
- Guardian consensus without payment operations
- FROST signing without wallet

### 4.3 E2E Tests

- Full family federation flow (mint-less)
- Upgrade path: Add Fedimint to existing federation

---

## PHASE 5: DOCUMENTATION (Days 15)

### 5.1 Update README

Add section: "Running Family Federations Without Fedimint"

### 5.2 Create Migration Guide

Document how to enable Fedimint on existing federations

### 5.3 Update API Documentation

Mark payment endpoints as optional/feature-flagged

---

## BIFROST INTEGRATION NOTES

### Recommended Approach: Minimal Integration (Phase 1)

1. **Reference BIFROST patterns** in code comments
2. **Document BIFROST compatibility** in architecture docs
3. **Plan full migration** for Phase 2 (post-MVP)

### Future Phase 2: Full BIFROST Integration

- Replace current FROST with BIFROST library
- Adopt BIFROST's event model
- Leverage BIFROST's Nostr messaging
- Estimated effort: 2-3 weeks

---

## ROLLOUT STRATEGY

### Development Environment
```bash
VITE_FEDIMINT_INTEGRATION_ENABLED=false
VITE_FAMILY_FEDERATION_ENABLED=true
VITE_FROST_SIGNING_ENABLED=true
```

### Staging Environment
```bash
VITE_FEDIMINT_INTEGRATION_ENABLED=false  # Test without mint
VITE_FAMILY_FEDERATION_ENABLED=true
VITE_FROST_SIGNING_ENABLED=true
```

### Production Environment (MVP)
```bash
VITE_FEDIMINT_INTEGRATION_ENABLED=false  # Disabled for MVP
VITE_FAMILY_FEDERATION_ENABLED=true
VITE_FROST_SIGNING_ENABLED=true
```

### Production Environment (Post-MVP)
```bash
VITE_FEDIMINT_INTEGRATION_ENABLED=true   # Enable when ready
VITE_FAMILY_FEDERATION_ENABLED=true
VITE_FROST_SIGNING_ENABLED=true
```

---

## SUCCESS CRITERIA

✅ Family federations can be created without Fedimint  
✅ Guardian consensus works without mint  
✅ FROST signing works without wallet  
✅ Nostr messaging works without payments  
✅ All tests pass (unit, integration, E2E)  
✅ Feature flags work correctly  
✅ Upgrade path to Fedimint is clear  
✅ No breaking changes to existing code  

---

## RISK MITIGATION

| Risk | Mitigation |
|------|-----------|
| Breaking existing Fedimint flows | Feature flag defaults to current behavior |
| Incomplete testing | Comprehensive test suite before merge |
| Documentation gaps | Update all docs before release |
| Performance impact | No performance impact (feature flags are zero-cost) |

---

## NEXT STEPS

1. **Review this plan** with team
2. **Approve implementation approach**
3. **Create feature branch:** `feature/family-federation-decoupling`
4. **Begin Phase 1** (feature flags)
5. **Weekly progress reviews**
6. **Merge to main** after all phases complete

