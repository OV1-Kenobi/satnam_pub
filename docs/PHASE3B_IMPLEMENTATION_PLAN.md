# Phase 3B: Enhanced Features - Implementation Plan

**Date**: 2025-10-22  
**Phase**: 3B (Week 6) - Enhanced Features  
**Status**: IN PROGRESS  
**Completion**: 15% (1 of 7 tasks started)

---

## Overview

Phase 3B implements enhanced features for SimpleProof and Iroh frontend integration, including:
- IdentityForge verification step integration
- SovereigntyControlsDashboard attestations section
- UserProfile verification badges
- ContactsList compact badges
- Kind:0 event tracking
- Automation settings
- Comprehensive test suite

---

## Task Status

### ✅ Task 1: Extend IdentityForge.tsx with Verification Step (IN PROGRESS)

**Status**: 50% Complete

**Completed**:
- ✅ Created `VerificationOptInStep.tsx` component (300 lines)
- ✅ Added imports to IdentityForge.tsx
- ✅ Added state variables for verification step
- ✅ Added handler function `handleCreateAttestation()`
- ✅ Feature flag gating implemented

**Remaining**:
- ⏳ Integrate VerificationOptInStep into IdentityForge step progression
- ⏳ Modify nextStep() to show verification step after profile creation
- ⏳ Update progress indicator to show 5 steps instead of 4
- ⏳ Update canContinue() logic for new step
- ⏳ Test end-to-end flow

**Implementation Notes**:
- VerificationOptInStep is a standalone component that can be imported and used
- Component handles all UI, state management, and API calls
- Feature flags control visibility (SIMPLEPROOF_ENABLED, IROH_ENABLED)
- Graceful degradation if no verification methods are enabled

**Code Pattern for Integration**:
```typescript
// In IdentityForge.tsx nextStep() function:
if (currentStep === 3 && migrationMode === 'generate') {
  // After profile creation, show verification step
  setCurrentStep(4); // New verification step
}

// In IdentityForge.tsx rendering:
{currentStep === 4 && (
  <VerificationOptInStep
    verificationId={verificationId}
    username={formData.username}
    onSkip={() => setCurrentStep(5)} // Skip to completion
    onComplete={(success) => {
      if (success) {
        setCurrentStep(5); // Go to completion
      }
    }}
  />
)}

// Update progress indicator:
{[1, 2, 3, 4, 5].map((step) => (
  // Show 5 steps instead of 4
))}
```

---

### ⏳ Task 2: Create SovereigntyControlsDashboard Attestations Section

**Status**: NOT STARTED

**Requirements**:
- Create new dashboard component or extend existing
- Add "Identity Attestations" tab with Shield icon
- Integrate AttestationHistoryTable component
- Add ManualAttestationModal button
- Show automation settings toggles
- Display statistics (total, verified, pending)

**Deliverables**:
- `src/components/SovereigntyControlsDashboard.tsx` (new or extended)
- Tab navigation with attestations section
- Statistics summary
- Integration with Phase 3A components

---

### ⏳ Task 3: Update UserProfile.tsx with Verification Badges

**Status**: NOT STARTED

**Requirements**:
- Add "Identity Verifications" section
- Display VerificationBadge in detailed mode
- Show verification methods used
- Display trust score with breakdown
- Add "View All Proofs" link to dashboard

**Deliverables**:
- Modified `src/components/UserProfile.tsx`
- New section with verification information
- Integration with trust-score-calculator

---

### ⏳ Task 4: Update ContactsList.tsx and ContactCard.tsx

**Status**: NOT STARTED

**Requirements**:
- Add compact VerificationBadge next to usernames
- Show trust score on hover
- Click badge to view detailed modal
- Fetch and cache trust scores
- Lazy loading for large lists

**Deliverables**:
- Modified `src/components/ContactsList.tsx`
- Modified `src/components/ContactCard.tsx`
- Optional: `VerificationDetailsModal.tsx`

---

### ⏳ Task 5: Implement Kind:0 Event Tracking

**Status**: NOT STARTED

**Requirements**:
- Monitor kind:0 events via CEPS
- Update verification status in database
- Recalculate trust scores
- Create helper function: `trackKind0Event()`

**Deliverables**:
- Integration with CEPS
- Database update logic
- Helper function implementation

---

### ⏳ Task 6: Add Automation Settings

**Status**: NOT STARTED

**Requirements**:
- Create AutomationSettings component
- Toggles for auto-timestamping
- Store settings in database or localStorage
- Implement automation logic
- Add frequency limits

**Deliverables**:
- `src/components/identity/AutomationSettings.tsx`
- Database table: `user_attestation_settings`
- Integration with dashboard

---

### ⏳ Task 7: Create Comprehensive Tests

**Status**: NOT STARTED

**Requirements**:
- Unit tests for calculators and managers
- Component tests for UI components
- Integration tests for end-to-end flows
- >80% code coverage

**Deliverables**:
- `tests/trust-score-calculator.test.ts`
- `tests/attestation-manager.test.ts`
- `tests/components/VerificationBadge.test.tsx`
- `tests/components/AttestationHistoryTable.test.tsx`
- `tests/components/ManualAttestationModal.test.tsx`
- `tests/components/AutomationSettings.test.tsx`
- `tests/integration/identity-forge-verification.test.tsx`
- `tests/integration/kind0-tracking.test.tsx`

---

## Files Created (Phase 3B)

### Components
- ✅ `src/components/identity/VerificationOptInStep.tsx` (300 lines)

### Documentation
- ✅ `docs/PHASE3B_IMPLEMENTATION_PLAN.md` (this file)

---

## Files to Create (Remaining)

### Components
- `src/components/SovereigntyControlsDashboard.tsx` (or extend existing)
- `src/components/identity/AutomationSettings.tsx`
- `src/components/identity/VerificationDetailsModal.tsx` (optional)

### Tests
- `tests/trust-score-calculator.test.ts`
- `tests/attestation-manager.test.ts`
- `tests/components/VerificationBadge.test.tsx`
- `tests/components/AttestationHistoryTable.test.tsx`
- `tests/components/ManualAttestationModal.test.tsx`
- `tests/components/AutomationSettings.test.tsx`
- `tests/integration/identity-forge-verification.test.tsx`
- `tests/integration/kind0-tracking.test.tsx`

---

## Files to Modify (Remaining)

- `src/components/IdentityForge.tsx` (integrate VerificationOptInStep)
- `src/components/UserProfile.tsx` (add verification section)
- `src/components/ContactsList.tsx` (add badges)
- `src/components/ContactCard.tsx` (add badges)

---

## Architecture Overview

### Component Hierarchy

```
IdentityForge (Step 4.5 - NEW)
├── VerificationOptInStep (NEW)
│   ├── createAttestation() call
│   └── Feature flag gating

SovereigntyControlsDashboard (NEW)
├── Identity Attestations Tab (NEW)
├── AttestationHistoryTable
├── ManualAttestationModal
└── AutomationSettings (NEW)

UserProfile (MODIFIED)
├── Identity Verifications Section (NEW)
└── VerificationBadge (detailed)

ContactsList (MODIFIED)
├── ContactCard (MODIFIED)
└── VerificationBadge (compact)
```

---

## Integration Points

### 1. IdentityForge.tsx
- Location: Step 4.5 (between profile creation and completion)
- Component: VerificationOptInStep
- Feature Flags: SIMPLEPROOF_ENABLED, IROH_ENABLED
- API Calls: createAttestation()

### 2. SovereigntyControlsDashboard.tsx
- Location: New "Identity Attestations" tab
- Components: AttestationHistoryTable, ManualAttestationModal, AutomationSettings
- API Calls: getAttestations(), createAttestation()

### 3. UserProfile.tsx
- Location: New "Identity Verifications" section
- Components: VerificationBadge (detailed)
- API Calls: getAttestations(), calculateTrustScore()

### 4. ContactsList.tsx & ContactCard.tsx
- Location: Next to username
- Components: VerificationBadge (compact)
- API Calls: calculateTrustScore()

---

## Feature Flags

All UI components are gated behind feature flags:

```typescript
const SIMPLEPROOF_ENABLED = clientConfig.flags.simpleproofEnabled ?? false;
const IROH_ENABLED = clientConfig.flags.irohEnabled ?? false;
```

---

## Testing Strategy

### Unit Tests
- Trust score calculation with various inputs
- Attestation creation and retrieval
- Badge level determination

### Component Tests
- VerificationOptInStep rendering and interactions
- AttestationHistoryTable with mock data
- ManualAttestationModal form validation
- AutomationSettings toggle functionality

### Integration Tests
- End-to-end registration with verification
- Kind:0 event monitoring and trust score updates
- Dashboard attestation management

### Coverage Target
- Minimum: 80% code coverage
- Target: 90% code coverage

---

## Timeline

**Week 6 (Phase 3B)**:
- ✅ Create VerificationOptInStep component
- ⏳ Integrate IdentityForge verification step
- ⏳ Create SovereigntyControlsDashboard
- ⏳ Update UserProfile and ContactsList
- ⏳ Implement Kind:0 tracking
- ⏳ Add automation settings
- ⏳ Create comprehensive tests

---

## Success Criteria

**Phase 3B Complete When**:
- ✅ VerificationOptInStep component created
- ⏳ All 7 tasks completed
- ⏳ All tests passing with >80% coverage
- ⏳ Feature flags working correctly
- ⏳ End-to-end flows tested
- ⏳ Staging deployment successful
- ⏳ Stakeholder approval obtained

---

## Next Steps

1. **Integrate VerificationOptInStep** into IdentityForge.tsx
2. **Create SovereigntyControlsDashboard** with attestations section
3. **Update UserProfile.tsx** with verification badges
4. **Update ContactsList.tsx** with compact badges
5. **Implement Kind:0 event tracking**
6. **Add automation settings**
7. **Create comprehensive tests**

---

## Support & Resources

**Documentation**:
- `docs/PHASE3_FRONTEND_INTEGRATION_GUIDE.md` - Implementation guide
- `docs/PHASE3_QUICK_START.md` - Developer quick reference
- `docs/PHASE3A_DELIVERY_SUMMARY.md` - Phase 3A summary

**Code Templates**:
- `docs/SIMPLEPROOF_CODE_TEMPLATES.md` - Ready-to-use patterns

**Related Components**:
- `src/components/identity/VerificationBadge.tsx` - Badge component
- `src/components/identity/AttestationHistoryTable.tsx` - History table
- `src/components/identity/ManualAttestationModal.tsx` - Manual attestation
- `src/lib/trust-score-calculator.ts` - Trust score logic
- `src/lib/attestation-manager.ts` - Attestation management

---

**Status**: Phase 3B - 15% Complete  
**Next Review**: End of Week 6  
**Target Completion**: End of Week 6


