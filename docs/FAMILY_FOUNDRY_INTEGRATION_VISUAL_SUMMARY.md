# Family Foundry Integration - Visual Summary

**Date**: December 1, 2025
**Purpose**: Quick reference for integration architecture

---

## CURRENT STATE: Frontend Only

```
┌─────────────────────────────────────────────────────────┐
│         Family Foundry Wizard (Frontend)                │
├─────────────────────────────────────────────────────────┤
│ Step 1: Charter Definition                              │
│ ├─ Family Name, Motto, Mission, Values                 │
│ └─ ✅ Complete (no backend call)                        │
│                                                          │
│ Step 2: RBAC Definition                                 │
│ ├─ Guardian, Steward, Adult, Offspring roles           │
│ └─ ✅ Complete (no backend call)                        │
│                                                          │
│ Step 3: Member Invitation                               │
│ ├─ Collect npubs and assign roles                       │
│ └─ ✅ Complete (no backend call)                        │
│                                                          │
│ Step 4: Federation Creation                             │
│ ├─ ❌ NO BACKEND INTEGRATION                            │
│ └─ ❌ NO DATA PERSISTENCE                               │
└─────────────────────────────────────────────────────────┘
```

---

## TARGET STATE: Full Integration

```
┌──────────────────────────────────────────────────────────────┐
│         Family Foundry Wizard (Frontend)                     │
├──────────────────────────────────────────────────────────────┤
│ Step 1-3: Charter, RBAC, Members (unchanged)                │
│                                                               │
│ Step 4: Federation Creation                                  │
│ ├─ Generate federation_duid                                 │
│ ├─ Map npubs → user_duids                                   │
│ ├─ Validate role hierarchy                                  │
│ ├─ Call /api/family/foundry                                 │
│ ├─ Configure FROST thresholds                               │
│ ├─ Initialize NFC MFA policy                                │
│ ├─ Publish steward approval requests                        │
│ └─ ✅ COMPLETE WITH BACKEND INTEGRATION                     │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│              Backend Infrastructure                          │
├──────────────────────────────────────────────────────────────┤
│ Database Layer:                                              │
│ ├─ family_federations (federation_duid, metadata)           │
│ ├─ family_members (user_duid, family_role, voting_power)    │
│ ├─ family_charters (charter definition, RBAC config)        │
│ ├─ frost_signing_sessions (FROST configuration)             │
│ └─ nfc_mfa_audit_log (NFC MFA policy enforcement)           │
│                                                               │
│ Service Layer:                                               │
│ ├─ FamilyFoundryService (charter/federation creation)       │
│ ├─ FrostSessionManager (FROST signing orchestration)        │
│ ├─ StewardApprovalClient (guardian approval workflow)       │
│ └─ FrostNfcMfa (NFC MFA verification)                       │
│                                                               │
│ API Layer:                                                   │
│ ├─ POST /api/family/foundry (create federation)             │
│ ├─ GET /family-federations/{duid} (get details)             │
│ ├─ GET /family-federations/{duid}/members (list members)    │
│ └─ POST /api/family/role-management/change-role             │
└──────────────────────────────────────────────────────────────┘
```

---

## DATA FLOW DIAGRAM

```
User Input (Charter, RBAC, Members)
         ↓
    Validation
         ↓
Generate federation_duid (privacy-first)
         ↓
Map npubs → user_duids
         ↓
Validate role hierarchy
         ↓
Call /api/family/foundry
         ↓
Create family_federations record
         ↓
Create family_members records
         ↓
Calculate FROST threshold
         ↓
Initialize NFC MFA policy
         ↓
Publish steward approval requests
         ↓
Await guardian approvals
         ↓
Verify FROST threshold met
         ↓
Collect NFC MFA signatures
         ↓
Finalize federation
         ↓
Return federation_duid + federationId
```

---

## INTEGRATION POINTS

```
┌─────────────────────────────────────────────────────────┐
│ FamilyFoundryWizard.tsx                                 │
├─────────────────────────────────────────────────────────┤
│ Calls: family-foundry-integration.ts                    │
│   ├─ generateFederationDuid()                           │
│   ├─ mapNpubToUserDuid()                                │
│   ├─ validateRoleHierarchy()                            │
│   ├─ calculateFrostThreshold()                          │
│   ├─ initializeNfcMfaPolicy()                           │
│   └─ publishFederationApprovalRequests()                │
└─────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────┐
│ Backend APIs                                            │
├─────────────────────────────────────────────────────────┤
│ POST /api/family/foundry                                │
│ GET /family-federations/{duid}                          │
│ POST /family-federations/{duid}/members                 │
└─────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────┐
│ Database                                                │
├─────────────────────────────────────────────────────────┤
│ family_federations                                      │
│ family_members                                          │
│ family_charters                                         │
│ frost_signing_sessions                                 │
│ nfc_mfa_audit_log                                       │
└─────────────────────────────────────────────────────────┘
```

---

## ROLE HIERARCHY

```
Guardian (Level 4)
├─ Ultimate authority
├─ Can manage all roles
├─ Requires NFC MFA for high-value ops
└─ FROST threshold: 2-of-3

    ↓ Can manage

Steward (Level 3)
├─ Day-to-day operations
├─ Can manage adults/offspring
├─ Requires steward approval for spending
└─ FROST participant

    ↓ Can manage

Adult (Level 2)
├─ Can manage offspring
├─ Limited spending authority
└─ Requires approval for high-value ops

    ↓ Can manage

Offspring (Level 1)
├─ Learning role
├─ All operations require approval
└─ No management authority
```

---

## CRITICAL GAPS (8 Total)

```
Gap 1: No federation_duid generation
  └─ Impact: Cannot create federations
  └─ Solution: Implement privacy-first DUID generation
  └─ Effort: 2 hours

Gap 2: No user_duid mapping
  └─ Impact: Cannot assign members
  └─ Solution: Add npub → user_duid lookup
  └─ Effort: 3 hours

Gap 3: No FROST configuration
  └─ Impact: Cannot sign operations
  └─ Solution: Map guardian count to FROST threshold
  └─ Effort: 4 hours

Gap 4: No NFC MFA policy
  └─ Impact: Cannot enforce MFA
  └─ Solution: Initialize policy during creation
  └─ Effort: 3 hours

Gap 5: No steward approval
  └─ Impact: Cannot validate creation
  └─ Solution: Integrate approval workflow
  └─ Effort: 5 hours

Gap 6: No role validation
  └─ Impact: Invalid roles possible
  └─ Solution: Enforce hierarchy constraints
  └─ Effort: 2 hours

Gap 7: No API integration
  └─ Impact: Data not persisted
  └─ Solution: Call backend APIs
  └─ Effort: 3 hours

Gap 8: No error handling
  └─ Impact: Data loss possible
  └─ Solution: Implement rollback
  └─ Effort: 4 hours

Total Effort: 26 hours (3-4 days)
```

---

## IMPLEMENTATION PHASES

```
Phase 1: Foundation (2 days)
├─ Create integration service
├─ Implement DUID generation
├─ Add user_duid mapping
└─ Implement role validation

Phase 2: API Integration (2 days)
├─ Update wizard components
├─ Implement error handling
├─ Add progress tracking
└─ Write integration tests

Phase 3: FROST & NFC (1 day)
├─ Configure FROST thresholds
├─ Initialize NFC MFA policy
├─ Integrate steward approval
└─ Write E2E tests

Phase 4: Testing & Verification (1 day)
├─ Run full test suite
├─ Performance validation
├─ Security review
└─ Production readiness

Total: 5 days (40 hours)
```

---

## SUCCESS METRICS

✅ End-to-end federation creation
✅ Correct family_members records
✅ FROST configuration with threshold
✅ NFC MFA policy enforcement
✅ Steward approval workflow
✅ All tests passing (95%+ coverage)
✅ Zero data loss on error
✅ <2 second creation time
✅ Security review passed
✅ Production ready
