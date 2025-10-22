# Phase 3B: VerificationOptInStep Integration Guide

**Quick Reference for Integrating VerificationOptInStep into IdentityForge.tsx**

---

## Overview

The `VerificationOptInStep` component provides an optional verification step in the Identity Forge registration flow. It appears after profile creation (Step 3) and before the completion screen (Step 4).

---

## Component Location

```
src/components/identity/VerificationOptInStep.tsx
```

---

## Component Props

```typescript
interface VerificationOptInStepProps {
  verificationId: string;      // User's verification ID
  username: string;             // Username for display
  onSkip: () => void;           // Called when user skips verification
  onComplete: (success: boolean) => void;  // Called when verification completes
}
```

---

## Integration Steps

### Step 1: Import the Component

Add to `src/components/IdentityForge.tsx`:

```typescript
import { VerificationOptInStep } from "./identity/VerificationOptInStep";
```

---

### Step 2: Update Step Progression Logic

In the `nextStep()` function, modify the Step 3 handling:

**Current Code** (around line 1396):
```typescript
} else if (currentStep === 3 && migrationMode === 'generate') {
  // Publish profile and register identity, then move directly to completion
  // ... existing code ...
  setCurrentStep(4);
}
```

**Updated Code**:
```typescript
} else if (currentStep === 3 && migrationMode === 'generate') {
  // Publish profile and register identity, then show verification step
  // ... existing code ...
  
  // Check if verification is enabled
  if (SIMPLEPROOF_ENABLED || IROH_ENABLED) {
    setCurrentStep(4); // Show verification step
  } else {
    setCurrentStep(5); // Skip to completion
  }
}
```

---

### Step 3: Update Progress Indicator

Modify the progress indicator to show 5 steps instead of 4:

**Current Code** (around line 1670):
```typescript
{[1, 2, 3, 4].map((step) => (
  // Progress indicator for 4 steps
))}
```

**Updated Code**:
```typescript
{[1, 2, 3, 4, 5].map((step) => (
  <div key={step} className="flex items-center">
    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold ${
      currentStep >= step ? 'bg-blue-600 text-white' : 'bg-white/10 text-white/50'
    }`}>
      {step}
    </div>
    {step < 5 && (
      <div className={`h-1 flex-1 mx-2 ${
        currentStep > step ? 'bg-blue-600' : 'bg-white/10'
      }`} />
    )}
  </div>
))}
```

---

### Step 4: Add Rendering Logic

In the component's render section, add the verification step:

**Find the existing step rendering** (around line 1700):
```typescript
{currentStep === 4 && (
  // Completion screen
)}
```

**Add before it**:
```typescript
{currentStep === 4 && (
  <VerificationOptInStep
    verificationId={verificationId || ''}
    username={formData.username}
    onSkip={() => setCurrentStep(5)}
    onComplete={(success) => {
      if (success) {
        setCurrentStep(5);
      }
    }}
  />
)}

{currentStep === 5 && (
  // Completion screen (existing code)
)}
```

---

### Step 5: Update canContinue() Logic

Modify the `canContinue()` function to handle the new step:

**Current Code** (around line 1468):
```typescript
const canContinue = (): boolean => {
  if (currentStep === 1) {
    return formData.username.length > 0 && formData.password.length > 0;
  }
  // ... other steps ...
  return true;
};
```

**Updated Code**:
```typescript
const canContinue = (): boolean => {
  if (currentStep === 1) {
    return formData.username.length > 0 && formData.password.length > 0;
  }
  // ... other steps ...
  if (currentStep === 4) {
    // Verification step - always can continue (skip or verify)
    return true;
  }
  return true;
};
```

---

### Step 6: Update Completion Logic

Modify the completion screen rendering to use Step 5:

**Current Code** (around line 1549):
```typescript
{currentStep === 4 && (
  // Completion screen
)}
```

**Updated Code**:
```typescript
{currentStep === 5 && (
  // Completion screen
)}
```

---

## Feature Flag Gating

The component automatically hides if no verification methods are enabled:

```typescript
// In VerificationOptInStep.tsx
if (!SIMPLEPROOF_ENABLED && !IROH_ENABLED) {
  return null;
}
```

**Environment Variables**:
```bash
VITE_SIMPLEPROOF_ENABLED=true
VITE_IROH_ENABLED=true
```

---

## Testing the Integration

### Manual Testing Checklist

- [ ] Start registration flow
- [ ] Complete Steps 1-3 (username, keys, profile)
- [ ] Verify Step 4 shows verification modal
- [ ] Click "Verify My Identity" button
- [ ] Verify loading state appears
- [ ] Verify success message appears
- [ ] Verify auto-redirect to completion screen
- [ ] Click "Skip for Now" button
- [ ] Verify direct redirect to completion screen
- [ ] Test with feature flags disabled
- [ ] Verify Step 4 is skipped when flags are false

### Automated Testing

```typescript
// Example test
describe('IdentityForge with Verification', () => {
  it('should show verification step after profile creation', () => {
    // Render component
    // Complete steps 1-3
    // Assert currentStep === 4
    // Assert VerificationOptInStep is rendered
  });

  it('should skip verification when flags are disabled', () => {
    // Mock feature flags as false
    // Complete steps 1-3
    // Assert currentStep === 5 (completion)
  });
});
```

---

## Troubleshooting

### Issue: VerificationOptInStep not showing

**Solution**:
1. Check feature flags are enabled: `VITE_SIMPLEPROOF_ENABLED=true`
2. Verify component is imported correctly
3. Check currentStep === 4 in render logic
4. Verify verificationId is passed correctly

### Issue: Attestation creation fails

**Solution**:
1. Check Netlify Functions are deployed
2. Verify API endpoints are accessible
3. Check browser console for error messages
4. Verify feature flags in netlify.toml

### Issue: Progress indicator shows wrong step count

**Solution**:
1. Update progress indicator to show 5 steps
2. Update step styling logic
3. Verify currentStep values are correct

---

## Code Patterns

### Calling VerificationOptInStep

```typescript
<VerificationOptInStep
  verificationId={verificationId || ''}
  username={formData.username}
  onSkip={() => {
    // Handle skip
    setCurrentStep(5);
  }}
  onComplete={(success) => {
    // Handle completion
    if (success) {
      setCurrentStep(5);
    }
  }}
/>
```

### Conditional Rendering

```typescript
// Show verification step only if enabled
if (SIMPLEPROOF_ENABLED || IROH_ENABLED) {
  // Show step 4 (verification)
} else {
  // Skip to step 5 (completion)
}
```

---

## API Integration

The component calls these Netlify Functions:

1. **simpleproof-timestamp** (POST)
   - Creates blockchain timestamp
   - Returns OTS proof and Bitcoin block info

2. **iroh-discover-node** (POST)
   - Discovers Iroh nodes via DHT
   - Returns node addresses and reachability

---

## Performance Considerations

- Component is lightweight (~300 lines)
- API calls are async and non-blocking
- Loading state prevents multiple submissions
- Auto-redirect after 2 seconds on success

---

## Security Considerations

- ✅ Feature flag gating prevents unauthorized access
- ✅ Verification ID is required (prevents spoofing)
- ✅ API calls use POST with JSON body
- ✅ Error messages don't expose sensitive data
- ✅ No PII stored in component state

---

## Next Steps

After integration:

1. **Test end-to-end** registration flow
2. **Deploy to staging** environment
3. **Monitor** API performance
4. **Gather feedback** from stakeholders
5. **Proceed to Task 2** (SovereigntyControlsDashboard)

---

## Support

**Questions?** See:
- `docs/PHASE3B_IMPLEMENTATION_PLAN.md` - Full implementation plan
- `docs/PHASE3B_PROGRESS_SUMMARY.md` - Progress tracking
- `docs/PHASE3_FRONTEND_INTEGRATION_GUIDE.md` - General integration guide


